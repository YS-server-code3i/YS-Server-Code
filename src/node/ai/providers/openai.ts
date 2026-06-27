/**
 * OpenAI Provider Implementation
 */

import type { AIResponse, AIStreamResponse } from "../providers"

export class OpenAIProvider {
  constructor(
    private apiKey: string,
    private model: string = "gpt-4-turbo-preview",
    private baseUrl: string = "https://api.openai.com/v1"
  ) {}

  async call(prompt: string): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } }
    const content = data.choices[0]?.message?.content || ""

    return {
      content,
      model: this.model,
      provider: "OpenAI",
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
      },
    }
  }

  async stream(prompt: string): Promise<AIStreamResponse> {
    let aborted = false

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`OpenAI API error: ${response.statusText}`)
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
