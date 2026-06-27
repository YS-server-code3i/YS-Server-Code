/**
 * YS-Servece-Code Companion Server
 * Runs alongside code-server to provide AI, GitHub, file, and database APIs
 * Accessible via code-server's built-in port proxy at /proxy/3001/
 */

import express from "express"
import compression from "compression"
import { logger } from "@coder/logger"
import * as path from "path"
import * as fs from "fs"
import { AIAgent } from "./ai/agent"
import aiRouter, { initializeAIRoutes } from "./routes/ai"
import githubRouter from "./routes/github"
import filesRouter from "./routes/files"
import databaseRouter from "./routes/database"

const PORT = parseInt(process.env.COMPANION_PORT || "3001", 10)
const WORKSPACE = process.env.WORKSPACE_DIR || "/home/runner/workspace"

async function main(): Promise<void> {
  const app = express()

  app.use(compression())
  app.use(express.json({ limit: "50mb" }))
  app.use(express.urlencoded({ extended: true, limit: "50mb" }))

  // CORS — allow code-server proxy requests
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
    if (_req.method === "OPTIONS") {
      res.sendStatus(204)
      return
    }
    next()
  })

  // Disable fingerprinting
  app.disable("x-powered-by")

  // ---------------------------------------------------------------------------
  // Initialize AI agent
  // ---------------------------------------------------------------------------
  const agent = new AIAgent(logger, WORKSPACE)
  try {
    await agent.initialize()
    logger.info("AI Agent ready")
  } catch (err) {
    logger.warn(`AI Agent initialization warning: ${err}`)
  }
  initializeAIRoutes(agent)

  // ---------------------------------------------------------------------------
  // API routes
  // ---------------------------------------------------------------------------
  app.use("/api/ai", aiRouter)
  app.use("/api/github", githubRouter)
  app.use("/api/files", filesRouter)
  app.use("/api/db", databaseRouter)

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------
  app.get("/healthz", (_req, res) => {
    res.json({
      status: "alive",
      service: "ys-servece-code-companion",
      version: "1.0.0",
      providers: agent.listProviders(),
      workspace: WORKSPACE,
    })
  })

  // ---------------------------------------------------------------------------
  // Serve static AI chat UI
  // ---------------------------------------------------------------------------
  const aiHtmlPath = path.resolve(__dirname, "../../src/browser/pages/ai.html")
  const aiCssPath = path.resolve(__dirname, "../../src/browser/pages/ai.css")

  app.get("/ai.css", (_req, res) => {
    if (fs.existsSync(aiCssPath)) {
      res.setHeader("Content-Type", "text/css")
      res.sendFile(aiCssPath)
    } else {
      res.status(404).send("/* ai.css not found */")
    }
  })

  app.get(["/", "/ai", "/chat"], (_req, res) => {
    if (fs.existsSync(aiHtmlPath)) {
      res.setHeader("Content-Type", "text/html")
      res.sendFile(aiHtmlPath)
    } else {
      res.send(fallbackHtml())
    }
  })

  // ---------------------------------------------------------------------------
  // 404 handler
  // ---------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" })
  })

  // ---------------------------------------------------------------------------
  // Error handler
  // ---------------------------------------------------------------------------
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`Companion server error: ${err.message}`)
    res.status(500).json({ error: err.message })
  })

  // ---------------------------------------------------------------------------
  // Start listening
  // ---------------------------------------------------------------------------
  app.listen(PORT, "127.0.0.1", () => {
    logger.info(`YS-Servece-Code companion server listening on http://127.0.0.1:${PORT}`)
    logger.info(`  AI Chat UI: http://127.0.0.1:${PORT}/`)
    logger.info(`  AI API:     http://127.0.0.1:${PORT}/api/ai/`)
    logger.info(`  GitHub API: http://127.0.0.1:${PORT}/api/github/`)
    logger.info(`  Files API:  http://127.0.0.1:${PORT}/api/files/`)
    logger.info(`  DB API:     http://127.0.0.1:${PORT}/api/db/`)
    logger.info(`  Via proxy:  /proxy/3001/ (in code-server)`)
  })
}

function fallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YS-Servece-Code AI</title>
  <style>
    body { background: #0b1220; color: #f8fafc; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .msg { text-align: center; }
    h1 { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="msg">
    <h1>YS-Servece-Code</h1>
    <p>Companion server is running. AI API available at <code>/api/ai/</code></p>
  </div>
</body>
</html>`
}

main().catch((err) => {
  logger.error(`Companion server fatal error: ${err}`)
  process.exit(1)
})
