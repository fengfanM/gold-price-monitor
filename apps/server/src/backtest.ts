import { buildOpportunitySignal } from './strategy.js'
import {
  buildBacktestProbabilitySummary,
  buildProbabilityMetricsFromSnapshots,
  PROBABILITY_MODEL_VERSION,
} from './model.js'
import { buildTripleBarrierLabel } from './triple-barrier.js'
import type {
  BacktestMonitor,
  BacktestSnapshot,
  BacktestBucket,
  ExternalModelAdvisor,
  ExternalModelBacktestBucket,
  ExternalModelBacktestGate,
  ExternalModelBacktestMonitor,
  ExternalModelBucketDimension,
  HistoryPoint,
  OpportunitySignal,
  QuoteSample,
  QuoteStats24h,
  WalkForwardSample,
  SourceStatus,
} from './types.js'

const MIN_WEIGHTED_SAMPLES = 30

export type StrategyReplayPoint = {
  quote: QuoteSample
  signal: OpportunitySignal
  stats: QuoteStats24h
}

export function buildExternalModelBacktestGate(
  snapshots: BacktestSnapshot[],
  current: BacktestSnapshot,
  defaultHorizonMinutes = 60,
): ExternalModelBacktestGate {
  const monitor = buildExternalModelBacktestMonitor(snapshots.filter(isLiveOrigin), defaultHorizonMinutes)
  const probability = normalizeProbability(current.externalModelUpProbability)
  const currentKeys = buildExternalSnapshotBuckets(
    current,
    current.externalModelHorizonMinutes ?? defaultHorizonMinutes,
    probability,
  ).map((bucket) => bucket.key)
  const matched = monitor.buckets.filter((bucket) => currentKeys.includes(bucket.key))
  const strong = matched.filter((bucket) => {
    return bucket.qualifiedSamples >= MIN_WEIGHTED_SAMPLES &&
      bucket.reliability >= 55 &&
      (bucket.excessWinRate ?? 0) >= 0 &&
      (bucket.profitFactor ?? 0) >= 1.05
  })
  const weak = matched.filter((bucket) => {
    return bucket.qualifiedSamples >= MIN_WEIGHTED_SAMPLES &&
      (
        bucket.reliability < 45 ||
        (bucket.excessWinRate !== null && bucket.excessWinRate < 0) ||
        (bucket.profitFactor !== null && bucket.profitFactor < 1.05) ||
        (bucket.brierScore !== null && bucket.brierScore > 0.26)
      )
  })
  const hasBothBullish = currentKeys.includes('model_vs_local:bullish_bullish')
  if (weak.length > 0) {
    return {
      status: 'weak',
      weightMultiplier: 0,
      matchedBucketKeys: currentKeys,
      matchedStrongBuckets: strong.map((bucket) => bucket.key),
      matchedWeakBuckets: weak.map((bucket) => bucket.key),
      summary: `命中外部模型弱桶「${weak[0].label}」，本次模型权重降为 0。`,
    }
  }
  if (strong.length > 0 && hasBothBullish) {
    return {
      status: 'strong',
      weightMultiplier: 1,
      matchedBucketKeys: currentKeys,
      matchedStrongBuckets: strong.map((bucket) => bucket.key),
      matchedWeakBuckets: [],
      summary: `命中外部模型强桶「${strong[0].label}」且模型/本地共振，允许低权重加分。`,
    }
  }
  if (matched.some((bucket) => bucket.qualifiedSamples >= MIN_WEIGHTED_SAMPLES)) {
    return {
      status: 'neutral',
      weightMultiplier: 0.35,
      matchedBucketKeys: currentKeys,
      matchedStrongBuckets: strong.map((bucket) => bucket.key),
      matchedWeakBuckets: [],
      summary: '外部模型历史分桶表现中性，仅允许很低权重参考。',
    }
  }
  return {
    status: 'insufficient',
    weightMultiplier: 0,
    matchedBucketKeys: currentKeys,
    matchedStrongBuckets: [],
    matchedWeakBuckets: [],
    summary: '外部模型同类场景样本不足，暂不参与评分放大。',
  }
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
  const barrierPoints = sorted.map((snapshot) => ({ timestamp: snapshot.quoteTimestamp, price: snapshot.price }))
  const allEvaluatedSamples: WalkForwardSample[] = []

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]
    if (current.price <= 0) {
      continue
    }

    const barrierLabel = buildTripleBarrierLabel(barrierPoints, index, {
      horizonMinutes,
      tp1ReturnPercent: 0.01,
      stopLossReturnPercent: -0.01,
    })
    allEvaluatedSamples.push({
      openedAt: current.quoteTimestamp,
      evaluatedAt: barrierLabel.evaluatedAt,
      signalScore: current.signalScore,
      signalLevel: current.signalLevel,
      bucketKey: buildPrimaryBucketKey(current),
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
      failureReason: classifyFailureReason(current, barrierLabel),
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
  const incompleteSampleRate = allEvaluatedSamples.length > 0
    ? allEvaluatedSamples.filter((sample) => sample.complete === false).length / allEvaluatedSamples.length
    : null
  const failureAttribution = buildFailureAttribution(evaluatedSamples)
  const buckets = buildBacktestBuckets(sorted, horizonMinutes, signalThreshold)
  const probabilityMetrics = buildProbabilityMetricsFromSnapshots(sorted)
  const externalModel = buildExternalModelBacktestMonitor(sorted, horizonMinutes)

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
    externalModel,
    failureSamples,
    incompleteSampleRate,
    failureAttribution,
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

function classifyFailureReason(
  snapshot: BacktestSnapshot,
  label: ReturnType<typeof buildTripleBarrierLabel>,
) {
  if (!label.complete) {
    return 'sampling_incomplete'
  }
  if (label.outcome === 'stop_loss_hit') {
    return 'stop_loss_first'
  }
  if (snapshot.eventRiskLevel === 'critical' || snapshot.eventRiskLevel === 'elevated') {
    return 'event_noise'
  }
  if (snapshot.primaryPatternKind && snapshot.signalLevel !== 'none' && snapshot.signalScore < 55) {
    return 'pattern_unconfirmed'
  }
  if (snapshot.macroRegime === 'pressure') {
    return 'macro_pressure'
  }
  if (snapshot.confluenceConflictLevel === 'severe') {
    return 'timeframe_conflict'
  }
  if (snapshot.sourceHealth === 'stale' || snapshot.sourceHealth === 'down') {
    return 'source_health'
  }
  if (label.outcome === 'timeout' || label.outcome === 'no_touch') {
    return 'timeout_or_no_touch'
  }
  if (label.maxDrawdown <= -0.01) {
    return 'adverse_excursion'
  }
  return null
}

function buildFailureAttribution(samples: WalkForwardSample[]) {
  const failures = samples.filter((sample) => {
    return sample.returnPercent < 0 || sample.maxDrawdown <= -0.01 || sample.barrierOutcome === 'stop_loss_hit' || sample.complete === false
  })
  if (failures.length < 1) {
    return []
  }
  const counts = new Map<string, number>()
  for (const sample of failures) {
    const reason = sample.failureReason ?? 'uncategorized'
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: failureReasonLabel(reason),
      count,
      ratio: count / failures.length,
    }))
    .sort((left, right) => right.count - left.count)
}

