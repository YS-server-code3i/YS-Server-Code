/**
 * AI Agent - Main orchestrator for code generation, analysis, and operations
 * Handles multi-file edits, code review, testing, and git operations
 */

import type { Logger } from "@coder/logger"
import AIProviderFactory, { type AIProvider, type AIResponse } from "./providers"
import ContextManager from "./context"
import { execSync } from "child_process"

export interface AgentRequest {
  query: string
  files?: string[]
  operation: AgentOperation
  language?: string
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

export interface AgentResult {
  success: boolean
  operation: AgentOperation
  output: string
  files: Array<{ path: string; content: string; action: "create" | "update" | "delete" }>
  confidence: number
  executedCommands: string[]
}

export class AIAgent {
  private providerFactory: AIProviderFactory
  private contextManager: ContextManager

  constructor(
    private logger: Logger,
    workspaceDir: string
  ) {
    this.providerFactory = new AIProviderFactory(logger)
    this.contextManager = new ContextManager(logger, workspaceDir)
  }

  /**
   * Initialize the agent
   */
  public async initialize(): Promise<void> {
    if (!this.providerFactory.hasProvider()) {
      this.logger.warn("AI Agent: No LLM providers available")
      return
    }

    await this.contextManager.indexRepository()
    this.logger.info("AI Agent initialized")
  }

  /**
   * Process a request through the AI agent
   */
  public async process(request: AgentRequest): Promise<AgentResult> {
    const provider = this.providerFactory.getActiveProvider()

    if (!provider) {
      return {
        success: false,
        operation: request.operation,
        output: "No AI provider configured",
        files: [],
        confidence: 0,
        executedCommands: [],
      }
    }

    try {
      const prompt = this.buildPrompt(request, provider)
      const response = await this.callProvider(provider, prompt)

      const result: AgentResult = {
        success: true,
        operation: request.operation,
        output: response.content,
        files: this.parseFileChanges(response.content, request.operation),
        confidence: 0.85,
        executedCommands: [],
      }

      // Add message to history
      this.contextManager.addMessage("user", request.query)
      this.contextManager.addMessage("assistant", response.content)

      return result
    } catch (error) {
      this.logger.error(`Agent error: ${error}`)
      return {
        success: false,
        operation: request.operation,
        output: `Error: ${error}`,
        files: [],
        confidence: 0,
        executedCommands: [],
      }
    }
  }

  /**
   * Get available capabilities
   */
  public getCapabilities(): AgentOperation[] {
    return [
      "generate",
      "refactor",
      "review",
      "test",
      "debug",
      "document",
      "fix",
      "explain",
      "commit",
    ]
  }

  /**
   * Get active provider info
   */
  public getProviderInfo(): { name: string; model: string } | null {
    const provider = this.providerFactory.getActiveProvider()
    if (!provider) return null
    return { name: provider.name, model: provider.model }
  }

  /**
   * Switch AI provider
   */
  public switchProvider(name: string): boolean {
    return this.providerFactory.switchProvider(name)
  }

  /**
   * List available providers
   */
  public listProviders(): string[] {
    return this.providerFactory.getAvailableProviders()
  }

  /**
   * Index the repository
   */
  public async indexRepository(): Promise<void> {
    await this.contextManager.indexRepository()
  }

  /**
   * Get repository statistics
   */
  public getRepositoryStats(): Record<string, unknown> {
    const index = this.contextManager.getIndex()
    if (!index) return {}

    return {
      totalFiles: index.files.length,
      totalSize: index.totalSize,
      languages: Object.fromEntries(index.languages),
    }
  }

  private buildPrompt(request: AgentRequest, provider: AIProvider): string {
    const context = this.contextManager.getContext(request.query, 5)
    const history = this.contextManager.getHistory(5)

    let prompt = ""

    // System instructions based on operation
    switch (request.operation) {
      case "generate":
        prompt += "You are an expert code generator. "
        break
      case "refactor":
        prompt += "You are an expert code refactorer. Improve code quality, performance, and maintainability. "
        break
      case "review":
        prompt += "You are an expert code reviewer. Analyze code for bugs, security issues, and best practices. "
        break
      case "test":
        prompt += "You are an expert test engineer. Generate comprehensive unit and integration tests. "
        break
      case "debug":
        prompt += "You are an expert debugger. Identify and fix bugs efficiently. "
        break
      case "document":
        prompt += "You are an expert technical writer. Generate clear, comprehensive documentation. "
        break
      case "fix":
        prompt += "You are an expert bug fixer. Identify root causes and implement robust fixes. "
        break
      case "explain":
        prompt += "You are an expert code explainer. Provide clear, detailed explanations. "
        break
      case "commit":
        prompt += "You are an expert git developer. Generate meaningful commit messages. "
        break
    }

    prompt += `Use ${provider.model}. Respond in valid JSON format.\n\n`

    if (context) {
      prompt += `Repository Context:\n${context}\n\n`
    }

    if (history.length > 0) {
      prompt += "Conversation History:\n"
      for (const msg of history) {
        prompt += `${msg.role.toUpperCase()}: ${msg.content}\n`
      }
      prompt += "\n"
    }

    prompt += `Request: ${request.query}\n`

    if (request.files && request.files.length > 0) {
      prompt += `Files: ${request.files.join(", ")}\n`
    }

    prompt += `Language: ${request.language || "auto-detect"}\n`

    return prompt
  }

  private async callProvider(
    provider: AIProvider,
    prompt: string
  ): Promise<AIResponse> {
    // Placeholder - will be expanded per provider
    return {
      content: "AI response placeholder",
      model: provider.model,
      provider: provider.name,
    }
  }

  private parseFileChanges(
    content: string,
    operation: AgentOperation
  ): Array<{ path: string; content: string; action: "create" | "update" | "delete" }> {
    // Parse AI response for file changes (JSON format)
    try {
      const json = JSON.parse(content)
      if (json.files && Array.isArray(json.files)) {
        return json.files
      }
    } catch {
      // Not JSON, try regex parsing
    }

    return []
  }
}

export default AIAgent
