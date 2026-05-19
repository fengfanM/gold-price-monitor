import type { TechnicalSnapshot } from './technicals.js'
import type {
  EconomicEventRisk,
  HistoryPoint,
  KnowledgeRuleAudit,
  KnowledgeRuleCheck,
  MarketContext,
  MultiTimeframeConfluence,
  PatternSignal,
  QuoteSample,
  QuoteStats24h,
  TradePlan,
  ValuationMetrics,
} from './types.js'

export const KNOWLEDGE_RULE_PACK_VERSION = 'gold-kb-rule-pack-v2'

export function buildKnowledgeRuleAudit(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  stats: QuoteStats24h
  technicals: TechnicalSnapshot
  marketContext: MarketContext
  patternSignals: PatternSignal[]
  confluence: MultiTimeframeConfluence
  eventRisk: EconomicEventRisk
  valuation?: ValuationMetrics
  tradePlan?: TradePlan
}): KnowledgeRuleAudit {
  const features = buildKnowledgeFeatureValues(input)
  const confirmedBullish = input.patternSignals.some((pattern) => pattern.direction === 'bullish' && isConfirmedPattern(pattern))
  const candidateBullish = input.patternSignals.some((pattern) => pattern.direction === 'bullish' && !isConfirmedPattern(pattern))
  const failedPatterns = input.patternSignals.filter((pattern) => pattern.confirmationStatus === 'failed')
  const exhaustionRisks = input.patternSignals.filter((pattern) =>
    pattern.contextTags?.some((tag) => tag === 'blowoff_risk' || tag === 'chase_long_block'),
  )
  const nearRangeMiddle = features.rangePosition !== null && features.rangePosition > 0.38 && features.rangePosition < 0.66
  const nearHigh = features.rangePosition !== null && features.rangePosition >= 0.72
  const eventBlocked = input.eventRisk.level === 'critical' || input.eventRisk.level === 'elevated'
  const tradePlan = input.tradePlan

  const checks: KnowledgeRuleCheck[] = [
    buildCheck({
      id: 'kb:trend-structure',
      label: '知识库趋势结构',
      status: features.trendStructureScore !== null && features.trendStructureScore >= 0.35
        ? 'pass'
        : features.trendStructureScore !== null && features.trendStructureScore <= -0.2
          ? 'block'
          : 'watch',
      reason: features.trendStructureScore !== null && features.trendStructureScore >= 0.35
        ? '短线结构与均线/动量方向相对友好。'
        : features.trendStructureScore !== null && features.trendStructureScore <= -0.2
          ? '短线趋势结构仍偏弱，不能把反弹直接当成反转。'
          : '趋势结构仍未完成二次确认。',
      impactScore: features.trendStructureScore !== null ? Math.round(features.trendStructureScore * 4) : 0,
      theorySource: 'docs/GOLD_TRADING_THEORY_DIGEST.md#3-技术结构与-k-线形态',
    }),
    buildCheck({
      id: 'kb:pattern-location',
      label: '知识库形态位置',
      status: failedPatterns.length > 0 || exhaustionRisks.length > 0
        ? 'block'
        : confirmedBullish && !nearHigh
        ? 'pass'
        : candidateBullish || nearRangeMiddle
          ? 'watch'
          : nearHigh
            ? 'block'
            : 'watch',
      reason: failedPatterns.length > 0
        ? `${failedPatterns[0].label}处于失败/冷却状态，知识库禁止同类强提醒。`
        : exhaustionRisks.length > 0
          ? `${exhaustionRisks[0].label}属于追涨衰竭风险，不能解释成买点。`
          : confirmedBullish && !nearHigh
        ? '看多形态已确认且未处在日内高位追单区。'
        : nearHigh
          ? '价格处在日内高位区，知识库禁止把上涨末端当买点。'
          : candidateBullish
            ? '存在看多候选形态，但尚未完成关键位确认。'
            : '暂无清晰低位形态位置优势。',
      impactScore: failedPatterns.length > 0 || exhaustionRisks.length > 0 ? -6 : confirmedBullish && !nearHigh ? 3 : nearHigh ? -4 : 0,
      theorySource: 'docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md#5-黄金技术分析体系',
    }),
    buildCheck({
      id: 'kb:false-breakout',
      label: '知识库假突破过滤',
      status: (features.breakoutFailureRisk !== null && features.breakoutFailureRisk >= 0.65) ||
        (features.liquiditySweepRisk !== null && features.liquiditySweepRisk >= 0.68)
        ? 'block'
        : (features.breakoutFailureRisk !== null && features.breakoutFailureRisk >= 0.35) ||
            (features.liquiditySweepRisk !== null && features.liquiditySweepRisk >= 0.35)
          ? 'watch'
          : 'pass',
      reason: (features.breakoutFailureRisk !== null && features.breakoutFailureRisk >= 0.65) ||
        (features.liquiditySweepRisk !== null && features.liquiditySweepRisk >= 0.68)
        ? '出现高位、长波动、扫流动性回落或候选形态未确认组合，假突破风险高。'
        : (features.breakoutFailureRisk !== null && features.breakoutFailureRisk >= 0.35) ||
            (features.liquiditySweepRisk !== null && features.liquiditySweepRisk >= 0.35)
          ? '突破/反弹质量仍需回踩或二次结构确认。'
          : '当前未触发明显假突破过滤器。',
      impactScore: -Math.round(
        Math.max(features.breakoutFailureRisk ?? 0, features.liquiditySweepRisk ?? 0) * 5,
      ),
      theorySource: 'docs/reference/kline-gold-trading/KLINE_GOLD_TRADING_REPORT.md#43-假突破',
    }),
    buildCheck({
      id: 'kb:chop-and-compression',
      label: '知识库震荡/压缩过滤',
      status: features.maWhipsawRisk !== null && features.maWhipsawRisk >= 0.75
        ? 'block'
        : (features.maWhipsawRisk !== null && features.maWhipsawRisk >= 0.45) ||
            (features.rangeCompressionScore !== null && features.rangeCompressionScore >= 0.7 && nearRangeMiddle)
          ? 'watch'
          : 'pass',
      reason: features.maWhipsawRisk !== null && features.maWhipsawRisk >= 0.75
        ? '价格围绕均线反复穿越，处于高噪音震荡，不适合放大买点。'
        : (features.maWhipsawRisk !== null && features.maWhipsawRisk >= 0.45) ||
            (features.rangeCompressionScore !== null && features.rangeCompressionScore >= 0.7 && nearRangeMiddle)
          ? '窄幅压缩或均线反复穿越，需等待区间突破后回踩确认。'
          : '未触发明显震荡噪音过滤。',
      impactScore: -Math.round(Math.max(features.maWhipsawRisk ?? 0, nearRangeMiddle ? features.rangeCompressionScore ?? 0 : 0) * 4),
      theorySource: 'docs/reference/kline-gold-trading/sources/public-source-notes.md#2-cfa--fidelity-技术分析框架',
    }),
    buildCheck({
      id: 'kb:event-phase',
      label: '知识库事件分层',
      status: eventBlocked ? 'block' : input.eventRisk.level === 'watch' ? 'watch' : 'pass',
      reason: eventBlocked
        ? `事件风险处于 ${input.eventRisk.level}，禁止追单型强提醒。`
        : input.eventRisk.level === 'watch'
          ? '事件观察窗口内只能等待二次确认。'
          : '未处于重大事件第一波冲击窗口。',
      impactScore: eventBlocked ? -8 : input.eventRisk.level === 'watch' ? -3 : 1,
      theorySource: 'docs/GOLD_TRADING_THEORY_DIGEST.md#1-宏观经济与黄金大环境',
    }),
    buildCheck({
      id: 'kb:macro-evidence-gate',
      label: '知识库宏观资金流',
      status: buildMacroEvidenceStatus(input.marketContext),
      reason: buildMacroEvidenceReason(input.marketContext),
      impactScore: buildMacroEvidenceImpact(input.marketContext),
      theorySource: 'docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md#6-黄金宏观与资金流',
    }),
    buildCheck({
      id: 'kb:risk-reward-discipline',
      label: '知识库赔率纪律',
      status: !tradePlan
        ? 'watch'
        : tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2.5
          ? 'pass'
          : tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2
            ? 'watch'
            : 'block',
      reason: !tradePlan
        ? '交易计划尚未生成，暂不能验证赔率纪律。'
        : tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2.5
          ? `风险收益比 ${tradePlan.riskRewardRatio}:1，满足知识库强提醒要求。`
          : tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2
            ? `风险收益比 ${tradePlan.riskRewardRatio}:1，只能观察或轻仓。`
            : '风险收益比不足 2:1，知识库禁止强提醒。',
      impactScore: !tradePlan ? 0 : tradePlan.riskRewardRatio !== null && tradePlan.riskRewardRatio >= 2.5 ? 2 : -4,
      theorySource: 'docs/GOLD_TRADING_THEORY_DIGEST.md#4-概率交易与回测',
    }),
  ]

  const scoreAdjustment = clamp(
    checks.reduce((sum, check) => sum + check.impactScore, 0),
    -10,
    8,
  )
  const scoreCap = checks.some((check) => check.status === 'block')
    ? 58
    : checks.some((check) => check.status === 'watch')
      ? 72
      : 100
  const supportingReasons = checks.filter((check) => check.status === 'pass').map((check) => `${check.label}：${check.reason}`)
  const opposingReasons = checks.filter((check) => check.status === 'block').map((check) => `${check.label}：${check.reason}`)
  const missingConfirmations = checks.filter((check) => check.status === 'watch').map((check) => `${check.label}：${check.reason}`)
  const invalidationWarnings = compact([
    candidateBullish ? '候选看多形态未确认，必须等待颈线/触发价或回踩成功。' : null,
    nearRangeMiddle ? '价格处于区间中部，知识库不允许把中位震荡当强买点。' : null,
    nearHigh ? '高位追单风险触发，若继续上冲需等待回踩不破再评估。' : null,
    failedPatterns.length > 0 ? `${failedPatterns[0].label}已失败，默认冷却 ${failedPatterns[0].cooldownBars ?? 6} 根当前周期 K 线。` : null,
    exhaustionRisks.length > 0 ? `${exhaustionRisks[0].label}属于加速衰竭，不允许追涨放大。` : null,
    features.rangeCompressionScore !== null && features.rangeCompressionScore >= 0.7 ? '窄幅整理后更容易发生假突破，必须等待收回/回踩确认。' : null,
    features.maWhipsawRisk !== null && features.maWhipsawRisk >= 0.45 ? '均线反复穿越提示震荡噪音，短线信号需降权。' : null,
  ])

  return {
    version: KNOWLEDGE_RULE_PACK_VERSION,
    scoreAdjustment,
    scoreCap,
    checks,
    supportingReasons,
    opposingReasons,
    missingConfirmations,
    invalidationWarnings,
    features,
    summary: buildKnowledgeSummary(checks, scoreAdjustment, scoreCap),
  }
}