function failureReasonLabel(reason: string) {
  switch (reason) {
    case 'sampling_incomplete':
      return '采样不完整'
    case 'stop_loss_first':
      return '止损先达'
    case 'event_noise':
      return '事件噪声'
    case 'pattern_unconfirmed':
      return '形态未确认'
    case 'macro_pressure':
      return '宏观反向'
    case 'timeframe_conflict':
      return '周期冲突'
    case 'source_health':
      return '数据源异常'
    case 'timeout_or_no_touch':
      return '超时/未触发'
    case 'adverse_excursion':
      return '最大不利波动'
    default:
      return '未分类失败'
  }
}

function buildExternalModelBacktestMonitor(
  snapshots: BacktestSnapshot[],
  defaultHorizonMinutes: number,
): ExternalModelBacktestMonitor {
  const liveOriginSnapshots = snapshots.filter(isLiveOrigin)
  const buckets = buildExternalModelBuckets(liveOriginSnapshots, defaultHorizonMinutes)
  const liveSnapshots = liveOriginSnapshots.filter((snapshot) => snapshot.externalModelStatus === 'live')
  const liveCoverage = liveOriginSnapshots.length > 0 ? liveSnapshots.length / liveOriginSnapshots.length : null
  const bestBuckets = buckets
    .filter((bucket) => bucket.qualifiedSamples >= MIN_WEIGHTED_SAMPLES && bucket.reliability >= 55 && (bucket.excessWinRate ?? 0) >= 0)
    .sort((left, right) => right.reliability - left.reliability)
    .slice(0, 4)
  const weakBuckets = buckets
    .filter((bucket) => bucket.qualifiedSamples >= MIN_WEIGHTED_SAMPLES && (
      bucket.reliability < 45 ||
      (bucket.excessWinRate !== null && bucket.excessWinRate < 0) ||
      (bucket.profitFactor !== null && bucket.profitFactor < 1.05)
    ))
    .sort((left, right) => left.reliability - right.reliability)
    .slice(0, 4)

  return {
    modelVersion: 'external-ts-foundation-advisor-v1',
    updatedAt: new Date().toISOString(),
    sampleSize: liveOriginSnapshots.length,
    evaluatedSamples: buckets.reduce((max, bucket) => Math.max(max, bucket.qualifiedSamples), 0),
    liveCoverage,
    buckets,
    bestBuckets,
    weakBuckets,
    summary: buildExternalModelSummary(liveOriginSnapshots.length, liveSnapshots.length, buckets, liveCoverage),
  }
}

