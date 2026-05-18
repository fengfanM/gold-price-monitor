import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildProbabilityMetrics,
  buildProbabilityTrainingSamples,
  extractProbabilityFeatures,
  predictProbabilityModel,
} from './model.js'
import type {
  HistoryPoint,
  MarketContext,
  PatternSignal,
  QuoteSample,
  QuoteStats24h,
} from './types.js'

describe('calibrated probability model', () => {
  it('extracts explainable features from quote, context, technicals and patterns', () => {
    const history = makeHistory(30)
    const latestQuote = makeQuote(99.2, '2026-05-16T09:30:00.000Z')
    const features = extractProbabilityFeatures({
      history,
      latestQuote,
      stats: makeStats(),
      marketContext: makeMarketContext(62),
      technicals: {
        ma5: 99.5,
        ma10: 100,
        ma20: 100.4,
        rsi14: 34,
        macd: { dif: 0.1, dea: 0.05, histogram: 0.08 },
        shortTrend: 'rising',
      },
      patternSignals: [makePattern('support_rebound', 'bullish', 70)],
    })
    const prediction = predictProbabilityModel({ features })

    assert.equal(features.featureVersion.includes('gold-intraday'), true)
    assert.equal(typeof features.values.rangeLowAdvantage, 'number')
    assert.equal(typeof features.values.rsiCold, 'number')
    assert.equal(typeof features.values['kb.trendStructureScore'], 'number')
    assert.equal(typeof features.values['kb.breakoutFailureRisk'], 'number')
    assert.equal(features.values.bullishPatternScore, 0)
    assert.equal(typeof features.values.candidateBullishPatternScore, 'number')
    assert.equal(prediction.predictions.length, 4)
    assert.equal(prediction.primaryPrediction.horizonMinutes, 60)
    assert.equal(prediction.primaryPrediction.probability > 0 && prediction.primaryPrediction.probability < 1, true)
    assert.equal(prediction.limitations.some((item) => item.includes('不构成投资建议')), true)
  })

  it('keeps unconfirmed bullish patterns as weak hints instead of strong probability boosters', () => {
    const sharedInput = {
      history: makeHistory(30),
      latestQuote: makeQuote(99.2, '2026-05-16T09:30:00.000Z'),
      stats: makeStats(),
      marketContext: makeMarketContext(62),
      technicals: {
        ma5: 99.5,
        ma10: 100,
        ma20: 100.4,
        rsi14: 34,
        macd: { dif: 0.1, dea: 0.05, histogram: 0.08 },
        shortTrend: 'rising' as const,
      },
    }
    const candidate = makePattern('double_bottom', 'bullish', 76)
    const confirmed = { ...candidate, confirmationStatus: 'confirmed' as const }
    const candidateFeatures = extractProbabilityFeatures({
      ...sharedInput,
      patternSignals: [candidate],
    })
    const confirmedFeatures = extractProbabilityFeatures({
      ...sharedInput,
      patternSignals: [confirmed],
    })

    assert.equal(candidateFeatures.values.bullishPatternScore, 0)
    assert.equal((candidateFeatures.values.candidateBullishPatternScore ?? 0) > 0, true)
    assert.equal((confirmedFeatures.values.bullishPatternScore ?? 0) > 0, true)
    assert.equal(confirmedFeatures.values.candidateBullishPatternScore, 0)
  })

  it('builds future horizon labels and Brier calibration metrics without Python runtime', () => {
    const samples = buildProbabilityTrainingSamples(makeHistory(80), {
      horizons: [5, 15],
      minHistoryPoints: 12,
    })
    const fiveMinuteSamples = samples.filter((sample) => sample.horizonMinutes === 5)
    const metrics = buildProbabilityMetrics(samples, 5)

    assert.equal(fiveMinuteSamples.length > 0, true)
    assert.equal(fiveMinuteSamples.every((sample) => sample.label.evaluatedAt > sample.openedAt), true)
    assert.equal(typeof fiveMinuteSamples[0].label.returnPercent, 'number')
    assert.equal(['tp1_hit', 'stop_loss_hit', 'no_touch', 'timeout'].includes(fiveMinuteSamples[0].label.barrierOutcome ?? ''), true)
    assert.equal(metrics.sampleSize, fiveMinuteSamples.length)
    assert.equal(metrics.calibrationBuckets.length, 5)
    assert.equal(metrics.brierScore !== null && metrics.brierScore >= 0 && metrics.brierScore <= 1, true)
  })
})

