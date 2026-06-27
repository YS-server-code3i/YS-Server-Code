/**
 * AI Agent - Main orchestrator for code generation, analysis, and operations
 * Handles multi-file edits, code review, testing, and git operations
 */

import type { Logger } from "@coder/logger"
import AIProviderFactory from "./providers"
import { OpenAIProvider } from "./providers/openai"
import { AnthropicProvider } from "./providers/anthropic"
import { GeminiProvider } from "./providers/gemini"
import { OpenRouterProvider } from "./providers/openrouter"
import { OpenAICompatibleProvider } from "./providers/openai-compatible"
import ContextManager from "./context"
import type { AIStreamResponse } from "./providers"

export interface AgentRequest {
  query: string
  files?: string[]
  operation: AgentOperation
  language?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
}

export type AgentOperation =
  | "generate"
  | "refactor"
  | "review"
  | "test"
  | "debug"
  | "document"
  | "fix"
  | "explain"
  | "commit"
  | "chat"
  | "plan"
  | "search"
  | "rename"

export interface FileChange {
  path: string
  content: string
  action: "create" | "update" | "delete"
}

export interface AgentResult {
  success: boolean
  operation: AgentOperation
  output: string
  files: FileChange[]
  confidence: number
  executedCommands: string[]
  provider?: string
  model?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

type ProviderInstance =
  | OpenAIProvider
  | AnthropicProvider
  | GeminiProvider
  | OpenRouterProvider
  | OpenAICompatibleProvider

const SYSTEM_PROMPTS: Record<AgentOperation, string> = {
  generate:
    "You are an expert software engineer. Generate clean, production-ready code. " +
    "When returning file changes, include a JSON block at the end in this exact format:\n" +
    '```json\n{"files":[{"path":"...","content":"...","action":"create"}]}\n```',
  refactor:
    "You are an expert code refactorer. Improve code quality, readability, performance, and maintainability. " +
    "Explain what you changed and why. Include file changes as JSON at the end.",
  review:
    "You are an expert code reviewer. Analyze code for bugs, security vulnerabilities, performance issues, and best practices. " +
    "Provide specific, actionable feedback with line references where possible.",
  test:
    "You are an expert test engineer. Generate comprehensive unit and integration tests with good coverage. " +
    "Include edge cases, error paths, and happy paths. Include test file changes as JSON at the end.",
  debug:
    "You are an expert debugger. Identify root causes of bugs systematically. " +
    "Explain the problem, propose a fix, and include code changes as JSON at the end.",
  document:
    "You are an expert technical writer. Generate clear, comprehensive documentation. " +
    "Include JSDoc/TSDoc comments, README sections, and usage examples.",
  fix:
    "You are an expert bug fixer. Identify root causes and implement robust, minimal fixes. " +
    "Explain what was wrong and include fixed code as JSON at the end.",
  explain:
    "You are an expert code explainer. Provide clear, detailed explanations suitable for the asker's level. " +
    "Break down complex concepts into digestible parts with examples.",
  commit:
    "You are an expert git user. Generate concise, meaningful commit messages following conventional commits format. " +
    "Format: <type>(<scope>): <description>\\n\\n<body>\\n\\n<footer>",
  chat:
    "You are YS-Servece-Code's AI assistant — an expert software engineer and technical advisor. " +
    "Answer questions concisely and accurately. Provide code examples when helpful.",
  plan:
    "You are an expert software architect. Create detailed implementation plans with clear steps, " +
    "file structure, dependencies, and potential issues to watch for.",
  search:
    "You are an expert code searcher. Find relevant code, patterns, and usages across the repository. " +
    "Provide file paths and relevant snippets.",
  rename:
    "You are an expert code refactorer specializing in symbol renaming. " +
    "Identify all usages and provide a complete rename plan with all affected files.",
}

export class AIAgent {
  private providerFactory: AIProviderFactory
  private contextManager: ContextManager
  private providerInstances: Map<string, ProviderInstance> = new Map()
  private readonly retryAttempts = 3
  private readonly retryDelayMs = 1000

  constructor(
    private logger: Logger,
    workspaceDir: string,
  ) {
    this.providerFactory = new AIProviderFactory(logger)
    this.contextManager = new ContextManager(logger, workspaceDir)
    this.buildProviderInstances()
  }

  private buildProviderInstances(): void {
    if (process.env.OPENAI_API_KEY) {
      this.providerInstances.set(
        "openai",
        new OpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-4-turbo-preview"),
      )
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.providerInstances.set(
        "anthropic",
        new AnthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"),
      )
    }
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      this.providerInstances.set(
        "gemini",
        new GeminiProvider(process.env.GOOGLE_GENERATIVE_AI_API_KEY, process.env.GEMINI_MODEL || "gemini-1.5-pro"),
      )
    }
    if (process.env.OPEN_ROUTER_API_KEY) {
      this.providerInstances.set(
        "openrouter",
        new OpenRouterProvider(
          process.env.OPEN_ROUTER_API_KEY,
          process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
        ),
      )
    }
    if (process.env.OPENAI_LIKE_API_KEY && process.env.OPENAI_LIKE_BASE_URL) {
      this.providerInstances.set(
        "openai-like",
        new OpenAICompatibleProvider(
          process.env.OPENAI_LIKE_API_KEY,
          process.env.OPENAI_LIKE_BASE_URL,
          process.env.OPENAI_LIKE_MODEL || "gpt-3.5-turbo",
        ),
      )
    }
  }

