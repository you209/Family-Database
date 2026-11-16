"""Password rotation tests without touching real family records."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
import security


class ChangePasswordTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = security.ADMIN_HASH_PATH
        security.ADMIN_HASH_PATH = Path(self.temp.name) / "db" / "admin_password_hash.json"
        self.env = patch.dict(os.environ, {"FAMILYROOT_ADMIN_PASSWORD": "original-secret-value"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        security.ADMIN_HASH_PATH = self.original
        self.temp.cleanup()

    def test_rotate_replaces_bootstrap_and_survives_reload(self):
        self.assertTrue(security.verify_admin_password("original-secret-value"))
        security.change_admin_password("original-secret-value", "another-strong-password-123!")
        self.assertTrue(security.verify_admin_password("another-strong-password-123!"))
        self.assertFalse(security.verify_admin_password("original-secret-value"))
        stored = security.ADMIN_HASH_PATH.read_text()
        self.assertNotIn("another-strong-password-123!", stored)
        self.assertEqual(security.ADMIN_HASH_PATH.stat().st_mode & 0o777, 0o600)

    def test_wrong_current_or_weak_new_is_rejected(self):
        with self.assertRaises(ValueError):
            security.change_admin_password("wrong", "another-strong-password-123!")
        with self.assertRaises(ValueError):
            security.change_admin_password("original-secret-value", "short")
        self.assertFalse(security.ADMIN_HASH_PATH.exists())

    def test_invalid_rotation_file_does_not_restore_old_secret(self):
        security.ADMIN_HASH_PATH.parent.mkdir(parents=True)
        security.ADMIN_HASH_PATH.write_text("not json")
        self.assertTrue(security.admin_password_configured())
        self.assertFalse(security.verify_admin_password("original-secret-value"))

    def test_basic_auth_accepts_new_only(self):
        import base64
        app = Flask(__name__)
        app.before_request(security.require_admin)
        app.add_url_rule('/api/private', view_func=lambda: 'ok')
        client = app.test_client()
        security.change_admin_password("original-secret-value", "another-strong-password-123!")
        def header(password):
            value=base64.b64encode(("admin:"+password).encode()).decode()
            return {"Authorization":"Basic "+value}
        self.assertEqual(client.get('/api/private',headers=header("original-secret-value")).status_code,401)
        self.assertEqual(client.get('/api/private',headers=header("another-strong-password-123!")).status_code,200)


if __name__ == "__main__":
    unittest.main()
