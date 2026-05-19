import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildMacroRegimeEvidence } from './macro-regime.js'
import type { FactorCandle } from './types.js'

describe('macro regime evidence', () => {
  it('downgrades buy setups when real rates, dollar and sticky core inflation align against gold', () => {
    const evidence = buildMacroRegimeEvidence({
      factorCandles: {
        DFII10: makeDaily('DFII10', [1.72, 1.76, 1.8, 1.86, 1.92]),
        DTWEXBGS: makeDaily('DTWEXBGS', [122, 122.4, 122.8, 123.3, 124.1]),
        CPILFESL: makeMonthly('CPILFESL', [
          309,
          309.8,
          310.6,
          311.5,
          312.4,
          313.3,
          314.2,
          315.1,
          316,
          316.9,
          317.8,
          318.8,
          329.2,
          330.2,
          331.2,
        ]),
        VIXCLS: makeDaily('VIXCLS', [14.8, 14.4, 13.9, 13.7, 13.2]),
      },
      liveFactors: [],
    })

    assert.equal(evidence.status, 'pressure')
    assert.equal(evidence.scoreImpact < 0, true)
    assert.equal(evidence.sourceUsage, 'mirror_learning')
    assert.equal(evidence.isProductionEligible, false)
    assert.equal(evidence.opposingReasons.some((item) => item.includes('实际利率')), true)
    assert.equal(evidence.stalenessWarning.includes('离线校准'), true)
  })

  it('treats supportive mirror-only regimes as medium-term background instead of a strong live trigger', () => {
    const evidence = buildMacroRegimeEvidence({
      factorCandles: {
        DFII10: makeDaily('DFII10', [1.92, 1.86, 1.8, 1.74, 1.68]),
        DTWEXBGS: makeDaily('DTWEXBGS', [124.1, 123.4, 122.9, 122.2, 121.5]),
        DEXCHUS: makeDaily('DEXCHUS', [7.12, 7.14, 7.16, 7.18, 7.2]),
        VIXCLS: makeDaily('VIXCLS', [16.2, 17.1, 18.2, 19.1, 20.3]),
      },
      liveFactors: [],
    })

    assert.equal(evidence.status, 'supportive')
    assert.equal(evidence.scoreImpact, 0)
    assert.equal(evidence.supportingReasons.some((item) => item.includes('中期背景')), true)
    assert.equal(evidence.stalenessWarning.includes('不能放大 1m/5m'), true)
  })
})

function makeDaily(symbol: string, values: number[]): FactorCandle[] {
  return values.map((value, index) => makeCandle(symbol, value, `2026-05-${String(10 + index).padStart(2, '0')}`, 'daily'))
}

function makeMonthly(symbol: string, values: number[]): FactorCandle[] {
  return values.map((value, index) => makeCandle(symbol, value, `2025-${String(index + 1).padStart(2, '0')}-01`, 'monthly'))
}

function makeCandle(
  symbol: string,
  value: number,
  date: string,
  frequency: FactorCandle['frequency'],
): FactorCandle {
  return {
    symbol,
    date,
    time: '00:00:00',
    frequency,
    open: value,
    high: value,
    low: value,
    close: value,
    value,
    source: 'fixture',
    productionUsage: 'learning_only_mirror',
    sourceUsage: 'mirror_learning',
    isProductionEligible: false,
  }
}
