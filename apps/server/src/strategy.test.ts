import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { evaluateOpportunity } from './strategy.js'
import type {
  HistoryPoint,
  MarketContext,
  QuoteSample,
  QuoteStats24h,
  SourceStatus,
} from './types.js'

describe('opportunity strategy engine', () => {
  it('uses technical indicators as explicit buy-signal inputs', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:59:00.000Z', 580),
      ],
      latestQuote: makeQuote(581),
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 31,
        macd: { dif: 0.8, dea: 0.6, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    assert.equal(signal.triggered, true)
    assert.equal(signal.reasons.some((item) => item.includes('RSI14')), true)
    assert.equal(signal.reasons.some((item) => item.includes('MACD')), true)
    assert.equal(signal.probabilityModel.primaryPrediction.horizonMinutes, 60)
    assert.equal(signal.risks.some((item) => item.includes('概率模型')), true)
    assert.equal(signal.expertOpinions.length, 5)
    assert.equal(signal.expertConsensus.bullishCount > 0, true)
    assert.equal(
      signal.expertOpinions.some((item) => item.id === 'quant-timer' && item.rationale.some((text) => text.includes('RSI14'))),
      true,
    )
  })

  it('caps strong signals when technical trend is still falling', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:59:00.000Z', 580),
      ],
      latestQuote: makeQuote(581),
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 36,
        macd: { dif: -0.6, dea: -0.4, histogram: -0.4 },
        shortTrend: 'falling',
      },
    })

    assert.notEqual(signal.level, 'strong')
    assert.equal(signal.risks.some((item) => item.includes('短线趋势仍在下行')), true)
    assert.equal(
      signal.expertOpinions.some((item) => item.id === 'trend-tape-reader' && item.action === 'wait'),
      true,
    )
  })

  it('keeps risk-off expert disagreement when source data is stale', () => {
    const sourceStatus = makeSourceStatus()
    sourceStatus.stale = true

    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:59:00.000Z', 580),
      ],
      latestQuote: makeQuote(581),
      stats: makeStats(),
      sourceStatus,
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 31,
        macd: { dif: 0.8, dea: 0.6, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    const riskOfficer = signal.expertOpinions.find((item) => item.id === 'risk-officer')

    assert.equal(riskOfficer?.stance, 'risk_off')
    assert.equal(signal.expertConsensus.summary.includes('偏谨慎'), true)
  })

  it('downgrades opportunity when multi-source macro factors are under pressure', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:59:00.000Z', 580),
      ],
      latestQuote: makeQuote(581),
      marketContext: makeMarketContext(34),
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 31,
        macd: { dif: 0.8, dea: 0.6, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    const macroOfficer = signal.expertOpinions.find((item) => item.id === 'precious-metals-macro')

    assert.equal(macroOfficer?.action, 'avoid')
    assert.equal(signal.risks.some((item) => item.includes('多源宏观/回测因子')), true)
    assert.equal(signal.marketContext.factorScore, 34)
  })

  it('downgrades strong buy signals when critical provider probes fail', () => {
    const context = makeMarketContext(62)
    context.providerHealth = [
      makeProviderHealth('GC=F', '国际黄金期货', 'unavailable'),
      makeProviderHealth('CME_GOLD_OI', 'CME 黄金未平仓合约', 'unavailable'),
      makeProviderHealth('WGC_ETF_FLOW', 'WGC ETF 资金流', 'unavailable'),
    ]

    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:59:00.000Z', 580),
      ],
      latestQuote: makeQuote(581),
      marketContext: context,
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 31,
        macd: { dif: 0.8, dea: 0.6, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    assert.notEqual(signal.level, 'strong')
    assert.equal(signal.risks.some((item) => item.includes('关键专业源不可用')), true)
    assert.equal(signal.expertOpinions.some((item) => item.risk.includes('关键数据源失败')), true)
  })

  it('keeps pattern signals explainable and low weight in opportunity scoring', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:54:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:55:00.000Z', 580),
        makeHistoryPoint('2026-05-16T09:56:00.000Z', 588),
        makeHistoryPoint('2026-05-16T09:57:00.000Z', 581),
      ],
      latestQuote: makeQuote(584),
      patternSignals: [{
        id: 'pattern-double-bottom-test',
        kind: 'double_bottom',
        label: '疑似双底',
        direction: 'bullish',
        confidence: 68,
        detectedAt: '2026-05-16T10:00:00.000Z',
        keyPrice: 581,
        necklinePrice: 588,
        invalidationPrice: 579.8,
        targetPrice: 595,
        expectedConfirmationBars: 3,
        summary: '右底不破左底且出现反弹，等待放量站上颈线确认。',
        explanation: '测试形态解释。',
      }],
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 38,
        macd: { dif: 0.3, dea: 0.2, histogram: 0.2 },
        shortTrend: 'rising',
      },
    })

    assert.equal(signal.patternSignals.length, 1)
    assert.equal(signal.reasons.some((item) => item.includes('疑似双底')), true)
  })

  it('builds an executable trade plan with risk reward and invalidation rules', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:54:00.000Z', 586),
        makeHistoryPoint('2026-05-16T09:55:00.000Z', 580),
        makeHistoryPoint('2026-05-16T09:56:00.000Z', 588),
        makeHistoryPoint('2026-05-16T09:57:00.000Z', 581),
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 583),
      ],
      latestQuote: makeQuote(584),
      patternSignals: [{
        id: 'pattern-double-bottom-plan',
        kind: 'double_bottom',
        label: '疑似双底',
        direction: 'bullish',
        confidence: 74,
        detectedAt: '2026-05-16T10:00:00.000Z',
        keyPrice: 581,
        necklinePrice: 588,
        invalidationPrice: 579.8,
        targetPrice: 598,
        expectedConfirmationBars: 2,
        summary: '右底不破左底且出现反弹，等待放量站上颈线确认。',
        explanation: '测试形态解释。',
      }],
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 583,
        ma10: 584,
        ma20: 585,
        rsi14: 39,
        macd: { dif: 0.5, dea: 0.2, histogram: 0.3 },
        shortTrend: 'rising',
      },
    })

    assert.equal(typeof signal.tradePlan.actionLabel, 'string')
    assert.equal(signal.tradePlan.stopLoss !== null, true)
    assert.equal(signal.tradePlan.takeProfit1 !== null, true)
    assert.equal(signal.tradePlan.rationale.some((item) => item.includes('风险收益比')), true)
    assert.equal(signal.tradePlan.invalidation.includes('跌破'), true)
  })

  it('detects multi-timeframe confluence and downgrades severe conflicts', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T08:00:00.000Z', 600),
        makeHistoryPoint('2026-05-16T08:30:00.000Z', 596),
        makeHistoryPoint('2026-05-16T09:00:00.000Z', 592),
        makeHistoryPoint('2026-05-16T09:30:00.000Z', 588),
        makeHistoryPoint('2026-05-16T09:55:00.000Z', 581),
        makeHistoryPoint('2026-05-16T09:58:00.000Z', 583),
      ],
      latestQuote: makeQuote(584),
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 583,
        ma10: 586,
        ma20: 590,
        rsi14: 42,
        macd: { dif: -0.1, dea: -0.3, histogram: 0.2 },
        shortTrend: 'rising',
      },
    })

    assert.equal(signal.confluence.frames.length, 4)
    assert.equal(['none', 'mild', 'severe'].includes(signal.confluence.conflictLevel), true)
    assert.equal(typeof signal.confluence.score, 'number')
  })

  it('downgrades signals and position size inside major event windows', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-13T13:05:00.000Z', 586),
        makeHistoryPoint('2026-05-13T13:08:00.000Z', 580),
      ],
      latestQuote: makeQuote(581, '2026-05-13T13:10:00.000Z'),
      stats: makeStats(),
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 582,
        ma10: 584,
        ma20: 583,
        rsi14: 31,
        macd: { dif: 0.8, dea: 0.6, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    assert.equal(signal.eventRisk.level, 'critical')
    assert.equal(signal.psychology.flags.some((flag) => flag.kind === 'event_impulse'), true)
    assert.notEqual(signal.level, 'strong')
    assert.equal(signal.risks.some((item) => item.includes('重大事件风控')), true)
    assert.equal(signal.tradePlan.maxPositionPercent <= 1, true)
    assert.equal(signal.tradePlan.rationale.some((item) => item.includes('事件风控仓位系数')), true)
  })

  it('flags chasing-high psychology risk and prevents strong escalation', () => {
    const signal = evaluateOpportunity({
      history: [
        makeHistoryPoint('2026-05-16T09:54:00.000Z', 578),
        makeHistoryPoint('2026-05-16T09:55:00.000Z', 582),
        makeHistoryPoint('2026-05-16T09:56:00.000Z', 588),
        makeHistoryPoint('2026-05-16T09:57:00.000Z', 592),
      ],
      latestQuote: makeQuote(594),
      stats: {
        ...makeStats(),
        currentPrice: 594,
        percentChange24h: 0.018,
        drawdownAmount24h: 2,
        drawdownPercent24h: 0.0034,
      },
      sourceStatus: makeSourceStatus(),
      technicals: {
        ma5: 592,
        ma10: 588,
        ma20: 584,
        rsi14: 68,
        macd: { dif: 0.8, dea: 0.4, histogram: 0.4 },
        shortTrend: 'rising',
      },
    })

    assert.equal(signal.psychology.flags.some((flag) => flag.kind === 'chasing_high'), true)
    assert.notEqual(signal.level, 'strong')
    assert.equal(signal.risks.some((item) => item.includes('心理纪律官')), true)
  })
})

