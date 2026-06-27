/**
 * AI Routes - REST API endpoints for AI operations
 * Supports chat, code generation, streaming, provider management
 */

import { Router } from "express"
import type { Request, Response } from "express"
import AIAgent, { type AgentOperation } from "../ai/agent"

export const router = Router()

let agent: AIAgent | null = null

export function initializeAIRoutes(aiAgent: AIAgent): void {
  agent = aiAgent
}

function requireAgent(res: Response): boolean {
  if (!agent) {
    res.status(503).json({ error: "AI agent not initialized" })
    return false
  }
  return true
}

router.post("/chat", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, operation = "chat", language, files, systemPrompt } = req.body as {
    query?: string
    operation?: string
    language?: string
    files?: string[]
    systemPrompt?: string
  }

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query (string) is required" })
    return
  }

  try {
    const result = await agent!.process({
      query,
      operation: (operation as AgentOperation) || "chat",
      language,
      files,
      systemPrompt,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/stream", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, operation = "chat", language, files, systemPrompt } = req.body as {
    query?: string
    operation?: string
    language?: string
    files?: string[]
    systemPrompt?: string
  }

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query (string) is required" })
    return
  }

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()

  let streamResponse: Awaited<ReturnType<AIAgent["stream"]>> | null = null

  const cleanup = () => {
    if (streamResponse) {
      streamResponse.abort()
    }
  }

  req.on("close", cleanup)
  req.on("aborted", cleanup)

  try {
    streamResponse = await agent!.stream({
      query,
      operation: (operation as AgentOperation) || "chat",
      language,
      files,
      systemPrompt,
    })

    for await (const chunk of streamResponse.stream) {
      if (res.writableEnded) break
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    }

    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n")
      res.end()
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
      res.end()
    }
  }
})

router.post("/generate", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, language = "typescript" } = req.body as { query?: string; language?: string }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, operation: "generate", language })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/refactor", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files } = req.body as { query?: string; files?: string[] }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "refactor" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/review", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files } = req.body as { query?: string; files?: string[] }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "review" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/test", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files, language = "typescript" } = req.body as {
    query?: string
    files?: string[]
    language?: string
  }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "test", language })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/fix", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files } = req.body as { query?: string; files?: string[] }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "fix" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/debug", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files } = req.body as { query?: string; files?: string[] }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "debug" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/explain", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query, files } = req.body as { query?: string; files?: string[] }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, files, operation: "explain" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/commit", async (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { query } = req.body as { query?: string }
  if (!query) {
    res.status(400).json({ error: "query is required" })
    return
  }

  try {
    const result = await agent!.process({ query, operation: "commit" })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/status", (_req: Request, res: Response) => {
  if (!agent) {
    res.json({ status: "unavailable", reason: "AI agent not initialized" })
    return
  }

  const providerInfo = agent.getProviderInfo()
  const capabilities = agent.getCapabilities()
  const providers = agent.listProviders()

  res.json({
    status: providerInfo ? "ready" : "no-provider",
    provider: providerInfo,
    capabilities,
    availableProviders: providers,
  })
})

router.get("/repo-stats", (_req: Request, res: Response) => {
  if (!requireAgent(res)) return

  try {
    const stats = agent!.getRepositoryStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post("/reindex", async (_req: Request, res: Response) => {
  if (!requireAgent(res)) return

  try {
    await agent!.indexRepository()
    const stats = agent!.getRepositoryStats()
    res.json({ success: true, stats })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete("/history", (_req: Request, res: Response) => {
  if (!requireAgent(res)) return

  agent!.clearHistory()
  res.json({ success: true })
})

router.post("/provider/switch", (req: Request, res: Response) => {
  if (!requireAgent(res)) return

  const { provider } = req.body as { provider?: string }
  if (!provider) {
    res.status(400).json({ error: "provider name is required" })
    return
  }

  const success = agent!.switchProvider(provider)
  if (success) {
    res.json({ success: true, provider: agent!.getProviderInfo() })
  } else {
    res.status(400).json({ error: `Provider '${provider}' not available` })
  }
})

export default router
