#!/usr/bin/env bash
# FamilyRoot — Raspberry Pi OS install script
# Tested on: Raspberry Pi OS Bullseye (11) and Bookworm (12), 32-bit and 64-bit
#
# Installs to ~/familyroot, sets up a venv, builds the React frontend,
# and registers a systemd service that starts automatically on boot.
#
# Usage:
#   bash install.sh             # install / upgrade
#   bash install.sh --uninstall

set -euo pipefail

INSTALL_DIR="$HOME/familyroot"
PORT=5050

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}! $*${NC}"; }
die()     { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── helpers ───────────────────────────────────────────────────────────────────
apt_install() {
  # Install a package only if it isn't already present
  for pkg in "$@"; do
    if ! dpkg -s "$pkg" &>/dev/null; then
      info "Installing system package: $pkg"
      sudo apt-get install -y "$pkg"
    fi
  done
}

# ── uninstall ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  info "Stopping and disabling service…"
  systemctl --user stop   familyroot 2>/dev/null || true
  systemctl --user disable familyroot 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/familyroot.service"
  systemctl --user daemon-reload
  success "Service removed. Your data in $INSTALL_DIR/data is untouched."
  exit 0
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}  FamilyRoot — Raspberry Pi OS installer${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

# ── system packages ───────────────────────────────────────────────────────────
info "Updating package list…"
sudo apt-get update -qq

# python3-venv is not installed by default on Pi OS
# python3-pip  is missing on Lite images
# libatlas-base-dev is needed by numpy (used by face AI)
# rsync is used to copy the repo
apt_install python3 python3-venv python3-pip libatlas-base-dev rsync

# ── Node.js for frontend build ────────────────────────────────────────────────
if ! command -v node >/dev/null || [[ "$(node -e 'process.exit(+process.versions.node.split(".")[0]<18)')" ]]; then
  info "Installing Node.js 20 LTS (needed to build the frontend)…"
  # NodeSource supports arm64 and armhf (Pi 32-bit)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  apt_install nodejs
fi
success "Node $(node --version) / npm $(npm --version)"

# ── Python version check ──────────────────────────────────────────────────────
PY_OK=$(python3 -c "import sys; print('ok' if sys.version_info >= (3,9) else 'old')")
[[ "$PY_OK" == "ok" ]] || die "Python 3.9+ required (found $(python3 --version)). Upgrade your Pi OS."

# ── copy repo to install dir ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
  info "Copying to $INSTALL_DIR…"
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='venv' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    --exclude='data' \
    --exclude='media' \
    "$SCRIPT_DIR/" "$INSTALL_DIR/"
else
  info "Running in-place from $INSTALL_DIR"
fi

# ── preserve data / media across upgrades ─────────────────────────────────────
mkdir -p "$INSTALL_DIR/data" \
         "$INSTALL_DIR/media/originals" \
         "$INSTALL_DIR/media/thumbnails"

# ── Python venv ───────────────────────────────────────────────────────────────
info "Setting up Python virtual environment…"
# Use --system-site-packages so numpy/opencv from apt are available if installed
python3 -m venv --system-site-packages "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip --quiet
"$INSTALL_DIR/venv/bin/pip" install \
  -r "$INSTALL_DIR/backend/requirements.txt" \
  --quiet
success "Python environment ready"

# ── build React frontend ──────────────────────────────────────────────────────
info "Installing Node dependencies…"
(cd "$INSTALL_DIR/frontend" && npm install --silent)
info "Building React frontend…"
(cd "$INSTALL_DIR/frontend" && npm run build)
success "Frontend built → $INSTALL_DIR/frontend/dist"

# ── systemd user service ──────────────────────────────────────────────────────
info "Installing systemd service…"
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cat > "$SYSTEMD_DIR/familyroot.service" <<EOF
[Unit]
Description=FamilyRoot family history server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/backend
Environment="PORT=$PORT"
Environment="DEBUG=0"
Environment="FAMILYROOT_MEDIA=$INSTALL_DIR/media"
ExecStart=$INSTALL_DIR/venv/bin/python app.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable familyroot
systemctl --user restart familyroot

# ── linger: survive reboot without a login session ────────────────────────────
# This is the key step for headless Pi use.
if sudo loginctl enable-linger "$USER"; then
  success "Linger enabled — FamilyRoot starts at boot, no login needed"
else
  warn "loginctl enable-linger failed (needs sudo passwordless)."
  warn "Run manually: sudo loginctl enable-linger $USER"
  warn "Until then, FamilyRoot only starts after you log in."
fi

# ── detect Pi's IP for the welcome message ────────────────────────────────────
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "$PI_IP" ]] && PI_IP="<pi-ip>"

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
success "FamilyRoot is installed and running!"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Open on this Pi:${NC}   http://localhost:$PORT"
echo -e "  ${CYAN}Open from network:${NC} http://$PI_IP:$PORT"
echo ""
echo -e "  ${CYAN}Logs:${NC}   journalctl --user -u familyroot -f"
echo -e "  ${CYAN}Stop:${NC}   systemctl --user stop familyroot"
echo -e "  ${CYAN}Start:${NC}  systemctl --user start familyroot"
echo ""
echo -e "  ${CYAN}Photos:${NC} $INSTALL_DIR/media/"
echo -e "  ${CYAN}Data:${NC}   $INSTALL_DIR/data/familyroot.db"
echo ""
echo -e "  To upgrade later, run this script again."
echo ""

# ── optional integrations ─────────────────────────────────────────────────────
echo -e "${CYAN}Optional integrations (run separately if you want them):${NC}"
echo ""
echo -e "  ${CYAN}PhotoPrism${NC} — AI photo management + face recognition"
echo -e "    bash scripts/install-photoprism.sh"
echo ""
echo -e "  ${CYAN}Gramps Web${NC} — Gramps genealogy engine with REST API"
echo -e "    bash scripts/install-gramps-web.sh"
echo ""
echo -e "  These are optional — FamilyRoot works fully without them."
echo ""
