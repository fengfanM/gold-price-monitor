import type { HistoryPoint, PatternSignal, QuoteSample } from './types.js'

type PricePoint = {
  timestamp: string
  price: number
}

type SwingPoint = PricePoint & {
  index: number
  type: 'high' | 'low'
}

type MicroCandle = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
}

const MAX_PATTERNS = 5

export function detectPatternSignals(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
): PatternSignal[] {
  const points = buildPricePoints(history, latestQuote)
  if (points.length < 8) {
    return []
  }

  const swings = detectSwingPoints(points)
  const patterns = [
    detectDoubleBottom(points, swings),
    detectDoubleTop(points, swings),
    detectSupportRebound(points, swings),
    detectResistanceRejection(points, swings),
    ...detectCandlestickPatterns(points),
  ].filter((item): item is PatternSignal => item !== null)

  return patterns
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_PATTERNS)
}

function detectCandlestickPatterns(points: PricePoint[]): PatternSignal[] {
  const candles = buildMicroCandles(points)
  if (candles.length < 2) {
    return []
  }
  const latest = candles[candles.length - 1]
  const previous = candles[candles.length - 2]
  const recentPrices = points.slice(-12).map((point) => point.price)
  const recentHigh = Math.max(...recentPrices)
  const recentLow = Math.min(...recentPrices)
  const rangePosition = recentHigh > recentLow
    ? (latest.close - recentLow) / (recentHigh - recentLow)
    : 0.5
  const body = Math.abs(latest.close - latest.open)
  const range = Math.max(latest.high - latest.low, latest.close * 0.0001)
  const upperShadow = latest.high - Math.max(latest.open, latest.close)
  const lowerShadow = Math.min(latest.open, latest.close) - latest.low
  const patterns: PatternSignal[] = []

  if (lowerShadow >= body * 2.2 && upperShadow <= range * 0.25 && rangePosition <= 0.45) {
    patterns.push(buildCandleSignal({
      candle: latest,
      kind: 'hammer',
      label: '锤子线',
      direction: 'bullish',
      confidence: clamp(54 + lowerShadow / range * 26 + (0.45 - rangePosition) * 18, 48, 78),
      invalidationPrice: latest.low * 0.998,
      targetPrice: latest.close + range * 1.8,
      summary: '低位长下影显示下方承接增强；该形态由分时价格代理K线生成，需下一根K线继续站稳确认。',
      explanation: '锤子线常见于下跌末端，代表空头打低后被多头拉回；若跌破下影低点则形态失效。',
    }))
  }

  if (upperShadow >= body * 2.2 && lowerShadow <= range * 0.25 && rangePosition >= 0.55) {
    patterns.push(buildCandleSignal({
      candle: latest,
      kind: 'shooting_star',
      label: '射击之星',
      direction: 'bearish',
      confidence: clamp(52 + upperShadow / range * 24 + (rangePosition - 0.55) * 18, 46, 76),
      invalidationPrice: latest.high * 1.002,
      targetPrice: latest.close - range * 1.5,
      summary: '高位长上影显示冲高回落；该形态由分时价格代理K线生成，追多质量下降。',
      explanation: '射击之星代表上方抛压较重；若后续突破上影高点，风险信号失效。',
    }))
  }

  const previousBearish = previous.close < previous.open
  const previousBullish = previous.close > previous.open
  const latestBullish = latest.close > latest.open
  const latestBearish = latest.close < latest.open
  if (previousBearish && latestBullish && latest.low <= previous.close && latest.close >= previous.open) {
    patterns.push(buildCandleSignal({
      candle: latest,
      kind: 'bullish_engulfing',
      label: '看涨吞没',
      direction: 'bullish',
      confidence: clamp(58 + body / range * 18 + (0.55 - Math.min(rangePosition, 0.55)) * 12, 50, 82),
      invalidationPrice: Math.min(latest.low, previous.low) * 0.998,
      targetPrice: latest.close + range * 2,
      summary: '最新代理K线反包前一根阴线，多头短线反攻增强，但仍需后续确认。',
      explanation: '看涨吞没说明买盘覆盖上一段下跌实体；若跌破吞没低点，形态失败。',
    }))
  }

  if (previousBullish && latestBearish && latest.high >= previous.close && latest.close <= previous.open) {
    patterns.push(buildCandleSignal({
      candle: latest,
      kind: 'bearish_engulfing',
      label: '看跌吞没',
      direction: 'bearish',
      confidence: clamp(58 + body / range * 18 + Math.max(rangePosition - 0.45, 0) * 12, 50, 82),
      invalidationPrice: Math.max(latest.high, previous.high) * 1.002,
      targetPrice: latest.close - range * 2,
      summary: '最新代理K线反包前一根阳线，短线抛压增强，但仍需后续确认。',
      explanation: '看跌吞没说明卖盘覆盖上一段上涨实体；若重新突破吞没高点，风险信号失效。',
    }))
  }

  if (body <= range * 0.12 && range >= latest.close * 0.0015) {
    patterns.push(buildCandleSignal({
      candle: latest,
      kind: 'doji',
      label: '十字星',
      direction: 'neutral',
      confidence: clamp(48 + range / latest.close * 4000, 42, 66),
      invalidationPrice: null,
      targetPrice: null,
      summary: '多空在当前价位出现犹豫，需等待下一根K线选择方向。',
      explanation: '十字星本身不是买卖点，必须结合位置：低位可能止跌，高位可能滞涨。',
    }))
  }

  const segmentedCandles = buildSegmentCandles(points)
  if (segmentedCandles.length >= 3) {
    patterns.push(...detectThreeCandlePatterns(segmentedCandles, recentLow, recentHigh))
  }

  patterns.push(...detectHaramiPatterns(segmentedCandles, rangePosition))

  return patterns
}

