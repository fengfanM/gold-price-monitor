import type {
  ExternalModelAdvisor,
  HistoryPoint,
  ProbabilityModelSnapshot,
  QuoteSample,
  QuoteStats24h,
} from './types.js'

const DEFAULT_MODEL_NAME = 'chronos-bolt/timesfm/moirai-compatible'

type ExternalModelResponse = {
  upProbability?: unknown
  probability?: unknown
  confidence?: unknown
  forecastPrice?: unknown
  forecast?: unknown
  expectedReturnPercent?: unknown
  expectedReturn?: unknown
  intervalLow?: unknown
  intervalHigh?: unknown
  lower?: unknown
  upper?: unknown
  summary?: unknown
  rationale?: unknown
  risks?: unknown
}

type ModelConfig = {
  url: string | undefined
  token: string | undefined
  name: string
  provider: ExternalModelAdvisor['provider']
  timeoutMs: number
  horizonMinutes: number
  maxContextPoints: number
}

type RawEndpointConfig = {
  url?: unknown
  token?: unknown
  name?: unknown
  model?: unknown
  provider?: unknown
  timeoutMs?: unknown
  horizonMinutes?: unknown
  contextPoints?: unknown
  maxContextPoints?: unknown
}

function getPrimaryModelConfig(): ModelConfig {
  return {
    url: process.env.EXTERNAL_TS_MODEL_URL,
    token: process.env.EXTERNAL_TS_MODEL_TOKEN,
    name: process.env.EXTERNAL_TS_MODEL_NAME ?? DEFAULT_MODEL_NAME,
    provider: normalizeProvider(process.env.EXTERNAL_TS_MODEL_PROVIDER),
    timeoutMs: Number(process.env.EXTERNAL_TS_MODEL_TIMEOUT_MS ?? '4500'),
    horizonMinutes: Number(process.env.EXTERNAL_TS_MODEL_HORIZON_MINUTES ?? '60'),
    maxContextPoints: Number(process.env.EXTERNAL_TS_MODEL_CONTEXT_POINTS ?? '256'),
  }
}

function getModelConfigs(): ModelConfig[] {
  const endpoints = parseEndpointConfigs(process.env.EXTERNAL_TS_MODEL_ENDPOINTS)
  if (endpoints.length < 1) {
    return [getPrimaryModelConfig()]
  }

  const fallback = getPrimaryModelConfig()
  return endpoints.map((endpoint) => ({
    url: stringValue(endpoint.url),
    token: stringValue(endpoint.token) ?? fallback.token,
    name: stringValue(endpoint.name ?? endpoint.model) ?? fallback.name,
    provider: normalizeProvider(stringValue(endpoint.provider)),
    timeoutMs: numberValue(endpoint.timeoutMs) ?? fallback.timeoutMs,
    horizonMinutes: numberValue(endpoint.horizonMinutes) ?? fallback.horizonMinutes,
    maxContextPoints: numberValue(endpoint.maxContextPoints ?? endpoint.contextPoints) ?? fallback.maxContextPoints,
  }))
}

export async function fetchExternalModelAdvisor(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  probabilityModel: ProbabilityModelSnapshot
  stats: QuoteStats24h
}): Promise<ExternalModelAdvisor> {
  const configs = getModelConfigs().filter((config) => config.url)
  if (configs.length < 1) {
    return buildUnconfiguredAdvisor(input.latestQuote, getPrimaryModelConfig())
  }

  const advisors = await Promise.all(configs.map((config) => fetchSingleExternalModelAdvisor(input, config)))
  const primary = selectPrimaryAdvisor(advisors)
  return {
    ...primary,
    competitors: advisors.filter((advisor) => advisor !== primary),
  }
}

