export type QuoteSourceKind = 'official' | 'fallback'

export type SourceAvailability = 'unknown' | 'healthy' | 'down'

export type MarketReferenceQuote = {
  symbol: string
  latestPrice: number
  highPrice: number
  lowPrice: number
  openPrice: number
}

export type MarketReference = {
  sourceName: string
  sourceUrl: string
  isDelayed: boolean
  tradingDate: string | null
  au9999: MarketReferenceQuote | null
  autd: MarketReferenceQuote | null
  calibration: {
    anchorSymbol: string | null
    anchorPrice: number | null
    spread: number | null
    premiumPercent: number | null
    withinReferenceRange: boolean | null
    note: string
  }
}

export type QuoteSample = {
  symbol: string
  currency: 'CNY'
  unit: '元/克'
  price: number
  activePrice: number
  regularPrice: number
  sellPrice: number
  dayLow: number
  dayHigh: number
  updatedAt: string
  fetchedAt: string
  productName: string
  productCode: string
  sourceKind: QuoteSourceKind
  sourceName: string
  marketReference: MarketReference
}

export type HistoryPoint = {
  timestamp: string
  sourceKind: QuoteSourceKind
  price: number
  activePrice: number
  regularPrice: number
  sellPrice: number
  dayLow: number
  dayHigh: number
  referenceAnchorPrice: number | null
  referenceAu9999Price: number | null
  referenceAutdPrice: number | null
}

export type AlertLevel = 'normal' | 'watch' | 'elevated' | 'critical'

export type AlertInfo = {
  level: AlertLevel
  triggered: boolean
  thresholdPercent: number
  drawdownThresholdPercent: number
  reason: string
}

export type OpportunityLevel = 'none' | 'watch' | 'strong'

export type OpportunitySignal = {
  score: number
  level: OpportunityLevel
  triggered: boolean
  title: string
  summary: string
  reasons: string[]
  risks: string[]
  computedAt: string
}

export type SourceChannelStatus = {
  status: SourceAvailability
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError: string | null
}

export type SourceStatus = {
  active: QuoteSourceKind | null
  stale: boolean
  lastSuccessAt: string | null
  official: SourceChannelStatus
  fallback: SourceChannelStatus
}

export type QuoteStats24h = {
  high24h: number
  low24h: number
  currentPrice: number
  absoluteChange24h: number
  percentChange24h: number
  drawdownAmount24h: number
  drawdownPercent24h: number
  pointCount: number
}

export type QuoteApiResponse = {
  productName: string
  productCode: string
  symbol: string
  currency: 'CNY'
  unit: '元/克'
  price: number
  activePrice: number
  regularPrice: number
  sellPrice: number
  updatedAt: string
  fetchedAt: string
  sourceName: string
  sourceKind: QuoteSourceKind
  sourceStatus: SourceStatus
  dayRange: {
    low: number
    high: number
  }
  marketReference: MarketReference
  stats24h: QuoteStats24h
  alert: AlertInfo
  opportunity: OpportunitySignal
}

export type HistoryApiResponse = {
  history: HistoryPoint[]
  summary: {
    windowHours: 24
    pointCount: number
    firstTimestamp: string | null
    lastTimestamp: string | null
    high24h: number | null
    low24h: number | null
    currentPrice: number | null
    absoluteChange24h: number | null
    percentChange24h: number | null
    drawdownAmount24h: number | null
    drawdownPercent24h: number | null
    alertLevel: AlertLevel
  }
  sourceStatus: SourceStatus
}
