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
# Start
# ---------------------------------------------------------------------------
# Bind address: always 0.0.0.0 so the proxy/load-balancer can reach us.
# Port: prefer $PORT (Railway/Heroku auto-inject) then fall back to 5000 (Replit).
BIND_PORT="${PORT:-5000}"

echo "[start.sh] Starting YS-Servece-Code on 0.0.0.0:${BIND_PORT} (auth=${AUTH:-none}) ..."

exec "$BINARY" \
  --bind-addr "0.0.0.0:${BIND_PORT}" \
  --auth "${AUTH:-none}" \
  --disable-telemetry \
  --disable-update-check \
  "${WORKSPACE_DIR:-/home/runner/workspace}"
