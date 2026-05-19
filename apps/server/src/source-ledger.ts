import type {
  MarketReferenceQuote,
  QuoteSample,
  QuoteSourceLedger,
  QuoteSourceLedgerEntry,
  SourceStatus,
} from './types.js'

const DISCREPANCY_WARNING_THRESHOLD = 0.004

export function buildQuoteSourceLedger(
  quote: QuoteSample,
  sourceStatus: SourceStatus,
): QuoteSourceLedger {
  const generatedAt = new Date().toISOString()
  const tradeSourceId = quote.sourceKind === 'official' ? 'icbc-official' : 'icbc-fallback'
  const marketSession = quote.marketReference.tradingSession?.status ?? 'unknown'
  const entries: QuoteSourceLedgerEntry[] = [
    {
      sourceId: tradeSourceId,
      label: quote.sourceName,
      instrument: quote.symbol,
      tradable: true,
      price: quote.price,
      timestamp: quote.updatedAt,
      marketSession,
      sourceUsage: 'production_realtime',
      freshnessMs: calculateFreshnessMs(quote.updatedAt, generatedAt),
      confidence: sourceStatus.stale || sourceStatus.active !== 'official' ? 'medium' : 'high',
      discrepancyFromTradePrice: 0,
      note: '页面所有买卖判断默认以该可交易工银积存金报价为主口径。',
    },
  ]

  pushReference(entries, quote.marketReference.au9999, {
    sourceId: 'sge-au9999',
    fallbackLabel: '上金所 AU9999',
    tradePrice: quote.price,
    generatedAt,
    marketSession,
  })
  pushReference(entries, quote.marketReference.autd, {
    sourceId: 'sge-autd',
    fallbackLabel: '上金所 AU(T+D)',
    tradePrice: quote.price,
    generatedAt,
    marketSession,
  })
  for (const reference of quote.marketReference.domesticReferences ?? []) {
    const sourceId = reference.symbol === 'ZHESHANG_ACCUMULATION_GOLD'
      ? 'bank-zheshang-accumulation-gold'
      : `bank-${reference.symbol.toLowerCase()}`
    pushReference(entries, reference, {
      sourceId,
      fallbackLabel: reference.label ?? reference.symbol,
      tradePrice: quote.price,
      generatedAt,
      marketSession,
    })
  }

  const consensusDeviationPercent = quote.marketReference.consensusPrice
    ? (quote.price - quote.marketReference.consensusPrice) / quote.marketReference.consensusPrice
    : quote.marketReference.consensusDeviationPercent ?? null
  const consensusStatus = consensusDeviationPercent === null
    ? 'unknown'
    : Math.abs(consensusDeviationPercent) >= DISCREPANCY_WARNING_THRESHOLD
      ? 'diverged'
      : 'aligned'
  const warnings = [
    sourceStatus.stale ? '工银主交易价已陈旧，禁止强提醒。' : null,
    sourceStatus.active === 'fallback' ? '当前使用备用源，需等待官方源恢复后再复核。' : null,
    consensusStatus === 'diverged'
      ? `报价口径不一致：工银交易价相对多源共识偏离 ${formatPercent(consensusDeviationPercent ?? 0)}。`
      : null,
    ...entries
      .filter((entry) => !entry.tradable && entry.price !== null)
      .map((entry) => `${entry.label}仅作校准参考，不能直接当作工银积存金成交价。`),
  ].filter((item): item is string => Boolean(item))

  return {
    version: 'quote-source-ledger-v1',
    generatedAt,
    tradeSourceId,
    tradePrice: quote.price,
    consensus: {
      price: quote.marketReference.consensusPrice ?? null,
      deviationPercent: consensusDeviationPercent,
      status: consensusStatus,
    },
    entries,
    warnings,
  }
}

function pushReference(
  entries: QuoteSourceLedgerEntry[],
  reference: MarketReferenceQuote | null,
  input: {
    sourceId: string
    fallbackLabel: string
    generatedAt: string
    marketSession: QuoteSourceLedgerEntry['marketSession']
    tradePrice: number
  },
) {
  if (!reference) {
    return
  }
  entries.push({
    sourceId: input.sourceId,
    label: reference.label ?? input.fallbackLabel,
    instrument: reference.symbol,
    tradable: false,
    price: reference.latestPrice,
    timestamp: reference.updatedAt ?? null,
    marketSession: input.marketSession,
    sourceUsage: 'reference_calibration',
    freshnessMs: calculateFreshnessMs(reference.updatedAt ?? null, input.generatedAt),
    confidence: reference.updatedAt ? 'medium' : 'low',
    discrepancyFromTradePrice: reference.latestPrice > 0
      ? (input.tradePrice - reference.latestPrice) / reference.latestPrice
      : null,
    note: '参考行情只用于校准、比价和异常提醒，不直接生成交易指令。',
  })
}

function calculateFreshnessMs(timestamp: string | null, nowIso: string) {
  if (!timestamp) {
    return null
  }
  const sourceTime = new Date(timestamp).getTime()
  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(sourceTime) || !Number.isFinite(now)) {
    return null
  }
  return Math.max(0, now - sourceTime)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}
