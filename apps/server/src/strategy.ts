import { buildTechnicalSnapshot, type TechnicalSnapshot } from './technicals.js'
import { buildEconomicEventRisk } from './event-risk.js'
import {
  extractProbabilityFeatures,
  predictProbabilityModel,
} from './model.js'
import type {
  EconomicEventRisk,
  ExpertAction,
  ExpertConsensus,
  ExpertOpinion,
  ExternalModelAdvisor,
  HistoryPoint,
  MarketContext,
  MultiTimeframeConfluence,
  OpportunitySignal,
  PatternSignal,
  ProbabilityPrediction,
  PsychologyDiscipline,
  PsychologyRiskFlag,
  QuoteApiResponse,
  QuoteSample,
  SourceStatus,
  TimeframeBias,
  TimeframeConfluence,
  TradePlan,
  ValuationMetrics,
} from './types.js'

export function buildOpportunitySignal(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
  stats: QuoteApiResponse['stats24h'],
  sourceStatus: SourceStatus,
  marketContext?: MarketContext,
  patternSignals: PatternSignal[] = [],
  externalModelAdvisor: ExternalModelAdvisor | null = null,
): OpportunitySignal {
  const technicals = buildTechnicalSnapshot(history, latestQuote)
  return evaluateOpportunity({
    history,
    latestQuote,
    stats,
    sourceStatus,
    technicals,
    marketContext: marketContext ?? buildNeutralMarketContext(),
    patternSignals,
    externalModelAdvisor,
  })
}