function detectThreeCandlePatterns(
  candles: MicroCandle[],
  recentLow: number,
  recentHigh: number,
): PatternSignal[] {
  const [first, second, third] = candles.slice(-3)
  const firstRange = candleRange(first)
  const secondRange = candleRange(second)
  const thirdRange = candleRange(third)
  const firstBody = candleBody(first)
  const secondBody = candleBody(second)
  const thirdBody = candleBody(third)
  const recentRange = Math.max(recentHigh - recentLow, third.close * 0.0001)
  const rangePosition = (third.close - recentLow) / recentRange
  const patternLowPosition = (Math.min(first.low, second.low, third.low) - recentLow) / recentRange
  const patternHighPosition = (Math.max(first.high, second.high, third.high) - recentLow) / recentRange
  const patterns: PatternSignal[] = []

  const firstBearish = isBearish(first)
  const firstBullish = isBullish(first)
  const thirdBullish = isBullish(third)
  const thirdBearish = isBearish(third)
  const firstMidpoint = (first.open + first.close) / 2
  const lowLocation = patternLowPosition <= 0.35
  const highLocation = patternHighPosition >= 0.65

  if (
    firstBearish &&
    thirdBullish &&
    firstBody >= firstRange * 0.45 &&
    secondBody <= secondRange * 0.38 &&
    thirdBody >= thirdRange * 0.35 &&
    third.close >= firstMidpoint &&
    lowLocation
  ) {
    const low = Math.min(first.low, second.low, third.low)
    patterns.push(buildCandleSignal({
      candle: third,
      kind: 'morning_star',
      label: '晨星确认',
      direction: 'bullish',
      confidence: clamp(70 + (0.48 - rangePosition) * 18 + thirdBody / thirdRange * 10, 56, 86),
      confirmationStatus: 'confirmed',
      confirmationPrice: third.close,
      invalidationPrice: low * 0.998,
      targetPrice: third.close + Math.max(third.close - low, third.close * 0.004),
      expectedConfirmationBars: 1,
      stateReason: '三根结构完整，第三根阳线收复第一根实体中点，且位置处于近期偏低区。',
      contextTags: ['low_location', 'three_candle_reversal', 'needs_risk_reward_gate'],
      summary: '晨星三根结构已完成，低位修复条件成立；仍必须通过赔率、事件和数据源门槛。',
      explanation: '晨星代表下跌末端出现卖压衰减和买盘回补；若跌破三根结构低点，形态按失败处理。',
    }))
  }

  if (
    firstBullish &&
    thirdBearish &&
    firstBody >= firstRange * 0.45 &&
    secondBody <= secondRange * 0.38 &&
    thirdBody >= thirdRange * 0.35 &&
    third.close <= firstMidpoint &&
    highLocation
  ) {
    const high = Math.max(first.high, second.high, third.high)
    patterns.push(buildCandleSignal({
      candle: third,
      kind: 'evening_star',
      label: '黄昏星确认',
      direction: 'bearish',
      confidence: clamp(68 + (rangePosition - 0.52) * 18 + thirdBody / thirdRange * 10, 54, 84),
      confirmationStatus: 'confirmed',
      confirmationPrice: third.close,
      invalidationPrice: high * 1.002,
      targetPrice: third.close - Math.max(high - third.close, third.close * 0.004),
      expectedConfirmationBars: 1,
      stateReason: '三根结构完整，第三根阴线跌回第一根实体中点下方，且位置处于近期偏高区。',
      contextTags: ['high_location', 'three_candle_reversal', 'chase_long_block'],
      summary: '黄昏星三根结构已完成，高位滞涨风险增强；追多质量下降。',
      explanation: '黄昏星代表上涨末端买盘衰减和抛压回归；若重新突破三根结构高点，风险形态失效。',
    }))
  }

  if (isThreeWhiteSoldiers(first, second, third)) {
    const highPosition = rangePosition >= 0.68
    const low = Math.min(first.low, second.low, third.low)
    const high = Math.max(first.high, second.high, third.high)
    patterns.push(buildCandleSignal({
      candle: third,
      kind: 'three_white_soldiers',
      label: highPosition ? '高位红三兵衰竭风险' : '红三兵修复候选',
      direction: highPosition ? 'bearish' : 'bullish',
      confidence: clamp(highPosition ? 64 + (rangePosition - 0.68) * 28 : 56 + (0.55 - Math.min(rangePosition, 0.55)) * 14, 48, 78),
      confirmationStatus: 'candidate',
      confirmationPrice: highPosition ? null : high,
      invalidationPrice: highPosition ? high * 1.002 : low * 0.998,
      targetPrice: highPosition ? third.close - Math.max(high - low, third.close * 0.004) : third.close + Math.max(high - low, third.close * 0.004),
      expectedConfirmationBars: 2,
      stateReason: highPosition
        ? '连续三根阳线出现在近期高位，更像加速冲刺后的衰竭风险，禁止追涨式强提醒。'
        : '连续三根阳线说明修复启动，但仍需确认回踩不破和赔率充足。',
      contextTags: highPosition
        ? ['high_location', 'blowoff_risk', 'chase_long_block']
        : ['low_repair', 'needs_pullback_confirmation'],
      summary: highPosition
        ? '高位连续阳线属于冲刺衰竭风险，不能解释成低风险追涨机会。'
        : '红三兵显示短线修复，但需要回踩确认后才可进入交易计划审核。',
      explanation: '红三兵在低位止跌后有修复意义；在高位加速后常见获利盘和追涨盘拥挤，必须降级处理。',
    }))
  }

  if (isThreeBlackCrows(first, second, third)) {
    const lowPosition = rangePosition <= 0.32
    const low = Math.min(first.low, second.low, third.low)
    const high = Math.max(first.high, second.high, third.high)
    patterns.push(buildCandleSignal({
      candle: third,
      kind: 'three_black_crows',
      label: lowPosition ? '低位三鸦恐慌衰竭' : '三鸦风险候选',
      direction: lowPosition ? 'neutral' : 'bearish',
      confidence: clamp(lowPosition ? 58 + (0.32 - rangePosition) * 24 : 62 + (rangePosition - 0.45) * 16, 46, 78),
      confirmationStatus: 'candidate',
      confirmationPrice: lowPosition ? high : low,
      invalidationPrice: high * 1.002,
      targetPrice: lowPosition ? null : third.close - Math.max(high - low, third.close * 0.004),
      expectedConfirmationBars: 2,
      stateReason: lowPosition
        ? '连续三根阴线已经打到近期低位，专业处理是等待修复或二次确认，不追空。'
        : '连续三根阴线说明抛压占优，但仍需结合位置和事件确认。',
      contextTags: lowPosition
        ? ['low_location', 'panic_exhaustion', 'short_chase_block']
        : ['sell_pressure', 'needs_follow_through'],
      summary: lowPosition
        ? '低位三鸦更像恐慌释放后的等待区，不作为追空或强风险放大依据。'
        : '三鸦显示短线抛压增强，若处于高位/反弹末端需降低买点权重。',
      explanation: '三鸦在顶部代表风险，在低位急跌后则可能是恐慌尾段；低位不得追空，只能等待修复确认。',
    }))
  }

  return patterns
}