function makeHistory(count: number): HistoryPoint[] {
  const start = new Date('2026-05-16T08:00:00.000Z').getTime()
  return Array.from({ length: count }, (_item, index) => {
    const wave = Math.sin(index / 4) * 0.35
    const drift = index < count / 2 ? -index * 0.025 : -(count / 2) * 0.025 + (index - count / 2) * 0.04
    return makeHistoryPoint(new Date(start + index * 60_000).toISOString(), 100 + drift + wave)
  })
}

function makeHistoryPoint(timestamp: string, price: number): HistoryPoint {
  return {
    timestamp,
    sourceKind: 'official',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 98,
    dayHigh: 102,
    referenceAnchorPrice: 100,
    referenceAu9999Price: 100,
    referenceAutdPrice: 100,
  }
}

function makeQuote(price: number, timestamp: string): QuoteSample {
  return {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 98,
    dayHigh: 102,
    updatedAt: timestamp,
    fetchedAt: timestamp,
    productName: '积存金',
    productCode: '080020000521',
    sourceKind: 'official',
    sourceName: 'test',
    marketReference: {
      sourceName: 'test',
      sourceUrl: '',
      isDelayed: true,
      tradingDate: null,
      au9999: null,
      autd: null,
      calibration: {
        anchorSymbol: 'Au99.99',
        anchorPrice: 100,
        spread: price - 100,
        premiumPercent: (price - 100) / 100,
        withinReferenceRange: true,
        note: 'test',
      },
    },
  }
}

function makeStats(): QuoteStats24h {
  return {
    high24h: 102,
    low24h: 98,
    currentPrice: 99.2,
    absoluteChange24h: -1.6,
    percentChange24h: -0.0159,
    drawdownAmount24h: 2.8,
    drawdownPercent24h: 0.0275,
    pointCount: 30,
  }
}

function makeMarketContext(factorScore: number): MarketContext {
  const factor = (id: string, label: string) => ({
    id,
    label,
    value: null,
    unit: '',
    changePercent: null,
    impact: 'supportive' as const,
    score: factorScore,
    status: 'derived' as const,
    summary: `${label} supportive`,
    updatedAt: null,
  })
  return {
    updatedAt: '2026-05-16T09:30:00.000Z',
    factorScore,
    summary: 'test',
    factors: {
      spotGoldUsd: factor('spotGoldUsd', 'spot gold'),
      dollarIndex: factor('dollarIndex', 'dxy'),
      usdCny: factor('usdCny', 'usdcny'),
    },
    macroFactors: [],
    sentiment: {
      news: {
        id: 'news',
        label: 'news',
        score: 55,
        confidence: 30,
        status: 'derived',
        summary: 'test',
        sources: [],
        updatedAt: null,
      },
      blogger: {
        id: 'blogger',
        label: 'blogger',
        score: 50,
        confidence: 20,
        status: 'derived',
        summary: 'test',
        sources: [],
        updatedAt: null,
      },
    },
    backtest: {
      status: 'derived',
      sampleSize: 10,
      summary: 'test',
      horizons: [],
    },
    providerHealth: [],
  }
}

function makePattern(
  kind: PatternSignal['kind'],
  direction: PatternSignal['direction'],
  confidence: number,
): PatternSignal {
  return {
    id: 'pattern-test',
    kind,
    label: '测试形态',
    direction,
    confidence,
    detectedAt: '2026-05-16T09:30:00.000Z',
    keyPrice: 99,
    necklinePrice: null,
    invalidationPrice: 98.5,
    targetPrice: 101,
    expectedConfirmationBars: 2,
    summary: 'test',
    explanation: 'test',
  }
}
