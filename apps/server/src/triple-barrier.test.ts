import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildTripleBarrierLabel } from './triple-barrier.js'

describe('triple barrier path labels', () => {
  it('labels TP1 first when the upside barrier is touched before stop loss', () => {
    const label = buildTripleBarrierLabel([
      point('2026-05-16T09:00:00.000Z', 100),
      point('2026-05-16T09:01:00.000Z', 100.4),
      point('2026-05-16T09:02:00.000Z', 101.2),
      point('2026-05-16T09:03:00.000Z', 99),
    ], 0, { horizonMinutes: 5, tp1ReturnPercent: 0.01, stopLossReturnPercent: -0.01 })

    assert.equal(label.outcome, 'tp1_hit')
    assert.equal(label.positive, true)
    assert.equal(label.touchedAt, '2026-05-16T09:02:00.000Z')
    assert.equal(label.maxFavorableExcursion > 0, true)
  })

  it('labels stop loss first when downside is touched before TP1', () => {
    const label = buildTripleBarrierLabel([
      point('2026-05-16T09:00:00.000Z', 100),
      point('2026-05-16T09:01:00.000Z', 99.8),
      point('2026-05-16T09:02:00.000Z', 98.8),
      point('2026-05-16T09:03:00.000Z', 101.5),
    ], 0, { horizonMinutes: 5, tp1ReturnPercent: 0.01, stopLossReturnPercent: -0.01 })

    assert.equal(label.outcome, 'stop_loss_hit')
    assert.equal(label.positive, false)
    assert.equal(label.touchedAt, '2026-05-16T09:02:00.000Z')
    assert.equal(label.maxDrawdown < 0, true)
  })

  it('labels no touch when the horizon completes without either barrier', () => {
    const label = buildTripleBarrierLabel([
      point('2026-05-16T09:00:00.000Z', 100),
      point('2026-05-16T09:01:00.000Z', 100.2),
      point('2026-05-16T09:02:00.000Z', 99.9),
      point('2026-05-16T09:05:00.000Z', 100.4),
    ], 0, { horizonMinutes: 5, tp1ReturnPercent: 0.01, stopLossReturnPercent: -0.01 })

    assert.equal(label.outcome, 'no_touch')
    assert.equal(label.complete, true)
    assert.equal(label.touchedAt, null)
  })

  it('labels timeout when the future path is too short', () => {
    const label = buildTripleBarrierLabel([
      point('2026-05-16T09:00:00.000Z', 100),
      point('2026-05-16T09:01:00.000Z', 100.2),
    ], 0, { horizonMinutes: 5, tp1ReturnPercent: 0.01, stopLossReturnPercent: -0.01 })

    assert.equal(label.outcome, 'timeout')
    assert.equal(label.complete, false)
    assert.equal(label.barsObserved, 1)
  })
})

function point(timestamp: string, price: number) {
  return { timestamp, price }
}
