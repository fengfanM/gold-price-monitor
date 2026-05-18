import type { VercelRequest, VercelResponse } from '@vercel/node'

import { probeAllMarketProviders } from '../../apps/server/src/market-providers.js'
import {
  loadProviderHealthSnapshots,
  saveProviderHealthSnapshot,
} from '../../apps/server/src/storage.js'

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
    const history = await loadProviderHealthSnapshots()
    const providers = await probeAllMarketProviders()
    const snapshot = {
      updatedAt: new Date().toISOString(),
      providers,
    }
    await saveProviderHealthSnapshot(snapshot)

    response.status(200).json({
      success: true,
      data: {
        ...snapshot,
        historyPoints: [...history, snapshot].slice(-300).length,
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
  if (process.env.VERCEL === '1' && request.headers['x-vercel-cron'] === '1') {
    return true
  }

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
