import { buildTechnicalSnapshot, type TechnicalSnapshot } from './technicals.js'
import { buildEconomicEventRisk } from './event-risk.js'
import { buildKnowledgeRuleAudit } from './knowledge-rules.js'
import {
  extractProbabilityFeatures,
  predictProbabilityModel,
} from './model.js'
import type {
  CanonicalForecast,
  BacktestMonitor,
  DecisionOverlay,
  DecisionViewModel,
  EconomicEventRisk,
  ExpertAction,
  ExpertConsensus,
  ExpertOpinion,
  ExternalModelAdvisor,
  FinalDecision,
  FinalDecisionGate,
  HistoryPoint,
  KnowledgeRuleAudit,
  MarketContext,
  MultiTimeframeConfluence,
  OpportunitySignal,
  PatternSignal,
  PriceLevel,
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
  backtestMonitor: BacktestMonitor | null = null,
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
    backtestMonitor,
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
  backtestMonitor?: BacktestMonitor | null
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
    backtestMonitor = null,
  } = input
  const reasons: string[] = []
  const risks: string[] = []
  let score = 0
  let scoreCap = 100
  const valuation = buildValuationMetrics(history, latestQuote)
  const confluence = buildMultiTimeframeConfluence(history, latestQuote)
  const eventRisk = buildEconomicEventRisk(latestQuote.fetchedAt)
  const probabilityFeatures = extractProbabilityFeatures({
      history,
      latestQuote,
      stats,
      marketContext,
      technicals,
      patternSignals,
      confluence,
    })
  const probabilityModel = predictProbabilityModel({
    features: probabilityFeatures,
    calibration: backtestMonitor?.probabilityModel.horizons,
  })
  const preTradeKnowledgeRuleAudit = buildKnowledgeRuleAudit({
    history,
    latestQuote,
    stats,
    technicals,
    marketContext,
    patternSignals,
    confluence,
    eventRisk,
    valuation,
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

  score += preTradeKnowledgeRuleAudit.scoreAdjustment
  scoreCap = Math.min(scoreCap, preTradeKnowledgeRuleAudit.scoreCap)
  for (const reason of preTradeKnowledgeRuleAudit.supportingReasons.slice(0, 2)) {
    reasons.push(reason)
  }
  for (const risk of [
    ...preTradeKnowledgeRuleAudit.opposingReasons,
    ...preTradeKnowledgeRuleAudit.missingConfirmations.slice(0, 2),
    ...preTradeKnowledgeRuleAudit.invalidationWarnings.slice(0, 2),
  ]) {
    risks.push(risk)
  }

  risks.push('该信号仅用于行情观察，不构成投资建议、收益承诺或买入指令。')

  const ruleCappedScore = Math.round(clamp(Math.min(score, scoreCap), 0, 100))
  const prePlanScore = applyProbabilityModelAdjustment(
    ruleCappedScore,
    scoreCap,
    probabilityModel.primaryPrediction,
    externalModelAdvisor,
    preTradeKnowledgeRuleAudit,
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
  const knowledgeRuleAudit = buildKnowledgeRuleAudit({
    history,
    latestQuote,
    stats,
    technicals,
    marketContext,
    patternSignals,
    confluence,
    eventRisk,
    valuation,
    tradePlan,
  })
  const finalDecision = buildFinalDecision({
    confluence,
    eventRisk,
    externalModelAdvisor,
    finalScore,
    latestQuote,
    marketContext,
    patternSignals,
    probabilityModel,
    psychology,
    knowledgeRuleAudit,
    sourceStatus,
    tradePlan,
  })
  const rawCanonicalForecast = buildCanonicalForecast({
    externalModelAdvisor,
    finalDecision,
    latestQuote,
    patternSignals,
    probabilityModel,
    stats,
    technicals,
    tradePlan,
  })
  const decisionView = buildDecisionViewModel({
    canonicalForecast: rawCanonicalForecast,
    finalDecision,
    latestQuote,
    marketContext,
    probabilityModel,
    sourceStatus,
    tradePlan,
  })
  const canonicalForecast = sanitizeCanonicalForecastLevels(rawCanonicalForecast, latestQuote.price)
  const level = deriveOpportunityLevel(finalDecision)
  const decisionOverlay = buildDecisionOverlay({
    canonicalForecast,
    decisionView,
    finalDecision,
    finalScore,
    level,
    tradePlan,
  })
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
    knowledgeRuleAudit,
    canonicalForecast,
    decisionOverlay,
    decisionView,
    finalDecision,
    tradePlan,
    confluence,
    eventRisk,
    psychology,
    computedAt: new Date().toISOString(),
  }
}

function buildCanonicalForecast(input: {
  externalModelAdvisor: ExternalModelAdvisor | null
  finalDecision: FinalDecision
  latestQuote: QuoteSample
  patternSignals: PatternSignal[]
  probabilityModel: OpportunitySignal['probabilityModel']
  stats: QuoteApiResponse['stats24h']
  technicals: TechnicalSnapshot
  tradePlan: TradePlan
}): CanonicalForecast {
  const {
    externalModelAdvisor,
    finalDecision,
    latestQuote,
    patternSignals,
    probabilityModel,
    stats,
    technicals,
    tradePlan,
  } = input
  const price = latestQuote.price
  const prediction = probabilityModel.primaryPrediction
  const usableExternal =
    externalModelAdvisor?.status === 'live' &&
    externalModelAdvisor.backtestGate?.status !== 'weak' &&
    externalModelAdvisor.upProbability !== null
  const primaryPattern = selectPrimaryOverlayPattern(patternSignals, finalDecision)
  const support = buildPriceLevel(
    chooseNearestBelow([
      primaryPattern?.direction === 'bullish' ? primaryPattern.keyPrice : null,
      tradePlan.entryZone?.low ?? null,
      technicals.ma20,
      stats.low24h > 0 ? stats.low24h : null,
    ], price),
    'support',
    primaryPattern?.direction === 'bullish' ? 'patternSignal' : tradePlan.entryZone ? 'tradePlan' : 'stats24h',
    primaryPattern?.confidence ?? null,
    '低位结构/交易计划/日内低点合并后的统一支撑口径。',
  )
  const resistance = buildPriceLevel(
    chooseNearestAbove([
      primaryPattern?.direction === 'bearish' ? primaryPattern.keyPrice : null,
      primaryPattern?.necklinePrice,
      stats.high24h > 0 ? stats.high24h : null,
      technicals.ma20,
    ], price),
    'resistance',
    primaryPattern?.direction === 'bearish' ? 'patternSignal' : 'stats24h',
    primaryPattern?.direction === 'bearish' ? primaryPattern.confidence : null,
    '形态压力/日内高点/技术均线合并后的统一压力口径。',
  )
  const trigger = buildPriceLevel(
    tradePlan.triggerPrice,
    'trigger',
    'tradePlan',
    null,
    '交易计划触发价，不再混同为压力位。',
  )
  const stopLoss = buildPriceLevel(
    tradePlan.stopLoss,
    'stopLoss',
    'tradePlan',
    null,
    '交易计划止损价，是图上主失效线的优先口径。',
  )
  const patternInvalidation = buildPriceLevel(
    primaryPattern?.invalidationPrice ?? null,
    'invalidation',
    'patternSignal',
    primaryPattern?.confidence ?? null,
    '形态自身失效价，仅作为止损之外的结构复核。',
  )
  const targets = [
    buildPriceLevel(tradePlan.takeProfit1, 'takeProfit', 'tradePlan', null, '交易计划 TP1。'),
    buildPriceLevel(tradePlan.takeProfit2, 'takeProfit', 'tradePlan', null, '交易计划 TP2。'),
    buildPriceLevel(primaryPattern?.targetPrice ?? null, 'takeProfit', 'patternSignal', primaryPattern?.confidence ?? null, '形态理论目标位。'),
  ].filter((level): level is NonNullable<typeof level> => level !== null)
  const derivedInterval = buildCanonicalInterval({
    price,
    prediction,
    stats,
    support: support?.price ?? null,
    resistance: resistance?.price ?? null,
    stopLoss: stopLoss?.price ?? patternInvalidation?.price ?? null,
    target: targets[0]?.price ?? null,
  })
  const externalHasInterval = usableExternal &&
    externalModelAdvisor.intervalLow !== null &&
    externalModelAdvisor.intervalHigh !== null
  const intervalLow = externalHasInterval ? externalModelAdvisor.intervalLow : derivedInterval.low
  const intervalHigh = externalHasInterval ? externalModelAdvisor.intervalHigh : derivedInterval.high
  const median = usableExternal && externalModelAdvisor.forecastPrice !== null
    ? externalModelAdvisor.forecastPrice
    : price + (prediction.probability - 0.5) * Math.max(price * 0.006, Math.abs((intervalHigh ?? price) - (intervalLow ?? price)) * 0.25)
  const up = clamp(
    usableExternal && externalModelAdvisor.upProbability !== null
      ? externalModelAdvisor.upProbability
      : prediction.probability,
    0.01,
    0.99,
  )

  return {
    version: 'canonical-forecast-v1',
    generatedAt: new Date().toISOString(),
    horizonMinutes: usableExternal ? externalModelAdvisor.horizonMinutes : prediction.horizonMinutes,
    anchorPrice: price,
    unit: latestQuote.unit,
    probability: {
      up: roundProbability(up),
      down: roundProbability(1 - up),
      label: 'TP1_BEFORE_STOP',
      confidence: Math.round(clamp(usableExternal ? externalModelAdvisor.confidence : prediction.confidence, 1, 99)),
      sampleSize: prediction.sampleSize,
      brierScore: prediction.brierScore,
      source: usableExternal ? 'externalModelAdvisor' : 'probabilityModel.primaryPrediction',
    },
    priceInterval: {
      low: roundNullablePrice(intervalLow),
      high: roundNullablePrice(intervalHigh),
      median: roundNullablePrice(median),
      source: externalHasInterval ? 'externalModel' : 'backendDerived',
      basis: externalHasInterval
        ? '采用通过弱桶过滤的外部时序模型区间，并受本地风控门控约束。'
        : '采用后端统一口径：TP1路径概率、交易计划、形态结构、日内波动共同推导。',
    },
    levels: {
      support,
      resistance,
      entryZone: tradePlan.entryZone,
      trigger,
      stopLoss,
      invalidation: stopLoss ?? patternInvalidation,
      targets,
    },
    successRate: buildCanonicalSuccessRate(finalDecision, prediction),
    primaryPatternId: primaryPattern?.id ?? null,
    primaryPatternLabel: primaryPattern?.label ?? null,
    warnings: compact([
      finalDecision.strongReminderAllowed ? null : '强提醒未放行，图上价位只用于观察和复核。',
      primaryPattern && !isConfirmedPattern(primaryPattern) ? '主形态仍是候选，必须等待触发价/颈线/回踩确认。' : null,
    ]),
  }
}

function buildDecisionOverlay(input: {
  canonicalForecast: CanonicalForecast
  decisionView: DecisionViewModel
  finalDecision: FinalDecision
  finalScore: number
  level: OpportunitySignal['level']
  tradePlan: TradePlan
}): DecisionOverlay {
  const { canonicalForecast, decisionView, finalDecision, finalScore, level, tradePlan } = input
  const source: DecisionOverlay['source'] = canonicalForecast.priceInterval.source === 'externalModel'
    ? 'external_model'
    : tradePlan.entryZone
      ? 'trade_plan'
      : canonicalForecast.primaryPatternId
        ? 'pattern_structure'
        : 'local_probability'
  const showProbability = decisionView.probabilityDisplay.mode === 'calibrated' &&
    decisionView.probabilityDisplay.value !== null
  return {
    version: 'decision-overlay-v1',
    generatedAt: canonicalForecast.generatedAt,
    source,
    horizonMinutes: canonicalForecast.horizonMinutes,
    horizonLabel: `${canonicalForecast.horizonMinutes}分钟 TP1路径`,
    upProbability: showProbability ? Math.round(canonicalForecast.probability.up * 100) : 0,
    downProbability: showProbability ? Math.round(canonicalForecast.probability.down * 100) : 0,
    confidence: canonicalForecast.probability.confidence,
    intervalLow: canonicalForecast.priceInterval.low,
    intervalHigh: canonicalForecast.priceInterval.high,
    support: canonicalForecast.levels.support?.price ?? null,
    resistance: canonicalForecast.levels.resistance?.price ?? null,
    failurePrice: canonicalForecast.levels.invalidation?.price ?? null,
    targetPrice: canonicalForecast.levels.targets[0]?.price ?? null,
    primaryPatternId: canonicalForecast.primaryPatternId,
    primaryPatternLabel: canonicalForecast.primaryPatternLabel,
    patternConfidence: null,
    basis: canonicalForecast.priceInterval.basis,
    warnings: compact([
      ...canonicalForecast.warnings,
      finalDecision.userAdvice,
      decisionView.probabilityDisplay.reason,
      `最终等级 ${level}，策略分 ${finalScore}/100。`,
    ]),
  }
}

function sanitizeCanonicalForecastLevels(
  forecast: CanonicalForecast,
  anchorPrice: number,
): CanonicalForecast {
  const validation = buildLevelValidation(forecast, anchorPrice)
  return {
    ...forecast,
    levels: {
      ...forecast.levels,
      support: validation.support.status === 'valid' ? forecast.levels.support : null,
      resistance: validation.resistance.status === 'valid' ? forecast.levels.resistance : null,
      trigger: validation.trigger.status === 'valid' ? forecast.levels.trigger : null,
      stopLoss: validation.stopLoss.status === 'valid' ? forecast.levels.stopLoss : null,
      invalidation: validateLevel(forecast.levels.invalidation, anchorPrice).status === 'valid'
        ? forecast.levels.invalidation
        : null,
      targets: forecast.levels.targets.filter((level) => validateLevel(level, anchorPrice).status === 'valid'),
    },
    warnings: [
      ...forecast.warnings,
      ...compact([
        validation.support.status === 'invalid' ? `支撑位隐藏：${validation.support.reason}` : null,
        validation.resistance.status === 'invalid' ? `压力位隐藏：${validation.resistance.reason}` : null,
        validation.trigger.status === 'invalid' ? `触发价隐藏：${validation.trigger.reason}` : null,
        validation.stopLoss.status === 'invalid' ? `止损价隐藏：${validation.stopLoss.reason}` : null,
      ]),
    ],
  }
}

function deriveOpportunityLevel(finalDecision: FinalDecision): OpportunitySignal['level'] {
  if (finalDecision.strongReminderAllowed) {
    return 'strong'
  }
  if (
    finalDecision.action === 'watch' ||
    finalDecision.action === 'probe' ||
    finalDecision.action === 'confirm_then_enter'
  ) {
    return finalDecision.signalGrade === 'watch' ||
      finalDecision.signalGrade === 'qualified' ||
      finalDecision.signalGrade === 'strong_watch'
      ? 'watch'
      : 'none'
  }
  return 'none'
}

function buildDecisionViewModel(input: {
  canonicalForecast: CanonicalForecast
  finalDecision: FinalDecision
  latestQuote: QuoteSample
  marketContext: MarketContext
  probabilityModel: OpportunitySignal['probabilityModel']
  sourceStatus: SourceStatus
  tradePlan: TradePlan
}): DecisionViewModel {
  const {
    canonicalForecast,
    finalDecision,
    latestQuote,
    marketContext,
    probabilityModel,
    sourceStatus,
    tradePlan,
  } = input
  const prediction = probabilityModel.primaryPrediction
  const calibrationStatus = buildCalibrationStatus(finalDecision, prediction)
  const probabilityDisplay = buildDecisionProbabilityDisplay(finalDecision, prediction, calibrationStatus)
  const probabilityPolicy = buildProbabilityDisplayPolicy(probabilityDisplay, calibrationStatus)
  const levelValidation = buildLevelValidation(canonicalForecast, latestQuote.price)
  const executionState = deriveExecutionState(finalDecision, tradePlan, levelValidation, latestQuote.price)
  const actionAllowed =
    finalDecision.strongReminderAllowed &&
    executionState === 'trigger_armed' &&
    Boolean(tradePlan.triggerPrice) &&
    Boolean(tradePlan.stopLoss) &&
    Boolean(tradePlan.takeProfit1) &&
    tradePlan.riskRewardRatio !== null &&
    tradePlan.riskRewardRatio >= 2.5
  const actionBlockedReason = actionAllowed ? null : buildActionBlockedReason(executionState, finalDecision, levelValidation)
  const backtestValidity = buildDecisionBacktestValidity(calibrationStatus)
  const sourceHealth = buildSourceHealthViewModel(sourceStatus, latestQuote, marketContext)
  const sourceWarnings = compact([
    sourceStatus.stale ? '主报价源陈旧，禁止把当前读数当作实时买点依据。' : null,
    sourceStatus.active === 'fallback' ? '当前使用备用行情源，需等官方源恢复后再复核。' : null,
    latestQuote.marketReference.calibration.withinReferenceRange === false
      ? '交易价与参考锚点偏离过大，报价口径不一致。'
      : null,
    latestQuote.marketReference.calibration.premiumPercent === null
      ? '缺少上金所/AU9999 锚点，无法确认当前价格是否真的便宜。'
      : null,
  ])

  return {
    version: 'decision-view-v3',
    action: actionAllowed ? finalDecision.action : executionState === 'reduce_position' ? 'reduce' : executionState === 'no_trade' || executionState === 'invalidated' ? 'avoid' : 'watch',
    displayGrade: finalDecision.signalGrade,
    primaryInstruction: finalDecision.userAdvice,
    beginnerInstruction: finalDecision.beginnerAdvice,
    canAct: actionAllowed,
    executionState,
    singleCommand: buildSingleCommand(executionState, tradePlan, levelValidation, actionBlockedReason),
    actionAllowed,
    actionBlockedReason,
    displayGuards: compact([
      probabilityDisplay.mode !== 'calibrated' ? probabilityDisplay.reason : null,
      backtestValidity.metricsEnabled ? null : backtestValidity.freezeReason,
      ...sourceWarnings,
      finalDecision.blockedReasons[0] ?? null,
      executionState === 'trigger_missed' ? '原触发价已经失效，不能追价补票。' : null,
    ]),
    triggerPrice: tradePlan.triggerPrice,
    stopLoss: tradePlan.stopLoss,
    takeProfit1: tradePlan.takeProfit1,
    riskRewardRatio: tradePlan.riskRewardRatio,
    probabilityDisplay,
    probabilityPolicy,
    calibrationStatus,
    levelValidation,
    validatedLevels: levelValidation,
    backtestValidity,
    sourceHealth,
    sourceLedger: null,
    sourceWarnings,
    journalPreview: null,
    blockerSummary: finalDecision.blockedReasons[0] ?? finalDecision.downgradeReasons[0] ?? '暂无硬性拦截，继续按交易计划复核。',
    updatedAt: canonicalForecast.generatedAt,
  }
}

function buildCanonicalSuccessRate(
  finalDecision: FinalDecision,
  prediction: ProbabilityPrediction,
): CanonicalForecast['successRate'] {
  if (!canShowCalibratedProbability(finalDecision, prediction)) {
    return {
      value: null,
      source: 'unavailable',
      label: '样本不足或校准未通过，不展示 TP1 先达概率。',
    }
  }
  return {
    value: roundProbability(prediction.probability),
    source: 'probabilityModel',
    label: '校准后 TP1 先达概率。',
  }
}

function canShowCalibratedProbability(
  finalDecision: FinalDecision,
  prediction: ProbabilityPrediction,
) {
  const hasUsableSample = finalDecision.sampleStatus === 'usable' || finalDecision.sampleStatus === 'robust'
  const brierOk = prediction.brierScore !== null && Number.isFinite(prediction.brierScore) && prediction.brierScore <= 0.24
  return hasUsableSample && brierOk && !finalDecision.hardGates.some((gate) => gate.status === 'block')
}

function deriveExecutionState(
  finalDecision: FinalDecision,
  tradePlan: TradePlan,
  levelValidation: DecisionViewModel['levelValidation'],
  currentPrice: number,
): DecisionViewModel['executionState'] {
  if (tradePlan.action === 'take_profit_or_reduce' || finalDecision.action === 'reduce') {
    return 'reduce_position'
  }
  if (levelValidation.trigger.status === 'invalid' && tradePlan.triggerPrice !== null && tradePlan.triggerPrice <= currentPrice) {
    return 'trigger_missed'
  }
  if (finalDecision.signalGrade === 'blocked' || finalDecision.action === 'avoid') {
    return 'no_trade'
  }
  if (levelValidation.stopLoss.status === 'valid' && levelValidation.stopLoss.price !== null && currentPrice <= levelValidation.stopLoss.price) {
    return 'invalidated'
  }
  if (levelValidation.trigger.status === 'valid' && finalDecision.action === 'confirm_then_enter') {
    return 'trigger_armed'
  }
  if (levelValidation.trigger.status === 'valid') {
    return 'waiting_for_trigger'
  }
  return 'watch_only'
}

function buildActionBlockedReason(
  executionState: DecisionViewModel['executionState'],
  finalDecision: FinalDecision,
  levelValidation: DecisionViewModel['levelValidation'],
) {
  if (executionState === 'trigger_missed') {
    return levelValidation.trigger.reason || '原触发价已经低于或等于当前价，追入会破坏计划赔率。'
  }
  if (executionState === 'invalidated') {
    return '当前价已经触及或跌破失效/止损条件，计划作废。'
  }
  if (executionState === 'no_trade') {
    return finalDecision.blockedReasons[0] ?? '硬闸门未通过，禁止开新仓。'
  }
  if (executionState === 'watch_only' || executionState === 'waiting_for_trigger') {
    return finalDecision.downgradeReasons[0] ?? '仍缺少触发确认，先观察不追价。'
  }
  return null
}

function buildSingleCommand(
  executionState: DecisionViewModel['executionState'],
  tradePlan: TradePlan,
  levelValidation: DecisionViewModel['levelValidation'],
  actionBlockedReason: string | null,
) {
  switch (executionState) {
    case 'trigger_missed':
      return `机会已错过，不追；等待回踩重新站稳或出现新结构。${actionBlockedReason ?? ''}`
    case 'trigger_armed':
      return `只在触发价 ${formatMaybeCurrency(tradePlan.triggerPrice)} 有效确认后分批参与，跌破 ${formatMaybeCurrency(tradePlan.stopLoss)} 退出。`
    case 'waiting_for_trigger':
      return `继续等触发价 ${formatMaybeCurrency(tradePlan.triggerPrice)}，未确认前不开新仓。`
    case 'invalidated':
      return `计划已失效，先退出观察；${actionBlockedReason ?? levelValidation.stopLoss.reason}`
    case 'reduce_position':
      return '优先止盈或降仓，不再把当前结构当作新买点。'
    case 'no_trade':
      return `禁止开新仓；${actionBlockedReason ?? '硬闸门未通过。'}`
    case 'watch_only':
    default:
      return `只观察，不开新仓；${actionBlockedReason ?? '等待更清晰确认。'}`
  }
}

function buildDecisionBacktestValidity(
  calibrationStatus: DecisionViewModel['calibrationStatus'],
): DecisionViewModel['backtestValidity'] {
  const minSamplesRequired = 30
  const hasUsableSample = calibrationStatus.sampleStatus === 'usable' || calibrationStatus.sampleStatus === 'robust'
  const brierOk = calibrationStatus.brierScore !== null &&
    Number.isFinite(calibrationStatus.brierScore) &&
    calibrationStatus.brierScore <= 0.24
  const metricsEnabled = hasUsableSample && brierOk
  return {
    completeSamples: calibrationStatus.sampleSize,
    incompleteSampleRate: null,
    metricsEnabled,
    freezeReason: metricsEnabled
      ? null
      : !hasUsableSample
        ? `样本 ${calibrationStatus.sampleSize} 个，未达到 ${minSamplesRequired} 个合格样本门槛。`
        : 'Brier 校准误差偏高，暂不参与实时概率校准。',
    minSamplesRequired,
  }
}

function buildSourceHealthViewModel(
  sourceStatus: SourceStatus,
  latestQuote: QuoteSample,
  marketContext: MarketContext,
): DecisionViewModel['sourceHealth'] {
  const activeChannel = getActiveChannelStatus(sourceStatus)
  const tradeSourceStatus: DecisionViewModel['sourceHealth']['tradeSourceStatus'] = sourceStatus.stale
    ? 'stale'
    : sourceStatus.active === 'fallback'
      ? 'fallback'
      : activeChannel?.status === 'healthy'
        ? 'live'
        : 'offline'
  const calibration = latestQuote.marketReference.calibration
  const referenceSourceStatus: DecisionViewModel['sourceHealth']['referenceSourceStatus'] = calibration.withinReferenceRange === false
    ? 'diverged'
    : calibration.premiumPercent === null
      ? 'missing'
      : 'live'
  const providerTotal = marketContext.providerHealth.length
  const providerLive = marketContext.providerHealth.filter((provider) => provider.status === 'live').length
  const providerProbeStatus: DecisionViewModel['sourceHealth']['providerProbeStatus'] = providerTotal === 0
    ? 'missing'
    : providerLive === providerTotal
      ? 'live'
      : 'partial'
  const macroMirrorStatus: DecisionViewModel['sourceHealth']['macroMirrorStatus'] =
    marketContext.macroRegimeEvidence?.isProductionEligible ||
    marketContext.macroFactors.some((factor) => factor.isProductionEligible === true || factor.sourceUsage === 'production_realtime')
      ? 'production_eligible'
      : marketContext.macroFactors.length > 0
        ? 'learning_only'
        : 'unknown'
  const warnings = compact([
    tradeSourceStatus !== 'live' ? '主交易报价不是实时健康状态。' : null,
    referenceSourceStatus === 'missing' ? '缺少上金所/AU9999 等参考锚点。' : null,
    referenceSourceStatus === 'diverged' ? '交易价与参考锚点偏离过大。' : null,
    providerProbeStatus === 'missing' ? '专业 provider 探针暂无可用结论。' : null,
    macroMirrorStatus === 'learning_only' ? '宏观镜像仅用于离线校准，不作为实时买点依据。' : null,
  ])
  return {
    tradeSourceStatus,
    referenceSourceStatus,
    macroMirrorStatus,
    providerProbeStatus,
    canUseForStrongSignal: tradeSourceStatus === 'live' && referenceSourceStatus === 'live' && providerProbeStatus !== 'missing',
    warnings,
  }
}

function buildCalibrationStatus(
  finalDecision: FinalDecision,
  prediction: ProbabilityPrediction,
): DecisionViewModel['calibrationStatus'] {
  const hasUsableSample = finalDecision.sampleStatus === 'usable' || finalDecision.sampleStatus === 'robust'
  const hasBrier = prediction.brierScore !== null && Number.isFinite(prediction.brierScore)
  const brierOk = hasBrier && prediction.brierScore !== null && prediction.brierScore <= 0.24
  const canShowNumericProbability = canShowCalibratedProbability(finalDecision, prediction)
  const reason = canShowNumericProbability
    ? `样本 ${prediction.sampleSize} 个，Brier ${prediction.brierScore?.toFixed(3)}，允许展示校准后概率。`
    : !hasUsableSample
      ? `样本 ${prediction.sampleSize} 个，未达到 30 个合格样本门槛。`
      : !hasBrier
        ? '缺少 Brier 校准误差，不能把倾向展示成精确概率。'
        : !brierOk
          ? `Brier ${prediction.brierScore?.toFixed(3)} 未达标，概率仅供模型内部降权参考。`
          : '存在硬闸门拦截，概率不能覆盖风控结论。'

  return {
    sampleSize: prediction.sampleSize,
    brierScore: prediction.brierScore,
    sampleStatus: finalDecision.sampleStatus,
    canShowNumericProbability,
    reason,
  }
}

function buildDecisionProbabilityDisplay(
  finalDecision: FinalDecision,
  prediction: ProbabilityPrediction,
  calibrationStatus: DecisionViewModel['calibrationStatus'],
): DecisionViewModel['probabilityDisplay'] {
  if (finalDecision.hardGates.some((gate) => gate.status === 'block')) {
    return {
      mode: 'hidden',
      value: null,
      label: '概率隐藏',
      reason: '存在硬闸门拦截，页面不展示精确上涨概率，避免覆盖风控结论。',
    }
  }
  if (calibrationStatus.canShowNumericProbability) {
    return {
      mode: 'calibrated',
      value: roundProbability(prediction.probability),
      label: '校准后 TP1 先达概率',
      reason: calibrationStatus.reason,
    }
  }
  if (calibrationStatus.sampleStatus === 'warming_up') {
    return {
      mode: 'tendency',
      value: null,
      label: prediction.probability >= 0.54 ? '未校准偏多倾向' : prediction.probability <= 0.46 ? '未校准偏空倾向' : '未校准中性倾向',
      reason: calibrationStatus.reason,
    }
  }
  return {
    mode: 'hidden',
    value: null,
    label: '样本不足',
    reason: calibrationStatus.reason,
  }
}

function buildProbabilityDisplayPolicy(
  probabilityDisplay: DecisionViewModel['probabilityDisplay'],
  calibrationStatus: DecisionViewModel['calibrationStatus'],
): DecisionViewModel['probabilityPolicy'] {
  if (probabilityDisplay.mode === 'calibrated' && probabilityDisplay.value !== null) {
    return {
      status: 'show_calibrated',
      canShowPrecise: true,
      minSamplesRequired: 30,
      reason: calibrationStatus.reason,
    }
  }
  return {
    status: probabilityDisplay.mode === 'tendency' ? 'tendency_only' : 'hide_precise',
    canShowPrecise: false,
    minSamplesRequired: 30,
    reason: probabilityDisplay.reason || calibrationStatus.reason,
  }
}

function buildLevelValidation(
  canonicalForecast: CanonicalForecast,
  anchorPrice: number,
): DecisionViewModel['levelValidation'] {
  const support = validateLevel(canonicalForecast.levels.support, anchorPrice)
  const resistance = validateLevel(canonicalForecast.levels.resistance, anchorPrice)
  const trigger = validateLevel(canonicalForecast.levels.trigger, anchorPrice)
  const stopLoss = validateLevel(canonicalForecast.levels.stopLoss, anchorPrice)
  const takeProfit1 = validateLevel(canonicalForecast.levels.targets[0] ?? null, anchorPrice)
  const minGap = Math.max(anchorPrice * 0.00035, 0.08)

  if (
    support.status === 'valid' &&
    resistance.status === 'valid' &&
    support.price !== null &&
    resistance.price !== null &&
    Math.abs(resistance.price - support.price) < minGap
  ) {
    return {
      support: { ...support, status: 'invalid', reason: '支撑与压力距离过近，关键区间未真正形成。' },
      resistance: { ...resistance, status: 'invalid', reason: '支撑与压力距离过近，关键区间未真正形成。' },
      trigger,
      stopLoss,
      takeProfit1,
    }
  }

  return { support, resistance, trigger, stopLoss, takeProfit1 }
}

function validateLevel(
  level: PriceLevel | null,
  anchorPrice: number,
): DecisionViewModel['levelValidation']['support'] {
  if (!level) {
    return { price: null, status: 'missing', reason: '暂无足够结构样本形成该关键价。' }
  }
  const minGap = Math.max(anchorPrice * 0.00025, 0.06)
  if (Math.abs(level.price - anchorPrice) < minGap) {
    return { price: level.price, status: 'invalid', reason: '关键价与当前价过近，不能作为独立触发/止损依据。' }
  }
  if ((level.role === 'support' || level.role === 'stopLoss' || level.role === 'invalidation') && level.price >= anchorPrice) {
    return { price: level.price, status: 'invalid', reason: '下方关键价不应高于或等于当前交易价。' }
  }
  if ((level.role === 'resistance' || level.role === 'trigger' || level.role === 'takeProfit') && level.price <= anchorPrice) {
    return { price: level.price, status: 'invalid', reason: '上方关键价不应低于或等于当前交易价。' }
  }
  return { price: level.price, status: 'valid', reason: level.note }
}

function buildPriceLevel(
  price: number | null | undefined,
  role: NonNullable<CanonicalForecast['levels']['support']>['role'],
  source: NonNullable<CanonicalForecast['levels']['support']>['source'],
  confidence: number | null,
  note: string,
) {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }
  return {
    price: roundPrice(price),
    role,
    source,
    confidence,
    note,
  }
}

