import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCandles, buildCandleSets } from './candles.js'
import type { HistoryPoint } from './types.js'

describe('candles', () => {
  it('builds ordered OHLC candles for a timeframe', () => {
    const candles = buildCandles([
      makePoint('2026-05-16T10:00:10.000Z', 580),
      makePoint('2026-05-16T10:00:40.000Z', 583),
      makePoint('2026-05-16T10:01:05.000Z', 579),
    ], '1m')

    assert.equal(candles.length, 2)
    assert.deepEqual(candles[0], {
      timestamp: '2026-05-16T10:00:00.000Z',
      open: 580,
      high: 583,
      low: 580,
      close: 583,
      pointCount: 2,
    })
    assert.equal(candles[1]?.open, 579)
  })

  it('returns all professional monitor timeframes', () => {
    const sets = buildCandleSets([
      makePoint('2026-05-16T10:00:10.000Z', 580),
      makePoint('2026-05-16T10:05:10.000Z', 581),
    ])

    assert.deepEqual(Object.keys(sets), ['1m', '5m', '15m', '60m'])
    assert.equal(sets['1m'].length, 2)
    assert.equal(sets['5m'].length, 2)
    assert.equal(sets['15m'].length, 1)
    assert.equal(sets['60m'].length, 1)
  })
})

function makePoint(timestamp: string, price: number): HistoryPoint {
  return {
    timestamp,
    sourceKind: 'official',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 570,
    dayHigh: 590,
    referenceAnchorPrice: 579,
    referenceAu9999Price: 579,
    referenceAutdPrice: 579,
  }
}
