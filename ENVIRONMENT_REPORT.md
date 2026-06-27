# YS-Servece-Code — Environment Variable & Runtime Configuration Audit

**Generated**: 2026-06-27  
**Audit method**: Static grep of every `process.env.*`, `import.meta.env.*`, and `Deno.env.get()` call across all source files  
**Scope**: `src/`, `ci/`, `test/`, `start.sh`, `.github/workflows/` — third-party bundles (`lib/`, `node_modules/`) excluded

---

## Scan Results Summary

| API searched | Occurrences in app source | Occurrences in tests | Occurrences in CI/workflows |
|---|---|---|---|
| `process.env.*` | 38 (across 5 files) | 60+ (test setup/teardown) | 20+ (CI pipeline only) |
| `import.meta.env.*` | **0** | 0 | 0 |
| `Deno.env.get()` | **0** | 0 | 0 |

`import.meta.env` and `Deno.env.get` are **not used anywhere** in this codebase.  
All environment configuration goes through `process.env`.

---

## Master Variable Table — Application Source (`src/`, `start.sh`)

Every `process.env` reference in `src/` and `start.sh`, deduplicated to one row per variable, with every line it appears on.

| # | Variable | File(s) | Line(s) | R/W | Category | Required? | Default |
|---|----------|---------|--------|-----|----------|-----------|---------|
| 1 | `PORT` | `src/node/cli.ts` | 819, 820 | R | Networking | No (Railway injects) | 8080 |
| 2 | `PORT` | `start.sh` | 36 | R | Networking | No (Railway injects) | 5000 |
| 3 | `CODE_SERVER_HOST` | `src/node/cli.ts` | 812, 813 | R | Networking | No | `localhost` |
| 4 | `PASSWORD` | `src/node/cli.ts` | 611, 612, 613, 657 | R+del | Auth | Cond. required | — |
| 5 | `HASHED_PASSWORD` | `src/node/cli.ts` | 628, 629, 630, 658 | R+del | Auth | Cond. required | — |
| 6 | `LOG_LEVEL` | `src/node/cli.ts` | 561, 562, 564, 569 | R+W | Logging | No | `info` |
| 7 | `CS_DISABLE_FILE_DOWNLOADS` | `src/node/cli.ts` | 616 | R | Feature flag | No | unset |
| 8 | `CS_DISABLE_GETTING_STARTED_OVERRIDE` | `src/node/cli.ts` | 620 | R | Feature flag | No | unset |
| 9 | `CS_DISABLE_PROXY` | `src/node/cli.ts` | 624 | R | Feature flag | No | unset |
| 10 | `CODE_SERVER_COOKIE_SUFFIX` | `src/node/cli.ts` | 634, 635 | R | Session | No | unset |
| 11 | `GITHUB_TOKEN` | `src/node/cli.ts` | 638, 639, 659 | R+del | Auth | No | unset |
| 12 | `CODE_SERVER_RECONNECTION_GRACE_TIME` | `src/node/cli.ts` | 642, 643 | R | Connection | No | `10800000` |
| 13 | `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | `src/node/cli.ts` | 646, 647, 650, 653 | R | Connection | No | unset |
| 14 | `VSCODE_PROXY_URI` | `src/node/cli.ts` | 675, 676 | R+W | Proxy | No | auto-set |
| 15 | `VSCODE_PROXY_URI` | `src/node/main.ts` | 198, 199 | R | Proxy | No | auto-set |
| 16 | `CODE_SERVER_APP_NAME` | `src/node/cli.ts` | 680 | R | Branding | No | `YS-Servece-Code` |
| 17 | `CODE_SERVER_CONFIG` | `src/node/cli.ts` | 725 | R | Config | No | `~/.config/code-server/config.yaml` |
| 18 | `VSCODE_IPC_HOOK_CLI` | `src/node/cli.ts` | 851, 853 | R | Internal | No | set by VS Code |
| 19 | `CODE_SERVER_SESSION_SOCKET` | `src/node/cli.ts` | 553 | **W** | Internal | No | auto-written |
| 20 | `HTTPS_PROXY` | `src/node/constants.ts` | 28 | R | Proxy | No | unset |
| 21 | `https_proxy` | `src/node/constants.ts` | 28 | R | Proxy | No | unset |
| 22 | `HTTP_PROXY` | `src/node/constants.ts` | 28 | R | Proxy | No | unset |
| 23 | `http_proxy` | `src/node/constants.ts` | 28 | R | Proxy | No | unset |
| 24 | `NODE_ENV` | `src/node/i18n/index.ts` | 55 | R | Logging | No | unset |
| 25 | `EXTENSIONS_GALLERY` | `src/node/main.ts` | 207, 209 | R | Extensions | No | unset |
| 26 | `CODE_SERVER_PARENT_PID` | `src/node/main.ts` | 54 | **W** | Internal | No | auto-written |
| 27 | `CODE_SERVER_PARENT_PID` | `src/node/wrapper.ts` | 377, 378 | R | Internal | No | auto-written |
| 28 | `AUTH` | `start.sh` | 42 | R | Auth | No | `none` |
| 29 | `WORKSPACE_DIR` | `start.sh` | 45 | R | Filesystem | No | `/home/runner/workspace` |
| 30 | `XDG_DATA_HOME` | `start.sh` | 5 | R | Filesystem | No | `$HOME` |

**R** = read by application at runtime  
**W** = written by application (do not set manually)  
**R+del** = read then deleted from `process.env` (not passed to child processes)

---

## Master Variable Table — CI / Dev Scripts (`ci/`)

Variables used only during development or the build pipeline — **not applicable to Railway**.

| # | Variable | File | Line | R/W | Purpose |
|---|----------|------|------|-----|---------|
| 31 | `PLUGIN_DIR` | `ci/dev/watch.ts` | 18 | R | Dev watch mode — plugin directory for live reload |
| 32 | `npm_execpath` | `ci/dev/preinstall.js` | 1 | R | npm internal — prevents yarn from being used |

---

## Master Variable Table — Test Suite (`test/`)

Variables consumed only by the test runner. **Not used at runtime. Do not configure in Railway.**

| # | Variable | File | Line(s) | Purpose |
|---|----------|------|--------|---------|
| 33 | `LOG_LEVEL` | `test/unit/node/cli.test.ts` | 174–248 | Set/cleared in tests that exercise LOG_LEVEL behavior |
| 34 | `PASSWORD` | `test/unit/node/cli.test.ts` | 330 | Set in tests that exercise password auth |
| 35 | `HASHED_PASSWORD` | `test/unit/node/cli.test.ts` | 343 | Set in tests that exercise hashed password auth |
| 36 | `GITHUB_TOKEN` | `test/unit/node/cli.test.ts` | 380, 389 | Set in tests that verify token deletion |
| 37 | `CS_DISABLE_FILE_DOWNLOADS` | `test/unit/node/cli.test.ts` | 393, 405 | Set in feature flag tests |
| 38 | `CS_DISABLE_GETTING_STARTED_OVERRIDE` | `test/unit/node/cli.test.ts` | 417, 429 | Set in feature flag tests |
| 39 | `CS_DISABLE_PROXY` | `test/unit/node/cli.test.ts` | 441, 453 | Set in feature flag tests |
| 40 | `CODE_SERVER_RECONNECTION_GRACE_TIME` | `test/unit/node/cli.test.ts` | 465, 474 | Set in reconnection tests |
| 41 | `VSCODE_PROXY_URI` | `test/unit/node/cli.test.ts` | 566–586 | Set/read in proxy URI tests |
| 42 | `VSCODE_IPC_HOOK_CLI` | `test/unit/node/cli.test.ts` | 599, 604 | Set in IPC hook tests |
| 43 | `PASSWORD` | `test/unit/node/proxy.test.ts` | 271, 278 | Auth in proxy tests |
| 44 | `HASHED_PASSWORD` | `test/unit/node/proxy.test.ts` | 298 | Auth in proxy tests |
| 45 | `PASSWORD` | `test/unit/node/routes/login.test.ts` | 56–140 | Auth in login route tests |
| 46 | `VSCODE_PROXY_URI` | `test/e2e/extensions/test-extension/extension.ts` | 8, 9 | Read by test extension |
| 47 | `USE_PROXY` | `test/e2e/extensions.test.ts` | 26 | E2E test flag — skip proxy tests if `!= 1` |
| 48 | `USE_PROXY` | `test/utils/helpers.ts` | 118, 131 | E2E proxy URL helper |
| 49 | `GITHUB_TOKEN` | `test/e2e/github.test.ts` | 4 | Skip GitHub E2E tests if not set |
| 50 | `CODE_SERVER_TEST_ENTRY` | `test/e2e/models/CodeServer.ts` | 47 | E2E — override path to code-server binary |
| 51 | `VSCODE_DEV` | `test/e2e/openHelpAbout.test.ts` | 9 | E2E — detect dev mode in about page test |
| 52 | `CODE_WORKSPACE_DIR` | `test/e2e/routes.test.ts` | 55, 97, 115 | E2E — written by globalE2eSetup, read by route tests |
| 53 | `CODE_FOLDER_DIR` | `test/e2e/routes.test.ts` | 65, 81, 96, 114 | E2E — written by globalE2eSetup, read by route tests |
| 54 | `WTF_NODE` | `test/utils/globalE2eSetup.ts` | 18 | E2E — enable `wtfnode` leak detector |
| 55 | `CS_TEST_REVERSE_PROXY_BASE_PATH` | `test/utils/constants.ts` | 3 | E2E — reverse proxy base path for tests |
| 56 | `CS_TEST_REVERSE_PROXY_PORT` | `test/utils/constants.ts` | 4 | E2E — reverse proxy port for tests |
| 57 | `CODE_SERVER_PATH` | `test/utils/runCodeServerCommand.ts` | 13 | E2E — path to release binary for integration tests |
| 58 | `TEST_USE_ENV` | `test/unit/helpers.test.ts` | 24, 27 | Unit test of the `withEnv` helper itself |
| 59 | `CI` | `test/playwright.config.ts` | 15, 17 | Playwright — increase retries and cap failures in CI |

---

## Master Variable Table — GitHub Actions Workflows (`.github/workflows/`)

Variables used exclusively by the CI/CD pipeline. **Not applicable to Railway deployment.**

| # | Variable | Workflow file | Line(s) | Purpose |
|---|----------|--------------|--------|---------|
| 60 | `GITHUB_TOKEN` | `build.yaml`, `release.yaml`, `publish.yaml` | 95, 160, 252, 44, 149, 27, 103 | GitHub API auth for releases, uploads, PRs (auto-provided by Actions) |
| 61 | `GH_TOKEN` | `build.yaml`, `publish.yaml`, `update.yaml` | 252, 58, 143, 17 | `gh` CLI token (alias for GITHUB_TOKEN) |
| 62 | `CODECOV_TOKEN` | `build.yaml` | 150, 156 | Upload coverage reports to Codecov |
| 63 | `NPM_TOKEN` | `publish.yaml` | 28, 50 | Publish package to npm registry |
| 64 | `NPM_ENVIRONMENT` | `publish.yaml` | 29 | Set to `"production"` during npm publish |
| 65 | `HOMEBREW_GITHUB_API_TOKEN` | `publish.yaml`, `update.yaml` | 58, 70, 143, 17 | Homebrew tap PR creation token |
| 66 | `DOCKER_PASSWORD` | `publish.yaml` | 118 | Docker Hub password for image push |
| 67 | `TAG` | `publish.yaml`, `release.yaml`, `update.yaml` | multiple | Release tag (e.g., `v4.126.0`) |
| 68 | `VERSION` | `build.yaml` | 158 | Set to `0.0.0` during PR builds |
| 69 | `VSCODE_TARGET` | `build.yaml`, `release.yaml` | 159, 148 | Build target (e.g., `linux-x64`) |
| 70 | `VSCODE_ARCH` | `release.yaml` | 51 | Architecture for VS Code build |
| 71 | `ARCH` | `release.yaml` | 49 | Package architecture |
| 72 | `DISABLE_V8_COMPILE_CACHE` | `build.yaml` | 157 | Disable V8 cache during CI build |
| 73 | `ELECTRON_SKIP_BINARY_DOWNLOAD` | `build.yaml`, `release.yaml` | 161, 45 | Skip Electron download (not needed server-side) |
| 74 | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `build.yaml`, `release.yaml` | 162, 46 | Skip browser download in build jobs |
| 75 | `LOG_LEVEL` | `build.yaml` | 217, 253 | Set to `"debug"` during E2E test runs in CI |

---

## Railway Configuration Variables

Variables that **must or should be set in Railway** for a working production deployment.

### Must set in Railway

| Variable | Value | Reason |
|----------|-------|--------|
| `NIXPACKS_NODE_VERSION` | `22` | package.json `engines.node` requires 22; Nixpacks defaults to an older version |
| `AUTH` | `password` | start.sh defaults to `none` — production must use password auth |
| `PASSWORD` | *(your password)* | Required when `AUTH=password`; no safe default |

### Recommended to set in Railway

| Variable | Suggested value | Reason |
|----------|----------------|--------|
| `WORKSPACE_DIR` | `/workspace` | Controls what VS Code opens; default is Replit-specific path |
| `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | `3600` | Auto-shuts down after 1 hour idle — saves Railway cost |
| `LOG_LEVEL` | `warn` | Reduces log noise in production |

