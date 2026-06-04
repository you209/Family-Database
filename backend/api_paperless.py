"""
FamilyRoot — api_paperless.py

Integration with paperless-ngx (self-hosted document management).
Connects via the paperless-ngx REST API to browse scanned documents
and link them to people / events in FamilyRoot.

Routes:
  POST /api/paperless/connect        — save URL + token, test connection
  GET  /api/paperless/status         — check connection
  GET  /api/paperless/documents      — list/search documents
  GET  /api/paperless/documents/<id> — single document detail
  POST /api/paperless/link           — link a paperless doc to a person or event
  GET  /api/paperless/links          — list all links in FamilyRoot
"""

import json
import urllib.request
import urllib.parse
from flask import Blueprint, jsonify, request, abort
from database import get_db

paperless_bp = Blueprint("paperless", __name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _meta_get(conn, key, default=None):
    row = conn.execute("SELECT value FROM db_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _meta_set(conn, key, value):
    conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)", (key, value))


def _pp_request(path, token, base_url, params=None, method="GET"):
    url = base_url.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _get_creds():
    with get_db() as conn:
        return (
            _meta_get(conn, "paperless_url"),
            _meta_get(conn, "paperless_token"),
        )


def _ensure_links_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paperless_links (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id       INTEGER NOT NULL,
            doc_title    TEXT,
            object_type  TEXT NOT NULL,
            object_id    INTEGER NOT NULL,
            notes        TEXT,
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(doc_id, object_type, object_id)
        )
    """)


# ── routes ────────────────────────────────────────────────────────────────────

@paperless_bp.route("/api/paperless/connect", methods=["POST"])
def connect():
    data     = request.get_json() or {}
    base_url = (data.get("url") or "").rstrip("/")
    token    = data.get("token", "").strip()

    if not base_url or not token:
        return jsonify({"error": "url and token required"}), 400

    try:
        result = _pp_request("/api/documents/?page_size=1", token, base_url)
    except Exception as e:
        return jsonify({"error": f"Connection failed: {e}"}), 502

    with get_db() as conn:
        _meta_set(conn, "paperless_url",   base_url)
        _meta_set(conn, "paperless_token", token)

    return jsonify({"ok": True, "doc_count": result.get("count", 0), "url": base_url})


@paperless_bp.route("/api/paperless/status")
def status():
    url, token = _get_creds()
    if not url or not token:
        return jsonify({"connected": False})
    try:
        result = _pp_request("/api/documents/?page_size=1", token, url)
        return jsonify({"connected": True, "url": url, "doc_count": result.get("count", 0)})
    except Exception:
        return jsonify({"connected": False, "url": url})


@paperless_bp.route("/api/paperless/documents")
def list_documents():
    url, token = _get_creds()
    if not url:
        return jsonify({"error": "Not connected"}), 400

    q        = request.args.get("q", "")
    page     = request.args.get("page", 1)
    per_page = min(int(request.args.get("per_page", 25)), 100)

    params = {"page_size": per_page, "page": page}
    if q:
        params["query"] = q

    try:
        result = _pp_request("/api/documents/", token, url, params)
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    docs = []
    for d in result.get("results", []):
        docs.append({
            "id":        d["id"],
            "title":     d.get("title", ""),
            "created":   d.get("created", ""),
            "added":     d.get("added", ""),
            "doc_type":  d.get("document_type"),
            "tags":      d.get("tags", []),
            "thumb_url": f"{url}/api/documents/{d['id']}/thumb/",
            "download_url": f"{url}/api/documents/{d['id']}/download/",
            "preview_url":  f"{url}/api/documents/{d['id']}/preview/",
            "content_snippet": (d.get("content") or "")[:200],
        })

    return jsonify({"documents": docs, "total": result.get("count", 0)})


@paperless_bp.route("/api/paperless/documents/<int:doc_id>")
def get_document(doc_id):
    url, token = _get_creds()
    if not url:
        return jsonify({"error": "Not connected"}), 400
    try:
        d = _pp_request(f"/api/documents/{doc_id}/", token, url)
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "id":          d["id"],
        "title":       d.get("title", ""),
        "created":     d.get("created", ""),
        "content":     d.get("content", ""),
        "tags":        d.get("tags", []),
        "thumb_url":   f"{url}/api/documents/{d['id']}/thumb/",
        "preview_url": f"{url}/api/documents/{d['id']}/preview/",
        "download_url":f"{url}/api/documents/{d['id']}/download/",
    })


@paperless_bp.route("/api/paperless/link", methods=["POST"])
def link_document():
    data = request.get_json() or {}
    doc_id      = data.get("doc_id")
    doc_title   = data.get("doc_title", "")
    object_type = data.get("object_type")   # "person" or "event"
    object_id   = data.get("object_id")
    notes       = data.get("notes", "")

    if not all([doc_id, object_type, object_id]):
        return jsonify({"error": "doc_id, object_type, object_id required"}), 400

    with get_db() as conn:
        _ensure_links_table(conn)
        conn.execute("""
            INSERT OR REPLACE INTO paperless_links
            (doc_id, doc_title, object_type, object_id, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (doc_id, doc_title, object_type, object_id, notes))

    return jsonify({"ok": True})


@paperless_bp.route("/api/paperless/links")
def list_links():
    object_type = request.args.get("object_type")
    object_id   = request.args.get("object_id")

    with get_db() as conn:
        _ensure_links_table(conn)
        where, params = [], []
        if object_type:
            where.append("object_type=?"); params.append(object_type)
        if object_id:
            where.append("object_id=?"); params.append(int(object_id))
        sql = "SELECT * FROM paperless_links"
        if where:
            sql += " WHERE " + " AND ".join(where)
        rows = conn.execute(sql, params).fetchall()

    links = [dict(r) for r in rows]

    # Attach thumb URLs if connected
    url, token = _get_creds()
    if url:
        for lnk in links:
            lnk["thumb_url"]   = f"{url}/api/documents/{lnk['doc_id']}/thumb/"
            lnk["preview_url"] = f"{url}/api/documents/{lnk['doc_id']}/preview/"

    return jsonify({"links": links})


@paperless_bp.route("/api/paperless/link/<int:link_id>", methods=["DELETE"])
def delete_link(link_id):
    with get_db() as conn:
        _ensure_links_table(conn)
        conn.execute("DELETE FROM paperless_links WHERE id=?", (link_id,))
    return jsonify({"ok": True})
