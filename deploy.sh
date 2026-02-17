#!/bin/bash
# Deploy script for ClawTrading

set -euo pipefail

APP_DIR="/root/.openclaw/workspace/main/ClawTrading"
DEPLOY_DIR="/var/www/trade.nightsub.ir"
SERVICE_NAME="night-trader"

cd "$APP_DIR"

echo "=== Deploying ClawTrading ==="

# Build app
npm install
npm run build

# Stop service if running
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo "Stopping existing service..."
  systemctl stop "$SERVICE_NAME" || true
fi

# Install systemd unit
cp "$APP_DIR/night-trader.service" /etc/systemd/system/night-trader.service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# Backup current deploy (rollback point)
if [ -d "$DEPLOY_DIR" ]; then
  cp -a "$DEPLOY_DIR" "${DEPLOY_DIR}.backup.$(date +%s)"
fi

# Deploy Next build output (distDir=dist)
mkdir -p "$DEPLOY_DIR"
rsync -a --delete "$APP_DIR/dist/" "$DEPLOY_DIR/"

# Start service
systemctl start "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✅ Service is running"
  systemctl --no-pager status "$SERVICE_NAME" | sed -n '1,40p'
else
  echo "❌ Service failed to start"
  systemctl --no-pager status "$SERVICE_NAME" || true
  exit 1
fi

echo "=== Deployment Complete ==="
echo "URL: https://trade.nightsub.ir"
