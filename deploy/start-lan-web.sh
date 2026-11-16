#!/usr/bin/env bash
# One-time HTTPS LAN website setup for an already-running FamilyRoot Docker app.
# Keeps the existing database and media volumes. Never shows admin credentials.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "$(id -u)" -eq 0 ]] || { echo "Run: sudo bash deploy/start-lan-web.sh" >&2; exit 1; }
config=(-f deploy/compose.private.yml -f deploy/compose.lan.yml)
docker compose "${config[@]}" config --quiet
docker compose "${config[@]}" up -d familyroot-web
echo "Waiting for Caddy's local TLS certificate to become available..."
for attempt in $(seq 1 20); do
  if docker cp familyroot-lan-web:/data/caddy/pki/authorities/local/root.crt "$ROOT/deploy/familyroot-ca.crt" 2>/dev/null; then
    chmod 0644 "$ROOT/deploy/familyroot-ca.crt"
    echo "HTTPS site: https://192.168.1.44:15443"
    echo "Local CA certificate: $ROOT/deploy/familyroot-ca.crt"
    openssl x509 -in "$ROOT/deploy/familyroot-ca.crt" -noout -fingerprint -sha256
    echo "Trust only this verified CA on client devices; see deploy/LAN-WEB.md"
    exit 0
  fi
  sleep 2
done
echo "The web proxy may have started, but its local CA is not ready." >&2
echo "Check: docker logs --tail 40 familyroot-lan-web" >&2
exit 1
