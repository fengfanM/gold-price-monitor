import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getQuoteService } from './_service.js'

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const service = await getQuoteService()
    await service.refreshIfStale()
    response.status(200).json({
      success: true,
      data: service.getEventIntelligenceResponse(),
    })
  } catch (error) {
    response.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
