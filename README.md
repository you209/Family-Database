# FamilyRoot

A local-first family history database with Picasa-style photo management, AI face recognition, and Gramps compatibility. Runs entirely on your machine — no cloud, no subscription.

---

## Quick start

```bash
# 1. Clone / unzip this project, then:
cd familyroot

# 2. Install Python dependencies
pip install flask flask-cors pillow numpy scikit-learn exifread \
            insightface onnxruntime faiss-cpu opencv-python-headless

# 3. Start the server
cd backend
python app.py

# 4. Open http://localhost:5050
```

That's it. The database is created automatically at `data/familyroot.db`.

---

## Import your photos

### From a folder (drag & drop in the UI, or CLI):
```bash
python photo_engine.py /path/to/your/photos
```

This will:
- Extract EXIF date, GPS coordinates, camera model
- Guess the decade from the filename if EXIF is missing (e.g. `scan_1935_wedding.jpg`)
- Generate square thumbnails (400px)
- Detect faces using InsightFace ArcFace
- Cluster faces with DBSCAN so the same person is grouped across all photos

### From Gramps:
```
Gramps → Family Trees → Export → Gramps XML (.gramps)
Then: python gramps_import.py yourfile.gramps
```

### From Ancestry.com:
```
Ancestry → Settings → Download your data → Download
Then: python gedcom_import.py yourfile.ged
```

---

## AI face recognition

FamilyRoot uses **InsightFace** (ArcFace, buffalo_sc model) — the same technology used in many commercial apps, running entirely on your computer.

### How it works

1. **Detect** — every face in every photo gets a 512-dimension "fingerprint" (embedding)
2. **Cluster** — DBSCAN groups similar fingerprints together. Each cluster = one person
3. **Name** — you click a cluster and say "this is William Smith". Done.
4. **Propagate** — all photos in that cluster are now tagged with William automatically

### Naming unknown faces

In the UI: **By person → Unknown person clusters → click a cluster → assign to person**

Or via the API:
```bash
curl -X POST http://localhost:5050/api/faces/clusters/3/assign \
     -H "Content-Type: application/json" \
     -d '{"person_id": 7}'
```

### Re-clustering after adding more photos
```bash
curl -X POST http://localhost:5050/api/photos/recluster
```

---

## Editing metadata on old scans

For scanned photos with no EXIF data, you can set metadata in the photo detail panel:

| Field | How to set |
|---|---|
| **Date** | Click edit — enter anything from "1935" to "Abt. 1920s" to "12 Jun 1948" |
| **Place** | Type a place name — it links to the places database |
| **People** | The AI suggests names; you confirm or correct them |
| **Description** | Free text — who's in it, what's the occasion, where was it taken |
| **Tags** | Add custom tags like "Wedding", "Military", "School" |

The AI also attempts **decade estimation** from clothing, hairstyle, and photo format using CLIP — this appears as a suggestion you can accept or override.

---

## Photo enhancement

For old scans, the AI enhancement pipeline (under **AI assistant**) offers:

| Tool | What it does |
|---|---|
| **Denoise** | Real-ESRGAN — removes scan grain and JPEG artifacts |
| **Upscale** | 4× resolution increase for small originals |
| **Colourisation** | DeOldify — adds plausible colour to B&W photos |
| **Face restore** | GFPGAN — sharpens blurry or damaged faces |

Install the larger models as needed:
```bash
pip install realesrgan gfpgan
# DeOldify is large (~1GB); install separately if you want colourisation
```

---

## Data model overview

```
persons ──< person_events >── events
   │                              └── places
   └──< person_media >── media (photos)
                            └──< face_detections >── face_clusters

families ──< family_children ── persons
        └──< family_events >── events
```

All data lives in `data/familyroot.db` — a single SQLite file you can back up, copy, or open with any SQLite browser.

---

## Project structure

```
familyroot/
├── backend/
│   ├── app.py              ← Flask entry point (python app.py to run)
│   ├── database.py         ← SQLite connection helpers
│   ├── schema.sql          ← Full database schema (Gramps-aligned)
│   ├── photo_engine.py     ← Ingestion, EXIF, face detection, clustering
│   ├── api_photos.py       ← REST API: /api/photos/*, /api/faces/*
│   ├── gramps_import.py    ← (Stage 2) Gramps XML importer
│   └── gedcom_import.py    ← (Stage 2) GEDCOM importer
├── frontend/               ← React app (Stage 2)
├── media/
│   ├── originals/          ← Full-res copies of your photos
│   └── thumbnails/         ← 400px square thumbnails
└── data/
    └── familyroot.db       ← Everything in one file — back this up!
```

---

## What's coming (build order)

- [x] **Stage 1** — Database schema + photo engine + face AI + REST API
- [ ] **Stage 2** — Gramps XML + GEDCOM import/export
- [ ] **Stage 3** — React frontend (photo grid, face naming UI, timeline)
- [ ] **Stage 4** — Family tree visualisation (pedigree, descendant, fan chart)
- [ ] **Stage 5** — Reports and printed family history books

---

## Privacy

Every `persons` row has a `privacy` flag. Living people should have `is_living = 1`.
The UI can hide living people's details and faces from exports and shared views.
Your data never leaves your machine.