function isLiveOrigin(snapshot: BacktestSnapshot) {
  return (snapshot.sampleOrigin ?? 'live') === 'live'
}

type ExternalModelSample = WalkForwardSample & {
  baseline: boolean
  modelLive: boolean
  modelProbability: number | null
  modelConfidence: number | null
}

type ExternalModelCandidateSnapshot = Pick<
  ExternalModelAdvisor,
  'status' | 'provider' | 'modelName' | 'horizonMinutes' | 'upProbability' | 'confidence' | 'expectedReturnPercent'
>

function buildExternalModelBuckets(
  snapshots: BacktestSnapshot[],
  defaultHorizonMinutes: number,
): ExternalModelBacktestBucket[] {
  const buckets = new Map<string, ExternalModelSample[]>()
  const barrierPoints = snapshots.map((snapshot) => ({ timestamp: snapshot.quoteTimestamp, price: snapshot.price }))
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const current = snapshots[index]
    const horizonMinutes = current.externalModelHorizonMinutes ?? defaultHorizonMinutes
    if (current.price <= 0) {
      continue
    }

    for (const candidate of getExternalModelCandidates(current)) {
      const candidateHorizonMinutes = candidate.horizonMinutes ?? horizonMinutes
      const barrierLabel = buildTripleBarrierLabel(barrierPoints, index, {
        horizonMinutes: candidateHorizonMinutes,
        tp1ReturnPercent: 0.01,
        stopLossReturnPercent: -0.01,
      })
      const modelProbability = normalizeProbability(candidate.upProbability)
      const modelLive = candidate.status === 'live' && modelProbability !== null
      const candidateSnapshot = {
        ...current,
        externalModelStatus: candidate.status,
        externalModelProvider: candidate.provider,
        externalModelName: candidate.modelName,
        externalModelHorizonMinutes: candidateHorizonMinutes,
        externalModelUpProbability: candidate.upProbability,
        externalModelConfidence: candidate.confidence,
        externalModelExpectedReturnPercent: candidate.expectedReturnPercent,
      }
      const sample: ExternalModelSample = {
        openedAt: current.quoteTimestamp,
        evaluatedAt: barrierLabel.evaluatedAt,
        signalScore: current.signalScore,
        signalLevel: current.signalLevel,
        bucketKey: undefined,
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
        baseline: !modelLive,
        modelLive,
        modelProbability,
        modelConfidence: candidate.confidence ?? null,
      }

      for (const bucket of buildExternalSnapshotBuckets(candidateSnapshot, candidateHorizonMinutes, modelProbability)) {
        const existing = buckets.get(bucket.key) ?? []
        existing.push({ ...sample, bucketKey: bucket.key })
        buckets.set(bucket.key, existing)
      }
    }
  }

  return [...buckets.entries()]
    .map(([key, samples]) => summarizeExternalModelBucket(key, samples))
    .filter((bucket) => bucket.sampleSize >= 2)
    .sort((left, right) => {
      if (right.qualifiedSamples !== left.qualifiedSamples) {
        return right.qualifiedSamples - left.qualifiedSamples
      }
      return right.reliability - left.reliability
    })
    .slice(0, 18)
}

function getExternalModelCandidates(snapshot: BacktestSnapshot): ExternalModelCandidateSnapshot[] {
  if (snapshot.externalModelCandidates && snapshot.externalModelCandidates.length > 0) {
    return snapshot.externalModelCandidates.map((candidate) => ({
      status: candidate.status,
      provider: candidate.provider,
      modelName: candidate.modelName,
      horizonMinutes: candidate.horizonMinutes,
      upProbability: candidate.upProbability,
      confidence: candidate.confidence,
      expectedReturnPercent: candidate.expectedReturnPercent,
    }))
  }
  return [{
    status: snapshot.externalModelStatus ?? 'unconfigured',
    provider: snapshot.externalModelProvider ?? 'disabled',
    modelName: snapshot.externalModelName ?? 'unknown',
    horizonMinutes: snapshot.externalModelHorizonMinutes ?? 60,
    upProbability: snapshot.externalModelUpProbability ?? null,
    confidence: snapshot.externalModelConfidence ?? 0,
    expectedReturnPercent: snapshot.externalModelExpectedReturnPercent ?? null,
  }]
}

