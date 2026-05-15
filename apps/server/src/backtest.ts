import { buildOpportunitySignal } from './strategy.js'
import {
  buildBacktestProbabilitySummary,
  buildProbabilityMetricsFromSnapshots,
  PROBABILITY_MODEL_VERSION,
} from './model.js'
import type {
  BacktestMonitor,
  BacktestSnapshot,
  BacktestBucket,
  HistoryPoint,
  OpportunitySignal,
  QuoteSample,
  QuoteStats24h,
  WalkForwardSample,
  SourceStatus,
} from './types.js'

export type StrategyReplayPoint = {
  quote: QuoteSample
  signal: OpportunitySignal
  stats: QuoteStats24h
}

export function replayOpportunityStrategy(
  quotes: QuoteSample[],
  sourceStatus: SourceStatus,
): StrategyReplayPoint[] {
  const history: HistoryPoint[] = []
  const results: StrategyReplayPoint[] = []

  for (const quote of quotes) {
    const stats = buildReplayStats(history, quote)
    const signal = buildOpportunitySignal(history, quote, stats, sourceStatus)
    results.push({ quote, signal, stats })
    history.push(quoteToHistoryPoint(quote))
  }

  return results
}

export function buildBacktestMonitor(
  snapshots: BacktestSnapshot[],
  horizonMinutes = 60,
): BacktestMonitor {
  const sorted = snapshots
    .slice()
    .sort((left, right) => new Date(left.quoteTimestamp).getTime() - new Date(right.quoteTimestamp).getTime())
  const allEvaluatedSamples: WalkForwardSample[] = []
  const horizonMs = horizonMinutes * 60 * 1000

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]
    const currentMs = new Date(current.quoteTimestamp).getTime()
    const futureIndex = sorted.findIndex((candidate, candidateIndex) => {
      if (candidateIndex <= index) {
        return false
      }
      return new Date(candidate.quoteTimestamp).getTime() - currentMs >= horizonMs
    })
    if (futureIndex < 0 || current.price <= 0) {
      continue
    }

    const future = sorted[futureIndex]
    const window = sorted.slice(index + 1, futureIndex + 1)
    const minPrice = window.reduce((min, item) => Math.min(min, item.price), current.price)
    const maxPrice = window.reduce((max, item) => Math.max(max, item.price), current.price)
    allEvaluatedSamples.push({
      openedAt: current.quoteTimestamp,
      evaluatedAt: future.quoteTimestamp,
      signalScore: current.signalScore,
      signalLevel: current.signalLevel,
      bucketKey: buildPrimaryBucketKey(current),
      entryPrice: current.price,
      exitPrice: future.price,
      returnPercent: (future.price - current.price) / current.price,
      maxDrawdown: (minPrice - current.price) / current.price,
      maxFavorableExcursion: (maxPrice - current.price) / current.price,
    })
  }

  const signalThreshold = chooseSignalThreshold(allEvaluatedSamples)
  const evaluatedSamples = allEvaluatedSamples.filter((sample) => {
    return sample.signalScore >= signalThreshold || sample.signalLevel !== 'none'
  })
  const returns = evaluatedSamples.map((sample) => sample.returnPercent)
  const baselineReturns = allEvaluatedSamples.map((sample) => sample.returnPercent)
  const winRate = returns.length > 0
    ? returns.filter((value) => value > 0).length / returns.length
    : null
  const baselineWinRate = baselineReturns.length > 0
    ? baselineReturns.filter((value) => value > 0).length / baselineReturns.length
    : null
  const averageReturn = average(returns)
  const expectancy = averageReturn
  const profitFactor = calculateProfitFactor(returns)
  const downside = returns.filter((value) => value < 0)
  const downsideDeviation = standardDeviation(downside)
  const sortinoRatio = averageReturn !== null && downsideDeviation !== null && downsideDeviation > 0
    ? averageReturn / downsideDeviation
    : null
  const informationRatio = averageReturn !== null
    ? ratioToDeviation(averageReturn, returns)
    : null
  const maxDrawdown = evaluatedSamples.length > 0
    ? Math.min(...evaluatedSamples.map((sample) => sample.maxDrawdown))
    : null
  const failureSamples = evaluatedSamples
    .filter((sample) => sample.returnPercent < 0 || sample.maxDrawdown <= -0.01)
    .sort((left, right) => left.returnPercent - right.returnPercent)
    .slice(0, 8)
  const buckets = buildBacktestBuckets(sorted, horizonMs, signalThreshold)
  const probabilityMetrics = buildProbabilityMetricsFromSnapshots(sorted)

  return {
    updatedAt: new Date().toISOString(),
    sampleSize: sorted.length,
    allEvaluatedSamples: allEvaluatedSamples.length,
    evaluatedSamples: evaluatedSamples.length,
    signalThreshold,
    winRate,
    baselineWinRate,
    averageReturn,
    expectancy,
    profitFactor,
    reliability: calculateReliability(evaluatedSamples.length, winRate, profitFactor),
    sortinoRatio,
    informationRatio,
    maxDrawdown,
    buckets,
    probabilityModel: {
      modelVersion: PROBABILITY_MODEL_VERSION,
      updatedAt: new Date().toISOString(),
      horizons: probabilityMetrics,
      summary: buildBacktestProbabilitySummary(probabilityMetrics),
    },
    failureSamples,
    summary: buildMonitorSummary({
      allEvaluatedSamples: allEvaluatedSamples.length,
      evaluatedSamples: evaluatedSamples.length,
      winRate,
      baselineWinRate,
      averageReturn,
      maxDrawdown,
      profitFactor,
      signalThreshold,
    }),
  }
}

