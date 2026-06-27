/**
 * AI Routes - REST API endpoints for AI operations
 */

import { Router, Request, Response } from "express"
import type { Logger } from "@coder/logger"
import AIAgent, { type AgentRequest, type AgentOperation } from "../ai/agent"

export const router = Router()

let agent: AIAgent | null = null

/**
 * Initialize AI routes with agent instance
 */
export function initializeAIRoutes(aiAgent: AIAgent): void {
  agent = aiAgent
}

/**
 * POST /api/ai/chat - Send a message to the AI agent
 */
router.post("/chat", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, operation = "explain", language } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    const request: AgentRequest = {
      query,
      operation: (operation as AgentOperation) || "explain",
      language,
    }

    const result = await agent.process(request)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/generate - Generate code
 */
router.post("/generate", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, language = "typescript" } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await agent.process({
      query,
      operation: "generate",
      language,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/refactor - Refactor code
 */
router.post("/refactor", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, files } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await agent.process({
      query,
      files,
      operation: "refactor",
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/review - Review code
 */
router.post("/review", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, files } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await agent.process({
      query,
      files,
      operation: "review",
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/test - Generate tests
 */
router.post("/test", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, files, language = "typescript" } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await agent.process({
      query,
      files,
      operation: "test",
      language,
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/fix - Fix bugs
 */
router.post("/fix", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { query, files } = req.body

    if (!query) {
      return res.status(400).json({ error: "Query is required" })
    }

    const result = await agent.process({
      query,
      files,
      operation: "fix",
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * GET /api/ai/status - Get AI agent status
 */
router.get("/status", (req: Request, res: Response) => {
  if (!agent) {
    return res.json({ status: "unavailable", reason: "AI agent not initialized" })
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

/**
 * GET /api/ai/repo-stats - Get repository statistics
 */
router.get("/repo-stats", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const stats = agent.getRepositoryStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/reindex - Reindex repository
 */
router.post("/reindex", async (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    await agent.indexRepository()
    const stats = agent.getRepositoryStats()
    res.json({ success: true, stats })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

/**
 * POST /api/ai/provider/switch - Switch AI provider
 */
router.post("/provider/switch", (req: Request, res: Response) => {
  if (!agent) {
    return res.status(503).json({ error: "AI agent not initialized" })
  }

  try {
    const { provider } = req.body

    if (!provider) {
      return res.status(400).json({ error: "Provider name is required" })
    }

    const success = agent.switchProvider(provider)

    if (success) {
      res.json({ success: true, provider: agent.getProviderInfo() })
    } else {
      res.status(400).json({ error: `Provider '${provider}' not found` })
    }
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

export default router
