const serviceUrl = process.env.CHRONOS_SERVICE_URL
const token = process.env.CHRONOS_SERVICE_TOKEN

if (!serviceUrl) {
  console.error('Missing CHRONOS_SERVICE_URL, for example: https://gold-chronos-bolt.onrender.com')
  process.exit(1)
}

const baseUrl = serviceUrl.replace(/\/$/, '')

async function main() {
  const health = await fetchJson(`${baseUrl}/health`)
  if (!health.ok) {
    throw new Error('/health did not return ok=true')
  }
  if (health.chronosLoaded !== true) {
    throw new Error('/health returned chronosLoaded=false, real Chronos-Bolt is not loaded yet')
  }

  const forecast = await fetchJson(`${baseUrl}/forecast`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: 'amazon/chronos-bolt-base',
      provider: 'chronos',
      task: 'gold-price-direction-forecast',
      horizonMinutes: 60,
      symbol: 'ICBC_GOLD_ACCUMULATION',
      unit: '元/克',
      latestPrice: 1001.34,
      context: Array.from({ length: 16 }, (_, index) => ({
        timestamp: new Date(Date.UTC(2026, 4, 17, 9, index)).toISOString(),
        price: 998 + index * 0.22,
      })),
      features: {
        ruleProbability: 0.58,
        ruleConfidence: 62,
        percentChange24h: 0.002,
        consensusDeviationPercent: -0.0008,
      },
    }),
  })

  assertNumber(forecast.upProbability, 'upProbability', 0, 1)
  assertNumber(forecast.confidence, 'confidence', 0, 100)
  assertNumber(forecast.forecastPrice, 'forecastPrice', 0, Number.POSITIVE_INFINITY)

  console.log(JSON.stringify({
    ok: true,
    health,
    forecast: {
      upProbability: forecast.upProbability,
      confidence: forecast.confidence,
      forecastPrice: forecast.forecastPrice,
      summary: forecast.summary,
    },
  }, null, 2))
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

function assertNumber(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
