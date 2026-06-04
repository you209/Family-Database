"""
FamilyRoot — api_webtrees.py

Integration with Webtrees (PHP genealogy web app).
Connects via the Webtrees REST API to read/sync family tree data.

Routes:
  POST /api/webtrees/connect       — save URL + API key, test connection
  GET  /api/webtrees/status        — check connection
  GET  /api/webtrees/trees         — list available trees
  POST /api/webtrees/import        — import people/families from Webtrees → local SQLite (SSE)
  GET  /api/webtrees/import/status — SSE progress stream
"""

import json
import threading
import time
import urllib.request
import urllib.parse
from flask import Blueprint, jsonify, request, Response, abort
from database import get_db

webtrees_bp = Blueprint("webtrees", __name__)

_sync = {"running": False, "events": [], "done": False, "stats": {}}


# ── helpers ───────────────────────────────────────────────────────────────────

def _meta_get(conn, key, default=None):
    row = conn.execute("SELECT value FROM db_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _meta_set(conn, key, value):
    conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)", (key, value))


def _wt_get(path, api_key, base_url, tree_id=None, params=None):
    """GET from Webtrees REST API."""
    url = base_url.rstrip("/") + path
    p = {"tree": tree_id} if tree_id else {}
    if params:
        p.update(params)
    if p:
        url += "?" + urllib.parse.urlencode(p)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def _get_creds():
    with get_db() as conn:
        return (
            _meta_get(conn, "webtrees_url"),
            _meta_get(conn, "webtrees_key"),
            _meta_get(conn, "webtrees_tree"),
        )


# ── routes ────────────────────────────────────────────────────────────────────

