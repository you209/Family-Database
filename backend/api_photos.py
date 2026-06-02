"""
FamilyRoot — api_photos.py

Flask Blueprint: /api/photos/*

Routes:
  GET  /api/photos/                    list all photos (paginated, filterable)
  GET  /api/photos/<id>                single photo + faces + people
  POST /api/photos/<id>/meta           update date, place, description
  GET  /api/photos/by-person/<pid>     all photos containing a person
  GET  /api/photos/by-year/<year>      photos from a given year
  GET  /api/photos/untagged            photos with no date or no tagged faces

  GET  /api/faces/clusters             list unassigned face clusters
  POST /api/faces/clusters/<cid>/assign  { person_id } — name a cluster
  GET  /api/faces/person/<pid>         face cluster info for a person

  POST /api/photos/ingest              { folder_path } — kick off ingestion
  GET  /api/photos/ingest/status       SSE stream of ingestion progress
  POST /api/photos/recluster           re-run DBSCAN on all embeddings

  GET  /thumbnails/<path>              serve thumbnail files
  GET  /originals/<path>               serve original photo files
"""

import os
import json
from pathlib import Path
from flask import Blueprint, jsonify, request, abort, send_from_directory, Response
import sqlite3

from database import get_db, DB_PATH, rows_to_list, row_to_dict

photos_bp = Blueprint("photos", __name__)

MEDIA_ROOT = Path(os.environ.get("FAMILYROOT_MEDIA", "media"))


# ── helpers ───────────────────────────────────────────────────────────────────

def _db():
    return str(DB_PATH)


def _photo_with_faces(conn, media_id: int) -> dict:
    """Return a photo row augmented with its detected faces + person info."""
    photo = row_to_dict(conn.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone())
    if not photo:
        return None

    faces = rows_to_list(conn.execute("""
        SELECT fd.id, fd.bbox_json, fd.det_score, fd.cluster_id,
               fd.person_id, fd.confirmed,
               p.name_given, p.name_surname
        FROM face_detections fd
        LEFT JOIN persons p ON p.id = fd.person_id
        WHERE fd.media_id = ?
        ORDER BY fd.det_score DESC
    """, (media_id,)).fetchall())

    for f in faces:
        if f["bbox_json"]:
            f["bbox"] = json.loads(f["bbox_json"])
            del f["bbox_json"]

    photo["faces"] = faces
    photo["face_count"] = len(faces)
    photo["people"] = list({
        f["person_id"]: {
            "id": f["person_id"],
            "name": f"{f['name_given'] or ''} {f['name_surname'] or ''}".strip(),
            "confidence": f["det_score"],
        }
        for f in faces if f["person_id"]
    }.values())

    if photo.get("exif_json"):
        try:
            photo["exif"] = json.loads(photo["exif_json"])
        except Exception:
            photo["exif"] = {}
        del photo["exif_json"]

    photo["thumb_url"] = f"/thumbnails/{photo['path']}" if photo.get("path") else None
    photo["original_url"] = f"/originals/{photo['path']}" if photo.get("path") else None

    return photo


# ── photo list & detail ───────────────────────────────────────────────────────

