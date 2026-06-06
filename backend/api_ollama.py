"""
FamilyRoot — api_ollama.py
Ollama local AI integration.
"""

import json
import base64
import urllib.request
import urllib.error
from pathlib import Path
from flask import Blueprint, jsonify, request
from database import get_db, row_to_dict, rows_to_list

ollama_bp = Blueprint("ollama", __name__)

DEFAULT_URL = "http://localhost:11434"


def _get_ollama_url():
    with get_db() as conn:
        row = conn.execute("SELECT value FROM db_meta WHERE key='ollama_url'").fetchone()
    return (row["value"] if row else None) or DEFAULT_URL


def _ollama_request(url, data=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    if method is None:
        method = "POST" if body else "GET"
    req = urllib.request.Request(url, data=body, method=method)
    if body:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def _fetch_models(base_url):
    try:
        data = _ollama_request(f"{base_url}/api/tags", method="GET")
        return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


@ollama_bp.route("/api/ollama/connect", methods=["POST"])
def ollama_connect():
    body = request.get_json() or {}
    base_url = (body.get("base_url") or DEFAULT_URL).rstrip("/")
    try:
        models = _fetch_models(base_url)
        ok = True
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('ollama_url', ?)",
            (base_url,)
        )
    return jsonify({"ok": ok, "models": models})


@ollama_bp.route("/api/ollama/status")
def ollama_status():
    url = _get_ollama_url()
    try:
        models = _fetch_models(url)
        connected = True
    except Exception:
        models = []
        connected = False
    return jsonify({"connected": connected, "url": url, "models": models})


