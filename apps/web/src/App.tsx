import {
  Activity,
  AlertTriangle,
  CandlestickChart,
  Crosshair,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'

type SourceHealth = 'live' | 'stale' | 'offline'
type ViewMode = 'intraday' | 'candles'
type Timeframe = '1m' | '5m' | '15m' | '60m'
type OpportunityLevel = 'normal' | 'watch' | 'strong' | 'elevated' | 'critical' | 'none'

type OpportunityPayload = {
  level?: OpportunityLevel | string | null
  triggered?: boolean
  score?: number | null
  reason?: string | null
  summary?: string | null
  title?: string | null
  reasons?: string[] | string | null
  risks?: string[] | string | null
}

type OpportunityInfo = {
  level: OpportunityLevel
  triggered: boolean
  score: number | null
  summary: string
  reasons: string[]
  risks: string[]
}

type QuotePayload = {
  price: number
  updatedAt: string
  sourceName: string
  sourceKind: 'official' | 'fallback'
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
  opportunity?: OpportunityPayload | null
  buySignal?: OpportunityPayload | null
  buy_signal?: OpportunityPayload | null
}

type ReferenceQuote = {
  symbol: string
  latestPrice: number
  highPrice: number
  lowPrice: number
  openPrice: number
}

type HistoryPoint = {
  price: number
  timestamp: string
  referenceAnchorPrice?: number | null
  referenceAu9999Price?: number | null
}

type HistoryPayload = {
  history: HistoryPoint[]
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
}

const REFRESH_INTERVAL_MS = 15_000
const STALE_AFTER_MS = 90_000

const TIMEFRAMES: Array<{ id: Timeframe; label: string; minutes: number }> = [
  { id: '1m', label: '1分', minutes: 1 },
  { id: '5m', label: '5分', minutes: 5 },
  { id: '15m', label: '15分', minutes: 15 },
  { id: '60m', label: '60分', minutes: 60 },
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
  const [viewMode, setViewMode] = useState<ViewMode>('intraday')
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  const [error, setError] = useState<string | null>(null)
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const refreshData = useEffectEvent(async (signal?: AbortSignal) => {
    setLastAttemptAt(new Date().toISOString())

    try {
      const [quoteResponse, historyResponse] = await Promise.all([
        fetch('/api/quote', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        }),
        fetch('/api/history', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        }),
      ])

      if (!quoteResponse.ok || !historyResponse.ok) {
        throw new Error(`接口状态异常：${quoteResponse.status}/${historyResponse.status}`)
      }

      const quoteJson = (await quoteResponse.json()) as ApiEnvelope<QuotePayload>
      const historyJson = (await historyResponse.json()) as ApiEnvelope<HistoryPayload>

      if (!quoteJson.success || !quoteJson.data) {
        throw new Error(quoteJson.error || '报价接口返回空数据')
      }

      if (!historyJson.success || !historyJson.data) {
        throw new Error(historyJson.error || '历史接口返回空数据')
      }

      startTransition(() => {
        setQuote(quoteJson.data)
        setHistory(
          (historyJson.data.history ?? []).slice().sort((left, right) => {
            return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
          }),
        )
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

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void refreshData(controller.signal)
    }, 0)
    const intervalId = window.setInterval(() => {
      const nextController = new AbortController()
      void refreshData(nextController.signal)
    }, REFRESH_INTERVAL_MS)
    const clockId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.clearInterval(intervalId)
      window.clearInterval(clockId)
    }
  }, [])

  const sourceHealth = useMemo<SourceHealth>(() => {
    if (!quote) {
      return error ? 'offline' : 'stale'
    }

    const updatedMs = new Date(quote.updatedAt).getTime()
    if (Number.isNaN(updatedMs)) {
      return error ? 'offline' : 'stale'
    }

    if (error) {
      return 'offline'
    }

    if (quote.sourceStatus.active === 'fallback' || quote.sourceStatus.stale) {
      return 'stale'
    }

    return now - updatedMs > STALE_AFTER_MS ? 'stale' : 'live'
  }, [quote, error, now])

  const recentHistory = useMemo(() => selectRecentHistory(history, 24), [history])
  const intradayData = useMemo(() => buildIntradayData(recentHistory), [recentHistory])
  const activeTimeframe = TIMEFRAMES.find((item) => item.id === timeframe) ?? TIMEFRAMES[1]
  const candleData = useMemo(
    () => buildCandles(recentHistory, activeTimeframe.minutes),
    [recentHistory, activeTimeframe.minutes],
  )
  const quoteRows = [quote?.marketReference.au9999, quote?.marketReference.autd]
  const sourceMeta = SOURCE_META[sourceHealth]
  const lastUpdatedText = quote ? formatDateTime(quote.updatedAt) : '--'
  const lastAttemptText = lastAttemptAt ? formatDateTime(lastAttemptAt) : '--'
  const anchorPrice = quote?.marketReference.calibration.anchorPrice ?? null
  const anchorSpread = quote?.marketReference.calibration.spread ?? null
  const anchorPremium = quote?.marketReference.calibration.premiumPercent ?? null
  const withinReferenceRange =
    quote?.marketReference.calibration.withinReferenceRange ?? null
  const buySignal = useMemo(() => normalizeOpportunity(quote), [quote])
  const signalMeta = getOpportunityMeta(buySignal?.level ?? 'none')
  const signalScoreText = formatScore(buySignal?.score ?? null)

  return (
    <main className="terminal">
      <header className="quote-strip">
        <div className="identity">
          <strong>工银积存金</strong>
          <span>ICBC_ACCUMULATION_GOLD</span>
        </div>
        <div className="live-price">
          <strong>{quote ? currencyFormatter.format(quote.price) : '--'}</strong>
          <span className={quote && quote.stats24h.percentChange24h >= 0 ? 'up' : 'down'}>
            {quote ? formatSignedPercent(quote.stats24h.percentChange24h) : '--'}
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
          label="锚点"
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

      {buySignal ? (
        <section className={`opportunity-alert opportunity-alert--${signalMeta.tone}`}>
          <div className="opportunity-alert__icon">
            <AlertTriangle size={20} />
          </div>
          <div className="opportunity-alert__body">
            <strong>
              {buySignal.level === 'strong'
                ? '绝佳买点观察'
                : `${signalMeta.label} · 买点观察`}
            </strong>
            <span>
              {buySignal.summary}
              {buySignal.reasons[0] ? ` · ${buySignal.reasons[0]}` : ''}
            </span>
            <small>仅代表当前信号观察优先级，不构成收益承诺或交易建议。</small>
          </div>
          <div className="opportunity-alert__score">
            <span>Score</span>
            <strong>{signalScoreText}</strong>
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
                  disabled={viewMode !== 'candles'}
                  key={item.id}
                  onClick={() => setTimeframe(item.id)}
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
            </div>
          </div>

          {viewMode === 'intraday' ? (
            <IntradayChartPanel
              isLoading={isLoading}
              latestPrice={quote?.price ?? null}
              latestReference={quote?.marketReference.calibration.anchorPrice ?? null}
              priceData={intradayData.price}
              referenceData={intradayData.reference}
            />
          ) : (
            <CandlestickChartPanel
              candleData={candleData}
              isLoading={isLoading}
              latestPrice={quote?.price ?? null}
              timeframeLabel={activeTimeframe.label}
            />
          )}
        </section>

        <aside className="side-rail">
          <OpportunityPanel signal={buySignal} />

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
            <StatLine label="来源" value={quote?.sourceName ?? '--'} />
          </Panel>

          <Panel title="联合校准" icon={<Target size={16} />}>
            <StatLine
              label={quote?.marketReference.calibration.anchorSymbol ?? '锚点'}
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
                  <span>{item?.symbol ?? '--'}</span>
                  <strong>{item ? currencyFormatter.format(item.latestPrice) : '--'}</strong>
                  <span>{item ? currencyFormatter.format(item.highPrice) : '--'}</span>
                  <span>{item ? currencyFormatter.format(item.lowPrice) : '--'}</span>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  )
}

function OpportunityPanel(props: { signal: OpportunityInfo | null }) {
  const meta = getOpportunityMeta(props.signal?.level ?? 'none')

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
      <SignalList
        emptyText="暂无后端 reasons"
        items={props.signal?.reasons ?? []}
        title="Reasons"
      />
      <SignalList
        emptyText="暂无后端 risks"
        items={props.signal?.risks ?? []}
        title="Risks"
      />
      <p className="opportunity-disclaimer">
        信号用于观察和复核，不承诺收益；请结合自身风险承受能力判断。
      </p>
    </article>
  )
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

function IntradayChartPanel(props: {
  priceData: LineDatum[]
  referenceData: LineDatum[]
  latestPrice: number | null
  latestReference: number | null
  isLoading: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<IntradayHover | null>(null)

  useEffect(() => {
    if (!containerRef.current || props.priceData.length < 2) {
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
    if (props.referenceData.length > 1) {
      referenceSeries.setData(props.referenceData)
    }

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

      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [props.priceData, props.referenceData, props.latestPrice, props.latestReference])

  return (
    <div className="chart-frame">
      <div className="data-window">
        <DataItem label="时间" value={hover?.timeLabel ?? '--'} />
        <DataItem
          label="工银"
          value={
            hover
              ? currencyFormatter.format(hover.price)
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
      {props.priceData.length < 2 ? (
        <div className="empty-chart">
          {props.isLoading ? '正在加载' : '样本不足'}
        </div>
      ) : (
        <div className="lw-chart" ref={containerRef} />
      )}
    </div>
  )
}

function CandlestickChartPanel(props: {
  candleData: CandleDatum[]
  latestPrice: number | null
  isLoading: boolean
  timeframeLabel: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<CandleHover | null>(null)

  useEffect(() => {
    if (!containerRef.current || props.candleData.length < 2) {
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
    chart.timeScale().fitContent()
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!param.time || !param.seriesData) {
        setHover(null)
        return
      }

      const point = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined

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
      })
    })

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [props.candleData])

  return (
    <div className="chart-frame">
      <div className="data-window data-window--ohlc">
        <DataItem label="周期" value={props.timeframeLabel} />
        <DataItem label="时间" value={hover?.timeLabel ?? '--'} />
        <DataItem label="开" value={formatMaybePrice(hover?.open ?? props.latestPrice)} />
        <DataItem label="高" value={formatMaybePrice(hover?.high ?? null)} tone="up" />
        <DataItem label="低" value={formatMaybePrice(hover?.low ?? null)} tone="down" />
        <DataItem label="收" value={formatMaybePrice(hover?.close ?? props.latestPrice)} />
      </div>
      {props.candleData.length < 2 ? (
        <div className="empty-chart">
          {props.isLoading ? '正在加载' : '样本不足'}
        </div>
      ) : (
        <div className="lw-chart" ref={containerRef} />
      )}
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

function selectRecentHistory(history: HistoryPoint[], windowHours: number) {
  const latest = history.at(-1)
  if (!latest) {
    return history
  }

  const cutoff = new Date(latest.timestamp).getTime() - windowHours * 60 * 60 * 1000
  const sliced = history.filter((point) => new Date(point.timestamp).getTime() >= cutoff)
  return sliced.length >= 2 ? sliced : history
}

function buildIntradayData(history: HistoryPoint[]) {
  const price = history
    .map((point) => ({
      time: toUtcTimestamp(point.timestamp),
      value: point.price,
    }))
    .filter((point) => point.time !== null) as LineDatum[]

  const reference = history
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

  return { price, reference }
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

function toUtcTimestamp(value: string) {
  const date = new Date(value)
  const ms = date.getTime()
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000) as UTCTimestamp
}

function chartOptions(container: HTMLElement) {
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    autoSize: false,
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
    },
  } as const
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

function formatMaybePrice(value: number | null) {
  return value === null ? '--' : currencyFormatter.format(value)
}

function formatSignedCurrency(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${currencyFormatter.format(value)}`
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${percentFormatter.format(value * 100)}%`
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
