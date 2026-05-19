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
    assert.equal(doubleBottom?.confirmationStatus, 'candidate')
    assert.equal(typeof doubleBottom?.necklinePrice, 'number')
    assert.equal(typeof doubleBottom?.invalidationPrice, 'number')
  })

  it('marks double bottom as confirmed only after neckline is reclaimed', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 582),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 589),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 586),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 581.8),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 586),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 588.5),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 586),
    ]

    const signals = detectPatternSignals(history, makeQuote(590))
    const doubleBottom = signals.find((signal) => signal.kind === 'double_bottom')

    assert.equal(Boolean(doubleBottom), true)
    assert.equal(doubleBottom?.confirmationStatus, 'confirmed')
    assert.equal(doubleBottom?.label, '双底确认')
  })

  it('marks an invalidated double bottom as failed with a cooldown window', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 582),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 586),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 581.9),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 582.2),
    ]

    const signals = detectPatternSignals(history, makeQuote(580.5))
    const failedDoubleBottom = signals.find((signal) => signal.kind === 'double_bottom')

    assert.equal(Boolean(failedDoubleBottom), true)
    assert.equal(failedDoubleBottom?.confirmationStatus, 'failed')
    assert.equal(failedDoubleBottom?.cooldownBars, 6)
    assert.equal(failedDoubleBottom?.contextTags?.includes('pattern_failed'), true)
  })


  it('detects resistance rejection near repeated swing highs', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 580),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 589.8),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 585),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 589.5),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 589.2),
    ]

    const signals = detectPatternSignals(history, makeQuote(588.8))
    const rejection = signals.find((signal) => signal.kind === 'resistance_rejection')

    assert.equal(Boolean(rejection), true)
    assert.equal(rejection?.direction, 'bearish')
    assert.equal(rejection?.confirmationStatus, 'confirmed')
  })

  it('does not treat flat noise near old lows as a support rebound', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 583.8),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 584.1),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 583.9),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 584.2),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 583.9),
      makeHistoryPoint('2026-05-16T09:55:00.000Z', 584.1),
      makeHistoryPoint('2026-05-16T09:56:00.000Z', 584),
    ]

    const signals = detectPatternSignals(history, makeQuote(584.05))
    const rebound = signals.find((signal) => signal.kind === 'support_rebound')

    assert.equal(Boolean(rebound), false)
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
    assert.equal(engulfing?.confirmationStatus, 'candidate')
    assert.equal(engulfing?.confirmationReason?.includes('代理 K 线'), true)
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

  it('detects a morning star as a confirmed three-candle low reversal setup', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:46:00.000Z', 596),
      makeHistoryPoint('2026-05-16T09:47:00.000Z', 593),
      makeHistoryPoint('2026-05-16T09:48:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 587),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 583.8),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 584.1),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 584.3),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 587.2),
    ]

    const signals = detectPatternSignals(history, makeQuote(590.8))
    const morningStar = signals.find((signal) => signal.kind === 'morning_star')

    assert.equal(Boolean(morningStar), true)
    assert.equal(morningStar?.direction, 'bullish')
    assert.equal(morningStar?.confirmationStatus, 'confirmed')
    assert.equal(typeof morningStar?.confirmationPrice, 'number')
    assert.equal(morningStar?.contextTags?.includes('low_location'), true)
  })

  it('detects an evening star as a confirmed three-candle high reversal risk', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:46:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:47:00.000Z', 587),
      makeHistoryPoint('2026-05-16T09:48:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 593),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 596),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 596.2),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 595.9),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 595.7),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 592.8),
    ]

    const signals = detectPatternSignals(history, makeQuote(589.2))
    const eveningStar = signals.find((signal) => signal.kind === 'evening_star')

    assert.equal(Boolean(eveningStar), true)
    assert.equal(eveningStar?.direction, 'bearish')
    assert.equal(eveningStar?.confirmationStatus, 'confirmed')
    assert.equal(eveningStar?.contextTags?.includes('high_location'), true)
  })

  it('keeps harami as a compression candidate until the mother candle breaks', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:48:00.000Z', 594),
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 591),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 586.2),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 586.6),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 586.4),
      makeHistoryPoint('2026-05-16T09:54:00.000Z', 586.5),
    ]

    const signals = detectPatternSignals(history, makeQuote(586.55))
    const harami = signals.find((signal) => signal.kind === 'bullish_harami')

    assert.equal(Boolean(harami), true)
    assert.equal(harami?.confirmationStatus, 'candidate')
    assert.equal(typeof harami?.confirmationPrice, 'number')
    assert.equal(harami?.contextTags?.includes('compression'), true)
  })

  it('treats high-position three white soldiers as exhaustion risk instead of a chase signal', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:46:00.000Z', 584),
      makeHistoryPoint('2026-05-16T09:47:00.000Z', 586),
      makeHistoryPoint('2026-05-16T09:48:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 592),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 594),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 596),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 598),
    ]

    const signals = detectPatternSignals(history, makeQuote(600))
    const soldiers = signals.find((signal) => signal.kind === 'three_white_soldiers')

    assert.equal(Boolean(soldiers), true)
    assert.equal(soldiers?.direction, 'bearish')
    assert.equal(soldiers?.contextTags?.includes('blowoff_risk'), true)
  })

  it('treats low-position three black crows as panic exhaustion instead of a short chase signal', () => {
    const history = [
      makeHistoryPoint('2026-05-16T09:46:00.000Z', 600),
      makeHistoryPoint('2026-05-16T09:47:00.000Z', 598),
      makeHistoryPoint('2026-05-16T09:48:00.000Z', 596),
      makeHistoryPoint('2026-05-16T09:49:00.000Z', 594),
      makeHistoryPoint('2026-05-16T09:50:00.000Z', 592),
      makeHistoryPoint('2026-05-16T09:51:00.000Z', 590),
      makeHistoryPoint('2026-05-16T09:52:00.000Z', 588),
      makeHistoryPoint('2026-05-16T09:53:00.000Z', 586),
    ]

    const signals = detectPatternSignals(history, makeQuote(584))
    const crows = signals.find((signal) => signal.kind === 'three_black_crows')

    assert.equal(Boolean(crows), true)
    assert.equal(crows?.direction, 'neutral')
    assert.equal(crows?.contextTags?.includes('panic_exhaustion'), true)
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
