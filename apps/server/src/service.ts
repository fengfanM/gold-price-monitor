import type {
  AlertInfo,
  HistoryApiResponse,
  HistoryPoint,
  MarketReference,
  OpportunitySignal,
  QuoteApiResponse,
  QuoteSample,
  SourceChannelStatus,
  SourceStatus,
} from './types.js'
import { attachMarketReference, fetchFallbackQuote, fetchOfficialQuote } from './icbc.js'
import { fetchSgeReferenceQuotes } from './sge.js'
import { loadHistory, saveHistory } from './storage.js'

const ALERT_DROP_THRESHOLD = Number(process.env.ALERT_DROP_THRESHOLD ?? '0.01')
const ALERT_DRAWDOWN_THRESHOLD = Number(
  process.env.ALERT_DRAWDOWN_THRESHOLD ?? '0.015',
)
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
const STALE_MS = Number(process.env.STALE_MS ?? '300000')
const DEFAULT_REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS ?? '25000')

export class QuoteService {
  private history: HistoryPoint[] = []
  private latestQuote: QuoteSample | null = null
  private lastRefreshError: string | null = null
  private lastRefreshPromise: Promise<void> | null = null
  private officialStatus: SourceChannelStatus = createSourceStatus()
  private fallbackStatus: SourceChannelStatus = createSourceStatus()

  async init() {
    this.history = pruneHistory(await loadHistory())
    await this.refresh()
  }

  async refresh() {
    if (this.lastRefreshPromise) {
      return this.lastRefreshPromise
    }

    this.lastRefreshPromise = this.performRefresh().finally(() => {
      this.lastRefreshPromise = null
    })

    return this.lastRefreshPromise
  }

  async refreshIfStale(maxAgeMs = DEFAULT_REFRESH_TTL_MS) {
    if (!this.latestQuote) {
      await this.refresh()
      return
    }

    const fetchedAtMs = new Date(this.latestQuote.fetchedAt).getTime()
    if (!Number.isFinite(fetchedAtMs) || Date.now() - fetchedAtMs >= maxAgeMs) {
      await this.refresh()
    }
  }

  getQuoteResponse(): QuoteApiResponse {
    if (!this.latestQuote) {
      throw new Error('报价尚未初始化')
    }

    const stats = buildStats(this.history, this.latestQuote)
    const alert = buildAlert(stats)
    const sourceStatus = this.getSourceStatus()
    const opportunity = buildOpportunitySignal(
      this.history,
      this.latestQuote,
      stats,
      sourceStatus,
    )

    return {
      productName: this.latestQuote.productName,
      productCode: this.latestQuote.productCode,
      symbol: this.latestQuote.symbol,
      currency: this.latestQuote.currency,
      unit: this.latestQuote.unit,
      price: this.latestQuote.price,
      activePrice: this.latestQuote.activePrice,
      regularPrice: this.latestQuote.regularPrice,
      sellPrice: this.latestQuote.sellPrice,
      updatedAt: this.latestQuote.updatedAt,
      fetchedAt: this.latestQuote.fetchedAt,
      sourceName: this.latestQuote.sourceName,
      sourceKind: this.latestQuote.sourceKind,
      sourceStatus,
      dayRange: {
        low: this.latestQuote.dayLow,
        high: this.latestQuote.dayHigh,
      },
      marketReference: this.latestQuote.marketReference,
      stats24h: stats,
      alert,
      opportunity,
    }
  }

  getHistoryResponse(): HistoryApiResponse {
    const history = this.history.slice().sort(sortByTime)
    const stats = this.latestQuote ? buildStats(history, this.latestQuote) : null
    const alert = stats ? buildAlert(stats) : null

    return {
      history,
      summary: {
        windowHours: 24,
        pointCount: history.length,
        firstTimestamp: history[0]?.timestamp ?? null,
        lastTimestamp: history[history.length - 1]?.timestamp ?? null,
        high24h: stats?.high24h ?? null,
        low24h: stats?.low24h ?? null,
        currentPrice: stats?.currentPrice ?? null,
        absoluteChange24h: stats?.absoluteChange24h ?? null,
        percentChange24h: stats?.percentChange24h ?? null,
        drawdownAmount24h: stats?.drawdownAmount24h ?? null,
        drawdownPercent24h: stats?.drawdownPercent24h ?? null,
        alertLevel: alert?.level ?? 'normal',
      },
      sourceStatus: this.getSourceStatus(),
    }
  }

  getLastRefreshError() {
    return this.lastRefreshError
  }

