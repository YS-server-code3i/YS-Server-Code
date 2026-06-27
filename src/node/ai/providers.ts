/**
 * AI Provider Configuration & Factory
 * Supports multiple LLM providers with automatic fallback
 */

import type { Logger } from "@coder/logger"

export interface AIProvider {
  name: string
  apiKey: string
  baseUrl?: string
  model: string
}

export interface AIResponse {
  content: string
  model: string
  provider: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface AIStreamResponse {
  stream: AsyncIterable<string>
  abort: () => void
}

export class AIProviderFactory {
  private providers: Map<string, AIProvider> = new Map()
  private activeProvider: string | null = null

  constructor(private logger: Logger) {
    this.initializeProviders()
  }

  private initializeProviders(): void {
    // OpenRouter (highest priority - aggregates multiple models)
    if (process.env.OPEN_ROUTER_API_KEY) {
      this.providers.set("openrouter", {
        name: "OpenRouter",
        apiKey: process.env.OPEN_ROUTER_API_KEY,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "meta-llama/llama-2-70b-chat",
      })
      this.activeProvider = "openrouter"
      this.logger.info("AI: OpenRouter configured")
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.set("openai", {
        name: "OpenAI",
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4-turbo-preview",
      })
      if (!this.activeProvider) {
        this.activeProvider = "openai"
        this.logger.info("AI: OpenAI configured")
      }
    }

    // Anthropic Claude
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set("anthropic", {
        name: "Anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: "claude-3-opus-20240229",
      })
      if (!this.activeProvider) {
        this.activeProvider = "anthropic"
        this.logger.info("AI: Anthropic Claude configured")
      }
    }

    // Google Gemini
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      this.providers.set("gemini", {
        name: "Google Gemini",
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        model: "gemini-pro",
      })
      if (!this.activeProvider) {
        this.activeProvider = "gemini"
        this.logger.info("AI: Google Gemini configured")
      }
    }

    // OpenAI-compatible (self-hosted, LocalAI, etc.)
    if (process.env.OPENAI_LIKE_API_KEY && process.env.OPENAI_LIKE_BASE_URL) {
      this.providers.set("openai-like", {
        name: "OpenAI-Compatible",
        apiKey: process.env.OPENAI_LIKE_API_KEY,
        baseUrl: process.env.OPENAI_LIKE_BASE_URL,
        model: process.env.OPENAI_LIKE_MODEL || "gpt-3.5-turbo",
      })
      if (!this.activeProvider) {
        this.activeProvider = "openai-like"
        this.logger.info("AI: OpenAI-compatible provider configured")
      }
    }

    if (!this.activeProvider) {
      this.logger.warn(
        "AI: No providers configured. Set environment variables for LLM access."
      )
    }
  }

  public getActiveProvider(): AIProvider | null {
    if (!this.activeProvider) return null
    return this.providers.get(this.activeProvider) || null
  }

  public switchProvider(name: string): boolean {
    if (this.providers.has(name)) {
      this.activeProvider = name
      this.logger.info(`AI: Switched to provider: ${name}`)
      return true
    }
    return false
  }

  public getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  public hasProvider(): boolean {
    return this.activeProvider !== null
  }

  public getGitHubApiKey(): string | undefined {
    return process.env.GITHUB_API_KEY
  }
}

export default AIProviderFactory
