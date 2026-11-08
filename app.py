"""Compatibility launcher. The canonical application is backend/app.py."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))
from backend.app import app  # noqa: E402

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5050")),
            debug=os.environ.get("DEBUG", "0") == "1")