  private async performRefresh() {
    try {
      const quote = await fetchOfficialQuote()
      this.markSuccess('official')
      await this.acceptQuote(await this.calibrateQuote(quote))
      return
    } catch (error) {
      this.markFailure('official', error)
    }

    try {
      const quote = await fetchFallbackQuote()
      this.markSuccess('fallback')
      await this.acceptQuote(await this.calibrateQuote(quote))
      return
    } catch (error) {
      this.markFailure('fallback', error)
      this.lastRefreshError =
        error instanceof Error ? error.message : '未知刷新错误'
      if (!this.latestQuote) {
        throw error
      }
    }
  }

  private async calibrateQuote(quote: QuoteSample) {
    try {
      const reference = await fetchSgeReferenceQuotes()
      return attachMarketReference(quote, buildMarketReference(quote, reference))
    } catch {
      return quote
    }
  }

  private async acceptQuote(quote: QuoteSample) {
    this.latestQuote = quote
    this.lastRefreshError = null
    const anchorPrice = normalizeReferencePrice(
      quote.marketReference.calibration.anchorPrice,
    )

    this.history = mergeHistoryPoint(this.history, {
      price: quote.price,
      activePrice: quote.activePrice,
      regularPrice: quote.regularPrice,
      sellPrice: quote.sellPrice,
      dayLow: quote.dayLow,
      dayHigh: quote.dayHigh,
      referenceAnchorPrice: anchorPrice,
      referenceAu9999Price: normalizeReferencePrice(
        quote.marketReference.au9999?.latestPrice ?? null,
      ),
      referenceAutdPrice: normalizeReferencePrice(
        quote.marketReference.autd?.latestPrice ?? null,
      ),
      timestamp: quote.fetchedAt,
      sourceKind: quote.sourceKind,
    })
    await saveHistory(this.history)
  }

  private markSuccess(channel: 'official' | 'fallback') {
    const target = channel === 'official' ? this.officialStatus : this.fallbackStatus
    target.status = 'healthy'
    target.lastSuccessAt = new Date().toISOString()
    target.lastError = null
  }

  private markFailure(channel: 'official' | 'fallback', error: unknown) {
    const target = channel === 'official' ? this.officialStatus : this.fallbackStatus
    target.status = 'down'
    target.lastFailureAt = new Date().toISOString()
    target.lastError = error instanceof Error ? error.message : String(error)
  }

  private getSourceStatus(): SourceStatus {
    const lastSuccessAt = this.latestQuote?.fetchedAt ?? null
    return {
      active: this.latestQuote?.sourceKind ?? null,
      stale: !lastSuccessAt || Date.now() - new Date(lastSuccessAt).getTime() > STALE_MS,
      lastSuccessAt,
      official: { ...this.officialStatus },
      fallback: { ...this.fallbackStatus },
    }
  }
}

function createSourceStatus(): SourceChannelStatus {
  return {
    status: 'unknown',
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  }
}

function mergeHistoryPoint(history: HistoryPoint[], point: HistoryPoint) {
  const next = pruneHistory([...history])
  const last = next[next.length - 1]

  if (last && last.timestamp === point.timestamp) {
    next[next.length - 1] = point
    return pruneHistory(next)
  }

  if (last) {
    const deltaMs =
      new Date(point.timestamp).getTime() - new Date(last.timestamp).getTime()
    if (deltaMs > 0 && deltaMs < 10_000) {
      next[next.length - 1] = point
      return pruneHistory(next)
    }
  }

  next.push(point)
  return pruneHistory(next)
}

function pruneHistory(history: HistoryPoint[]) {
  const now = Date.now()
  return history
    .filter((point) => {
      const timestampMs = new Date(point.timestamp).getTime()
      return Number.isFinite(timestampMs) && now - timestampMs <= HISTORY_WINDOW_MS
    })
    .sort(sortByTime)
}

function sortByTime(left: HistoryPoint, right: HistoryPoint) {
  return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
}

