from flask import Blueprint, jsonify, request, abort
from database import get_db, rows_to_list, row_to_dict

edit_bp = Blueprint("edit", __name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _pick(body, *keys):
    return {k: body[k] for k in keys if k in body}


# ══════════════════════════════════════════════════════════════════════════════
# EVENTS
# ══════════════════════════════════════════════════════════════════════════════

@edit_bp.route("/api/events/<int:event_id>")
def get_event(event_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if row is None:
            abort(404)
        event = row_to_dict(row)
        event["persons"] = rows_to_list(conn.execute(
            """SELECT p.id, p.name_given, p.name_surname, pe.role
               FROM person_events pe
               JOIN persons p ON p.id = pe.person_id
               WHERE pe.event_id = ?""", (event_id,)
        ).fetchall())
        event["families"] = rows_to_list(conn.execute(
            "SELECT family_id FROM family_events WHERE event_id = ?", (event_id,)
        ).fetchall())
    return jsonify(event)


@edit_bp.route("/api/events/", methods=["POST"])
def create_event():
    body = request.get_json(force=True) or {}
    if not body.get("event_type"):
        abort(400)
    fields = _pick(body, "event_type", "date_text", "date_year", "date_month",
                   "date_day", "place_id", "description", "notes", "privacy")
    cols = ", ".join(fields)
    placeholders = ", ".join("?" * len(fields))
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO events ({cols}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@edit_bp.route("/api/events/<int:event_id>", methods=["PUT"])
def update_event(event_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "event_type", "date_text", "date_year", "date_month",
                   "date_day", "place_id", "description", "notes", "privacy")
    if not fields:
        abort(400)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE events SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            list(fields.values()) + [event_id]
        )
        if cur.rowcount == 0:
            abort(404)
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return jsonify(row_to_dict(row))


@edit_bp.route("/api/events/<int:event_id>", methods=["DELETE"])
def delete_event(event_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        if cur.rowcount == 0:
            abort(404)
    return "", 204


@edit_bp.route("/api/events/<int:event_id>/persons", methods=["POST"])
def link_person_to_event(event_id):
    body = request.get_json(force=True) or {}
    person_id = body.get("person_id")
    if not person_id:
        abort(400)
    role = body.get("role", "Primary")
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO person_events (person_id, event_id, role) VALUES (?, ?, ?)",
            (person_id, event_id, role)
        )
    return jsonify({"person_id": person_id, "event_id": event_id, "role": role}), 201


@edit_bp.route("/api/events/<int:event_id>/persons/<int:person_id>", methods=["DELETE"])
def unlink_person_from_event(event_id, person_id):
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM person_events WHERE event_id = ? AND person_id = ?",
            (event_id, person_id)
        )
        if cur.rowcount == 0:
            abort(404)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# FAMILIES
# ══════════════════════════════════════════════════════════════════════════════

def _family_detail(conn, family_id):
    row = conn.execute("SELECT * FROM families WHERE id = ?", (family_id,)).fetchone()
    if row is None:
        return None
    family = row_to_dict(row)

    for role, col in (("father", "father_id"), ("mother", "mother_id")):
        pid = family.get(col)
        if pid:
            p = conn.execute(
                "SELECT id, name_given, name_surname FROM persons WHERE id = ?", (pid,)
            ).fetchone()
            family[role] = row_to_dict(p)
        else:
            family[role] = None

    family["children"] = rows_to_list(conn.execute(
        """SELECT p.id, p.name_given, p.name_surname, fc.frel, fc.mrel
           FROM family_children fc
           JOIN persons p ON p.id = fc.child_id
           WHERE fc.family_id = ?""", (family_id,)
    ).fetchall())

    family["events"] = rows_to_list(conn.execute(
        """SELECT e.id, e.event_type, e.date_text, e.date_year
           FROM family_events fe
           JOIN events e ON e.id = fe.event_id
           WHERE fe.family_id = ?""", (family_id,)
    ).fetchall())

    return family


@edit_bp.route("/api/families/<int:family_id>")
def get_family(family_id):
    with get_db() as conn:
        family = _family_detail(conn, family_id)
        if family is None:
            abort(404)
    return jsonify(family)


@edit_bp.route("/api/families/", methods=["POST"])
def create_family():
    body = request.get_json(force=True) or {}
    fields = _pick(body, "father_id", "mother_id", "rel_type")
    cols = ", ".join(fields) if fields else "rel_type"
    placeholders = ", ".join("?" * len(fields)) if fields else "?"
    values = list(fields.values()) if fields else ["Unknown"]
    if not fields:
        cols = "rel_type"
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO families ({cols}) VALUES ({placeholders})", values
        )
        family = _family_detail(conn, cur.lastrowid)
    return jsonify(family), 201


