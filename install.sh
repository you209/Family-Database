#!/usr/bin/env bash
# FamilyRoot — Pi install script
# Installs to ~/familyroot, sets up a venv, builds the frontend,
# and registers a systemd service so it starts on boot.
#
# Usage:
#   bash install.sh           # install / upgrade
#   bash install.sh --uninstall

set -euo pipefail

INSTALL_DIR="$HOME/familyroot"
SERVICE_NAME="familyroot@$USER"
PORT=5050

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}! $*${NC}"; }
die()     { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── uninstall ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  info "Stopping and disabling service…"
  systemctl --user stop   "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/familyroot@$USER.service"
  systemctl --user daemon-reload
  success "Service removed. Data in $INSTALL_DIR/data is untouched."
  exit 0
fi

# ── pre-flight checks ─────────────────────────────────────────────────────────
info "Checking dependencies…"
command -v python3 >/dev/null || die "python3 not found. Install with: sudo apt install python3"
command -v pip3    >/dev/null || die "pip3 not found. Install with: sudo apt install python3-pip"
PYTHON_VER=$(python3 -c "import sys; print(sys.version_info >= (3,9))")
[[ "$PYTHON_VER" == "True" ]] || die "Python 3.9+ required"

# Node is only needed for the build step, not at runtime
BUILD_FRONTEND=true
if ! command -v node >/dev/null; then
  warn "node not found — skipping frontend build."
  warn "Install Node if you need to rebuild: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs"
  BUILD_FRONTEND=false
fi

# ── copy repo to install dir ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
  info "Copying repo to $INSTALL_DIR…"
  mkdir -p "$INSTALL_DIR"
  rsync -a --exclude='.git' --exclude='venv' --exclude='frontend/node_modules' \
        "$SCRIPT_DIR/" "$INSTALL_DIR/"
else
  info "Running in-place from $INSTALL_DIR"
fi

# ── create directories ────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/data" \
         "$INSTALL_DIR/media/originals" \
         "$INSTALL_DIR/media/thumbnails"

# ── Python venv ───────────────────────────────────────────────────────────────
info "Setting up Python virtual environment…"
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip --quiet
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt" --quiet
success "Python dependencies installed"

# ── build React frontend ──────────────────────────────────────────────────────
if [[ "$BUILD_FRONTEND" == true ]]; then
  info "Installing Node dependencies…"
  (cd "$INSTALL_DIR/frontend" && npm install --silent)
  info "Building React frontend…"
  (cd "$INSTALL_DIR/frontend" && npm run build)
  success "Frontend built → $INSTALL_DIR/frontend/dist"
else
  if [[ ! -d "$INSTALL_DIR/frontend/dist" ]]; then
    warn "No pre-built frontend found. The API will still work but the UI won't load."
    warn "Build later with: cd $INSTALL_DIR/frontend && npm install && npm run build"
  else
    success "Using existing frontend build"
  fi
fi

# ── systemd user service ──────────────────────────────────────────────────────
info "Installing systemd service…"
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cat > "$SYSTEMD_DIR/familyroot@$USER.service" <<EOF
[Unit]
Description=FamilyRoot family history server
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/backend
Environment=PORT=$PORT
Environment=DEBUG=0
Environment=FAMILYROOT_MEDIA=$INSTALL_DIR/media
ExecStart=$INSTALL_DIR/venv/bin/python app.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "familyroot@$USER"
systemctl --user restart "familyroot@$USER"

# Enable lingering so the service starts at boot without a login session
# (requires sudo — skip gracefully if not available)
if sudo loginctl enable-linger "$USER" 2>/dev/null; then
  success "Linger enabled — service will start at boot without login"
else
  warn "Could not enable linger (needs sudo). Service starts after login only."
  warn "To fix: sudo loginctl enable-linger $USER"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
success "FamilyRoot installed and running!"
echo ""
echo -e "  ${CYAN}Open:${NC}    http://$(hostname -I | awk '{print $1}'):$PORT"
echo -e "  ${CYAN}Logs:${NC}    journalctl --user -u familyroot@$USER -f"
echo -e "  ${CYAN}Stop:${NC}    systemctl --user stop familyroot@$USER"
echo -e "  ${CYAN}Start:${NC}   systemctl --user start familyroot@$USER"
echo -e "  ${CYAN}Data:${NC}    $INSTALL_DIR/data/familyroot.db"
echo ""
