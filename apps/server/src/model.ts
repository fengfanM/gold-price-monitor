import type { TechnicalSnapshot } from './technicals.js'
import { buildKnowledgeFeatureValues } from './knowledge-rules.js'
import { buildTripleBarrierLabel, historyPointToBarrierPoint } from './triple-barrier.js'
import type {
  BacktestSnapshot,
  MarketContext,
  MultiTimeframeConfluence,
  PatternSignal,
  ProbabilityCalibrationBucket,
  ProbabilityHorizonMinutes,
  ProbabilityModelFeatureSet,
  ProbabilityModelMetrics,
  ProbabilityModelSnapshot,
  ProbabilityPrediction,
  ProbabilityTrainingSample,
  QuoteSample,
  QuoteStats24h,
  HistoryPoint,
} from './types.js'

export const PROBABILITY_MODEL_VERSION = 'rules-calibrated-logit-triple-barrier-v1'

const DEFAULT_HORIZONS: ProbabilityHorizonMinutes[] = [5, 15, 60, 240]
const FEATURE_VERSION = 'gold-intraday-features-v1'
const BUCKETS = [
  { key: 'p00_20', lowerBound: 0, upperBound: 0.2 },
  { key: 'p20_40', lowerBound: 0.2, upperBound: 0.4 },
  { key: 'p40_60', lowerBound: 0.4, upperBound: 0.6 },
  { key: 'p60_80', lowerBound: 0.6, upperBound: 0.8 },
  { key: 'p80_100', lowerBound: 0.8, upperBound: 1.0000001 },
]

type CalibrationLookup = Partial<Record<ProbabilityHorizonMinutes, ProbabilityModelMetrics>>

