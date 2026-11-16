# Private FamilyRoot Docker deployment — first service in the Anchor ecosystem

This is an **isolated, opt-in deployment**, layered on the security/phase1-auth-backup-hardening branch. It does not automatically change the existing application on any server. The older root-level docker-compose.yml starts three services with different security and storage assumptions: **do not use it for this initial deployment**.

## Why this setup is different

- Only FamilyRoot runs; no PhotoPrism or Gramps Web containers are started.
- The host listens on **127.0.0.1:15050** only, so the site is not directly accessible from your LAN or the public internet.
- The database path is explicitly /app/data/familyroot.db and images are /app/media, matching the two **persistent named volumes**.
- Backend routes, frontend HTML/assets, and full-size/thumbnail media require the strong FamilyRoot admin password (HTTP Basic).
- The admin password and Flask secret are generated as local Compose secrets, not committed into GitHub or embedded in the image.
- No Docker socket is mounted into FamilyRoot, and no services from the existing Anchor Hub, Portainer, Open WebUI or n8n stacks are touched.

This is a **private first-stage setup**. An authenticated HTTPS reverse proxy, browser/session security and real restore rehearsal are required before exposing this to other devices or adding editing integration with Anchor.

## One-time install on the Docker VM

The existing Docker VM is 192.168.1.44. Run in its shell:

    cd /home/docker
    git clone --branch deploy/familyroot-private-docker-2026-11-15 --single-branch https://github.com/you209/Family-Database.git familyroot-source
    cd /home/docker/familyroot-source
    bash deploy/setup-private.sh

The script deliberately does not show your administrator password. To read it **on your private terminal only**, run:

    cat deploy/private-secrets/admin_password

Do not send this value to chat, a GitHub issue or a public log. Save it securely.

Check the Compose file **before** building (this uses the generated private secrets):

    sudo docker compose -f deploy/compose.private.yml config --quiet

Build and start only FamilyRoot (Python image, frontend, face AI dependencies; this can take a while and needs disk space):

    sudo docker compose -f deploy/compose.private.yml up -d --build familyroot
    sudo docker compose -f deploy/compose.private.yml ps
    curl -fsS http://127.0.0.1:15050/api/health

On successful startup the health result includes status=ok and db=true. An unauthenticated request for /api/photos/ or /originals/<filename> should return HTTP 401.

## Open it from Windows without exposing it on your network

From Windows PowerShell, make a secure tunnel (requires SSH to the Docker VM):

    ssh -N -L 15050:127.0.0.1:15050 docker@192.168.1.44

Leave that window open and browse on the **same Windows computer**:

    http://localhost:15050

When prompted, use username **admin** and the password from deploy/private-secrets/admin_password. The encrypted SSH tunnel protects credentials in transit. Closing the PowerShell window disconnects the tunnel.

Do not change the Docker port to 0.0.0.0 until HTTPS authentication, endpoint authorization, and backups are verified.

## Data migration and backups

This stack initially creates **new empty named volumes**:
- familyroot-private-data -> SQLite database
- familyroot-private-media -> imported photos and media

It does **not** automatically import any previous genealogy data. If you have an earlier database, do not overwrite it: first make a verified backup and plan a migration that includes associated media paths.

To make a consistent backup (briefly stops this service):

    cd /home/docker/familyroot-source
    sudo bash deploy/backup-private.sh

Archives are saved in /home/docker/familyroot-backups/<UTC timestamp>/ with SHA256SUMS. **Copy that directory off the Docker VM to another physical drive/NAS**. A backup on the same host disk is not sufficient against disk failure. A restore drill is still required before production use.

To stop this isolated stack without deleting data:

    sudo docker compose -f deploy/compose.private.yml stop familyroot

To restart:

    sudo docker compose -f deploy/compose.private.yml up -d familyroot

Avoid using docker compose down -v, docker volume rm, or scripts that wipe media.

## Anchor Hub integration

In Anchor Hub > Ecosystem, Sync GitHub and inspect Family-Database. It should be listed as a Python / Docker service. Its "Update plan" is deliberately informational until this stack has completed tests, backups, and review. No app-wide Update All is enabled by this pull request.

The final desired connection will be a **read-only status/health adapter**. Family tree records and photos are not automatically synced to Anchor, Planner or Home Assistant.

## Open issues / limitations

- Production builds of InsightFace and the React UI have **not** been verified on your exact Docker VM.
- Browser Basic authentication is adequate only behind a secured tunnel or HTTPS proxy; full frontend login/CRUD flows still need testing.
- Legacy share routes are disabled by the all-route login gate.
- This version does not deploy PhotoPrism or Gramps Web.
- The backup archives are not encrypted; keep them private and off-host.
- Build dependencies are substantial; check Docker VM disk/RAM before running the build.

Run local tests:

    cd backend
    python -m unittest discover -s tests -v
