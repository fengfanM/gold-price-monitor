import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  readFactorCandleManifest,
  readFactorCandles,
  readLatestFactorCandles,
} from './factor-candles.js'

describe('macro factor candle loader', () => {
  it('reads the standardized manifest and factor candle CSV without treating mirrors as production data', async () => {
    const dir = await makeFactorFixture()
    try {
      const manifest = await readFactorCandleManifest(dir)
      const candles = await readFactorCandles('CPIAUCSL', { directory: dir })

      assert.equal(manifest.length, 2)
      assert.equal(manifest[0].symbol, 'CPIAUCSL')
      assert.equal(candles.length, 3)
      assert.equal(candles[0].productionUsage, 'learning_only_mirror')
      assert.equal(candles[0].sourceUsage, 'mirror_learning')
      assert.equal(candles[0].isProductionEligible, false)
      assert.equal(candles[2].value, 306.2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips production-disabled samples by default and returns empty arrays when files are missing', async () => {
    const dir = await makeFactorFixture()
    try {
      const disabled = await readFactorCandles('DISABLED_SAMPLE', { directory: dir })
      const disabledIncluded = await readFactorCandles('DISABLED_SAMPLE', {
        directory: dir,
        includeProductionDisabled: true,
      })
      const latest = await readLatestFactorCandles(['CPIAUCSL', 'MISSING'], {
        directory: dir,
        limit: 2,
      })

      assert.equal(disabled.length, 0)
      assert.equal(disabledIncluded.length, 1)
      assert.equal(disabledIncluded[0].productionUsage, 'production_disabled')
      assert.equal(latest.CPIAUCSL.length, 2)
      assert.deepEqual(latest.MISSING, [])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

async function makeFactorFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'factor-candles-'))
  await writeFile(
    path.join(dir, 'conversion-manifest.csv'),
    [
      'symbol,source_file,rows,first_date,last_date,status',
      'CPIAUCSL,cpiaucsl.factor-candles.csv,3,2026-01-01,2026-03-01,converted',
      'DISABLED_SAMPLE,disabled.factor-candles.csv,1,2026-01-01,2026-01-01,converted',
    ].join('\n'),
  )
  await writeFile(
    path.join(dir, 'cpiaucsl.factor-candles.csv'),
    [
      'symbol,date,time,frequency,open,high,low,close,value,source,productionUsage',
      'CPIAUCSL,2026-01-01,00:00:00,monthly,304.1,304.1,304.1,304.1,304.1,mirror-ivo-fred,learning_only_mirror',
      'CPIAUCSL,2026-02-01,00:00:00,monthly,305.0,305.0,305.0,305.0,305.0,mirror-ivo-fred,learning_only_mirror',
      'CPIAUCSL,2026-03-01,00:00:00,monthly,306.2,306.2,306.2,306.2,306.2,mirror-ivo-fred,learning_only_mirror',
    ].join('\n'),
  )
  await writeFile(
    path.join(dir, 'disabled.factor-candles.csv'),
    [
      'symbol,date,time,frequency,open,high,low,close,value,source,productionUsage',
      'DISABLED_SAMPLE,2026-01-01,00:00:00,monthly,1,1,1,1,1,third-party-sample,offline_sample_production_disabled',
    ].join('\n'),
  )
  return dir
}
