import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  getProviderHealthHistory,
  probeAllMarketProviders,
} from '../../apps/server/src/market-providers.js'
import {
  loadProviderHealthSnapshots,
  saveProviderHealthSnapshot,
} from '../../apps/server/src/storage.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
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

    response.status(200).json({
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
}
