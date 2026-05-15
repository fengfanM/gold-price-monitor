import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildBacktestMonitor } from './backtest.js'
import type { BacktestSnapshot, OpportunityLevel } from './types.js'

describe('selective backtest monitor', () => {
  it('evaluates qualified trading signals separately from baseline market drift', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 35, 'none'),
      makeSnapshot('2026-05-16T09:01:00.000Z', 99, 62, 'watch'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 101, 32, 'none'),
      makeSnapshot('2026-05-16T09:03:00.000Z', 98, 64, 'watch'),
      makeSnapshot('2026-05-16T09:04:00.000Z', 102, 34, 'none'),
      makeSnapshot('2026-05-16T09:05:00.000Z', 97, 66, 'watch'),
      makeSnapshot('2026-05-16T09:06:00.000Z', 103, 30, 'none'),
      makeSnapshot('2026-05-16T09:07:00.000Z', 96, 68, 'watch'),
      makeSnapshot('2026-05-16T09:08:00.000Z', 104, 30, 'none'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 1)

    assert.equal(monitor.allEvaluatedSamples, 8)
    assert.equal(monitor.evaluatedSamples, 4)
    assert.equal(monitor.signalThreshold, 45)
    assert.equal(monitor.winRate !== null && monitor.baselineWinRate !== null, true)
    assert.equal((monitor.winRate ?? 0) > (monitor.baselineWinRate ?? 1), true)
    assert.equal(monitor.reliability > 28, true)
    assert.equal(monitor.buckets.some((bucket) => bucket.dimension === 'score'), true)
    assert.equal(monitor.buckets.some((bucket) => bucket.mae !== null && bucket.mfe !== null), true)
    assert.equal(monitor.probabilityModel.horizons.some((metric) => metric.horizonMinutes === 5), true)
    assert.equal(monitor.probabilityModel.horizons[0].calibrationBuckets.length, 5)
  })

  it('groups walk-forward performance by pattern and macro regime when snapshots contain context', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 64, 'watch', 'double_bottom', 'supportive'),
      makeSnapshot('2026-05-16T09:01:00.000Z', 102, 38, 'none', null, 'neutral'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 101, 66, 'watch', 'double_bottom', 'supportive'),
      makeSnapshot('2026-05-16T09:03:00.000Z', 104, 35, 'none', null, 'pressure'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 1)
    const patternBucket = monitor.buckets.find((bucket) => bucket.key === 'pattern:double_bottom')
    const macroBucket = monitor.buckets.find((bucket) => bucket.key === 'macro:supportive')

    assert.equal(Boolean(patternBucket), true)
    assert.equal(Boolean(macroBucket), true)
    assert.equal(patternBucket?.qualifiedSamples, 2)
  })
})

function makeSnapshot(
  quoteTimestamp: string,
  price: number,
  signalScore: number,
  signalLevel: OpportunityLevel,
  primaryPatternKind: BacktestSnapshot['primaryPatternKind'] = null,
  macroRegime: BacktestSnapshot['macroRegime'] = 'neutral',
): BacktestSnapshot {
  return {
    updatedAt: quoteTimestamp,
    quoteTimestamp,
    price,
    signalScore,
    signalLevel,
    backtest: {
      status: 'derived',
      sampleSize: 8,
      summary: 'test',
      horizons: [],
    },
    valuation: {
      score: 50,
      sampleSize: 8,
      lookbackHours: 1,
      pricePercentile: null,
      distanceFromLow: null,
      distanceFromHigh: null,
      averageReturn: null,
      volatility: null,
      sharpeRatio: null,
      sortinoRatio: null,
      informationRatio: null,
      maxDrawdown: null,
      summary: 'test',
    },
    primaryPatternKind,
    macroRegime,
    confluenceScore: 55,
    confluenceConflictLevel: 'none',
  }
}
