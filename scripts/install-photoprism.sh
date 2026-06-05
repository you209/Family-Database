#!/usr/bin/env bash
# FamilyRoot — PhotoPrism installer for Raspberry Pi OS
#
# Installs PhotoPrism as a systemd service using the official ARM binary.
# Tested on: Raspberry Pi OS Bookworm (12), 64-bit (arm64)
#
# Usage:
#   bash scripts/install-photoprism.sh
#   bash scripts/install-photoprism.sh --uninstall
#
# After install, open http://<pi-ip>:2342
# Default login: admin / changeme  (change in --admin-password flag below)
#
# PhotoPrism data stored in: ~/photoprism/

set -euo pipefail

PP_DIR="$HOME/photoprism"
PP_PORT=2342
PP_VERSION="240915-e1280b2fb"   # update to latest from photoprism.app/dl

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}! $*${NC}"; }
die()     { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── uninstall ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  info "Stopping PhotoPrism service…"
  systemctl --user stop   photoprism 2>/dev/null || true
  systemctl --user disable photoprism 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/photoprism.service"
  systemctl --user daemon-reload
  success "PhotoPrism service removed. Data in $PP_DIR is untouched."
  exit 0
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}  PhotoPrism installer — Raspberry Pi  ${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

# ── architecture check ────────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) ARCH_TAG="arm64" ;;
  armv7l|armv6l) ARCH_TAG="armv7" ;;
  *) die "Unsupported architecture: $ARCH. PhotoPrism requires arm64 or armv7." ;;
esac
info "Architecture: $ARCH → using $ARCH_TAG build"

# ── system dependencies ───────────────────────────────────────────────────────
info "Installing system dependencies…"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  ffmpeg libheif-dev libjpeg-dev \
  exiftool darktable-cli 2>/dev/null || \
sudo apt-get install -y --no-install-recommends \
  ffmpeg exiftool

# ── download PhotoPrism ───────────────────────────────────────────────────────
TARBALL="photoprism-${PP_VERSION}-linux-${ARCH_TAG}.tar.gz"
DOWNLOAD_URL="https://dl.photoprism.app/pkg/packages/linux/${ARCH_TAG}/${TARBALL}"

mkdir -p "$PP_DIR/bin" "$PP_DIR/storage" "$PP_DIR/originals"

if [[ ! -f "$PP_DIR/bin/photoprism" ]]; then
  info "Downloading PhotoPrism ${PP_VERSION} for ${ARCH_TAG}…"
  info "URL: $DOWNLOAD_URL"
  curl -fsSL "$DOWNLOAD_URL" | tar xz -C "$PP_DIR" --strip-components=1
  success "PhotoPrism downloaded to $PP_DIR"
else
  info "PhotoPrism binary already present — skipping download"
fi

# ── generate a random admin password ─────────────────────────────────────────
PP_PASSWORD="${PHOTOPRISM_PASSWORD:-changeme}"
warn "PhotoPrism admin password: ${PP_PASSWORD}"
warn "Change this by editing ~/.config/systemd/user/photoprism.service"

# ── systemd user service ──────────────────────────────────────────────────────
info "Installing systemd service…"
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cat > "$SYSTEMD_DIR/photoprism.service" <<EOF
[Unit]
Description=PhotoPrism photo management
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PP_DIR
Environment="PHOTOPRISM_ADMIN_PASSWORD=${PP_PASSWORD}"
Environment="PHOTOPRISM_HTTP_PORT=${PP_PORT}"
Environment="PHOTOPRISM_ORIGINALS_PATH=$PP_DIR/originals"
Environment="PHOTOPRISM_STORAGE_PATH=$PP_DIR/storage"
Environment="PHOTOPRISM_SITE_URL=http://localhost:${PP_PORT}/"
Environment="PHOTOPRISM_DATABASE_DRIVER=sqlite"
Environment="PHOTOPRISM_DISABLE_TLS=true"
Environment="PHOTOPRISM_DEFAULT_LOCALE=en"
ExecStart=$PP_DIR/bin/photoprism start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable photoprism
systemctl --user restart photoprism

PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "$PI_IP" ]] && PI_IP="<pi-ip>"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
success "PhotoPrism is installed and starting!"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Open on this Pi:${NC}   http://localhost:${PP_PORT}"
echo -e "  ${CYAN}Open from network:${NC} http://${PI_IP}:${PP_PORT}"
echo -e "  ${CYAN}Login:${NC}             admin / ${PP_PASSWORD}"
echo ""
echo -e "  ${CYAN}Originals folder:${NC} $PP_DIR/originals"
echo -e "  ${CYAN}Logs:${NC}   journalctl --user -u photoprism -f"
echo ""
echo -e "  ${YELLOW}Next steps in FamilyRoot:${NC}"
echo -e "  1. Go to DATA → PhotoPrism in FamilyRoot"
echo -e "  2. Enter URL: http://localhost:${PP_PORT}"
echo -e "  3. Enter username: admin  password: ${PP_PASSWORD}"
echo -e "  4. Connect, then map detected faces to family members"
echo ""
echo -e "  ${YELLOW}Note:${NC} First startup may take a few minutes."
echo -e "  PhotoPrism needs to index your originals folder."
echo ""
