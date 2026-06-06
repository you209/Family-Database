"""
FamilyRoot — api_admin.py

Flask Blueprint: /api/admin/*

Routes:
  GET  /api/admin/tree              folder tree of media/originals
  POST /api/admin/reorganize        move + rename all media into year/event/place folders
  GET  /api/admin/reorganize/status SSE stream of reorganize progress
  POST /api/admin/ingest            { folder_path, run_faces } — ingest from any path
  GET  /api/admin/ingest/status     SSE stream (delegates to photo_engine)

Folder structure produced by reorganize:
  media/
    originals/
      1935/
        Marriage - John and Mary Smith/
          1935-06-12-001.jpg
        London/
          1935-00-00-001.jpg
        unsorted/
          1935-00-00-001.jpg
      undated/
        unsorted/
          0000-00-00-001.jpg
    thumbnails/   (mirrors originals tree)

File naming: YYYY-MM-DD-NNN.ext
  NNN = 3-digit sequence within the folder, zero-padded
"""

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time as _time
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

from flask import Blueprint, Response, jsonify, request, send_file
from database import get_db, rows_to_list, row_to_dict

admin_bp = Blueprint("admin", __name__)

MEDIA_ROOT = Path(os.environ.get("FAMILYROOT_MEDIA", "media"))
ORIGINALS  = MEDIA_ROOT / "originals"
THUMBS     = MEDIA_ROOT / "thumbnails"

# ── shared SSE state ──────────────────────────────────────────────────────────

_reorg_status  = {"running": False, "log": [], "done": False, "stats": {}}
_ingest_status = {"running": False, "current": 0, "total": 0, "filename": "", "stats": {}}


# ── helpers ───────────────────────────────────────────────────────────────────

def _safe_name(s: str) -> str:
    """Strip filesystem-unsafe characters; collapse whitespace."""
    s = re.sub(r'[\\/:*?"<>|]', "", s or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s[:80] or "unnamed"


def _date_prefix(year, month, day) -> str:
    y = str(year).zfill(4) if year else "0000"
    m = str(month).zfill(2) if month else "00"
    d = str(day).zfill(2) if day else "00"
    return f"{y}-{m}-{d}"


def _target_subfolder(media_id: int, conn) -> tuple[str, str]:
    """
    Return (year_bucket, event_or_place_subfolder) for a media row.
    Priority: event linked directly to media → person's primary event
              → media.place_id → 'unsorted'
    """
    row = row_to_dict(
        conn.execute(
            "SELECT date_year, date_month, date_day, place_id FROM media WHERE id=?",
            (media_id,)
        ).fetchone()
    )
    if not row:
        return ("undated", "unsorted")

    year  = row.get("date_year")
    year_bucket = str(year) if year else "undated"

    # 1. Event directly linked to this media object
    ev = row_to_dict(conn.execute("""
        SELECT e.event_type, e.description, pl.name AS place_name
        FROM event_media em
        JOIN events e  ON e.id  = em.event_id
        LEFT JOIN places pl ON pl.id = e.place_id
        WHERE em.media_id = ?
        ORDER BY e.date_sort ASC NULLS LAST
        LIMIT 1
    """, (media_id,)).fetchone())

    if ev:
        parts = [ev["event_type"]]
        if ev["description"]:
            parts.append(ev["description"])
        elif ev["place_name"]:
            parts.append(ev["place_name"])
        return (year_bucket, _safe_name(" - ".join(parts)))

    # 2. Event linked via a person who appears in this media
    ev2 = row_to_dict(conn.execute("""
        SELECT e.event_type, e.description,
               p.name_given, p.name_surname,
               pl.name AS place_name
        FROM person_media pm
        JOIN person_events pe ON pe.person_id = pm.person_id AND pe.role = 'Primary'
        JOIN events e  ON e.id  = pe.event_id
        LEFT JOIN persons p  ON p.id  = pm.person_id
        LEFT JOIN places pl ON pl.id = e.place_id
        WHERE pm.media_id = ?
        ORDER BY e.date_sort ASC NULLS LAST
        LIMIT 1
    """, (media_id,)).fetchone())

    if ev2:
        name = " ".join(filter(None, [ev2["name_given"], ev2["name_surname"]]))
        parts = [ev2["event_type"]]
        if name:
            parts.append(name)
        elif ev2["place_name"]:
            parts.append(ev2["place_name"])
        return (year_bucket, _safe_name(" - ".join(parts)))

    # 3. Place attached to this media row
    place_id = row.get("place_id")
    if place_id:
        pl = row_to_dict(conn.execute(
            "SELECT name FROM places WHERE id=?", (place_id,)
        ).fetchone())
        if pl and pl.get("name"):
            return (year_bucket, _safe_name(pl["name"]))

    # 4. Fallback
    return (year_bucket, "unsorted")


# ── folder tree ───────────────────────────────────────────────────────────────

def _build_tree(path: Path, rel: Path = None) -> dict:
    if rel is None:
        rel = path
    node = {
        "name":     path.name,
        "path":     str(path.relative_to(rel)),
        "children": [],
        "files":    0,
    }
    try:
        items = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name))
        for item in items:
            if item.is_dir():
                child = _build_tree(item, rel)
                node["children"].append(child)
                node["files"] += child["files"]
            elif item.is_file() and item.suffix.lower() in {
                ".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff",
                ".bmp", ".webp", ".heic", ".heif",
            }:
                node["files"] += 1
    except PermissionError:
        pass
    return node


