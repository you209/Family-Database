#!/usr/bin/env bash
# FamilyRoot — Gramps Web API installer for Raspberry Pi OS
#
# Installs Gramps Web as a systemd service using Python + gunicorn.
# This is the lightweight REST API server (not the full Gramps desktop app).
# Tested on: Raspberry Pi OS Bookworm (12), 64-bit and 32-bit
#
# Usage:
#   bash scripts/install-gramps-web.sh
#   bash scripts/install-gramps-web.sh --uninstall
#
# After install, API available at: http://<pi-ip>:5055
# FamilyRoot connects to this in DATA → Gramps Engine

set -euo pipefail

GW_DIR="$HOME/gramps-web"
GW_PORT=5055
GW_TREE="FamilyRoot"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}! $*${NC}"; }
die()     { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── uninstall ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  info "Stopping Gramps Web service…"
  systemctl --user stop   gramps-web 2>/dev/null || true
  systemctl --user disable gramps-web 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/gramps-web.service"
  systemctl --user daemon-reload
  success "Gramps Web service removed. Data in $GW_DIR is untouched."
  exit 0
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}  Gramps Web installer — Raspberry Pi  ${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

# ── system packages ───────────────────────────────────────────────────────────
info "Installing system packages…"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip \
  libglib2.0-dev libcairo2-dev libgirepository1.0-dev \
  gir1.2-glib-2.0 python3-gi python3-gi-cairo \
  pkg-config gcc g++

# Gramps (the library, not the GUI) provides the data model
# gramps package on Pi OS includes the Python libs we need
if ! dpkg -s gramps &>/dev/null; then
  info "Installing Gramps library (data model + file parsers)…"
  sudo apt-get install -y gramps
fi
success "Gramps library installed: $(gramps --version 2>/dev/null || echo 'ok')"

# ── Python venv ───────────────────────────────────────────────────────────────
info "Setting up Python virtual environment…"
mkdir -p "$GW_DIR/data" "$GW_DIR/media"
python3 -m venv --system-site-packages "$GW_DIR/venv"
"$GW_DIR/venv/bin/pip" install --upgrade pip --quiet

info "Installing Gramps Web API…"
"$GW_DIR/venv/bin/pip" install --quiet \
  gramps-webapi \
  gunicorn

success "Gramps Web API installed"

# ── config ────────────────────────────────────────────────────────────────────
GW_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
GW_PASSWORD="${GRAMPS_ADMIN_PASSWORD:-familyroot}"

cat > "$GW_DIR/config.cfg" <<EOF
TREE = "${GW_TREE}"
SECRET_KEY = "${GW_SECRET}"
GRAMPSHOME = "${GW_DIR}/data"
MEDIA_BASE_DIR = "${GW_DIR}/media"
EOF

info "Creating initial Gramps tree and admin user…"
"$GW_DIR/venv/bin/python" -m gramps_webapi \
  --config "$GW_DIR/config.cfg" \
  user add admin --role 4 --password "${GW_PASSWORD}" 2>/dev/null || \
  info "(Admin user already exists — skipping)"

# ── systemd user service ──────────────────────────────────────────────────────
info "Installing systemd service…"
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cat > "$SYSTEMD_DIR/gramps-web.service" <<EOF
[Unit]
Description=Gramps Web API server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$GW_DIR
Environment="GRAMPS_API_CONFIG=$GW_DIR/config.cfg"
ExecStart=$GW_DIR/venv/bin/gunicorn \
  --workers 2 \
  --bind 0.0.0.0:${GW_PORT} \
  --timeout 120 \
  gramps_webapi.app:app
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable gramps-web
systemctl --user restart gramps-web

PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "$PI_IP" ]] && PI_IP="<pi-ip>"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
success "Gramps Web is installed and starting!"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}API URL:${NC}   http://localhost:${GW_PORT}"
echo -e "  ${CYAN}Network:${NC}   http://${PI_IP}:${GW_PORT}"
echo -e "  ${CYAN}Login:${NC}     admin / ${GW_PASSWORD}"
echo -e "  ${CYAN}Tree:${NC}      ${GW_TREE}"
echo ""
echo -e "  ${CYAN}Media folder:${NC} $GW_DIR/media"
echo -e "  ${CYAN}Data folder:${NC}  $GW_DIR/data"
echo -e "  ${CYAN}Config:${NC}       $GW_DIR/config.cfg"
echo -e "  ${CYAN}Logs:${NC}         journalctl --user -u gramps-web -f"
echo ""
echo -e "  ${YELLOW}Next steps in FamilyRoot:${NC}"
echo -e "  1. Go to DATA → Gramps Engine in FamilyRoot"
echo -e "  2. Enter URL: http://localhost:${GW_PORT}"
echo -e "  3. Enter username: admin  password: ${GW_PASSWORD}"
echo -e "  4. Connect, then click Sync to pull all records"
echo ""
echo -e "  ${YELLOW}To import an existing Gramps file (.gramps/.ged):${NC}"
echo -e "  gramps -C '${GW_TREE}' -i your-family.gramps"
echo ""
