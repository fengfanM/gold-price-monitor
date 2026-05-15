import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildUnavailableMarketContext } from './market-context.js'
import type { HistoryPoint, QuoteSample } from './types.js'

describe('market context', () => {
  it('builds a safe unavailable context without external data', () => {
    const context = buildUnavailableMarketContext(makeQuote(581), [
      makeHistoryPoint('2026-05-16T09:00:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:10:00.000Z', 582),
      makeHistoryPoint('2026-05-16T09:20:00.000Z', 581),
    ])

    assert.equal(context.factors.spotGoldUsd.status, 'unavailable')
    assert.equal(context.macroFactors.length >= 6, true)
    assert.equal(context.macroFactors.some((item) => item.id === 'DFII10'), true)
    assert.equal(context.macroFactors.some((item) => item.id === 'VIXCLS'), true)
    assert.equal(context.sentiment.news.status, 'unavailable')
    assert.equal(context.backtest.sampleSize, 4)
    assert.equal(context.factorScore > 0, true)
  })
})

function makeQuote(price: number): QuoteSample {
  return {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 578,
    dayHigh: 596,
    updatedAt: '2026-05-16T10:00:00.000Z',
    fetchedAt: '2026-05-16T10:00:00.000Z',
    productName: '积存金',
    productCode: '080020000521',
    sourceKind: 'official',
    sourceName: '工银官方异步行情',
    marketReference: {
      sourceName: '上海黄金交易所延时行情',
      sourceUrl: 'https://sge.com.cn/h5_sjzx/yshq',
      isDelayed: true,
      tradingDate: '2026年05月16日',
      au9999: null,
      autd: null,
      calibration: {
        anchorSymbol: 'Au99.99',
        anchorPrice: 583,
        spread: price - 583,
        premiumPercent: (price - 583) / 583,
        withinReferenceRange: true,
        note: 'test',
      },
    },
  }
}

function makeHistoryPoint(timestamp: string, price: number): HistoryPoint {
  return {
    timestamp,
    sourceKind: 'official',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 578,
    dayHigh: 596,
    referenceAnchorPrice: 583,
    referenceAu9999Price: 583,
    referenceAutdPrice: 583,
  }
}
