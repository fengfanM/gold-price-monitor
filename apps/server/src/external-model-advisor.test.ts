import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { fetchExternalModelAdvisor } from './external-model-advisor.js'
import type {
  HistoryPoint,
  ProbabilityModelSnapshot,
  QuoteSample,
  QuoteStats24h,
} from './types.js'

const originalFetch = globalThis.fetch

describe('external model advisor', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.EXTERNAL_TS_MODEL_URL
    delete process.env.EXTERNAL_TS_MODEL_ENDPOINTS
    delete process.env.EXTERNAL_TS_MODEL_TOKEN
    delete process.env.EXTERNAL_TS_MODEL_PROVIDER
    delete process.env.EXTERNAL_TS_MODEL_NAME
  })

  it('stays explicit and safe when no external model endpoint is configured', async () => {
    const advisor = await fetchExternalModelAdvisor(makeInput())

    assert.equal(advisor.status, 'unconfigured')
    assert.equal(advisor.upProbability, null)
    assert.equal(advisor.risks.some((item) => item.includes('不要直接复制')), true)
  })

  it('normalizes a live pretrained model response into a bounded advisor opinion', async () => {
    process.env.EXTERNAL_TS_MODEL_URL = 'https://example.com/forecast'
    process.env.EXTERNAL_TS_MODEL_PROVIDER = 'chronos'
    process.env.EXTERNAL_TS_MODEL_NAME = 'amazon/chronos-bolt-base'
    globalThis.fetch = (async (_url, init) => {
      assert.equal((init as RequestInit).method, 'POST')
      return new Response(JSON.stringify({
        upProbability: 0.64,
        confidence: 78,
        forecastPrice: 1008.5,
        intervalLow: 995,
        intervalHigh: 1016,
        rationale: ['zero-shot probabilistic forecast supports upside'],
      }))
    }) as typeof fetch

    const advisor = await fetchExternalModelAdvisor(makeInput())

    assert.equal(advisor.status, 'live')
    assert.equal(advisor.provider, 'chronos')
    assert.equal(advisor.upProbability, 0.64)
    assert.equal(advisor.downProbability, 0.36)
    assert.equal(advisor.confidence, 78)
    assert.equal(advisor.forecastPrice, 1008.5)
  })

  it('calls multiple configured provider endpoints in parallel and keeps competitors for provider buckets', async () => {
    process.env.EXTERNAL_TS_MODEL_ENDPOINTS = JSON.stringify([
      {
        url: 'https://chronos.example.com/forecast',
        provider: 'chronos',
        name: 'amazon/chronos-bolt-base',
        token: 'chronos-token',
      },
      {
        url: 'https://timesfm.example.com/forecast',
        provider: 'timesfm',
        name: 'google/timesfm',
        token: 'timesfm-token',
      },
    ])
    const seen = new Set<string>()
    globalThis.fetch = (async (url, init) => {
      const target = String(url)
      seen.add(target)
      if (target.includes('chronos')) {
        assert.equal((init as RequestInit).method, 'POST')
        return new Response(JSON.stringify({
          upProbability: 0.61,
          confidence: 72,
          forecastPrice: 1006,
        }))
      }
      return new Response(JSON.stringify({
        upProbability: 0.58,
        confidence: 80,
        forecastPrice: 1004,
      }))
    }) as typeof fetch

    const advisor = await fetchExternalModelAdvisor(makeInput())

    assert.equal(advisor.status, 'live')
    assert.equal(advisor.provider, 'chronos')
    assert.equal(advisor.competitors?.length, 1)
    assert.equal(advisor.competitors?.[0]?.provider, 'timesfm')
    assert.equal(seen.has('https://chronos.example.com/forecast'), true)
    assert.equal(seen.has('https://timesfm.example.com/forecast'), true)
  })
})

function makeInput() {
  const latestQuote: QuoteSample = {
    productName: '积存金',
    productCode: '080020000521',
    symbol: 'ICBC_GOLD_ACCUMULATION',
    currency: 'CNY',
    unit: '元/克',
    price: 1001,
    activePrice: 1001,
    regularPrice: 1001,
    sellPrice: 1000,
    dayLow: 998,
    dayHigh: 1008,
    updatedAt: '2026-05-16T10:00:00.000Z',
    fetchedAt: '2026-05-16T10:00:00.000Z',
    sourceKind: 'official',
    sourceName: 'test',
    marketReference: {
      sourceName: 'test',
      sourceUrl: '',
      isDelayed: false,
      tradingDate: null,
      au9999: null,
      autd: null,
      domesticReferences: [],
      consensusPrice: 1002,
      consensusDeviationPercent: -0.001,
      tradingSession: {
        isTradingTime: true,
        status: 'trading',
        note: 'test',
      },
      calibration: {
        anchorSymbol: null,
        anchorPrice: null,
        spread: null,
        premiumPercent: null,
        withinReferenceRange: null,
        note: 'test',
      },
    },
  }
  const history: HistoryPoint[] = Array.from({ length: 12 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 4, 16, 9, index)).toISOString(),
    price: 998 + index * 0.25,
    activePrice: 998 + index * 0.25,
    regularPrice: 998 + index * 0.25,
    sellPrice: 997 + index * 0.25,
    dayLow: 998,
    dayHigh: 1008,
    referenceAnchorPrice: 1002,
    referenceAu9999Price: 1002,
    referenceAutdPrice: 1001,
    sourceKind: 'official',
  }))
  const stats: QuoteStats24h = {
    currentPrice: latestQuote.price,
    high24h: 1008,
    low24h: 998,
    absoluteChange24h: 1,
    percentChange24h: 0.001,
    drawdownAmount24h: 7,
    drawdownPercent24h: 0.0069,
    pointCount: history.length,
  }
  const probabilityModel: ProbabilityModelSnapshot = {
    modelVersion: 'test',
    generatedAt: latestQuote.fetchedAt,
    features: {
      observedAt: latestQuote.fetchedAt,
      sampleSize: history.length,
      featureVersion: 'test',
      values: {},
      missing: [],
    },
    predictions: [],
    primaryPrediction: {
      horizonMinutes: 60,
      probability: 0.56,
      rawProbability: 0.57,
      confidence: 50,
      sampleSize: 0,
      brierScore: null,
      calibrationBucketKey: 'p40_60',
      summary: 'test',
    },
    metrics: [],
    limitations: [],
  }

  return { history, latestQuote, probabilityModel, stats }
}
