"""
FamilyRoot — api_share.py
PIN-based shared read-only access.
"""

import re
from flask import Blueprint, request, jsonify, session
from database import get_db

share_bp = Blueprint("share", __name__)


def _get_meta(conn, key):
    row = conn.execute("SELECT value FROM db_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else None


def _set_meta(conn, key, value):
    conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)", (key, value))


# ── middleware ────────────────────────────────────────────────────────────────

def check_share_pin():
    """Before-request hook: enforce PIN gate on all GET /api/* routes."""
    if request.method != "GET":
        return None
    path = request.path
    if path.startswith("/api/share/") or path == "/api/health":
        return None

    try:
        with get_db() as conn:
            enabled = _get_meta(conn, "share_enabled")
    except Exception:
        return None

    if enabled != "1":
        return None

    if session.get("fr_pin_ok") == "1":
        return None

    return jsonify({"error": "pin_required"}), 401


# ── routes ────────────────────────────────────────────────────────────────────

@share_bp.route("/api/share/status")
def share_status():
    with get_db() as conn:
        enabled = _get_meta(conn, "share_enabled")
        pin = _get_meta(conn, "share_pin")
    return jsonify({"enabled": enabled == "1", "has_pin": bool(pin)})


@share_bp.route("/api/share/setup", methods=["POST"])
def share_setup():
    data = request.get_json(force=True) or {}
    pin = str(data.get("pin", ""))
    enabled = data.get("enabled", True)

    if not re.fullmatch(r"\d{6}", pin):
        return jsonify({"error": "PIN must be exactly 6 digits"}), 400

    with get_db() as conn:
        _set_meta(conn, "share_pin", pin)
        _set_meta(conn, "share_enabled", "1" if enabled else "0")

    return jsonify({"ok": True})


@share_bp.route("/api/share/disable", methods=["POST"])
def share_disable():
    with get_db() as conn:
        _set_meta(conn, "share_enabled", "0")
    return jsonify({"ok": True})


@share_bp.route("/api/share/verify", methods=["POST"])
def share_verify():
    data = request.get_json(force=True) or {}
    pin = str(data.get("pin", ""))

    with get_db() as conn:
        stored = _get_meta(conn, "share_pin")

    if stored and pin == stored:
        session["fr_pin_ok"] = "1"
        return jsonify({"ok": True})

    return jsonify({"error": "wrong pin"}), 403
