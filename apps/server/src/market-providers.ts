const DEFAULT_PROVIDER_TIMEOUT_MS = Number(process.env.MARKET_PROVIDER_TIMEOUT_MS ?? '1800')
const DISABLE_EXTERNAL_PROVIDERS = process.env.DISABLE_EXTERNAL_MARKET_CONTEXT === '1'
const BROWSER_USER_AGENT = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/124.0.0.0 Safari/537.36',
].join(' ')

export type ProviderStatus = 'live' | 'unavailable'

export type ProviderQuote = {
  provider: string
  symbol: string
  label: string
  value: number
  previousClose: number | null
  unit: string
  updatedAt: string | null
}

export type ProviderSeriesPoint = {
  date: string
  value: number
}

export type ProviderResult<T> = {
  provider: string
  status: ProviderStatus
  data: T | null
  error: string | null
  latencyMs?: number
}

export type ProviderHealthRecord = {
  id: string
  label: string
  provider: string
  status: ProviderStatus
  sourceTier: ProviderSourceTier
  participatesInScoring: boolean
  lastSuccessAt: string | null
  lastFailureAt: string | null
  latencyMs: number | null
  latencyQuality: ProviderLatencyQuality
  latencyWeight: number
  failureStreak: number
  cooldownUntil: string | null
  qualityScore: number
  reliabilityRisk: ProviderReliabilityRisk
  error: string | null
  envVars: string[]
}

export type { ProviderHealthSnapshot } from './types.js'

export type NewsSentimentData = {
  score: number
  confidence: number
  summary: string
  sources: string[]
  updatedAt: string | null
}

type WeightedTitle = {
  title: string
  source: string
  weight: number
}

type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
        regularMarketTime?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          volume?: Array<number | null>
        }>
      }
    }>
  }
}

type WgcFlowsApiResult = {
  chartData?: {
    data?: Record<string, {
      series?: {
        tonnes?: Array<{
          name?: string
          data?: Array<[number, number | null]>
        }>
      }
    }>
  }
}

type CnGoldApiResponse = Record<string, {
  code?: string
  time?: number
  unit?: string
  q1?: number
  q2?: number
  q3?: number
  q4?: number
  q5?: number
  q6?: number
  q63?: number
  q70?: number
  q80?: number
}>

type CsvRow = Record<string, string>
type ConfiguredDomesticReference = {
  id?: string
  label?: string
  url?: string
  jsonPath?: string
  unit?: string
}
type ProviderSourceTier = 'critical' | 'core' | 'supporting' | 'experimental'
type ProviderLatencyQuality = 'fast' | 'normal' | 'slow' | 'timed_out'
type ProviderReliabilityRisk = 'low' | 'medium' | 'high'

type ProviderProbeDefinition = {
  id: string
  label: string
  envVars: string[]
  participatesInScoring: boolean
  sourceTier: ProviderSourceTier
  run: () => Promise<ProviderResult<unknown>>
}

type ProviderHealthUpdate = {
  id: string
  label: string
  provider: string
  status: ProviderStatus
  sourceTier: ProviderSourceTier
  participatesInScoring: boolean
  latencyMs: number | null
  error: string | null
  envVars: string[]
}

const LATENCY_FAST_MS = Number(process.env.MARKET_PROVIDER_LATENCY_FAST_MS ?? '650')
const LATENCY_SLOW_MS = Number(process.env.MARKET_PROVIDER_LATENCY_SLOW_MS ?? '1600')
const PROVIDER_COOLDOWN_BASE_MS = Number(process.env.MARKET_PROVIDER_COOLDOWN_BASE_MS ?? '60000')
const PROVIDER_COOLDOWN_MAX_MS = Number(process.env.MARKET_PROVIDER_COOLDOWN_MAX_MS ?? '900000')

const CNGOLD_ITEMS = {
  domesticGold: { code: 'JO_9753', label: '金投网国内黄金', unit: '元/克' },
  internationalGold: { code: 'JO_92233', label: '金投网国际黄金', unit: '美元/盎司' },
  internationalSilver: { code: 'JO_92232', label: '金投网国际白银', unit: '美元/盎司' },
} as const
const DEFAULT_ZHESHANG_ACCUMULATION_GOLD_URL =
  'https://api.tangdouz.com/a/zsgold.php'

const COT_GOLD_DATASET_URLS = [
  process.env.COT_GOLD_NET_URL,
  'https://data.nasdaq.com/api/v3/datasets/CFTC/088691_FO_ALL.csv?rows=2',
  'https://www.quandl.com/api/v3/datasets/CFTC/088691_FO_ALL.csv?rows=2',
].filter((url): url is string => Boolean(url))

const CONFIGURED_OFFICIAL_SERIES = {
  lbmaGoldPm: {
    env: 'LBMA_GOLD_PM_CSV_URL',
    aliases: ['IBA_GOLD_PM_CSV_URL'],
    provider: 'lbma',
    symbol: 'LBMA_GOLD_PM',
    label: 'LBMA 伦敦金 PM 定盘',
    unit: '美元/盎司',
    columns: [['gold', 'pm'], ['usd'], ['price'], ['value']],
  },
  worldGoldCouncilEtfFlow: {
    env: 'WGC_GOLD_ETF_FLOW_CSV_URL',
    aliases: [],
    provider: 'wgc',
    symbol: 'WGC_ETF_FLOW',
    label: 'World Gold Council ETF 资金流',
    unit: '吨',
    columns: [['flow', 'tonne'], ['net', 'flow'], ['tonnes'], ['value']],
  },
  centralBankGoldBuying: {
    env: 'CENTRAL_BANK_GOLD_CSV_URL',
    aliases: [],
    provider: 'central-bank',
    symbol: 'CENTRAL_BANK_GOLD',
    label: '全球央行购金',
    unit: '吨',
    columns: [['central', 'bank'], ['official', 'sector'], ['net', 'purchase'], ['tonnes'], ['value']],
  },
  cmeGoldOpenInterest: {
    env: 'CME_GOLD_OI_CSV_URL',
    aliases: ['CME_GOLD_OI_OFFICIAL_CSV_URL'],
    provider: 'cme',
    symbol: 'CME_GOLD_OI',
    label: 'CME 黄金未平仓合约',
    unit: '张',
    columns: [['open', 'interest'], ['openinterest'], ['oi'], ['value']],
  },
  cmeGoldVolume: {
    env: 'CME_GOLD_VOLUME_CSV_URL',
    aliases: ['CME_GOLD_VOLUME_OFFICIAL_CSV_URL'],
    provider: 'cme',
    symbol: 'CME_GOLD_VOLUME',
    label: 'CME 黄金成交量',
    unit: '张',
    columns: [['volume'], ['total', 'volume'], ['value']],
  },
} as const