@admin_bp.route("/api/admin/tree")
def folder_tree():
    if not ORIGINALS.exists():
        return jsonify({"name": "originals", "path": "", "children": [], "files": 0})
    tree = _build_tree(ORIGINALS, ORIGINALS.parent)
    return jsonify(tree)


# ── reorganize ────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/reorganize", methods=["POST"])
def start_reorganize():
    if _reorg_status["running"]:
        return jsonify({"error": "Reorganize already running"}), 409

    dry_run = request.get_json(silent=True, force=True) or {}
    dry_run = bool(dry_run.get("dry_run", False))

    def _run():
        _reorg_status.update({"running": True, "log": [], "done": False, "stats": {}})
        log   = _reorg_status["log"]
        stats = {"moved": 0, "renamed": 0, "skipped": 0, "errors": 0}

        def emit(msg):
            log.append(msg)

        try:
            with get_db() as conn:
                media_rows = rows_to_list(conn.execute(
                    "SELECT id, filename, path, date_year, date_month, date_day FROM media"
                ).fetchall())

            emit(f"Found {len(media_rows)} media items to process…")

            # Track sequence numbers per target folder
            seq_by_folder: dict[str, int] = {}

            for row in media_rows:
                media_id = row["id"]
                old_rel  = row.get("path") or ""
                filename = row["filename"] or ""
                suffix   = Path(filename).suffix.lower() or ".jpg"

                with get_db() as conn:
                    year_bucket, subfolder = _target_subfolder(media_id, conn)

                # Build target folder path
                target_dir_rel = Path(year_bucket) / subfolder
                folder_key     = str(target_dir_rel)

                seq_by_folder.setdefault(folder_key, 0)
                seq_by_folder[folder_key] += 1
                seq = seq_by_folder[folder_key]

                date_prefix = _date_prefix(
                    row.get("date_year"),
                    row.get("date_month"),
                    row.get("date_day"),
                )
                new_filename = f"{date_prefix}-{seq:03d}{suffix}"
                new_rel      = str(target_dir_rel / new_filename)

                # Already in the right place?
                if old_rel == new_rel:
                    stats["skipped"] += 1
                    continue

                old_orig  = ORIGINALS / old_rel
                new_orig  = ORIGINALS / new_rel
                old_thumb = THUMBS    / old_rel
                new_thumb = THUMBS    / new_rel

                if old_rel and not old_orig.exists():
                    emit(f"  MISSING  {old_rel}")
                    stats["errors"] += 1
                    continue

                emit(f"  {'DRY' if dry_run else 'MOVE'}  {old_rel or '(no path)'}  →  {new_rel}")

                if not dry_run:
                    try:
                        new_orig.parent.mkdir(parents=True, exist_ok=True)
                        if old_rel:
                            shutil.move(str(old_orig), str(new_orig))
                        # Move thumbnail if it exists
                        if old_thumb.exists():
                            new_thumb.parent.mkdir(parents=True, exist_ok=True)
                            shutil.move(str(old_thumb), str(new_thumb))
                        # Update DB
                        with get_db() as conn:
                            conn.execute(
                                "UPDATE media SET path=?, filename=?, updated_at=datetime('now') WHERE id=?",
                                (new_rel, new_filename, media_id)
                            )
                        stats["moved"]   += (1 if old_rel else 0)
                        stats["renamed"] += 1
                    except Exception as e:
                        emit(f"    ERROR: {e}")
                        stats["errors"] += 1
                else:
                    stats["renamed"] += 1

            emit("")
            emit(f"Done. Moved: {stats['moved']}  Renamed: {stats['renamed']}  "
                 f"Skipped: {stats['skipped']}  Errors: {stats['errors']}")

        except Exception as e:
            emit(f"Fatal error: {e}")
            stats["errors"] += 1
        finally:
            _reorg_status["running"] = False
            _reorg_status["done"]    = True
            _reorg_status["stats"]   = stats

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True, "dry_run": dry_run})


