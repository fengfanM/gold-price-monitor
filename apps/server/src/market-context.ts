import type {
  BacktestFactor,
  HistoryPoint,
  MarketContext,
  MarketFactor,
  MarketFactorImpact,
  QuoteSample,
  SentimentFactor,
} from './types.js'
import {
  fetchCnGoldQuotes,
  fetchCentralBankGoldBuying,
  fetchCmeGoldOpenInterest,
  fetchCmeGoldVolume,
  fetchCotGoldNetPosition,
  fetchFredLatest,
  fetchGldHoldings,
  fetchGoldBloggerSentiment,
  fetchGoldNewsSentiment,
  getProviderHealthHistory,
  fetchLbmaGoldPm,
  fetchWorldGoldCouncilEtfFlow,
  fetchYahooQuote as fetchProviderYahooQuote,
  type NewsSentimentData,
  type ProviderQuote,
  type ProviderResult,
} from './market-providers.js'

type FactorScorer = (
  changePercent: number | null,
  quote: ProviderQuote,
) => { score: number; impact: MarketFactorImpact; summary: string }

export async function buildMarketContext(
  latestQuote: QuoteSample,
  history: HistoryPoint[],
): Promise<MarketContext> {
  const [spotGoldUsd, dollarIndex, usdCny] = await Promise.all([
    fetchProviderFactor(
      fetchProviderYahooQuote('GC=F', '国际黄金期货', '美元/盎司'),
      scoreGoldMomentum,
      { id: 'GC=F', label: '国际黄金期货', unit: '美元/盎司' },
    ),
    fetchProviderFactor(
      fetchProviderYahooQuote('DX-Y.NYB', '美元指数', '点'),
      scoreDollarIndex,
      { id: 'DX-Y.NYB', label: '美元指数', unit: '点' },
    ),
    fetchProviderFactor(
      fetchProviderYahooQuote('USDCNY=X', '美元/人民币', 'CNY'),
      scoreUsdCny,
      { id: 'USDCNY=X', label: '美元/人民币', unit: 'CNY' },
    ),
  ])
  const rawMacroFactors = await buildMacroFactors()

  const news = await buildNewsSentimentFactor()
  const blogger = await buildBloggerSentimentFactor()
  const backtest = buildBacktestFactor(latestQuote, history)
  const ruleFactors = buildGoldRuleFactors(
    [spotGoldUsd, dollarIndex, usdCny, ...rawMacroFactors],
    backtest,
  )
  const macroFactors = [...rawMacroFactors, ...ruleFactors]
  const factorScore = Math.round(
    (
      averageFactorScore([spotGoldUsd, dollarIndex, usdCny, ...macroFactors]) +
      news.score +
      blogger.score +
      backtestScore(backtest)
    ) / 4,
  )

  return {
    updatedAt: new Date().toISOString(),
    factorScore,
    summary: buildContextSummary(factorScore, [spotGoldUsd, dollarIndex, usdCny, ...macroFactors], news, blogger, backtest),
    factors: {
      spotGoldUsd,
      dollarIndex,
      usdCny,
    },
    macroFactors,
    sentiment: {
      news,
      blogger,
    },
    backtest,
    providerHealth: getProviderHealthHistory(),
  }
}

export function buildUnavailableMarketContext(
  latestQuote: QuoteSample,
  history: HistoryPoint[],
): MarketContext {
  const now = new Date().toISOString()
  const backtest = buildBacktestFactor(latestQuote, history)
  const unavailable = (id: string, label: string, unit: string): MarketFactor => ({
    id,
    label,
    unit,
    value: null,
    changePercent: null,
    impact: 'unknown',
    score: 50,
    status: 'unavailable',
    summary: `${label}暂不可用，策略按中性处理。`,
    updatedAt: null,
  })
  const news = buildSentimentFactor('news', '新闻情绪', '新闻情绪接口尚未配置，当前以中性分进入专家团。')
  const blogger = buildSentimentFactor('blogger', '博主观点可信度', '博主观点源尚未配置，当前不让外部观点影响买卖点强度。')
  const macroFactors = [
    unavailable('DFII10', '10Y TIPS 实际利率', '%'),
    unavailable('T10YIE', '10Y 通胀预期', '%'),
    unavailable('VIXCLS', 'VIX 恐慌指数', '点'),
    unavailable('DFF', '联邦基金利率', '%'),
    unavailable('DGS10', '10Y 美债收益率', '%'),
    unavailable('T10Y2Y', '10Y-2Y 收益率曲线', '%'),
    unavailable('JO_9753', '金投网国内黄金', '元/克'),
    unavailable('JO_92233', '金投网国际黄金', '美元/盎司'),
    unavailable('JO_92232', '金投网国际白银', '美元/盎司'),
    unavailable('GOLD_SILVER_RATIO', '金银比', '倍'),
    unavailable('COT_GOLD_NET', 'CFTC 黄金非商净多头', '张'),
    unavailable('GLD_FLOW', 'GLD ETF 持仓变化', '吨'),
    unavailable('LBMA_GOLD_PM', 'LBMA 伦敦金 PM 定盘', '美元/盎司'),
    unavailable('WGC_ETF_FLOW', 'World Gold Council ETF 资金流', '吨'),
    unavailable('CENTRAL_BANK_GOLD', '全球央行购金', '吨'),
    unavailable('CME_GOLD_OI', 'CME 黄金未平仓合约', '张'),
    unavailable('CME_GOLD_VOLUME', 'CME 黄金成交量', '张'),
  ]

  return {
    updatedAt: now,
    factorScore: Math.round((50 + 50 + 50 + news.score + blogger.score + backtestScore(backtest)) / 6),
    summary: '外部宏观行情暂不可用，已降级为工行报价、上金所锚点和本地回测因子。',
    factors: {
      spotGoldUsd: unavailable('spotGoldUsd', '国际黄金期货', '美元/盎司'),
      dollarIndex: unavailable('dollarIndex', '美元指数', '点'),
      usdCny: unavailable('usdCny', '美元/人民币', 'CNY'),
    },
    macroFactors,
    sentiment: { news, blogger },
    backtest,
    providerHealth: getProviderHealthHistory(),
  }
}

