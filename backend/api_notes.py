"""
FamilyRoot — api_notes.py
Notes & documents API.
"""
from flask import Blueprint, request, jsonify
from database import get_db

notes_bp = Blueprint("notes", __name__)


def _ensure_tables():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                object_type TEXT NOT NULL,
                object_id INTEGER NOT NULL,
                title TEXT,
                body TEXT NOT NULL,
                note_type TEXT DEFAULT 'general',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)


@notes_bp.route("/api/notes", methods=["GET"])
def list_notes():
    _ensure_tables()
    object_type = request.args.get("object_type")
    object_id = request.args.get("object_id")
    if not object_type or object_id is None:
        return jsonify({"error": "object_type and object_id are required"}), 400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM notes WHERE object_type=? AND object_id=?
               ORDER BY created_at DESC""",
            (object_type, int(object_id)),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@notes_bp.route("/api/notes/", methods=["POST"])
def create_note():
    _ensure_tables()
    data = request.get_json(force=True) or {}
    if not data.get("object_type") or data.get("object_id") is None or not data.get("body"):
        return jsonify({"error": "object_type, object_id, and body are required"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO notes (object_type, object_id, title, body, note_type)
               VALUES (?, ?, ?, ?, ?)""",
            (
                data["object_type"],
                data["object_id"],
                data.get("title"),
                data["body"],
                data.get("note_type", "general"),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@notes_bp.route("/api/notes/<int:note_id>", methods=["PUT"])
def update_note(note_id):
    _ensure_tables()
    data = request.get_json(force=True) or {}
    fields = ["title", "body", "note_type"]
    updates = {k: v for k, v in data.items() if k in fields}
    if not updates:
        return jsonify({"error": "no fields to update"}), 400
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with get_db() as conn:
        conn.execute(
            f"UPDATE notes SET {set_clause}, updated_at=datetime('now') WHERE id = ?",
            (*updates.values(), note_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
    return jsonify(dict(row))


@notes_bp.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    _ensure_tables()
    with get_db() as conn:
        conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        conn.commit()
    return jsonify({"ok": True})
