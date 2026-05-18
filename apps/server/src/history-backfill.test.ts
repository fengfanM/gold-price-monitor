import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { backfillHistory } from './history-backfill.js'
import type { HistoryPoint } from './types.js'

describe('history backfill', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')

  it('normalizes, deduplicates and sorts seed history points', () => {
    const existing: HistoryPoint[] = [{
      timestamp: '2026-05-18T10:00:00.000Z',
      sourceKind: 'official',
      price: 1000,
      activePrice: 1000,
      regularPrice: 1000,
      sellPrice: 1000,
      dayLow: 999,
      dayHigh: 1001,
      referenceAnchorPrice: null,
      referenceAu9999Price: null,
      referenceAutdPrice: null,
    }]

    const result = backfillHistory(existing, [
      { timestamp: '2026-05-18T09:59:00.000Z', price: '999.8' as unknown as number },
      { timestamp: '2026-05-18T10:00:00.000Z', price: 1000.2, sourceKind: 'fallback' },
      { fetchedAt: '2026-05-18T10:01:00.000Z', price: 1000.5, referenceAu9999Price: 1000.4 },
    ], { now, windowHours: 24 })

    assert.equal(result.accepted, 3)
    assert.equal(result.afterCount, 3)
    assert.deepEqual(result.history.map((point) => point.timestamp), [
      '2026-05-18T09:59:00.000Z',
      '2026-05-18T10:00:00.000Z',
      '2026-05-18T10:01:00.000Z',
    ])
    assert.equal(result.history[1].price, 1000.2)
    assert.equal(result.history[1].sourceKind, 'fallback')
    assert.equal(result.history[2].referenceAu9999Price, 1000.4)
  })

  it('rejects invalid and out-of-window seed points', () => {
    const result = backfillHistory([], [
      { timestamp: 'bad-date', price: 1000 },
      { timestamp: '2026-05-18T11:00:00.000Z', price: -1 },
      { timestamp: '2026-05-14T11:00:00.000Z', price: 999 },
    ], { now, windowHours: 24 })

    assert.equal(result.accepted, 0)
    assert.equal(result.rejected, 3)
    assert.equal(result.afterCount, 0)
    assert(result.rejectedReasons.some((reason) => reason.startsWith('invalid_timestamp')))
    assert(result.rejectedReasons.some((reason) => reason.startsWith('invalid_price')))
    assert(result.rejectedReasons.some((reason) => reason.startsWith('point_outside_window')))
  })
})