function buildStats(history: HistoryPoint[], latestQuote: QuoteSample) {
  const rollingHistory = history.length > 0
    ? history
    : [{
        price: latestQuote.price,
        activePrice: latestQuote.activePrice,
        regularPrice: latestQuote.regularPrice,
        sellPrice: latestQuote.sellPrice,
        dayLow: latestQuote.dayLow,
        dayHigh: latestQuote.dayHigh,
        referenceAnchorPrice: normalizeReferencePrice(
          latestQuote.marketReference.calibration.anchorPrice,
        ),
        referenceAu9999Price: normalizeReferencePrice(
          latestQuote.marketReference.au9999?.latestPrice ?? null,
        ),
        referenceAutdPrice: normalizeReferencePrice(
          latestQuote.marketReference.autd?.latestPrice ?? null,
        ),
        timestamp: latestQuote.fetchedAt,
        sourceKind: latestQuote.sourceKind,
      }]

  const latestPrice = latestQuote.price
  const baselinePrice = rollingHistory[0]?.price ?? latestPrice
  const high24h = rollingHistory.reduce(
    (max, point) => Math.max(max, point.price),
    rollingHistory[0]?.price ?? latestPrice,
  )
  const low24h = rollingHistory.reduce(
    (min, point) => Math.min(min, point.price),
    rollingHistory[0]?.price ?? latestPrice,
  )
  const absoluteChange24h = latestPrice - baselinePrice
  const percentChange24h = baselinePrice === 0 ? 0 : absoluteChange24h / baselinePrice
  const drawdownAmount24h = Math.max(high24h - latestPrice, 0)
  const drawdownPercent24h = high24h === 0 ? 0 : drawdownAmount24h / high24h

  return {
    high24h,
    low24h,
    currentPrice: latestPrice,
    absoluteChange24h,
    percentChange24h,
    drawdownAmount24h,
    drawdownPercent24h,
    pointCount: rollingHistory.length,
  } as const
}

function buildAlert(stats: QuoteApiResponse['stats24h']): AlertInfo {
  const largeDrop = stats.percentChange24h <= -Math.abs(ALERT_DROP_THRESHOLD)
  const largeDrawdown =
    stats.drawdownPercent24h >= Math.abs(ALERT_DRAWDOWN_THRESHOLD)

  if (stats.drawdownPercent24h >= 0.018 || stats.percentChange24h <= -0.018) {
    return {
      level: 'critical',
      triggered: true,
      thresholdPercent: ALERT_DROP_THRESHOLD,
      drawdownThresholdPercent: ALERT_DRAWDOWN_THRESHOLD,
      reason: '当前价格相对近 24 小时区间出现显著回撤',
    }
  }

  if (stats.drawdownPercent24h >= 0.012 || stats.percentChange24h <= -0.012) {
    return {
      level: 'elevated',
      triggered: true,
      thresholdPercent: ALERT_DROP_THRESHOLD,
      drawdownThresholdPercent: ALERT_DRAWDOWN_THRESHOLD,
      reason: '当前价格近 24 小时跌幅已进入强提醒区间',
    }
  }

  if (largeDrop || largeDrawdown || stats.drawdownPercent24h > 0) {
    return {
      level: 'watch',
      triggered: largeDrop || largeDrawdown,
      thresholdPercent: ALERT_DROP_THRESHOLD,
      drawdownThresholdPercent: ALERT_DRAWDOWN_THRESHOLD,
      reason: '价格处于回落区间，建议展示预警状态',
    }
  }

  return {
    level: 'normal',
    triggered: false,
    thresholdPercent: ALERT_DROP_THRESHOLD,
    drawdownThresholdPercent: ALERT_DRAWDOWN_THRESHOLD,
    reason: '价格运行平稳',
  }
}