async function fetchProviderFactor(
  resultPromise: Promise<ProviderResult<ProviderQuote>>,
  scorer: FactorScorer,
  fallback: { id: string; label: string; unit: string },
): Promise<MarketFactor> {
  const result = await resultPromise
  const quote = result.data
  if (result.status !== 'live' || !quote) {
    return unavailableFactor(fallback.id, fallback.label, fallback.unit, result.error ?? `${result.provider} provider 未返回数据`)
  }

  return providerQuoteToFactor(quote, scorer)
}

async function buildMacroFactors(): Promise<MarketFactor[]> {
  const [
    realYield,
    inflationExpectation,
    vix,
    fedFundsRate,
    tenYearYield,
    yieldCurve,
    cotGoldNet,
    gldFlow,
    lbmaGoldPm,
    worldGoldCouncilEtfFlow,
    centralBankGoldBuying,
    cmeGoldOpenInterest,
    cmeGoldVolume,
    cnGoldQuotes,
  ] = await Promise.all([
    fetchProviderFactor(
      fetchFredLatest('DFII10', '10Y TIPS 实际利率', '%'),
      scoreRealYield,
      { id: 'DFII10', label: '10Y TIPS 实际利率', unit: '%' },
    ),
    fetchProviderFactor(
      fetchFredLatest('T10YIE', '10Y 通胀预期', '%'),
      scoreInflationExpectation,
      { id: 'T10YIE', label: '10Y 通胀预期', unit: '%' },
    ),
    fetchProviderFactor(
      fetchFredLatest('VIXCLS', 'VIX 恐慌指数', '点'),
      scoreVix,
      { id: 'VIXCLS', label: 'VIX 恐慌指数', unit: '点' },
    ),
    fetchProviderFactor(
      fetchFredLatest('DFF', '联邦基金利率', '%'),
      scoreFedFundsRate,
      { id: 'DFF', label: '联邦基金利率', unit: '%' },
    ),
    fetchProviderFactor(
      fetchFredLatest('DGS10', '10Y 美债收益率', '%'),
      scoreNominalYield,
      { id: 'DGS10', label: '10Y 美债收益率', unit: '%' },
    ),
    fetchProviderFactor(
      fetchFredLatest('T10Y2Y', '10Y-2Y 收益率曲线', '%'),
      scoreYieldCurve,
      { id: 'T10Y2Y', label: '10Y-2Y 收益率曲线', unit: '%' },
    ),
    fetchProviderFactor(
      fetchCotGoldNetPosition(),
      scoreCotGoldNet,
      { id: 'COT_GOLD_NET', label: 'CFTC 黄金非商净多头', unit: '张' },
    ),
    fetchProviderFactor(
      fetchGldHoldings(),
      scoreGldHoldings,
      { id: 'GLD_FLOW', label: 'GLD ETF 持仓变化', unit: '吨' },
    ),
    fetchProviderFactor(
      fetchLbmaGoldPm(),
      scoreGoldMomentum,
      { id: 'LBMA_GOLD_PM', label: 'LBMA 伦敦金 PM 定盘', unit: '美元/盎司' },
    ),
    fetchProviderFactor(
      fetchWorldGoldCouncilEtfFlow(),
      scoreWgcEtfFlow,
      { id: 'WGC_ETF_FLOW', label: 'World Gold Council ETF 资金流', unit: '吨' },
    ),
    fetchProviderFactor(
      fetchCentralBankGoldBuying(),
      scoreCentralBankGoldBuying,
      { id: 'CENTRAL_BANK_GOLD', label: '全球央行购金', unit: '吨' },
    ),
    fetchProviderFactor(
      fetchCmeGoldOpenInterest(),
      scoreCmeOpenInterest,
      { id: 'CME_GOLD_OI', label: 'CME 黄金未平仓合约', unit: '张' },
    ),
    fetchProviderFactor(
      fetchCmeGoldVolume(),
      scoreCmeVolume,
      { id: 'CME_GOLD_VOLUME', label: 'CME 黄金成交量', unit: '张' },
    ),
    fetchCnGoldQuotes(),
  ])

  const cnGoldFactors = cnGoldQuotes.status === 'live' && cnGoldQuotes.data
    ? cnGoldQuotes.data.map((quote) => providerQuoteToFactor(quote, scoreCnGoldQuote))
    : [
        unavailableFactor('JO_9753', '金投网国内黄金', '元/克', cnGoldQuotes.error ?? '金投网 provider 未返回数据'),
        unavailableFactor('JO_92233', '金投网国际黄金', '美元/盎司', cnGoldQuotes.error ?? '金投网 provider 未返回数据'),
        unavailableFactor('JO_92232', '金投网国际白银', '美元/盎司', cnGoldQuotes.error ?? '金投网 provider 未返回数据'),
      ]
  const goldSilverRatio = buildGoldSilverRatio(cnGoldFactors)

  return [
    realYield,
    inflationExpectation,
    vix,
    fedFundsRate,
    tenYearYield,
    yieldCurve,
    ...cnGoldFactors,
    goldSilverRatio,
    cotGoldNet,
    gldFlow,
    lbmaGoldPm,
    worldGoldCouncilEtfFlow,
    centralBankGoldBuying,
    cmeGoldOpenInterest,
    cmeGoldVolume,
  ]
}

