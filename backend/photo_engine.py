"""
FamilyRoot — photo_engine.py

Handles everything photo-related:
  - Ingest photos from a folder (EXIF extraction, thumbnail generation)
  - Face detection and 512-d embedding via InsightFace
  - Face clustering (DBSCAN) to group the same person across photos
  - Estimated date inference for undated scans
  - Persists everything to the SQLite DB

All AI runs 100% locally — no internet required after first model download.
"""

import os
import json
import hashlib
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np
from PIL import Image, ExifTags
import exifread

# ── lazy imports (heavy models loaded only when needed) ──────────────────────
_face_app = None
_clip_model = None
_clip_preprocess = None
_clip_device = None


def _get_face_app():
    """Load InsightFace ArcFace model (buffalo_l) once, then cache."""
    global _face_app
    if _face_app is None:
        try:
            import insightface
            from insightface.app import FaceAnalysis
            _face_app = FaceAnalysis(name="buffalo_sc",  # smaller, faster model
                                      providers=["CPUExecutionProvider"])
            _face_app.prepare(ctx_id=-1, det_size=(640, 640))
            print("InsightFace loaded (buffalo_sc, CPU)")
        except Exception as e:
            print(f"InsightFace not available: {e}")
            _face_app = "unavailable"
    return _face_app if _face_app != "unavailable" else None


# ── EXIF helpers ─────────────────────────────────────────────────────────────

EXIF_DATE_FORMATS = [
    "%Y:%m:%d %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y:%m:%d",
]


def extract_exif(path: Path) -> dict:
    """
    Extract EXIF data from a photo.
    Returns a normalised dict with: date, year, month, day, lat, lon,
    camera_make, camera_model, orientation, width, height.
    """
    result = {
        "date_text": None, "date_year": None, "date_month": None,
        "date_day": None, "lat": None, "lon": None,
        "camera_make": None, "camera_model": None,
        "width": None, "height": None, "orientation": 1,
        "exif_raw": {},
    }

    # PIL for dimensions
    try:
        with Image.open(path) as img:
            result["width"], result["height"] = img.size
    except Exception:
        pass

    # exifread for full EXIF
    try:
        with open(path, "rb") as f:
            tags = exifread.process_file(f, stop_tag="GPS GPSLongitude", details=False)

        raw = {str(k): str(v) for k, v in tags.items()}
        result["exif_raw"] = raw

        # Date
        for tag in ("EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"):
            if tag in raw:
                ds = raw[tag].strip()
                for fmt in EXIF_DATE_FORMATS:
                    try:
                        dt = datetime.strptime(ds, fmt)
                        result["date_text"] = dt.strftime("%d %b %Y")
                        result["date_year"] = dt.year
                        result["date_month"] = dt.month
                        result["date_day"] = dt.day
                        break
                    except ValueError:
                        continue
                if result["date_year"]:
                    break

        # GPS
        def _to_decimal(dms_str, ref):
            """Convert EXIF GPS DMS string to decimal degrees."""
            try:
                parts = dms_str.strip("[]").split(", ")
                d = _fraction(parts[0])
                m = _fraction(parts[1]) if len(parts) > 1 else 0
                s = _fraction(parts[2]) if len(parts) > 2 else 0
                dec = d + m / 60 + s / 3600
                if ref in ("S", "W"):
                    dec = -dec
                return round(dec, 6)
            except Exception:
                return None

        def _fraction(s):
            if "/" in s:
                n, d = s.split("/")
                return float(n) / float(d) if float(d) else 0
            return float(s)

        lat_tag = raw.get("GPS GPSLatitude")
        lat_ref = raw.get("GPS GPSLatitudeRef", "N")
        lon_tag = raw.get("GPS GPSLongitude")
        lon_ref = raw.get("GPS GPSLongitudeRef", "E")

        if lat_tag and lon_tag:
            result["lat"] = _to_decimal(lat_tag, lat_ref)
            result["lon"] = _to_decimal(lon_tag, lon_ref)

        # Camera
        result["camera_make"] = raw.get("Image Make")
        result["camera_model"] = raw.get("Image Model")
        orientation_str = raw.get("Image Orientation", "1")
        try:
            result["orientation"] = int(str(orientation_str).split()[0])
        except Exception:
            result["orientation"] = 1

    except Exception as e:
        pass  # Not a fatal error — photo still gets ingested without EXIF

    return result


