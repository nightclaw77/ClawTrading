#!/bin/bash
# ============================================================================
# ClawTrading - VPS One-Click Setup
# ============================================================================
# Run this on your VPS to set up everything:
#   curl -sL https://raw.githubusercontent.com/nightclaw77/ClawTrading/main/scripts/vps-setup.sh | bash
# Or clone first, then:
#   chmod +x scripts/vps-setup.sh && ./scripts/vps-setup.sh
# ============================================================================

set -euo pipefail

echo "======================================"
echo " ClawTrading VPS Setup"
echo "======================================"

REPO_DIR="${HOME}/ClawTrading"

# 1. Clone or update repo
if [ -d "$REPO_DIR" ]; then
  echo "📁 Repo exists, pulling latest..."
  cd "$REPO_DIR"
  git pull origin main
else
  echo "📥 Cloning repo..."
  git clone https://github.com/nightclaw77/ClawTrading.git "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 2. Install Node.js if needed
if ! command -v node &>/dev/null; then
  echo "📦 Installing Node.js v22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node: $(node --version)"
echo "NPM: $(npm --version)"

# 3. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 4. Generate Convex types (if CONVEX_URL is set)
if [ -n "${CONVEX_URL:-}" ]; then
  echo "🔧 Generating Convex types..."
  npx convex dev --once 2>/dev/null || echo "⚠️  Convex generation skipped (set CONVEX_URL)"
fi

# 5. Create .env.local if not exists
if [ ! -f .env.local ]; then
  echo "⚠️  No .env.local found!"
  echo "   Copy .env.example to .env.local and fill in your credentials."
  cp .env.example .env.local
fi

# 6. Create logs directory
mkdir -p logs

# 7. Make scripts executable
chmod +x scripts/*.sh

# 8. Install systemd services
echo "🔧 Installing systemd services..."
sudo cp scripts/clawtrade-sync.service /etc/systemd/system/
sudo sed -i "s|/home/ubuntu|$HOME|g" /etc/systemd/system/clawtrade-sync.service
sudo sed -i "s|User=ubuntu|User=$(whoami)|g" /etc/systemd/system/clawtrade-sync.service
sudo systemctl daemon-reload
sudo systemctl enable clawtrade-sync

# 9. Build for production
echo "🏗️  Building for production..."
npm run build 2>/dev/null || echo "⚠️  Build will complete on first run"

echo ""
echo "======================================"
echo " ✅ Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env.local with your credentials"
echo "  2. Start sync watcher:  sudo systemctl start clawtrade-sync"
echo "  3. Start trading bot:   npm run start"
echo "  4. View sync logs:      tail -f logs/sync.log"
echo ""
echo "The sync watcher will auto-pull changes from GitHub every 15 seconds."
echo "Any changes OpenClaw makes will auto-push back."
