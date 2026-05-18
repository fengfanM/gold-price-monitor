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
} from 'react'
import './App.css'

type SourceHealth = 'live' | 'stale' | 'offline'
type ViewMode = 'intraday' | 'candles'
type TerminalView = 'dashboard' | 'backtest' | 'providers'
type Timeframe = '1m' | '5m' | '15m' | '60m'
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
}

type BacktestMonitor = {
  updatedAt: string
  sampleSize: number
  allEvaluatedSamples?: number
  evaluatedSamples: number
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
  source: 'configured' | 'estimated'
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
  marketContext?: MarketContext | null
  patternSignals?: PatternSignal[] | null
  opportunity?: OpportunityPayload | null
  buySignal?: OpportunityPayload | null
  buy_signal?: OpportunityPayload | null
}

type PatternSignal = {
  id: string
  kind: 'double_bottom' | 'double_top' | 'support_rebound' | 'resistance_rejection' | 'hammer' | 'shooting_star' | 'bullish_engulfing' | 'bearish_engulfing' | 'doji'
  label: string
  direction: 'bullish' | 'bearish' | 'neutral'
  confidence: number
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
}

type HardGateStatus = 'pass' | 'watch' | 'block'

type SignalTransparency = {
  probability: number
  winRate: number | null
  calibrationConfidence: number
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

const QUOTE_BOARD_TABS: Array<{ id: QuoteBoardTab; label: string }> = [
  { id: 'consensus', label: '校准价' },
  { id: 'icbc', label: '工银' },
  { id: 'sge', label: 'AU9999' },
  { id: 'banks', label: '银行参考' },
]

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

    return () => {
      controller.abort()
      backtestController.abort()
      window.clearTimeout(timer)
      window.clearInterval(intervalId)
      window.clearTimeout(backtestTimer)
      window.clearInterval(backtestIntervalId)
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
  const recentHistory = useMemo(() => selectRecentHistory(renderableHistory, 24), [renderableHistory])
  const sessionHistory = useMemo(() => selectLatestActiveSessionHistory(recentHistory), [recentHistory])
  const intradayData = useMemo(
    () => buildIntradayData(sessionHistory, activeTimeframe.minutes, activeTimeframe.visibleBars),
    [activeTimeframe.minutes, activeTimeframe.visibleBars, sessionHistory],
  )
  const candleData = useMemo(
    () => {
      const apiCandles = mapServerCandles(serverCandles[timeframe])
      const mergedCandles = apiCandles.length > 0
        ? mergeLatestQuoteIntoCandles(apiCandles, quote, activeTimeframe.minutes)
        : buildCandles(sessionHistory, activeTimeframe.minutes)
      return selectVisibleCandles(mergedCandles, activeTimeframe.visibleBars)
    },
    [activeTimeframe.minutes, activeTimeframe.visibleBars, quote, serverCandles, sessionHistory, timeframe],
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
  const patternSignals = buySignal?.patternSignals ?? quote?.patternSignals ?? []
  const chartPrediction = useMemo(
    () => buildChartPrediction(buySignal, backtestMonitor),
    [backtestMonitor, buySignal],
  )
  const signalTransparency = useMemo(
    () => buildSignalTransparency(buySignal, backtestMonitor, chartPrediction),
    [backtestMonitor, buySignal, chartPrediction],
  )
  const chartSignal = useMemo(() => buildChartSignal(buySignal, chartPrediction), [
    buySignal,
    chartPrediction,
  ])
  const signalMeta = getOpportunityMeta(buySignal?.level ?? 'none')
  const signalScoreText = formatScore(buySignal?.score ?? null)
  const dataStatus = buildDataStatus(quote, error, lastAttemptText)
  const toggleIndicator = (indicator: Indicator) => {
    setActiveIndicators((current) => {
      return current.includes(indicator)
        ? current.filter((item) => item !== indicator)
        : [...current, indicator]
    })
    setViewMode('candles')
  }

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
            <strong>
              {buySignal.level === 'strong'
                ? '强信号 · 买点复核'
                : buySignal.level === 'watch'
                  ? '观察信号 · 不追价'
                  : `${signalMeta.label} · 买点观察`}
            </strong>
            <span>
              {buySignal.summary}
              {buySignal.reasons[0] ? ` · ${buySignal.reasons[0]}` : ''}
            </span>
            <small>
              {buySignal.level === 'strong'
                ? '强信号也必须通过硬门槛、分批与止损复核；不构成收益承诺。'
                : '观察级只提示复核条件，不提示追价或立即交易。'}
            </small>
          </div>
          <div className="opportunity-alert__score">
            <span>Up Prob</span>
            <strong>{formatProbability(signalTransparency.probability)}</strong>
          </div>
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
            </div>
          </div>

          {viewMode === 'intraday' ? (
            <IntradayChartPanel
              indicators={activeIndicators}
              isLoading={isLoading}
              latestPrice={quote?.price ?? null}
              latestReference={quote?.marketReference.calibration.anchorPrice ?? null}
              opportunity={buySignal}
              priceData={intradayData.price}
              patternSignals={patternSignals}
              prediction={chartPrediction}
              referenceData={intradayData.reference}
              signal={chartSignal}
              timeframeLabel={activeTimeframe.label}
            />
          ) : (
            <CandlestickChartPanel
              candleData={candleData}
              indicators={activeIndicators}
              isLoading={isLoading}
              latestPrice={quote?.price ?? null}
              opportunity={buySignal}
              patternSignals={patternSignals}
              prediction={chartPrediction}
              signal={chartSignal}
              timeframeLabel={activeTimeframe.label}
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
                    value={quote?.marketReference.tradingSession?.isTradingTime ? '交易中' : '休市/非主时段'}
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
            transparency={signalTransparency}
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
  transparency: SignalTransparency
}) {
  const meta = getOpportunityMeta(props.signal?.level ?? 'none')
  const [activeTab, setActiveTab] = useState<OpportunityTab>('decision')

  return (
    <article className={`panel opportunity-panel opportunity-panel--${meta.tone}`}>
      <header>
        <AlertTriangle size={16} />
        <strong>买点观察</strong>
        <span>{meta.label}</span>
      </header>
      <div className="opportunity-score">
        <span>Signal Score</span>
        <strong>{formatScore(props.signal?.score ?? null)}</strong>
      </div>
      <div className="opportunity-tabs" role="tablist" aria-label="买点观察功能切换">
        {OPPORTUNITY_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
            <DecisionBriefPanel signal={props.signal} transparency={props.transparency} />
            <SignalTransparencyPanel compact transparency={props.transparency} />
            <SignalList
              emptyText="暂无核心买点依据"
              items={(props.signal?.reasons ?? []).slice(0, 3)}
              title="核心理由"
            />
            <SignalList
              emptyText="暂无核心风险"
              items={(props.signal?.risks ?? []).slice(0, 3)}
              title="核心风险"
            />
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
          </>
        ) : null}
        {activeTab === 'evidence' ? (
          <>
            <ConfluencePanel confluence={props.signal?.confluence ?? null} />
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
        {activeTab === 'validation' ? <BacktestMonitorPanel monitor={props.monitor} /> : null}
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

function DecisionBriefPanel(props: {
  signal: OpportunityInfo | null
  transparency: SignalTransparency
}) {
  const plan = props.signal?.tradePlan ?? null
  const action = plan?.actionLabel ?? getOpportunityMeta(props.signal?.level ?? 'none').label
  const position = plan?.positionSuggestion ?? props.signal?.summary ?? '等待更多实时样本确认。'
  const riskReward = plan?.riskRewardRatio === null || plan?.riskRewardRatio === undefined
    ? '--'
    : `${plan.riskRewardRatio}:1`

  return (
    <section className="decision-brief">
      <header>
        <strong>当前决策</strong>
        <span>{props.transparency.verdict}</span>
      </header>
      <div className="decision-brief__grid">
        <MetricCard label="动作" value={action} />
        <MetricCard label="赔率" value={riskReward} />
        <MetricCard label="上涨概率" value={formatProbability(props.transparency.probability)} />
        <MetricCard label="可靠性" value={props.transparency.reliability === null ? '--' : `${props.transparency.reliability}/100`} />
      </div>
      <p>{position}</p>
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
        <MetricCard label="上涨概率" value={formatProbability(props.transparency.probability)} />
        <MetricCard label="回测胜率" value={formatNullablePercent(props.transparency.winRate)} />
        <MetricCard
          label="校准可信度"
          value={`${props.transparency.calibrationConfidence}/100`}
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
        <strong>五段式交易计划</strong>
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
          <small>强信号优先需要 2:1 以上，最好 3:1。</small>
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
        emptyText="暂无交易计划依据"
        items={plan.rationale}
        title="计划依据"
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

  return (
    <section className="backtest-monitor-panel">
      <header>
        <strong>长期回测监控</strong>
        <span>{monitor.evaluatedSamples}/{monitor.allEvaluatedSamples ?? monitor.sampleSize}</span>
      </header>
      <p>{monitor.summary}</p>
      <div className="valuation-grid">
        <MetricCard label="合格信号胜率" value={formatNullablePercent(monitor.winRate)} />
        <MetricCard label="基准胜率" value={formatNullablePercent(monitor.baselineWinRate ?? null)} />
        <MetricCard label="平均收益" value={formatNullablePercent(monitor.averageReturn)} />
        <MetricCard label="Profit Factor" value={formatNullableRatio(monitor.profitFactor ?? null)} />
        <MetricCard label="可信度" value={monitor.reliability === undefined ? '--' : `${monitor.reliability}/100`} />
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
              <small>胜率 {formatNullablePercent(bucket.winRate)}</small>
              <small>超额 {formatNullablePercent(bucket.excessWinRate)}</small>
              <small>PF {formatNullableRatio(bucket.profitFactor)}</small>
              <small>Brier {formatNullableRatio(bucket.brierScore)}</small>
              <small>MAE {formatNullablePercent(bucket.mae)}</small>
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
        {props.buckets.slice(0, props.compact ? 3 : 8).map((bucket) => (
          <article className="bucket-card" key={bucket.key}>
            <div>
              <strong>{bucket.label}</strong>
              <span>{bucket.qualifiedSamples}/{bucket.sampleSize} 合格</span>
            </div>
            <div className="bucket-card__metrics">
              <small>胜率 {formatNullablePercent(bucket.winRate)}</small>
              <small>基准 {formatNullablePercent(bucket.baselineWinRate)}</small>
              <small>PF {formatNullableRatio(bucket.profitFactor)}</small>
              <small>MAE {formatNullablePercent(bucket.mae)}</small>
              <small>MFE {formatNullablePercent(bucket.mfe)}</small>
              <small>可信 {bucket.reliability}/100</small>
            </div>
            {!props.compact ? <p>{bucket.summary}</p> : null}
          </article>
        ))}
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
            可靠性 {monitor?.reliability === undefined ? '--' : `${monitor.reliability}/100`}
            {' · '}
            {props.signal?.summary ?? '暂无当前信号'}
          </small>
        </div>
      </header>

      <div className="backtest-kpi-grid">
        <MetricCard label="合格/全部样本" value={monitor ? `${monitor.evaluatedSamples}/${monitor.allEvaluatedSamples ?? monitor.sampleSize}` : '--'} />
        <MetricCard label="合格信号胜率" value={formatNullablePercent(monitor?.winRate ?? null)} />
        <MetricCard label="基准胜率" value={formatNullablePercent(monitor?.baselineWinRate ?? null)} />
        <MetricCard label="平均收益" value={formatNullablePercent(monitor?.averageReturn ?? null)} />
        <MetricCard label="Profit Factor" value={formatNullableRatio(monitor?.profitFactor ?? null)} />
        <MetricCard label="可信度" value={monitor?.reliability === undefined ? '--' : `${monitor.reliability}/100`} />
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
            <span>{failures.length} 条</span>
          </header>
          {failures.length > 0 ? (
            <div className="failure-table">
              {failures.map((sample) => (
                <div className="failure-table-row" key={`${sample.openedAt}-${sample.evaluatedAt}`}>
                  <span>{formatDateTime(sample.openedAt)}</span>
                  <strong>{formatNullablePercent(sample.returnPercent)}</strong>
                  <small>
                    {explainFailureSample(sample)}
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
  if (!monitor) {
    return Array.from({ length: 6 }, (_, index) => ({
      label: `等待${index + 1}`,
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
      <SourceAuditPanel
        factors={[...baseFactors, ...macroFactors]}
        sentiment={props.context.sentiment}
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
                  <small>{formatMarketFactorChange(factor)}</small>
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
}) {
  const live = props.factors.filter((factor) => factor.status === 'live').length
  const derived = props.factors.filter((factor) => factor.status === 'derived').length
  const unavailable = props.factors.filter((factor) => factor.status === 'unavailable')
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
        <MetricCard label="未配置/不可用" value={`${unavailable.length}`} />
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
        <p>当前核心因子均已有实时或派生值，可作为综合观察依据；仍需注意行情延迟和外部源噪声。</p>
      )}
      <details className="pending-source-list" open={unavailable.length > 0}>
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
  isLoading: boolean
  timeframeLabel: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<IntradayHover | null>(null)
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
  const markers = useMemo(
    () => buildLineMarkers(props.priceData, extremes, props.signal, props.patternSignals),
    [extremes, props.priceData, props.signal, props.patternSignals],
  )

  useEffect(() => {
    if (!containerRef.current || props.priceData.length < 1) {
      return
    }

    const container = containerRef.current
    const chart = createChart(container, chartOptions(container))
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

    chart.timeScale().fitContent()
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
    })

    observer.observe(container)

    return () => {
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
        <div className="lw-chart" ref={containerRef} />
      )}
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
  isLoading: boolean
  timeframeLabel: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<CandleHover | null>(null)
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
  const markers = useMemo(
    () => buildCandleMarkers(props.candleData, extremes, props.signal, props.patternSignals),
    [extremes, props.candleData, props.signal, props.patternSignals],
  )

  useEffect(() => {
    if (!containerRef.current || props.candleData.length < 1) {
      return
    }

    const container = containerRef.current
    const chart = createChart(container, chartOptions(container))
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
    chart.timeScale().fitContent()
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
    })

    observer.observe(container)

    return () => {
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
        <div className="lw-chart" ref={containerRef} />
      )}
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
          涨 {formatProbability(props.prediction.upProbability)}
          <b> / </b>
          跌 {formatProbability(props.prediction.downProbability)}
        </strong>
        <small>
          置信 {formatProbability(props.prediction.confidence)} · {props.prediction.basis}
        </small>
      </div>
      <div className="chart-forecast-card">
        <span>预测区间 · {props.forecast.horizonLabel}</span>
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
          支撑 {formatMaybePrice(props.forecast.support ?? props.extremes.low?.value ?? null)}
          <b> / </b>
          压力 {formatMaybePrice(props.forecast.resistance ?? props.extremes.high?.value ?? null)}
        </strong>
        <small>
          {leadingPattern
            ? `${leadingPattern.label} 识别置信 ${formatProbability(leadingPattern.confidence)}，TP1先达 ${formatMaybeProbability(props.forecast.successRate)}，失效价 ${formatMaybePrice(props.forecast.failurePrice)}。`
            : `TP1先达 ${formatMaybeProbability(props.forecast.successRate)}；图中虚线标出统一预测区间和关键价。`}
        </small>
      </div>
    </div>
  )
}

function PatternSignalPanel(props: { patterns: PatternSignal[] }) {
  if (props.patterns.length < 1) {
    return null
  }

  return (
    <div className="pattern-signal-panel">
      {props.patterns.slice(0, 3).map((pattern) => (
        <article className={`pattern-card pattern-card--${pattern.direction}`} key={pattern.id}>
          <header>
            <strong>{pattern.label}</strong>
            <span>识别置信 {pattern.confidence}%</span>
          </header>
          <p>{pattern.summary}</p>
          <div>
            <small>关键 {formatMaybePrice(pattern.keyPrice)}</small>
            <small>颈线 {formatMaybePrice(pattern.necklinePrice)}</small>
            <small>失效 {formatMaybePrice(pattern.invalidationPrice)}</small>
            <small>目标 {formatMaybePrice(pattern.targetPrice)}</small>
          </div>
          <b>
            {pattern.explanation}
            {pattern.invalidationPrice !== null
              ? ` 若跌破/突破失效价 ${formatMaybePrice(pattern.invalidationPrice)}，该形态按失败处理。`
              : ''}
          </b>
        </article>
      ))}
    </div>
  )
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
  const action = props.signal?.tradePlan?.actionLabel ?? props.transparency.verdict

  return (
    <section className="chart-insight-deck" aria-label="可视化军师摘要">
      <article className="chart-insight-card chart-insight-card--decision">
        <span>小白操作翻译</span>
        <strong>{action}</strong>
        <small>{props.signal?.tradePlan?.positionSuggestion ?? '先看多源价差、回测样本和事件风险，未过硬门槛不追价。'}</small>
      </article>
      <article className="chart-insight-card">
        <span>外部模型军师</span>
        <strong>
          {external
            ? `${externalModelProviderLabel(external.provider)} ${external.upProbability === null ? '--' : formatProbability(external.upProbability * 100)}`
            : '未配置'}
        </strong>
        <small>{external?.backtestGate?.summary ?? external?.summary ?? externalMonitor?.summary ?? 'Chronos/TimesFM/Moirai 只在通过分桶回测后才允许加权。'}</small>
      </article>
      <article className="chart-insight-card">
        <span>同类胜率/回测</span>
        <strong>{props.monitor?.winRate === null || props.monitor?.winRate === undefined ? '--' : formatNullablePercent(props.monitor.winRate)}</strong>
        <small>
          {bestBucket
            ? `强桶：${bestBucket.label}，PF ${formatNullableRatio(bestBucket.profitFactor)}。`
            : weakBucket
              ? `弱桶：${weakBucket.label}，模型自动降权。`
              : '等待更多 live 样本形成同类场景胜率。'}
        </small>
      </article>
      <article className="chart-insight-card">
        <span>数据源覆盖</span>
        <strong>{liveProviders === null || totalProviders === null ? '--' : `${liveProviders}/${totalProviders}`}</strong>
        <small>{props.signal?.marketContext?.summary ?? '工作日交易时段要求工银、AU9999、银行参考和宏观源尽量一致。'}</small>
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

function buildScoreMethodology(signal: OpportunityInfo | null, monitor: BacktestMonitor | null) {
  const score = normalizeScoreNumber(signal?.score)
  const macroScore = normalizeScoreNumber(signal?.marketContext?.factorScore)
  const valuationScore = normalizeScoreNumber(signal?.valuation?.score)
  const horizonWinRate = signal?.marketContext?.backtest.horizons[0]?.winRate ?? null
  const backtestScore = typeof monitor?.winRate === 'number'
    ? Math.round(monitor.winRate * 100)
    : typeof horizonWinRate === 'number'
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
  const modelReliability = monitor?.reliability ?? null
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
  const score = normalizeScoreNumber(signal?.score)
  const reliability = monitor?.reliability ?? null
  const sampleSize = monitor?.evaluatedSamples ?? 0
  const liveFactors = countLiveMarketFactors(signal?.marketContext ?? null)
  const totalFactors = countTotalMarketFactors(signal?.marketContext ?? null)
  const sourceCoverage = totalFactors > 0 ? liveFactors / totalFactors : 0
  const hasTradePlan = Boolean(signal?.tradePlan)
  const hasStopLoss = typeof signal?.tradePlan?.stopLoss === 'number'
  const eventRisk = signal?.eventRisk?.level ?? 'none'
  const psychologyAction = signal?.psychology?.action ?? 'allow_plan'
  const calibrationConfidence = Math.round(clamp(
    prediction.confidence * 0.45 +
      (reliability ?? 42) * 0.28 +
      Math.min(18, sampleSize * 1.5) +
      sourceCoverage * 14 -
      (eventRisk === 'critical' ? 12 : eventRisk === 'elevated' ? 6 : 0),
    20,
    92,
  ))

  const hardGates: SignalTransparency['hardGates'] = [
    {
      label: '样本门槛',
      status: sampleSize >= 30 ? 'pass' : sampleSize >= 10 ? 'watch' : 'block',
      detail: sampleSize > 0 ? `已评估 ${sampleSize} 个合格样本` : '等待回测样本积累',
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
  const watchCount = hardGates.filter((gate) => gate.status === 'watch').length
  const verdict = blockedCount > 0
    ? '只观察'
    : watchCount > 0
      ? '小心复核'
      : score !== null && score >= 72
        ? '可复核强信号'
        : '等待确认'

  return {
    probability: prediction.upProbability,
    winRate: monitor?.winRate ?? signal?.marketContext?.backtest.horizons[0]?.winRate ?? null,
    calibrationConfidence,
    reliability,
    sampleSize,
    verdict,
    guardrail:
      blockedCount > 0
        ? '存在硬门槛未通过时，页面只给观察优先级，不应把它解读为可执行买入。'
        : '全部硬门槛通过后仍需分批、止损和仓位上限；概率代表历史相似条件下的倾向，不是确定性。',
    hardGates,
  }
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

function buildChartPrediction(
  signal: OpportunityInfo | null,
  monitor: BacktestMonitor | null,
): ChartPrediction {
  if (signal?.canonicalForecast) {
    return {
      upProbability: Math.round(signal.canonicalForecast.probability.up * 100),
      downProbability: Math.round(signal.canonicalForecast.probability.down * 100),
      confidence: signal.canonicalForecast.probability.confidence,
      label: '统一预测',
      basis: signal.canonicalForecast.successRate.label,
    }
  }
  const normalizedScore = normalizeScoreNumber(signal?.score) ?? 50
  const factorScore = normalizeScoreNumber(signal?.marketContext?.factorScore) ?? 50
  const valuationScore = normalizeScoreNumber(signal?.valuation?.score) ?? 50
  const backtestScore =
    typeof monitor?.winRate === 'number' && Number.isFinite(monitor.winRate)
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
      successRate: patterns[0]?.confidence ?? null,
      horizonLabel: '未来1-3个周期',
      basis: '等待足够价格样本后计算预测区间。',
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
    successRate: leadingPattern?.confidence ?? prediction.upProbability,
    horizonLabel: '未来1-3个周期',
    basis: leadingPattern
      ? `${leadingPattern.label} + 多因子概率校准，失效价优先于目标价。`
      : '按窗口波动、信号概率和当前价推演，仅用于观察区间。',
  }
}

function buildChartSignal(signal: OpportunityInfo | null, prediction: ChartPrediction): ChartSignal {
  const consensusAction = signal?.expertConsensus?.action
  const score = normalizeScoreNumber(signal?.score)

  if (consensusAction === 'avoid' || (score !== null && score <= 35)) {
    return {
      tone: 'risk',
      label: '卖点/风险观察',
      detail: `上涨概率 ${formatProbability(prediction.upProbability)}，控制仓位或等待回落确认。`,
    }
  }

  if (signal?.level === 'strong' || consensusAction === 'accumulate' || prediction.upProbability >= 68) {
    return {
      tone: 'buy',
      label: signal?.level === 'strong' ? '绝佳买点观察' : '买点增强',
      detail: `上涨概率 ${formatProbability(prediction.upProbability)}，仍需分批和止损纪律。`,
    }
  }

  if (signal?.level === 'watch' || signal?.level === 'elevated' || prediction.upProbability >= 56) {
    return {
      tone: 'watch',
      label: '买点观察',
      detail: `上涨概率 ${formatProbability(prediction.upProbability)}，等待更多数据源共振。`,
    }
  }

  return {
    tone: 'wait',
    label: '等待信号',
    detail: `上涨概率 ${formatProbability(prediction.upProbability)}，当前更适合观察。`,
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
): SeriesMarker<UTCTimestamp>[] {
  const latest = data[data.length - 1]
  return buildCommonMarkers(latest?.time ?? null, latest?.value ?? null, extremes, signal, patterns)
}

function buildCandleMarkers(
  data: CandleDatum[],
  extremes: ChartExtremes,
  signal: ChartSignal,
  patterns: PatternSignal[],
): SeriesMarker<UTCTimestamp>[] {
  const latest = data[data.length - 1]
  return buildCommonMarkers(latest?.time ?? null, latest?.close ?? null, extremes, signal, patterns)
}

function buildCommonMarkers(
  latestTime: UTCTimestamp | null,
  latestPrice: number | null,
  extremes: ChartExtremes,
  signal: ChartSignal,
  patterns: PatternSignal[],
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
    points.push({
      price: quote.price,
      timestamp: quote.fetchedAt ?? quote.updatedAt,
      referenceAnchorPrice: quote.marketReference.calibration.anchorPrice,
      referenceAu9999Price: quote.marketReference.au9999?.latestPrice ?? null,
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

function selectRecentHistory(history: HistoryPoint[], windowHours: number) {
  const latest = history[history.length - 1]
  if (!latest) {
    return history
  }

  const cutoff = new Date(latest.timestamp).getTime() - windowHours * 60 * 60 * 1000
  const sliced = history.filter((point) => new Date(point.timestamp).getTime() >= cutoff)
  return sliced.length >= 2 ? sliced : history
}

function selectLatestActiveSessionHistory(history: HistoryPoint[]) {
  const sorted = history
    .filter((point) => {
      const timestamp = new Date(point.timestamp).getTime()
      return Number.isFinite(timestamp) && Number.isFinite(point.price)
    })
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())

  const latest = sorted[sorted.length - 1]
  if (!latest) {
    return sorted
  }

  const latestDayKey = localDateKey(new Date(latest.timestamp))
  const sameDay = sorted.filter((point) => localDateKey(new Date(point.timestamp)) === latestDayKey)
  const session = sameDay.length >= 2 ? sameDay : sorted
  return trimLeadingInactiveHistory(session)
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function trimLeadingInactiveHistory(history: HistoryPoint[]) {
  if (history.length < 3) {
    return history
  }

  const firstChangeIndex = history.findIndex((point, index) => {
    if (index === 0) {
      return false
    }
    return hasMeaningfulPriceChange(history[index - 1]?.price ?? point.price, point.price)
  })

  if (firstChangeIndex <= 1 || history.length - firstChangeIndex < 2) {
    return history
  }

  return history.slice(firstChangeIndex - 1)
}

function hasMeaningfulPriceChange(left: number, right: number) {
  return Math.abs(left - right) >= 0.01
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
  const session = selectLatestTimeSession(sorted, (point) => point.value)
  return session.slice(-visibleBars)
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
  const session = selectLatestTimeSession(sorted, (candle) => candle.close)
  return session.slice(-visibleBars)
}

function selectLatestTimeSession<T extends { time: UTCTimestamp }>(
  data: T[],
  getValue: (item: T) => number,
) {
  const latest = data[data.length - 1]
  if (!latest) {
    return data
  }

  const latestDayKey = localDateKey(new Date(Number(latest.time) * 1000))
  const sameDay = data.filter((item) => localDateKey(new Date(Number(item.time) * 1000)) === latestDayKey)
  const session = sameDay.length >= 2 ? sameDay : data
  return trimLeadingInactiveTimeData(session, getValue)
}

function trimLeadingInactiveTimeData<T>(data: T[], getValue: (item: T) => number) {
  if (data.length < 3) {
    return data
  }

  const firstChangeIndex = data.findIndex((item, index) => {
    if (index === 0) {
      return false
    }
    return hasMeaningfulPriceChange(getValue(data[index - 1]), getValue(item))
  })

  if (firstChangeIndex <= 1 || data.length - firstChangeIndex < 2) {
    return data
  }

  return data.slice(firstChangeIndex - 1)
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

function formatNullableRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(2)
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
    (level === 'strong' ? '绝佳买点观察' : '买点观察信号')

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
      eyebrow: 'BUY SIGNAL',
      label: '绝佳买点观察',
      tone: 'strong',
    } as const
  }

  if (level === 'critical' || level === 'elevated') {
    return {
      eyebrow: 'BUY SIGNAL',
      label: '重点观察',
      tone: 'elevated',
    } as const
  }

  if (level === 'watch') {
    return {
      eyebrow: 'BUY SIGNAL',
      label: '观察中',
      tone: 'watch',
    } as const
  }

  if (level === 'normal') {
    return {
      eyebrow: 'BUY SIGNAL',
      label: '普通',
      tone: 'normal',
    } as const
  }

  return {
    eyebrow: 'BUY SIGNAL',
    label: '等待信号',
    tone: 'muted',
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
