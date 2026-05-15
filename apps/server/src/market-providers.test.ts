import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  clearProviderHealthHistory,
  fetchCentralBankGoldBuying,
  fetchCnGoldQuotes,
  fetchCmeGoldOpenInterest,
  fetchCmeGoldVolume,
  fetchCotGoldNetPosition,
  fetchFredSeries,
  fetchGldHoldings,
  fetchGoldBloggerSentiment,
  fetchGoldNewsSentiment,
  fetchLbmaGoldPm,
  getProviderHealthHistory,
  probeAllMarketProviders,
  fetchWorldGoldCouncilEtfFlow,
} from './market-providers.js'

const originalFetch = globalThis.fetch

describe('market providers', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    clearProviderHealthHistory()
    delete process.env.FRED_API_KEY
    delete process.env.GLD_HOLDINGS_CSV_URL
    delete process.env.GOLD_NEWS_RSS_URLS
    delete process.env.GOLD_NEWS_RSS_URL
    delete process.env.GOLD_BLOGGER_RSS_URLS
    delete process.env.LBMA_GOLD_PM_CSV_URL
    delete process.env.WGC_GOLD_ETF_FLOW_CSV_URL
    delete process.env.CENTRAL_BANK_GOLD_CSV_URL
    delete process.env.CME_GOLD_OI_CSV_URL
    delete process.env.CME_GOLD_VOLUME_CSV_URL
    delete process.env.WGC_GOLD_ETF_FLOW_API_URL
    delete process.env.CENTRAL_BANK_GOLD_PAGE_URL
  })

  it('parses FRED CSV rows and ignores missing observations', async () => {
    delete process.env.FRED_API_KEY
    globalThis.fetch = (async () => new Response([
      'observation_date,DFII10',
      '2026-05-13,1.88',
      '2026-05-14,.',
      '2026-05-15,1.94',
    ].join('\n'))) as typeof fetch

    const series = await fetchFredSeries('DFII10')

    assert.deepEqual(series, [
      { date: '2026-05-13', value: 1.88 },
      { date: '2026-05-15', value: 1.94 },
    ])
  })

  it('parses cngold JSONP quotes into unified provider quotes', async () => {
    globalThis.fetch = (async () => new Response(`callback({
      "JO_9753": { "q63": 580.12, "q2": 578.5, "unit": "元/克", "time": 1778868000000 },
      "JO_92233": { "q63": 3380.5, "q2": 3375.1, "unit": "美元/盎司", "time": 1778868000000 },
      "JO_92232": { "q63": 37.2, "q2": 37.0, "unit": "美元/盎司", "time": 1778868000000 }
    });`)) as typeof fetch

    const result = await fetchCnGoldQuotes()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.length, 3)
    assert.equal(result.data?.[0]?.symbol, 'JO_9753')
    assert.equal(result.data?.[0]?.value, 580.12)
    assert.equal(result.data?.[1]?.previousClose, 3375.1)
  })

  it('parses COT gold net non-commercial position from CSV', async () => {
    globalThis.fetch = (async () => new Response([
      'Date,Noncommercial Positions-Long (All),Noncommercial Positions-Short (All)',
      '2026-05-12,"250,000","120,000"',
      '2026-05-05,"240,000","125,000"',
    ].join('\n'))) as typeof fetch

    const result = await fetchCotGoldNetPosition()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.symbol, 'COT_GOLD_NET')
    assert.equal(result.data?.value, 130000)
    assert.equal(result.data?.previousClose, 115000)
  })

  it('parses GLD official holdings tonnes and daily change from CSV', async () => {
    process.env.GLD_HOLDINGS_CSV_URL = 'https://example.com/gld.csv'
    globalThis.fetch = (async () => new Response([
      'Date,Tonnes in Trust',
      '2026-05-15,930.24',
      '2026-05-14,928.10',
    ].join('\n'))) as typeof fetch

    const result = await fetchGldHoldings()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.symbol, 'GLD_FLOW')
    assert.equal(result.data?.value, 930.24)
    assert.equal(result.data?.previousClose, 928.10)
    assert.equal(result.data?.unit, '吨')
  })

  it('parses configured official professional CSV sources', async () => {
    process.env.LBMA_GOLD_PM_CSV_URL = 'https://example.com/lbma.csv'
    process.env.WGC_GOLD_ETF_FLOW_CSV_URL = 'https://example.com/wgc.csv'
    process.env.CENTRAL_BANK_GOLD_CSV_URL = 'https://example.com/cb.csv'
    process.env.CME_GOLD_OI_CSV_URL = 'https://example.com/cme.csv'
    const responses = [
      'Date,Gold PM USD\n2026-05-15,3380.1\n2026-05-14,3370.2',
      'Date,Net Flow Tonnes\n2026-05-15,12.4\n2026-05-14,-3.2',
      'Date,Central Bank Net Purchase Tonnes\n2026-05-15,24.5\n2026-04-30,18.1',
      'Date,Open Interest\n2026-05-15,"501,234"\n2026-05-14,"490,000"',
    ]
    globalThis.fetch = (async () => new Response(responses.shift() ?? '')) as typeof fetch

    const lbma = await fetchLbmaGoldPm()
    const wgc = await fetchWorldGoldCouncilEtfFlow()
    const centralBank = await fetchCentralBankGoldBuying()
    const cmeOi = await fetchCmeGoldOpenInterest()

    assert.equal(lbma.data?.value, 3380.1)
    assert.equal(wgc.data?.value, 12.4)
    assert.equal(centralBank.data?.value, 24.5)
    assert.equal(cmeOi.data?.value, 501234)
  })

  it('uses the WGC public ETF flow API when CSV is not configured', async () => {
    process.env.WGC_GOLD_ETF_FLOW_API_URL = 'https://example.com/wgc-api.json'
    globalThis.fetch = (async () => Response.json({
      chartData: {
        data: {
          Weekly: {
            series: {
              tonnes: [
                { name: 'North America', data: [[1777593600000, -5], [1778198400000, -3]] },
                { name: 'Europe', data: [[1777593600000, 2], [1778198400000, 1]] },
                { name: 'Gold Price (rhs)', data: [[1778198400000, 4600]] },
              ],
            },
          },
        },
      },
    })) as typeof fetch

    const result = await fetchWorldGoldCouncilEtfFlow()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.value, -2)
    assert.equal(result.data?.previousClose, -3)
  })

  it('parses WGC central bank buying from public research page text', async () => {
    process.env.CENTRAL_BANK_GOLD_PAGE_URL = 'https://example.com/central-banks'
    globalThis.fetch = (async () => new Response(`
      <html><body>Central bank net purchases surged in Q4, up 6% q/q to 230t.
      Published 29 January, 2026.</body></html>
    `)) as typeof fetch

    const result = await fetchCentralBankGoldBuying()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.value, 230)
  })

  it('uses Yahoo GC futures volume as CME volume proxy when official CSV is not configured', async () => {
    globalThis.fetch = (async () => Response.json({
      chart: {
        result: [{
          meta: { regularMarketTime: 1778198400 },
          timestamp: [1777593600, 1778198400],
          indicators: { quote: [{ volume: [190000, 220000] }] },
        }],
      },
    })) as typeof fetch

    const result = await fetchCmeGoldVolume()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.symbol, 'CME_GOLD_VOLUME')
    assert.equal(result.data?.value, 220000)
    assert.equal(result.data?.previousClose, 190000)
  })

  it('records provider health when probing all providers', async () => {
    process.env.GOLD_BLOGGER_RSS_URLS = 'https://example.com/blog.xml'
    process.env.GLD_HOLDINGS_CSV_URL = 'https://example.com/gld.csv'
    process.env.LBMA_GOLD_PM_CSV_URL = 'https://example.com/lbma.csv'
    process.env.CME_GOLD_OI_CSV_URL = 'https://example.com/oi.csv'
    const responseByUrl = new Map<string, Response>([
      ['gold.org/api', Response.json({
        chartData: {
          data: {
            Weekly: {
              series: {
                tonnes: [
                  { name: 'North America', data: [[1777593600000, 1], [1778198400000, 2]] },
                ],
              },
            },
          },
        },
      })],
      ['central-banks', new Response('Central bank net purchases surged in Q4 to 230t.')],
      ['jijinhao', new Response(`callback({
        "JO_9753": { "q63": 580.12, "q2": 578.5 },
        "JO_92233": { "q63": 3380.5, "q2": 3375.1 },
        "JO_92232": { "q63": 37.2, "q2": 37.0 }
      });`)],
      ['fredgraph', new Response('observation_date,VALUE\n2026-05-14,1.9\n2026-05-15,1.8')],
      ['CFTC', new Response('Date,Noncommercial Positions-Long (All),Noncommercial Positions-Short (All)\n2026-05-12,250000,120000')],
      ['gld.csv', new Response('Date,Tonnes in Trust\n2026-05-15,930\n2026-05-14,929')],
      ['lbma.csv', new Response('Date,Gold PM USD\n2026-05-15,3380')],
      ['oi.csv', new Response('Date,Open Interest\n2026-05-15,501234')],
      ['blog.xml', new Response('<rss><channel><item><title>Gold rallies on rate cut hopes</title></item></channel></rss>')],
      ['news.google.com', new Response('<rss><channel><item><title>Gold rallies on safe haven demand</title></item></channel></rss>')],
    ])
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('finance.yahoo.com')) {
        return Response.json({
          chart: {
            result: [{
              meta: { regularMarketPrice: 3380, chartPreviousClose: 3370, regularMarketTime: 1778198400 },
              timestamp: [1777593600, 1778198400],
              indicators: { quote: [{ volume: [190000, 220000] }] },
            }],
          },
        })
      }
      for (const [key, response] of responseByUrl) {
        if (url.includes(key)) {
          return response.clone()
        }
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const health = await probeAllMarketProviders()

    assert.equal(health.length > 10, true)
    assert.equal(health.every((item) => typeof item.latencyMs === 'number'), true)
    assert.equal(health.every((item) => typeof item.qualityScore === 'number'), true)
    assert.equal(health.some((item) => item.id === 'GC=F' && item.sourceTier === 'critical'), true)
    assert.equal(health.some((item) => item.latencyQuality === 'fast' && item.latencyWeight === 1), true)
    assert.equal(health.some((item) => item.id === 'LBMA_GOLD_PM' && item.status === 'live'), true)
    assert.equal(getProviderHealthHistory().length, health.length)
  })

  it('marks repeated provider failures with cooldown and high reliability risk', async () => {
    globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch

    const first = await probeAllMarketProviders()
    const second = await probeAllMarketProviders()
    const goldFuture = second.find((item) => item.id === 'GC=F')

    assert.equal(first.some((item) => item.id === 'GC=F' && item.status === 'unavailable'), true)
    assert.equal(goldFuture?.sourceTier, 'critical')
    assert.equal(goldFuture?.failureStreak, 1)
    assert.equal(goldFuture?.reliabilityRisk, 'high')
    assert.equal(typeof goldFuture?.cooldownUntil, 'string')
    assert.equal(goldFuture?.error?.includes('冷却中'), true)
  })

  it('scores gold news RSS sentiment from titles', async () => {
    globalThis.fetch = (async () => new Response([
      '<rss><channel>',
      '<item><title><![CDATA[Gold rallies as rate cut hopes lift safe haven demand]]></title></item>',
      '<item><title><![CDATA[Gold falls as stronger dollar pressures bullion]]></title></item>',
      '</channel></rss>',
    ].join(''))) as typeof fetch

    const result = await fetchGoldNewsSentiment()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.sources.length, 2)
    assert.equal(typeof result.data?.score, 'number')
    assert.equal(result.data?.confidence, 34)
  })

  it('scores blogger credibility feeds with lower confidence than news', async () => {
    process.env.GOLD_BLOGGER_RSS_URLS = 'https://example.com/blog.xml'
    globalThis.fetch = (async () => new Response([
      '<rss><channel>',
      '<item><title><![CDATA[Gold analyst says rate cut may trigger bullion rally]]></title></item>',
      '<item><title><![CDATA[Trader warns stronger dollar may pressure gold]]></title></item>',
      '</channel></rss>',
    ].join(''))) as typeof fetch

    const result = await fetchGoldBloggerSentiment()

    assert.equal(result.status, 'live')
    assert.equal(result.data?.sources.length, 2)
    assert.equal(result.data?.confidence, 27)
  })
})
