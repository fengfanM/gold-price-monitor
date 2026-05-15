import type { HistoryPoint, QuoteSample } from './types.js'

export type TechnicalSnapshot = {
  ma5: number | null
  ma10: number | null
  ma20: number | null
  rsi14: number | null
  macd: {
    dif: number
    dea: number
    histogram: number
  } | null
  shortTrend: 'rising' | 'falling' | 'flat' | 'unknown'
}

export function buildTechnicalSnapshot(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
): TechnicalSnapshot {
  const closes = [...history, quoteToHistoryPoint(latestQuote)]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .map((point) => point.price)
    .filter((price) => Number.isFinite(price) && price > 0)

  return {
    ma5: movingAverage(closes, 5),
    ma10: movingAverage(closes, 10),
    ma20: movingAverage(closes, 20),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    shortTrend: shortTrend(closes),
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

function movingAverage(values: number[], period: number) {
  if (values.length < period) {
    return null
  }
  const window = values.slice(-period)
  return window.reduce((sum, value) => sum + value, 0) / period
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

function macd(values: number[]) {
  if (values.length < 35) {
    return null
  }

  const ema12 = ema(values, 12)
  const ema26 = ema(values, 26)
  const dif = values.map((_value, index) => ema12[index] - ema26[index])
  const dea = ema(dif, 9)
  const latest = values.length - 1

  return {
    dif: dif[latest],
    dea: dea[latest],
    histogram: (dif[latest] - dea[latest]) * 2,
  }
}

function ema(values: number[], period: number) {
  const smoothing = 2 / (period + 1)
  const result: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    if (index === 0) {
      result.push(values[index])
      continue
    }
    result.push(values[index] * smoothing + result[index - 1] * (1 - smoothing))
  }
  return result
}

function shortTrend(values: number[]): TechnicalSnapshot['shortTrend'] {
  if (values.length < 4) {
    return 'unknown'
  }

  const recent = values.slice(-4)
  const change = recent[recent.length - 1] - recent[0]
  const base = recent[0]
  if (base <= 0) {
    return 'unknown'
  }

  const percent = change / base
  if (percent > 0.0008) {
    return 'rising'
  }
  if (percent < -0.0008) {
    return 'falling'
  }
  return 'flat'
}
