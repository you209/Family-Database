"""
FamilyRoot — api_export.py

Flask Blueprint: /api/export/*

Routes:
  GET  /api/export/gedcom            export entire DB as GEDCOM 5.5.1
  GET  /api/export/csv/persons       export persons table as CSV
  GET  /api/export/csv/events        export events with person names as CSV
  POST /api/export/report/person/<id> generate text summary for one person
  GET  /api/export/stats             return aggregate DB statistics
"""

import csv
import io
from datetime import datetime

from flask import Blueprint, jsonify, Response, abort
from database import get_db, rows_to_list, row_to_dict

export_bp = Blueprint("export", __name__)


# ── GEDCOM export ─────────────────────────────────────────────────────────────

def _gedcom_date(date_text, date_year):
    """Return a GEDCOM-friendly date string."""
    if date_text:
        return date_text.strip()
    if date_year:
        return str(date_year)
    return None


@export_bp.route("/api/export/gedcom")
def export_gedcom():
    with get_db() as conn:
        persons = rows_to_list(conn.execute(
            "SELECT id, name_given, name_surname, gender, birth_year, death_year FROM persons ORDER BY id"
        ).fetchall())

        events = rows_to_list(conn.execute(
            """SELECT pe.person_id, pe.role, e.event_type, e.date_text, e.date_year, pl.place_name
               FROM person_events pe
               JOIN events e ON e.id = pe.event_id
               LEFT JOIN places pl ON pl.id = e.place_id
               ORDER BY pe.person_id, e.date_year"""
        ).fetchall())

        families = rows_to_list(conn.execute(
            "SELECT id, husband_id, wife_id FROM families ORDER BY id"
        ).fetchall())

        children = rows_to_list(conn.execute(
            "SELECT family_id, person_id FROM family_children ORDER BY family_id, person_id"
        ).fetchall())

    # Index events by person_id
    events_by_person = {}
    for ev in events:
        events_by_person.setdefault(ev["person_id"], []).append(ev)

    # Index children by family_id
    children_by_family = {}
    for ch in children:
        children_by_family.setdefault(ch["family_id"], []).append(ch["person_id"])

    lines = []

    # HEAD
    now = datetime.utcnow()
    lines += [
        "0 HEAD",
        "1 SOUR FamilyRoot",
        "2 VERS 0.1.0",
        "1 GEDC",
        "2 VERS 5.5.1",
        "2 FORM LINEAGE-LINKED",
        "1 CHAR UTF-8",
        f"1 DATE {now.strftime('%d %b %Y').upper()}",
    ]

    # Individuals
    for p in persons:
        pid = p["id"]
        given = (p.get("name_given") or "").strip()
        surname = (p.get("name_surname") or "").strip()
        full_name = f"{given} /{surname}/" if surname else given
        gender_map = {"M": "M", "F": "F", "male": "M", "female": "F"}
        sex = gender_map.get((p.get("gender") or "").strip(), "U")

        lines.append(f"0 @I{pid}@ INDI")
        if full_name.strip():
            lines.append(f"1 NAME {full_name}")
            if given:
                lines.append(f"2 GIVN {given}")
            if surname:
                lines.append(f"2 SURN {surname}")
        lines.append(f"1 SEX {sex}")

        # Birth / death from events table
        person_evs = events_by_person.get(pid, [])
        for ev in person_evs:
            etype = (ev.get("event_type") or "").upper()
            tag = None
            if etype in ("BIRTH", "BIRT"):
                tag = "BIRT"
            elif etype in ("DEATH", "DEAT"):
                tag = "DEAT"
            if tag:
                lines.append(f"1 {tag}")
                d = _gedcom_date(ev.get("date_text"), ev.get("date_year"))
                if d:
                    lines.append(f"2 DATE {d}")
                if ev.get("place_name"):
                    lines.append(f"2 PLAC {ev['place_name']}")

        # Fallback birth/death years from persons table
        ev_types_present = {(ev.get("event_type") or "").upper() for ev in person_evs}
        if "BIRTH" not in ev_types_present and "BIRT" not in ev_types_present and p.get("birth_year"):
            lines.append("1 BIRT")
            lines.append(f"2 DATE {p['birth_year']}")
        if "DEATH" not in ev_types_present and "DEAT" not in ev_types_present and p.get("death_year"):
            lines.append("1 DEAT")
            lines.append(f"2 DATE {p['death_year']}")

    # Families
    for f in families:
        fid = f["id"]
        lines.append(f"0 @F{fid}@ FAM")
        if f.get("husband_id"):
            lines.append(f"1 HUSB @I{f['husband_id']}@")
        if f.get("wife_id"):
            lines.append(f"1 WIFE @I{f['wife_id']}@")
        for child_id in children_by_family.get(fid, []):
            lines.append(f"1 CHIL @I{child_id}@")

    lines.append("0 TRLR")

    content = "\r\n".join(lines) + "\r\n"
    return Response(
        content,
        mimetype="text/plain",
        headers={"Content-Disposition": "attachment; filename=familyroot.ged"},
    )