export function extractProbabilityFeatures(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  stats: QuoteStats24h
  marketContext: MarketContext
  technicals: TechnicalSnapshot
  patternSignals: PatternSignal[]
  confluence?: MultiTimeframeConfluence
}): ProbabilityModelFeatureSet {
  const {
    confluence,
    history,
    latestQuote,
    marketContext,
    patternSignals,
    stats,
    technicals,
  } = input
  const sorted = [...history, quoteToHistoryPoint(latestQuote)]
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
  const prices = sorted.map((point) => point.price)
  const returns = buildReturns(prices)
  const recent = sorted.slice(-8)
  const previous = recent[recent.length - 2]
  const recentLow = recent.reduce((min, point) => Math.min(min, point.price), latestQuote.price)
  const rangeSpan = stats.high24h - stats.low24h
  const rangePosition = rangeSpan > 0
    ? clamp((stats.currentPrice - stats.low24h) / rangeSpan, 0, 1)
    : null
  const premiumPercent = latestQuote.marketReference.calibration.premiumPercent
  const bullishPatternScore = patternSignals
    .filter((pattern) => pattern.direction === 'bullish' && isConfirmedPatternSignal(pattern))
    .slice(0, 3)
    .reduce((sum, pattern) => sum + pattern.confidence / 100, 0)
  const candidateBullishPatternScore = patternSignals
    .filter((pattern) => pattern.direction === 'bullish' && !isConfirmedPatternSignal(pattern))
    .slice(0, 3)
    .reduce((sum, pattern) => sum + pattern.confidence / 100, 0)
  const bearishPatternScore = patternSignals
    .filter((pattern) => pattern.direction === 'bearish')
    .slice(0, 3)
    .reduce((sum, pattern) => sum + pattern.confidence / 100, 0)
  const knowledgeFeatures = buildKnowledgeFeatureValues({
    history,
    latestQuote,
    stats,
    technicals,
    marketContext,
    patternSignals,
    confluence,
  })

  const values: Record<string, number | null> = {
    rangeLowAdvantage: rangePosition === null ? null : 1 - rangePosition,
    drawdownDepth: clamp(stats.drawdownPercent24h / 0.03, 0, 1),
    negativeReturn24h: clamp(-stats.percentChange24h / 0.025, -1, 1),
    shortRebound: recentLow > 0 ? clamp((latestQuote.price - recentLow) / recentLow / 0.006, 0, 1) : null,
    latestMove: previous && previous.price > 0
      ? clamp((latestQuote.price - previous.price) / previous.price / 0.003, -1, 1)
      : null,
    volatility: normalizeVolatility(standardDeviation(returns)),
    rsiCold: technicals.rsi14 === null ? null : clamp((50 - technicals.rsi14) / 25, -1, 1),
    rsiHot: technicals.rsi14 === null ? null : clamp((technicals.rsi14 - 65) / 20, 0, 1),
    macdMomentum: technicals.macd === null
      ? null
      : clamp((technicals.macd.histogram / latestQuote.price) / 0.001, -1, 1),
    ma20Discount: technicals.ma20 === null ? null : clamp((technicals.ma20 - latestQuote.price) / technicals.ma20 / 0.012, -1, 1),
    anchorCheap: premiumPercent === null ? null : clamp(-premiumPercent / 0.006, -1, 1),
    anchorExpensive: premiumPercent === null ? null : clamp(premiumPercent / 0.02, 0, 1),
    marketSupport: clamp((marketContext.factorScore - 50) / 50, -1, 1),
    sentimentSupport: clamp(
      ((marketContext.sentiment.news.score - 50) * marketContext.sentiment.news.confidence +
        (marketContext.sentiment.blogger.score - 50) * marketContext.sentiment.blogger.confidence) /
        Math.max(marketContext.sentiment.news.confidence + marketContext.sentiment.blogger.confidence, 1) /
        50,
      -1,
      1,
    ),
    bullishPatternScore: clamp(bullishPatternScore, 0, 1),
    candidateBullishPatternScore: clamp(candidateBullishPatternScore, 0, 1),
    bearishPatternScore: clamp(bearishPatternScore, 0, 1),
    confluenceSupport: confluence ? clamp((confluence.score - 50) / 50, -1, 1) : null,
    dataDepth: clamp(sorted.length / 80, 0, 1),
    sourcePenalty: latestQuote.sourceKind === 'fallback' ? 1 : 0,
    'kb.trendStructureScore': knowledgeFeatures.trendStructureScore,
    'kb.patternLocationScore': knowledgeFeatures.patternLocationScore,
    'kb.breakoutFailureRisk': knowledgeFeatures.breakoutFailureRisk,
    'kb.rangeCompressionScore': knowledgeFeatures.rangeCompressionScore,
    'kb.liquiditySweepRisk': knowledgeFeatures.liquiditySweepRisk,
    'kb.maWhipsawRisk': knowledgeFeatures.maWhipsawRisk,
    'kb.sweepReclaimScore': knowledgeFeatures.sweepReclaimScore,
    'kb.pullbackQuality': knowledgeFeatures.pullbackQuality,
    'kb.supportResistanceQuality': knowledgeFeatures.supportResistanceQuality,
    'kb.macroAlignmentScore': knowledgeFeatures.macroAlignmentScore,
  }

  return {
    observedAt: latestQuote.fetchedAt,
    sampleSize: sorted.length,
    featureVersion: FEATURE_VERSION,
    values,
    missing: Object.entries(values)
      .filter(([, value]) => value === null || !Number.isFinite(value))
      .map(([key]) => key),
  }
}

export function predictProbabilityModel(input: {
  features: ProbabilityModelFeatureSet
  horizons?: ProbabilityHorizonMinutes[]
  calibration?: ProbabilityModelMetrics[]
}): ProbabilityModelSnapshot {
  const horizons = input.horizons ?? DEFAULT_HORIZONS
  const calibrationLookup = buildCalibrationLookup(input.calibration ?? [])
  const predictions = horizons.map((horizon) => predictForHorizon(input.features, horizon, calibrationLookup[horizon]))
  const primaryPrediction = predictions.find((prediction) => prediction.horizonMinutes === 60) ?? predictions[0]

  return {
    modelVersion: PROBABILITY_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    features: input.features,
    predictions,
    primaryPrediction,
    metrics: input.calibration ?? [],
    limitations: [
      '轻量模型只做行情观察概率估计，不构成投资建议或收益承诺。',
      '缺少足量本地样本时，概率会向 50% 收缩，避免把规则信号过度放大。',
      '特征主要来自短周期价格、锚点、技术指标和宏观上下文，不能覆盖突发新闻与流动性跳变。',
    ],
  }
}

