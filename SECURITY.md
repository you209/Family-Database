# Phase 1 security changes

FamilyRoot now requires `FAMILYROOT_ADMIN_PASSWORD` for all `/api/*` endpoints except health. Configure it in a local `.env` file (never commit secrets). Browser access prompts for HTTP Basic credentials on API requests. The existing share PIN is **not** an authorization mechanism; all API operations require the administrator password until a proper role-based sharing model is implemented.

Docker ports default to loopback only. Use HTTPS with an authenticated reverse proxy for remote access; do not publish Flask directly. Existing frontend share-PIN flows are superseded by administrator authentication and need redesign before read-only guest access is re-enabled.

Backup now uses SQLite's online backup mechanism. Restore validates ZIP paths, file types, uncompressed size and SQLite integrity before replacement. Restoring media is not yet fully transactional; keep a verified backup and stop other writers before restoring.

Run regression tests: `cd backend && python -m unittest discover -s tests`.

Outstanding: protect the legacy root `app.py` launcher, add role-based guest access, test full restore under concurrent load, and add CSRF defenses before enabling browser-authenticated writes on public networks.
