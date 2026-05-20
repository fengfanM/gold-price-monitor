import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildBacktestMonitor, buildExternalModelBacktestGate } from './backtest.js'
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
    assert.equal(monitor.completeEvaluatedSamples, 4)
    assert.equal(monitor.metricsFrozen, true)
    assert.equal(monitor.freezeReason?.includes('完整样本'), true)
    assert.equal(monitor.winRate, null)
    assert.equal(monitor.profitFactor, null)
    assert.equal(monitor.reliability, 28)
    assert.equal(monitor.buckets.some((bucket) => bucket.dimension === 'score'), true)
    assert.equal(monitor.buckets.some((bucket) => bucket.mae !== null && bucket.mfe !== null), true)
    assert.equal(monitor.buckets.some((bucket) => bucket.tp1HitRate !== null && bucket.stopLossHitRate !== null), true)
    assert.equal(monitor.probabilityModel.horizons.some((metric) => metric.horizonMinutes === 5), true)
    assert.equal(monitor.probabilityModel.horizons[0].calibrationBuckets.length, 5)
  })

  it('groups walk-forward performance by pattern and macro regime when snapshots contain context', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 64, 'watch', 'double_bottom', 'supportive', {
        macroRegimeEvidenceStatus: 'supportive',
        inflationPhase: 'sticky',
        realRateTrend: 'falling',
        usdCnyAlignment: 'cny_gold_support',
        cmeBreakoutQuality: 'confirmed',
      }),
      makeSnapshot('2026-05-16T09:01:00.000Z', 102, 38, 'none', null, 'neutral'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 101, 66, 'watch', 'double_bottom', 'supportive', {
        macroRegimeEvidenceStatus: 'supportive',
        inflationPhase: 'sticky',
        realRateTrend: 'falling',
        usdCnyAlignment: 'cny_gold_support',
        cmeBreakoutQuality: 'confirmed',
      }),
      makeSnapshot('2026-05-16T09:03:00.000Z', 104, 35, 'none', null, 'pressure'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 1)
    const patternBucket = monitor.buckets.find((bucket) => bucket.key === 'pattern:double_bottom')
    const macroBucket = monitor.buckets.find((bucket) => bucket.key === 'macro:supportive')
    const macroRegimeBucket = monitor.buckets.find((bucket) => bucket.key === 'macro_regime:supportive')
    const inflationBucket = monitor.buckets.find((bucket) => bucket.key === 'inflation_phase:sticky')
    const realRateBucket = monitor.buckets.find((bucket) => bucket.key === 'real_rate_trend:falling')
    const currencyBucket = monitor.buckets.find((bucket) => bucket.key === 'usd_cny_alignment:cny_gold_support')
    const cmeBucket = monitor.buckets.find((bucket) => bucket.key === 'cme_breakout_quality:confirmed')

    assert.equal(Boolean(patternBucket), true)
    assert.equal(Boolean(macroBucket), true)
    assert.equal(Boolean(macroRegimeBucket), true)
    assert.equal(Boolean(inflationBucket), true)
    assert.equal(Boolean(realRateBucket), true)
    assert.equal(Boolean(currencyBucket), true)
    assert.equal(Boolean(cmeBucket), true)
    assert.equal(patternBucket?.qualifiedSamples, 2)
  })

  it('audits external model performance by probability, local agreement, session and event buckets', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 64, 'watch', 'double_bottom', 'supportive', {
        externalModelUpProbability: 0.66,
        externalModelConfidence: 78,
        modelProbability: 0.62,
        eventRiskLevel: 'none',
      }),
      makeSnapshot('2026-05-16T09:01:00.000Z', 102, 38, 'none', null, 'neutral'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 101, 66, 'watch', 'double_bottom', 'supportive', {
        externalModelUpProbability: 0.68,
        externalModelConfidence: 74,
        modelProbability: 0.6,
        eventRiskLevel: 'none',
      }),
      makeSnapshot('2026-05-16T09:03:00.000Z', 104, 35, 'none', null, 'pressure'),
      makeSnapshot('2026-05-16T09:04:00.000Z', 103, 35, 'none', null, 'neutral'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 1)
    const probabilityBucket = monitor.externalModel.buckets.find((bucket) => bucket.key === 'external_probability:p65_70')
    const agreementBucket = monitor.externalModel.buckets.find((bucket) => bucket.key === 'model_vs_local:bullish_bullish')
    const eventBucket = monitor.externalModel.buckets.find((bucket) => bucket.key === 'event:none')

    assert.equal(monitor.externalModel.liveCoverage !== null && monitor.externalModel.liveCoverage > 0, true)
    assert.equal(Boolean(probabilityBucket), true)
    assert.equal(Boolean(agreementBucket), true)
    assert.equal(Boolean(eventBucket), true)
    assert.equal(probabilityBucket?.qualifiedSamples, 2)
    assert.equal(probabilityBucket?.brierScore !== null, true)
    assert.equal(probabilityBucket?.excessWinRate !== null, true)
  })

  it('uses external model bucket history to block weak buckets and allow strong agreement buckets only after 30 samples', () => {
    const underSampledSnapshots = Array.from({ length: 22 }, (_, index) => {
      return makeSnapshot(
        new Date(Date.UTC(2026, 4, 16, 8, index)).toISOString(),
        100 + index,
        66,
        'watch',
        'double_bottom',
        'supportive',
        {
          externalModelUpProbability: 0.66,
          externalModelConfidence: 82,
          modelProbability: 0.62,
          externalModelStatus: 'live',
          externalModelProvider: 'chronos',
        },
      )
    })
    const underSampledGate = buildExternalModelBacktestGate(underSampledSnapshots, underSampledSnapshots[underSampledSnapshots.length - 2], 1)

    assert.equal(underSampledGate.status, 'insufficient')
    assert.equal(underSampledGate.weightMultiplier, 0)

    const strongSnapshots = Array.from({ length: 34 }, (_, index) => {
      return makeSnapshot(
        new Date(Date.UTC(2026, 4, 16, 9, index)).toISOString(),
        100 + index,
        66,
        'watch',
        'double_bottom',
        'supportive',
        {
          externalModelUpProbability: 0.66,
          externalModelConfidence: 82,
          modelProbability: 0.62,
          externalModelStatus: 'live',
          externalModelProvider: 'chronos',
        },
      )
    })
    const strongGate = buildExternalModelBacktestGate(strongSnapshots, strongSnapshots[strongSnapshots.length - 2], 1)

    assert.equal(strongGate.status, 'strong')
    assert.equal(strongGate.weightMultiplier, 1)

    const weakSnapshots = Array.from({ length: 34 }, (_, index) => {
      return makeSnapshot(
        new Date(Date.UTC(2026, 4, 16, 10, index)).toISOString(),
        100 - index,
        66,
        'watch',
        'double_bottom',
        'supportive',
        {
          externalModelUpProbability: 0.66,
          externalModelConfidence: 80,
          modelProbability: 0.62,
          externalModelStatus: 'live',
          externalModelProvider: 'chronos',
        },
      )
    })
    const weakGate = buildExternalModelBacktestGate(weakSnapshots, weakSnapshots[weakSnapshots.length - 2], 1)

    assert.equal(weakGate.status, 'weak')
    assert.equal(weakGate.weightMultiplier, 0)
  })

  it('keeps parallel provider candidates in external model provider buckets', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 64, 'watch', 'double_bottom', 'supportive', {
        externalModelCandidates: [
          makeExternalCandidate('chronos', 0.66, 76),
          makeExternalCandidate('timesfm', 0.58, 70),
        ],
        modelProbability: 0.62,
      }),
      makeSnapshot('2026-05-16T09:01:00.000Z', 102, 38, 'none'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 101, 64, 'watch', 'double_bottom', 'supportive', {
        externalModelCandidates: [
          makeExternalCandidate('chronos', 0.67, 77),
          makeExternalCandidate('timesfm', 0.59, 71),
        ],
        modelProbability: 0.62,
      }),
      makeSnapshot('2026-05-16T09:03:00.000Z', 103, 38, 'none'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 1)
    const chronosBucket = monitor.externalModel.buckets.find((bucket) => bucket.key === 'provider:chronos')
    const timesfmBucket = monitor.externalModel.buckets.find((bucket) => bucket.key === 'provider:timesfm')

    assert.equal(chronosBucket?.qualifiedSamples, 2)
    assert.equal(timesfmBucket?.qualifiedSamples, 2)
  })

  it('keeps timeout path labels in the walk-forward monitor instead of silently dropping them', () => {
    const snapshots = [
      makeSnapshot('2026-05-16T09:00:00.000Z', 100, 66, 'watch'),
      makeSnapshot('2026-05-16T09:01:00.000Z', 100.2, 66, 'watch'),
      makeSnapshot('2026-05-16T09:02:00.000Z', 100.1, 66, 'watch'),
    ]

    const monitor = buildBacktestMonitor(snapshots, 60)

    assert.equal(monitor.allEvaluatedSamples, 2)
    assert.equal(monitor.incompleteSampleRate !== null && monitor.incompleteSampleRate > 0, true)
    assert.equal(monitor.failureAttribution.some((item) => item.reason === 'sampling_incomplete'), true)
    assert.equal(monitor.failureSamples.length >= 0, true)
    assert.equal(monitor.buckets.some((bucket) => (bucket.timeoutRate ?? 0) > 0), true)
  })

  it('freezes top-level performance metrics when qualified triple-barrier samples are incomplete', () => {
    const snapshots = Array.from({ length: 12 }, (_item, index) =>
      makeSnapshot(
        new Date(Date.UTC(2026, 4, 16, 9, index)).toISOString(),
        100 + index * 0.1,
        72,
        'watch',
      ),
    )

    const monitor = buildBacktestMonitor(snapshots, 120)

    assert.equal(monitor.evaluatedSamples, 11)
    assert.equal(monitor.completeEvaluatedSamples < 30, true)
    assert.equal(monitor.metricsFrozen, true)
    assert.equal(monitor.winRate, null)
    assert.equal(monitor.baselineWinRate, null)
    assert.equal(monitor.averageReturn, null)
    assert.equal(monitor.profitFactor, null)
    assert.equal(monitor.reliability, 28)
    assert.equal(monitor.summary.includes('样本未完成'), true)
  })
})

