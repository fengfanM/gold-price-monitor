import type {
  DataAnomaly,
  DataQualityInfo,
  HistoryPoint,
  QuoteSample,
  QuoteStats24h,
  SourceStatus,
} from './types.js'

const CRITICAL_JUMP_THRESHOLD = Number(process.env.CRITICAL_JUMP_THRESHOLD ?? '0.03')
const WARNING_JUMP_THRESHOLD = Number(process.env.WARNING_JUMP_THRESHOLD ?? '0.01')
const CRITICAL_PREMIUM_THRESHOLD = Number(
  process.env.CRITICAL_PREMIUM_THRESHOLD ?? '0.05',
)
const WARNING_PREMIUM_THRESHOLD = Number(
  process.env.WARNING_PREMIUM_THRESHOLD ?? '0.025',
)

export function detectQuoteAnomalies(
  quote: QuoteSample,
  history: HistoryPoint[],
): DataAnomaly[] {
  const observedAt = new Date().toISOString()
  const anomalies: DataAnomaly[] = []

  if (quote.price <= 0 || !Number.isFinite(quote.price)) {
    anomalies.push({
      code: 'invalid_price',
      severity: 'critical',
      message: '报价价格无效，已拒绝写入历史。',
      observedAt,
    })
  }

  if (
    quote.dayLow <= 0 ||
    quote.dayHigh <= 0 ||
    quote.dayHigh < quote.dayLow
  ) {
    anomalies.push({
      code: 'invalid_day_range',
      severity: 'warning',
      message: '工行日内高低区间异常，参考锚质量降低。',
      observedAt,
    })
  } else if (quote.price < quote.dayLow - 2 || quote.price > quote.dayHigh + 2) {
    anomalies.push({
      code: 'outside_day_range',
      severity: 'warning',
      message: '当前报价偏离工行日内高低区间，需复核上游数据。',
      observedAt,
    })
  }

  const previous = history[history.length - 1]
  if (previous?.price && previous.price > 0) {
    const jumpPercent = Math.abs((quote.price - previous.price) / previous.price)
    if (jumpPercent >= CRITICAL_JUMP_THRESHOLD) {
      anomalies.push({
        code: 'critical_jump',
        severity: 'critical',
        message: `报价相对上一采样点跳变 ${formatPercent(jumpPercent)}，超过硬阈值。`,
        observedAt,
      })
    } else if (jumpPercent >= WARNING_JUMP_THRESHOLD) {
      anomalies.push({
        code: 'large_jump',
        severity: 'warning',
        message: `报价相对上一采样点跳变 ${formatPercent(jumpPercent)}，已标记为风险样本。`,
        observedAt,
      })
    }
  }

  const premiumPercent = quote.marketReference.calibration.premiumPercent
  if (premiumPercent !== null) {
    const absolutePremium = Math.abs(premiumPercent)
    if (absolutePremium >= CRITICAL_PREMIUM_THRESHOLD) {
      anomalies.push({
        code: 'critical_cross_source_deviation',
        severity: 'critical',
        message: `报价相对上金所锚点偏离 ${formatPercent(absolutePremium)}，超过硬阈值。`,
        observedAt,
      })
    } else if (absolutePremium >= WARNING_PREMIUM_THRESHOLD) {
      anomalies.push({
        code: 'cross_source_deviation',
        severity: 'warning',
        message: `报价相对上金所锚点偏离 ${formatPercent(absolutePremium)}，数据质量降级。`,
        observedAt,
      })
    }
  }

  return anomalies
}

export function buildDataQuality(
  quote: QuoteSample,
  stats: QuoteStats24h,
  sourceStatus: SourceStatus,
  anomalies: DataAnomaly[],
): DataQualityInfo {
  const hasMarketAnchor = quote.marketReference.calibration.anchorPrice !== null
  const activeChannel = getActiveChannelStatus(sourceStatus)
  const checks = {
    fresh: !sourceStatus.stale,
    primarySource: sourceStatus.active === 'official',
    hasMarketAnchor,
    historyReady: stats.pointCount >= 3,
    anomalyFree: anomalies.length === 0,
  }

  let score = 100
  if (!checks.fresh) {
    score -= 25
  }
  if (!checks.primarySource) {
    score -= 12
  }
  if (!checks.hasMarketAnchor) {
    score -= 15
  }
  if (!checks.historyReady) {
    score -= 10
  }
  if (activeChannel?.status !== 'healthy') {
    score -= 12
  }

  for (const anomaly of anomalies) {
    score -= anomaly.severity === 'critical' ? 35 : 12
  }

  const normalizedScore = Math.round(clamp(score, 0, 100))
  const level = normalizedScore >= 88
    ? 'excellent'
    : normalizedScore >= 72
      ? 'good'
      : normalizedScore >= 45
        ? 'degraded'
        : 'poor'

  return {
    score: normalizedScore,
    level,
    summary: buildQualitySummary(level),
    checks,
    anomalies,
  }
}

function getActiveChannelStatus(sourceStatus: SourceStatus) {
  if (sourceStatus.active === 'official') {
    return sourceStatus.official
  }
  if (sourceStatus.active === 'fallback') {
    return sourceStatus.fallback
  }
  return null
}

function buildQualitySummary(level: DataQualityInfo['level']) {
  if (level === 'excellent') {
    return '数据源健康、行情新鲜、跨源校准通过。'
  }
  if (level === 'good') {
    return '数据整体可用，存在轻微信号降级项。'
  }
  if (level === 'degraded') {
    return '数据质量降级，短线信号需要谨慎复核。'
  }
  return '数据质量较差，当前行情仅适合观察，不适合作为强信号依据。'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}
