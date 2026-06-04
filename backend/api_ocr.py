"""
FamilyRoot — api_ocr.py

Tesseract OCR + Whisper speech-to-text, plus Nominatim geocoding.

Routes:
  POST /api/ocr/extract          — OCR an uploaded image → text
  POST /api/whisper/transcribe   — Transcribe uploaded audio → text
  GET  /api/places/geocode       — Geocode a place name via Nominatim
  POST /api/places/geocode-all   — Geocode every place in the DB that lacks lat/lng (SSE)
"""

import json
import os
import tempfile
import threading
import time
import urllib.request
import urllib.parse
from pathlib import Path
from flask import Blueprint, jsonify, request, Response

tools_bp = Blueprint("tools", __name__)

# ── OCR ───────────────────────────────────────────────────────────────────────

@tools_bp.route("/api/ocr/extract", methods=["POST"])
def ocr_extract():
    """Upload an image file, get back extracted text."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    suffix = Path(file.filename).suffix.lower() if file.filename else ".jpg"

    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return jsonify({"error": "pytesseract not installed. Run: pip install pytesseract pillow  and  apt install tesseract-ocr"}), 503

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        file.save(tmp.name)
        try:
            img  = Image.open(tmp.name)
            lang = request.form.get("lang", "eng")
            text = pytesseract.image_to_string(img, lang=lang)
            # Also try to extract structured data (dates, names)
            data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
            words = [w for w in data["text"] if w.strip()]
        finally:
            os.unlink(tmp.name)

    return jsonify({"text": text.strip(), "word_count": len(words)})


@tools_bp.route("/api/ocr/languages")
def ocr_languages():
    """List installed Tesseract language packs."""
    try:
        import pytesseract
        langs = pytesseract.get_languages()
        return jsonify({"languages": langs})
    except ImportError:
        return jsonify({"languages": [], "error": "pytesseract not installed"}), 503


# ── Whisper ───────────────────────────────────────────────────────────────────

_whisper_model_cache = {}

def _load_whisper(model_size="base"):
    if model_size not in _whisper_model_cache:
        import whisper
        _whisper_model_cache[model_size] = whisper.load_model(model_size)
    return _whisper_model_cache[model_size]


@tools_bp.route("/api/whisper/transcribe", methods=["POST"])
def whisper_transcribe():
    """Upload audio/video, get back transcript text."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file  = request.files["file"]
    model_size = request.form.get("model", "base")   # tiny/base/small
    lang  = request.form.get("language") or None       # None = auto-detect
    suffix = Path(file.filename).suffix.lower() if file.filename else ".mp3"

    try:
        import whisper
    except ImportError:
        return jsonify({"error": "openai-whisper not installed. Run: pip install openai-whisper"}), 503

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        file.save(tmp.name)
        try:
            model = _load_whisper(model_size)
            result = model.transcribe(tmp.name, language=lang, fp16=False)
        finally:
            os.unlink(tmp.name)

    segments = [
        {"start": round(s["start"], 1), "end": round(s["end"], 1), "text": s["text"].strip()}
        for s in result.get("segments", [])
    ]

    return jsonify({
        "text":     result["text"].strip(),
        "language": result.get("language"),
        "segments": segments,
    })


@tools_bp.route("/api/whisper/models")
def whisper_models():
    return jsonify({
        "models": [
            {"id": "tiny",   "size": "~75 MB",  "note": "Fastest — good for Pi Zero / Pi 3"},
            {"id": "base",   "size": "~145 MB", "note": "Good balance — recommended for Pi 4/5"},
            {"id": "small",  "size": "~465 MB", "note": "Better accuracy — Pi 4 with patience"},
            {"id": "medium", "size": "~1.5 GB", "note": "Best quality — Pi 5 or desktop only"},
        ]
    })


# ── Nominatim geocoding ───────────────────────────────────────────────────────

def _nominatim_geocode(place_name):
    """Call public Nominatim API. Returns (lat, lon) or (None, None)."""
    q = urllib.parse.urlencode({"q": place_name, "format": "json", "limit": 1})
    url = f"https://nominatim.openstreetmap.org/search?{q}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "FamilyRoot/1.0 (family history app)"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode())
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass
    return None, None


@tools_bp.route("/api/places/geocode")
def geocode_place():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "q= required"}), 400
    lat, lon = _nominatim_geocode(q)
    if lat is None:
        return jsonify({"found": False, "query": q})
    return jsonify({"found": True, "query": q, "lat": lat, "lon": lon})


_geocode_status = {"running": False, "events": [], "done": False}

@tools_bp.route("/api/places/geocode-all", methods=["POST"])
def geocode_all():
    global _geocode_status
    if _geocode_status["running"]:
        return jsonify({"error": "Already running"}), 409
    _geocode_status = {"running": True, "events": [], "done": False}
    threading.Thread(target=_run_geocode_all, daemon=True).start()
    return jsonify({"ok": True})


@tools_bp.route("/api/places/geocode-all/status")
def geocode_all_status():
    def generate():
        seen = 0
        while _geocode_status["running"] or seen < len(_geocode_status["events"]):
            batch = _geocode_status["events"][seen:]
            for evt in batch:
                yield f"data: {json.dumps(evt)}\n\n"
            seen += len(batch)
            if not _geocode_status["running"] and seen >= len(_geocode_status["events"]):
                break
            time.sleep(0.3)
        yield f"data: {json.dumps({'done': True})}\n\n"
    return Response(generate(), mimetype="text/event-stream")


def _run_geocode_all():
    from database import get_db
    found = skipped = errors = 0
    try:
        with get_db() as conn:
            places = conn.execute(
                "SELECT id, name FROM places WHERE (latitude IS NULL OR longitude IS NULL) AND name != ''"
            ).fetchall()

        _geocode_status["events"].append({"message": f"Found {len(places)} ungeocoded places"})

        for pl in places:
            time.sleep(1.1)  # Nominatim rate limit: max 1 req/sec
            lat, lon = _nominatim_geocode(pl["name"])
            if lat is not None:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE places SET latitude=?, longitude=? WHERE id=?",
                        (lat, lon, pl["id"])
                    )
                found += 1
                _geocode_status["events"].append({"message": f"✓ {pl['name']} → {lat:.4f}, {lon:.4f}"})
            else:
                skipped += 1
                _geocode_status["events"].append({"message": f"— {pl['name']} not found"})

        _geocode_status["events"].append({"message": f"✓ Done: {found} geocoded, {skipped} not found"})
    except Exception as e:
        _geocode_status["events"].append({"message": f"✗ Error: {e}"})
    finally:
        _geocode_status["running"] = False
        _geocode_status["done"]    = True
