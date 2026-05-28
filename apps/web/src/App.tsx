import {
  Activity,
  AlertTriangle,
  CandlestickChart,
  Crosshair,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Target,
  UsersRound,
} from 'lucide-react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineStyle,
  LineSeries,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'

type SourceHealth = 'live' | 'stale' | 'offline'
type ViewMode = 'intraday' | 'candles'
type TerminalView = 'dashboard' | 'backtest' | 'providers'
type ReviewMode = 'beginner' | 'professional'
type Timeframe = '1m' | '5m' | '15m' | '60m'
type ChartTimeWindowKind = 'auto' | 'since18' | '6h' | '2h' | 'custom'
type TimeframeConfig = {
  id: Timeframe
  label: string
  minutes: number
  visibleBars: number
}
type QuoteBoardTab = 'consensus' | 'icbc' | 'sge' | 'banks'
type OpportunityLevel = 'normal' | 'watch' | 'strong' | 'elevated' | 'critical' | 'none'
type OpportunityTab = 'decision' | 'plan' | 'risk' | 'evidence' | 'validation'
type Indicator = 'ma' | 'boll' | 'rsi' | 'macd'
type ChartSourceId = 'icbc' | 'consensus' | 'au9999' | 'autd' | 'zheshang' | 'domesticGold' | 'london'
type TradingSession = NonNullable<QuotePayload['marketReference']['tradingSession']>
type ExpertAction = 'accumulate' | 'watch' | 'wait' | 'avoid'
type ExpertStance = 'bullish' | 'neutral' | 'cautious' | 'risk_off'

type ExpertOpinion = {
  id: string
  name: string
  role: string
  action: ExpertAction
  stance: ExpertStance
  confidence: number
  headline: string
  rationale: string[]
  risk: string
  methodTags: string[]
}

type ExpertConsensus = {
  action: ExpertAction
  confidence: number
  summary: string
  bullishCount: number
  cautiousCount: number
}

type MarketFactorStatus = 'live' | 'derived' | 'unavailable'
type MarketFactorImpact = 'supportive' | 'neutral' | 'pressure' | 'unknown'
type MarketFactorSourceUsage = 'production_realtime' | 'mirror_learning' | 'production_disabled' | 'derived' | 'unknown'
type MacroRegimeStatus = 'supportive' | 'neutral' | 'pressure' | 'conflicted' | 'unknown'

type MarketFactor = {
  id: string
  label: string
  value: number | null
  unit: string
  changePercent: number | null
  impact: MarketFactorImpact
  score: number
  status: MarketFactorStatus
  summary: string
  updatedAt: string | null
  sourceUsage?: MarketFactorSourceUsage
  isProductionEligible?: boolean
}

type MacroRegimeEvidence = {
  status: MacroRegimeStatus
  scoreImpact: number
  confidence: number
  supportingReasons: string[]
  opposingReasons: string[]
  sourceUsage: MarketFactorSourceUsage
  isProductionEligible: boolean
  stalenessWarning: string
  sourceSummary: string
  inflationPhase: 'accelerating' | 'sticky' | 'cooling' | 'unknown'
  realRateTrend: 'rising' | 'falling' | 'flat' | 'unknown'
  usdCnyAlignment: 'cny_gold_support' | 'cny_gold_pressure' | 'neutral' | 'unknown'
  cmeBreakoutQuality: 'confirmed' | 'not_confirmed' | 'unavailable' | 'unknown'
}

type SentimentFactor = {
  id: 'news' | 'blogger'
  label: string
  score: number
  confidence: number
  status: MarketFactorStatus
  summary: string
  sources: string[]
  updatedAt: string | null
}

type BacktestFactor = {
  status: MarketFactorStatus
  sampleSize: number
  summary: string
  horizons: Array<{
    label: string
    winRate: number | null
    averageReturn: number | null
    maxDrawdownAfterSignal: number | null
  }>
}

type WalkForwardSample = {
  openedAt: string
  evaluatedAt: string
  signalScore: number
  signalLevel: OpportunityLevel
  entryPrice: number
  exitPrice: number
  returnPercent: number
  maxDrawdown: number
  failureReason?: string | null
  complete?: boolean
}

type FailureAttribution = {
  reason: string
  label: string
  count: number
  ratio: number
}

type BacktestMonitor = {
  updatedAt: string
  horizonMinutes?: number
  sampleSize: number
  allEvaluatedSamples?: number
  evaluatedSamples: number
  completeEvaluatedSamples?: number
  metricsFrozen?: boolean
  freezeReason?: string | null
  signalThreshold?: number
  winRate: number | null
  baselineWinRate?: number | null
  averageReturn: number | null
  expectancy?: number | null
  profitFactor?: number | null
  reliability?: number
  sortinoRatio: number | null
  informationRatio: number | null
  maxDrawdown: number | null
  buckets?: BacktestBucket[]
  externalModel?: ExternalModelBacktestMonitor
  failureSamples: WalkForwardSample[]
  incompleteSampleRate?: number | null
  failureAttribution?: FailureAttribution[]
  summary: string
}

type BacktestBucket = {
  key: string
  label: string
  dimension: 'signal' | 'score' | 'valuation' | 'session' | 'pattern' | 'macro' | 'confluence'
  sampleSize: number
  qualifiedSamples: number
  winRate: number | null
  baselineWinRate: number | null
  averageReturn: number | null
  profitFactor: number | null
  maxDrawdown: number | null
  mae: number | null
  mfe: number | null
  tp1HitRate?: number | null
  stopLossHitRate?: number | null
  timeoutRate?: number | null
  incompleteRate?: number | null
  reliability: number
  summary: string
}

type ExternalModelBacktestMonitor = {
  modelVersion: string
  updatedAt: string
  sampleSize: number
  evaluatedSamples: number
  liveCoverage: number | null
  buckets: ExternalModelBacktestBucket[]
  bestBuckets: ExternalModelBacktestBucket[]
  weakBuckets: ExternalModelBacktestBucket[]
  summary: string
}

type ExternalModelBacktestBucket = {
  key: string
  label: string
  dimension:
    | 'model_probability'
    | 'model_confidence'
    | 'model_vs_local'
    | 'session'
    | 'pattern'
    | 'event'
    | 'confluence'
    | 'macro'
    | 'valuation'
    | 'source_health'
    | 'horizon'
    | 'provider'
  horizonMinutes: number
  sampleSize: number
  qualifiedSamples: number
  winRate: number | null
  baselineWinRate: number | null
  excessWinRate: number | null
  averageReturn: number | null
  medianReturn: number | null
  expectancy: number | null
  profitFactor: number | null
  maxDrawdown: number | null
  mae: number | null
  mfe: number | null
  mfeMaeRatio: number | null
  brierScore: number | null
  calibrationError: number | null
  liveCoverage?: number | null
  reliability: number
  summary: string
}

type ProviderHealthRecord = {
  id: string
  label: string
  provider: string
  status: 'live' | 'unavailable'
  participatesInScoring: boolean
  lastSuccessAt: string | null
  lastFailureAt: string | null
  latencyMs: number | null
  error: string | null
  envVars: string[]
}

type ProviderHealthSnapshot = {
  updatedAt: string
  providers: ProviderHealthRecord[]
}

type ProviderHealthPayload = {
  updatedAt: string
  providers: ProviderHealthRecord[]
  history: ProviderHealthSnapshot[]
}

type ValuationMetrics = {
  score: number
  sampleSize: number
  lookbackHours: number
  pricePercentile: number | null
  distanceFromLow: number | null
  distanceFromHigh: number | null
  averageReturn: number | null
  volatility: number | null
  sharpeRatio: number | null
  sortinoRatio: number | null
  informationRatio: number | null
  maxDrawdown: number | null
  summary: string
}

type MarketContext = {
  updatedAt: string
  factorScore: number
  summary: string
  factors: {
    spotGoldUsd: MarketFactor
    dollarIndex: MarketFactor
    usdCny: MarketFactor
  }
  macroFactors?: MarketFactor[]
  macroRegimeEvidence?: MacroRegimeEvidence | null
  sentiment: {
    news: SentimentFactor
    blogger: SentimentFactor
  }
  backtest: BacktestFactor
  providerHealth?: ProviderHealthRecord[]
}

type OpportunityPayload = {
  level?: OpportunityLevel | string | null
  triggered?: boolean
  score?: number | null
  reason?: string | null
  summary?: string | null
  title?: string | null
  reasons?: string[] | string | null
  risks?: string[] | string | null
  expertOpinions?: ExpertOpinion[] | null
  expertConsensus?: ExpertConsensus | null
  marketContext?: MarketContext | null
  valuation?: ValuationMetrics | null
  patternSignals?: PatternSignal[] | null
  tradePlan?: TradePlan | null
  confluence?: MultiTimeframeConfluence | null
  eventRisk?: EconomicEventRisk | null
  psychology?: PsychologyDiscipline | null
  externalModelAdvisor?: ExternalModelAdvisor | null
  canonicalForecast?: CanonicalForecast | null
  decisionOverlay?: DecisionOverlay | null
  finalDecision?: FinalDecision | null
  decisionView?: DecisionViewModel | null
}

type OpportunityInfo = {
  level: OpportunityLevel
  triggered: boolean
  score: number | null
  summary: string
  reasons: string[]
  risks: string[]
  expertOpinions: ExpertOpinion[]
  expertConsensus: ExpertConsensus | null
  marketContext: MarketContext | null
  valuation: ValuationMetrics | null
  patternSignals: PatternSignal[]
  tradePlan: TradePlan | null
  confluence: MultiTimeframeConfluence | null
  eventRisk: EconomicEventRisk | null
  psychology: PsychologyDiscipline | null
  externalModelAdvisor: ExternalModelAdvisor | null
  canonicalForecast: CanonicalForecast | null
  decisionOverlay: DecisionOverlay | null
  finalDecision: FinalDecision | null
  decisionView: DecisionViewModel | null
}

type FinalDecision = {
  action: 'avoid' | 'wait' | 'watch' | 'probe' | 'confirm_then_enter' | 'reduce'
  actionLabel: string
  signalGrade: 'blocked' | 'low' | 'watch' | 'qualified' | 'strong_watch'
  strongReminderAllowed: boolean
  userAdvice: string
  beginnerAdvice: string
  blockedReasons: string[]
  downgradeReasons: string[]
  hardGates: Array<{
    id: string
    label: string
    status: 'pass' | 'watch' | 'block'
    reason: string
  }>
  confidenceGrade: 'unverified' | 'low' | 'medium' | 'high'
  confidenceExplanation: string
  accuracyExplanation: string
  sampleStatus: 'insufficient' | 'warming_up' | 'usable' | 'robust'
}

type DecisionViewModel = {
  version: 'decision-view-v2' | 'decision-view-v3' | 'decision-view-v4'
  action: FinalDecision['action']
  displayGrade: FinalDecision['signalGrade']
  primaryInstruction: string
  beginnerInstruction: string
  canAct: boolean
  executionState: 'no_trade' | 'watch_only' | 'waiting_for_trigger' | 'trigger_armed' | 'trigger_missed' | 'invalidated' | 'reduce_position'
  singleCommand: string
  actionAllowed: boolean
  actionBlockedReason: string | null
  displayGuards: string[]
  triggerPrice: number | null
  stopLoss: number | null
  takeProfit1: number | null
  riskRewardRatio: number | null
  probabilityDisplay: {
    mode: 'hidden' | 'tendency' | 'calibrated'
    value: number | null
    label: string
    reason: string
  }
  probabilityPolicy: {
    status: 'show_calibrated' | 'hide_precise' | 'tendency_only'
    canShowPrecise: boolean
    minSamplesRequired: number
    reason: string
  }
  calibrationStatus: {
    sampleSize: number
    brierScore: number | null
    sampleStatus: FinalDecision['sampleStatus']
    canShowNumericProbability: boolean
    reason: string
  }
  levelValidation: {
    support: LevelValidationItem
    resistance: LevelValidationItem
    trigger: LevelValidationItem
    stopLoss: LevelValidationItem
    takeProfit1: LevelValidationItem
  }
  validatedLevels: {
    support: LevelValidationItem
    resistance: LevelValidationItem
    trigger: LevelValidationItem
    stopLoss: LevelValidationItem
    takeProfit1: LevelValidationItem
  }
  backtestValidity: {
    completeSamples: number
    incompleteSampleRate: number | null
    metricsEnabled: boolean
    freezeReason: string | null
    minSamplesRequired: number
  }
  sourceHealth: {
    tradeSourceStatus: 'live' | 'stale' | 'fallback' | 'offline'
    referenceSourceStatus: 'live' | 'partial' | 'missing' | 'diverged'
    macroMirrorStatus: 'learning_only' | 'production_eligible' | 'disabled' | 'unknown'
    providerProbeStatus: 'live' | 'partial' | 'missing'
    canUseForStrongSignal: boolean
    warnings: string[]
  }
  sourceLedger: SourceSlaLedger | null
  decisionEvidence?: DecisionEvidencePacket | null
  eventIntelligence?: EventIntelligenceResponse | null
  modelRegistry?: ModelProviderScorecard | null
  modelScorecard?: ModelProviderScorecard | null
  signalJournal?: SignalJournalResponse | null
  sourceWarnings: string[]
  journalPreview: SignalJournalEntry | null
  blockerSummary: string
  updatedAt: string
}

type SourceSlaLedger = {
  version: 'source-sla-ledger-v1'
  generatedAt: string
  tradeSourceId: string
  tradePrice: number
  strongSignalEligible: boolean
  summary: string
  entries: Array<{
    sourceId: string
    label: string
    sourceType: 'tradeable_source' | 'reference_source' | 'learning_only_mirror' | 'disabled_source'
    instrument: string
    price: number | null
    timestamp: string | null
    freshnessMs: number | null
    health: 'healthy' | 'watch' | 'stale' | 'diverged' | 'missing'
    discrepancyFromTradePrice: number | null
    canUseForStrongSignal: boolean
    note: string
  }>
  warnings: string[]
}

type EventIntelligenceSourceUsage =
  | 'production_calendar'
  | 'estimation_only'
  | 'news_watch_only'
  | 'mirror_learning'

type EventIntelligenceItem = EconomicEvent & {
  minutesToEvent: number
  phase: EconomicEventRisk['phase']
  riskLevel: EconomicEventRisk['level']
  scorePenalty: number
  scoreCap: number
  positionMultiplier: number
  sourceUsage: EventIntelligenceSourceUsage
  sourceBoundary: string
  isProductionEligible: boolean
  warnings: string[]
}

type EventIntelligenceResponse = {
  version: 'event-intelligence-v4'
  generatedAt: string
  current: EconomicEventRisk
  activeItem: EventIntelligenceItem | null
  items: EventIntelligenceItem[]
  sourceBoundaries: Array<{
    source: EconomicEvent['source']
    sourceUsage: EventIntelligenceSourceUsage
    isProductionEligible: boolean
    participatesInScoring: boolean
    summary: string
  }>
  summary: string
  usageBoundary: string
  warnings: string[]
}

type ModelProviderScorecardEntry = {
  id: string
  label: string
  status: 'active' | 'shadow' | 'disabled'
  sampleSize: number
  qualifiedSamples: number
  reliability: number | null
  brierScore: number | null
  profitFactor: number | null
  weightPolicy: 'full' | 'low_weight' | 'shadow_only' | 'blocked'
  summary: string
}

type ModelProviderScorecard = {
  version: 'model-provider-scorecard-v1'
  generatedAt: string
  entries: ModelProviderScorecardEntry[]
  summary: string
}

type DecisionEvidencePacket = {
  version: 'decision-evidence-v4'
  generatedAt: string
  quoteTimestamp: string
  symbol: string
  price: number
  singleCommand?: string
  actionAllowed?: boolean
  executionState?: DecisionViewModel['executionState']
  decision: {
    action: FinalDecision['action']
    executionState: DecisionViewModel['executionState']
    command: string
    score: number
    level: OpportunityLevel
    actionAllowed: boolean
    blockerSummary: string
  }
  evidence: Array<{
    id: string
    label: string
    status: 'supporting' | 'opposing' | 'blocking' | 'informational'
    summary: string
    sourceUsage: EventIntelligenceSourceUsage | 'production_realtime' | 'reference_calibration' | 'shadow_only'
  }>
  eventIntelligence: EventIntelligenceResponse
  sourceLedger: SourceSlaLedger
  modelScorecard: ModelProviderScorecard
  boundary: {
    productionDecisionInputs: string[]
    referenceOnlyInputs: string[]
    learningOnlyInputs: string[]
  }
  summary: string
}

type SignalJournalResponse = {
  version: 'signal-journal-v1'
  generatedAt: string
  entries: SignalJournalEntry[]
  backtestReference: {
    sampleSize: number
    completeSamples: number | null
    metricsFrozen?: boolean
    failureAttribution?: FailureAttribution[]
  } | null
  summary: string
}

type SignalJournalEntry = {
  id: string
  generatedAt: string
  quoteTimestamp: string
  price: number
  action: FinalDecision['action']
  executionState: DecisionViewModel['executionState']
  score: number
  command: string
  pattern: PatternSignal['kind'] | null
  eventPhase: EconomicEventRisk['phase']
  sourceHealth: DecisionViewModel['sourceHealth']['tradeSourceStatus']
  riskRewardRatio: number | null
  probabilityShown: boolean
  outcome: 'pending' | 'tp1_hit' | 'stop_loss_hit' | 'no_touch' | 'timeout' | 'invalidated'
  failureReason: 'pending' | 'chasing_risk' | 'event_noise' | 'false_breakout' | 'pattern_failed' | 'macro_pressure' | 'source_health' | 'timeframe_conflict' | 'poor_risk_reward' | 'model_disagreement'
  bucketKey: string
  notes: string[]
}

type LevelValidationItem = {
  price: number | null
  status: 'valid' | 'invalid' | 'missing'
  reason: string
}

type ExternalModelAdvisor = {
  provider: 'chronos' | 'timesfm' | 'moirai' | 'lag-llama' | 'custom' | 'disabled'
  modelName: string
  status: 'live' | 'unconfigured' | 'error'
  horizonMinutes: number
  upProbability: number | null
  downProbability: number | null
  confidence: number
  expectedReturnPercent: number | null
  forecastPrice: number | null
  intervalLow: number | null
  intervalHigh: number | null
  generatedAt: string
  summary: string
  rationale: string[]
  risks: string[]
  backtestGate?: {
    status: 'insufficient' | 'weak' | 'neutral' | 'strong'
    summary: string
    weightMultiplier: number
  } | null
  competitors?: ExternalModelAdvisor[]
}

type PriceLevel = {
  price: number
  role: 'support' | 'resistance' | 'trigger' | 'stopLoss' | 'invalidation' | 'takeProfit'
  source: 'tradePlan' | 'patternSignal' | 'externalModel' | 'stats24h' | 'technical' | 'probabilityModel'
  confidence: number | null
  note: string
}

type CanonicalForecast = {
  version: 'canonical-forecast-v1'
  generatedAt: string
  horizonMinutes: number
  anchorPrice: number
  unit: string
  probability: {
    up: number
    down: number
    label: 'TP1_BEFORE_STOP'
    confidence: number
    sampleSize: number
    brierScore: number | null
    source: 'probabilityModel.primaryPrediction' | 'externalModelAdvisor'
  }
  priceInterval: {
    low: number | null
    high: number | null
    median: number | null
    source: 'externalModel' | 'backendDerived'
    basis: string
  }
  levels: {
    support: PriceLevel | null
    resistance: PriceLevel | null
    entryZone: { low: number; high: number } | null
    trigger: PriceLevel | null
    stopLoss: PriceLevel | null
    invalidation: PriceLevel | null
    targets: PriceLevel[]
  }
  successRate: {
    value: number | null
    source: 'probabilityModel' | 'backtestBucket' | 'unavailable'
    label: string
  }
  primaryPatternId: string | null
  primaryPatternLabel: string | null
  warnings: string[]
}

type DecisionOverlay = {
  version: string
  generatedAt: string
  source: 'external_model' | 'local_probability' | 'trade_plan' | 'pattern_structure'
  horizonMinutes: number
  horizonLabel: string
  upProbability: number
  downProbability: number
  confidence: number
  intervalLow: number | null
  intervalHigh: number | null
  support: number | null
  resistance: number | null
  failurePrice: number | null
  targetPrice: number | null
  primaryPatternId: string | null
  primaryPatternLabel: string | null
  patternConfidence: number | null
  basis: string
  warnings: string[]
}

type EconomicEvent = {
  id: string
  label: string
  category: 'inflation' | 'jobs' | 'fed' | 'growth' | 'geopolitical' | 'liquidity'
  importance: 'S' | 'A' | 'B'
  scheduledAt: string
  source: 'configured' | 'estimated' | 'rss' | 'mirror'
  sourceUrl?: string
  minutesToEvent: number
}

type EconomicEventRisk = {
  level: 'none' | 'watch' | 'elevated' | 'critical'
  phase: 'normal' | 'pre_event' | 'post_first_wave' | 'post_confirmation'
  scorePenalty: number
  scoreCap: number
  positionMultiplier: number
  activeEvent: EconomicEvent | null
  upcomingEvents: EconomicEvent[]
  summary: string
  warnings: string[]
  updatedAt: string
}

type PsychologyRiskFlag = {
  kind: 'chasing_high' | 'revenge_trading' | 'no_stop_loss' | 'event_impulse' | 'overtrading' | 'holding_loser'
  label: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  correction: string
}

type PsychologyDiscipline = {
  score: number
  level: 'stable' | 'watch' | 'danger'
  action: 'allow_plan' | 'reduce_size' | 'stand_down' | 'review_only'
  summary: string
  flags: PsychologyRiskFlag[]
  checklist: string[]
  updatedAt: string
}

type TimeframeBias = 'bullish' | 'bearish' | 'neutral' | 'insufficient'

type TimeframeConfluence = {
  timeframe: Timeframe
  label: string
  bias: TimeframeBias
  trendScore: number
  momentumPercent: number | null
  volatilityPercent: number | null
  summary: string
}

type MultiTimeframeConfluence = {
  overallBias: TimeframeBias
  score: number
  conflictLevel: 'none' | 'mild' | 'severe'
  summary: string
  frames: TimeframeConfluence[]
}

type TradePlan = {
  action: 'stand_aside' | 'observe' | 'probe' | 'confirm_then_enter' | 'take_profit_or_reduce'
  actionLabel: string
  confidence: 'low' | 'medium' | 'high'
  entryZone: {
    low: number
    high: number
  } | null
  triggerPrice: number | null
  stopLoss: number | null
  takeProfit1: number | null
  takeProfit2: number | null
  riskRewardRatio: number | null
  positionSuggestion: string
  maxPositionPercent: number
  maxAccountRiskPercent: number
  invalidation: string
  rationale: string[]
  warnings: string[]
}

type DataQualityInfo = {
  score: number
  level: 'excellent' | 'good' | 'degraded' | 'poor'
  summary: string
  anomalies: Array<{
    code: string
    severity: 'warning' | 'critical'
    message: string
    observedAt: string
  }>
}

type QuotePayload = {
  price: number
  activePrice: number
  regularPrice: number
  sellPrice: number
  updatedAt: string
  fetchedAt?: string
  sourceName: string
  sourceKind: 'official' | 'fallback'
  productName: string
  productCode: string
  sourceStatus: {
    active: 'official' | 'fallback' | null
    stale: boolean
  }
  dayRange: {
    low: number
    high: number
  }
  marketReference: {
    sourceName: string
    tradingDate: string | null
    au9999: ReferenceQuote | null
    autd: ReferenceQuote | null
    domesticReferences?: ReferenceQuote[]
    consensusPrice?: number | null
    consensusDeviationPercent?: number | null
    tradingSession?: {
      isTradingTime: boolean
      status: 'trading' | 'closed' | 'unknown'
      note: string
    }
    calibration: {
      anchorSymbol: string | null
      anchorPrice: number | null
      spread: number | null
      premiumPercent: number | null
      withinReferenceRange: boolean | null
      note: string
    }
  }
  stats24h: {
    high24h: number
    low24h: number
    currentPrice: number
    absoluteChange24h: number
    percentChange24h: number
    drawdownAmount24h: number
    drawdownPercent24h: number
    pointCount: number
  }
  alert: {
    level: 'normal' | 'watch' | 'elevated' | 'critical'
    triggered: boolean
    reason: string
  }
  quality?: DataQualityInfo | null
  sourceLedger?: QuoteSourceLedger | null
  sourceSlaLedger?: SourceSlaLedger | null
  marketContext?: MarketContext | null
  patternSignals?: PatternSignal[] | null
  opportunity?: OpportunityPayload | null
  buySignal?: OpportunityPayload | null
  buy_signal?: OpportunityPayload | null
}

type QuoteSourceLedger = {
  version: 'quote-source-ledger-v1'
  generatedAt: string
  tradeSourceId: string
  tradePrice: number
  consensus: {
    price: number | null
    deviationPercent: number | null
    status: 'aligned' | 'diverged' | 'unknown'
  }
  entries: Array<{
    sourceId: string
    label: string
    instrument: string
    tradable: boolean
    price: number | null
    timestamp: string | null
    marketSession: 'trading' | 'closed' | 'unknown'
    sourceUsage: 'production_realtime' | 'reference_calibration' | 'mirror_learning' | 'disabled'
    freshnessMs: number | null
    confidence: 'high' | 'medium' | 'low'
    discrepancyFromTradePrice: number | null
    note: string
  }>
  warnings: string[]
}

type PatternSignal = {
  id: string
  kind: 'double_bottom' | 'double_top' | 'support_rebound' | 'resistance_rejection' | 'hammer' | 'shooting_star' | 'bullish_engulfing' | 'bearish_engulfing' | 'doji' | 'morning_star' | 'evening_star' | 'bullish_harami' | 'bearish_harami' | 'three_white_soldiers' | 'three_black_crows'
  label: string
  direction: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  confirmationStatus?: 'candidate' | 'confirmed' | 'failed'
  confirmationReason?: string
  confirmationPrice?: number | null
  stateReason?: string
  cooldownBars?: number
  contextTags?: string[]
  detectedAt: string
  keyPrice: number
  necklinePrice: number | null
  invalidationPrice: number | null
  targetPrice: number | null
  expectedConfirmationBars: number
  summary: string
  explanation: string
}

type ReferenceQuote = {
  symbol: string
  label?: string
  latestPrice: number
  highPrice: number
  lowPrice: number
  openPrice: number
  unit?: string
  provider?: string
  updatedAt?: string | null
  note?: string
}

type QuoteBoardEntry = {
  id: string
  tab: QuoteBoardTab
  label: string
  symbol: string
  price: number
  high: number | null
  low: number | null
  open: number | null
  previousClose: number | null
  unit: string
  updatedAt: string | null
  source: string
  confidence: '官方' | '核心锚' | '参考' | '校准'
  note: string
}

type HistoryPoint = {
  price: number
  timestamp: string
  referenceAnchorPrice?: number | null
  referenceAu9999Price?: number | null
  referenceAutdPrice?: number | null
  referenceZheshangPrice?: number | null
  referenceDomesticGoldPrice?: number | null
  referenceInternationalGoldPrice?: number | null
}

type ChartSourceOption = {
  id: ChartSourceId
  label: string
  shortLabel: string
  unit: string
  available: boolean
  reason: string
  latestPrice: number | null
}

type ChartHistoryProjection = {
  history: HistoryPoint[]
  mode: 'native' | 'proxy'
  exactPointCount: number
  totalPointCount: number
  coverage: number
}

type CandlePayload = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  pointCount: number
}

type HistoryPayload = {
  history: HistoryPoint[]
  candles?: Partial<Record<Timeframe, CandlePayload[]>>
}

type SnapshotPayload = {
  quote: QuotePayload
  history: HistoryPayload
}

type ApiEnvelope<T> = {
  success: boolean
  data: T
  error?: string
}

type LineDatum = {
  time: UTCTimestamp
  value: number
}

type CandleDatum = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

type ChartVisibleRange = {
  from: UTCTimestamp
  to: UTCTimestamp
}

type ChartScrubberInfo = {
  disabled: boolean
  firstTime: UTCTimestamp | null
  latestTime: UTCTimestamp | null
  startPercent: number
  endPercent: number
  startLabel: string
  endLabel: string
  visibleLabel: string
  selectedStartLabel: string
  selectedEndLabel: string
}

type BollingerBands = {
  upper: LineDatum[]
  middle: LineDatum[]
  lower: LineDatum[]
}

type MacdValue = {
  dif: number
  dea: number
  histogram: number
}

type IntradayHover = {
  timeLabel: string
  price: number
  referencePrice: number | null
}

type CandleHover = {
  timeLabel: string
  open: number
  high: number
  low: number
  close: number
  ma5: number | null
  ma10: number | null
  ma20: number | null
}

type ChartPrediction = {
  upProbability: number
  downProbability: number
  confidence: number
  label: string
  basis: string
  showProbability: boolean
  displayText: string
}

type HardGateStatus = 'pass' | 'watch' | 'block'

type SignalTransparency = {
  probability: number | null
  probabilityLabel: string
  probabilityReason: string
  winRate: number | null
  calibrationConfidence: number | null
  reliability: number | null
  sampleSize: number
  verdict: string
  guardrail: string
  hardGates: Array<{
    label: string
    status: HardGateStatus
    detail: string
  }>
}

type ChartSignal = {
  tone: 'buy' | 'watch' | 'wait' | 'risk'
  label: string
  detail: string
}

type TradeDecisionMarker = {
  id: string
  side: 'buy' | 'sell'
  label: 'BUY' | 'SELL'
  variant: 'entry' | 'exit' | 'risk'
  targetPrice: number | null
  reason: string
}

type TradeOverlayMarker = TradeDecisionMarker & {
  time: UTCTimestamp
  value: number
}

type TradeMarkerPosition = {
  pinX: number
  pinY: number
  labelX: number
  labelY: number
  align: 'left' | 'right'
}

type ChartForecast = {
  intervalLow: number | null
  intervalHigh: number | null
  support: number | null
  resistance: number | null
  failurePrice: number | null
  successRate: number | null
  horizonLabel: string
  basis: string
}

type ChartExtremePoint = {
  time: UTCTimestamp
  value: number
}

type ChartExtremes = {
  high: ChartExtremePoint | null
  low: ChartExtremePoint | null
}

type DisplayAnchor = {
  label: string
  price: number | null
  spread: number | null
  premiumPercent: number | null
  withinRange: boolean | null
  note: string
}

type DataStatus = {
  tone: 'warning' | 'error'
  message: string
  detail: string
}

type V4EvidenceBundle = {
  eventIntelligence: EventIntelligenceResponse | null
  decisionEvidence: DecisionEvidencePacket | null
  modelScorecard: ModelProviderScorecard | null
  signalJournal: SignalJournalResponse | null
}

const LIVE_REFRESH_INTERVAL_MS = 3_000
const BACKTEST_REFRESH_INTERVAL_MS = 15_000
const PROVIDER_REFRESH_INTERVAL_MS = 60_000
const STALE_AFTER_MS = 90_000

const TIMEFRAMES: TimeframeConfig[] = [
  { id: '1m', label: '1分', minutes: 1, visibleBars: 240 },
  { id: '5m', label: '5分', minutes: 5, visibleBars: 180 },
  { id: '15m', label: '15分', minutes: 15, visibleBars: 120 },
  { id: '60m', label: '60分', minutes: 60, visibleBars: 96 },
]

const CHART_TIME_WINDOWS: Array<{ id: ChartTimeWindowKind; label: string; title: string }> = [
  { id: 'auto', label: '全部', title: '显示当前加载窗口内的完整走势' },
  { id: 'since18', label: '18点起', title: '定位到最近一个 18:00 到当前' },
  { id: '6h', label: '近6h', title: '定位到最近 6 小时' },
  { id: '2h', label: '近2h', title: '定位到最近 2 小时' },
  { id: 'custom', label: '手动', title: '拖动或缩放时间轴后自动进入手动范围' },
]

const QUOTE_BOARD_TABS: Array<{ id: QuoteBoardTab; label: string }> = [
  { id: 'consensus', label: '校准价' },
  { id: 'icbc', label: '工银' },
  { id: 'sge', label: 'AU9999' },
  { id: 'banks', label: '银行参考' },
]

const CHART_SOURCE_LABELS: Record<ChartSourceId, { label: string; shortLabel: string; unit: string }> = {
  icbc: { label: '工银积存金', shortLabel: '工银', unit: '元/克' },
  consensus: { label: '多源校准价', shortLabel: '校准', unit: '元/克' },
  au9999: { label: 'AU9999 沪金', shortLabel: 'AU9999', unit: '元/克' },
  autd: { label: 'Au(T+D)', shortLabel: 'AuTD', unit: '元/克' },
  zheshang: { label: '浙商积存金', shortLabel: '浙商', unit: '元/克' },
  domesticGold: { label: '金投网国内金', shortLabel: '国内金', unit: '元/克' },
  london: { label: '伦敦金 / 国际金', shortLabel: '伦敦金', unit: '美元/盎司' },
}