function buildBacktestBuckets(
  snapshots: BacktestSnapshot[],
  horizonMs: number,
  signalThreshold: number,
): BacktestBucket[] {
  const buckets = new Map<string, Array<WalkForwardSample & { baseline: boolean }>>()
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const current = snapshots[index]
    const currentMs = new Date(current.quoteTimestamp).getTime()
    const futureIndex = snapshots.findIndex((candidate, candidateIndex) => {
      if (candidateIndex <= index) {
        return false
      }
      return new Date(candidate.quoteTimestamp).getTime() - currentMs >= horizonMs
    })
    if (futureIndex < 0 || current.price <= 0) {
      continue
    }

    const future = snapshots[futureIndex]
    const window = snapshots.slice(index + 1, futureIndex + 1)
    const minPrice = window.reduce((min, item) => Math.min(min, item.price), current.price)
    const maxPrice = window.reduce((max, item) => Math.max(max, item.price), current.price)
    const sample: WalkForwardSample & { baseline: boolean } = {
      openedAt: current.quoteTimestamp,
      evaluatedAt: future.quoteTimestamp,
      signalScore: current.signalScore,
      signalLevel: current.signalLevel,
      bucketKey: buildPrimaryBucketKey(current),
      entryPrice: current.price,
      exitPrice: future.price,
      returnPercent: (future.price - current.price) / current.price,
      maxDrawdown: (minPrice - current.price) / current.price,
      maxFavorableExcursion: (maxPrice - current.price) / current.price,
      baseline: current.signalScore < signalThreshold && current.signalLevel === 'none',
    }

    for (const bucket of buildSnapshotBuckets(current)) {
      const existing = buckets.get(bucket.key) ?? []
      existing.push({ ...sample, bucketKey: bucket.key })
      buckets.set(bucket.key, existing)
    }
  }

  return [...buckets.entries()]
    .map(([key, samples]) => summarizeBucket(key, samples))
    .filter((bucket) => bucket.sampleSize >= 2)
    .sort((left, right) => {
      if (right.qualifiedSamples !== left.qualifiedSamples) {
        return right.qualifiedSamples - left.qualifiedSamples
      }
      return right.reliability - left.reliability
    })
    .slice(0, 12)
}

function buildSnapshotBuckets(snapshot: BacktestSnapshot) {
  const buckets: Array<{
    key: string
    label: string
    dimension: BacktestBucket['dimension']
  }> = [
    {
      key: `signal:${snapshot.signalLevel}`,
      label: `信号等级：${signalLevelLabel(snapshot.signalLevel)}`,
      dimension: 'signal' as const,
    },
    {
      key: `score:${scoreBand(snapshot.signalScore)}`,
      label: `分数段：${scoreBandLabel(snapshot.signalScore)}`,
      dimension: 'score' as const,
    },
    {
      key: `valuation:${valuationBand(snapshot.valuation.pricePercentile)}`,
      label: `估值水位：${valuationBandLabel(snapshot.valuation.pricePercentile)}`,
      dimension: 'valuation' as const,
    },
    {
      key: `session:${sessionName(snapshot.quoteTimestamp)}`,
      label: `交易时段：${sessionLabel(snapshot.quoteTimestamp)}`,
      dimension: 'session' as const,
    },
    {
      key: `macro:${snapshot.macroRegime ?? 'unknown'}`,
      label: `宏观环境：${macroRegimeLabel(snapshot.macroRegime)}`,
      dimension: 'macro' as const,
    },
    {
      key: `confluence:${snapshot.confluenceConflictLevel ?? 'unknown'}`,
      label: `周期冲突：${confluenceConflictLabel(snapshot.confluenceConflictLevel)}`,
      dimension: 'confluence' as const,
    },
  ]
  if (snapshot.primaryPatternKind) {
    buckets.push({
      key: `pattern:${snapshot.primaryPatternKind}`,
      label: `形态：${snapshot.primaryPatternKind}`,
      dimension: 'pattern' as const,
    })
  }
  return buckets
}