export function buildKnowledgeFeatureValues(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  stats: QuoteStats24h
  technicals: TechnicalSnapshot
  marketContext: MarketContext
  patternSignals: PatternSignal[]
  confluence?: MultiTimeframeConfluence
}) {
  const rangeSpan = input.stats.high24h - input.stats.low24h
  const rangePosition = rangeSpan > 0
    ? clamp((input.stats.currentPrice - input.stats.low24h) / rangeSpan, 0, 1)
    : null
  const prices = [...input.history.map((point) => point.price), input.latestQuote.price]
    .filter((price) => Number.isFinite(price) && price > 0)
  const recent = prices.slice(-12)
  const prior = recent.slice(0, -1)
  const structureWindow = prices.slice(-18)
  const sweepBase = prices.slice(-18, -3)
  const sweepProbe = prices.slice(-3)
  const priorHigh = prior.length > 0 ? Math.max(...prior) : input.latestQuote.price
  const priorLow = prior.length > 0 ? Math.min(...prior) : input.latestQuote.price
  const latest = input.latestQuote.price
  const latestMove = prior.length > 0 ? (latest - prior[prior.length - 1]) / prior[prior.length - 1] : 0
  const volatility = standardDeviation(buildReturns(prices))
  const confirmedBullish = input.patternSignals.filter((pattern) => pattern.direction === 'bullish' && isConfirmedPattern(pattern)).length
  const candidateBullish = input.patternSignals.filter((pattern) => pattern.direction === 'bullish' && !isConfirmedPattern(pattern)).length
  const bearish = input.patternSignals.filter((pattern) => pattern.direction === 'bearish').length
  const maAlignment = input.technicals.ma5 !== null && input.technicals.ma10 !== null && input.technicals.ma20 !== null
    ? (input.technicals.ma5 >= input.technicals.ma10 && input.technicals.ma10 >= input.technicals.ma20 ? 1 : input.technicals.ma5 < input.technicals.ma10 && input.technicals.ma10 < input.technicals.ma20 ? -1 : 0)
    : 0
  const trendStructureScore = clamp(
    maAlignment * 0.35 +
      (input.technicals.shortTrend === 'rising' ? 0.25 : input.technicals.shortTrend === 'falling' ? -0.3 : 0) +
      (input.technicals.macd === null ? 0 : input.technicals.macd.histogram > 0 ? 0.18 : -0.18) +
      (input.confluence ? (input.confluence.score - 50) / 180 : 0),
    -1,
    1,
  )
  const patternLocationScore = rangePosition === null
    ? null
    : clamp((confirmedBullish * 0.35 + candidateBullish * 0.12 - bearish * 0.25) + (0.5 - rangePosition) * 0.9, -1, 1)
  const breakoutFailureRisk = clamp(
    (candidateBullish > 0 ? 0.26 : 0) +
      (rangePosition !== null && rangePosition >= 0.72 ? 0.32 : 0) +
      (volatility !== null && volatility > 0.004 ? 0.22 : 0) +
      (latestMove < -0.001 ? 0.2 : 0),
    0,
    1,
  )
  const rangeCompressionScore = buildRangeCompressionScore(structureWindow, input.stats)
  const liquiditySweepRisk = buildLiquiditySweepRisk({
    latest,
    rangePosition,
    sweepBase,
    sweepProbe,
    volatility,
  })
  const maWhipsawRisk = buildMaWhipsawRisk(structureWindow, input.technicals.ma20)
  const sweepReclaimScore = buildSweepReclaimScore({
    latest,
    rangePosition,
    sweepBase,
    sweepProbe,
  })
  const pullbackQuality = rangePosition === null
    ? null
    : clamp(
        (input.stats.drawdownPercent24h >= 0.006 ? 0.25 : 0) +
          (latest > priorLow ? 0.2 : 0) +
          (input.technicals.ma20 !== null && latest <= input.technicals.ma20 * 1.006 ? 0.18 : 0) +
          (rangePosition <= 0.45 ? 0.22 : -0.12),
        -1,
        1,
      )
  const supportResistanceQuality = clamp(
    (priorHigh > priorLow ? Math.min((latest - priorLow) / Math.max(priorHigh - priorLow, latest * 0.0001), 1) : 0.5) * -0.25 +
      (confirmedBullish > 0 ? 0.35 : 0) -
      (bearish > 0 ? 0.3 : 0),
    -1,
    1,
  )
  const macroAlignmentScore = clamp((input.marketContext.factorScore - 50) / 50, -1, 1)

  return {
    trendStructureScore,
    patternLocationScore,
    breakoutFailureRisk,
    pullbackQuality,
    supportResistanceQuality,
    macroAlignmentScore,
    rangeCompressionScore,
    liquiditySweepRisk,
    maWhipsawRisk,
    sweepReclaimScore,
    riskRewardDisciplineScore: null,
    rangePosition,
  }
}

