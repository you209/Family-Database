"""
FamilyRoot — api_grampsengine.py

Connects FamilyRoot to a running Gramps Web API instance as the
canonical genealogy engine.

Routes:
  POST /api/gramps-engine/connect          — authenticate + store credentials
  GET  /api/gramps-engine/status           — test live connection
  POST /api/gramps-engine/import           — full import: Gramps Web → local SQLite (SSE)
  GET  /api/gramps-engine/import/status    — SSE progress stream
  POST /api/gramps-engine/push/<person_id> — push local edits back to Gramps Web
"""

import json
import threading
import time
import urllib.request
import urllib.parse
import urllib.error
from flask import Blueprint, jsonify, request, Response, abort
from database import get_db

grampsengine_bp = Blueprint("grampsengine", __name__)

# ── shared sync state ─────────────────────────────────────────────────────────

_sync = {"running": False, "events": [], "done": False, "stats": {}}


# ── helpers ───────────────────────────────────────────────────────────────────

def _meta_get(conn, key, default=None):
    row = conn.execute("SELECT value FROM db_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _meta_set(conn, key, value):
    conn.execute(
        "INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)",
        (key, value)
    )


def _gramps_get(path, token, base_url, params=None):
    """GET request to Gramps Web API. Returns parsed JSON dict/list."""
    url = base_url.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _gramps_put(path, token, base_url, body):
    """PUT request to Gramps Web API."""
    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _get_credentials():
    with get_db() as conn:
        url   = _meta_get(conn, "grampsengine_url")
        token = _meta_get(conn, "grampsengine_token")
    return url, token


def _sex_to_gender(sex):
    return {1: "M", 0: "F", 2: "U"}.get(sex, "U")


def _gramps_name(name_obj):
    """Extract (given, surname, prefix, suffix, call) from Gramps name object."""
    if not name_obj:
        return "", "", "", "", ""
    given   = name_obj.get("first_name", "")
    call    = name_obj.get("call", "")
    suffix  = name_obj.get("suffix", "")
    title   = name_obj.get("title", "")  # prefix/title
    surname = ""
    for s in name_obj.get("surname_list", []):
        surname = s.get("surname", "")
        break
    return given, surname, title, suffix, call


def _fetch_all(path, token, base_url, pagesize=200):
    """Paginate through all results from a Gramps Web list endpoint."""
    results = []
    page = 0
    while True:
        batch = _gramps_get(path, token, base_url, {"page": page, "pagesize": pagesize})
        if not batch:
            break
        results.extend(batch)
        if len(batch) < pagesize:
            break
        page += 1
    return results


# ── routes ────────────────────────────────────────────────────────────────────

@grampsengine_bp.route("/api/gramps-engine/connect", methods=["POST"])
def connect():
    data     = request.get_json() or {}
    base_url = (data.get("url") or "").rstrip("/")
    username = data.get("username", "")
    password = data.get("password", "")

    if not base_url or not username or not password:
        return jsonify({"error": "url, username and password required"}), 400

    # Authenticate — POST /api/token
    try:
        body = json.dumps({"username": username, "password": password}).encode()
        req  = urllib.request.Request(
            base_url + "/api/token",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            token_data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return jsonify({"error": f"Auth failed: {e.code} {e.reason}"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    token         = token_data.get("access_token") or token_data.get("token")
    refresh_token = token_data.get("refresh_token")

    if not token:
        return jsonify({"error": "No access token in response"}), 502

    # Quick probe — count people
    try:
        people = _gramps_get("/api/people", token, base_url, {"pagesize": 1, "page": 0})
        # Gramps Web returns total in header or we just check response shape
    except Exception as e:
        return jsonify({"error": f"Connected but API probe failed: {e}"}), 502

    with get_db() as conn:
        _meta_set(conn, "grampsengine_url",   base_url)
        _meta_set(conn, "grampsengine_token", token)
        if refresh_token:
            _meta_set(conn, "grampsengine_refresh", refresh_token)

    return jsonify({"ok": True, "url": base_url})


@grampsengine_bp.route("/api/gramps-engine/status")
def status():
    url, token = _get_credentials()
    if not url or not token:
        return jsonify({"connected": False})

    try:
        people = _gramps_get("/api/people", token, url, {"pagesize": 1, "page": 0})
        connected = True
    except Exception:
        connected = False

    if not connected:
        return jsonify({"connected": False, "url": url})

    # Get counts
    counts = {}
    for obj in ("people", "families", "events", "places", "media"):
        try:
            batch = _gramps_get(f"/api/{obj}", token, url, {"pagesize": 1, "page": 0})
            counts[obj] = "?" if batch is None else "✓"
        except Exception:
            counts[obj] = "?"

    return jsonify({"connected": True, "url": url, "counts": counts})


@grampsengine_bp.route("/api/gramps-engine/import", methods=["POST"])
def start_import():
    global _sync
    if _sync["running"]:
        return jsonify({"error": "Sync already running"}), 409

    url, token = _get_credentials()
    if not url or not token:
        return jsonify({"error": "Not connected to Gramps Web"}), 400

    _sync = {"running": True, "events": [], "done": False, "stats": {}}

    threading.Thread(target=_run_import, args=(url, token), daemon=True).start()
    return jsonify({"ok": True})


@grampsengine_bp.route("/api/gramps-engine/import/status")
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


@grampsengine_bp.route("/api/gramps-engine/push/<int:person_id>", methods=["POST"])
def push_person(person_id):
    """Push local person edits back to Gramps Web."""
    url, token = _get_credentials()
    if not url or not token:
        return jsonify({"error": "Not connected"}), 400

    with get_db() as conn:
        p = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        if not p:
            abort(404)

        # Get events
        events = conn.execute("""
            SELECT e.* FROM events e
            JOIN person_events pe ON pe.event_id = e.id
            WHERE pe.person_id = ?
        """, (person_id,)).fetchall()

    gramps_handle = p["gramps_id"]  # we store handle in gramps_id field during import
    if not gramps_handle:
        return jsonify({"error": "No Gramps handle — person was not imported from Gramps"}), 400

    # Build Gramps Web person update object
    surname_list = [{"surname": p["name_surname"] or "", "prefix": "", "connector": "",
                     "origintype": {"value": 0, "_class": "SurnameOriginType"},
                     "_class": "Surname"}]
    update = {
        "_class": "Person",
        "handle": gramps_handle,
        "gramps_id": gramps_handle,
        "name": {
            "_class": "Name",
            "first_name": p["name_given"] or "",
            "surname_list": surname_list,
            "suffix": p["name_suffix"] or "",
            "title": p["name_prefix"] or "",
            "call": p["name_call"] or "",
            "type": {"value": 0, "_class": "NameType"},
        },
        "sex": {"M": 1, "F": 0, "U": 2, "N": 2}.get(p["gender"], 2),
        "private": bool(p["privacy"]),
    }

    try:
        _gramps_put(f"/api/people/{gramps_handle}", token, url, update)
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"ok": True, "handle": gramps_handle})


# ── background import ─────────────────────────────────────────────────────────

def _emit(msg):
    _sync["events"].append({"message": msg})


def _run_import(base_url, token):
    global _sync
    stats = {"people": 0, "families": 0, "events": 0, "places": 0, "media": 0, "errors": 0}

    try:
        # ── 1. Places ─────────────────────────────────────────────────────────
        _emit("Fetching places…")
        places_raw = _fetch_all("/api/places", token, base_url)
        place_handle_to_id = {}

        with get_db() as conn:
            for pl in places_raw:
                try:
                    name = ""
                    for alt in pl.get("alt_names", []):
                        name = alt.get("value", "")
                        break
                    if not name:
                        name = pl.get("name", {}).get("value", pl.get("gramps_id", ""))

                    lat = pl.get("lat") or None
                    lon = pl.get("long") or None

                    row = conn.execute(
                        "SELECT id FROM places WHERE gramps_id=?", (pl["handle"],)
                    ).fetchone()
                    if row:
                        place_id = row[0]
                        conn.execute(
                            "UPDATE places SET name=?, latitude=?, longitude=?, updated_at=datetime('now') WHERE id=?",
                            (name, lat, lon, place_id)
                        )
                    else:
                        cur = conn.execute(
                            "INSERT INTO places (gramps_id, name, latitude, longitude) VALUES (?,?,?,?)",
                            (pl["handle"], name, lat, lon)
                        )
                        place_id = cur.lastrowid
                    place_handle_to_id[pl["handle"]] = place_id
                    stats["places"] += 1
                except Exception as e:
                    stats["errors"] += 1
                    _emit(f"✗ Place error: {e}")

        _emit(f"✓ {stats['places']} places imported")

        # ── 2. Events ─────────────────────────────────────────────────────────
        _emit("Fetching events…")
        events_raw = _fetch_all("/api/events", token, base_url)
        event_handle_to_id = {}

        with get_db() as conn:
            for ev in events_raw:
                try:
                    etype     = ev.get("type", {}).get("string", "Custom")
                    date_obj  = ev.get("date", {}) or {}
                    date_text = date_obj.get("text", "") or ""
                    dateval   = date_obj.get("dateval", [])
                    year = month = day = None
                    if dateval and len(dateval) >= 3:
                        day, month, year = dateval[0], dateval[1], dateval[2]
                        if year == 0:
                            year = None

                    place_handle = (ev.get("place") or "")
                    place_id = place_handle_to_id.get(place_handle)
                    desc   = ev.get("description", "") or None
                    notes  = None

                    row = conn.execute(
                        "SELECT id FROM events WHERE gramps_id=?", (ev["handle"],)
                    ).fetchone()
                    if row:
                        event_id = row[0]
                        conn.execute("""
                            UPDATE events SET event_type=?, date_text=?, date_year=?,
                            date_month=?, date_day=?, place_id=?, description=?,
                            updated_at=datetime('now') WHERE id=?
                        """, (etype, date_text, year, month, day, place_id, desc, event_id))
                    else:
                        cur = conn.execute("""
                            INSERT INTO events
                            (gramps_id, event_type, date_text, date_year, date_month, date_day, place_id, description)
                            VALUES (?,?,?,?,?,?,?,?)
                        """, (ev["handle"], etype, date_text, year, month, day, place_id, desc))
                        event_id = cur.lastrowid
                    event_handle_to_id[ev["handle"]] = event_id
                    stats["events"] += 1
                except Exception as e:
                    stats["errors"] += 1
                    _emit(f"✗ Event error: {e}")

        _emit(f"✓ {stats['events']} events imported")

        # ── 3. People ─────────────────────────────────────────────────────────
        _emit("Fetching people…")
        people_raw = _fetch_all("/api/people", token, base_url)
        person_handle_to_id = {}

        with get_db() as conn:
            for per in people_raw:
                try:
                    given, surname, prefix, suffix, call = _gramps_name(per.get("name"))
                    gender    = _sex_to_gender(per.get("sex", 2))
                    is_living = int(not per.get("death_ref_index", -1) >= 0 and per.get("alive", False))

                    # Denorm birth/death year from event refs
                    birth_year = death_year = None
                    birth_place = None
                    for ref in per.get("event_ref_list", []):
                        eid = event_handle_to_id.get(ref.get("ref"))
                        if not eid:
                            continue
                        role = ref.get("role", {}).get("string", "")
                        with get_db() as c2:
                            ev_row = c2.execute(
                                "SELECT event_type, date_year, place_id FROM events WHERE id=?", (eid,)
                            ).fetchone()
                        if ev_row:
                            if ev_row[0] == "Birth" and not birth_year:
                                birth_year = ev_row[1]
                                if ev_row[2]:
                                    pl = conn.execute("SELECT name FROM places WHERE id=?", (ev_row[2],)).fetchone()
                                    birth_place = pl[0] if pl else None
                            elif ev_row[0] == "Death" and not death_year:
                                death_year = ev_row[1]

                    privacy = int(per.get("private", False))

                    row = conn.execute(
                        "SELECT id FROM persons WHERE gramps_id=?", (per["handle"],)
                    ).fetchone()
                    if row:
                        person_id = row[0]
                        conn.execute("""
                            UPDATE persons SET name_given=?, name_surname=?, name_prefix=?,
                            name_suffix=?, name_call=?, gender=?, birth_year=?, death_year=?,
                            birth_place=?, is_living=?, privacy=?, updated_at=datetime('now')
                            WHERE id=?
                        """, (given, surname, prefix, suffix, call, gender,
                              birth_year, death_year, birth_place, is_living, privacy, person_id))
                    else:
                        cur = conn.execute("""
                            INSERT INTO persons
                            (gramps_id, name_given, name_surname, name_prefix, name_suffix,
                             name_call, gender, birth_year, death_year, birth_place, is_living, privacy)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                        """, (per["handle"], given, surname, prefix, suffix, call, gender,
                              birth_year, death_year, birth_place, is_living, privacy))
                        person_id = cur.lastrowid

                    person_handle_to_id[per["handle"]] = person_id

                    # Link person → events
                    for ref in per.get("event_ref_list", []):
                        eid = event_handle_to_id.get(ref.get("ref"))
                        role = ref.get("role", {}).get("string", "Primary")
                        if eid:
                            conn.execute(
                                "INSERT OR IGNORE INTO person_events (person_id, event_id, role) VALUES (?,?,?)",
                                (person_id, eid, role)
                            )

                    stats["people"] += 1
                    if stats["people"] % 50 == 0:
                        _emit(f"  People: {stats['people']} imported…")

                except Exception as e:
                    stats["errors"] += 1
                    _emit(f"✗ Person error: {e}")

        _emit(f"✓ {stats['people']} people imported")

        # ── 4. Families ───────────────────────────────────────────────────────
        _emit("Fetching families…")
        families_raw = _fetch_all("/api/families", token, base_url)

        with get_db() as conn:
            for fam in families_raw:
                try:
                    father_id = person_handle_to_id.get(fam.get("father_handle"))
                    mother_id = person_handle_to_id.get(fam.get("mother_handle"))
                    rel_type  = fam.get("type", {}).get("string", "Married") or "Married"

                    row = conn.execute(
                        "SELECT id FROM families WHERE gramps_id=?", (fam["handle"],)
                    ).fetchone()
                    if row:
                        family_id = row[0]
                        conn.execute("""
                            UPDATE families SET father_id=?, mother_id=?, rel_type=?,
                            updated_at=datetime('now') WHERE id=?
                        """, (father_id, mother_id, rel_type, family_id))
                    else:
                        cur = conn.execute("""
                            INSERT INTO families (gramps_id, father_id, mother_id, rel_type)
                            VALUES (?,?,?,?)
                        """, (fam["handle"], father_id, mother_id, rel_type))
                        family_id = cur.lastrowid

                    # Children
                    for cref in fam.get("child_ref_list", []):
                        child_id = person_handle_to_id.get(cref.get("ref"))
                        if child_id:
                            conn.execute(
                                "INSERT OR IGNORE INTO family_children (family_id, child_id) VALUES (?,?)",
                                (family_id, child_id)
                            )

                    # Family events (marriage etc.)
                    for ref in fam.get("event_ref_list", []):
                        eid = event_handle_to_id.get(ref.get("ref"))
                        if eid:
                            conn.execute(
                                "INSERT OR IGNORE INTO family_events (family_id, event_id) VALUES (?,?)",
                                (family_id, eid)
                            )

                    stats["families"] += 1
                except Exception as e:
                    stats["errors"] += 1
                    _emit(f"✗ Family error: {e}")

        _emit(f"✓ {stats['families']} families imported")

        # ── 5. Media ──────────────────────────────────────────────────────────
        _emit("Fetching media objects…")
        media_raw = _fetch_all("/api/media", token, base_url)

        with get_db() as conn:
            for med in media_raw:
                try:
                    desc  = med.get("desc", "") or ""
                    mime  = med.get("mime", "image/jpeg")
                    path  = med.get("path", "") or ""
                    fname = path.split("/")[-1] if path else med.get("gramps_id", "")
                    date_obj  = med.get("date", {}) or {}
                    date_text = date_obj.get("text", "") or None
                    dateval   = date_obj.get("dateval", [])
                    year = None
                    if dateval and len(dateval) >= 3 and dateval[2]:
                        year = dateval[2]

                    row = conn.execute(
                        "SELECT id FROM media WHERE gramps_id=?", (med["handle"],)
                    ).fetchone()
                    if row:
                        conn.execute("""
                            UPDATE media SET filename=?, mime=?, description=?,
                            date_text=?, date_year=?, path=?, updated_at=datetime('now')
                            WHERE id=?
                        """, (fname, mime, desc, date_text, year, path, row[0]))
                    else:
                        conn.execute("""
                            INSERT INTO media (gramps_id, filename, mime, description, date_text, date_year, path)
                            VALUES (?,?,?,?,?,?,?)
                        """, (med["handle"], fname, mime, desc, date_text, year, path))
                    stats["media"] += 1
                except Exception as e:
                    stats["errors"] += 1

        _emit(f"✓ {stats['media']} media objects imported")

        # ── done ──────────────────────────────────────────────────────────────
        _emit("✓ Import complete")

    except Exception as e:
        _emit(f"✗ Fatal error: {e}")
        stats["errors"] += 1
    finally:
        _sync["stats"]   = stats
        _sync["running"] = False
        _sync["done"]    = True