async function fetchSingleExternalModelAdvisor(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  probabilityModel: ProbabilityModelSnapshot
  stats: QuoteStats24h
}, config: ModelConfig): Promise<ExternalModelAdvisor> {
  if (!config.url) {
    return buildUnconfiguredAdvisor(input.latestQuote, config)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const payload = buildModelPayload(input, config)
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`外部模型 HTTP ${response.status}`)
    }
    const raw = await response.json() as ExternalModelResponse
    return normalizeModelResponse(raw, input.latestQuote, config)
  } catch (error) {
    return {
      id: 'foundation-model-advisor',
      name: '时序基础模型军师',
      provider: config.provider,
      modelName: config.name,
      status: 'error',
      horizonMinutes: config.horizonMinutes,
      upProbability: null,
      downProbability: null,
      confidence: 0,
      expectedReturnPercent: null,
      forecastPrice: null,
      intervalLow: null,
      intervalHigh: null,
      generatedAt: new Date().toISOString(),
      summary: '外部时序基础模型暂不可用，本次不参与买卖点放大。',
      rationale: [
        '已保留 Chronos/TimesFM/Moirai/Lag-Llama 兼容 HTTP 推理入口。',
        `错误：${error instanceof Error ? error.message : String(error)}`,
      ],
      risks: ['外部模型不可用时必须回退到本地规则、回测、风控和数据源门控。'],
    }
  } finally {
    clearTimeout(timeout)
  }
}

function selectPrimaryAdvisor(advisors: ExternalModelAdvisor[]) {
  const providerPriority: Record<string, number> = {
    chronos: 5,
    timesfm: 4,
    moirai: 3,
    'lag-llama': 2,
    custom: 1,
  }
  return [...advisors].sort((left, right) => {
    const liveDiff = Number(right.status === 'live') - Number(left.status === 'live')
    if (liveDiff !== 0) {
      return liveDiff
    }
    const priorityDiff = (providerPriority[right.provider] ?? 0) - (providerPriority[left.provider] ?? 0)
    if (priorityDiff !== 0) {
      return priorityDiff
    }
    return right.confidence - left.confidence
  })[0]
}

function buildModelPayload(input: {
  history: HistoryPoint[]
  latestQuote: QuoteSample
  probabilityModel: ProbabilityModelSnapshot
  stats: QuoteStats24h
}, config: ModelConfig) {
  const context = [...input.history, {
    timestamp: input.latestQuote.fetchedAt,
    price: input.latestQuote.price,
  }]
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-config.maxContextPoints)

  return {
    model: config.name,
    provider: config.provider,
    task: 'gold-price-direction-forecast',
    horizonMinutes: config.horizonMinutes,
    symbol: input.latestQuote.symbol,
    unit: input.latestQuote.unit,
    latestPrice: input.latestQuote.price,
    context,
    features: {
      ruleProbability: input.probabilityModel.primaryPrediction.probability,
      ruleConfidence: input.probabilityModel.primaryPrediction.confidence,
      drawdownPercent24h: input.stats.drawdownPercent24h,
      percentChange24h: input.stats.percentChange24h,
      high24h: input.stats.high24h,
      low24h: input.stats.low24h,
      anchorPremiumPercent: input.latestQuote.marketReference.calibration.premiumPercent,
      consensusDeviationPercent: input.latestQuote.marketReference.consensusDeviationPercent,
    },
    outputSchema: {
      upProbability: 'number 0..1',
      confidence: 'number 0..100',
      forecastPrice: 'number optional',
      intervalLow: 'number optional',
      intervalHigh: 'number optional',
      rationale: 'string[] optional',
      risks: 'string[] optional',
    },
  }
}

