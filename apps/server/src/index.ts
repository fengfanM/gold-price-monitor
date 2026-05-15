import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { QuoteService } from './service.js'
import { getProviderHealthHistory, probeAllMarketProviders } from './market-providers.js'
import { loadProviderHealthSnapshots, saveProviderHealthSnapshot } from './storage.js'

const PORT = Number(process.env.PORT ?? '8787')
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? '3000')
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

  app.get('/api/backtest', async (_request, response) => {
    try {
      response.json({
        success: true,
        data: await service.getBacktestMonitor(),
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  app.get('/api/providers/health', async (request, response) => {
    try {
      const shouldProbe = request.query.probe !== '0'
      const history = await loadProviderHealthSnapshots()
      const providers = shouldProbe
        ? await probeAllMarketProviders()
        : getProviderHealthHistory()
      const snapshot = {
        updatedAt: new Date().toISOString(),
        providers,
      }
      if (shouldProbe) {
        await saveProviderHealthSnapshot(snapshot)
      }
      response.json({
        success: true,
        data: {
          ...snapshot,
          history: shouldProbe ? [...history, snapshot].slice(-300) : history,
        },
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  app.get('/api/cron/ingest', async (request, response) => {
    if (!isAuthorizedCronRequest(request)) {
      response.status(401).json({
        success: false,
        error: 'unauthorized',
      })
      return
    }

    try {
      await service.refreshIfStale(request.query.force === '1' ? 0 : undefined)
      const [backtestSnapshotsBeforeHealth, providerHealthHistory] = await Promise.all([
        service.getBacktestMonitor(),
        loadProviderHealthSnapshots(),
      ])
      const providers = await probeAllMarketProviders()
      const providerSnapshot = {
        updatedAt: new Date().toISOString(),
        providers,
      }
      await saveProviderHealthSnapshot(providerSnapshot)
      const quote = service.getQuoteResponse()
      const history = service.getHistoryResponse()

      response.json({
        success: true,
        data: {
          ingestedAt: new Date().toISOString(),
          quoteTimestamp: quote.fetchedAt,
          price: quote.price,
          historyPoints: history.summary.pointCount,
          trainingSamples: backtestSnapshotsBeforeHealth.sampleSize,
          providerHealth: providerSnapshot,
          providerHealthHistoryPoints: [...providerHealthHistory, providerSnapshot].slice(-300).length,
          storage: process.env.STORAGE_ADAPTER ?? (
            process.env.POSTGRES_HTTP_URL ? 'postgres' : 'file'
          ),
        },
      })
    } catch (error) {
      response.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
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

function isAuthorizedCronRequest(request: express.Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return true
  }

  if (request.headers.authorization === `Bearer ${secret}`) {
    return true
  }

  if (request.headers['x-cron-secret'] === secret) {
    return true
  }

  return request.query.secret === secret
}

void main()
