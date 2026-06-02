"""
FamilyRoot — api_persons.py

Flask Blueprint: /api/persons/*

Routes:
  GET  /api/persons/          list persons (search by q=, paginated)
  POST /api/persons/          create a new person
  GET  /api/persons/<id>      single person detail
  PUT  /api/persons/<id>      update person fields

And: /api/timeline/
  GET  /api/timeline/         year-by-year event + photo counts
"""

from flask import Blueprint, jsonify, request, abort
from database import get_db, rows_to_list, row_to_dict

persons_bp = Blueprint("persons", __name__)


# ── persons ───────────────────────────────────────────────────────────────────

@persons_bp.route("/api/persons/")
def list_persons():
    q        = request.args.get("q", "").strip()
    page     = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 40))
    offset   = (page - 1) * per_page

    where, params = [], []
    if q:
        like = f"%{q}%"
        where.append("(name_given LIKE ? OR name_surname LIKE ?)")
        params += [like, like]

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM persons {where_sql}", params
        ).fetchone()[0]
        rows = rows_to_list(conn.execute(
            f"""SELECT id, gramps_id, gender, name_given, name_surname,
                       name_suffix, name_prefix, birth_year, death_year,
                       birth_place, is_living, privacy
                FROM persons {where_sql}
                ORDER BY name_surname ASC, name_given ASC
                LIMIT ? OFFSET ?""",
            params + [per_page, offset]
        ).fetchall())

    return jsonify({
        "persons": rows,
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    (total + per_page - 1) // per_page,
    })


@persons_bp.route("/api/persons/", methods=["POST"])
def create_person():
    data = request.get_json() or {}
    given   = (data.get("name_given")   or "").strip()
    surname = (data.get("name_surname") or "").strip()
    if not given and not surname:
        return jsonify({"error": "name_given or name_surname required"}), 400

    gender     = data.get("gender", "U")
    birth_year = data.get("birth_year")
    is_living  = int(data.get("is_living", 0))

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO persons (name_given, name_surname, gender, birth_year, is_living)
               VALUES (?, ?, ?, ?, ?)""",
            (given, surname, gender, birth_year, is_living)
        )
        person_id = cur.lastrowid
        person = row_to_dict(
            conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        )

    return jsonify(person), 201


@persons_bp.route("/api/persons/<int:person_id>")
def get_person(person_id):
    with get_db() as conn:
        person = row_to_dict(
            conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        )
        if not person:
            abort(404)

        events = rows_to_list(conn.execute(
            """SELECT e.id AS event_id, e.event_type, e.date_text, e.date_year,
                      e.date_sort, pe.role,
                      p.name AS place_name
               FROM person_events pe
               JOIN events e ON e.id = pe.event_id
               LEFT JOIN places p ON p.id = e.place_id
               WHERE pe.person_id = ?
               ORDER BY e.date_sort ASC NULLS LAST, e.date_year ASC""",
            (person_id,)
        ).fetchall())

        alt_names = rows_to_list(conn.execute(
            "SELECT * FROM person_names WHERE person_id=?", (person_id,)
        ).fetchall())

        attrs = rows_to_list(conn.execute(
            "SELECT * FROM person_attributes WHERE person_id=?", (person_id,)
        ).fetchall())

        # Photos tagged with this person (via face_detections)
        photos = rows_to_list(conn.execute("""
            SELECT DISTINCT m.id, m.filename, m.path, m.date_text, m.date_year,
                            m.description, fd.det_score AS confidence
            FROM face_detections fd
            JOIN media m ON m.id = fd.media_id
            WHERE fd.person_id = ?
            ORDER BY m.date_year ASC NULLS LAST, m.filename ASC
        """, (person_id,)).fetchall())
        for ph in photos:
            ph["thumb_url"] = f"/thumbnails/{ph['path']}" if ph.get("path") else None

    person["events"]     = events
    person["alt_names"]  = alt_names
    person["attributes"] = attrs
    person["photos"]     = photos
    return jsonify(person)


@persons_bp.route("/api/persons/<int:person_id>", methods=["PUT"])
def update_person(person_id):
    data = request.get_json() or {}
    allowed = {
        "name_given", "name_surname", "name_suffix", "name_prefix",
        "name_call", "gender", "birth_year", "death_year",
        "birth_place", "is_living", "privacy", "notes",
    }
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({"error": "No valid fields"}), 400

    set_sql = ", ".join(f"{k} = ?" for k in updates)
    values  = list(updates.values()) + [person_id]

    with get_db() as conn:
        conn.execute(
            f"UPDATE persons SET {set_sql}, updated_at = datetime('now') WHERE id = ?",
            values
        )
        person = row_to_dict(
            conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        )

    if not person:
        abort(404)
    return jsonify(person)


# ── timeline ──────────────────────────────────────────────────────────────────

@persons_bp.route("/api/timeline/")
def timeline():
    """
    Returns a year-by-year list of events (with person name + place) plus
    a dict of photo counts per year.
    """
    with get_db() as conn:
        # Events grouped by year
        rows = rows_to_list(conn.execute("""
            SELECT e.id AS event_id, e.event_type,
                   e.date_text, e.date_year, e.date_month, e.date_day,
                   e.description,
                   pl.name AS place_name,
                   p.name_given, p.name_surname,
                   pe.role
            FROM events e
            LEFT JOIN places pl ON pl.id = e.place_id
            LEFT JOIN person_events pe ON pe.event_id = e.id
            LEFT JOIN persons p ON p.id = pe.person_id
            WHERE e.date_year IS NOT NULL
              AND (pe.role IS NULL OR pe.role = 'Primary')
              AND (p.privacy IS NULL OR p.privacy = 0)
            ORDER BY e.date_year ASC, e.date_month ASC, e.date_day ASC
        """).fetchall())

        # Photo counts per year
        photo_rows = conn.execute(
            "SELECT date_year, COUNT(*) AS cnt FROM media WHERE date_year IS NOT NULL GROUP BY date_year"
        ).fetchall()

    # Group events by year
    by_year = {}
    for r in rows:
        y = r["date_year"]
        if y not in by_year:
            by_year[y] = []
        by_year[y].append(r)

    years_list = [
        {"year": y, "events": evts}
        for y, evts in sorted(by_year.items())
    ]

    photo_counts = {row[0]: row[1] for row in photo_rows}

    # Add years that only have photos (no events)
    all_years = set(by_year.keys()) | set(photo_counts.keys())
    years_list = [
        {"year": y, "events": by_year.get(y, [])}
        for y in sorted(all_years)
    ]

    return jsonify({
        "years":        years_list,
        "photo_counts": photo_counts,
    })


# ── bubble board data ─────────────────────────────────────────────────────────

# The three reserved group tag names used by the bubble board.
GROUPS = ("family", "colleague", "friend")


def _ensure_group_tags(conn):
    """Create the three group tags if they don't exist yet."""
    defaults = {
        "family":    "#1D9E75",
        "colleague": "#C0392B",
        "friend":    "#2980B9",
    }
    for name, color in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)",
            (name, color)
        )