# ── CSV: persons ──────────────────────────────────────────────────────────────

@export_bp.route("/api/export/csv/persons")
def export_csv_persons():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT p.id, p.name_given, p.name_surname, p.gender,
                      p.birth_year, p.death_year, p.birth_place, p.is_living
               FROM persons p ORDER BY p.name_surname, p.name_given"""
        ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "name_given", "name_surname", "gender",
                     "birth_year", "death_year", "birth_place", "is_living"])
    for row in rows:
        writer.writerow(list(row))

    return Response(
        output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=persons.csv"},
    )


# ── CSV: events ───────────────────────────────────────────────────────────────

@export_bp.route("/api/export/csv/events")
def export_csv_events():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT e.event_type, e.date_text, e.date_year, pl.place_name,
                      (p.name_given || ' ' || COALESCE(p.name_surname, '')) AS person_name,
                      pe.role
               FROM events e
               LEFT JOIN places pl ON pl.id = e.place_id
               LEFT JOIN person_events pe ON pe.event_id = e.id
               LEFT JOIN persons p ON p.id = pe.person_id
               ORDER BY e.date_year, e.date_text"""
        ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["event_type", "date_text", "date_year",
                     "place_name", "person_name", "role"])
    for row in rows:
        writer.writerow(list(row))

    return Response(
        output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=events.csv"},
    )


# ── Person report ─────────────────────────────────────────────────────────────

