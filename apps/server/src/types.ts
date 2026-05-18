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
}

export type BacktestBucket = {
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
  reliability: number
  summary: string
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
  sampleSize: number
  allEvaluatedSamples: number
  evaluatedSamples: number
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

export type PatternDirection = 'bullish' | 'bearish' | 'neutral'
export type PatternConfirmationStatus = 'candidate' | 'confirmed'

export type PatternSignal = {
  id: string
  kind: PatternKind
  label: string
  direction: PatternDirection
  confidence: number
  confirmationStatus?: PatternConfirmationStatus
  confirmationReason?: string
  detectedAt: string
  keyPrice: number
  necklinePrice: number | null
  invalidationPrice: number | null
  targetPrice: number | null
  expectedConfirmationBars: number
  summary: string
  explanation: string
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

export type EconomicEventImportance = 'S' | 'A' | 'B'

export type EconomicEventCategory =
  | 'inflation'
  | 'jobs'
  | 'fed'
  | 'growth'
  | 'geopolitical'
  | 'liquidity'

export type EconomicEventSource = 'configured' | 'estimated'

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