const providerHealth = new Map<string, ProviderHealthRecord>()

export async function fetchYahooQuote(
  symbol: string,
  label: string,
  unit: string,
): Promise<ProviderResult<ProviderQuote>> {
  return safeProvider('yahoo', async () => {
    const response = await fetchYahooChart(symbol)

    if (!response.ok) {
      throw new Error(`Yahoo ${symbol} HTTP ${response.status}`)
    }

    const json = await response.json() as YahooChartResult
    const meta = json.chart?.result?.[0]?.meta
    const value = meta?.regularMarketPrice
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Yahoo ${symbol} 未返回有效价格`)
    }

    return {
      provider: 'yahoo',
      symbol,
      label,
      value,
      previousClose: meta?.chartPreviousClose ?? meta?.previousClose ?? null,
      unit,
      updatedAt: meta?.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
    }
  })
}

async function fetchYahooChart(symbol: string) {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`
  const init = {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      origin: 'https://finance.yahoo.com',
      referer: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      'user-agent': BROWSER_USER_AGENT,
    },
  }
  const query1 = await fetchWithTimeout(`https://query1.finance.yahoo.com${path}`, init)
  if (query1.ok || query1.status !== 403) {
    return query1
  }
  return fetchWithTimeout(`https://query2.finance.yahoo.com${path}`, init)
}

export async function fetchFredLatest(
  seriesId: string,
  label: string,
  unit: string,
): Promise<ProviderResult<ProviderQuote>> {
  return safeProvider('fred', async () => {
    const series = await fetchFredSeries(seriesId)
    const latest = series[series.length - 1]
    const previous = series[series.length - 2]
    if (!latest) {
      throw new Error(`FRED ${seriesId} 无有效数据`)
    }

    return {
      provider: 'fred',
      symbol: seriesId,
      label,
      value: latest.value,
      previousClose: previous?.value ?? null,
      unit,
      updatedAt: latest.date,
    }
  })
}

export async function fetchFredSeries(seriesId: string): Promise<ProviderSeriesPoint[]> {
  const apiKey = process.env.FRED_API_KEY
  if (apiKey) {
    try {
      const fromJson = await fetchFredJson(seriesId, apiKey)
      if (fromJson.length > 0) {
        return fromJson
      }
    } catch {
      // CSV fallback below keeps the provider useful without requiring an API key.
    }
  }

  return fetchFredCsv(seriesId)
}

export async function fetchCnGoldQuotes(): Promise<ProviderResult<ProviderQuote[]>> {
  return safeProvider('cngold', async () => {
    const codes = Object.values(CNGOLD_ITEMS).map((item) => item.code).join(',')
    const response = await fetchWithTimeout(
      `https://api.jijinhao.com/quoteCenter/realTime.htm?codes=${codes}&_=${Date.now()}`,
      {
        headers: {
          accept: 'application/json,text/plain,*/*',
          referer: 'https://quote.cngold.org/gjs/yhzhj.html',
          'user-agent': BROWSER_USER_AGENT,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`金投网 HTTP ${response.status}`)
    }

    const text = await response.text()
    const parsed = JSON.parse(stripJsonPrefix(text)) as CnGoldApiResponse
    return Object.values(CNGOLD_ITEMS).map((item) => {
      const quote = parsed[item.code]
      const value = normalizeNumber(quote?.q63)
      if (value === null || value <= 0) {
        throw new Error(`${item.label} 无有效价格`)
      }

      return {
        provider: 'cngold',
        symbol: item.code,
        label: item.label,
        value,
        previousClose: normalizeNumber(quote?.q2),
        unit: quote?.unit ?? item.unit,
        updatedAt: quote?.time ? new Date(quote.time).toISOString() : null,
      }
    })
  })
}

export async function fetchDomesticGoldReferenceQuotes(): Promise<ProviderResult<ProviderQuote[]>> {
  return safeProvider('domestic-gold-reference', async () => {
    const quotes: ProviderQuote[] = []
    const [cnGold, zheshang] = await Promise.all([
      fetchCnGoldQuotes(),
      fetchZheshangAccumulationGoldQuote(),
    ])
    if (cnGold.status === 'live' && cnGold.data) {
      quotes.push(...cnGold.data.filter((item) => item.unit === '元/克'))
    }
    if (zheshang.status === 'live' && zheshang.data) {
      quotes.push(zheshang.data)
    }

    quotes.push(...await fetchConfiguredDomesticReferences())
    if (quotes.length < 1) {
      throw new Error('未获取到国内黄金参考价')
    }

    return quotes
  })
}

export async function fetchZheshangAccumulationGoldQuote(): Promise<ProviderResult<ProviderQuote>> {
  const url = process.env.ZHESHANG_ACCUMULATION_GOLD_URL
    ?? DEFAULT_ZHESHANG_ACCUMULATION_GOLD_URL
  if (process.env.DISABLE_DEFAULT_ZHESHANG_REFERENCE === '1' && !process.env.ZHESHANG_ACCUMULATION_GOLD_URL) {
    return {
      provider: 'zheshang-accumulation-gold',
      status: 'unavailable',
      data: null,
      error: '默认浙商积存金参考源已关闭',
      latencyMs: 0,
    }
  }

  return safeProvider('zheshang-accumulation-gold', async () => {
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        referer: 'https://www.czbank.com/',
        'user-agent': BROWSER_USER_AGENT,
      },
    })
    if (!response.ok) {
      throw new Error(`浙商积存金 HTTP ${response.status}`)
    }
    const parsed = parseZheshangAccumulationGold(await response.text(), process.env.ZHESHANG_ACCUMULATION_GOLD_JSON_PATH)
    return {
      provider: 'zheshang-accumulation-gold',
      symbol: 'ZHESHANG_ACCUMULATION_GOLD',
      label: '浙商积存金',
      value: parsed.price,
      previousClose: parsed.previousClose,
      unit: '元/克',
      updatedAt: parsed.updatedAt,
    }
  })
}