function selectPrimaryOverlayPattern(patterns: PatternSignal[], finalDecision: FinalDecision) {
  const confirmedBullish = patterns.find((pattern) => pattern.direction === 'bullish' && isConfirmedPattern(pattern))
  if (finalDecision.action === 'reduce' || finalDecision.action === 'avoid') {
    return patterns.find((pattern) => pattern.direction === 'bearish') ?? confirmedBullish ?? patterns[0] ?? null
  }
  return confirmedBullish ??
    patterns.find((pattern) => pattern.direction === 'bullish') ??
    patterns.find((pattern) => pattern.direction === 'bearish') ??
    patterns[0] ??
    null
}

function buildCanonicalInterval(input: {
  price: number
  prediction: ProbabilityPrediction
  resistance: number | null
  stats: QuoteApiResponse['stats24h']
  stopLoss: number | null
  support: number | null
  target: number | null
}) {
  const rangeMove = input.stats.high24h > input.stats.low24h
    ? (input.stats.high24h - input.stats.low24h) * 0.22
    : 0
  const baseMove = Math.max(input.price * 0.0022, rangeMove, input.price * 0.0035)
  const skew = (input.prediction.probability - 0.5) * input.price * 0.004
  const rawLow = input.price - baseMove + Math.min(skew, 0)
  const rawHigh = input.price + baseMove + Math.max(skew, 0)
  return {
    low: Math.min(
      rawLow,
      input.support ?? rawLow,
      input.stopLoss !== null ? input.stopLoss + Math.abs(input.price - input.stopLoss) * 0.35 : rawLow,
    ),
    high: Math.max(
      rawHigh,
      input.resistance ?? rawHigh,
      input.target !== null ? input.target - Math.abs(input.target - input.price) * 0.35 : rawHigh,
    ),
  }
}

