#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# YS-Servece-Code — startup script
# Works in: Replit (dev), Railway (production), Docker, bare Linux
# ---------------------------------------------------------------------------

# Determine bundle directory — use XDG_DATA_HOME if set, otherwise ~/.code-server-bundle
BUNDLE="${XDG_DATA_HOME:-$HOME}/.code-server-bundle"
BINARY="$BUNDLE/bin/code-server"

# ---------------------------------------------------------------------------
# Pre-flight: validate auth configuration before attempting anything else
# ---------------------------------------------------------------------------
if [ "${AUTH:-none}" = "password" ]; then
  if [ -z "${PASSWORD:-}" ] && [ -z "${HASHED_PASSWORD:-}" ]; then
    echo "[start.sh] ERROR: AUTH=password requires PASSWORD or HASHED_PASSWORD to be set." >&2
    echo "[start.sh]        Set one of these environment variables and redeploy." >&2
    exit 1
  fi
fi

if [ "${AUTH:-none}" = "none" ]; then
  echo "[start.sh] WARNING: Authentication is disabled (AUTH=none)." >&2
  echo "[start.sh]          Set AUTH=password and PASSWORD=<secret> for production." >&2
fi

# ---------------------------------------------------------------------------
# Architecture detection
# ---------------------------------------------------------------------------
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH_SLUG="amd64" ;;
  aarch64) ARCH_SLUG="arm64" ;;
  armv7l)  ARCH_SLUG="armv7l" ;;
  *)
    echo "[start.sh] ERROR: Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

CS_VERSION="4.126.0"
CS_URL="https://github.com/coder/code-server/releases/download/v${CS_VERSION}/code-server-${CS_VERSION}-linux-${ARCH_SLUG}.tar.gz"

# ---------------------------------------------------------------------------
# Download the pre-built binary if missing (first boot or fresh container)
# ---------------------------------------------------------------------------
if [ ! -f "$BINARY" ]; then
  echo "[start.sh] code-server v${CS_VERSION} (${ARCH_SLUG}) not found — downloading..."
  ARCHIVE="/tmp/code-server-${CS_VERSION}-${ARCH_SLUG}.tar.gz"

  if ! curl -fsSL --retry 3 --retry-delay 5 "$CS_URL" -o "$ARCHIVE"; then
    echo "[start.sh] ERROR: Failed to download code-server binary from:" >&2
    echo "[start.sh]        $CS_URL" >&2
    exit 1
  fi

  mkdir -p "$BUNDLE"
  tar -xzf "$ARCHIVE" -C "$BUNDLE" --strip-components=1
  rm -f "$ARCHIVE"
  echo "[start.sh] Download complete — binary at $BINARY"
fi

# ---------------------------------------------------------------------------
# Compile TypeScript companion server (if source exists and node_modules ready)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPANION_OUT="$SCRIPT_DIR/out/node/companion.js"

if [ -f "$SCRIPT_DIR/src/node/companion.ts" ] && [ -d "$SCRIPT_DIR/node_modules" ]; then
  if [ ! -f "$COMPANION_OUT" ] || \
     [ "$SCRIPT_DIR/src/node/companion.ts" -nt "$COMPANION_OUT" ] || \
     [ "$SCRIPT_DIR/src/node/routes/ai.ts" -nt "$COMPANION_OUT" ]; then
    echo "[start.sh] Compiling TypeScript companion server..."
    cd "$SCRIPT_DIR"
    if ./node_modules/.bin/tsc --noEmit false 2>/dev/null; then
      echo "[start.sh] TypeScript compilation complete"
    else
      echo "[start.sh] WARNING: TypeScript compilation had errors, attempting anyway..." >&2
      ./node_modules/.bin/tsc --noEmit false --skipLibCheck 2>/dev/null || true
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Start companion API server (background, port 3001)
# ---------------------------------------------------------------------------
COMPANION_PORT="${COMPANION_PORT:-3001}"
if [ -f "$COMPANION_OUT" ] && command -v node >/dev/null 2>&1; then
  echo "[start.sh] Starting companion API server on port ${COMPANION_PORT}..."
  COMPANION_PORT="$COMPANION_PORT" \
  WORKSPACE_DIR="${WORKSPACE_DIR:-/home/runner/workspace}" \
    node "$COMPANION_OUT" &
  COMPANION_PID=$!
  echo "[start.sh] Companion PID: $COMPANION_PID"

  # Give companion server a moment to start
  sleep 1

  # Verify it started
  if kill -0 "$COMPANION_PID" 2>/dev/null; then
    echo "[start.sh] Companion server running"
  else
    echo "[start.sh] WARNING: Companion server may have failed to start" >&2
  fi
