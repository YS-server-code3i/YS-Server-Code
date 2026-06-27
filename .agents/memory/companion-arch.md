---
name: Companion server architecture
description: AI/GitHub/Files/DB APIs run on a separate Express server, not inside code-server
---

The project uses a two-process architecture:

1. **code-server binary** (port 5000) — serves VS Code in the browser via `start.sh`
2. **companion server** (`out/node/companion.js`, port 3001) — serves AI/GitHub/file/database REST APIs

The TypeScript source in `src/` compiles to `out/` via `./node_modules/.bin/tsc`. `start.sh` compiles TS if stale, then launches `node out/node/companion.js &` before `exec`-ing the code-server binary.

The companion is accessible inside the VS Code UI via code-server's built-in port proxy at `/proxy/3001/`.

**Why:** The code-server binary bypasses the TypeScript wrapper entirely (`src/node/main.ts` is never executed), so the only way to add custom HTTP routes is a separate process.

**How to apply:** Any new API routes go in `src/node/routes/` and are registered in both `src/node/companion.ts` (always used) and `src/node/routes/index.ts` (TypeScript-wrapper path, currently unused).