function buildExternalSnapshotBuckets(
  snapshot: BacktestSnapshot,
  horizonMinutes: number,
  modelProbability: number | null,
) {
  const localProbability = normalizeProbability(snapshot.modelProbability)
  const buckets: Array<{
    key: string
    label: string
    dimension: ExternalModelBucketDimension
  }> = [
    {
      key: `external_probability:${probabilityBand(modelProbability)}`,
      label: `模型概率：${probabilityBandLabel(modelProbability)}`,
      dimension: 'model_probability',
    },
    {
      key: `external_confidence:${confidenceBand(snapshot.externalModelConfidence ?? null)}`,
      label: `模型置信：${confidenceBandLabel(snapshot.externalModelConfidence ?? null)}`,
      dimension: 'model_confidence',
    },
    {
      key: `model_vs_local:${modelVsLocalBand(modelProbability, localProbability)}`,
      label: `模型/本地：${modelVsLocalLabel(modelProbability, localProbability)}`,
      dimension: 'model_vs_local',
    },
    {
      key: `session:${sessionName(snapshot.quoteTimestamp)}`,
      label: `交易时段：${sessionLabel(snapshot.quoteTimestamp)}`,
      dimension: 'session',
    },
    {
      key: `event:${snapshot.eventRiskLevel ?? 'unknown'}`,
      label: `事件窗口：${eventRiskLabel(snapshot.eventRiskLevel)}`,
      dimension: 'event',
    },
    {
      key: `confluence:${snapshot.confluenceConflictLevel ?? 'unknown'}`,
      label: `周期冲突：${confluenceConflictLabel(snapshot.confluenceConflictLevel)}`,
      dimension: 'confluence',
    },
    {
      key: `macro:${snapshot.macroRegime ?? 'unknown'}`,
      label: `宏观环境：${macroRegimeLabel(snapshot.macroRegime)}`,
      dimension: 'macro',
    },
    {
      key: `valuation:${valuationBand(snapshot.valuation.pricePercentile)}`,
      label: `估值水位：${valuationBandLabel(snapshot.valuation.pricePercentile)}`,
      dimension: 'valuation',
    },
    {
      key: `source_health:${snapshot.sourceHealth ?? 'unknown'}`,
      label: `数据源：${sourceHealthLabel(snapshot.sourceHealth)}`,
      dimension: 'source_health',
    },
    {
      key: `horizon:${horizonMinutes}`,
      label: `预测周期：${horizonMinutes}分钟`,
      dimension: 'horizon',
    },
    {
      key: `provider:${snapshot.externalModelProvider ?? 'unknown'}`,
      label: `模型供应商：${providerLabel(snapshot.externalModelProvider)}`,
      dimension: 'provider',
    },
  ]
  buckets.push({
    key: `pattern:${snapshot.primaryPatternKind ?? 'no_pattern'}`,
    label: `形态：${snapshot.primaryPatternKind ?? '无明确形态'}`,
    dimension: 'pattern',
  })
  return buckets
}