# ── thumbnail generation ─────────────────────────────────────────────────────

def make_thumbnail(src: Path, dest: Path, size: int = 400) -> bool:
    """Create a square-crop thumbnail, respecting EXIF orientation."""
    ORIENT_MAP = {
        3: Image.ROTATE_180,
        6: Image.ROTATE_270,
        8: Image.ROTATE_90,
    }
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as img:
            # Fix orientation
            exif_data = img._getexif() if hasattr(img, "_getexif") else {}
            if exif_data:
                for tag, val in exif_data.items():
                    if ExifTags.TAGS.get(tag) == "Orientation":
                        if val in ORIENT_MAP:
                            img = img.transpose(ORIENT_MAP[val])
                        break
            # Square crop from centre
            w, h = img.size
            s = min(w, h)
            left = (w - s) // 2
            top = (h - s) // 2
            img = img.crop((left, top, left + s, top + s))
            img = img.resize((size, size), Image.LANCZOS)
            img = img.convert("RGB")
            img.save(dest, "JPEG", quality=85, optimize=True)
        return True
    except Exception as e:
        print(f"Thumbnail failed for {src}: {e}")
        return False


def file_checksum(path: Path) -> str:
    """SHA-256 of the first 64KB (fast, avoids reading huge files fully)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read(65536))
    return h.hexdigest()


# ── face detection ────────────────────────────────────────────────────────────

def detect_faces(image_path: Path) -> list[dict]:
    """
    Run InsightFace on an image.
    Returns list of face dicts:
      { bbox: [x1,y1,x2,y2], embedding: [512 floats], det_score: float }
    Returns [] if model unavailable or no faces found.
    """
    app = _get_face_app()
    if app is None:
        return []
    try:
        import cv2
        img = cv2.imread(str(image_path))
        if img is None:
            return []
        faces = app.get(img)
        result = []
        for face in faces:
            result.append({
                "bbox": [int(x) for x in face.bbox.tolist()],
                "embedding": face.normed_embedding.tolist(),
                "det_score": float(face.det_score),
            })
        return result
    except Exception as e:
        print(f"Face detection failed for {image_path}: {e}")
        return []


# ── face clustering ───────────────────────────────────────────────────────────

def cluster_faces(db_path: Path, min_samples: int = 2, eps: float = 0.45) -> dict:
    """
    Pull all face embeddings from the DB and run DBSCAN clustering.
    Assigns cluster_id to each face_detection row.

    Returns { cluster_id: [face_detection_ids] }
    """
    from sklearn.cluster import DBSCAN

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT id, embedding_json FROM face_detections WHERE embedding_json IS NOT NULL"
    ).fetchall()

    if len(rows) < 2:
        conn.close()
        return {}

    ids = [r["id"] for r in rows]
    embeddings = np.array([json.loads(r["embedding_json"]) for r in rows], dtype=np.float32)

    # Normalise
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / np.maximum(norms, 1e-8)

    # DBSCAN with cosine metric
    db = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine", n_jobs=-1)
    labels = db.fit_predict(embeddings)

    # Persist cluster assignments
    for face_id, label in zip(ids, labels):
        cluster_id = int(label) if label >= 0 else None
        conn.execute(
            "UPDATE face_detections SET cluster_id = ? WHERE id = ?",
            (cluster_id, face_id)
        )
    conn.commit()
    conn.close()

    # Return summary
    clusters: dict[int, list[int]] = {}
    for face_id, label in zip(ids, labels):
        if label >= 0:
            clusters.setdefault(int(label), []).append(face_id)
    return clusters


# ── date estimation for undated scans ────────────────────────────────────────

DECADE_KEYWORDS = {
    # Very rough heuristic; a CLIP model does this much better in practice
    "1900s": ["sepia", "oval portrait", "high collar", "formal pose"],
    "1910s": ["world war one", "uniform", "formal dress"],
    "1920s": ["flapper", "short hair", "soft focus portrait"],
    "1930s": ["great depression", "formal suit", "wave hairstyle"],
    "1940s": ["world war two", "military", "utility dress"],
    "1950s": ["poodle skirt", "rockabilly", "early television"],
    "1960s": ["mod dress", "beehive hair", "polaroid"],
    "1970s": ["flares", "wide collar", "kodacolor"],
    "1980s": ["shoulder pads", "permed hair", "35mm color"],
    "1990s": ["denim", "grunge", "disposable camera"],
}


def estimate_decade_from_filename(filename: str) -> Optional[int]:
    """
    Cheap heuristic: look for a 4-digit year pattern in the filename.
    e.g. "scan_1935_wedding.jpg" → 1935
    """
    import re
    matches = re.findall(r"(?<![0-9])(18\d\d|19\d\d|20[0-2]\d)(?![0-9])", filename)
    if matches:
        return int(matches[0])
    return None


# ── main ingestion pipeline ───────────────────────────────────────────────────

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic"}


def ingest_folder(
    folder: Path,
    db_path: Path,
    media_root: Path,
    run_faces: bool = True,
    progress_cb=None,
) -> dict:
    """
    Walk a folder and ingest all photos into the database.

    - Skips duplicates (by checksum)
    - Extracts EXIF
    - Generates thumbnails
    - Optionally runs face detection

    progress_cb(current, total, filename) for UI progress updates.

    Returns { ingested, skipped, errors }
    """
    photos = [
        p for p in sorted(folder.rglob("*"))
        if p.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    total = len(photos)
    stats = {"ingested": 0, "skipped": 0, "errors": 0}

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")

    # Ensure face_detections table exists
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS face_detections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id        INTEGER NOT NULL,
            bbox_json       TEXT,
            embedding_json  TEXT,
            det_score       REAL,
            cluster_id      INTEGER,
            person_id       INTEGER,
            confirmed       INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_fd_media   ON face_detections(media_id);
        CREATE INDEX IF NOT EXISTS idx_fd_cluster ON face_detections(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_fd_person  ON face_detections(person_id);

        CREATE TABLE IF NOT EXISTS face_clusters (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            label       INTEGER UNIQUE,
            person_id   INTEGER,
            thumbnail_media_id INTEGER,
            face_count  INTEGER DEFAULT 0,
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()

    existing_checksums = set(
        r[0] for r in conn.execute("SELECT checksum FROM media WHERE checksum IS NOT NULL")
    )

    thumb_root = media_root / "thumbnails"

    for i, photo_path in enumerate(photos):
        if progress_cb:
            progress_cb(i + 1, total, photo_path.name)

        try:
            checksum = file_checksum(photo_path)
            if checksum in existing_checksums:
                stats["skipped"] += 1
                continue

            exif = extract_exif(photo_path)

            # Copy original to media root (preserve folder structure)
            rel = photo_path.relative_to(folder)
            dest = media_root / "originals" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                import shutil
                shutil.copy2(photo_path, dest)

            # Thumbnail
            thumb_path = thumb_root / rel.with_suffix(".jpg")
            make_thumbnail(photo_path, thumb_path)

            # DB insert
            inferred_year = exif["date_year"] or estimate_decade_from_filename(photo_path.name)
            cur = conn.execute("""
                INSERT INTO media (
                    filename, mime, path, checksum,
                    date_text, date_year,
                    width, height, exif_json,
                    description
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                photo_path.name,
                "image/jpeg",
                str(rel),
                checksum,
                exif["date_text"],
                inferred_year,
                exif["width"],
                exif["height"],
                json.dumps(exif["exif_raw"]),
                None,
            ))
            media_id = cur.lastrowid

            # GPS → place lookup / insert
            if exif["lat"] and exif["lon"]:
                conn.execute("""
                    UPDATE media SET
                        exif_json = json_patch(exif_json, json_object('lat', ?, 'lon', ?))
                    WHERE id = ?
                """, (exif["lat"], exif["lon"], media_id))

            conn.commit()
            existing_checksums.add(checksum)
            stats["ingested"] += 1

            # Face detection (optional — slow for large sets)
            if run_faces:
                faces = detect_faces(photo_path)
                for face in faces:
                    conn.execute("""
                        INSERT INTO face_detections (media_id, bbox_json, embedding_json, det_score)
                        VALUES (?, ?, ?, ?)
                    """, (
                        media_id,
                        json.dumps(face["bbox"]),
                        json.dumps(face["embedding"]),
                        face["det_score"],
                    ))
                if faces:
                    conn.commit()

        except Exception as e:
            print(f"Error ingesting {photo_path}: {e}")
            stats["errors"] += 1

    conn.close()
    return stats


