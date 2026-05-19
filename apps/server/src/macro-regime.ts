import type { FactorCandle, MacroRegimeEvidence, MarketFactor } from './types.js'

export function buildMacroRegimeEvidence(input: {
  factorCandles?: Record<string, FactorCandle[]>
  liveFactors?: MarketFactor[]
}): MacroRegimeEvidence {
  const candles = input.factorCandles ?? {}
  const liveFactors = input.liveFactors ?? []
  const realRateTrend = classifyPointTrend(candles.DFII10, 0.05)
  const dollarTrend = classifyPercentTrend(candles.DTWEXBGS, 0.004)
  const usdCnyTrend = classifyPercentTrend(candles.DEXCHUS, 0.003)
  const vixState = classifyVix(candles.VIXCLS)
  const inflationPhase = classifyInflationPhase(candles.CPIAUCSL, candles.CPILFESL)
  const cmeBreakoutQuality = classifyCmeBreakoutQuality(liveFactors)
  const available = Object.values(candles).flat().length + liveFactors.filter((factor) => factor.status === 'live').length
  const anyProductionEligible = Object.values(candles)
    .flat()
    .some((candle) => candle.isProductionEligible) || liveFactors.some((factor) => factor.isProductionEligible)
  const pressureReasons = [
    realRateTrend === 'rising' ? '实际利率上行，提高持有黄金的机会成本。' : null,
    dollarTrend === 'rising' ? '美元指数走强，通常压制美元计价黄金估值。' : null,
    inflationPhase === 'sticky' || inflationPhase === 'accelerating'
      ? '核心通胀粘性/再加速会延缓宽松预期，买点需要降级。'
      : null,
    vixState === 'low' ? 'VIX 低位提示避险溢价不足，追涨/抄底都不能放大。' : null,
    cmeBreakoutQuality === 'not_confirmed' ? 'CME OI/Volume 未确认突破质量，趋势资金参与不足。' : null,
  ].filter((item): item is string => Boolean(item))
  const supportReasons = [
    realRateTrend === 'falling' ? '实际利率回落，黄金中期估值压力下降。' : null,
    dollarTrend === 'falling' ? '美元指数转弱，黄金定价背景改善。' : null,
    usdCnyTrend === 'rising' ? 'USDCNY 上行对人民币计价黄金形成汇率支撑。' : null,
    vixState === 'mild' ? 'VIX 温和抬升，避险需求可能提供中期背景支持。' : null,
    cmeBreakoutQuality === 'confirmed' ? 'CME OI/Volume 与价格方向一致，突破质量相对更好。' : null,
  ].filter((item): item is string => Boolean(item))
  const pressureCombo =
    realRateTrend === 'rising' &&
    dollarTrend === 'rising' &&
    (inflationPhase === 'sticky' || inflationPhase === 'accelerating') &&
    vixState === 'low'
  const supportCombo =
    realRateTrend === 'falling' &&
    dollarTrend === 'falling' &&
    usdCnyTrend === 'rising' &&
    vixState === 'mild'
  const status = available < 2
    ? 'unknown'
    : pressureCombo
      ? 'pressure'
      : supportCombo
        ? 'supportive'
        : pressureReasons.length > supportReasons.length + 1
          ? 'pressure'
          : supportReasons.length > pressureReasons.length + 1
            ? 'supportive'
            : 'neutral'
  const mirrorOnly = !anyProductionEligible
  const scoreImpact = status === 'pressure'
    ? -6
    : status === 'supportive' && !mirrorOnly
      ? 2
      : 0

  return {
    status,
    scoreImpact,
    confidence: clamp(available * 12, 20, 76),
    supportingReasons: status === 'supportive'
      ? [
          ...supportReasons,
          '该组合只说明中期背景改善，仍必须等待价格结构、赔率和事件风控确认。',
        ]
      : supportReasons,
    opposingReasons: pressureReasons,
    sourceUsage: mirrorOnly ? 'mirror_learning' : 'production_realtime',
    isProductionEligible: anyProductionEligible,
    stalenessWarning: mirrorOnly
      ? '宏观镜像因子仅作离线校准参考，不能放大 1m/5m 强提醒，也不能替代实时生产源。'
      : '宏观因子属于慢频背景，不能单独触发交易。需叠加价格、事件和回测门槛。',
    sourceSummary: mirrorOnly
      ? '当前宏观 regime 主要来自本地镜像/离线资料库。'
      : '当前宏观 regime 包含可生产使用的来源，但仍按慢频背景处理。',
    inflationPhase,
    realRateTrend,
    usdCnyAlignment: usdCnyTrend === 'rising'
      ? 'cny_gold_support'
      : usdCnyTrend === 'falling'
        ? 'cny_gold_pressure'
        : usdCnyTrend === 'unknown'
          ? 'unknown'
          : 'neutral',
    cmeBreakoutQuality,
  }
}

