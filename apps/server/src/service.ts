import type {
  AlertInfo,
  DataAnomaly,
  DecisionEvidencePacket,
  EventIntelligenceResponse,
  HistoryApiResponse,
  HistoryPoint,
  MarketContext,
  MarketReference,
  MarketReferenceQuote,
  BacktestMonitor,
  ModelProviderScorecardEntry,
  ModelRegistryEntry,
  ModelProviderScorecard,
  OpportunitySignal,
  QuoteApiResponse,
  QuoteSample,
  SignalJournalEntry,
  SignalJournalEvidence,
  SignalJournalRecord,
  SourceSlaLedger,
  SourceChannelStatus,
  SourceStatus,
} from './types.js'
import { buildCandleSets } from './candles.js'
import { attachMarketReference, fetchFallbackQuote, fetchOfficialQuote } from './icbc.js'
import { buildMarketContext, buildUnavailableMarketContext } from './market-context.js'
import {
  fetchDomesticGoldReferenceQuotes,
  type ProviderQuote,
} from './market-providers.js'
import { buildDataQuality, detectQuoteAnomalies } from './quality.js'
import { fetchSgeReferenceQuotes } from './sge.js'
import {
  buildBacktestMonitor,
  buildBacktestSnapshotsFromHistory,
  buildExternalModelBacktestGate,
} from './backtest.js'
import { detectPatternSignals } from './patterns.js'
import { fetchExternalModelAdvisor } from './external-model-advisor.js'
import {
  loadHistory,
  loadMarketContext,
  loadBacktestSnapshots,
  loadSignalJournalRecords,
  mergeBacktestSnapshots,
  mergeSignalJournalRecords,
  saveBacktestSnapshots,
  saveFactors,
  saveHistory,
  saveMarketContext,
  saveSignalJournalRecord,
} from './storage.js'
import { buildOpportunitySignal } from './strategy.js'
import { buildEconomicEventRisk, buildEventIntelligenceResponse } from './event-risk.js'
import { buildQuoteSourceLedger, buildSourceSlaLedger } from './source-ledger.js'

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
const ENABLE_HISTORY_BACKTEST_SEED =
  process.env.ENABLE_HISTORY_BACKTEST_SEED === undefined
    ? true
    : process.env.ENABLE_HISTORY_BACKTEST_SEED === '1'