export function buildProbabilityTrainingSamples(
  history: HistoryPoint[],
  options: {
    horizons?: ProbabilityHorizonMinutes[]
    minHistoryPoints?: number
  } = {},
): ProbabilityTrainingSample[] {
  const horizons = options.horizons ?? DEFAULT_HORIZONS
  const minHistoryPoints = options.minHistoryPoints ?? 8
  const points = dedupeHistoryByTimestamp(history)
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
  const barrierPoints = points.map(historyPointToBarrierPoint)
  const samples: ProbabilityTrainingSample[] = []

  for (let index = minHistoryPoints; index < points.length - 1; index += 1) {
    const current = points[index]
    const prior = points.slice(0, index)
    const quote = quoteFromHistoryPoint(current)
    const stats = buildStatsFromHistory(prior, quote)
    const features = extractProbabilityFeatures({
      history: prior,
      latestQuote: quote,
      stats,
      marketContext: buildNeutralMarketContext(current.timestamp),
      technicals: buildTechnicalFeaturesFromPrices([...prior, current].map((point) => point.price)),
      patternSignals: [],
    })

    for (const horizonMinutes of horizons) {
      const barrierLabel = buildTripleBarrierLabel(barrierPoints, index, {
        horizonMinutes,
        tp1ReturnPercent: 0.01,
        stopLossReturnPercent: -0.01,
      })
      samples.push({
        openedAt: current.timestamp,
        horizonMinutes,
        features,
        label: {
          horizonMinutes,
          evaluatedAt: barrierLabel.evaluatedAt,
          entryPrice: current.price,
          exitPrice: barrierLabel.exitPrice,
          returnPercent: barrierLabel.returnPercent,
          maxDrawdown: barrierLabel.maxDrawdown,
          maxFavorableExcursion: barrierLabel.maxFavorableExcursion,
          barrierOutcome: barrierLabel.outcome,
          touchedAt: barrierLabel.touchedAt,
          tp1Price: barrierLabel.tp1Price,
          stopLossPrice: barrierLabel.stopLossPrice,
          barsObserved: barrierLabel.barsObserved,
          complete: barrierLabel.complete,
          positive: barrierLabel.positive,
        },
      })
    }
  }

  return samples
}

export function buildProbabilityMetrics(
  samples: ProbabilityTrainingSample[],
  horizonMinutes: ProbabilityHorizonMinutes,
): ProbabilityModelMetrics {
  const scoped = samples.filter((sample) => sample.horizonMinutes === horizonMinutes)
  const outcomes = scoped.map((sample) => {
    const prediction = predictForHorizon(sample.features, horizonMinutes)
    return {
      probability: prediction.rawProbability,
      positive: sample.label.positive,
    }
  })
  return summarizeProbabilityOutcomes(horizonMinutes, outcomes)
}

export function buildProbabilityMetricsFromSnapshots(
  snapshots: BacktestSnapshot[],
  horizons: ProbabilityHorizonMinutes[] = DEFAULT_HORIZONS,
): ProbabilityModelMetrics[] {
  const sorted = snapshots
    .slice()
    .sort((left, right) => new Date(left.quoteTimestamp).getTime() - new Date(right.quoteTimestamp).getTime())
  const barrierPoints = sorted.map((snapshot) => ({ timestamp: snapshot.quoteTimestamp, price: snapshot.price }))

  return horizons.map((horizonMinutes) => {
    const outcomes: Array<{ probability: number; positive: boolean }> = []
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index]
      if (current.price <= 0) {
        continue
      }
      const barrierLabel = buildTripleBarrierLabel(
        barrierPoints,
        index,
        {
          horizonMinutes,
          tp1ReturnPercent: 0.01,
          stopLossReturnPercent: -0.01,
        },
      )
      const probability = current.modelProbability ?? snapshotRuleProbability(current)
      outcomes.push({
        probability: clamp(probability, 0.01, 0.99),
        positive: barrierLabel.positive,
      })
    }
    return summarizeProbabilityOutcomes(horizonMinutes, outcomes)
  })
}