function providerQuoteToFactor(
  quote: ProviderQuote,
  scorer: FactorScorer,
): MarketFactor {
  const changePercent =
    quote.previousClose && quote.previousClose > 0
      ? (quote.value - quote.previousClose) / quote.previousClose
      : null
  const scored = scorer(changePercent, quote)

  return {
    id: quote.symbol,
    label: quote.label,
    unit: quote.unit,
    value: quote.value,
    changePercent,
    impact: scored.impact,
    score: scored.score,
    status: 'live',
    summary: scored.summary,
    updatedAt: quote.updatedAt,
  }
}

function averageFactorScore(factors: MarketFactor[]) {
  const scores = factors.map((item) => item.score).filter((score) => Number.isFinite(score))
  if (scores.length < 1) {
    return 50
  }
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function unavailableFactor(
  id: string,
  label: string,
  unit: string,
  reason: string,
): MarketFactor {
  return {
    id,
    label,
    unit,
    value: null,
    changePercent: null,
    impact: 'unknown',
    score: 50,
    status: 'unavailable',
    summary: `${label}暂不可用：${reason}`,
    updatedAt: null,
  }
}

function buildSentimentFactor(
  id: SentimentFactor['id'],
  label: string,
  summary: string,
): SentimentFactor {
  return {
    id,
    label,
    score: 50,
    confidence: 20,
    status: 'unavailable',
    summary,
    sources: [],
    updatedAt: null,
  }
}

async function buildNewsSentimentFactor(): Promise<SentimentFactor> {
  const result = await fetchGoldNewsSentiment()
  if (result.status !== 'live' || !result.data) {
    return buildSentimentFactor(
      'news',
      '新闻情绪',
      `新闻情绪暂不可用：${result.error ?? 'RSS provider 未返回数据'}。`,
    )
  }
  return newsDataToSentiment(result.data)
}

async function buildBloggerSentimentFactor(): Promise<SentimentFactor> {
  const result = await fetchGoldBloggerSentiment()
  if (result.status !== 'live' || !result.data) {
    return buildSentimentFactor(
      'blogger',
      '博主观点可信度',
      `博主观点暂不可用：${result.error ?? 'RSS provider 未返回数据'}。`,
    )
  }
  return {
    ...newsDataToSentiment(result.data),
    id: 'blogger',
    label: '博主观点可信度',
  }
}

function newsDataToSentiment(data: NewsSentimentData): SentimentFactor {
  return {
    id: 'news',
    label: '新闻情绪',
    score: data.score,
    confidence: data.confidence,
    status: 'live',
    summary: data.summary,
    sources: data.sources,
    updatedAt: data.updatedAt,
  }
}

function buildBacktestFactor(
  latestQuote: QuoteSample,
  history: HistoryPoint[],
): BacktestFactor {
  const points = [...history, quoteToHistoryPoint(latestQuote)]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
  const sampleSize = points.length
  const horizons = [5, 15, 60].map((minutes) => buildBacktestHorizon(points, minutes))
  const availableHorizons = horizons.filter((item) => item.averageReturn !== null)

  if (sampleSize < 8 || availableHorizons.length < 1) {
    return {
      status: sampleSize > 1 ? 'derived' : 'unavailable',
      sampleSize,
      summary: '本地历史样本不足，回测收益/回撤暂不用于强信号。',
      horizons,
    }
  }

  const averageReturn =
    availableHorizons.reduce((sum, item) => sum + (item.averageReturn ?? 0), 0) / availableHorizons.length
  const worstDrawdown = Math.min(...availableHorizons.map((item) => item.maxDrawdownAfterSignal ?? 0))

  return {
    status: 'derived',
    sampleSize,
    summary: `本地回放平均后续收益 ${formatPercent(averageReturn)}，最差后续回撤 ${formatPercent(worstDrawdown)}。`,
    horizons,
  }
}

function buildBacktestHorizon(points: HistoryPoint[], minutes: number) {
  const horizonMs = minutes * 60 * 1000
  const returns: number[] = []
  const drawdowns: number[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const currentMs = new Date(current.timestamp).getTime()
    const future = points.find((candidate) => {
      const candidateMs = new Date(candidate.timestamp).getTime()
      return candidateMs - currentMs >= horizonMs
    })

    if (!future || current.price <= 0) {
      continue
    }

    const window = points.filter((candidate) => {
      const candidateMs = new Date(candidate.timestamp).getTime()
      return candidateMs > currentMs && candidateMs <= new Date(future.timestamp).getTime()
    })
    const minPrice = window.reduce((min, item) => Math.min(min, item.price), current.price)
    returns.push((future.price - current.price) / current.price)
    drawdowns.push((minPrice - current.price) / current.price)
  }

  return {
    label: `${minutes}m`,
    winRate: returns.length > 0
      ? returns.filter((value) => value > 0).length / returns.length
      : null,
    averageReturn: returns.length > 0
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : null,
    maxDrawdownAfterSignal: drawdowns.length > 0
      ? Math.min(...drawdowns)
      : null,
  }
}

function quoteToHistoryPoint(quote: QuoteSample): HistoryPoint {
  return {
    timestamp: quote.fetchedAt,
    sourceKind: quote.sourceKind,
    price: quote.price,
    activePrice: quote.activePrice,
    regularPrice: quote.regularPrice,
    sellPrice: quote.sellPrice,
    dayLow: quote.dayLow,
    dayHigh: quote.dayHigh,
    referenceAnchorPrice: quote.marketReference.calibration.anchorPrice,
    referenceAu9999Price: quote.marketReference.au9999?.latestPrice ?? null,
    referenceAutdPrice: quote.marketReference.autd?.latestPrice ?? null,
  }
}

function scoreGoldMomentum(changePercent: number | null) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: '国际黄金动量不可用。' }
  }
  if (changePercent >= 0.006) {
    return { score: 68, impact: 'supportive' as const, summary: `国际黄金走强 ${formatPercent(changePercent)}，对人民币金价形成支撑。` }
  }
  if (changePercent <= -0.006) {
    return { score: 32, impact: 'pressure' as const, summary: `国际黄金走弱 ${formatPercent(changePercent)}，买点需更谨慎。` }
  }
  return { score: 52, impact: 'neutral' as const, summary: `国际黄金波动 ${formatPercent(changePercent)}，宏观方向中性。` }
}