export function evaluateOpportunity(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  stats: QuoteApiResponse['stats24h']
  sourceStatus: SourceStatus
  technicals: TechnicalSnapshot
  marketContext?: MarketContext
  patternSignals?: PatternSignal[]
  externalModelAdvisor?: ExternalModelAdvisor | null
}): OpportunitySignal {
  const {
    history,
    latestQuote,
    marketContext = buildNeutralMarketContext(),
    stats,
    sourceStatus,
    technicals,
    patternSignals = [],
    externalModelAdvisor = null,
  } = input
  const reasons: string[] = []
  const risks: string[] = []
  let score = 0
  let scoreCap = 100
  const valuation = buildValuationMetrics(history, latestQuote)
  const confluence = buildMultiTimeframeConfluence(history, latestQuote)
  const eventRisk = buildEconomicEventRisk(latestQuote.fetchedAt)
  const probabilityModel = predictProbabilityModel({
    features: extractProbabilityFeatures({
      history,
      latestQuote,
      stats,
      marketContext,
      technicals,
      patternSignals,
      confluence,
    }),
  })

  const rangeSpan = stats.high24h - stats.low24h
  const positionFromLow =
    rangeSpan > 0 ? clamp((stats.currentPrice - stats.low24h) / rangeSpan, 0, 1) : null

  if (positionFromLow === null) {
    risks.push('近 24 小时价格区间不足，低位判断样本有限。')
    scoreCap = Math.min(scoreCap, 64)
  } else if (positionFromLow <= 0.15) {
    score += 24
    reasons.push('当前价格贴近近 24 小时低位，具备低位观察条件。')
  } else if (positionFromLow <= 0.3) {
    score += 18
    reasons.push('当前价格处在近 24 小时区间偏低位置。')
  } else if (positionFromLow <= 0.5) {
    score += 10
    reasons.push('当前价格仍位于近 24 小时区间中下部。')
  } else if (positionFromLow >= 0.75) {
    risks.push('当前价格已靠近近 24 小时高位，避免把追高误判为买点。')
    scoreCap = Math.min(scoreCap, 42)
  } else {
    risks.push('当前价格距离近 24 小时低位仍有空间，低位优势不明显。')
    scoreCap = Math.min(scoreCap, 68)
  }

  if (stats.drawdownPercent24h >= 0.018) {
    score += 18
    reasons.push(`相对近 24 小时高点回撤 ${formatPercent(stats.drawdownPercent24h)}，回落幅度较充分。`)
  } else if (stats.drawdownPercent24h >= 0.012) {
    score += 14
    reasons.push(`相对近 24 小时高点回撤 ${formatPercent(stats.drawdownPercent24h)}，进入观察回撤区。`)
  } else if (stats.drawdownPercent24h >= 0.006) {
    score += 8
    reasons.push(`相对近 24 小时高点已有 ${formatPercent(stats.drawdownPercent24h)} 回撤。`)
  } else {
    risks.push('近 24 小时回撤不深，价格安全垫有限。')
  }

  score += scoreValuationMetrics(valuation, reasons, risks)
  if (valuation.pricePercentile !== null && valuation.pricePercentile >= 0.75) {
    scoreCap = Math.min(scoreCap, 58)
  }
  if (valuation.sharpeRatio !== null && valuation.sharpeRatio < -0.6) {
    scoreCap = Math.min(scoreCap, 66)
  }

  if (stats.percentChange24h <= -0.012) {
    score += 10
    reasons.push(`近 24 小时跌幅 ${formatPercent(Math.abs(stats.percentChange24h))}，存在回落后的观察窗口。`)
  } else if (stats.percentChange24h <= -0.004) {
    score += 6
    reasons.push('近 24 小时价格小幅回落，未处于明显追涨状态。')
  } else if (stats.percentChange24h >= 0.012) {
    risks.push(`近 24 小时涨幅 ${formatPercent(stats.percentChange24h)}，追高风险上升。`)
    scoreCap = Math.min(scoreCap, 48)
  }

  score += scoreTechnicalConditions(technicals, latestQuote.price, reasons, risks)
  scoreCap = applyTechnicalCaps(technicals, scoreCap, risks)

  const calibration = latestQuote.marketReference.calibration
  const premiumPercent = calibration.premiumPercent
  if (premiumPercent === null) {
    risks.push('缺少上金所参考锚点，无法确认相对锚点折溢价。')
    scoreCap = Math.min(scoreCap, 72)
  } else if (premiumPercent <= -0.002) {
    score += 18
    reasons.push(`相对上金所${calibration.anchorSymbol ?? '参考锚'}折价 ${formatPercent(Math.abs(premiumPercent))}。`)
  } else if (premiumPercent <= 0.006) {
    score += 15
    reasons.push('相对上金所参考锚点偏离较低，锚点校准通过。')
  } else if (premiumPercent <= 0.012) {
    score += 9
    reasons.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，仍在温和区间。`)
  } else if (premiumPercent <= 0.02) {
    score += 3
    risks.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，买点质量打折。`)
    scoreCap = Math.min(scoreCap, 68)
  } else {
    risks.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，暂不适合标记为强买点观察。`)
    scoreCap = Math.min(scoreCap, 44)
  }

  if (calibration.withinReferenceRange === false) {
    risks.push('当前价格超出上金所参考区间的宽容范围，锚点一致性偏弱。')
    scoreCap = Math.min(scoreCap, 52)
  }

  const shortTerm = analyzeShortTerm(history, latestQuote)
  if (shortTerm.pointCount < 3) {
    risks.push('短线历史点不足，止跌/反弹确认度有限。')
    scoreCap = Math.min(scoreCap, 62)
  } else if (shortTerm.reboundPercent >= 0.001 && shortTerm.lastMovePercent >= 0) {
    score += 16
    reasons.push(`短线自近期低点反弹 ${formatPercent(shortTerm.reboundPercent)}，出现止跌迹象。`)
  } else if (shortTerm.lastMovePercent >= 0 && stats.percentChange24h < 0) {
    score += 10
    reasons.push('下跌后最新报价未继续走低，短线有企稳迹象。')
  } else {
    risks.push('短线仍未确认止跌，可能继续惯性下探。')
    scoreCap = Math.min(scoreCap, 70)
  }

  const activeChannel = getActiveChannelStatus(sourceStatus)
  if (!sourceStatus.stale && activeChannel?.status === 'healthy') {
    score += 12
    reasons.push('当前报价数据源健康且未陈旧。')
  } else {
    risks.push('报价数据源状态不佳或数据已陈旧，信号需要降级处理。')
    scoreCap = Math.min(scoreCap, 40)
  }

  if (sourceStatus.active === 'fallback') {
    risks.push('当前使用备用数据源，建议等待官方源恢复后再复核。')
    scoreCap = Math.min(scoreCap, 76)
  }

  const factorAdjustment = scoreMarketContext(marketContext, reasons, risks)
  score += factorAdjustment
  if (marketContext.factorScore <= 38) {
    scoreCap = Math.min(scoreCap, 66)
  }
  const criticalProviderFailures = getCriticalProviderFailures(marketContext)
  if (criticalProviderFailures.length > 0) {
    risks.push(`关键专业源不可用：${criticalProviderFailures.map((item) => item.label).join('、')}，强买点自动降级。`)
    scoreCap = Math.min(scoreCap, criticalProviderFailures.length >= 3 ? 52 : 64)
    score -= Math.min(18, criticalProviderFailures.length * 6)
  }

  score += scorePatternSignals(patternSignals, reasons, risks)
  score += scoreMultiTimeframeConfluence(confluence, reasons, risks)
  if (confluence.conflictLevel === 'severe') {
    scoreCap = Math.min(scoreCap, 58)
  }

  score -= eventRisk.scorePenalty
  scoreCap = Math.min(scoreCap, eventRisk.scoreCap)
  if (eventRisk.level === 'critical' || eventRisk.level === 'elevated') {
    risks.push(`重大事件风控：${eventRisk.summary} 强信号和仓位自动降级。`)
  } else if (eventRisk.level === 'watch') {
    risks.push(`事件观察：${eventRisk.summary}`)
  }
  for (const warning of eventRisk.warnings) {
    risks.push(warning)
  }

  risks.push('该信号仅用于行情观察，不构成投资建议、收益承诺或买入指令。')

  const ruleCappedScore = Math.round(clamp(Math.min(score, scoreCap), 0, 100))
  const prePlanScore = applyProbabilityModelAdjustment(
    ruleCappedScore,
    scoreCap,
    probabilityModel.primaryPrediction,
    externalModelAdvisor,
    reasons,
    risks,
  )
  const tradePlan = buildTradePlan({
    finalScore: prePlanScore,
    latestQuote,
    marketContext,
    patternSignals,
    shortTerm,
    sourceStatus,
    stats,
    technicals,
    valuation,
    eventRisk,
  })
  const planScoreCap = tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2
    ? scoreCap
    : Math.min(scoreCap, 66)
  if (tradePlan.riskRewardRatio === null || tradePlan.riskRewardRatio < 2) {
    risks.push('交易计划风险收益比不足 2:1，禁止放大为强买点。')
  }
  if (tradePlan.action === 'stand_aside' || tradePlan.action === 'take_profit_or_reduce') {
    risks.push(`交易计划建议「${tradePlan.actionLabel}」，当前不适合主动加仓。`)
  }
  const psychology = buildPsychologyDiscipline({
    confluence,
    eventRisk,
    finalScore: prePlanScore,
    patternSignals,
    positionFromLow,
    stats,
    tradePlan,
    valuation,
  })
  if (psychology.action !== 'allow_plan') {
    risks.push(`心理纪律官：${psychology.summary}`)
  }
  const psychologyScoreCap = psychology.action === 'stand_down' || psychology.action === 'review_only'
    ? 58
    : psychology.action === 'reduce_size'
      ? 68
      : 100
  const finalScore = Math.round(clamp(Math.min(prePlanScore, planScoreCap, psychologyScoreCap), 0, 100))
  const level = finalScore >= 72 && tradePlan.confidence !== 'low' ? 'strong' : finalScore >= 45 ? 'watch' : 'none'
  const expertOpinions = buildExpertOpinions({
    externalModelAdvisor,
    finalScore,
    history,
    latestQuote,
    marketContext,
    positionFromLow,
    shortTerm,
    sourceStatus,
    stats,
    technicals,
  })
  const expertConsensus = buildExpertConsensus(expertOpinions)

  return {
    score: finalScore,
    level,
    triggered: level !== 'none',
    title: buildOpportunityTitle(level),
    summary: buildOpportunitySummary(level),
    reasons,
    risks,
    expertOpinions,
    expertConsensus,
    externalModelAdvisor,
    marketContext,
    valuation,
    patternSignals,
    probabilityModel,
    tradePlan,
    confluence,
    eventRisk,
    psychology,
    computedAt: new Date().toISOString(),
  }
}

function buildValuationMetrics(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
): ValuationMetrics {
  const latestPoint = quoteToHistoryPoint(latestQuote)
  const sorted = dedupeHistoryByTimestamp([...history, latestPoint].sort(sortByTime))
  const latestMs = new Date(latestQuote.fetchedAt).getTime()
  const lookbackHours = 24 * 14
  const lookbackMs = lookbackHours * 60 * 60 * 1000
  const window = sorted.filter((point) => {
    const timestampMs = new Date(point.timestamp).getTime()
    return Number.isFinite(timestampMs) && latestMs - timestampMs <= lookbackMs
  })
  const points = window.length >= 8 ? window : sorted
  const prices = points.map((point) => point.price).filter((price) => Number.isFinite(price) && price > 0)
  const sampleSize = prices.length

  if (sampleSize < 4) {
    return {
      score: 50,
      sampleSize,
      lookbackHours,
      pricePercentile: null,
      distanceFromLow: null,
      distanceFromHigh: null,
      averageReturn: null,
      volatility: null,
      sharpeRatio: null,
      sortinoRatio: null,
      informationRatio: null,
      maxDrawdown: null,
      summary: '多周期样本不足，估值水位暂按中性处理。',
    }
  }

  const currentPrice = latestQuote.price
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const priceRange = high - low
  const lowerOrEqualCount = prices.filter((price) => price <= currentPrice).length
  const pricePercentile = lowerOrEqualCount / sampleSize
  const distanceFromLow = low > 0 ? (currentPrice - low) / low : null
  const distanceFromHigh = high > 0 ? (currentPrice - high) / high : null
  const returns = buildReturns(prices)
  const averageReturn = returns.length > 0
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null
  const volatility = standardDeviation(returns)
  const downsideReturns = returns.filter((value) => value < 0)
  const downsideDeviation = standardDeviation(downsideReturns)
  const sharpeRatio = averageReturn !== null && volatility !== null && volatility > 0
    ? averageReturn / volatility
    : null
  const sortinoRatio = averageReturn !== null && downsideDeviation !== null && downsideDeviation > 0
    ? averageReturn / downsideDeviation
    : null
  const benchmarkReturn = returns.length > 0 ? 0 : null
  const trackingDiff = benchmarkReturn === null ? [] : returns.map((value) => value - benchmarkReturn)
  const trackingError = standardDeviation(trackingDiff)
  const informationRatio = averageReturn !== null && trackingError !== null && trackingError > 0
    ? averageReturn / trackingError
    : null
  const maxDrawdown = calculateMaxDrawdown(prices)
  const rangeScore = priceRange > 0 ? clamp(100 - pricePercentile * 100, 0, 100) : 50
  const drawdownSupport = maxDrawdown !== null ? clamp(Math.abs(maxDrawdown) * 900, 0, 18) : 0
  const riskPenalty = sharpeRatio !== null && sharpeRatio < 0 ? Math.min(Math.abs(sharpeRatio) * 12, 18) : 0
  const score = Math.round(clamp(rangeScore * 0.72 + drawdownSupport - riskPenalty + 14, 0, 100))

  return {
    score,
    sampleSize,
    lookbackHours,
    pricePercentile,
    distanceFromLow,
    distanceFromHigh,
    averageReturn,
    volatility,
    sharpeRatio,
    sortinoRatio,
    informationRatio,
    maxDrawdown,
    summary: `多周期估值水位 ${score}/100，当前处于样本 ${(pricePercentile * 100).toFixed(0)}% 分位，Sharpe ${formatRatio(sharpeRatio)}。`,
  }
}

function scoreValuationMetrics(
  valuation: ValuationMetrics,
  reasons: string[],
  risks: string[],
) {
  let score = 0

  if (valuation.pricePercentile === null) {
    risks.push('多周期估值样本不足，不能只依赖 24h 区间判断低位。')
    return 0
  }

  if (valuation.pricePercentile <= 0.2) {
    score += 18
    reasons.push(`多周期价格分位 ${(valuation.pricePercentile * 100).toFixed(0)}%，处于近期偏低水位。`)
  } else if (valuation.pricePercentile <= 0.4) {
    score += 10
    reasons.push(`多周期价格分位 ${(valuation.pricePercentile * 100).toFixed(0)}%，估值水位不高。`)
  } else if (valuation.pricePercentile >= 0.75) {
    risks.push(`多周期价格分位 ${(valuation.pricePercentile * 100).toFixed(0)}%，并非低估低位区。`)
  }

  if (valuation.sharpeRatio !== null && valuation.sharpeRatio > 0.35) {
    score += 8
    reasons.push(`近期风险收益比改善，Sharpe ${formatRatio(valuation.sharpeRatio)}。`)
  } else if (valuation.sharpeRatio !== null && valuation.sharpeRatio < -0.35) {
    risks.push(`近期风险收益偏弱，Sharpe ${formatRatio(valuation.sharpeRatio)}，需等待趋势修复。`)
  }

  if (valuation.maxDrawdown !== null && Math.abs(valuation.maxDrawdown) >= 0.008) {
    score += 6
    reasons.push(`多周期最大回撤 ${formatPercent(Math.abs(valuation.maxDrawdown))}，已有一定回落安全垫。`)
  }

  return score
}

function buildMultiTimeframeConfluence(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
): MultiTimeframeConfluence {
  const points = dedupeHistoryByTimestamp([...history, quoteToHistoryPoint(latestQuote)].sort(sortByTime))
  const frames = [
    buildTimeframeConfluence(points, latestQuote, '1m', 1),
    buildTimeframeConfluence(points, latestQuote, '5m', 5),
    buildTimeframeConfluence(points, latestQuote, '15m', 15),
    buildTimeframeConfluence(points, latestQuote, '60m', 60),
  ]
  const scoredFrames = frames.filter((frame) => frame.bias !== 'insufficient')
  if (scoredFrames.length < 2) {
    return {
      overallBias: 'insufficient',
      score: 50,
      conflictLevel: 'mild',
      summary: '多周期样本不足，暂不能判断 1m/5m/15m/60m 是否共振。',
      frames,
    }
  }

  const weightedScore = frames.reduce((sum, frame) => {
    const weight = timeframeWeight(frame.timeframe)
    return sum + frame.trendScore * weight
  }, 0)
  const totalWeight = frames.reduce((sum, frame) => sum + timeframeWeight(frame.timeframe), 0)
  const score = Math.round(clamp(weightedScore / totalWeight, 0, 100))
  const shortBullish = frames.slice(0, 2).some((frame) => frame.bias === 'bullish')
  const shortBearish = frames.slice(0, 2).some((frame) => frame.bias === 'bearish')
  const longBullish = frames.slice(2).some((frame) => frame.bias === 'bullish')
  const longBearish = frames.slice(2).some((frame) => frame.bias === 'bearish')
  const severeConflict = (shortBullish && longBearish) || (shortBearish && longBullish)
  const mildConflict = !severeConflict && new Set(scoredFrames.map((frame) => frame.bias)).size > 1
  const overallBias = score >= 58 ? 'bullish' : score <= 42 ? 'bearish' : 'neutral'

  return {
    overallBias,
    score,
    conflictLevel: severeConflict ? 'severe' : mildConflict ? 'mild' : 'none',
    summary: buildConfluenceSummary(score, severeConflict ? 'severe' : mildConflict ? 'mild' : 'none', overallBias),
    frames,
  }
}

function buildTimeframeConfluence(
  points: HistoryPoint[],
  latestQuote: QuoteSample,
  timeframe: '1m' | '5m' | '15m' | '60m',
  minutes: number,
): TimeframeConfluence {
  const latestMs = new Date(latestQuote.fetchedAt).getTime()
  const lookbackMs = minutes * 6 * 60 * 1000
  const window = points.filter((point) => {
    const timestampMs = new Date(point.timestamp).getTime()
    return Number.isFinite(timestampMs) && latestMs - timestampMs <= lookbackMs
  })
  const prices = window.map((point) => point.price).filter((price) => Number.isFinite(price) && price > 0)
  if (prices.length < 3) {
    return {
      timeframe,
      label: timeframe,
      bias: 'insufficient' as const,
      trendScore: 50,
      momentumPercent: null,
      volatilityPercent: null,
      summary: `${timeframe} 样本不足，暂不参与共振。`,
    }
  }
  const first = prices[0]
  const latest = prices[prices.length - 1]
  const momentumPercent = first > 0 ? (latest - first) / first : 0
  const returns = buildReturns(prices)
  const volatilityPercent = standardDeviation(returns)
  const shortAverage = averageNumber(prices.slice(Math.max(0, prices.length - 3))) ?? latest
  const longAverage = averageNumber(prices) ?? latest
  const slopeScore = clamp(50 + momentumPercent * 1800, 0, 100)
  const averageScore = shortAverage >= longAverage ? 58 : 42
  const trendScore = Math.round(clamp(slopeScore * 0.7 + averageScore * 0.3, 0, 100))
  const bias: TimeframeBias = trendScore >= 58 ? 'bullish' : trendScore <= 42 ? 'bearish' : 'neutral'

  return {
    timeframe,
    label: timeframe,
    bias,
    trendScore,
    momentumPercent,
    volatilityPercent,
    summary: `${timeframe} ${biasLabel(bias)}，动量 ${formatPercent(momentumPercent)}，趋势分 ${trendScore}/100。`,
  }
}

function scoreMultiTimeframeConfluence(
  confluence: MultiTimeframeConfluence,
  reasons: string[],
  risks: string[],
) {
  if (confluence.overallBias === 'insufficient') {
    risks.push('多周期样本不足，不能确认小周期信号是否被大周期压制。')
    return 0
  }
  if (confluence.conflictLevel === 'severe') {
    risks.push(`多周期严重冲突：${confluence.summary} 小周期信号必须降仓或等待。`)
    return -12
  }
  if (confluence.overallBias === 'bullish' && confluence.conflictLevel === 'none') {
    reasons.push(`多周期共振偏多：${confluence.summary}`)
    return 10
  }
  if (confluence.overallBias === 'bearish') {
    risks.push(`多周期偏空：${confluence.summary}`)
    return -8
  }
  reasons.push(`多周期中性：${confluence.summary}`)
  return 0
}

function buildConfluenceSummary(
  score: number,
  conflictLevel: MultiTimeframeConfluence['conflictLevel'],
  bias: MultiTimeframeConfluence['overallBias'],
) {
  const conflictText = conflictLevel === 'severe'
    ? '存在严重周期冲突'
    : conflictLevel === 'mild'
      ? '存在轻微周期分歧'
      : '周期方向较一致'
  return `综合 ${score}/100，${biasLabel(bias)}，${conflictText}。`
}

function timeframeWeight(timeframe: '1m' | '5m' | '15m' | '60m') {
  return timeframe === '1m' ? 0.15 : timeframe === '5m' ? 0.25 : timeframe === '15m' ? 0.3 : 0.3
}

function biasLabel(bias: MultiTimeframeConfluence['overallBias']) {
  if (bias === 'bullish') {
    return '偏多'
  }
  if (bias === 'bearish') {
    return '偏空'
  }
  if (bias === 'insufficient') {
    return '样本不足'
  }
  return '中性'
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

function buildReturns(prices: number[]) {
  const returns: number[] = []
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1]
    const current = prices[index]
    if (previous > 0) {
      returns.push((current - previous) / previous)
    }
  }
  return returns
}

function averageNumber(values: number[]) {
  if (values.length < 1) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function calculateMaxDrawdown(prices: number[]) {
  if (prices.length < 2) {
    return null
  }

  let peak = prices[0]
  let maxDrawdown = 0
  for (const price of prices) {
    peak = Math.max(peak, price)
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (price - peak) / peak)
    }
  }
  return maxDrawdown
}

function buildExpertOpinions(input: {
  externalModelAdvisor: ExternalModelAdvisor | null
  finalScore: number
  history: HistoryPoint[]
  latestQuote: QuoteSample
  marketContext: MarketContext
  positionFromLow: number | null
  shortTerm: ReturnType<typeof analyzeShortTerm>
  sourceStatus: SourceStatus
  stats: QuoteApiResponse['stats24h']
  technicals: TechnicalSnapshot
}): ExpertOpinion[] {
  const {
    externalModelAdvisor,
    finalScore,
    history,
    latestQuote,
    marketContext,
    positionFromLow,
    shortTerm,
    sourceStatus,
    stats,
    technicals,
  } = input
  const calibration = latestQuote.marketReference.calibration
  const premiumPercent = calibration.premiumPercent
  const hasHealthyData = !sourceStatus.stale && getActiveChannelStatus(sourceStatus)?.status === 'healthy'
  const nearLow = positionFromLow !== null && positionFromLow <= 0.3
  const deepPullback = stats.drawdownPercent24h >= 0.012
  const oversold = technicals.rsi14 !== null && technicals.rsi14 <= 35
  const momentumImproving = technicals.macd !== null && technicals.macd.histogram > 0
  const trendFalling = technicals.shortTrend === 'falling'
  const anchorCheap = premiumPercent !== null && premiumPercent <= 0.006
  const anchorExpensive = premiumPercent !== null && premiumPercent > 0.018
  const macroSupportive = marketContext.factorScore >= 58
  const macroPressure = marketContext.factorScore <= 42
  const macroHighlights = summarizeMacroHighlights(marketContext)
  const criticalProviderFailures = getCriticalProviderFailures(marketContext)

  const opinions: ExpertOpinion[] = [
    {
      id: 'quant-timer',
      name: '量化择时官',
      role: 'RSI/MACD/均线择时',
      action: oversold && momentumImproving && !trendFalling ? 'accumulate' : oversold ? 'watch' : 'wait',
      stance: oversold && momentumImproving ? 'bullish' : oversold ? 'neutral' : 'cautious',
      confidence: clampScore((technicals.rsi14 === null ? 46 : 72 - technicals.rsi14 / 2) + (momentumImproving ? 10 : -6)),
      headline: oversold ? momentumImproingText(momentumImproving) : '指标尚未给出低位择时优势',
      rationale: compact([
        technicals.rsi14 === null ? 'RSI 样本不足，择时置信度降低。' : `RSI14 ${technicals.rsi14.toFixed(1)}。`,
        technicals.macd === null ? 'MACD 样本不足。' : `MACD 柱 ${technicals.macd.histogram.toFixed(2)}。`,
        technicals.ma20 === null ? 'MA20 样本不足。' : `当前价与 MA20 偏离 ${formatPercent((latestQuote.price - technicals.ma20) / technicals.ma20)}。`,
      ]),
      risk: trendFalling ? '短线趋势仍向下，择时信号必须等待止跌确认。' : '指标只刻画历史价格，不覆盖突发消息风险。',
      methodTags: ['RSI14', 'MACD', 'MA20', '量化择时'],
    },
    {
      id: 'trend-tape-reader',
      name: '趋势盘感官',
      role: 'K线趋势与短线结构',
      action: shortTerm.reboundPercent >= 0.001 && !trendFalling ? 'watch' : trendFalling ? 'wait' : 'watch',
      stance: trendFalling ? 'cautious' : shortTerm.reboundPercent >= 0.001 ? 'bullish' : 'neutral',
      confidence: clampScore(56 + shortTerm.reboundPercent * 9000 - (trendFalling ? 18 : 0)),
      headline: trendFalling ? '先等止跌，不抢第一脚' : '短线企稳迹象可跟踪',
      rationale: compact([
        `近端样本 ${shortTerm.pointCount} 个。`,
        `自短线低点反弹 ${formatPercent(shortTerm.reboundPercent)}。`,
        `最新一跳变化 ${formatPercent(shortTerm.lastMovePercent)}。`,
      ]),
      risk: '短线盘感对样本密度敏感，Vercel 冷启动或低采样会降低判断质量。',
      methodTags: ['K线结构', '短线止跌', '动量跟踪'],
    },
    {
      id: 'mean-reversion-gold',
      name: '黄金均值回归官',
      role: '24h 区间/回撤/锚点折溢价',
      action: nearLow && deepPullback && anchorCheap ? 'accumulate' : nearLow || deepPullback ? 'watch' : 'wait',
      stance: nearLow && deepPullback && anchorCheap ? 'bullish' : nearLow || deepPullback ? 'neutral' : 'cautious',
      confidence: clampScore(44 + (nearLow ? 18 : 0) + (deepPullback ? 18 : 0) + (anchorCheap ? 14 : 0) - (anchorExpensive ? 22 : 0)),
      headline: nearLow && deepPullback ? '回撤与低位条件较友好' : '低位安全垫仍需等待',
      rationale: compact([
        positionFromLow === null ? '24h 区间不可用。' : `价格处于 24h 区间 ${(positionFromLow * 100).toFixed(0)}% 位置。`,
        `24h 回撤 ${formatPercent(stats.drawdownPercent24h)}。`,
        premiumPercent === null ? '上金所锚点缺失。' : `相对锚点偏离 ${formatPercent(premiumPercent)}。`,
      ]),
      risk: anchorExpensive ? '相对锚点溢价偏高，均值回归买点质量下降。' : '均值回归可能遇到趋势性下跌而失效。',
      methodTags: ['均值回归', '24h低位', '回撤', '锚点折溢价'],
    },
    {
      id: 'precious-metals-macro',
      name: '贵金属锚点官',
      role: '国际金价/美元/汇率/锚点校准',
      action: macroSupportive && anchorCheap ? 'watch' : macroPressure || anchorExpensive ? 'avoid' : 'wait',
      stance: macroSupportive && !anchorExpensive ? 'neutral' : macroPressure || anchorExpensive ? 'risk_off' : 'cautious',
      confidence: clampScore(44 + marketContext.factorScore / 2 + (anchorCheap ? 10 : 0) - (anchorExpensive ? 24 : 0)),
      headline: macroSupportive ? '宏观因子对人民币金价相对友好' : macroPressure ? '宏观因子存在压制' : '宏观因子中性，等待更多确认',
      rationale: compact([
        `多源因子 ${marketContext.factorScore}/100。`,
        marketContext.factors.spotGoldUsd.summary,
        marketContext.factors.dollarIndex.summary,
        marketContext.factors.usdCny.summary,
        ...macroHighlights,
        calibration.anchorSymbol ? `参考锚点 ${calibration.anchorSymbol}。` : '暂无明确上金所锚点。',
        premiumPercent === null ? '无法计算折溢价。' : `折溢价 ${formatPercent(premiumPercent)}。`,
        calibration.withinReferenceRange === false ? '价格超出参考容忍区间。' : '参考区间未触发严重冲突。',
      ]),
      risk: marketContext.sentiment.news.status === 'unavailable' || marketContext.sentiment.blogger.status === 'unavailable'
        ? '新闻或博主观点源仍不可用，不能把宏观雷达当完整基本面结论。'
        : '外部宏观和情绪数据存在延迟与噪声，需要与主报价交叉验证。',
      methodTags: ['国际金价', '美元指数', 'USDCNY', '贵金属校准'],
    },
    {
      id: 'risk-officer',
      name: '风控总监',
      role: '数据质量/仓位纪律/信号降级',
      action: hasHealthyData && finalScore >= 72 ? 'watch' : hasHealthyData && finalScore >= 45 ? 'watch' : 'wait',
      stance: hasHealthyData && finalScore >= 45 ? 'neutral' : 'risk_off',
      confidence: clampScore(38 + (hasHealthyData ? 28 : -12) + Math.min(history.length, 24) * 0.8),
      headline: hasHealthyData ? '允许观察，不允许重仓孤注' : '数据源不稳，必须降级',
      rationale: compact([
        hasHealthyData ? '当前主数据源健康。' : '数据源陈旧或处于降级状态。',
        `策略总分 ${finalScore}/100。`,
        marketContext.backtest.summary,
        summarizeSourceCoverage(marketContext),
        summarizeProviderHealthRisk(marketContext),
        `历史样本 ${history.length} 个。`,
      ]),
      risk: criticalProviderFailures.length > 0
        ? `关键数据源失败：${criticalProviderFailures.map((item) => item.label).join('、')}，禁止放大强提醒。`
        : '任何专家团结论都只用于观察，必须设置预算、分批和止损纪律。',
      methodTags: ['风控', '数据质量', '仓位纪律', '降级策略'],
    },
  ]
  const externalOpinion = buildExternalModelOpinion(externalModelAdvisor)
  return externalOpinion ? [...opinions, externalOpinion] : opinions
}

function buildExpertConsensus(opinions: ExpertOpinion[]): ExpertConsensus {
  const weights: Record<ExpertAction, number> = {
    accumulate: 3,
    watch: 2,
    wait: 1,
    avoid: 0,
  }
  const weightedScore =
    opinions.reduce((sum, item) => sum + weights[item.action] * item.confidence, 0) /
    Math.max(opinions.reduce((sum, item) => sum + item.confidence, 0), 1)
  const averageConfidence = Math.round(
    opinions.reduce((sum, item) => sum + item.confidence, 0) / Math.max(opinions.length, 1),
  )
  const bullishCount = opinions.filter((item) => item.action === 'accumulate' || item.stance === 'bullish').length
  const cautiousCount = opinions.filter((item) => item.action === 'avoid' || item.stance === 'risk_off' || item.stance === 'cautious').length
  const action: ExpertAction =
    weightedScore >= 2.45 ? 'accumulate' : weightedScore >= 1.65 ? 'watch' : weightedScore >= 0.75 ? 'wait' : 'avoid'

  return {
    action,
    confidence: averageConfidence,
    bullishCount,
    cautiousCount,
    summary: buildConsensusSummary(action, bullishCount, cautiousCount),
  }
}

function scoreMarketContext(
  marketContext: MarketContext,
  reasons: string[],
  risks: string[],
) {
  const adjustment = Math.round((marketContext.factorScore - 50) / 4)

  if (marketContext.factorScore >= 60) {
    reasons.push(`多源宏观/回测因子 ${marketContext.factorScore}/100，对当前观察信号形成加分。`)
  } else if (marketContext.factorScore <= 40) {
    risks.push(`多源宏观/回测因子 ${marketContext.factorScore}/100，专家团需降低买点强度。`)
  } else {
    reasons.push(`多源宏观/回测因子 ${marketContext.factorScore}/100，整体保持中性。`)
  }

  if (marketContext.sentiment.news.status === 'unavailable') {
    risks.push('新闻情绪尚未接入真实源，当前不用于放大强买点信号。')
  }
  if (marketContext.sentiment.blogger.status === 'unavailable') {
    risks.push('博主/分析师观点源暂不可用，专家建议会降低外部观点权重。')
  }

  const liveCount = countLiveFactors(marketContext)
  const totalCount = countTotalFactors(marketContext)
  if (totalCount > 0 && liveCount / totalCount < 0.45) {
    risks.push(`可用专业因子 ${liveCount}/${totalCount}，数据覆盖不足，强信号需等待更多源确认。`)
  }

  const criticalProviderFailures = getCriticalProviderFailures(marketContext)
  if (criticalProviderFailures.length > 0) {
    risks.push(`源探测显示 ${criticalProviderFailures.length} 个关键源失败，专家团将降低买点建议等级。`)
  }

  return adjustment
}

function applyProbabilityModelAdjustment(
  ruleCappedScore: number,
  scoreCap: number,
  prediction: ProbabilityPrediction,
  externalModelAdvisor: ExternalModelAdvisor | null,
  reasons: string[],
  risks: string[],
) {
  const confidenceWeight = clamp(prediction.confidence / 100 * 0.24, 0.08, 0.24)
  const probabilityScore = clamp(prediction.probability * 100, 0, 100)
  const blendedScore = ruleCappedScore * (1 - confidenceWeight) + probabilityScore * confidenceWeight
  const hasCalibration = prediction.sampleSize >= 20 && (prediction.brierScore === null || prediction.brierScore <= 0.24)
  const maxBoost = hasCalibration ? 8 : 4
  const adjusted = blendedScore > ruleCappedScore
    ? Math.min(blendedScore, ruleCappedScore + maxBoost)
    : blendedScore
  const externallyAdjusted = applyExternalModelAdjustment(adjusted, externalModelAdvisor, reasons, risks)
  const finalScore = Math.round(clamp(Math.min(externallyAdjusted, scoreCap), 0, 100))

  if (prediction.probability >= 0.58) {
    reasons.push(`概率模型：${prediction.summary} 仅作为规则评分的低权重加权项。`)
  } else if (prediction.probability <= 0.46) {
    risks.push(`概率模型偏谨慎：${prediction.summary}，规则信号自动降权。`)
  } else {
    risks.push(`概率模型中性：${prediction.summary}，不放大当前信号。`)
  }
  if (prediction.sampleSize < 20) {
    risks.push('概率模型本地校准样本不足，预测已向 50% 保守收缩。')
  }

  return finalScore
}

function applyExternalModelAdjustment(
  currentScore: number,
  advisor: ExternalModelAdvisor | null,
  reasons: string[],
  risks: string[],
) {
  if (!advisor || advisor.status === 'unconfigured') {
    risks.push('外部时序基础模型军师未配置，当前不参与分数放大。')
    return currentScore
  }
  if (advisor.status === 'error' || advisor.upProbability === null) {
    risks.push(`外部时序基础模型军师不可用：${advisor.summary}`)
    return currentScore
  }
  const gate = advisor.backtestGate
  if (!gate || gate.status === 'insufficient') {
    risks.push(`外部模型军师暂不加权：${gate?.summary ?? '缺少同类分桶回测约束。'}`)
    return currentScore
  }
  if (gate.status === 'weak' || gate.weightMultiplier <= 0) {
    risks.push(`外部模型军师被分桶回测拦截：${gate.summary}`)
    return currentScore
  }

  const modelScore = advisor.upProbability * 100
  const weight = clamp(advisor.confidence / 100 * 0.16 * gate.weightMultiplier, 0.02, 0.16)
  const blended = currentScore * (1 - weight) + modelScore * weight
  const maxBoost = gate.status === 'strong'
    ? advisor.confidence >= 70 ? 5 : 3
    : 2
  const adjusted = blended > currentScore
    ? Math.min(blended, currentScore + maxBoost)
    : blended

  if (advisor.upProbability >= 0.6) {
    reasons.push(`外部模型军师：${advisor.summary} ${gate.summary}`)
  } else if (advisor.upProbability <= 0.45) {
    risks.push(`外部模型军师偏谨慎：${advisor.summary}，当前信号降权。`)
  } else {
    risks.push(`外部模型军师中性：${advisor.summary}，不放大当前信号。`)
  }
  return adjusted
}

function buildExternalModelOpinion(advisor: ExternalModelAdvisor | null): ExpertOpinion | null {
  if (!advisor) {
    return null
  }
  const liveBullish = advisor.status === 'live' && advisor.upProbability !== null && advisor.upProbability >= 0.6
  const liveBearish = advisor.status === 'live' && advisor.upProbability !== null && advisor.upProbability <= 0.45
  return {
    id: 'foundation-model-advisor',
    name: '时序基础模型军师',
    role: 'Chronos/TimesFM/Moirai 兼容预测',
    action: liveBullish ? 'watch' : liveBearish ? 'avoid' : 'wait',
    stance: liveBullish ? 'bullish' : liveBearish ? 'risk_off' : 'cautious',
    confidence: advisor.confidence,
    headline: advisor.summary,
    rationale: advisor.rationale,
    risk: [
      advisor.backtestGate?.summary,
      ...advisor.risks,
    ].filter(Boolean).join('；') || '外部模型只做低权重参考，不能替代回测和风控。',
    methodTags: [advisor.modelName, advisor.provider, `${advisor.horizonMinutes}m`, '外部时序模型'],
  }
}

function scorePatternSignals(
  patternSignals: PatternSignal[],
  reasons: string[],
  risks: string[],
) {
  if (patternSignals.length < 1) {
    risks.push('形态识别样本仍在积累，暂未发现可参考的双底/双顶/支撑阻力结构。')
    return 0
  }

  let adjustment = 0
  for (const pattern of patternSignals.slice(0, 3)) {
    const weight = Math.round((pattern.confidence - 50) / 10)
    if (pattern.direction === 'bullish') {
      adjustment += Math.max(0, Math.min(8, weight + 3))
      reasons.push(`${pattern.label}：${pattern.summary} 关键价 ${formatCurrency(pattern.keyPrice)}，失效价 ${formatMaybeCurrency(pattern.invalidationPrice)}。`)
    } else if (pattern.direction === 'bearish') {
      adjustment -= Math.max(2, Math.min(8, weight + 3))
      risks.push(`${pattern.label}：${pattern.summary} 阻力/关键价 ${formatCurrency(pattern.keyPrice)}，突破失效 ${formatMaybeCurrency(pattern.invalidationPrice)}。`)
    }
  }

  return clamp(adjustment, -10, 10)
}

function buildTradePlan(input: {
  eventRisk: EconomicEventRisk
  finalScore: number
  latestQuote: QuoteSample
  marketContext: MarketContext
  patternSignals: PatternSignal[]
  shortTerm: ReturnType<typeof analyzeShortTerm>
  sourceStatus: SourceStatus
  stats: QuoteApiResponse['stats24h']
  technicals: TechnicalSnapshot
  valuation: ValuationMetrics
}): TradePlan {
  const {
    eventRisk,
    finalScore,
    latestQuote,
    marketContext,
    patternSignals,
    shortTerm,
    sourceStatus,
    stats,
    technicals,
    valuation,
  } = input
  const price = latestQuote.price
  const bullishPattern = patternSignals.find((pattern) => pattern.direction === 'bullish')
  const bearishPattern = patternSignals.find((pattern) => pattern.direction === 'bearish')
  const volatilityStop = valuation.volatility !== null
    ? Math.max(price * 0.0035, price * valuation.volatility * 3)
    : price * 0.005
  const rangeStop = stats.high24h > stats.low24h ? Math.max((stats.high24h - stats.low24h) * 0.28, price * 0.003) : price * 0.0045
  const stopDistance = clamp(Math.max(volatilityStop, rangeStop), price * 0.003, price * 0.018)
  const referenceSupport = Math.min(
    bullishPattern?.keyPrice ?? price,
    technicals.ma20 ?? price,
    stats.low24h > 0 ? stats.low24h : price,
  )
  const entryLow = roundPrice(Math.max(Math.min(price, referenceSupport + stopDistance * 0.35), price - stopDistance * 0.45))
  const entryHigh = roundPrice(Math.max(price, entryLow + stopDistance * 0.35))
  const stopLoss = roundPrice(
    bullishPattern?.invalidationPrice
      ?? Math.min(referenceSupport - stopDistance * 0.35, price - stopDistance),
  )
  const triggerPrice = roundPrice(
    bullishPattern?.necklinePrice
      ?? technicals.ma5
      ?? price + stopDistance * 0.35,
  )
  const upsideAnchor = Math.max(
    bearishPattern?.keyPrice ?? 0,
    stats.high24h,
    technicals.ma20 ?? 0,
    triggerPrice,
  )
  const takeProfit1 = roundPrice(Math.max(upsideAnchor, price + stopDistance * 1.8))
  const takeProfit2 = roundPrice(Math.max(bullishPattern?.targetPrice ?? 0, price + stopDistance * 3))
  const riskPerUnit = Math.max(price - stopLoss, stopDistance * 0.6)
  const rewardPerUnit = Math.max(takeProfit1 - price, 0)
  const riskRewardRatio = riskPerUnit > 0 && rewardPerUnit > 0
    ? roundRatio(rewardPerUnit / riskPerUnit)
    : null
  const hasHealthyData = !sourceStatus.stale && getActiveChannelStatus(sourceStatus)?.status === 'healthy'
  const macroPressure = marketContext.factorScore <= 42
  const trendFalling = technicals.shortTrend === 'falling'
  const nearHigh = stats.high24h > stats.low24h
    ? (stats.currentPrice - stats.low24h) / (stats.high24h - stats.low24h) >= 0.72
    : false
  const warnings = compact([
    !hasHealthyData ? '主报价数据源不健康，交易计划仅供观察。' : null,
    macroPressure ? '宏观/资金流评分偏弱，不允许放大仓位。' : null,
    trendFalling ? '短线趋势仍偏下行，必须等待触发价确认。' : null,
    shortTerm.reboundPercent < 0.001 ? '短线反弹力度不足，不能把第一脚下跌当成确定底部。' : null,
    nearHigh ? '当前接近日内高位，追单风险较高。' : null,
    riskRewardRatio !== null && riskRewardRatio < 2 ? '风险收益比不足 2:1，不能作为强买点。' : null,
    eventRisk.level === 'critical' || eventRisk.level === 'elevated' ? `事件风控生效：${eventRisk.summary}` : null,
  ])
  const canProbe = finalScore >= 45 && hasHealthyData && !nearHigh
  const canConfirmEnter =
    finalScore >= 72 &&
    hasHealthyData &&
    !macroPressure &&
    eventRisk.level !== 'critical' &&
    eventRisk.level !== 'elevated' &&
    riskRewardRatio !== null &&
    riskRewardRatio >= 2.5 &&
    !nearHigh
  const action = bearishPattern && nearHigh
    ? 'take_profit_or_reduce'
    : canConfirmEnter
      ? 'confirm_then_enter'
      : canProbe
        ? 'probe'
        : finalScore >= 38
          ? 'observe'
          : 'stand_aside'
  const basePositionPercent = action === 'confirm_then_enter'
    ? 8
    : action === 'probe'
      ? 3
      : action === 'observe'
        ? 1
        : 0
  const maxPositionPercent = roundPosition(basePositionPercent * eventRisk.positionMultiplier)
  const maxAccountRiskPercent = roundPosition(
    (action === 'confirm_then_enter' ? 2 : action === 'probe' ? 0.8 : 0) * eventRisk.positionMultiplier,
  )

  return {
    action,
    actionLabel: tradePlanActionLabel(action),
    confidence: canConfirmEnter ? 'high' : canProbe ? 'medium' : 'low',
    entryZone: action === 'stand_aside' || action === 'take_profit_or_reduce'
      ? null
      : { low: entryLow, high: entryHigh },
    triggerPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskRewardRatio,
    positionSuggestion: buildPositionSuggestion(maxPositionPercent, riskRewardRatio),
    maxPositionPercent,
    maxAccountRiskPercent,
    invalidation: buildInvalidationText(stopLoss, bearishPattern, macroPressure),
    rationale: compact([
      `当前策略分 ${finalScore}/100。`,
      bullishPattern ? `${bullishPattern.label}：${bullishPattern.summary}` : '暂无高置信看多形态，入场必须等待触发确认。',
      `止损按形态失效/波动率/日内区间综合测算，约 ${formatCurrency(stopLoss)}。`,
      riskRewardRatio === null ? '风险收益比暂不可计算。' : `按 TP1 测算风险收益比约 ${riskRewardRatio}:1。`,
      eventRisk.level === 'none' ? null : `事件风控仓位系数 ${eventRisk.positionMultiplier}，原因：${eventRisk.summary}`,
      `最大建议仓位 ${maxPositionPercent}% ，单笔账户风险上限 ${maxAccountRiskPercent}% 。`,
    ]),
    warnings,
  }
}

function buildPsychologyDiscipline(input: {
  confluence: MultiTimeframeConfluence
  eventRisk: EconomicEventRisk
  finalScore: number
  patternSignals: PatternSignal[]
  positionFromLow: number | null
  stats: QuoteApiResponse['stats24h']
  tradePlan: TradePlan
  valuation: ValuationMetrics
}): PsychologyDiscipline {
  const {
    confluence,
    eventRisk,
    finalScore,
    patternSignals,
    positionFromLow,
    stats,
    tradePlan,
    valuation,
  } = input
  const nearHigh = stats.high24h > stats.low24h
    ? (stats.currentPrice - stats.low24h) / (stats.high24h - stats.low24h) >= 0.72
    : false
  const flags: PsychologyRiskFlag[] = compactFlags([
    nearHigh || (valuation.pricePercentile !== null && valuation.pricePercentile >= 0.75)
      ? {
          kind: 'chasing_high',
          label: '追高冲动',
          severity: nearHigh ? 'high' : 'medium',
          evidence: positionFromLow === null
            ? '价格不在明确低位，继续追单容易把上涨末端当成买点。'
            : `价格处于 24h 区间 ${(positionFromLow * 100).toFixed(0)}% 位置。`,
          correction: '只接受回踩支撑不破后的二次确认，不追第一根急涨。',
        }
      : null,
    eventRisk.level === 'critical' || eventRisk.level === 'elevated'
      ? {
          kind: 'event_impulse',
          label: '事件冲动交易',
          severity: 'high',
          evidence: eventRisk.summary,
          correction: '事件前后先观察，不因波动放大而临时加仓。',
        }
      : null,
    tradePlan.stopLoss === null || tradePlan.riskRewardRatio === null || tradePlan.riskRewardRatio < 2
      ? {
          kind: 'no_stop_loss',
          label: '无效止损/赔率不足',
          severity: 'high',
          evidence: tradePlan.riskRewardRatio === null ? '交易计划暂不能计算风险收益比。' : `风险收益比仅 ${tradePlan.riskRewardRatio}:1。`,
          correction: '没有止损和 2:1 以上赔率时，买点一律降级为观察。',
        }
      : null,
    patternSignals.length < 1 && finalScore >= 45
      ? {
          kind: 'overtrading',
          label: '低质量频繁交易',
          severity: 'medium',
          evidence: '当前没有可解释形态确认，但策略分已进入观察区。',
          correction: '等待形态、触发价或多周期共振补齐后再行动。',
        }
      : null,
    confluence.conflictLevel === 'severe'
      ? {
          kind: 'holding_loser',
          label: '逆大周期扛单倾向',
          severity: 'medium',
          evidence: confluence.summary,
          correction: '小周期反弹若被大周期压制，跌破失效价必须退出，不能扛单等回本。',
        }
      : null,
  ])
  const penalty = flags.reduce((sum, flag) => {
    return sum + (flag.severity === 'high' ? 32 : flag.severity === 'medium' ? 20 : 10)
  }, 0)
  const score = Math.round(clamp(100 - penalty, 0, 100))
  const highFlags = flags.filter((flag) => flag.severity === 'high').length
  const level: PsychologyDiscipline['level'] = score <= 45 || highFlags >= 2 ? 'danger' : score <= 70 || flags.length > 0 ? 'watch' : 'stable'
  const action: PsychologyDiscipline['action'] = level === 'danger'
    ? 'stand_down'
    : level === 'watch'
      ? 'reduce_size'
      : 'allow_plan'

  return {
    score,
    level,
    action,
    summary: buildPsychologySummary(level, flags),
    flags,
    checklist: [
      '是否已经写清入场、止损、TP1/TP2 和失效条件？',
      '若立刻反向波动，是否能按计划小亏退出？',
      '这笔交易是优势战，还是因为害怕错过而追单？',
    ],
    updatedAt: new Date().toISOString(),
  }
}

function buildPsychologySummary(level: PsychologyDiscipline['level'], flags: PsychologyRiskFlag[]) {
  if (level === 'danger') {
    return `纪律风险高：${flags.map((flag) => flag.label).join('、')}，建议空仓等待或只做复盘。`
  }
  if (level === 'watch') {
    return `纪律风险需观察：${flags.map((flag) => flag.label).join('、')}，只能降仓执行计划。`
  }
  return '纪律状态稳定：当前未发现明显追高、扛单或事件冲动风险。'
}

function tradePlanActionLabel(action: TradePlan['action']) {
  switch (action) {
    case 'confirm_then_enter':
      return '确认后参与'
    case 'probe':
      return '轻仓试探'
    case 'observe':
      return '观察等待'
    case 'take_profit_or_reduce':
      return '止盈/减仓'
    case 'stand_aside':
    default:
      return '空仓等待'
  }
}

function buildPositionSuggestion(maxPositionPercent: number, riskRewardRatio: number | null) {
  if (maxPositionPercent <= 0) {
    return '不建议开新仓，先等待更清晰的优势区。'
  }
  const ratioText = riskRewardRatio === null ? '赔率未确认' : `赔率约 ${riskRewardRatio}:1`
  return `建议总仓不超过 ${maxPositionPercent}%，${ratioText}；若触发后快速跌回入场区，立即降级。`
}

function buildInvalidationText(
  stopLoss: number,
  bearishPattern: PatternSignal | undefined,
  macroPressure: boolean,
) {
  return compact([
    `跌破 ${formatCurrency(stopLoss)} 视为交易计划失效。`,
    bearishPattern ? `${bearishPattern.label} 未解除，高位抛压仍需警惕。` : null,
    macroPressure ? '若美元/美债/实际利率继续压制黄金，计划自动降级。' : null,
  ]).join(' ')
}

function getCriticalProviderFailures(marketContext: MarketContext) {
  const criticalIds = new Set([
    'GC=F',
    'DX-Y.NYB',
    'USDCNY=X',
    'DFII10',
    'COT_GOLD_NET',
    'GLD_FLOW',
    'WGC_ETF_FLOW',
    'CME_GOLD_OI',
  ])
  return (marketContext.providerHealth ?? [])
    .filter((item) => item.participatesInScoring && item.status === 'unavailable' && criticalIds.has(item.id))
}

function summarizeMacroHighlights(marketContext: MarketContext) {
  const factors = [
    marketContext.factors.spotGoldUsd,
    marketContext.factors.dollarIndex,
    marketContext.factors.usdCny,
    ...(marketContext.macroFactors ?? []),
  ]
  const supportive = factors
    .filter((factor) => factor.impact === 'supportive' && factor.status !== 'unavailable')
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((factor) => `支撑因子：${factor.summary}`)
  const pressure = factors
    .filter((factor) => factor.impact === 'pressure' && factor.status !== 'unavailable')
    .sort((left, right) => left.score - right.score)
    .slice(0, 2)
    .map((factor) => `压力因子：${factor.summary}`)
  const unavailable = factors
    .filter((factor) => factor.status === 'unavailable')
    .slice(0, 2)
    .map((factor) => `待确认源：${factor.label}。`)

  return [...supportive, ...pressure, ...unavailable]
}

function summarizeSourceCoverage(marketContext: MarketContext) {
  const liveCount = countLiveFactors(marketContext)
  const totalCount = countTotalFactors(marketContext)
  const providerFailures = getCriticalProviderFailures(marketContext)
  return `专业因子覆盖 ${liveCount}/${totalCount}；新闻 ${marketContext.sentiment.news.status}，观点 ${marketContext.sentiment.blogger.status}；关键源失败 ${providerFailures.length} 个。`
}

function summarizeProviderHealthRisk(marketContext: MarketContext) {
  const health = marketContext.providerHealth ?? []
  if (health.length < 1) {
    return '尚未执行生产源探测，关键源健康历史为空。'
  }
  const live = health.filter((item) => item.status === 'live').length
  const failedCritical = getCriticalProviderFailures(marketContext)
  return failedCritical.length > 0
    ? `生产源探测 ${live}/${health.length} 可用，关键失败：${failedCritical.map((item) => item.label).join('、')}。`
    : `生产源探测 ${live}/${health.length} 可用，关键源暂未触发失败降级。`
}

function countLiveFactors(marketContext: MarketContext) {
  return [
    marketContext.factors.spotGoldUsd,
    marketContext.factors.dollarIndex,
    marketContext.factors.usdCny,
    ...(marketContext.macroFactors ?? []),
  ].filter((factor) => factor.status === 'live' || factor.status === 'derived').length
}

function countTotalFactors(marketContext: MarketContext) {
  return 3 + (marketContext.macroFactors?.length ?? 0)
}

function buildNeutralMarketContext(): MarketContext {
  const now = new Date().toISOString()
  const factor = (id: string, label: string, unit: string) => ({
    id,
    label,
    unit,
    value: null,
    changePercent: null,
    impact: 'unknown' as const,
    score: 50,
    status: 'unavailable' as const,
    summary: `${label}未传入策略引擎，按中性处理。`,
    updatedAt: null,
  })

  return {
    updatedAt: now,
    factorScore: 50,
    summary: '多源策略上下文未传入，按中性因子处理。',
    factors: {
      spotGoldUsd: factor('spotGoldUsd', '国际黄金期货', '美元/盎司'),
      dollarIndex: factor('dollarIndex', '美元指数', '点'),
      usdCny: factor('usdCny', '美元/人民币', 'CNY'),
    },
    macroFactors: [
      factor('DFII10', '10Y TIPS 实际利率', '%'),
      factor('T10YIE', '10Y 通胀预期', '%'),
      factor('VIXCLS', 'VIX 恐慌指数', '点'),
    ],
    sentiment: {
      news: {
        id: 'news',
        label: '新闻情绪',
        score: 50,
        confidence: 0,
        status: 'unavailable',
        summary: '新闻情绪未传入。',
        sources: [],
        updatedAt: null,
      },
      blogger: {
        id: 'blogger',
        label: '博主观点可信度',
        score: 50,
        confidence: 0,
        status: 'unavailable',
        summary: '博主观点未传入。',
        sources: [],
        updatedAt: null,
      },
    },
    backtest: {
      status: 'unavailable',
      sampleSize: 0,
      summary: '本地回测上下文未传入。',
      horizons: [],
    },
    providerHealth: [],
  }
}

function momentumImproingText(momentumImproving: boolean) {
  return momentumImproving ? '超跌后动能开始修复' : '超跌但动能确认不足'
}

function buildConsensusSummary(
  action: ExpertAction,
  bullishCount: number,
  cautiousCount: number,
) {
  const actionText: Record<ExpertAction, string> = {
    accumulate: '专家团倾向“小仓分批低吸观察”',
    watch: '专家团倾向“观察区，等待更强确认”',
    wait: '专家团倾向“继续等待，不急于出手”',
    avoid: '专家团倾向“暂时回避，先控风险”',
  }

  return `${actionText[action]}；${bullishCount} 位偏积极，${cautiousCount} 位偏谨慎。`
}

function compact(items: Array<string | null | undefined>) {
  return items.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function compactFlags(items: Array<PsychologyRiskFlag | null | undefined>) {
  return items.filter((item): item is PsychologyRiskFlag => item !== null && item !== undefined)
}

function clampScore(value: number) {
  return Math.round(clamp(value, 0, 100))
}

function scoreTechnicalConditions(
  technicals: TechnicalSnapshot,
  currentPrice: number,
  reasons: string[],
  risks: string[],
) {
  let score = 0

  if (technicals.rsi14 !== null) {
    if (technicals.rsi14 <= 32) {
      score += 12
      reasons.push(`RSI14 ${technicals.rsi14.toFixed(1)}，短线处于偏冷区域。`)
    } else if (technicals.rsi14 <= 42) {
      score += 7
      reasons.push(`RSI14 ${technicals.rsi14.toFixed(1)}，动量未明显过热。`)
    } else if (technicals.rsi14 >= 72) {
      risks.push(`RSI14 ${technicals.rsi14.toFixed(1)}，短线偏热，追高风险上升。`)
    }
  } else {
    risks.push('RSI 样本不足，动量判断暂未纳入强信号。')
  }

  if (technicals.macd) {
    if (technicals.macd.histogram > 0 && technicals.shortTrend !== 'falling') {
      score += 8
      reasons.push('MACD 柱值转正或保持正向，短线动能改善。')
    } else if (technicals.macd.histogram < 0) {
      risks.push('MACD 柱值仍为负，趋势确认度不足。')
    }
  }

  if (technicals.ma20 !== null && currentPrice <= technicals.ma20 * 1.003) {
    score += 6
    reasons.push('当前价格接近 MA20 中枢，未明显脱离均线安全区。')
  } else if (technicals.ma20 !== null && currentPrice > technicals.ma20 * 1.018) {
    risks.push('当前价格明显高于 MA20，追高风险需要扣分。')
  }

  return score
}

function applyTechnicalCaps(
  technicals: TechnicalSnapshot,
  scoreCap: number,
  risks: string[],
) {
  let nextCap = scoreCap

  if (technicals.rsi14 !== null && technicals.rsi14 >= 78) {
    nextCap = Math.min(nextCap, 54)
  }
  if (technicals.shortTrend === 'falling') {
    risks.push('短线趋势仍在下行，强买点需要等待止跌确认。')
    nextCap = Math.min(nextCap, 68)
  }

  return nextCap
}

function analyzeShortTerm(history: HistoryPoint[], latestQuote: QuoteSample) {
  const latestPoint: HistoryPoint = {
    price: latestQuote.price,
    activePrice: latestQuote.activePrice,
    regularPrice: latestQuote.regularPrice,
    sellPrice: latestQuote.sellPrice,
    dayLow: latestQuote.dayLow,
    dayHigh: latestQuote.dayHigh,
    referenceAnchorPrice: latestQuote.marketReference.calibration.anchorPrice,
    referenceAu9999Price: latestQuote.marketReference.au9999?.latestPrice ?? null,
    referenceAutdPrice: latestQuote.marketReference.autd?.latestPrice ?? null,
    timestamp: latestQuote.fetchedAt,
    sourceKind: latestQuote.sourceKind,
  }
  const latestMs = new Date(latestQuote.fetchedAt).getTime()
  const points = [...history, latestPoint]
    .filter((point) => {
      const timestampMs = new Date(point.timestamp).getTime()
      return Number.isFinite(timestampMs) && latestMs - timestampMs <= 2 * 60 * 60 * 1000
    })
    .sort(sortByTime)
  const deduped = dedupeHistoryByTimestamp(points)
  const recent = deduped.slice(-8)
  const previous = recent[recent.length - 2]
  const recentLow = recent.reduce(
    (min, point) => Math.min(min, point.price),
    recent[0]?.price ?? latestQuote.price,
  )
  const lastMovePercent = previous && previous.price > 0
    ? (latestQuote.price - previous.price) / previous.price
    : 0
  const reboundPercent = recentLow > 0
    ? (latestQuote.price - recentLow) / recentLow
    : 0

  return {
    pointCount: recent.length,
    lastMovePercent,
    reboundPercent,
  }
}

function sortByTime(left: HistoryPoint, right: HistoryPoint) {
  return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
}

function dedupeHistoryByTimestamp(history: HistoryPoint[]) {
  const deduped: HistoryPoint[] = []
  for (const point of history) {
    const last = deduped[deduped.length - 1]
    if (last?.timestamp === point.timestamp) {
      deduped[deduped.length - 1] = point
      continue
    }
    deduped.push(point)
  }
  return deduped
}

function getActiveChannelStatus(sourceStatus: SourceStatus) {
  if (sourceStatus.active === 'official') {
    return sourceStatus.official
  }
  if (sourceStatus.active === 'fallback') {
    return sourceStatus.fallback
  }
  return null
}

function buildOpportunityTitle(level: OpportunitySignal['level']) {
  if (level === 'strong') {
    return '绝佳买点观察：强观察信号'
  }
  if (level === 'watch') {
    return '买点观察：进入观察区'
  }
  return '买点观察：暂未触发'
}

function buildOpportunitySummary(level: OpportunitySignal['level']) {
  if (level === 'strong') {
    return '多个观察条件同时满足，可重点跟踪该价格窗口；信号不保证后续上涨。'
  }
  if (level === 'watch') {
    return '部分低位、锚点或短线企稳条件出现配合，适合继续观察而非追高。'
  }
  return '当前条件不足以形成买点观察信号，建议等待更充分的回撤、锚点或企稳确认。'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatCurrency(value: number) {
  return value.toFixed(2)
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100
}

function roundRatio(value: number) {
  return Math.round(value * 100) / 100
}

function roundPosition(value: number) {
  return Math.round(value * 10) / 10
}

function formatMaybeCurrency(value: number | null) {
  return value === null || !Number.isFinite(value) ? '--' : formatCurrency(value)
}

function formatRatio(value: number | null) {
  return value === null || !Number.isFinite(value) ? '--' : value.toFixed(2)
}
