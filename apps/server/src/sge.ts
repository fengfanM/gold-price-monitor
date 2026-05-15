import { constants as cryptoConstants } from 'node:crypto'
import https from 'node:https'

import type { MarketReferenceQuote } from './types.js'

const SGE_DELAYED_URL = 'https://sge.com.cn/h5_sjzx/yshq'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

function requestText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
        secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`SGE 请求返回 ${statusCode}`))
          response.resume()
          return
        }

        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        response.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'))
        })
      },
    )

    request.setTimeout(10_000, () => {
      request.destroy(new Error('SGE 请求超时'))
    })
    request.on('error', reject)
    request.end()
  })
}

export async function fetchSgeReferenceQuotes() {
  const html = await requestText(SGE_DELAYED_URL)
  const tradingDate =
    html.match(/上海黄金交易所(\d{4}年\d{2}月\d{2}日)延时行情/)?.[1] ?? null

  return {
    sourceName: '上海黄金交易所延时行情',
    sourceUrl: SGE_DELAYED_URL,
    isDelayed: true,
    tradingDate,
    au9999: parseTableRow(html, 'Au99.99'),
    autd: parseTableRow(html, 'Au(T+D)'),
  }
}

function parseTableRow(html: string, symbol: string): MarketReferenceQuote | null {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rowPattern = new RegExp(
    `<td[^>]*>${escapedSymbol}</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>`,
    'i',
  )
  const match = html.match(rowPattern)

  if (!match) {
    return null
  }

  const latestPrice = parseNumber(match[1])
  const highPrice = parseNumber(match[2])
  const lowPrice = parseNumber(match[3])
  const openPrice = parseNumber(match[4])

  if (latestPrice <= 0 || highPrice <= 0 || lowPrice <= 0 || openPrice <= 0) {
    return null
  }

  return {
    symbol,
    latestPrice,
    highPrice,
    lowPrice,
    openPrice,
  }
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/,/g, '').trim())
  if (!Number.isFinite(parsed)) {
    throw new Error(`SGE 数值解析失败: ${value}`)
  }
  return parsed
}
