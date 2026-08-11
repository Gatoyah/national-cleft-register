#!/bin/bash
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/dist"
rm -rf "$OUT"
mkdir -p "$OUT"

for APP in "Main Hub:main-hub:3000" "Regional Hub:regional-hub:3001"; do
  SRC_NAME="${APP%%:*}"
  REST="${APP#*:}"
  PKG_NAME="${REST%%:*}"
  PORT="${REST##*:}"

  SRC="$ROOT/$SRC_NAME"
  DEST="$OUT/$PKG_NAME"
  mkdir -p "$DEST"

  # 1. Standalone server + pruned node_modules.
  #    -a (archive) preserves symlinks as symlinks, instead of -r which can
  #    dereference or mishandle them -- Turbopack's build creates a relative
  #    symlink at .next/node_modules/@libsql/client-<hash> that must survive
  #    this copy for native module resolution to work at runtime.
  cp -a "$SRC/.next/standalone/$SRC_NAME/." "$DEST/"

  # Next's file tracer can accidentally bundle the local dev SQLite database
  # (and any dev .env) into the standalone output. Strip them so every real
  # deployment starts from a genuinely clean, empty database.
  find "$DEST" -maxdepth 1 \( -name "*.db" -o -name ".env" \) -delete

  # Re-point that symlink at the *packaged* node_modules location, since its
  # original relative target (several directories up, into the dev repo) no
  # longer resolves once this folder is moved/copied elsewhere.
  ALIAS_DIR="$DEST/.next/node_modules/@libsql"
  if [ -d "$ALIAS_DIR" ]; then
    for link in "$ALIAS_DIR"/client-*; do
      [ -L "$link" ] || continue
      rm -f "$link"
      ln -s "../../../node_modules/@libsql/client" "$link"
    done
  fi

  # 2. Static assets (NOT included in standalone output by default)
  mkdir -p "$DEST/.next/static"
  cp -r "$SRC/.next/static/." "$DEST/.next/static/"

  # 3. public/ folder, if present
  if [ -d "$SRC/public" ]; then
    cp -r "$SRC/public" "$DEST/public"
  fi

  # 4. .env.example (NOT .env -- that must be created per-deployment with real secrets)
  cp "$SRC/.env.example" "$DEST/.env.example"

  # 5. Migration files + init scripts (no drizzle-kit/npm needed at deploy time)
  [ -f "$SRC/migrate.mjs" ] && cp "$SRC/migrate.mjs" "$DEST/migrate.mjs"
  [ -d "$SRC/drizzle" ] && cp -r "$SRC/drizzle" "$DEST/drizzle"
  [ -f "$SRC/init-db.mjs" ] && cp "$SRC/init-db.mjs" "$DEST/init-db.mjs"

  # 6. Deployment guide + launcher scripts
  cp "$ROOT/DEPLOY.md" "$DEST/DEPLOY.md"
  [ -f "$SRC/deploy/start.bat" ] && cp "$SRC/deploy/start.bat" "$DEST/start.bat"
  [ -f "$SRC/deploy/start.sh" ] && cp "$SRC/deploy/start.sh" "$DEST/start.sh" && chmod +x "$DEST/start.sh"

  echo "Packaged $PKG_NAME -> $DEST ($(du -sh "$DEST" | cut -f1))"
done