function normalizeModelResponse(raw: ExternalModelResponse, latestQuote: QuoteSample, config: ModelConfig): ExternalModelAdvisor {
  const forecastPrice = normalizeNumber(raw.forecastPrice ?? raw.forecast)
  const expectedReturnPercent = normalizeNumber(raw.expectedReturnPercent ?? raw.expectedReturn)
    ?? (forecastPrice === null ? null : (forecastPrice - latestQuote.price) / latestQuote.price)
  const rawProbability = normalizeNumber(raw.upProbability ?? raw.probability)
  const probability = rawProbability === null && expectedReturnPercent !== null
    ? expectedReturnPercent > 0 ? 0.58 : 0.42
    : rawProbability
  const upProbability = probability === null ? null : clamp(probability > 1 ? probability / 100 : probability, 0.01, 0.99)
  const confidence = Math.round(clamp(normalizeNumber(raw.confidence) ?? 45, 0, 100))
  const intervalLow = normalizeNumber(raw.intervalLow ?? raw.lower)
  const intervalHigh = normalizeNumber(raw.intervalHigh ?? raw.upper)
  const rationale = normalizeStringArray(raw.rationale)
  const risks = normalizeStringArray(raw.risks)

  return {
    id: 'foundation-model-advisor',
    name: '时序基础模型军师',
    provider: config.provider,
    modelName: config.name,
    status: 'live',
    horizonMinutes: config.horizonMinutes,
    upProbability,
    downProbability: upProbability === null ? null : roundProbability(1 - upProbability),
    confidence,
    expectedReturnPercent,
    forecastPrice,
    intervalLow,
    intervalHigh,
    generatedAt: new Date().toISOString(),
    summary: typeof raw.summary === 'string'
      ? raw.summary
      : buildSummary(upProbability, confidence, forecastPrice),
    rationale: rationale.length > 0
      ? rationale
      : [
          `模型 ${config.name} 返回 ${config.horizonMinutes} 分钟方向概率。`,
          forecastPrice === null ? '模型未返回目标价，仅用于方向参考。' : `预测中位价约 ${forecastPrice.toFixed(2)}。`,
        ],
    risks: risks.length > 0
      ? risks
      : [
          '外部模型可能没有针对人民币积存金口径训练，不能单独作为交易依据。',
          '金融市场非平稳，预训练模型必须经过本地回测校准后才能提高权重。',
        ],
  }
}

function buildUnconfiguredAdvisor(latestQuote: QuoteSample, config: ModelConfig): ExternalModelAdvisor {
  return {
    id: 'foundation-model-advisor',
    name: '时序基础模型军师',
    provider: 'disabled',
    modelName: config.name,
    status: 'unconfigured',
    horizonMinutes: config.horizonMinutes,
    upProbability: null,
    downProbability: null,
    confidence: 0,
    expectedReturnPercent: null,
    forecastPrice: null,
    intervalLow: null,
    intervalHigh: null,
    generatedAt: latestQuote.fetchedAt,
    summary: '未配置外部预训练时序模型，当前只使用本地可解释概率模型。',
    rationale: [
      '推荐部署 Chronos-Bolt、TimesFM、Moirai 或 Lag-Llama 为 HTTP 推理服务。',
      '接入后该军师只做低权重参考，必须通过回测、赔率、事件风控和数据源门控。',
    ],
    risks: ['不要直接复制来源不明的“高收益黄金模型”，必须先验证许可证、样本外表现和回撤。'],
  }
}

function parseEndpointConfigs(value: string | undefined): RawEndpointConfig[] {
  if (!value?.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is RawEndpointConfig => typeof item === 'object' && item !== null)
    }
  } catch {
    return []
  }
  return []
}

function normalizeProvider(value: string | undefined): ExternalModelAdvisor['provider'] {
  if (value === 'chronos' || value === 'timesfm' || value === 'moirai' || value === 'lag-llama') {
    return value
  }
  if (value === 'disabled') {
    return 'disabled'
  }
  return 'custom'
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value]
  }
  return []
}

function buildSummary(upProbability: number | null, confidence: number, forecastPrice: number | null) {
  if (upProbability === null) {
    return `外部模型已返回，但未给出明确上涨概率，置信度 ${confidence}/100。`
  }
  return `外部模型预测上涨概率 ${(upProbability * 100).toFixed(1)}%，置信度 ${confidence}/100${forecastPrice === null ? '' : `，目标价 ${forecastPrice.toFixed(2)}`}。`
}

function roundProbability(value: number) {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
