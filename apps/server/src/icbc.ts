import { constants as cryptoConstants } from 'node:crypto'
import https from 'node:https'

import type { MarketReference, QuoteSample, QuoteSourceKind } from './types.js'

const PAGE_URL =
  'https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp'
const ASYNC_URL =
  'https://mybank.icbc.com.cn/servlet/AsynGetDataServlet?tranCode=A00622'
const PRODUCT_CODE = '080020000521'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

const REQUEST_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
}

type OfficialPayload = {
  sysdate?: string
  rf?: Array<{
    ActivePrice?: string
    LowPrice?: string
    HighPrice?: string
    RegPrice?: string
    SellPrice?: string
    ProductName?: string
    proCode?: string
  }>
  TranErrorCode?: string
  TranErrorDisplayMsg?: string
}

function requestText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: REQUEST_HEADERS,
        secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`请求返回 ${statusCode}`))
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
      request.destroy(new Error('请求超时'))
    })
    request.on('error', reject)
    request.end()
  })
}

export async function fetchOfficialQuote(): Promise<QuoteSample> {
  const responseText = await requestText(ASYNC_URL)
  const payload = JSON.parse(responseText) as OfficialPayload

  if (payload.TranErrorCode) {
    throw new Error(payload.TranErrorDisplayMsg || payload.TranErrorCode)
  }

  const row =
    payload.rf?.find((item) => item.proCode === PRODUCT_CODE) ?? payload.rf?.[0]

  if (!row?.ActivePrice) {
    throw new Error('工行异步接口返回结构异常')
  }

  return makeQuoteSample({
    price: row.ActivePrice,
    updatedAt: payload.sysdate ?? new Date().toISOString(),
    dayLow: row.LowPrice,
    dayHigh: row.HighPrice,
    regularPrice: row.RegPrice,
    sellPrice: row.SellPrice,
    productName: row.ProductName ?? '积存金',
    productCode: row.proCode ?? PRODUCT_CODE,
    sourceKind: 'official',
    marketReference: emptyMarketReference(),
  })
}

export async function fetchFallbackQuote(): Promise<QuoteSample> {
  const html = await requestText(PAGE_URL)
  return parsePageQuote(html)
}

function parsePageQuote(html: string): QuoteSample {
  const productCode = extractText(html, /id="activeprice_([^"]+)"/i, 'productCode')

  return makeQuoteSample({
    price: extractCellValue(html, `activeprice_${productCode}`, 'activeprice'),
    updatedAt: new Date().toISOString(),
    dayLow: extractCellValue(html, `lowprice_${productCode}`, 'lowprice'),
    dayHigh: extractCellValue(html, `highprice_${productCode}`, 'highprice'),
    regularPrice: extractCellValue(html, `regprice_${productCode}`, 'regprice'),
    sellPrice: extractCellValue(html, `sellprice_${productCode}`, 'sellprice'),
    productName: '积存金',
    productCode,
    sourceKind: 'fallback',
    marketReference: emptyMarketReference(),
  })
}

function extractCellValue(html: string, cellId: string, fieldName: string) {
  const escapedId = cellId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return extractText(
    html,
    new RegExp(`id="${escapedId}">\\s*([^<]+?)\\s*<`, 'i'),
    fieldName,
  )
}

function extractText(html: string, pattern: RegExp, fieldName: string) {
  const match = html.match(pattern)
  const value = match?.[1]?.trim()
  if (!value) {
    throw new Error(`回退页面缺少字段 ${fieldName}`)
  }
  return value
}

function makeQuoteSample(input: {
  price?: string
  updatedAt: string
  dayLow?: string
  dayHigh?: string
  regularPrice?: string
  sellPrice?: string
  productName: string
  productCode: string
  sourceKind: QuoteSourceKind
  marketReference: MarketReference
}): QuoteSample {
  const fetchedAt = new Date().toISOString()

  return {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price: parseNumber(input.price),
    activePrice: parseNumber(input.price),
    dayLow: parseNumber(input.dayLow),
    dayHigh: parseNumber(input.dayHigh),
    regularPrice: parseNumber(input.regularPrice),
    sellPrice: parseNumber(input.sellPrice ?? input.price),
    productName: input.productName,
    productCode: input.productCode,
    updatedAt: normalizeTime(input.updatedAt),
    fetchedAt,
    sourceKind: input.sourceKind,
    sourceName: input.sourceKind === 'official' ? '工银官方异步行情' : '工银行情公开页',
    marketReference: input.marketReference,
  }
}

export function attachMarketReference(
  quote: QuoteSample,
  marketReference: MarketReference,
): QuoteSample {
  return {
    ...quote,
    marketReference,
  }
}

function emptyMarketReference(): MarketReference {
  return {
    sourceName: '',
    sourceUrl: '',
    isDelayed: true,
    tradingDate: null,
    au9999: null,
    autd: null,
    calibration: {
      anchorSymbol: null,
      anchorPrice: null,
      spread: null,
      premiumPercent: null,
      withinReferenceRange: null,
      note: '市场参考尚未加载',
    },
  }
}

function parseNumber(value?: string) {
  const parsed = Number((value ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(parsed)) {
    throw new Error(`无法解析数值: ${value ?? ''}`)
  }
  return parsed
}

function normalizeTime(value: string) {
  if (value.includes('T')) {
    return value
  }

  return `${value.replace(' ', 'T')}+08:00`
}