@edit_bp.route("/api/families/<int:family_id>", methods=["PUT"])
def update_family(family_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "father_id", "mother_id", "rel_type", "notes", "privacy")
    if not fields:
        abort(400)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE families SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            list(fields.values()) + [family_id]
        )
        if cur.rowcount == 0:
            abort(404)
        family = _family_detail(conn, family_id)
    return jsonify(family)


@edit_bp.route("/api/families/<int:family_id>", methods=["DELETE"])
def delete_family(family_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM families WHERE id = ?", (family_id,))
        if cur.rowcount == 0:
            abort(404)
    return "", 204


@edit_bp.route("/api/families/<int:family_id>/children", methods=["POST"])
def add_child_to_family(family_id):
    body = request.get_json(force=True) or {}
    child_id = body.get("child_id")
    if not child_id:
        abort(400)
    frel = body.get("frel", "Birth")
    mrel = body.get("mrel", "Birth")
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO family_children (family_id, child_id, frel, mrel) VALUES (?, ?, ?, ?)",
            (family_id, child_id, frel, mrel)
        )
    return jsonify({"family_id": family_id, "child_id": child_id, "frel": frel, "mrel": mrel}), 201


@edit_bp.route("/api/families/<int:family_id>/children/<int:child_id>", methods=["DELETE"])
def remove_child_from_family(family_id, child_id):
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM family_children WHERE family_id = ? AND child_id = ?",
            (family_id, child_id)
        )
        if cur.rowcount == 0:
            abort(404)
    return "", 204


@edit_bp.route("/api/persons/<int:person_id>/families")
def get_person_families(person_id):
    with get_db() as conn:
        as_parent = rows_to_list(conn.execute(
            "SELECT * FROM families WHERE father_id = ? OR mother_id = ?",
            (person_id, person_id)
        ).fetchall())
        child_rows = conn.execute(
            "SELECT family_id FROM family_children WHERE child_id = ?", (person_id,)
        ).fetchall()
        child_family_ids = [r["family_id"] for r in child_rows]
        as_child = []
        for fid in child_family_ids:
            row = conn.execute("SELECT * FROM families WHERE id = ?", (fid,)).fetchone()
            if row:
                as_child.append(row_to_dict(row))
    return jsonify({"as_parent": as_parent, "as_child": as_child})


# ══════════════════════════════════════════════════════════════════════════════
# PERSON ALTERNATE NAMES
# ══════════════════════════════════════════════════════════════════════════════

@edit_bp.route("/api/persons/<int:person_id>/names")
def list_person_names(person_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM person_names WHERE person_id = ? ORDER BY id", (person_id,)
        ).fetchall()
    return jsonify(rows_to_list(rows))


