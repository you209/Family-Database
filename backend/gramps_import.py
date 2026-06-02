"""
FamilyRoot — gramps_import.py

Imports a Gramps XML (.gramps) file into the FamilyRoot database.
Gramps XML is a gzip-compressed XML file — this handles both compressed
and uncompressed variants.

Supported Gramps objects:
  - People (names, gender, notes, privacy)
  - Families (parents, children, relationship type)
  - Events (all types, dates, places, notes)
  - Places (hierarchical, lat/lon, place names)
  - Sources + Repositories + Citations
  - Media objects (photos, documents)
  - Tags
  - Notes

Run:
    python gramps_import.py yourfile.gramps [--db path/to/familyroot.db]

Or via the REST API:
    POST /api/gramps/import  { "file_path": "/path/to/file.gramps" }
"""

import gzip
import json
import re
import sqlite3
from pathlib import Path
from typing import Optional
from lxml import etree

from database import init_db, get_db, DB_PATH


# ── Gramps date parsing ──────────────────────────────────────────────────────

GRAMPS_MONTHS = {
    "1": "Jan", "2": "Feb", "3": "Mar", "4": "Apr",
    "5": "May", "6": "Jun", "7": "Jul", "8": "Aug",
    "9": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

def _parse_gramps_date(date_el) -> dict:
    """
    Parse a Gramps <dateval>, <daterange>, <datespan>, or <dateval> element.
    Returns { date_text, date_year, date_sort }.
    """
    if date_el is None:
        return {"date_text": None, "date_year": None, "date_sort": None}

    tag = date_el.tag.split("}")[-1] if "}" in date_el.tag else date_el.tag

    val = date_el.get("val", "")
    modifier = date_el.get("modifier", "")  # before, after, about, calc, est
    quality = date_el.get("quality", "")    # estimated, calculated

    mod_prefix = {
        "before": "Bef.", "after": "Aft.", "about": "Abt.",
        "calculated": "Cal.", "estimated": "Est.",
    }.get(modifier, "")

    if tag in ("dateval",):
        # val = "YYYY-MM-DD" or "YYYY-MM" or "YYYY"
        parts = val.split("-")
        year = int(parts[0]) if parts[0].isdigit() else None
        month = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
        day = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None

        bits = []
        if day:
            bits.append(str(day))
        if month:
            bits.append(GRAMPS_MONTHS.get(str(month), str(month)))
        if year:
            bits.append(str(year))
        text = (" ".join(bits)) if bits else val
        if mod_prefix:
            text = f"{mod_prefix} {text}"

        return {
            "date_text": text or None,
            "date_year": year,
            "date_sort": f"{year:04d}-{month or 0:02d}-{day or 0:02d}" if year else None,
        }

    elif tag == "daterange":
        start = date_el.get("start", "")
        stop = date_el.get("stop", "")
        start_year = int(start.split("-")[0]) if start and start.split("-")[0].isdigit() else None
        stop_year  = int(stop.split("-")[0])  if stop  and stop.split("-")[0].isdigit()  else None
        text = f"Bet. {start_year} and {stop_year}" if start_year and stop_year else f"{start}–{stop}"
        return {"date_text": text, "date_year": start_year, "date_sort": f"{start_year:04d}-00-00" if start_year else None}

    elif tag == "datespan":
        start = date_el.get("start", "")
        stop  = date_el.get("stop", "")
        return {"date_text": f"{start} – {stop}", "date_year": None, "date_sort": None}

    elif tag == "datestr":
        return {"date_text": val or None, "date_year": None, "date_sort": None}

    return {"date_text": val or None, "date_year": None, "date_sort": None}


def _find_date(el, ns):
    """Find the first date child element under el."""
    for tag in ("dateval", "daterange", "datespan", "datestr"):
        child = el.find(f"{ns}{tag}")
        if child is not None:
            return _parse_gramps_date(child)
    return {"date_text": None, "date_year": None, "date_sort": None}


# ── main importer ─────────────────────────────────────────────────────────────

class GrampsImporter:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.ns = ""  # XML namespace prefix, set during parse

        # gramps_id → internal DB id maps (built as we insert)
        self._person_map: dict[str, int] = {}
        self._family_map: dict[str, int] = {}
        self._event_map:  dict[str, int] = {}
        self._place_map:  dict[str, int] = {}
        self._source_map: dict[str, int] = {}
        self._repo_map:   dict[str, int] = {}
        self._citation_map: dict[str, int] = {}
        self._media_map:  dict[str, int] = {}
        self._note_map:   dict[str, int] = {}
        self._tag_map:    dict[str, int] = {}

        self.stats = {k: 0 for k in (
            "persons", "families", "events", "places", "sources",
            "repositories", "citations", "media", "notes", "tags", "errors"
        )}

    def _ns(self, tag: str) -> str:
        return f"{self.ns}{tag}"

    def _get(self, el, child_tag: str, default=None):
        child = el.find(self._ns(child_tag))
        return child.text if child is not None else default

    def _attr(self, el, attr: str, default=None):
        return el.get(attr, default)

    # ── load XML ──────────────────────────────────────────────────────────────

    def load(self, path: Path) -> etree._Element:
        """Open .gramps (gzip XML) or plain XML."""
        try:
            with gzip.open(path, "rb") as f:
                data = f.read()
        except (gzip.BadGzipFile, OSError):
            data = path.read_bytes()

        root = etree.fromstring(data)
        # Detect namespace
        if root.tag.startswith("{"):
            self.ns = root.tag.split("}")[0] + "}"
        return root

    # ── tags ──────────────────────────────────────────────────────────────────

    def _import_tags(self, root):
        for el in root.findall(f".//{self._ns('tag')}"):
            handle = el.get("handle", "")
            name   = el.get("name", "Unknown tag")
            color  = el.get("color", "#888888")
            cur = self.conn.execute(
                "INSERT OR IGNORE INTO tags (name, color) VALUES (?,?)",
                (name, color)
            )
            tid = cur.lastrowid or self.conn.execute(
                "SELECT id FROM tags WHERE name=?", (name,)
            ).fetchone()[0]
            self._tag_map[handle] = tid
            self.stats["tags"] += 1

    # ── repositories ─────────────────────────────────────────────────────────

    def _import_repositories(self, root):
        for el in root.findall(f".//{self._ns('repository')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")
            rtype_el = el.find(self._ns("type"))
            rtype  = rtype_el.text if rtype_el is not None else None
            name_el = el.find(self._ns("rname"))
            name   = name_el.text if name_el is not None else gid

            url_el = el.find(f".//{self._ns('url')}")
            url    = url_el.get("href") if url_el is not None else None

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO repositories (gramps_id, name, repo_type, url)
                VALUES (?,?,?,?)
            """, (gid, name or gid, rtype, url))
            self._repo_map[handle] = cur.lastrowid
            self.stats["repositories"] += 1

    # ── sources ───────────────────────────────────────────────────────────────

    def _import_sources(self, root):
        for el in root.findall(f".//{self._ns('source')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")
            title  = self._get(el, "stitle") or gid
            author = self._get(el, "sauthor")
            pub    = self._get(el, "spubinfo")
            abbrev = self._get(el, "sabbrev")

            repo_handle = None
            repo_ref = el.find(self._ns("reporef"))
            if repo_ref is not None:
                repo_handle = repo_ref.get("hlink")

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO sources
                    (gramps_id, title, author, pubinfo, abbrev, repository_id)
                VALUES (?,?,?,?,?,?)
            """, (
                gid, title, author, pub, abbrev,
                self._repo_map.get(repo_handle) if repo_handle else None,
            ))
            self._source_map[handle] = cur.lastrowid
            self.stats["sources"] += 1

    # ── citations ─────────────────────────────────────────────────────────────

    def _import_citations(self, root):
        for el in root.findall(f".//{self._ns('citation')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")
            page   = self._get(el, "page")
            conf_el = el.find(self._ns("confidence"))
            confidence = int(conf_el.text) if conf_el is not None and conf_el.text else 2

            src_ref = el.find(self._ns("sourceref"))
            src_handle = src_ref.get("hlink") if src_ref is not None else None

            date_info = _find_date(el, self.ns)

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO citations
                    (gramps_id, source_id, page, confidence, date_text)
                VALUES (?,?,?,?,?)
            """, (
                gid,
                self._source_map.get(src_handle) if src_handle else None,
                page, confidence,
                date_info["date_text"],
            ))
            self._citation_map[handle] = cur.lastrowid
            self.stats["citations"] += 1

    # ── places ────────────────────────────────────────────────────────────────

    def _import_places(self, root):
        # Two passes: first insert all, then set parent_id
        place_parents: dict[int, str] = {}  # db_id → parent handle

        for el in root.findall(f".//{self._ns('placeobj')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")
            ptype  = el.get("type", "")

            name_el = el.find(f"{self.ns}pname")
            name = name_el.get("value", gid) if name_el is not None else gid

            coord_el = el.find(self._ns("coord"))
            lat = lon = None
            if coord_el is not None:
                try:
                    lat = float(coord_el.get("lat", "").replace(",", "."))
                    lon = float(coord_el.get("long", "").replace(",", "."))
                except ValueError:
                    pass

            parent_ref = el.find(self._ns("placeref"))
            parent_handle = parent_ref.get("hlink") if parent_ref is not None else None

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO places (gramps_id, name, place_type, latitude, longitude)
                VALUES (?,?,?,?,?)
            """, (gid, name, ptype, lat, lon))
            db_id = cur.lastrowid
            self._place_map[handle] = db_id
            if parent_handle:
                place_parents[db_id] = parent_handle
            self.stats["places"] += 1

        # Second pass: set parent_id
        for db_id, parent_handle in place_parents.items():
            parent_db_id = self._place_map.get(parent_handle)
            if parent_db_id:
                self.conn.execute(
                    "UPDATE places SET parent_id=? WHERE id=?",
                    (parent_db_id, db_id)
                )

    # ── events ────────────────────────────────────────────────────────────────

    def _import_events(self, root):
        for el in root.findall(f".//{self._ns('event')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")

            etype_el = el.find(self._ns("type"))
            etype = etype_el.text if etype_el is not None else "Custom"

            date_info = _find_date(el, self.ns)

            place_ref = el.find(self._ns("place"))
            place_handle = place_ref.get("hlink") if place_ref is not None else None

            desc_el = el.find(self._ns("description"))
            desc = desc_el.text if desc_el is not None else None

            note_text = self._collect_notes(el)

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO events
                    (gramps_id, event_type, date_text, date_year, date_sort, place_id, description, notes)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                gid, etype,
                date_info["date_text"], date_info["date_year"], date_info["date_sort"],
                self._place_map.get(place_handle) if place_handle else None,
                desc, note_text,
            ))
            self._event_map[handle] = cur.lastrowid
            self.stats["events"] += 1

    # ── media ─────────────────────────────────────────────────────────────────

    def _import_media(self, root):
        for el in root.findall(f".//{self._ns('object')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")

            file_el = el.find(self._ns("file"))
            if file_el is None:
                continue

            filename = file_el.get("src", "")
            mime     = file_el.get("mime", "")
            desc     = file_el.get("description", "")

            date_info = _find_date(el, self.ns)

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO media (gramps_id, filename, mime, description, date_text, date_year, path)
                VALUES (?,?,?,?,?,?,?)
            """, (gid, Path(filename).name, mime, desc,
                  date_info["date_text"], date_info["date_year"], filename))
            self._media_map[handle] = cur.lastrowid
            self.stats["media"] += 1

    # ── notes helper ──────────────────────────────────────────────────────────

    def _collect_notes(self, el) -> Optional[str]:
        """Inline note text (styledtext or plain text children)."""
        parts = []
        for note_el in el.findall(f".//{self._ns('noteref')}"):
            pass  # resolved later via note objects
        text_el = el.find(f".//{self._ns('styledtext')}")
        if text_el is not None:
            t = text_el.find(self._ns("text"))
            if t is not None and t.text:
                parts.append(t.text.strip())
        return "\n".join(parts) or None

    # ── persons ───────────────────────────────────────────────────────────────

    def _import_persons(self, root):
        for el in root.findall(f".//{self._ns('person')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")
            priv   = int(el.get("priv", "0"))

            gender_el = el.find(self._ns("gender"))
            gender_map = {"M": "M", "F": "F", "U": "U", "N": "N"}
            gender = gender_map.get(gender_el.text if gender_el is not None else "U", "U")

            # Primary name
            name_el = el.find(self._ns("name"))
            given = surname = suffix = prefix = call = None
            if name_el is not None:
                first_el   = name_el.find(self._ns("first"))
                surname_el = name_el.find(f".//{self._ns('surname')}")
                suffix_el  = name_el.find(self._ns("suffix"))
                call_el    = name_el.find(self._ns("call"))
                given   = first_el.text   if first_el   is not None else None
                surname = surname_el.text if surname_el is not None else None
                suffix  = suffix_el.text  if suffix_el  is not None else None
                call    = call_el.text    if call_el    is not None else None

            # Birth/death year denorm (from eventref → events already imported)
            birth_year = death_year = None

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO persons
                    (gramps_id, gender, name_given, name_surname, name_suffix, name_call, privacy)
                VALUES (?,?,?,?,?,?,?)
            """, (gid, gender, given, surname, suffix, call, priv))
            person_db_id = cur.lastrowid
            self._person_map[handle] = person_db_id
            self.stats["persons"] += 1

            # Alternate names
            for alt_name_el in el.findall(self._ns("name"))[1:]:
                ntype_el = alt_name_el.find(self._ns("type"))
                ntype = ntype_el.text if ntype_el is not None else "Also Known As"
                ag = alt_name_el.find(self._ns("first"))
                as_ = alt_name_el.find(f".//{self._ns('surname')}")
                self.conn.execute("""
                    INSERT INTO person_names (person_id, name_type, given, surname)
                    VALUES (?,?,?,?)
                """, (
                    person_db_id, ntype,
                    ag.text if ag is not None else None,
                    as_.text if as_ is not None else None,
                ))

            # Event refs
            for eref in el.findall(self._ns("eventref")):
                ehandle = eref.get("hlink")
                role = eref.get("role", "Primary")
                event_db_id = self._event_map.get(ehandle)
                if event_db_id:
                    self.conn.execute("""
                        INSERT OR IGNORE INTO person_events (person_id, event_id, role)
                        VALUES (?,?,?)
                    """, (person_db_id, event_db_id, role))

                    # Update birth/death year on person row
                    ev = self.conn.execute(
                        "SELECT event_type, date_year FROM events WHERE id=?", (event_db_id,)
                    ).fetchone()
                    if ev and ev[1]:
                        if ev[0] in ("Birth", "Baptism", "Christening") and not birth_year:
                            birth_year = ev[1]
                        elif ev[0] in ("Death", "Burial") and not death_year:
                            death_year = ev[1]

            # Attributes (occupation, education, etc.)
            for attr_el in el.findall(self._ns("attribute")):
                atype_el = attr_el.find(self._ns("type"))
                aval = attr_el.get("value") or self._get(attr_el, "value")
                atype = atype_el.text if atype_el is not None else attr_el.get("type", "")
                if atype and aval:
                    self.conn.execute("""
                        INSERT INTO person_attributes (person_id, attr_type, value)
                        VALUES (?,?,?)
                    """, (person_db_id, atype, aval))

            # Media refs
            for mref in el.findall(self._ns("objref")):
                mhandle = mref.get("hlink")
                media_db_id = self._media_map.get(mhandle)
                if media_db_id:
                    self.conn.execute("""
                        INSERT OR IGNORE INTO person_media (person_id, media_id)
                        VALUES (?,?)
                    """, (person_db_id, media_db_id))

            # Update denorm birth/death
            if birth_year or death_year:
                self.conn.execute("""
                    UPDATE persons SET birth_year=?, death_year=?, is_living=?
                    WHERE id=?
                """, (birth_year, death_year, 1 if not death_year else 0, person_db_id))

    # ── families ─────────────────────────────────────────────────────────────

    def _import_families(self, root):
        for el in root.findall(f".//{self._ns('family')}"):
            gid    = el.get("id", "")
            handle = el.get("handle", "")

            rel_el = el.find(self._ns("rel"))
            rel_type = rel_el.get("type", "Married") if rel_el is not None else "Married"

            father_ref = el.find(self._ns("father"))
            mother_ref = el.find(self._ns("mother"))
            father_handle = father_ref.get("hlink") if father_ref is not None else None
            mother_handle = mother_ref.get("hlink") if mother_ref is not None else None

            cur = self.conn.execute("""
                INSERT OR REPLACE INTO families (gramps_id, rel_type, father_id, mother_id)
                VALUES (?,?,?,?)
            """, (
                gid, rel_type,
                self._person_map.get(father_handle) if father_handle else None,
                self._person_map.get(mother_handle) if mother_handle else None,
            ))
            family_db_id = cur.lastrowid
            self._family_map[handle] = family_db_id
            self.stats["families"] += 1

            # Children
            for child_ref in el.findall(self._ns("childref")):
                chandle = child_ref.get("hlink")
                frel = child_ref.get("frel", "Birth")
                mrel = child_ref.get("mrel", "Birth")
                child_db_id = self._person_map.get(chandle)
                if child_db_id:
                    self.conn.execute("""
                        INSERT OR IGNORE INTO family_children (family_id, child_id, frel, mrel)
                        VALUES (?,?,?,?)
                    """, (family_db_id, child_db_id, frel, mrel))

            # Family events
            for eref in el.findall(self._ns("eventref")):
                ehandle = eref.get("hlink")
                event_db_id = self._event_map.get(ehandle)
                if event_db_id:
                    self.conn.execute("""
                        INSERT OR IGNORE INTO family_events (family_id, event_id)
                        VALUES (?,?)
                    """, (family_db_id, event_db_id))

    # ── main entry point ─────────────────────────────────────────────────────

    def run(self, path: Path, progress_cb=None) -> dict:
        def _progress(msg):
            if progress_cb:
                progress_cb(msg)
            else:
                print(f"  {msg}")

        _progress("Loading Gramps XML...")
        root = self.load(path)

        steps = [
            ("Tags",         self._import_tags),
            ("Repositories", self._import_repositories),
            ("Sources",      self._import_sources),
            ("Citations",    self._import_citations),
            ("Places",       self._import_places),
            ("Events",       self._import_events),
            ("Media objects",self._import_media),
            ("People",       self._import_persons),
            ("Families",     self._import_families),
        ]

        for label, fn in steps:
            _progress(f"Importing {label}...")
            try:
                fn(root)
                self.conn.commit()
            except Exception as e:
                self.stats["errors"] += 1
                _progress(f"  ERROR in {label}: {e}")
                self.conn.rollback()

        self.conn.close()
        return self.stats


