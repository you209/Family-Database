"""
FamilyRoot — api_search.py

GET /api/search?q=<query>&limit=20
  Search across persons, places, events, and media.
"""

from flask import Blueprint, jsonify, request
from database import get_db

search_bp = Blueprint("search", __name__)


@search_bp.route("/api/search")
def global_search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    like = f"%{q}%"
    results = []
    counts = {"persons": 0, "places": 0, "events": 0, "media": 0}

    with get_db() as conn:
        # Persons
        persons = conn.execute("""
            SELECT id, name_given, name_surname, birth_year, death_year
            FROM persons
            WHERE name_given LIKE ? OR name_surname LIKE ?
            LIMIT 5
        """, (like, like)).fetchall()
        counts["persons"] = len(persons)
        for p in persons:
            name = f"{p['name_given'] or ''} {p['name_surname'] or ''}".strip() or "Unknown"
            years = ""
            if p["birth_year"] or p["death_year"]:
                years = f"{p['birth_year'] or '?'}–{p['death_year'] or ''}"
            results.append({
                "type": "person",
                "id": p["id"],
                "title": name,
                "subtitle": years or "person",
                "icon": "👤",
            })

        # Places
        places = conn.execute("""
            SELECT id, name FROM places
            WHERE name LIKE ?
            LIMIT 5
        """, (like,)).fetchall()
        counts["places"] = len(places)
        for pl in places:
            results.append({
                "type": "place",
                "id": pl["id"],
                "title": pl["name"],
                "subtitle": "place",
                "icon": "📍",
            })

        # Events
        events = conn.execute("""
            SELECT id, event_type, description, date_year FROM events
            WHERE description LIKE ? OR event_type LIKE ?
            LIMIT 5
        """, (like, like)).fetchall()
        counts["events"] = len(events)
        for ev in events:
            title = ev["event_type"] or "Event"
            subtitle = ev["description"] or ""
            if len(subtitle) > 60:
                subtitle = subtitle[:57] + "…"
            if ev["date_year"]:
                subtitle = f"{ev['date_year']} · {subtitle}" if subtitle else str(ev["date_year"])
            results.append({
                "type": "event",
                "id": ev["id"],
                "title": title,
                "subtitle": subtitle or "event",
                "icon": "📅",
            })

        # Media
        media = conn.execute("""
            SELECT id, filename, description FROM media
            WHERE filename LIKE ? OR description LIKE ?
            LIMIT 5
        """, (like, like)).fetchall()
        counts["media"] = len(media)
        for m in media:
            title = m["description"] or m["filename"] or "Media"
            results.append({
                "type": "media",
                "id": m["id"],
                "title": title,
                "subtitle": m["filename"] or "media",
                "icon": "🖼",
            })

    return jsonify({
        "query": q,
        "results": results,
        "counts": counts,
    })
