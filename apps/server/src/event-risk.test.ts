import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildEventIntelligenceResponse } from './event-risk.js'
import type { EconomicEvent } from './types.js'

describe('event intelligence', () => {
  it('wraps economic event risk with explicit v4 source boundaries', () => {
    const configuredEvent: EconomicEvent = {
      id: 'fed-test',
      label: '美联储决议测试事件',
      category: 'fed',
      importance: 'S',
      scheduledAt: '2026-05-25T13:30:00.000Z',
      source: 'configured',
      sourceUrl: 'https://example.com/calendar',
    }

    const response = buildEventIntelligenceResponse('2026-05-25T13:00:00.000Z', [configuredEvent])
    const activeItem = response.activeItem

    assert.equal(response.version, 'event-intelligence-v4')
    assert.equal(activeItem?.id, 'fed-test')
    assert.equal(activeItem?.sourceUsage, 'production_calendar')
    assert.equal(activeItem?.isProductionEligible, true)
    assert.equal(activeItem?.phase, 'pre_event')
    assert.equal(response.sourceBoundaries.length, 4)
    assert.equal(response.sourceBoundaries.find((item) => item.source === 'configured')?.participatesInScoring, true)
    assert.equal(response.sourceBoundaries.find((item) => item.source === 'estimated')?.sourceUsage, 'estimation_only')
    assert.equal(response.sourceBoundaries.find((item) => item.source === 'rss')?.participatesInScoring, false)
    assert.equal(response.sourceBoundaries.find((item) => item.source === 'mirror')?.sourceUsage, 'mirror_learning')
  })

  it('keeps a near-term event watchlist even outside the core risk window', () => {
    const response = buildEventIntelligenceResponse('2026-05-27T00:45:00.000Z', [])

    assert.equal(response.version, 'event-intelligence-v4')
    assert.equal(response.activeItem, null)
    assert.ok(response.items.length > 0)
    assert.ok(response.items.every((item) => item.minutesToEvent >= 0))
    assert.ok(response.items.some((item) => item.label.includes('CPI') || item.label.includes('非农') || item.label.includes('PCE') || item.label.includes('FOMC')))
  })
})
