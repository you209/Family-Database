"""
FamilyRoot — api_sources.py
Source citations API.
"""
from flask import Blueprint, request, jsonify
from database import get_db

sources_bp = Blueprint("sources", __name__)


def _ensure_tables():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT,
                publisher TEXT,
                pub_date TEXT,
                url TEXT,
                source_type TEXT DEFAULT 'document',
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS citations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                object_type TEXT NOT NULL,
                object_id INTEGER NOT NULL,
                page TEXT,
                quality INTEGER DEFAULT 2,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(source_id, object_type, object_id)
            );
        """)


# ── Sources ───────────────────────────────────────────────────────────────────

@sources_bp.route("/api/sources/", methods=["GET"])
def list_sources():
    _ensure_tables()
    q = request.args.get("q", "").strip()
    with get_db() as conn:
        if q:
            rows = conn.execute(
                """SELECT s.*, COUNT(c.id) as citation_count
                   FROM sources s LEFT JOIN citations c ON c.source_id = s.id
                   WHERE s.title LIKE ? OR s.author LIKE ?
                   GROUP BY s.id ORDER BY s.title""",
                (f"%{q}%", f"%{q}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT s.*, COUNT(c.id) as citation_count
                   FROM sources s LEFT JOIN citations c ON c.source_id = s.id
                   GROUP BY s.id ORDER BY s.title"""
            ).fetchall()
    return jsonify([dict(r) for r in rows])


@sources_bp.route("/api/sources/", methods=["POST"])
def create_source():
    _ensure_tables()
    data = request.get_json(force=True) or {}
    if not data.get("title"):
        return jsonify({"error": "title is required"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO sources (title, author, publisher, pub_date, url, source_type, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                data["title"],
                data.get("author"),
                data.get("publisher"),
                data.get("pub_date"),
                data.get("url"),
                data.get("source_type", "document"),
                data.get("notes"),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@sources_bp.route("/api/sources/<int:source_id>", methods=["GET"])
def get_source(source_id):
    _ensure_tables()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        citations = conn.execute(
            "SELECT * FROM citations WHERE source_id = ? ORDER BY created_at",
            (source_id,),
        ).fetchall()
    result = dict(row)
    result["citations"] = [dict(c) for c in citations]
    return jsonify(result)


@sources_bp.route("/api/sources/<int:source_id>", methods=["PUT"])
def update_source(source_id):
    _ensure_tables()
    data = request.get_json(force=True) or {}
    fields = ["title", "author", "publisher", "pub_date", "url", "source_type", "notes"]
    updates = {k: v for k, v in data.items() if k in fields}
    if not updates:
        return jsonify({"error": "no fields to update"}), 400
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with get_db() as conn:
        conn.execute(
            f"UPDATE sources SET {set_clause} WHERE id = ?",
            (*updates.values(), source_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
    return jsonify(dict(row))


@sources_bp.route("/api/sources/<int:source_id>", methods=["DELETE"])
def delete_source(source_id):
    _ensure_tables()
    with get_db() as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        conn.commit()
    return jsonify({"ok": True})


# ── Citations ─────────────────────────────────────────────────────────────────

@sources_bp.route("/api/sources/<int:source_id>/cite", methods=["POST"])
def add_citation(source_id):
    _ensure_tables()
    data = request.get_json(force=True) or {}
    if not data.get("object_type") or data.get("object_id") is None:
        return jsonify({"error": "object_type and object_id are required"}), 400
    with get_db() as conn:
        conn.execute(
            """INSERT INTO citations (source_id, object_type, object_id, page, quality, notes)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(source_id, object_type, object_id)
               DO UPDATE SET page=excluded.page, quality=excluded.quality, notes=excluded.notes""",
            (
                source_id,
                data["object_type"],
                data["object_id"],
                data.get("page"),
                data.get("quality", 2),
                data.get("notes"),
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM citations WHERE source_id=? AND object_type=? AND object_id=?",
            (source_id, data["object_type"], data["object_id"]),
        ).fetchone()
    return jsonify(dict(row)), 201


@sources_bp.route("/api/citations/<int:citation_id>", methods=["DELETE"])
def delete_citation(citation_id):
    _ensure_tables()
    with get_db() as conn:
        conn.execute("DELETE FROM citations WHERE id = ?", (citation_id,))
        conn.commit()
    return jsonify({"ok": True})


@sources_bp.route("/api/citations", methods=["GET"])
def get_citations():
    _ensure_tables()
    object_type = request.args.get("object_type")
    object_id = request.args.get("object_id")
    if not object_type or object_id is None:
        return jsonify({"error": "object_type and object_id are required"}), 400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.*, s.title, s.author, s.publisher, s.pub_date, s.url, s.source_type,
                      s.notes as source_notes
               FROM citations c JOIN sources s ON s.id = c.source_id
               WHERE c.object_type = ? AND c.object_id = ?
               ORDER BY c.created_at""",
            (object_type, int(object_id)),
        ).fetchall()
    return jsonify([dict(r) for r in rows])