function scoreDollarIndex(changePercent: number | null) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: '美元指数动量不可用。' }
  }
  if (changePercent >= 0.004) {
    return { score: 35, impact: 'pressure' as const, summary: `美元指数走强 ${formatPercent(changePercent)}，通常压制黄金估值。` }
  }
  if (changePercent <= -0.004) {
    return { score: 65, impact: 'supportive' as const, summary: `美元指数走弱 ${formatPercent(changePercent)}，对黄金相对友好。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `美元指数波动 ${formatPercent(changePercent)}，影响中性。` }
}

function scoreUsdCny(changePercent: number | null) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: '美元/人民币动量不可用。' }
  }
  if (changePercent >= 0.003) {
    return { score: 62, impact: 'supportive' as const, summary: `美元/人民币上行 ${formatPercent(changePercent)}，人民币计价黄金有汇率支撑。` }
  }
  if (changePercent <= -0.003) {
    return { score: 40, impact: 'pressure' as const, summary: `美元/人民币下行 ${formatPercent(changePercent)}，汇率对人民币金价形成压力。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `美元/人民币波动 ${formatPercent(changePercent)}，汇率影响中性。` }
}

function scoreRealYield(_changePercent: number | null, quote: ProviderQuote) {
  const delta = quote.previousClose === null ? null : quote.value - quote.previousClose
  if (quote.value >= 2.2 || (delta !== null && delta >= 0.08)) {
    return { score: 30, impact: 'pressure' as const, summary: `实际利率 ${formatNumber(quote.value)}%，偏高或上行会压制无息资产黄金。` }
  }
  if (quote.value <= 1.4 || (delta !== null && delta <= -0.08)) {
    return { score: 68, impact: 'supportive' as const, summary: `实际利率 ${formatNumber(quote.value)}%，低位或回落对黄金估值友好。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `实际利率 ${formatNumber(quote.value)}%，处于中性区间。` }
}

function scoreInflationExpectation(_changePercent: number | null, quote: ProviderQuote) {
  const delta = quote.previousClose === null ? null : quote.value - quote.previousClose
  if (quote.value >= 2.45 || (delta !== null && delta >= 0.06)) {
    return { score: 64, impact: 'supportive' as const, summary: `通胀预期 ${formatNumber(quote.value)}%，抗通胀配置需求对黄金有支撑。` }
  }
  if (quote.value <= 1.9 || (delta !== null && delta <= -0.06)) {
    return { score: 40, impact: 'pressure' as const, summary: `通胀预期 ${formatNumber(quote.value)}%，回落会削弱黄金抗通胀溢价。` }
  }
  return { score: 52, impact: 'neutral' as const, summary: `通胀预期 ${formatNumber(quote.value)}%，对黄金影响偏中性。` }
}

function scoreVix(_changePercent: number | null, quote: ProviderQuote) {
  if (quote.value >= 24) {
    return { score: 66, impact: 'supportive' as const, summary: `VIX ${formatNumber(quote.value)}，避险情绪升温，黄金可能获得防御性买盘。` }
  }
  if (quote.value <= 13) {
    return { score: 42, impact: 'pressure' as const, summary: `VIX ${formatNumber(quote.value)}，风险偏好平稳，避险溢价不足。` }
  }
  return { score: 52, impact: 'neutral' as const, summary: `VIX ${formatNumber(quote.value)}，市场情绪处于常态区间。` }
}

function scoreFedFundsRate(_changePercent: number | null, quote: ProviderQuote) {
  const delta = quote.previousClose === null ? null : quote.value - quote.previousClose
  if (quote.value >= 5 || (delta !== null && delta >= 0.05)) {
    return { score: 36, impact: 'pressure' as const, summary: `联邦基金利率 ${formatNumber(quote.value)}%，高利率环境提高持有黄金机会成本。` }
  }
  if (quote.value <= 3.5 || (delta !== null && delta <= -0.05)) {
    return { score: 60, impact: 'supportive' as const, summary: `联邦基金利率 ${formatNumber(quote.value)}%，降息/低利率预期对黄金偏友好。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `联邦基金利率 ${formatNumber(quote.value)}%，政策利率影响中性。` }
}

function scoreNominalYield(_changePercent: number | null, quote: ProviderQuote) {
  const delta = quote.previousClose === null ? null : quote.value - quote.previousClose
  if (quote.value >= 4.6 || (delta !== null && delta >= 0.08)) {
    return { score: 35, impact: 'pressure' as const, summary: `10Y 美债收益率 ${formatNumber(quote.value)}%，上行会抬升黄金贴现压力。` }
  }
  if (quote.value <= 3.8 || (delta !== null && delta <= -0.08)) {
    return { score: 62, impact: 'supportive' as const, summary: `10Y 美债收益率 ${formatNumber(quote.value)}%，回落有利于黄金估值修复。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `10Y 美债收益率 ${formatNumber(quote.value)}%，对黄金影响中性。` }
}

function scoreYieldCurve(_changePercent: number | null, quote: ProviderQuote) {
  if (quote.value <= -0.35) {
    return { score: 58, impact: 'supportive' as const, summary: `10Y-2Y 曲线 ${formatNumber(quote.value)}%，深度倒挂提示衰退/避险线索。` }
  }
  if (quote.value >= 0.75) {
    return { score: 42, impact: 'pressure' as const, summary: `10Y-2Y 曲线 ${formatNumber(quote.value)}%，期限利差走阔时黄金估值支撑较弱。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `10Y-2Y 曲线 ${formatNumber(quote.value)}%，收益率曲线信号中性。` }
}

function scoreCnGoldQuote(changePercent: number | null, quote: ProviderQuote) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: `${quote.label}变化不可用，按中性处理。` }
  }
  if (changePercent >= 0.006) {
    return { score: 62, impact: 'supportive' as const, summary: `${quote.label}上涨 ${formatPercent(changePercent)}，贵金属动量偏强。` }
  }
  if (changePercent <= -0.006) {
    return { score: 38, impact: 'pressure' as const, summary: `${quote.label}下跌 ${formatPercent(changePercent)}，短线买点需等待企稳。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `${quote.label}波动 ${formatPercent(changePercent)}，行情处于观察区。` }
}

function buildGoldSilverRatio(factors: MarketFactor[]): MarketFactor {
  const gold = factors.find((item) => item.id === 'JO_92233')
  const silver = factors.find((item) => item.id === 'JO_92232')
  if (!gold?.value || !silver?.value || silver.value <= 0) {
    return unavailableFactor('GOLD_SILVER_RATIO', '金银比', '倍', '国际金银价格不足，暂无法派生金银比。')
  }

  const value = gold.value / silver.value
  if (value >= 90) {
    return {
      id: 'GOLD_SILVER_RATIO',
      label: '金银比',
      value,
      unit: '倍',
      changePercent: null,
      impact: 'supportive',
      score: 60,
      status: 'derived',
      summary: `金银比 ${formatNumber(value)} 倍，高位显示黄金相对更具避险溢价。`,
      updatedAt: gold.updatedAt ?? silver.updatedAt,
    }
  }
  if (value <= 70) {
    return {
      id: 'GOLD_SILVER_RATIO',
      label: '金银比',
      value,
      unit: '倍',
      changePercent: null,
      impact: 'pressure',
      score: 42,
      status: 'derived',
      summary: `金银比 ${formatNumber(value)} 倍，低位显示资金更偏风险/工业金属弹性。`,
      updatedAt: gold.updatedAt ?? silver.updatedAt,
    }
  }
  return {
    id: 'GOLD_SILVER_RATIO',
    label: '金银比',
    value,
    unit: '倍',
    changePercent: null,
    impact: 'neutral',
    score: 50,
    status: 'derived',
    summary: `金银比 ${formatNumber(value)} 倍，贵金属相对强弱中性。`,
    updatedAt: gold.updatedAt ?? silver.updatedAt,
  }
}

function scoreCotGoldNet(changePercent: number | null, quote: ProviderQuote) {
  if (quote.value >= 180_000 || (changePercent !== null && changePercent >= 0.08)) {
    return { score: 66, impact: 'supportive' as const, summary: `COT 非商净多 ${formatCompact(quote.value)} 张，资金拥挤但趋势资金仍偏多。` }
  }
  if (quote.value <= 40_000 || (changePercent !== null && changePercent <= -0.08)) {
    return { score: 38, impact: 'pressure' as const, summary: `COT 非商净多 ${formatCompact(quote.value)} 张，投机资金配置偏弱。` }
  }
  return { score: 52, impact: 'neutral' as const, summary: `COT 非商净多 ${formatCompact(quote.value)} 张，持仓信号中性。` }
}

function scoreGldHoldings(changePercent: number | null, quote: ProviderQuote) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: `GLD 持仓 ${formatNumber(quote.value)} 吨，日变化不可用。` }
  }
  if (changePercent >= 0.002) {
    return { score: 64, impact: 'supportive' as const, summary: `GLD 持仓 ${formatNumber(quote.value)} 吨，较前值增加 ${formatPercent(changePercent)}，ETF 资金流入偏多。` }
  }
  if (changePercent <= -0.002) {
    return { score: 38, impact: 'pressure' as const, summary: `GLD 持仓 ${formatNumber(quote.value)} 吨，较前值减少 ${formatPercent(Math.abs(changePercent))}，ETF 资金流出偏空。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `GLD 持仓 ${formatNumber(quote.value)} 吨，日变化 ${formatPercent(changePercent)}，资金流信号中性。` }
}

