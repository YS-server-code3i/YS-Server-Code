# YS-Servece-Code — Deployment Guide

## Overview

YS-Servece-Code runs VS Code in the browser via the [code-server](https://github.com/coder/code-server) runtime. This guide covers deploying to **Railway** (primary target) and general production considerations.

For the full environment variable reference, see [`ENVIRONMENT_REPORT.md`](./ENVIRONMENT_REPORT.md).

---

## How the Application Starts

```
start.sh
  ├─ Detects CPU arch → downloads code-server v4.126.0 binary (cached after first boot)
  ├─ Reads $PORT (Railway auto-injects) → falls back to 5000
  └─ Runs: code-server --bind-addr 0.0.0.0:$PORT --auth $AUTH $WORKSPACE_DIR
              │
              └─ out/node/entry.js  (TypeScript compiled)
                    ├─ Parses CLI args + reads ~/.config/code-server/config.yaml
                    ├─ Applies env var overrides (PORT, PASSWORD, LOG_LEVEL …)
                    ├─ Deletes secrets from env (PASSWORD, HASHED_PASSWORD, GITHUB_TOKEN)
                    └─ Express 5 server on $PORT
                          ├─ GET  /healthz     → health check
                          ├─ GET  /login       → login page
                          ├─ POST /login       → authenticate
                          ├─ ALL  /proxy/:port → port proxy
                          └─ *    /            → VS Code web client
```

---

## Railway Deployment

### Prerequisites

- Railway account at <https://railway.app>
- This repository connected to Railway via GitHub

### Quick-start

1. **Create a new Railway project** and link the `YS-server-code3i/YS-Server-Code` repository.
2. **Add the required variables** (see table below) in Railway → Variables.
3. Railway detects `railway.json` automatically and runs the build + start pipeline.

### railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install --ignore-scripts && ./node_modules/.bin/tsc"
  },
  "deploy": {
    "startCommand": "bash start.sh",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Required Railway Variables

Set these in **Railway → Variables** before deploying:

| Variable | Example Value | Notes |
|----------|--------------|-------|
| `NIXPACKS_NODE_VERSION` | `22` | Required — package.json engines.node is 22 |
| `AUTH` | `password` | Use `none` only for private/trusted networks |
| `PASSWORD` | `your-strong-password` | Or use `HASHED_PASSWORD` |
| `WORKSPACE_DIR` | `/workspace` | Directory VS Code opens |

### Optional Railway Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODE_SERVER_APP_NAME` | `YS-Servece-Code` | Title bar name |
| `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | (none) | Auto-shutdown when idle (saves cost) |
| `LOG_LEVEL` | `info` | `trace`/`debug`/`info`/`warn`/`error` |
| `EXTENSIONS_GALLERY` | (VS Code Marketplace) | Custom extension registry JSON |
| `CODE_SERVER_RECONNECTION_GRACE_TIME` | `10800000` | Reconnect window in ms |

### Health Check

- **Endpoint**: `GET /healthz`
- **Success response** (200):
  ```json
  { "status": "alive", "lastHeartbeat": 1234567890 }
  ```
- **Degraded response** (200, status `expired`): server is running but no active connections.

---

## Local Development

```bash
# 1. Install dependencies (--ignore-scripts skips postinstall which needs the VS Code submodule)
npm install --ignore-scripts

# 2. Compile TypeScript
./node_modules/.bin/tsc

# 3. Run with no auth on port 5000
bash start.sh
# or directly:
node out/node/entry.js --auth none --bind-addr 0.0.0.0:5000 .

# 4. Open http://localhost:5000
```

### Replit

The `Start application` workflow runs `bash start.sh` which binds to port 5000 with `AUTH=none`. The pre-built code-server binary is downloaded to `~/.code-server-bundle/` on first run.

---

## Environment Variables

See **[`.env.example`](./.env.example)** for the complete reference with one entry per variable, including the exact source file and line number where each variable is consumed.

See **[`ENVIRONMENT_REPORT.md`](./ENVIRONMENT_REPORT.md)** for the full audit report.

### Minimum production `.env`

```bash
PORT=8080                    # set by Railway automatically
AUTH=password
PASSWORD=your-strong-password
WORKSPACE_DIR=/workspace
NIXPACKS_NODE_VERSION=22     # Railway Nixpacks setting
```

---

## Build Commands

| Step | Command |
|------|---------|
| Install | `npm install --ignore-scripts` |
| Compile | `./node_modules/.bin/tsc` |
| Type check | `./node_modules/.bin/tsc --noEmit` |
| Lint | `./node_modules/.bin/eslint --max-warnings=0 src/` |
| Start | `bash start.sh` |

**Important**: Do not run `npm install` without `--ignore-scripts` unless the `lib/vscode` git submodule is initialized. The postinstall script (`ci/dev/postinstall.sh`) requires the submodule.

---

## Node Version

**Node 22 required** (declared in `package.json` → `engines.node: "22"`).

On Railway with Nixpacks, set:
```
NIXPACKS_NODE_VERSION=22
```

---

## Security Notes

- Always set a strong `PASSWORD` or `HASHED_PASSWORD` in production.
- `PASSWORD`, `HASHED_PASSWORD`, and `GITHUB_TOKEN` are deleted from `process.env` immediately after being read — they are never passed to VS Code child processes.
- The session cookie is `HttpOnly` and `SameSite=strict`.
- Login is rate-limited: 2 attempts/minute + 12 attempts/hour.
- Use Railway's secret variable storage — never commit `.env` to the repository.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Build fails: `tsc not found` | Dependencies not installed | Run `npm install --ignore-scripts` first |
| Build fails: `postinstall error` | Running without `--ignore-scripts` | Add the flag |
| `code-server` binary not found | First boot, slow download | Increase Railway healthcheck timeout to 120s |
| Port not opening | Wrong `$PORT` binding | Verify `AUTH` and `PORT` vars in Railway |
| Auth loop / can't log in | Password not set | Set `PASSWORD` or `HASHED_PASSWORD` and redeploy |
| Extension marketplace 404 | Default marketplace blocked | Set `EXTENSIONS_GALLERY` to Open VSX |
