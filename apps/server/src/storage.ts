import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

import type {
  BacktestSnapshot,
  HistoryPoint,
  MarketContext,
  MarketFactor,
  ProviderHealthSnapshot,
} from './types.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(currentDir, '../data')
const HISTORY_FILE = path.join(DATA_DIR, 'gold-history.json')
const MARKET_CONTEXT_FILE = path.join(DATA_DIR, 'market-context.json')
const BACKTEST_SNAPSHOTS_FILE = path.join(DATA_DIR, 'backtest-snapshots.json')
const FACTORS_FILE = path.join(DATA_DIR, 'market-factors.json')
const PROVIDER_HEALTH_FILE = path.join(DATA_DIR, 'provider-health-history.json')
const BACKTEST_SNAPSHOT_LIMIT = Number(process.env.BACKTEST_SNAPSHOT_LIMIT ?? '20000')
const SQLITE_FILE = process.env.SQLITE_FILE
  ? path.resolve(process.env.SQLITE_FILE)
  : path.join(DATA_DIR, 'gold-monitor.sqlite')
const STORAGE_ADAPTER = process.env.STORAGE_ADAPTER
  ?? (process.env.POSTGRES_HTTP_URL || process.env.DATABASE_URL ? 'postgres' : 'file')
const POSTGRES_HTTP_TIMEOUT_MS = Number(process.env.POSTGRES_HTTP_TIMEOUT_MS ?? '5000')

type PersistedHistory = {
  updatedAt: string
  history: HistoryPoint[]
}

type PersistedMarketContext = {
  updatedAt: string
  marketContext: MarketContext | null
}

type PersistedBacktestSnapshots = {
  updatedAt: string
  snapshots: BacktestSnapshot[]
}

type PersistedFactors = {
  updatedAt: string
  factors: MarketFactor[]
}

type PersistedProviderHealth = {
  updatedAt: string
  snapshots: ProviderHealthSnapshot[]
}

export type HistoryStorageAdapter = {
  readonly kind: string
  loadHistory(): Promise<HistoryPoint[]>
  saveHistory(history: HistoryPoint[]): Promise<void>
  loadMarketContext(): Promise<MarketContext | null>
  saveMarketContext(marketContext: MarketContext): Promise<void>
  loadBacktestSnapshots(): Promise<BacktestSnapshot[]>
  saveBacktestSnapshot(snapshot: BacktestSnapshot): Promise<void>
  saveBacktestSnapshots(snapshots: BacktestSnapshot[]): Promise<void>
  loadFactors(): Promise<MarketFactor[]>
  saveFactors(factors: MarketFactor[]): Promise<void>
  loadProviderHealthSnapshots(): Promise<ProviderHealthSnapshot[]>
  saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot): Promise<void>
}

class FileHistoryStorage implements HistoryStorageAdapter {
  readonly kind = 'file'

  constructor(
    private readonly historyFile: string,
    private readonly marketContextFile: string,
    private readonly backtestSnapshotsFile: string,
    private readonly factorsFile: string,
    private readonly providerHealthFile: string,
  ) {}