export async function fetchCotGoldNetPosition(): Promise<ProviderResult<ProviderQuote>> {
  return safeProvider('cot', async () => {
    const errors: string[] = []
    for (const url of COT_GOLD_DATASET_URLS) {
      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            accept: 'text/csv,text/plain,*/*',
            referer: 'https://www.cftc.gov/',
          },
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const rows = parseCsv(await response.text())
        const latest = rows[0]
        const previous = rows[1]
        if (!latest) {
          throw new Error('COT CSV 无数据行')
        }
        const latestNet = extractCotNetPosition(latest)
        const previousNet = previous ? extractCotNetPosition(previous) : null
        const updatedAt = latest.Date ?? latest.date ?? latest['Report Date'] ?? latest['As of Date'] ?? null

        return {
          provider: 'cot',
          symbol: 'COT_GOLD_NET',
          label: 'CFTC 黄金非商净多头',
          value: latestNet,
          previousClose: previousNet,
          unit: '张',
          updatedAt,
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    throw new Error(`COT 黄金持仓源均不可用：${errors.join('；')}`)
  })
}

export async function fetchGldHoldings(): Promise<ProviderResult<ProviderQuote>> {
  return safeProvider('gld-holdings', async () => {
    const urls = [
      process.env.GLD_HOLDINGS_CSV_URL,
      process.env.GLD_HOLDINGS_URL,
      'https://www.spdrgoldshares.com/usa/gld/',
    ].filter((url): url is string => Boolean(url))
    const errors: string[] = []

    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            accept: 'text/csv,text/html,text/plain,*/*',
            referer: 'https://www.spdrgoldshares.com/',
          },
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const text = await response.text()
        const holding = parseGldHoldingText(text)
        return {
          provider: 'gld-holdings',
          symbol: 'GLD_FLOW',
          label: 'GLD ETF 持仓变化',
          value: holding.tonnes,
          previousClose: holding.previousTonnes,
          unit: '吨',
          updatedAt: holding.date,
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    throw new Error(`GLD 持仓源均不可用：${errors.join('；')}`)
  })
}

export async function fetchLbmaGoldPm(): Promise<ProviderResult<ProviderQuote>> {
  return fetchConfiguredOfficialSeries(CONFIGURED_OFFICIAL_SERIES.lbmaGoldPm)
}

export async function fetchWorldGoldCouncilEtfFlow(): Promise<ProviderResult<ProviderQuote>> {
  if (process.env.WGC_GOLD_ETF_FLOW_CSV_URL) {
    return fetchConfiguredOfficialSeries(CONFIGURED_OFFICIAL_SERIES.worldGoldCouncilEtfFlow)
  }

  return safeProvider('wgc', async () => {
    const response = await fetchWithTimeout(
      process.env.WGC_GOLD_ETF_FLOW_API_URL
        ?? 'https://fsapi.gold.org/api/v11/charts/etfv2/revised/flows-chart2?break-cache=11May26',
      {
        headers: {
          accept: 'application/json,text/plain,*/*',
          referer: 'https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows?app=true',
        },
      },
    )
    if (!response.ok) {
      throw new Error(`WGC ETF flow API HTTP ${response.status}`)
    }
    const parsed = parseWgcEtfFlow(await response.json() as WgcFlowsApiResult)
    return {
      provider: 'wgc',
      symbol: 'WGC_ETF_FLOW',
      label: 'World Gold Council ETF 资金流',
      value: parsed.value,
      previousClose: parsed.previousClose,
      unit: '吨',
      updatedAt: parsed.updatedAt,
    }
  })
}

export async function fetchCentralBankGoldBuying(): Promise<ProviderResult<ProviderQuote>> {
  if (process.env.CENTRAL_BANK_GOLD_CSV_URL) {
    return fetchConfiguredOfficialSeries(CONFIGURED_OFFICIAL_SERIES.centralBankGoldBuying)
  }

  return safeProvider('central-bank', async () => {
    const url = process.env.CENTRAL_BANK_GOLD_PAGE_URL
      ?? 'https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2025/central-banks'
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: 'text/html,text/plain,*/*',
        referer: 'https://www.gold.org/',
      },
    })
    if (!response.ok) {
      throw new Error(`WGC central bank page HTTP ${response.status}`)
    }
    const parsed = parseCentralBankGoldBuying(await response.text())
    return {
      provider: 'central-bank',
      symbol: 'CENTRAL_BANK_GOLD',
      label: '全球央行购金',
      value: parsed.value,
      previousClose: null,
      unit: '吨',
      updatedAt: parsed.updatedAt,
    }
  })
}

export async function fetchCmeGoldOpenInterest(): Promise<ProviderResult<ProviderQuote>> {
  return fetchConfiguredOfficialSeries(CONFIGURED_OFFICIAL_SERIES.cmeGoldOpenInterest)
}

export async function fetchCmeGoldVolume(): Promise<ProviderResult<ProviderQuote>> {
  if (process.env.CME_GOLD_VOLUME_CSV_URL) {
    return fetchConfiguredOfficialSeries(CONFIGURED_OFFICIAL_SERIES.cmeGoldVolume)
  }

  return fetchYahooDailyVolumeQuote('GC=F', 'CME/COMEX 黄金成交量代理', '张')
}