function summarizeExternalModelBucket(
  key: string,
  samples: ExternalModelSample[],
): ExternalModelBacktestBucket {
  const [rawDimension] = key.split(':')
  const dimension = normalizeExternalDimension(rawDimension)
  const qualified = samples.filter((sample) => sample.modelLive)
  const returns = qualified.map((sample) => sample.returnPercent)
  const baselineReturns = samples.map((sample) => sample.returnPercent)
  const winRate = returns.length > 0 ? returns.filter((value) => value > 0).length / returns.length : null
  const baselineWinRate = baselineReturns.length > 0
    ? baselineReturns.filter((value) => value > 0).length / baselineReturns.length
    : null
  const averageReturn = average(returns)
  const medianReturn = median(returns)
  const profitFactor = calculateProfitFactor(returns)
  const maxDrawdown = qualified.length > 0 ? Math.min(...qualified.map((sample) => sample.maxDrawdown)) : null
  const mae = qualified.length > 0 ? average(qualified.map((sample) => sample.maxDrawdown)) : null
  const mfe = qualified.length > 0
    ? average(qualified.map((sample) => sample.maxFavorableExcursion ?? 0))
    : null
  const mfeMaeRatio = mfe !== null && mae !== null && mae < 0 ? mfe / Math.abs(mae) : null
  const brierScore = calculateBrierScore(qualified)
  const averageProbability = average(qualified
    .map((sample) => sample.modelProbability)
    .filter((value): value is number => value !== null))
  const calibrationError = winRate !== null && averageProbability !== null
    ? Math.abs(winRate - averageProbability)
    : null
  const excessWinRate = winRate !== null && baselineWinRate !== null ? winRate - baselineWinRate : null
  const reliability = calculateExternalReliability({
    qualifiedSamples: qualified.length,
    winRate,
    baselineWinRate,
    brierScore,
    calibrationError,
    profitFactor,
    maxDrawdown,
    liveCoverage: samples.length > 0 ? qualified.length / samples.length : null,
  })
  const label = externalBucketLabelFromKey(key)
  const horizonMinutes = extractHorizonMinutes(samples, key)

  return {
    key,
    label,
    dimension,
    horizonMinutes,
    sampleSize: samples.length,
    qualifiedSamples: qualified.length,
    winRate,
    baselineWinRate,
    excessWinRate,
    averageReturn,
    medianReturn,
    expectancy: averageReturn,
    profitFactor,
    maxDrawdown,
    mae,
    mfe,
    mfeMaeRatio,
    brierScore,
    calibrationError,
    reliability,
    summary: `${label}：模型合格 ${qualified.length}/${samples.length}，胜率 ${formatPercent(winRate)}，超额 ${formatPercent(excessWinRate)}，PF ${formatRatio(profitFactor)}，Brier ${formatRatio(brierScore)}，可信 ${reliability}/100。`,
  }
}

function buildExternalModelSummary(
  snapshotCount: number,
  liveCount: number,
  buckets: ExternalModelBacktestBucket[],
  liveCoverage: number | null,
) {
  if (snapshotCount < 3) {
    return '外部模型回测样本不足，暂不能判断 Chronos/TimesFM/Moirai 军师是否有效。'
  }
  if (liveCount < 3) {
    return `外部模型 live 样本 ${liveCount}/${snapshotCount}，覆盖率 ${formatPercent(liveCoverage)}，目前只展示不参与强信号放大。`
  }
  const top = buckets
    .filter((bucket) => bucket.qualifiedSamples >= 3)
    .sort((left, right) => right.reliability - left.reliability)[0]
  if (!top) {
    return `外部模型 live 样本 ${liveCount}/${snapshotCount}，但分桶样本仍不足，继续积累后再评估权重。`
  }
  return `外部模型分桶回测已启用，live 覆盖率 ${formatPercent(liveCoverage)}；最佳桶「${top.label}」胜率 ${formatPercent(top.winRate)}，超额 ${formatPercent(top.excessWinRate)}，可信 ${top.reliability}/100。`
}

function normalizeProbability(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return value > 1 ? clamp(value / 100, 0.01, 0.99) : clamp(value, 0.01, 0.99)
}

function probabilityBand(probability: number | null) {
  if (probability === null) {
    return 'unknown'
  }
  if (probability < 0.4) {
    return 'p00_40'
  }
  if (probability < 0.5) {
    return 'p40_50'
  }
  if (probability < 0.55) {
    return 'p50_55'
  }
  if (probability < 0.6) {
    return 'p55_60'
  }
  if (probability < 0.65) {
    return 'p60_65'
  }
  if (probability < 0.7) {
    return 'p65_70'
  }
  return 'p70_plus'
}

function probabilityBandLabel(probability: number | null) {
  return probabilityBandLabelFromBand(probabilityBand(probability))
}

function probabilityBandLabelFromBand(band: string | undefined) {
  const labels: Record<string, string> = {
    p00_40: '0-40%',
    p40_50: '40-50%',
    p50_55: '50-55%',
    p55_60: '55-60%',
    p60_65: '60-65%',
    p65_70: '65-70%',
    p70_plus: '70%+',
    unknown: '未知',
  }
  return labels[band ?? 'unknown'] ?? '未知'
}

function confidenceBand(confidence: number | null) {
  if (confidence === null || !Number.isFinite(confidence)) {
    return 'unknown'
  }
  if (confidence < 40) {
    return 'c00_40'
  }
  if (confidence < 60) {
    return 'c40_60'
  }
  if (confidence < 75) {
    return 'c60_75'
  }
  return 'c75_plus'
}

function confidenceBandLabel(confidence: number | null) {
  const labels: Record<string, string> = {
    c00_40: '0-40',
    c40_60: '40-60',
    c60_75: '60-75',
    c75_plus: '75+',
    unknown: '未知',
  }
  return labels[confidenceBand(confidence)] ?? '未知'
}

