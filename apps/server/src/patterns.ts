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

  return patterns
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

function buildCandleSignal(input: {
  candle: MicroCandle
  kind: PatternSignal['kind']
  label: string
  direction: PatternSignal['direction']
  confidence: number
  invalidationPrice: number | null
  targetPrice: number | null
  summary: string
  explanation: string
}): PatternSignal {
  return {
    id: `pattern-${input.kind}-${input.candle.timestamp}`,
    kind: input.kind,
    label: input.label,
    direction: input.direction,
    confidence: Math.round(input.confidence * 0.86),
    confirmationStatus: 'candidate',
    confirmationReason: input.kind === 'doji'
      ? '十字星只代表多空犹豫，需要下一根 K 线确认方向。'
      : '该形态由分时价格代理 K 线生成，缺少真实成交量/OHLC 交叉确认，默认只作为候选。',
    detectedAt: input.candle.timestamp,
    keyPrice: input.candle.close,
    necklinePrice: null,
    invalidationPrice: input.invalidationPrice,
    targetPrice: input.targetPrice,
    expectedConfirmationBars: 2,
    summary: input.summary,
    explanation: input.explanation,
  }
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
      const confidence = clamp(
        45 + (0.006 - similarity) * 5000 + Math.min(rebound * 2800, 18) - Math.max(necklineDistance, 0) * 700 + (confirmed ? 8 : -8),
        38,
        confirmed ? 82 : 64,
      )

      return {
        id: `pattern-double-bottom-${right.timestamp}`,
        kind: 'double_bottom',
        label: confirmed ? '双底确认' : '疑似双底',
        direction: 'bullish',
        confidence: Math.round(confidence),
        confirmationStatus: confirmed ? 'confirmed' : 'candidate',
        confirmationReason: confirmed
          ? '最新价格已站上双底颈线，形态进入确认观察。'
          : '右底反弹尚未站上颈线，只能作为候选形态等待确认。',
        detectedAt: latest.timestamp,
        keyPrice: right.price,
        necklinePrice: neckline,
        invalidationPrice: Math.min(left.price, right.price) * 0.998,
        targetPrice: neckline + Math.max(neckline - Math.min(left.price, right.price), 0),
        expectedConfirmationBars: latest.price >= neckline ? 1 : 3,
        summary: latest.price >= neckline
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
      const confidence = clamp(
        44 + (0.006 - similarity) * 4800 + Math.min(rejection * 2600, 20) - Math.max(necklineDistance, 0) * 450 + (confirmed ? 8 : -6),
        36,
        confirmed ? 80 : 64,
      )

      return {
        id: `pattern-double-top-${right.timestamp}`,
        kind: 'double_top',
        label: confirmed ? '双顶确认' : '疑似双顶',
        direction: 'bearish',
        confidence: Math.round(confidence),
        confirmationStatus: confirmed ? 'confirmed' : 'candidate',
        confirmationReason: confirmed
          ? '最新价格已跌破双顶颈线，风险形态进入确认。'
          : '两次冲高受阻但尚未跌破颈线，只能作为候选风险观察。',
        detectedAt: latest.timestamp,
        keyPrice: right.price,
        necklinePrice: neckline,
        invalidationPrice: Math.max(left.price, right.price) * 1.002,
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
