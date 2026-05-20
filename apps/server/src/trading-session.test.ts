import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getChinaGoldTradingSession } from './service.js'

describe('ICBC accumulation gold trading session', () => {
  it('treats weekday 13:20 China time as active ICBC monitoring time', () => {
    const session = getChinaGoldTradingSession(new Date('2026-05-20T05:20:00.000Z'))

    assert.equal(session.status, 'trading')
    assert.equal(session.isTradingTime, true)
    assert.equal(session.note.includes('工银积存金'), true)
  })

  it('keeps pre-open, late night and weekends outside the main ICBC window', () => {
    assert.equal(getChinaGoldTradingSession(new Date('2026-05-20T01:00:00.000Z')).status, 'closed')
    assert.equal(getChinaGoldTradingSession(new Date('2026-05-20T15:00:00.000Z')).status, 'closed')
    assert.equal(getChinaGoldTradingSession(new Date('2026-05-23T05:20:00.000Z')).status, 'closed')
  })
})
