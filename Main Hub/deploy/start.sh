#!/bin/bash
# National Cleft Registry -- Main Hub launcher.  Run:  ./start.sh
# The app will be available at http://localhost:3000 (and http://<this-pc-ip>:3000 on the network)
set -e
cd "$(dirname "$0")"
APPDIR="$(pwd)"

NODE_BIN="./node/bin/node"
[ -x "$NODE_BIN" ] || NODE_BIN="node"
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Put a portable Node.js in ./node (see DEPLOY.md)."; exit 1
fi

# 1. Create .env with fresh random secrets on first run (never overwrites real values).
"$NODE_BIN" setup-env.mjs

# 2. Absolute database path based on this folder's real location.
export DATABASE_URL="file:$APPDIR/main_hub.db"
export NODE_ENV=production

# 3. Back up the existing database, then apply any new migrations (safe every start).
[ -f main_hub.db ] && "$NODE_BIN" backup.mjs || true
"$NODE_BIN" migrate.mjs

echo "Starting National Cleft Registry - Main Hub..."
echo "Once you see \"Ready\", open http://localhost:${PORT:-3000} in your browser."
echo "On first run, the SETUP TOKEN for creating the administrator is printed below."
echo
PORT="${PORT:-3000}" HOSTNAME="${HOSTNAME_BIND:-0.0.0.0}" exec "$NODE_BIN" server.js
