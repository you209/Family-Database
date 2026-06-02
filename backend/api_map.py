"""
FamilyRoot — api_map.py

Flask Blueprint: /api/map/*

Routes:
  GET /api/map/events   — all events that have a place with lat/lon
                          plus the people involved, grouped for the
                          map timeline slider
"""

from flask import Blueprint, jsonify, request
from database import get_db, rows_to_list

map_bp = Blueprint("map", __name__)


@map_bp.route("/api/map/events")
def map_events():
    """
    Returns every event that has a geocoded place (lat IS NOT NULL).
    Each event includes:
      - event_id, event_type, date_year, date_text, description
      - place_id, place_name, lat, lon
      - people: list of { id, name_given, name_surname, role }
      - photos: up to 3 sample photo thumb_urls linked to those people
    Also returns year_range [min, max] for the slider.

    Optional query params:
      year_from, year_to   — filter by year range
      person_id            — only events involving a specific person
    """
    year_from  = request.args.get("year_from",  type=int)
    year_to    = request.args.get("year_to",    type=int)
    person_id  = request.args.get("person_id",  type=int)

    where  = ["pl.latitude IS NOT NULL", "pl.longitude IS NOT NULL",
              "e.date_year IS NOT NULL"]
    params = []

    if year_from is not None:
        where.append("e.date_year >= ?"); params.append(year_from)
    if year_to is not None:
        where.append("e.date_year <= ?"); params.append(year_to)
    if person_id is not None:
        where.append("""
            EXISTS (
                SELECT 1 FROM person_events pe2
                WHERE pe2.event_id = e.id AND pe2.person_id = ?
            )
        """); params.append(person_id)

    where_sql = "WHERE " + " AND ".join(where)

    with get_db() as conn:
        event_rows = rows_to_list(conn.execute(f"""
            SELECT DISTINCT
                e.id AS event_id, e.event_type,
                e.date_year, e.date_month, e.date_day, e.date_text,
                e.description,
                pl.id AS place_id, pl.name AS place_name,
                pl.latitude AS lat, pl.longitude AS lon
            FROM events e
            JOIN places pl ON pl.id = e.place_id
            {where_sql}
            ORDER BY e.date_year ASC, e.date_month ASC
        """, params).fetchall())

        # Year range for the slider (always full range, ignoring filters)
        yr = conn.execute("""
            SELECT MIN(e.date_year), MAX(e.date_year)
            FROM events e
            JOIN places pl ON pl.id = e.place_id
            WHERE pl.latitude IS NOT NULL AND e.date_year IS NOT NULL
        """).fetchone()
        year_range = [yr[0] or 1800, yr[1] or 2024]

        # For each event attach its people
        for ev in event_rows:
            people = rows_to_list(conn.execute("""
                SELECT p.id, p.name_given, p.name_surname, pe.role
                FROM person_events pe
                JOIN persons p ON p.id = pe.person_id
                WHERE pe.event_id = ? AND p.privacy = 0
            """, (ev["event_id"],)).fetchall())
            ev["people"] = people

            # Sample photo for the first person with photos at this event
            ev["thumb_url"] = None
            for per in people:
                row = conn.execute("""
                    SELECT m.path FROM face_detections fd
                    JOIN media m ON m.id = fd.media_id
                    WHERE fd.person_id = ? AND m.path IS NOT NULL
                    LIMIT 1
                """, (per["id"],)).fetchone()
                if row and row[0]:
                    ev["thumb_url"] = f"/thumbnails/{row[0]}"
                    break

        # Also fetch residence-type events to build movement trails
        # (consecutive residences per person, ordered by year)
        trails_raw = rows_to_list(conn.execute("""
            SELECT pe.person_id,
                   p.name_given, p.name_surname,
                   e.date_year,
                   pl.latitude AS lat, pl.longitude AS lon,
                   pl.name AS place_name
            FROM person_events pe
            JOIN events e  ON e.id  = pe.event_id
            JOIN places pl ON pl.id = e.place_id
            WHERE e.event_type IN ('Residence','Immigration','Emigration',
                                   'Birth','Death')
              AND pl.latitude IS NOT NULL
              AND e.date_year IS NOT NULL
              AND pe.role = 'Primary'
            ORDER BY pe.person_id, e.date_year ASC
        """).fetchall())

    # Group trails by person_id
    trails_by_person = {}
    for r in trails_raw:
        pid = r["person_id"]
        if pid not in trails_by_person:
            trails_by_person[pid] = {
                "person_id":    pid,
                "name_given":   r["name_given"],
                "name_surname": r["name_surname"],
                "points": [],
            }
        trails_by_person[pid]["points"].append({
            "year": r["date_year"],
            "lat":  r["lat"],
            "lon":  r["lon"],
            "place": r["place_name"],
        })

    trails = list(trails_by_person.values())

    return jsonify({
        "events":     event_rows,
        "trails":     trails,
        "year_range": year_range,
    })