function chooseNearestBelow(values: Array<number | null | undefined>, anchor: number) {
  return values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value <= anchor * 1.001)
    .sort((left, right) => right - left)[0] ?? null
}

function chooseNearestAbove(values: Array<number | null | undefined>, anchor: number) {
  return values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= anchor * 0.999)
    .sort((left, right) => left - right)[0] ?? null
}

function roundNullablePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? roundPrice(value) : null
}

function roundProbability(value: number) {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000
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
  knowledgeRuleAudit: KnowledgeRuleAudit,
  reasons: string[],
  risks: string[],
) {
  const confidenceWeight = clamp(prediction.confidence / 100 * 0.24, 0.08, 0.24)
  const probabilityScore = clamp(prediction.probability * 100, 0, 100)
  const blendedScore = ruleCappedScore * (1 - confidenceWeight) + probabilityScore * confidenceWeight
  const hasCalibration = prediction.sampleSize >= 20 && (prediction.brierScore === null || prediction.brierScore <= 0.24)
  const boostedBlockedByKnowledge = knowledgeRuleAudit.checks.some((check) =>
    check.status === 'block' && (check.id === 'kb:false-breakout' || check.id === 'kb:chop-and-compression')
  )
  const maxBoost = boostedBlockedByKnowledge ? 0 : hasCalibration ? 8 : 4
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
  if (boostedBlockedByKnowledge && blendedScore > ruleCappedScore) {
    risks.push('知识库已触发假突破/震荡硬过滤，概率模型本轮只允许降权，不能反向抬高分数。')
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
    if (pattern.confirmationStatus === 'failed') {
      adjustment -= 5
      risks.push(`${pattern.label}：${pattern.stateReason ?? pattern.summary} 冷却 ${pattern.cooldownBars ?? 6} 根K线，不能作为买点依据。`)
      continue
    }
    const weight = Math.round((pattern.confidence - 50) / 10)
    const confirmed = isConfirmedPattern(pattern)
    if (pattern.direction === 'bullish') {
      if (confirmed) {
        adjustment += Math.max(0, Math.min(8, weight + 3))
        reasons.push(`${pattern.label}：${pattern.summary} 关键价 ${formatCurrency(pattern.keyPrice)}，失效价 ${formatMaybeCurrency(pattern.invalidationPrice)}。`)
      } else {
        adjustment += Math.max(0, Math.min(2, weight))
        reasons.push(`${pattern.label}仍是候选：${pattern.summary} 需要先确认 ${formatMaybeCurrency(pattern.confirmationPrice ?? pattern.necklinePrice)}，失效价 ${formatMaybeCurrency(pattern.invalidationPrice)}。`)
        risks.push(`${pattern.label}尚未确认，不能单独放大买点评分。`)
      }
    } else if (pattern.direction === 'bearish') {
      adjustment -= confirmed ? Math.max(2, Math.min(8, weight + 3)) : Math.max(1, Math.min(4, weight + 2))
      risks.push(`${pattern.label}${confirmed ? '' : '候选'}：${pattern.summary} 阻力/关键价 ${formatCurrency(pattern.keyPrice)}，突破失效 ${formatMaybeCurrency(pattern.invalidationPrice)}。`)
    }
  }

  return clamp(adjustment, -10, 10)
}