function buildOpportunitySignal(
  history: HistoryPoint[],
  latestQuote: QuoteSample,
  stats: QuoteApiResponse['stats24h'],
  sourceStatus: SourceStatus,
): OpportunitySignal {
  const reasons: string[] = []
  const risks: string[] = []
  let score = 0
  let scoreCap = 100

  const rangeSpan = stats.high24h - stats.low24h
  const positionFromLow =
    rangeSpan > 0 ? clamp((stats.currentPrice - stats.low24h) / rangeSpan, 0, 1) : null

  if (positionFromLow === null) {
    risks.push('近 24 小时价格区间不足，低位判断样本有限。')
    scoreCap = Math.min(scoreCap, 64)
  } else if (positionFromLow <= 0.15) {
    score += 24
    reasons.push('当前价格贴近近 24 小时低位，具备低位观察条件。')
  } else if (positionFromLow <= 0.3) {
    score += 18
    reasons.push('当前价格处在近 24 小时区间偏低位置。')
  } else if (positionFromLow <= 0.5) {
    score += 10
    reasons.push('当前价格仍位于近 24 小时区间中下部。')
  } else if (positionFromLow >= 0.75) {
    risks.push('当前价格已靠近近 24 小时高位，避免把追高误判为买点。')
    scoreCap = Math.min(scoreCap, 42)
  } else {
    risks.push('当前价格距离近 24 小时低位仍有空间，低位优势不明显。')
    scoreCap = Math.min(scoreCap, 68)
  }

  if (stats.drawdownPercent24h >= 0.018) {
    score += 18
    reasons.push(`相对近 24 小时高点回撤 ${formatPercent(stats.drawdownPercent24h)}，回落幅度较充分。`)
  } else if (stats.drawdownPercent24h >= 0.012) {
    score += 14
    reasons.push(`相对近 24 小时高点回撤 ${formatPercent(stats.drawdownPercent24h)}，进入观察回撤区。`)
  } else if (stats.drawdownPercent24h >= 0.006) {
    score += 8
    reasons.push(`相对近 24 小时高点已有 ${formatPercent(stats.drawdownPercent24h)} 回撤。`)
  } else {
    risks.push('近 24 小时回撤不深，价格安全垫有限。')
  }

  if (stats.percentChange24h <= -0.012) {
    score += 10
    reasons.push(`近 24 小时跌幅 ${formatPercent(Math.abs(stats.percentChange24h))}，存在回落后的观察窗口。`)
  } else if (stats.percentChange24h <= -0.004) {
    score += 6
    reasons.push('近 24 小时价格小幅回落，未处于明显追涨状态。')
  } else if (stats.percentChange24h >= 0.012) {
    risks.push(`近 24 小时涨幅 ${formatPercent(stats.percentChange24h)}，追高风险上升。`)
    scoreCap = Math.min(scoreCap, 48)
  }

  const calibration = latestQuote.marketReference.calibration
  const premiumPercent = calibration.premiumPercent
  if (premiumPercent === null) {
    risks.push('缺少上金所参考锚点，无法确认相对锚点折溢价。')
    scoreCap = Math.min(scoreCap, 72)
  } else if (premiumPercent <= -0.002) {
    score += 18
    reasons.push(`相对上金所${calibration.anchorSymbol ?? '参考锚'}折价 ${formatPercent(Math.abs(premiumPercent))}。`)
  } else if (premiumPercent <= 0.006) {
    score += 15
    reasons.push('相对上金所参考锚点偏离较低，锚点校准通过。')
  } else if (premiumPercent <= 0.012) {
    score += 9
    reasons.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，仍在温和区间。`)
  } else if (premiumPercent <= 0.02) {
    score += 3
    risks.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，买点质量打折。`)
    scoreCap = Math.min(scoreCap, 68)
  } else {
    risks.push(`相对上金所参考锚点溢价 ${formatPercent(premiumPercent)}，暂不适合标记为强买点观察。`)
    scoreCap = Math.min(scoreCap, 44)
  }

  if (calibration.withinReferenceRange === false) {
    risks.push('当前价格超出上金所参考区间的宽容范围，锚点一致性偏弱。')
    scoreCap = Math.min(scoreCap, 52)
  }

  const shortTerm = analyzeShortTerm(history, latestQuote)
  if (shortTerm.pointCount < 3) {
    risks.push('短线历史点不足，止跌/反弹确认度有限。')
    scoreCap = Math.min(scoreCap, 62)
  } else if (shortTerm.reboundPercent >= 0.001 && shortTerm.lastMovePercent >= 0) {
    score += 16
    reasons.push(`短线自近期低点反弹 ${formatPercent(shortTerm.reboundPercent)}，出现止跌迹象。`)
  } else if (shortTerm.lastMovePercent >= 0 && stats.percentChange24h < 0) {
    score += 10
    reasons.push('下跌后最新报价未继续走低，短线有企稳迹象。')
  } else {
    risks.push('短线仍未确认止跌，可能继续惯性下探。')
    scoreCap = Math.min(scoreCap, 70)
  }

  const activeChannel = getActiveChannelStatus(sourceStatus)
  if (!sourceStatus.stale && activeChannel?.status === 'healthy') {
    score += 12
    reasons.push('当前报价数据源健康且未陈旧。')
  } else {
    risks.push('报价数据源状态不佳或数据已陈旧，信号需要降级处理。')
    scoreCap = Math.min(scoreCap, 40)
  }

  if (sourceStatus.active === 'fallback') {
    risks.push('当前使用备用数据源，建议等待官方源恢复后再复核。')
    scoreCap = Math.min(scoreCap, 76)
  }

  risks.push('该信号仅用于行情观察，不构成投资建议、收益承诺或买入指令。')

  const finalScore = Math.round(clamp(Math.min(score, scoreCap), 0, 100))
  const level = finalScore >= 72 ? 'strong' : finalScore >= 45 ? 'watch' : 'none'

  return {
    score: finalScore,
    level,
    triggered: level !== 'none',
    title: buildOpportunityTitle(level),
    summary: buildOpportunitySummary(level),
    reasons,
    risks,
    computedAt: new Date().toISOString(),
  }
}

