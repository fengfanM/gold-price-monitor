import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  FactorCandle,
  FactorCandleProductionUsage,
  MarketFactorSourceUsage,
} from './types.js'

export type FactorCandleManifestRow = {
  symbol: string
  sourceFile: string
  rows: number
  firstDate: string
  lastDate: string
  status: string
}

export type FactorCandleReadOptions = {
  directory?: string
  includeProductionDisabled?: boolean
  limit?: number
}

const STANDARDIZED_FACTOR_CANDLE_DIR = path.resolve(
  process.cwd(),
  'docs/reference/kline-gold-trading/library/standardized-factor-candles',
)
const SERVER_RELATIVE_FACTOR_CANDLE_DIR = path.resolve(
  process.cwd(),
  '../../docs/reference/kline-gold-trading/library/standardized-factor-candles',
)
const SUPPORTED_FACTOR_SYMBOLS = [
  'CPIAUCSL',
  'CPILFESL',
  'DGS10',
  'DFII10',
  'T10YIE',
  'DTWEXBGS',
  'DEXCHUS',
  'VIXCLS',
]

export async function readFactorCandleManifest(directory?: string): Promise<FactorCandleManifestRow[]> {
  const selected = await findFactorCandleDirectory(directory)
  if (!selected) {
    return []
  }
  try {
    const csv = await readFile(path.join(selected, 'conversion-manifest.csv'), 'utf8')
    const rows = parseCsv(csv)
    return rows.map((row) => ({
      symbol: row.symbol ?? '',
      sourceFile: row.source_file ?? row.sourceFile ?? '',
      rows: Number(row.rows ?? 0),
      firstDate: row.first_date ?? row.firstDate ?? '',
      lastDate: row.last_date ?? row.lastDate ?? '',
      status: row.status ?? 'unknown',
    })).filter((row) => row.symbol.length > 0 && row.sourceFile.length > 0)
  } catch {
    return []
  }
}

export async function readFactorCandles(
  symbol: string,
  options: FactorCandleReadOptions = {},
): Promise<FactorCandle[]> {
  const selected = await findFactorCandleDirectory(options.directory)
  if (!selected) {
    return []
  }
  const manifest = await readFactorCandleManifest(selected)
  const row = manifest.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase())
  const sourceFiles = [
    row?.sourceFile,
    `${symbol.toLowerCase()}.factor-candles.csv`,
    `${symbol.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.factor-candles.csv`,
  ].filter((item): item is string => Boolean(item))
  const csv = await readFirstExisting(selected, sourceFiles)
  if (!csv) {
    return []
  }
  try {
    const candles = parseCsv(csv)
      .map(rowToFactorCandle)
      .filter((candle): candle is FactorCandle => Boolean(candle))
      .filter((candle) => options.includeProductionDisabled || candle.productionUsage !== 'production_disabled')
      .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`))
    if (options.limit && options.limit > 0) {
      return candles.slice(-options.limit)
    }
    return candles
  } catch {
    return []
  }
}

export async function readLatestFactorCandles(
  symbols = SUPPORTED_FACTOR_SYMBOLS,
  options: FactorCandleReadOptions = {},
): Promise<Record<string, FactorCandle[]>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const candles = await readFactorCandles(symbol, {
        ...options,
        limit: options.limit ?? 36,
      })
      return [symbol, candles] as const
    }),
  )
  return Object.fromEntries(entries)
}

export function normalizeProductionUsage(raw: string | undefined): FactorCandleProductionUsage {
  if (raw === 'production_eligible') {
    return 'production_eligible'
  }
  if (raw === 'production_disabled' || raw === 'offline_sample_production_disabled') {
    return 'production_disabled'
  }
  return 'learning_only_mirror'
}

export function sourceUsageFromProductionUsage(usage: FactorCandleProductionUsage): MarketFactorSourceUsage {
  if (usage === 'production_eligible') {
    return 'production_realtime'
  }
  if (usage === 'production_disabled') {
    return 'production_disabled'
  }
  return 'mirror_learning'
}

async function findFactorCandleDirectory(directory?: string) {
  const candidates = [
    directory,
    process.env.FACTOR_CANDLE_LIBRARY_DIR,
    STANDARDIZED_FACTOR_CANDLE_DIR,
    SERVER_RELATIVE_FACTOR_CANDLE_DIR,
  ].filter((item): item is string => Boolean(item))
  for (const candidate of candidates) {
    try {
      await readFile(path.join(candidate, 'conversion-manifest.csv'), 'utf8')
      return candidate
    } catch {
      // Try the next known workspace layout.
    }
  }
  return null
}

async function readFirstExisting(directory: string, sourceFiles: string[]) {
  for (const sourceFile of sourceFiles) {
    try {
      return await readFile(path.join(directory, sourceFile), 'utf8')
    } catch {
      // The manifest records the raw source_file; generated CSVs use normalized factor filenames.
    }
  }
  return null
}

function rowToFactorCandle(row: Record<string, string>): FactorCandle | null {
  const symbol = row.symbol?.trim()
  const date = row.date?.trim()
  const value = parseNumber(row.value ?? row.close)
  if (!symbol || !date || value === null) {
    return null
  }
  const productionUsage = normalizeProductionUsage(row.productionUsage ?? row.production_usage)
  const sourceUsage = sourceUsageFromProductionUsage(productionUsage)
  return {
    symbol,
    date,
    time: row.time?.trim() || '00:00:00',
    frequency: normalizeFrequency(row.frequency),
    open: parseNumber(row.open) ?? value,
    high: parseNumber(row.high) ?? value,
    low: parseNumber(row.low) ?? value,
    close: parseNumber(row.close) ?? value,
    value,
    source: row.source?.trim() || 'unknown',
    productionUsage,
    sourceUsage,
    isProductionEligible: productionUsage === 'production_eligible',
  }
}

function normalizeFrequency(raw: string | undefined): FactorCandle['frequency'] {
  if (raw === 'daily' || raw === 'monthly' || raw === 'weekly') {
    return raw
  }
  return 'unknown'
}

function parseNumber(raw: string | undefined) {
  if (raw === undefined || raw.trim() === '' || raw.trim() === '.') {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) {
    return []
  }
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}