### Optional, set if needed

| Variable | Notes |
|----------|-------|
| `HASHED_PASSWORD` | Use instead of `PASSWORD` for better security (argon2 hash) |
| `CODE_SERVER_APP_NAME` | Custom title bar name; default is already `YS-Servece-Code` |
| `EXTENSIONS_GALLERY` | Point at Open VSX if VS Code Marketplace is blocked |
| `HTTPS_PROXY` / `HTTP_PROXY` | Set if Railway egress goes through a corporate proxy |
| `CODE_SERVER_IDLE_TIMEOUT_SECONDS` | Must be integer > 60 |

### Do NOT set in Railway

| Variable | Reason |
|----------|--------|
| `PORT` | Railway injects it automatically; setting it manually can break routing |
| `CODE_SERVER_SESSION_SOCKET` | Written by the application — do not override |
| `CODE_SERVER_PARENT_PID` | Written by the application — do not override |
| `VSCODE_IPC_HOOK_CLI` | Set by VS Code's terminal integration — do not override |
| `NODE_EXEC_PATH` | Set by wrapper.ts when spawning child process |

---

## Missing Variables Report

**None found.**  
Every `process.env` reference in `src/` and `start.sh` is accounted for in the table above and in `.env.example`.

## Unused Variables in `.env.example`

