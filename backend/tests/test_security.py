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
        self.app.add_url_rule("/api/private", endpoint="private", view_func=lambda: "private", methods=["GET", "POST"])
        self.app.add_url_rule("/api/health", endpoint="health", view_func=lambda: "ok")
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

    def test_only_admin_username_is_accepted(self):
        import base64
        wrong = base64.b64encode(b"not-admin:test-secret").decode()
        with patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "test-secret"}):
            resp = self.client.get("/api/private", headers={"Authorization": "Basic " + wrong})
            self.assertEqual(resp.status_code, 401)

    def test_cross_site_write_blocked_even_with_correct_admin_password(self):
        import base64
        header = "Basic " + base64.b64encode(b"admin:test-secret").decode()
        with patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "test-secret"}):
            for headers in (
                {"Origin": "https://attacker.example"},
                {"Origin": "null"},
                {"Origin": "http://localhost.evil.example"},
                {"Sec-Fetch-Site": "cross-site"},
                {"Sec-Fetch-Site": "same-site"},
                {"Origin": "http://localhost", "Sec-Fetch-Site": "cross-site"}
            ):
                with self.subTest(headers=headers):
                    resp = self.client.post("/api/private", headers={
                        "Authorization": header, **headers
                    })
                    self.assertEqual(resp.status_code, 403)

    def test_same_origin_write_and_cli_use_still_work(self):
        import base64
        header = "Basic " + base64.b64encode(b"admin:test-secret").decode()
        with patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "test-secret"}):
            self.assertEqual(self.client.post("/api/private",
                headers={"Authorization": header, "Origin": "http://localhost",
                         "Sec-Fetch-Site": "same-origin"}).status_code, 200)
            self.assertEqual(self.client.post("/api/private",
                headers={"Authorization": header}).status_code, 200)

    def test_health_is_public(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.client.get("/api/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
