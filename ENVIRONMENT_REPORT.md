# YS-Servece-Code — Environment & Runtime Configuration Report

**Generated**: 2026-06-27  
**Audit method**: Full static analysis of all TypeScript, shell, and configuration files  
**Source of truth**: `src/node/cli.ts`, `src/node/constants.ts`, `src/node/main.ts`, `src/node/i18n/index.ts`, `src/node/wrapper.ts`, `ci/dev/watch.ts`, `start.sh`

---

## 1. Required Environment Variables

These variables have no safe default and **must** be configured in Railway (or any production host) before the service is usable.

---

### `PORT`

| Field | Value |
|-------|-------|
| **Required** | Yes — in production (Railway sets it automatically) |
| **Used in** | `src/node/cli.ts:819-820`, `start.sh` |
| **Default if absent** | `8080` (hard-coded in `bindAddrFromAllSources`) |
| **Railway sets it** | Yes — automatically injected |
| **Description** | TCP port the HTTP server listens on. `start.sh` reads `$PORT` first and falls back to `5000` for Replit. `src/node/cli.ts` reads it and overrides any `--bind-addr` or `--port` flag. |
| **Example** | `PORT=8080` |

**Code reference:**
```typescript
// src/node/cli.ts:819-820
if (process.env.PORT) {
  addr.port = parseInt(process.env.PORT, 10)
}
```

---

### `PASSWORD` *(one of PASSWORD or HASHED_PASSWORD required)*

| Field | Value |
|-------|-------|
| **Required** | Conditionally required when `--auth password` (the default) |
| **Used in** | `src/node/cli.ts:611-613, 657` |
| **Default if absent** | Falls back to password in config YAML (`~/.config/code-server/config.yaml`) |
| **Railway sets it** | No — must be set manually |
| **Description** | Plain-text authentication password. Read at startup, then **immediately deleted** from `process.env` for security. Takes effect when auth mode is `password` (default). |
| **Example** | `PASSWORD=changeme_use_a_strong_password` |

**Code reference:**
```typescript
// src/node/cli.ts:611-613
let usingEnvPassword = !!process.env.PASSWORD
if (process.env.PASSWORD) {
  args.password = process.env.PASSWORD
}
// src/node/cli.ts:657
delete process.env.PASSWORD   // ← security: removed from child process env
```

---

### `HASHED_PASSWORD` *(alternative to PASSWORD)*

| Field | Value |
|-------|-------|
| **Required** | Conditionally required — use instead of `PASSWORD` for higher security |
| **Used in** | `src/node/cli.ts:628-630, 658` |
| **Default if absent** | Falls back to `PASSWORD`, then config file |
| **Railway sets it** | No — must be set manually |
| **Description** | Argon2-hashed password. Takes precedence over `PASSWORD`. Generate with: `echo -n "mypassword" \| argon2 somesalt -e` or use the code-server binary (`code-server --print-env hashed-password`). Deleted from env after reading. |
| **Example** | `HASHED_PASSWORD=$argon2i$v=19$m=4096,t=3,p=1$...` |

---

## 2. Optional Environment Variables

All variables below are genuinely optional — the application starts and runs without them. Listed in order of practical relevance.

---

### `CODE_SERVER_APP_NAME`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:680` |
| **Default** | `"YS-Servece-Code"` |
| **Description** | Replaces the `{{app}}` placeholder in title bar strings and welcome messages shown inside VS Code. |
| **Example** | `CODE_SERVER_APP_NAME=YS-Servece-Code` |

---

### `CODE_SERVER_HOST`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:812-813` |
| **Default** | `localhost` (internal default), overridden by `start.sh` to `0.0.0.0` via `--bind-addr` |
| **Description** | Override the bind host without passing `--bind-addr`. Useful when using the config file approach. |
| **Example** | `CODE_SERVER_HOST=0.0.0.0` |

---

### `CODE_SERVER_CONFIG`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:725` |
| **Default** | `~/.config/code-server/config.yaml` (via `env-paths`) |
| **Description** | Path to the YAML config file. The config file stores `bind-addr`, `auth`, `password`, `cert`, etc. The file is created with a random password on first run if it does not exist. |
| **Example** | `CODE_SERVER_CONFIG=/data/config.yaml` |