@admin_bp.route("/api/admin/reorganize/status")
def reorg_status_stream():
    def generate():
        import time
        sent = 0
        while _reorg_status["running"] or sent < len(_reorg_status["log"]):
            lines = _reorg_status["log"]
            while sent < len(lines):
                payload = json.dumps({"message": lines[sent]})
                yield f"data: {payload}\n\n"
                sent += 1
            if not _reorg_status["running"]:
                break
            time.sleep(0.2)
        final = json.dumps({"done": True, "stats": _reorg_status.get("stats", {})})
        yield f"data: {final}\n\n"

    return Response(generate(), mimetype="text/event-stream")


# ── ingest from folder ────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/ingest", methods=["POST"])
def admin_ingest():
    """Kick off photo ingestion from any folder path on the server."""
    if _ingest_status["running"]:
        return jsonify({"error": "Ingestion already running"}), 409

    data = request.get_json(silent=True) or {}
    folder = data.get("folder_path", "").strip()
    if not folder or not Path(folder).is_dir():
        return jsonify({"error": f"Not a directory: {folder!r}"}), 400

    run_faces = bool(data.get("run_faces", True))

    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from photo_engine import ingest_folder, cluster_faces

    def _run():
        _ingest_status.update({"running": True, "current": 0, "total": 0,
                                "filename": "Starting…", "stats": {}})

        def cb(cur, tot, name):
            _ingest_status["current"]  = cur
            _ingest_status["total"]    = tot
            _ingest_status["filename"] = name

        try:
            from database import DB_PATH
            stats = ingest_folder(Path(folder), DB_PATH, MEDIA_ROOT,
                                  run_faces=run_faces, progress_cb=cb)
            _ingest_status["stats"] = stats
            if run_faces:
                _ingest_status["filename"] = "Clustering faces…"
                clusters = cluster_faces(DB_PATH)
                _ingest_status["stats"]["clusters_found"] = len(clusters)
        finally:
            _ingest_status["running"]  = False
            _ingest_status["filename"] = "Complete"

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/ingest/status")
def admin_ingest_status():
    def generate():
        import time
        while _ingest_status["running"]:
            payload = json.dumps({
                "current":  _ingest_status["current"],
                "total":    _ingest_status["total"],
                "filename": _ingest_status["filename"],
                "pct": round(
                    _ingest_status["current"] / max(_ingest_status["total"], 1) * 100
                ),
            })
            yield f"data: {payload}\n\n"
            time.sleep(0.5)
        final = json.dumps({"done": True, "stats": _ingest_status["stats"]})
        yield f"data: {final}\n\n"

    return Response(generate(), mimetype="text/event-stream")


# ── backup & restore ──────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/backup")
def admin_backup():
    from database import DB_PATH

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add database
        db_path = Path(DB_PATH)
        if db_path.exists():
            zf.write(db_path, "familyroot.db")

        # Add media files
        media_root = MEDIA_ROOT
        if media_root.exists():
            for f in media_root.rglob("*"):
                if f.is_file():
                    zf.write(f, str(f.relative_to(media_root.parent)))

    buf.seek(0)
    filename = f"familyroot-backup-{date.today().isoformat()}.zip"
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=filename,
    )


