#!/bin/bash
# National Cleft Registry -- Main Hub launcher
# Run this script to start the server: ./start.sh
# The app will be available at http://localhost:3000

set -e
cd "$(dirname "$0")"
APPDIR="$(pwd)"

if [ ! -f ".env" ]; then
  echo
  echo "ERROR: .env file not found."
  echo "Copy .env.example to .env and fill in real secret values before first run."
  echo
  exit 1
fi

# Use the bundled portable Node.js if present, otherwise fall back to a
# system-installed "node" on PATH.
NODE_BIN="./node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="node"
fi

# Force an absolute database path based on THIS folder's real location,
# regardless of what's written in .env. This avoids a relative "file:" path
# being resolved inconsistently between the migration script and the
# compiled server bundle.
export DATABASE_URL="file:$APPDIR/main_hub.db"

if [ ! -f "main_hub.db" ]; then
  echo "First run detected -- setting up the database..."
  "$NODE_BIN" migrate.mjs
fi

echo "Starting National Cleft Registry - Main Hub..."
echo "Once you see \"Ready\", open http://localhost:3000 in your browser."
echo

PORT=3000 "$NODE_BIN" server.js