def _get_person_group(conn, person_id: int) -> str | None:
    """Return 'family' | 'colleague' | 'friend' | None for a person."""
    row = conn.execute("""
        SELECT t.name FROM object_tags ot
        JOIN tags t ON t.id = ot.tag_id
        WHERE ot.object_type = 'person'
          AND ot.object_id   = ?
          AND t.name IN ('family','colleague','friend')
        LIMIT 1
    """, (person_id,)).fetchone()
    return row[0] if row else None


@persons_bp.route("/api/persons/bubbles")
def bubble_data():
    """
    Returns every person with their photo count, group, and family connections.
    Used by the bubble board visualisation.
    """
    with get_db() as conn:
        _ensure_group_tags(conn)

        people = rows_to_list(conn.execute("""
            SELECT
                p.id, p.name_given, p.name_surname,
                p.gender, p.birth_year, p.death_year,
                p.is_living, p.privacy,
                p.primary_media_id,
                COUNT(DISTINCT fd.media_id) AS photo_count
            FROM persons p
            LEFT JOIN face_detections fd ON fd.person_id = p.id
            WHERE p.privacy = 0
            GROUP BY p.id
            ORDER BY photo_count DESC
        """).fetchall())

        families = rows_to_list(conn.execute("""
            SELECT f.id, f.father_id, f.mother_id, f.rel_type,
                   GROUP_CONCAT(fc.child_id) AS child_ids
            FROM families f
            LEFT JOIN family_children fc ON fc.family_id = f.id
            GROUP BY f.id
        """).fetchall())

        # Attach group tag and thumbnail per person
        for p in people:
            p["group"] = _get_person_group(conn, p["id"])

            mid = p.get("primary_media_id")
            if mid:
                m = row_to_dict(
                    conn.execute("SELECT path FROM media WHERE id=?", (mid,)).fetchone()
                )
                p["thumb_url"] = f"/thumbnails/{m['path']}" if m and m.get("path") else None
            else:
                m = row_to_dict(conn.execute("""
                    SELECT m.path FROM face_detections fd
                    JOIN media m ON m.id = fd.media_id
                    WHERE fd.person_id = ? AND m.path IS NOT NULL
                    LIMIT 1
                """, (p["id"],)).fetchone())
                p["thumb_url"] = f"/thumbnails/{m['path']}" if m and m.get("path") else None

    # Parse child_ids from GROUP_CONCAT string
    for f in families:
        raw = f.get("child_ids") or ""
        f["child_ids"] = [int(x) for x in raw.split(",") if x.strip().isdigit()]

    return jsonify({"people": people, "families": families})


@persons_bp.route("/api/persons/<int:person_id>/group", methods=["POST"])
def set_person_group(person_id):
    """
    Set or clear a person's bubble-board group.
    Body: { "group": "family" | "colleague" | "friend" | null }
    """
    data  = request.get_json() or {}
    group = data.get("group")  # None means clear

    if group and group not in GROUPS:
        return jsonify({"error": f"group must be one of {GROUPS}"}), 400

    with get_db() as conn:
        # Confirm person exists
        if not conn.execute("SELECT 1 FROM persons WHERE id=?", (person_id,)).fetchone():
            abort(404)

        _ensure_group_tags(conn)

        # Remove any existing group tag for this person
        conn.execute("""
            DELETE FROM object_tags
            WHERE object_type = 'person'
              AND object_id   = ?
              AND tag_id IN (SELECT id FROM tags WHERE name IN ('family','colleague','friend'))
        """, (person_id,))

        if group:
            tag_id = conn.execute(
                "SELECT id FROM tags WHERE name=?", (group,)
            ).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO object_tags (tag_id, object_type, object_id) VALUES (?,?,?)",
                (tag_id, "person", person_id)
            )

    return jsonify({"ok": True, "group": group})


@persons_bp.route("/api/persons/<int:person_id>/tags")
def get_person_tags(person_id):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM persons WHERE id=?", (person_id,)).fetchone():
            abort(404)
        rows = conn.execute("""
            SELECT t.name FROM object_tags ot
            JOIN tags t ON t.id = ot.tag_id
            WHERE ot.object_type = 'person' AND ot.object_id = ?
        """, (person_id,)).fetchall()
    return jsonify({"tags": [r[0] for r in rows]})