function buildRangeCompressionScore(prices: number[], stats: QuoteStats24h) {
  if (prices.length < 8) {
    return null
  }
  const localRange = Math.max(...prices) - Math.min(...prices)
  const dayRange = stats.high24h > stats.low24h ? stats.high24h - stats.low24h : 0
  if (dayRange <= 0) {
    return null
  }
  return clamp(1 - localRange / dayRange, 0, 1)
}

function buildLiquiditySweepRisk(input: {
  latest: number
  rangePosition: number | null
  sweepBase: number[]
  sweepProbe: number[]
  volatility: number | null
}) {
  if (input.sweepBase.length < 6 || input.sweepProbe.length < 2) {
    return null
  }
  const baseHigh = Math.max(...input.sweepBase)
  const baseLow = Math.min(...input.sweepBase)
  const probeHigh = Math.max(...input.sweepProbe)
  const probeLow = Math.min(...input.sweepProbe)
  const upsideSweepFailed = probeHigh > baseHigh * 1.001 && input.latest < baseHigh
  const downsideBreakExtending = probeLow < baseLow * 0.999 && input.latest <= baseLow
  const highLocation = input.rangePosition !== null && input.rangePosition >= 0.58
  const volatilityPenalty = input.volatility !== null && input.volatility > 0.0035 ? 0.16 : 0
  return clamp(
    (upsideSweepFailed ? 0.48 : 0) +
      (downsideBreakExtending ? 0.36 : 0) +
      (highLocation ? 0.14 : 0) +
      volatilityPenalty,
    0,
    1,
  )
}

