# FamilyRoot

**A local-first family history app** — photos, family tree, timeline, map, AI face recognition, and Gramps compatibility, all running on your own machine. No cloud, no subscription, no data leaving your home.

The goal is a single self-hosted app that replaces the patchwork of Ancestry subscriptions, scattered photo folders, and desktop genealogy software with one clean interface you can open from any device on your network. Everything is stored in a single SQLite file you own and control.

---

## What it does

| Feature | Description |
|---|---|
| **Photo library** | Import photos from USB, folder, or network share. EXIF extraction, GPS mapping, thumbnail generation, decade estimation from AI. |
| **Face recognition** | Automatically detects and clusters faces across all photos. Name a cluster once — every photo updates. |
| **Family tree** | Pedigree and descendant views, bubble chart, relationship calculator. |
| **Timeline** | All life events on a scrollable, filterable timeline. |
| **Map** | Places database with Leaflet map — birth towns, migration routes, photo locations. |
| **Gramps import/export** | Drag and drop a `.gramps` or `.ged` file to import. Export back to GEDCOM 5.5.1 or Gramps XML at any time. |
| **Sources & citations** | Attach sources to any person, event, or place. Citation quality tracking. |
| **Notes & documents** | Rich notes attached to any record. |
| **Statistics dashboard** | Charts of births by decade, surnames, gender split, generation depth, and more. |
| **Calendar** | Upcoming birthdays and anniversaries. |
| **AI stories** | Use a local Ollama model to generate a biography narrative for any person. |
| **Global search** | Search across people, places, events, and photos from the sidebar. |
| **Backup & restore** | One-click backup to a zip file. Restore from the same zip. |
| **Export** | GEDCOM, CSV, and plain-text life summaries. |
| **Shared access** | Optional PIN-protected access so other family members on your network can view (but not edit) the data. |
| **Photo slideshow** | Fullscreen slideshow with keyboard navigation, auto-play, and person tags. |
| **Print view** | Print-optimised layout for any page. |
| **Dark theme** | Full dark UI throughout. |

---

## Install

### Windows

```powershell
git clone https://github.com/you209/Family-Database.git
cd Family-Database
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install-windows.ps1
```

The installer checks for Python and Node.js, creates a virtual environment, installs dependencies, builds the frontend, and creates `FamilyRoot.bat`. Double-click `FamilyRoot.bat` to start.

### Raspberry Pi / Linux

```bash
git clone https://github.com/you209/Family-Database.git
cd Family-Database
bash install.sh
```

Installs as a systemd service, starts on boot. Access at `http://<your-pi-ip>:5050`.

### Docker Compose

```bash
git clone https://github.com/you209/Family-Database.git
cd Family-Database
cp .env.example .env   # edit SECRET_KEY at minimum
docker-compose up -d
```

Runs FamilyRoot on port 5050, with optional PhotoPrism (port 2342) and Gramps Web (port 5055) alongside it.

### Home Assistant OS add-on

Add this repository as a custom add-on repository in Home Assistant:

```
https://github.com/you209/Family-Database
```

Then install **FamilyRoot** from the add-on store. Data is stored in `/share/familyroot` on your HA instance and survives updates.

### Direct run (any OS)

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
cd backend && python app.py
```

Open `http://localhost:5050`.

---

## Importing your family tree

**Drag and drop** a `.gramps` or `.ged` file onto the Import page, or point it at a folder (USB drive, network share) to scan for genealogy files and photos together.

Supported sources:
- **Gramps** — export via File > Export > Gramps XML
- **Ancestry / FamilySearch / MyHeritage / Webtrees** — export as GEDCOM (.ged)
- **Any GEDCOM 5.5 / 5.5.1 / 7.0 file**

Re-importing is safe — existing records are updated, not duplicated.

---

## AI features

### Face recognition (local)
Uses **InsightFace ArcFace** — the same technology as commercial apps, running entirely on your machine. Every face gets a 512-dimension fingerprint, faces are clustered automatically, and you name each cluster once.

### AI stories (Ollama)
Connect a local **Ollama** instance to generate biography narratives, photo descriptions, and relationship summaries using any model you have installed (llama3, mistral, etc.).

### Photo enhancement (optional)
Old scans can be denoised, upscaled 4x, colourised, and face-restored using Real-ESRGAN, DeOldify, and GFPGAN — all running locally.

---

## Optional integrations

These are standalone installer scripts in the `scripts/` folder:

| Script | What it installs |
|---|---|
| `install-photoprism.sh` | PhotoPrism on port 2342 — advanced photo management alongside FamilyRoot |
| `install-gramps-web.sh` | Gramps Web API on port 5055 — web interface for the full Gramps desktop app |

---

## Data & privacy

- Everything lives in `data/familyroot.db` — a single SQLite file. Back it up, copy it, open it with any SQLite browser.
- Photos are stored in `media/originals/` and `media/thumbnails/`.
- No data ever leaves your machine unless you explicitly export it.
- Living people can be flagged `is_living = 1` — their details are hidden from shared/exported views.
- Shared access (PIN) is opt-in and local-network only.

---

## Project structure

```
Family-Database/
├── backend/
│   ├── app.py                  Flask entry point
│   ├── database.py             SQLite helpers
│   ├── schema.sql              Full database schema
│   ├── photo_engine.py         Photo ingestion, EXIF, face detection, clustering
│   ├── gramps_import.py        Gramps XML + GEDCOM importer and /api/gramps/* routes
│   ├── api_persons.py          People, portraits
│   ├── api_photos.py           Photos, faces, thumbnails
│   ├── api_tree.py             Family tree, relationship calculator
│   ├── api_export.py           GEDCOM, CSV, stats export
│   ├── api_sources.py          Sources and citations
│   ├── api_notes.py            Notes attached to any record
│   ├── api_stats.py            Statistics and calendar
│   ├── api_search.py           Global search
│   ├── api_share.py            PIN-protected shared access
│   ├── api_admin.py            Backup, restore, version, auto-update
│   ├── api_ollama.py           Ollama AI integration
│   └── requirements.txt
├── frontend/
│   └── src/pages/              One .jsx file per tab
├── hassio/                     Home Assistant add-on files
│   ├── config.yaml
│   ├── build.yaml
│   ├── Dockerfile
│   └── run.sh
├── scripts/
│   ├── install-photoprism.sh
│   └── install-gramps-web.sh
├── install.sh                  Linux/Pi installer
├── install-windows.ps1         Windows installer
├── docker-compose.yml          Docker Compose stack
├── Dockerfile                  Root Dockerfile for Docker builds
└── repository.yaml             HA custom add-on repository manifest
```