const INDICATORS: Array<{ id: Indicator; label: string }> = [
  { id: 'ma', label: 'MA' },
  { id: 'boll', label: 'BOLL' },
  { id: 'rsi', label: 'RSI' },
  { id: 'macd', label: 'MACD' },
]

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function App() {
  const [quote, setQuote] = useState<QuotePayload | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [serverCandles, setServerCandles] = useState<
    Partial<Record<Timeframe, CandlePayload[]>>
  >({})
  const [viewMode, setViewMode] = useState<ViewMode>('intraday')
  const [terminalView, setTerminalView] = useState<TerminalView>('dashboard')
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  const [chartTimeWindow, setChartTimeWindow] = useState<ChartTimeWindowKind>('auto')
  const [customChartRange, setCustomChartRange] = useState<ChartVisibleRange | null>(null)
  const [chartSource, setChartSource] = useState<ChartSourceId>('icbc')
  const [quoteBoardTab, setQuoteBoardTab] = useState<QuoteBoardTab>('consensus')
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>([
    'ma',
    'boll',
    'rsi',
    'macd',
  ])
  const [error, setError] = useState<string | null>(null)
  const [backtestMonitor, setBacktestMonitor] = useState<BacktestMonitor | null>(null)
  const [providerHealth, setProviderHealth] = useState<ProviderHealthPayload | null>(null)
  const [eventIntelligence, setEventIntelligence] = useState<EventIntelligenceResponse | null>(null)
  const [decisionEvidence, setDecisionEvidence] = useState<DecisionEvidencePacket | null>(null)
  const [modelScorecard, setModelScorecard] = useState<ModelProviderScorecard | null>(null)
  const [signalJournal, setSignalJournal] = useState<SignalJournalResponse | null>(null)
  const [isProbingProviders, setIsProbingProviders] = useState(false)
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const refreshData = useEffectEvent(async (signal?: AbortSignal) => {
    setLastAttemptAt(new Date().toISOString())

    try {
      const snapshotResponse = await fetch('/api/snapshot', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      })

      if (!snapshotResponse.ok) {
        throw new Error(`接口状态异常：${snapshotResponse.status}`)
      }

      const snapshotJson = (await snapshotResponse.json()) as ApiEnvelope<SnapshotPayload>

      if (!snapshotJson.success || !snapshotJson.data?.quote || !snapshotJson.data.history) {
        throw new Error(snapshotJson.error || '快照接口返回空数据')
      }

      startTransition(() => {
        setQuote(snapshotJson.data.quote)
        setHistory(
          (snapshotJson.data.history.history ?? []).slice().sort((left, right) => {
            return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
          }),
        )
        setServerCandles(snapshotJson.data.history.candles ?? {})
        setError(null)
        setIsLoading(false)
      })
    } catch (caughtError) {
      if (signal?.aborted) {
        return
      }

      setError(
        caughtError instanceof Error ? caughtError.message : '数据拉取失败，请稍后重试',
      )
      setIsLoading(false)
    }
  })

  const refreshBacktest = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/backtest', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      })
      const json = response.ok
        ? await response.json() as ApiEnvelope<BacktestMonitor>
        : null
      if (json?.success) {
        setBacktestMonitor(json.data ?? null)
      }
    } catch {
      if (!signal?.aborted) {
        setBacktestMonitor((current) => current)
      }
    }
  })

  const refreshV4Intelligence = useEffectEvent(async (signal?: AbortSignal) => {
    const readJson = async <T,>(url: string) => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      })
      const json = response.ok
        ? await response.json() as ApiEnvelope<T>
        : null
      return json?.success ? json.data ?? null : null
    }

    try {
      const [eventData, evidenceData, scorecardData, journalData] = await Promise.all([
        readJson<EventIntelligenceResponse>('/api/event-intelligence'),
        readJson<DecisionEvidencePacket>('/api/decision-evidence'),
        readJson<ModelProviderScorecard>('/api/model-scorecard'),
        readJson<SignalJournalResponse>('/api/journal'),
      ])
      if (signal?.aborted) {
        return
      }
      startTransition(() => {
        setEventIntelligence(eventData)
        setDecisionEvidence(evidenceData)
        setModelScorecard(scorecardData)
        setSignalJournal(journalData)
      })
    } catch {
      if (!signal?.aborted) {
        setEventIntelligence((current) => current)
        setDecisionEvidence((current) => current)
        setModelScorecard((current) => current)
        setSignalJournal((current) => current)
      }
    }
  })

  const probeProviders = useCallback(async () => {
    setIsProbingProviders(true)
    try {
      const response = await fetch('/api/providers/health?probe=1', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const json = await response.json() as ApiEnvelope<ProviderHealthPayload>
      if (!response.ok || !json.success) {
        throw new Error(json.error || `源探测接口异常：${response.status}`)
      }
      setProviderHealth(json.data)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Provider 探测失败')
    } finally {
      setIsProbingProviders(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void refreshData(controller.signal)
    }, 0)
    const intervalId = window.setInterval(() => {
      const nextController = new AbortController()
      void refreshData(nextController.signal)
    }, LIVE_REFRESH_INTERVAL_MS)
    const backtestController = new AbortController()
    const backtestTimer = window.setTimeout(() => {
      void refreshBacktest(backtestController.signal)
    }, 0)
    const backtestIntervalId = window.setInterval(() => {
      const nextController = new AbortController()
      void refreshBacktest(nextController.signal)
    }, BACKTEST_REFRESH_INTERVAL_MS)
    const clockId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    const v4Controller = new AbortController()
    const v4Timer = window.setTimeout(() => {
      void refreshV4Intelligence(v4Controller.signal)
    }, 0)
    const v4IntervalId = window.setInterval(() => {
      const nextController = new AbortController()
      void refreshV4Intelligence(nextController.signal)
    }, BACKTEST_REFRESH_INTERVAL_MS)

    return () => {
      controller.abort()
      backtestController.abort()
      v4Controller.abort()
      window.clearTimeout(timer)
      window.clearInterval(intervalId)
      window.clearTimeout(backtestTimer)
      window.clearInterval(backtestIntervalId)
      window.clearTimeout(v4Timer)
      window.clearInterval(v4IntervalId)
      window.clearInterval(clockId)
    }
  }, [])

  useEffect(() => {
    if (terminalView !== 'providers') {
      return
    }

    const timerId = window.setTimeout(() => {
      void probeProviders()
    }, 0)
    const intervalId = window.setInterval(() => {
      void probeProviders()
    }, PROVIDER_REFRESH_INTERVAL_MS)

    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(intervalId)
    }
  }, [probeProviders, terminalView])

  const sourceHealth = useMemo<SourceHealth>(() => {
    if (!quote) {
      return error ? 'offline' : 'stale'
    }

    const freshnessMs = new Date(quote.fetchedAt ?? quote.updatedAt).getTime()
    if (Number.isNaN(freshnessMs)) {
      return error ? 'offline' : 'stale'
    }

    if (error) {
      return 'offline'
    }

    if (quote.sourceStatus.active === 'fallback' || quote.sourceStatus.stale) {
      return 'stale'
    }

    return now - freshnessMs > STALE_AFTER_MS ? 'stale' : 'live'
  }, [quote, error, now])

  const activeTimeframe = TIMEFRAMES.find((item) => item.id === timeframe) ?? TIMEFRAMES[1]
  const renderableHistory = useMemo(() => buildRenderableHistory(history, quote), [history, quote])
  const chartSources = useMemo(() => buildChartSourceOptions(quote, renderableHistory), [quote, renderableHistory])
  const selectedChartSource = chartSources.find((item) => item.id === chartSource && item.available)
    ?? chartSources.find((item) => item.available)
    ?? chartSources[0]
  const activeChartSource = selectedChartSource.id
  const chartProjection = useMemo(
    () => projectHistoryForChartSource(renderableHistory, activeChartSource),
    [activeChartSource, renderableHistory],
  )
  const chartRenderableHistory = chartProjection.history
  const chartSourceCoverageLabel = chartProjection.mode === 'proxy'
    ? `代理回填 ${percentFormatter.format(chartProjection.coverage * 100)}% 原始点`
    : `原始序列 ${chartProjection.exactPointCount}点`
  const chartQuote = useMemo(() => projectQuoteForChartSource(quote, activeChartSource), [activeChartSource, quote])
  const recentHistory = useMemo(() => selectRecentHistory(chartRenderableHistory, 24), [chartRenderableHistory])
  const intradayData = useMemo(
    () => buildIntradayData(recentHistory, activeTimeframe.minutes, activeTimeframe.visibleBars),
    [activeTimeframe.minutes, activeTimeframe.visibleBars, recentHistory],
  )
  const candleData = useMemo(
    () => {
      const apiCandles = mapServerCandles(serverCandles[timeframe])
      const mergedCandles = apiCandles.length > 0 && activeChartSource === 'icbc'
        ? mergeLatestQuoteIntoCandles(apiCandles, chartQuote, activeTimeframe.minutes)
        : buildCandles(recentHistory, activeTimeframe.minutes)
      return selectVisibleCandles(mergedCandles, activeTimeframe.visibleBars)
    },
    [activeChartSource, activeTimeframe.minutes, activeTimeframe.visibleBars, chartQuote, serverCandles, recentHistory, timeframe],
  )
  const chartTimelineData = viewMode === 'intraday' ? intradayData.price : candleData
  const chartVisibleRange = useMemo(
    () => buildChartVisibleRange(
      chartTimeWindow,
      chartTimelineData,
      customChartRange,
    ),
    [chartTimeWindow, chartTimelineData, customChartRange],
  )
  const quoteRows = [
    quote?.marketReference.au9999,
    quote?.marketReference.autd,
    ...(quote?.marketReference.domesticReferences ?? []),
  ]
  const quoteBoardRows = useMemo(() => buildQuoteBoardRows(quote), [quote])
  const visibleQuoteBoardRows = quoteBoardRows.filter((item) => item.tab === quoteBoardTab)
  const mainDisplayQuote = useMemo(() => selectMainDisplayQuote(quote, quoteBoardRows), [
    quote,
    quoteBoardRows,
  ])
  const sourceMeta = SOURCE_META[sourceHealth]
  const lastUpdatedText = quote ? formatDateTime(quote.updatedAt) : '--'
  const lastAttemptText = lastAttemptAt ? formatDateTime(lastAttemptAt) : '--'
  const displayAnchor = useMemo(() => buildDisplayAnchor(quote), [quote])
  const anchorPrice = displayAnchor.price
  const anchorSpread = displayAnchor.spread
  const anchorPremium = displayAnchor.premiumPercent
  const withinReferenceRange = displayAnchor.withinRange
  const buySignal = useMemo(() => normalizeOpportunity(quote), [quote])
  const v4Evidence = useMemo(
    () => mergeV4Evidence(buySignal, eventIntelligence, decisionEvidence, modelScorecard, signalJournal),
    [buySignal, decisionEvidence, eventIntelligence, modelScorecard, signalJournal],
  )
  const patternSignals = useMemo(
    () => mergePatternSignals(buySignal?.patternSignals ?? [], quote?.patternSignals ?? []),
    [buySignal?.patternSignals, quote?.patternSignals],
  )
  const chartPrediction = useMemo(
    () => buildChartPrediction(buySignal, backtestMonitor),
    [backtestMonitor, buySignal],
  )
  const baseTradingSession = quote?.marketReference.tradingSession ?? null
  const chartTradingSession = useMemo(
    () => buildChartTradingSession(activeChartSource, baseTradingSession, now),
    [activeChartSource, baseTradingSession, now],
  )
  const signalTransparency = useMemo(
    () => buildSignalTransparency(buySignal, backtestMonitor, chartPrediction),
    [backtestMonitor, buySignal, chartPrediction],
  )
  const chartSignal = useMemo(() => buildChartSignal(buySignal, chartPrediction), [
    buySignal,
    chartPrediction,
  ])
  const signalMeta = getDecisionMeta(buySignal?.decisionView ?? null, buySignal?.level ?? 'none')
  const signalScoreText = formatScore(buySignal?.score ?? null)
  const dataStatus = buildDataStatus(quote, error, lastAttemptText)
  const sourceLedgerAlert = quote?.sourceLedger?.warnings.find((warning) =>
    warning.includes('报价口径不一致') ||
    warning.includes('陈旧') ||
    warning.includes('备用源') ||
    warning.includes('备用行情')
  ) ?? null
  const toggleIndicator = (indicator: Indicator) => {
    setActiveIndicators((current) => {
      return current.includes(indicator)
        ? current.filter((item) => item !== indicator)
        : [...current, indicator]
    })
    setViewMode('candles')
  }
  const handleChartRangeChange = useCallback((range: ChartVisibleRange) => {
    setCustomChartRange(range)
    setChartTimeWindow('custom')
  }, [])
  const selectChartTimeWindow = (windowKind: ChartTimeWindowKind) => {
    if (windowKind !== 'custom') {
      setCustomChartRange(null)
    }
    setChartTimeWindow(windowKind)
  }
  const chartScrubber = useMemo(
    () => buildChartScrubberInfo(chartTimelineData, chartVisibleRange),
    [chartTimelineData, chartVisibleRange],
  )
  const handleChartScrubberChange = useCallback((range: ChartVisibleRange) => {
    handleChartRangeChange(range)
  }, [handleChartRangeChange])

  return (
    <main className="terminal">
      <header className="quote-strip">
        <div className="identity">
          <strong>{mainDisplayQuote?.label ?? '工银积存金'}</strong>
          <span>{mainDisplayQuote?.symbol ?? 'ICBC_ACCUMULATION_GOLD'}</span>
        </div>
        <div className="live-price">
          <strong>{mainDisplayQuote ? currencyFormatter.format(mainDisplayQuote.price) : '--'}</strong>
          <span className={mainDisplayQuote && getBoardEntryChange(mainDisplayQuote) >= 0 ? 'up' : 'down'}>
            {mainDisplayQuote ? formatSignedPercent(getBoardEntryChange(mainDisplayQuote)) : '--'}
          </span>
        </div>
        <div className={`signal-status signal-status--${signalMeta.tone}`}>
          <span>{signalMeta.eyebrow}</span>
          <strong>{signalMeta.label}</strong>
          <small>{signalScoreText}</small>
        </div>
        <Ticker label="高" value={quote ? currencyFormatter.format(quote.stats24h.high24h) : '--'} />
        <Ticker label="低" value={quote ? currencyFormatter.format(quote.stats24h.low24h) : '--'} />
        <Ticker
          label="参考"
          value={anchorPrice === null ? '--' : currencyFormatter.format(anchorPrice)}
        />
        <Ticker
          label="偏离"
          value={anchorSpread === null ? '--' : formatSignedCurrency(anchorSpread)}
          tone={anchorSpread !== null && anchorSpread >= 0 ? 'up' : 'down'}
        />
        <div className={`connection connection--${sourceHealth}`} title={sourceMeta.detail}>
          <span />
          <strong>{sourceMeta.label}</strong>
          <small>{lastUpdatedText}</small>
        </div>
      </header>

      {quote?.sourceLedger && sourceLedgerAlert ? (
        <section className="source-ledger-warning" aria-label="报价源口径提醒">
          <AlertTriangle size={16} />
          <strong>报价源复核</strong>
          <span>{sourceLedgerAlert}</span>
          <small>
            主交易价 {currencyFormatter.format(quote.sourceLedger.tradePrice)}
            {quote.sourceLedger.consensus.price !== null
              ? ` · 共识 ${currencyFormatter.format(quote.sourceLedger.consensus.price)}`
              : ' · 共识暂缺'}
          </small>
        </section>
      ) : null}

      {dataStatus ? (
        <section className={`status-row status-row--${dataStatus.tone}`}>
          <AlertTriangle size={16} />
          <span>{dataStatus.message}</span>
          <strong>{dataStatus.detail}</strong>
        </section>
      ) : null}

      <section className="quote-board-panel">
        <div className="quote-board-panel__head">
          <div>
            <strong>多源行情校准</strong>
            <span>主屏默认展示校准价；工银原始价、AU9999、浙商积存金可切换复核。</span>
          </div>
          <div className="quote-board-tabs" role="tablist" aria-label="行情来源切换">
            {QUOTE_BOARD_TABS.map((tab) => (
              <button
                className={quoteBoardTab === tab.id ? 'is-active' : ''}
                key={tab.id}
                onClick={() => setQuoteBoardTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="quote-board-table">
          <div className="quote-board-table__head">
            <span>来源</span>
            <span>最新</span>
            <span>涨跌</span>
            <span>高/低</span>
            <span>更新时间</span>
          </div>
          {visibleQuoteBoardRows.map((item) => (
            <div className="quote-board-table__row" key={item.id} title={item.note}>
              <span>
                <strong>{item.label}</strong>
                <small>{item.symbol} · {item.confidence}</small>
              </span>
              <strong>{currencyFormatter.format(item.price)}</strong>
              <span className={getBoardEntryChange(item) >= 0 ? 'up' : 'down'}>
                {formatSignedPercent(getBoardEntryChange(item))}
              </span>
              <span>
                {item.high === null || item.low === null
                  ? '--'
                  : `${currencyFormatter.format(item.high)} / ${currencyFormatter.format(item.low)}`}
              </span>
              <span>{item.updatedAt ? formatDateTime(item.updatedAt) : '--'}</span>
            </div>
          ))}
          {visibleQuoteBoardRows.length === 0 ? (
            <div className="quote-board-table__empty">该分组暂无可用行情，等待下一轮刷新。</div>
          ) : null}
        </div>
      </section>

      {buySignal ? (
        <section className={`opportunity-alert opportunity-alert--${signalMeta.tone}`}>
          <div className="opportunity-alert__icon">
            <AlertTriangle size={20} />
          </div>
          <div className="opportunity-alert__body">
            <strong>{signalMeta.label}</strong>
            <span>
              {buySignal.decisionView?.singleCommand ?? buySignal.decisionView?.primaryInstruction ?? buySignal.summary}
              {buySignal.reasons[0] ? ` · ${buySignal.reasons[0]}` : ''}
            </span>
            <small>
              {buySignal.decisionView?.beginnerInstruction ??
                (buySignal.level === 'strong'
                  ? '强信号也必须通过硬门槛、分批与止损复核；不构成收益承诺。'
                  : '观察级只提示复核条件，不提示追价或立即交易。')}
            </small>
          </div>
          <div className="opportunity-alert__score">
            <span>{buySignal.decisionView?.probabilityDisplay.label ?? 'TP1倾向'}</span>
            <strong>
              {buySignal.decisionView?.probabilityDisplay.mode === 'calibrated' &&
              buySignal.decisionView.probabilityDisplay.value !== null
                ? formatProbability(buySignal.decisionView.probabilityDisplay.value * 100)
                : '不显示'}
            </strong>
          </div>
        </section>
      ) : null}

      {buySignal?.decisionView ? (
        <section className="trader-command-card" aria-label="交易员口令卡">
          <article>
            <span>现在动作</span>
            <strong>{executionStateLabel(buySignal.decisionView.executionState)}</strong>
            <small>{buySignal.decisionView.singleCommand}</small>
          </article>
          <article>
            <span>等待价位</span>
            <strong>{formatMaybePrice(buySignal.decisionView.triggerPrice)}</strong>
            <small>{buySignal.decisionView.levelValidation.trigger.reason}</small>
          </article>
          <article>
            <span>错了退出</span>
            <strong>{formatMaybePrice(buySignal.decisionView.stopLoss)}</strong>
            <small>{buySignal.decisionView.levelValidation.stopLoss.reason}</small>
          </article>
          <article>
            <span>为什么克制</span>
            <strong>{buySignal.decisionView.displayGrade}</strong>
            <small>{buySignal.decisionView.blockerSummary}</small>
          </article>
        </section>
      ) : null}

      {quote?.alert.triggered ? (
        <section className="alert-row">
          <ShieldCheck size={16} />
          <span>{quote.alert.reason}</span>
          <strong>{formatSignedPercent(quote.stats24h.percentChange24h)}</strong>
        </section>
      ) : null}

      <section className="terminal-nav" aria-label="终端视图">
        <button
          className={terminalView === 'dashboard' ? 'is-active' : ''}
          onClick={() => setTerminalView('dashboard')}
          type="button"
        >
          宏观驾驶舱
        </button>
        <button
          className={terminalView === 'backtest' ? 'is-active' : ''}
          onClick={() => setTerminalView('backtest')}
          type="button"
        >
          专业回测
        </button>
        <button
          className={terminalView === 'providers' ? 'is-active' : ''}
          onClick={() => {
            setTerminalView('providers')
            void probeProviders()
          }}
          type="button"
        >
          源探测
        </button>
      </section>

      {terminalView === 'providers' ? (
        <ProviderHealthPage
          health={providerHealth}
          isLoading={isProbingProviders}
          onProbe={() => void probeProviders()}
        />
      ) : terminalView === 'backtest' ? (
        <BacktestResearchPage monitor={backtestMonitor} signal={buySignal} />
      ) : (
      <section className="workspace">
        <section className="chart-workbench">
          <div className="chart-toolbar-main">
            <div className="mode-group" aria-label="图表类型">
              <button
                className={viewMode === 'intraday' ? 'is-active' : ''}
                onClick={() => setViewMode('intraday')}
                title="分时"
                type="button"
              >
                <LineChart size={17} />
                <span>分时</span>
              </button>
              <button
                className={viewMode === 'candles' ? 'is-active' : ''}
                onClick={() => setViewMode('candles')}
                title="K线"
                type="button"
              >
                <CandlestickChart size={17} />
                <span>K线</span>
              </button>
            </div>

            <div className="period-group" aria-label="周期">
              {TIMEFRAMES.map((item) => (
                <button
                  className={timeframe === item.id ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => setTimeframe(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="chart-range-group" aria-label="时间范围">
              {CHART_TIME_WINDOWS.map((item) => (
                <button
                  className={chartTimeWindow === item.id ? 'is-active' : ''}
                  disabled={item.id === 'custom' && customChartRange === null}
                  key={item.id}
                  onClick={() => selectChartTimeWindow(item.id)}
                  title={item.title}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="chart-source-group" aria-label="行情源">
              {chartSources.map((item) => (
                <button
                  className={activeChartSource === item.id ? 'is-active' : ''}
                  disabled={!item.available}
                  key={item.id}
                  onClick={() => setChartSource(item.id)}
                  title={item.reason}
                  type="button"
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>

            <div className="indicator-group" aria-label="指标">
              {INDICATORS.map((item) => (
                <button
                  className={activeIndicators.includes(item.id) ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => toggleIndicator(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="tool-hints">
              <span title="十字光标">
                <Crosshair size={15} />
                读值
              </span>
              <span title="最新刷新">
                <RefreshCw size={15} />
                {lastAttemptText}
              </span>
              <span title="分层实时刷新：行情快照约3秒，回测15秒，源探测60秒；宏观慢源按服务端缓存刷新。">
                实时 {LIVE_REFRESH_INTERVAL_MS / 1000}s · 回测 {BACKTEST_REFRESH_INTERVAL_MS / 1000}s
              </span>
              <span title={selectedChartSource.reason}>
                当前 {selectedChartSource.label} · {chartSourceCoverageLabel}
              </span>
            </div>
          </div>

          <TradingSessionBanner session={chartTradingSession} />

          {viewMode === 'intraday' ? (
            <IntradayChartPanel
              indicators={activeIndicators}
              isLoading={isLoading}
              latestPrice={chartQuote?.price ?? null}
              latestReference={activeChartSource === 'icbc' ? quote?.marketReference.calibration.anchorPrice ?? null : null}
              opportunity={buySignal}
              priceData={intradayData.price}
              patternSignals={patternSignals}
              prediction={chartPrediction}
              referenceData={intradayData.reference}
              signal={chartSignal}
              v4Evidence={v4Evidence}
              tradingSession={chartTradingSession}
              timeframeLabel={activeTimeframe.label}
              visibleRange={chartVisibleRange}
              onVisibleRangeChange={handleChartRangeChange}
              rangeScrubberInfo={chartScrubber}
              onRangeScrubberChange={handleChartScrubberChange}
            />
          ) : (
            <CandlestickChartPanel
              candleData={candleData}
              indicators={activeIndicators}
              isLoading={isLoading}
              latestPrice={chartQuote?.price ?? null}
              opportunity={buySignal}
              patternSignals={patternSignals}
              prediction={chartPrediction}
              signal={chartSignal}
              v4Evidence={v4Evidence}
              tradingSession={chartTradingSession}
              timeframeLabel={activeTimeframe.label}
              visibleRange={chartVisibleRange}
              onVisibleRangeChange={handleChartRangeChange}
              rangeScrubberInfo={chartScrubber}
              onRangeScrubberChange={handleChartScrubberChange}
            />
          )}
          <ChartInsightDeck
            monitor={backtestMonitor}
            providerHealth={providerHealth}
            signal={buySignal}
            transparency={signalTransparency}
          />
        </section>

        <aside className="side-rail">
          <OpportunityPanel
            marketCards={(
              <>
                <Panel title="盘口概览" icon={<Activity size={16} />}>
                  <StatLine
                    label="24h 涨跌"
                    value={quote ? formatSignedPercent(quote.stats24h.percentChange24h) : '--'}
                    tone={quote && quote.stats24h.percentChange24h >= 0 ? 'up' : 'down'}
                  />
                  <StatLine
                    label="24h 回撤"
                    value={quote ? formatSignedPercent(-quote.stats24h.drawdownPercent24h) : '--'}
                    tone={quote && quote.stats24h.drawdownPercent24h > 0 ? 'down' : 'flat'}
                  />
                  <StatLine
                    label="采样点"
                    value={quote ? String(quote.stats24h.pointCount) : '--'}
                  />
                  <StatLine
                    label="数据质量"
                    value={quote?.quality ? `${quote.quality.score}/100` : '--'}
                    tone={getQualityTone(quote?.quality?.level)}
                  />
                  <StatLine label="来源" value={quote?.sourceName ?? '--'} />
                </Panel>

                <Panel title="联合校准" icon={<Target size={16} />}>
                  <StatLine
                    label={displayAnchor.label}
                    value={anchorPrice === null ? '--' : currencyFormatter.format(anchorPrice)}
                  />
                  <StatLine
                    label="价差"
                    value={anchorSpread === null ? '--' : formatSignedCurrency(anchorSpread)}
                    tone={anchorSpread !== null && anchorSpread >= 0 ? 'up' : 'down'}
                  />
                  <StatLine
                    label="偏离率"
                    value={anchorPremium === null ? '--' : formatSignedPercent(anchorPremium)}
                    tone={anchorPremium !== null && anchorPremium >= 0 ? 'up' : 'down'}
                  />
                  <StatLine
                    label="区间"
                    value={withinReferenceRange === null ? '--' : withinReferenceRange ? '内' : '外'}
                  />
                  <StatLine
                    label="多源共识"
                    value={quote?.marketReference.consensusPrice ? currencyFormatter.format(quote.marketReference.consensusPrice) : '--'}
                  />
                  <StatLine
                    label="共识偏离"
                    value={quote?.marketReference.consensusDeviationPercent === null || quote?.marketReference.consensusDeviationPercent === undefined ? '--' : formatSignedPercent(quote.marketReference.consensusDeviationPercent)}
                    tone={quote?.marketReference.consensusDeviationPercent !== undefined && quote?.marketReference.consensusDeviationPercent !== null && quote.marketReference.consensusDeviationPercent >= 0 ? 'up' : 'down'}
                  />
                  <StatLine
                    label="交易时段"
                    value={formatTradingSessionStatus(chartTradingSession)}
                  />
                  <p className="panel-note">{displayAnchor.note}</p>
                </Panel>

                <Panel title="上金所延时行情">
                  <div className="market-book">
                    <div className="market-book__head">
                      <span>合约</span>
                      <span>最新</span>
                      <span>高</span>
                      <span>低</span>
                    </div>
                    {quoteRows.map((item, index) => (
                      <div className="market-book__row" key={item?.symbol ?? `empty-${index}`}>
                        <span>{item?.label ?? item?.symbol ?? '--'}</span>
                        <strong>{item ? currencyFormatter.format(item.latestPrice) : '--'}</strong>
                        <span>{item ? currencyFormatter.format(item.highPrice) : '--'}</span>
                        <span>{item ? currencyFormatter.format(item.lowPrice) : '--'}</span>
                      </div>
                    ))}
                    {quoteRows.every((item) => item === null || item === undefined) ? (
                      <p className="panel-note">
                        上金所延时锚暂未返回有效报价，页面已用工行日内高低做临时参考。
                      </p>
                    ) : null}
                  </div>
                </Panel>
              </>
            )}
            monitor={backtestMonitor}
            signal={buySignal}
            timeframeMinutes={activeTimeframe.minutes}
            transparency={signalTransparency}
            v4Evidence={v4Evidence}
          />
        </aside>
      </section>
      )}
    </main>
  )
}

function OpportunityPanel(props: {
  marketCards?: React.ReactNode
  monitor: BacktestMonitor | null
  signal: OpportunityInfo | null
  timeframeMinutes: number
  transparency: SignalTransparency
  v4Evidence: V4EvidenceBundle
}) {
  const meta = getDecisionMeta(props.signal?.decisionView ?? null, props.signal?.level ?? 'none')
  const [activeTab, setActiveTab] = useState<OpportunityTab>('decision')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('beginner')
  const panelRef = useRef<HTMLElement | null>(null)
  const selectTab = (tab: OpportunityTab) => {
    setActiveTab(tab)
    requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0 })
    })
  }

  return (
    <article className={`panel opportunity-panel opportunity-panel--${meta.tone}`} ref={panelRef}>
      <header>
        <AlertTriangle size={16} />
        <strong>观察复核</strong>
        <span>{meta.label}</span>
      </header>
      <div className="opportunity-score">
        <span>Signal Score</span>
        <strong>{formatScore(props.signal?.score ?? null)}</strong>
      </div>
      <div className="review-mode-toggle" aria-label="复核模式切换">
        <button
          className={reviewMode === 'beginner' ? 'is-active' : ''}
          onClick={() => setReviewMode('beginner')}
          type="button"
        >
          小白模式
        </button>
        <button
          className={reviewMode === 'professional' ? 'is-active' : ''}
          onClick={() => setReviewMode('professional')}
          type="button"
        >
          专业模式
        </button>
        <span>{reviewMode === 'beginner' ? '只看能不能做' : '展开证据链与回测'}</span>
      </div>
      <div className="opportunity-tabs" role="tablist" aria-label="观察复核功能切换">
        {OPPORTUNITY_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="opportunity-tab-panel" role="tabpanel">
        {activeTab === 'decision' ? (
          <>
            <DecisionCommandPanel
              signal={props.signal}
              timeframeMinutes={props.timeframeMinutes}
              transparency={props.transparency}
              v4Evidence={props.v4Evidence}
            />
            {reviewMode === 'professional' ? (
              <>
                <EventMacroBroadcastPanel signal={props.signal} v4Evidence={props.v4Evidence} />
                <SignalTransparencyPanel compact transparency={props.transparency} />
              </>
            ) : null}
          </>
        ) : null}
        {activeTab === 'plan' ? (
          <TradePlanPanel tradePlan={props.signal?.tradePlan ?? null} />
        ) : null}
        {activeTab === 'risk' ? (
          <>
            <EventRiskPanel eventRisk={props.signal?.eventRisk ?? null} />
            <PsychologyPanel psychology={props.signal?.psychology ?? null} />
            <HardGatePanel
              guardrail={props.transparency.guardrail}
              hardGates={props.transparency.hardGates}
            />
            <SignalList
              emptyText="暂无后端 risks"
              items={props.signal?.risks ?? []}
              title="全部风险"
            />
            {!props.signal?.eventRisk && !props.signal?.psychology && (props.signal?.risks ?? []).length < 1 ? (
              <TabEmptyPanel text="当前没有额外风险卡片；仍需遵守决策页四个硬条件。" />
            ) : null}
          </>
        ) : null}
        {activeTab === 'evidence' ? (
          <>
            <V4EvidencePanel evidence={props.v4Evidence} />
            <ConfluencePanel confluence={props.signal?.confluence ?? null} />
            <SourceSlaPanel ledger={props.v4Evidence.decisionEvidence?.sourceLedger ?? props.signal?.decisionView?.sourceLedger ?? null} />
            {reviewMode === 'professional' ? (
              <>
                <ScoreMethodologyPanel monitor={props.monitor} signal={props.signal} />
                <ExpertCouncil
                  consensus={props.signal?.expertConsensus ?? null}
                  marketContext={props.signal?.marketContext ?? null}
                  opinions={props.signal?.expertOpinions ?? []}
                />
                <ValuationPanel valuation={props.signal?.valuation ?? null} />
                {props.marketCards}
              </>
            ) : null}
          </>
        ) : null}
        {activeTab === 'validation' ? (
          <>
            <SignalJournalPreviewPanel
              entry={props.v4Evidence.signalJournal?.entries[0] ?? props.signal?.decisionView?.journalPreview ?? null}
              expanded={reviewMode === 'professional'}
            />
            {reviewMode === 'professional' ? <BacktestMonitorPanel monitor={props.monitor} /> : null}
          </>
        ) : null}
      </div>
      <p className="opportunity-disclaimer">
        信号用于观察和复核，不承诺收益；请结合自身风险承受能力判断。
      </p>
    </article>
  )
}

const OPPORTUNITY_TABS: Array<{ id: OpportunityTab; label: string }> = [
  { id: 'decision', label: '决策' },
  { id: 'plan', label: '计划' },
  { id: 'risk', label: '风控' },
  { id: 'evidence', label: '依据' },
  { id: 'validation', label: '验证' },
]

function DecisionCommandPanel(props: {
  signal: OpportunityInfo | null
  timeframeMinutes: number
  transparency: SignalTransparency
  v4Evidence: V4EvidenceBundle
}) {
  const decisionView = props.signal?.decisionView ?? null
  const radar = buildNextActionRadar(props.signal, props.transparency, props.timeframeMinutes)
  const gates = buildFourHardGates(props.signal, props.transparency, props.v4Evidence)
  const command = props.v4Evidence.decisionEvidence?.decision.command ??
    decisionView?.singleCommand ??
    radar.command
  const subtitle = decisionView?.beginnerInstruction ??
    props.signal?.tradePlan?.positionSuggestion ??
    '没有同时满足触发价、止损、赔率和数据/事件边界前，只复核不追价。'

  return (
    <section className={`decision-command decision-command--${radar.tone}`}>
      <header>
        <div>
          <strong>一句口令</strong>
          <small>{radar.subtitle}</small>
        </div>
        <span>{radar.badge}</span>
      </header>
      <div className="decision-command__hero">
        <span>现在只执行这一句</span>
        <strong>{command}</strong>
        <small>{subtitle}</small>
      </div>
      <div className="decision-command__gates" aria-label="四个硬条件">
        {gates.map((gate) => (
          <article className={`hard-gate hard-gate--${gate.status}`} key={gate.label}>
            <span>{hardGateLabel(gate.status)}</span>
            <strong>{gate.label}</strong>
            <small>{gate.detail}</small>
          </article>
        ))}
      </div>
      <p>{props.transparency.guardrail}</p>
    </section>
  )
}

function V4EvidencePanel(props: { evidence: V4EvidenceBundle }) {
  const packet = props.evidence.decisionEvidence
  const eventIntel = props.evidence.eventIntelligence ?? packet?.eventIntelligence ?? null
  const scorecard = props.evidence.modelScorecard ?? packet?.modelScorecard ?? null
  const rows = packet?.evidence ?? []

  if (!packet && !eventIntel && !scorecard) {
    return (
      <section className="v4-evidence-panel v4-evidence-panel--empty">
        <header>
          <strong>v4 证据链</strong>
          <span>兼容 v3</span>
        </header>
        <p>后端暂未返回 v4 event intelligence / decision evidence / model registry 字段，页面继续使用 v3 决策视图、SLA 账本和回测信息。</p>
      </section>
    )
  }

  return (
    <section className="v4-evidence-panel">
      <header>
        <strong>v4 证据链</strong>
        <span>{packet ? '已接入' : '部分接入'}</span>
      </header>
      <p>{packet?.summary ?? eventIntel?.summary ?? scorecard?.summary ?? 'v4 证据字段已按可用项展示。'}</p>
      <div className="v4-evidence-grid">
        <article>
          <span>事件智能</span>
          <strong>{eventIntel?.activeItem ? eventIntel.activeItem.label : eventIntel ? eventRiskLevelLabel(eventIntel.current.level) : '沿用 v3'}</strong>
          <small>{eventIntel?.usageBoundary ?? '无 v4 事件智能时沿用 eventRisk。'}</small>
        </article>
        <article>
          <span>模型注册</span>
          <strong>{scorecard ? `${scorecard.entries.filter((entry) => entry.status === 'active').length}/${scorecard.entries.length} active` : '沿用回测'}</strong>
          <small>{scorecard?.summary ?? '未返回 model registry / scorecard 时沿用 v3 externalModelAdvisor。'}</small>
        </article>
      </div>
      {rows.length > 0 ? (
        <div className="v4-evidence-list">
          {rows.slice(0, 4).map((row) => (
            <article className={`v4-evidence-item v4-evidence-item--${row.status}`} key={row.id}>
              <strong>{row.label}</strong>
              <span>{decisionEvidenceStatusLabel(row.status)} · {sourceUsageShortLabel(row.sourceUsage)}</span>
              <small>{row.summary}</small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function TabEmptyPanel(props: { text: string }) {
  return (
    <section className="tab-empty-panel">
      <strong>暂无额外内容</strong>
      <p>{props.text}</p>
    </section>
  )
}

function SignalTransparencyPanel(props: { compact?: boolean; transparency: SignalTransparency }) {
  return (
    <section className="signal-transparency">
      <header>
        <strong>模型透明度切片</strong>
        <span>{props.transparency.verdict}</span>
      </header>
      <div className="signal-transparency__grid">
        <MetricCard
          label="模型倾向"
          value={props.transparency.probability === null ? props.transparency.probabilityLabel : formatProbability(props.transparency.probability)}
        />
        <MetricCard label="回测胜率" value={formatNullablePercent(props.transparency.winRate)} />
        <MetricCard
          label="校准可信度"
          value={props.transparency.calibrationConfidence === null ? '--' : `${props.transparency.calibrationConfidence}/100`}
        />
        <MetricCard
          label="可靠性"
          value={
            props.transparency.reliability === null
              ? '--'
              : `${props.transparency.reliability}/100`
          }
        />
      </div>
      {!props.compact ? (
        <HardGatePanel
          guardrail={props.transparency.guardrail}
          hardGates={props.transparency.hardGates}
        />
      ) : null}
    </section>
  )
}

type EventMacroBroadcastTone = 'block' | 'watch' | 'support' | 'neutral'

type EventMacroBroadcastItem = {
  id: string
  title: string
  meta: string
  detail: string
  badge: string
  tone: EventMacroBroadcastTone
}

function EventMacroBroadcastPanel(props: { signal: OpportunityInfo | null; v4Evidence?: V4EvidenceBundle }) {
  const broadcast = buildEventMacroBroadcast(props.signal, props.v4Evidence)

  return (
    <section className={`event-macro-broadcast event-macro-broadcast--${broadcast.tone}`}>
      <header>
        <div>
          <strong>事件/宏观关联播报</strong>
          <small>{broadcast.subtitle}</small>
        </div>
        <span>{broadcast.badge}</span>
      </header>
      <div className="event-macro-command">
        <span>对当前交易动作的影响</span>
        <strong>{broadcast.command}</strong>
      </div>
      <div className="event-macro-feed">
        {broadcast.items.map((item) => (
          <article className={`event-macro-item event-macro-item--${item.tone}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.badge}</span>
            </div>
            <small>{item.meta}</small>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <p className="event-macro-boundary">
        实时、估算、离线镜像会分别标注；慢频宏观和 RSS 情绪只用于降级/解释，不直接构成买入依据。
      </p>
    </section>
  )
}

function SourceSlaPanel(props: { ledger: SourceSlaLedger | null }) {
  const ledger = props.ledger
  if (!ledger) {
    return (
      <section className="source-sla-panel source-sla-panel--blocked">
        <header>
          <strong>数据源 SLA 账本</strong>
          <span>等待后端账本</span>
        </header>
        <p>当前快照暂未携带 v3 数据源 SLA。页面不会因此放大强提醒，只按原始数据健康和锚点规则降级处理。</p>
      </section>
    )
  }
  const entries = Array.isArray(ledger.entries) ? ledger.entries : []
  const warnings = Array.isArray(ledger.warnings) ? ledger.warnings : []
  return (
    <section className={`source-sla-panel source-sla-panel--${ledger.strongSignalEligible ? 'ready' : 'blocked'}`}>
      <header>
        <strong>数据源 SLA 账本</strong>
        <span>{ledger.strongSignalEligible ? '可进入强提醒候选' : '强提醒降级'}</span>
      </header>
      <p>{ledger.summary}</p>
      <div className="source-sla-grid">
        {entries.slice(0, 5).map((entry) => (
          <article className={`source-sla-entry source-sla-entry--${entry.health}`} key={entry.sourceId}>
            <span>{sourceSlaTypeLabel(entry.sourceType)}</span>
            <strong>{entry.label}</strong>
            <small>
              {entry.price === null ? '--' : currencyFormatter.format(entry.price)}
              {' · '}
              {sourceSlaHealthLabel(entry.health)}
              {entry.discrepancyFromTradePrice !== null ? ` · 偏离 ${formatSignedPercent(entry.discrepancyFromTradePrice)}` : ''}
            </small>
          </article>
        ))}
      </div>
      {warnings.length > 0 ? (
        <ul>
          {warnings.slice(0, 3).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function SignalJournalPreviewPanel(props: { entry: SignalJournalEntry | null; expanded?: boolean }) {
  const entry = props.entry
  if (!entry) {
    return (
      <section className="signal-journal-preview">
        <header>
          <strong>实战复盘种子</strong>
          <span>等待记录</span>
        </header>
        <p>当前信号尚未形成可复盘记录。系统会优先隐藏未验证概率，不把缺样本包装成高胜率。</p>
      </section>
    )
  }
  const notes = Array.isArray(entry.notes) ? entry.notes : []
  return (
    <section className="signal-journal-preview">
      <header>
        <strong>实战复盘种子</strong>
        <span>{signalOutcomeLabel(entry.outcome)} · {failureReasonLabel(entry.failureReason)}</span>
      </header>
      <div className="signal-journal-grid">
        <MetricCard label="记录价" value={currencyFormatter.format(entry.price)} />
        <MetricCard label="状态" value={executionStateLabel(entry.executionState)} />
        <MetricCard label="赔率" value={entry.riskRewardRatio === null ? '--' : `${entry.riskRewardRatio}:1`} />
        <MetricCard label="概率" value={entry.probabilityShown ? '已校准展示' : '隐藏精确值'} />
      </div>
      <p>{entry.command}</p>
      {props.expanded ? (
        <ul>
          {notes.slice(0, 4).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function HardGatePanel(props: {
  guardrail: string
  hardGates: SignalTransparency['hardGates']
}) {
  return (
    <section className="hard-gate-panel">
      <div className="hard-gate-grid">
        {props.hardGates.map((gate) => (
          <article className={`hard-gate hard-gate--${gate.status}`} key={gate.label}>
            <span>{hardGateLabel(gate.status)}</span>
            <strong>{gate.label}</strong>
            <small>{gate.detail}</small>
          </article>
        ))}
      </div>
      <p>{props.guardrail}</p>
    </section>
  )
}

function TradePlanPanel(props: { tradePlan: TradePlan | null }) {
  const plan = props.tradePlan
  if (!plan) {
    return null
  }

  const entryText = plan.entryZone
    ? `${formatMaybePrice(plan.entryZone.low)} - ${formatMaybePrice(plan.entryZone.high)}`
    : '暂不建议开新仓'

  return (
    <section className={`trade-plan trade-plan--${plan.confidence}`}>
      <header>
        <strong>纸面交易计划模板</strong>
        <span>{plan.actionLabel}</span>
      </header>
      <div className="trade-plan__decision">
        <div>
          <span>当前动作</span>
          <strong>{plan.actionLabel}</strong>
          <small>{plan.positionSuggestion}</small>
        </div>
        <div>
          <span>风险收益比</span>
          <strong>{plan.riskRewardRatio === null ? '--' : `${plan.riskRewardRatio}:1`}</strong>
          <small>强观察最低 2.5:1；未触发价、止损、赔率同时满足前不执行。</small>
        </div>
      </div>
      <div className="trade-plan__levels">
        <DataItem label="入场区" value={entryText} />
        <DataItem label="触发价" value={formatMaybePrice(plan.triggerPrice)} />
        <DataItem label="止损" value={formatMaybePrice(plan.stopLoss)} />
        <DataItem label="TP1" value={formatMaybePrice(plan.takeProfit1)} />
        <DataItem label="TP2" value={formatMaybePrice(plan.takeProfit2)} />
        <DataItem label="最大仓位" value={`${plan.maxPositionPercent}%`} />
      </div>
      <div className="trade-plan__rule">
        <span>错了怎么办</span>
        <strong>{plan.invalidation}</strong>
      </div>
      <SignalList
        emptyText="暂无纸面计划依据"
        items={plan.rationale}
        title="模板依据"
      />
      {plan.warnings.length > 0 ? (
        <SignalList
          emptyText="暂无计划风险"
          items={plan.warnings}
          title="计划风险"
        />
      ) : null}
    </section>
  )
}

function PsychologyPanel(props: { psychology: PsychologyDiscipline | null }) {
  const psychology = props.psychology
  if (!psychology || psychology.level === 'stable') {
    return null
  }

  return (
    <section className={`psychology-panel psychology-panel--${psychology.level}`}>
      <header>
        <strong>心理纪律官</strong>
        <span>{psychologyActionLabel(psychology.action)} · {psychology.score}/100</span>
      </header>
      <p>{psychology.summary}</p>
      <div className="psychology-flags">
        {psychology.flags.slice(0, 3).map((flag) => (
          <article className={`psychology-flag psychology-flag--${flag.severity}`} key={flag.kind}>
            <strong>{flag.label}</strong>
            <small>{flag.evidence}</small>
            <span>{flag.correction}</span>
          </article>
        ))}
      </div>
      <ul>
        {psychology.checklist.slice(0, 2).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function EventRiskPanel(props: { eventRisk: EconomicEventRisk | null }) {
  const risk = props.eventRisk
  if (!risk || risk.level === 'none') {
    return null
  }

  return (
    <section className={`event-risk-panel event-risk-panel--${risk.level}`}>
      <header>
        <strong>事件风控</strong>
        <span>{eventRiskLevelLabel(risk.level)} · 仓位系数 {risk.positionMultiplier}</span>
      </header>
      <p>{risk.summary}</p>
      <div className="event-risk-grid">
        <div>
          <span>扣分/封顶</span>
          <strong>-{risk.scorePenalty} · {risk.scoreCap}/100</strong>
        </div>
        <div>
          <span>阶段</span>
          <strong>{eventPhaseLabel(risk.phase)}</strong>
        </div>
      </div>
      {risk.warnings.length > 0 ? (
        <ul>
          {risk.warnings.slice(0, 2).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {risk.activeEvent?.source === 'estimated' ? (
        <small>当前为常规发布时间估算窗口；配置真实经济日历后会优先采用官方/授权时间。</small>
      ) : null}
    </section>
  )
}

function ConfluencePanel(props: { confluence: MultiTimeframeConfluence | null }) {
  const confluence = props.confluence
  if (!confluence) {
    return null
  }

  return (
    <section className={`confluence-panel confluence-panel--${confluence.conflictLevel}`}>
      <header>
        <strong>多周期共振</strong>
        <span>{biasText(confluence.overallBias)} · {confluence.score}/100</span>
      </header>
      <p>{confluence.summary}</p>
      <div className="confluence-grid">
        {confluence.frames.map((frame) => (
          <article className={`confluence-frame confluence-frame--${frame.bias}`} key={frame.timeframe}>
            <span>{frame.label}</span>
            <strong>{biasText(frame.bias)}</strong>
            <small>
              动量 {formatNullablePercent(frame.momentumPercent)} · 波动 {formatNullablePercent(frame.volatilityPercent)}
            </small>
            <b>{frame.trendScore}/100</b>
          </article>
        ))}
      </div>
      {confluence.conflictLevel === 'severe' ? (
        <small>小周期和大周期严重冲突时，只允许轻仓短打或继续等待，禁止把短线反弹当成大级别买点。</small>
      ) : null}
    </section>
  )
}

function biasText(bias: TimeframeBias) {
  if (bias === 'bullish') {
    return '偏多'
  }
  if (bias === 'bearish') {
    return '偏空'
  }
  if (bias === 'insufficient') {
    return '样本不足'
  }
  return '中性'
}

function ScoreMethodologyPanel(props: { monitor: BacktestMonitor | null; signal: OpportunityInfo | null }) {
  const methodology = buildScoreMethodology(props.signal, props.monitor)

  return (
    <section className="score-methodology">
      <header>
        <strong>评分科学性</strong>
        <span>{methodology.confidenceLabel}</span>
      </header>
      <p>{methodology.summary}</p>
      <div className="score-formula">
        <span>透明公式</span>
        <strong>{methodology.formula}</strong>
      </div>
      <div className="score-factor-grid">
        {methodology.factors.map((factor) => (
          <div className="score-factor" key={factor.label}>
            <span>{factor.label}</span>
            <strong>{factor.value}</strong>
            <small>{factor.weight}</small>
          </div>
        ))}
      </div>
      <small>{methodology.guardrail}</small>
    </section>
  )
}

function ValuationPanel(props: { valuation: ValuationMetrics | null }) {
  if (!props.valuation) {
    return null
  }

  const valuation = props.valuation
  return (
    <section className="valuation-panel">
      <header>
        <strong>量化估值水位</strong>
        <span>{valuation.score}/100</span>
      </header>
      <p>{valuation.summary}</p>
      <div className="valuation-grid">
        <MetricCard label="价格分位" value={formatNullablePercent(valuation.pricePercentile)} />
        <MetricCard label="距低点" value={formatNullablePercent(valuation.distanceFromLow)} />
        <MetricCard label="距高点" value={formatNullablePercent(valuation.distanceFromHigh)} />
        <MetricCard label="Sharpe" value={formatNullableRatio(valuation.sharpeRatio)} />
        <MetricCard label="Sortino" value={formatNullableRatio(valuation.sortinoRatio)} />
        <MetricCard label="IR" value={formatNullableRatio(valuation.informationRatio)} />
        <MetricCard label="波动率" value={formatNullablePercent(valuation.volatility)} />
        <MetricCard label="最大回撤" value={formatNullablePercent(valuation.maxDrawdown)} />
      </div>
      <small>样本 {valuation.sampleSize} 点 · 回看 {Math.round(valuation.lookbackHours / 24)} 天</small>
    </section>
  )
}

function BacktestMonitorPanel(props: { monitor: BacktestMonitor | null }) {
  const monitor = props.monitor
  if (!monitor) {
    return null
  }
  const sampleStatus = buildBacktestSampleStatus(monitor)

  return (
    <section className="backtest-monitor-panel">
      <header>
        <strong>长期回测监控</strong>
        <span>{monitor.evaluatedSamples}/{monitor.allEvaluatedSamples ?? monitor.sampleSize}</span>
      </header>
      <p>{monitor.summary}</p>
      <div className={`sample-accumulation-panel sample-accumulation-panel--${sampleStatus.tone}`}>
        <strong>{sampleStatus.title}</strong>
        <span>{sampleStatus.detail}</span>
        <small>{sampleStatus.hint}</small>
      </div>
      <div className="valuation-grid">
        <MetricCard label="合格信号胜率" value={monitor.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor.winRate)} />
        <MetricCard label="基准胜率" value={monitor.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor.baselineWinRate ?? null)} />
        <MetricCard label="平均收益" value={monitor.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor.averageReturn)} />
        <MetricCard label="Profit Factor" value={monitor.metricsFrozen ? '样本冻结' : formatNullableRatio(monitor.profitFactor ?? null)} />
        <MetricCard label="可信度" value={monitor.metricsFrozen ? '--' : monitor.reliability === undefined ? '--' : `${monitor.reliability}/100`} />
        <MetricCard label="Sortino" value={formatNullableRatio(monitor.sortinoRatio)} />
        <MetricCard label="最大回撤" value={formatNullablePercent(monitor.maxDrawdown)} />
        <MetricCard label="失败样本" value={`${monitor.failureSamples.length}`} />
      </div>
      <BucketBacktestPanel buckets={monitor.buckets ?? []} compact />
      <ExternalModelBacktestPanel monitor={monitor.externalModel ?? null} compact />
      {monitor.failureSamples.length > 0 ? (
        <div className="failure-samples">
          {monitor.failureSamples.slice(0, 3).map((sample) => (
            <div className="failure-sample" key={`${sample.openedAt}-${sample.evaluatedAt}`}>
              <span>{formatDateTime(sample.openedAt)}</span>
              <strong>{formatNullablePercent(sample.returnPercent)}</strong>
              <small>回撤 {formatNullablePercent(sample.maxDrawdown)} · 分数 {sample.signalScore}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function buildBacktestSampleStatus(monitor: BacktestMonitor) {
  const minComplete = 30
  const complete = monitor.completeEvaluatedSamples ?? 0
  const all = monitor.allEvaluatedSamples ?? monitor.sampleSize
  const incompleteRate = monitor.incompleteSampleRate ?? null
  const missing = Math.max(0, minComplete - complete)
  if (!monitor.metricsFrozen) {
    return {
      tone: 'ready',
      title: '样本已启用',
      detail: `${monitor.horizonMinutes ?? 60} 分钟完整合格样本 ${complete}/${minComplete}，当前胜率/PF 已允许参与低权重校准。`,
      hint: `总快照 ${monitor.sampleSize}，可评估 ${monitor.evaluatedSamples}/${all}，未完成 ${formatNullablePercentUnsigned(incompleteRate)}。`,
    } as const
  }
  return {
    tone: 'warming',
    title: '样本正在积累',
    detail: `${monitor.horizonMinutes ?? 60} 分钟窗口还差 ${missing} 个完整合格样本才会解冻胜率/PF。系统已用历史行情冷启动，并会随实时刷新继续追加。`,
    hint: monitor.freezeReason ?? `总快照 ${monitor.sampleSize}，完整样本 ${complete}/${minComplete}，未完成 ${formatNullablePercentUnsigned(incompleteRate)}。`,
  } as const
}

function ExternalModelBacktestPanel(props: {
  compact?: boolean
  monitor: ExternalModelBacktestMonitor | null
}) {
  const monitor = props.monitor
  if (!monitor) {
    return null
  }
  const displayBuckets = [
    ...monitor.bestBuckets,
    ...monitor.buckets.filter((bucket) => {
      return bucket.dimension === 'model_probability' ||
        bucket.dimension === 'model_vs_local' ||
        bucket.dimension === 'event'
    }),
  ].filter((bucket, index, array) => {
    return array.findIndex((item) => item.key === bucket.key) === index
  }).slice(0, props.compact ? 3 : 8)

  return (
    <div className={props.compact ? 'external-model-backtest external-model-backtest--compact' : 'external-model-backtest'}>
      <header>
        <strong>外部模型分桶回测</strong>
        <span>live覆盖 {formatNullablePercent(monitor.liveCoverage)}</span>
      </header>
      <p>{monitor.summary}</p>
      <div className="bucket-backtest-grid">
        {displayBuckets.map((bucket) => (
          <article className={`bucket-card bucket-card--${bucket.reliability >= 55 ? 'good' : bucket.reliability < 45 ? 'weak' : 'watch'}`} key={bucket.key}>
            <div>
              <strong>{bucket.label}</strong>
              <span>{bucket.qualifiedSamples}/{bucket.sampleSize} 合格</span>
            </div>
            <div className="bucket-card__metrics">
              <small>{bucket.qualifiedSamples > 0 ? `胜率 ${formatNullablePercent(bucket.winRate)}` : '胜率 暂无 live 样本'}</small>
              <small>超额 {formatNullablePercent(bucket.excessWinRate)}</small>
              <small>PF {formatNullableRatio(bucket.profitFactor)}</small>
              <small>Brier {formatNullableRatio(bucket.brierScore)}</small>
              <small>MAE {formatNullablePercent(bucket.mae)}</small>
              <small>live覆盖 {formatNullablePercent(bucket.liveCoverage ?? null)}</small>
              <small>可信 {bucket.reliability}/100</small>
            </div>
            {!props.compact ? <p>{bucket.summary}</p> : null}
          </article>
        ))}
      </div>
      {monitor.weakBuckets.length > 0 ? (
        <p className="external-model-backtest__warning">
          弱桶提示：{monitor.weakBuckets.slice(0, 2).map((bucket) => bucket.label).join('、')} 历史表现不足，命中时模型自动降权。
        </p>
      ) : null}
    </div>
  )
}

function BucketBacktestPanel(props: { buckets: BacktestBucket[]; compact?: boolean }) {
  if (props.buckets.length < 1) {
    return null
  }

  return (
    <div className={props.compact ? 'bucket-backtest bucket-backtest--compact' : 'bucket-backtest'}>
      <header>
        <strong>同类情景分桶</strong>
        <span>按形态/周期/时段/宏观拆解</span>
      </header>
      <div className="bucket-backtest-grid">
        {props.buckets.slice(0, props.compact ? 3 : 8).map((bucket) => {
          const completeSamples = estimateCompleteSamples(bucket)
          const hasCompleteSamples = completeSamples > 0
          return (
            <article className="bucket-card" key={bucket.key}>
              <div>
                <strong>{bucket.label}</strong>
                <span>{bucket.qualifiedSamples}/{bucket.sampleSize} 合格</span>
              </div>
              <div className="bucket-card__metrics">
                <small>{hasCompleteSamples ? `胜率 ${formatNullablePercent(bucket.winRate)}` : '胜率 等待完整样本'}</small>
                <small>{hasCompleteSamples ? `基准 ${formatNullablePercent(bucket.baselineWinRate)}` : `完整样本 ${completeSamples}`}</small>
                <small>{hasCompleteSamples ? `PF ${formatNullableRatio(bucket.profitFactor)}` : `未完成 ${formatNullablePercentUnsigned(bucket.incompleteRate ?? null)}`}</small>
                <small>MAE {formatNullablePercent(bucket.mae)}</small>
                <small>MFE {formatNullablePercent(bucket.mfe)}</small>
                <small>可信 {bucket.reliability}/100</small>
              </div>
              {!props.compact ? <p>{bucket.summary}</p> : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function BacktestResearchPage(props: {
  monitor: BacktestMonitor | null
  signal: OpportunityInfo | null
}) {
  const monitor = props.monitor
  const failures = monitor?.failureSamples ?? []
  const score = props.signal?.score ?? null
  const reliabilityBars = buildReliabilityBars(monitor)
  const strategyVersion = [
    'M1 多源数据底座',
    'M2 宏观因子/6轴雷达',
    'M3 技术指标',
    'M4 量化估值/Walk-forward',
  ]

  return (
    <section className="backtest-page">
      <header className="backtest-hero">
        <div>
          <span>Professional Backtest Lab</span>
          <h2>专业回测与失败样本归因</h2>
          <p>{monitor?.summary ?? '等待回测快照积累后展示长期透明表现。'}</p>
        </div>
        <div className="backtest-score-card">
          <span>当前策略分</span>
          <strong>{formatScore(score)}</strong>
          <small>
            可靠性 {monitor?.metricsFrozen ? '--' : monitor?.reliability === undefined ? '--' : `${monitor.reliability}/100`}
            {' · '}
            {props.signal?.summary ?? '暂无当前信号'}
          </small>
        </div>
      </header>

      <div className="backtest-kpi-grid">
        <MetricCard label="合格/全部样本" value={monitor ? `${monitor.evaluatedSamples}/${monitor.allEvaluatedSamples ?? monitor.sampleSize}` : '--'} />
        <MetricCard label="合格信号胜率" value={monitor?.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor?.winRate ?? null)} />
        <MetricCard label="基准胜率" value={monitor?.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor?.baselineWinRate ?? null)} />
        <MetricCard label="平均收益" value={monitor?.metricsFrozen ? '样本冻结' : formatNullablePercent(monitor?.averageReturn ?? null)} />
        <MetricCard label="Profit Factor" value={monitor?.metricsFrozen ? '样本冻结' : formatNullableRatio(monitor?.profitFactor ?? null)} />
        <MetricCard label="可信度" value={monitor?.metricsFrozen ? '--' : monitor?.reliability === undefined ? '--' : `${monitor.reliability}/100`} />
        <MetricCard label="最大回撤" value={formatNullablePercent(monitor?.maxDrawdown ?? null)} />
      </div>

      <section className="reliability-curve-card">
        <header>
          <strong>可靠性曲线</strong>
          <span>总体 + 同类情景稳定性</span>
        </header>
        <div className="reliability-curve">
          {reliabilityBars.map((bar) => (
            <span
              className={`reliability-bar reliability-bar--${bar.tone}`}
              key={bar.label}
              style={{ height: `${Math.max(10, bar.value)}%` }}
              title={`${bar.label} · ${bar.value}/100`}
            >
              <i />
              <b>{bar.value}</b>
              <small>{bar.label}</small>
            </span>
          ))}
        </div>
        <p>
          曲线不展示收益承诺，而展示策略在总体样本与相似分桶里的稳定度；低可靠性分桶会降低强提醒权重。
        </p>
      </section>

      <section className="equity-curve-card">
        <header>
          <strong>失败/收益压力样本</strong>
          <span>用负样本检验过拟合</span>
        </header>
        <div className="equity-curve">
          {buildCurveBars(failures, monitor).map((bar, index) => (
            <span
              className={bar >= 0 ? 'is-positive' : 'is-negative'}
              key={`${bar}-${index}`}
              style={{ height: `${Math.max(8, Math.min(92, Math.abs(bar) * 3200 + 18))}%` }}
              title={formatNullablePercent(bar)}
            />
          ))}
        </div>
      </section>

      <section className="equity-curve-card">
        <header>
          <strong>同类情景分桶回测</strong>
          <span>按信号/分数/估值/时段/形态/宏观拆解</span>
        </header>
        <BucketBacktestPanel buckets={monitor?.buckets ?? []} />
      </section>

      <section className="equity-curve-card">
        <header>
          <strong>外部模型分桶回测</strong>
          <span>按模型概率/共振/事件/时段拆解</span>
        </header>
        <ExternalModelBacktestPanel monitor={monitor?.externalModel ?? null} />
      </section>

      <section className="backtest-grid">
        <article className="failure-table-card">
          <header>
            <strong>失败样本归因</strong>
            <span>{failures.length} 条 · 未完成 {formatNullablePercent(monitor?.incompleteSampleRate ?? null)}</span>
          </header>
          {monitor?.failureAttribution && monitor.failureAttribution.length > 0 ? (
            <div className="failure-attribution-strip">
              {monitor.failureAttribution.slice(0, 4).map((item) => (
                <small key={item.reason}>{item.label} {formatNullablePercent(item.ratio)}</small>
              ))}
            </div>
          ) : null}
          {failures.length > 0 ? (
            <div className="failure-table">
              {failures.map((sample) => (
                <div className="failure-table-row" key={`${sample.openedAt}-${sample.evaluatedAt}`}>
                  <span>{formatDateTime(sample.openedAt)}</span>
                  <strong>{formatNullablePercent(sample.returnPercent)}</strong>
                  <small>
                    {explainFailureSample(sample)}
                    {sample.failureReason ? ` · 归因 ${failureReasonText(sample.failureReason)}` : ''}
                    {' · '}
                    入场 {currencyFormatter.format(sample.entryPrice)} · 出场 {currencyFormatter.format(sample.exitPrice)}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p>暂无失败样本，继续积累快照后自动归因。</p>
          )}
        </article>

        <article className="strategy-version-card">
          <header>
            <strong>策略版本对比</strong>
            <span>当前组合</span>
          </header>
          {strategyVersion.map((item, index) => (
            <div className="strategy-version-row" key={item}>
              <span>v{index + 1}</span>
              <strong>{item}</strong>
              <small>{index < strategyVersion.length - 1 ? '已进入主评分' : '持续验证中'}</small>
            </div>
          ))}
        </article>
      </section>
    </section>
  )
}

function ProviderHealthPage(props: {
  health: ProviderHealthPayload | null
  isLoading: boolean
  onProbe: () => void
}) {
  const providers = props.health?.providers ?? []
  const history = props.health?.history ?? []
  const liveCount = providers.filter((provider) => provider.status === 'live').length
  const scoringCount = providers.filter((provider) => provider.participatesInScoring).length
  const stabilityBars = buildProviderStabilityBars(history)

  return (
    <section className="provider-health-page">
      <header className="backtest-hero provider-hero">
        <div>
          <span>Provider Connectivity Lab</span>
          <h2>生产数据源连通性探测</h2>
          <p>
            一键探测所有 provider 是否真实可用，并记录最近成功/失败、延迟、错误原因和是否参与本次评分。
          </p>
        </div>
        <div className="backtest-score-card">
          <span>可用源</span>
          <strong>{providers.length > 0 ? `${liveCount}/${providers.length}` : '--'}</strong>
          <small>参与评分源 {scoringCount} 个 · {props.health ? formatDateTime(props.health.updatedAt) : '尚未探测'}</small>
          <button className="probe-button" disabled={props.isLoading} onClick={props.onProbe} type="button">
            {props.isLoading ? '探测中...' : '重新探测全部源'}
          </button>
        </div>
      </header>

      <section className="provider-stability-card">
        <header>
          <strong>数据源稳定性曲线</strong>
          <span>最近 {history.length} 次探测</span>
        </header>
        <div className="provider-stability-bars">
          {stabilityBars.map((bar, index) => (
            <span
              className={bar.ratio >= 0.8 ? 'is-healthy' : bar.ratio >= 0.55 ? 'is-warning' : 'is-poor'}
              key={`${bar.updatedAt}-${index}`}
              style={{ height: `${Math.max(8, Math.round(bar.ratio * 100))}%` }}
              title={`${formatDateTime(bar.updatedAt)} · ${Math.round(bar.ratio * 100)}% 可用`}
            />
          ))}
        </div>
        <p>
          曲线越高代表本次探测中可用源比例越高；关键源失败时，买点强提醒会自动降级。
        </p>
      </section>

      <div className="provider-health-grid">
        {providers.length > 0 ? providers.map((provider) => (
          <article className={`provider-health-card provider-health-card--${provider.status}`} key={provider.id}>
            <header>
              <strong>{provider.label}</strong>
              <span>{provider.status === 'live' ? '可用' : '不可用'}</span>
            </header>
            <div className="provider-health-meta">
              <small>provider: {provider.provider}</small>
              <small>延迟: {provider.latencyMs === null ? '--' : `${provider.latencyMs}ms`}</small>
              <small>评分: {provider.participatesInScoring ? '参与' : '仅展示'}</small>
              <small>最近成功: {provider.lastSuccessAt ? formatDateTime(provider.lastSuccessAt) : '--'}</small>
              <small>最近失败: {provider.lastFailureAt ? formatDateTime(provider.lastFailureAt) : '--'}</small>
            </div>
            {provider.envVars.length > 0 ? (
              <p>配置入口：{provider.envVars.join(' / ')}</p>
            ) : (
              <p>配置入口：无需配置，使用内置公开源或默认 provider。</p>
            )}
            {provider.error ? <b>{provider.error}</b> : <b>探测通过，当前可作为真实输入参与多源策略。</b>}
          </article>
        )) : (
          <article className="provider-health-empty">
            <strong>尚未执行生产源探测</strong>
            <p>点击“重新探测全部源”后，会逐个请求 Yahoo、FRED、金投网、COT、GLD、WGC、CME、新闻 RSS 等源。</p>
          </article>
        )}
      </div>
    </section>
  )
}

function buildProviderStabilityBars(history: ProviderHealthSnapshot[]) {
  const snapshots = history.slice(-36)
  if (snapshots.length < 1) {
    return Array.from({ length: 18 }, (_, index) => ({
      updatedAt: `${index}`,
      ratio: 0,
    }))
  }
  return snapshots.map((snapshot) => {
    const scoring = snapshot.providers.filter((provider) => provider.participatesInScoring)
    const denominator = scoring.length || snapshot.providers.length || 1
    const live = (scoring.length > 0 ? scoring : snapshot.providers)
      .filter((provider) => provider.status === 'live').length
    return {
      updatedAt: snapshot.updatedAt,
      ratio: live / denominator,
    }
  })
}

function buildCurveBars(
  failures: WalkForwardSample[],
  monitor: BacktestMonitor | null,
) {
  if (!monitor || monitor.evaluatedSamples < 1) {
    return Array.from({ length: 18 }, () => 0)
  }
  const base = monitor.averageReturn ?? 0
  const negativeBars = failures.map((sample) => sample.returnPercent)
  const bars = Array.from({ length: Math.max(18, monitor.evaluatedSamples) }, (_, index) => {
    const failure = negativeBars[index % Math.max(negativeBars.length, 1)]
    return negativeBars.length > 0 && index % 5 === 0 ? failure : base
  })
  return bars.slice(-36)
}

function buildReliabilityBars(monitor: BacktestMonitor | null) {
  if (!monitor || monitor.metricsFrozen) {
    return Array.from({ length: 6 }, (_, index) => ({
      label: monitor?.metricsFrozen && index === 0 ? '样本冻结' : `等待${index + 1}`,
      value: 8,
      tone: 'empty' as const,
    }))
  }

  const bucketBars = (monitor.buckets ?? [])
    .slice()
    .sort((left, right) => right.qualifiedSamples - left.qualifiedSamples)
    .slice(0, 7)
    .map((bucket) => ({
      label: bucket.label,
      value: Math.round(clamp(bucket.reliability, 0, 100)),
      tone: reliabilityTone(bucket.reliability),
    }))

  return [
    {
      label: '总体',
      value: Math.round(clamp(monitor.reliability ?? 0, 0, 100)),
      tone: reliabilityTone(monitor.reliability ?? 0),
    },
    ...bucketBars,
  ]
}

function reliabilityTone(value: number) {
  if (value >= 72) {
    return 'strong' as const
  }
  if (value >= 52) {
    return 'watch' as const
  }
  return 'weak' as const
}

function explainFailureSample(sample: WalkForwardSample) {
  const drawdownText = `最大逆行 ${formatNullablePercent(sample.maxDrawdown)}`
  if (Math.abs(sample.maxDrawdown) > 0.012 && sample.returnPercent < 0) {
    return `${drawdownText}，说明信号后先承受较大回撤，需要更严格等待确认`
  }
  if (sample.signalLevel === 'strong' && sample.returnPercent < 0) {
    return `${drawdownText}，强信号失败样本，优先检查事件风险和止损边界`
  }
  return `${drawdownText}，作为同类情景下的压力样本复核`
}

function failureReasonText(reason: string) {
  const labels: Record<string, string> = {
    sampling_incomplete: '采样不完整',
    stop_loss_first: '止损先达',
    event_noise: '事件噪声',
    pattern_unconfirmed: '形态未确认',
    macro_pressure: '宏观反向',
    timeframe_conflict: '周期冲突',
    source_health: '数据源异常',
    timeout_or_no_touch: '超时/未触发',
    adverse_excursion: '最大不利波动',
  }
  return labels[reason] ?? reason
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function ExpertCouncil(props: {
  consensus: ExpertConsensus | null
  marketContext: MarketContext | null
  opinions: ExpertOpinion[]
}) {
  if (!props.consensus && !props.marketContext && props.opinions.length < 1) {
    return null
  }

  return (
    <section className="expert-council">
      <header>
        <UsersRound size={15} />
        <strong>量化专家建议团</strong>
      </header>
      {props.consensus ? (
        <div className={`expert-consensus expert-consensus--${props.consensus.action}`}>
          <span>{getExpertActionLabel(props.consensus.action)}</span>
          <strong>{props.consensus.confidence}/100</strong>
          <p>{props.consensus.summary}</p>
        </div>
      ) : null}
      {props.marketContext ? <MarketContextRadar context={props.marketContext} /> : null}
      <div className="expert-list">
        {props.opinions.map((item) => (
          <article className={`expert-card expert-card--${item.stance}`} key={item.id}>
            <div className="expert-card__head">
              <div>
                <strong>{item.name}</strong>
                <span>{item.role}</span>
              </div>
              <em>{getExpertActionLabel(item.action)}</em>
            </div>
            <p>{item.headline}</p>
            <div className="expert-confidence">
              <span style={{ width: `${Math.max(4, Math.min(item.confidence, 100))}%` }} />
            </div>
            <small>置信度 {item.confidence}/100</small>
            <ul>
              {item.rationale.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="expert-tags">
              {item.methodTags.slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <b>{item.risk}</b>
          </article>
        ))}
      </div>
    </section>
  )
}

function MarketContextRadar(props: { context: MarketContext }) {
  const baseFactors = [
    props.context.factors.spotGoldUsd,
    props.context.factors.dollarIndex,
    props.context.factors.usdCny,
  ]
  const macroFactors = props.context.macroFactors ?? []
  const factorGroups = groupMarketFactors(baseFactors, macroFactors)

  return (
    <section className="market-radar">
      <div className="market-radar__summary">
        <span>多源策略雷达</span>
        <strong>{props.context.factorScore}/100</strong>
        <p>{props.context.summary}</p>
      </div>
      {props.context.macroRegimeEvidence ? (
        <MacroRegimeEvidencePanel evidence={props.context.macroRegimeEvidence} />
      ) : null}
      <SourceAuditPanel
        factors={[...baseFactors, ...macroFactors]}
        sentiment={props.context.sentiment}
        macroRegimeEvidence={props.context.macroRegimeEvidence ?? null}
      />
      <div className="market-factor-groups">
        {factorGroups.map((group) => (
          <div className="market-factor-group" key={group.title}>
            <strong>{group.title}</strong>
            <div className="market-factor-grid">
              {group.factors.map((factor) => (
                <div className={`market-factor market-factor--${factor.impact}`} key={factor.id}>
                  <span>{factor.label}</span>
                  <em className={`impact-badge impact-badge--${factor.impact}`}>
                    {getImpactLabel(factor.impact)}
                  </em>
                  <strong>{formatMarketFactorValue(factor)}</strong>
                  <small>
                    {formatMarketFactorChange(factor)} · {getSourceUsageLabel(factor.sourceUsage ?? sourceUsageFromStatus(factor.status))}
                  </small>
                  <details className="factor-explainer">
                    <summary>看懂这个指标</summary>
                    <p>{factor.summary}</p>
                    <ul>
                      {getFactorEducation(factor).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="market-factor-group">
        <strong>新闻资讯 / 市场观点</strong>
        <div className="market-factor-grid">
          <SentimentFactorCard factor={props.context.sentiment.news} />
          <SentimentFactorCard factor={props.context.sentiment.blogger} />
        </div>
      </div>
      <div className="market-factor-grid">
        <div className="market-factor market-factor--derived">
          <span>本地回测</span>
          <em className="impact-badge impact-badge--neutral">回测</em>
          <strong>{props.context.backtest.sampleSize}点</strong>
          <small>{getMarketStatusLabel(props.context.backtest.status)}</small>
        </div>
      </div>
    </section>
  )
}

function MacroRegimeEvidencePanel(props: { evidence: MacroRegimeEvidence }) {
  const evidence = props.evidence
  const reasons = [
    ...evidence.opposingReasons.slice(0, 3),
    ...evidence.supportingReasons.slice(0, Math.max(0, 3 - evidence.opposingReasons.length)),
  ]
  return (
    <section className={`macro-regime-evidence macro-regime-evidence--${evidence.status}`}>
      <header>
        <div>
          <span>宏观 Regime 证据</span>
          <strong>{getMacroRegimeStatusLabel(evidence.status)}</strong>
        </div>
        <em className={`source-usage-badge source-usage-badge--${evidence.sourceUsage}`}>
          {getSourceUsageLabel(evidence.sourceUsage)}
        </em>
      </header>
      <p>{evidence.sourceSummary}</p>
      <div className="macro-regime-evidence__facts">
        <span>影响 {evidence.scoreImpact > 0 ? `+${evidence.scoreImpact}` : evidence.scoreImpact}</span>
        <span>置信 {evidence.confidence}/100</span>
        <span>实际利率 {getRealRateTrendLabel(evidence.realRateTrend)}</span>
        <span>通胀 {getInflationPhaseLabel(evidence.inflationPhase)}</span>
        <span>汇率 {getUsdCnyAlignmentLabel(evidence.usdCnyAlignment)}</span>
        <span>CME {getCmeQualityLabel(evidence.cmeBreakoutQuality)}</span>
      </div>
      {reasons.length > 0 ? (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <small>{evidence.stalenessWarning}</small>
    </section>
  )
}

function SentimentFactorCard(props: { factor: SentimentFactor }) {
  const impact = props.factor.score >= 58
    ? 'supportive'
    : props.factor.score <= 42
      ? 'pressure'
      : props.factor.status === 'unavailable'
        ? 'unknown'
        : 'neutral'

  return (
    <div className={`market-factor market-factor--${impact}`}>
      <span>{props.factor.label}</span>
      <em className={`impact-badge impact-badge--${impact}`}>{getImpactLabel(impact)}</em>
      <strong>{props.factor.score}/100</strong>
      <small>{getMarketStatusLabel(props.factor.status)} · 置信度 {props.factor.confidence}/100</small>
      <details className="factor-explainer">
        <summary>最新资讯/观点</summary>
        <p>{props.factor.summary}</p>
        {props.factor.sources.length > 0 ? (
          <ul>
            {props.factor.sources.slice(0, 5).map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        ) : (
          <p>暂无可展示标题，生产环境可配置 RSS 源。</p>
        )}
      </details>
    </div>
  )
}

function SourceAuditPanel(props: {
  factors: MarketFactor[]
  sentiment: MarketContext['sentiment']
  macroRegimeEvidence?: MacroRegimeEvidence | null
}) {
  const live = props.factors.filter((factor) => factor.status === 'live').length
  const derived = props.factors.filter((factor) => factor.status === 'derived').length
  const unavailable = props.factors.filter((factor) => factor.status === 'unavailable')
  const mirror = props.factors.filter((factor) => factor.sourceUsage === 'mirror_learning').length +
    (props.macroRegimeEvidence?.sourceUsage === 'mirror_learning' ? 1 : 0)
  const disabled = props.factors.filter((factor) => factor.sourceUsage === 'production_disabled').length +
    (props.macroRegimeEvidence?.sourceUsage === 'production_disabled' ? 1 : 0)
  const configuredRatio = props.factors.length > 0
    ? Math.round(((live + derived) / props.factors.length) * 100)
    : 0

  return (
    <section className="source-audit-panel">
      <header>
        <strong>数据源真实性审计</strong>
        <span>{configuredRatio}% 可参考</span>
      </header>
      <div className="source-audit-grid">
        <MetricCard label="实时源" value={`${live}`} />
        <MetricCard label="派生/回测" value={`${derived}`} />
        <MetricCard label="离线校准" value={`${mirror}`} />
        <MetricCard label="生产禁用/不可用" value={`${disabled + unavailable.length}`} />
        <MetricCard
          label="情绪源"
          value={`${getMarketStatusLabel(props.sentiment.news.status)} / ${getMarketStatusLabel(props.sentiment.blogger.status)}`}
        />
      </div>
      {unavailable.length > 0 ? (
        <p>
          未配置源：{unavailable.slice(0, 5).map((factor) => factor.label).join('、')}
          {unavailable.length > 5 ? ` 等 ${unavailable.length} 项` : ''}。这些不会放大强买点，只按中性或降权处理。
        </p>
      ) : (
        <p>当前核心因子已有实时或派生值，只能作为宏观背景观察依据；实时买卖仍需价格、回测、事件风险和硬门槛共同确认。</p>
      )}
      <details className="pending-source-list">
        <summary>逐个接入状态与配置入口</summary>
        <div>
          {props.factors
            .filter((factor) => factor.status === 'unavailable')
            .map((factor) => {
              const metadata = getSourceMetadata(factor.id)
              return (
                <article className="pending-source-item" key={factor.id}>
                  <strong>{factor.label}</strong>
                  <span>{metadata.status}</span>
                  <p>{metadata.reason}</p>
                  <small>配置：{metadata.envVars.join(' / ') || '无需配置'} · 评分：{metadata.scoring}</small>
                </article>
              )
            })}
          {props.factors.every((factor) => factor.status !== 'unavailable') ? (
            <article className="pending-source-item">
              <strong>全部核心源已可参考</strong>
              <span>已纳入</span>
              <p>实时源和派生源都会进入多源评分、规则雷达和专家建议。</p>
              <small>仍建议保持生产环境源健康监控。</small>
            </article>
          ) : null}
        </div>
      </details>
    </section>
  )
}

function getSourceMetadata(id: string) {
  const metadata: Record<string, {
    envVars: string[]
    status: string
    reason: string
    scoring: string
  }> = {
    LBMA_GOLD_PM: {
      envVars: ['LBMA_GOLD_PM_CSV_URL'],
      status: '需官方/授权 CSV',
      reason: 'LBMA 定盘属于全球基准价，公开页面指向 IBA/数据供应商，默认不伪造价格；配置后用于校验国际金基准。',
      scoring: '已占位，配置成功后进入贵金属相对强弱和规则雷达。',
    },
    CME_GOLD_OI: {
      envVars: ['CME_GOLD_OI_CSV_URL'],
      status: '需 CME/授权 OI 源',
      reason: '未平仓合约通常来自 CME 日报或授权 API，默认不开启不稳定抓取；配置后用于判断杠杆资金参与度。',
      scoring: '已占位，配置成功后进入资金流和规则雷达。',
    },
    GLD_FLOW: {
      envVars: ['GLD_HOLDINGS_CSV_URL', 'GLD_HOLDINGS_URL'],
      status: '可配置官方源',
      reason: 'GLD 持仓用于观察 ETF 实物持仓变化；若官网 HTML 结构变化，需要配置稳定 CSV 镜像。',
      scoring: '成功后进入资金流、6 轴雷达和专家建议。',
    },
    WGC_ETF_FLOW: {
      envVars: ['WGC_GOLD_ETF_FLOW_CSV_URL', 'WGC_GOLD_ETF_FLOW_API_URL'],
      status: '默认尝试 WGC 公开 API',
      reason: 'WGC ETF flow 代表全球 ETF 资金方向，默认读取 gold.org 图表 API；失败时可配置 CSV/API URL。',
      scoring: '成功后进入资金流、规则雷达和专家建议。',
    },
    CENTRAL_BANK_GOLD: {
      envVars: ['CENTRAL_BANK_GOLD_CSV_URL', 'CENTRAL_BANK_GOLD_PAGE_URL'],
      status: '默认尝试 WGC 央行页面',
      reason: '央行购金是中长期支撑因子，默认解析 WGC 央行购金页面；生产建议配置稳定 CSV。',
      scoring: '成功后进入长期资金锚和规则雷达。',
    },
    CME_GOLD_VOLUME: {
      envVars: ['CME_GOLD_VOLUME_CSV_URL'],
      status: '默认 Yahoo GC=F 成交量代理',
      reason: 'CME 成交量用于短线活跃度判断；未配置官方 CSV 时用 GC=F 日成交量代理。',
      scoring: '成功后进入短线资金活跃度和规则雷达。',
    },
    COT_GOLD_NET: {
      envVars: ['COT_GOLD_NET_URL'],
      status: '默认尝试公开 CFTC 镜像',
      reason: 'COT 代表投机资金持仓，默认尝试公开 CSV 镜像；生产建议配置稳定 CFTC/Quandl/Nasdaq 源。',
      scoring: '成功后进入资金流、规则雷达和专家建议。',
    },
  }

  return metadata[id] ?? {
    envVars: [],
    status: '默认源异常或网络不可达',
    reason: '该因子已有 provider 或派生逻辑，但本次刷新未拿到有效数据。',
    scoring: '暂按中性/降权处理，恢复后自动参与综合评分。',
  }
}

function groupMarketFactors(baseFactors: MarketFactor[], macroFactors: MarketFactor[]) {
  const allFactors = [...baseFactors, ...macroFactors]
  const pick = (ids: string[]) => ids
    .map((id) => allFactors.find((factor) => factor.id === id))
    .filter((factor): factor is MarketFactor => Boolean(factor))

  return [
    { title: '利率', factors: pick(['DFII10', 'DFF', 'DGS10', 'T10Y2Y']) },
    { title: '通胀', factors: pick(['T10YIE']) },
    { title: '避险', factors: pick(['VIXCLS', 'GC=F', 'DX-Y.NYB', 'USDCNY=X']) },
    { title: '贵金属相对强弱', factors: pick(['LBMA_GOLD_PM', 'JO_9753', 'JO_92233', 'JO_92232', 'GOLD_SILVER_RATIO']) },
    { title: '资金流', factors: pick(['COT_GOLD_NET', 'GLD_FLOW', 'WGC_ETF_FLOW', 'CENTRAL_BANK_GOLD', 'CME_GOLD_OI', 'CME_GOLD_VOLUME']) },
    { title: '规则雷达', factors: pick(['GOLD_18_RULE_SCORE', 'SIX_AXIS_RADAR']) },
  ].filter((group) => group.factors.length > 0)
}

function SignalList(props: { title: string; items: string[]; emptyText: string }) {
  return (
    <section className="signal-list">
      <strong>{props.title}</strong>
      {props.items.length > 0 ? (
        <ul>
          {props.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{props.emptyText}</p>
      )}
    </section>
  )
}

function getExpertActionLabel(action: ExpertAction) {
  const labels: Record<ExpertAction, string> = {
    accumulate: '分批低吸',
    watch: '重点观察',
    wait: '等待确认',
    avoid: '暂避风险',
  }

  return labels[action]
}

function getImpactLabel(impact: MarketFactorImpact) {
  const labels: Record<MarketFactorImpact, string> = {
    supportive: '利好黄金',
    pressure: '利空黄金',
    neutral: '中性',
    unknown: '未知',
  }

  return labels[impact]
}

function formatMarketFactorValue(factor: MarketFactor) {
  if (factor.value === null) {
    return '--'
  }

  const value = factor.unit === 'CNY'
    ? factor.value.toFixed(4)
    : factor.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return `${value}${factor.unit === '点' ? '' : ` ${factor.unit}`}`
}

function formatMarketFactorChange(factor: MarketFactor) {
  if (factor.changePercent === null) {
    return getMarketStatusLabel(factor.status)
  }
  return formatSignedPercent(factor.changePercent)
}

function getMarketStatusLabel(status: MarketFactorStatus) {
  const labels: Record<MarketFactorStatus, string> = {
    live: '实时',
    derived: '本地推演',
    unavailable: '未配置/不可用',
  }

  return labels[status]
}

function sourceUsageFromStatus(status: MarketFactorStatus): MarketFactorSourceUsage {
  if (status === 'live') {
    return 'production_realtime'
  }
  if (status === 'derived') {
    return 'derived'
  }
  return 'unknown'
}

function getSourceUsageLabel(sourceUsage: MarketFactorSourceUsage) {
  const labels: Record<MarketFactorSourceUsage, string> = {
    production_realtime: '实时生产源',
    mirror_learning: '离线校准参考',
    production_disabled: '生产禁用',
    derived: '本地推演',
    unknown: '来源待确认',
  }
  return labels[sourceUsage]
}

function getMacroRegimeStatusLabel(status: MacroRegimeStatus) {
  const labels: Record<MacroRegimeStatus, string> = {
    supportive: '中期背景支持',
    neutral: '宏观中性',
    pressure: '买点降级',
    conflicted: '方向冲突',
    unknown: '证据不足',
  }
  return labels[status]
}

function getInflationPhaseLabel(phase: MacroRegimeEvidence['inflationPhase']) {
  const labels: Record<MacroRegimeEvidence['inflationPhase'], string> = {
    accelerating: '再加速',
    sticky: '粘性',
    cooling: '降温',
    unknown: '未知',
  }
  return labels[phase]
}

function getRealRateTrendLabel(trend: MacroRegimeEvidence['realRateTrend']) {
  const labels: Record<MacroRegimeEvidence['realRateTrend'], string> = {
    rising: '上行',
    falling: '回落',
    flat: '横盘',
    unknown: '未知',
  }
  return labels[trend]
}

function getUsdCnyAlignmentLabel(alignment: MacroRegimeEvidence['usdCnyAlignment']) {
  const labels: Record<MacroRegimeEvidence['usdCnyAlignment'], string> = {
    cny_gold_support: '支撑人民币金',
    cny_gold_pressure: '压制人民币金',
    neutral: '中性',
    unknown: '未知',
  }
  return labels[alignment]
}

function getCmeQualityLabel(quality: MacroRegimeEvidence['cmeBreakoutQuality']) {
  const labels: Record<MacroRegimeEvidence['cmeBreakoutQuality'], string> = {
    confirmed: '确认',
    not_confirmed: '未确认',
    unavailable: '不可用',
    unknown: '未知',
  }
  return labels[quality]
}

function getFactorEducation(factor: MarketFactor) {
  const education: Record<string, string[]> = {
    DFII10: [
      '它是什么：美国 10 年 TIPS 实际利率，近似“扣掉通胀后的无风险收益”。',
      '一般关系：实际利率越高，持有黄金的机会成本越高，通常压制黄金；实际利率回落通常利好黄金。',
      '怎么用：如果它高位上行，买点要打折；如果回落且美元不强，黄金中期更容易走强。',
    ],
    DGS10: [
      '它是什么：美国 10 年国债名义收益率，代表长期资金价格和贴现率。',
      '一般关系：收益率大幅上行会压制无息资产黄金；收益率回落通常支持黄金估值。',
      '怎么用：收益率上行时不要只因金价下跌就抄底，要等趋势/美元确认。',
    ],
    DFF: [
      '它是什么：联邦基金利率，反映美联储政策利率环境。',
      '一般关系：高利率阶段黄金机会成本高；降息预期增强时黄金更容易受资金青睐。',
      '怎么用：若利率高且无降息迹象，强买点需要更多技术面和资金流确认。',
    ],
    T10YIE: [
      '它是什么：10 年通胀预期，代表市场对未来通胀的定价。',
      '一般关系：通胀预期上行会增强黄金抗通胀配置需求；快速回落会削弱黄金溢价。',
      '怎么用：通胀预期上行但实际利率不升，是黄金较友好的组合。',
    ],
    T10Y2Y: [
      '它是什么：10 年和 2 年美债收益率差，常用来观察经济周期压力。',
      '一般关系：深度倒挂常提示衰退/避险线索；曲线陡峭时避险属性可能下降。',
      '怎么用：倒挂叠加 VIX 上升时，黄金避险配置价值更强。',
    ],
    VIXCLS: [
      '它是什么：VIX 恐慌指数，反映美股期权市场对波动的预期。',
      '一般关系：VIX 高说明避险情绪强，黄金可能受益；VIX 很低说明避险需求弱。',
      '怎么用：VIX 升温时，黄金下跌后的买点更值得观察，但也要防流动性冲击。',
    ],
    'DX-Y.NYB': [
      '它是什么：美元指数，反映美元相对一篮子货币强弱。',
      '一般关系：美元走强通常压制国际金价；美元走弱通常利好黄金。',
      '怎么用：如果金价低位但美元强势上行，买点要谨慎；美元转弱是加分项。',
    ],
    'USDCNY=X': [
      '它是什么：美元/人民币汇率，影响人民币计价黄金。',
      '一般关系：USDCNY 上行代表人民币走弱，人民币金价会有汇率支撑；下行则可能压制人民币金价。',
      '怎么用：国际金不涨但人民币走弱时，国内金价也可能坚挺。',
    ],
    'GC=F': [
      '它是什么：COMEX 黄金期货，代表国际金价主趋势参考。',
      '一般关系：国际金走强通常支撑国内金价；国际金走弱时国内买点要等止跌。',
      '怎么用：国内价格低位但国际金仍下跌，先观察，不急于加仓。',
    ],
    LBMA_GOLD_PM: [
      '它是什么：LBMA 伦敦金 PM 定盘价，是全球黄金基准定价之一。',
      '一般关系：定盘价上行确认国际现货基准走强；下行说明全球基准价格承压。',
      '怎么用：它可帮助确认 Yahoo/期货源是否和现货基准一致。',
    ],
    JO_9753: [
      '它是什么：金投网国内黄金行情，作为国内贵金属备用参考。',
      '一般关系：国内金价同步走强说明本地市场确认；走弱说明短线承压。',
      '怎么用：和工行价格、上金所锚点一起看，可判断报价是否偏离。',
    ],
    JO_92233: [
      '它是什么：金投网国际黄金行情，作为国际金备用源。',
      '一般关系：国际金走强支撑国内黄金，国际金下跌会拖累买点质量。',
      '怎么用：当 Yahoo 不可用时，它可作为国际金方向备份。',
    ],
    JO_92232: [
      '它是什么：国际白银行情，帮助判断贵金属板块整体风险偏好。',
      '一般关系：金银同步走强说明板块资金更一致；白银弱可能说明风险偏好不足。',
      '怎么用：黄金买点若没有白银确认，信号要保守一点。',
    ],
    GOLD_SILVER_RATIO: [
      '它是什么：金银比，等于金价/银价，衡量黄金相对白银的防御属性。',
      '一般关系：金银比高说明市场更偏避险；金银比低说明资金更偏风险和工业属性。',
      '怎么用：高金银比叠加 VIX 上升时，黄金防御配置逻辑更强。',
    ],
    COT_GOLD_NET: [
      '它是什么：CFTC 黄金非商业净多头，代表投机资金在期货市场的方向。',
      '一般关系：净多增加说明趋势资金偏多；净多很低或下降说明资金信心不足。',
      '怎么用：净多过高也可能拥挤，最好结合价格回撤和成交量判断。',
    ],
    GLD_FLOW: [
      '它是什么：GLD ETF 持仓吨数变化，反映海外黄金 ETF 实物持仓方向。',
      '一般关系：持仓增加代表资金流入黄金 ETF；持仓下降代表资金流出。',
      '怎么用：持仓增加叠加价格回撤，是“有人接”的加分信号。',
    ],
    WGC_ETF_FLOW: [
      '它是什么：World Gold Council 统计的全球黄金 ETF 资金流。',
      '一般关系：全球 ETF 净流入通常利好黄金中期需求；净流出说明配置需求弱。',
      '怎么用：它比单一 GLD 更宽，可观察全球资金是否一致。',
    ],
    CENTRAL_BANK_GOLD: [
      '它是什么：全球央行净购金，代表官方部门的中长期配置需求。',
      '一般关系：央行持续购金是黄金长期支撑；净售金会削弱中长期逻辑。',
      '怎么用：这是长期因子，不适合判断几分钟买卖点，但会影响底层信心。',
    ],
    CME_GOLD_OI: [
      '它是什么：CME 黄金未平仓合约，代表杠杆资金参与度。',
      '一般关系：未平仓增加说明资金参与提升；下降说明资金撤出或观望。',
      '怎么用：价格上涨且 OI 增加更可信；价格上涨但 OI 下降要防假突破。',
    ],
    CME_GOLD_VOLUME: [
      '它是什么：CME 黄金成交量，代表短线交易活跃度。',
      '一般关系：放量上涨更强，放量下跌风险更大；缩量说明信号确认不足。',
      '怎么用：买点最好看到下跌缩量或反弹放量，而不是盲目接飞刀。',
    ],
    GOLD_18_RULE_SCORE: [
      '它是什么：把利率、美元、通胀、资金流、技术面、回测等规则合成的多空规则分。',
      '一般关系：偏多规则越多，黄金观察价值越高；偏空规则越多，买点要降级。',
      '怎么用：它是综合体检表，不是单独买入按钮，要和价格水位/风控一起看。',
    ],
    SIX_AXIS_RADAR: [
      '它是什么：利率、通胀、避险、美元汇率、资金流、回测六个维度的雷达分。',
      '一般关系：分数高说明多维度共振偏多；分数低说明压力源更多。',
      '怎么用：强买点最好看到雷达分不低、估值水位低、技术面止跌三者同时出现。',
    ],
  }

  return education[factor.id] ?? [
    `它是什么：${factor.label} 是当前多源策略里的一个观察因子。`,
    '一般关系：系统会把它转换成支撑/中性/压力三类影响，并参与综合评分。',
    '怎么用：不要单看一个指标，需结合价格水位、技术面、资金流和回测结果。',
  ]
}

function Ticker(props: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className={`ticker ${props.tone ? `ticker--${props.tone}` : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function Panel(props: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="panel">
      <header>
        {props.icon}
        <strong>{props.title}</strong>
      </header>
      {props.children}
    </article>
  )
}

function StatLine(props: {
  label: string
  value: string
  tone?: 'up' | 'down' | 'flat'
}) {
  return (
    <div className="stat-line">
      <span>{props.label}</span>
      <strong className={props.tone ?? ''}>{props.value}</strong>
    </div>
  )
}

function buildQuoteBoardRows(quote: QuotePayload | null): QuoteBoardEntry[] {
  if (!quote) {
    return []
  }

  const rows: QuoteBoardEntry[] = []
  const push = (entry: QuoteBoardEntry) => {
    if (Number.isFinite(entry.price) && entry.price > 0) {
      rows.push(entry)
    }
  }

  if (quote.marketReference.consensusPrice) {
    push({
      id: 'consensus',
      tab: 'consensus',
      label: '多源校准价',
      symbol: 'ICBC + AU9999 + 银行参考',
      price: quote.marketReference.consensusPrice,
      high: null,
      low: null,
      open: null,
      previousClose: null,
      unit: '元/克',
      updatedAt: quote.fetchedAt ?? quote.updatedAt,
      source: 'median-consensus',
      confidence: '校准',
      note: '采用工银字段、上金所 AU9999/Au(T+D)、国内黄金与银行参考价的中位数，优先用于发现单源偏离。',
    })
  }

  push({
    id: 'icbc-active',
    tab: 'icbc',
    label: '工银主动价',
    symbol: quote.productCode || 'ICBC_ACCUMULATION_GOLD',
    price: quote.activePrice ?? quote.price,
    high: quote.dayRange.high,
    low: quote.dayRange.low,
    open: null,
    previousClose: quote.regularPrice ?? null,
    unit: '元/克',
    updatedAt: quote.updatedAt,
    source: quote.sourceName,
    confidence: quote.sourceKind === 'official' ? '官方' : '参考',
    note: '工银异步行情返回的 ActivePrice，可能与 App 展示口径或参考价存在差异。',
  })
  push({
    id: 'icbc-regular',
    tab: 'icbc',
    label: '工银参考价',
    symbol: quote.productCode || 'ICBC_ACCUMULATION_GOLD',
    price: quote.regularPrice,
    high: null,
    low: null,
    open: null,
    previousClose: null,
    unit: '元/克',
    updatedAt: quote.updatedAt,
    source: quote.sourceName,
    confidence: quote.sourceKind === 'official' ? '官方' : '参考',
    note: '工银异步行情返回的 RegPrice。若与主动价差异大，应以 App 实际交易页复核。',
  })
  push({
    id: 'icbc-sell',
    tab: 'icbc',
    label: '工银赎回价',
    symbol: quote.productCode || 'ICBC_ACCUMULATION_GOLD',
    price: quote.sellPrice,
    high: null,
    low: null,
    open: null,
    previousClose: null,
    unit: '元/克',
    updatedAt: quote.updatedAt,
    source: quote.sourceName,
    confidence: quote.sourceKind === 'official' ? '官方' : '参考',
    note: '工银异步行情返回的 SellPrice，用于辅助区分买入/赎回口径。',
  })

  for (const item of [quote.marketReference.au9999, quote.marketReference.autd]) {
    if (!item) {
      continue
    }
    push(referenceToBoardEntry(item, 'sge', '核心锚', quote.marketReference.sourceName, quote.marketReference.tradingDate))
  }
  for (const item of quote.marketReference.domesticReferences ?? []) {
    push(referenceToBoardEntry(item, 'banks', '参考', item.provider ?? '国内黄金参考', item.updatedAt ?? null))
  }

  return rows
}

function referenceToBoardEntry(
  item: ReferenceQuote,
  tab: QuoteBoardTab,
  confidence: QuoteBoardEntry['confidence'],
  source: string,
  updatedAt: string | null,
): QuoteBoardEntry {
  return {
    id: `${tab}-${item.symbol}`,
    tab,
    label: item.label ?? item.symbol,
    symbol: item.symbol,
    price: item.latestPrice,
    high: item.highPrice,
    low: item.lowPrice,
    open: item.openPrice,
    previousClose: item.openPrice,
    unit: item.unit ?? '元/克',
    updatedAt,
    source,
    confidence,
    note: item.note ?? `${item.label ?? item.symbol} 作为多源行情校准参考。`,
  }
}

function selectMainDisplayQuote(
  quote: QuotePayload | null,
  rows: QuoteBoardEntry[],
): QuoteBoardEntry | null {
  if (!quote) {
    return null
  }

  const consensus = rows.find((item) => item.id === 'consensus')
  const raw = rows.find((item) => item.id === 'icbc-active')
  if (!consensus) {
    return raw ?? null
  }

  const deviation = quote.marketReference.consensusDeviationPercent
  if (deviation === null || deviation === undefined || Math.abs(deviation) >= 0.0015) {
    return consensus
  }
  return raw ?? consensus
}

function getBoardEntryChange(entry: QuoteBoardEntry) {
  if (entry.previousClose && entry.previousClose > 0) {
    return (entry.price - entry.previousClose) / entry.previousClose
  }
  return 0
}

function buildDisplayAnchor(quote: QuotePayload | null): DisplayAnchor {
  if (!quote) {
    return {
      label: '参考',
      price: null,
      spread: null,
      premiumPercent: null,
      withinRange: null,
      note: '等待行情快照。',
    }
  }

  const calibration = quote.marketReference.calibration
  if (calibration.anchorPrice !== null) {
    return {
      label: calibration.anchorSymbol ?? '上金所锚点',
      price: calibration.anchorPrice,
      spread: calibration.spread,
      premiumPercent: calibration.premiumPercent,
      withinRange: calibration.withinReferenceRange,
      note: calibration.note,
    }
  }

  const dayLow = quote.dayRange.low
  const dayHigh = quote.dayRange.high
  if (
    Number.isFinite(dayLow) &&
    Number.isFinite(dayHigh) &&
    dayLow > 0 &&
    dayHigh >= dayLow
  ) {
    const midpoint = (dayLow + dayHigh) / 2
    const spread = quote.price - midpoint
    return {
      label: '工行日内中枢',
      price: midpoint,
      spread,
      premiumPercent: midpoint > 0 ? spread / midpoint : null,
      withinRange: quote.price >= dayLow && quote.price <= dayHigh,
      note: '上金所锚点暂不可用，临时以工行日内高低中枢辅助读盘。',
    }
  }

  return {
    label: '参考',
    price: null,
    spread: null,
    premiumPercent: null,
    withinRange: null,
    note: '参考锚暂不可用。',
  }
}

function buildDataStatus(
  quote: QuotePayload | null,
  error: string | null,
  lastAttemptText: string,
): DataStatus | null {
  if (error) {
    const fallbackText = quote ? '当前仍展示最近一次成功行情' : '暂无可展示行情'
    return {
      tone: 'error',
      message: `数据刷新失败：${error}`,
      detail: `${fallbackText}，最近尝试 ${lastAttemptText}`,
    }
  }

  if (!quote) {
    return null
  }

  const criticalAnomaly = quote.quality?.anomalies.find((item) => item.severity === 'critical')
  if (criticalAnomaly) {
    return {
      tone: 'error',
      message: `行情质量异常：${criticalAnomaly.message}`,
      detail: `质量 ${quote.quality?.score ?? '--'}/100`,
    }
  }

  if (quote.quality?.level === 'poor' || quote.quality?.level === 'degraded') {
    return {
      tone: 'warning',
      message: quote.quality.summary,
      detail: `质量 ${quote.quality.score}/100`,
    }
  }

  if (quote.sourceStatus.active === 'fallback') {
    return {
      tone: 'warning',
      message: '工银官方异步行情暂不可用，已切换到公开页备用数据。',
      detail: `最近尝试 ${lastAttemptText}`,
    }
  }

  if (quote.sourceStatus.stale) {
    return {
      tone: 'warning',
      message: '当前行情刷新略有延迟，请谨慎参考短线信号。',
      detail: `最近尝试 ${lastAttemptText}`,
    }
  }

  return null
}

function getQualityTone(level: DataQualityInfo['level'] | undefined) {
  if (level === 'excellent' || level === 'good') {
    return 'up'
  }
  if (level === 'degraded' || level === 'poor') {
    return 'down'
  }
  return 'flat'
}

function ChartRangeScrubber(props: {
  info: ChartScrubberInfo
  onChange: (range: ChartVisibleRange) => void
  embedded?: boolean
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragModeRef = useRef<'start' | 'end' | 'window' | null>(null)
  const dragStartRef = useRef<{
    pointerPercent: number
    startPercent: number
    endPercent: number
  } | null>(null)

  const commitRange = useCallback((startPercent: number, endPercent: number) => {
    const range = buildRangeFromScrubberInfo(props.info, startPercent, endPercent)
    if (range) {
      props.onChange(range)
    }
  }, [props])

  const percentFromEvent = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) {
      return null
    }
    return Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
  }

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: 'start' | 'end' | 'window',
  ) => {
    if (props.info.disabled) {
      return
    }
    const pointerPercent = percentFromEvent(event)
    if (pointerPercent === null) {
      return
    }
    dragModeRef.current = mode
    dragStartRef.current = {
      pointerPercent,
      startPercent: props.info.startPercent,
      endPercent: props.info.endPercent,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const mode = dragModeRef.current
    const start = dragStartRef.current
    if (!mode || !start) {
      return
    }
    const pointerPercent = percentFromEvent(event)
    if (pointerPercent === null) {
      return
    }
    const delta = pointerPercent - start.pointerPercent
    if (mode === 'start') {
      commitRange(Math.min(start.endPercent - 1, pointerPercent), start.endPercent)
      return
    }
    if (mode === 'end') {
      commitRange(start.startPercent, Math.max(start.startPercent + 1, pointerPercent))
      return
    }

    const width = start.endPercent - start.startPercent
    const nextStart = Math.max(0, Math.min(100 - width, start.startPercent + delta))
    commitRange(nextStart, nextStart + width)
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    dragModeRef.current = null
    dragStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className={props.embedded ? 'chart-range-scrubber chart-range-scrubber--embedded' : 'chart-range-scrubber'}>
      <div>
        <strong>时间轴</strong>
        <span>{props.info.visibleLabel}</span>
      </div>
      <div
        aria-disabled={props.info.disabled}
        aria-label="直接拖动选择图表时间范围"
        className="chart-range-mini-timeline"
        onPointerCancel={endDrag}
        onPointerLeave={moveDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        ref={trackRef}
        role="group"
      >
        <div className="chart-range-mini-timeline__ticks">
          <span>{props.info.startLabel}</span>
          <span>{props.info.endLabel}</span>
        </div>
        <div className="chart-range-mini-timeline__track">
          <button
            aria-label="拖动选区"
            className="chart-range-mini-timeline__selection"
            disabled={props.info.disabled}
            onPointerDown={(event) => beginDrag(event, 'window')}
            style={{
              left: `${props.info.startPercent}%`,
              width: `${Math.max(1, props.info.endPercent - props.info.startPercent)}%`,
            }}
            type="button"
          />
          <button
            aria-label="拖动左侧起点"
            className="chart-range-mini-timeline__handle chart-range-mini-timeline__handle--start"
            disabled={props.info.disabled}
            onPointerDown={(event) => beginDrag(event, 'start')}
            style={{ left: `${props.info.startPercent}%` }}
            type="button"
          />
          <button
            aria-label="拖动右侧终点"
            className="chart-range-mini-timeline__handle chart-range-mini-timeline__handle--end"
            disabled={props.info.disabled}
            onPointerDown={(event) => beginDrag(event, 'end')}
            style={{ left: `${props.info.endPercent}%` }}
            type="button"
          />
        </div>
      </div>
      <small>{props.info.selectedStartLabel}</small>
      <small>{props.info.selectedEndLabel}</small>
    </div>
  )
}

function TradingSessionBanner(props: {
  session: QuotePayload['marketReference']['tradingSession'] | null
}) {
  if (!props.session || props.session.status !== 'closed') {
    return null
  }

  return (
    <div className="trading-session-banner" role="status">
      <strong>已休市 / 非主交易时段</strong>
      <span>{props.session.note || '当前报价可能暂停更新，图表横线代表停更，不等于真实横盘。'}</span>
    </div>
  )
}

function IntradayChartPanel(props: {
  indicators: Indicator[]
  priceData: LineDatum[]
  referenceData: LineDatum[]
  latestPrice: number | null
  latestReference: number | null
  opportunity: OpportunityInfo | null
  prediction: ChartPrediction
  signal: ChartSignal
  patternSignals: PatternSignal[]
  v4Evidence: V4EvidenceBundle
  isLoading: boolean
  tradingSession: QuotePayload['marketReference']['tradingSession'] | null
  timeframeLabel: string
  visibleRange: ChartVisibleRange | null
  onVisibleRangeChange: (range: ChartVisibleRange) => void
  rangeScrubberInfo: ChartScrubberInfo
  onRangeScrubberChange: (range: ChartVisibleRange) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<IntradayHover | null>(null)
  const [tradeMarkerPosition, setTradeMarkerPosition] = useState<TradeMarkerPosition | null>(null)
  const latestPoint = props.priceData[props.priceData.length - 1] ?? null
  const extremes = useMemo(() => buildLineExtremes(props.priceData), [props.priceData])
  const syntheticCandles = useMemo(() => lineDataToSyntheticCandles(props.priceData), [props.priceData])
  const ma5Data = useMemo(() => buildMovingAverageData(syntheticCandles, 5), [syntheticCandles])
  const ma20Data = useMemo(() => buildMovingAverageData(syntheticCandles, 20), [syntheticCandles])
  const bollData = useMemo(() => buildBollingerBands(syntheticCandles, 20, 2), [syntheticCandles])
  const rsiValue = useMemo(() => buildRsiValue(syntheticCandles, 14), [syntheticCandles])
  const macdValue = useMemo(() => buildMacdValue(syntheticCandles), [syntheticCandles])
  const showMa = props.indicators.includes('ma')
  const showBoll = props.indicators.includes('boll')
  const showRsi = props.indicators.includes('rsi')
  const showMacd = props.indicators.includes('macd')
  const forecast = useMemo(
    () => buildChartForecast(props.latestPrice, extremes, props.prediction, props.patternSignals, props.opportunity),
    [extremes, props.latestPrice, props.opportunity, props.patternSignals, props.prediction],
  )
  const tradeOverlay = useMemo(
    () => buildLineTradeOverlayMarker(props.priceData, props.opportunity),
    [props.opportunity, props.priceData],
  )
  const markers = useMemo(
    () => buildLineMarkers(props.priceData, extremes, props.signal, props.patternSignals, tradeOverlay),
    [extremes, props.priceData, props.signal, props.patternSignals, tradeOverlay],
  )

  useEffect(() => {
    if (!containerRef.current || props.priceData.length < 1) {
      return
    }

    const container = containerRef.current
    const chart = createChart(container, chartOptions(container))
    let tradeMarkerFrame = 0
    const userInteractedRef = { current: false }
    const markUserInteracted = () => {
      userInteractedRef.current = true
    }
    container.addEventListener('pointerdown', markUserInteracted)
    container.addEventListener('wheel', markUserInteracted, { passive: true })
    container.addEventListener('touchstart', markUserInteracted, { passive: true })
    const priceSeries = chart.addSeries(LineSeries, {
      color: '#d71920',
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: true,
      crosshairMarkerVisible: true,
    })
    const referenceSeries = chart.addSeries(LineSeries, {
      color: '#1f5eff',
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
    })

    priceSeries.setData(props.priceData)
    createSeriesMarkers(priceSeries, markers)
    addExtremePriceLines(priceSeries, extremes)
    addPatternPriceLines(priceSeries, props.patternSignals)
    addForecastPriceLines(priceSeries, forecast)
    if (props.referenceData.length > 1) {
      referenceSeries.setData(props.referenceData)
    }
    const updateTradeMarkerPosition = () => {
      if (!tradeOverlay) {
        setTradeMarkerPosition(null)
        return
      }
      setTradeMarkerPosition(buildTradeMarkerPosition(
        container,
        chart.timeScale().timeToCoordinate(tradeOverlay.time),
        priceSeries.priceToCoordinate(tradeOverlay.value),
        tradeOverlay.side,
      ))
    }
    const scheduleTradeMarkerPosition = () => {
      cancelAnimationFrame(tradeMarkerFrame)
      tradeMarkerFrame = requestAnimationFrame(updateTradeMarkerPosition)
    }
    scheduleTradeMarkerPosition()
    const ma5Series = showMa ? chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const ma20Series = showMa ? chart.addSeries(LineSeries, {
      color: '#7c3aed',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    ma5Series?.setData(ma5Data)
    ma20Series?.setData(ma20Data)

    const bollUpperSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#64748b',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const bollMiddleSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const bollLowerSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#64748b',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    bollUpperSeries?.setData(bollData.upper)
    bollMiddleSeries?.setData(bollData.middle)
    bollLowerSeries?.setData(bollData.lower)

    applyChartVisibleRange(chart, props.visibleRange)
    const handleVisibleRangeChange = (range: { from: Time; to: Time } | null) => {
      if (!userInteractedRef.current || !range) {
        return
      }
      const normalized = normalizeVisibleRange(range)
      if (normalized) {
        props.onVisibleRangeChange(normalized)
      }
      scheduleTradeMarkerPosition()
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange)
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!param.time || !param.seriesData) {
        setHover(null)
        return
      }

      const pricePoint = param.seriesData.get(priceSeries) as { value?: number } | undefined
      const referencePoint = param.seriesData.get(referenceSeries) as
        | { value?: number }
        | undefined

      setHover({
        timeLabel: formatCrosshairTime(param.time),
        price: pricePoint?.value ?? props.latestPrice ?? 0,
        referencePrice: referencePoint?.value ?? props.latestReference ?? null,
      })
    })

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const nextSize = getChartSize(container, entry.contentRect)
      if (!nextSize) {
        return
      }

      chart.applyOptions(nextSize)
      scheduleTradeMarkerPosition()
    })

    observer.observe(container)

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange)
      cancelAnimationFrame(tradeMarkerFrame)
      container.removeEventListener('pointerdown', markUserInteracted)
      container.removeEventListener('wheel', markUserInteracted)
      container.removeEventListener('touchstart', markUserInteracted)
      observer.disconnect()
      chart.remove()
    }
  }, [
    extremes,
    forecast,
    markers,
    props.priceData,
    props.referenceData,
    props.latestPrice,
    props.latestReference,
    props.patternSignals,
    props.visibleRange,
    props.onVisibleRangeChange,
    tradeOverlay,
    showBoll,
    showMa,
    ma5Data,
    ma20Data,
    bollData,
  ])

  return (
    <div className="chart-frame">
      <ChartSignalStrip
        extremes={extremes}
        forecast={forecast}
        patterns={props.patternSignals}
        prediction={props.prediction}
        scopeLabel={`${props.timeframeLabel}展示 / 全局信号`}
        signal={props.signal}
      />
      <div className="data-window">
        <DataItem label="周期" value={`${props.timeframeLabel}分时`} />
        <DataItem label="状态" value={formatTradingSessionStatus(props.tradingSession)} tone={props.tradingSession?.status === 'closed' ? 'down' : undefined} />
        <DataItem label="点数" value={`${props.priceData.length}`} />
        <DataItem
          label="时间"
          value={hover?.timeLabel ?? (latestPoint ? formatTimestamp(latestPoint.time) : '--')}
        />
        <DataItem
          label="工银"
          value={
            hover
              ? currencyFormatter.format(hover.price)
              : latestPoint
                ? currencyFormatter.format(latestPoint.value)
                : props.latestPrice === null
                  ? '--'
                  : currencyFormatter.format(props.latestPrice)
          }
          tone="up"
        />
        <DataItem
          label="参考"
          value={
            hover?.referencePrice === null || hover?.referencePrice === undefined
              ? props.latestReference === null
                ? '--'
                : currencyFormatter.format(props.latestReference)
              : currencyFormatter.format(hover.referencePrice)
          }
        />
      </div>
      {props.priceData.length < 1 ? (
        <div className="empty-chart">
          {props.isLoading ? '正在加载' : '样本不足'}
        </div>
      ) : (
        <div className="chart-canvas-shell">
          <div className="lw-chart" ref={containerRef} />
          <TradeMarkerBadge marker={tradeOverlay} position={tradeMarkerPosition} />
        </div>
      )}
      <ChartRangeScrubber
        embedded
        info={props.rangeScrubberInfo}
        onChange={props.onRangeScrubberChange}
      />
      <ChartMarkerSummary
        eventIntelligence={props.v4Evidence.eventIntelligence}
        eventRisk={props.opportunity?.eventRisk ?? null}
        patterns={props.patternSignals}
        tradeOverlay={tradeOverlay}
      />
      <IndicatorPanel
        boll={bollData}
        macdValue={showMacd ? macdValue : null}
        rsiValue={showRsi ? rsiValue : null}
        showBoll={showBoll}
      />
      <PatternSignalPanel patterns={props.patternSignals} />
    </div>
  )
}

function CandlestickChartPanel(props: {
  candleData: CandleDatum[]
  indicators: Indicator[]
  latestPrice: number | null
  opportunity: OpportunityInfo | null
  prediction: ChartPrediction
  signal: ChartSignal
  patternSignals: PatternSignal[]
  v4Evidence: V4EvidenceBundle
  isLoading: boolean
  tradingSession: QuotePayload['marketReference']['tradingSession'] | null
  timeframeLabel: string
  visibleRange: ChartVisibleRange | null
  onVisibleRangeChange: (range: ChartVisibleRange) => void
  rangeScrubberInfo: ChartScrubberInfo
  onRangeScrubberChange: (range: ChartVisibleRange) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<CandleHover | null>(null)
  const [tradeMarkerPosition, setTradeMarkerPosition] = useState<TradeMarkerPosition | null>(null)
  const latestCandle = props.candleData[props.candleData.length - 1] ?? null
  const ma5Data = useMemo(() => buildMovingAverageData(props.candleData, 5), [props.candleData])
  const ma10Data = useMemo(() => buildMovingAverageData(props.candleData, 10), [props.candleData])
  const ma20Data = useMemo(() => buildMovingAverageData(props.candleData, 20), [props.candleData])
  const latestMa5 = latestLineValue(ma5Data)
  const latestMa10 = latestLineValue(ma10Data)
  const latestMa20 = latestLineValue(ma20Data)
  const bollData = useMemo(() => buildBollingerBands(props.candleData, 20, 2), [props.candleData])
  const rsiValue = useMemo(() => buildRsiValue(props.candleData, 14), [props.candleData])
  const macdValue = useMemo(() => buildMacdValue(props.candleData), [props.candleData])
  const showMa = props.indicators.includes('ma')
  const showBoll = props.indicators.includes('boll')
  const showRsi = props.indicators.includes('rsi')
  const showMacd = props.indicators.includes('macd')
  const extremes = useMemo(() => buildCandleExtremes(props.candleData), [props.candleData])
  const forecast = useMemo(
    () => buildChartForecast(props.latestPrice, extremes, props.prediction, props.patternSignals, props.opportunity),
    [extremes, props.latestPrice, props.opportunity, props.patternSignals, props.prediction],
  )
  const tradeOverlay = useMemo(
    () => buildCandleTradeOverlayMarker(props.candleData, props.opportunity),
    [props.candleData, props.opportunity],
  )
  const markers = useMemo(
    () => buildCandleMarkers(props.candleData, extremes, props.signal, props.patternSignals, tradeOverlay),
    [extremes, props.candleData, props.signal, props.patternSignals, tradeOverlay],
  )

  useEffect(() => {
    if (!containerRef.current || props.candleData.length < 1) {
      return
    }

    const container = containerRef.current
    const chart = createChart(container, chartOptions(container))
    let tradeMarkerFrame = 0
    const userInteractedRef = { current: false }
    const markUserInteracted = () => {
      userInteractedRef.current = true
    }
    container.addEventListener('pointerdown', markUserInteracted)
    container.addEventListener('wheel', markUserInteracted, { passive: true })
    container.addEventListener('touchstart', markUserInteracted, { passive: true })
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#d71920',
      downColor: '#078466',
      borderVisible: false,
      wickUpColor: '#d71920',
      wickDownColor: '#078466',
      lastValueVisible: true,
      priceLineVisible: true,
    })

    candleSeries.setData(props.candleData)
    createSeriesMarkers(candleSeries, markers)
    addExtremePriceLines(candleSeries, extremes)
    addPatternPriceLines(candleSeries, props.patternSignals)
    addForecastPriceLines(candleSeries, forecast)
    const updateTradeMarkerPosition = () => {
      if (!tradeOverlay) {
        setTradeMarkerPosition(null)
        return
      }
      setTradeMarkerPosition(buildTradeMarkerPosition(
        container,
        chart.timeScale().timeToCoordinate(tradeOverlay.time),
        candleSeries.priceToCoordinate(tradeOverlay.value),
        tradeOverlay.side,
      ))
    }
    const scheduleTradeMarkerPosition = () => {
      cancelAnimationFrame(tradeMarkerFrame)
      tradeMarkerFrame = requestAnimationFrame(updateTradeMarkerPosition)
    }
    scheduleTradeMarkerPosition()
    const ma5Series = showMa ? chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const ma10Series = showMa ? chart.addSeries(LineSeries, {
      color: '#1f5eff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const ma20Series = showMa ? chart.addSeries(LineSeries, {
      color: '#7c3aed',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    ma5Series?.setData(ma5Data)
    ma10Series?.setData(ma10Data)
    ma20Series?.setData(ma20Data)

    const bollUpperSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#64748b',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const bollMiddleSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    const bollLowerSeries = showBoll ? chart.addSeries(LineSeries, {
      color: '#64748b',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }) : null
    bollUpperSeries?.setData(bollData.upper)
    bollMiddleSeries?.setData(bollData.middle)
    bollLowerSeries?.setData(bollData.lower)
    applyChartVisibleRange(chart, props.visibleRange)
    const handleVisibleRangeChange = (range: { from: Time; to: Time } | null) => {
      if (!userInteractedRef.current || !range) {
        return
      }
      const normalized = normalizeVisibleRange(range)
      if (normalized) {
        props.onVisibleRangeChange(normalized)
      }
      scheduleTradeMarkerPosition()
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange)
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!param.time || !param.seriesData) {
        setHover(null)
        return
      }

      const point = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined
      const ma5Point = ma5Series
        ? param.seriesData.get(ma5Series) as { value?: number } | undefined
        : undefined
      const ma10Point = ma10Series
        ? param.seriesData.get(ma10Series) as { value?: number } | undefined
        : undefined
      const ma20Point = ma20Series
        ? param.seriesData.get(ma20Series) as { value?: number } | undefined
        : undefined

      if (
        typeof point?.open !== 'number' ||
        typeof point.high !== 'number' ||
        typeof point.low !== 'number' ||
        typeof point.close !== 'number'
      ) {
        setHover(null)
        return
      }

      setHover({
        timeLabel: formatCrosshairTime(param.time),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        ma5: ma5Point?.value ?? null,
        ma10: ma10Point?.value ?? null,
        ma20: ma20Point?.value ?? null,
      })
    })

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const nextSize = getChartSize(container, entry.contentRect)
      if (!nextSize) {
        return
      }

      chart.applyOptions(nextSize)
      scheduleTradeMarkerPosition()
    })

    observer.observe(container)

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange)
      cancelAnimationFrame(tradeMarkerFrame)
      container.removeEventListener('pointerdown', markUserInteracted)
      container.removeEventListener('wheel', markUserInteracted)
      container.removeEventListener('touchstart', markUserInteracted)
      observer.disconnect()
      chart.remove()
    }
  }, [
    bollData,
    extremes,
    forecast,
    ma10Data,
    ma20Data,
    ma5Data,
    markers,
    props.candleData,
    props.patternSignals,
    props.visibleRange,
    props.onVisibleRangeChange,
    tradeOverlay,
    showBoll,
    showMa,
  ])

  return (
    <div className="chart-frame">
      <ChartSignalStrip
        extremes={extremes}
        forecast={forecast}
        patterns={props.patternSignals}
        prediction={props.prediction}
        scopeLabel={`${props.timeframeLabel}K线 / 全局信号`}
        signal={props.signal}
      />
      <div className="data-window data-window--ohlc">
        <DataItem label="周期" value={props.timeframeLabel} />
        <DataItem label="状态" value={formatTradingSessionStatus(props.tradingSession)} tone={props.tradingSession?.status === 'closed' ? 'down' : undefined} />
        <DataItem label="根数" value={`${props.candleData.length}`} />
        <DataItem label="时间" value={hover?.timeLabel ?? (latestCandle ? formatTimestamp(latestCandle.time) : '--')} />
        <DataItem label="开" value={formatMaybePrice(hover?.open ?? latestCandle?.open ?? props.latestPrice)} />
        <DataItem label="高" value={formatMaybePrice(hover?.high ?? latestCandle?.high ?? null)} tone="up" />
        <DataItem label="低" value={formatMaybePrice(hover?.low ?? latestCandle?.low ?? null)} tone="down" />
        <DataItem label="收" value={formatMaybePrice(hover?.close ?? latestCandle?.close ?? props.latestPrice)} />
        {showMa ? <DataItem label="MA5" value={formatMaybePrice(hover?.ma5 ?? latestMa5)} /> : null}
        {showMa ? <DataItem label="MA10" value={formatMaybePrice(hover?.ma10 ?? latestMa10)} /> : null}
        {showMa ? <DataItem label="MA20" value={formatMaybePrice(hover?.ma20 ?? latestMa20)} /> : null}
      </div>
      {props.candleData.length < 1 ? (
        <div className="empty-chart">
          {props.isLoading ? '正在加载' : '样本不足'}
        </div>
      ) : (
        <div className="chart-canvas-shell">
          <div className="lw-chart" ref={containerRef} />
          <TradeMarkerBadge marker={tradeOverlay} position={tradeMarkerPosition} />
        </div>
      )}
      <ChartRangeScrubber
        embedded
        info={props.rangeScrubberInfo}
        onChange={props.onRangeScrubberChange}
      />
      <ChartMarkerSummary
        eventIntelligence={props.v4Evidence.eventIntelligence}
        eventRisk={props.opportunity?.eventRisk ?? null}
        patterns={props.patternSignals}
        tradeOverlay={tradeOverlay}
      />
      <IndicatorPanel
        boll={bollData}
        macdValue={showMacd ? macdValue : null}
        rsiValue={showRsi ? rsiValue : null}
        showBoll={showBoll}
      />
      <PatternSignalPanel patterns={props.patternSignals} />
    </div>
  )
}

function DataItem(props: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <span className="data-item">
      <em>{props.label}</em>
      <strong className={props.tone ?? ''}>{props.value}</strong>
    </span>
  )
}

function TradeMarkerBadge(props: {
  marker: TradeOverlayMarker | null
  position: TradeMarkerPosition | null
}) {
  if (!props.marker || !props.position) {
    return null
  }

  return (
    <div className={`trade-marker-layer trade-marker-layer--${props.marker.side}`}>
      <span
        className="trade-marker-pin"
        style={{ left: props.position.pinX, top: props.position.pinY }}
      />
      <aside
        className={`trade-marker-badge trade-marker-badge--${props.position.align}`}
        style={{ left: props.position.labelX, top: props.position.labelY }}
        title={props.marker.reason}
      >
        {props.marker.side === 'buy' ? 'B' : 'S'}
      </aside>
    </div>
  )
}

function ChartMarkerSummary(props: {
  eventIntelligence: EventIntelligenceResponse | null
  eventRisk: EconomicEventRisk | null
  patterns: PatternSignal[]
  tradeOverlay: TradeOverlayMarker | null
}) {
  const activeEvent = props.eventIntelligence?.activeItem ?? props.eventRisk?.activeEvent ?? null
  const eventLabel = activeEvent
    ? `${activeEvent.label} · ${eventPhaseLabel(getChartMarkerEventPhase(props.eventIntelligence, props.eventRisk))}`
    : props.eventRisk && props.eventRisk.level !== 'none'
      ? eventRiskLevelLabel(props.eventRisk.level)
      : '无近端事件标记'
  const signalLabel = props.tradeOverlay
    ? `${props.tradeOverlay.label} · ${props.tradeOverlay.reason}`
    : props.patterns[0]
      ? `${props.patterns[0].label} · ${patternStatusLabel(props.patterns[0])}`
      : '暂无交易/形态标记'

  return (
    <section className="chart-marker-summary" aria-label="图表事件和信号标记摘要">
      <article>
        <span>事件标记</span>
        <strong>{eventLabel}</strong>
        <small>{props.eventIntelligence?.usageBoundary ?? 'v4 事件智能缺失时沿用 v3 eventRisk；估算事件只做风控说明。'}</small>
      </article>
      <article>
        <span>信号标记</span>
        <strong>{signalLabel}</strong>
        <small>{props.patterns.length > 0 ? `形态 ${props.patterns.length} 个，最多展示前三个摘要。` : '没有标记不代表模块白屏，只代表条件未触发。'}</small>
      </article>
      <article>
        <span>标签避让</span>
        <strong>自动贴边避让</strong>
        <small>交易 B/S 标签会根据靠近右边界切换左右锚点，并限制在图表内，避免压住价格轴和空白外溢。</small>
      </article>
    </section>
  )
}

function getChartMarkerEventPhase(
  eventIntelligence: EventIntelligenceResponse | null,
  eventRisk: EconomicEventRisk | null,
): EconomicEventRisk['phase'] {
  return eventIntelligence?.activeItem?.phase ?? eventRisk?.phase ?? 'normal'
}

function buildTradeMarkerPosition(
  container: HTMLElement,
  timeCoordinate: number | null,
  priceCoordinate: number | null,
  side: TradeDecisionMarker['side'],
): TradeMarkerPosition | null {
  if (timeCoordinate === null || priceCoordinate === null) {
    return null
  }
  const width = container.clientWidth
  const height = container.clientHeight
  if (width <= 0 || height <= 0) {
    return null
  }

  const pinX = clamp(timeCoordinate, 10, Math.max(10, width - 10))
  const pinY = clamp(priceCoordinate, 10, Math.max(10, height - 10))
  const labelWidth = 22
  const labelHeight = 22
  const horizontalGap = 5
  const align = pinX > width - labelWidth - horizontalGap - 12 ? 'left' : 'right'
  const rawLabelX = align === 'right'
    ? pinX + horizontalGap
    : pinX - labelWidth - horizontalGap
  const labelX = clamp(rawLabelX, 8, Math.max(8, width - labelWidth - 8))
  const verticalOffset = side === 'buy' ? 4 : labelHeight + 4
  const labelY = clamp(pinY - verticalOffset, 8, Math.max(8, height - labelHeight - 8))

  return { pinX, pinY, labelX, labelY, align }
}

function formatTradingSessionStatus(session: QuotePayload['marketReference']['tradingSession'] | null) {
  if (!session) {
    return '未知'
  }
  if (session.status === 'trading') {
    return '交易中'
  }
  if (session.status === 'closed') {
    return '已休市'
  }
  return '未知'
}

function buildChartTradingSession(
  source: ChartSourceId,
  baseSession: TradingSession | null,
  now: number,
): TradingSession | null {
  if (source === 'au9999' || source === 'autd') {
    return buildSgeTradingSession(now, CHART_SOURCE_LABELS[source].label)
  }
  if (source === 'london') {
    return buildGlobalGoldTradingSession(now)
  }
  if (source === 'consensus') {
    const sgeSession = buildSgeTradingSession(now, CHART_SOURCE_LABELS.consensus.label)
    if (sgeSession.isTradingTime) {
      return {
        ...sgeSession,
        note: '多源校准价包含 AU9999/Au(T+D) 锚点，当前按上金所活跃时段展示。',
      }
    }
  }
  return baseSession
}

function buildSgeTradingSession(now: number, label: string): TradingSession {
  const chinaTime = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const day = chinaTime.getDay()
  const minutes = chinaTime.getHours() * 60 + chinaTime.getMinutes()
  const inDaySession = day >= 1 && day <= 5 && (
    (minutes >= 9 * 60 && minutes <= 11 * 60 + 30) ||
    (minutes >= 13 * 60 + 30 && minutes <= 15 * 60 + 30)
  )
  const inNightSession = (
    (day >= 1 && day <= 5 && minutes >= 20 * 60) ||
    (day >= 2 && day <= 6 && minutes <= 2 * 60 + 30)
  )
  const isTradingTime = inDaySession || inNightSession

  return {
    isTradingTime,
    status: isTradingTime ? 'trading' : 'closed',
    note: isTradingTime
      ? `${label} 当前处于上金所日盘/夜盘交易时段。`
      : `${label} 当前不在上金所日盘/夜盘主要交易时段，报价可能暂停更新。`,
  }
}

function buildGlobalGoldTradingSession(now: number): TradingSession {
  const date = new Date(now)
  const day = date.getUTCDay()
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  const isTradingTime = !(
    day === 6 ||
    (day === 0 && minutes < 22 * 60) ||
    (day === 5 && minutes >= 22 * 60)
  )

  return {
    isTradingTime,
    status: isTradingTime ? 'trading' : 'closed',
    note: isTradingTime
      ? '伦敦金/国际金按全球黄金 24x5 交易时段判断，当前通常仍有报价。'
      : '伦敦金/国际金当前处于周末或全球主要休市窗口，报价可能暂停更新。',
  }
}

function IndicatorPanel(props: {
  boll: BollingerBands
  macdValue: MacdValue | null
  rsiValue: number | null
  showBoll: boolean
}) {
  const latestUpper = latestLineValue(props.boll.upper)
  const latestMiddle = latestLineValue(props.boll.middle)
  const latestLower = latestLineValue(props.boll.lower)

  if (!props.showBoll && props.rsiValue === null && props.macdValue === null) {
    return null
  }

  return (
    <div className="indicator-panel">
      {props.showBoll ? (
        <div>
          <strong>BOLL</strong>
          <span>上 {formatMaybePrice(latestUpper)}</span>
          <span>中 {formatMaybePrice(latestMiddle)}</span>
          <span>下 {formatMaybePrice(latestLower)}</span>
        </div>
      ) : null}
      {props.rsiValue !== null ? (
        <div>
          <strong>RSI14</strong>
          <span>{formatIndicator(props.rsiValue)}</span>
          <small>{props.rsiValue >= 70 ? '偏热' : props.rsiValue <= 30 ? '偏冷' : '中性'}</small>
        </div>
      ) : null}
      {props.macdValue ? (
        <div>
          <strong>MACD</strong>
          <span>DIF {formatIndicator(props.macdValue.dif)}</span>
          <span>DEA {formatIndicator(props.macdValue.dea)}</span>
          <span>柱 {formatIndicator(props.macdValue.histogram)}</span>
        </div>
      ) : null}
    </div>
  )
}

function ChartSignalStrip(props: {
  extremes: ChartExtremes
  forecast: ChartForecast
  patterns: PatternSignal[]
  prediction: ChartPrediction
  scopeLabel: string
  signal: ChartSignal
}) {
  const leadingPattern = props.patterns[0] ?? null

  return (
    <div className={`chart-signal-strip chart-signal-strip--${props.signal.tone}`}>
      <div className="chart-signal-card">
        <span>图上信号 · {props.scopeLabel}</span>
        <strong>{props.signal.label}</strong>
        <small>{props.signal.detail}</small>
      </div>
      <div className="chart-probability-card">
        <span>{props.prediction.label}</span>
        <strong>
          {props.prediction.showProbability ? (
            <>
              TP1先达 {formatProbability(props.prediction.upProbability)}
              <b> / </b>
              止损先达 {formatProbability(props.prediction.downProbability)}
            </>
          ) : (
            props.prediction.displayText
          )}
        </strong>
        <small>
          {props.prediction.showProbability ? `置信 ${formatProbability(props.prediction.confidence)} · ` : ''}
          {props.prediction.basis}
        </small>
      </div>
      <div className="chart-forecast-card">
        <span>情景区间 · {props.forecast.horizonLabel}</span>
        <strong>
          {formatMaybePrice(props.forecast.intervalLow)}
          <b> - </b>
          {formatMaybePrice(props.forecast.intervalHigh)}
        </strong>
        <small>{props.forecast.basis}</small>
      </div>
      <div className="chart-extreme-card">
        <span>关键价位</span>
        <strong>
          支撑 {formatMaybePrice(props.forecast.support)}
          <b> / </b>
          压力 {formatMaybePrice(props.forecast.resistance)}
        </strong>
        <small>
          {leadingPattern
            ? `${leadingPattern.label} 识别置信 ${formatProbability(leadingPattern.confidence)}，TP1先达倾向 ${formatMaybeProbability(props.forecast.successRate)}，失效价 ${formatMaybePrice(props.forecast.failurePrice)}。`
            : `TP1先达倾向 ${formatMaybeProbability(props.forecast.successRate)}；图中虚线标出统一情景区间和关键价。`}
        </small>
      </div>
    </div>
  )
}

function PatternSignalPanel(props: { patterns: PatternSignal[] }) {
  if (props.patterns.length < 1) {
    return (
      <div className="pattern-signal-panel">
        <article className="pattern-card pattern-card--neutral">
          <header>
            <strong>形态观察</strong>
            <span>暂无确认形态 · 等待结构</span>
          </header>
          <p>当前窗口未识别到足够稳定的双顶/双底、吞没、锤子线等形态，不隐藏卡片，避免误以为模块丢失。</p>
          <div>
            <small>状态 观察</small>
            <small>确认 --</small>
            <small>关键 --</small>
            <small>失效 --</small>
            <small>情景目标 --</small>
            <small>冷却 --</small>
          </div>
          <b>没有形态不是买卖信号，只代表当前 K 线结构不足以形成可解释形态；继续以关键价位、概率和硬门槛复核为主。</b>
        </article>
      </div>
    )
  }

  return (
    <div className="pattern-signal-panel">
      {props.patterns.slice(0, 3).map((pattern) => (
        <article className={`pattern-card pattern-card--${pattern.direction}`} key={pattern.id}>
          <header>
            <strong>{pattern.label}</strong>
            <span>{patternStatusLabel(pattern)} · 置信 {pattern.confidence}%</span>
          </header>
          <p>{pattern.summary}</p>
          <div>
            <small>状态 {patternStatusLabel(pattern)}</small>
            <small>确认 {formatMaybePrice(pattern.confirmationPrice ?? pattern.necklinePrice)}</small>
            <small>关键 {formatMaybePrice(pattern.keyPrice)}</small>
            <small>失效 {formatMaybePrice(pattern.invalidationPrice)}</small>
            <small>情景目标 {formatMaybePrice(pattern.targetPrice)}</small>
            <small>冷却 {pattern.cooldownBars && pattern.cooldownBars > 0 ? `${pattern.cooldownBars}根` : '--'}</small>
          </div>
          <b>
            {pattern.stateReason ? `${pattern.stateReason} ` : ''}
            {pattern.explanation}
            {pattern.invalidationPrice !== null
              ? ` 若跌破/突破失效价 ${formatMaybePrice(pattern.invalidationPrice)}，该形态按失败处理。`
              : ''}
            {' '}禁用条件：{patternDisabledText(pattern)}
          </b>
        </article>
      ))}
    </div>
  )
}

function mergePatternSignals(primary: PatternSignal[], fallback: PatternSignal[]) {
  const merged = new Map<string, PatternSignal>()
  for (const pattern of [...primary, ...fallback]) {
    merged.set(pattern.id, pattern)
  }
  return [...merged.values()]
}

function patternStatusLabel(pattern: PatternSignal) {
  if (pattern.confirmationStatus === 'confirmed') {
    return '已确认'
  }
  if (pattern.confirmationStatus === 'failed') {
    return '已失效'
  }
  return '候选'
}

function patternDisabledText(pattern: PatternSignal) {
  const conditions = [
    pattern.confirmationStatus !== 'confirmed' ? '未确认' : null,
    pattern.confirmationStatus === 'failed' ? '冷却期' : null,
    pattern.contextTags?.some((tag) => tag === 'blowoff_risk' || tag === 'chase_long_block') ? '高位衰竭/追涨风险' : null,
    '事件第一波',
    '关键源异常',
    '赔率不足',
  ].filter((item): item is string => Boolean(item))
  return conditions.join('、')
}

function mergeV4Evidence(
  signal: OpportunityInfo | null,
  eventIntelligence: EventIntelligenceResponse | null,
  decisionEvidence: DecisionEvidencePacket | null,
  modelScorecard: ModelProviderScorecard | null,
  signalJournal: SignalJournalResponse | null,
): V4EvidenceBundle {
  const decisionView = signal?.decisionView ?? null
  return {
    eventIntelligence:
      decisionEvidence?.eventIntelligence ??
      eventIntelligence ??
      decisionView?.eventIntelligence ??
      null,
    decisionEvidence: decisionEvidence ?? decisionView?.decisionEvidence ?? null,
    modelScorecard:
      modelScorecard ??
      decisionEvidence?.modelScorecard ??
      decisionView?.modelRegistry ??
      decisionView?.modelScorecard ??
      null,
    signalJournal: signalJournal ?? decisionView?.signalJournal ?? null,
  }
}

function buildFourHardGates(
  signal: OpportunityInfo | null,
  transparency: SignalTransparency,
  evidence: V4EvidenceBundle,
): SignalTransparency['hardGates'] {
  const decisionView = signal?.decisionView ?? null
  const fallback = transparency.hardGates.slice(0, 4)
  const sourceGate = evidence.decisionEvidence?.sourceLedger
    ? {
        label: '数据源',
        status: evidence.decisionEvidence.sourceLedger.strongSignalEligible ? 'pass' : 'block',
        detail: evidence.decisionEvidence.sourceLedger.summary,
      } satisfies SignalTransparency['hardGates'][number]
    : fallback.find((gate) => gate.label.includes('数据') || gate.label.includes('源'))
  const eventGate = evidence.eventIntelligence
    ? {
        label: '事件窗口',
        status: evidence.eventIntelligence.current.level === 'critical'
          ? 'block'
          : evidence.eventIntelligence.current.level === 'elevated'
            ? 'watch'
            : 'pass',
        detail: evidence.eventIntelligence.summary,
      } satisfies SignalTransparency['hardGates'][number]
    : fallback.find((gate) => gate.label.includes('事件') || gate.label.includes('纪律'))
  const modelGate = evidence.modelScorecard
    ? {
        label: '模型/样本',
        status: evidence.modelScorecard.entries.some((entry) => entry.weightPolicy === 'full' || entry.weightPolicy === 'low_weight')
          ? 'pass'
          : 'watch',
        detail: evidence.modelScorecard.summary,
      } satisfies SignalTransparency['hardGates'][number]
    : fallback.find((gate) => gate.label.includes('样本') || gate.label.includes('模型') || gate.label.includes('回测'))

  const gates = [
    {
      label: '触发价/止损',
      status: decisionView?.validatedLevels.trigger.status === 'valid' && decisionView.validatedLevels.stopLoss.status === 'valid'
        ? 'pass'
        : decisionView
          ? 'block'
          : 'watch',
      detail: decisionView
        ? `触发 ${formatMaybePrice(decisionView.triggerPrice)}；止损 ${formatMaybePrice(decisionView.stopLoss)}`
        : '等待后端返回关键价校验。',
    },
    {
      label: '赔率',
      status: decisionView?.riskRewardRatio !== null && decisionView?.riskRewardRatio !== undefined && decisionView.riskRewardRatio >= 2.5
        ? 'pass'
        : decisionView?.riskRewardRatio
          ? 'watch'
          : 'block',
      detail: decisionView?.riskRewardRatio ? `${decisionView.riskRewardRatio}:1；低于门槛只观察。` : '未形成可执行赔率。',
    },
    sourceGate ?? fallback[0],
    eventGate ?? modelGate ?? fallback[1],
  ].filter((gate): gate is SignalTransparency['hardGates'][number] => Boolean(gate))

  return gates.slice(0, 4)
}

function decisionEvidenceStatusLabel(status: DecisionEvidencePacket['evidence'][number]['status']) {
  if (status === 'supporting') {
    return '支持'
  }
  if (status === 'opposing') {
    return '反向'
  }
  if (status === 'blocking') {
    return '阻断'
  }
  return '信息'
}

function sourceUsageShortLabel(sourceUsage: DecisionEvidencePacket['evidence'][number]['sourceUsage']) {
  if (sourceUsage === 'production_calendar' || sourceUsage === 'production_realtime') {
    return '生产'
  }
  if (sourceUsage === 'reference_calibration' || sourceUsage === 'estimation_only') {
    return '参考'
  }
  if (sourceUsage === 'shadow_only' || sourceUsage === 'mirror_learning' || sourceUsage === 'news_watch_only') {
    return '学习'
  }
  return sourceUsage
}

function ChartInsightDeck(props: {
  monitor: BacktestMonitor | null
  providerHealth: ProviderHealthPayload | null
  signal: OpportunityInfo | null
  transparency: SignalTransparency
}) {
  const external = props.signal?.externalModelAdvisor ?? null
  const liveProviders = props.providerHealth?.providers.filter((provider) => provider.status === 'live').length ?? null
  const totalProviders = props.providerHealth?.providers.length ?? null
  const externalMonitor = props.monitor?.externalModel ?? null
  const bestBucket = externalMonitor?.bestBuckets[0] ?? null
  const weakBucket = externalMonitor?.weakBuckets[0] ?? null
  const decisionView = props.signal?.decisionView ?? null
  const action = decisionView?.singleCommand ?? props.transparency.verdict
  const canShowExternalProbability = decisionView?.backtestValidity.metricsEnabled === true &&
    decisionView.probabilityDisplay.mode === 'calibrated'

  return (
    <section className="chart-insight-deck" aria-label="可视化军师摘要">
      <article className="chart-insight-card chart-insight-card--decision">
        <span>小白操作翻译</span>
        <strong>{action}</strong>
        <small>{decisionView?.beginnerInstruction ?? props.signal?.tradePlan?.positionSuggestion ?? '先看多源价差、回测样本和事件风险，未过硬门槛不追价。'}</small>
      </article>
      <article className="chart-insight-card">
        <span>外部模型军师</span>
        <strong>
          {external
            ? `${externalModelProviderLabel(external.provider)} ${canShowExternalProbability && external.upProbability !== null ? formatProbability(external.upProbability * 100) : '--'}`
            : '未配置'}
        </strong>
        <small>{external?.backtestGate?.summary ?? external?.summary ?? externalMonitor?.summary ?? 'Chronos/TimesFM/Moirai 只在通过分桶回测后才允许加权。'}</small>
      </article>
      <article className="chart-insight-card">
        <span>同类胜率/回测</span>
        <strong>{decisionView?.calibrationStatus.canShowNumericProbability ? formatMaybeProbability(decisionView.probabilityDisplay.value === null ? null : decisionView.probabilityDisplay.value * 100) : '样本不足'}</strong>
        <small>
          {decisionView
            ? decisionView.calibrationStatus.reason
            : bestBucket
            ? `强桶：${bestBucket.label}，PF ${formatNullableRatio(bestBucket.profitFactor)}。`
            : weakBucket
              ? `弱桶：${weakBucket.label}，模型自动降权。`
              : '等待更多 live 样本形成同类场景胜率。'}
        </small>
      </article>
      <article className="chart-insight-card">
        <span>数据源覆盖</span>
        <strong>{decisionView ? sourceHealthSummary(decisionView.sourceHealth) : liveProviders === null || totalProviders === null ? '--' : `${liveProviders}/${totalProviders}`}</strong>
        <small>
          {decisionView?.sourceHealth.warnings[0] ??
            props.signal?.marketContext?.summary ??
            '工作日交易时段要求工银、AU9999、银行参考和宏观源尽量一致。'}
        </small>
      </article>
    </section>
  )
}

function externalModelProviderLabel(provider: ExternalModelAdvisor['provider']) {
  if (provider === 'chronos') {
    return 'Chronos'
  }
  if (provider === 'timesfm') {
    return 'TimesFM'
  }
  if (provider === 'moirai') {
    return 'Moirai'
  }
  if (provider === 'lag-llama') {
    return 'Lag-Llama'
  }
  if (provider === 'disabled') {
    return '未配置'
  }
  return '自定义'
}

function sourceHealthSummary(sourceHealth: DecisionViewModel['sourceHealth']) {
  const trade = sourceHealth.tradeSourceStatus === 'live' ? '交易源实时' : `交易源${sourceHealth.tradeSourceStatus}`
  const reference = sourceHealth.referenceSourceStatus === 'live' ? '锚点通过' : `锚点${sourceHealth.referenceSourceStatus}`
  const provider = sourceHealth.providerProbeStatus === 'missing' ? '探针待补' : `探针${sourceHealth.providerProbeStatus}`
  return `${trade} · ${reference} · ${provider}`
}

function buildScoreMethodology(signal: OpportunityInfo | null, monitor: BacktestMonitor | null) {
  const score = normalizeScoreNumber(signal?.score)
  const macroScore = normalizeScoreNumber(signal?.marketContext?.factorScore)
  const valuationScore = normalizeScoreNumber(signal?.valuation?.score)
  const metricsEnabled = signal?.decisionView?.backtestValidity.metricsEnabled === true ||
    monitor?.metricsFrozen === false
  const horizonWinRate = metricsEnabled ? signal?.marketContext?.backtest.horizons[0]?.winRate ?? null : null
  const backtestScore = metricsEnabled && typeof monitor?.winRate === 'number'
    ? Math.round(monitor.winRate * 100)
    : metricsEnabled && typeof horizonWinRate === 'number'
      ? Math.round(horizonWinRate * 100)
      : null
  const expertScore = signal?.expertConsensus
    ? Math.round(normalizeScoreNumber(signal.expertConsensus.confidence) ?? 0)
    : null
  const liveFactors = countLiveMarketFactors(signal?.marketContext ?? null)
  const totalFactors = countTotalMarketFactors(signal?.marketContext ?? null)
  const unavailableCritical = (signal?.marketContext?.providerHealth ?? [])
    .filter((provider) => provider.participatesInScoring && provider.status === 'unavailable')
    .length
  const modelReliability = metricsEnabled ? monitor?.reliability ?? null : null
  const confidence =
    score === null
      ? '等待样本'
      : unavailableCritical > 0
        ? '审慎可信'
        : modelReliability !== null && modelReliability >= 70
          ? '高可信'
        : liveFactors >= Math.max(3, Math.floor(totalFactors * 0.7))
          ? '高可信'
          : '中等可信'

  return {
    confidenceLabel: confidence,
    summary:
      '评分不是只看当前价格，而是把技术趋势、估值水位、宏观/资金流、专家团共识、选择性回测、形态信号、数据源健康一起加权，并在关键源失败时自动降级。',
    formula:
      'Score = clamp(技术28% + 估值20% + 宏观20% + 合格信号回测16% + 形态8% + 专家6% + 数据健康2% - 风险惩罚)',
    guardrail:
      '严谨边界：回测只统计达到阈值的合格信号，并同时显示样本量、基准胜率、Profit Factor 和数据源健康；它是概率化观察信号，不是收益承诺。',
    factors: [
      {
        label: '最终分',
        value: score === null ? '--' : `${Math.round(score)}/100`,
        weight: '输出',
      },
      {
        label: '估值水位',
        value: valuationScore === null ? '--' : `${Math.round(valuationScore)}/100`,
        weight: '22%',
      },
      {
        label: '宏观因子',
        value: macroScore === null ? '--' : `${Math.round(macroScore)}/100`,
        weight: '22%',
      },
      {
        label: '回测胜率',
        value: backtestScore === null ? '--' : `${backtestScore}/100`,
        weight: monitor?.signalThreshold ? `阈值 ${monitor.signalThreshold}` : '16%',
      },
      {
        label: '模型可信度',
        value: modelReliability === null ? '--' : `${modelReliability}/100`,
        weight: monitor?.evaluatedSamples ? `样本 ${monitor.evaluatedSamples}` : '样本不足',
      },
      {
        label: '专家共识',
        value: expertScore === null ? '--' : `${expertScore}/100`,
        weight: '6%',
      },
      {
        label: '源覆盖',
        value: totalFactors < 1 ? '--' : `${liveFactors}/${totalFactors}`,
        weight: unavailableCritical > 0 ? `关键失败 ${unavailableCritical}` : '健康过滤',
      },
    ],
  }
}

function buildSignalTransparency(
  signal: OpportunityInfo | null,
  monitor: BacktestMonitor | null,
  prediction: ChartPrediction,
): SignalTransparency {
  const decisionView = signal?.decisionView ?? null
  const probabilityDisplay = decisionView?.probabilityDisplay ?? null
  const canShowProbability = Boolean(
    probabilityDisplay?.mode === 'calibrated' &&
      probabilityDisplay.value !== null &&
      decisionView?.calibrationStatus.canShowNumericProbability,
  )
  const probability = canShowProbability && probabilityDisplay !== null && probabilityDisplay.value !== null
    ? Math.round(probabilityDisplay.value * 100)
    : null
  const reliability = monitor?.metricsFrozen ? null : monitor?.reliability ?? null
  const sampleSize = decisionView?.backtestValidity.completeSamples ?? monitor?.completeEvaluatedSamples ?? 0
  const liveFactors = countLiveMarketFactors(signal?.marketContext ?? null)
  const totalFactors = countTotalMarketFactors(signal?.marketContext ?? null)
  const sourceCoverage = totalFactors > 0 ? liveFactors / totalFactors : 0
  const hasTradePlan = Boolean(signal?.tradePlan)
  const hasStopLoss = typeof signal?.tradePlan?.stopLoss === 'number'
  const eventRisk = signal?.eventRisk?.level ?? 'none'
  const psychologyAction = signal?.psychology?.action ?? 'allow_plan'
  const metricsAvailable = decisionView?.backtestValidity.metricsEnabled === true || monitor?.metricsFrozen === false
  const calibrationConfidence = metricsAvailable
    ? Math.round(clamp(
        prediction.confidence * 0.45 +
          (reliability ?? 42) * 0.28 +
          Math.min(18, sampleSize * 1.5) +
          sourceCoverage * 14 -
          calibrationPenaltyFromBrier(decisionView?.calibrationStatus.brierScore ?? null) -
          (eventRisk === 'critical' ? 12 : eventRisk === 'elevated' ? 6 : 0),
        20,
        92,
      ))
    : null

  const hardGates: SignalTransparency['hardGates'] = [
    {
      label: '样本门槛',
      status: metricsAvailable ? 'pass' : sampleSize >= 10 ? 'watch' : 'block',
      detail: decisionView?.backtestValidity.freezeReason ??
        (sampleSize > 0 ? `完整样本 ${sampleSize} 个` : '等待回测样本积累'),
    },
    {
      label: '数据源门槛',
      status: totalFactors < 1 ? 'watch' : sourceCoverage >= 0.68 ? 'pass' : sourceCoverage >= 0.45 ? 'watch' : 'block',
      detail: totalFactors < 1 ? '暂无多源上下文' : `${liveFactors}/${totalFactors} 个核心因子可参考`,
    },
    {
      label: '风控门槛',
      status: hasTradePlan && hasStopLoss ? 'pass' : hasTradePlan ? 'watch' : 'block',
      detail: hasStopLoss ? '已有入场/止损/目标约束' : '缺少完整止损边界',
    },
    {
      label: '事件/纪律门槛',
      status:
        eventRisk === 'critical' || psychologyAction === 'stand_down' || psychologyAction === 'review_only'
          ? 'block'
          : eventRisk === 'elevated' || psychologyAction === 'reduce_size'
            ? 'watch'
            : 'pass',
      detail: `${eventRiskLevelLabel(eventRisk)} · ${psychologyActionLabel(psychologyAction)}`,
    },
  ]

  const blockedCount = hardGates.filter((gate) => gate.status === 'block').length
  const verdict = decisionView
    ? executionStateLabel(decisionView.executionState)
    : blockedCount > 0
      ? '只观察'
      : '等待确认'

  return {
    probability,
    probabilityLabel: probabilityDisplay?.label ?? prediction.displayText,
    probabilityReason: probabilityDisplay?.reason ?? prediction.basis,
    winRate: metricsAvailable ? monitor?.winRate ?? null : null,
    calibrationConfidence,
    reliability,
    sampleSize,
    verdict,
    guardrail:
      decisionView?.singleCommand ??
      (blockedCount > 0
        ? '存在硬门槛未通过时，页面只给观察优先级，不应把它解读为可执行买入。'
        : '全部硬门槛通过后仍需分批、止损和仓位上限；概率代表历史相似条件下的倾向，不是确定性。'),
    hardGates,
  }
}

function calibrationPenaltyFromBrier(brierScore: number | null | undefined) {
  if (brierScore === null || brierScore === undefined || !Number.isFinite(brierScore)) {
    return 10
  }
  if (brierScore <= 0.22) {
    return 0
  }
  return Math.min(26, Math.round((brierScore - 0.22) * 220))
}

type NextActionRadarTone = 'block' | 'watch' | 'ready' | 'risk'

type NextActionRadarModel = {
  tone: NextActionRadarTone
  badge: string
  subtitle: string
  command: string
  items: Array<{
    label: string
    value: string
    detail: string
    tone: NextActionRadarTone
  }>
}

function buildNextActionRadar(
  signal: OpportunityInfo | null,
  transparency: SignalTransparency,
  timeframeMinutes: number,
): NextActionRadarModel {
  const decisionView = signal?.decisionView ?? null
  if (!decisionView) {
    return {
      tone: 'watch',
      badge: '等待数据',
      subtitle: '先等统一决策模型返回，再考虑任何操作。',
      command: transparency.guardrail,
      items: [
        {
          label: '入场触发',
          value: '未生成',
          detail: '当前没有可复核的触发价。',
          tone: 'watch',
        },
        {
          label: '放弃条件',
          value: '数据不足',
          detail: '缺少统一决策模型时，不生成纸面交易动作。',
          tone: 'block',
        },
        {
          label: '下一次复核',
          value: `${timeframeMinutes}分钟K收盘`,
          detail: '等待下一根K线和报价源同步刷新。',
          tone: 'watch',
        },
      ],
    }
  }

  const tone = decisionView.actionAllowed
    ? 'ready'
    : decisionView.executionState === 'trigger_missed' || decisionView.executionState === 'invalidated' || decisionView.executionState === 'no_trade'
      ? 'block'
      : 'watch'
  const trigger = decisionView.validatedLevels.trigger
  const stopLoss = decisionView.validatedLevels.stopLoss
  const riskReward = decisionView.riskRewardRatio
  const sampleText = `${decisionView.backtestValidity.completeSamples}/${decisionView.backtestValidity.minSamplesRequired}`
  const riskTone: NextActionRadarTone =
    riskReward === null || riskReward < 2
      ? 'block'
      : riskReward < 2.5
        ? 'watch'
        : 'ready'
  const sampleTone: NextActionRadarTone = decisionView.backtestValidity.metricsEnabled ? 'ready' : 'block'
  const triggerValue = decisionView.executionState === 'trigger_missed'
    ? '等回踩/新结构'
    : trigger.status === 'valid'
      ? formatMaybePrice(trigger.price)
      : '暂不触发'
  const triggerDetail = decisionView.executionState === 'trigger_missed'
    ? '触发区已经被价格越过，不把右侧反抽当作新买点。'
    : trigger.reason
  const abandonValue = stopLoss.status === 'valid'
    ? formatMaybePrice(stopLoss.price)
    : decisionView.executionState === 'invalidated'
      ? '计划失效'
      : '先不设单'
  const abandonDetail = stopLoss.status === 'valid'
    ? stopLoss.reason
    : decisionView.actionBlockedReason ?? stopLoss.reason
  const missingValue = decisionView.backtestValidity.metricsEnabled
    ? '样本达标'
    : `样本 ${sampleText}`
  const missingDetail = decisionView.backtestValidity.freezeReason ??
    decisionView.probabilityDisplay.reason ??
    '样本、校准或数据源未完全通过前，不显示精确概率。'
  const reviewText = buildNextReviewText(decisionView.updatedAt, timeframeMinutes)

  return {
    tone,
    badge: tone === 'ready' ? '可复核' : tone === 'block' ? '不追/禁冲动' : '等确认',
    subtitle: '像交易员盯盘便签一样，只保留下一步要看的硬条件。',
    command: decisionView.singleCommand,
    items: [
      {
        label: '入场触发',
        value: triggerValue,
        detail: triggerDetail,
        tone: trigger.status === 'valid' && decisionView.actionAllowed ? 'ready' : 'watch',
      },
      {
        label: '放弃条件',
        value: abandonValue,
        detail: abandonDetail,
        tone: stopLoss.status === 'valid' ? 'risk' : 'block',
      },
      {
        label: '需要补齐',
        value: missingValue,
        detail: missingDetail,
        tone: sampleTone,
      },
      {
        label: '风险约束',
        value: riskReward === null ? '赔率未知' : `${riskReward}:1`,
        detail: riskReward === null
          ? '没有完整赔率时，不形成可执行买点。'
          : riskReward >= 2.5
            ? '赔率满足强观察底线，但仍要通过触发、样本和事件门槛。'
            : riskReward >= 2
              ? '仅够观察，不足以放大为强提醒。'
              : '低于 2:1，优先止盈/降仓或等待新结构。',
        tone: riskTone,
      },
      {
        label: '下一次复核',
        value: `${timeframeMinutes}分钟K收盘`,
        detail: reviewText,
        tone: 'watch',
      },
    ],
  }
}

function buildNextReviewText(updatedAt: string, timeframeMinutes: number) {
  const intervalMinutes = Number.isFinite(timeframeMinutes) && timeframeMinutes > 0
    ? timeframeMinutes
    : 5
  const baseMs = new Date(updatedAt).getTime()
  if (!Number.isFinite(baseMs)) {
    return '等待下一根K线收盘后复核，不看盘中噪音追单。'
  }
  const intervalMs = intervalMinutes * 60 * 1000
  const nextMs = Math.ceil((baseMs + 1) / intervalMs) * intervalMs
  return `约 ${formatDateTime(new Date(nextMs).toISOString())} 后复核；未收盘前只观察，不追价。`
}

function buildEventMacroBroadcast(signal: OpportunityInfo | null, v4Evidence?: V4EvidenceBundle) {
  const risk = signal?.eventRisk ?? null
  const context = signal?.marketContext ?? null
  const evidence = context?.macroRegimeEvidence ?? null
  const sourceLedger = v4Evidence?.decisionEvidence?.sourceLedger ?? signal?.decisionView?.sourceLedger ?? null
  const eventIntelligence = v4Evidence?.eventIntelligence ?? null
  const eventItem = buildEventBroadcastItem(risk, eventIntelligence)
  const macroItem = buildMacroBroadcastItem(evidence)
  const sentimentItem = buildSentimentBroadcastItem(context?.sentiment?.news ?? null)
  const sourceItem = buildSourceBroadcastItem(sourceLedger)
  const items = [eventItem, macroItem, sentimentItem, sourceItem]
    .filter((item): item is EventMacroBroadcastItem => Boolean(item))
    .slice(0, 4)
  const hasBlock = items.some((item) => item.tone === 'block') ||
    (eventIntelligence?.current.level ?? risk?.level) === 'critical' ||
    (eventIntelligence?.current.level ?? risk?.level) === 'elevated' ||
    sourceLedger?.strongSignalEligible === false
  const hasWatch = hasBlock || items.some((item) => item.tone === 'watch') || evidence?.status === 'pressure' || evidence?.status === 'conflicted'
  const tone: EventMacroBroadcastTone = hasBlock
    ? 'block'
    : hasWatch
      ? 'watch'
      : evidence?.status === 'supportive'
        ? 'support'
        : 'neutral'
  const command = hasBlock
    ? '先降级观察：事件/宏观/数据源存在硬约束，禁止把技术形态当成新买点。'
    : hasWatch
      ? '等待确认：先看事件窗口和宏观方向是否缓和，再谈触发价。'
      : evidence?.status === 'supportive'
        ? '背景偏支持，但仍必须等价格触发、止损和赔率全部成立。'
        : '宏观未给出强方向，继续以价格结构、数据源和赔率为主。'

  return {
    tone,
    badge: tone === 'block' ? '不追/降级' : tone === 'watch' ? '等待确认' : tone === 'support' ? '背景支持' : '中性观察',
    subtitle: eventIntelligence?.activeItem
      ? `${eventPhaseLabel(eventIntelligence.activeItem.phase)} · ${sourceUsageShortLabel(eventIntelligence.activeItem.sourceUsage)}`
      : risk?.activeEvent
      ? `${eventPhaseLabel(risk.phase)} · ${risk.activeEvent.source === 'configured' ? '配置日历' : '估算窗口'}`
      : evidence
        ? `${getMacroRegimeStatusLabel(evidence.status)} · ${getSourceUsageLabel(evidence.sourceUsage)}`
        : '暂无高影响事件，继续观察数据源和价格结构。',
    command,
    items,
  }
}

function buildEventBroadcastItem(
  risk: EconomicEventRisk | null,
  eventIntelligence?: EventIntelligenceResponse | null,
): EventMacroBroadcastItem | null {
  const intelligenceItem = eventIntelligence?.activeItem ?? eventIntelligence?.items?.[0] ?? null
  if (intelligenceItem) {
    const item = intelligenceItem
    const isActive = eventIntelligence?.activeItem?.id === item.id
    return {
      id: `event-intel-${item.id}`,
      title: item.label,
      meta: `${formatDateTime(item.scheduledAt)} · ${formatEventDistance(item.minutesToEvent)} · ${sourceUsageShortLabel(item.sourceUsage)}`,
      detail: `${isActive ? eventIntelligence.summary : '未进入核心风控窗口，作为近期宏观观察日历。'} ${item.sourceBoundary}`,
      badge: item.isProductionEligible ? 'v4生产' : isActive ? 'v4参考' : '近期事件',
      tone: isActive && (item.riskLevel === 'critical' || item.riskLevel === 'elevated')
        ? 'block'
        : isActive && item.riskLevel === 'watch'
          ? 'watch'
          : 'neutral',
    }
  }
  if (!risk) {
    return null
  }
  const event = risk.activeEvent ?? risk.upcomingEvents?.[0] ?? null
  if (!event) {
    return {
      id: 'event-none',
      title: '暂无核心事件窗口',
      meta: `刷新 ${formatDateTime(risk.updatedAt)}`,
      detail: risk.summary,
      badge: '普通时段',
      tone: risk.level === 'none' ? 'neutral' : 'watch',
    }
  }
  const minutes = event.minutesToEvent
  const sourceLabel = event.source === 'configured' ? '配置日历' : '估算窗口'
  const timeText = minutes >= 0
    ? `${minutes} 分钟后`
    : `${Math.abs(minutes)} 分钟前`
  const tone: EventMacroBroadcastTone = risk.level === 'critical' || risk.level === 'elevated'
    ? 'block'
    : risk.level === 'watch'
      ? 'watch'
      : 'neutral'
  return {
    id: `event-${event.id}`,
    title: event.label,
    meta: `${formatDateTime(event.scheduledAt)} · ${timeText} · ${sourceLabel}`,
    detail: risk.warnings[0] ?? risk.summary,
    badge: event.source === 'estimated' ? '估算' : event.importance,
    tone,
  }
}

function formatEventDistance(minutes: number) {
  return minutes >= 0
    ? `${minutes} 分钟后`
    : `${Math.abs(minutes)} 分钟前`
}

function buildMacroBroadcastItem(evidence: MacroRegimeEvidence | null): EventMacroBroadcastItem | null {
  if (!evidence) {
    return null
  }
  const reason = evidence.opposingReasons[0] ?? evidence.supportingReasons[0] ?? evidence.sourceSummary
  const tone: EventMacroBroadcastTone = evidence.status === 'pressure' || evidence.status === 'conflicted'
    ? 'watch'
    : evidence.status === 'supportive'
      ? 'support'
      : 'neutral'
  const sourceLabel = evidence.isProductionEligible
    ? getSourceUsageLabel(evidence.sourceUsage)
    : evidence.sourceUsage === 'mirror_learning'
      ? '离线镜像'
      : getSourceUsageLabel(evidence.sourceUsage)
  return {
    id: 'macro-regime',
    title: `宏观：${getMacroRegimeStatusLabel(evidence.status)}`,
    meta: `${sourceLabel} · 置信 ${evidence.confidence}/100 · 影响 ${evidence.scoreImpact}`,
    detail: `${reason} 实际利率${getRealRateTrendLabel(evidence.realRateTrend)}，通胀${getInflationPhaseLabel(evidence.inflationPhase)}，汇率${getUsdCnyAlignmentLabel(evidence.usdCnyAlignment)}。`,
    badge: evidence.isProductionEligible ? '可参考' : '非实时',
    tone,
  }
}

function buildSentimentBroadcastItem(sentiment: SentimentFactor | null): EventMacroBroadcastItem | null {
  if (!sentiment) {
    return null
  }
  const tone: EventMacroBroadcastTone = sentiment.status !== 'live'
    ? 'neutral'
    : sentiment.score >= 58
      ? 'support'
      : sentiment.score <= 42
        ? 'watch'
        : 'neutral'
  const source = sentiment.sources[0]
  return {
    id: 'news-sentiment',
    title: '新闻情绪估算',
    meta: `${getMarketStatusLabel(sentiment.status)} · 置信 ${sentiment.confidence}/100 · ${sentiment.updatedAt ? formatDateTime(sentiment.updatedAt) : '时间缺失'}`,
    detail: source ? `${sentiment.summary} 例：${source}` : sentiment.summary,
    badge: 'RSS情绪',
    tone,
  }
}

function buildSourceBroadcastItem(ledger: SourceSlaLedger | null): EventMacroBroadcastItem | null {
  if (!ledger) {
    return null
  }
  const entries = Array.isArray(ledger.entries) ? ledger.entries : []
  const warning = ledger.warnings[0]
  return {
    id: 'source-sla-broadcast',
    title: '报价源与锚点',
    meta: `主交易价 ${currencyFormatter.format(ledger.tradePrice)} · ${entries.length} 个源`,
    detail: warning ?? ledger.summary,
    badge: ledger.strongSignalEligible ? '源通过' : '源降级',
    tone: ledger.strongSignalEligible ? 'support' : 'block',
  }
}

function executionStateLabel(state: DecisionViewModel['executionState']) {
  const labels: Record<DecisionViewModel['executionState'], string> = {
    no_trade: '禁止开仓',
    watch_only: '只观察',
    waiting_for_trigger: '等待触发',
    trigger_armed: '等待触发',
    trigger_missed: '机会已错过',
    invalidated: '计划失效',
    reduce_position: '止盈/降仓',
  }
  return labels[state]
}

function hardGateLabel(status: HardGateStatus) {
  if (status === 'pass') {
    return '通过'
  }
  if (status === 'watch') {
    return '复核'
  }
  return '拦截'
}

function sourceSlaTypeLabel(type: SourceSlaLedger['entries'][number]['sourceType']) {
  const labels: Record<SourceSlaLedger['entries'][number]['sourceType'], string> = {
    tradeable_source: '主交易源',
    reference_source: '校准参考',
    learning_only_mirror: '离线学习',
    disabled_source: '生产禁用',
  }
  return labels[type]
}

function sourceSlaHealthLabel(health: SourceSlaLedger['entries'][number]['health']) {
  const labels: Record<SourceSlaLedger['entries'][number]['health'], string> = {
    healthy: '健康',
    watch: '需复核',
    stale: '延迟',
    diverged: '偏离',
    missing: '缺失',
  }
  return labels[health]
}

function signalOutcomeLabel(outcome: SignalJournalEntry['outcome']) {
  const labels: Record<SignalJournalEntry['outcome'], string> = {
    pending: '等待结果',
    tp1_hit: 'TP1先达',
    stop_loss_hit: '止损先达',
    no_touch: '未触发',
    timeout: '超时',
    invalidated: '已失效',
  }
  return labels[outcome]
}

function failureReasonLabel(reason: SignalJournalEntry['failureReason']) {
  const labels: Record<SignalJournalEntry['failureReason'], string> = {
    pending: '持续观察',
    chasing_risk: '防追价',
    event_noise: '事件噪声',
    false_breakout: '假突破',
    pattern_failed: '形态失败',
    macro_pressure: '宏观逆风',
    source_health: '数据源拦截',
    timeframe_conflict: '周期冲突',
    poor_risk_reward: '赔率不足',
    model_disagreement: '模型分歧',
  }
  return labels[reason]
}

function buildChartPrediction(
  signal: OpportunityInfo | null,
  monitor: BacktestMonitor | null,
): ChartPrediction {
  const decisionView = signal?.decisionView ?? null
  if (signal?.canonicalForecast) {
    const probabilityDisplay = decisionView?.probabilityDisplay ?? null
    const calibratedProbability = probabilityDisplay?.mode === 'calibrated' &&
      probabilityDisplay.value !== null
      ? probabilityDisplay.value
      : null
    const showProbability = calibratedProbability !== null
    const probability = showProbability
      ? Math.round(calibratedProbability * 100)
      : Math.round(signal.canonicalForecast.probability.up * 100)
    return {
      upProbability: probability,
      downProbability: Math.max(0, 100 - probability),
      confidence: signal.canonicalForecast.probability.confidence,
      label: showProbability ? '校准概率' : probabilityDisplay?.label ?? '概率隐藏',
      basis: showProbability
        ? signal.canonicalForecast.successRate.label
        : probabilityDisplay?.reason ?? '样本或硬门槛未达标，不展示精确概率。',
      showProbability,
      displayText: showProbability ? formatProbability(probability) : probabilityDisplay?.label ?? '样本不足',
    }
  }
  const normalizedScore = normalizeScoreNumber(signal?.score) ?? 50
  const factorScore = normalizeScoreNumber(signal?.marketContext?.factorScore) ?? 50
  const valuationScore = normalizeScoreNumber(signal?.valuation?.score) ?? 50
  const backtestScore =
    !monitor?.metricsFrozen && typeof monitor?.winRate === 'number' && Number.isFinite(monitor.winRate)
      ? clamp(monitor.winRate * 100, 20, 80)
      : 50
  const consensus = signal?.expertConsensus
  const consensusBias = consensus
    ? consensus.action === 'accumulate'
      ? 8
      : consensus.action === 'watch'
        ? 3
        : consensus.action === 'avoid'
          ? -10
          : -2
    : 0
  const composite =
    normalizedScore * 0.36 +
    factorScore * 0.22 +
    valuationScore * 0.22 +
    backtestScore * 0.2 +
    consensusBias
  const upProbability = clamp(50 + (composite - 50) * 0.72, 18, 82)
  const riskPenalty = (signal?.risks.length ?? 0) > 1 ? 8 : 0
  const consensusConfidence = normalizeScoreNumber(consensus?.confidence) ?? 50
  const monitorReliability = monitor?.reliability ?? 45
  const confidence = clamp(
    42 +
      Math.abs(upProbability - 50) * 0.65 +
      (consensusConfidence - 50) * 0.18 +
      Math.min(16, monitorReliability * 0.18) +
      (monitor?.evaluatedSamples ? Math.min(8, monitor.evaluatedSamples / 2) : 0) -
      riskPenalty,
    35,
    86,
  )

  return {
    upProbability: Math.round(upProbability),
    downProbability: Math.round(100 - upProbability),
    confidence: Math.round(confidence),
    label: '多因子预测',
    basis: monitor?.evaluatedSamples
      ? '信号分、专家团、宏观因子、估值水位、选择性Walk-forward'
      : '信号分、专家团、宏观因子、估值水位',
    showProbability: false,
    displayText: '未校准倾向',
  }
}

function buildChartForecast(
  latestPrice: number | null,
  extremes: ChartExtremes,
  prediction: ChartPrediction,
  patterns: PatternSignal[],
  opportunity: OpportunityInfo | null,
): ChartForecast {
  if (opportunity?.canonicalForecast) {
    const forecast = opportunity.canonicalForecast
    return {
      intervalLow: forecast.priceInterval.low,
      intervalHigh: forecast.priceInterval.high,
      support: forecast.levels.support?.price ?? null,
      resistance: forecast.levels.resistance?.price ?? null,
      failurePrice: forecast.levels.invalidation?.price ?? forecast.levels.stopLoss?.price ?? null,
      successRate: forecast.successRate.value === null ? null : Math.round(forecast.successRate.value * 100),
      horizonLabel: `${forecast.horizonMinutes}分钟`,
      basis: forecast.priceInterval.basis,
    }
  }
  const anchor = latestPrice ?? extremes.low?.value ?? extremes.high?.value ?? null
  if (anchor === null) {
    return {
      intervalLow: null,
      intervalHigh: null,
      support: null,
      resistance: null,
      failurePrice: null,
      successRate: null,
      horizonLabel: '未来1-3个周期',
      basis: '等待足够价格样本后计算情景区间。',
    }
  }

  const windowRange = extremes.high && extremes.low
    ? Math.max(0, extremes.high.value - extremes.low.value)
    : 0
  const baseMove = Math.max(anchor * 0.0018, windowRange * 0.34, 0.18)
  const upsideMove = baseMove * clamp(prediction.upProbability / 52, 0.72, 1.62)
  const downsideMove = baseMove * clamp(prediction.downProbability / 52, 0.72, 1.62)
  const leadingPattern = patterns[0] ?? null
  const plan = opportunity?.tradePlan ?? null
  const support =
    plan?.entryZone?.low ??
    leadingPattern?.keyPrice ??
    extremes.low?.value ??
    null
  const resistance =
    plan?.takeProfit1 ??
    plan?.triggerPrice ??
    leadingPattern?.targetPrice ??
    leadingPattern?.necklinePrice ??
    extremes.high?.value ??
    null
  const failurePrice =
    plan?.stopLoss ??
    leadingPattern?.invalidationPrice ??
    null

  return {
    intervalLow: anchor - downsideMove,
    intervalHigh: anchor + upsideMove,
    support,
    resistance,
    failurePrice,
    successRate: null,
    horizonLabel: '未来1-3个周期',
    basis: leadingPattern
      ? `${leadingPattern.label}仅作为结构提示；暂无后端 TP1 先达校准，失效价优先于目标价。`
      : '按窗口波动、模型倾向和当前价推演，仅用于观察区间；暂无后端 TP1 先达校准。',
  }
}

function buildChartSignal(signal: OpportunityInfo | null, prediction: ChartPrediction): ChartSignal {
  const decisionView = signal?.decisionView ?? null
  if (decisionView) {
    if (decisionView.executionState === 'trigger_missed') {
      return {
        tone: 'wait',
        label: '机会已错过 · 不追',
        detail: decisionView.singleCommand,
      }
    }
    if (decisionView.executionState === 'invalidated') {
      return {
        tone: 'risk',
        label: '计划失效',
        detail: decisionView.singleCommand,
      }
    }
    if (decisionView.action === 'avoid' || decisionView.displayGrade === 'blocked') {
      return {
        tone: 'risk',
        label: '只观察 · 不开新仓',
        detail: decisionView.blockerSummary,
      }
    }
    if (decisionView.action === 'wait' || decisionView.displayGrade === 'low') {
      return {
        tone: 'wait',
        label: '等待确认',
        detail: decisionView.primaryInstruction,
      }
    }
    if (decisionView.canAct) {
      return {
        tone: 'buy',
        label: '强复核 · 等触发执行',
        detail: `触发 ${formatMaybePrice(decisionView.triggerPrice)}，止损 ${formatMaybePrice(decisionView.stopLoss)}，TP1 ${formatMaybePrice(decisionView.takeProfit1)}。`,
      }
    }
    return {
      tone: 'watch',
      label: decisionView.executionState === 'waiting_for_trigger' || decisionView.executionState === 'trigger_armed'
        ? '候选买点 · 等触发'
        : '观察信号 · 不追价',
      detail: decisionView.singleCommand,
    }
  }
  const consensusAction = signal?.expertConsensus?.action
  const score = normalizeScoreNumber(signal?.score)

  if (consensusAction === 'avoid' || (score !== null && score <= 35)) {
    return {
      tone: 'risk',
      label: '卖点/风险观察',
      detail: prediction.showProbability
        ? `TP1先达倾向 ${formatProbability(prediction.upProbability)}，控制仓位或等待回落确认。`
        : `${prediction.displayText}，控制仓位或等待回落确认。`,
    }
  }

  if (signal?.level === 'strong' || consensusAction === 'accumulate' || prediction.upProbability >= 68) {
    return {
      tone: 'buy',
      label: signal?.level === 'strong' ? '强复核 · 等触发执行' : '观察增强',
      detail: prediction.showProbability
        ? `TP1先达概率 ${formatProbability(prediction.upProbability)}，仍需触发价、分批和止损纪律。`
        : `${prediction.displayText}，仍需触发价、分批和止损纪律。`,
    }
  }

  if (signal?.level === 'watch' || signal?.level === 'elevated' || prediction.upProbability >= 56) {
    return {
      tone: 'watch',
      label: '观察信号 · 不追价',
      detail: prediction.showProbability
        ? `TP1先达倾向 ${formatProbability(prediction.upProbability)}，等待更多数据源共振。`
        : `${prediction.displayText}，等待更多数据源共振。`,
    }
  }

  return {
    tone: 'wait',
    label: '等待信号',
    detail: prediction.showProbability
      ? `模型倾向 ${formatProbability(prediction.upProbability)}，当前更适合观察。`
      : `${prediction.displayText}，当前更适合观察。`,
  }
}

function countLiveMarketFactors(marketContext: MarketContext | null) {
  if (!marketContext) {
    return 0
  }
  return [
    marketContext.factors.spotGoldUsd,
    marketContext.factors.dollarIndex,
    marketContext.factors.usdCny,
    ...(marketContext.macroFactors ?? []),
  ].filter((factor) => factor.status === 'live' || factor.status === 'derived').length
}

function countTotalMarketFactors(marketContext: MarketContext | null) {
  if (!marketContext) {
    return 0
  }
  return 3 + (marketContext.macroFactors?.length ?? 0)
}

function buildLineExtremes(data: LineDatum[]): ChartExtremes {
  let high: ChartExtremePoint | null = null
  let low: ChartExtremePoint | null = null

  for (const point of data) {
    if (high === null || point.value > high.value) {
      high = { time: point.time, value: point.value }
    }
    if (low === null || point.value < low.value) {
      low = { time: point.time, value: point.value }
    }
  }

  return { high, low }
}

function buildCandleExtremes(data: CandleDatum[]): ChartExtremes {
  let high: ChartExtremePoint | null = null
  let low: ChartExtremePoint | null = null

  for (const candle of data) {
    if (high === null || candle.high > high.value) {
      high = { time: candle.time, value: candle.high }
    }
    if (low === null || candle.low < low.value) {
      low = { time: candle.time, value: candle.low }
    }
  }

  return { high, low }
}

function buildLineMarkers(
  data: LineDatum[],
  extremes: ChartExtremes,
  signal: ChartSignal,
  patterns: PatternSignal[],
  tradeOverlay: TradeOverlayMarker | null,
): SeriesMarker<UTCTimestamp>[] {
  const latest = data[data.length - 1]
  return buildCommonMarkers(latest?.time ?? null, latest?.value ?? null, extremes, signal, patterns, tradeOverlay)
}

function buildCandleMarkers(
  data: CandleDatum[],
  extremes: ChartExtremes,
  signal: ChartSignal,
  patterns: PatternSignal[],
  tradeOverlay: TradeOverlayMarker | null,
): SeriesMarker<UTCTimestamp>[] {
  const latest = data[data.length - 1]
  return buildCommonMarkers(latest?.time ?? null, latest?.close ?? null, extremes, signal, patterns, tradeOverlay)
}

function buildCommonMarkers(
  latestTime: UTCTimestamp | null,
  latestPrice: number | null,
  extremes: ChartExtremes,
  signal: ChartSignal,
  patterns: PatternSignal[],
  tradeOverlay: TradeOverlayMarker | null,
): SeriesMarker<UTCTimestamp>[] {
  const markers: SeriesMarker<UTCTimestamp>[] = []

  if (extremes.high) {
    markers.push({
      id: 'window-high',
      time: extremes.high.time,
      position: 'atPriceTop',
      price: extremes.high.value,
      color: '#dc2626',
      shape: 'circle',
      text: `H ${currencyFormatter.format(extremes.high.value)}`,
      size: 1.2,
    })
  }

  if (extremes.low) {
    markers.push({
      id: 'window-low',
      time: extremes.low.time,
      position: 'atPriceBottom',
      price: extremes.low.value,
      color: '#078466',
      shape: 'circle',
      text: `L ${currencyFormatter.format(extremes.low.value)}`,
      size: 1.2,
    })
  }

  if (latestTime !== null && latestPrice !== null) {
    const isRisk = signal.tone === 'risk'
    markers.push({
      id: 'current-signal',
      time: latestTime,
      position: isRisk ? 'aboveBar' : 'belowBar',
      color: chartSignalColor(signal.tone),
      shape: isRisk ? 'arrowDown' : signal.tone === 'wait' ? 'square' : 'arrowUp',
      text: signal.label,
      size: signal.tone === 'buy' || signal.tone === 'risk' ? 1.55 : 1.25,
    })
  }

  if (tradeOverlay) {
    const isBuy = tradeOverlay.side === 'buy'
    markers.push({
      id: tradeOverlay.id,
      time: tradeOverlay.time,
      position: isBuy ? 'atPriceBottom' : 'atPriceTop',
      price: tradeOverlay.value,
      color: isBuy ? '#16a34a' : '#dc2626',
      shape: 'circle',
      text: '',
      size: 1.65,
    })
  }

  for (const pattern of patterns.slice(0, 3)) {
    const time = toUtcTimestamp(pattern.detectedAt)
    if (time === null) {
      continue
    }
    const isBullish = pattern.direction === 'bullish'
    markers.push({
      id: pattern.id,
      time,
      position: isBullish ? 'belowBar' : 'aboveBar',
      color: patternColor(pattern.direction),
      shape: isBullish ? 'arrowUp' : 'arrowDown',
      text: `${pattern.label} ${pattern.confidence}%`,
      size: 1.35,
    })
  }

  return markers.sort((left, right) => Number(left.time) - Number(right.time))
}

function buildLineTradeOverlayMarker(
  data: LineDatum[],
  opportunity: OpportunityInfo | null,
): TradeOverlayMarker | null {
  const decision = buildTradeDecisionMarker(opportunity)
  if (!decision) {
    return null
  }
  const point = findLineTradeMarkerPoint(data, decision)
  return point ? { ...decision, time: point.time, value: point.value } : null
}

function buildCandleTradeOverlayMarker(
  data: CandleDatum[],
  opportunity: OpportunityInfo | null,
): TradeOverlayMarker | null {
  const decision = buildTradeDecisionMarker(opportunity)
  if (!decision) {
    return null
  }
  const point = findCandleTradeMarkerPoint(data, decision)
  return point ? { ...decision, time: point.time, value: point.value } : null
}

function buildTradeDecisionMarker(opportunity: OpportunityInfo | null): TradeDecisionMarker | null {
  const decisionView = opportunity?.decisionView ?? null
  const tradePlan = opportunity?.tradePlan ?? null
  const finalDecision = opportunity?.finalDecision ?? null

  if (
    decisionView?.executionState === 'reduce_position' ||
    tradePlan?.action === 'take_profit_or_reduce' ||
    finalDecision?.action === 'reduce'
  ) {
    return {
      id: 'trade-decision-sell',
      side: 'sell',
      label: 'SELL',
      variant: 'exit',
      targetPrice: firstFinitePrice(decisionView?.takeProfit1, tradePlan?.takeProfit1, tradePlan?.triggerPrice),
      reason: decisionView?.singleCommand ?? tradePlan?.actionLabel ?? finalDecision?.actionLabel ?? '止盈/降仓',
    }
  }

  if (!decisionView) {
    return null
  }

  if (
    decisionView.executionState === 'trigger_missed' ||
    decisionView.executionState === 'invalidated' ||
    decisionView.action === 'avoid' ||
    decisionView.displayGrade === 'blocked' ||
    !decisionView.actionAllowed
  ) {
    return {
      id: 'trade-decision-risk-sell',
      side: 'sell',
      label: 'SELL',
      variant: 'risk',
      targetPrice: firstFinitePrice(decisionView.takeProfit1, tradePlan?.takeProfit1, decisionView.triggerPrice, tradePlan?.triggerPrice),
      reason: decisionView.singleCommand || decisionView.blockerSummary || '风险回避/不追价',
    }
  }

  const hasEnoughDecisionEvidence =
    decisionView.backtestValidity.metricsEnabled ||
    decisionView.calibrationStatus.sampleSize >= decisionView.backtestValidity.minSamplesRequired ||
    decisionView.calibrationStatus.sampleStatus === 'usable' ||
    decisionView.calibrationStatus.sampleStatus === 'robust'
  const triggerArmed = decisionView.executionState === 'trigger_armed' && decisionView.actionAllowed
  const canMarkBuy = (decisionView.canAct || triggerArmed) &&
    hasEnoughDecisionEvidence

  if (!canMarkBuy) {
    return null
  }

  return {
    id: 'trade-decision-buy',
    side: 'buy',
    label: 'BUY',
    variant: 'entry',
    targetPrice: firstFinitePrice(decisionView.triggerPrice, tradePlan?.triggerPrice),
    reason: decisionView.singleCommand,
  }
}

function findLineTradeMarkerPoint(
  data: LineDatum[],
  marker: TradeDecisionMarker,
): ChartExtremePoint | null {
  const latest = data[data.length - 1]
  if (!latest) {
    return null
  }
  if (marker.variant === 'risk') {
    return findRecentLineResistancePoint(data)
  }
  const targetPrice = marker.targetPrice
  if (targetPrice === null) {
    return { time: latest.time, value: latest.value }
  }

  let nearest = latest
  let nearestDistance = Math.abs(latest.value - targetPrice)
  for (const point of data) {
    const distance = Math.abs(point.value - targetPrice)
    if (distance < nearestDistance) {
      nearest = point
      nearestDistance = distance
    }
  }
  return { time: nearest.time, value: nearest.value }
}

function findCandleTradeMarkerPoint(
  data: CandleDatum[],
  marker: TradeDecisionMarker,
): ChartExtremePoint | null {
  const latest = data[data.length - 1]
  if (!latest) {
    return null
  }
  if (marker.variant === 'risk') {
    return findRecentCandleResistancePoint(data)
  }
  const targetPrice = marker.targetPrice
  if (targetPrice === null) {
    return { time: latest.time, value: latest.close }
  }

  let nearest = latest
  let nearestDistance = candleDistanceToPrice(latest, targetPrice)
  for (const candle of data) {
    const distance = candleDistanceToPrice(candle, targetPrice)
    if (distance < nearestDistance) {
      nearest = candle
      nearestDistance = distance
    }
  }

  return {
    time: nearest.time,
    value: clamp(targetPrice, nearest.low, nearest.high),
  }
}

function findRecentLineResistancePoint(data: LineDatum[]) {
  const window = data.slice(-Math.min(48, Math.max(12, data.length)))
  if (window.length < 1) {
    return null
  }
  let resistance = window[0]
  for (const point of window) {
    if (point.value >= resistance.value) {
      resistance = point
    }
  }
  const latest = data[data.length - 1]
  if (latest && latest.value > resistance.value * 0.998) {
    return { time: latest.time, value: latest.value }
  }
  return { time: resistance.time, value: resistance.value }
}

function findRecentCandleResistancePoint(data: CandleDatum[]) {
  const window = data.slice(-Math.min(48, Math.max(12, data.length)))
  if (window.length < 1) {
    return null
  }
  let resistance = window[0]
  for (const candle of window) {
    if (candle.high >= resistance.high) {
      resistance = candle
    }
  }
  const latest = data[data.length - 1]
  if (latest && latest.close > resistance.high * 0.998) {
    return { time: latest.time, value: latest.close }
  }
  return { time: resistance.time, value: resistance.high }
}

function candleDistanceToPrice(candle: CandleDatum, targetPrice: number) {
  if (targetPrice >= candle.low && targetPrice <= candle.high) {
    return 0
  }
  return Math.min(
    Math.abs(candle.open - targetPrice),
    Math.abs(candle.high - targetPrice),
    Math.abs(candle.low - targetPrice),
    Math.abs(candle.close - targetPrice),
  )
}

function firstFinitePrice(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
  }
  return null
}

function addExtremePriceLines(
  series: {
    createPriceLine: (options: {
      price: number
      color: string
      lineWidth: 1
      lineStyle: LineStyle
      axisLabelVisible: boolean
      title: string
    }) => unknown
  },
  extremes: ChartExtremes,
) {
  if (extremes.high) {
    series.createPriceLine({
      price: extremes.high.value,
      color: '#dc2626',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    })
  }

  if (extremes.low) {
    series.createPriceLine({
      price: extremes.low.value,
      color: '#078466',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    })
  }
}

function addPatternPriceLines(
  series: {
    createPriceLine: (options: {
      price: number
      color: string
      lineWidth: 1
      lineStyle: LineStyle
      axisLabelVisible: boolean
      title: string
    }) => unknown
  },
  patterns: PatternSignal[],
) {
  for (const pattern of patterns.slice(0, 2)) {
    if (pattern.necklinePrice !== null) {
      series.createPriceLine({
        price: pattern.necklinePrice,
        color: '#7c3aed',
        lineWidth: 1,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: false,
        title: '',
      })
    }
    if (pattern.invalidationPrice !== null) {
      series.createPriceLine({
        price: pattern.invalidationPrice,
        color: pattern.direction === 'bullish' ? '#078466' : '#dc2626',
        lineWidth: 1,
        lineStyle: LineStyle.SparseDotted,
        axisLabelVisible: false,
        title: '',
      })
    }
  }
}

function addForecastPriceLines(
  series: {
    createPriceLine: (options: {
      price: number
      color: string
      lineWidth: 1
      lineStyle: LineStyle
      axisLabelVisible: boolean
      title: string
    }) => unknown
  },
  forecast: ChartForecast,
) {
  const lines = [
    { price: forecast.failurePrice, color: '#dc2626', title: '失效', style: LineStyle.LargeDashed, priority: 1 },
    { price: forecast.support, color: '#078466', title: '支撑', style: LineStyle.SparseDotted, priority: 2 },
    { price: forecast.resistance, color: '#d97706', title: '压力', style: LineStyle.SparseDotted, priority: 3 },
    { price: forecast.intervalHigh, color: '#1f5eff', title: '上沿', style: LineStyle.Dotted, priority: 4 },
    { price: forecast.intervalLow, color: '#1f5eff', title: '下沿', style: LineStyle.Dotted, priority: 5 },
  ].filter((line): line is {
    price: number
    color: string
    title: string
    style: LineStyle
    priority: number
  } => line.price !== null && Number.isFinite(line.price))
    .sort((left, right) => left.priority - right.priority)

  const visiblePrices: number[] = []
  const minVisibleGap = calculatePriceLineLabelGap(lines.map((line) => line.price))

  for (const line of lines) {
    const labelVisible = visiblePrices.every((price) => Math.abs(price - line.price) >= minVisibleGap)
    if (labelVisible) {
      visiblePrices.push(line.price)
    }
    series.createPriceLine({
      price: line.price,
      color: line.color,
      lineWidth: 1,
      lineStyle: line.style,
      axisLabelVisible: labelVisible,
      title: labelVisible ? line.title : '',
    })
  }
}

function calculatePriceLineLabelGap(prices: number[]) {
  if (prices.length < 2) {
    return 0
  }
  const sorted = [...prices].sort((left, right) => left - right)
  const range = sorted[sorted.length - 1] - sorted[0]
  return Math.max(0.45, range * 0.12)
}

function patternColor(direction: PatternSignal['direction']) {
  if (direction === 'bullish') {
    return '#d71920'
  }
  if (direction === 'bearish') {
    return '#078466'
  }
  return '#64748b'
}

function chartSignalColor(tone: ChartSignal['tone']) {
  if (tone === 'buy') {
    return '#d71920'
  }
  if (tone === 'risk') {
    return '#078466'
  }
  if (tone === 'watch') {
    return '#d97706'
  }
  return '#64748b'
}

function buildRenderableHistory(history: HistoryPoint[], quote: QuotePayload | null) {
  const points = [...history]
  if (quote) {
    const referenceFields = buildLatestReferenceHistoryFields(quote)
    points.push({
      price: quote.price,
      timestamp: quote.fetchedAt ?? quote.updatedAt,
      referenceAnchorPrice: quote.marketReference.calibration.anchorPrice,
      referenceAu9999Price: quote.marketReference.au9999?.latestPrice ?? null,
      referenceAutdPrice: quote.marketReference.autd?.latestPrice ?? null,
      ...referenceFields,
    })
  }

  const deduped = new Map<number, HistoryPoint>()
  for (const point of points) {
    const timestampMs = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestampMs) || !Number.isFinite(point.price)) {
      continue
    }
    deduped.set(timestampMs, point)
  }

  const sorted = [...deduped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])

  if (sorted.length !== 1) {
    return sorted
  }

  const onlyPoint = sorted[0]
  const timestampMs = new Date(onlyPoint.timestamp).getTime()
  return [
    {
      ...onlyPoint,
      timestamp: new Date(timestampMs - 60_000).toISOString(),
    },
    onlyPoint,
  ]
}

function buildChartSourceOptions(
  quote: QuotePayload | null,
  history: HistoryPoint[],
): ChartSourceOption[] {
  const hasHistoryValue = (selector: (point: HistoryPoint) => number | null | undefined) => {
    return history.some((point) => {
      const value = selector(point)
      return typeof value === 'number' && Number.isFinite(value) && value > 0
    })
  }
  const domesticReferences = quote?.marketReference.domesticReferences ?? []
  const zheshang = findReferenceQuote(domesticReferences, isZheshangReference)
  const domesticGold = findReferenceQuote(domesticReferences, (item) => item.symbol === 'JO_9753')
  const londonFactor = quote?.marketContext?.factors.spotGoldUsd ?? null

  return [
    chartSourceOption('icbc', true, quote?.price ?? null, '主行情有本地连续历史，可直接做分时/K线和技术指标。'),
    chartSourceOption(
      'consensus',
      hasHistoryValue((point) => point.referenceAnchorPrice),
      quote?.marketReference.consensusPrice ?? quote?.marketReference.calibration.anchorPrice ?? null,
      '多源校准价来自 AU9999/Au(T+D)/银行参考的锚点；仅在历史点含锚点时展示。',
    ),
    chartSourceOption(
      'au9999',
      hasHistoryValue((point) => point.referenceAu9999Price),
      quote?.marketReference.au9999?.latestPrice ?? null,
      'AU9999 需要上金所锚点进入历史点后才能形成分时/K线。',
    ),
    chartSourceOption(
      'autd',
      hasHistoryValue((point) => point.referenceAutdPrice),
      quote?.marketReference.autd?.latestPrice ?? null,
      'Au(T+D) 需要上金所锚点进入历史点后才能形成分时/K线。',
    ),
    chartSourceOption(
      'zheshang',
      hasHistoryValue((point) => point.referenceZheshangPrice),
      zheshang?.latestPrice ?? null,
      '浙商积存金来自第三方镜像参考源；有本地历史点后可切换分时/K线。',
    ),
    chartSourceOption(
      'domesticGold',
      hasHistoryValue((point) => point.referenceDomesticGoldPrice),
      domesticGold?.latestPrice ?? null,
      '金投网国内黄金参考价进入历史点后，可作为国内现货参考序列观察。',
    ),
    chartSourceOption(
      'london',
      hasHistoryValue((point) => point.referenceInternationalGoldPrice),
      londonFactor?.value ?? null,
      '国际金使用已接入的 GC=F/金投网国际金参考价，仅用于美元/盎司参考序列。',
    ),
  ]
}

function chartSourceOption(
  id: ChartSourceId,
  available: boolean,
  latestPrice: number | null | undefined,
  reason: string,
): ChartSourceOption {
  const meta = CHART_SOURCE_LABELS[id]
  return {
    id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    unit: meta.unit,
    available,
    latestPrice: typeof latestPrice === 'number' && Number.isFinite(latestPrice) ? latestPrice : null,
    reason,
  }
}

function projectHistoryForChartSource(history: HistoryPoint[], source: ChartSourceId): ChartHistoryProjection {
  const exactHistory = history
    .map((point): HistoryPoint | null => {
      const value = selectHistoryChartValue(point, source)
      if (value === null) {
        return null
      }
      return {
        ...point,
        price: value,
        referenceAnchorPrice: source === 'icbc' ? point.referenceAnchorPrice ?? null : null,
        referenceAu9999Price: source === 'icbc' ? point.referenceAu9999Price ?? null : null,
        referenceAutdPrice: source === 'icbc' ? point.referenceAutdPrice ?? null : null,
        referenceZheshangPrice: source === 'icbc' ? point.referenceZheshangPrice ?? null : null,
        referenceDomesticGoldPrice: source === 'icbc' ? point.referenceDomesticGoldPrice ?? null : null,
        referenceInternationalGoldPrice: source === 'icbc' ? point.referenceInternationalGoldPrice ?? null : null,
      }
    })
    .filter((point): point is HistoryPoint => point !== null)

  const exactPointCount = exactHistory.length
  const totalPointCount = history.length
  const coverage = totalPointCount > 0 ? exactPointCount / totalPointCount : 0

  if (source === 'icbc' || shouldUseNativeChartHistory(exactPointCount, totalPointCount)) {
    return {
      history: exactHistory,
      mode: 'native',
      exactPointCount,
      totalPointCount,
      coverage,
    }
  }

  const proxyHistory = buildProxyChartHistory(history, exactHistory, source)
  return {
    history: proxyHistory.length > exactHistory.length ? proxyHistory : exactHistory,
    mode: proxyHistory.length > exactHistory.length ? 'proxy' : 'native',
    exactPointCount,
    totalPointCount,
    coverage,
  }
}

function shouldUseNativeChartHistory(exactPointCount: number, totalPointCount: number) {
  if (totalPointCount <= 30) {
    return exactPointCount >= 2
  }
  return totalPointCount > 0 && exactPointCount / totalPointCount >= 0.7
}

function buildProxyChartHistory(
  history: HistoryPoint[],
  exactHistory: HistoryPoint[],
  source: ChartSourceId,
) {
  const latestExact = exactHistory[exactHistory.length - 1]
  if (!latestExact) {
    return exactHistory
  }

  const latestBase = history
    .slice()
    .reverse()
    .find((point) => Number.isFinite(point.price) && point.price > 0)
  if (!latestBase) {
    return exactHistory
  }

  const useRatio = source === 'london'
  const ratio = latestBase.price > 0 ? latestExact.price / latestBase.price : null
  const spread = latestExact.price - latestBase.price

  return history
    .map((point): HistoryPoint | null => {
      if (!Number.isFinite(point.price) || point.price <= 0) {
        return null
      }
      const exactValue = selectHistoryChartValue(point, source)
      const value = exactValue ?? (
        useRatio && ratio !== null && Number.isFinite(ratio)
          ? point.price * ratio
          : point.price + spread
      )
      if (!Number.isFinite(value) || value <= 0) {
        return null
      }
      return {
        ...point,
        price: value,
        referenceAnchorPrice: null,
        referenceAu9999Price: null,
        referenceAutdPrice: null,
        referenceZheshangPrice: null,
        referenceDomesticGoldPrice: null,
        referenceInternationalGoldPrice: null,
      }
    })
    .filter((point): point is HistoryPoint => point !== null)
}

function selectHistoryChartValue(point: HistoryPoint, source: ChartSourceId) {
  const value = source === 'icbc'
    ? point.price
    : source === 'consensus'
      ? point.referenceAnchorPrice
      : source === 'au9999'
        ? point.referenceAu9999Price
        : source === 'autd'
          ? point.referenceAutdPrice
          : source === 'zheshang'
            ? point.referenceZheshangPrice
            : source === 'domesticGold'
              ? point.referenceDomesticGoldPrice
              : source === 'london'
                ? point.referenceInternationalGoldPrice
                : null

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function projectQuoteForChartSource(quote: QuotePayload | null, source: ChartSourceId): QuotePayload | null {
  if (!quote) {
    return null
  }
  const value = selectQuoteChartValue(quote, source)
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return {
    ...quote,
    price: value,
    activePrice: value,
    regularPrice: value,
    sellPrice: value,
  }
}

function buildLatestReferenceHistoryFields(quote: QuotePayload) {
  const domesticReferences = quote.marketReference.domesticReferences ?? []
  return {
    referenceZheshangPrice: normalizeChartSourcePrice(
      findReferenceQuote(domesticReferences, isZheshangReference)?.latestPrice ?? null,
    ),
    referenceDomesticGoldPrice: normalizeChartSourcePrice(
      findReferenceQuote(domesticReferences, (item) => item.symbol === 'JO_9753')?.latestPrice ?? null,
    ),
    referenceInternationalGoldPrice: normalizeChartSourcePrice(
      quote.marketContext?.factors.spotGoldUsd.value ?? null,
    ),
  }
}

function selectQuoteChartValue(quote: QuotePayload, source: ChartSourceId) {
  const domesticReferences = quote.marketReference.domesticReferences ?? []
  const value = source === 'icbc'
    ? quote.price
    : source === 'consensus'
      ? quote.marketReference.consensusPrice ?? quote.marketReference.calibration.anchorPrice
      : source === 'au9999'
        ? quote.marketReference.au9999?.latestPrice
        : source === 'autd'
          ? quote.marketReference.autd?.latestPrice
          : source === 'zheshang'
            ? findReferenceQuote(domesticReferences, isZheshangReference)?.latestPrice
            : source === 'domesticGold'
              ? findReferenceQuote(domesticReferences, (item) => item.symbol === 'JO_9753')?.latestPrice
              : source === 'london'
                ? quote.marketContext?.factors.spotGoldUsd.value
                : null

  return normalizeChartSourcePrice(value ?? null)
}

function findReferenceQuote(
  references: ReferenceQuote[],
  matcher: (reference: ReferenceQuote) => boolean,
) {
  return references.find(matcher)
}

function isZheshangReference(reference: ReferenceQuote) {
  const text = `${reference.symbol} ${reference.label ?? ''} ${reference.provider ?? ''}`.toLowerCase()
  return text.includes('zheshang') || text.includes('浙商')
}

function normalizeChartSourcePrice(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null
}

function selectRecentHistory(history: HistoryPoint[], windowHours: number) {
  const latest = history[history.length - 1]
  if (!latest) {
    return history
  }

  const cutoff = new Date(latest.timestamp).getTime() - windowHours * 60 * 60 * 1000
  const sliced = history.filter((point) => new Date(point.timestamp).getTime() >= cutoff)
  return sliced.length >= 2 ? sliced : history
}

function buildIntradayData(history: HistoryPoint[], bucketMinutes: number, visibleBars: number) {
  const normalizedHistory = bucketHistoryLine(history, bucketMinutes)
  const allPrice = normalizedHistory
    .map((point) => ({
      time: toUtcTimestamp(point.timestamp),
      value: point.price,
    }))
    .filter((point) => point.time !== null) as LineDatum[]

  const price = selectVisibleLineData(allPrice, visibleBars)
  const firstVisibleTime = price[0]?.time ?? null
  const lastVisibleTime = price[price.length - 1]?.time ?? null

  const reference = normalizedHistory
    .map((point) => {
      const rawRefValue = point.referenceAnchorPrice ?? point.referenceAu9999Price ?? null
      const refValue = rawRefValue !== null && rawRefValue > 0 ? rawRefValue : null
      const time = toUtcTimestamp(point.timestamp)
      if (refValue === null || time === null) {
        return null
      }

      return {
        time,
        value: refValue,
      }
    })
    .filter((point): point is LineDatum => point !== null)
    .filter((point) => {
      if (firstVisibleTime === null || lastVisibleTime === null) {
        return true
      }
      return point.time >= firstVisibleTime && point.time <= lastVisibleTime
    })

  return { price, reference }
}

function selectVisibleLineData(data: LineDatum[], visibleBars: number) {
  const sorted = data.slice().sort((left, right) => Number(left.time) - Number(right.time))
  return sorted.slice(-visibleBars)
}

function bucketHistoryLine(history: HistoryPoint[], bucketMinutes: number) {
  const buckets = new Map<number, HistoryPoint>()
  for (const point of history) {
    const timestamp = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestamp)) {
      continue
    }
    const bucketStart = Math.floor(timestamp / (bucketMinutes * 60 * 1000)) * bucketMinutes * 60 * 1000
    buckets.set(bucketStart, {
      ...point,
      timestamp: new Date(bucketStart).toISOString(),
    })
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
}

function buildCandles(history: HistoryPoint[], bucketMinutes: number) {
  const buckets = new Map<number, CandleDatum>()

  for (const point of history) {
    const timestamp = new Date(point.timestamp).getTime()
    if (!Number.isFinite(timestamp)) {
      continue
    }

    const bucketStart =
      Math.floor(timestamp / (bucketMinutes * 60 * 1000)) * bucketMinutes * 60 * 1000
    const bucketTime = Math.floor(bucketStart / 1000) as UTCTimestamp
    const existing = buckets.get(bucketStart)

    if (!existing) {
      buckets.set(bucketStart, {
        time: bucketTime,
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
      })
      continue
    }

    existing.high = Math.max(existing.high, point.price)
    existing.low = Math.min(existing.low, point.price)
    existing.close = point.price
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
}

function mapServerCandles(candles: CandlePayload[] | undefined) {
  if (!candles) {
    return []
  }

  return candles
    .map((item) => {
      const time = toUtcTimestamp(item.timestamp)
      if (
        time === null ||
        !Number.isFinite(item.open) ||
        !Number.isFinite(item.high) ||
        !Number.isFinite(item.low) ||
        !Number.isFinite(item.close)
      ) {
        return null
      }

      return {
        time,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }
    })
    .filter((item): item is CandleDatum => item !== null)
}

function selectVisibleCandles(candles: CandleDatum[], visibleBars: number) {
  const sorted = candles.slice().sort((left, right) => Number(left.time) - Number(right.time))
  return sorted.slice(-visibleBars)
}

function mergeLatestQuoteIntoCandles(
  candles: CandleDatum[],
  quote: QuotePayload | null,
  bucketMinutes: number,
) {
  if (!quote || candles.length < 1 || !Number.isFinite(quote.price)) {
    return candles
  }

  const quoteTime = toUtcTimestamp(quote.fetchedAt ?? quote.updatedAt)
  if (quoteTime === null) {
    return candles
  }

  const bucketSeconds = Math.max(1, bucketMinutes) * 60
  const quoteBucketTime = (Math.floor(Number(quoteTime) / bucketSeconds) * bucketSeconds) as UTCTimestamp
  const nextCandles = candles.slice()
  const latestIndex = nextCandles.findIndex((item) => item.time === quoteBucketTime)

  if (latestIndex >= 0) {
    const candle = nextCandles[latestIndex]
    nextCandles[latestIndex] = {
      ...candle,
      high: Math.max(candle.high, quote.price),
      low: Math.min(candle.low, quote.price),
      close: quote.price,
    }
    return nextCandles
  }

  nextCandles.push({
    time: quoteBucketTime,
    open: quote.price,
    high: quote.price,
    low: quote.price,
    close: quote.price,
  })
  return nextCandles.sort((left, right) => Number(left.time) - Number(right.time))
}

function lineDataToSyntheticCandles(data: LineDatum[]) {
  return data.map((point) => ({
    time: point.time,
    open: point.value,
    high: point.value,
    low: point.value,
    close: point.value,
  }))
}

function buildMovingAverageData(candles: CandleDatum[], period: number) {
  if (candles.length < period) {
    return []
  }

  const result: LineDatum[] = []
  let rollingSum = 0

  for (let index = 0; index < candles.length; index += 1) {
    rollingSum += candles[index].close
    if (index >= period) {
      rollingSum -= candles[index - period].close
    }
    if (index >= period - 1) {
      result.push({
        time: candles[index].time,
        value: rollingSum / period,
      })
    }
  }

  return result
}

function latestLineValue(data: LineDatum[]) {
  return data[data.length - 1]?.value ?? null
}

function buildBollingerBands(
  candles: CandleDatum[],
  period: number,
  multiplier: number,
): BollingerBands {
  const upper: LineDatum[] = []
  const middle: LineDatum[] = []
  const lower: LineDatum[] = []

  if (candles.length < period) {
    return { upper, middle, lower }
  }

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1)
    const average = window.reduce((sum, item) => sum + item.close, 0) / period
    const variance =
      window.reduce((sum, item) => sum + (item.close - average) ** 2, 0) / period
    const deviation = Math.sqrt(variance)
    const time = candles[index].time

    upper.push({ time, value: average + deviation * multiplier })
    middle.push({ time, value: average })
    lower.push({ time, value: average - deviation * multiplier })
  }

  return { upper, middle, lower }
}

function buildRsiValue(candles: CandleDatum[], period: number) {
  if (candles.length <= period) {
    return null
  }

  let gains = 0
  let losses = 0
  const start = candles.length - period

  for (let index = start; index < candles.length; index += 1) {
    const previous = candles[index - 1]
    const current = candles[index]
    if (!previous || !current) {
      continue
    }
    const change = current.close - previous.close
    if (change >= 0) {
      gains += change
    } else {
      losses += Math.abs(change)
    }
  }

  if (losses === 0) {
    return 100
  }

  const relativeStrength = gains / losses
  return 100 - 100 / (1 + relativeStrength)
}

function buildMacdValue(candles: CandleDatum[]): MacdValue | null {
  if (candles.length < 35) {
    return null
  }

  const closes = candles.map((item) => item.close)
  const ema12 = buildEma(closes, 12)
  const ema26 = buildEma(closes, 26)
  const dif = closes.map((_close, index) => ema12[index] - ema26[index])
  const dea = buildEma(dif, 9)
  const latestIndex = closes.length - 1

  return {
    dif: dif[latestIndex],
    dea: dea[latestIndex],
    histogram: (dif[latestIndex] - dea[latestIndex]) * 2,
  }
}

function buildEma(values: number[], period: number) {
  const smoothing = 2 / (period + 1)
  const result: number[] = []

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (index === 0) {
      result.push(value)
      continue
    }
    result.push(value * smoothing + result[index - 1] * (1 - smoothing))
  }

  return result
}

function toUtcTimestamp(value: string) {
  const date = new Date(value)
  const ms = date.getTime()
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000) as UTCTimestamp
}

function buildChartVisibleRange(
  windowKind: ChartTimeWindowKind,
  data: Array<{ time: UTCTimestamp }>,
  customRange: ChartVisibleRange | null,
): ChartVisibleRange | null {
  const sorted = data
    .filter((item) => Number.isFinite(Number(item.time)))
    .sort((left, right) => Number(left.time) - Number(right.time))
  const first = sorted[0]?.time ?? null
  const latest = sorted[sorted.length - 1]?.time ?? null
  if (first === null || latest === null || latest <= first) {
    return null
  }

  if (windowKind === 'custom') {
    return customRange ? clampChartVisibleRange(customRange, first, latest) : null
  }
  if (windowKind === 'auto') {
    return null
  }

  const from = windowKind === 'since18'
    ? buildSinceHourTimestamp(latest, 18)
    : ((Number(latest) - (windowKind === '6h' ? 6 : 2) * 60 * 60) as UTCTimestamp)

  return clampChartVisibleRange({ from, to: latest }, first, latest)
}

function buildChartScrubberInfo(
  data: Array<{ time: UTCTimestamp }>,
  visibleRange: ChartVisibleRange | null,
): ChartScrubberInfo {
  const bounds = getChartTimeBounds(data)
  if (!bounds) {
    return {
      disabled: true,
      firstTime: null,
      latestTime: null,
      startPercent: 0,
      endPercent: 100,
      startLabel: '--',
      endLabel: '--',
      visibleLabel: '暂无可拖动数据',
      selectedStartLabel: '--',
      selectedEndLabel: '--',
    }
  }

  const from = visibleRange?.from ?? bounds.first
  const to = visibleRange?.to ?? bounds.latest
  const span = Math.max(1, Number(bounds.latest) - Number(bounds.first))
  const startPercent = Math.round(((Number(from) - Number(bounds.first)) / span) * 100)
  const endPercent = Math.round(((Number(to) - Number(bounds.first)) / span) * 100)

  return {
    disabled: false,
    firstTime: bounds.first,
    latestTime: bounds.latest,
    startPercent: Math.max(0, Math.min(99, startPercent)),
    endPercent: Math.max(1, Math.min(100, endPercent)),
    startLabel: formatTimestamp(bounds.first),
    endLabel: formatTimestamp(bounds.latest),
    visibleLabel: `${formatTimestamp(from)} → ${formatTimestamp(to)}`,
    selectedStartLabel: formatTimestamp(from),
    selectedEndLabel: formatTimestamp(to),
  }
}

function buildRangeFromScrubberInfo(
  info: ChartScrubberInfo,
  startPercent: number,
  endPercent: number,
) {
  if (info.disabled) {
    return null
  }
  const bounds = {
    first: info.firstTime,
    latest: info.latestTime,
  }
  if (bounds.first === null || bounds.latest === null) {
    return null
  }
  const span = Number(bounds.latest) - Number(bounds.first)
  if (span <= 0) {
    return null
  }
  const safeStart = Math.max(0, Math.min(99, startPercent))
  const safeEnd = Math.max(safeStart + 1, Math.min(100, endPercent))
  const from = Math.floor(Number(bounds.first) + span * (safeStart / 100)) as UTCTimestamp
  const to = Math.floor(Number(bounds.first) + span * (safeEnd / 100)) as UTCTimestamp
  return clampChartVisibleRange({ from, to }, bounds.first, bounds.latest)
}

function getChartTimeBounds(data: Array<{ time: UTCTimestamp }>) {
  const sorted = data
    .filter((item) => Number.isFinite(Number(item.time)))
    .sort((left, right) => Number(left.time) - Number(right.time))
  const first = sorted[0]?.time ?? null
  const latest = sorted[sorted.length - 1]?.time ?? null
  if (first === null || latest === null || latest <= first) {
    return null
  }
  return { first, latest }
}

function buildSinceHourTimestamp(latest: UTCTimestamp, hour: number) {
  const date = new Date(Number(latest) * 1000)
  date.setHours(hour, 0, 0, 0)
  if (Math.floor(date.getTime() / 1000) >= Number(latest)) {
    date.setDate(date.getDate() - 1)
  }
  return Math.floor(date.getTime() / 1000) as UTCTimestamp
}

function clampChartVisibleRange(
  range: ChartVisibleRange,
  first: UTCTimestamp,
  latest: UTCTimestamp,
) {
  const from = Math.max(Number(first), Number(range.from)) as UTCTimestamp
  const to = Math.min(Number(latest), Number(range.to)) as UTCTimestamp
  return to > from ? { from, to } : null
}

function applyChartVisibleRange(
  chart: ReturnType<typeof createChart>,
  range: ChartVisibleRange | null,
) {
  if (range) {
    chart.timeScale().setVisibleRange(range)
    return
  }
  chart.timeScale().fitContent()
}

function normalizeVisibleRange(range: { from: Time; to: Time }) {
  const from = chartTimeToTimestamp(range.from)
  const to = chartTimeToTimestamp(range.to)
  if (from === null || to === null || to <= from) {
    return null
  }
  return { from, to }
}

function chartTimeToTimestamp(value: Time): UTCTimestamp | null {
  if (typeof value === 'number') {
    return value as UTCTimestamp
  }
  if (typeof value === 'string') {
    return toUtcTimestamp(value)
  }
  const ms = Date.UTC(value.year, value.month - 1, value.day)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) as UTCTimestamp : null
}

function chartOptions(container: HTMLElement) {
  const size = getChartSize(container) ?? {
    width: Math.max(320, container.clientWidth),
    height: 320,
  }

  return {
    width: size.width,
    height: size.height,
    autoSize: false,
    attributionLogo: false,
    layout: {
      background: { type: ColorType.Solid, color: '#ffffff' },
      textColor: '#555b66',
      fontFamily: `'Avenir Next', 'PingFang SC', sans-serif`,
    },
    grid: {
      vertLines: { color: 'rgba(31, 41, 55, 0.06)' },
      horzLines: { color: 'rgba(31, 41, 55, 0.08)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: 'rgba(31, 41, 55, 0.16)',
      scaleMargins: {
        top: 0.08,
        bottom: 0.12,
      },
    },
    timeScale: {
      borderColor: 'rgba(31, 41, 55, 0.16)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
      tickMarkFormatter: (time: Time) => formatChartTimeLabel(time),
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
    localization: {
      priceFormatter: (value: number) => currencyFormatter.format(value),
      timeFormatter: (time: Time) => formatCrosshairTime(time),
    },
  } as const
}

function getChartSize(container: HTMLElement, rect?: DOMRectReadOnly) {
  const width = Math.floor(rect?.width ?? container.clientWidth)
  const height = Math.floor(rect?.height ?? container.clientHeight)
  if (width < 1 || height < 1) {
    return null
  }

  return { width, height }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function formatTimestamp(value: number) {
  return formatDateTime(new Date(value * 1000).toISOString())
}

function formatCrosshairTime(value: Time) {
  if (typeof value === 'number') {
    return formatTimestamp(value)
  }

  if (typeof value === 'object' && value !== null && 'year' in value) {
    const iso = new Date(value.year, value.month - 1, value.day).toISOString()
    return formatDateTime(iso)
  }

  return String(value)
}

function formatChartTimeLabel(value: Time) {
  if (typeof value === 'number') {
    const date = new Date(value * 1000)
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  if (typeof value === 'object' && value !== null && 'year' in value) {
    return `${String(value.month).padStart(2, '0')}/${String(value.day).padStart(2, '0')}`
  }

  return String(value)
}

function formatMaybePrice(value: number | null) {
  return value === null ? '--' : currencyFormatter.format(value)
}

function formatIndicator(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(2)
}

function formatSignedCurrency(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${currencyFormatter.format(value)}`
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${percentFormatter.format(value * 100)}%`
}

function formatNullablePercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return formatSignedPercent(value)
}

function formatNullablePercentUnsigned(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return `${percentFormatter.format(value * 100)}%`
}

function formatNullableRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(2)
}

function estimateCompleteSamples(bucket: BacktestBucket) {
  if (bucket.incompleteRate === null || bucket.incompleteRate === undefined || !Number.isFinite(bucket.incompleteRate)) {
    return bucket.winRate === null ? 0 : bucket.qualifiedSamples
  }
  return Math.max(0, Math.round(bucket.qualifiedSamples * (1 - bucket.incompleteRate)))
}

function formatProbability(value: number) {
  return `${Math.round(value)}%`
}

function formatMaybeProbability(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return formatProbability(value)
}

function normalizeScoreNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return clamp(value > 0 && value <= 1 ? value * 100 : value, 0, 100)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeOpportunity(quote: QuotePayload | null): OpportunityInfo | null {
  const raw = quote?.opportunity ?? quote?.buySignal ?? quote?.buy_signal ?? null
  if (!raw) {
    return null
  }

  const level = normalizeOpportunityLevel(raw.level)
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : null
  const summary =
    cleanText(raw.title) ??
    cleanText(raw.summary) ??
    cleanText(raw.reason) ??
    (level === 'strong' ? '强复核信号' : '观察复核信号')

  return {
    level,
    triggered: raw.triggered ?? level === 'strong',
    score,
    summary,
    reasons: normalizeTextList(raw.reasons ?? raw.reason ?? null),
    risks: normalizeTextList(raw.risks),
    expertOpinions: normalizeExpertOpinions(raw.expertOpinions),
    expertConsensus: normalizeExpertConsensus(raw.expertConsensus),
    marketContext: raw.marketContext ?? quote?.marketContext ?? null,
    valuation: raw.valuation ?? null,
    patternSignals: normalizePatternSignals(raw.patternSignals ?? quote?.patternSignals ?? null),
    tradePlan: normalizeTradePlan(raw.tradePlan),
    confluence: normalizeConfluence(raw.confluence),
    eventRisk: normalizeEventRisk(raw.eventRisk),
    psychology: normalizePsychology(raw.psychology),
    externalModelAdvisor: raw.externalModelAdvisor ?? null,
    canonicalForecast: normalizeCanonicalForecast(raw.canonicalForecast),
    decisionOverlay: normalizeDecisionOverlay(raw.decisionOverlay),
    finalDecision: normalizeFinalDecision(raw.finalDecision),
    decisionView: normalizeDecisionView(raw.decisionView),
  }
}

function normalizeFinalDecision(value: FinalDecision | null | undefined) {
  if (!value || typeof value.action !== 'string' || typeof value.signalGrade !== 'string') {
    return null
  }
  return value
}

function normalizeDecisionView(value: DecisionViewModel | null | undefined) {
  if (
    !value ||
    !['decision-view-v4', 'decision-view-v3', 'decision-view-v2'].includes(value.version) ||
    !value.probabilityDisplay
  ) {
    return null
  }
  const raw = value as Partial<DecisionViewModel>
  const fallbackLevelValidation = buildFallbackLevelValidation()
  const levelValidation = raw.levelValidation ?? fallbackLevelValidation
  const sourceHealth = raw.sourceHealth ?? {
    tradeSourceStatus: 'offline',
    referenceSourceStatus: 'missing',
    macroMirrorStatus: 'unknown',
    providerProbeStatus: 'missing',
    canUseForStrongSignal: false,
    warnings: ['决策视图缺少数据源健康详情，按不可强提醒处理。'],
  } satisfies DecisionViewModel['sourceHealth']
  return {
    ...value,
    version: 'decision-view-v3',
    displayGuards: Array.isArray(raw.displayGuards) ? raw.displayGuards : [],
    levelValidation,
    validatedLevels: raw.validatedLevels ?? levelValidation,
    sourceHealth: {
      ...sourceHealth,
      warnings: Array.isArray(sourceHealth.warnings) ? sourceHealth.warnings : [],
    },
    probabilityPolicy: value.probabilityPolicy ?? {
      status: value.probabilityDisplay.mode === 'calibrated' ? 'show_calibrated' : 'hide_precise',
      canShowPrecise: value.probabilityDisplay.mode === 'calibrated' && value.probabilityDisplay.value !== null,
      minSamplesRequired: 30,
      reason: value.probabilityDisplay.reason,
    },
    sourceLedger: value.sourceLedger ?? null,
    decisionEvidence: value.decisionEvidence ?? null,
    eventIntelligence: value.eventIntelligence ?? null,
    modelRegistry: value.modelRegistry ?? null,
    modelScorecard: value.modelScorecard ?? null,
    signalJournal: value.signalJournal ?? null,
    journalPreview: value.journalPreview ?? null,
  } satisfies DecisionViewModel
}

function buildFallbackLevelValidation(): DecisionViewModel['levelValidation'] {
  const item: LevelValidationItem = {
    price: null,
    status: 'missing',
    reason: '后端未返回该关键价校验，按不可执行处理。',
  }
  return {
    support: item,
    resistance: item,
    trigger: item,
    stopLoss: item,
    takeProfit1: item,
  }
}

function normalizeCanonicalForecast(value: CanonicalForecast | null | undefined) {
  if (!value || value.version !== 'canonical-forecast-v1' || typeof value.anchorPrice !== 'number') {
    return null
  }
  return value
}

function normalizeDecisionOverlay(value: DecisionOverlay | null | undefined) {
  if (!value || typeof value.version !== 'string' || typeof value.horizonMinutes !== 'number') {
    return null
  }
  return value
}

function normalizePsychology(value: PsychologyDiscipline | null | undefined) {
  if (!value || typeof value.summary !== 'string' || !Array.isArray(value.flags)) {
    return null
  }
  return value
}

function normalizeEventRisk(value: EconomicEventRisk | null | undefined) {
  if (!value || typeof value.summary !== 'string') {
    return null
  }
  return value
}

function normalizeConfluence(value: MultiTimeframeConfluence | null | undefined) {
  if (!value || !Array.isArray(value.frames)) {
    return null
  }
  return value
}

function eventRiskLevelLabel(level: EconomicEventRisk['level']) {
  if (level === 'critical') {
    return '高危'
  }
  if (level === 'elevated') {
    return '升高'
  }
  if (level === 'watch') {
    return '观察'
  }
  return '正常'
}

function eventPhaseLabel(phase: EconomicEventRisk['phase']) {
  if (phase === 'pre_event') {
    return '事件前'
  }
  if (phase === 'post_first_wave') {
    return '事件后第一波'
  }
  if (phase === 'post_confirmation') {
    return '二次确认期'
  }
  return '普通时段'
}

function psychologyActionLabel(action: PsychologyDiscipline['action']) {
  if (action === 'stand_down') {
    return '停止开仓'
  }
  if (action === 'review_only') {
    return '只复盘'
  }
  if (action === 'reduce_size') {
    return '降仓'
  }
  return '按计划'
}

function normalizeTradePlan(value: TradePlan | null | undefined) {
  if (!value || typeof value.actionLabel !== 'string') {
    return null
  }
  return value
}

function normalizePatternSignals(value: PatternSignal[] | null | undefined) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.confidence))
    .slice(0, 8)
}

function normalizeExpertOpinions(value: OpportunityPayload['expertOpinions']) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      action: item.action,
      stance: item.stance,
      confidence: Number.isFinite(item.confidence) ? item.confidence : 0,
      headline: item.headline,
      rationale: Array.isArray(item.rationale) ? item.rationale : [],
      risk: item.risk,
      methodTags: Array.isArray(item.methodTags) ? item.methodTags : [],
    }))
}

function normalizeExpertConsensus(value: OpportunityPayload['expertConsensus']) {
  if (!value) {
    return null
  }

  return {
    action: value.action,
    confidence: Number.isFinite(value.confidence) ? value.confidence : 0,
    summary: value.summary,
    bullishCount: Number.isFinite(value.bullishCount) ? value.bullishCount : 0,
    cautiousCount: Number.isFinite(value.cautiousCount) ? value.cautiousCount : 0,
  }
}

function normalizeOpportunityLevel(value: OpportunityPayload['level']): OpportunityLevel {
  const level = typeof value === 'string' ? value.toLowerCase() : value

  if (level === 'critical' || level === 'elevated' || level === 'strong' || level === 'watch') {
    return level
  }

  if (level === 'normal') {
    return 'normal'
  }

  return 'none'
}

function normalizeTextList(value: OpportunityPayload['reasons'] | OpportunityPayload['risks']) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter((item): item is string => Boolean(item))
  }

  const text = cleanText(value)
  return text ? [text] : []
}

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatScore(value: number | null) {
  if (value === null) {
    return '--'
  }

  const normalized = value > 0 && value <= 1 ? value * 100 : value
  const fractionDigits = Number.isInteger(normalized) ? 0 : 1
  return `${normalized.toFixed(fractionDigits)}/100`
}

function getOpportunityMeta(level: OpportunityLevel) {
  if (level === 'strong') {
    return {
      eyebrow: 'SETUP REVIEW',
      label: '强复核 · 等触发执行',
      tone: 'strong',
    } as const
  }

  if (level === 'critical' || level === 'elevated') {
    return {
      eyebrow: 'OBSERVATION SIGNAL',
      label: '重点观察',
      tone: 'elevated',
    } as const
  }

  if (level === 'watch') {
    return {
      eyebrow: 'OBSERVATION SIGNAL',
      label: '观察信号 · 不追价',
      tone: 'watch',
    } as const
  }

  if (level === 'normal') {
    return {
      eyebrow: 'SETUP REVIEW',
      label: '普通',
      tone: 'normal',
    } as const
  }

  return {
    eyebrow: 'WAIT',
    label: '等待信号',
    tone: 'muted',
  } as const
}

function getDecisionMeta(decisionView: DecisionViewModel | null, level: OpportunityLevel) {
  if (!decisionView) {
    return getOpportunityMeta(level)
  }
  if (decisionView.actionAllowed) {
    return {
      eyebrow: 'SETUP REVIEW',
      label: '强复核 · 等触发执行',
      tone: 'strong',
    } as const
  }
  if (decisionView.executionState === 'trigger_missed') {
    return {
      eyebrow: 'MISSED SETUP',
      label: '机会已错过 · 不追',
      tone: 'watch',
    } as const
  }
  if (decisionView.executionState === 'invalidated' || decisionView.executionState === 'no_trade') {
    return {
      eyebrow: 'RISK GATE',
      label: '禁止开仓',
      tone: 'elevated',
    } as const
  }
  if (decisionView.executionState === 'waiting_for_trigger' || decisionView.executionState === 'trigger_armed') {
    return {
      eyebrow: 'OBSERVATION SIGNAL',
      label: '等待触发 · 不追价',
      tone: 'watch',
    } as const
  }
  return {
    eyebrow: 'OBSERVATION SIGNAL',
    label: '只观察 · 不开新仓',
    tone: 'watch',
  } as const
}

const SOURCE_META: Record<SourceHealth, { label: string; detail: string }> = {
  live: {
    label: '实时',
    detail: '工银主报价在线',
  },
  stale: {
    label: '延迟',
    detail: '当前正在回退或最近刷新略旧',
  },
  offline: {
    label: '异常',
    detail: '当前展示最近成功结果',
  },
}

export default App