function summarizeBucket(
  key: string,
  samples: Array<WalkForwardSample & { baseline: boolean }>,
): BacktestBucket {
  const [dimension] = key.split(':') as [BacktestBucket['dimension'], string]
  const qualified = samples.filter((sample) => !sample.baseline)
  const returns = qualified.map((sample) => sample.returnPercent)
  const baselineReturns = samples.map((sample) => sample.returnPercent)
  const winRate = returns.length > 0 ? returns.filter((value) => value > 0).length / returns.length : null
  const baselineWinRate = baselineReturns.length > 0
    ? baselineReturns.filter((value) => value > 0).length / baselineReturns.length
    : null
  const averageReturn = average(returns)
  const profitFactor = calculateProfitFactor(returns)
  const maxDrawdown = qualified.length > 0 ? Math.min(...qualified.map((sample) => sample.maxDrawdown)) : null
  const mae = qualified.length > 0 ? average(qualified.map((sample) => sample.maxDrawdown)) : null
  const mfe = qualified.length > 0
    ? average(qualified.map((sample) => sample.maxFavorableExcursion ?? 0))
    : null
  const reliability = calculateReliability(qualified.length, winRate, profitFactor)
  const label = bucketLabelFromKey(key)
  return {
    key,
    label,
    dimension,
    sampleSize: samples.length,
    qualifiedSamples: qualified.length,
    winRate,
    baselineWinRate,
    averageReturn,
    profitFactor,
    maxDrawdown,
    mae,
    mfe,
    reliability,
    summary: `${label}：合格 ${qualified.length}/${samples.length}，胜率 ${formatPercent(winRate)}，基准 ${formatPercent(baselineWinRate)}，PF ${formatRatio(profitFactor)}，MAE ${formatPercent(mae)}，MFE ${formatPercent(mfe)}。`,
  }
}

function buildPrimaryBucketKey(snapshot: BacktestSnapshot) {
  return snapshot.primaryPatternKind
    ? `pattern:${snapshot.primaryPatternKind}`
    : `score:${scoreBand(snapshot.signalScore)}`
}

function bucketLabelFromKey(key: string) {
  const [, value] = key.split(':')
  if (key.startsWith('signal:')) {
    return `信号等级：${signalLevelLabel(value)}`
  }
  if (key.startsWith('score:')) {
    return `分数段：${scoreBandLabelFromBand(value)}`
  }
  if (key.startsWith('valuation:')) {
    return `估值水位：${valuationBandLabelFromBand(value)}`
  }
  if (key.startsWith('session:')) {
    return `交易时段：${sessionNameLabel(value)}`
  }
  if (key.startsWith('macro:')) {
    return `宏观环境：${macroRegimeLabel(value)}`
  }
  if (key.startsWith('confluence:')) {
    return `周期冲突：${confluenceConflictLabel(value)}`
  }
  if (key.startsWith('pattern:')) {
    return `形态：${value}`
  }
  return key
}

function signalLevelLabel(level: string | undefined) {
  return level === 'strong' ? '强信号' : level === 'watch' ? '观察信号' : '普通/无信号'
}

function scoreBand(score: number) {
  if (score >= 72) {
    return 'strong'
  }
  if (score >= 55) {
    return 'positive'
  }
  if (score >= 45) {
    return 'watch'
  }
  return 'weak'
}

function scoreBandLabel(score: number) {
  return scoreBandLabelFromBand(scoreBand(score))
}

function scoreBandLabelFromBand(band: string | undefined) {
  if (band === 'strong') {
    return '强优势'
  }
  if (band === 'positive') {
    return '偏积极'
  }
  if (band === 'watch') {
    return '观察'
  }
  return '偏弱'
}

function valuationBand(percentile: number | null) {
  if (percentile === null) {
    return 'unknown'
  }
  if (percentile <= 0.25) {
    return 'low'
  }
  if (percentile >= 0.75) {
    return 'high'
  }
  return 'middle'
}

function valuationBandLabel(percentile: number | null) {
  return valuationBandLabelFromBand(valuationBand(percentile))
}

function valuationBandLabelFromBand(band: string | undefined) {
  if (band === 'low') {
    return '低位'
  }
  if (band === 'high') {
    return '高位'
  }
  if (band === 'middle') {
    return '中位'
  }
  return '未知'
}

function sessionName(timestamp: string) {
  const hour = new Date(timestamp).getUTCHours()
  if (hour >= 0 && hour < 7) {
    return 'asia'
  }
  if (hour >= 7 && hour < 13) {
    return 'europe'
  }
  if (hour >= 13 && hour < 22) {
    return 'us'
  }
  return 'late'
}

function sessionLabel(timestamp: string) {
  return sessionNameLabel(sessionName(timestamp))
}