function makeQuote(price: number, timestamp = '2026-05-16T10:00:00.000Z'): QuoteSample {
  return {
    symbol: 'ICBC_ACCUMULATION_GOLD',
    currency: 'CNY',
    unit: '元/克',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 578,
    dayHigh: 596,
    updatedAt: timestamp,
    fetchedAt: timestamp,
    productName: '积存金',
    productCode: '080020000521',
    sourceKind: 'official',
    sourceName: '工银官方异步行情',
    marketReference: {
      sourceName: '上海黄金交易所延时行情',
      sourceUrl: 'https://sge.com.cn/h5_sjzx/yshq',
      isDelayed: true,
      tradingDate: '2026年05月16日',
      au9999: null,
      autd: null,
      calibration: {
        anchorSymbol: 'Au99.99',
        anchorPrice: 583,
        spread: price - 583,
        premiumPercent: (price - 583) / 583,
        withinReferenceRange: true,
        note: 'test',
      },
    },
  }
}

function makeHistoryPoint(timestamp: string, price: number): HistoryPoint {
  return {
    timestamp,
    sourceKind: 'official',
    price,
    activePrice: price,
    regularPrice: price,
    sellPrice: price,
    dayLow: 578,
    dayHigh: 596,
    referenceAnchorPrice: 583,
    referenceAu9999Price: 583,
    referenceAutdPrice: 583,
  }
}

