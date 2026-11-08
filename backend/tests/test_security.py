"""Security regression tests. Run: cd backend && python -m unittest discover -s tests"""
import os
import unittest
from unittest.mock import patch
from flask import Flask
from security import require_admin


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.before_request(require_admin)
        self.app.add_url_rule("/api/private", view_func=lambda: "private")
        self.app.add_url_rule("/api/health", view_func=lambda: "ok")
        self.client = self.app.test_client()

    def test_fails_closed_without_password(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.client.get("/api/private").status_code, 503)

    def test_rejects_unauthenticated_requests_and_writes(self):
        with patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "test-secret"}):
            self.assertEqual(self.client.get("/api/private").status_code, 401)
            self.assertEqual(self.client.post("/api/private").status_code, 401)

    def test_accepts_correct_password(self):
        import base64
        header = base64.b64encode(b"admin:test-secret").decode()
        with patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "test-secret"}):
            self.assertEqual(self.client.get("/api/private", headers={"Authorization": "Basic " + header}).status_code, 200)

    def test_health_is_public(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.client.get("/api/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
