/**
 * OpenAI-Compatible Provider Implementation
 * Supports LocalAI, Ollama, and other OpenAI-compatible APIs
 */

import type { AIResponse, AIStreamResponse } from "../providers"

export class OpenAICompatibleProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string = "gpt-3.5-turbo"
  ) {
    // Ensure baseUrl doesn't have trailing slash
    if (this.baseUrl.endsWith("/")) {
      this.baseUrl = this.baseUrl.slice(0, -1)
    }
  }

  async call(prompt: string): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API error: ${response.statusText}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } }
    const content = data.choices[0]?.message?.content || ""

    return {
      content,
      model: this.model,
      provider: "OpenAI-Compatible",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
          }
        : undefined,
    }
  }

  async stream(prompt: string): Promise<AIStreamResponse> {
    let aborted = false

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API error: ${response.statusText}`)
    }

    const stream = (async function* () {
      if (!response.body) return
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") return
              try {
                const json = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> }
                const content = json.choices[0]?.delta?.content
                if (content) yield content
              } catch {
                // Parse error, skip
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    })()

    return {
      stream,
      abort: () => {
        aborted = true
      },
    }
  }
}