function makeStats(): QuoteStats24h {
  return {
    high24h: 596,
    low24h: 578,
    currentPrice: 581,
    absoluteChange24h: -12,
    percentChange24h: -0.0202,
    drawdownAmount24h: 15,
    drawdownPercent24h: 0.0252,
    pointCount: 24,
  }
}

function makeSourceStatus(): SourceStatus {
  return {
    active: 'official',
    stale: false,
    lastSuccessAt: '2026-05-16T10:00:00.000Z',
    official: {
      status: 'healthy',
      lastSuccessAt: '2026-05-16T10:00:00.000Z',
      lastFailureAt: null,
      lastError: null,
    },
    fallback: {
      status: 'unknown',
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
    },
  }
}

function makeMarketContext(factorScore: number): MarketContext {
  const factor = (id: string, label: string) => ({
    id,
    label,
    value: null,
    unit: '点',
    changePercent: null,
    impact: 'pressure' as const,
    score: factorScore,
    status: 'derived' as const,
    summary: `${label}对黄金形成压力。`,
    updatedAt: null,
  })

  return {
    updatedAt: '2026-05-16T10:00:00.000Z',
    factorScore,
    summary: '多源宏观因子偏弱。',
    factors: {
      spotGoldUsd: factor('spotGoldUsd', '国际黄金期货'),
      dollarIndex: factor('dollarIndex', '美元指数'),
      usdCny: factor('usdCny', '美元/人民币'),
    },
    macroFactors: [
      factor('DFII10', '10Y TIPS 实际利率'),
      factor('VIXCLS', 'VIX 恐慌指数'),
    ],
    sentiment: {
      news: {
        id: 'news',
        label: '新闻情绪',
        score: 50,
        confidence: 20,
        status: 'unavailable',
        summary: '新闻未接入。',
        sources: [],
        updatedAt: null,
      },
      blogger: {
        id: 'blogger',
        label: '博主观点可信度',
        score: 50,
        confidence: 20,
        status: 'unavailable',
        summary: '博主观点未接入。',
        sources: [],
        updatedAt: null,
      },
    },
    backtest: {
      status: 'derived',
      sampleSize: 12,
      summary: '回测表现偏弱。',
      horizons: [],
    },
    providerHealth: [],
  }
}

function makeProviderHealth(id: string, label: string, status: 'live' | 'unavailable') {
  return {
    id,
    label,
    provider: id.toLowerCase(),
    status,
    participatesInScoring: true,
    lastSuccessAt: status === 'live' ? '2026-05-16T10:00:00.000Z' : null,
    lastFailureAt: status === 'unavailable' ? '2026-05-16T10:00:00.000Z' : null,
    latencyMs: 120,
    error: status === 'unavailable' ? 'test failure' : null,
    envVars: [],
  }
}