export function buildBacktestProbabilitySummary(metrics: ProbabilityModelMetrics[]) {
  const usable = metrics.filter((metric) => metric.sampleSize > 0)
  if (usable.length < 1) {
    return '概率模型回测样本不足，暂不能输出可靠 Brier 或校准分桶。'
  }
  const primary = usable.find((metric) => metric.horizonMinutes === 60) ?? usable[0]
  return `${primary.horizonMinutes} 分钟概率校准样本 ${primary.sampleSize} 个，Brier ${formatRatio(primary.brierScore)}，TP1 先达率 ${formatPercent(primary.positiveRate)}。`
}

function predictForHorizon(
  features: ProbabilityModelFeatureSet,
  horizonMinutes: ProbabilityHorizonMinutes,
  calibration?: ProbabilityModelMetrics,
): ProbabilityPrediction {
  const rawProbability = sigmoid(scoreLogit(features, horizonMinutes))
  const availability = 1 - features.missing.length / Math.max(Object.keys(features.values).length, 1)
  const sampleConfidence = clamp(features.sampleSize / 80, 0, 1)
  const calibrationSample = calibration?.sampleSize ?? 0
  const bucket = findBucket(rawProbability)
  const calibratedBucket = calibration?.calibrationBuckets.find((item) => item.key === bucket.key)
  const bucketReliability = calibratedBucket?.observedWinRate !== null && calibratedBucket?.observedWinRate !== undefined
    ? clamp((calibratedBucket.sampleSize - 2) / 28, 0, 0.7)
    : 0
  const calibratedProbability = calibratedBucket?.observedWinRate !== null && calibratedBucket?.observedWinRate !== undefined
    ? rawProbability * (1 - bucketReliability) + calibratedBucket.observedWinRate * bucketReliability
    : rawProbability
  const totalConfidence = Math.round(clamp(28 + availability * 24 + sampleConfidence * 20 + Math.min(calibrationSample, 60) * 0.45, 0, 88))
  const conservativeProbability = 0.5 + (calibratedProbability - 0.5) * clamp(totalConfidence / 88, 0.35, 1)

  return {
    horizonMinutes,
    probability: roundProbability(conservativeProbability),
    rawProbability: roundProbability(rawProbability),
    confidence: totalConfidence,
    sampleSize: calibrationSample,
    brierScore: calibration?.brierScore ?? null,
    calibrationBucketKey: bucket.key,
    summary: `${horizonMinutes} 分钟 TP1 先达概率 ${formatPercent(conservativeProbability)}，置信度 ${totalConfidence}/100，校准样本 ${calibrationSample}。`,
  }
}

function scoreLogit(features: ProbabilityModelFeatureSet, horizonMinutes: ProbabilityHorizonMinutes) {
  const value = (key: string, fallback = 0) => {
    const current = features.values[key]
    return current === null || !Number.isFinite(current) ? fallback : current
  }
  const horizonBias: Record<ProbabilityHorizonMinutes, number> = {
    5: -0.08,
    15: -0.02,
    60: 0.04,
    240: -0.04,
  }
  return (
    -0.06 +
    horizonBias[horizonMinutes] +
    value('rangeLowAdvantage', 0.5) * 0.52 +
    value('drawdownDepth') * 0.44 +
    value('negativeReturn24h') * 0.22 +
    value('shortRebound') * 0.30 +
    value('latestMove') * 0.12 -
    value('volatility') * 0.18 +
    value('rsiCold') * 0.30 -
    value('rsiHot') * 0.42 +
    value('macdMomentum') * 0.18 +
    value('ma20Discount') * 0.22 +
    value('anchorCheap') * 0.24 -
    value('anchorExpensive') * 0.42 +
    value('marketSupport') * 0.28 +
    value('sentimentSupport') * 0.10 +
    value('bullishPatternScore') * 0.26 +
    value('candidateBullishPatternScore') * 0.03 -
    value('bearishPatternScore') * 0.34 +
    value('confluenceSupport') * 0.22 +
    value('kb.trendStructureScore') * 0.18 +
    value('kb.patternLocationScore') * 0.18 -
    value('kb.breakoutFailureRisk') * 0.30 +
    value('kb.sweepReclaimScore') * 0.12 -
    value('kb.liquiditySweepRisk') * 0.26 -
    value('kb.maWhipsawRisk') * 0.18 -
    value('kb.rangeCompressionScore') * 0.06 +
    value('kb.pullbackQuality') * 0.16 +
    value('kb.supportResistanceQuality') * 0.12 +
    value('kb.macroAlignmentScore') * 0.12 +
    value('dataDepth') * 0.10 -
    value('sourcePenalty') * 0.24
  )
}