function modelVsLocalBand(modelProbability: number | null, localProbability: number | null) {
  const model = probabilityBias(modelProbability)
  const local = probabilityBias(localProbability)
  return `${model}_${local}`
}

function modelVsLocalLabel(modelProbability: number | null, localProbability: number | null) {
  const labels: Record<string, string> = {
    bullish_bullish: '模型看多 + 本地看多',
    bullish_neutral: '模型看多 + 本地中性',
    bullish_bearish: '模型看多 + 本地谨慎',
    neutral_bullish: '模型中性 + 本地看多',
    neutral_neutral: '模型中性 + 本地中性',
    neutral_bearish: '模型中性 + 本地谨慎',
    bearish_bullish: '模型谨慎 + 本地看多',
    bearish_neutral: '模型谨慎 + 本地中性',
    bearish_bearish: '模型谨慎 + 本地谨慎',
  }
  return labels[modelVsLocalBand(modelProbability, localProbability)] ?? '未知共振'
}

function probabilityBias(probability: number | null) {
  if (probability === null) {
    return 'neutral'
  }
  if (probability >= 0.58) {
    return 'bullish'
  }
  if (probability <= 0.46) {
    return 'bearish'
  }
  return 'neutral'
}

function eventRiskLabel(level: string | null | undefined) {
  if (level === 'none') {
    return '无事件'
  }
  if (level === 'watch') {
    return '事件观察'
  }
  if (level === 'elevated') {
    return '事件升高'
  }
  if (level === 'critical') {
    return '高危事件'
  }
  return '未知'
}

function sourceHealthLabel(health: string | null | undefined) {
  if (health === 'healthy') {
    return '健康'
  }
  if (health === 'stale') {
    return '陈旧'
  }
  if (health === 'down') {
    return '失败'
  }
  return '未知'
}

function normalizeExternalDimension(value: string): ExternalModelBucketDimension {
  if (value === 'external_probability') {
    return 'model_probability'
  }
  if (value === 'external_confidence') {
    return 'model_confidence'
  }
  if (
    value === 'model_vs_local' ||
    value === 'session' ||
    value === 'pattern' ||
    value === 'event' ||
    value === 'confluence' ||
    value === 'macro' ||
    value === 'valuation' ||
    value === 'source_health' ||
    value === 'horizon' ||
    value === 'provider'
  ) {
    return value
  }
  return 'model_probability'
}

function calculateBrierScore(samples: ExternalModelSample[]) {
  const scored = samples.filter((sample) => sample.modelProbability !== null)
  if (scored.length < 1) {
    return null
  }
  return average(scored.map((sample) => {
    const outcome = sample.returnPercent > 0 ? 1 : 0
    return ((sample.modelProbability ?? 0.5) - outcome) ** 2
  }))
}

function calculateExternalReliability(input: {
  qualifiedSamples: number
  winRate: number | null
  baselineWinRate: number | null
  brierScore: number | null
  calibrationError: number | null
  profitFactor: number | null
  maxDrawdown: number | null
  liveCoverage: number | null
}) {
  if (input.qualifiedSamples < 3 || input.winRate === null) {
    return 24
  }
  const sampleScore = Math.min(25, input.qualifiedSamples * 3)
  const calibrationScore = input.brierScore === null
    ? 8
    : Math.max(0, 25 - input.brierScore * 90 - (input.calibrationError ?? 0) * 25)
  const profitFactorScore = input.profitFactor === null
    ? 0
    : Math.min(20, Math.max(0, (input.profitFactor - 1) * 18))
  const excessWinRate = input.baselineWinRate === null ? 0 : input.winRate - input.baselineWinRate
  const excessScore = Math.min(15, Math.max(0, excessWinRate * 80))
  const drawdownScore = input.maxDrawdown === null ? 5 : Math.max(0, 10 + input.maxDrawdown * 420)
  const coverageScore = Math.min(5, Math.max(0, (input.liveCoverage ?? 0) * 5))
  return Math.round(clamp(sampleScore + calibrationScore + profitFactorScore + excessScore + drawdownScore + coverageScore, 0, 92))
}