export async function probeAllMarketProviders(): Promise<ProviderHealthRecord[]> {
  const probes: ProviderProbeDefinition[] = [
    { id: 'GC=F', label: '国际黄金期货', envVars: [], sourceTier: 'critical', participatesInScoring: true, run: () => fetchYahooQuote('GC=F', '国际黄金期货', '美元/盎司') },
    { id: 'DX-Y.NYB', label: '美元指数', envVars: [], sourceTier: 'critical', participatesInScoring: true, run: () => fetchYahooQuote('DX-Y.NYB', '美元指数', '点') },
    { id: 'USDCNY=X', label: '美元/人民币', envVars: [], sourceTier: 'critical', participatesInScoring: true, run: () => fetchYahooQuote('USDCNY=X', '美元/人民币', 'CNY') },
    { id: 'DFII10', label: '10Y TIPS 实际利率', envVars: ['FRED_API_KEY'], sourceTier: 'critical', participatesInScoring: true, run: () => fetchFredLatest('DFII10', '10Y TIPS 实际利率', '%') },
    { id: 'T10YIE', label: '10Y 通胀预期', envVars: ['FRED_API_KEY'], sourceTier: 'core', participatesInScoring: true, run: () => fetchFredLatest('T10YIE', '10Y 通胀预期', '%') },
    { id: 'VIXCLS', label: 'VIX 恐慌指数', envVars: ['FRED_API_KEY'], sourceTier: 'supporting', participatesInScoring: true, run: () => fetchFredLatest('VIXCLS', 'VIX 恐慌指数', '点') },
    { id: 'CNGOLD', label: '金投网贵金属', envVars: [], sourceTier: 'supporting', participatesInScoring: true, run: () => fetchCnGoldQuotes() },
    { id: 'ZHESHANG_ACCUMULATION_GOLD', label: '浙商积存金参考', envVars: ['ZHESHANG_ACCUMULATION_GOLD_URL'], sourceTier: 'supporting', participatesInScoring: true, run: () => fetchZheshangAccumulationGoldQuote() },
    { id: 'COT_GOLD_NET', label: 'CFTC 黄金非商净多头', envVars: ['COT_GOLD_NET_URL'], sourceTier: 'core', participatesInScoring: true, run: () => fetchCotGoldNetPosition() },
    { id: 'GLD_FLOW', label: 'GLD ETF 持仓变化', envVars: ['GLD_HOLDINGS_CSV_URL', 'GLD_HOLDINGS_URL'], sourceTier: 'core', participatesInScoring: true, run: () => fetchGldHoldings() },
    { id: 'LBMA_GOLD_PM', label: 'LBMA/IBA 伦敦金 PM 定盘', envVars: ['LBMA_GOLD_PM_CSV_URL', 'IBA_GOLD_PM_CSV_URL', 'LBMA_GOLD_PM_CSV_AUTH_HEADER'], sourceTier: 'core', participatesInScoring: true, run: () => fetchLbmaGoldPm() },
    { id: 'WGC_ETF_FLOW', label: 'World Gold Council ETF 资金流', envVars: ['WGC_GOLD_ETF_FLOW_CSV_URL', 'WGC_GOLD_ETF_FLOW_API_URL'], sourceTier: 'core', participatesInScoring: true, run: () => fetchWorldGoldCouncilEtfFlow() },
    { id: 'CENTRAL_BANK_GOLD', label: '全球央行购金', envVars: ['CENTRAL_BANK_GOLD_CSV_URL', 'CENTRAL_BANK_GOLD_PAGE_URL'], sourceTier: 'supporting', participatesInScoring: true, run: () => fetchCentralBankGoldBuying() },
    { id: 'CME_GOLD_OI', label: 'CME 黄金未平仓合约', envVars: ['CME_GOLD_OI_CSV_URL', 'CME_GOLD_OI_OFFICIAL_CSV_URL', 'CME_GOLD_OI_CSV_AUTH_HEADER'], sourceTier: 'core', participatesInScoring: true, run: () => fetchCmeGoldOpenInterest() },
    { id: 'CME_GOLD_VOLUME', label: 'CME 黄金成交量', envVars: ['CME_GOLD_VOLUME_CSV_URL', 'CME_GOLD_VOLUME_OFFICIAL_CSV_URL'], sourceTier: 'supporting', participatesInScoring: true, run: () => fetchCmeGoldVolume() },
    { id: 'NEWS', label: '黄金新闻情绪', envVars: ['GOLD_NEWS_RSS_URLS'], sourceTier: 'experimental', participatesInScoring: true, run: () => fetchGoldNewsSentiment() },
    { id: 'BLOGGER', label: '博主/分析师观点', envVars: ['GOLD_BLOGGER_RSS_URLS'], sourceTier: 'experimental', participatesInScoring: true, run: () => fetchGoldBloggerSentiment() },
  ]

  const results = await Promise.all(probes.map(async (probe) => {
    const cooldown = getActiveProviderCooldown(probe)
    if (cooldown) {
      return cooldown
    }
    const startedAt = Date.now()
    const result = await probe.run()
    const latencyMs = result.latencyMs ?? Date.now() - startedAt
    return updateProviderHealth({
      id: probe.id,
      label: probe.label,
      provider: result.provider,
      status: result.status,
      sourceTier: probe.sourceTier,
      participatesInScoring: probe.participatesInScoring,
      latencyMs,
      error: result.error,
      envVars: probe.envVars,
    })
  }))

  return results
}

export function getProviderHealthHistory(): ProviderHealthRecord[] {
  return [...providerHealth.values()]
}

export function clearProviderHealthHistory() {
  providerHealth.clear()
}