function analyzeShortTerm(history: HistoryPoint[], latestQuote: QuoteSample) {
  const latestPoint: HistoryPoint = {
    price: latestQuote.price,
    activePrice: latestQuote.activePrice,
    regularPrice: latestQuote.regularPrice,
    sellPrice: latestQuote.sellPrice,
    dayLow: latestQuote.dayLow,
    dayHigh: latestQuote.dayHigh,
    referenceAnchorPrice: latestQuote.marketReference.calibration.anchorPrice,
    referenceAu9999Price: latestQuote.marketReference.au9999?.latestPrice ?? null,
    referenceAutdPrice: latestQuote.marketReference.autd?.latestPrice ?? null,
    timestamp: latestQuote.fetchedAt,
    sourceKind: latestQuote.sourceKind,
  }
  const latestMs = new Date(latestQuote.fetchedAt).getTime()
  const points = [...history, latestPoint]
    .filter((point) => {
      const timestampMs = new Date(point.timestamp).getTime()
      return Number.isFinite(timestampMs) && latestMs - timestampMs <= 2 * 60 * 60 * 1000
    })
    .sort(sortByTime)
  const deduped = dedupeHistoryByTimestamp(points)
  const recent = deduped.slice(-8)
  const previous = recent[recent.length - 2]
  const recentLow = recent.reduce(
    (min, point) => Math.min(min, point.price),
    recent[0]?.price ?? latestQuote.price,
  )
  const lastMovePercent = previous && previous.price > 0
    ? (latestQuote.price - previous.price) / previous.price
    : 0
  const reboundPercent = recentLow > 0
    ? (latestQuote.price - recentLow) / recentLow
    : 0

  return {
    pointCount: recent.length,
    lastMovePercent,
    reboundPercent,
  }
}

function dedupeHistoryByTimestamp(history: HistoryPoint[]) {
  const deduped: HistoryPoint[] = []
  for (const point of history) {
    const last = deduped[deduped.length - 1]
    if (last?.timestamp === point.timestamp) {
      deduped[deduped.length - 1] = point
      continue
    }
    deduped.push(point)
  }
  return deduped
}

function getActiveChannelStatus(sourceStatus: SourceStatus) {
  if (sourceStatus.active === 'official') {
    return sourceStatus.official
  }
  if (sourceStatus.active === 'fallback') {
    return sourceStatus.fallback
  }
  return null
}

function buildOpportunityTitle(level: OpportunitySignal['level']) {
  if (level === 'strong') {
    return '绝佳买点观察：强观察信号'
  }
  if (level === 'watch') {
    return '绝佳买点观察：进入观察区'
  }
  return '绝佳买点观察：暂未触发'
}

function buildOpportunitySummary(level: OpportunitySignal['level']) {
  if (level === 'strong') {
    return '多个观察条件同时满足，可重点跟踪该价格窗口；信号不保证后续上涨。'
  }
  if (level === 'watch') {
    return '部分低位、锚点或短线企稳条件出现配合，适合继续观察而非追高。'
  }
  return '当前条件不足以形成买点观察信号，建议等待更充分的回撤、锚点或企稳确认。'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function buildMarketReference(
  quote: QuoteSample,
  reference: Awaited<ReturnType<typeof fetchSgeReferenceQuotes>>,
): MarketReference {
  const anchor = [reference.au9999, reference.autd].find((item) => {
    return item !== null && item.latestPrice > 0
  }) ?? null
  const anchorPrice = normalizeReferencePrice(anchor?.latestPrice ?? null)
  const spread = anchorPrice === null ? null : quote.price - anchorPrice
  const premiumPercent =
    anchorPrice && spread !== null ? spread / anchorPrice : null
  const withinReferenceRange = anchor
    ? quote.price >= Math.min(anchor.lowPrice, anchor.highPrice) - 20 &&
      quote.price <= Math.max(anchor.lowPrice, anchor.highPrice) + 20
    : null

  return {
    sourceName: reference.sourceName,
    sourceUrl: reference.sourceUrl,
    isDelayed: reference.isDelayed,
    tradingDate: reference.tradingDate,
    au9999: reference.au9999,
    autd: reference.autd,
    calibration: {
      anchorSymbol: anchor?.symbol ?? null,
      anchorPrice,
      spread,
      premiumPercent,
      withinReferenceRange,
      note: anchor
        ? '工银积存金与上金所公开延时行情联合校准，仅作市场参考锚。'
        : '未获取到可用的上金所参考锚。',
    },
  }
}

function normalizeReferencePrice(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}