function externalBucketLabelFromKey(key: string) {
  const [, value] = key.split(':')
  if (key.startsWith('external_probability:')) {
    return `模型概率：${probabilityBandLabelFromBand(value)}`
  }
  if (key.startsWith('external_confidence:')) {
    return `模型置信：${value}`
  }
  if (key.startsWith('model_vs_local:')) {
    return `模型/本地：${modelVsLocalLabelFromBand(value)}`
  }
  if (key.startsWith('session:')) {
    return `交易时段：${sessionNameLabel(value)}`
  }
  if (key.startsWith('event:')) {
    return `事件窗口：${eventRiskLabel(value)}`
  }
  if (key.startsWith('confluence:')) {
    return `周期冲突：${confluenceConflictLabel(value)}`
  }
  if (key.startsWith('macro:')) {
    return `宏观环境：${macroRegimeLabel(value)}`
  }
  if (key.startsWith('valuation:')) {
    return `估值水位：${valuationBandLabelFromBand(value)}`
  }
  if (key.startsWith('source_health:')) {
    return `数据源：${sourceHealthLabel(value)}`
  }
  if (key.startsWith('horizon:')) {
    return `预测周期：${value}分钟`
  }
  if (key.startsWith('provider:')) {
    return `模型供应商：${providerLabel(value)}`
  }
  if (key.startsWith('pattern:')) {
    return `形态：${value === 'no_pattern' ? '无明确形态' : value}`
  }
  return key
}

function providerLabel(provider: string | null | undefined) {
  if (provider === 'chronos') {
    return 'Chronos'
  }
  if (provider === 'timesfm') {
    return 'TimesFM'
  }
  if (provider === 'moirai') {
    return 'Moirai'
  }
  if (provider === 'lag-llama') {
    return 'Lag-Llama'
  }
  if (provider === 'custom') {
    return '自定义'
  }
  return '未知'
}

function modelVsLocalLabelFromBand(value: string | undefined) {
  const labels: Record<string, string> = {
    bullish_bullish: '模型看多 + 本地看多',
    bullish_neutral: '模型看多 + 本地中性',
    bullish_bearish: '模型看多 + 本地谨慎',
    neutral_bullish: '模型中性 + 本地看多',
    neutral_neutral: '模型中性 + 本地中性',
    neutral_bearish: '模型中性 + 本地谨慎',
    bearish_bullish: '模型谨慎 + 本地看多',
    bearish_neutral: '模型谨慎 + 本地中性',
    bearish_bearish: '模型谨慎 + 本地谨慎',
  }
  return labels[value ?? ''] ?? '未知共振'
}

function extractHorizonMinutes(samples: ExternalModelSample[], key: string) {
  if (key.startsWith('horizon:')) {
    const parsed = Number(key.split(':')[1])
    return Number.isFinite(parsed) ? parsed : 60
  }
  const openedAt = samples[0]?.openedAt
  const evaluatedAt = samples[0]?.evaluatedAt
  if (!openedAt || !evaluatedAt) {
    return 60
  }
  return Math.round((new Date(evaluatedAt).getTime() - new Date(openedAt).getTime()) / 60000)
}