else
  echo "[start.sh] Companion server not available (compiled output not found), skipping"
fi

# ---------------------------------------------------------------------------
# Build & install YS AI VS Code extension
# ---------------------------------------------------------------------------
EXT_SRC="$SCRIPT_DIR/extensions/ys-ai"
EXT_INSTALL="${XDG_DATA_HOME:-$HOME}/.local/share/code-server/extensions/ys-ai"
EXT_OUT="$EXT_SRC/out/extension.js"

if [ -d "$EXT_SRC/src" ]; then
  # Install extension npm deps if missing
  if [ ! -d "$EXT_SRC/node_modules/@types/vscode" ]; then
    echo "[start.sh] Installing YS AI extension dev dependencies..."
    cd "$EXT_SRC"
    npm install --ignore-scripts --silent 2>/dev/null || true
    cd "$SCRIPT_DIR"
  fi

  # Compile extension TS if source is newer than output
  if [ ! -f "$EXT_OUT" ] || [ "$EXT_SRC/src/extension.ts" -nt "$EXT_OUT" ] || [ "$EXT_SRC/src/providers/ChatViewProvider.ts" -nt "$EXT_OUT" ]; then
    echo "[start.sh] Compiling YS AI extension TypeScript..."
    cd "$EXT_SRC"
    if ./node_modules/.bin/tsc 2>/dev/null; then
      echo "[start.sh] Extension compiled successfully"
    else
      echo "[start.sh] WARNING: Extension compilation had errors" >&2
      ./node_modules/.bin/tsc --skipLibCheck 2>/dev/null || true
    fi
    cd "$SCRIPT_DIR"
  fi

  # Copy compiled extension into code-server extensions directory
  if [ -f "$EXT_OUT" ]; then
    mkdir -p "$EXT_INSTALL"
    cp -r "$EXT_SRC/out" "$EXT_INSTALL/"
    cp "$EXT_SRC/package.json" "$EXT_INSTALL/"
    cp -r "$EXT_SRC/media" "$EXT_INSTALL/"
    echo "[start.sh] YS AI extension installed to $EXT_INSTALL"
  fi
fi

# ---------------------------------------------------------------------------
# Start code-server
# ---------------------------------------------------------------------------
# Bind address: always 0.0.0.0 so the proxy/load-balancer can reach us.
# Port: prefer $PORT (Railway/Heroku auto-inject) then fall back to 5000 (Replit).
BIND_PORT="${PORT:-5000}"

echo "[start.sh] Starting YS-Servece-Code on 0.0.0.0:${BIND_PORT} (auth=${AUTH:-none}) ..."
echo "[start.sh] AI API accessible via code-server port proxy at: /proxy/${COMPANION_PORT}/api/ai/"
echo "[start.sh] AI Chat UI accessible via code-server port proxy at: /proxy/${COMPANION_PORT}/"

exec "$BINARY" \
  --bind-addr "0.0.0.0:${BIND_PORT}" \
  --auth "${AUTH:-none}" \
  --disable-telemetry \
  --disable-update-check \
  "${WORKSPACE_DIR:-/home/runner/workspace}"