function isConfirmedPattern(pattern: PatternSignal) {
  if (pattern.confirmationStatus) {
    return pattern.confirmationStatus === 'confirmed'
  }
  return pattern.expectedConfirmationBars <= 1
}

function buildFinalDecision(input: {
  confluence: MultiTimeframeConfluence
  eventRisk: EconomicEventRisk
  externalModelAdvisor: ExternalModelAdvisor | null
  finalScore: number
  latestQuote: QuoteSample
  knowledgeRuleAudit: KnowledgeRuleAudit
  marketContext: MarketContext
  patternSignals: PatternSignal[]
  probabilityModel: OpportunitySignal['probabilityModel']
  psychology: PsychologyDiscipline
  sourceStatus: SourceStatus
  tradePlan: TradePlan
}): FinalDecision {
  const {
    confluence,
    eventRisk,
    externalModelAdvisor,
    finalScore,
    latestQuote,
    knowledgeRuleAudit,
    marketContext,
    patternSignals,
    probabilityModel,
    psychology,
    sourceStatus,
    tradePlan,
  } = input
  const activeChannel = getActiveChannelStatus(sourceStatus)
  const calibration = latestQuote.marketReference.calibration
  const prediction = probabilityModel.primaryPrediction
  const sampleStatus = getDecisionSampleStatus(prediction.sampleSize)
  const confirmedBullishPattern = patternSignals.find((pattern) => pattern.direction === 'bullish' && isConfirmedPattern(pattern))
  const criticalProviderFailures = getCriticalProviderFailures(marketContext)
  const liveFactorCount = countLiveFactors(marketContext)
  const totalFactorCount = countTotalFactors(marketContext)
  const liveCoverage = totalFactorCount > 0 ? liveFactorCount / totalFactorCount : null
  const externalGate = externalModelAdvisor?.backtestGate

  const hardGates: FinalDecisionGate[] = [
    sourceStatus.stale || activeChannel?.status !== 'healthy'
      ? {
          id: 'data-health',
          label: '实时数据',
          status: 'block',
          reason: '主报价源陈旧或不健康，任何买点都只能降级观察。',
        }
      : sourceStatus.active === 'fallback'
        ? {
            id: 'data-health',
            label: '实时数据',
            status: 'watch',
            reason: '当前使用备用源，需等官方源恢复后再确认。',
          }
        : {
            id: 'data-health',
            label: '实时数据',
            status: 'pass',
            reason: '主报价源健康且未陈旧。',
          },
    calibration.withinReferenceRange === false
      ? {
          id: 'anchor-consensus',
          label: '锚点一致',
          status: 'block',
          reason: '工银价格与上金所参考锚点偏离超过容忍范围。',
        }
      : calibration.premiumPercent === null
        ? {
            id: 'anchor-consensus',
            label: '锚点一致',
            status: 'watch',
            reason: '缺少上金所锚点折溢价，不能确认价格是否真的便宜。',
          }
        : Math.abs(calibration.premiumPercent) > 0.018
          ? {
              id: 'anchor-consensus',
              label: '锚点一致',
              status: 'watch',
              reason: `相对锚点偏离 ${formatPercent(calibration.premiumPercent)}，买点质量需要打折。`,
            }
          : {
              id: 'anchor-consensus',
              label: '锚点一致',
              status: 'pass',
              reason: '工银价格与参考锚点处在可接受区间。',
            },
    criticalProviderFailures.length >= 3
      ? {
          id: 'provider-coverage',
          label: '多源覆盖',
          status: 'block',
          reason: `关键专业源失败 ${criticalProviderFailures.length} 个，多源校准不足。`,
        }
      : liveCoverage !== null && liveCoverage < 0.45
        ? {
            id: 'provider-coverage',
            label: '多源覆盖',
            status: 'watch',
            reason: `可用专业因子 ${liveFactorCount}/${totalFactorCount}，覆盖率不足。`,
          }
        : {
            id: 'provider-coverage',
            label: '多源覆盖',
            status: 'pass',
            reason: '多源因子覆盖满足当前观察要求。',
          },
    eventRisk.level === 'critical' || eventRisk.level === 'elevated'
      ? {
          id: 'event-risk',
          label: '事件风控',
          status: 'block',
          reason: eventRisk.summary,
        }
      : eventRisk.level === 'watch'
        ? {
            id: 'event-risk',
            label: '事件风控',
            status: 'watch',
            reason: eventRisk.summary,
          }
        : {
            id: 'event-risk',
            label: '事件风控',
            status: 'pass',
            reason: '未进入重大事件冲击窗口。',
          },
    tradePlan.riskRewardRatio === null || tradePlan.riskRewardRatio < 2
      ? {
          id: 'risk-reward',
          label: '赔率',
          status: 'block',
          reason: '交易计划风险收益比不足 2:1。',
        }
      : tradePlan.riskRewardRatio < 2.5
        ? {
            id: 'risk-reward',
            label: '赔率',
            status: 'watch',
            reason: `风险收益比 ${tradePlan.riskRewardRatio}:1，未达到强提醒门槛。`,
          }
        : {
            id: 'risk-reward',
            label: '赔率',
            status: 'pass',
            reason: `风险收益比 ${tradePlan.riskRewardRatio}:1，满足强提醒赔率要求。`,
          },
    buildTradePlanLevelGate(tradePlan, latestQuote.price),
    psychology.action === 'stand_down' || psychology.action === 'review_only'
      ? {
          id: 'discipline',
          label: '交易纪律',
          status: 'block',
          reason: psychology.summary,
        }
      : psychology.action === 'reduce_size'
        ? {
            id: 'discipline',
            label: '交易纪律',
            status: 'watch',
            reason: psychology.summary,
          }
        : {
            id: 'discipline',
            label: '交易纪律',
            status: 'pass',
            reason: '心理纪律未触发追高、冲动或复仇交易拦截。',
          },
    confluence.conflictLevel === 'severe'
      ? {
          id: 'timeframe-confluence',
          label: '周期共振',
          status: 'block',
          reason: confluence.summary,
        }
      : confluence.conflictLevel === 'mild'
        ? {
            id: 'timeframe-confluence',
            label: '周期共振',
            status: 'watch',
            reason: confluence.summary,
          }
        : {
            id: 'timeframe-confluence',
            label: '周期共振',
            status: 'pass',
            reason: confluence.summary,
          },
    confirmedBullishPattern
      ? {
          id: 'pattern-confirmation',
          label: '形态确认',
          status: 'pass',
          reason: `${confirmedBullishPattern.label}已确认：${confirmedBullishPattern.confirmationReason ?? confirmedBullishPattern.summary}`,
        }
      : patternSignals.some((pattern) => pattern.direction === 'bullish')
        ? {
            id: 'pattern-confirmation',
            label: '形态确认',
            status: 'watch',
            reason: '存在看多候选形态，但尚未完成颈线/支撑反弹确认。',
          }
        : {
            id: 'pattern-confirmation',
            label: '形态确认',
            status: 'watch',
            reason: '暂无已确认看多结构，不能把规则分直接放大为强买点。',
          },
    (sampleStatus === 'robust' || sampleStatus === 'usable') &&
      prediction.brierScore !== null &&
      Number.isFinite(prediction.brierScore) &&
      prediction.brierScore <= 0.24
      ? {
          id: 'walk-forward-sample',
          label: '历史验证',
          status: 'pass',
          reason: `概率样本 ${prediction.sampleSize} 个，Brier ${prediction.brierScore.toFixed(3)}，已可用于低权重校准。`,
        }
      : {
          id: 'walk-forward-sample',
          label: '历史验证',
          status: 'watch',
          reason: prediction.brierScore !== null && Number.isFinite(prediction.brierScore) && prediction.brierScore > 0.24
            ? `概率样本 ${prediction.sampleSize} 个，但 Brier ${prediction.brierScore.toFixed(3)} 未达标，暂不展示精确概率。`
            : `概率样本 ${prediction.sampleSize} 个，尚未达到稳定样本外验证。`,
        },
    !externalModelAdvisor || externalModelAdvisor.status === 'unconfigured'
      ? {
          id: 'external-advisor',
          label: '模型军师',
          status: 'watch',
          reason: '外部时序基础模型未配置，不能参与强提醒放大。',
        }
      : externalModelAdvisor.status === 'error'
        ? {
            id: 'external-advisor',
            label: '模型军师',
            status: 'watch',
            reason: `外部模型暂不可用：${externalModelAdvisor.summary}`,
          }
        : externalGate?.status === 'weak'
          ? {
              id: 'external-advisor',
              label: '模型军师',
              status: 'block',
              reason: externalGate.summary,
            }
          : externalGate?.status === 'insufficient' || !externalGate
            ? {
                id: 'external-advisor',
                label: '模型军师',
                status: 'watch',
                reason: externalGate?.summary ?? '缺少外部模型分桶回测约束。',
              }
            : {
                id: 'external-advisor',
                label: '模型军师',
                status: 'pass',
                reason: externalGate.summary,
            },
  ]
  hardGates.push(...buildKnowledgeRuleGates(knowledgeRuleAudit))

  const blockedReasons = hardGates.filter((gate) => gate.status === 'block').map((gate) => `${gate.label}：${gate.reason}`)
  const downgradeReasons = hardGates.filter((gate) => gate.status === 'watch').map((gate) => `${gate.label}：${gate.reason}`)
  const allGatesPassed = hardGates.every((gate) => gate.status === 'pass')
  const strongReminderAllowed =
    finalScore >= 72 &&
    tradePlan.confidence === 'high' &&
    tradePlan.action === 'confirm_then_enter' &&
    allGatesPassed
  const signalGrade: FinalDecision['signalGrade'] = blockedReasons.length > 0
    ? 'blocked'
    : strongReminderAllowed
      ? 'strong_watch'
      : finalScore >= 68 && downgradeReasons.length <= 2
        ? 'qualified'
        : finalScore >= 45
          ? 'watch'
          : 'low'
  const action = mapFinalDecisionAction(signalGrade, tradePlan)
  const confidenceGrade = getFinalDecisionConfidenceGrade(sampleStatus, prediction, hardGates)

  return {
    action,
    actionLabel: finalDecisionActionLabel(action),
    signalGrade,
    strongReminderAllowed,
    userAdvice: buildFinalDecisionAdvice(signalGrade, tradePlan, blockedReasons, downgradeReasons),
    beginnerAdvice: buildBeginnerDecisionAdvice(signalGrade, tradePlan, blockedReasons, downgradeReasons),
    blockedReasons,
    downgradeReasons,
    hardGates,
    confidenceGrade,
    confidenceExplanation: buildConfidenceExplanation(sampleStatus, prediction),
    accuracyExplanation: buildAccuracyExplanation(sampleStatus, hardGates, prediction),
    sampleStatus,
  }
}