@webtrees_bp.route("/api/webtrees/connect", methods=["POST"])
def connect():
    data     = request.get_json() or {}
    base_url = (data.get("url") or "").rstrip("/")
    api_key  = (data.get("api_key") or "").strip()
    tree_id  = (data.get("tree_id") or "").strip()

    if not base_url or not api_key:
        return jsonify({"error": "url and api_key required"}), 400

    try:
        result = _wt_get("/api/trees", api_key, base_url)
    except urllib.error.HTTPError as e:
        return jsonify({"error": f"HTTP {e.code}: {e.reason}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    trees = result.get("data", [])

    with get_db() as conn:
        _meta_set(conn, "webtrees_url",  base_url)
        _meta_set(conn, "webtrees_key",  api_key)
        if tree_id:
            _meta_set(conn, "webtrees_tree", tree_id)

    return jsonify({"ok": True, "url": base_url, "trees": trees})


@webtrees_bp.route("/api/webtrees/status")
def status():
    url, key, tree = _get_creds()
    if not url or not key:
        return jsonify({"connected": False})
    try:
        result = _wt_get("/api/trees", key, url)
        trees  = result.get("data", [])
        return jsonify({"connected": True, "url": url, "trees": trees, "active_tree": tree})
    except Exception:
        return jsonify({"connected": False, "url": url})


@webtrees_bp.route("/api/webtrees/trees")
def list_trees():
    url, key, _ = _get_creds()
    if not url:
        return jsonify({"error": "Not connected"}), 400
    try:
        result = _wt_get("/api/trees", key, url)
        return jsonify({"trees": result.get("data", [])})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@webtrees_bp.route("/api/webtrees/import", methods=["POST"])
def start_import():
    global _sync
    if _sync["running"]:
        return jsonify({"error": "Sync already running"}), 409

    url, key, tree = _get_creds()
    if not url or not key or not tree:
        return jsonify({"error": "Not connected or no tree selected"}), 400

    data = request.get_json() or {}
    tree_id = data.get("tree_id", tree)

    _sync = {"running": True, "events": [], "done": False, "stats": {}}
    threading.Thread(target=_run_import, args=(url, key, tree_id), daemon=True).start()
    return jsonify({"ok": True})


@webtrees_bp.route("/api/webtrees/import/status")
def import_status():
    def generate():
        seen = 0
        while _sync["running"] or seen < len(_sync["events"]):
            batch = _sync["events"][seen:]
            for evt in batch:
                yield f"data: {json.dumps(evt)}\n\n"
            seen += len(batch)
            if not _sync["running"] and seen >= len(_sync["events"]):
                break
            time.sleep(0.25)
        yield f"data: {json.dumps({'done': True, 'stats': _sync['stats']})}\n\n"
    return Response(generate(), mimetype="text/event-stream")


# ── background import ─────────────────────────────────────────────────────────

def _emit(msg):
    _sync["events"].append({"message": msg})


def _run_import(base_url, api_key, tree_id):
    global _sync
    stats = {"people": 0, "families": 0, "errors": 0}

    try:
        # Webtrees API: GET /api/trees/{tree}/individuals
        _emit("Fetching individuals from Webtrees…")
        page = 1
        person_xref_to_id = {}

        while True:
            try:
                result = _wt_get(
                    f"/api/trees/{tree_id}/individuals",
                    api_key, base_url,
                    params={"page": page, "per_page": 100}
                )
            except Exception as e:
                _emit(f"✗ Failed to fetch individuals page {page}: {e}")
                break

            individuals = result.get("data", [])
            if not individuals:
                break

            with get_db() as conn:
                for ind in individuals:
                    try:
                        # Webtrees individual has: xref, sex, name (array), birth, death
                        xref   = ind.get("xref", "")
                        names  = ind.get("names", [{}])
                        name   = names[0] if names else {}
                        given   = name.get("given", "")
                        surname = name.get("surname", "")
                        sex     = ind.get("sex", "U")
                        gender  = {"M": "M", "F": "F"}.get(sex, "U")

                        birth_year = None
                        death_year = None
                        for fact in ind.get("facts", []):
                            tag = fact.get("tag", "")
                            yr  = fact.get("date", {}).get("year")
                            if tag == "BIRT" and yr:
                                birth_year = int(yr)
                            elif tag == "DEAT" and yr:
                                death_year = int(yr)

                        row = conn.execute("SELECT id FROM persons WHERE gramps_id=?", (xref,)).fetchone()
                        if row:
                            person_id = row[0]
                            conn.execute("""
                                UPDATE persons SET name_given=?, name_surname=?, gender=?,
                                birth_year=?, death_year=?, updated_at=datetime('now') WHERE id=?
                            """, (given, surname, gender, birth_year, death_year, person_id))
                        else:
                            cur = conn.execute("""
                                INSERT INTO persons (gramps_id, name_given, name_surname, gender, birth_year, death_year)
                                VALUES (?,?,?,?,?,?)
                            """, (xref, given, surname, gender, birth_year, death_year))
                            person_id = cur.lastrowid

                        person_xref_to_id[xref] = person_id
                        stats["people"] += 1
                    except Exception as e:
                        stats["errors"] += 1

            _emit(f"  People: {stats['people']} imported…")
            if not result.get("links", {}).get("next"):
                break
            page += 1

        _emit(f"✓ {stats['people']} people imported")

        # Families
        _emit("Fetching families…")
        page = 1
        while True:
            try:
                result = _wt_get(
                    f"/api/trees/{tree_id}/families",
                    api_key, base_url,
                    params={"page": page, "per_page": 100}
                )
            except Exception as e:
                _emit(f"✗ Failed to fetch families: {e}")
                break

            families = result.get("data", [])
            if not families:
                break

            with get_db() as conn:
                for fam in families:
                    try:
                        xref      = fam.get("xref", "")
                        husb_xref = fam.get("husb", {}).get("xref") if fam.get("husb") else None
                        wife_xref = fam.get("wife", {}).get("xref") if fam.get("wife") else None
                        father_id = person_xref_to_id.get(husb_xref)
                        mother_id = person_xref_to_id.get(wife_xref)

                        row = conn.execute("SELECT id FROM families WHERE gramps_id=?", (xref,)).fetchone()
                        if row:
                            family_id = row[0]
                            conn.execute("""
                                UPDATE families SET father_id=?, mother_id=?, updated_at=datetime('now')
                                WHERE id=?
                            """, (father_id, mother_id, family_id))
                        else:
                            cur = conn.execute("""
                                INSERT INTO families (gramps_id, father_id, mother_id, rel_type)
                                VALUES (?,?,?,?)
                            """, (xref, father_id, mother_id, "Married"))
                            family_id = cur.lastrowid

                        for child in fam.get("children", []):
                            child_id = person_xref_to_id.get(child.get("xref"))
                            if child_id:
                                conn.execute(
                                    "INSERT OR IGNORE INTO family_children (family_id, child_id) VALUES (?,?)",
                                    (family_id, child_id)
                                )
                        stats["families"] += 1
                    except Exception as e:
                        stats["errors"] += 1

            if not result.get("links", {}).get("next"):
                break
            page += 1

        _emit(f"✓ {stats['families']} families imported")
        _emit("✓ Webtrees import complete")

    except Exception as e:
        _emit(f"✗ Fatal: {e}")
        stats["errors"] += 1
    finally:
        _sync["stats"]   = stats
        _sync["running"] = False
        _sync["done"]    = True