# ── cluster → person assignment ───────────────────────────────────────────────

def assign_cluster_to_person(db_path: Path, cluster_id: int, person_id: int) -> int:
    """
    Name a face cluster — links all detections in that cluster to a person.
    Returns number of faces updated.
    """
    conn = sqlite3.connect(db_path)
    cur = conn.execute("""
        UPDATE face_detections
        SET person_id = ?, confirmed = 1
        WHERE cluster_id = ?
    """, (person_id, cluster_id))
    conn.execute("""
        INSERT INTO face_clusters (label, person_id, face_count)
        VALUES (?, ?, ?)
        ON CONFLICT(label) DO UPDATE SET person_id = excluded.person_id,
            updated_at = datetime('now')
    """, (cluster_id, person_id,
          conn.execute("SELECT COUNT(*) FROM face_detections WHERE cluster_id=?",
                       (cluster_id,)).fetchone()[0]))
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return updated


def get_photos_for_person(db_path: Path, person_id: int) -> list[dict]:
    """Return all media rows that contain a confirmed face for a given person."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT DISTINCT m.id, m.filename, m.path, m.date_text, m.date_year,
               m.width, m.height, m.description,
               fd.det_score, fd.bbox_json
        FROM media m
        JOIN face_detections fd ON fd.media_id = m.id
        WHERE fd.person_id = ?
        ORDER BY m.date_year ASC, m.filename ASC
    """, (person_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_unassigned_clusters(db_path: Path) -> list[dict]:
    """
    Return face clusters that haven't been assigned to a person yet.
    Includes a representative media_id for the UI to show a sample face.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT fd.cluster_id,
               COUNT(*) AS face_count,
               COUNT(DISTINCT fd.media_id) AS photo_count,
               MIN(fd.media_id) AS sample_media_id,
               MIN(fd.bbox_json) AS sample_bbox
        FROM face_detections fd
        WHERE fd.cluster_id IS NOT NULL
          AND fd.person_id IS NULL
        GROUP BY fd.cluster_id
        ORDER BY face_count DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


if __name__ == "__main__":
    import sys
    from database import init_db, DB_PATH

    db = DB_PATH
    init_db(db)

    if len(sys.argv) < 2:
        print("Usage: python photo_engine.py <photo_folder> [--no-faces]")
        sys.exit(1)

    folder = Path(sys.argv[1])
    run_faces = "--no-faces" not in sys.argv

    def progress(cur, tot, name):
        pct = int(cur / tot * 40)
        bar = "█" * pct + "░" * (40 - pct)
        print(f"\r[{bar}] {cur}/{tot} {name[:40]:<40}", end="", flush=True)

    print(f"Ingesting {folder} into {db} ...")
    media_root = Path("media")
    stats = ingest_folder(folder, db, media_root, run_faces=run_faces, progress_cb=progress)
    print(f"\n\nDone — ingested:{stats['ingested']}  skipped:{stats['skipped']}  errors:{stats['errors']}")

    if run_faces and stats["ingested"] > 0:
        print("Clustering faces...")
        clusters = cluster_faces(db)
        print(f"Found {len(clusters)} face clusters")
        unassigned = get_unassigned_clusters(db)
        print(f"{len(unassigned)} clusters need naming")