const MODEL_REGISTRY_MIN_PROMOTION_SAMPLES = Number(
  process.env.MODEL_REGISTRY_MIN_PROMOTION_SAMPLES ?? '30',
)
const MODEL_REGISTRY_MAX_PROMOTION_BRIER = Number(
  process.env.MODEL_REGISTRY_MAX_PROMOTION_BRIER ?? '0.24',
)

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
  private latestExternalModelAdvisor: Awaited<ReturnType<typeof fetchExternalModelAdvisor>> | null = null
  private latestBacktestMonitor: BacktestMonitor | null = null
  private latestBacktestSeedAt = 0
  private signalJournalRecords: SignalJournalRecord[] = []

  async init() {
    const [history, marketContext, backtestSnapshots, signalJournalRecords] = await Promise.all([
      loadHistory(),
      loadMarketContext(),
      loadBacktestSnapshots(),
      loadSignalJournalRecords(),
    ])
    this.history = pruneHistory(history)
    this.latestMarketContext = marketContext
    this.latestMarketContextBuiltAt = marketContext
      ? new Date(marketContext.updatedAt).getTime()
      : 0
    this.latestQuote = buildCachedQuoteFromHistory(this.history)
    this.latestBacktestMonitor = buildBacktestMonitor(
      backtestSnapshots,
      selectBacktestHorizonMinutes(backtestSnapshots),
    )
    this.signalJournalRecords = signalJournalRecords
    await this.seedBacktestSnapshotsFromHistory()
    try {
      await this.refresh()
    } catch (error) {
      this.lastRefreshError = error instanceof Error ? error.message : String(error)
    }
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
    const sourceLedger = buildQuoteSourceLedger(this.latestQuote, sourceStatus)
    const sourceSlaLedger = buildSourceSlaLedger(this.latestQuote, sourceStatus, sourceLedger)
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
      this.latestExternalModelAdvisor,
      this.latestBacktestMonitor,
    )
    const sourceGuardedOpportunity = applySourceSlaGuard(opportunity, sourceSlaLedger)
    const journalPreview = buildSignalJournalEntry(
      this.latestQuote,
      sourceGuardedOpportunity,
      sourceSlaLedger,
    )
    const enhancedOpportunity = {
      ...sourceGuardedOpportunity,
      decisionView: {
        ...sourceGuardedOpportunity.decisionView,
        sourceLedger: sourceSlaLedger,
        journalPreview,
      },
    }

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
      sourceLedger,
      sourceSlaLedger,
      dayRange: {
        low: this.latestQuote.dayLow,
        high: this.latestQuote.dayHigh,
      },
      marketReference: this.latestQuote.marketReference,
      stats24h: stats,
      alert,
      quality,
      marketContext,
      opportunity: enhancedOpportunity,
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
    await this.seedBacktestSnapshotsFromHistory()
    const snapshots = await loadBacktestSnapshots()
    this.latestBacktestMonitor = buildBacktestMonitor(snapshots, selectBacktestHorizonMinutes(snapshots))
    return this.latestBacktestMonitor
  }

  getSourceLedgerResponse(): SourceSlaLedger {
    if (!this.latestQuote) {
      throw new Error('报价尚未初始化')
    }
    const quoteLedger = buildQuoteSourceLedger(this.latestQuote, this.getSourceStatus())
    return buildSourceSlaLedger(this.latestQuote, this.getSourceStatus(), quoteLedger)
  }

  getEventsResponse() {
    const timestamp = this.latestQuote?.fetchedAt ?? new Date().toISOString()
    const risk = buildEconomicEventRisk(timestamp)
    return {
      version: 'event-phase-state-v1',
      generatedAt: new Date().toISOString(),
      current: risk,
      upcomingEvents: risk.upcomingEvents,
      summary: risk.summary,
      usageBoundary: '事件日历用于风控和等待确认；事件第一波默认不放大强提醒。',
    }
  }

  getEventIntelligenceResponse(): EventIntelligenceResponse {
    const timestamp = this.latestQuote?.fetchedAt ?? new Date().toISOString()
    return buildEventIntelligenceResponse(timestamp)
  }

  getDecisionEvidenceResponse(): DecisionEvidencePacket {
    const quote = this.getQuoteResponse()
    const sourceLedger = quote.sourceSlaLedger
    const modelScorecard = buildModelProviderScorecard(quote.opportunity, this.latestBacktestMonitor)
    const eventIntelligence = buildEventIntelligenceResponse(quote.fetchedAt)
    const eventStatus = quote.opportunity.eventRisk.level === 'critical'
      ? 'blocking'
      : quote.opportunity.eventRisk.level === 'elevated'
        ? 'opposing'
        : quote.opportunity.eventRisk.level === 'watch'
          ? 'informational'
          : 'supporting'

    return {
      version: 'decision-evidence-v4',
      generatedAt: new Date().toISOString(),
      quoteTimestamp: quote.fetchedAt,
      symbol: quote.symbol,
      price: quote.price,
      singleCommand: quote.opportunity.decisionView.singleCommand,
      actionAllowed: quote.opportunity.decisionView.actionAllowed,
      executionState: quote.opportunity.decisionView.executionState,
      decision: {
        action: quote.opportunity.decisionView.action,
        executionState: quote.opportunity.decisionView.executionState,
        command: quote.opportunity.decisionView.singleCommand,
        score: quote.opportunity.score,
        level: quote.opportunity.level,
        actionAllowed: quote.opportunity.decisionView.actionAllowed,
        blockerSummary: quote.opportunity.decisionView.blockerSummary,
      },
      evidence: [
        {
          id: 'event-intelligence',
          label: '事件智能',
          status: eventStatus,
          summary: eventIntelligence.summary,
          sourceUsage: eventIntelligence.activeItem?.sourceUsage ?? 'estimation_only',
        },
        {
          id: 'source-sla',
          label: '数据源 SLA',
          status: sourceLedger.strongSignalEligible ? 'supporting' : 'blocking',
          summary: sourceLedger.summary,
          sourceUsage: 'production_realtime',
        },
        {
          id: 'model-scorecard',
          label: '模型与规则证据',
          status: quote.opportunity.decisionView.probabilityPolicy.canShowPrecise ? 'supporting' : 'informational',
          summary: modelScorecard.summary,
          sourceUsage: quote.opportunity.decisionView.probabilityPolicy.canShowPrecise ? 'production_realtime' : 'shadow_only',
        },
      ],
      eventIntelligence,
      sourceLedger,
      modelScorecard,
      boundary: {
        productionDecisionInputs: [
          'ICBC tradable quote',
          'configured economic calendar',
          'source SLA gates',
          'validated strategy/risk levels',
        ],
        referenceOnlyInputs: [
          'SGE AU9999 and domestic bank references',
          'estimated economic-event windows',
        ],
        learningOnlyInputs: [
          'RSS/news watch signals',
          'macro mirror learning factors',
          'shadow model scorecards before backtest qualification',
        ],
      },
      summary: `${quote.opportunity.decisionView.singleCommand} 证据包已区分生产、参考与学习边界。`,
    }
  }

  getJournalResponse() {
    const quote = this.getQuoteResponse()
    const preview = quote.opportunity.decisionView.journalPreview
    const entries = preview
      ? mergeSignalJournalRecords(this.signalJournalRecords, [preview])
      : this.signalJournalRecords
    return {
      version: 'signal-journal-v4',
      generatedAt: new Date().toISOString(),
      entries,
      preview,
      backtestReference: this.latestBacktestMonitor
        ? {
            sampleSize: this.latestBacktestMonitor.sampleSize,
            completeSamples: this.latestBacktestMonitor.completeEvaluatedSamples,
            metricsFrozen: this.latestBacktestMonitor.metricsFrozen,
            failureAttribution: this.latestBacktestMonitor.failureAttribution,
          }
        : null,
      summary: '实时信号已按 v4 可持久化记录格式沉淀；结果字段先以 pending 写入，后续由回测切片补全。',
    }
  }

  getModelScorecardResponse(): ModelProviderScorecard {
    const quote = this.getQuoteResponse()
    return buildModelProviderScorecard(quote.opportunity, this.latestBacktestMonitor)
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
    const [sgeResult, domesticResult] = await Promise.allSettled([
      fetchSgeReferenceQuotes(),
      fetchDomesticGoldReferenceQuotes(),
    ])
    const sgeReference = sgeResult.status === 'fulfilled' ? sgeResult.value : null
    const domesticQuotes = domesticResult.status === 'fulfilled' && domesticResult.value.status === 'live'
      ? domesticResult.value.data ?? []
      : []

    if (!sgeReference && domesticQuotes.length < 1) {
      return quote
    }

    return attachMarketReference(
      quote,
      buildMarketReference(quote, sgeReference, domesticQuotes),
    )
  }

  private async acceptQuote(quote: QuoteSample) {
    this.latestQuote = quote
    this.lastRefreshError = null
    const anchorPrice = normalizeReferencePrice(
      quote.marketReference.calibration.anchorPrice,
    )
    this.latestMarketContext = await this.buildMarketContextIfNeeded(quote)
    const referenceHistoryFields = buildReferenceHistoryFields(
      quote.marketReference,
      this.latestMarketContext,
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
      ...referenceHistoryFields,
      timestamp: quote.fetchedAt,
      sourceKind: quote.sourceKind,
    })
    const stats = buildStats(this.history, quote)
    const patternSignals = detectPatternSignals(this.history, quote)
    const localOpportunity = buildOpportunitySignal(
      this.history,
      quote,
      stats,
      this.getSourceStatus(),
      this.latestMarketContext,
      patternSignals,
    )
    this.latestExternalModelAdvisor = await fetchExternalModelAdvisor({
      history: this.history,
      latestQuote: quote,
      probabilityModel: localOpportunity.probabilityModel,
      stats,
    })
    const priorBacktestSnapshots = await loadBacktestSnapshots()
    this.latestBacktestMonitor = buildBacktestMonitor(
      priorBacktestSnapshots,
      selectBacktestHorizonMinutes(priorBacktestSnapshots),
    )
    const sourceStatus = this.getSourceStatus()
    const provisionalSnapshot = {
      updatedAt: new Date().toISOString(),
      quoteTimestamp: quote.fetchedAt,
      price: quote.price,
      sampleOrigin: 'live' as const,
      signalScore: localOpportunity.score,
      signalLevel: localOpportunity.level,
      backtest: this.latestMarketContext.backtest,
      valuation: localOpportunity.valuation,
      primaryPatternKind: patternSignals[0]?.kind ?? null,
      confluenceScore: localOpportunity.confluence.score,
      confluenceConflictLevel: localOpportunity.confluence.conflictLevel,
      macroRegime: marketRegimeFromScore(this.latestMarketContext.factorScore),
      macroRegimeEvidenceStatus: this.latestMarketContext.macroRegimeEvidence?.status ?? null,
      inflationPhase: this.latestMarketContext.macroRegimeEvidence?.inflationPhase ?? null,
      realRateTrend: this.latestMarketContext.macroRegimeEvidence?.realRateTrend ?? null,
      usdCnyAlignment: this.latestMarketContext.macroRegimeEvidence?.usdCnyAlignment ?? null,
      cmeBreakoutQuality: this.latestMarketContext.macroRegimeEvidence?.cmeBreakoutQuality ?? null,
      modelProbability: localOpportunity.probabilityModel.primaryPrediction.probability,
      modelConfidence: localOpportunity.probabilityModel.primaryPrediction.confidence,
      externalModelStatus: this.latestExternalModelAdvisor.status,
      externalModelProvider: this.latestExternalModelAdvisor.provider,
      externalModelName: this.latestExternalModelAdvisor.modelName,
      externalModelHorizonMinutes: this.latestExternalModelAdvisor.horizonMinutes,
      externalModelUpProbability: this.latestExternalModelAdvisor.upProbability,
      externalModelConfidence: this.latestExternalModelAdvisor.confidence,
      externalModelExpectedReturnPercent: this.latestExternalModelAdvisor.expectedReturnPercent,
      externalModelCandidates: [
        this.latestExternalModelAdvisor,
        ...(this.latestExternalModelAdvisor.competitors ?? []),
      ],
      eventRiskLevel: localOpportunity.eventRisk.level,
      psychologyLevel: localOpportunity.psychology.level,
      sourceHealth: sourceHealthFromStatus(sourceStatus),
    }
    this.latestExternalModelAdvisor = {
      ...this.latestExternalModelAdvisor,
      backtestGate: buildExternalModelBacktestGate(priorBacktestSnapshots, provisionalSnapshot),
    }
    const opportunity = buildOpportunitySignal(
      this.history,
      quote,
      stats,
      sourceStatus,
      this.latestMarketContext,
      patternSignals,
      this.latestExternalModelAdvisor,
      this.latestBacktestMonitor,
    )
    const quoteLedger = buildQuoteSourceLedger(quote, sourceStatus)
    const sourceLedger = buildSourceSlaLedger(quote, sourceStatus, quoteLedger)
    const journalRecord = buildSignalJournalEntry(
      quote,
      applySourceSlaGuard(opportunity, sourceLedger),
      sourceLedger,
    )
    const currentBacktestSnapshots = mergeBacktestSnapshots(priorBacktestSnapshots, [{
      updatedAt: new Date().toISOString(),
      quoteTimestamp: quote.fetchedAt,
      price: quote.price,
      sampleOrigin: 'live',
      signalScore: opportunity.score,
      signalLevel: opportunity.level,
      backtest: this.latestMarketContext.backtest,
      valuation: opportunity.valuation,
      primaryPatternKind: opportunity.patternSignals[0]?.kind ?? null,
      confluenceScore: opportunity.confluence.score,
      confluenceConflictLevel: opportunity.confluence.conflictLevel,
      macroRegime: marketRegimeFromScore(this.latestMarketContext.factorScore),
      macroRegimeEvidenceStatus: this.latestMarketContext.macroRegimeEvidence?.status ?? null,
      inflationPhase: this.latestMarketContext.macroRegimeEvidence?.inflationPhase ?? null,
      realRateTrend: this.latestMarketContext.macroRegimeEvidence?.realRateTrend ?? null,
      usdCnyAlignment: this.latestMarketContext.macroRegimeEvidence?.usdCnyAlignment ?? null,
      cmeBreakoutQuality: this.latestMarketContext.macroRegimeEvidence?.cmeBreakoutQuality ?? null,
      modelProbability: opportunity.probabilityModel.primaryPrediction.probability,
      modelConfidence: opportunity.probabilityModel.primaryPrediction.confidence,
      externalModelStatus: opportunity.externalModelAdvisor?.status ?? null,
      externalModelProvider: opportunity.externalModelAdvisor?.provider ?? null,
      externalModelName: opportunity.externalModelAdvisor?.modelName ?? null,
      externalModelHorizonMinutes: opportunity.externalModelAdvisor?.horizonMinutes ?? null,
      externalModelUpProbability: opportunity.externalModelAdvisor?.upProbability ?? null,
      externalModelConfidence: opportunity.externalModelAdvisor?.confidence ?? null,
      externalModelExpectedReturnPercent: opportunity.externalModelAdvisor?.expectedReturnPercent ?? null,
      externalModelCandidates: opportunity.externalModelAdvisor
        ? [
            opportunity.externalModelAdvisor,
            ...(opportunity.externalModelAdvisor.competitors ?? []),
          ]
        : [],
      eventRiskLevel: opportunity.eventRisk.level,
      psychologyLevel: opportunity.psychology.level,
      sourceHealth: sourceHealthFromStatus(this.getSourceStatus()),
    }])
    this.latestBacktestMonitor = buildBacktestMonitor(
      currentBacktestSnapshots,
      selectBacktestHorizonMinutes(currentBacktestSnapshots),
    )
    this.signalJournalRecords = mergeSignalJournalRecords(this.signalJournalRecords, [journalRecord])
    await Promise.all([
      saveHistory(this.history),
      saveMarketContext(this.latestMarketContext),
      saveFactors([
        this.latestMarketContext.factors.spotGoldUsd,
        this.latestMarketContext.factors.dollarIndex,
        this.latestMarketContext.factors.usdCny,
        ...this.latestMarketContext.macroFactors,
      ]),
      saveBacktestSnapshots(currentBacktestSnapshots),
      saveSignalJournalRecord(journalRecord),
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

  private async seedBacktestSnapshotsFromHistory() {
    if (!ENABLE_HISTORY_BACKTEST_SEED || this.history.length < 90) {
      return
    }
    if (Date.now() - this.latestBacktestSeedAt < 60_000) {
      return
    }
    this.latestBacktestSeedAt = Date.now()

    const existing = await loadBacktestSnapshots()
    const historicalSnapshots = buildBacktestSnapshotsFromHistory(this.history)
    if (historicalSnapshots.length < 90) {
      return
    }

    const merged = mergeBacktestSnapshots(existing, historicalSnapshots)
    if (merged.length > existing.length) {
      await saveBacktestSnapshots(merged)
      this.latestBacktestMonitor = buildBacktestMonitor(merged, selectBacktestHorizonMinutes(merged))
    }
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
    const upstreamUpdatedAt = this.latestQuote?.updatedAt ?? null
    const session = getChinaGoldTradingSession()
    const upstreamUpdatedAtMs = upstreamUpdatedAt ? new Date(upstreamUpdatedAt).getTime() : NaN
    const upstreamStale = session.isTradingTime && (
      !Number.isFinite(upstreamUpdatedAtMs) ||
      Date.now() - upstreamUpdatedAtMs > Number(process.env.TRADING_QUOTE_STALE_MS ?? '90000')
    )
    return {
      active: this.latestQuote?.sourceKind ?? null,
      stale: !lastSuccessAt ||
        Date.now() - new Date(lastSuccessAt).getTime() > STALE_MS ||
        upstreamStale,
      lastSuccessAt,
      official: { ...this.officialStatus },
      fallback: { ...this.fallbackStatus },
    }
  }
}

function applySourceSlaGuard(
  opportunity: OpportunitySignal,
  sourceLedger: SourceSlaLedger,
): OpportunitySignal {
  if (sourceLedger.strongSignalEligible) {
    return opportunity
  }

  const hasHardSourceProblem = sourceLedger.entries.some((entry) => {
    return entry.sourceType === 'tradeable_source' && entry.health !== 'healthy'
  }) || sourceLedger.entries.some((entry) => {
    return entry.sourceType === 'reference_source' && (entry.health === 'diverged' || entry.health === 'stale')
  })
  const gateStatus = hasHardSourceProblem ? 'block' as const : 'watch' as const
  const gateReason = sourceLedger.warnings[0] ?? sourceLedger.summary
  const finalDecision = {
    ...opportunity.finalDecision,
    action: hasHardSourceProblem ? 'avoid' as const : opportunity.finalDecision.action === 'confirm_then_enter' ? 'watch' as const : opportunity.finalDecision.action,
    signalGrade: hasHardSourceProblem ? 'blocked' as const : opportunity.finalDecision.signalGrade,
    strongReminderAllowed: false,
    blockedReasons: hasHardSourceProblem
      ? [...opportunity.finalDecision.blockedReasons, `数据源 SLA：${gateReason}`]
      : opportunity.finalDecision.blockedReasons,
    downgradeReasons: hasHardSourceProblem
      ? opportunity.finalDecision.downgradeReasons
      : [...opportunity.finalDecision.downgradeReasons, `数据源 SLA：${gateReason}`],
    hardGates: [
      ...opportunity.finalDecision.hardGates.filter((gate) => gate.id !== 'source-sla'),
      {
        id: 'source-sla',
        label: '数据源 SLA',
        status: gateStatus,
        reason: gateReason,
      },
    ],
    userAdvice: hasHardSourceProblem
      ? '数据源 SLA 未通过，只观察不交易。'
      : opportunity.finalDecision.userAdvice,
    beginnerAdvice: hasHardSourceProblem
      ? '现在先别急着买，报价源或参考锚还没通过硬校验。'
      : opportunity.finalDecision.beginnerAdvice,
  }
  const actionBlockedReason = `数据源 SLA：${gateReason}`
  const decisionView = {
    ...opportunity.decisionView,
    action: finalDecision.action,
    displayGrade: finalDecision.signalGrade,
    canAct: false,
    actionAllowed: false,
    actionBlockedReason,
    singleCommand: hasHardSourceProblem
      ? `禁止开新仓；${gateReason}`
      : `只观察，不开新仓；${gateReason}`,
    displayGuards: [
      ...opportunity.decisionView.displayGuards,
      actionBlockedReason,
    ],
    sourceLedger,
    blockerSummary: actionBlockedReason,
  }

  return {
    ...opportunity,
    level: hasHardSourceProblem ? 'none' : opportunity.level === 'strong' ? 'watch' : opportunity.level,
    triggered: hasHardSourceProblem ? false : opportunity.triggered && opportunity.level !== 'strong',
    finalDecision,
    decisionView,
  }
}

function buildSignalJournalEntry(
  quote: QuoteSample,
  opportunity: OpportunitySignal,
  sourceLedger: SourceSlaLedger,
): SignalJournalRecord {
  const decisionView = opportunity.decisionView
  const failureReason = !sourceLedger.strongSignalEligible
    ? 'source_health'
    : opportunity.eventRisk.level === 'critical' || opportunity.eventRisk.phase === 'post_first_wave'
      ? 'event_noise'
      : (opportunity.tradePlan.riskRewardRatio ?? 0) < 2
        ? 'poor_risk_reward'
        : opportunity.confluence.conflictLevel === 'severe'
          ? 'timeframe_conflict'
          : decisionView.executionState === 'trigger_missed'
            ? 'chasing_risk'
            : 'pending'

  const entry: SignalJournalEntry = {
    id: `${quote.symbol}:${quote.fetchedAt}`,
    generatedAt: new Date().toISOString(),
    quoteTimestamp: quote.fetchedAt,
    price: quote.price,
    action: decisionView.action,
    executionState: decisionView.executionState,
    score: opportunity.score,
    command: decisionView.singleCommand,
    pattern: opportunity.patternSignals[0]?.kind ?? null,
    eventPhase: opportunity.eventRisk.phase,
    sourceHealth: decisionView.sourceHealth.tradeSourceStatus,
    riskRewardRatio: opportunity.tradePlan.riskRewardRatio,
    probabilityShown: decisionView.probabilityDisplay.mode === 'calibrated' &&
      decisionView.probabilityDisplay.value !== null,
    outcome: decisionView.executionState === 'invalidated' ? 'invalidated' : 'pending',
    failureReason,
    bucketKey: [
      opportunity.patternSignals[0]?.kind ?? 'no_pattern',
      opportunity.confluence.conflictLevel,
      opportunity.eventRisk.level,
      sourceLedger.strongSignalEligible ? 'source_ok' : 'source_block',
    ].join(':'),
    notes: [
      decisionView.blockerSummary,
      decisionView.probabilityPolicy.reason,
      ...sourceLedger.warnings.slice(0, 2),
    ],
  }
  return buildSignalJournalRecord(entry, {
    probabilityPolicyReason: decisionView.probabilityPolicy.reason,
    displayGuards: decisionView.displayGuards,
    sourceWarnings: sourceLedger.warnings,
  })
}

export function buildSignalJournalRecord(
  entry: SignalJournalEntry,
  evidence: SignalJournalEvidence,
  persistedAt = new Date().toISOString(),
): SignalJournalRecord {
  return {
    ...entry,
    recordVersion: 'signal-journal-record-v4',
    persistedAt,
    evidence: {
      probabilityPolicyReason: evidence.probabilityPolicyReason,
      displayGuards: evidence.displayGuards.slice(0, 8),
      sourceWarnings: evidence.sourceWarnings.slice(0, 8),
    },
    result: {
      outcome: entry.outcome,
      failureReason: entry.failureReason,
      evaluatedAt: null,
      returnPercent: null,
      notes: entry.notes,
    },
  }
}

function buildModelProviderScorecard(
  opportunity: OpportunitySignal,
  monitor: BacktestMonitor | null,
): ModelProviderScorecard {
  const prediction = opportunity.probabilityModel.primaryPrediction
  const external = monitor?.externalModel
  const externalAdvisor = opportunity.externalModelAdvisor
  const entries: ModelProviderScorecardEntry[] = [
    {
      id: 'local-probability',
      label: '本地概率模型',
      status: opportunity.decisionView.probabilityPolicy.canShowPrecise ? 'active' : 'shadow',
      sampleSize: prediction.sampleSize,
      qualifiedSamples: monitor?.completeEvaluatedSamples ?? 0,
      reliability: monitor?.metricsFrozen ? null : monitor?.reliability ?? null,
      brierScore: prediction.brierScore,
      profitFactor: monitor?.metricsFrozen ? null : monitor?.profitFactor ?? null,
      weightPolicy: opportunity.decisionView.probabilityPolicy.canShowPrecise ? 'low_weight' : 'shadow_only',
      summary: opportunity.decisionView.probabilityPolicy.reason,
    },
    {
      id: 'external-advisor',
      label: externalAdvisor?.modelName ?? '外部时序军师',
      status: externalAdvisor?.status === 'live' && external && external.evaluatedSamples >= 30 ? 'shadow' : 'disabled',
      sampleSize: external?.sampleSize ?? 0,
      qualifiedSamples: external?.evaluatedSamples ?? 0,
      reliability: external?.bestBuckets[0]?.reliability ?? null,
      brierScore: external?.bestBuckets[0]?.brierScore ?? null,
      profitFactor: external?.bestBuckets[0]?.profitFactor ?? null,
      weightPolicy: externalAdvisor?.backtestGate?.status === 'strong' ? 'low_weight' : 'shadow_only',
      summary: externalAdvisor?.backtestGate?.summary ?? '外部模型需要通过 live 分桶回测后才允许低权重参考。',
    },
    {
      id: 'knowledge-rules',
      label: '黄金知识库规则包',
      status: 'active',
      sampleSize: opportunity.knowledgeRuleAudit.checks.length,
      qualifiedSamples: opportunity.knowledgeRuleAudit.checks.filter((check) => check.status === 'pass').length,
      reliability: opportunity.knowledgeRuleAudit.scoreAdjustment === 0
        ? 50
        : Math.max(0, Math.min(100, 50 + opportunity.knowledgeRuleAudit.scoreAdjustment * 4)),
      brierScore: null,
      profitFactor: null,
      weightPolicy: opportunity.knowledgeRuleAudit.checks.some((check) => check.status === 'block') ? 'blocked' : 'low_weight',
      summary: opportunity.knowledgeRuleAudit.summary,
    },
    {
      id: 'macro-regime',
      label: '宏观 Regime 镜像/实时因子',
      status: opportunity.marketContext.macroRegimeEvidence?.isProductionEligible ? 'active' : 'shadow',
      sampleSize: opportunity.marketContext.macroFactors.length,
      qualifiedSamples: opportunity.marketContext.macroFactors.filter((factor) => factor.isProductionEligible).length,
      reliability: opportunity.marketContext.macroRegimeEvidence?.confidence ?? null,
      brierScore: null,
      profitFactor: null,
      weightPolicy: opportunity.marketContext.macroRegimeEvidence?.isProductionEligible ? 'low_weight' : 'shadow_only',
      summary: opportunity.marketContext.macroRegimeEvidence?.sourceSummary ??
        '宏观镜像主要用于离线校准和解释，不作为实时强提醒关键源。',
    },
  ]

  return {
    version: 'model-registry-v4',
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => buildModelRegistryEntry(entry)),
    promotionPolicy: {
      minSamplesRequired: MODEL_REGISTRY_MIN_PROMOTION_SAMPLES,
      maxBrierScore: MODEL_REGISTRY_MAX_PROMOTION_BRIER,
      promotedRequires: [
        'qualifiedSamples >= minSamplesRequired',
        'Brier <= maxBrierScore',
        'weightPolicy 不是 shadow_only/blocked',
      ],
    },
    summary: '所有模型先看样本、校准和分桶表现；低样本或未校准模型只能影子跟踪，不放大买点。',
  }
}

