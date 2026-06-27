/**
 * File Manager Routes - Full file system operations for the workspace
 * Supports CRUD, search, move, copy, zip, upload, download
 */

import { Router } from "express"
import type { Request, Response } from "express"
import * as fs from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import * as os from "os"
import { createReadStream } from "fs"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
export const router = Router()

const WORKSPACE = process.env.WORKSPACE_DIR || "/home/runner/workspace"
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB read limit

function safePath(base: string, userPath: string): string {
  const resolved = path.resolve(base, userPath.replace(/^\//, ""))
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal detected")
  }
  return resolved
}

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust", ".java": "java",
    ".cs": "csharp", ".cpp": "cpp", ".c": "c", ".h": "c", ".hpp": "cpp",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".html": "html",
    ".css": "css", ".scss": "scss", ".md": "markdown", ".sh": "shell",
    ".sql": "sql", ".xml": "xml", ".toml": "toml", ".env": "properties",
  }
  return map[ext.toLowerCase()] || "plaintext"
}

function getIcon(name: string, isDir: boolean): string {
  if (isDir) return "folder"
  const ext = path.extname(name).toLowerCase()
  const iconMap: Record<string, string> = {
    ".ts": "typescript", ".tsx": "react", ".js": "javascript", ".jsx": "react",
    ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust", ".java": "java",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".html": "html",
    ".css": "css", ".scss": "sass", ".md": "markdown", ".sh": "terminal",
    ".sql": "database", ".png": "image", ".jpg": "image", ".svg": "image",
    ".gif": "image", ".pdf": "pdf", ".zip": "zip", ".tar": "zip",
  }
  return iconMap[ext] || "file"
}

router.get("/list", async (req: Request, res: Response) => {
  const relPath = (req.query.path as string) || "."
  try {
    const absPath = safePath(WORKSPACE, relPath)
    const entries = await fsp.readdir(absPath, { withFileTypes: true })

    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(absPath, entry.name)
        let stat: fs.Stats | null = null
        try {
          stat = await fsp.stat(fullPath)
        } catch {
          // ignore stat errors
        }

        return {
          name: entry.name,
          path: path.relative(WORKSPACE, fullPath),
          type: entry.isDirectory() ? "directory" : "file",
          size: stat?.size ?? 0,
          modified: stat?.mtime.toISOString() ?? null,
          extension: entry.isDirectory() ? null : path.extname(entry.name),
          icon: getIcon(entry.name, entry.isDirectory()),
          hidden: entry.name.startsWith("."),
        }
      }),
    )

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    res.json({ path: relPath, items })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/read", async (req: Request, res: Response) => {
  const relPath = req.query.path as string
  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    const stat = await fsp.stat(absPath)

    if (stat.size > MAX_FILE_SIZE) {
      res.status(413).json({ error: "File too large to read (max 50 MB)" })
      return
    }

    const content = await fsp.readFile(absPath, "utf-8")
    const ext = path.extname(absPath)

    res.json({
      path: relPath,
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      language: getLanguage(ext),
      extension: ext,
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      res.status(404).json({ error: "File not found" })
    } else {
      res.status(500).json({ error: String(err) })
    }
  }
})

