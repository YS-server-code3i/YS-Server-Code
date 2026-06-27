/**
 * Context Management for AI Operations
 * Maintains repository indexing, file context, and conversation history
 */

import type { Logger } from "@coder/logger"
import * as fs from "fs"
import * as path from "path"

export interface FileContext {
  path: string
  content: string
  language: string
  size: number
  lastModified: number
}

export interface RepositoryIndex {
  files: FileContext[]
  structure: Map<string, string[]>
  totalSize: number
  languages: Map<string, number>
}

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export class ContextManager {
  private index: RepositoryIndex | null = null
  private conversationHistory: ConversationMessage[] = []
  private fileCache: Map<string, FileContext> = new Map()
  private maxHistoryMessages = 50
  private maxContextSize = 100000 // chars

  constructor(
    private logger: Logger,
    private workspaceDir: string
  ) {
    this.index = {
      files: [],
      structure: new Map(),
      totalSize: 0,
      languages: new Map(),
    }
  }

  /**
   * Index the repository structure
   */
  public async indexRepository(maxDepth = 10): Promise<void> {
    this.logger.debug(`Indexing repository: ${this.workspaceDir}`)

    const files: FileContext[] = []
    const structure = new Map<string, string[]>()
    const languages = new Map<string, number>()
    let totalSize = 0

    try {
      const indexDir = (dir: string, depth: number) => {
        if (depth > maxDepth) return
        if (!fs.existsSync(dir)) return

        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          // Skip node_modules, .git, dist, etc.
          if (
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "dist" ||
            entry.name === "build" ||
            entry.name === "out"
          ) {
            continue
          }

          const fullPath = path.join(dir, entry.name)
          const relativePath = path.relative(this.workspaceDir, fullPath)

          if (entry.isDirectory()) {
            structure.set(relativePath, [])
            indexDir(fullPath, depth + 1)
          } else {
            try {
              const stats = fs.statSync(fullPath)
              const size = stats.size

              // Skip large files
              if (size > 1000000) continue

              const ext = path.extname(entry.name).toLowerCase()
              const language = this.getLanguageFromExt(ext)

              if (language) {
                const content = fs.readFileSync(fullPath, "utf-8")
                const fileCtx: FileContext = {
                  path: relativePath,
                  content,
                  language,
                  size,
                  lastModified: stats.mtimeMs,
                }

                files.push(fileCtx)
                this.fileCache.set(relativePath, fileCtx)
                totalSize += size

                languages.set(
                  language,
                  (languages.get(language) || 0) + 1
                )
              }
            } catch (err) {
              this.logger.debug(
                `Failed to index file ${fullPath}: ${err}`
              )
            }
          }
        }
      }

      indexDir(this.workspaceDir, 0)

      if (this.index) {
        this.index.files = files
        this.index.structure = structure
        this.index.totalSize = totalSize
        this.index.languages = languages
      }

      this.logger.info(
        `Repository indexed: ${files.length} files, ${(totalSize / 1024).toFixed(2)} KB`
      )
    } catch (err) {
      this.logger.error(`Repository indexing failed: ${err}`)
    }
  }

  /**
   * Get relevant context for a prompt
   */
  public getContext(query: string, maxFiles = 10): string {
    const contextLines: string[] = []

    // Add most relevant files based on query
    const relevantFiles = this.findRelevantFiles(query, maxFiles)

    for (const file of relevantFiles) {
      contextLines.push(`\n// File: ${file.path}`)
      contextLines.push(
        `// Language: ${file.language}, Size: ${file.size} bytes`
      )
      contextLines.push("```")

      // Truncate very long files
      const content =
        file.content.length > 2000
          ? file.content.substring(0, 2000) + "\n// ... (truncated)"
          : file.content

      contextLines.push(content)
      contextLines.push("```")
    }

    return contextLines.join("\n")
  }

  /**
   * Add message to conversation history
   */
  public addMessage(role: "user" | "assistant", content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    })

    // Keep history within limits
    if (this.conversationHistory.length > this.maxHistoryMessages) {
      this.conversationHistory.shift()
    }
  }

  /**
   * Get conversation history
   */
  public getHistory(limit?: number): ConversationMessage[] {
    if (!limit) return this.conversationHistory
    return this.conversationHistory.slice(-limit)
  }

  /**
   * Clear conversation history
   */
  public clearHistory(): void {
    this.conversationHistory = []
  }

  /**
   * Get file content
   */
  public getFile(filePath: string): FileContext | null {
    return this.fileCache.get(filePath) || null
  }

  /**
   * Get repository index
   */
  public getIndex(): RepositoryIndex | null {
    return this.index
  }

  private findRelevantFiles(
    query: string,
    limit: number
  ): FileContext[] {
    if (!this.index) return []

    const queryTerms = query.toLowerCase().split(" ")
    const scored: Array<[FileContext, number]> = []

    for (const file of this.index.files) {
      let score = 0
      const pathLower = file.path.toLowerCase()
      const contentLower = file.content.toLowerCase()

      for (const term of queryTerms) {
        if (pathLower.includes(term)) score += 5
        if (contentLower.includes(term)) score += 1
      }

      if (score > 0) {
        scored.push([file, score])
      }
    }

    return scored
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file]) => file)
  }

  private getLanguageFromExt(ext: string): string | null {
    const langMap: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".rb": "ruby",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".cs": "csharp",
      ".cpp": "cpp",
      ".c": "c",
      ".h": "c",
      ".hpp": "cpp",
      ".sql": "sql",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".md": "markdown",
      ".sh": "shell",
      ".bash": "bash",
      ".xml": "xml",
    }

    return langMap[ext.toLowerCase()] || null
  }
}

export default ContextManager