export function buildModelRegistryEntry(
  entry: ModelProviderScorecardEntry,
  reviewedAt = new Date().toISOString(),
): ModelRegistryEntry {
  const minSamplesRequired = MODEL_REGISTRY_MIN_PROMOTION_SAMPLES
  const maxBrierScore = MODEL_REGISTRY_MAX_PROMOTION_BRIER
  const hasEnoughSamples = entry.qualifiedSamples >= minSamplesRequired
  const brierPass = entry.brierScore !== null &&
    Number.isFinite(entry.brierScore) &&
    entry.brierScore <= maxBrierScore
  const canPromote = hasEnoughSamples &&
    brierPass &&
    entry.weightPolicy !== 'shadow_only' &&
    entry.weightPolicy !== 'blocked'
  const reasons = [
    hasEnoughSamples
      ? `合格样本 ${entry.qualifiedSamples}/${minSamplesRequired} 达标。`
      : `合格样本 ${entry.qualifiedSamples}/${minSamplesRequired} 不足，不能 promoted。`,
    brierPass
      ? `Brier ${entry.brierScore?.toFixed(3)} 达标。`
      : entry.brierScore === null
        ? '缺少 Brier 校准误差，不能 promoted。'
        : `Brier ${entry.brierScore.toFixed(3)} 未达标，不能 promoted。`,
  ]
  const promotionState: ModelRegistryEntry['promotionState'] = entry.weightPolicy === 'blocked'
    ? 'blocked'
    : canPromote
      ? 'promoted'
      : hasEnoughSamples && brierPass
        ? 'candidate'
        : 'shadow'

  return {
    ...entry,
    registryVersion: 'model-registry-entry-v4',
    providerKind: modelProviderKindFromId(entry.id),
    promoted: promotionState === 'promoted',
    promotionState,
    eligibility: {
      minSamplesRequired,
      maxBrierScore,
      hasEnoughSamples,
      brierPass,
      canPromote,
      reasons,
    },
    evidence: {
      sampleSize: entry.sampleSize,
      qualifiedSamples: entry.qualifiedSamples,
      reliability: entry.reliability,
      brierScore: entry.brierScore,
      profitFactor: entry.profitFactor,
      summary: entry.summary,
    },
    governance: {
      owner: 'gold-decision-terminal',
      reviewedAt,
      notes: ['v4 registry: promoted 只表示允许进入低权重治理路径，不代表放大强提醒。'],
    },
  }
}

