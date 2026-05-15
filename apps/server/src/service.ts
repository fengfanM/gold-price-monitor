import type {
  AlertInfo,
  DataAnomaly,
  HistoryApiResponse,
  HistoryPoint,
  MarketContext,
  MarketReference,
  BacktestMonitor,
  QuoteApiResponse,
  QuoteSample,
  SourceChannelStatus,
  SourceStatus,
} from './types.js'
import { buildCandleSets } from './candles.js'
import { attachMarketReference, fetchFallbackQuote, fetchOfficialQuote } from './icbc.js'
import { buildMarketContext, buildUnavailableMarketContext } from './market-context.js'
import { buildDataQuality, detectQuoteAnomalies } from './quality.js'
import { fetchSgeReferenceQuotes } from './sge.js'
import { buildBacktestMonitor } from './backtest.js'
import { detectPatternSignals } from './patterns.js'
import {
  loadHistory,
  loadMarketContext,
  loadBacktestSnapshots,
  saveBacktestSnapshot,
  saveFactors,
  saveHistory,
  saveMarketContext,
} from './storage.js'
import { buildOpportunitySignal } from './strategy.js'

const ALERT_DROP_THRESHOLD = Number(process.env.ALERT_DROP_THRESHOLD ?? '0.01')
const ALERT_DRAWDOWN_THRESHOLD = Number(
  process.env.ALERT_DRAWDOWN_THRESHOLD ?? '0.015',
)
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
const STALE_MS = Number(process.env.STALE_MS ?? '300000')
const DEFAULT_REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS ?? '3000')
const MARKET_CONTEXT_TTL_MS = Number(process.env.MARKET_CONTEXT_TTL_MS ?? '60000')
const ENABLE_INLINE_MARKET_CONTEXT =
  process.env.ENABLE_INLINE_MARKET_CONTEXT === undefined
    ? process.env.VERCEL !== '1'
    : process.env.ENABLE_INLINE_MARKET_CONTEXT === '1'

export class QuoteService {
  private history: HistoryPoint[] = []
  private latestQuote: QuoteSample | null = null
  private lastRefreshError: string | null = null
  private lastRefreshPromise: Promise<void> | null = null
  private officialStatus: SourceChannelStatus = createSourceStatus()
  private fallbackStatus: SourceChannelStatus = createSourceStatus()
  private lastAnomalies: DataAnomaly[] = []
  private latestMarketContext: MarketContext | null = null
  private latestMarketContextBuiltAt = 0

  async init() {
    const [history, marketContext] = await Promise.all([
      loadHistory(),
      loadMarketContext(),
    ])
    this.history = pruneHistory(history)
    this.latestMarketContext = marketContext
    this.latestMarketContextBuiltAt = marketContext
      ? new Date(marketContext.updatedAt).getTime()
      : 0
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
    const quality = buildDataQuality(
      this.latestQuote,
      stats,
      sourceStatus,
      this.lastAnomalies,
    )
    const marketContext = this.latestMarketContext
      ?? buildUnavailableMarketContext(this.latestQuote, this.history)
    const patternSignals = detectPatternSignals(this.history, this.latestQuote)
    const opportunity = buildOpportunitySignal(
      this.history,
      this.latestQuote,
      stats,
      sourceStatus,
      marketContext,
      patternSignals,
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
      quality,
      marketContext,
      opportunity,
      patternSignals,
    }
  }

  getHistoryResponse(): HistoryApiResponse {
    const history = this.history.slice().sort(sortByTime)
    const stats = this.latestQuote ? buildStats(history, this.latestQuote) : null
    const alert = stats ? buildAlert(stats) : null
    const sourceStatus = this.getSourceStatus()

    return {
      history,
      candles: buildCandleSets(history),
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
      sourceStatus,
      quality: this.latestQuote && stats
        ? buildDataQuality(this.latestQuote, stats, sourceStatus, this.lastAnomalies)
        : null,
    }
  }

  getLastRefreshError() {
    return this.lastRefreshError
  }

  async getBacktestMonitor(): Promise<BacktestMonitor> {
    return buildBacktestMonitor(await loadBacktestSnapshots())
  }

  private async performRefresh() {
    try {
      const quote = await fetchOfficialQuote()
      const calibratedQuote = await this.calibrateQuote(quote)
      this.assertQuoteUsable(calibratedQuote)
      this.markSuccess('official')
      await this.acceptQuote(calibratedQuote)
      return
    } catch (error) {
      this.markFailure('official', error)
    }

    try {
      const quote = await fetchFallbackQuote()
      const calibratedQuote = await this.calibrateQuote(quote)
      this.assertQuoteUsable(calibratedQuote)
      this.markSuccess('fallback')
      await this.acceptQuote(calibratedQuote)
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

  private assertQuoteUsable(quote: QuoteSample) {
    const anomalies = detectQuoteAnomalies(quote, this.history)
    this.lastAnomalies = anomalies
    const critical = anomalies.find((item) => item.severity === 'critical')
    if (critical) {
      throw new Error(`行情质量异常：${critical.message}`)
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
    this.latestMarketContext = await this.buildMarketContextIfNeeded(quote)
    const stats = buildStats(this.history, quote)
    const patternSignals = detectPatternSignals(this.history, quote)
    const opportunity = buildOpportunitySignal(
      this.history,
      quote,
      stats,
      this.getSourceStatus(),
      this.latestMarketContext,
      patternSignals,
    )
    await Promise.all([
      saveHistory(this.history),
      saveMarketContext(this.latestMarketContext),
      saveFactors([
        this.latestMarketContext.factors.spotGoldUsd,
        this.latestMarketContext.factors.dollarIndex,
        this.latestMarketContext.factors.usdCny,
        ...this.latestMarketContext.macroFactors,
      ]),
      saveBacktestSnapshot({
        updatedAt: new Date().toISOString(),
        quoteTimestamp: quote.fetchedAt,
        price: quote.price,
        signalScore: opportunity.score,
        signalLevel: opportunity.level,
        backtest: this.latestMarketContext.backtest,
        valuation: opportunity.valuation,
        primaryPatternKind: opportunity.patternSignals[0]?.kind ?? null,
        confluenceScore: opportunity.confluence.score,
        confluenceConflictLevel: opportunity.confluence.conflictLevel,
        macroRegime: marketRegimeFromScore(this.latestMarketContext.factorScore),
        modelProbability: opportunity.probabilityModel.primaryPrediction.probability,
        modelConfidence: opportunity.probabilityModel.primaryPrediction.confidence,
      }),
    ])
  }

  private async buildMarketContextSafely(quote: QuoteSample) {
    try {
      const marketContext = await buildMarketContext(quote, this.history)
      this.latestMarketContextBuiltAt = Date.now()
      return marketContext
    } catch {
      return buildUnavailableMarketContext(quote, this.history)
    }
  }

  private async buildMarketContextIfNeeded(quote: QuoteSample) {
    if (
      this.latestMarketContext &&
      Number.isFinite(this.latestMarketContextBuiltAt) &&
      Date.now() - this.latestMarketContextBuiltAt < MARKET_CONTEXT_TTL_MS
    ) {
      return this.latestMarketContext
    }

    if (!ENABLE_INLINE_MARKET_CONTEXT) {
      return this.latestMarketContext ?? buildUnavailableMarketContext(quote, this.history)
    }

    return this.buildMarketContextSafely(quote)
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

function marketRegimeFromScore(score: number) {
  if (score >= 58) {
    return 'supportive' as const
  }
  if (score <= 42) {
    return 'pressure' as const
  }
  return 'neutral' as const
}

function normalizeReferencePrice(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}