@export_bp.route("/api/export/report/person/<int:person_id>", methods=["POST"])
def export_person_report(person_id):
    with get_db() as conn:
        person = row_to_dict(conn.execute(
            "SELECT * FROM persons WHERE id = ?", (person_id,)
        ).fetchone())
        if not person:
            abort(404)

        # Events
        events = rows_to_list(conn.execute(
            """SELECT e.event_type, e.date_text, e.date_year, pl.place_name, pe.role
               FROM person_events pe
               JOIN events e ON e.id = pe.event_id
               LEFT JOIN places pl ON pl.id = e.place_id
               WHERE pe.person_id = ?
               ORDER BY e.date_year, e.date_text""",
            (person_id,)
        ).fetchall())

        # Family relationships — find families where this person is husband or wife
        families_as_spouse = rows_to_list(conn.execute(
            """SELECT f.id, f.husband_id, f.wife_id,
                      ph.name_given AS h_given, ph.name_surname AS h_surname,
                      pw.name_given AS w_given, pw.name_surname AS w_surname
               FROM families f
               LEFT JOIN persons ph ON ph.id = f.husband_id
               LEFT JOIN persons pw ON pw.id = f.wife_id
               WHERE f.husband_id = ? OR f.wife_id = ?""",
            (person_id, person_id)
        ).fetchall())

        # Children
        children_rows = rows_to_list(conn.execute(
            """SELECT p.id, p.name_given, p.name_surname, p.birth_year, p.death_year
               FROM family_children fc
               JOIN families f ON f.id = fc.family_id
               JOIN persons p ON p.id = fc.person_id
               WHERE f.husband_id = ? OR f.wife_id = ?
               ORDER BY p.birth_year""",
            (person_id, person_id)
        ).fetchall())

        # Parents — find family where this person is a child
        parent_families = rows_to_list(conn.execute(
            """SELECT f.husband_id, f.wife_id,
                      ph.name_given AS h_given, ph.name_surname AS h_surname,
                      pw.name_given AS w_given, pw.name_surname AS w_surname
               FROM family_children fc
               JOIN families f ON f.id = fc.family_id
               LEFT JOIN persons ph ON ph.id = f.husband_id
               LEFT JOIN persons pw ON pw.id = f.wife_id
               WHERE fc.person_id = ?""",
            (person_id,)
        ).fetchall())

        # Siblings
        siblings = rows_to_list(conn.execute(
            """SELECT DISTINCT p.id, p.name_given, p.name_surname, p.birth_year
               FROM family_children fc1
               JOIN family_children fc2 ON fc2.family_id = fc1.family_id AND fc2.person_id != ?
               JOIN persons p ON p.id = fc2.person_id
               WHERE fc1.person_id = ?
               ORDER BY p.birth_year""",
            (person_id, person_id)
        ).fetchall())

    def full_name(given, surname):
        parts = [x for x in [given, surname] if x]
        return " ".join(parts) if parts else "Unknown"

    name = full_name(person.get("name_given"), person.get("name_surname"))

    lines = [f"Person Report: {name}"]
    lines.append("=" * (len(lines[0])))
    lines.append("")

    # Basic info
    birth_year = person.get("birth_year")
    death_year = person.get("death_year")
    gender = person.get("gender") or "Unknown"
    birth_place = person.get("birth_place") or ""

    lines.append(f"Name: {name}")
    lines.append(f"Gender: {gender}")
    if birth_year:
        bp = f", {birth_place}" if birth_place else ""
        lines.append(f"Born: {birth_year}{bp}")
    if death_year:
        lines.append(f"Died: {death_year}")
    elif not person.get("is_living"):
        pass
    lines.append("")

    # Parents
    if parent_families:
        lines.append("Parents:")
        for pf in parent_families:
            if pf.get("husband_id"):
                lines.append(f"  Father: {full_name(pf['h_given'], pf['h_surname'])}")
            if pf.get("wife_id"):
                lines.append(f"  Mother: {full_name(pf['w_given'], pf['w_surname'])}")
        lines.append("")

    # Siblings
    if siblings:
        lines.append("Siblings:")
        for s in siblings:
            yr = f" (b. {s['birth_year']})" if s.get("birth_year") else ""
            lines.append(f"  {full_name(s['name_given'], s['name_surname'])}{yr}")
        lines.append("")

    # Spouses
    if families_as_spouse:
        lines.append("Spouses:")
        for fam in families_as_spouse:
            if fam["husband_id"] == person_id:
                sp = full_name(fam.get("w_given"), fam.get("w_surname"))
            else:
                sp = full_name(fam.get("h_given"), fam.get("h_surname"))
            lines.append(f"  {sp}")
        lines.append("")

    # Children
    if children_rows:
        lines.append("Children:")
        for ch in children_rows:
            yr = f" (b. {ch['birth_year']})" if ch.get("birth_year") else ""
            dy = f", d. {ch['death_year']}" if ch.get("death_year") else ""
            lines.append(f"  {full_name(ch['name_given'], ch['name_surname'])}{yr}{dy}")
        lines.append("")

    # Life events
    if events:
        lines.append("Life Events:")
        for ev in events:
            etype = (ev.get("event_type") or "Event").title()
            d = ev.get("date_text") or (str(ev["date_year"]) if ev.get("date_year") else "")
            place = ev.get("place_name") or ""
            role = ev.get("role") or ""
            parts = [x for x in [d, place] if x]
            detail = ", ".join(parts)
            role_str = f" [{role}]" if role and role.lower() != "primary" else ""
            lines.append(f"  {etype}{role_str}: {detail}" if detail else f"  {etype}{role_str}")
        lines.append("")

    report = "\n".join(lines)
    return jsonify({"report": report, "name": name})


# ── Stats ─────────────────────────────────────────────────────────────────────

@export_bp.route("/api/export/stats")
def export_stats():
    with get_db() as conn:
        total_persons = conn.execute("SELECT COUNT(*) FROM persons").fetchone()[0]
        total_families = conn.execute("SELECT COUNT(*) FROM families").fetchone()[0]
        total_events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        total_places = conn.execute("SELECT COUNT(*) FROM places").fetchone()[0]

        # media table — try common names
        try:
            total_media = conn.execute("SELECT COUNT(*) FROM media").fetchone()[0]
        except Exception:
            total_media = 0

        yr = conn.execute(
            "SELECT MIN(date_year), MAX(date_year) FROM events WHERE date_year IS NOT NULL"
        ).fetchone()
        min_year = yr[0] if yr else None
        max_year = yr[1] if yr else None

    return jsonify({
        "total_persons": total_persons,
        "total_families": total_families,
        "total_events": total_events,
        "total_places": total_places,
        "total_media": total_media,
        "date_range": [min_year, max_year],
    })
