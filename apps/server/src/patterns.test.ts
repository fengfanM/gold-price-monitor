import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { detectPatternSignals } from './patterns.js'
import type { HistoryPoint, QuoteSample } from './types.js'

describe('chart pattern detection', () => {
  it('detects a candidate double bottom with neckline and invalidation price', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 582),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 581.5),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 586),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 587),
    ]

    const signals = detectPatternSignals(history, makeQuote(587.5))
    const doubleBottom = signals.find((signal) => signal.kind === 'double_bottom')

    assert.equal(Boolean(doubleBottom), true)
    assert.equal(doubleBottom?.direction, 'bullish')
    assert.equal(typeof doubleBottom?.necklinePrice, 'number')
    assert.equal(typeof doubleBottom?.invalidationPrice, 'number')
  })

  it('detects resistance rejection near repeated swing highs', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 580),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 589.8),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 589.5),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 586.5),
    ]

    const signals = detectPatternSignals(history, makeQuote(588.8))
    const rejection = signals.find((signal) => signal.kind === 'resistance_rejection')

    assert.equal(Boolean(rejection), true)
    assert.equal(rejection?.direction, 'bearish')
  })

  it('detects bullish candlestick reversal patterns with invalidation rules', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 594),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 591),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 582),
    ]

    const signals = detectPatternSignals(history, makeQuote(589))
    const engulfing = signals.find((signal) => signal.kind === 'bullish_engulfing')

    assert.equal(Boolean(engulfing), true)
    assert.equal(engulfing?.direction, 'bullish')
    assert.equal(typeof engulfing?.invalidationPrice, 'number')
  })

  it('detects doji as a neutral decision candle instead of a strong signal', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 584.2),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 585.1),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 586.2),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 584.4),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 586.2),
    ]

    const signals = detectPatternSignals(history, makeQuote(584.45))
    const doji = signals.find((signal) => signal.kind === 'doji')

    assert.equal(Boolean(doji), true)
    assert.equal(doji?.direction, 'neutral')
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