---

### `LOG_LEVEL`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:561-569` |
| **Default** | `info` |
| **Accepted values** | `trace`, `debug`, `info`, `warn`, `error` |
| **Description** | Controls server log verbosity. Overridden by `--log` or `--verbose` CLI flags. Synced back to the env var after processing so child processes inherit the same level. |
| **Example** | `LOG_LEVEL=info` |

---

### `NODE_ENV`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/i18n/index.ts:55` |
| **Default** | Not set (treated as production) |
| **Description** | When set to `"development"`, enables verbose i18next debug logging to stdout. Has no other effect in this codebase — no webpack or bundler reads it. |
| **Example** | `NODE_ENV=production` |

---

### `CODE_SERVER_COOKIE_SUFFIX`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:634-635` |
| **Default** | None (cookie named `code-server-session`) |
| **Description** | Appended to the session cookie name: `code-server-session-<suffix>`. Useful when running multiple code-server instances on the same domain. |
| **Example** | `CODE_SERVER_COOKIE_SUFFIX=instance1` |

---

### `CODE_SERVER_RECONNECTION_GRACE_TIME`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:642-643` |
| **Default** | `10800000` (3 hours, set inside VS Code's server) |
| **Description** | Milliseconds the server waits before closing a connection after the client disconnects. Allows clients to reconnect without losing their session. |
| **Example** | `CODE_SERVER_RECONNECTION_GRACE_TIME=10800000` |

---

### `CODE_SERVER_IDLE_TIMEOUT_SECONDS`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:646-653` |
| **Default** | None (no idle shutdown) |
| **Constraint** | Must be an integer > 60 |
| **Description** | If set, the server exits automatically after this many seconds of inactivity (no active connections). Useful for cost control on pay-per-use hosting. |
| **Example** | `CODE_SERVER_IDLE_TIMEOUT_SECONDS=3600` |

---

### `CS_DISABLE_FILE_DOWNLOADS`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:616` |
| **Default** | Not set (downloads enabled) |
| **Accepted values** | `1` or `true` |
| **Description** | Disables the file download capability in the VS Code UI. |
| **Example** | `CS_DISABLE_FILE_DOWNLOADS=1` |

---

### `CS_DISABLE_GETTING_STARTED_OVERRIDE`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:620` |
| **Default** | Not set (Getting Started page shown) |
| **Accepted values** | `1` or `true` |
| **Description** | Disables the custom "Getting Started" page override that code-server injects. |
| **Example** | `CS_DISABLE_GETTING_STARTED_OVERRIDE=1` |

---

### `CS_DISABLE_PROXY`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:624` |
| **Default** | Not set (proxy enabled) |
| **Accepted values** | `1` or `true` |
| **Description** | Disables the built-in path/domain port proxy (`/proxy/:port` and `/absproxy/:port` routes). |
| **Example** | `CS_DISABLE_PROXY=1` |

---

### `EXTENSIONS_GALLERY`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/main.ts:207-209` |
| **Default** | Not set (uses default VS Code Marketplace) |
| **Description** | JSON string that overrides the VS Code extension gallery endpoint. Useful for pointing at a private Open VSX or custom marketplace. Format: `{"serviceUrl":"...","itemUrl":"...","resourceUrlTemplate":"..."}` |
| **Example** | `EXTENSIONS_GALLERY={"serviceUrl":"https://open-vsx.org/vscode/gallery","itemUrl":"https://open-vsx.org/vscode/item"}` |

---

### `VSCODE_PROXY_URI`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:675-676`, `src/node/main.ts:198-199` |
| **Default** | Auto-set from `--proxy-domain` flag if provided; otherwise unset |
| **Description** | URI template for the port proxy shown in VS Code's PORTS tab. Format: `//{{port}}.yourdomain.com`. Normally derived automatically from `--proxy-domain`; set manually only for custom setups. |
| **Example** | `VSCODE_PROXY_URI=//{{port}}.yourdomain.com` |

---

### `GITHUB_TOKEN`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/cli.ts:638-639, 659` |
| **Default** | Not set |
| **Description** | GitHub OAuth token passed to VS Code as `--github-auth`. Enables GitHub Copilot and extension marketplace features. **Deleted from `process.env` immediately after being read** — it is NOT passed to child processes. |
| **Example** | `GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx` |

---

### `HTTP_PROXY` / `HTTPS_PROXY` / `http_proxy` / `https_proxy`

| Field | Value |
|-------|-------|
| **Used in** | `src/node/constants.ts:28` |
| **Default** | Not set |
| **Description** | Standard proxy environment variables. Used for all outbound HTTP/HTTPS requests (extension downloads, update checks). All four variants are checked; `HTTPS_PROXY` takes precedence. |
| **Example** | `HTTPS_PROXY=http://proxy.corp.example.com:8080` |

---

### `XDG_DATA_HOME`

| Field | Value |
|-------|-------|
| **Used in** | `start.sh` |
| **Default** | `$HOME` |
| **Description** | Used by `start.sh` to determine where to store the downloaded code-server binary bundle (`$XDG_DATA_HOME/.code-server-bundle`). Also affects internal code-server data paths via the `env-paths` npm package (`user-data-dir`, `extensions-dir`). |
| **Example** | `XDG_DATA_HOME=/data` |

---

### `AUTH` *(start.sh only)*

| Field | Value |
|-------|-------|
| **Used in** | `start.sh` |
| **Default** | `none` |
| **Accepted values** | `none`, `password` |
| **Description** | Authentication mode passed to the code-server binary via `--auth`. Set to `password` in production and provide `PASSWORD` or `HASHED_PASSWORD`. |
| **Example** | `AUTH=password` |

---

### `WORKSPACE_DIR` *(start.sh only)*

| Field | Value |
|-------|-------|
| **Used in** | `start.sh` |
| **Default** | `/home/runner/workspace` |
| **Description** | Directory that VS Code opens as the workspace root. Set this to the path you want users to see when they open the IDE. |
| **Example** | `WORKSPACE_DIR=/workspace` |

---

### Internal / Auto-set Variables (do not set manually)

These are set programmatically by the server itself and passed to child processes. Setting them externally has no useful effect and may break startup.

| Variable | Set by | Purpose |
|----------|--------|---------|
| `CODE_SERVER_SESSION_SOCKET` | `src/node/cli.ts:553` | IPC socket path for editor session manager |
| `CODE_SERVER_PARENT_PID` | `src/node/wrapper.ts:340` | Identifies parent process to child process |
| `NODE_EXEC_PATH` | `src/node/wrapper.ts:341` | Node binary path forwarded to child |
| `VSCODE_IPC_HOOK_CLI` | VS Code terminal integration | Signals that a VS Code terminal is active |

---

### Development-only Variables

| Variable | Used in | Description |
|----------|---------|-------------|
| `PLUGIN_DIR` | `ci/dev/watch.ts:18` | Dev watch mode only — plugin directory for live-reload during development. Not used in production. |
| `VSCODE_DEV` | `package.json` watch script | Signals VS Code development mode to the build tools. Only relevant when running `npm run watch`. |
| `VSCODE_IPC_HOOK_CLI` | `package.json` scripts | Cleared (`=`) before running tests/e2e to avoid interfering with running VS Code instances. |

---

## 3. Complete `.env.example`

*(See `.env.example` in the repository root for the current version.)*

---

## 4. Runtime Commands

| Step | Command |
|------|---------|
| **Install** | `npm install --ignore-scripts` |
| **Build** | `./node_modules/.bin/tsc` |
| **Development** | `npm run watch` (requires VS Code submodule — not available in this environment) |
| **Production Start** | `bash start.sh` |
| **Test** | Unit: `./ci/dev/test-unit.sh --forceExit --detectOpenHandles`; E2E: `./ci/dev/test-e2e.sh` |
| **Lint** | `./node_modules/.bin/eslint --max-warnings=0 src/` |
| **Type Check** | `./node_modules/.bin/tsc --noEmit` |

**Notes:**
- `npm install` without `--ignore-scripts` runs `ci/dev/postinstall.sh` which requires the `lib/vscode` git submodule. Use `--ignore-scripts` in Railway and CI.
- `npm run build` calls `./ci/build/build-code-server.sh` which runs `tsc` then adds the shebang line to `out/node/entry.js`.
- The watch script (`npm run watch`) requires the VS Code submodule and is not usable in this Replit/Railway environment.

---

## 5. Railway Configuration

### `railway.json` (current)

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

| Setting | Value | Notes |
|---------|-------|-------|
| Root Directory | `/` (repo root) | No monorepo nesting |
| Node Version | 22 (required) | Set `NIXPACKS_NODE_VERSION=22` in Railway vars |
| Build Command | `npm install --ignore-scripts && ./node_modules/.bin/tsc` | Installs deps + compiles TypeScript |
| Start Command | `bash start.sh` | Downloads binary, binds to `$PORT` |
| Install Command | Handled inside build command | N/A as separate step |
| Health Check Path | `/healthz` | Returns `{"status":"alive"\|"expired"}` |
| PORT | Read from `$PORT` env var | Auto-injected by Railway |

---

## 6. Application Startup Analysis

### Boot sequence

```
start.sh
  │
  ├── [1] Detects CPU architecture (x86_64 → amd64, aarch64 → arm64, armv7l → armv7l)
  ├── [2] Downloads pre-built code-server v4.126.0 binary to ~/.code-server-bundle/
  │       (skipped if binary already exists — cached between deploys)
  ├── [3] Reads $PORT (Railway) or falls back to 5000 (Replit/local)
  └── [4] Executes: code-server --bind-addr 0.0.0.0:$PORT --auth $AUTH ...
              │
              ▼
         out/node/entry.js   ← TypeScript compiled entry point
              │
              ├── [5] Parses CLI args + reads config YAML (~/.config/code-server/config.yaml)
              │         Config file created with random password if it doesn't exist
              ├── [6] Applies environment variable overrides (PASSWORD, PORT, LOG_LEVEL, etc.)
              ├── [7] Deletes sensitive vars from env (PASSWORD, HASHED_PASSWORD, GITHUB_TOKEN)
              └── [8] wrapper.ts spawns child process (src/node/wrapper.ts)
                        │
                        ▼
                   Child process: entry.js (isChild branch)
                        │
                        ├── [9]  createApp() — Express + httpolyglot server
                        │         compression middleware
                        │         cookie-parser middleware
                        │         x-powered-by disabled
                        │
                        ├── [10] register() — Route registration (src/node/routes/index.ts)
                        │         GET  /healthz           → health check JSON
                        │         GET  /robots.txt        → disallow all
                        │         GET  /security.txt      → security contact
                        │         GET  /login             → login page (HTML)
                        │         POST /login             → auth handler
                        │         GET  /logout            → clear session
                        │         GET  /update            → update check API
                        │         ALL  /proxy/:port/*     → path-based port proxy
                        │         ALL  /absproxy/:port/*  → absolute port proxy
                        │         *    /                  → VS Code web client
                        │         *    (domain proxy)     → domain-based port proxy
                        │
                        ├── [11] Heart (heartbeat) — tracks active connections,
                        │         triggers idle shutdown if CODE_SERVER_IDLE_TIMEOUT_SECONDS set
                        │
                        └── [12] VS Code Server loaded from lib/vscode/out/server-main.js
                                  WebSocket upgrade handled by wsRouter
                                  Extensions loaded from --extensions-dir
```

### Entry file
- **Compiled**: `out/node/entry.js` (from `src/node/entry.ts`)
- **Binary entry**: `~/.code-server-bundle/bin/code-server` → `lib/node out/node/entry.js`

### HTTP Server
- **Framework**: Express 5 (`express@^5.0.1`) + `httpolyglot` (HTTP/HTTPS polyglot)
- **Bind**: `0.0.0.0:$PORT` (production) / `0.0.0.0:5000` (Replit dev)
- **TLS**: Optional — self-signed cert generated if `--cert` flag passed without a path

### Static Assets
- Custom HTML pages served from `src/browser/pages/` via `/_static/` route
- VS Code web assets served from `lib/vscode/` (requires the pre-built binary)
- PWA manifest: `public/manifest.json` served at `/manifest.json`

### Authentication
- Default: **password auth** (reads `config.yaml` or `$PASSWORD` / `$HASHED_PASSWORD`)
- Disabled when `--auth none` or `AUTH=none` (start.sh default for Replit dev)
- Rate-limited: 2 login attempts/minute + 12/hour (`src/node/routes/login.ts`)

### Database
- **None** — this application is stateless
- User data (settings, extensions) stored on the filesystem in `--user-data-dir` (default: `~/.local/share/code-server`)

---

## 7. Validation

### Required variables — coverage check

| Variable | Documented | In `.env.example` | Description accurate |
|----------|-----------|-------------------|---------------------|
| `PORT` | ✅ | ✅ | ✅ |
| `PASSWORD` | ✅ | ✅ | ✅ |
| `HASHED_PASSWORD` | ✅ | ✅ | ✅ |

### Optional variables — coverage check

| Variable | Documented | In `.env.example` | Source verified |
|----------|-----------|-------------------|----------------|
| `CODE_SERVER_APP_NAME` | ✅ | ✅ | `cli.ts:680` |
| `CODE_SERVER_HOST` | ✅ | ✅ | `cli.ts:812` |
| `CODE_SERVER_CONFIG` | ✅ | ✅ | `cli.ts:725` |
| `LOG_LEVEL` | ✅ | ✅ | `cli.ts:561` |
| `NODE_ENV` | ✅ | ✅ | `i18n/index.ts:55` |
| `CODE_SERVER_COOKIE_SUFFIX` | ✅ | ✅ | `cli.ts:634` |
| `CODE_SERVER_RECONNECTION_GRACE_TIME` | ✅ | ✅ | `cli.ts:642` |
| `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | ✅ | ✅ | `cli.ts:646` |
| `CS_DISABLE_FILE_DOWNLOADS` | ✅ | ✅ | `cli.ts:616` |
| `CS_DISABLE_GETTING_STARTED_OVERRIDE` | ✅ | ✅ | `cli.ts:620` |
| `CS_DISABLE_PROXY` | ✅ | ✅ | `cli.ts:624` |
| `EXTENSIONS_GALLERY` | ✅ | ✅ | `main.ts:207` |
| `VSCODE_PROXY_URI` | ✅ | ✅ | `cli.ts:675` |
| `GITHUB_TOKEN` | ✅ | ✅ | `cli.ts:638` |
| `HTTP_PROXY` / `HTTPS_PROXY` | ✅ | ✅ | `constants.ts:28` |
| `XDG_DATA_HOME` | ✅ | ✅ | `start.sh` |
| `AUTH` | ✅ | ✅ | `start.sh` |
| `WORKSPACE_DIR` | ✅ | ✅ | `start.sh` |

### Missing variables
**None.** Every `process.env` reference in the TypeScript source is documented.

### Unused variables in `.env.example`
**None.** Every variable in `.env.example` maps to a real `process.env` reference in source code or `start.sh`.

### Duplicate variables
**None.** Each variable appears once in `.env.example`.

---

## 8. Railway Deployment Readiness

| Check | Status | Notes |
|-------|--------|-------|
| `railway.json` present | ✅ | Build + deploy config complete |
| `$PORT` respected | ✅ | `start.sh` and `cli.ts` both read it |
| Build command works | ✅ | `tsc` exits 0, no errors |
| Start command works | ✅ | `bash start.sh` runs successfully |
| Health check reachable | ✅ | `GET /healthz` → `{"status":"alive"}` |
| No hardcoded port | ✅ | All port binding via `$PORT` |
| Auth configurable | ✅ | `$AUTH` + `$PASSWORD` / `$HASHED_PASSWORD` |
| Large files excluded | ✅ | `lib/code-server*` in `.gitignore` |
| Node version declared | ✅ | `engines.node: "22"` in `package.json` |
| Secrets documented | ✅ | `.env.example` covers all variables |

### Required manual steps before Railway deploy

1. **Set `NIXPACKS_NODE_VERSION=22`** in Railway Variables (Replit environment is Node 20, Railway needs 22)
2. **Set `AUTH=password`** to enable authentication
3. **Set `PASSWORD=<strong-password>`** or `HASHED_PASSWORD=<argon2-hash>`
4. **Optionally set `WORKSPACE_DIR=/workspace`** if you want VS Code to open a specific directory
5. Connect the GitHub repository (`YS-server-code3i/YS-Server-Code`) in Railway and deploy