function modelProviderKindFromId(id: string): ModelRegistryEntry['providerKind'] {
  if (id === 'external-advisor') {
    return 'external_advisor'
  }
  if (id === 'knowledge-rules') {
    return 'rules'
  }
  if (id === 'macro-regime') {
    return 'macro_mirror'
  }
  return 'local_probability'
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
  const referenceHistoryFields = buildReferenceHistoryFields(latestQuote.marketReference)
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
        ...referenceHistoryFields,
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
  reference: Awaited<ReturnType<typeof fetchSgeReferenceQuotes>> | null,
  domesticQuotes: ProviderQuote[] = [],
): MarketReference {
  const domesticReferences = domesticQuotes
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item) => ({
      symbol: item.symbol,
      label: item.label || item.symbol,
      latestPrice: item.value,
      highPrice: Math.max(item.value, item.previousClose ?? item.value),
      lowPrice: Math.min(item.value, item.previousClose ?? item.value),
      openPrice: item.previousClose ?? item.value,
      unit: item.unit,
      provider: item.provider,
      updatedAt: item.updatedAt,
      note: item.provider === 'zheshang-accumulation-gold'
        ? '第三方浙商积存金镜像源，仅作为银行同业参考，不替代浙商或工银官方成交价。'
        : undefined,
    }))
  const anchor = [reference?.au9999 ?? null, reference?.autd ?? null, ...domesticReferences].find((item) => {
    return item !== null && item.latestPrice > 0
  }) ?? null
  const consensusPrice = calculateConsensusPrice([
    reference?.au9999?.latestPrice ?? null,
    reference?.autd?.latestPrice ?? null,
    ...domesticReferences.map((item) => item.latestPrice),
  ])
  const consensusDeviationPercent = consensusPrice === null
    ? null
    : (quote.price - consensusPrice) / consensusPrice
  const anchorPrice = normalizeReferencePrice(anchor?.latestPrice ?? null)
  const spread = anchorPrice === null ? null : quote.price - anchorPrice
  const premiumPercent =
    anchorPrice && spread !== null ? spread / anchorPrice : null
  const withinReferenceRange = anchor
    ? quote.price >= Math.min(anchor.lowPrice, anchor.highPrice) - 20 &&
      quote.price <= Math.max(anchor.lowPrice, anchor.highPrice) + 20
    : null

  return {
    sourceName: reference?.sourceName ?? '国内黄金多源参考',
    sourceUrl: reference?.sourceUrl ?? '',
    isDelayed: reference?.isDelayed ?? true,
    tradingDate: reference?.tradingDate ?? null,
    au9999: reference?.au9999 ?? null,
    autd: reference?.autd ?? null,
    domesticReferences,
    consensusPrice,
    consensusDeviationPercent,
    tradingSession: getChinaGoldTradingSession(),
    calibration: {
      anchorSymbol: anchor?.symbol ?? null,
      anchorPrice,
      spread,
      premiumPercent,
      withinReferenceRange,
      note: anchor
        ? '工银积存金与上金所/AU9999/国内黄金参考源联合校准，仅作市场参考锚。'
        : '未获取到可用的国内黄金参考锚。',
    },
  }
}

