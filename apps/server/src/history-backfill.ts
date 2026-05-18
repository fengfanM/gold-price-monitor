import type { HistoryPoint, QuoteSourceKind } from './types.js'

const DEFAULT_BACKFILL_WINDOW_HOURS = Number(process.env.BACKFILL_WINDOW_HOURS ?? '72')
const DEFAULT_MAX_BACKFILL_POINTS = Number(process.env.BACKFILL_MAX_POINTS ?? '5000')

export type BackfillInputPoint = Partial<HistoryPoint> & {
  fetchedAt?: string
  updatedAt?: string
}

export type BackfillHistoryResult = {
  accepted: number
  rejected: number
  beforeCount: number
  afterCount: number
  firstTimestamp: string | null
  lastTimestamp: string | null
  rejectedReasons: string[]
  history: HistoryPoint[]
}

export function backfillHistory(
  existing: HistoryPoint[],
  inputPoints: BackfillInputPoint[],
  options: {
    maxPoints?: number
    windowHours?: number
    now?: Date
  } = {},
): BackfillHistoryResult {
  const maxPoints = Math.max(1, Math.floor(options.maxPoints ?? DEFAULT_MAX_BACKFILL_POINTS))
  const windowHours = Math.max(1, Number(options.windowHours ?? DEFAULT_BACKFILL_WINDOW_HOURS))
  const nowMs = options.now?.getTime() ?? Date.now()
  const cutoffMs = nowMs - windowHours * 60 * 60 * 1000
  const rejectedReasons: string[] = []
  const normalized = inputPoints
    .slice(0, maxPoints)
    .map((point, index) => normalizeBackfillPoint(point, index, rejectedReasons))
    .filter((point): point is HistoryPoint => point !== null)
    .filter((point) => {
      const timestampMs = new Date(point.timestamp).getTime()
      if (timestampMs < cutoffMs || timestampMs > nowMs + 5 * 60 * 1000) {
        rejectedReasons.push(`point_outside_window:${point.timestamp}`)
        return false
      }
      return true
    })

  const byTimestamp = new Map<string, HistoryPoint>()
  for (const point of [...existing, ...normalized]) {
    const timestampMs = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestampMs) || timestampMs < cutoffMs || timestampMs > nowMs + 5 * 60 * 1000) {
      continue
    }
    byTimestamp.set(point.timestamp, point)
  }

  const history = [...byTimestamp.values()]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-maxPoints)

  return {
    accepted: normalized.length,
    rejected: inputPoints.length - normalized.length,
    beforeCount: existing.length,
    afterCount: history.length,
    firstTimestamp: history[0]?.timestamp ?? null,
    lastTimestamp: history[history.length - 1]?.timestamp ?? null,
    rejectedReasons: [...new Set(rejectedReasons)].slice(0, 20),
    history,
  }
}

function normalizeBackfillPoint(
  point: BackfillInputPoint,
  index: number,
  rejectedReasons: string[],
): HistoryPoint | null {
  const timestamp = point.timestamp ?? point.fetchedAt ?? point.updatedAt
  const timestampMs = timestamp ? new Date(timestamp).getTime() : NaN
  const price = normalizePositiveNumber(point.price)
  if (!Number.isFinite(timestampMs)) {
    rejectedReasons.push(`invalid_timestamp:${index}`)
    return null
  }
  if (price === null) {
    rejectedReasons.push(`invalid_price:${index}`)
    return null
  }

  const activePrice = normalizePositiveNumber(point.activePrice) ?? price
  const regularPrice = normalizePositiveNumber(point.regularPrice) ?? price
  const sellPrice = normalizePositiveNumber(point.sellPrice) ?? price
  const dayLow = normalizePositiveNumber(point.dayLow) ?? Math.min(price, activePrice, regularPrice, sellPrice)
  const dayHigh = normalizePositiveNumber(point.dayHigh) ?? Math.max(price, activePrice, regularPrice, sellPrice)

  return {
    timestamp: new Date(timestampMs).toISOString(),
    sourceKind: normalizeSourceKind(point.sourceKind),
    price,
    activePrice,
    regularPrice,
    sellPrice,
    dayLow,
    dayHigh,
    referenceAnchorPrice: normalizeNullableNumber(point.referenceAnchorPrice),
    referenceAu9999Price: normalizeNullableNumber(point.referenceAu9999Price),
    referenceAutdPrice: normalizeNullableNumber(point.referenceAutdPrice),
  }
}

function normalizeSourceKind(value: unknown): QuoteSourceKind {
  return value === 'fallback' ? 'fallback' : 'official'
}

function normalizePositiveNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
