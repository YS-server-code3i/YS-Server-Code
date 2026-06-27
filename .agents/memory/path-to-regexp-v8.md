---
name: path-to-regexp v8 wildcard syntax
description: Wildcard Express routes fail at runtime with path-to-regexp v8 unless correct syntax is used
---

This project uses path-to-regexp **v8.4.2** (installed in node_modules). v8 broke backward compatibility with wildcard route patterns.

**What does NOT work (throws PathError at startup):**
- `/repos/:owner/:repo/contents/*`  → "Missing parameter name"
- `/repos/:owner/:repo/contents/:filePath(*)`  → "Unexpected ( at index N"

**What DOES work:**
- Named wildcard via curly braces: `"/proxy/:port{/*path}"` (used in routes/index.ts)
- Accept deep paths via a query parameter instead: `GET /api/github/repos/:owner/:repo/contents?path=src/index.ts`

**Why:** path-to-regexp v8 requires all parameters to be explicitly named and does not accept unnamed splats or inline regex quantifiers.

**How to apply:** Avoid bare `*` wildcards in Express route strings. Prefer `{/*name}` syntax or restructure to use query params for variable-depth paths.
