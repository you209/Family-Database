"""Fail-closed HTTP Basic authentication and browser write origin checks.

Set FAMILYROOT_ADMIN_PASSWORD to a strong unique secret. Basic credentials
require HTTPS when used outside localhost. Neither a share PIN nor CORS is
sufficient authorization for private genealogy data.

Browser-origin restrictions here are defense in depth; for public exposure
a dedicated HTTPS reverse proxy, TLS, rate limits and CSRF-aware sessions
are still required.
"""
import hmac
import os
from pathlib import Path
from urllib.parse import urlsplit

from flask import request, jsonify


def _browser_write_allowed() -> bool:
    """Reject cross-origin browser mutations even when Basic auth is cached.

    Check Fetch Metadata as an independent browser signal. When Origin is
    supplied, compare the exact host:port with Host; don't accept subdomains
    or null origins. CLI clients with no browser headers remain usable.
    """
    site = request.headers.get("Sec-Fetch-Site", "").strip().lower()
    if site in ("cross-site", "same-site"):
        return False
    origin = request.headers.get("Origin")
    if not origin:
        return True
    parsed = urlsplit(origin)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        return False
    if parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        return False
    return parsed.netloc.lower() == request.host.lower()


def _admin_password():
    """Read the Docker secret directly if the shell entrypoint did not export it.

    Remain fail-closed if the file is absent, unreadable, or blank. Never
    log or include its contents in an HTTP response.
    """
    from_env = os.environ.get("FAMILYROOT_ADMIN_PASSWORD", "")
    if from_env:
        return from_env
    secret_path = os.environ.get(
        "FAMILYROOT_ADMIN_PASSWORD_FILE", "/run/secrets/familyroot_admin_password")
    try:
        return Path(secret_path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError, ValueError):
        return ""


def require_admin():
    # Protect the frontend, originals, thumbnails and downloads too.
    # Family records must never be reachable via a public file route.
    if request.path == "/api/health":
        return None
    password = _admin_password()
    if not password:
        return jsonify({"error": "Administrator password is not configured"}), 503

    auth = request.authorization
    if (not auth or auth.type.lower() != "basic"
            or not hmac.compare_digest(auth.username or "", "admin")
            or not hmac.compare_digest(auth.password or "", password)):
        return jsonify({"error": "Administrator authentication required"}), 401, {
            "WWW-Authenticate": 'Basic realm="FamilyRoot"'
        }
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _browser_write_allowed():
        return jsonify({"error": "Cross-origin browser write rejected"}), 403
    return None
