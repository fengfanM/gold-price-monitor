import type { CandleApiPoint, CandleTimeframe, HistoryPoint } from './types.js'

const TIMEFRAME_MINUTES: Record<CandleTimeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '60m': 60,
}

export function buildCandleSets(history: HistoryPoint[]) {
  return {
    '1m': buildCandles(history, '1m'),
    '5m': buildCandles(history, '5m'),
    '15m': buildCandles(history, '15m'),
    '60m': buildCandles(history, '60m'),
  } satisfies Record<CandleTimeframe, CandleApiPoint[]>
}

export function buildCandles(
  history: HistoryPoint[],
  timeframe: CandleTimeframe,
): CandleApiPoint[] {
  const bucketMinutes = TIMEFRAME_MINUTES[timeframe]
  const bucketMs = bucketMinutes * 60 * 1000
  const buckets = new Map<number, CandleApiPoint>()

  for (const point of history) {
    const timestampMs = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestampMs) || !Number.isFinite(point.price)) {
      continue
    }

    const bucketStart = Math.floor(timestampMs / bucketMs) * bucketMs
    const existing = buckets.get(bucketStart)
    if (!existing) {
      buckets.set(bucketStart, {
        timestamp: new Date(bucketStart).toISOString(),
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        pointCount: 1,
      })
      continue
    }

    existing.high = Math.max(existing.high, point.price)
    existing.low = Math.min(existing.low, point.price)
    existing.close = point.price
    existing.pointCount += 1
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
}