export async function fetchGoldNewsSentiment(): Promise<ProviderResult<NewsSentimentData>> {
  return safeProvider('news-rss', async () => {
    const feeds = splitEnvList(process.env.GOLD_NEWS_RSS_URLS ?? process.env.GOLD_NEWS_RSS_URL)
    const urls = feeds.length > 0
      ? feeds
      : [
          'https://news.google.com/rss/search?q=gold%20price%20OR%20GLD%20OR%20CFTC%20gold&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
          'https://news.google.com/rss/search?q=%E9%BB%84%E9%87%91%20%E7%BE%8E%E5%85%83%20%E7%BE%8E%E5%80%BA%20%E9%99%8D%E6%81%AF&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        ]
    const titles = await fetchWeightedRssTitles(urls, '新闻')
    const sentiment = scoreWeightedTitles(titles)

    return {
      score: sentiment.score,
      confidence: sentiment.confidence,
      summary: `聚合 ${titles.length} 条黄金相关新闻，来源加权情绪 ${sentiment.weightedAverage.toFixed(1)}。`,
      sources: titles.slice(0, 6).map((item) => `${item.source}: ${item.title}`),
      updatedAt: new Date().toISOString(),
    }
  })
}

export async function fetchGoldBloggerSentiment(): Promise<ProviderResult<NewsSentimentData>> {
  return safeProvider('blogger-rss', async () => {
    const urls = splitEnvList(process.env.GOLD_BLOGGER_RSS_URLS)
    const fallbackUrls = urls.length > 0
      ? urls
      : [
          'https://news.google.com/rss/search?q=%E9%BB%84%E9%87%91%20%E5%88%86%E6%9E%90%E5%B8%88%20%E8%A7%82%E7%82%B9%20%E4%B9%B0%E7%82%B9&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
          'https://news.google.com/rss/search?q=gold%20analyst%20outlook%20bullion%20trader&hl=en-US&gl=US&ceid=US:en',
        ]
    const titles = await fetchWeightedRssTitles(fallbackUrls, '观点')
    const sentiment = scoreWeightedTitles(titles)

    return {
      score: sentiment.score,
      confidence: Math.max(20, Math.round(sentiment.confidence * 0.82)),
      summary: `聚合 ${titles.length} 条分析师/博主观点，来源权重后情绪 ${sentiment.weightedAverage.toFixed(1)}。`,
      sources: titles.slice(0, 6).map((item) => `${item.source}: ${item.title}`),
      updatedAt: new Date().toISOString(),
    }
  })
}

async function fetchFredJson(
  seriesId: string,
  apiKey: string,
): Promise<ProviderSeriesPoint[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '8',
  })
  const response = await fetchWithTimeout(
    `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`FRED JSON ${seriesId} HTTP ${response.status}`)
  }
  const json = await response.json() as { observations?: Array<{ date: string; value: string }> }
  return parseFredRows(json.observations ?? []).reverse()
}

async function fetchYahooDailyVolumeQuote(
  symbol: string,
  label: string,
  unit: string,
): Promise<ProviderResult<ProviderQuote>> {
  return safeProvider('yahoo-volume', async () => {
    const response = await fetchYahooChart(symbol)
    if (!response.ok) {
      throw new Error(`Yahoo volume ${symbol} HTTP ${response.status}`)
    }
    const json = await response.json() as YahooChartResult
    const result = json.chart?.result?.[0]
    const volumes = result?.indicators?.quote?.[0]?.volume ?? []
    const latestIndex = findLastIndex(volumes, (value) => typeof value === 'number' && Number.isFinite(value))
    if (latestIndex < 0) {
      throw new Error(`Yahoo ${symbol} 未返回有效成交量`)
    }
    const previousIndex = findLastIndex(volumes.slice(0, latestIndex), (value) => typeof value === 'number' && Number.isFinite(value))
    const updatedAt = result?.timestamp?.[latestIndex]
      ? new Date(result.timestamp[latestIndex] * 1000).toISOString()
      : result?.meta?.regularMarketTime
        ? new Date(result.meta.regularMarketTime * 1000).toISOString()
        : null

    return {
      provider: 'yahoo-volume',
      symbol: 'CME_GOLD_VOLUME',
      label,
      value: Number(volumes[latestIndex]),
      previousClose: previousIndex >= 0 ? Number(volumes[previousIndex]) : null,
      unit,
      updatedAt,
    }
  })
}

async function fetchFredCsv(seriesId: string): Promise<ProviderSeriesPoint[]> {
  const response = await fetchWithTimeout(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`,
  )
  if (!response.ok) {
    throw new Error(`FRED CSV ${seriesId} HTTP ${response.status}`)
  }
  const text = await response.text()
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(',')
      return { date, value }
    })
  return parseFredRows(rows).slice(-8)
}

function parseFredRows(rows: Array<{ date: string; value: string }>) {
  return rows
    .map((row) => ({
      date: row.date,
      value: Number(row.value),
    }))
    .filter((row) => row.date && Number.isFinite(row.value))
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines[0] ?? '')
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']))
  })
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  values.push(current.trim())
  return values
}

async function fetchConfiguredDomesticReferences() {
  const references = parseConfiguredDomesticReferences()
  const quotes: ProviderQuote[] = []
  for (const reference of references) {
    if (!reference.url) {
      continue
    }
    const response = await fetchWithTimeout(reference.url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
      },
    })
    if (!response.ok) {
      continue
    }
    const text = await response.text()
    const value = extractConfiguredReferenceValue(text, reference.jsonPath)
    if (value === null || value <= 0) {
      continue
    }
    quotes.push({
      provider: 'configured-domestic-gold',
      symbol: reference.id ?? reference.label ?? reference.url,
      label: reference.label ?? reference.id ?? '配置国内黄金参考价',
      value,
      previousClose: null,
      unit: reference.unit ?? '元/克',
      updatedAt: null,
    })
  }
  return quotes
}