function detectHaramiPatterns(candles: MicroCandle[], rangePosition: number): PatternSignal[] {
  if (candles.length < 2) {
    return []
  }
  const previous = candles[candles.length - 2]
  const latest = candles[candles.length - 1]
  const previousBody = candleBody(previous)
  const latestBody = candleBody(latest)
  const previousRange = candleRange(previous)
  const previousTop = Math.max(previous.open, previous.close)
  const previousBottom = Math.min(previous.open, previous.close)
  const latestTop = Math.max(latest.open, latest.close)
  const latestBottom = Math.min(latest.open, latest.close)
  const insideMotherBody = latestTop <= previous.high && latestBottom >= previous.low
  if (!insideMotherBody || previousBody < previousRange * 0.42 || latestBody > previousBody * 0.55) {
    return []
  }

  if (isBearish(previous) && rangePosition <= 0.55) {
    return [buildCandleSignal({
      candle: latest,
      kind: 'bullish_harami',
      label: '看涨孕线候选',
      direction: 'neutral',
      confidence: clamp(50 + (0.55 - rangePosition) * 18, 44, 62),
      confirmationStatus: 'candidate',
      confirmationPrice: previousTop,
      invalidationPrice: previousBottom * 0.998,
      targetPrice: null,
      expectedConfirmationBars: 2,
      stateReason: '小实体被前一根大阴线包住，只说明波动收缩；突破母线高点前不加买点强分。',
      contextTags: ['compression', 'needs_mother_break', 'candidate_only'],
      summary: '孕线代表动能收缩，不是买点；必须等待突破母线高点并回踩不破。',
      explanation: '孕线只说明多空从单边转入犹豫，方向要由母线高低点突破决定。',
    })]
  }

  if (isBullish(previous) && rangePosition >= 0.45) {
    return [buildCandleSignal({
      candle: latest,
      kind: 'bearish_harami',
      label: '看跌孕线候选',
      direction: 'neutral',
      confidence: clamp(50 + (rangePosition - 0.45) * 18, 44, 62),
      confirmationStatus: 'candidate',
      confirmationPrice: previousBottom,
      invalidationPrice: previousTop * 1.002,
      targetPrice: null,
      expectedConfirmationBars: 2,
      stateReason: '小实体被前一根大阳线包住，只说明高位波动收缩；跌破母线低点前不确认风险。',
      contextTags: ['compression', 'needs_mother_break', 'candidate_only'],
      summary: '孕线代表动能收缩，不是独立卖点；必须等待跌破母线低点确认。',
      explanation: '孕线只说明多空从单边转入犹豫，方向要由母线高低点突破决定。',
    })]
  }

  return []
}

