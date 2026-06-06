"""
FamilyRoot — api_stats.py
Statistics dashboard and calendar endpoints.
"""

from flask import Blueprint, jsonify, request
from database import get_db
from datetime import date, timedelta
from collections import deque

stats_bp = Blueprint("stats", __name__)


def _db():
    return get_db()


# ── /api/stats/overview ───────────────────────────────────────────────────────

@stats_bp.route("/api/stats/overview")
def overview():
    with _db() as conn:
        # Totals
        persons_count = conn.execute("SELECT COUNT(*) FROM persons").fetchone()[0]
        families_count = conn.execute("SELECT COUNT(*) FROM families").fetchone()[0]
        events_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        places_count = conn.execute("SELECT COUNT(*) FROM places").fetchone()[0]
        media_count = conn.execute("SELECT COUNT(*) FROM media").fetchone()[0]

        # Year range
        yr = conn.execute(
            "SELECT MIN(date_year), MAX(date_year) FROM events WHERE date_year IS NOT NULL"
        ).fetchone()
        year_range = [yr[0], yr[1]] if yr and yr[0] else []

        # Gender split
        gender_rows = conn.execute(
            "SELECT gender, COUNT(*) FROM persons GROUP BY gender"
        ).fetchall()
        gender_split = {"M": 0, "F": 0, "U": 0}
        for g, cnt in gender_rows:
            key = g if g in ("M", "F") else "U"
            gender_split[key] = gender_split.get(key, 0) + cnt

        # Living count
        living_count = conn.execute(
            "SELECT COUNT(*) FROM persons WHERE is_living = 1"
        ).fetchone()[0]

        # Avg lifespan
        avg_row = conn.execute(
            """SELECT AVG(death_year - birth_year)
               FROM persons
               WHERE birth_year IS NOT NULL AND death_year IS NOT NULL
                 AND (death_year - birth_year) BETWEEN 1 AND 120"""
        ).fetchone()
        avg_lifespan = round(avg_row[0], 1) if avg_row and avg_row[0] else None

        # Top surnames
        surname_rows = conn.execute(
            """SELECT name_surname, COUNT(*) as cnt
               FROM persons
               WHERE name_surname IS NOT NULL AND name_surname != ''
               GROUP BY name_surname
               ORDER BY cnt DESC
               LIMIT 10"""
        ).fetchall()
        top_surnames = [{"name": r[0], "count": r[1]} for r in surname_rows]

        # Births by decade
        birth_rows = conn.execute(
            """SELECT (birth_year / 10) * 10 AS decade, COUNT(*) as cnt
               FROM persons
               WHERE birth_year IS NOT NULL
               GROUP BY decade
               ORDER BY decade"""
        ).fetchall()
        births_by_decade = [{"decade": r[0], "count": r[1]} for r in birth_rows]

        # Deaths by decade
        death_rows = conn.execute(
            """SELECT (death_year / 10) * 10 AS decade, COUNT(*) as cnt
               FROM persons
               WHERE death_year IS NOT NULL
               GROUP BY decade
               ORDER BY decade"""
        ).fetchall()
        deaths_by_decade = [{"decade": r[0], "count": r[1]} for r in death_rows]

        # Top places (by event count)
        place_rows = conn.execute(
            """SELECT p.name, COUNT(e.id) as cnt
               FROM events e
               JOIN places p ON e.place_id = p.id
               GROUP BY p.id
               ORDER BY cnt DESC
               LIMIT 10"""
        ).fetchall()
        top_places = [{"name": r[0], "count": r[1]} for r in place_rows]

        # Events by type
        type_rows = conn.execute(
            """SELECT event_type, COUNT(*) as cnt
               FROM events
               GROUP BY event_type
               ORDER BY cnt DESC"""
        ).fetchall()
        events_by_type = [{"type": r[0], "count": r[1]} for r in type_rows]

        # Generation depth: BFS from persons with no parents
        # A person has no parents if they don't appear in family_children
        all_person_ids = set(
            r[0] for r in conn.execute("SELECT id FROM persons").fetchall()
        )
        # child_id -> list of parent_ids
        children_rows = conn.execute(
            "SELECT child_id FROM family_children"
        ).fetchall()
        children_set = set(r[0] for r in children_rows)

        # family -> children
        fam_children = {}
        for r in conn.execute("SELECT family_id, child_id FROM family_children").fetchall():
            fam_children.setdefault(r[0], []).append(r[1])

        # person -> families as parent
        person_fams = {}
        for r in conn.execute(
            "SELECT father_id, id FROM families WHERE father_id IS NOT NULL"
        ).fetchall():
            person_fams.setdefault(r[0], []).append(r[1])
        for r in conn.execute(
            "SELECT mother_id, id FROM families WHERE mother_id IS NOT NULL"
        ).fetchall():
            person_fams.setdefault(r[0], []).append(r[1])

        roots = all_person_ids - children_set  # persons with no parents
        if not roots:
            roots = all_person_ids  # fallback

        max_depth = 0
        queue = deque()
        for pid in roots:
            queue.append((pid, 0))

        visited = {}
        while queue:
            pid, depth = queue.popleft()
            if pid in visited and visited[pid] >= depth:
                continue
            visited[pid] = depth
            if depth > max_depth:
                max_depth = depth
            for fam_id in person_fams.get(pid, []):
                for child_id in fam_children.get(fam_id, []):
                    queue.append((child_id, depth + 1))

        generation_depth = max_depth

    return jsonify({
        "totals": {
            "persons": persons_count,
            "families": families_count,
            "events": events_count,
            "places": places_count,
            "media": media_count,
        },
        "year_range": year_range,
        "gender_split": gender_split,
        "living_count": living_count,
        "avg_lifespan": avg_lifespan,
        "top_surnames": top_surnames,
        "births_by_decade": births_by_decade,
        "deaths_by_decade": deaths_by_decade,
        "top_places": top_places,
        "events_by_type": events_by_type,
        "generation_depth": generation_depth,
    })