function buildSweepReclaimScore(input: {
  latest: number
  rangePosition: number | null
  sweepBase: number[]
  sweepProbe: number[]
}) {
  if (input.sweepBase.length < 6 || input.sweepProbe.length < 2) {
    return null
  }
  const baseLow = Math.min(...input.sweepBase)
  const probeLow = Math.min(...input.sweepProbe)
  const reclaimed = probeLow < baseLow * 0.999 && input.latest > baseLow
  const lowLocation = input.rangePosition !== null && input.rangePosition <= 0.42
  return clamp((reclaimed ? 0.42 : 0) + (lowLocation ? 0.18 : 0), 0, 1)
}

function buildMaWhipsawRisk(prices: number[], ma20: number | null) {
  if (prices.length < 8 || ma20 === null || ma20 <= 0) {
    return null
  }
  let crosses = 0
  let previousSide = Math.sign(prices[0] - ma20)
  for (const price of prices.slice(1)) {
    const side = Math.sign(price - ma20)
    if (side !== 0 && previousSide !== 0 && side !== previousSide) {
      crosses += 1
    }
    if (side !== 0) {
      previousSide = side
    }
  }
  return clamp(crosses / 5, 0, 1)
}

function buildMacroEvidenceStatus(marketContext: MarketContext): KnowledgeRuleCheck['status'] {
  const factors = getMacroEvidenceFactors(marketContext)
  const liveGroups = new Set(factors.filter((factor) => factor.status === 'live').map((factor) => macroEvidenceGroup(factor.id)))
  const pressureGroups = new Set(factors.filter((factor) => factor.impact === 'pressure').map((factor) => macroEvidenceGroup(factor.id)))
  if (pressureGroups.size >= 2) {
    return 'block'
  }
  if (liveGroups.size < 2) {
    return 'watch'
  }
  return 'pass'
}

