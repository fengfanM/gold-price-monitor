import type {
  MarketReferenceQuote,
  QuoteSample,
  QuoteSourceLedger,
  QuoteSourceLedgerEntry,
  SourceSlaLedger,
  SourceSlaLedgerEntry,
  SourceStatus,
} from './types.js'

const DISCREPANCY_WARNING_THRESHOLD = 0.004
const FRESHNESS_WATCH_MS = 5 * 60 * 1000
const FRESHNESS_STALE_MS = 15 * 60 * 1000

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

export function buildSourceSlaLedger(
  quote: QuoteSample,
  sourceStatus: SourceStatus,
  quoteLedger = buildQuoteSourceLedger(quote, sourceStatus),
): SourceSlaLedger {
  const generatedAt = quoteLedger.generatedAt
  const entries = quoteLedger.entries.map((entry) => toSlaEntry(entry, sourceStatus, quoteLedger.consensus.status))
  const tradeEntry = entries.find((entry) => entry.sourceId === quoteLedger.tradeSourceId)
  const referenceEntries = entries.filter((entry) => entry.sourceType === 'reference_source')
  const hasHealthyTradeSource = tradeEntry?.health === 'healthy'
  const hasReferenceConflict = quoteLedger.consensus.status === 'diverged' ||
    referenceEntries.some((entry) => entry.health === 'diverged')
  const hasReferenceAnchor = referenceEntries.some((entry) => entry.canUseForStrongSignal)
  const strongSignalEligible = Boolean(hasHealthyTradeSource && hasReferenceAnchor && !hasReferenceConflict)
  const warnings = [
    ...quoteLedger.warnings,
    !hasHealthyTradeSource ? '主交易源未达到实时健康 SLA，强提醒自动降级。' : null,
    !hasReferenceAnchor ? '缺少健康的 AU9999/AuTD/银行参考锚，强提醒缺少校准依据。' : null,
    hasReferenceConflict ? '参考源和交易源偏离过大，先复核报价口径。' : null,
  ].filter((item): item is string => Boolean(item))

  return {
    version: 'source-sla-ledger-v1',
    generatedAt,
    tradeSourceId: quoteLedger.tradeSourceId,
    tradePrice: quoteLedger.tradePrice,
    strongSignalEligible,
    summary: strongSignalEligible
      ? '主交易价实时健康，参考锚点未出现明显偏离，可进入强提醒候选。'
      : '数据源 SLA 未全部通过，页面只允许观察或降级信号。',
    entries,
    warnings,
  }
}

function toSlaEntry(
  entry: QuoteSourceLedgerEntry,
  sourceStatus: SourceStatus,
  consensusStatus: QuoteSourceLedger['consensus']['status'],
): SourceSlaLedgerEntry {
  const sourceType = entry.tradable ? 'tradeable_source' : 'reference_source'
  const health = classifySlaHealth(entry, sourceStatus, consensusStatus)
  return {
    sourceId: entry.sourceId,
    label: entry.label,
    sourceType,
    instrument: entry.instrument,
    price: entry.price,
    timestamp: entry.timestamp,
    freshnessMs: entry.freshnessMs,
    health,
    discrepancyFromTradePrice: entry.discrepancyFromTradePrice,
    canUseForStrongSignal: entry.tradable
      ? health === 'healthy'
      : health === 'healthy' || health === 'watch',
    note: entry.tradable
      ? '真实可交易口径，所有行动口令以它为主。'
      : '参考校准口径，只用于验证便宜/偏贵和异常，不直接生成交易指令。',
  }
}

function classifySlaHealth(
  entry: QuoteSourceLedgerEntry,
  sourceStatus: SourceStatus,
  consensusStatus: QuoteSourceLedger['consensus']['status'],
): SourceSlaLedgerEntry['health'] {
  if (entry.price === null) {
    return 'missing'
  }
  if (entry.tradable && (sourceStatus.stale || sourceStatus.active === 'fallback')) {
    return 'stale'
  }
  if (!entry.tradable && entry.discrepancyFromTradePrice !== null && Math.abs(entry.discrepancyFromTradePrice) >= DISCREPANCY_WARNING_THRESHOLD) {
    return 'diverged'
  }
  if (entry.tradable && consensusStatus === 'diverged') {
    return 'diverged'
  }
  if (entry.marketSession !== 'trading' && entry.freshnessMs !== null && entry.freshnessMs >= FRESHNESS_STALE_MS) {
    return 'watch'
  }
  if (entry.freshnessMs !== null && entry.freshnessMs >= FRESHNESS_STALE_MS) {
    return 'stale'
  }
  if (entry.freshnessMs !== null && entry.freshnessMs >= FRESHNESS_WATCH_MS) {
    return 'watch'
  }
  return 'healthy'
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