**None.**  
Every variable in `.env.example` maps directly to a confirmed `process.env.*` reference in source code or `start.sh`.

## Duplicate Variables

**None.**  
Each variable name appears exactly once in `.env.example`. Variables that appear in multiple source files (e.g., `VSCODE_PROXY_URI` in both `cli.ts` and `main.ts`, `PASSWORD` in both `cli.test.ts` and `proxy.test.ts`) are correctly represented as a single documented variable — the duplicates are test usages of the same production variable.

---

## import.meta.env — Full Scan

```
Pattern searched: import\.meta\.env\.
Files searched:   **/*.ts **/*.js **/*.tsx **/*.jsx **/*.svelte **/*.vue
Excluding:        node_modules/, out/, .git/, .local/skills/ (agent template files)
```

**Result: 0 occurrences in application source.**

The only `import.meta.env` occurrences in the repository are inside `.local/skills/artifacts/` — these are Replit skill template files for Vite/React mockup scaffolding, not part of this application.

---

## Deno.env.get — Full Scan

```
Pattern searched: Deno\.env\.get|Deno\.env\.set|Deno\.env\.toObject
Files searched:   **/*.ts **/*.js
```

**Result: 0 occurrences anywhere in the repository.**

This is a Node.js application. Deno APIs are not used.

