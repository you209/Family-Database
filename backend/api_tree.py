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

# ── relationship calculator ───────────────────────────────────────────────────

def _relationship_label(gen_a, gen_b):
    """Return a human-readable relationship label given generation distances from a common ancestor."""
    if gen_a == 0 and gen_b == 0:
        return "same person"
    if gen_a == 0:
        return "grandparent" if gen_b >= 2 else "parent"
    if gen_b == 0:
        return "grandchild" if gen_a >= 2 else "child"
    if gen_a == 1 and gen_b == 1:
        return "sibling"
    if min(gen_a, gen_b) == 1:
        deeper = max(gen_a, gen_b)
        if gen_a == 1:
            # A is the uncle/aunt
            if deeper == 2:
                return "uncle/aunt"
            return f"great-uncle/aunt" if deeper == 3 else "distant relative"
        else:
            if deeper == 2:
                return "niece/nephew"
            return f"great-niece/nephew" if deeper == 3 else "distant relative"
    # Both >= 2: cousins
    cousin_degree = min(gen_a, gen_b) - 1
    removal = abs(gen_a - gen_b)
    if cousin_degree > 4:
        return "distant relative"
    if cousin_degree == 1:
        label = "1st cousin"
    elif cousin_degree == 2:
        label = "2nd cousin"
    elif cousin_degree == 3:
        label = "3rd cousin"
    else:
        label = f"{cousin_degree}th cousin"
    if removal == 0:
        return label
    elif removal == 1:
        return f"{label} once removed"
    elif removal == 2:
        return f"{label} twice removed"
    else:
        return f"{label} {removal} times removed"


def _build_graph(conn):
    """Build adjacency list: person_id -> set of neighbour person_ids."""
    graph = {}

    # Everyone
    rows = conn.execute("SELECT id FROM persons").fetchall()
    for r in rows:
        graph.setdefault(r["id"], set())

    # Parent-child edges
    fam_rows = conn.execute("SELECT f.father_id, f.mother_id, fc.child_id FROM families f JOIN family_children fc ON fc.family_id = f.id").fetchall()
    for r in fam_rows:
        child = r["child_id"]
        for parent_id in [r["father_id"], r["mother_id"]]:
            if parent_id:
                graph.setdefault(child, set()).add(parent_id)
                graph.setdefault(parent_id, set()).add(child)

    return graph


@tree_bp.route("/api/tree/relationship")
def get_relationship():
    a_id = request.args.get("a", type=int)
    b_id = request.args.get("b", type=int)
    if not a_id or not b_id:
        return jsonify({"error": "Both a and b query params required"}), 400

    with get_db() as conn:
        row_a = conn.execute("SELECT * FROM persons WHERE id=?", (a_id,)).fetchone()
        row_b = conn.execute("SELECT * FROM persons WHERE id=?", (b_id,)).fetchone()
        if not row_a or not row_b:
            abort(404)

        person_a = _brief(row_a)
        person_b = _brief(row_b)

        if a_id == b_id:
            return jsonify({
                "person_a": person_a,
                "person_b": person_b,
                "relationship": "same person",
                "path": [person_a["name"]],
                "distance": 0,
                "common_ancestors": [],
            })

        graph = _build_graph(conn)

        # BFS from A — record distance and predecessor
        from collections import deque

        def bfs(start):
            dist = {start: 0}
            prev = {start: None}
            q = deque([start])
            while q:
                node = q.popleft()
                for nb in graph.get(node, []):
                    if nb not in dist:
                        dist[nb] = dist[node] + 1
                        prev[nb] = node
                        q.append(nb)
            return dist, prev

        dist_a, prev_a = bfs(a_id)
        dist_b, prev_b = bfs(b_id)

        # Find common ancestors (nodes reachable from both)
        # We want the closest ones — minimum total distance
        common = set(dist_a.keys()) & set(dist_b.keys())
        if not common:
            return jsonify({
                "person_a": person_a,
                "person_b": person_b,
                "relationship": "not related",
                "path": [],
                "distance": None,
                "common_ancestors": [],
            })

        # Pick the common ancestor with minimum sum of distances
        best_ca = min(common, key=lambda n: dist_a[n] + dist_b[n])
        gen_a = dist_a[best_ca]
        gen_b = dist_b[best_ca]
        total_dist = gen_a + gen_b

        relationship = _relationship_label(gen_a, gen_b)

        # Reconstruct path: A -> ... -> common_ancestor -> ... -> B
        def trace_path(prev, start, end):
            path = []
            cur = end
            while cur is not None:
                path.append(cur)
                cur = prev[cur]
            path.reverse()
            return path

        path_a_ids = trace_path(prev_a, a_id, best_ca)
        path_b_ids = trace_path(prev_b, b_id, best_ca)
        # path_b goes from B to CA; we want CA to B, then drop CA (already in path_a)
        path_b_ids_reversed = list(reversed(path_b_ids))[1:]
        full_path_ids = path_a_ids + path_b_ids_reversed

        # Build human-readable path with arrows
        def person_name(pid):
            r = conn.execute("SELECT name_given, name_surname FROM persons WHERE id=?", (pid,)).fetchone()
            if not r:
                return "Unknown"
            return f"{r['name_given'] or ''} {r['name_surname'] or ''}".strip() or "Unknown"

        path_labels = []
        for i, pid in enumerate(full_path_ids):
            path_labels.append(person_name(pid))
            if i < len(full_path_ids) - 1:
                path_labels.append("→")

        # All closest common ancestors (same total distance)
        min_dist = total_dist
        closest_ancestors = []
        for ca in common:
            if dist_a[ca] + dist_b[ca] == min_dist:
                r = conn.execute("SELECT * FROM persons WHERE id=?", (ca,)).fetchone()
                if r:
                    closest_ancestors.append(_brief(r))

        return jsonify({
            "person_a": person_a,
            "person_b": person_b,
            "relationship": relationship,
            "path": path_labels,
            "distance": total_dist,
            "common_ancestors": closest_ancestors,
        })


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
