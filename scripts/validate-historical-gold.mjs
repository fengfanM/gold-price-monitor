import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const symbol = process.env.HISTORICAL_GOLD_SYMBOL || 'GC=F'
const years = Number(process.env.HISTORICAL_GOLD_YEARS || '10')
const contextPoints = Number(process.env.HISTORICAL_CONTEXT_POINTS || '128')
const stride = Number(process.env.HISTORICAL_SAMPLE_STRIDE || '5')
const maxSamples = Number(process.env.HISTORICAL_MAX_SAMPLES || '260')
const horizonDays = Number(process.env.HISTORICAL_HORIZON_DAYS || '1')
const chronosUrl = `${(process.env.CHRONOS_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')}/forecast`
const token = process.env.CHRONOS_SERVICE_TOKEN || process.env.LOCAL_CHRONOS_TOKEN || 'local-chronos-token'
const reportPath = path.join(process.cwd(), 'reports', 'historical-gold-validation.json')

async function main() {
  const historical = await fetchHistoricalDailyCandles(symbol, years)
  const candles = historical.candles
  if (candles.length < contextPoints + horizonDays + 20) {
    throw new Error(`历史样本不足：${candles.length}`)
  }

  const samples = []
  const start = contextPoints
  const end = candles.length - horizonDays
  const sampleIndices = buildSampleIndices(start, end, stride, maxSamples)

  for (const index of sampleIndices) {
    const context = candles.slice(index - contextPoints, index).map((item) => ({
      timestamp: item.timestamp,
      price: item.close,
    }))
    const latest = candles[index - 1]
    const future = candles[index + horizonDays - 1]
    const model = await forecast(context, latest.close)
    const returnPercent = (future.close - latest.close) / latest.close
    const predictedUp = model.upProbability >= 0.5
    const actualUp = returnPercent > 0
    samples.push({
      sampleOrigin: 'historical',
      provider: model.provider || 'chronos',
      modelName: model.modelName || 'amazon/chronos-bolt-base',
      openedAt: latest.timestamp,
      evaluatedAt: future.timestamp,
      entryPrice: latest.close,
      exitPrice: future.close,
      returnPercent,
      upProbability: model.upProbability,
      confidence: model.confidence,
      forecastPrice: model.forecastPrice,
      predictedUp,
      actualUp,
      correct: predictedUp === actualUp,
      brier: (model.upProbability - (actualUp ? 1 : 0)) ** 2,
    })
  }

  const report = buildReport(historical, samples)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    reportPath,
    symbol,
    years,
    samples: samples.length,
    winRate: report.metrics.winRate,
    excessWinRate: report.metrics.excessWinRate,
    profitFactor: report.metrics.profitFactor,
    brierScore: report.metrics.brierScore,
    warning: 'historical 样本只做离线验证，不进入 live gate 加权。',
  }, null, 2))
}

function buildSampleIndices(start, end, stride, limit) {
  const indices = []
  for (let index = start; index < end; index += Math.max(1, stride)) {
    indices.push(index)
  }
  if (indices.length <= limit) {
    return indices
  }
  if (limit <= 1) {
    return [indices[indices.length - 1]]
  }
  const selected = []
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round(index * (indices.length - 1) / (limit - 1))
    selected.push(indices[sourceIndex])
  }
  return [...new Set(selected)]
}