function buildCachedQuoteFromHistory(history: HistoryPoint[]): QuoteSample | null {
  const latestPoint = [...history]
    .reverse()
    .find((point) => Number.isFinite(point.price) && point.price > 0)
  if (!latestPoint) {
    return null
  }

  const timestamp = latestPoint.timestamp
  const price = latestPoint.price
  const quote: QuoteSample = {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price,
    activePrice: latestPoint.activePrice ?? price,
    regularPrice: latestPoint.regularPrice ?? price,
    sellPrice: latestPoint.sellPrice ?? price,
    dayLow: latestPoint.dayLow ?? price,
    dayHigh: latestPoint.dayHigh ?? price,
    updatedAt: timestamp,
    fetchedAt: timestamp,
    productName: '工银积存金',
    productCode: 'ICBC_ACCUMULATION_GOLD',
    sourceKind: 'fallback',
    sourceName: '本地历史缓存 · 最近行情',
    marketReference: {
      sourceName: '本地历史缓存',
      sourceUrl: '',
      isDelayed: true,
      tradingDate: timestamp.slice(0, 10),
      au9999: buildCachedReferenceQuote('AU9999', 'AU9999 沪金缓存', latestPoint.referenceAu9999Price, timestamp),
      autd: buildCachedReferenceQuote('Au(T+D)', 'Au(T+D) 缓存', latestPoint.referenceAutdPrice, timestamp),
      domesticReferences: [
        buildCachedReferenceQuote('ZHESHANG_ACCUMULATION_GOLD', '浙商积存金缓存', latestPoint.referenceZheshangPrice, timestamp, 'zheshang-accumulation-gold'),
        buildCachedReferenceQuote('DOMESTIC_GOLD', '国内金缓存', latestPoint.referenceDomesticGoldPrice, timestamp, 'cngold-domestic'),
      ].filter((item): item is MarketReferenceQuote => item !== null),
      consensusPrice: null,
      consensusDeviationPercent: null,
      tradingSession: getChinaGoldTradingSession(),
      calibration: {
        anchorSymbol: null,
        anchorPrice: null,
        spread: null,
        premiumPercent: null,
        withinReferenceRange: null,
        note: '实时上游暂不可用，使用本地历史缓存兜底，等待下一次刷新恢复。',
      },
    },
  }

  const marketReference = buildMarketReference(quote, {
    sourceName: '本地历史缓存',
    sourceUrl: '',
    isDelayed: true,
    tradingDate: timestamp.slice(0, 10),
    au9999: quote.marketReference.au9999,
    autd: quote.marketReference.autd,
  }, quote.marketReference.domesticReferences?.map((item) => ({
    symbol: item.symbol,
    label: item.label ?? item.symbol,
    value: item.latestPrice,
    unit: item.unit ?? '元/克',
    provider: item.provider ?? 'local-history-cache',
    updatedAt: item.updatedAt ?? null,
    previousClose: item.openPrice,
  })) ?? [])

  return attachMarketReference(quote, {
    ...marketReference,
    sourceName: '本地历史缓存',
    isDelayed: true,
    calibration: {
      ...marketReference.calibration,
      note: `${marketReference.calibration.note} 当前页面先展示缓存，后台刷新成功后自动切回实时行情。`,
    },
  })
}