function buildBacktestBuckets(
  snapshots: BacktestSnapshot[],
  horizonMinutes: number,
  signalThreshold: number,
): BacktestBucket[] {
  const buckets = new Map<string, Array<WalkForwardSample & { baseline: boolean }>>()
  const barrierPoints = snapshots.map((snapshot) => ({ timestamp: snapshot.quoteTimestamp, price: snapshot.price }))
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const current = snapshots[index]
    if (current.price <= 0) {
      continue
    }

    const barrierLabel = buildTripleBarrierLabel(barrierPoints, index, {
      horizonMinutes,
      tp1ReturnPercent: 0.01,
      stopLossReturnPercent: -0.01,
    })
    const sample: WalkForwardSample & { baseline: boolean } = {
      openedAt: current.quoteTimestamp,
      evaluatedAt: barrierLabel.evaluatedAt,
      signalScore: current.signalScore,
      signalLevel: current.signalLevel,
      bucketKey: buildPrimaryBucketKey(current),
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
      failureReason: classifyFailureReason(current, barrierLabel),
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
      key: `macro_regime:${snapshot.macroRegimeEvidenceStatus ?? snapshot.macroRegime ?? 'unknown'}`,
      label: `宏观 regime：${macroRegimeLabel(snapshot.macroRegimeEvidenceStatus ?? snapshot.macroRegime)}`,
      dimension: 'macro_regime' as const,
    },
    {
      key: `inflation_phase:${snapshot.inflationPhase ?? 'unknown'}`,
      label: `通胀阶段：${inflationPhaseLabel(snapshot.inflationPhase)}`,
      dimension: 'inflation_phase' as const,
    },
    {
      key: `real_rate_trend:${snapshot.realRateTrend ?? 'unknown'}`,
      label: `实际利率趋势：${realRateTrendLabel(snapshot.realRateTrend)}`,
      dimension: 'real_rate_trend' as const,
    },
    {
      key: `usd_cny_alignment:${snapshot.usdCnyAlignment ?? 'unknown'}`,
      label: `人民币金价汇率环境：${usdCnyAlignmentLabel(snapshot.usdCnyAlignment)}`,
      dimension: 'usd_cny_alignment' as const,
    },
    {
      key: `cme_breakout_quality:${snapshot.cmeBreakoutQuality ?? 'unknown'}`,
      label: `CME 突破质量：${cmeBreakoutQualityLabel(snapshot.cmeBreakoutQuality)}`,
      dimension: 'cme_breakout_quality' as const,
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
  const completeQualified = qualified.filter((sample) => sample.complete !== false)
  const completeSamples = samples.filter((sample) => sample.complete !== false)
  const returns = completeQualified.map((sample) => sample.returnPercent)
  const baselineReturns = completeSamples.map((sample) => sample.returnPercent)
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
  const tp1HitRate = outcomeRate(qualified, 'tp1_hit')
  const stopLossHitRate = outcomeRate(qualified, 'stop_loss_hit')
  const noTouchRate = outcomeRate(qualified, 'no_touch')
  const timeoutRate = outcomeRate(qualified, 'timeout')
  const incompleteRate = samples.length > 0
    ? samples.filter((sample) => sample.complete === false).length / samples.length
    : null
  const reliability = calculateReliability(completeQualified.length, winRate, profitFactor)
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
    tp1HitRate,
    stopLossHitRate,
    noTouchRate,
    timeoutRate,
    incompleteRate,
    reliability,
    summary: `${label}：合格 ${qualified.length}/${samples.length}，完整样本 ${completeQualified.length}，TP1 ${formatPercent(tp1HitRate)}，止损 ${formatPercent(stopLossHitRate)}，未完成 ${formatPercent(incompleteRate)}，PF ${formatRatio(profitFactor)}，MAE ${formatPercent(mae)}，MFE ${formatPercent(mfe)}。`,
  }
}

function outcomeRate(samples: WalkForwardSample[], outcome: NonNullable<WalkForwardSample['barrierOutcome']>) {
  if (samples.length === 0) {
    return null
  }
  return samples.filter((sample) => sample.barrierOutcome === outcome).length / samples.length
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
  if (key.startsWith('macro_regime:')) {
    return `宏观 regime：${macroRegimeLabel(value)}`
  }
  if (key.startsWith('inflation_phase:')) {
    return `通胀阶段：${inflationPhaseLabel(value)}`
  }
  if (key.startsWith('real_rate_trend:')) {
    return `实际利率趋势：${realRateTrendLabel(value)}`
  }
  if (key.startsWith('usd_cny_alignment:')) {
    return `人民币金价汇率环境：${usdCnyAlignmentLabel(value)}`
  }
  if (key.startsWith('cme_breakout_quality:')) {
    return `CME 突破质量：${cmeBreakoutQualityLabel(value)}`
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

function inflationPhaseLabel(phase: string | null | undefined) {
  if (phase === 'accelerating') {
    return '通胀再加速'
  }
  if (phase === 'sticky') {
    return '核心通胀粘性'
  }
  if (phase === 'cooling') {
    return '通胀降温'
  }
  return '未知'
}

function realRateTrendLabel(trend: string | null | undefined) {
  if (trend === 'rising') {
    return '上行压制'
  }
  if (trend === 'falling') {
    return '回落支持'
  }
  if (trend === 'flat') {
    return '横盘中性'
  }
  return '未知'
}

function usdCnyAlignmentLabel(alignment: string | null | undefined) {
  if (alignment === 'cny_gold_support') {
    return '汇率支撑人民币金'
  }
  if (alignment === 'cny_gold_pressure') {
    return '汇率压制人民币金'
  }
  if (alignment === 'neutral') {
    return '中性'
  }
  return '未知'
}

function cmeBreakoutQualityLabel(quality: string | null | undefined) {
  if (quality === 'confirmed') {
    return 'OI/Volume 确认'
  }
  if (quality === 'not_confirmed') {
    return 'OI/Volume 未确认'
  }
  if (quality === 'unavailable') {
    return '不可用'
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

function median(values: number[]) {
  if (values.length < 1) {
    return null
  }
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  const raw = Math.round(Math.min(88, 28 + sampleScore + winScore + profitScore))
  return evaluatedSamples < MIN_WEIGHTED_SAMPLES ? Math.min(raw, 49) : raw
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
