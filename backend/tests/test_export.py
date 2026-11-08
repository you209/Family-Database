"""GEDCOM and CSV export integration tests against the shipped SQLite schema."""
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from flask import Flask
from api_export import export_bp


class ExportIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "family.db"
        self.conn = sqlite3.connect(self.path)
        self.conn.executescript((ROOT / "schema.sql").read_text())
        self.conn.execute("INSERT INTO places(id,name) VALUES(1,'Hobart')")
        self.conn.executemany(
            "INSERT INTO persons(id,name_given,name_surname,gender,birth_year) VALUES(?,?,?,?,?)",
            [(1,"Alex","Smith","M",1980),(2,"Sam","Jones","F",1982),
             (3,"Taylor","Smith","U",2010)])
        self.conn.execute("INSERT INTO families(id,father_id,mother_id) VALUES(1,1,2)")
        self.conn.execute("INSERT INTO family_children(family_id,child_id) VALUES(1,3)")
        self.conn.execute("INSERT INTO events(id,event_type,date_year,place_id) VALUES(1,'Birth',2010,1)")
        self.conn.execute("INSERT INTO person_events(person_id,event_id) VALUES(3,1)")
        self.conn.execute("INSERT INTO person_attributes(person_id,attr_type,value) VALUES(1,'Occupation','Engineer')")
        self.conn.commit()
        self.conn.close()
        self.app = Flask(__name__)
        self.app.register_blueprint(export_bp)
        self.client = self.app.test_client()
        self.patcher = patch("api_export.get_db", side_effect=self._db)
        self.patcher.start()

    def _db(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def test_gedcom_relationships_occupations_and_places(self):
        response = self.client.get("/api/export/gedcom")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        data = response.get_data(as_text=True)
        for expected in ("1 HUSB @I1@", "1 WIFE @I2@", "1 CHIL @I3@",
                         "1 OCCU Engineer", "2 PLAC Hobart", "0 TRLR"):
            self.assertIn(expected, data)

    def test_csv_events_uses_place_name(self):
        response = self.client.get("/api/export/csv/events")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Hobart", response.get_data(as_text=True))

    def test_person_report_relationships(self):
        response = self.client.post("/api/export/report/person/3")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        self.assertIn("Alex Smith", response.json["report"])
        self.assertIn("Sam Jones", response.json["report"])


if __name__ == "__main__":
    unittest.main()
