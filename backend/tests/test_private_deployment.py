"""Private deployment regression checks; no Docker daemon or private data required."""
import base64
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask
from security import require_admin

ROOT = Path(__file__).resolve().parents[2]

class PrivateRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.before_request(require_admin)
        for path in ('/', '/api/persons', '/originals/family.jpg',
                     '/thumbnails/family.jpg', '/assets/app.js'):
            self.app.add_url_rule(path, endpoint='route' + str(len(self.app.url_map._rules)),
                                  view_func=lambda: 'private')
        self.app.add_url_rule('/api/health', endpoint='health', view_func=lambda: 'ok')
        self.client = self.app.test_client()

    def test_protects_frontend_and_media_without_login(self):
        with patch.dict(os.environ, {'FAMILYROOT_ADMIN_PASSWORD': 'test-secret'}):
            for path in ('/', '/api/persons', '/originals/family.jpg',
                         '/thumbnails/family.jpg', '/assets/app.js'):
                with self.subTest(path=path):
                    self.assertEqual(self.client.get(path).status_code, 401)

    def test_protects_frontend_and_media_without_configured_secret(self):
        with patch.dict(os.environ, {}, clear=True):
            for path in ('/', '/api/persons', '/originals/family.jpg'):
                self.assertEqual(self.client.get(path).status_code, 503)

    def test_browser_basic_login_and_health(self):
        auth = 'Basic ' + base64.b64encode(b'admin:test-secret').decode()
        with patch.dict(os.environ, {'FAMILYROOT_ADMIN_PASSWORD': 'test-secret'}):
            self.assertEqual(self.client.get('/originals/family.jpg',
                                            headers={'Authorization': auth}).status_code, 200)
            self.assertEqual(self.client.get('/api/health').status_code, 200)

class DeploymentConfigTests(unittest.TestCase):
    def test_isolated_compose_mounts_and_host_only_binding(self):
        compose = (ROOT / 'deploy/compose.private.yml').read_text()
        self.assertIn('127.0.0.1:15050:5050', compose)
        self.assertIn('FAMILYROOT_DB: /app/data/familyroot.db', compose)
        self.assertIn('FAMILYROOT_MEDIA: /app/media', compose)
        self.assertIn('familyroot-private-data', compose)
        self.assertIn('familyroot-private-media', compose)
        self.assertIn('no-new-privileges:true', compose)
        self.assertIn('/run/secrets/familyroot_admin_password', compose)
        self.assertNotIn('photoprism:', compose)
        self.assertNotIn('gramps-web:', compose)
        self.assertNotIn('docker.sock', compose)

    def test_credentials_never_committed(self):
        ignore = (ROOT / '.gitignore').read_text()
        self.assertIn('deploy/private-secrets/', ignore)
        secret_dir = ROOT / 'deploy/private-secrets'
        self.assertFalse(secret_dir.exists(), 'Private credential files must not be tracked')

if __name__ == '__main__':
    unittest.main()