# ── /api/stats/calendar ───────────────────────────────────────────────────────

@stats_bp.route("/api/stats/calendar")
def calendar():
    month = request.args.get("month", type=int, default=date.today().month)
    year = request.args.get("year", type=int, default=date.today().year)

    events_out = []

    with _db() as conn:
        # Birthdays: persons with a Birth event in this month
        birth_rows = conn.execute(
            """SELECT p.id, p.name_given, p.name_surname, p.birth_year,
                      p.is_living, e.date_day
               FROM persons p
               JOIN person_events pe ON pe.person_id = p.id
               JOIN events e ON e.id = pe.event_id
               WHERE e.event_type = 'Birth'
                 AND e.date_month = ?
                 AND e.date_day IS NOT NULL""",
            (month,)
        ).fetchall()

        for row in birth_rows:
            pid, given, surname, birth_yr, is_living, day = row
            name = " ".join(filter(None, [given, surname]))
            age = (year - birth_yr) if birth_yr else None
            events_out.append({
                "day": day,
                "type": "birthday",
                "person_id": pid,
                "name": name,
                "age": age,
                "is_living": bool(is_living),
            })

        # Anniversaries: families with a Marriage event in this month
        marriage_rows = conn.execute(
            """SELECT f.id, p1.name_given, p1.name_surname,
                      p2.name_given, p2.name_surname,
                      e.date_year, e.date_day
               FROM families f
               JOIN family_events fe ON fe.family_id = f.id
               JOIN events e ON e.id = fe.event_id
               LEFT JOIN persons p1 ON p1.id = f.father_id
               LEFT JOIN persons p2 ON p2.id = f.mother_id
               WHERE e.event_type = 'Marriage'
                 AND e.date_month = ?
                 AND e.date_day IS NOT NULL""",
            (month,)
        ).fetchall()

        for row in marriage_rows:
            fid, g1, s1, g2, s2, marry_yr, day = row
            name1 = " ".join(filter(None, [g1, s1])) or "Unknown"
            name2 = " ".join(filter(None, [g2, s2])) or "Unknown"
            years = (year - marry_yr) if marry_yr else None
            events_out.append({
                "day": day,
                "type": "anniversary",
                "family_id": fid,
                "names": f"{name1} & {name2}",
                "years": years,
            })

    events_out.sort(key=lambda x: x["day"])

    return jsonify({"year": year, "month": month, "events": events_out})


# ── /api/stats/upcoming ───────────────────────────────────────────────────────

@stats_bp.route("/api/stats/upcoming")
def upcoming():
    days = request.args.get("days", type=int, default=30)
    today = date.today()
    events_out = []

    # Collect events for current month + next if window crosses month boundary
    months_to_check = set()
    for delta in range(days + 1):
        d = today + timedelta(days=delta)
        months_to_check.add((d.month, d.year))

    with _db() as conn:
        for month, year in months_to_check:
            # Birthdays
            birth_rows = conn.execute(
                """SELECT p.id, p.name_given, p.name_surname, p.birth_year,
                          p.is_living, e.date_day
                   FROM persons p
                   JOIN person_events pe ON pe.person_id = p.id
                   JOIN events e ON e.id = pe.event_id
                   WHERE e.event_type = 'Birth'
                     AND e.date_month = ?
                     AND e.date_day IS NOT NULL""",
                (month,)
            ).fetchall()

            for row in birth_rows:
                pid, given, surname, birth_yr, is_living, day = row
                try:
                    event_date = date(year, month, day)
                except ValueError:
                    continue
                if today <= event_date <= today + timedelta(days=days):
                    name = " ".join(filter(None, [given, surname]))
                    age = (year - birth_yr) if birth_yr else None
                    events_out.append({
                        "date": event_date.isoformat(),
                        "day": day,
                        "month": month,
                        "year": year,
                        "type": "birthday",
                        "person_id": pid,
                        "name": name,
                        "age": age,
                        "is_living": bool(is_living),
                    })

            # Anniversaries
            marriage_rows = conn.execute(
                """SELECT f.id, p1.name_given, p1.name_surname,
                          p2.name_given, p2.name_surname,
                          e.date_year, e.date_day
                   FROM families f
                   JOIN family_events fe ON fe.family_id = f.id
                   JOIN events e ON e.id = fe.event_id
                   LEFT JOIN persons p1 ON p1.id = f.father_id
                   LEFT JOIN persons p2 ON p2.id = f.mother_id
                   WHERE e.event_type = 'Marriage'
                     AND e.date_month = ?
                     AND e.date_day IS NOT NULL""",
                (month,)
            ).fetchall()

            for row in marriage_rows:
                fid, g1, s1, g2, s2, marry_yr, day = row
                try:
                    event_date = date(year, month, day)
                except ValueError:
                    continue
                if today <= event_date <= today + timedelta(days=days):
                    name1 = " ".join(filter(None, [g1, s1])) or "Unknown"
                    name2 = " ".join(filter(None, [g2, s2])) or "Unknown"
                    years = (year - marry_yr) if marry_yr else None
                    events_out.append({
                        "date": event_date.isoformat(),
                        "day": day,
                        "month": month,
                        "year": year,
                        "type": "anniversary",
                        "family_id": fid,
                        "names": f"{name1} & {name2}",
                        "years": years,
                    })

    events_out.sort(key=lambda x: x["date"])

    return jsonify({"days": days, "from": today.isoformat(), "events": events_out})
