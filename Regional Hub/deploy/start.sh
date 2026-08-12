#!/bin/bash
# National Cleft Registry -- Regional Hub launcher
# Run this script to start the server: ./start.sh
# The app will be available at http://localhost:3001

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

NODE_BIN="./node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="node"
fi

# Force an absolute database path based on THIS folder's real location,
# regardless of what's written in .env. This avoids a relative "file:" path
# being resolved inconsistently between the setup script and the compiled
# server bundle.
export DATABASE_URL="file:$APPDIR/local.db"

if [ ! -f "local.db" ]; then
  echo "First run detected -- setting up the database..."
  "$NODE_BIN" init-db.mjs
fi

echo "Starting National Cleft Registry - Regional Hub..."
echo "Once you see \"Ready\", open http://localhost:3001 in your browser."
echo

PORT=3001 "$NODE_BIN" server.js