function buildMicroCandles(points: PricePoint[]) {
  const candles: MicroCandle[] = []
  for (let index = 2; index < points.length; index += 1) {
    const slice = points.slice(index - 2, index + 1)
    const open = slice[0]
    const current = points[index]
    candles.push({
      timestamp: current.timestamp,
      open: open.price,
      high: Math.max(...slice.map((point) => point.price)),
      low: Math.min(...slice.map((point) => point.price)),
      close: current.price,
    })
  }
  return candles
}

function buildSegmentCandles(points: PricePoint[]) {
  const candles: MicroCandle[] = []
  const window = points.slice(-9)
  const offset = window.length % 3
  for (let index = offset; index <= window.length - 3; index += 3) {
    const slice = window.slice(index, index + 3)
    const open = slice[0]
    const current = slice[slice.length - 1]
    candles.push({
      timestamp: current.timestamp,
      open: open.price,
      high: Math.max(...slice.map((point) => point.price)),
      low: Math.min(...slice.map((point) => point.price)),
      close: current.price,
    })
  }
  return candles
}

function buildCandleSignal(input: {
  candle: MicroCandle
  kind: PatternSignal['kind']
  label: string
  direction: PatternSignal['direction']
  confidence: number
  confirmationStatus?: PatternSignal['confirmationStatus']
  confirmationPrice?: number | null
  invalidationPrice: number | null
  targetPrice: number | null
  expectedConfirmationBars?: number
  stateReason?: string
  contextTags?: string[]
  summary: string
  explanation: string
}): PatternSignal {
  const confirmationStatus = input.confirmationStatus ?? 'candidate'
  return {
    id: `pattern-${input.kind}-${input.candle.timestamp}`,
    kind: input.kind,
    label: input.label,
    direction: input.direction,
    confidence: Math.round(input.confidence * 0.86),
    confirmationStatus,
    confirmationReason: confirmationStatus === 'confirmed'
      ? '该三根结构已完成形态确认，但仍需通过位置、赔率、事件和数据源门槛。'
      : input.kind === 'doji'
      ? '十字星只代表多空犹豫，需要下一根 K 线确认方向。'
      : '该形态由分时价格代理 K 线生成，缺少真实成交量/OHLC 交叉确认，默认只作为候选。',
    confirmationPrice: input.confirmationPrice ?? null,
    stateReason: input.stateReason,
    cooldownBars: confirmationStatus === 'failed' ? 6 : 0,
    contextTags: input.contextTags ?? ['micro_proxy'],
    detectedAt: input.candle.timestamp,
    keyPrice: input.candle.close,
    necklinePrice: null,
    invalidationPrice: input.invalidationPrice,
    targetPrice: input.targetPrice,
    expectedConfirmationBars: input.expectedConfirmationBars ?? 2,
    summary: input.summary,
    explanation: input.explanation,
  }
}