function buildKnowledgeRuleGates(audit: KnowledgeRuleAudit): FinalDecisionGate[] {
  const blocked = audit.checks.filter((check) => check.status === 'block')
  const watch = audit.checks.filter((check) => check.status === 'watch')
  if (blocked.length > 0) {
    const reason = summarizeKnowledgeGateReasons(blocked)
    return [{
      id: 'kb:rule-pack',
      label: '知识库规则',
      status: 'block',
      reason,
    }]
  }
  if (watch.length > 0) {
    const reason = summarizeKnowledgeGateReasons(watch)
    return [{
      id: 'kb:rule-pack',
      label: '知识库规则',
      status: 'watch',
      reason,
    }]
  }
  return [{
    id: 'kb:rule-pack',
    label: '知识库规则',
    status: 'pass',
    reason: audit.summary,
  }]
}

function summarizeKnowledgeGateReasons(checks: KnowledgeRuleAudit['checks']) {
  const topReasons = checks
    .slice(0, 3)
    .map((check) => `${check.label}：${check.reason}`)
  const suffix = checks.length > 3 ? `；另有 ${checks.length - 3} 项待复核` : ''
  return `${topReasons.join('；')}${suffix}`
}

function getDecisionSampleStatus(sampleSize: number): FinalDecision['sampleStatus'] {
  if (sampleSize >= 120) {
    return 'robust'
  }
  if (sampleSize >= 30) {
    return 'usable'
  }
  if (sampleSize >= 15) {
    return 'warming_up'
  }
  return 'insufficient'
}

