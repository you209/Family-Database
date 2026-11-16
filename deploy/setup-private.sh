#!/usr/bin/env bash
# Create secrets only if absent. NEVER print or commit their contents.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
umask 077
mkdir -p private-secrets
if [[ ! -s private-secrets/admin_password ]]; then
  openssl rand -hex 32 > private-secrets/admin_password
fi
if [[ ! -s private-secrets/flask_secret_key ]]; then
  openssl rand -hex 32 > private-secrets/flask_secret_key
fi
chmod 700 private-secrets
chmod 600 private-secrets/admin_password private-secrets/flask_secret_key
echo "FamilyRoot secrets exist under deploy/private-secrets/ and were not printed."
echo "For first-time setup, privately view the admin password with:"
echo "  cat deploy/private-secrets/admin_password"
echo "Never paste the password or secret key into a chat, GitHub issue or log."