function candleBody(candle: MicroCandle) {
  return Math.abs(candle.close - candle.open)
}

function candleRange(candle: MicroCandle) {
  return Math.max(candle.high - candle.low, candle.close * 0.0001)
}

function upperShadow(candle: MicroCandle) {
  return candle.high - Math.max(candle.open, candle.close)
}

function lowerShadow(candle: MicroCandle) {
  return Math.min(candle.open, candle.close) - candle.low
}

function isBullish(candle: MicroCandle) {
  return candle.close > candle.open
}

function isBearish(candle: MicroCandle) {
  return candle.close < candle.open
}

function isThreeWhiteSoldiers(first: MicroCandle, second: MicroCandle, third: MicroCandle) {
  return [first, second, third].every((candle) => {
    const range = candleRange(candle)
    return isBullish(candle) &&
      candleBody(candle) >= range * 0.42 &&
      upperShadow(candle) <= range * 0.45
  }) &&
    second.close > first.close &&
    third.close > second.close
}

function isThreeBlackCrows(first: MicroCandle, second: MicroCandle, third: MicroCandle) {
  return [first, second, third].every((candle) => {
    const range = candleRange(candle)
    return isBearish(candle) &&
      candleBody(candle) >= range * 0.42 &&
      lowerShadow(candle) <= range * 0.45
  }) &&
    second.close < first.close &&
    third.close < second.close
}

