import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDataQuality, detectQuoteAnomalies } from './quality.js'
import type { HistoryPoint, QuoteSample, QuoteStats24h, SourceStatus } from './types.js'

describe('data quality', () => {
  it('marks extreme price jumps as critical anomalies', () => {
    const anomalies = detectQuoteAnomalies(makeQuote({ price: 620 }), [
      makeHistoryPoint({ price: 580 }),
    ])

    assert.equal(anomalies.some((item) => item.code === 'critical_jump'), true)
    assert.equal(anomalies.some((item) => item.severity === 'critical'), true)
  })

  it('downgrades quality when source is fallback and market anchor is missing', () => {
    const quote = makeQuote({
      sourceKind: 'fallback',
      anchorPrice: null,
      premiumPercent: null,
    })
    const quality = buildDataQuality(
      quote,
      makeStats({ pointCount: 2 }),
      makeSourceStatus({ active: 'fallback' }),
      [],
    )

    assert.equal(quality.checks.primarySource, false)
    assert.equal(quality.checks.hasMarketAnchor, false)
    assert.equal(quality.level, 'degraded')
    assert.equal(quality.score < 88, true)
  })

  it('keeps high confidence when official source and anchor are healthy', () => {
    const quality = buildDataQuality(
      makeQuote({}),
      makeStats({ pointCount: 8 }),
      makeSourceStatus({ active: 'official' }),
      [],
    )

    assert.equal(quality.level, 'excellent')
    assert.equal(quality.score, 100)
  })
})

function makeQuote(input: Partial<QuoteSample> & {
  anchorPrice?: number | null
  premiumPercent?: number | null
}): QuoteSample {
  const price = input.price ?? 580
  const anchorPrice = input.anchorPrice === undefined ? 579 : input.anchorPrice
  const premiumPercent = input.premiumPercent === undefined ? 0.0017 : input.premiumPercent

  return {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: input.dayLow ?? 570,
    dayHigh: input.dayHigh ?? 590,
    updatedAt: '2026-05-16T10:00:00.000Z',
    fetchedAt: '2026-05-16T10:00:00.000Z',
    productName: '积存金',
    productCode: '080020000521',
    sourceKind: input.sourceKind ?? 'official',
    sourceName: '工银官方异步行情',
    marketReference: {
      sourceName: '上海黄金交易所延时行情',
      sourceUrl: 'https://sge.com.cn/h5_sjzx/yshq',
      isDelayed: true,
      tradingDate: '2026年05月16日',
      au9999: null,
      autd: null,
      calibration: {
        anchorSymbol: anchorPrice === null ? null : 'Au99.99',
        anchorPrice,
        spread: anchorPrice === null ? null : price - anchorPrice,
        premiumPercent,
        withinReferenceRange: true,
        note: 'test',
      },
    },
  }
}

function makeHistoryPoint(input: Partial<HistoryPoint>): HistoryPoint {
  const price = input.price ?? 580
  return {
    timestamp: input.timestamp ?? '2026-05-16T09:59:00.000Z',
    sourceKind: input.sourceKind ?? 'official',
    price,
    activePrice: input.activePrice ?? price,
    regularPrice: input.regularPrice ?? price,
    sellPrice: input.sellPrice ?? price,
    dayLow: input.dayLow ?? 570,
    dayHigh: input.dayHigh ?? 590,
    referenceAnchorPrice: input.referenceAnchorPrice ?? 579,
    referenceAu9999Price: input.referenceAu9999Price ?? 579,
    referenceAutdPrice: input.referenceAutdPrice ?? 579,
  }
}

function makeStats(input: Partial<QuoteStats24h>): QuoteStats24h {
  return {
    high24h: input.high24h ?? 590,
    low24h: input.low24h ?? 570,
    currentPrice: input.currentPrice ?? 580,
    absoluteChange24h: input.absoluteChange24h ?? 0,
    percentChange24h: input.percentChange24h ?? 0,
    drawdownAmount24h: input.drawdownAmount24h ?? 10,
    drawdownPercent24h: input.drawdownPercent24h ?? 0.0169,
    pointCount: input.pointCount ?? 8,
  }
}

function makeSourceStatus(input: Partial<SourceStatus>): SourceStatus {
  return {
    active: input.active ?? 'official',
    stale: input.stale ?? false,
    lastSuccessAt: input.lastSuccessAt ?? '2026-05-16T10:00:00.000Z',
    official: input.official ?? {
      status: 'healthy',
      lastSuccessAt: '2026-05-16T10:00:00.000Z',
      lastFailureAt: null,
      lastError: null,
    },
    fallback: input.fallback ?? {
      status: input.active === 'fallback' ? 'healthy' : 'unknown',
      lastSuccessAt: input.active === 'fallback' ? '2026-05-16T10:00:00.000Z' : null,
      lastFailureAt: null,
      lastError: null,
    },
  }
}
