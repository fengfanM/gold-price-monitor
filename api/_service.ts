import { QuoteService } from '../apps/server/src/service.js'

let servicePromise: Promise<QuoteService> | null = null

export async function getQuoteService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const service = new QuoteService()
      await service.init()
      return service
    })()
  }

  return servicePromise
}
