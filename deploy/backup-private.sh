#!/usr/bin/env bash
# Consistent cold backup of the private FamilyRoot data and media volumes.
# Requires sudo; does not copy or display admin passwords.
set -Eeuo pipefail
[[ "$(id -u)" == "0" ]] || { echo "Run with sudo: sudo bash deploy/backup-private.sh" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/deploy/compose.private.yml")
DATE="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="/home/docker/familyroot-backups/$DATE"
for volume in familyroot-private-data familyroot-private-media; do
  docker volume inspect "$volume" >/dev/null 2>&1 || { echo "Missing $volume; nothing to back up" >&2; exit 1; }
done
umask 077
mkdir -p "$DEST"
chmod 700 /home/docker/familyroot-backups "$DEST"
WAS_RUNNING=0
if "${COMPOSE[@]}" ps --services --status running | grep -qx familyroot; then
  WAS_RUNNING=1
fi
restore_service() {
  if [[ "$WAS_RUNNING" -eq 1 ]]; then "${COMPOSE[@]}" start familyroot || true; fi
}
trap restore_service EXIT
if [[ "$WAS_RUNNING" -eq 1 ]]; then "${COMPOSE[@]}" stop familyroot; fi
for volume in familyroot-private-data familyroot-private-media; do
  name="${volume#familyroot-private-}"
  docker run --rm --network none \
    --mount "type=volume,src=$volume,dst=/source,readonly" \
    --mount "type=bind,src=$DEST,dst=/backup" \
    busybox:1.37 sh -c 'cd /source && tar -czf "/backup/$1.tar.gz" .' -- "$name"
done
(cd "$DEST" && sha256sum data.tar.gz media.tar.gz > SHA256SUMS)
chmod 600 "$DEST"/*
echo "Backup completed: $DEST"
echo "Copy the entire directory to a different physical disk or NAS."
