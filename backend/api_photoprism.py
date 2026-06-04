import json
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime

from flask import Blueprint, jsonify, request, Response, abort

from database import get_db, rows_to_list, row_to_dict

photoprism_bp = Blueprint("photoprism", __name__)

_sync_thread = None
_sync_lock = threading.Lock()
_sync_events = []
_sync_running = False


# ── internal helpers ──────────────────────────────────────────────────────────

def _meta_get(conn, key: str, default=None):
    row = conn.execute("SELECT value FROM db_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _meta_set(conn, key: str, value: str):
    conn.execute(
        "INSERT INTO db_meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def _pp_get(path: str):
    with get_db() as conn:
        url = _meta_get(conn, "photoprism_url")
        token = _meta_get(conn, "photoprism_token")
    if not url or not token:
        abort(503, "PhotoPrism not connected")
    full_url = url.rstrip("/") + path
    req = urllib.request.Request(full_url, headers={"X-Session-ID": token})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read(), dict(resp.headers)


def _pp_get_with_creds(base_url: str, token: str, path: str):
    full_url = base_url.rstrip("/") + path
    req = urllib.request.Request(full_url, headers={"X-Session-ID": token})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read(), dict(resp.headers)


def _ensure_photoprism_subjects_table(conn):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS photoprism_subjects (
            subject_uid  TEXT PRIMARY KEY,
            person_id    INTEGER REFERENCES persons(id),
            subject_name TEXT,
            synced_at    TEXT
        )"""
    )


def _push_event(event_type: str, data: dict):
    global _sync_events
    _sync_events.append({"type": event_type, "data": data})


# ── routes ────────────────────────────────────────────────────────────────────

@photoprism_bp.route("/api/photoprism/connect", methods=["POST"])
def photoprism_connect():
    body = request.get_json(force=True) or {}
    pp_url = (body.get("url") or "").rstrip("/")
    username = body.get("username") or ""
    password = body.get("password") or ""

    if not pp_url or not username:
        abort(400, "url and username are required")

    session_payload = json.dumps({"username": username, "password": password}).encode()
    session_req = urllib.request.Request(
        f"{pp_url}/api/v1/session",
        data=session_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(session_req, timeout=15) as resp:
            session_data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return jsonify({"ok": False, "error": f"Auth failed: {e.code}"}), 401
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502

    token = session_data.get("id") or ""
    preview_token = (session_data.get("config") or {}).get("previewToken") or ""

    if not token:
        return jsonify({"ok": False, "error": "No session token in response"}), 502

    with get_db() as conn:
        _meta_set(conn, "photoprism_url", pp_url)
        _meta_set(conn, "photoprism_token", token)
        _meta_set(conn, "photoprism_preview_token", preview_token)

    subject_count = 0
    photo_count = 0
    try:
        _, subj_headers = _pp_get_with_creds(pp_url, token, "/api/v1/subjects?count=1")
        subject_count = int(subj_headers.get("X-Total-Count", 0))
    except Exception:
        pass
    try:
        _, photo_headers = _pp_get_with_creds(pp_url, token, "/api/v1/photos?count=1")
        photo_count = int(photo_headers.get("X-Total-Count", 0))
    except Exception:
        pass

    return jsonify({
        "ok": True,
        "status": "connected",
        "subject_count": subject_count,
        "photo_count": photo_count,
    })


@photoprism_bp.route("/api/photoprism/status", methods=["GET"])
def photoprism_status():
    with get_db() as conn:
        pp_url = _meta_get(conn, "photoprism_url")
        token = _meta_get(conn, "photoprism_token")

    if not pp_url or not token:
        return jsonify({"connected": False})

    subject_count = 0
    photo_count = 0
    try:
        _, subj_headers = _pp_get_with_creds(pp_url, token, "/api/v1/subjects?count=1")
        subject_count = int(subj_headers.get("X-Total-Count", 0))
        _, photo_headers = _pp_get_with_creds(pp_url, token, "/api/v1/photos?count=1")
        photo_count = int(photo_headers.get("X-Total-Count", 0))
        connected = True
    except Exception:
        connected = False

    return jsonify({
        "connected": connected,
        "url": pp_url,
        "subject_count": subject_count,
        "photo_count": photo_count,
    })


@photoprism_bp.route("/api/photoprism/subjects", methods=["GET"])
def photoprism_subjects():
    with get_db() as conn:
        pp_url = _meta_get(conn, "photoprism_url")
        token = _meta_get(conn, "photoprism_token")
        preview_token = _meta_get(conn, "photoprism_preview_token", "")

        if not pp_url or not token:
            abort(503, "PhotoPrism not connected")

        _ensure_photoprism_subjects_table(conn)
        mappings = {
            row["subject_uid"]: row["person_id"]
            for row in rows_to_list(conn.execute(
                "SELECT subject_uid, person_id FROM photoprism_subjects"
            ).fetchall())
        }

    try:
        raw, _ = _pp_get_with_creds(pp_url, token, "/api/v1/subjects?count=500&files=true")
        subjects_raw = json.loads(raw) or []
    except Exception as e:
        abort(502, f"PhotoPrism error: {e}")

    subjects = []
    for s in subjects_raw:
        uid = s.get("UID") or s.get("uid") or ""
        thumb = s.get("Thumb") or s.get("thumb") or ""
        thumb_url = (
            f"{pp_url}/api/v1/t/{thumb}/{preview_token}/tile_224"
            if thumb and preview_token
            else ""
        )
        subjects.append({
            "uid": uid,
            "name": s.get("Name") or s.get("name") or "",
            "thumb_url": thumb_url,
            "photo_count": s.get("PhotoCount") or s.get("photo_count") or 0,
            "file_count": s.get("FileCount") or s.get("file_count") or 0,
            "person_id": mappings.get(uid),
        })

    return jsonify({"subjects": subjects})


@photoprism_bp.route("/api/photoprism/albums", methods=["GET"])
def photoprism_albums():
    with get_db() as conn:
        pp_url = _meta_get(conn, "photoprism_url")
        token = _meta_get(conn, "photoprism_token")
        preview_token = _meta_get(conn, "photoprism_preview_token", "")

    if not pp_url or not token:
        abort(503, "PhotoPrism not connected")

    try:
        raw, _ = _pp_get_with_creds(pp_url, token, "/api/v1/albums?count=200&type=album")
        albums_raw = json.loads(raw) or []
    except Exception as e:
        abort(502, f"PhotoPrism error: {e}")

    albums = []
    for a in albums_raw:
        thumb = a.get("Thumb") or a.get("thumb") or ""
        thumb_url = (
            f"{pp_url}/api/v1/t/{thumb}/{preview_token}/tile_224"
            if thumb and preview_token
            else ""
        )
        albums.append({
            "uid": a.get("UID") or a.get("uid") or "",
            "title": a.get("Title") or a.get("title") or "",
            "photo_count": a.get("PhotoCount") or a.get("photo_count") or 0,
            "thumb_url": thumb_url,
        })

    return jsonify({"albums": albums})


@photoprism_bp.route("/api/photoprism/map", methods=["POST"])
def photoprism_map():
    body = request.get_json(force=True) or {}
    subject_uid = body.get("subject_uid") or ""
    person_id = body.get("person_id")

    if not subject_uid:
        abort(400, "subject_uid is required")

    with get_db() as conn:
        _ensure_photoprism_subjects_table(conn)
        name_row = conn.execute(
            "SELECT subject_name FROM photoprism_subjects WHERE subject_uid=?",
            (subject_uid,),
        ).fetchone()
        subject_name = name_row[0] if name_row else None

        conn.execute(
            """INSERT INTO photoprism_subjects(subject_uid, person_id, subject_name)
               VALUES(?,?,?)
               ON CONFLICT(subject_uid) DO UPDATE SET
                   person_id=excluded.person_id""",
            (subject_uid, person_id, subject_name),
        )

    return jsonify({"ok": True})


@photoprism_bp.route("/api/photoprism/sync", methods=["POST"])
def photoprism_sync():
    global _sync_thread, _sync_running, _sync_events

    body = request.get_json(force=True) or {}
    subject_uids = body.get("subject_uids") or []

    with _sync_lock:
        if _sync_running:
            return jsonify({"ok": False, "error": "Sync already running"}), 409
        _sync_events = []
        _sync_running = True
        _sync_thread = threading.Thread(
            target=_run_sync, args=(subject_uids,), daemon=True
        )
        _sync_thread.start()

    return jsonify({"ok": True})


@photoprism_bp.route("/api/photoprism/sync/status", methods=["GET"])
def photoprism_sync_status():
    def generate():
        cursor = 0
        while True:
            events = _sync_events[cursor:]
            for ev in events:
                data = json.dumps({"type": ev["type"], **ev["data"]})
                yield f"data: {data}\n\n"
                cursor += 1
            if not _sync_running and cursor >= len(_sync_events):
                break
            time.sleep(0.3)

    return Response(generate(), mimetype="text/event-stream")


# ── background sync ───────────────────────────────────────────────────────────

def _run_sync(subject_uids: list):
    global _sync_running
    subjects_synced = 0
    photos_synced = 0
    errors = 0

    try:
        with get_db() as conn:
            pp_url = _meta_get(conn, "photoprism_url")
            token = _meta_get(conn, "photoprism_token")
            _ensure_photoprism_subjects_table(conn)

            if subject_uids:
                rows = rows_to_list(conn.execute(
                    f"SELECT subject_uid, person_id FROM photoprism_subjects WHERE subject_uid IN ({','.join('?'*len(subject_uids))})",
                    subject_uids,
                ).fetchall())
            else:
                rows = rows_to_list(conn.execute(
                    "SELECT subject_uid, person_id FROM photoprism_subjects WHERE person_id IS NOT NULL"
                ).fetchall())

        for mapping in rows:
            subject_uid = mapping["subject_uid"]
            person_id = mapping["person_id"]

            _push_event("progress", {
                "message": f"Syncing subject {subject_uid}",
                "subject_uid": subject_uid,
            })

            try:
                raw, _ = _pp_get_with_creds(
                    pp_url, token,
                    f"/api/v1/photos?subject={subject_uid}&count=500&merged=true",
                )
                photos = json.loads(raw) or []
            except Exception as e:
                _push_event("error", {"message": f"Failed to fetch photos for {subject_uid}: {e}"})
                errors += 1
                continue

            subject_photos = 0
            for photo in photos:
                try:
                    taken_at = photo.get("TakenAt") or ""
                    date_text = taken_at[:10] if taken_at else None
                    date_year = None
                    if taken_at and len(taken_at) >= 4:
                        try:
                            date_year = int(taken_at[:4])
                        except ValueError:
                            pass

                    exif = json.dumps({
                        "lat": photo.get("Lat"),
                        "lng": photo.get("Lng"),
                        "camera": photo.get("CameraModel") or photo.get("Camera"),
                        "lens": photo.get("LensModel") or photo.get("Lens"),
                        "iso": photo.get("ISO"),
                        "exposure": photo.get("Exposure"),
                    })

                    photo_uid = photo.get("PhotoUID") or photo.get("UID") or ""

                    with get_db() as conn:
                        existing = conn.execute(
                            "SELECT id FROM media WHERE path=?",
                            (f"photoprism:{photo_uid}",),
                        ).fetchone()

                        if existing:
                            media_id = existing[0]
                            conn.execute(
                                """UPDATE media SET
                                    filename=?, mime=?, description=?,
                                    date_text=?, date_year=?,
                                    checksum=?, width=?, height=?, exif_json=?
                                   WHERE id=?""",
                                (
                                    photo.get("Name") or photo.get("FileName") or "",
                                    "image/jpeg",
                                    photo.get("Title") or photo.get("PhotoTitle") or "",
                                    date_text,
                                    date_year,
                                    photo.get("Hash") or photo.get("FileHash") or "",
                                    photo.get("Width") or photo.get("PhotoWidth") or 0,
                                    photo.get("Height") or photo.get("PhotoHeight") or 0,
                                    exif,
                                    media_id,
                                ),
                            )
                        else:
                            cur = conn.execute(
                                """INSERT INTO media
                                    (filename, mime, description, date_text, date_year,
                                     path, checksum, width, height, exif_json)
                                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                                (
                                    photo.get("Name") or photo.get("FileName") or "",
                                    "image/jpeg",
                                    photo.get("Title") or photo.get("PhotoTitle") or "",
                                    date_text,
                                    date_year,
                                    f"photoprism:{photo_uid}",
                                    photo.get("Hash") or photo.get("FileHash") or "",
                                    photo.get("Width") or photo.get("PhotoWidth") or 0,
                                    photo.get("Height") or photo.get("PhotoHeight") or 0,
                                    exif,
                                ),
                            )
                            media_id = cur.lastrowid

                        if person_id and media_id:
                            conn.execute(
                                """INSERT OR IGNORE INTO person_media(person_id, media_id)
                                   VALUES(?,?)""",
                                (person_id, media_id),
                            )

                    subject_photos += 1
                    photos_synced += 1

                except Exception as e:
                    _push_event("error", {"message": f"Error on photo {photo.get('PhotoUID')}: {e}"})
                    errors += 1

            with get_db() as conn:
                conn.execute(
                    "UPDATE photoprism_subjects SET synced_at=? WHERE subject_uid=?",
                    (datetime.utcnow().isoformat(), subject_uid),
                )

            subjects_synced += 1
            _push_event("subject_done", {
                "subject_uid": subject_uid,
                "photos_synced": subject_photos,
            })

    except Exception as e:
        _push_event("error", {"message": f"Sync failed: {e}"})
        errors += 1
    finally:
        _push_event("done", {
            "subjects_synced": subjects_synced,
            "photos_synced": photos_synced,
            "errors": errors,
        })
        with _sync_lock:
            _sync_running = False
