import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { HistoryPoint } from './types.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(currentDir, '../data')
const HISTORY_FILE = path.join(DATA_DIR, 'gold-history.json')

type PersistedHistory = {
  updatedAt: string
  history: HistoryPoint[]
}

export async function loadHistory(): Promise<HistoryPoint[]> {
  try {
    const raw = await readFile(HISTORY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as PersistedHistory
    return Array.isArray(parsed.history) ? parsed.history : []
  } catch {
    return []
  }
}

export async function saveHistory(history: HistoryPoint[]) {
  await mkdir(DATA_DIR, { recursive: true })
  const tempFile = `${HISTORY_FILE}.tmp`
  await writeFile(
    tempFile,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), history }, null, 2)}\n`,
    'utf8',
  )
  await rename(tempFile, HISTORY_FILE)
}