function buildMacroEvidenceReason(marketContext: MarketContext) {
  const factors = getMacroEvidenceFactors(marketContext)
  const liveGroups = new Set(factors.filter((factor) => factor.status === 'live').map((factor) => macroEvidenceGroup(factor.id)))
  const pressure = factors.filter((factor) => factor.impact === 'pressure')
  if (pressure.length >= 2) {
    return `COT/ETF/CME 等资金流中有 ${pressure.length} 项偏压制，强提醒降级。`
  }
  if (liveGroups.size < 2) {
    return 'COT、ETF、CME OI/Volume 等宏观资金流新鲜度不足，只能中性或降权参考。'
  }
  return '资金流证据覆盖满足观察要求；央行购金只作为中长期背景，不放大日内追涨。'
}

function buildMacroEvidenceImpact(marketContext: MarketContext) {
  const status = buildMacroEvidenceStatus(marketContext)
  return status === 'block' ? -5 : status === 'watch' ? -2 : 1
}

function getMacroEvidenceFactors(marketContext: MarketContext) {
  const ids = new Set(['COT_GOLD_NET', 'GLD_FLOW', 'WGC_ETF_FLOW', 'CME_GOLD_OI', 'CME_GOLD_VOLUME', 'WGC_CENTRAL_BANK'])
  return (marketContext.macroFactors ?? []).filter((factor) => ids.has(factor.id))
}

function macroEvidenceGroup(id: string) {
  if (id.includes('COT')) {
    return 'cot'
  }
  if (id.includes('GLD') || id.includes('ETF')) {
    return 'etf'
  }
  if (id.includes('CME')) {
    return 'cme'
  }
  return 'structural'
}

function buildCheck(input: KnowledgeRuleCheck): KnowledgeRuleCheck {
  return input
}

function isConfirmedPattern(pattern: PatternSignal) {
  if (pattern.confirmationStatus) {
    return pattern.confirmationStatus === 'confirmed'
  }
  return pattern.expectedConfirmationBars <= 1
}

function buildKnowledgeSummary(checks: KnowledgeRuleCheck[], scoreAdjustment: number, scoreCap: number) {
  const blocked = checks.filter((check) => check.status === 'block').length
  const watch = checks.filter((check) => check.status === 'watch').length
  if (blocked > 0) {
    return `知识库规则包拦截 ${blocked} 项，评分调整 ${scoreAdjustment}，上限 ${scoreCap}。`
  }
  if (watch > 0) {
    return `知识库规则包仍有 ${watch} 项待确认，评分调整 ${scoreAdjustment}，上限 ${scoreCap}。`
  }
  return `知识库规则包全部通过，评分调整 ${scoreAdjustment}。`
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

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter(Boolean) as T[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
