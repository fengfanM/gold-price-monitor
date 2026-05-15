import express from 'express'
import { Pool } from 'pg'

const PORT = Number(process.env.POSTGRES_GATEWAY_PORT ?? process.env.PORT ?? '8790')
const DATABASE_URL = process.env.DATABASE_URL
const AUTH_TOKEN = process.env.POSTGRES_HTTP_TOKEN
const MAX_ROWS = Number(process.env.POSTGRES_GATEWAY_MAX_ROWS ?? '1000')
const BODY_LIMIT = process.env.POSTGRES_GATEWAY_BODY_LIMIT ?? '5mb'
const ALLOWED_STATEMENTS = /^(select|insert|update|delete|create\s+table|alter\s+table)\b/i

if (!DATABASE_URL) {
  throw new Error('Postgres gateway requires DATABASE_URL.')
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.POSTGRES_SSL === '0' ? undefined : { rejectUnauthorized: false },
})

const app = express()
app.use(express.json({ limit: BODY_LIMIT }))

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/query', async (request, response) => {
  try {
    if (AUTH_TOKEN) {
      const authorization = request.header('authorization')
      if (authorization !== `Bearer ${AUTH_TOKEN}`) {
        response.status(401).json({ error: 'unauthorized' })
        return
      }
    }

    const query = String(request.body?.query ?? '').trim()
    const params = Array.isArray(request.body?.params) ? request.body.params : []
    if (!ALLOWED_STATEMENTS.test(query) || query.includes(';')) {
      response.status(400).json({ error: 'unsupported SQL statement' })
      return
    }

    const result = await pool.query(query, params)
    response.json({
      rows: result.rows.slice(0, MAX_ROWS),
      rowCount: result.rowCount,
    })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

app.listen(PORT, () => {
  console.log(`postgres gateway listening on http://localhost:${PORT}`)
})