function makeExternalCandidate(
  provider: 'chronos' | 'timesfm' | 'moirai',
  upProbability: number,
  confidence: number,
) {
  return {
    id: `${provider}-advisor`,
    name: `${provider} 军师`,
    provider,
    modelName: `${provider}-test-model`,
    status: 'live' as const,
    horizonMinutes: 1,
    upProbability,
    downProbability: 1 - upProbability,
    confidence,
    expectedReturnPercent: null,
    forecastPrice: null,
    intervalLow: null,
    intervalHigh: null,
    generatedAt: '2026-05-16T09:00:00.000Z',
    summary: 'test',
    rationale: [],
    risks: [],
  }
}

function makeSnapshot(
  quoteTimestamp: string,
  price: number,
  signalScore: number,
  signalLevel: OpportunityLevel,
  primaryPatternKind: BacktestSnapshot['primaryPatternKind'] = null,
  macroRegime: BacktestSnapshot['macroRegime'] = 'neutral',
  overrides: Partial<BacktestSnapshot> = {},
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
    externalModelStatus: overrides.externalModelUpProbability === undefined ? 'unconfigured' : 'live',
    externalModelProvider: 'chronos',
    externalModelName: 'test-chronos',
    externalModelHorizonMinutes: 1,
    externalModelConfidence: 0,
    externalModelExpectedReturnPercent: null,
    eventRiskLevel: 'none',
    psychologyLevel: 'stable',
    sourceHealth: 'healthy',
    modelProbability: 0.5,
    ...overrides,
  }
}