router.post("/write", async (req: Request, res: Response) => {
  const { path: relPath, content, createDirs = true } = req.body as {
    path?: string
    content?: string
    createDirs?: boolean
  }

  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }
  if (content === undefined || content === null) {
    res.status(400).json({ error: "content is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    if (createDirs) {
      await fsp.mkdir(path.dirname(absPath), { recursive: true })
    }
    await fsp.writeFile(absPath, content, "utf-8")
    const stat = await fsp.stat(absPath)
    res.json({ success: true, path: relPath, size: stat.size })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete("/delete", async (req: Request, res: Response) => {
  const { path: relPath, recursive = false } = req.body as { path?: string; recursive?: boolean }
  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    const stat = await fsp.stat(absPath)

    if (stat.isDirectory()) {
      await fsp.rm(absPath, { recursive: recursive || false, force: false })
    } else {
      await fsp.unlink(absPath)
    }

    res.json({ success: true, path: relPath })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      res.status(404).json({ error: "Path not found" })
    } else {
      res.status(500).json({ error: String(err) })
    }
  }
})

router.post("/rename", async (req: Request, res: Response) => {
  const { from, to } = req.body as { from?: string; to?: string }
  if (!from || !to) {
    res.status(400).json({ error: "from and to are required" })
    return
  }

  try {
    const absFrom = safePath(WORKSPACE, from)
    const absTo = safePath(WORKSPACE, to)
    await fsp.mkdir(path.dirname(absTo), { recursive: true })
    await fsp.rename(absFrom, absTo)
    res.json({ success: true, from, to })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/copy", async (req: Request, res: Response) => {
  const { from, to } = req.body as { from?: string; to?: string }
  if (!from || !to) {
    res.status(400).json({ error: "from and to are required" })
    return
  }

  try {
    const absFrom = safePath(WORKSPACE, from)
    const absTo = safePath(WORKSPACE, to)
    await fsp.mkdir(path.dirname(absTo), { recursive: true })
    await fsp.cp(absFrom, absTo, { recursive: true })
    res.json({ success: true, from, to })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/mkdir", async (req: Request, res: Response) => {
  const { path: relPath } = req.body as { path?: string }
  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    await fsp.mkdir(absPath, { recursive: true })
    res.json({ success: true, path: relPath })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/download", async (req: Request, res: Response) => {
  const relPath = req.query.path as string
  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    const stat = await fsp.stat(absPath)

    if (stat.isDirectory()) {
      const tmpZip = path.join(os.tmpdir(), `ys-download-${Date.now()}.tar.gz`)
      await execAsync(`tar -czf "${tmpZip}" -C "${path.dirname(absPath)}" "${path.basename(absPath)}"`)
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(relPath)}.tar.gz"`)
      res.setHeader("Content-Type", "application/gzip")
      const stream = createReadStream(tmpZip)
      stream.pipe(res)
      stream.on("close", () => fsp.unlink(tmpZip).catch(() => undefined))
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(relPath)}"`)
      res.setHeader("Content-Length", stat.size.toString())
      createReadStream(absPath).pipe(res)
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/search", async (req: Request, res: Response) => {
  const { q, dir = ".", include = "*", limit = "50" } = req.query as Record<string, string>
  if (!q) {
    res.status(400).json({ error: "q (search query) is required" })
    return
  }

  try {
    const absDir = safePath(WORKSPACE, dir)
    const maxResults = parseInt(limit, 10) || 50

    const { stdout } = await execAsync(
      `grep -rl --include="${include}" "${q.replace(/"/g, '\\"')}" "${absDir}" 2>/dev/null | head -${maxResults}`,
    )

    const fileMatches = await Promise.all(
      stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(async (absFile) => {
          const relFile = path.relative(WORKSPACE, absFile)
          const { stdout: grepOut } = await execAsync(
            `grep -n "${q.replace(/"/g, '\\"')}" "${absFile}" | head -5`,
          ).catch(() => ({ stdout: "" }))

          return {
            path: relFile,
            matches: grepOut
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const colonIdx = line.indexOf(":")
                return {
                  line: parseInt(line.slice(0, colonIdx), 10),
                  content: line.slice(colonIdx + 1).trim(),
                }
              }),
          }
        }),
    )

    res.json({ query: q, results: fileMatches })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/stat", async (req: Request, res: Response) => {
  const relPath = req.query.path as string
  if (!relPath) {
    res.status(400).json({ error: "path is required" })
    return
  }

  try {
    const absPath = safePath(WORKSPACE, relPath)
    const stat = await fsp.stat(absPath)
    res.json({
      path: relPath,
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      accessed: stat.atime.toISOString(),
      mode: stat.mode.toString(8),
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      res.status(404).json({ error: "Path not found" })
    } else {
      res.status(500).json({ error: String(err) })
    }
  }
})

router.post("/zip", async (req: Request, res: Response) => {
  const { paths, output } = req.body as { paths?: string[]; output?: string }
  if (!paths || paths.length === 0) {
    res.status(400).json({ error: "paths array is required" })
    return
  }

  try {
    const absPaths = paths.map((p) => `"${safePath(WORKSPACE, p)}"`).join(" ")
    const outRel = output || `archive-${Date.now()}.tar.gz`
    const absOut = safePath(WORKSPACE, outRel)
    await execAsync(`tar -czf "${absOut}" -C "${WORKSPACE}" ${absPaths}`)
    const stat = await fsp.stat(absOut)
    res.json({ success: true, output: outRel, size: stat.size })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/extract", async (req: Request, res: Response) => {
  const { archive, dest = "." } = req.body as { archive?: string; dest?: string }
  if (!archive) {
    res.status(400).json({ error: "archive path is required" })
    return
  }

  try {
    const absArchive = safePath(WORKSPACE, archive)
    const absDest = safePath(WORKSPACE, dest)
    await fsp.mkdir(absDest, { recursive: true })

    const ext = archive.toLowerCase()
    if (ext.endsWith(".tar.gz") || ext.endsWith(".tgz")) {
      await execAsync(`tar -xzf "${absArchive}" -C "${absDest}"`)
    } else if (ext.endsWith(".tar")) {
      await execAsync(`tar -xf "${absArchive}" -C "${absDest}"`)
    } else if (ext.endsWith(".zip")) {
      await execAsync(`unzip -o "${absArchive}" -d "${absDest}"`)
    } else {
      res.status(400).json({ error: "Unsupported archive format. Use .tar.gz, .tgz, or .zip" })
      return
    }

    res.json({ success: true, archive, dest })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
