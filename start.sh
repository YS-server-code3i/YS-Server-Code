#!/bin/bash
set -e

# Determine bundle directory — use XDG_DATA_HOME if set, otherwise ~/.code-server-bundle
BUNDLE="${XDG_DATA_HOME:-$HOME}/.code-server-bundle"
BINARY="$BUNDLE/bin/code-server"

# Detect architecture for the correct download
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH_SLUG="amd64" ;;
  aarch64) ARCH_SLUG="arm64" ;;
  armv7l)  ARCH_SLUG="armv7l" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

CS_VERSION="4.126.0"
CS_URL="https://github.com/coder/code-server/releases/download/v${CS_VERSION}/code-server-${CS_VERSION}-linux-${ARCH_SLUG}.tar.gz"

# Download the pre-built binary if missing (e.g. first boot or container restart)
if [ ! -f "$BINARY" ]; then
  echo "[start.sh] code-server bundle not found — downloading v${CS_VERSION} (${ARCH_SLUG})..."
  ARCHIVE="/tmp/code-server-${CS_VERSION}-${ARCH_SLUG}.tar.gz"
  curl -fsSL "$CS_URL" -o "$ARCHIVE"
  mkdir -p "$BUNDLE"
  tar -xzf "$ARCHIVE" -C "$BUNDLE" --strip-components=1
  rm -f "$ARCHIVE"
  echo "[start.sh] Download complete."
fi

# Bind address: always 0.0.0.0 so the proxy/load-balancer can reach us.
# Port: prefer $PORT (set by Railway/Heroku/etc.) then fall back to 5000.
BIND_PORT="${PORT:-5000}"

echo "[start.sh] Starting YS-Servece-Code on 0.0.0.0:${BIND_PORT} ..."

exec "$BINARY" \
  --bind-addr "0.0.0.0:${BIND_PORT}" \
  --auth "${AUTH:-none}" \
  --disable-telemetry \
  --disable-update-check \
  "${WORKSPACE_DIR:-/home/runner/workspace}"