@admin_bp.route("/api/admin/restore", methods=["POST"])
def admin_restore():
    from database import DB_PATH

    if _ingest_status.get("running"):
        return jsonify({"error": "Ingestion is currently running; stop it before restoring"}), 409

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded (field name: 'file')"}), 400

    uploaded = request.files["file"]

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name
        uploaded.save(tmp_path)

    try:
        with zipfile.ZipFile(tmp_path, "r") as zf:
            names = zf.namelist()
            if "familyroot.db" not in names:
                return jsonify({"error": "Invalid backup: zip does not contain familyroot.db"}), 400

            # Restore database
            db_path = Path(DB_PATH)
            db_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open("familyroot.db") as src, open(db_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

            # Restore media files
            media_count = 0
            media_parent = MEDIA_ROOT.parent
            for name in names:
                if name == "familyroot.db":
                    continue
                dest = media_parent / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(name) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                media_count += 1

    finally:
        os.unlink(tmp_path)

    return jsonify({"ok": True, "restored": {"db": True, "media_files": media_count}})


# ── auto-update ───────────────────────────────────────────────────────────────

_REPO_ROOT = Path(__file__).parent.parent
_VERSION_FILE = _REPO_ROOT / "VERSION"
_GITHUB_RELEASES_URL = "https://api.github.com/repos/you209/Family-Database/releases/latest"

_version_cache = {"ts": 0, "data": None}
_update_log: list[str] = []
_update_running = False
_update_done = False


def _read_current_version() -> str:
    try:
        return _VERSION_FILE.read_text().strip()
    except Exception:
        return "0.1.0"


def _fetch_latest_release() -> dict:
    now = _time.time()
    if _version_cache["data"] is not None and (now - _version_cache["ts"]) < 3600:
        return _version_cache["data"]
    try:
        req = urllib.request.Request(
            _GITHUB_RELEASES_URL,
            headers={"User-Agent": "FamilyRoot-AutoUpdate/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        result = {
            "tag_name": data.get("tag_name", ""),
            "html_url": data.get("html_url", ""),
            "body": data.get("body", ""),
        }
        _version_cache["ts"] = now
        _version_cache["data"] = result
        return result
    except Exception:
        return {}


@admin_bp.route("/api/admin/version")
def admin_version():
    current = _read_current_version()
    release = _fetch_latest_release()
    latest_tag = release.get("tag_name", "").lstrip("v") if release else None
    update_available = bool(latest_tag and latest_tag != current)
    return jsonify({
        "current": current,
        "latest": latest_tag or None,
        "update_available": update_available,
        "release_url": release.get("html_url", "https://github.com/you209/Family-Database/releases/latest"),
        "changelog": release.get("body", ""),
    })


@admin_bp.route("/api/admin/update", methods=["POST"])
def admin_update():
    global _update_running, _update_done, _update_log
    if _update_running:
        return jsonify({"error": "Update already running"}), 409

    _update_log = []
    _update_done = False

    def _run():
        global _update_running, _update_done
        _update_running = True
        log = _update_log
        try:
            log.append("Pulling latest code...")
            # Detect current branch
            try:
                branch = subprocess.check_output(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=str(_REPO_ROOT), stderr=subprocess.STDOUT
                ).decode().strip() or "main"
            except Exception:
                branch = "main"

            result = subprocess.run(
                ["git", "pull", "origin", branch],
                cwd=str(_REPO_ROOT),
                capture_output=True, text=True
            )
            if result.returncode != 0:
                log.append(f"Error: {result.stderr.strip() or result.stdout.strip()}")
                log.append("__done__")
                return

            log.append("Installing dependencies...")
            pip_exec = str(Path(sys.executable).parent / "pip")
            req_file = str(_REPO_ROOT / "backend" / "requirements.txt")
            result2 = subprocess.run(
                [pip_exec, "install", "-r", req_file],
                capture_output=True, text=True
            )
            if result2.returncode != 0:
                log.append(f"Error: {result2.stderr.strip() or result2.stdout.strip()}")
                log.append("__done__")
                return

            log.append("Update complete. Restart to apply.")
            log.append("__done__")
        except Exception as e:
            log.append(f"Error: {e}")
            log.append("__done__")
        finally:
            _update_running = False
            _update_done = True

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/update/status")
def admin_update_status():
    def generate():
        sent = 0
        while True:
            while sent < len(_update_log):
                line = _update_log[sent]
                sent += 1
                if line == "__done__":
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                yield f"data: {json.dumps({'message': line})}\n\n"
            if _update_done and sent >= len(_update_log):
                yield f"data: {json.dumps({'done': True})}\n\n"
                return
            _time.sleep(0.2)

    return Response(generate(), mimetype="text/event-stream")