function getFinalDecisionConfidenceGrade(
  sampleStatus: FinalDecision['sampleStatus'],
  prediction: ProbabilityPrediction,
  gates: FinalDecisionGate[],
): FinalDecision['confidenceGrade'] {
  if (gates.some((gate) => gate.status === 'block') || sampleStatus === 'insufficient') {
    return 'unverified'
  }
  if (sampleStatus === 'warming_up' || prediction.confidence < 45 || gates.some((gate) => gate.status === 'watch')) {
    return 'low'
  }
  if (sampleStatus === 'usable' || prediction.confidence < 70) {
    return 'medium'
  }
  return 'high'
}

function buildTradePlanLevelGate(tradePlan: TradePlan, currentPrice: number): FinalDecisionGate {
  if (tradePlan.action === 'take_profit_or_reduce' || tradePlan.action === 'stand_aside') {
    return {
      id: 'trade-plan-levels',
      label: '计划价位',
      status: 'pass',
      reason: '当前不是新增买入计划，不按做多触发价放大信号。',
    }
  }
  if (tradePlan.triggerPrice !== null && tradePlan.triggerPrice <= currentPrice) {
    return {
      id: 'trade-plan-levels',
      label: '计划价位',
      status: 'block',
      reason: '买入触发价已低于或等于当前价，机会视为已错过，禁止追价。',
    }
  }
  if (tradePlan.stopLoss !== null && tradePlan.stopLoss >= currentPrice) {
    return {
      id: 'trade-plan-levels',
      label: '计划价位',
      status: 'block',
      reason: '止损价不在当前价下方，做多计划失效。',
    }
  }
  if (tradePlan.takeProfit1 !== null && tradePlan.takeProfit1 <= currentPrice) {
    return {
      id: 'trade-plan-levels',
      label: '计划价位',
      status: 'block',
      reason: 'TP1 不在当前价上方，风险收益计划不可执行。',
    }
  }
  if (tradePlan.triggerPrice === null || tradePlan.stopLoss === null || tradePlan.takeProfit1 === null) {
    return {
      id: 'trade-plan-levels',
      label: '计划价位',
      status: 'watch',
      reason: '缺少触发、止损或 TP1，不能生成可执行买点。',
    }
  }
  return {
    id: 'trade-plan-levels',
    label: '计划价位',
    status: 'pass',
    reason: '触发价、止损和 TP1 相对当前价有效。',
  }
}

