"""Fail-closed HTTP Basic authentication for FamilyRoot's private API.

Set FAMILYROOT_ADMIN_PASSWORD to a strong unique secret. Deploy behind HTTPS
when accessing outside localhost; Basic credentials are not encrypted by HTTP.
"""
import hmac
import os
from flask import request, jsonify


def require_admin():
    if not request.path.startswith("/api/") or request.path == "/api/health":
        return None
    password = os.environ.get("FAMILYROOT_ADMIN_PASSWORD", "")
    if not password:
        return jsonify({"error": "Administrator password is not configured"}), 503
    auth = request.authorization
    if not auth or not hmac.compare_digest(auth.password or "", password):
        return jsonify({"error": "Administrator authentication required"}), 401, {
            "WWW-Authenticate": 'Basic realm="FamilyRoot"'
        }
    return None
