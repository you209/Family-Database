"""
FamilyRoot — app.py
Main Flask application.

Run:
    python app.py

Then open: http://localhost:5050
"""

import os
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from database import init_db, DB_PATH
from api_photos import photos_bp
from api_persons import persons_bp
from api_admin import admin_bp
from api_map import map_bp
from api_tree import tree_bp
from api_edit import edit_bp
from api_photoprism import photoprism_bp
from gramps_import import register_gramps_routes

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="../frontend/dist", static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Init DB on startup ────────────────────────────────────────────────────────
init_db(DB_PATH)

# ── Register blueprints ───────────────────────────────────────────────────────
app.register_blueprint(photos_bp)
app.register_blueprint(persons_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(map_bp)
app.register_blueprint(tree_bp)
app.register_blueprint(edit_bp)
app.register_blueprint(photoprism_bp)
register_gramps_routes(app, DB_PATH)

# ── Serve React frontend (built) ──────────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    dist = Path(app.static_folder)
    target = dist / path
    if path and target.exists():
        return send_from_directory(app.static_folder, path)
    index = dist / "index.html"
    if index.exists():
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"message": "FamilyRoot API running. Build the frontend to see the UI."}), 200

# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    from database import get_db
    try:
        with get_db() as conn:
            conn.execute("SELECT 1").fetchone()
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({"status": "ok", "db": db_ok, "version": "0.1.0"})

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5050))
    debug = os.environ.get("DEBUG", "0") == "1"
    print(f"\n  FamilyRoot running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
