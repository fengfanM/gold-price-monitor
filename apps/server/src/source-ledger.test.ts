import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildQuoteSourceLedger } from './source-ledger.js'
import type { QuoteSample, SourceStatus } from './types.js'

describe('quote source ledger', () => {
  it('separates the tradable ICBC quote from reference-only AU9999 and bank sources', () => {
    const quote = makeQuote(1001.34)
    const ledger = buildQuoteSourceLedger(quote, makeSourceStatus())

    const icbc = ledger.entries.find((entry) => entry.sourceId === 'icbc-official')
    const au9999 = ledger.entries.find((entry) => entry.sourceId === 'sge-au9999')
    const zheshang = ledger.entries.find((entry) => entry.sourceId === 'bank-zheshang-accumulation-gold')

    assert.equal(ledger.tradeSourceId, 'icbc-official')
    assert.equal(icbc?.tradable, true)
    assert.equal(icbc?.sourceUsage, 'production_realtime')
    assert.equal(au9999?.tradable, false)
    assert.equal(au9999?.sourceUsage, 'reference_calibration')
    assert.equal(zheshang?.tradable, false)
    assert.equal(ledger.warnings.some((warning) => warning.includes('浙商积存金')), true)
  })

  it('raises a discrepancy warning when the trade price diverges from the calibration consensus', () => {
    const quote = makeQuote(1001.34)
    quote.marketReference.consensusPrice = 990

    const ledger = buildQuoteSourceLedger(quote, makeSourceStatus())

    assert.equal(ledger.consensus.status, 'diverged')
    assert.equal(ledger.warnings.some((warning) => warning.includes('报价口径不一致')), true)
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
    dayLow: price - 5,
    dayHigh: price + 5,
    updatedAt: '2026-05-20T10:00:00.000Z',
    fetchedAt: '2026-05-20T10:00:01.000Z',
    productName: '积存金',
    productCode: '080020000521',
    sourceKind: 'official',
    sourceName: '工银官方异步行情',
    marketReference: {
      sourceName: '多源参考',
      sourceUrl: 'https://example.com',
      isDelayed: true,
      tradingDate: '2026-05-20',
      au9999: {
        symbol: 'AU9999',
        label: '上金所 AU9999',
        latestPrice: 1000.9,
        highPrice: 1003,
        lowPrice: 998,
        openPrice: 999,
        provider: 'SGE',
        updatedAt: '2026-05-20T09:59:00.000Z',
      },
      autd: null,
      domesticReferences: [
        {
          symbol: 'ZHESHANG_ACCUMULATION_GOLD',
          label: '浙商积存金参考',
          latestPrice: 1001.1,
          highPrice: 1002,
          lowPrice: 999,
          openPrice: 1000,
          provider: 'Zheshang',
          updatedAt: '2026-05-20T09:58:00.000Z',
        },
      ],
      consensusPrice: 1001,
      consensusDeviationPercent: 0.00034,
      tradingSession: {
        isTradingTime: true,
        status: 'trading',
        note: '交易中',
      },
      calibration: {
        anchorSymbol: 'Au99.99',
        anchorPrice: 1000.9,
        spread: price - 1000.9,
        premiumPercent: (price - 1000.9) / 1000.9,
        withinReferenceRange: true,
        note: 'test',
      },
    },
  }
}

function makeSourceStatus(): SourceStatus {
  return {
    active: 'official',
    stale: false,
    lastSuccessAt: '2026-05-20T10:00:01.000Z',
    official: {
      status: 'healthy',
      lastSuccessAt: '2026-05-20T10:00:01.000Z',
      lastFailureAt: null,
      lastError: null,
    },
    fallback: {
      status: 'unknown',
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    },
  }
}