function mapFinalDecisionAction(
  signalGrade: FinalDecision['signalGrade'],
  tradePlan: TradePlan,
): FinalDecision['action'] {
  if (tradePlan.action === 'take_profit_or_reduce') {
    return 'reduce'
  }
  if (signalGrade === 'blocked') {
    return 'avoid'
  }
  if (tradePlan.action === 'confirm_then_enter') {
    return 'confirm_then_enter'
  }
  if (tradePlan.action === 'probe') {
    return 'probe'
  }
  if (tradePlan.action === 'observe') {
    return 'watch'
  }
  return signalGrade === 'low' ? 'wait' : 'watch'
}

function finalDecisionActionLabel(action: FinalDecision['action']) {
  const labels: Record<FinalDecision['action'], string> = {
    avoid: '回避，不开新仓',
    wait: '等待，不追单',
    watch: '观察，等确认',
    probe: '轻仓试探',
    confirm_then_enter: '确认后分批参与',
    reduce: '止盈或降仓',
  }
  return labels[action]
}

function buildFinalDecisionAdvice(
  signalGrade: FinalDecision['signalGrade'],
  tradePlan: TradePlan,
  blockedReasons: string[],
  downgradeReasons: string[],
) {
  if (blockedReasons.length > 0) {
    return `核心决策：暂不买。先解决 ${blockedReasons[0]}`
  }
  if (signalGrade === 'strong_watch') {
    return `核心决策：强观察。只有站稳触发价 ${formatMaybeCurrency(tradePlan.triggerPrice)} 且止损 ${formatMaybeCurrency(tradePlan.stopLoss)} 有效时，才考虑按计划分批。`
  }
  if (signalGrade === 'qualified') {
    return `核心决策：候选买点。先等触发价 ${formatMaybeCurrency(tradePlan.triggerPrice)}，未确认前不要把观察信号当成买入指令。`
  }
  if (signalGrade === 'watch') {
    return `核心决策：继续观察。还差 ${downgradeReasons[0] ?? '更多样本和形态确认'}。`
  }
  return '核心决策：等待。当前胜率证据不足，先保留现金和耐心。'
}

