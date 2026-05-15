import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  probeAllMarketProviders,
} from '../../apps/server/src/market-providers.js'
import {
  loadBacktestSnapshots,
  loadProviderHealthSnapshots,
  saveProviderHealthSnapshot,
} from '../../apps/server/src/storage.js'
import { getQuoteService } from '../_service.js'

const DEFAULT_INGEST_REFRESH_TTL_MS = Number(
  process.env.INGEST_REFRESH_TTL_MS ?? '60000',
)

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method && !['GET', 'POST'].includes(request.method)) {
    response.status(405).json({
      success: false,
      error: 'method_not_allowed',
    })
    return
  }

  if (!isAuthorizedCronRequest(request)) {
    response.status(401).json({
      success: false,
      error: 'unauthorized',
    })
    return
  }

  try {
    const service = await getQuoteService()
    await service.refreshIfStale(resolveRefreshTtl(request))

    const [backtestSnapshotsBeforeHealth, providerHealthHistory] = await Promise.all([
      loadBacktestSnapshots(),
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

    response.status(200).json({
      success: true,
      data: {
        ingestedAt: new Date().toISOString(),
        quoteTimestamp: quote.fetchedAt,
        price: quote.price,
        historyPoints: history.summary.pointCount,
        trainingSamples: backtestSnapshotsBeforeHealth.length,
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
}

function isAuthorizedCronRequest(request: VercelRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return true
  }

  const authorization = request.headers.authorization
  if (authorization === `Bearer ${secret}`) {
    return true
  }

  const headerSecret = request.headers['x-cron-secret']
  if (headerSecret === secret) {
    return true
  }

  return request.query.secret === secret
}

function resolveRefreshTtl(request: VercelRequest) {
  if (request.query.force === '1') {
    return 0
  }

  return DEFAULT_INGEST_REFRESH_TTL_MS
}