function scoreWgcEtfFlow(_changePercent: number | null, quote: ProviderQuote) {
  if (quote.value >= 10) {
    return { score: 66, impact: 'supportive' as const, summary: `WGC ETF 资金净流入 ${formatNumber(quote.value)} 吨，全球 ETF 配置偏多。` }
  }
  if (quote.value <= -10) {
    return { score: 38, impact: 'pressure' as const, summary: `WGC ETF 资金净流出 ${formatNumber(Math.abs(quote.value))} 吨，全球 ETF 配置偏空。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `WGC ETF 资金流 ${formatNumber(quote.value)} 吨，资金流信号中性。` }
}

function scoreCentralBankGoldBuying(_changePercent: number | null, quote: ProviderQuote) {
  if (quote.value >= 20) {
    return { score: 68, impact: 'supportive' as const, summary: `央行净购金 ${formatNumber(quote.value)} 吨，官方部门配置形成中长期支撑。` }
  }
  if (quote.value <= -5) {
    return { score: 40, impact: 'pressure' as const, summary: `央行净售金 ${formatNumber(Math.abs(quote.value))} 吨，中长期支撑减弱。` }
  }
  return { score: 52, impact: 'neutral' as const, summary: `央行购金 ${formatNumber(quote.value)} 吨，官方部门影响偏中性。` }
}

function scoreCmeOpenInterest(changePercent: number | null, quote: ProviderQuote) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: `CME 黄金未平仓 ${formatCompact(quote.value)} 张，变化不可用。` }
  }
  if (changePercent >= 0.03) {
    return { score: 60, impact: 'supportive' as const, summary: `CME 黄金未平仓增加 ${formatPercent(changePercent)}，趋势资金参与度提高。` }
  }
  if (changePercent <= -0.03) {
    return { score: 42, impact: 'pressure' as const, summary: `CME 黄金未平仓下降 ${formatPercent(Math.abs(changePercent))}，资金参与度降温。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `CME 黄金未平仓变化 ${formatPercent(changePercent)}，杠杆资金信号中性。` }
}

function scoreCmeVolume(changePercent: number | null, quote: ProviderQuote) {
  if (changePercent === null) {
    return { score: 50, impact: 'unknown' as const, summary: `CME 黄金成交量 ${formatCompact(quote.value)} 张，变化不可用。` }
  }
  if (changePercent >= 0.08) {
    return { score: 58, impact: 'supportive' as const, summary: `CME 黄金成交量放大 ${formatPercent(changePercent)}，短线关注度提升。` }
  }
  if (changePercent <= -0.08) {
    return { score: 45, impact: 'pressure' as const, summary: `CME 黄金成交量收缩 ${formatPercent(Math.abs(changePercent))}，短线动能不足。` }
  }
  return { score: 50, impact: 'neutral' as const, summary: `CME 黄金成交量变化 ${formatPercent(changePercent)}，成交活跃度中性。` }
}

function buildGoldRuleFactors(
  factors: MarketFactor[],
  backtest: BacktestFactor,
): MarketFactor[] {
  const rules = [
    buildRule('实际利率下行', factors, (map) => scoreRuleLow(map.get('DFII10')?.score, 52)),
    buildRule('美元走弱', factors, (map) => scoreRuleHigh(map.get('DX-Y.NYB')?.score, 58)),
    buildRule('美元/人民币支撑', factors, (map) => scoreRuleHigh(map.get('USDCNY=X')?.score, 56)),
    buildRule('通胀预期支撑', factors, (map) => scoreRuleHigh(map.get('T10YIE')?.score, 58)),
    buildRule('VIX 避险升温', factors, (map) => scoreRuleHigh(map.get('VIXCLS')?.score, 58)),
    buildRule('联邦基金利率压力缓和', factors, (map) => scoreRuleHigh(map.get('DFF')?.score, 54)),
    buildRule('美债收益率压力缓和', factors, (map) => scoreRuleHigh(map.get('DGS10')?.score, 54)),
    buildRule('收益率曲线避险线索', factors, (map) => scoreRuleHigh(map.get('T10Y2Y')?.score, 54)),
    buildRule('国际金价动量', factors, (map) => scoreRuleHigh(map.get('GC=F')?.score, 56)),
    buildRule('国内金价动量', factors, (map) => scoreRuleHigh(map.get('JO_9753')?.score, 56)),
    buildRule('国际银价确认', factors, (map) => scoreRuleHigh(map.get('JO_92232')?.score, 54)),
    buildRule('金银比防御属性', factors, (map) => scoreRuleHigh(map.get('GOLD_SILVER_RATIO')?.score, 56)),
    buildRule('COT 资金持仓', factors, (map) => scoreRuleHigh(map.get('COT_GOLD_NET')?.score, 56)),
    buildRule('GLD 资金代理', factors, (map) => scoreRuleHigh(map.get('GLD_FLOW')?.score, 56)),
    buildRule('LBMA 定盘确认', factors, (map) => scoreRuleHigh(map.get('LBMA_GOLD_PM')?.score, 56)),
    buildRule('WGC ETF 资金', factors, (map) => scoreRuleHigh(map.get('WGC_ETF_FLOW')?.score, 56)),
    buildRule('央行购金中长期锚', factors, (map) => scoreRuleHigh(map.get('CENTRAL_BANK_GOLD')?.score, 56)),
    buildRule('CME 持仓参与度', factors, (map) => scoreRuleHigh(map.get('CME_GOLD_OI')?.score, 56)),
    buildRule('CME 成交活跃度', factors, (map) => scoreRuleHigh(map.get('CME_GOLD_VOLUME')?.score, 56)),
    buildRule('本地回测胜率', factors, () => scoreBacktestRule(backtest, 'winRate')),
    buildRule('本地回测收益', factors, () => scoreBacktestRule(backtest, 'averageReturn')),
    buildRule('本地回测回撤', factors, () => scoreBacktestRule(backtest, 'maxDrawdownAfterSignal')),
    buildRule('多源数据覆盖', factors, () => factors.filter((item) => item.status === 'live').length >= 8 ? 1 : 0),
  ]
  const bullishCount = rules.filter((rule) => rule > 0).length
  const bearishCount = rules.filter((rule) => rule < 0).length
  const score = Math.round(50 + (bullishCount - bearishCount) * 2.5)
  const impact = score >= 58 ? 'supportive' : score <= 42 ? 'pressure' : 'neutral'
  const sixAxis = buildSixAxisScore(factors, backtest)

  return [
    {
      id: 'GOLD_18_RULE_SCORE',
      label: '黄金多空规则集',
      value: score,
      unit: '分',
      changePercent: null,
      impact,
      score,
      status: 'derived',
      summary: `${rules.length} 条规则中 ${bullishCount} 条偏多、${bearishCount} 条偏空，综合 ${score}/100。`,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'SIX_AXIS_RADAR',
      label: '黄金 6 轴雷达',
      value: sixAxis,
      unit: '分',
      changePercent: null,
      impact: sixAxis >= 58 ? 'supportive' : sixAxis <= 42 ? 'pressure' : 'neutral',
      score: sixAxis,
      status: 'derived',
      summary: `6 轴雷达 ${sixAxis}/100，覆盖利率、通胀、避险、美元汇率、资金流、回测。`,
      updatedAt: new Date().toISOString(),
    },
  ]
}

function buildRule(
  _name: string,
  factors: MarketFactor[],
  scorer: (map: Map<string, MarketFactor>) => number,
) {
  return scorer(new Map(factors.map((factor) => [factor.id, factor])))
}

function scoreRuleHigh(score: number | undefined, threshold: number) {
  if (score === undefined) {
    return 0
  }
  if (score >= threshold) {
    return 1
  }
  if (score <= 100 - threshold) {
    return -1
  }
  return 0
}

function scoreRuleLow(score: number | undefined, neutralFloor: number) {
  if (score === undefined) {
    return 0
  }
  if (score >= neutralFloor) {
    return 1
  }
  if (score <= 42) {
    return -1
  }
  return 0
}

function scoreBacktestRule(backtest: BacktestFactor, key: keyof BacktestFactor['horizons'][number]) {
  const values = backtest.horizons
    .map((horizon) => horizon[key])
    .filter((value): value is number => typeof value === 'number')
  if (values.length < 1) {
    return 0
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  if (key === 'maxDrawdownAfterSignal') {
    return average > -0.006 ? 1 : average < -0.015 ? -1 : 0
  }
  if (key === 'winRate') {
    return average >= 0.55 ? 1 : average <= 0.45 ? -1 : 0
  }
  return average > 0 ? 1 : average < -0.002 ? -1 : 0
}

function buildSixAxisScore(factors: MarketFactor[], backtest: BacktestFactor) {
  const map = new Map(factors.map((factor) => [factor.id, factor]))
  const axisScores = [
    averageScores([map.get('DFII10'), map.get('DFF'), map.get('DGS10'), map.get('T10Y2Y')]),
    averageScores([map.get('T10YIE')]),
    averageScores([map.get('VIXCLS'), map.get('GOLD_SILVER_RATIO')]),
    averageScores([map.get('DX-Y.NYB'), map.get('USDCNY=X')]),
    averageScores([
      map.get('COT_GOLD_NET'),
      map.get('GLD_FLOW'),
      map.get('WGC_ETF_FLOW'),
      map.get('CENTRAL_BANK_GOLD'),
      map.get('CME_GOLD_OI'),
      map.get('CME_GOLD_VOLUME'),
    ]),
    backtestScore(backtest),
  ]
  return Math.round(axisScores.reduce((sum, value) => sum + value, 0) / axisScores.length)
}

function averageScores(factors: Array<MarketFactor | undefined>) {
  const scores = factors
    .map((factor) => factor?.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
  if (scores.length < 1) {
    return 50
  }
  return scores.reduce((sum, value) => sum + value, 0) / scores.length
}

function backtestScore(backtest: BacktestFactor) {
  const values = backtest.horizons
    .map((item) => item.averageReturn)
    .filter((value): value is number => typeof value === 'number')
  if (values.length < 1) {
    return 50
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(Math.min(Math.max(50 + average * 4000, 20), 80))
}

function buildContextSummary(
  factorScore: number,
  factors: MarketFactor[],
  news: SentimentFactor,
  blogger: SentimentFactor,
  backtest: BacktestFactor,
) {
  const liveCount = factors.filter((item) => item.status === 'live').length
  const supportiveCount = factors.filter((item) => item.impact === 'supportive').length
  const pressureCount = factors.filter((item) => item.impact === 'pressure').length
  return `多源因子 ${factorScore}/100；实时/派生因子 ${liveCount}/${factors.length}，支撑 ${supportiveCount} 项，压力 ${pressureCount} 项；${news.label}${news.status === 'live' ? '已接入' : '未配置/不可用'}，${blogger.label}${blogger.status === 'live' ? '已接入' : '未配置/不可用'}；${backtest.summary}`
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatNumber(value: number) {
  return value.toFixed(2)
}

function formatCompact(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}