function buildBeginnerDecisionAdvice(
  signalGrade: FinalDecision['signalGrade'],
  tradePlan: TradePlan,
  blockedReasons: string[],
  downgradeReasons: string[],
) {
  if (blockedReasons.length > 0) {
    return '小白版：现在先别动，不要因为价格跌了就急着买；系统还有硬性风险没通过。'
  }
  if (signalGrade === 'strong_watch') {
    return `小白版：这是少数允许重点盯盘的场景，但也不是无脑买；先看价格能否确认突破 ${formatMaybeCurrency(tradePlan.triggerPrice)}。`
  }
  if (signalGrade === 'qualified') {
    return '小白版：像是一个可以蹲守的机会，但还没到“闭眼冲”的程度，等确认比抢跑更重要。'
  }
  if (signalGrade === 'watch') {
    return `小白版：先看戏，别追。系统提示还差：${downgradeReasons[0] ?? '确认信号'}`
  }
  return '小白版：当前不值得出手，宁可错过，也别在证据不足时亏钱。'
}

function buildConfidenceExplanation(
  sampleStatus: FinalDecision['sampleStatus'],
  prediction: ProbabilityPrediction,
) {
  const sampleText = sampleStatus === 'robust'
    ? '样本较充分'
    : sampleStatus === 'usable'
      ? '样本可用但仍需继续积累'
      : sampleStatus === 'warming_up'
        ? '样本正在预热'
        : '样本严重不足'
  const brierText = prediction.brierScore === null
    ? '暂缺 Brier 校准误差'
    : `Brier ${prediction.brierScore.toFixed(3)}`
  return `${sampleText}，当前预测置信度 ${prediction.confidence}/100，${brierText}。`
}

function buildAccuracyExplanation(
  sampleStatus: FinalDecision['sampleStatus'],
  gates: FinalDecisionGate[],
  prediction: ProbabilityPrediction,
) {
  const blocked = gates.filter((gate) => gate.status === 'block').length
  const watch = gates.filter((gate) => gate.status === 'watch').length
  if (blocked > 0) {
    return `准确率优先模式：${blocked} 道硬闸门未通过，系统宁愿错过也不放大信号。`
  }
  if (watch > 0) {
    return `准确率优先模式：${watch} 道条件仍需确认，当前只给观察，不给强提醒。`
  }
  if (sampleStatus === 'robust' || sampleStatus === 'usable') {
    return `准确率优先模式：硬闸门通过，且概率模型已有 ${prediction.sampleSize} 个样本参与校准。`
  }
  return '准确率优先模式：规则信号存在，但样本外验证不足，暂不允许强提醒。'
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
  const bullishPattern = patternSignals.find((pattern) => pattern.direction === 'bullish' && isConfirmedPattern(pattern))
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
  const eventConfirmationReady = eventRisk.phase !== 'post_confirmation' ||
    (Boolean(bullishPattern) && shortTerm.reboundPercent >= 0.0015 && technicals.shortTrend !== 'falling')
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
    eventRisk.phase === 'post_confirmation' && !eventConfirmationReady ? '事件后确认窗口仍缺整理/回踩/方向一致证据，先观察第一波噪声过去。' : null,
  ])
  const canProbe = finalScore >= 45 && hasHealthyData && !nearHigh
  const canConfirmEnter =
    finalScore >= 72 &&
    hasHealthyData &&
    !macroPressure &&
    eventRisk.level !== 'critical' &&
    eventRisk.level !== 'elevated' &&
    eventConfirmationReady &&
    Boolean(bullishPattern) &&
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
