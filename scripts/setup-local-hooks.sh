#!/bin/bash
# ============================================================================
# Setup local git hooks for auto-push to VPS
# Run this once on your local machine:
#   chmod +x scripts/setup-local-hooks.sh
#   ./scripts/setup-local-hooks.sh
# ============================================================================

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_FILE="$REPO_DIR/.git/hooks/post-commit"

echo "Setting up auto-push hook..."

cat > "$HOOK_FILE" << 'HOOK'
#!/bin/bash
# Auto-push to remote after every commit
# This triggers the VPS sync-watcher to pull changes

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$BRANCH" = "main" ]; then
  echo "🔄 Auto-pushing to origin/main..."
  git push origin main --quiet 2>/dev/null &
  PUSH_PID=$!

  # Don't block the commit - push in background
  # If push fails, sync-watcher will catch it next cycle
  disown $PUSH_PID 2>/dev/null || true
  echo "✅ Push started in background"
fi
HOOK

chmod +x "$HOOK_FILE"
echo "✅ Post-commit hook installed at: $HOOK_FILE"
echo ""
echo "Now every commit on 'main' will auto-push to your VPS."
echo "The VPS sync-watcher will detect and pull within 15 seconds."
