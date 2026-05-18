import type { HistoryPoint, TripleBarrierLabel } from './types.js'

type BarrierPoint = {
  timestamp: string
  price: number
}

export function buildTripleBarrierLabel(
  points: BarrierPoint[],
  index: number,
  options: {
    horizonMinutes: number
    tp1ReturnPercent?: number
    stopLossReturnPercent?: number
  },
): TripleBarrierLabel {
  const entry = points[index]
  if (!entry || !Number.isFinite(entry.price) || entry.price <= 0) {
    throw new Error('Triple barrier label requires a valid entry point.')
  }
  const horizonMs = options.horizonMinutes * 60 * 1000
  const entryMs = new Date(entry.timestamp).getTime()
  const tp1ReturnPercent = Math.max(options.tp1ReturnPercent ?? 0.01, 0.0001)
  const stopLossReturnPercent = Math.min(options.stopLossReturnPercent ?? -0.01, -0.0001)
  const tp1Price = entry.price * (1 + tp1ReturnPercent)
  const stopLossPrice = entry.price * (1 + stopLossReturnPercent)
  const window: BarrierPoint[] = []

  for (let cursor = index + 1; cursor < points.length; cursor += 1) {
    const point = points[cursor]
    const pointMs = new Date(point.timestamp).getTime()
    if (!Number.isFinite(pointMs) || pointMs <= entryMs) {
      continue
    }
    if (pointMs - entryMs > horizonMs) {
      break
    }
    window.push(point)
    if (point.price >= tp1Price) {
      return buildBarrierResult(entry, point, window, options.horizonMinutes, 'tp1_hit', tp1Price, stopLossPrice, true)
    }
    if (point.price <= stopLossPrice) {
      return buildBarrierResult(entry, point, window, options.horizonMinutes, 'stop_loss_hit', tp1Price, stopLossPrice, true)
    }
  }

  const last = window[window.length - 1]
  if (!last) {
    return buildBarrierResult(entry, entry, [], options.horizonMinutes, 'timeout', tp1Price, stopLossPrice, false)
  }
  const complete = new Date(last.timestamp).getTime() - entryMs >= horizonMs
  return buildBarrierResult(
    entry,
    last,
    window,
    options.horizonMinutes,
    complete ? 'no_touch' : 'timeout',
    tp1Price,
    stopLossPrice,
    complete,
  )
}

export function historyPointToBarrierPoint(point: HistoryPoint): BarrierPoint {
  return {
    timestamp: point.timestamp,
    price: point.price,
  }
}

function buildBarrierResult(
  entry: BarrierPoint,
  exit: BarrierPoint,
  window: BarrierPoint[],
  horizonMinutes: number,
  outcome: TripleBarrierLabel['outcome'],
  tp1Price: number,
  stopLossPrice: number,
  complete: boolean,
): TripleBarrierLabel {
  const observed = window.length > 0 ? window : [entry]
  const minPrice = observed.reduce((min, point) => Math.min(min, point.price), entry.price)
  const maxPrice = observed.reduce((max, point) => Math.max(max, point.price), entry.price)
  return {
    horizonMinutes,
    outcome,
    openedAt: entry.timestamp,
    evaluatedAt: exit.timestamp,
    touchedAt: outcome === 'tp1_hit' || outcome === 'stop_loss_hit' ? exit.timestamp : null,
    entryPrice: entry.price,
    exitPrice: exit.price,
    returnPercent: (exit.price - entry.price) / entry.price,
    maxDrawdown: (minPrice - entry.price) / entry.price,
    maxFavorableExcursion: (maxPrice - entry.price) / entry.price,
    tp1Price,
    stopLossPrice,
    barsObserved: window.length,
    complete,
    positive: outcome === 'tp1_hit',
  }
}
