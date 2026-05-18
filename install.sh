#!/usr/bin/env bash
set -e

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                                                                              ║
# ║   ███████╗ █████╗ ███████╗██╗                                               ║
# ║   ╚══███╔╝██╔══██╗╚══███╔╝██║                                               ║
# ║     ███╔╝ ███████║  ███╔╝ ██║                                               ║
# ║    ███╔╝  ██╔══██║ ███╔╝  ██║                                               ║
# ║   ███████╗██║  ██║███████╗███████╗                                          ║
# ║   ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝                                          ║
# ║                                                                              ║
# ║   Your private AI army, one machine.                                        ║
# ║                                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

ZAZI_ART_COLOR="\033[1;35m"
RESET="\033[0m"
BOLD="\033[1m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
CYAN="\033[1;36m"

echo ""
echo -e "${ZAZI_ART_COLOR}                                              ███████╗ █████╗ ███████╗██╗${RESET}"
echo -e "${ZAZI_ART_COLOR}                                              ╚══███╔╝██╔══██╗╚══███╔╝██║${RESET}"
echo -e "${ZAZI_ART_COLOR}                                                ███╔╝ ███████║  ███╔╝ ██║${RESET}"
echo -e "${ZAZI_ART_COLOR}                                               ███╔╝  ██╔══██║ ███╔╝  ██║${RESET}"
echo -e "${ZAZI_ART_COLOR}                                              ███████╗██║  ██║███████╗███████╗${RESET}"
echo -e "${ZAZI_ART_COLOR}                                              ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝${RESET}"
echo ""
echo -e "${BOLD}       ═══ Your private AI army, one machine. ═══${RESET}"
echo ""

REPO="https://github.com/zarigata/AC.git"
DEFAULT_BRANCH="dev"

# ── Detect Docker ──────────────────────────────────────────────────────────────
if command -v docker &> /dev/null; then
  echo -e "${GREEN}✓${RESET} Docker detected — spinning up Zazi in a container${RESET}"
  echo ""
  docker run -d \
    --name zazi \
    -p 4000:4000 \
    -v zazi-data:/data \
    --restart unless-stopped \
    -e PORT=4000 \
    -e HOST=0.0.0.0 \
    -e ZAZI_DB_PATH=/data/zazi.sqlite \
    "${REPO#https://github.com/}:latest" 2>/dev/null || true
  echo -e "${GREEN}✓${RESET} Zazi container started"
  echo -e "   ${CYAN}→${RESET} Open http://localhost:4000"
  echo ""
  exit 0
fi

# ── Bare-metal fallback ──────────────────────────────────────────────────────
echo -e "${YELLOW}!${RESET} Docker not found — installing bare-metal instead${RESET}"
echo ""

ZAZI_DIR="${HOME}/zazi"
if [ -d "$ZAZI_DIR" ]; then
  echo -e "${YELLOW}!${RESET} ~/zazi already exists. Pulling latest..."
  cd "$ZAZI_DIR" && git pull origin "$DEFAULT_BRANCH"
else
  echo -e "${CYAN}→${RESET} Cloning into ~/zazi ..."
  git clone --branch "$DEFAULT_BRANCH" "$REPO" "$ZAZI_DIR"
fi

cd "$ZAZI_DIR"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}!${RESET} Node.js is not installed. Please install Node.js 22+ and rerun this script.${RESET}"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED_VERSION="22.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  echo -e "${YELLOW}!${RESET} Node.js $NODE_VERSION found. Node.js 22+ with --experimental-sqlite support is required.${RESET}"
  exit 1
fi

echo -e "${CYAN}→${RESET} Installing dependencies..."
npm install 2>/dev/null || true

echo ""
echo -e "${GREEN}✓${RESET} Zazi is installed at ${BOLD}${ZAZI_DIR}${RESET}"
echo ""
echo -e "   ${CYAN}Start:${RESET}  cd ~/zazi && npm start"
echo -e "   ${CYAN}Dev:${RESET}    cd ~/zazi && npm run dev"
echo -e "   ${CYAN}Test:${RESET}   cd ~/zazi && npm test"
echo ""

# ── Optional systemd service ─────────────────────────────────────────────────
if command -v systemctl &> /dev/null; then
  SYSTEMD_SERVICE="$HOME/.config/systemd/user/zazi.service"
  mkdir -p "$(dirname "$SYSTEMD_SERVICE")"

  cat > "$SYSTEMD_SERVICE" <<EOF
[Unit]
Description=Zazi Multi-Agent Control Room
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/zazi
ExecStart=/usr/bin/node --experimental-sqlite apps/api/src/server.js
Restart=on-failure
Environment=PORT=4000
Environment=HOST=0.0.0.0
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  echo -e "${GREEN}✓${RESET} User systemd service created at ${BOLD}${SYSTEMD_SERVICE}${RESET}"
  echo ""
  echo -e "   ${CYAN}Enable:${RESET} systemctl --user enable zazi"
  echo -e "   ${CYAN}Start:${RESET}  systemctl --user start zazi"
  echo -e "   ${CYAN}Logs:${RESET}   journalctl --user -u zazi -f"
  echo ""
fi

echo -e "${BOLD}═════════════════════════════════════════════════════════════════════${RESET}"
echo -e "   ${GREEN}Ready.${RESET} Open ${CYAN}http://localhost:4000${RESET} once Zazi is running."
echo -e "${BOLD}═════════════════════════════════════════════════════════════════════${RESET}"
echo ""