function buildCachedReferenceQuote(
  symbol: string,
  label: string,
  value: number | null | undefined,
  timestamp: string,
  provider = 'local-history-cache',
): MarketReferenceQuote | null {
  const latestPrice = normalizeReferencePrice(value ?? null)
  if (latestPrice === null) {
    return null
  }
  return {
    symbol,
    label,
    latestPrice,
    highPrice: latestPrice,
    lowPrice: latestPrice,
    openPrice: latestPrice,
    unit: symbol === 'XAUUSD' ? '美元/盎司' : '元/克',
    provider,
    updatedAt: timestamp,
    note: '本地历史缓存兜底值，仅用于页面不中断显示。',
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

function sourceHealthFromStatus(sourceStatus: SourceStatus) {
  const active = sourceStatus.active === 'official'
    ? sourceStatus.official
    : sourceStatus.active === 'fallback'
      ? sourceStatus.fallback
      : null
  if (!active) {
    return 'unknown' as const
  }
  if (sourceStatus.stale) {
    return 'stale' as const
  }
  return active.status === 'healthy' ? 'healthy' as const : 'down' as const
}

function selectBacktestHorizonMinutes(
  snapshots: Array<{ quoteTimestamp: string }>,
) {
  if (snapshots.length < 2) {
    return 5
  }
  const timestamps = snapshots
    .map((snapshot) => new Date(snapshot.quoteTimestamp).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
  const first = timestamps[0]
  const last = timestamps[timestamps.length - 1]
  const spanMinutes = first === undefined || last === undefined
    ? 0
    : (last - first) / 60_000

  if (spanMinutes >= 90) {
    return 60
  }
  if (spanMinutes >= 25) {
    return 15
  }
  return 5
}

function normalizeReferencePrice(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}

function buildReferenceHistoryFields(
  marketReference: MarketReference,
  marketContext?: MarketContext | null,
) {
  const domesticReferences = marketReference.domesticReferences ?? []
  return {
    referenceZheshangPrice: findDomesticReferencePrice(domesticReferences, isZheshangReference),
    referenceDomesticGoldPrice: findDomesticReferencePrice(
      domesticReferences,
      (item) => item.symbol === 'JO_9753',
    ),
    referenceInternationalGoldPrice: normalizeReferencePrice(
      marketContext?.factors.spotGoldUsd.value ?? null,
    ),
  }
}

function findDomesticReferencePrice(
  references: NonNullable<MarketReference['domesticReferences']>,
  matcher: (reference: NonNullable<MarketReference['domesticReferences']>[number]) => boolean,
) {
  const reference = references.find(matcher)
  return normalizeReferencePrice(reference?.latestPrice ?? null)
}

function isZheshangReference(reference: NonNullable<MarketReference['domesticReferences']>[number]) {
  const text = `${reference.symbol} ${reference.label ?? ''} ${reference.provider ?? ''}`.toLowerCase()
  return text.includes('zheshang') || text.includes('浙商')
}

function calculateConsensusPrice(values: Array<number | null>) {
  const validValues = values
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)
  if (validValues.length < 1) {
    return null
  }
  const middle = Math.floor(validValues.length / 2)
  if (validValues.length % 2 === 1) {
    return validValues[middle]
  }
  return (validValues[middle - 1] + validValues[middle]) / 2
}

export function getChinaGoldTradingSession(now = new Date()) {
  const chinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const day = chinaTime.getDay()
  const minutes = chinaTime.getHours() * 60 + chinaTime.getMinutes()
  const isWeekend = day === 0 || day === 6
  if (isWeekend) {
    return {
      isTradingTime: false,
      status: 'closed' as const,
      note: '周末或节假日通常不更新，旧价不自动判为异常。',
    }
  }

  const sessions = [
    [9 * 60 + 10, 22 * 60 + 30],
  ] as const
  const isTradingTime = sessions.some(([start, end]) => minutes >= start && minutes <= end)
  return {
    isTradingTime,
    status: isTradingTime ? 'trading' as const : 'closed' as const,
    note: isTradingTime
      ? '工银积存金工作日电子银行交易/监控时段，要求主报价和多源锚点保持新鲜一致。'
      : '当前不在工银积存金主要交易/监控时段，允许报价源短暂停更。',
  }
}