# ── Flask API route ───────────────────────────────────────────────────────────

def register_gramps_routes(app, db_path: Path):
    from flask import Blueprint, request, jsonify, Response
    import threading, json as _json

    gramps_bp = Blueprint("gramps", __name__)
    _status = {"running": False, "messages": [], "stats": {}}

    @gramps_bp.route("/api/gramps/import", methods=["POST"])
    def gramps_import():
        if _status["running"]:
            return jsonify({"error": "Import already running"}), 409
        data = request.get_json()
        file_path = data.get("file_path")
        if not file_path or not Path(file_path).exists():
            return jsonify({"error": "File not found"}), 400

        def _run():
            _status["running"] = True
            _status["messages"] = []
            _status["stats"] = {}
            importer = GrampsImporter(db_path)
            msgs = []
            def cb(msg):
                msgs.append(msg)
                _status["messages"] = msgs[:]
            try:
                stats = importer.run(Path(file_path), progress_cb=cb)
                _status["stats"] = stats
            finally:
                _status["running"] = False

        threading.Thread(target=_run, daemon=True).start()
        return jsonify({"ok": True})

    @gramps_bp.route("/api/gramps/import/status")
    def gramps_status():
        def generate():
            import time
            seen = 0
            while _status["running"]:
                msgs = _status["messages"]
                for msg in msgs[seen:]:
                    yield f"data: {_json.dumps({'message': msg})}\n\n"
                seen = len(msgs)
                time.sleep(0.3)
            yield f"data: {_json.dumps({'done': True, 'stats': _status['stats']})}\n\n"
        return Response(generate(), mimetype="text/event-stream")

    @gramps_bp.route("/api/gramps/stats")
    def gramps_db_stats():
        """Summary of what's in the DB — for the Gramps integration tab."""
        import sqlite3 as _sq
        conn = _sq.connect(db_path)
        def count(table, where=""):
            return conn.execute(f"SELECT COUNT(*) FROM {table} {where}").fetchone()[0]
        result = {
            "persons":      count("persons"),
            "families":     count("families"),
            "events":       count("events"),
            "places":       count("places"),
            "sources":      count("sources"),
            "citations":    count("citations"),
            "media":        count("media"),
            "tags":         count("tags"),
            "living":       count("persons", "WHERE is_living=1"),
            "with_photos":  count("person_media"),
            "unplaced_events": count("events", "WHERE place_id IS NULL"),
            "undated_events":  count("events", "WHERE date_year IS NULL"),
        }
        conn.close()
        return jsonify(result)

    app.register_blueprint(gramps_bp)
    return gramps_bp


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from database import init_db

    if len(sys.argv) < 2:
        print("Usage: python gramps_import.py yourfile.gramps [--db path/to/db]")
        sys.exit(1)

    gramps_file = Path(sys.argv[1])
    db_override = None
    if "--db" in sys.argv:
        idx = sys.argv.index("--db")
        db_override = Path(sys.argv[idx + 1])

    db = db_override or DB_PATH
    init_db(db)

    print(f"Importing {gramps_file} → {db}")
    importer = GrampsImporter(db)
    stats = importer.run(gramps_file)

    print("\nImport complete:")
    for k, v in stats.items():
        if v:
            print(f"  {k:20s} {v:>6,}")
