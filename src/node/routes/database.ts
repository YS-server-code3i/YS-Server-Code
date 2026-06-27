/**
 * Database Routes - PostgreSQL connection manager, explorer, and query runner
 * Supports health checks, migrations, table browser, query execution
 */

import { Router } from "express"
import type { Request, Response } from "express"

export const router = Router()

interface PgClient {
  query(text: string, params?: unknown[]): Promise<{
    rows: Record<string, unknown>[]
    rowCount: number | null
    fields?: Array<{ name: string; dataTypeID: number }>
  }>
  end(): Promise<void>
}

interface PgModule {
  Pool: new (opts: {
    connectionString: string
    ssl?: boolean | { rejectUnauthorized: boolean }
    max?: number
    idleTimeoutMillis?: number
    connectionTimeoutMillis?: number
  }) => PgClient
}

let pool: PgClient | null = null
let pgAvailable = false

async function getPool(): Promise<PgClient | null> {
  if (pool) return pool
  try {
    // Dynamic import to avoid compile-time error when pg is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pg = require("pg") as PgModule
    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURL || ""
    if (!connectionString) return null

    const newPool = new pg.Pool({
      connectionString,
      ssl: connectionString.includes("ssl=no") ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })

    await newPool.query("SELECT 1")
    pool = newPool
    pgAvailable = true
    return pool
  } catch {
    pgAvailable = false
    pool = null
    return null
  }
}

router.get("/status", async (_req: Request, res: Response) => {
  const dbPool = await getPool()
  if (!dbPool) {
    res.json({
      connected: false,
      configured: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURL),
      message: pgAvailable ? "Connection failed" : "No DATABASE_URL configured or pg not installed",
    })
    return
  }

  try {
    const start = Date.now()
    const result = await dbPool.query("SELECT version(), now() as server_time")
    const row = result.rows[0] || {}
    res.json({
      connected: true,
      version: row["version"],
      serverTime: row["server_time"],
      latencyMs: Date.now() - start,
    })
  } catch (err) {
    pool = null
    res.json({ connected: false, error: String(err) })
  }
})

router.post("/query", async (req: Request, res: Response) => {
  const { sql, params = [] } = req.body as { sql?: string; params?: unknown[] }
  if (!sql) {
    res.status(400).json({ error: "sql is required" })
    return
  }

  const dangerousPatterns = /^\s*(drop\s+database|drop\s+schema|truncate\s+\w+\s*;?\s*$)/i
  if (dangerousPatterns.test(sql)) {
    res.status(400).json({ error: "Potentially destructive statement blocked." })
    return
  }

  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected. Set DATABASE_URL environment variable." })
    return
  }

  try {
    const start = Date.now()
    const result = await dbPool.query(sql, params)
    res.json({
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      duration: Date.now() - start,
    })
  } catch (err) {
    res.status(400).json({ error: String(err) })
  }
})

router.get("/tables", async (_req: Request, res: Response) => {
  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  try {
    const result = await dbPool.query(`
      SELECT
        t.table_schema,
        t.table_name,
        t.table_type,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size,
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid) as estimated_rows
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.table_schema, t.table_name
    `)
    res.json({ tables: result.rows })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/tables/:schema/:table/columns", async (req: Request, res: Response) => {
  const { schema, table } = req.params
  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  try {
    const result = await dbPool.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable,
        column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    )
    res.json({ columns: result.rows })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/tables/:schema/:table/rows", async (req: Request, res: Response) => {
  const schema = String(req.params.schema || "")
  const table = String(req.params.table || "")
  const { limit = "100", offset = "0", orderBy = "1", order = "ASC" } = req.query as Record<string, string>

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    res.status(400).json({ error: "Invalid schema or table name" })
    return
  }

  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  try {
    const safeLimit = Math.min(parseInt(limit, 10) || 100, 1000)
    const safeOffset = parseInt(offset, 10) || 0
    const safeOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC"
    const safeOrderBy = /^\d+$/.test(orderBy) ? orderBy : "1"

    const result = await dbPool.query(
      `SELECT * FROM "${schema}"."${table}" ORDER BY ${safeOrderBy} ${safeOrder} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    )
    const countResult = await dbPool.query(`SELECT count(*) as total FROM "${schema}"."${table}"`)

    res.json({
      rows: result.rows,
      rowCount: result.rows.length,
      total: parseInt(String((countResult.rows[0] || {})["total"] || "0"), 10),
      limit: safeLimit,
      offset: safeOffset,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/indexes", async (_req: Request, res: Response) => {
  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  try {
    const result = await dbPool.query(`
      SELECT
        i.relname as index_name,
        t.relname as table_name,
        n.nspname as schema_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        pg_get_indexdef(i.oid) as definition
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.relname, i.relname
    `)
    res.json({ indexes: result.rows })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.get("/migrations", async (_req: Request, res: Response) => {
  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  const tables = ["schema_migrations", "migrations", "_prisma_migrations", "knex_migrations"]
  for (const t of tables) {
    try {
      const result = await dbPool.query(`SELECT * FROM ${t} ORDER BY 1 DESC LIMIT 50`)
      res.json({ table: t, migrations: result.rows })
      return
    } catch {
      // table doesn't exist, try next
    }
  }
  res.json({ table: null, migrations: [], message: "No migration table found" })
})

router.post("/migrate", async (req: Request, res: Response) => {
  const { sql, description } = req.body as { sql?: string; description?: string }
  if (!sql) {
    res.status(400).json({ error: "sql migration script is required" })
    return
  }

  const dbPool = await getPool()
  if (!dbPool) {
    res.status(503).json({ error: "Database not connected" })
    return
  }

  try {
    await dbPool.query("BEGIN")
    await dbPool.query(sql)
    try {
      const version = Date.now().toString()
      await dbPool.query(
        "INSERT INTO schema_migrations (version, description, executed_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
        [version, description || sql.slice(0, 100)],
      )
    } catch {
      // migrations table doesn't exist
    }
    await dbPool.query("COMMIT")
    res.json({ success: true, description })
  } catch (err) {
    await dbPool.query("ROLLBACK").catch(() => undefined)
    res.status(400).json({ error: String(err) })
  }
})

router.get("/health", async (_req: Request, res: Response) => {
  const dbPool = await getPool()
  if (!dbPool) {
    res.json({ healthy: false, message: "Not connected" })
    return
  }
  try {
    await dbPool.query("SELECT 1")
    res.json({ healthy: true })
  } catch (err) {
    res.json({ healthy: false, error: String(err) })
  }
})

export default router