  async loadHistory(): Promise<HistoryPoint[]> {
    try {
      const raw = await readFile(this.historyFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedHistory
      return Array.isArray(parsed.history) ? parsed.history : []
    } catch {
      return []
    }
  }

  async saveHistory(history: HistoryPoint[]) {
    await writeJsonAtomic(this.historyFile, {
      updatedAt: new Date().toISOString(),
      history,
    })
  }

  async loadMarketContext(): Promise<MarketContext | null> {
    try {
      const raw = await readFile(this.marketContextFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedMarketContext
      return parsed.marketContext ?? null
    } catch {
      return null
    }
  }

  async saveMarketContext(marketContext: MarketContext) {
    await writeJsonAtomic(this.marketContextFile, {
      updatedAt: new Date().toISOString(),
      marketContext,
    })
  }

  async loadBacktestSnapshots(): Promise<BacktestSnapshot[]> {
    try {
      const raw = await readFile(this.backtestSnapshotsFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedBacktestSnapshots
      return Array.isArray(parsed.snapshots) ? parsed.snapshots : []
    } catch {
      return []
    }
  }

  async saveBacktestSnapshot(snapshot: BacktestSnapshot) {
    const existing = await this.loadBacktestSnapshots()
    const snapshots = mergeBacktestSnapshots(existing, [snapshot])
    await this.saveBacktestSnapshots(snapshots)
  }

  async saveBacktestSnapshots(snapshots: BacktestSnapshot[]) {
    await writeJsonAtomic(this.backtestSnapshotsFile, {
      updatedAt: new Date().toISOString(),
      snapshots: normalizeBacktestSnapshots(snapshots),
    })
  }

  async loadFactors(): Promise<MarketFactor[]> {
    try {
      const raw = await readFile(this.factorsFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedFactors
      return Array.isArray(parsed.factors) ? parsed.factors : []
    } catch {
      return []
    }
  }

  async saveFactors(factors: MarketFactor[]) {
    await writeJsonAtomic(this.factorsFile, {
      updatedAt: new Date().toISOString(),
      factors,
    })
  }

  async loadProviderHealthSnapshots(): Promise<ProviderHealthSnapshot[]> {
    try {
      const raw = await readFile(this.providerHealthFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedProviderHealth
      return Array.isArray(parsed.snapshots) ? parsed.snapshots : []
    } catch {
      return []
    }
  }

  async saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
    const existing = await this.loadProviderHealthSnapshots()
    await writeJsonAtomic(this.providerHealthFile, {
      updatedAt: new Date().toISOString(),
      snapshots: [...existing, snapshot].slice(-300),
    })
  }
}

class SqliteHistoryStorage implements HistoryStorageAdapter {
  readonly kind = 'sqlite'
  private databasePromise: Promise<SqliteDatabase> | null = null

  constructor(private readonly sqliteFile: string) {}

  async loadHistory() {
    return this.readJson<HistoryPoint[]>('history', [])
  }

  async saveHistory(history: HistoryPoint[]) {
    await this.writeJson('history', history)
  }

  async loadMarketContext() {
    return this.readJson<MarketContext | null>('marketContext', null)
  }

  async saveMarketContext(marketContext: MarketContext) {
    await this.writeJson('marketContext', marketContext)
  }

  async loadBacktestSnapshots() {
    return this.readJson<BacktestSnapshot[]>('backtestSnapshots', [])
  }

  async saveBacktestSnapshot(snapshot: BacktestSnapshot) {
    const existing = await this.loadBacktestSnapshots()
    await this.saveBacktestSnapshots(mergeBacktestSnapshots(existing, [snapshot]))
  }

  async saveBacktestSnapshots(snapshots: BacktestSnapshot[]) {
    await this.writeJson('backtestSnapshots', normalizeBacktestSnapshots(snapshots))
  }

  async loadFactors() {
    return this.readJson<MarketFactor[]>('factors', [])
  }

  async saveFactors(factors: MarketFactor[]) {
    await this.writeJson('factors', factors)
  }

  async loadProviderHealthSnapshots() {
    return this.readJson<ProviderHealthSnapshot[]>('providerHealthSnapshots', [])
  }

  async saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
    const existing = await this.loadProviderHealthSnapshots()
    await this.writeJson('providerHealthSnapshots', [...existing, snapshot].slice(-600))
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    const db = await this.getDatabase()
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value?: string } | undefined
    if (!row?.value) {
      return fallback
    }
    return JSON.parse(row.value) as T
  }

  private async writeJson(key: string, value: unknown) {
    const db = await this.getDatabase()
    db.prepare(
      'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    ).run(key, JSON.stringify(value), new Date().toISOString())
  }

  private async getDatabase() {
    this.databasePromise ??= openSqliteDatabase(this.sqliteFile)
    return this.databasePromise
  }
}

class PostgresHttpHistoryStorage implements HistoryStorageAdapter {
  readonly kind = 'postgres'
  private initialized = false

  constructor(
    private readonly endpoint = process.env.POSTGRES_HTTP_URL ?? '',
    private readonly token = process.env.POSTGRES_HTTP_TOKEN ?? '',
  ) {}

  async loadHistory() {
    return this.readJson<HistoryPoint[]>('history', [])
  }

  async saveHistory(history: HistoryPoint[]) {
    await this.writeJson('history', history)
  }

  async loadMarketContext() {
    return this.readJson<MarketContext | null>('marketContext', null)
  }

  async saveMarketContext(marketContext: MarketContext) {
    await this.writeJson('marketContext', marketContext)
  }

  async loadBacktestSnapshots() {
    return this.readJson<BacktestSnapshot[]>('backtestSnapshots', [])
  }

  async saveBacktestSnapshot(snapshot: BacktestSnapshot) {
    const existing = await this.loadBacktestSnapshots()
    await this.saveBacktestSnapshots(mergeBacktestSnapshots(existing, [snapshot]))
  }

  async saveBacktestSnapshots(snapshots: BacktestSnapshot[]) {
    await this.writeJson('backtestSnapshots', normalizeBacktestSnapshots(snapshots))
  }

  async loadFactors() {
    return this.readJson<MarketFactor[]>('factors', [])
  }

  async saveFactors(factors: MarketFactor[]) {
    await this.writeJson('factors', factors)
  }

  async loadProviderHealthSnapshots() {
    return this.readJson<ProviderHealthSnapshot[]>('providerHealthSnapshots', [])
  }

  async saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
    const existing = await this.loadProviderHealthSnapshots()
    await this.writeJson('providerHealthSnapshots', [...existing, snapshot].slice(-600))
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    this.assertConfigured()
    await this.ensureTable()
    const result = await this.query('SELECT value FROM gold_monitor_kv WHERE key = $1 LIMIT 1', [key])
    const value = result.rows?.[0]?.value
    if (value === undefined || value === null) {
      return fallback
    }
    return typeof value === 'string' ? JSON.parse(value) as T : value as T
  }

  private async writeJson(key: string, value: unknown) {
    this.assertConfigured()
    await this.ensureTable()
    await this.query(
      'INSERT INTO gold_monitor_kv(key, value, updated_at) VALUES($1, $2::jsonb, now()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, JSON.stringify(value)],
    )
  }

  private async ensureTable() {
    if (this.initialized) {
      return
    }
    await this.query(
      'CREATE TABLE IF NOT EXISTS gold_monitor_kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL)',
      [],
    )
    this.initialized = true
  }

  private async query(query: string, params: unknown[]) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), POSTGRES_HTTP_TIMEOUT_MS)
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ query, params }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Postgres HTTP ${response.status}`)
      }
      return response.json() as Promise<{ rows?: Array<Record<string, unknown>> }>
    } finally {
      clearTimeout(timeout)
    }
  }

  private assertConfigured() {
    if (!this.endpoint) {
      throw new Error('postgres 存储适配器需要 POSTGRES_HTTP_URL。')
    }
  }
}

class PostgresDirectHistoryStorage implements HistoryStorageAdapter {
  readonly kind = 'postgres'
  private initialized = false
  private readonly pool: Pool

  constructor(private readonly databaseUrl = process.env.DATABASE_URL ?? '') {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.POSTGRES_SSL === '0' ? undefined : { rejectUnauthorized: false },
    })
  }

  async loadHistory() {
    return this.readJson<HistoryPoint[]>('history', [])
  }

  async saveHistory(history: HistoryPoint[]) {
    await this.writeJson('history', history)
  }

  async loadMarketContext() {
    return this.readJson<MarketContext | null>('marketContext', null)
  }

  async saveMarketContext(marketContext: MarketContext) {
    await this.writeJson('marketContext', marketContext)
  }

  async loadBacktestSnapshots() {
    return this.readJson<BacktestSnapshot[]>('backtestSnapshots', [])
  }

  async saveBacktestSnapshot(snapshot: BacktestSnapshot) {
    const existing = await this.loadBacktestSnapshots()
    await this.saveBacktestSnapshots(mergeBacktestSnapshots(existing, [snapshot]))
  }

  async saveBacktestSnapshots(snapshots: BacktestSnapshot[]) {
    await this.writeJson('backtestSnapshots', normalizeBacktestSnapshots(snapshots))
  }

  async loadFactors() {
    return this.readJson<MarketFactor[]>('factors', [])
  }

  async saveFactors(factors: MarketFactor[]) {
    await this.writeJson('factors', factors)
  }

  async loadProviderHealthSnapshots() {
    return this.readJson<ProviderHealthSnapshot[]>('providerHealthSnapshots', [])
  }

  async saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
    const existing = await this.loadProviderHealthSnapshots()
    await this.writeJson('providerHealthSnapshots', [...existing, snapshot].slice(-600))
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    this.assertConfigured()
    await this.ensureTable()
    const result = await this.pool.query('SELECT value FROM gold_monitor_kv WHERE key = $1 LIMIT 1', [key])
    const value = result.rows?.[0]?.value
    if (value === undefined || value === null) {
      return fallback
    }
    return typeof value === 'string' ? JSON.parse(value) as T : value as T
  }

  private async writeJson(key: string, value: unknown) {
    this.assertConfigured()
    await this.ensureTable()
    await this.pool.query(
      'INSERT INTO gold_monitor_kv(key, value, updated_at) VALUES($1, $2::jsonb, now()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, JSON.stringify(value)],
    )
  }

  private async ensureTable() {
    if (this.initialized) {
      return
    }
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS gold_monitor_kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL)',
      [],
    )
    this.initialized = true
  }

  private assertConfigured() {
    if (!this.databaseUrl) {
      throw new Error('postgres 存储适配器需要 POSTGRES_HTTP_URL 或 DATABASE_URL。')
    }
  }
}

class PlannedCloudHistoryStorage implements HistoryStorageAdapter {
  readonly kind: string

  constructor(kind: string) {
    this.kind = kind
  }

  async loadHistory(): Promise<HistoryPoint[]> {
    throw new Error(`${this.kind} 历史存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveHistory(): Promise<void> {
    throw new Error(`${this.kind} 历史存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async loadMarketContext(): Promise<MarketContext | null> {
    throw new Error(`${this.kind} 市场上下文存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveMarketContext(): Promise<void> {
    throw new Error(`${this.kind} 市场上下文存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async loadBacktestSnapshots(): Promise<BacktestSnapshot[]> {
    throw new Error(`${this.kind} 回测快照存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveBacktestSnapshot(): Promise<void> {
    throw new Error(`${this.kind} 回测快照存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveBacktestSnapshots(): Promise<void> {
    throw new Error(`${this.kind} 回测快照存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async loadFactors(): Promise<MarketFactor[]> {
    throw new Error(`${this.kind} 因子存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveFactors(): Promise<void> {
    throw new Error(`${this.kind} 因子存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async loadProviderHealthSnapshots(): Promise<ProviderHealthSnapshot[]> {
    throw new Error(`${this.kind} Provider 健康历史存储适配器尚未配置，请先接入对应云存储客户端。`)
  }

  async saveProviderHealthSnapshot(): Promise<void> {
    throw new Error(`${this.kind} Provider 健康历史存储适配器尚未配置，请先接入对应云存储客户端。`)
  }
}

export function createHistoryStorage(kind = STORAGE_ADAPTER): HistoryStorageAdapter {
  if (kind === 'file') {
    return new FileHistoryStorage(
      HISTORY_FILE,
      MARKET_CONTEXT_FILE,
      BACKTEST_SNAPSHOTS_FILE,
      FACTORS_FILE,
      PROVIDER_HEALTH_FILE,
    )
  }

  if (kind === 'sqlite') {
    return new SqliteHistoryStorage(SQLITE_FILE)
  }

  if (kind === 'postgres') {
    return process.env.POSTGRES_HTTP_URL
      ? new PostgresHttpHistoryStorage()
      : new PostgresDirectHistoryStorage()
  }

  if (kind === 'vercel-kv' || kind === 'upstash') {
    return new PlannedCloudHistoryStorage(kind)
  }

  throw new Error(`未知历史存储适配器: ${kind}`)
}

const storage = createHistoryStorage()

export async function loadHistory(): Promise<HistoryPoint[]> {
  return storage.loadHistory()
}

export async function saveHistory(history: HistoryPoint[]) {
  await storage.saveHistory(history)
}

export async function loadMarketContext(): Promise<MarketContext | null> {
  return storage.loadMarketContext()
}

export async function saveMarketContext(marketContext: MarketContext) {
  await storage.saveMarketContext(marketContext)
}

export async function loadBacktestSnapshots(): Promise<BacktestSnapshot[]> {
  return storage.loadBacktestSnapshots()
}

export async function saveBacktestSnapshot(snapshot: BacktestSnapshot) {
  await storage.saveBacktestSnapshot(snapshot)
}

export async function saveBacktestSnapshots(snapshots: BacktestSnapshot[]) {
  await storage.saveBacktestSnapshots(snapshots)
}

export async function loadFactors(): Promise<MarketFactor[]> {
  return storage.loadFactors()
}

export async function saveFactors(factors: MarketFactor[]) {
  await storage.saveFactors(factors)
}

export async function loadProviderHealthSnapshots(): Promise<ProviderHealthSnapshot[]> {
  return storage.loadProviderHealthSnapshots()
}

export async function saveProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
  await storage.saveProviderHealthSnapshot(snapshot)
}

export function mergeBacktestSnapshots(
  existing: BacktestSnapshot[],
  incoming: BacktestSnapshot[],
) {
  return normalizeBacktestSnapshots([...existing, ...incoming])
}

function normalizeBacktestSnapshots(snapshots: BacktestSnapshot[]) {
  const merged = new Map<string, BacktestSnapshot>()
  for (const snapshot of snapshots) {
    const timestampMs = new Date(snapshot.quoteTimestamp).getTime()
    if (!Number.isFinite(timestampMs) || !Number.isFinite(snapshot.price) || snapshot.price <= 0) {
      continue
    }
    merged.set(snapshot.quoteTimestamp, snapshot)
  }
  return [...merged.values()]
    .sort((left, right) => new Date(left.quoteTimestamp).getTime() - new Date(right.quoteTimestamp).getTime())
    .slice(-Math.max(2000, BACKTEST_SNAPSHOT_LIMIT))
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): unknown
  }
}

async function openSqliteDatabase(sqliteFile: string): Promise<SqliteDatabase> {
  await mkdir(path.dirname(sqliteFile), { recursive: true })
  const sqlite = await import('node:sqlite') as unknown as {
    DatabaseSync: new (filename: string) => SqliteDatabase
  }
  const db = new sqlite.DatabaseSync(sqliteFile)
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)')
  return db
}

async function writeJsonAtomic(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.tmp`
  await writeFile(
    tempFile,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  )
  await rename(tempFile, filePath)
}