@ollama_bp.route("/api/ollama/models")
def ollama_models():
    url = _get_ollama_url()
    try:
        data = _ollama_request(f"{url}/api/tags", method="GET")
        models = [
            {
                "name": m.get("name"),
                "size": m.get("size"),
                "modified": m.get("modified_at"),
            }
            for m in data.get("models", [])
        ]
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@ollama_bp.route("/api/ollama/generate", methods=["POST"])
def ollama_generate():
    body = request.get_json() or {}
    model = body.get("model", "llama3")
    prompt = body.get("prompt", "")
    system = body.get("system")
    stream = body.get("stream", False)

    url = _get_ollama_url()
    payload = {"model": model, "prompt": prompt, "stream": stream}
    if system:
        payload["system"] = system

    try:
        result = _ollama_request(f"{url}/api/generate", payload)
        return jsonify({
            "response": result.get("response", ""),
            "model": result.get("model", model),
            "done": result.get("done", True),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


def _build_story_prompt(person):
    name = f"{person.get('name_given','')} {person.get('name_surname','')}".strip()
    parts = [f"Write a warm, narrative life story for {name}."]

    if person.get("birth_year"):
        parts.append(f"Born: {person['birth_year']}.")
    if person.get("death_year"):
        parts.append(f"Died: {person['death_year']}.")
    if person.get("birth_place"):
        parts.append(f"Birth place: {person['birth_place']}.")
    if person.get("gender"):
        g = {"M": "male", "F": "female"}.get(person["gender"], "")
        if g:
            parts.append(f"Gender: {g}.")

    return " ".join(parts) + (
        "\n\nInclude what life might have been like given the era and place. "
        "Keep it factual but evocative. 3-4 paragraphs."
    )


@ollama_bp.route("/api/ollama/story", methods=["POST"])
def ollama_story():
    body = request.get_json() or {}
    person_id = body.get("person_id")
    model = body.get("model", "llama3")

    if not person_id:
        return jsonify({"error": "person_id required"}), 400

    with get_db() as conn:
        person = row_to_dict(
            conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        )
        if not person:
            return jsonify({"error": "Person not found"}), 404

        events = rows_to_list(conn.execute(
            """SELECT e.event_type, e.date_text, e.date_year, e.description,
                      p.name as place_name
               FROM events e
               JOIN person_events pe ON pe.event_id = e.id
               LEFT JOIN places p ON p.id = e.place_id
               WHERE pe.person_id = ?
               ORDER BY e.date_sort""",
            (person_id,)
        ).fetchall())

        families_father = rows_to_list(conn.execute(
            """SELECT f.rel_type, m.name_given||' '||m.name_surname AS spouse_name
               FROM families f
               LEFT JOIN persons m ON m.id = f.mother_id
               WHERE f.father_id = ?""",
            (person_id,)
        ).fetchall())

        families_mother = rows_to_list(conn.execute(
            """SELECT f.rel_type, p.name_given||' '||p.name_surname AS spouse_name
               FROM families f
               LEFT JOIN persons p ON p.id = f.father_id
               WHERE f.mother_id = ?""",
            (person_id,)
        ).fetchall())

        children_count = conn.execute(
            """SELECT COUNT(*) FROM family_children fc
               JOIN families f ON f.id = fc.family_id
               WHERE f.father_id=? OR f.mother_id=?""",
            (person_id, person_id)
        ).fetchone()[0]

    prompt_parts = [_build_story_prompt(person)]

    if events:
        prompt_parts.append("\n\nKey life events:")
        for ev in events:
            line = f"- {ev.get('event_type','Event')}"
            if ev.get("date_text"):
                line += f" ({ev['date_text']})"
            if ev.get("place_name"):
                line += f" in {ev['place_name']}"
            if ev.get("description"):
                line += f": {ev['description']}"
            prompt_parts.append(line)

    families = families_father + families_mother
    if families:
        for f in families:
            if f.get("spouse_name","").strip():
                prompt_parts.append(f"\nMarried/partnered with: {f['spouse_name']} ({f.get('rel_type','')})")

    if children_count:
        prompt_parts.append(f"\nHad {children_count} child(ren).")

    prompt = "\n".join(prompt_parts)
    url = _get_ollama_url()

    try:
        result = _ollama_request(f"{url}/api/generate", {
            "model": model, "prompt": prompt, "stream": False
        })
        return jsonify({
            "story_text": result.get("response", ""),
            "model": result.get("model", model),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@ollama_bp.route("/api/ollama/tag-photo", methods=["POST"])
def ollama_tag_photo():
    body = request.get_json() or {}
    media_id = body.get("media_id")
    model = body.get("model", "llava")

    if not media_id:
        return jsonify({"error": "media_id required"}), 400

    with get_db() as conn:
        media = row_to_dict(
            conn.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone()
        )

    if not media:
        return jsonify({"error": "Media not found"}), 404

    media_path = media.get("path", "")
    if not media_path:
        return jsonify({"error": "No file path for this media"}), 400

    from pathlib import Path as _Path
    base = _Path(__file__).parent / "data" / "media"
    full_path = base / media_path if not _Path(media_path).is_absolute() else _Path(media_path)

    if not full_path.exists():
        return jsonify({"error": f"File not found: {full_path}"}), 404

    image_b64 = base64.b64encode(full_path.read_bytes()).decode()

    prompt = (
        "Describe this family photo in 1-2 sentences. "
        "Then list 5-8 short tags (comma-separated) describing what you see: "
        "people, clothing era, setting, mood, etc. "
        "Format: CAPTION: <caption>\nTAGS: <tag1>, <tag2>, ..."
    )

    url = _get_ollama_url()
    try:
        result = _ollama_request(f"{url}/api/generate", {
            "model": model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
        })
        text = result.get("response", "")
        caption, tags = "", []
        for line in text.splitlines():
            if line.upper().startswith("CAPTION:"):
                caption = line.split(":", 1)[1].strip()
            elif line.upper().startswith("TAGS:"):
                tags = [t.strip() for t in line.split(":", 1)[1].split(",") if t.strip()]
        if not caption:
            caption = text.strip()
        return jsonify({"caption": caption, "tags": tags, "model": result.get("model", model)})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@ollama_bp.route("/api/ollama/suggest-relations", methods=["POST"])
def ollama_suggest_relations():
    body = request.get_json() or {}
    person_id = body.get("person_id")
    model = body.get("model", "llama3")

    if not person_id:
        return jsonify({"error": "person_id required"}), 400

    with get_db() as conn:
        person = row_to_dict(
            conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        )
        if not person:
            return jsonify({"error": "Person not found"}), 404

        families_father = rows_to_list(conn.execute(
            """SELECT f.id, f.rel_type,
                      m.name_given||' '||m.name_surname AS spouse_name,
                      m.birth_year AS spouse_birth, m.death_year AS spouse_death
               FROM families f
               LEFT JOIN persons m ON m.id = f.mother_id
               WHERE f.father_id = ?""",
            (person_id,)
        ).fetchall())

        families_mother = rows_to_list(conn.execute(
            """SELECT f.id, f.rel_type,
                      p.name_given||' '||p.name_surname AS spouse_name,
                      p.birth_year AS spouse_birth, p.death_year AS spouse_death
               FROM families f
               LEFT JOIN persons p ON p.id = f.father_id
               WHERE f.mother_id = ?""",
            (person_id,)
        ).fetchall())

        children = rows_to_list(conn.execute(
            """SELECT ch.name_given||' '||ch.name_surname AS name, ch.birth_year, ch.death_year
               FROM family_children fc
               JOIN families f ON f.id = fc.family_id
               JOIN persons ch ON ch.id = fc.child_id
               WHERE f.father_id=? OR f.mother_id=?""",
            (person_id, person_id)
        ).fetchall())

        parents = rows_to_list(conn.execute(
            """SELECT p.name_given||' '||p.name_surname AS name, p.birth_year,
                      CASE WHEN f.father_id=p.id THEN 'father' ELSE 'mother' END AS role
               FROM family_children fc
               JOIN families f ON f.id = fc.family_id
               JOIN persons p ON (p.id=f.father_id OR p.id=f.mother_id)
               WHERE fc.child_id=?""",
            (person_id,)
        ).fetchall())

        events = rows_to_list(conn.execute(
            """SELECT e.event_type, e.date_year FROM events e
               JOIN person_events pe ON pe.event_id=e.id
               WHERE pe.person_id=?""",
            (person_id,)
        ).fetchall())

    name = f"{person.get('name_given','')} {person.get('name_surname','')}".strip()
    lines = [f"Person: {name}"]
    if person.get("birth_year"):
        lines.append(f"Born: {person['birth_year']}")
    if person.get("death_year"):
        lines.append(f"Died: {person['death_year']}")

    if parents:
        lines.append("Known parents: " + ", ".join(f"{p['name']} ({p['role']})" for p in parents))
    else:
        lines.append("Parents: unknown")

    families = families_father + families_mother
    if families:
        for f in families:
            lines.append(f"Partner: {f.get('spouse_name','')} ({f.get('rel_type','')})")
    else:
        lines.append("No known partners.")

    if children:
        lines.append("Children: " + ", ".join(c["name"] for c in children))
    else:
        lines.append("No known children.")

    if events:
        lines.append("Events: " + ", ".join(f"{e['event_type']} {e.get('date_year','')}" for e in events))

    prompt = "\n".join(lines) + (
        "\n\nBased on the above genealogical data, suggest:\n"
        "1. Possible missing relatives (siblings, grandparents, etc.)\n"
        "2. Potential data gaps or inconsistencies\n"
        "3. Research avenues to explore\n\n"
        "List each suggestion on a new line starting with a dash (-)."
    )

    url = _get_ollama_url()
    try:
        result = _ollama_request(f"{url}/api/generate", {
            "model": model, "prompt": prompt, "stream": False
        })
        text = result.get("response", "")
        suggestions = [
            line.lstrip("- ").strip()
            for line in text.splitlines()
            if line.strip().startswith("-") or (line.strip() and len(line.strip()) > 5)
        ]
        return jsonify({"suggestions": suggestions, "model": result.get("model", model)})
    except Exception as e:
        return jsonify({"error": str(e)}), 502
