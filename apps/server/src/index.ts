import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { QuoteService } from './service.js'

const PORT = Number(process.env.PORT ?? '8787')
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? '60000')
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const webDistDir = path.resolve(currentDir, '../../web/dist')

async function main() {
  const app = express()
  const service = new QuoteService()

  await service.init()

  app.get('/api/quote', async (_request, response) => {
    try {
      await service.refreshIfStale()
      response.json({
        success: true,
        data: service.getQuoteResponse(),
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  app.get('/api/history', async (_request, response) => {
    try {
      await service.refreshIfStale()
      response.json({
        success: true,
        data: service.getHistoryResponse(),
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  app.get('/api/snapshot', async (_request, response) => {
    try {
      await service.refreshIfStale()
      response.json({
        success: true,
        data: {
          quote: service.getQuoteResponse(),
          history: service.getHistoryResponse(),
        },
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  app.get('/api/health', (_request, response) => {
    response.json({
      success: true,
      data: {
        ok: true,
        upstreamError: service.getLastRefreshError(),
      },
    })
  })

  app.use(express.static(webDistDir))
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next()
      return
    }
    response.sendFile(path.join(webDistDir, 'index.html'))
  })

  setInterval(() => {
    void service.refresh()
  }, POLL_INTERVAL_MS).unref()

  app.listen(PORT, () => {
    console.log(`gold monitor server listening on http://localhost:${PORT}`)
  })
}

void main()
