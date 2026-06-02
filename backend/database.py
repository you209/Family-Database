"""
FamilyRoot — database.py
SQLite connection, schema init, and base helpers.
"""
import sqlite3
import os
import json
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(os.environ.get("FAMILYROOT_DB", "data/familyroot.db"))
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def init_db(db_path: Path = DB_PATH) -> None:
    """Create the database and apply the schema if needed."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA_PATH.read_text())
    print(f"Database ready: {db_path}")


@contextmanager
def get_db(db_path: Path = DB_PATH):
    """Context manager returning a row-factory connection."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row) -> dict:
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows) -> list:
    return [dict(r) for r in rows]