function buildPricePoints(history: HistoryPoint[], latestQuote: QuoteSample) {
  const deduped = new Map<number, PricePoint>()
  for (const point of history) {
    const timestampMs = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestampMs) || !Number.isFinite(point.price) || point.price <= 0) {
      continue
    }
    deduped.set(timestampMs, { timestamp: point.timestamp, price: point.price })
  }
  const latestMs = new Date(latestQuote.fetchedAt).getTime()
  if (Number.isFinite(latestMs) && Number.isFinite(latestQuote.price) && latestQuote.price > 0) {
    deduped.set(latestMs, {
      timestamp: latestQuote.fetchedAt,
      price: latestQuote.price,
    })
  }

  return [...deduped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
    .slice(-180)
}

function detectSwingPoints(points: PricePoint[]) {
  const swings: SwingPoint[] = []
  const radius = points.length >= 40 ? 2 : 1

  for (let index = radius; index < points.length - radius; index += 1) {
    const current = points[index]
    const window = points.slice(index - radius, index + radius + 1)
    const isHigh = window.every((point) => current.price >= point.price)
    const isLow = window.every((point) => current.price <= point.price)

    if (isHigh && window.some((point) => current.price > point.price)) {
      swings.push({ ...current, index, type: 'high' })
    } else if (isLow && window.some((point) => current.price < point.price)) {
      swings.push({ ...current, index, type: 'low' })
    }
  }

  return swings
}

function detectDoubleBottom(points: PricePoint[], swings: SwingPoint[]): PatternSignal | null {
  const lows = swings.filter((swing) => swing.type === 'low').slice(-6)
  const latest = points[points.length - 1]
  for (let rightIndex = lows.length - 1; rightIndex > 0; rightIndex -= 1) {
    const right = lows[rightIndex]
    for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
      const left = lows[leftIndex]
      const separation = right.index - left.index
      const similarity = Math.abs(right.price - left.price) / Math.max(left.price, right.price)
      if (separation < 3 || similarity > 0.006) {
        continue
      }

      const middle = points.slice(left.index, right.index + 1)
      const neckline = Math.max(...middle.map((point) => point.price))
      const rebound = (latest.price - right.price) / right.price
      const necklineDistance = (neckline - latest.price) / latest.price
      const confirmed = latest.price >= neckline
      const invalidationPrice = Math.min(left.price, right.price) * 0.998
      const failed = latest.price <= invalidationPrice
      const confidence = clamp(
        45 + (0.006 - similarity) * 5000 + Math.min(rebound * 2800, 18) - Math.max(necklineDistance, 0) * 700 + (confirmed ? 8 : failed ? 2 : -8),
        38,
        confirmed ? 82 : 64,
      )

      return {
        id: `pattern-double-bottom-${right.timestamp}`,
        kind: 'double_bottom',
        label: failed ? '双底失败冷却' : confirmed ? '双底确认' : '疑似双底',
        direction: failed ? 'neutral' : 'bullish',
        confidence: Math.round(confidence),
        confirmationStatus: failed ? 'failed' : confirmed ? 'confirmed' : 'candidate',
        confirmationReason: failed
          ? '价格跌破双底右底/左底防线，形态失败，进入 6 根 K 线冷却。'
          : confirmed
          ? '最新价格已站上双底颈线，形态进入确认观察。'
          : '右底反弹尚未站上颈线，只能作为候选形态等待确认。',
        confirmationPrice: neckline,
        stateReason: failed
          ? '双底候选跌破失效价，冷却期内同类形态不能触发强观察。'
          : confirmed
            ? '颈线已被收复，但仍需交易计划和赔率审核。'
            : '结构仅完成右底反弹，缺少颈线确认。',
        cooldownBars: failed ? 6 : 0,
        contextTags: failed
          ? ['pattern_failed', 'cooldown', 'double_bottom']
          : confirmed
            ? ['confirmed_reversal', 'neckline_reclaimed', 'double_bottom']
            : ['candidate_only', 'needs_neckline_break', 'double_bottom'],
        detectedAt: latest.timestamp,
        keyPrice: right.price,
        necklinePrice: neckline,
        invalidationPrice,
        targetPrice: neckline + Math.max(neckline - Math.min(left.price, right.price), 0),
        expectedConfirmationBars: latest.price >= neckline ? 1 : 3,
        summary: failed
          ? '双底候选已跌破失效价，短线不再按买点处理，等待新的结构重建。'
          : latest.price >= neckline
          ? '双底颈线已接近确认，短线反弹结构增强。'
          : '右底不破左底且出现反弹，等待放量站上颈线确认。',
        explanation: '双底通常代表下跌后两次探底未破，说明低位承接增强；若后续跌破右底，形态失效。',
      }
    }
  }

  return null
}