---

## Railway Deployment Readiness Checklist

| Check | Status | Detail |
|-------|--------|--------|
| `railway.json` present | ✅ | Build + deploy config with health check |
| `$PORT` respected | ✅ | `start.sh:36` and `cli.ts:819` both read it |
| Health check endpoint | ✅ | `GET /healthz` → `{"status":"alive","lastHeartbeat":...}` |
| No hardcoded port | ✅ | All binding via `$PORT` |
| Auth configurable via env | ✅ | `$AUTH` + `$PASSWORD` / `$HASHED_PASSWORD` |
| Sensitive vars deleted after read | ✅ | `PASSWORD`, `HASHED_PASSWORD`, `GITHUB_TOKEN` all `delete`d |
| Binary not committed to git | ✅ | `lib/code-server*` in `.gitignore` |
| Node 22 declared | ✅ | `engines.node: "22"` in `package.json` |
| All vars documented | ✅ | 30 app vars, 0 missing |
| `import.meta.env` used | ❌ None | This is Node.js — no Vite/browser env vars |
| `Deno.env` used | ❌ None | Not a Deno project |

### Remaining manual steps before first Railway deploy

1. **Set `NIXPACKS_NODE_VERSION=22`** in Railway Variables
2. **Set `AUTH=password`** in Railway Variables
3. **Set `PASSWORD=<strong-password>`** in Railway Variables (or `HASHED_PASSWORD`)
4. **Optionally set `WORKSPACE_DIR=/workspace`** for a clean workspace path
5. Connect the GitHub repo and deploy — `railway.json` handles the rest