async function fetchYahooDailyCandles(symbol, years) {
  const period2 = Math.floor(Date.now() / 1000)
  const period1 = period2 - Math.ceil(years * 365.25 * 24 * 60 * 60)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'gold-price-monitor historical validation',
    },
  })
  if (!response.ok) {
    throw new Error(`Yahoo history HTTP ${response.status}`)
  }
  const payload = await response.json()
  const result = payload?.chart?.result?.[0]
  const timestamps = result?.timestamp
  const quote = result?.indicators?.quote?.[0]
  if (!Array.isArray(timestamps) || !quote?.close) {
    throw new Error('Yahoo history response missing timestamp/close data')
  }
  return timestamps
    .map((timestamp, index) => ({
      timestamp: new Date(timestamp * 1000).toISOString(),
      close: Number(quote.close[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      open: Number(quote.open?.[index]),
      volume: Number(quote.volume?.[index]),
    }))
    .filter((item) => Number.isFinite(item.close) && item.close > 0)
}

async function fetchHistoricalDailyCandles(symbol, years) {
  try {
    return {
      provider: 'yahoo-chart',
      symbol,
      unit: 'USD/oz',
      candles: await fetchYahooDailyCandles(symbol, years),
    }
  } catch (error) {
    console.warn(`Yahoo 历史源不可用，切换到 NBP 官方黄金价格：${error instanceof Error ? error.message : String(error)}`)
    return {
      provider: 'nbp-official-gold',
      symbol: 'NBP_GOLD_PLN_G',
      unit: 'PLN/g',
      candles: await fetchNbpGoldDailyCandles(years),
    }
  }
}

async function fetchNbpGoldDailyCandles(years) {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - Math.ceil(years * 365.25))
  const chunks = []
  let cursor = new Date(start)
  while (cursor < end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 365)
    if (chunkEnd > end) {
      chunkEnd.setTime(end.getTime())
    }
    chunks.push([formatDate(cursor), formatDate(chunkEnd)])
    cursor = new Date(chunkEnd)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const rows = []
  for (const [from, to] of chunks) {
    const url = `http://api.nbp.pl/api/cenyzlota/${from}/${to}/?format=json`
    const response = await fetchWithRetry(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'gold-price-monitor historical validation',
      },
    })
    if (response.status === 404) {
      continue
    }
    if (!response.ok) {
      throw new Error(`NBP gold HTTP ${response.status}: ${await response.text()}`)
    }
    const payload = await response.json()
    if (Array.isArray(payload)) {
      rows.push(...payload)
    }
  }

  return rows
    .map((row) => ({
      timestamp: new Date(`${row.data}T00:00:00.000Z`).toISOString(),
      close: Number(row.cena),
      high: Number(row.cena),
      low: Number(row.cena),
      open: Number(row.cena),
      volume: null,
    }))
    .filter((item) => Number.isFinite(item.close) && item.close > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      await sleep(500 * attempt)
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : String(lastError))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDate(value) {
  return value.toISOString().slice(0, 10)
}

async function forecast(context, latestPrice) {
  const response = await fetch(chronosUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: 'amazon/chronos-bolt-base',
      provider: 'chronos',
      task: 'gold-price-direction-forecast',
      horizonMinutes: horizonDays * 24 * 60,
      symbol,
      unit: 'USD/oz',
      latestPrice,
      context,
      features: {
        ruleProbability: 0.5,
        ruleConfidence: 0,
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`Chronos forecast HTTP ${response.status}: ${await response.text()}`)
  }
  const payload = await response.json()
  assertProbability(payload.upProbability)
  return payload
}

function buildReport(historical, samples) {
  const candles = historical.candles
  const wins = samples.filter((sample) => sample.correct)
  const returns = samples.map((sample) => sample.returnPercent)
  const positiveReturns = returns.filter((item) => item > 0)
  const negativeReturns = returns.filter((item) => item < 0)
  const baselineWinRate = returns.length > 0
    ? positiveReturns.length / returns.length
    : null
  const winRate = samples.length > 0 ? wins.length / samples.length : null
  const grossProfit = positiveReturns.reduce((sum, item) => sum + item, 0)
  const grossLoss = Math.abs(negativeReturns.reduce((sum, item) => sum + item, 0))
  const brierScore = samples.length > 0
    ? samples.reduce((sum, sample) => sum + sample.brier, 0) / samples.length
    : null

  return {
    generatedAt: new Date().toISOString(),
    sampleOrigin: 'historical',
    source: {
      provider: historical.provider,
      symbol: historical.symbol,
      unit: historical.unit,
      years,
      candles: candles.length,
      firstTimestamp: candles[0]?.timestamp ?? null,
      lastTimestamp: candles[candles.length - 1]?.timestamp ?? null,
    },
    config: {
      chronosUrl,
      contextPoints,
      stride,
      maxSamples,
      horizonDays,
    },
    metrics: {
      sampleSize: samples.length,
      winRate,
      baselineWinRate,
      excessWinRate: winRate === null || baselineWinRate === null ? null : winRate - baselineWinRate,
      averageReturn: returns.length > 0 ? average(returns) : null,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      brierScore,
      averageConfidence: samples.length > 0 ? average(samples.map((sample) => sample.confidence)) : null,
    },
    samples,
    warning: 'historical 样本只用于离线预热和模型筛选，不能替代 live 分桶胜率，也不会进入 live gate 加权。',
  }
}

function average(values) {
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

function assertProbability(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid upProbability from Chronos: ${value}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