function detectDoubleTop(points: PricePoint[], swings: SwingPoint[]): PatternSignal | null {
  const highs = swings.filter((swing) => swing.type === 'high').slice(-6)
  const latest = points[points.length - 1]
  for (let rightIndex = highs.length - 1; rightIndex > 0; rightIndex -= 1) {
    const right = highs[rightIndex]
    for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
      const left = highs[leftIndex]
      const separation = right.index - left.index
      const similarity = Math.abs(right.price - left.price) / Math.max(left.price, right.price)
      if (separation < 3 || similarity > 0.006) {
        continue
      }

      const middle = points.slice(left.index, right.index + 1)
      const neckline = Math.min(...middle.map((point) => point.price))
      const rejection = (right.price - latest.price) / right.price
      const necklineDistance = (latest.price - neckline) / latest.price
      const confirmed = latest.price <= neckline
      const invalidationPrice = Math.max(left.price, right.price) * 1.002
      const failed = latest.price >= invalidationPrice
      const confidence = clamp(
        44 + (0.006 - similarity) * 4800 + Math.min(rejection * 2600, 20) - Math.max(necklineDistance, 0) * 450 + (confirmed ? 8 : failed ? 2 : -6),
        36,
        confirmed ? 80 : 64,
      )

      return {
        id: `pattern-double-top-${right.timestamp}`,
        kind: 'double_top',
        label: failed ? '双顶失败冷却' : confirmed ? '双顶确认' : '疑似双顶',
        direction: failed ? 'neutral' : 'bearish',
        confidence: Math.round(confidence),
        confirmationStatus: failed ? 'failed' : confirmed ? 'confirmed' : 'candidate',
        confirmationReason: failed
          ? '价格突破双顶前高防线，风险形态失败，进入 6 根 K 线冷却。'
          : confirmed
          ? '最新价格已跌破双顶颈线，风险形态进入确认。'
          : '两次冲高受阻但尚未跌破颈线，只能作为候选风险观察。',
        confirmationPrice: neckline,
        stateReason: failed
          ? '双顶候选突破失效价，冷却期内同类风险形态不能反复提示。'
          : confirmed
            ? '颈线已跌破，但仍需结合位置、事件和赔率处理。'
            : '结构仅完成二次冲高，缺少颈线确认。',
        cooldownBars: failed ? 6 : 0,
        contextTags: failed
          ? ['pattern_failed', 'cooldown', 'double_top']
          : confirmed
            ? ['confirmed_reversal', 'neckline_lost', 'double_top']
            : ['candidate_only', 'needs_neckline_break', 'double_top'],
        detectedAt: latest.timestamp,
        keyPrice: right.price,
        necklinePrice: neckline,
        invalidationPrice,
        targetPrice: neckline - Math.max(Math.max(left.price, right.price) - neckline, 0),
        expectedConfirmationBars: latest.price <= neckline ? 1 : 3,
        summary: latest.price <= neckline
          ? '双顶颈线已跌破，短线风险信号增强。'
          : '两次冲高受阻，若跌破颈线需警惕回落加速。',
        explanation: '双顶通常代表上攻两次未能突破，说明高位抛压增强；若后续突破前高，形态失效。',
      }
    }
  }

  return null
}

