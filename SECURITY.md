# Phase 1 security changes

FamilyRoot now requires `FAMILYROOT_ADMIN_PASSWORD` for all `/api/*` endpoints except health. Configure it in a local `.env` file (never commit secrets). Browser access may prompt for HTTP Basic credentials on API requests. The full React frontend login and upload workflows still need live browser testing after this change. The existing share PIN is **not** an authorization mechanism; all API operations require the administrator password until a proper role-based sharing model is implemented.

Docker ports default to loopback only. Use HTTPS with an authenticated reverse proxy for remote access; do not publish Flask directly. Existing frontend share-PIN flows are superseded by administrator authentication and need redesign before read-only guest access is re-enabled.

Backup now uses SQLite's online backup mechanism. Restore validates ZIP paths, file types, uncompressed size and SQLite integrity before replacement. Restoring media is not yet fully transactional; keep a verified backup and stop other writers before restoring.

Run regression tests: `cd backend && python -m unittest discover -s tests`.

Additional defense: authenticated browser writes are rejected when the browser reports a cross-site or same-site Fetch Metadata origin, or when the Origin host:port does not exactly match the request Host. This helps prevent cross-site form submissions when HTTP Basic credentials are cached. It is not a substitute for robust CSRF session tokens or an authenticated HTTPS gateway. Reverse proxies must preserve the public Host; test write operations through the final proxy and client configuration.

Outstanding: replace Basic credentials with reviewed session/CSRF protection and role-based guest access, test full restore under concurrent load, rate-limit login attempts, test the React frontend and photo uploads end-to-end, and remove unnecessary sharing endpoints before enabling browser-authenticated writes on public networks. The legacy root `app.py` now imports the canonical backend app; verify both entry paths on deployment.