  public async initialize(): Promise<void> {
    if (!this.providerFactory.hasProvider()) {
      this.logger.warn("AI Agent: No LLM providers configured")
      return
    }
    await this.contextManager.indexRepository()
    this.logger.info("AI Agent initialized")
  }

  public async process(request: AgentRequest): Promise<AgentResult> {
    if (this.providerInstances.size === 0) {
      return {
        success: false,
        operation: request.operation,
        output:
          "No AI provider configured. Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPEN_ROUTER_API_KEY",
        files: [],
        confidence: 0,
        executedCommands: [],
      }
    }

    const fullPrompt = this.buildFullPrompt(request)
    let lastError: Error | null = null

    for (const providerKey of this.getProviderOrder()) {
      const instance = this.providerInstances.get(providerKey)
      if (!instance) continue

      for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
        try {
          const response = await instance.call(fullPrompt)
          const files = this.parseFileChanges(response.content)

          this.contextManager.addMessage("user", request.query)
          this.contextManager.addMessage("assistant", response.content)

          return {
            success: true,
            operation: request.operation,
            output: response.content,
            files,
            confidence: 0.9,
            executedCommands: [],
            provider: response.provider,
            model: response.model,
            usage: response.usage,
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          this.logger.warn(`AI call failed (${providerKey} attempt ${attempt + 1}): ${lastError.message}`)
          if (attempt < this.retryAttempts - 1) {
            await this.sleep(this.retryDelayMs * (attempt + 1))
          }
        }
      }
      this.logger.warn(`Falling back from ${providerKey} to next provider`)
    }

    return {
      success: false,
      operation: request.operation,
      output: `All providers failed. Last error: ${lastError?.message ?? "unknown"}`,
      files: [],
      confidence: 0,
      executedCommands: [],
    }
  }

  public async stream(request: AgentRequest): Promise<AIStreamResponse> {
    if (this.providerInstances.size === 0) {
      throw new Error("No AI providers configured")
    }

    for (const providerKey of this.getProviderOrder()) {
      const instance = this.providerInstances.get(providerKey)
      if (!instance) continue
      try {
        const fullPrompt = this.buildFullPrompt(request)
        const streamResponse = await instance.stream(fullPrompt)
        this.contextManager.addMessage("user", request.query)
        return streamResponse
      } catch (err) {
        this.logger.warn(`Stream failed for ${providerKey}: ${err}`)
      }
    }

    throw new Error("No AI providers available for streaming")
  }

  public getCapabilities(): AgentOperation[] {
    return ["generate", "refactor", "review", "test", "debug", "document", "fix", "explain", "commit", "chat", "plan", "search", "rename"]
  }

  public getProviderInfo(): { name: string; model: string } | null {
    const provider = this.providerFactory.getActiveProvider()
    if (!provider) return null
    return { name: provider.name, model: provider.model }
  }

  public switchProvider(name: string): boolean {
    return this.providerFactory.switchProvider(name)
  }

  public listProviders(): string[] {
    return this.providerFactory.getAvailableProviders()
  }

  public async indexRepository(): Promise<void> {
    await this.contextManager.indexRepository()
  }

  public getRepositoryStats(): Record<string, unknown> {
    const index = this.contextManager.getIndex()
    if (!index) return {}
    return {
      totalFiles: index.files.length,
      totalSize: index.totalSize,
      languages: Object.fromEntries(index.languages),
    }
  }

  public clearHistory(): void {
    this.contextManager.clearHistory()
  }

  private getProviderOrder(): string[] {
    const configured = this.providerFactory.getAvailableProviders()
    const all = Array.from(this.providerInstances.keys())
    const ordered = configured.filter((p) => all.includes(p))
    for (const p of all) {
      if (!ordered.includes(p)) ordered.push(p)
    }
    return ordered
  }

  private buildFullPrompt(request: AgentRequest): string {
    const systemPrompt = request.systemPrompt ?? SYSTEM_PROMPTS[request.operation]
    const context = this.contextManager.getContext(request.query, 5)
    const history = this.contextManager.getHistory(6)
    const parts: string[] = []

    parts.push(`SYSTEM: ${systemPrompt}`)

    if (context) {
      parts.push(`\nREPOSITORY CONTEXT:\n${context}`)
    }

    if (history.length > 0) {
      parts.push("\nCONVERSATION HISTORY:")
      for (const msg of history) {
        parts.push(`${msg.role.toUpperCase()}: ${msg.content}`)
      }
    }

    if (request.language) {
      parts.push(`\nLANGUAGE: ${request.language}`)
    }

    if (request.files && request.files.length > 0) {
      parts.push(`\nFILES IN SCOPE: ${request.files.join(", ")}`)
    }

    if (request.jsonMode) {
      parts.push("\nIMPORTANT: Respond with valid JSON only.")
    }

    parts.push(`\nUSER: ${request.query}`)
    return parts.join("\n")
  }

  private parseFileChanges(content: string): FileChange[] {
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g
    let match: RegExpExecArray | null

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as { files?: unknown }
        if (parsed.files && Array.isArray(parsed.files)) {
          return (parsed.files as FileChange[]).filter(
            (f) => f.path && f.action && ["create", "update", "delete"].includes(f.action),
          )
        }
      } catch {
        // not valid JSON block, continue
      }
    }

    // Try bare JSON
    try {
      const parsed = JSON.parse(content) as { files?: unknown }
      if (parsed.files && Array.isArray(parsed.files)) {
        return parsed.files as FileChange[]
      }
    } catch {
      // not JSON
    }

    return []
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export default AIAgent
