export type QuoteSourceKind = 'official' | 'fallback'

export type SourceAvailability = 'unknown' | 'healthy' | 'down'

export type MarketReferenceQuote = {
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

export type MarketReference = {
  sourceName: string
  sourceUrl: string
  isDelayed: boolean
  tradingDate: string | null
  au9999: MarketReferenceQuote | null
  autd: MarketReferenceQuote | null
  domesticReferences?: MarketReferenceQuote[]
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

export type QuoteSourceUsage =
  | 'production_realtime'
  | 'reference_calibration'
  | 'mirror_learning'
  | 'disabled'

export type SourceSlaSourceType =
  | 'tradeable_source'
  | 'reference_source'
  | 'learning_only_mirror'
  | 'disabled_source'

export type SourceSlaHealth = 'healthy' | 'watch' | 'stale' | 'diverged' | 'missing'

export type QuoteSourceLedgerEntry = {
  sourceId: string
  label: string
  instrument: string
  tradable: boolean
  price: number | null
  timestamp: string | null
  marketSession: 'trading' | 'closed' | 'unknown'
  sourceUsage: QuoteSourceUsage
  freshnessMs: number | null
  confidence: 'high' | 'medium' | 'low'
  discrepancyFromTradePrice: number | null
  note: string
}

export type QuoteSourceLedger = {
  version: 'quote-source-ledger-v1'
  generatedAt: string
  tradeSourceId: string
  tradePrice: number
  consensus: {
    price: number | null
    deviationPercent: number | null
    status: 'aligned' | 'diverged' | 'unknown'
  }
  entries: QuoteSourceLedgerEntry[]
  warnings: string[]
}

export type SourceSlaLedgerEntry = {
  sourceId: string
  label: string
  sourceType: SourceSlaSourceType
  instrument: string
  price: number | null
  timestamp: string | null
  freshnessMs: number | null
  health: SourceSlaHealth
  discrepancyFromTradePrice: number | null
  canUseForStrongSignal: boolean
  note: string
}

export type SourceSlaLedger = {
  version: 'source-sla-ledger-v1'
  generatedAt: string
  tradeSourceId: string
  tradePrice: number
  strongSignalEligible: boolean
  summary: string
  entries: SourceSlaLedgerEntry[]
  warnings: string[]
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
  referenceZheshangPrice?: number | null
  referenceDomesticGoldPrice?: number | null
  referenceInternationalGoldPrice?: number | null
}

export type AlertLevel = 'normal' | 'watch' | 'elevated' | 'critical'

export type AlertInfo = {
  level: AlertLevel
  triggered: boolean
  thresholdPercent: number
  drawdownThresholdPercent: number
  reason: string
}

export type DataQualityLevel = 'excellent' | 'good' | 'degraded' | 'poor'

export type DataAnomaly = {
  code: string
  severity: 'warning' | 'critical'
  message: string
  observedAt: string
}

export type DataQualityInfo = {
  score: number
  level: DataQualityLevel
  summary: string
  checks: {
    fresh: boolean
    primarySource: boolean
    hasMarketAnchor: boolean
    historyReady: boolean
    anomalyFree: boolean
  }
  anomalies: DataAnomaly[]
}

export type OpportunityLevel = 'none' | 'watch' | 'strong'

export type ProbabilityHorizonMinutes = 5 | 15 | 60 | 240

export type ProbabilityModelFeatureSet = {
  observedAt: string
  sampleSize: number
  featureVersion: string
  values: Record<string, number | null>
  missing: string[]
}

export type ProbabilityTrainingLabel = {
  horizonMinutes: ProbabilityHorizonMinutes
  evaluatedAt: string
  entryPrice: number
  exitPrice: number
  returnPercent: number
  maxDrawdown: number
  maxFavorableExcursion: number
  barrierOutcome?: BarrierOutcome
  touchedAt?: string | null
  tp1Price?: number | null
  stopLossPrice?: number | null
  barsObserved?: number
  complete?: boolean
  positive: boolean
}

export type ProbabilityTrainingSample = {
  openedAt: string
  horizonMinutes: ProbabilityHorizonMinutes
  features: ProbabilityModelFeatureSet
  label: ProbabilityTrainingLabel
}

export type ProbabilityCalibrationBucket = {
  key: string
  lowerBound: number
  upperBound: number
  sampleSize: number
  averagePrediction: number | null
  observedWinRate: number | null
  brierScore: number | null
}

export type ProbabilityModelMetrics = {
  horizonMinutes: ProbabilityHorizonMinutes
  sampleSize: number
  positiveRate: number | null
  brierScore: number | null
  calibrationBuckets: ProbabilityCalibrationBucket[]
  summary: string
}

export type ProbabilityPrediction = {
  horizonMinutes: ProbabilityHorizonMinutes
  probability: number
  rawProbability: number
  confidence: number
  sampleSize: number
  brierScore: number | null
  calibrationBucketKey: string
  summary: string
}

export type ProbabilityModelSnapshot = {
  modelVersion: string
  generatedAt: string
  features: ProbabilityModelFeatureSet
  predictions: ProbabilityPrediction[]
  primaryPrediction: ProbabilityPrediction
  metrics: ProbabilityModelMetrics[]
  limitations: string[]
}

export type BacktestProbabilityMonitor = {
  modelVersion: string
  updatedAt: string
  horizons: ProbabilityModelMetrics[]
  summary: string
}

export type ExpertAction = 'accumulate' | 'watch' | 'wait' | 'avoid'

export type ExpertStance = 'bullish' | 'neutral' | 'cautious' | 'risk_off'

export type ExpertOpinion = {
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

export type ExpertConsensus = {
  action: ExpertAction
  confidence: number
  summary: string
  bullishCount: number
  cautiousCount: number
}

export type ExternalModelAdvisor = {
  id: string
  name: string
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
  backtestGate?: ExternalModelBacktestGate | null
  competitors?: ExternalModelAdvisor[]
}

export type MarketFactorImpact = 'supportive' | 'neutral' | 'pressure' | 'unknown'

export type MarketFactorStatus = 'live' | 'derived' | 'unavailable'

export type FactorCandleProductionUsage =
  | 'learning_only_mirror'
  | 'production_disabled'
  | 'production_eligible'

export type MarketFactorSourceUsage =
  | 'production_realtime'
  | 'mirror_learning'
  | 'production_disabled'
  | 'derived'
  | 'unknown'

export type FactorCandle = {
  symbol: string
  date: string
  time: string
  frequency: 'daily' | 'monthly' | 'weekly' | 'unknown'
  open: number
  high: number
  low: number
  close: number
  value: number
  source: string
  productionUsage: FactorCandleProductionUsage
  sourceUsage: MarketFactorSourceUsage
  isProductionEligible: boolean
}

export type MacroRegimeStatus = 'supportive' | 'neutral' | 'pressure' | 'conflicted' | 'unknown'

export type MacroRegimeEvidence = {
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

export type MarketFactor = {
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

export type SentimentFactor = {
  id: 'news' | 'blogger'
  label: string
  score: number
  confidence: number
  status: MarketFactorStatus
  summary: string
  sources: string[]
  updatedAt: string | null
}

export type BacktestHorizon = {
  label: string
  winRate: number | null
  averageReturn: number | null
  maxDrawdownAfterSignal: number | null
}

export type BacktestFactor = {
  status: MarketFactorStatus
  sampleSize: number
  summary: string
  horizons: BacktestHorizon[]
}

export type ValuationMetrics = {
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

export type BacktestSnapshot = {
  updatedAt: string
  quoteTimestamp: string
  price: number
  sampleOrigin?: 'live' | 'historical' | 'synthetic'
  signalScore: number
  signalLevel: OpportunityLevel
  backtest: BacktestFactor
  valuation: ValuationMetrics
  primaryPatternKind?: PatternKind | null
  confluenceScore?: number | null
  confluenceConflictLevel?: 'none' | 'mild' | 'severe' | null
  macroRegime?: 'supportive' | 'neutral' | 'pressure' | 'unknown'
  macroRegimeEvidenceStatus?: MacroRegimeStatus | null
  inflationPhase?: MacroRegimeEvidence['inflationPhase'] | null
  realRateTrend?: MacroRegimeEvidence['realRateTrend'] | null
  usdCnyAlignment?: MacroRegimeEvidence['usdCnyAlignment'] | null
  cmeBreakoutQuality?: MacroRegimeEvidence['cmeBreakoutQuality'] | null
  modelProbability?: number | null
  modelConfidence?: number | null
  externalModelStatus?: ExternalModelAdvisor['status'] | null
  externalModelProvider?: ExternalModelAdvisor['provider'] | null
  externalModelName?: string | null
  externalModelHorizonMinutes?: number | null
  externalModelUpProbability?: number | null
  externalModelConfidence?: number | null
  externalModelExpectedReturnPercent?: number | null
  externalModelCandidates?: ExternalModelAdvisor[]
  eventRiskLevel?: EconomicEventRisk['level'] | null
  psychologyLevel?: PsychologyDiscipline['level'] | null
  sourceHealth?: 'healthy' | 'stale' | 'down' | 'unknown'
}

export type WalkForwardSample = {
  openedAt: string
  evaluatedAt: string
  signalScore: number
  signalLevel: OpportunityLevel
  bucketKey?: string
  entryPrice: number
  exitPrice: number
  returnPercent: number
  maxDrawdown: number
  maxFavorableExcursion?: number
  barrierOutcome?: BarrierOutcome
  touchedAt?: string | null
  tp1Price?: number | null
  stopLossPrice?: number | null
  barsObserved?: number
  complete?: boolean
  failureReason?: string | null
}

export type BarrierOutcome = 'tp1_hit' | 'stop_loss_hit' | 'no_touch' | 'timeout'

export type TripleBarrierLabel = {
  horizonMinutes: number
  outcome: BarrierOutcome
  openedAt: string
  evaluatedAt: string
  touchedAt: string | null
  entryPrice: number
  exitPrice: number
  returnPercent: number
  maxDrawdown: number
  maxFavorableExcursion: number
  tp1Price: number
  stopLossPrice: number
  barsObserved: number
  complete: boolean
  positive: boolean
}

export type BacktestBucket = {
  key: string
  label: string
  dimension:
    | 'signal'
    | 'score'
    | 'valuation'
    | 'session'
    | 'pattern'
    | 'macro'
    | 'confluence'
    | 'macro_regime'
    | 'inflation_phase'
    | 'real_rate_trend'
    | 'usd_cny_alignment'
    | 'cme_breakout_quality'
  sampleSize: number
  qualifiedSamples: number
  completeQualifiedSamples?: number
  metricsFrozen?: boolean
  freezeReason?: string | null
  winRate: number | null
  baselineWinRate: number | null
  averageReturn: number | null
  profitFactor: number | null
  maxDrawdown: number | null
  mae: number | null
  mfe: number | null
  tp1HitRate?: number | null
  stopLossHitRate?: number | null
  noTouchRate?: number | null
  timeoutRate?: number | null
  incompleteRate?: number | null
  reliability: number
  summary: string
}

export type FailureAttribution = {
  reason: string
  label: string
  count: number
  ratio: number
}

export type ExternalModelBucketDimension =
  | 'model_probability'
  | 'model_confidence'
  | 'model_vs_local'
  | 'session'
  | 'pattern'
  | 'event'
  | 'confluence'
  | 'macro'
  | 'macro_regime'
  | 'inflation_phase'
  | 'real_rate_trend'
  | 'usd_cny_alignment'
  | 'cme_breakout_quality'
  | 'valuation'
  | 'source_health'
  | 'horizon'
  | 'provider'

export type ExternalModelBacktestBucket = {
  key: string
  label: string
  dimension: ExternalModelBucketDimension
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
  reliability: number
  summary: string
}

export type ExternalModelBacktestMonitor = {
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

export type ExternalModelBacktestGate = {
  status: 'strong' | 'neutral' | 'weak' | 'insufficient'
  weightMultiplier: number
  matchedBucketKeys: string[]
  matchedStrongBuckets: string[]
  matchedWeakBuckets: string[]
  summary: string
}

export type BacktestMonitor = {
  updatedAt: string
  horizonMinutes: number
  sampleSize: number
  allEvaluatedSamples: number
  evaluatedSamples: number
  completeEvaluatedSamples: number
  metricsFrozen: boolean
  freezeReason: string | null
  signalThreshold: number
  winRate: number | null
  baselineWinRate: number | null
  averageReturn: number | null
  expectancy: number | null
  profitFactor: number | null
  reliability: number
  sortinoRatio: number | null
  informationRatio: number | null
  maxDrawdown: number | null
  buckets: BacktestBucket[]
  probabilityModel: BacktestProbabilityMonitor
  externalModel: ExternalModelBacktestMonitor
  failureSamples: WalkForwardSample[]
  incompleteSampleRate: number | null
  failureAttribution: FailureAttribution[]
  summary: string
}

export type PatternKind =
  | 'double_bottom'
  | 'double_top'
  | 'support_rebound'
  | 'resistance_rejection'
  | 'hammer'
  | 'shooting_star'
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'doji'
  | 'morning_star'
  | 'evening_star'
  | 'bullish_harami'
  | 'bearish_harami'
  | 'three_white_soldiers'
  | 'three_black_crows'

export type PatternDirection = 'bullish' | 'bearish' | 'neutral'
export type PatternConfirmationStatus = 'candidate' | 'confirmed' | 'failed'

export type PatternSignal = {
  id: string
  kind: PatternKind
  label: string
  direction: PatternDirection
  confidence: number
  confirmationStatus?: PatternConfirmationStatus
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

export type KnowledgeRuleStatus = 'pass' | 'watch' | 'block'

export type KnowledgeRuleCheck = {
  id: string
  label: string
  status: KnowledgeRuleStatus
  reason: string
  impactScore: number
  theorySource?: string
}

export type KnowledgeRuleAudit = {
  version: string
  scoreAdjustment: number
  scoreCap: number
  checks: KnowledgeRuleCheck[]
  supportingReasons: string[]
  opposingReasons: string[]
  missingConfirmations: string[]
  invalidationWarnings: string[]
  features: Record<string, number | null>
  summary: string
}

export type TradePlanAction =
  | 'stand_aside'
  | 'observe'
  | 'probe'
  | 'confirm_then_enter'
  | 'take_profit_or_reduce'

export type TradePlanConfidence = 'low' | 'medium' | 'high'

export type TradePlan = {
  action: TradePlanAction
  actionLabel: string
  confidence: TradePlanConfidence
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

export type FinalDecisionAction =
  | 'avoid'
  | 'wait'
  | 'watch'
  | 'probe'
  | 'confirm_then_enter'
  | 'reduce'

export type FinalDecisionGate = {
  id: string
  label: string
  status: 'pass' | 'watch' | 'block'
  reason: string
}

export type FinalDecision = {
  action: FinalDecisionAction
  actionLabel: string
  signalGrade: 'blocked' | 'low' | 'watch' | 'qualified' | 'strong_watch'
  strongReminderAllowed: boolean
  userAdvice: string
  beginnerAdvice: string
  blockedReasons: string[]
  downgradeReasons: string[]
  hardGates: FinalDecisionGate[]
  confidenceGrade: 'unverified' | 'low' | 'medium' | 'high'
  confidenceExplanation: string
  accuracyExplanation: string
  sampleStatus: 'insufficient' | 'warming_up' | 'usable' | 'robust'
}

export type DecisionOverlaySource =
  | 'external_model'
  | 'local_probability'
  | 'trade_plan'
  | 'pattern_structure'

export type DecisionOverlay = {
  version: string
  generatedAt: string
  source: DecisionOverlaySource
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

export type ProbabilityDisplayMode = 'hidden' | 'tendency' | 'calibrated'

export type CalibrationStatus = {
  sampleSize: number
  brierScore: number | null
  sampleStatus: FinalDecision['sampleStatus']
  canShowNumericProbability: boolean
  reason: string
}

export type DecisionProbabilityDisplay = {
  mode: ProbabilityDisplayMode
  value: number | null
  label: string
  reason: string
}

export type ProbabilityDisplayPolicy = {
  status: 'show_calibrated' | 'hide_precise' | 'tendency_only'
  canShowPrecise: boolean
  minSamplesRequired: number
  reason: string
}

export type ExecutionState =
  | 'no_trade'
  | 'watch_only'
  | 'waiting_for_trigger'
  | 'trigger_armed'
  | 'trigger_missed'
  | 'invalidated'
  | 'reduce_position'

export type BacktestValidity = {
  completeSamples: number
  incompleteSampleRate: number | null
  metricsEnabled: boolean
  freezeReason: string | null
  minSamplesRequired: number
}

export type SourceHealthViewModel = {
  tradeSourceStatus: 'live' | 'stale' | 'fallback' | 'offline'
  referenceSourceStatus: 'live' | 'partial' | 'missing' | 'diverged'
  macroMirrorStatus: 'learning_only' | 'production_eligible' | 'disabled' | 'unknown'
  providerProbeStatus: 'live' | 'partial' | 'missing'
  canUseForStrongSignal: boolean
  warnings: string[]
}

export type LevelValidationItem = {
  price: number | null
  status: 'valid' | 'invalid' | 'missing'
  reason: string
}

export type LevelValidation = {
  support: LevelValidationItem
  resistance: LevelValidationItem
  trigger: LevelValidationItem
  stopLoss: LevelValidationItem
  takeProfit1: LevelValidationItem
}

export type DecisionViewModel = {
  version: 'decision-view-v3'
  action: FinalDecisionAction
  displayGrade: FinalDecision['signalGrade']
  primaryInstruction: string
  beginnerInstruction: string
  canAct: boolean
  executionState: ExecutionState
  singleCommand: string
  actionAllowed: boolean
  actionBlockedReason: string | null
  displayGuards: string[]
  triggerPrice: number | null
  stopLoss: number | null
  takeProfit1: number | null
  riskRewardRatio: number | null
  probabilityDisplay: DecisionProbabilityDisplay
  probabilityPolicy: ProbabilityDisplayPolicy
  calibrationStatus: CalibrationStatus
  levelValidation: LevelValidation
  validatedLevels: LevelValidation
  backtestValidity: BacktestValidity
  sourceHealth: SourceHealthViewModel
  sourceLedger: SourceSlaLedger | null
  sourceWarnings: string[]
  journalPreview: SignalJournalRecord | null
  blockerSummary: string
  updatedAt: string
}

export type SignalJournalOutcome =
  | 'pending'
  | 'tp1_hit'
  | 'stop_loss_hit'
  | 'no_touch'
  | 'timeout'
  | 'invalidated'

export type SignalFailureReason =
  | 'pending'
  | 'chasing_risk'
  | 'event_noise'
  | 'false_breakout'
  | 'pattern_failed'
  | 'macro_pressure'
  | 'source_health'
  | 'timeframe_conflict'
  | 'poor_risk_reward'
  | 'model_disagreement'

export type SignalJournalEntry = {
  id: string
  generatedAt: string
  quoteTimestamp: string
  price: number
  action: FinalDecisionAction
  executionState: ExecutionState
  score: number
  command: string
  pattern: PatternKind | null
  eventPhase: EconomicEventPhase
  sourceHealth: SourceHealthViewModel['tradeSourceStatus']
  riskRewardRatio: number | null
  probabilityShown: boolean
  outcome: SignalJournalOutcome
  failureReason: SignalFailureReason
  bucketKey: string
  notes: string[]
}

export type SignalJournalEvidence = {
  probabilityPolicyReason: string
  displayGuards: string[]
  sourceWarnings: string[]
}

export type SignalJournalResult = {
  outcome: SignalJournalOutcome
  failureReason: SignalFailureReason
  evaluatedAt: string | null
  returnPercent: number | null
  notes: string[]
}

export type SignalJournalRecord = SignalJournalEntry & {
  recordVersion: 'signal-journal-record-v4'
  persistedAt: string
  evidence: SignalJournalEvidence
  result: SignalJournalResult
}

export type ModelProviderScorecardEntry = {
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

export type ModelPromotionState = 'promoted' | 'candidate' | 'shadow' | 'blocked'

export type ModelRegistryEntry = ModelProviderScorecardEntry & {
  registryVersion: 'model-registry-entry-v4'
  providerKind: 'local_probability' | 'external_advisor' | 'rules' | 'macro_mirror'
  promoted: boolean
  promotionState: ModelPromotionState
  eligibility: {
    minSamplesRequired: number
    maxBrierScore: number
    hasEnoughSamples: boolean
    brierPass: boolean
    canPromote: boolean
    reasons: string[]
  }
  evidence: {
    sampleSize: number
    qualifiedSamples: number
    reliability: number | null
    brierScore: number | null
    profitFactor: number | null
    summary: string
  }
  governance: {
    owner: string
    reviewedAt: string
    notes: string[]
  }
}

export type ModelProviderScorecard = {
  version: 'model-registry-v4'
  generatedAt: string
  entries: ModelRegistryEntry[]
  promotionPolicy: {
    minSamplesRequired: number
    maxBrierScore: number
    promotedRequires: string[]
  }
  summary: string
}

export type PriceLevelRole =
  | 'support'
  | 'resistance'
  | 'trigger'
  | 'stopLoss'
  | 'invalidation'
  | 'takeProfit'

export type PriceLevelSource =
  | 'tradePlan'
  | 'patternSignal'
  | 'externalModel'
  | 'stats24h'
  | 'technical'
  | 'probabilityModel'

export type PriceLevel = {
  price: number
  role: PriceLevelRole
  source: PriceLevelSource
  confidence: number | null
  note: string
}

export type CanonicalForecast = {
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

export type EconomicEventImportance = 'S' | 'A' | 'B'

export type EconomicEventCategory =
  | 'inflation'
  | 'jobs'
  | 'fed'
  | 'growth'
  | 'geopolitical'
  | 'liquidity'

export type EconomicEventSource = 'configured' | 'estimated' | 'rss' | 'mirror'

export type EconomicEventPhase =
  | 'normal'
  | 'pre_event'
  | 'post_first_wave'
  | 'post_confirmation'

export type EconomicEventRiskLevel = 'none' | 'watch' | 'elevated' | 'critical'

export type EconomicEvent = {
  id: string
  label: string
  category: EconomicEventCategory
  importance: EconomicEventImportance
  scheduledAt: string
  source: EconomicEventSource
  sourceUrl?: string
}

export type EconomicEventRisk = {
  level: EconomicEventRiskLevel
  phase: EconomicEventPhase
  scorePenalty: number
  scoreCap: number
  positionMultiplier: number
  activeEvent: (EconomicEvent & { minutesToEvent: number }) | null
  upcomingEvents: Array<EconomicEvent & { minutesToEvent: number }>
  summary: string
  warnings: string[]
  updatedAt: string
}

export type EventIntelligenceSourceUsage =
  | 'production_calendar'
  | 'estimation_only'
  | 'news_watch_only'
  | 'mirror_learning'

export type EventIntelligenceItem = EconomicEvent & {
  minutesToEvent: number
  phase: EconomicEventPhase
  riskLevel: EconomicEventRiskLevel
  scorePenalty: number
  scoreCap: number
  positionMultiplier: number
  sourceUsage: EventIntelligenceSourceUsage
  sourceBoundary: string
  isProductionEligible: boolean
  warnings: string[]
}

export type EventIntelligenceSourceBoundary = {
  source: EconomicEventSource
  sourceUsage: EventIntelligenceSourceUsage
  isProductionEligible: boolean
  participatesInScoring: boolean
  summary: string
}

export type EventIntelligenceResponse = {
  version: 'event-intelligence-v4'
  generatedAt: string
  current: EconomicEventRisk
  activeItem: EventIntelligenceItem | null
  items: EventIntelligenceItem[]
  sourceBoundaries: EventIntelligenceSourceBoundary[]
  summary: string
  usageBoundary: string
  warnings: string[]
}

export type DecisionEvidencePacket = {
  version: 'decision-evidence-v4'
  generatedAt: string
  quoteTimestamp: string
  symbol: string
  price: number
  singleCommand: string
  actionAllowed: boolean
  executionState: ExecutionState
  decision: {
    action: FinalDecisionAction
    executionState: ExecutionState
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

export type PsychologyRiskKind =
  | 'chasing_high'
  | 'revenge_trading'
  | 'no_stop_loss'
  | 'event_impulse'
  | 'overtrading'
  | 'holding_loser'

export type PsychologyRiskFlag = {
  kind: PsychologyRiskKind
  label: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  correction: string
}

export type PsychologyDiscipline = {
  score: number
  level: 'stable' | 'watch' | 'danger'
  action: 'allow_plan' | 'reduce_size' | 'stand_down' | 'review_only'
  summary: string
  flags: PsychologyRiskFlag[]
  checklist: string[]
  updatedAt: string
}

export type TimeframeBias = 'bullish' | 'bearish' | 'neutral' | 'insufficient'

export type TimeframeConfluence = {
  timeframe: CandleTimeframe
  label: string
  bias: TimeframeBias
  trendScore: number
  momentumPercent: number | null
  volatilityPercent: number | null
  summary: string
}

export type MultiTimeframeConfluence = {
  overallBias: TimeframeBias
  score: number
  conflictLevel: 'none' | 'mild' | 'severe'
  summary: string
  frames: TimeframeConfluence[]
}

export type ProviderHealthRecord = {
  id: string
  label: string
  provider: string
  status: 'live' | 'unavailable'
  sourceTier?: 'critical' | 'core' | 'supporting' | 'experimental'
  participatesInScoring: boolean
  lastSuccessAt: string | null
  lastFailureAt: string | null
  latencyMs: number | null
  latencyQuality?: 'fast' | 'normal' | 'slow' | 'timed_out'
  latencyWeight?: number
  failureStreak?: number
  cooldownUntil?: string | null
  qualityScore?: number
  reliabilityRisk?: 'low' | 'medium' | 'high'
  error: string | null
  envVars: string[]
}

export type ProviderHealthSnapshot = {
  updatedAt: string
  providers: ProviderHealthRecord[]
}

export type MarketContext = {
  updatedAt: string
  factorScore: number
  summary: string
  factors: {
    spotGoldUsd: MarketFactor
    dollarIndex: MarketFactor
    usdCny: MarketFactor
  }
  macroFactors: MarketFactor[]
  macroRegimeEvidence?: MacroRegimeEvidence
  sentiment: {
    news: SentimentFactor
    blogger: SentimentFactor
  }
  backtest: BacktestFactor
  providerHealth: ProviderHealthRecord[]
}

export type OpportunitySignal = {
  score: number
  level: OpportunityLevel
  triggered: boolean
  title: string
  summary: string
  reasons: string[]
  risks: string[]
  expertOpinions: ExpertOpinion[]
  expertConsensus: ExpertConsensus
  externalModelAdvisor: ExternalModelAdvisor | null
  marketContext: MarketContext
  valuation: ValuationMetrics
  patternSignals: PatternSignal[]
  probabilityModel: ProbabilityModelSnapshot
  knowledgeRuleAudit: KnowledgeRuleAudit
  canonicalForecast: CanonicalForecast
  decisionOverlay: DecisionOverlay
  decisionView: DecisionViewModel
  finalDecision: FinalDecision
  tradePlan: TradePlan
  confluence: MultiTimeframeConfluence
  eventRisk: EconomicEventRisk
  psychology: PsychologyDiscipline
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

export type CandleTimeframe = '1m' | '5m' | '15m' | '60m'

export type CandleApiPoint = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
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
  sourceLedger: QuoteSourceLedger
  sourceSlaLedger: SourceSlaLedger
  dayRange: {
    low: number
    high: number
  }
  marketReference: MarketReference
  stats24h: QuoteStats24h
  alert: AlertInfo
  quality: DataQualityInfo
  marketContext: MarketContext
  opportunity: OpportunitySignal
  patternSignals: PatternSignal[]
}

export type HistoryApiResponse = {
  history: HistoryPoint[]
  candles: Record<CandleTimeframe, CandleApiPoint[]>
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
  quality: DataQualityInfo | null
}