function classifyPointTrend(candles: FactorCandle[] | undefined, threshold: number) {
  const values = numericValues(candles)
  if (values.length < 2) {
    return 'unknown' as const
  }
  const delta = values[values.length - 1] - values[0]
  if (delta >= threshold) {
    return 'rising' as const
  }
  if (delta <= -threshold) {
    return 'falling' as const
  }
  return 'flat' as const
}

function classifyPercentTrend(candles: FactorCandle[] | undefined, threshold: number) {
  const values = numericValues(candles)
  if (values.length < 2 || values[0] <= 0) {
    return 'unknown' as const
  }
  const change = (values[values.length - 1] - values[0]) / values[0]
  if (change >= threshold) {
    return 'rising' as const
  }
  if (change <= -threshold) {
    return 'falling' as const
  }
  return 'flat' as const
}

function classifyInflationPhase(cpi: FactorCandle[] | undefined, coreCpi: FactorCandle[] | undefined) {
  const core = numericValues(coreCpi)
  const headline = numericValues(cpi)
  const selected = core.length >= 13 ? core : headline
  if (selected.length < 13) {
    return 'unknown' as const
  }
  const latestYoy = selected[selected.length - 1] / selected[selected.length - 13] - 1
  const priorIndex = selected.length >= 16 ? selected.length - 4 : selected.length - 2
  const priorBaseIndex = priorIndex - 12
  const priorYoy = priorBaseIndex >= 0
    ? selected[priorIndex] / selected[priorBaseIndex] - 1
    : latestYoy
  const acceleration = latestYoy - priorYoy
  if (latestYoy >= 0.035 && acceleration >= -0.001) {
    return 'sticky' as const
  }
  if (acceleration >= 0.004) {
    return 'accelerating' as const
  }
  if (latestYoy < 0.03 || acceleration <= -0.004) {
    return 'cooling' as const
  }
  return 'unknown' as const
}

function classifyVix(candles: FactorCandle[] | undefined) {
  const values = numericValues(candles)
  const latest = values.at(-1)
  if (latest === undefined) {
    return 'unknown' as const
  }
  if (latest < 16) {
    return 'low' as const
  }
  if (latest <= 25) {
    return 'mild' as const
  }
  return 'shock' as const
}

function classifyCmeBreakoutQuality(factors: MarketFactor[]): MacroRegimeEvidence['cmeBreakoutQuality'] {
  const oi = factors.find((factor) => factor.id === 'CME_GOLD_OI')
  const volume = factors.find((factor) => factor.id === 'CME_GOLD_VOLUME')
  if (!oi && !volume) {
    return 'unavailable'
  }
  if (oi?.impact === 'supportive' && volume?.impact === 'supportive') {
    return 'confirmed'
  }
  if (oi?.impact === 'pressure' || volume?.impact === 'pressure') {
    return 'not_confirmed'
  }
  return 'unknown'
}

function numericValues(candles: FactorCandle[] | undefined) {
  return (candles ?? [])
    .filter((candle) => candle.productionUsage !== 'production_disabled')
    .map((candle) => candle.value)
    .filter((value) => Number.isFinite(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