function summarizeProbabilityOutcomes(
  horizonMinutes: ProbabilityHorizonMinutes,
  outcomes: Array<{ probability: number; positive: boolean }>,
): ProbabilityModelMetrics {
  const brierScore = outcomes.length > 0
    ? average(outcomes.map((item) => (item.probability - (item.positive ? 1 : 0)) ** 2))
    : null
  const positiveRate = outcomes.length > 0
    ? outcomes.filter((item) => item.positive).length / outcomes.length
    : null
  const calibrationBuckets: ProbabilityCalibrationBucket[] = BUCKETS.map((bucket) => {
    const bucketItems = outcomes.filter((item) => item.probability >= bucket.lowerBound && item.probability < bucket.upperBound)
    return {
      ...bucket,
      sampleSize: bucketItems.length,
      averagePrediction: average(bucketItems.map((item) => item.probability)),
      observedWinRate: bucketItems.length > 0
        ? bucketItems.filter((item) => item.positive).length / bucketItems.length
        : null,
      brierScore: average(bucketItems.map((item) => (item.probability - (item.positive ? 1 : 0)) ** 2)),
    }
  })

  return {
    horizonMinutes,
    sampleSize: outcomes.length,
    positiveRate,
    brierScore,
    calibrationBuckets,
    summary: outcomes.length < 5
      ? `${horizonMinutes} 分钟样本 ${outcomes.length} 个，校准仍不足。`
      : `${horizonMinutes} 分钟样本 ${outcomes.length} 个，Brier ${formatRatio(brierScore)}，TP1 先达率 ${formatPercent(positiveRate)}。`,
  }
}

function snapshotRuleProbability(snapshot: BacktestSnapshot) {
  const scoreLogitPart = (snapshot.signalScore - 50) / 48
  const valuationPart = snapshot.valuation.pricePercentile === null
    ? 0
    : (0.5 - snapshot.valuation.pricePercentile) * 0.65
  const confluencePart = snapshot.confluenceScore === null || snapshot.confluenceScore === undefined
    ? 0
    : (snapshot.confluenceScore - 50) / 100
  const macroPart = snapshot.macroRegime === 'supportive'
    ? 0.12
    : snapshot.macroRegime === 'pressure'
      ? -0.16
      : 0
  const patternPart = snapshot.primaryPatternKind === 'double_bottom' || snapshot.primaryPatternKind === 'support_rebound' || snapshot.primaryPatternKind === 'hammer' || snapshot.primaryPatternKind === 'bullish_engulfing'
    ? 0.12
    : snapshot.primaryPatternKind === 'double_top' || snapshot.primaryPatternKind === 'resistance_rejection' || snapshot.primaryPatternKind === 'shooting_star' || snapshot.primaryPatternKind === 'bearish_engulfing'
      ? -0.14
      : 0
  return sigmoid(scoreLogitPart + valuationPart + confluencePart + macroPart + patternPart)
}

