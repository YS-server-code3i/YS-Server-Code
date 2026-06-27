# YS-Servece-Code

A professional cloud development environment that runs VS Code in the browser. Built on top of [code-server](https://github.com/coder/code-server) with custom branding, UI redesign, and Railway deployment support.

## Project Overview

- **Name**: YS-Servece-Code
- **Tech Stack**: TypeScript, Node.js 22, Express, VS Code (via code-server)
- **Frontend**: Custom HTML/CSS pages (login, about, settings, error, IDE shell)
- **Backend**: Express server with WebSocket proxying, authentication, and health check
- **Build**: `tsc` compiles `src/` → `out/`; runtime uses pre-built code-server binary

## How to Run

The app starts automatically via the `Start application` workflow which runs `bash start.sh`. This script:
1. Downloads the pre-built code-server binary (v4.126.0) to `~/.code-server-bundle/` on first boot
2. Launches it on `0.0.0.0:5000` with authentication disabled (suitable for Replit dev)

## Key Files

| Path | Purpose |
|------|---------|
| `src/node/` | TypeScript backend (CLI, HTTP server, routing, auth) |
| `src/browser/pages/` | Custom HTML/CSS pages (login, about, error, IDE, settings) |
| `public/manifest.json` | PWA manifest |
| `start.sh` | Replit + Railway startup script |
| `railway.json` | Railway deployment config |
| `.env.example` | Environment variable reference |
| `DEPLOYMENT.md` | Full deployment guide |
| `tsconfig.json` | TypeScript compiler config |

## Build Commands

```bash
npm install --ignore-scripts   # install deps (skip postinstall shell scripts)
./node_modules/.bin/tsc        # compile TypeScript
```

## User Preferences

- Keep branding consistently as **YS-Servece-Code** across all files
- Default `app-name` is set to `YS-Servece-Code` in `src/node/cli.ts`
- The pre-built code-server binary lives in `~/.code-server-bundle/` (not committed)
- Do not run `npm install` without `--ignore-scripts` — the postinstall script requires the VS Code submodule which is not checked in
