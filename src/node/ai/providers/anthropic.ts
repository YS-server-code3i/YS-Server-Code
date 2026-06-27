/**
 * Anthropic Claude Provider Implementation
 */

import type { AIResponse, AIStreamResponse } from "../providers"

export class AnthropicProvider {
  constructor(
    private apiKey: string,
    private model: string = "claude-3-opus-20240229"
  ) {}

  async call(prompt: string): Promise<AIResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`)
    }

    const data = await response.json() as { content: Array<{ text: string }>; usage: { input_tokens: number; output_tokens: number } }
    const content = data.content[0]?.text || ""

    return {
      content,
      model: this.model,
      provider: "Anthropic",
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    }
  }

  async stream(prompt: string): Promise<AIStreamResponse> {
    let aborted = false

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`)
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
              try {
                const json = JSON.parse(data) as { type: string; delta?: { type: string; text?: string } }
                if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
                  yield json.delta.text || ""
                }
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
