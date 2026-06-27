/**
 * GitHub Routes - Integration with GitHub API
 * Supports repos, branches, commits, PRs, issues, search
 */

import { Router } from "express"
import type { Request, Response } from "express"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
export const router = Router()

const GITHUB_API = "https://api.github.com"

function getAuthHeaders(token?: string): Record<string, string> {
  const t = token || process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || ""
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "YS-Servece-Code/1.0",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (t) {
    headers["Authorization"] = `Bearer ${t}`
  }
  return headers
}

async function ghFetch(
  path: string,
  token?: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; data: unknown }> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...getAuthHeaders(token),
      ...(options.headers || {}),
    },
    body: options.body,
  })
  const data = await resp.json()
  return { status: resp.status, data }
}

function extractToken(req: Request): string | undefined {
  const auth = req.headers["authorization"] as string | undefined
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN
}

router.get("/status", (req: Request, res: Response) => {
  const token = extractToken(req)
  res.json({
    configured: !!token,
    source: token ? (req.headers["authorization"] ? "header" : "env") : "none",
  })
})

router.get("/user", async (req: Request, res: Response) => {
  const token = extractToken(req)
  try {
    const { status, data } = await ghFetch("/user", token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { sort = "updated", per_page = "30", page = "1" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(`/user/repos?sort=${sort}&per_page=${per_page}&page=${page}`, token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos/:owner/:repo", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  try {
    const { status, data } = await ghFetch(`/repos/${owner}/${repo}`, token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos/:owner/:repo/branches", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  const { per_page = "30" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=${per_page}`, token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos/:owner/:repo/commits", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  const { sha = "main", per_page = "30", page = "1" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(
      `/repos/${owner}/${repo}/commits?sha=${sha}&per_page=${per_page}&page=${page}`,
      token,
    )
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos/:owner/:repo/pulls", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  const { state = "open", per_page = "30" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(
      `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${per_page}`,
      token,
    )
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/repos/:owner/:repo/issues", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  const { state = "open", per_page = "30" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`,
      token,
    )
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/github/repos/:owner/:repo/contents?path=src/index.ts&ref=main
router.get("/repos/:owner/:repo/contents", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { owner, repo } = req.params
  const { path: filePath = "", ref = "main" } = req.query as Record<string, string>
  try {
    const { status, data } = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`, token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/search/repos", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { q, sort = "stars", per_page = "10" } = req.query as Record<string, string>
  if (!q) {
    res.status(400).json({ error: "q (query) is required" })
    return
  }
  try {
    const { status, data } = await ghFetch(
      `/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&per_page=${per_page}`,
      token,
    )
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/search/code", async (req: Request, res: Response) => {
  const token = extractToken(req)
  const { q, per_page = "10" } = req.query as Record<string, string>
  if (!q) {
    res.status(400).json({ error: "q (query) is required" })
    return
  }
  try {
    const { status, data } = await ghFetch(`/search/code?q=${encodeURIComponent(q)}&per_page=${per_page}`, token)
    res.status(status).json(data)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// --- Local git operations (runs git in workspace) ---

const WORKSPACE = process.env.WORKSPACE_DIR || "/home/runner/workspace"

router.get("/git/status", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd: WORKSPACE })
    const { stdout: branch } = await execAsync("git branch --show-current", { cwd: WORKSPACE })
    const files = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        status: line.slice(0, 2).trim(),
        path: line.slice(3),
      }))
    res.json({ branch: branch.trim(), files })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/git/log", async (req: Request, res: Response) => {
  const { limit = "20", branch = "HEAD" } = req.query as Record<string, string>
  try {
    const { stdout } = await execAsync(
      `git log ${branch} --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso -n ${limit}`,
      { cwd: WORKSPACE },
    )
    const commits = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, author, email, date, ...msgParts] = line.split("|")
        return { hash, author, email, date, message: msgParts.join("|") }
      })
    res.json({ commits })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/git/branches", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync("git branch -a --format=%(refname:short)|%(upstream:short)|%(HEAD)", {
      cwd: WORKSPACE,
    })
    const branches = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, upstream, current] = line.replace(/'/g, "").split("|")
        return { name: (name || "").trim(), upstream: (upstream || "").trim() || null, current: current === "*" }
      })
    res.json({ branches })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/git/commit", async (req: Request, res: Response) => {
  const { message, files } = req.body as { message?: string; files?: string[] }
  if (!message) {
    res.status(400).json({ error: "message is required" })
    return
  }
  try {
    if (files && files.length > 0) {
      const safeFiles = files.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(" ")
      await execAsync(`git add ${safeFiles}`, { cwd: WORKSPACE })
    } else {
      await execAsync("git add -A", { cwd: WORKSPACE })
    }
    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: WORKSPACE })
    res.json({ success: true, output: stdout })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/git/push", async (req: Request, res: Response) => {
  const { remote = "origin", branch = "" } = req.body as { remote?: string; branch?: string }
  try {
    const branchArg = branch ? ` HEAD:${branch}` : ""
    const { stdout, stderr } = await execAsync(`git push ${remote}${branchArg}`, { cwd: WORKSPACE })
    res.json({ success: true, output: stdout + stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/git/pull", async (req: Request, res: Response) => {
  const { remote = "origin", branch = "" } = req.body as { remote?: string; branch?: string }
  try {
    const args = branch ? ` ${remote} ${branch}` : ""
    const { stdout, stderr } = await execAsync(`git pull${args}`, { cwd: WORKSPACE })
    res.json({ success: true, output: stdout + stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/git/checkout", async (req: Request, res: Response) => {
  const { branch, create = false } = req.body as { branch?: string; create?: boolean }
  if (!branch) {
    res.status(400).json({ error: "branch is required" })
    return
  }
  try {
    const flag = create ? "-b " : ""
    const { stdout } = await execAsync(`git checkout ${flag}${branch}`, { cwd: WORKSPACE })
    res.json({ success: true, output: stdout })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/git/diff", async (req: Request, res: Response) => {
  const { file, staged = "false" } = req.query as Record<string, string>
  try {
    const stagedFlag = staged === "true" ? "--staged " : ""
    const fileArg = file ? `-- "${file}"` : ""
    const { stdout } = await execAsync(`git diff ${stagedFlag}${fileArg}`, { cwd: WORKSPACE })
    res.json({ diff: stdout })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/git/clone", async (req: Request, res: Response) => {
  const { url, dir } = req.body as { url?: string; dir?: string }
  if (!url) {
    res.status(400).json({ error: "url is required" })
    return
  }
  const target = dir || WORKSPACE
  try {
    const { stdout, stderr } = await execAsync(`git clone "${url}" "${target}"`)
    res.json({ success: true, output: stdout + stderr })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