function isConfirmedPatternSignal(pattern: PatternSignal) {
  if (pattern.confirmationStatus) {
    return pattern.confirmationStatus === 'confirmed'
  }
  return pattern.expectedConfirmationBars <= 1
}

function buildCalibrationLookup(metrics: ProbabilityModelMetrics[]): CalibrationLookup {
  return metrics.reduce<CalibrationLookup>((lookup, item) => {
    lookup[item.horizonMinutes] = item
    return lookup
  }, {})
}

function findBucket(probability: number) {
  return BUCKETS.find((bucket) => probability >= bucket.lowerBound && probability < bucket.upperBound) ?? BUCKETS[BUCKETS.length - 1]
}

function buildStatsFromHistory(history: HistoryPoint[], latestQuote: QuoteSample): QuoteStats24h {
  const window = [...history, quoteToHistoryPoint(latestQuote)].slice(-240)
  const prices = window.map((point) => point.price).filter((price) => Number.isFinite(price) && price > 0)
  const baseline = prices[0] ?? latestQuote.price
  const high24h = Math.max(...prices, latestQuote.price)
  const low24h = Math.min(...prices, latestQuote.price)
  const absoluteChange24h = latestQuote.price - baseline
  const drawdownAmount24h = Math.max(high24h - latestQuote.price, 0)
  return {
    high24h,
    low24h,
    currentPrice: latestQuote.price,
    absoluteChange24h,
    percentChange24h: baseline > 0 ? absoluteChange24h / baseline : 0,
    drawdownAmount24h,
    drawdownPercent24h: high24h > 0 ? drawdownAmount24h / high24h : 0,
    pointCount: prices.length,
  }
}

function buildTechnicalFeaturesFromPrices(prices: number[]): TechnicalSnapshot {
  return {
    ma5: movingAverage(prices, 5),
    ma10: movingAverage(prices, 10),
    ma20: movingAverage(prices, 20),
    rsi14: rsi(prices, 14),
    macd: null,
    shortTrend: shortTrend(prices),
  }
}

function quoteFromHistoryPoint(point: HistoryPoint): QuoteSample {
  const anchorPrice = point.referenceAnchorPrice
  return {
    symbol: 'HISTORY_REPLAY',
    currency: 'CNY',
    unit: '元/克',
    price: point.price,
    activePrice: point.activePrice,
    regularPrice: point.regularPrice,
    sellPrice: point.sellPrice,
    dayLow: point.dayLow,
    dayHigh: point.dayHigh,
    updatedAt: point.timestamp,
    fetchedAt: point.timestamp,
    productName: '历史回放',
    productCode: 'HISTORY_REPLAY',
    sourceKind: point.sourceKind,
    sourceName: '历史样本',
    marketReference: {
      sourceName: '历史锚点',
      sourceUrl: '',
      isDelayed: true,
      tradingDate: null,
      au9999: point.referenceAu9999Price === null
        ? null
        : buildReferenceQuote('Au99.99', point.referenceAu9999Price),
      autd: point.referenceAutdPrice === null
        ? null
        : buildReferenceQuote('Au(T+D)', point.referenceAutdPrice),
      calibration: {
        anchorSymbol: anchorPrice === null ? null : 'HistoryAnchor',
        anchorPrice,
        spread: anchorPrice === null ? null : point.price - anchorPrice,
        premiumPercent: anchorPrice && anchorPrice > 0 ? (point.price - anchorPrice) / anchorPrice : null,
        withinReferenceRange: null,
        note: '历史样本锚点由 HistoryPoint 派生。',
      },
    },
  }
}

function buildReferenceQuote(symbol: string, price: number) {
  return {
    symbol,
    latestPrice: price,
    highPrice: price,
    lowPrice: price,
    openPrice: price,
  }
}

function quoteToHistoryPoint(quote: QuoteSample): HistoryPoint {
  return {
    timestamp: quote.fetchedAt,
    sourceKind: quote.sourceKind,
    price: quote.price,
    activePrice: quote.activePrice,
    regularPrice: quote.regularPrice,
    sellPrice: quote.sellPrice,
    dayLow: quote.dayLow,
    dayHigh: quote.dayHigh,
    referenceAnchorPrice: quote.marketReference.calibration.anchorPrice,
    referenceAu9999Price: quote.marketReference.au9999?.latestPrice ?? null,
    referenceAutdPrice: quote.marketReference.autd?.latestPrice ?? null,
  }
}

