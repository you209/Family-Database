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


def require_admin():
    if not request.path.startswith("/api/") or request.path == "/api/health":
        return None
    password = os.environ.get("FAMILYROOT_ADMIN_PASSWORD", "")
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
