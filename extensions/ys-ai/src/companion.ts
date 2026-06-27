/**
 * Companion server HTTP client
 * All API calls go to the companion server running at 127.0.0.1:PORT
 */

import * as http from "http"
import * as vscode from "vscode"

export interface CompanionConfig {
  port: number
}

export function getConfig(): CompanionConfig {
  const cfg = vscode.workspace.getConfiguration("ysAI")
  return { port: cfg.get<number>("companionPort", 3001) }
}

function baseUrl(): string {
  return `http://127.0.0.1:${getConfig().port}`
}

/** Generic JSON fetch via Node http module (no external deps) */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined
    const cfg = getConfig()
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: cfg.port,
        path,
        method: options.method || (body ? "POST" : "GET"),
        headers: {
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (c: Buffer) => (data += c.toString()))
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T)
          } catch {
            reject(new Error(`Invalid JSON from companion (${res.statusCode}): ${data.slice(0, 200)}`))
          }
        })
      },
    )
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

/** Stream SSE from companion, calling onChunk for each text piece, onDone when finished */
export function apiStream(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const cfg = getConfig()
  const bodyStr = JSON.stringify(body)
  let aborted = false

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: cfg.port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        Accept: "text/event-stream",
      },
    },
    (res) => {
      if (aborted) return
      if (res.statusCode && res.statusCode >= 400) {
        onError(new Error(`Companion returned HTTP ${res.statusCode}`))
        return
      }

      let buffer = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => {
        if (aborted) return
        buffer += chunk
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") {
            onDone()
            return
          }
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string }
            if (parsed.error) {
              onError(new Error(parsed.error))
            } else if (parsed.text) {
              onChunk(parsed.text)
            }
          } catch {
            // skip unparseable
          }
        }
      })
      res.on("end", () => {
        if (!aborted) onDone()
      })
      res.on("error", onError)
    },
  )

  req.on("error", (err) => {
    if (!aborted) onError(err)
  })

  req.write(bodyStr)
  req.end()

  return () => {
    aborted = true
    req.destroy()
  }
}

// ─── AI ─────────────────────────────────────────────────────────────────────

export interface AIStatus {
  status: "ready" | "no-provider" | "unavailable"
  provider?: { name: string; model: string }
  capabilities?: string[]
  availableProviders?: string[]
}

export async function getAIStatus(): Promise<AIStatus> {
  return apiFetch<AIStatus>("/api/ai/status")
}

export async function reindexRepository(): Promise<{ success: boolean; stats: unknown }> {
  return apiFetch("/api/ai/reindex", { method: "POST" })
}

export async function clearHistory(): Promise<void> {
  await apiFetch("/api/ai/history", { method: "DELETE" })
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string
  files: Array<{ status: string; path: string }>
}

export interface GitCommit {
  hash: string
  author: string
  email: string
  date: string
  message: string
}

export async function getGitStatus(): Promise<GitStatus> {
  return apiFetch<GitStatus>("/api/github/git/status")
}

export async function getGitLog(limit = 20): Promise<{ commits: GitCommit[] }> {
  return apiFetch<{ commits: GitCommit[] }>(`/api/github/git/log?limit=${limit}`)
}

export async function getGitBranches(): Promise<{ branches: Array<{ name: string; current: boolean }> }> {
  return apiFetch("/api/github/git/branches")
}

export async function getGitDiff(file?: string, staged = false): Promise<{ diff: string }> {
  const params = new URLSearchParams()
  if (file) params.set("file", file)
  if (staged) params.set("staged", "true")
  return apiFetch<{ diff: string }>(`/api/github/git/diff?${params}`)
}

export async function gitCommit(message: string, files?: string[]): Promise<{ success: boolean; output: string }> {
  return apiFetch("/api/github/git/commit", { body: { message, files } })
}

export async function gitPush(): Promise<{ success: boolean; output: string }> {
  return apiFetch("/api/github/git/push", { body: {} })
}

export async function gitPull(): Promise<{ success: boolean; output: string }> {
  return apiFetch("/api/github/git/pull", { body: {} })
}

export async function gitCheckout(branch: string, create = false): Promise<{ success: boolean }> {
  return apiFetch("/api/github/git/checkout", { body: { branch, create } })
}

// ─── Database ────────────────────────────────────────────────────────────────

export interface DbStatus {
  connected: boolean
  version?: string
  latencyMs?: number
  message?: string
}

export interface DbTable {
  table_schema: string
  table_name: string
  table_type: string
  size?: string
  estimated_rows?: number
}

export async function getDbStatus(): Promise<DbStatus> {
  return apiFetch<DbStatus>("/api/db/status")
}

export async function getDbTables(): Promise<{ tables: DbTable[] }> {
  return apiFetch("/api/db/tables")
}

export async function getDbColumns(schema: string, table: string): Promise<{ columns: unknown[] }> {
  return apiFetch(`/api/db/tables/${schema}/${table}/columns`)
}

export async function runDbQuery(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number; duration: number; error?: string }> {
  return apiFetch("/api/db/query", { body: { sql, params } })
}

// ─── Files ───────────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  type: "file" | "directory"
  size: number
  modified: string | null
  extension: string | null
  hidden: boolean
}

export async function listFiles(path = "."): Promise<{ path: string; items: FileEntry[] }> {
  return apiFetch(`/api/files/list?path=${encodeURIComponent(path)}`)
}

export async function readFile(path: string): Promise<{ content: string; language: string; size: number }> {
  return apiFetch(`/api/files/read?path=${encodeURIComponent(path)}`)
}

export async function writeFile(path: string, content: string): Promise<{ success: boolean }> {
  return apiFetch("/api/files/write", { body: { path, content } })
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    await apiFetch("/healthz")
    return true
  } catch {
    return false
  }
}