function buildNeutralMarketContext(timestamp: string): MarketContext {
  const factor = (id: string, label: string) => ({
    id,
    label,
    value: null,
    unit: '',
    changePercent: null,
    impact: 'unknown' as const,
    score: 50,
    status: 'unavailable' as const,
    summary: `${label}未用于历史样本。`,
    updatedAt: null,
  })
  return {
    updatedAt: timestamp,
    factorScore: 50,
    summary: '历史训练样本未绑定实时宏观上下文，按中性处理。',
    factors: {
      spotGoldUsd: factor('spotGoldUsd', '国际黄金'),
      dollarIndex: factor('dollarIndex', '美元指数'),
      usdCny: factor('usdCny', '美元/人民币'),
    },
    macroFactors: [],
    sentiment: {
      news: {
        id: 'news',
        label: '新闻情绪',
        score: 50,
        confidence: 0,
        status: 'unavailable',
        summary: '未接入历史样本。',
        sources: [],
        updatedAt: null,
      },
      blogger: {
        id: 'blogger',
        label: '博主观点可信度',
        score: 50,
        confidence: 0,
        status: 'unavailable',
        summary: '未接入历史样本。',
        sources: [],
        updatedAt: null,
      },
    },
    backtest: {
      status: 'unavailable',
      sampleSize: 0,
      summary: '训练样本按纯行情历史构造。',
      horizons: [],
    },
    providerHealth: [],
  }
}

function normalizeVolatility(value: number | null) {
  if (value === null) {
    return null
  }
  return clamp(value / 0.006, 0, 1)
}

function buildReturns(prices: number[]) {
  const returns: number[] = []
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1]
    if (previous > 0) {
      returns.push((prices[index] - previous) / previous)
    }
  }
  return returns
}

function movingAverage(values: number[], period: number) {
  if (values.length < period) {
    return null
  }
  const window = values.slice(-period)
  return average(window)
}

function rsi(values: number[], period: number) {
  if (values.length <= period) {
    return null
  }
  let gains = 0
  let losses = 0
  const window = values.slice(-(period + 1))
  for (let index = 1; index < window.length; index += 1) {
    const change = window[index] - window[index - 1]
    if (change >= 0) {
      gains += change
    } else {
      losses += Math.abs(change)
    }
  }
  if (losses === 0) {
    return 100
  }
  return 100 - 100 / (1 + gains / losses)
}

function shortTrend(values: number[]): TechnicalSnapshot['shortTrend'] {
  if (values.length < 4) {
    return 'unknown'
  }
  const recent = values.slice(-4)
  const first = recent[0]
  const latest = recent[recent.length - 1]
  if (first <= 0) {
    return 'unknown'
  }
  const change = (latest - first) / first
  if (change > 0.0008) {
    return 'rising'
  }
  if (change < -0.0008) {
    return 'falling'
  }
  return 'flat'
}

function dedupeHistoryByTimestamp(history: HistoryPoint[]) {
  const deduped = new Map<number, HistoryPoint>()
  for (const point of history) {
    const timestampMs = new Date(point.timestamp).getTime()
    if (Number.isFinite(timestampMs)) {
      deduped.set(timestampMs, point)
    }
  }
  return [...deduped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, point]) => point)
}

function average(values: number[]) {
  if (values.length < 1) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null
  }
  const mean = average(values)
  if (mean === null) {
    return null
  }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundProbability(value: number) {
  return Math.round(clamp(value, 0.01, 0.99) * 1000) / 1000
}

function formatPercent(value: number | null) {
  return value === null ? '--' : `${(value * 100).toFixed(1)}%`
}

function formatRatio(value: number | null) {
  return value === null || !Number.isFinite(value) ? '--' : value.toFixed(3)
}