@photos_bp.route("/api/photos/")
def list_photos():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 60))
    year = request.args.get("year")
    person_id = request.args.get("person_id")
    untagged = request.args.get("untagged")
    sort = request.args.get("sort", "date_asc")

    offset = (page - 1) * per_page

    where_clauses = []
    params = []

    if year:
        where_clauses.append("m.date_year = ?")
        params.append(int(year))

    if untagged == "date":
        where_clauses.append("m.date_year IS NULL")
    elif untagged == "faces":
        where_clauses.append("""
            NOT EXISTS (
                SELECT 1 FROM face_detections fd WHERE fd.media_id = m.id AND fd.person_id IS NOT NULL
            )
        """)

    if person_id:
        where_clauses.append("""
            EXISTS (
                SELECT 1 FROM face_detections fd
                WHERE fd.media_id = m.id AND fd.person_id = ?
            )
        """)
        params.append(int(person_id))

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    order_map = {
        "date_asc": "m.date_year ASC, m.date_month ASC, m.filename ASC",
        "date_desc": "m.date_year DESC, m.date_month DESC, m.filename DESC",
        "name_asc": "m.filename ASC",
        "ingested": "m.created_at DESC",
    }
    order_sql = order_map.get(sort, order_map["date_asc"])

    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM media m {where_sql}", params).fetchone()[0]
        rows = rows_to_list(conn.execute(f"""
            SELECT m.id, m.filename, m.path, m.date_text, m.date_year, m.date_month,
                   m.description, m.width, m.height, m.privacy,
                   (SELECT COUNT(*) FROM face_detections fd WHERE fd.media_id = m.id) AS face_count,
                   (SELECT COUNT(*) FROM face_detections fd
                    WHERE fd.media_id = m.id AND fd.person_id IS NOT NULL) AS tagged_faces
            FROM media m
            {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall())

    for r in rows:
        r["thumb_url"] = f"/thumbnails/{r['path']}" if r.get("path") else None

    return jsonify({
        "photos": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@photos_bp.route("/api/photos/<int:media_id>")
def get_photo(media_id):
    with get_db() as conn:
        photo = _photo_with_faces(conn, media_id)
    if not photo:
        abort(404)
    return jsonify(photo)


@photos_bp.route("/api/photos/<int:media_id>/meta", methods=["POST"])
def update_photo_meta(media_id):
    data = request.get_json()
    allowed = {"date_text", "date_year", "date_month", "date_day",
               "description", "place_id", "privacy"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({"error": "No valid fields"}), 400

    set_sql = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [media_id]

    with get_db() as conn:
        conn.execute(
            f"UPDATE media SET {set_sql}, updated_at = datetime('now') WHERE id = ?",
            values
        )
    return jsonify({"ok": True})


@photos_bp.route("/api/photos/by-person/<int:person_id>")
def photos_by_person(person_id):
    with get_db() as conn:
        rows = rows_to_list(conn.execute("""
            SELECT DISTINCT m.id, m.filename, m.path, m.date_text, m.date_year,
                   m.description,
                   fd.det_score AS confidence, fd.bbox_json
            FROM media m
            JOIN face_detections fd ON fd.media_id = m.id
            WHERE fd.person_id = ?
            ORDER BY m.date_year ASC, m.filename ASC
        """, (person_id,)).fetchall())

    for r in rows:
        r["thumb_url"] = f"/thumbnails/{r['path']}" if r.get("path") else None

    return jsonify(rows)


@photos_bp.route("/api/photos/stats")
def photo_stats():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM media").fetchone()[0]
        with_date = conn.execute("SELECT COUNT(*) FROM media WHERE date_year IS NOT NULL").fetchone()[0]
        with_faces = conn.execute(
            "SELECT COUNT(DISTINCT media_id) FROM face_detections"
        ).fetchone()[0]
        tagged = conn.execute(
            "SELECT COUNT(DISTINCT media_id) FROM face_detections WHERE person_id IS NOT NULL"
        ).fetchone()[0]
        year_range = conn.execute(
            "SELECT MIN(date_year), MAX(date_year) FROM media WHERE date_year IS NOT NULL"
        ).fetchone()

    return jsonify({
        "total_photos": total,
        "with_date": with_date,
        "without_date": total - with_date,
        "with_faces_detected": with_faces,
        "with_faces_tagged": tagged,
        "earliest_year": year_range[0],
        "latest_year": year_range[1],
    })


# ── face cluster routes ───────────────────────────────────────────────────────

@photos_bp.route("/api/faces/clusters")
def face_clusters():
    from photo_engine import get_unassigned_clusters
    clusters = get_unassigned_clusters(DB_PATH)
    for c in clusters:
        if c.get("sample_bbox"):
            c["sample_bbox"] = json.loads(c["sample_bbox"])
        # Attach sample thumbnail
        with get_db() as conn:
            m = row_to_dict(conn.execute(
                "SELECT path FROM media WHERE id=?", (c["sample_media_id"],)
            ).fetchone())
        if m:
            c["sample_thumb_url"] = f"/thumbnails/{m['path']}"
    return jsonify(clusters)


@photos_bp.route("/api/faces/clusters/<int:cluster_id>/assign", methods=["POST"])
def assign_face_cluster(cluster_id):
    data = request.get_json()
    person_id = data.get("person_id")
    if not person_id:
        return jsonify({"error": "person_id required"}), 400

    from photo_engine import assign_cluster_to_person
    updated = assign_cluster_to_person(DB_PATH, cluster_id, person_id)
    return jsonify({"ok": True, "faces_updated": updated})


@photos_bp.route("/api/faces/person/<int:person_id>")
def person_faces(person_id):
    with get_db() as conn:
        person = row_to_dict(conn.execute(
            "SELECT id, name_given, name_surname FROM persons WHERE id=?", (person_id,)
        ).fetchone())
        if not person:
            abort(404)
        clusters = rows_to_list(conn.execute("""
            SELECT fd.cluster_id, COUNT(*) AS face_count,
                   COUNT(DISTINCT fd.media_id) AS photo_count,
                   AVG(fd.det_score) AS avg_confidence
            FROM face_detections fd
            WHERE fd.person_id = ?
            GROUP BY fd.cluster_id
        """, (person_id,)).fetchall())

    return jsonify({"person": person, "clusters": clusters})


# ── ingestion ─────────────────────────────────────────────────────────────────

_ingest_status = {"running": False, "current": 0, "total": 0, "filename": "", "stats": {}}


@photos_bp.route("/api/photos/ingest", methods=["POST"])
def start_ingest():
    if _ingest_status["running"]:
        return jsonify({"error": "Ingestion already running"}), 409

    data = request.get_json()
    folder = data.get("folder_path")
    if not folder or not Path(folder).is_dir():
        return jsonify({"error": "Invalid folder path"}), 400

    run_faces = data.get("run_faces", True)

    import threading
    from photo_engine import ingest_folder, cluster_faces

    def _run():
        _ingest_status["running"] = True
        _ingest_status["stats"] = {}

        def cb(cur, tot, name):
            _ingest_status["current"] = cur
            _ingest_status["total"] = tot
            _ingest_status["filename"] = name

        try:
            stats = ingest_folder(
                Path(folder), DB_PATH, MEDIA_ROOT,
                run_faces=run_faces, progress_cb=cb
            )
            _ingest_status["stats"] = stats
            if run_faces:
                _ingest_status["filename"] = "Clustering faces…"
                clusters = cluster_faces(DB_PATH)
                _ingest_status["stats"]["clusters_found"] = len(clusters)
        finally:
            _ingest_status["running"] = False
            _ingest_status["filename"] = "Complete"

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True, "message": "Ingestion started"})


@photos_bp.route("/api/photos/ingest/status")
def ingest_status():
    """Server-sent events stream of ingestion progress."""
    def generate():
        import time
        while _ingest_status["running"]:
            data = json.dumps({
                "current": _ingest_status["current"],
                "total": _ingest_status["total"],
                "filename": _ingest_status["filename"],
                "pct": round(_ingest_status["current"] / max(_ingest_status["total"], 1) * 100),
            })
            yield f"data: {data}\n\n"
            time.sleep(0.5)
        final = json.dumps({"done": True, "stats": _ingest_status["stats"]})
        yield f"data: {final}\n\n"

    return Response(generate(), mimetype="text/event-stream")


@photos_bp.route("/api/photos/recluster", methods=["POST"])
def recluster():
    from photo_engine import cluster_faces
    clusters = cluster_faces(DB_PATH)
    return jsonify({"ok": True, "clusters_found": len(clusters)})


# ── static file serving ───────────────────────────────────────────────────────

@photos_bp.route("/thumbnails/<path:filename>")
def serve_thumbnail(filename):
    return send_from_directory(MEDIA_ROOT / "thumbnails", filename)


@photos_bp.route("/originals/<path:filename>")
def serve_original(filename):
    return send_from_directory(MEDIA_ROOT / "originals", filename)
