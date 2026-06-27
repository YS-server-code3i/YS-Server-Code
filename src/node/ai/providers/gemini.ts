/**
 * Google Gemini Provider Implementation
 */

import type { AIResponse, AIStreamResponse } from "../providers"

export class GeminiProvider {
  constructor(
    private apiKey: string,
    private model: string = "gemini-pro"
  ) {}

  async call(prompt: string): Promise<AIResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
    const content = data.candidates[0]?.content?.parts[0]?.text || ""

    return {
      content,
      model: this.model,
      provider: "Google Gemini",
    }
  }

  async stream(prompt: string): Promise<AIStreamResponse> {
    let aborted = false

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
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
            if (line.trim()) {
              try {
                const json = JSON.parse(line) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
                const text = json.candidates[0]?.content?.parts[0]?.text
                if (text) yield text
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