function detectSupportRebound(points: PricePoint[], swings: SwingPoint[]): PatternSignal | null {
  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const recentLows = swings.filter((swing) => swing.type === 'low').slice(-5)
  if (!previous || recentLows.length < 2) {
    return null
  }
  const support = average(recentLows.map((swing) => swing.price))
  const distance = (latest.price - support) / latest.price
  if (distance < 0 || distance > 0.006) {
    return null
  }
  const recentWindow = points.slice(Math.max(0, points.length - 16), -1)
  const priorHigh = Math.max(...recentWindow.map((point) => point.price))
  const dropIntoSupport = priorHigh > 0 ? (priorHigh - support) / priorHigh : 0
  const reboundFromSupport = (latest.price - support) / support
  const latestMove = (latest.price - previous.price) / previous.price
  if (dropIntoSupport < 0.004 || reboundFromSupport < 0.001 || latestMove < 0) {
    return null
  }

  return {
    id: `pattern-support-${latest.timestamp}`,
    kind: 'support_rebound',
    label: '支撑反弹',
    direction: 'bullish',
    confidence: Math.round(clamp(54 - distance * 2200 + recentLows.length * 3 + Math.min(dropIntoSupport * 900, 8), 44, 74)),
    confirmationStatus: 'confirmed',
    confirmationReason: '价格先回落到多次低点支撑附近，随后出现正向反弹且未破支撑。',
    detectedAt: latest.timestamp,
    keyPrice: support,
    necklinePrice: null,
    invalidationPrice: support * 0.997,
    targetPrice: latest.price + Math.max(latest.price - support, latest.price * 0.004),
    expectedConfirmationBars: 2,
    summary: '当前价贴近多次低点支撑，若不跌破支撑可观察短线反弹。',
    explanation: '支撑位来自近期多次低点聚集，代表市场曾在该区域出现承接；跌破支撑则说明承接失败。',
  }
}

function detectResistanceRejection(points: PricePoint[], swings: SwingPoint[]): PatternSignal | null {
  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const recentHighs = swings.filter((swing) => swing.type === 'high').slice(-5)
  if (!previous || recentHighs.length < 2) {
    return null
  }
  const resistance = average(recentHighs.map((swing) => swing.price))
  const distance = (resistance - latest.price) / latest.price
  if (distance < 0 || distance > 0.008) {
    return null
  }
  const recentWindow = points.slice(Math.max(0, points.length - 16), -1)
  const priorLow = Math.min(...recentWindow.map((point) => point.price))
  const riseIntoResistance = priorLow > 0 ? (resistance - priorLow) / priorLow : 0
  const rejectionFromResistance = (resistance - latest.price) / resistance
  const latestMove = (latest.price - previous.price) / previous.price
  if (riseIntoResistance < 0.004 || rejectionFromResistance < 0.001 || latestMove > 0) {
    return null
  }

  return {
    id: `pattern-resistance-${latest.timestamp}`,
    kind: 'resistance_rejection',
    label: '阻力压制',
    direction: 'bearish',
    confidence: Math.round(clamp(52 - distance * 1600 + recentHighs.length * 3 + Math.min(riseIntoResistance * 800, 8), 42, 72)),
    confirmationStatus: 'confirmed',
    confirmationReason: '价格先上冲到多次高点阻力附近，随后回落且未突破阻力。',
    detectedAt: latest.timestamp,
    keyPrice: resistance,
    necklinePrice: null,
    invalidationPrice: resistance * 1.003,
    targetPrice: latest.price - Math.max(resistance - latest.price, latest.price * 0.004),
    expectedConfirmationBars: 2,
    summary: '当前价接近多次高点阻力，追高买入质量下降。',
    explanation: '阻力位来自近期多次高点聚集，代表市场曾在该区域出现抛压；放量突破后该风险才会下降。',
  }
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