function parseConfiguredDomesticReferences(): ConfiguredDomesticReference[] {
  const references: ConfiguredDomesticReference[] = []
  if (process.env.AU9999_REFERENCE_URL) {
    references.push({
      id: 'AU9999_REFERENCE',
      label: 'AU9999 参考价',
      url: process.env.AU9999_REFERENCE_URL,
      jsonPath: process.env.AU9999_REFERENCE_JSON_PATH,
      unit: '元/克',
    })
  }
  if (process.env.ACCUMULATION_GOLD_REFERENCE_URLS) {
    try {
      const parsed = JSON.parse(process.env.ACCUMULATION_GOLD_REFERENCE_URLS) as ConfiguredDomesticReference[]
      references.push(...parsed.filter((item) => typeof item.url === 'string'))
    } catch {
      // Optional feeds are best-effort; malformed config simply yields no extra quote.
    }
  }
  return references
}

function extractConfiguredReferenceValue(text: string, jsonPath: string | undefined) {
  if (jsonPath) {
    try {
      const parsed = JSON.parse(stripJsonPrefix(text))
      return normalizeNumber(readJsonPath(parsed, jsonPath))
    } catch {
      return null
    }
  }

  const match = text.match(/(?:price|value|latest|last|当前价|最新价)["'\s:=：]+([0-9]+(?:\.[0-9]+)?)/i)
    ?? text.match(/([0-9]{2,4}(?:\.[0-9]+)?)/)
  return normalizeNumber(match?.[1])
}

function parseZheshangAccumulationGold(text: string, jsonPath: string | undefined) {
  if (jsonPath) {
    const value = extractConfiguredReferenceValue(text, jsonPath)
    if (value === null || value <= 0) {
      throw new Error('浙商积存金 JSON 路径未解析到有效价格')
    }
    return { price: value, previousClose: null, updatedAt: null }
  }

  const price = normalizeNumber(
    text.match(/(?:最新价格|最新价|price|latest)["'\s:=：]*([0-9]+(?:\.[0-9]+)?)/i)?.[1]
      ?? text.match(/([0-9]{3,4}(?:\.[0-9]+)?)\s*元/)?.[1],
  )
  if (price === null || price <= 0) {
    throw new Error('浙商积存金未解析到有效价格')
  }

  const previousClose = normalizeNumber(
    text.match(/(?:前收盘价|昨收|previousClose)["'\s:=：]*([0-9]+(?:\.[0-9]+)?)/i)?.[1],
  )
  const updatedAtText = text.match(/(?:更新时间|updatedAt)["'\s:=：]*(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2})/i)?.[1]
  return {
    price,
    previousClose,
    updatedAt: updatedAtText ? normalizeChinaDateTime(updatedAtText) : null,
  }
}

function normalizeChinaDateTime(value: string) {
  const match = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/)
  if (!match) {
    return null
  }
  const [, year, month, day, hour, minute, second] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}+08:00`
}

function readJsonPath(value: unknown, jsonPath: string) {
  return jsonPath.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, value)
}

function extractCotNetPosition(row: CsvRow) {
  const long = findNumericColumn(row, ['noncommercial', 'long'])
    ?? findNumericColumn(row, ['non-commercial', 'long'])
    ?? findNumericColumn(row, ['money', 'long'])
  const short = findNumericColumn(row, ['noncommercial', 'short'])
    ?? findNumericColumn(row, ['non-commercial', 'short'])
    ?? findNumericColumn(row, ['money', 'short'])

  if (long === null || short === null) {
    throw new Error('COT CSV 未找到非商业多空列')
  }
  return long - short
}

function parseGldHoldingText(text: string) {
  const rows = parseCsv(text)
  if (rows.length > 0) {
    const parsedRows = rows
      .map((row) => ({
        date: findDateValue(row),
        tonnes: findNumericColumn(row, ['tonnes'])
          ?? findNumericColumn(row, ['tonne'])
          ?? findNumericColumn(row, ['gold', 'ounces'])
          ?? findNumericColumn(row, ['holdings']),
      }))
      .filter((row): row is { date: string | null; tonnes: number } => row.tonnes !== null)
    const latest = parsedRows[0]
    const previous = parsedRows[1]
    if (latest) {
      return {
        date: latest.date,
        tonnes: latest.tonnes > 10_000 ? latest.tonnes / 32_150.7466 : latest.tonnes,
        previousTonnes: previous
          ? previous.tonnes > 10_000 ? previous.tonnes / 32_150.7466 : previous.tonnes
          : null,
      }
    }
  }

  const normalized = text.replace(/,/g, '')
  const tonnesMatch = normalized.match(/(?:tonnes|tonne|gold holdings)[^\d]{0,40}(\d+(?:\.\d+)?)/i)
  if (!tonnesMatch) {
    throw new Error('未找到 GLD 持仓吨数字段')
  }

  return {
    date: null,
    tonnes: Number(tonnesMatch[1]),
    previousTonnes: null,
  }
}

function findDateValue(row: CsvRow) {
  const entry = Object.entries(row).find(([key]) => key.toLowerCase().includes('date'))
  return entry?.[1] || null
}

function parseWgcEtfFlow(json: WgcFlowsApiResult) {
  const weekly = json.chartData?.data?.Weekly?.series?.tonnes
    ?? json.chartData?.data?.Monthly?.series?.tonnes
  if (!weekly || weekly.length < 1) {
    throw new Error('WGC ETF flow API 未返回吨数序列')
  }

  const flowSeries = weekly.filter((series) => !/price/i.test(series.name ?? ''))
  const latestTimestamp = Math.max(
    ...flowSeries.flatMap((series) => (series.data ?? []).map((point) => point[0])),
  )
  if (!Number.isFinite(latestTimestamp)) {
    throw new Error('WGC ETF flow API 未返回有效日期')
  }
  const previousTimestamp = Math.max(
    ...flowSeries.flatMap((series) => (series.data ?? []).map((point) => point[0]).filter((time) => time < latestTimestamp)),
  )

  return {
    value: sumFlowAt(flowSeries, latestTimestamp),
    previousClose: Number.isFinite(previousTimestamp) ? sumFlowAt(flowSeries, previousTimestamp) : null,
    updatedAt: new Date(latestTimestamp).toISOString(),
  }
}

function sumFlowAt(
  seriesList: Array<{ data?: Array<[number, number | null]> }>,
  timestamp: number,
) {
  return seriesList.reduce((sum, series) => {
    const point = (series.data ?? []).find((item) => item[0] === timestamp)
    return sum + (typeof point?.[1] === 'number' && Number.isFinite(point[1]) ? point[1] : 0)
  }, 0)
}

function parseCentralBankGoldBuying(html: string) {
  const normalized = decodeXml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  const quarterly = normalized.match(/(?:net purchases|bought|buying)[^\.]{0,140}?(?:to|of|around)\s*([+-]?\d+(?:\.\d+)?)\s*t/i)
    ?? normalized.match(/([+-]?\d+(?:\.\d+)?)\s*t[^\.]{0,100}central bank/i)
  if (!quarterly) {
    throw new Error('WGC 央行购金页面未解析到吨数')
  }
  const dateMatch = normalized.match(/(\d{1,2}\s+[A-Za-z]+,\s+\d{4})/)
    ?? normalized.match(/(Q[1-4]\s+\d{4})/i)
    ?? normalized.match(/(20\d{2})/)
  return {
    value: Number(quarterly[1]),
    updatedAt: dateMatch?.[1] ?? null,
  }
}

async function fetchConfiguredOfficialSeries(config: typeof CONFIGURED_OFFICIAL_SERIES[keyof typeof CONFIGURED_OFFICIAL_SERIES]) {
  return safeProvider(config.provider, async () => {
    const url = [config.env, ...config.aliases]
      .map((env) => process.env[env])
      .find((value): value is string => Boolean(value))
    if (!url) {
      throw new Error(`${[config.env, ...config.aliases].join('/')} 未配置`)
    }
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: 'text/csv,text/plain,text/html,*/*',
        ...authorizedSourceHeaders(config.env),
      },
    })
    if (!response.ok) {
      throw new Error(`${config.label} HTTP ${response.status}`)
    }
    const rows = parseCsv(await response.text())
    const latest = rows[0]
    const previous = rows[1]
    if (!latest) {
      throw new Error(`${config.label} 无数据行`)
    }
    const value = findFirstNumericColumn(latest, config.columns)
    if (value === null) {
      throw new Error(`${config.label} 未找到数值列`)
    }
    const previousClose = previous ? findFirstNumericColumn(previous, config.columns) : null

    return {
      provider: config.provider,
      symbol: config.symbol,
      label: config.label,
      value,
      previousClose,
      unit: config.unit,
      updatedAt: findDateValue(latest),
    }
  })
}

function findNumericColumn(row: CsvRow, includes: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().replace(/[_\s-]+/g, '')
    const matched = includes.every((part) => normalizedKey.includes(part.toLowerCase().replace(/[_\s-]+/g, '')))
    if (!matched) {
      continue
    }
    const normalizedValue = normalizeNumber(value.replace(/,/g, ''))
    if (normalizedValue !== null) {
      return normalizedValue
    }
  }
  return null
}

function findFirstNumericColumn(row: CsvRow, candidates: readonly (readonly string[])[]) {
  for (const candidate of candidates) {
    const value = findNumericColumn(row, [...candidate])
    if (value !== null) {
      return value
    }
  }
  return null
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index
    }
  }
  return -1
}

function scoreNewsTitle(title: string) {
  const normalized = title.toLowerCase()
  const supportive = [
    '避险',
    '降息',
    '宽松',
    '通胀',
    '地缘',
    '央行买金',
    'safe haven',
    'rate cut',
    'inflation',
    'central bank',
    'rally',
    'surge',
  ]
  const pressure = [
    '美元走强',
    '收益率上升',
    '加息',
    '回落',
    '下跌',
    'stronger dollar',
    'yields rise',
    'rate hike',
    'drop',
    'slump',
    'falls',
  ]
  const score =
    supportive.filter((word) => normalized.includes(word)).length -
    pressure.filter((word) => normalized.includes(word)).length
  return { title, score }
}

async function fetchWeightedRssTitles(urls: string[], defaultSource: string) {
  const titles: WeightedTitle[] = []
  const errors: string[] = []

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          accept: 'application/rss+xml,text/xml,*/*',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const source = inferSourceName(url, defaultSource)
      const weight = inferSourceWeight(source)
      const text = await response.text()
      const feedTitles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g)]
        .map((match) => decodeXml(match[1] ?? match[2] ?? '').trim())
        .filter((title) => title && !title.includes('Google News'))
        .slice(0, 10)
        .map((title) => ({ title, source, weight }))
      titles.push(...feedTitles)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (titles.length < 1) {
    throw new Error(`RSS 源均不可用或无标题：${errors.join('；')}`)
  }

  return dedupeTitles(titles).slice(0, 18)
}

function scoreWeightedTitles(titles: WeightedTitle[]) {
  const scored = titles.map((item) => ({ ...item, score: scoreNewsTitle(item.title).score }))
  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0) || 1
  const weightedAverage = scored.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
  return {
    score: Math.round(Math.min(Math.max(50 + weightedAverage * 8, 20), 80)),
    confidence: Math.min(86, 24 + scored.length * 3 + Math.min(totalWeight * 2, 18)),
    weightedAverage,
  }
}

function inferSourceName(url: string, fallback: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return fallback
  }
}

function inferSourceWeight(source: string) {
  if (/reuters|bloomberg|wsj|ft\.com|cnbc|marketwatch/i.test(source)) {
    return 1.3
  }
  if (/google|bing|news/i.test(source)) {
    return 1
  }
  return 0.82
}

function dedupeTitles(titles: WeightedTitle[]) {
  const seen = new Set<string>()
  return titles.filter((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 96)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function splitEnvList(value: string | undefined) {
  return value
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : []
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function safeProvider<T>(
  provider: string,
  load: () => Promise<T>,
): Promise<ProviderResult<T>> {
  const startedAt = Date.now()
  if (DISABLE_EXTERNAL_PROVIDERS) {
    return {
      provider,
      status: 'unavailable',
      data: null,
      error: '外部 provider 已被环境变量关闭',
      latencyMs: Date.now() - startedAt,
    }
  }

  try {
    return {
      provider,
      status: 'live',
      data: await load(),
      error: null,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      provider,
      status: 'unavailable',
      data: null,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROVIDER_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        ...init.headers,
      },
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function stripJsonPrefix(text: string) {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('响应不包含 JSON 对象')
  }
  return text.slice(firstBrace, lastBrace + 1)
}

function normalizeNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function authorizedSourceHeaders(baseEnv: string): Record<string, string> {
  const authHeader = process.env[`${baseEnv.replace(/_URL$/, '')}_AUTH_HEADER`]
  if (!authHeader) {
    return {}
  }
  const separatorIndex = authHeader.indexOf(':')
  if (separatorIndex <= 0) {
    return { authorization: authHeader }
  }
  return {
    [authHeader.slice(0, separatorIndex).trim()]: authHeader.slice(separatorIndex + 1).trim(),
  }
}

function getActiveProviderCooldown(probe: ProviderProbeDefinition) {
  const previous = providerHealth.get(probe.id)
  if (!previous?.cooldownUntil || previous.status !== 'unavailable') {
    return null
  }
  const cooldownUntilMs = Date.parse(previous.cooldownUntil)
  if (!Number.isFinite(cooldownUntilMs) || cooldownUntilMs <= Date.now()) {
    return null
  }

  return updateProviderHealth({
    id: probe.id,
    label: probe.label,
    provider: previous.provider,
    status: 'unavailable',
    sourceTier: probe.sourceTier,
    participatesInScoring: probe.participatesInScoring,
    latencyMs: 0,
    error: `连续失败冷却中，预计 ${previous.cooldownUntil} 后重试`,
    envVars: probe.envVars,
  }, { preserveCooldown: true })
}

function updateProviderHealth(input: ProviderHealthUpdate, options: { preserveCooldown?: boolean } = {}) {
  const previous = providerHealth.get(input.id)
  const now = new Date().toISOString()
  const failureStreak = input.status === 'unavailable'
    ? options.preserveCooldown
      ? previous?.failureStreak ?? 1
      : (previous?.failureStreak ?? 0) + 1
    : 0
  const latencyQuality = classifyProviderLatency(input.latencyMs, input.status)
  const latencyWeight = getProviderLatencyWeight(latencyQuality)
  const cooldownUntil = input.status === 'unavailable'
    ? options.preserveCooldown
      ? previous?.cooldownUntil ?? calculateCooldownUntil(failureStreak)
      : calculateCooldownUntil(failureStreak)
    : null
  const qualityScore = calculateProviderQualityScore({
    status: input.status,
    sourceTier: input.sourceTier,
    latencyQuality,
    failureStreak,
    participatesInScoring: input.participatesInScoring,
  })
  const record: ProviderHealthRecord = {
    ...input,
    latencyQuality,
    latencyWeight,
    failureStreak,
    cooldownUntil,
    qualityScore,
    reliabilityRisk: classifyProviderReliabilityRisk(qualityScore, input.sourceTier, failureStreak),
    lastSuccessAt: input.status === 'live' ? now : previous?.lastSuccessAt ?? null,
    lastFailureAt: input.status === 'unavailable' ? now : previous?.lastFailureAt ?? null,
  }
  providerHealth.set(input.id, record)
  return record
}

function classifyProviderLatency(
  latencyMs: number | null,
  status: ProviderStatus,
): ProviderLatencyQuality {
  if (status === 'unavailable' && (latencyMs === null || latencyMs >= DEFAULT_PROVIDER_TIMEOUT_MS)) {
    return 'timed_out'
  }
  if (latencyMs === null || latencyMs >= LATENCY_SLOW_MS) {
    return 'slow'
  }
  if (latencyMs <= LATENCY_FAST_MS) {
    return 'fast'
  }
  return 'normal'
}

function getProviderLatencyWeight(latencyQuality: ProviderLatencyQuality) {
  if (latencyQuality === 'fast') {
    return 1
  }
  if (latencyQuality === 'normal') {
    return 0.88
  }
  if (latencyQuality === 'slow') {
    return 0.68
  }
  return 0.45
}

function calculateCooldownUntil(failureStreak: number) {
  const multiplier = Math.max(1, Math.min(2 ** Math.max(0, failureStreak - 1), 15))
  const cooldownMs = Math.min(PROVIDER_COOLDOWN_BASE_MS * multiplier, PROVIDER_COOLDOWN_MAX_MS)
  return new Date(Date.now() + cooldownMs).toISOString()
}

function calculateProviderQualityScore(input: {
  status: ProviderStatus
  sourceTier: ProviderSourceTier
  latencyQuality: ProviderLatencyQuality
  failureStreak: number
  participatesInScoring: boolean
}) {
  if (!input.participatesInScoring) {
    return 0
  }

  const tierBase: Record<ProviderSourceTier, number> = {
    critical: 100,
    core: 92,
    supporting: 82,
    experimental: 70,
  }
  const latencyPenalty: Record<ProviderLatencyQuality, number> = {
    fast: 0,
    normal: 5,
    slow: 14,
    timed_out: 28,
  }
  const statusPenalty = input.status === 'live' ? 0 : 45
  const repeatedFailurePenalty = Math.min(input.failureStreak * 8, 24)

  return Math.round(clamp(
    tierBase[input.sourceTier] - latencyPenalty[input.latencyQuality] - statusPenalty - repeatedFailurePenalty,
    0,
    100,
  ))
}

function classifyProviderReliabilityRisk(
  qualityScore: number,
  sourceTier: ProviderSourceTier,
  failureStreak: number,
): ProviderReliabilityRisk {
  if (failureStreak >= 2 || qualityScore < 45 || (sourceTier === 'critical' && qualityScore < 70)) {
    return 'high'
  }
  if (qualityScore < 76 || sourceTier === 'experimental') {
    return 'medium'
  }
  return 'low'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
