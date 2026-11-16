"""Fail-closed HTTP Basic authentication and browser write origin checks.

Set FAMILYROOT_ADMIN_PASSWORD to a strong unique secret. Basic credentials
require HTTPS when used outside localhost. Neither a share PIN nor CORS is
sufficient authorization for private genealogy data.

Browser-origin restrictions here are defense in depth; for public exposure
a dedicated HTTPS reverse proxy, TLS, rate limits and CSRF-aware sessions
are still required.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import tempfile
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


# Password changes live in the persistent database volume, not the container image.
# Once a password is changed, the old Docker bootstrap secret cannot log in.
ADMIN_HASH_PATH = Path(os.environ.get(
    "FAMILYROOT_ADMIN_HASH_FILE", "/app/data/admin_password_hash.json"))
PBKDF2_ITERATIONS = 650000


def verify_admin_password(provided):
    """Use a hash after password rotation, falling back to the initial Docker secret."""
    try:
        if ADMIN_HASH_PATH.exists():
            data = json.loads(ADMIN_HASH_PATH.read_text(encoding="utf-8"))
            salt = base64.b64decode(data["salt"], validate=True)
            digest = base64.b64decode(data["hash"], validate=True)
            if data.get("version") != 1 or len(salt) != 32 or len(digest) != 32:
                return False
            derived = hashlib.pbkdf2_hmac(
                "sha256", provided.encode("utf-8"), salt, PBKDF2_ITERATIONS)
            return hmac.compare_digest(derived, digest)
    except (OSError, ValueError, KeyError, TypeError, UnicodeError):
        return False
    password = _admin_password()
    return bool(password) and hmac.compare_digest(provided, password)


def admin_password_configured():
    # An invalid rotation file must not fall back to the old Docker password.
    return ADMIN_HASH_PATH.exists() or bool(_admin_password())


def change_admin_password(current, new):
    if not verify_admin_password(current):
        raise ValueError("Current password is incorrect")
    if not isinstance(new, str) or len(new) < 16 or len(new) > 256 or new == current:
        raise ValueError("New password must be different and 16–256 characters")
    salt = secrets.token_bytes(32)
    digest = hashlib.pbkdf2_hmac("sha256", new.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    data = {"version": 1, "salt": base64.b64encode(salt).decode(),
            "hash": base64.b64encode(digest).decode()}
    ADMIN_HASH_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, target = tempfile.mkstemp(prefix=".admin-password-", dir=ADMIN_HASH_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(data, output)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(target, 0o600)
        os.replace(target, ADMIN_HASH_PATH)
    finally:
        if os.path.exists(target):
            os.unlink(target)


def require_admin():
    # Protect the frontend, originals, thumbnails and downloads too.
    # Family records must never be reachable via a public file route.
    if request.path == "/api/health":
        return None
    if not admin_password_configured():
        return jsonify({"error": "Administrator password is not configured"}), 503

    auth = request.authorization
    if (not auth or auth.type.lower() != "basic"
            or not hmac.compare_digest(auth.username or "", "admin")
            or not verify_admin_password(auth.password or "")):
        return jsonify({"error": "Administrator authentication required"}), 401, {
            "WWW-Authenticate": 'Basic realm="FamilyRoot"'
        }
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _browser_write_allowed():
        return jsonify({"error": "Cross-origin browser write rejected"}), 403
    return None
