import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createHistoryStorage } from './storage.js'

describe('history storage adapters', () => {
  it('uses file storage by default for local and Node deployments', () => {
    const storage = createHistoryStorage('file')

    assert.equal(storage.kind, 'file')
  })

  it('reserves explicit cloud adapter names for future production storage', async () => {
    const storage = createHistoryStorage('vercel-kv')

    assert.equal(storage.kind, 'vercel-kv')
    await assert.rejects(
      () => storage.loadHistory(),
      /vercel-kv 历史存储适配器尚未配置/,
    )
    await assert.rejects(
      () => storage.loadMarketContext(),
      /vercel-kv 市场上下文存储适配器尚未配置/,
    )
    await assert.rejects(
      () => storage.loadBacktestSnapshots(),
      /vercel-kv 回测快照存储适配器尚未配置/,
    )
    await assert.rejects(
      () => storage.loadFactors(),
      /vercel-kv 因子存储适配器尚未配置/,
    )
    await assert.rejects(
      () => storage.loadProviderHealthSnapshots(),
      /vercel-kv Provider 健康历史存储适配器尚未配置/,
    )
  })

  it('exposes sqlite and postgres production storage adapters', async () => {
    assert.equal(createHistoryStorage('sqlite').kind, 'sqlite')

    const postgres = createHistoryStorage('postgres')
    assert.equal(postgres.kind, 'postgres')
    await assert.rejects(
      () => postgres.loadHistory(),
      /POSTGRES_HTTP_URL/,
    )
  })

  it('rejects unknown storage adapter names loudly', () => {
    assert.throws(
      () => createHistoryStorage('memory'),
      /未知历史存储适配器/,
    )
  })
})
