"""
FamilyRoot — api_tree.py

Routes:
  GET /api/tree/ancestors/<id>?generations=4   — ancestor tree (parents, grandparents…)
  GET /api/tree/descendants/<id>?generations=3 — descendant tree (children, grandchildren…)
  GET /api/persons/<id>/story                  — structured life-story data
"""

from flask import Blueprint, jsonify, request, abort
from database import get_db

tree_bp = Blueprint("tree", __name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _brief(row):
    if row is None:
        return None
    return {
        "id":         row["id"],
        "name":       f"{row['name_given'] or ''} {row['name_surname'] or ''}".strip() or "Unknown",
        "given":      row["name_given"],
        "surname":    row["name_surname"],
        "birth_year": row["birth_year"],
        "death_year": row["death_year"],
        "gender":     row["gender"],
        "thumb":      f"/api/photos/thumb/{row['primary_media_id']}" if row["primary_media_id"] else None,
    }


def _get_parents(conn, person_id):
    """Return (father_row, mother_row) for person — uses first family found."""
    fam = conn.execute("""
        SELECT f.father_id, f.mother_id FROM families f
        JOIN family_children fc ON fc.family_id = f.id
        WHERE fc.child_id = ?
        LIMIT 1
    """, (person_id,)).fetchone()
    if not fam:
        return None, None
    def fetch(pid):
        return conn.execute("SELECT * FROM persons WHERE id=?", (pid,)).fetchone() if pid else None
    return fetch(fam["father_id"]), fetch(fam["mother_id"])


def _get_spouses_and_children(conn, person_id):
    """Return list of {spouse, children} dicts for each family the person heads."""
    families = conn.execute("""
        SELECT id, father_id, mother_id FROM families
        WHERE father_id=? OR mother_id=?
    """, (person_id, person_id)).fetchall()
    result = []
    for fam in families:
        partner_id = fam["mother_id"] if fam["father_id"] == person_id else fam["father_id"]
        partner = conn.execute("SELECT * FROM persons WHERE id=?", (partner_id,)).fetchone() if partner_id else None
        kids = conn.execute("""
            SELECT p.* FROM persons p
            JOIN family_children fc ON fc.child_id = p.id
            WHERE fc.family_id = ?
            ORDER BY p.birth_year ASC NULLS LAST
        """, (fam["id"],)).fetchall()
        result.append({
            "family_id": fam["id"],
            "spouse":    _brief(partner),
            "children":  [_brief(k) for k in kids],
        })
    return result


# ── recursive builders ────────────────────────────────────────────────────────

def _build_ancestors(conn, person_id, max_gen, gen=0):
    if person_id is None or gen > max_gen:
        return None
    row = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
    if not row:
        return None
    node = _brief(row)
    node["gen"] = gen
    if gen < max_gen:
        father, mother = _get_parents(conn, person_id)
        node["father"] = _build_ancestors(conn, father["id"] if father else None, max_gen, gen + 1)
        node["mother"] = _build_ancestors(conn, mother["id"] if mother else None, max_gen, gen + 1)
    else:
        node["father"] = None
        node["mother"] = None
    return node


def _build_descendants(conn, person_id, max_gen, gen=0):
    if person_id is None or gen > max_gen:
        return None
    row = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
    if not row:
        return None
    node = _brief(row)
    node["gen"] = gen
    node["families"] = []
    if gen < max_gen:
        for fam in _get_spouses_and_children(conn, person_id):
            node["families"].append({
                "spouse": fam["spouse"],
                "children": [
                    _build_descendants(conn, c["id"], max_gen, gen + 1)
                    for c in fam["children"]
                ],
            })
    return node


# ── routes ────────────────────────────────────────────────────────────────────

@tree_bp.route("/api/tree/ancestors/<int:person_id>")
def get_ancestors(person_id):
    generations = min(int(request.args.get("generations", 4)), 6)
    with get_db() as conn:
        node = _build_ancestors(conn, person_id, generations)
    if not node:
        abort(404)
    return jsonify(node)


@tree_bp.route("/api/tree/descendants/<int:person_id>")
def get_descendants(person_id):
    generations = min(int(request.args.get("generations", 3)), 5)
    with get_db() as conn:
        node = _build_descendants(conn, person_id, generations)
    if not node:
        abort(404)
    return jsonify(node)


# ── life story ────────────────────────────────────────────────────────────────

@tree_bp.route("/api/persons/<int:person_id>/story")
def person_story(person_id):
    with get_db() as conn:
        p = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        if not p:
            abort(404)

        # All events for this person
        events = conn.execute("""
            SELECT e.event_type, e.date_text, e.date_year, e.description,
                   pl.name AS place_name, pe.role
            FROM person_events pe
            JOIN events e ON e.id = pe.event_id
            LEFT JOIN places pl ON pl.id = e.place_id
            WHERE pe.person_id = ?
            ORDER BY e.date_sort ASC NULLS LAST, e.date_year ASC NULLS LAST
        """, (person_id,)).fetchall()

        # Parents
        fam_row = conn.execute("""
            SELECT f.father_id, f.mother_id FROM families f
            JOIN family_children fc ON fc.family_id = f.id
            WHERE fc.child_id = ?
            LIMIT 1
        """, (person_id,)).fetchone()
        father = conn.execute("SELECT * FROM persons WHERE id=?", (fam_row["father_id"],)).fetchone() if fam_row and fam_row["father_id"] else None
        mother = conn.execute("SELECT * FROM persons WHERE id=?", (fam_row["mother_id"],)).fetchone() if fam_row and fam_row["mother_id"] else None

        # Siblings
        siblings = []
        if fam_row:
            sib_rows = conn.execute("""
                SELECT p.* FROM persons p
                JOIN family_children fc ON fc.child_id = p.id
                WHERE fc.family_id = (
                    SELECT family_id FROM family_children WHERE child_id = ?
                    LIMIT 1
                ) AND p.id != ?
                ORDER BY p.birth_year ASC NULLS LAST
            """, (person_id, person_id)).fetchall()
            siblings = [_brief(s) for s in sib_rows]

        # Own families (spouses + children)
        own_families = _get_spouses_and_children(conn, person_id)

        # Attributes
        attrs = conn.execute("""
            SELECT attr_type, value, date_text FROM person_attributes
            WHERE person_id = ?
            ORDER BY attr_type
        """, (person_id,)).fetchall()

        # Sibling count for birth narrative
        birth_order = None
        if fam_row:
            all_sibs = conn.execute("""
                SELECT child_id FROM family_children
                WHERE family_id = (
                    SELECT family_id FROM family_children WHERE child_id = ? LIMIT 1
                )
                ORDER BY rowid
            """, (person_id,)).fetchall()
            ids = [r["child_id"] for r in all_sibs]
            if person_id in ids:
                birth_order = ids.index(person_id) + 1

    return jsonify({
        "person":       dict(p),
        "father":       _brief(father),
        "mother":       _brief(mother),
        "siblings":     siblings,
        "birth_order":  birth_order,
        "events":       [dict(e) for e in events],
        "own_families": own_families,
        "attributes":   [dict(a) for a in attrs],
    })