@edit_bp.route("/api/persons/<int:person_id>/names", methods=["POST"])
def add_person_name(person_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "name_type", "given", "surname", "suffix", "prefix", "date_text", "notes")
    fields["person_id"] = person_id
    cols = ", ".join(fields)
    placeholders = ", ".join("?" * len(fields))
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO person_names ({cols}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute("SELECT * FROM person_names WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@edit_bp.route("/api/names/<int:name_id>", methods=["PUT"])
def update_person_name(name_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "name_type", "given", "surname", "suffix", "prefix", "date_text", "notes")
    if not fields:
        abort(400)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE person_names SET {set_clause} WHERE id = ?",
            list(fields.values()) + [name_id]
        )
        if cur.rowcount == 0:
            abort(404)
        row = conn.execute("SELECT * FROM person_names WHERE id = ?", (name_id,)).fetchone()
    return jsonify(row_to_dict(row))


@edit_bp.route("/api/names/<int:name_id>", methods=["DELETE"])
def delete_person_name(name_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM person_names WHERE id = ?", (name_id,))
        if cur.rowcount == 0:
            abort(404)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# PERSON ATTRIBUTES
# ══════════════════════════════════════════════════════════════════════════════

@edit_bp.route("/api/persons/<int:person_id>/attributes", methods=["POST"])
def add_person_attribute(person_id):
    body = request.get_json(force=True) or {}
    if not body.get("attr_type"):
        abort(400)
    fields = _pick(body, "attr_type", "value", "date_text", "notes")
    fields["person_id"] = person_id
    cols = ", ".join(fields)
    placeholders = ", ".join("?" * len(fields))
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO person_attributes ({cols}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute(
            "SELECT * FROM person_attributes WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return jsonify(row_to_dict(row)), 201


@edit_bp.route("/api/attributes/<int:attr_id>", methods=["PUT"])
def update_person_attribute(attr_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "attr_type", "value", "date_text", "notes")
    if not fields:
        abort(400)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE person_attributes SET {set_clause} WHERE id = ?",
            list(fields.values()) + [attr_id]
        )
        if cur.rowcount == 0:
            abort(404)
        row = conn.execute(
            "SELECT * FROM person_attributes WHERE id = ?", (attr_id,)
        ).fetchone()
    return jsonify(row_to_dict(row))


@edit_bp.route("/api/attributes/<int:attr_id>", methods=["DELETE"])
def delete_person_attribute(attr_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM person_attributes WHERE id = ?", (attr_id,))
        if cur.rowcount == 0:
            abort(404)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# PLACES
# ══════════════════════════════════════════════════════════════════════════════

@edit_bp.route("/api/places/")
def list_places():
    q = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 50)), 200)
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute(
                "SELECT * FROM places WHERE name LIKE ? ORDER BY name LIMIT ?",
                (like, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM places ORDER BY name LIMIT ?", (limit,)
            ).fetchall()
    return jsonify(rows_to_list(rows))


@edit_bp.route("/api/places/<int:place_id>")
def get_place(place_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
        if row is None:
            abort(404)
        place = row_to_dict(row)
        place["alt_names"] = rows_to_list(conn.execute(
            "SELECT * FROM place_names WHERE place_id = ? ORDER BY id", (place_id,)
        ).fetchall())
    return jsonify(place)


@edit_bp.route("/api/places/", methods=["POST"])
def create_place():
    body = request.get_json(force=True) or {}
    if not body.get("name"):
        abort(400)
    fields = _pick(body, "name", "place_type", "latitude", "longitude", "parent_id", "code", "notes")
    cols = ", ".join(fields)
    placeholders = ", ".join("?" * len(fields))
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO places ({cols}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute("SELECT * FROM places WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@edit_bp.route("/api/places/<int:place_id>", methods=["PUT"])
def update_place(place_id):
    body = request.get_json(force=True) or {}
    fields = _pick(body, "name", "place_type", "latitude", "longitude", "parent_id", "code", "notes", "privacy")
    if not fields:
        abort(400)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE places SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            list(fields.values()) + [place_id]
        )
        if cur.rowcount == 0:
            abort(404)
        row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
    return jsonify(row_to_dict(row))
