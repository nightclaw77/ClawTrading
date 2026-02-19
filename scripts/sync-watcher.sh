#!/bin/bash
# ============================================================================
# ClawTrading - VPS Auto-Sync Watcher
# ============================================================================
# This script runs on your VPS (where OpenClaw operates).
# It monitors the GitHub repo for changes and auto-pulls + hot-reloads.
#
# Usage:
#   chmod +x scripts/sync-watcher.sh
#   ./scripts/sync-watcher.sh           # foreground
#   nohup ./scripts/sync-watcher.sh &   # background
#
# Or use systemd (see clawtrade-sync.service)
# ============================================================================

set -euo pipefail

# Configuration
REPO_DIR="${CLAWTRADE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${CLAWTRADE_BRANCH:-main}"
CHECK_INTERVAL="${SYNC_INTERVAL:-15}"  # seconds between checks
LOG_FILE="${REPO_DIR}/logs/sync.log"
PID_FILE="${REPO_DIR}/.sync-watcher.pid"
NEXT_PID_FILE="${REPO_DIR}/.next-server.pid"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo -e "${CYAN}${msg}${NC}"
  echo "$msg" >> "$LOG_FILE"
}

log_success() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1"
  echo -e "${GREEN}${msg}${NC}"
  echo "$msg" >> "$LOG_FILE"
}

log_warn() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1"
  echo -e "${YELLOW}${msg}${NC}"
  echo "$msg" >> "$LOG_FILE"
}

log_error() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1"
  echo -e "${RED}${msg}${NC}"
  echo "$msg" >> "$LOG_FILE"
}

# Save PID for management
echo $$ > "$PID_FILE"

# Cleanup on exit
cleanup() {
  log "Sync watcher shutting down..."
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Check if Next.js server is running and restart it
restart_next_server() {
  log "Restarting Next.js server..."

  # Kill existing Next.js process if running
  if [ -f "$NEXT_PID_FILE" ]; then
    local old_pid
    old_pid=$(cat "$NEXT_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      kill "$old_pid" 2>/dev/null || true
      sleep 2
      # Force kill if still running
      kill -9 "$old_pid" 2>/dev/null || true
    fi
  fi

  # Start Next.js in background
  cd "$REPO_DIR"
  NODE_ENV=production nohup npm run start > "$REPO_DIR/logs/next-server.log" 2>&1 &
  echo $! > "$NEXT_PID_FILE"
  log_success "Next.js server restarted (PID: $(cat "$NEXT_PID_FILE"))"
}

# Check for remote changes and pull if needed
check_and_pull() {
  cd "$REPO_DIR"

  # Fetch latest from remote (quiet)
  if ! git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    log_warn "Failed to fetch from remote (network issue?)"
    return 1
  fi

  # Compare local and remote
  local local_hash remote_hash
  local_hash=$(git rev-parse HEAD 2>/dev/null)
  remote_hash=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

  if [ "$local_hash" = "$remote_hash" ]; then
    return 0  # No changes
  fi

  # Changes detected!
  local commit_count
  commit_count=$(git rev-list --count HEAD.."origin/$BRANCH" 2>/dev/null || echo "?")
  log "🔄 ${commit_count} new commit(s) detected on $BRANCH"

  # Show what changed
  git log --oneline HEAD.."origin/$BRANCH" 2>/dev/null | while read -r line; do
    log "   → $line"
  done

  # Pull changes (fast-forward only to avoid merge conflicts)
  if git pull --ff-only origin "$BRANCH" 2>/dev/null; then
    log_success "Pulled ${commit_count} commit(s) successfully"

    # Check if package.json changed (need npm install)
    if git diff --name-only "${local_hash}..HEAD" | grep -q "package.json"; then
      log "📦 package.json changed - running npm install..."
      npm install --production 2>/dev/null && log_success "Dependencies updated" || log_warn "npm install had issues"
    fi

    # Check if any lib/ or app/ files changed (need restart)
    if git diff --name-only "${local_hash}..HEAD" | grep -qE "^(lib/|app/|convex/)"; then
      restart_next_server
    else
      log "No runtime files changed, skip restart"
    fi

    return 0
  else
    log_error "Pull failed (merge conflict?). Manual intervention needed."
    log_warn "Run: cd $REPO_DIR && git pull --rebase origin $BRANCH"
    return 1
  fi
}

# Push local changes if any (for OpenClaw modifications)
check_and_push() {
  cd "$REPO_DIR"

  # Check for uncommitted changes
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    # There are local changes - auto-commit them
    local changed_files
    changed_files=$(git diff --name-only 2>/dev/null | head -5)

    git add -A 2>/dev/null
    git commit -m "auto: OpenClaw adjustment - $(date '+%Y-%m-%d %H:%M')

Files: ${changed_files}

Co-Authored-By: OpenClaw <openclaw@vps>" 2>/dev/null || true

    log "📤 Pushing OpenClaw changes..."
    if git push origin "$BRANCH" 2>/dev/null; then
      log_success "OpenClaw changes pushed to remote"
    else
      log_warn "Push failed - will retry next cycle"
    fi
  fi
}

# ============================================================================
# Main Loop
# ============================================================================

log "=========================================="
log "ClawTrading Sync Watcher v1.0"
log "=========================================="
log "Repo:     $REPO_DIR"
log "Branch:   $BRANCH"
log "Interval: ${CHECK_INTERVAL}s"
log "PID:      $$"
log "=========================================="

# Initial check
check_and_pull || true

while true; do
  sleep "$CHECK_INTERVAL"

  # Pull remote changes (from you/Claude)
  check_and_pull || true

  # Push local changes (from OpenClaw)
  check_and_push || true
done
