/**
 * AI Index - Main entry point for AI subsystem
 */

export { AIProviderFactory } from "./providers"
export type { AIProvider, AIResponse, AIStreamResponse } from "./providers"

export { ContextManager } from "./context"
export type { FileContext, RepositoryIndex, ConversationMessage } from "./context"

export { AIAgent } from "./agent"
export type { AgentRequest, AgentOperation, AgentResult } from "./agent"

export { OpenAIProvider } from "./providers/openai"
export { AnthropicProvider } from "./providers/anthropic"
export { GeminiProvider } from "./providers/gemini"
export { OpenRouterProvider } from "./providers/openrouter"
export { OpenAICompatibleProvider } from "./providers/openai-compatible"
