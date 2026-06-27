# YS-Servece-Code — Deployment Guide

## Overview

YS-Servece-Code is a cloud-powered VS Code development environment that runs in the browser. This guide covers deploying to **Railway** (primary target) and general deployment considerations.

---

## Railway Deployment (Recommended)

### Prerequisites

- A Railway account at <https://railway.app>
- This repository pushed to GitHub (already configured)

### Quick Deploy

1. **Create a new Railway project** and connect to this GitHub repository.
2. **Set environment variables** (see [Environment Variables](#environment-variables) below).
3. Railway will automatically detect `railway.json` and run the build + start commands.

### Build Pipeline

| Step | Command |
|------|---------|
| Install | `npm install --ignore-scripts` |
| Compile | `./node_modules/.bin/tsc` |
| Start | `bash start.sh` |

`start.sh` downloads the pre-built code-server binary (v4.126.0) on first boot if not cached, then launches it bound to `0.0.0.0:$PORT`.

### Health Check

- **Endpoint**: `GET /healthz`
- **Expected response**: `200 OK` with JSON `{ "status": "alive" | "expired" }`
- **Timeout**: 60 seconds

---

## Environment Variables

Copy `.env.example` to `.env` for local development. On Railway, set these in the **Variables** tab.

### Required

| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on. Railway sets this automatically. |
| `PASSWORD` | Plain-text password for authentication. |
| `HASHED_PASSWORD` | Argon2-hashed password (takes precedence over `PASSWORD`). |

> **Note:** If neither `PASSWORD` nor `HASHED_PASSWORD` is set, authentication falls back to the `config.yaml` file. For Railway deployments always set one of the password variables.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_SERVER_APP_NAME` | `YS-Servece-Code` | Title bar / welcome message app name. |
| `CODE_SERVER_HOST` | `0.0.0.0` | Override bind address. |
| `CODE_SERVER_CONFIG` | `~/.config/code-server/config.yaml` | Path to config file. |
| `CODE_SERVER_COOKIE_SUFFIX` | — | Suffix for the session cookie name. |
| `CODE_SERVER_RECONNECTION_GRACE_TIME` | `10800000` | Client reconnect grace period (ms). |
| `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | — | Idle shutdown timeout (seconds, min 60). |
| `CS_DISABLE_FILE_DOWNLOADS` | — | Set `1` to disable file downloads. |
| `CS_DISABLE_GETTING_STARTED_OVERRIDE` | — | Set `1` to disable the Getting Started page. |
| `CS_DISABLE_PROXY` | — | Set `1` to disable the built-in path/domain proxy. |
| `GITHUB_TOKEN` | — | GitHub OAuth token for extension marketplace. |
| `LOG_LEVEL` | `info` | Log verbosity: `trace`, `debug`, `info`, `warn`, `error`. |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | Outbound proxy for extension downloads. |
| `VSCODE_PROXY_URI` | — | URI template for port proxying. |

---

## Node Version

**Node 22** is required (see `package.json` → `engines.node`).

On Railway with Nixpacks, specify in `.nvmrc` or via the `NIXPACKS_NODE_VERSION` variable:

```
NIXPACKS_NODE_VERSION=22
```

---

## Local Development

```bash
# Install dependencies (skip scripts — VS Code submodule not required)
npm install --ignore-scripts

# Compile TypeScript
./node_modules/.bin/tsc

# Run (no password auth, bound to port 5000)
node out/node/entry.js --auth none --bind-addr 0.0.0.0:5000 .

# Or use the pre-built binary via start.sh
bash start.sh
```

---

## Dockerfile (Alternative)

If you prefer Docker over Nixpacks, create a `Dockerfile` based on `node:22-slim`:

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN ./node_modules/.bin/tsc

# Download code-server binary
RUN curl -fsSL https://github.com/coder/code-server/releases/download/v4.126.0/code-server-4.126.0-linux-amd64.tar.gz \
    | tar -xz -C /tmp && \
    mkdir -p /root/.code-server-bundle && \
    cp -r /tmp/code-server-4.126.0-linux-amd64/* /root/.code-server-bundle/

EXPOSE 8080

CMD ["bash", "start.sh"]
```

---

## Security Notes

- Always set a strong `PASSWORD` or `HASHED_PASSWORD` in production.
- Never expose the server without authentication on a public URL.
- The `GITHUB_TOKEN` variable is automatically deleted from the environment after being read (security measure).
- Use Railway's secret variable storage — never commit `.env` to the repository.