function sessionNameLabel(session: string | undefined) {
  if (session === 'asia') {
    return '亚盘'
  }
  if (session === 'europe') {
    return '欧盘'
  }
  if (session === 'us') {
    return '美盘'
  }
  return '尾盘/跨日'
}

function macroRegimeLabel(regime: string | null | undefined) {
  if (regime === 'supportive') {
    return '利好黄金'
  }
  if (regime === 'pressure') {
    return '压制黄金'
  }
  if (regime === 'neutral') {
    return '中性'
  }
  return '未知'
}

function confluenceConflictLabel(level: string | null | undefined) {
  if (level === 'none') {
    return '无冲突'
  }
  if (level === 'mild') {
    return '轻微冲突'
  }
  if (level === 'severe') {
    return '严重冲突'
  }
  return '未知'
}

function buildReplayStats(history: HistoryPoint[], latestQuote: QuoteSample): QuoteStats24h {
  const prices = [...history.map((point) => point.price), latestQuote.price]
  const baseline = prices[0] ?? latestQuote.price
  const high24h = Math.max(...prices)
  const low24h = Math.min(...prices)
  const absoluteChange24h = latestQuote.price - baseline
  const drawdownAmount24h = Math.max(high24h - latestQuote.price, 0)

  return {
    high24h,
    low24h,
    currentPrice: latestQuote.price,
    absoluteChange24h,
    percentChange24h: baseline === 0 ? 0 : absoluteChange24h / baseline,
    drawdownAmount24h,
    drawdownPercent24h: high24h === 0 ? 0 : drawdownAmount24h / high24h,
    pointCount: prices.length,
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

function ratioToDeviation(averageReturn: number, values: number[]) {
  const deviation = standardDeviation(values)
  return deviation && deviation > 0 ? averageReturn / deviation : null
}

function chooseSignalThreshold(samples: WalkForwardSample[]) {
  const strongThreshold = 60
  const watchThreshold = 45
  if (samples.filter((sample) => sample.signalScore >= strongThreshold).length >= 5) {
    return strongThreshold
  }
  if (samples.filter((sample) => sample.signalScore >= watchThreshold || sample.signalLevel !== 'none').length >= 3) {
    return watchThreshold
  }
  if (samples.length < 3) {
    return watchThreshold
  }
  const sortedScores = samples.map((sample) => sample.signalScore).sort((left, right) => right - left)
  return Math.max(watchThreshold, sortedScores[Math.min(sortedScores.length - 1, Math.floor(sortedScores.length * 0.4))])
}

function calculateProfitFactor(returns: number[]) {
  const grossProfit = returns
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(
    returns
      .filter((value) => value < 0)
      .reduce((sum, value) => sum + value, 0),
  )
  if (grossProfit <= 0) {
    return null
  }
  if (grossLoss === 0) {
    return 9.99
  }
  return grossProfit / grossLoss
}

function calculateReliability(
  evaluatedSamples: number,
  winRate: number | null,
  profitFactor: number | null,
) {
  if (evaluatedSamples < 3 || winRate === null) {
    return 28
  }
  const sampleScore = Math.min(34, evaluatedSamples * 4)
  const winScore = Math.max(0, (winRate - 0.45) * 90)
  const profitScore = profitFactor === null ? 0 : Math.min(18, Math.max(0, (profitFactor - 1) * 18))
  return Math.round(Math.min(88, 28 + sampleScore + winScore + profitScore))
}

function buildMonitorSummary(input: {
  allEvaluatedSamples: number
  evaluatedSamples: number
  winRate: number | null
  baselineWinRate: number | null
  averageReturn: number | null
  maxDrawdown: number | null
  profitFactor: number | null
  signalThreshold: number
}) {
  const {
    allEvaluatedSamples,
    evaluatedSamples,
    winRate,
    baselineWinRate,
    averageReturn,
    maxDrawdown,
    profitFactor,
    signalThreshold,
  } = input
  if (evaluatedSamples < 3) {
    return `选择性 Walk-forward 已启用，当前合格信号 ${evaluatedSamples}/${allEvaluatedSamples} 个，样本仍不足，暂不放大强信号。`
  }
  return `选择性 Walk-forward ${evaluatedSamples}/${allEvaluatedSamples} 个合格信号，阈值 ${signalThreshold}/100，胜率 ${formatPercent(winRate)}，基准 ${formatPercent(baselineWinRate)}，平均收益 ${formatPercent(averageReturn)}，Profit Factor ${formatRatio(profitFactor)}，最大回撤 ${formatPercent(maxDrawdown)}。`
}

function formatPercent(value: number | null) {
  return value === null ? '--' : `${(value * 100).toFixed(2)}%`
}

function formatRatio(value: number | null) {
  return value === null || !Number.isFinite(value) ? '--' : value.toFixed(2)
}
