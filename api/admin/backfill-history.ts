import type { VercelRequest, VercelResponse } from '@vercel/node'

import {
  backfillHistory,
  type BackfillInputPoint,
} from '../../apps/server/src/history-backfill.js'
import {
  loadHistory,
  saveHistory,
} from '../../apps/server/src/storage.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({
      success: false,
      error: 'method_not_allowed',
    })
    return
  }

  if (!isAuthorizedAdminRequest(request)) {
    response.status(401).json({
      success: false,
      error: 'unauthorized',
    })
    return
  }

  try {
    const body = parseBody(request.body)
    const points = resolveInputPoints(body)
    const existing = await loadHistory()
    const result = backfillHistory(existing, points, {
      maxPoints: normalizeInteger(body.maxPoints, undefined),
      windowHours: normalizeInteger(body.windowHours, undefined),
    })
    await saveHistory(result.history)

    response.status(200).json({
      success: true,
      data: {
        accepted: result.accepted,
        rejected: result.rejected,
        beforeCount: result.beforeCount,
        afterCount: result.afterCount,
        firstTimestamp: result.firstTimestamp,
        lastTimestamp: result.lastTimestamp,
        rejectedReasons: result.rejectedReasons,
        storage: process.env.STORAGE_ADAPTER ?? (
          process.env.POSTGRES_HTTP_URL ? 'postgres' : 'file'
        ),
      },
    })
  } catch (error) {
    response.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function isAuthorizedAdminRequest(request: VercelRequest) {
  const secret = process.env.BACKFILL_SECRET ?? process.env.CRON_SECRET
  if (!secret) {
    return process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1'
  }

  const authorization = request.headers.authorization
  if (authorization === `Bearer ${secret}`) {
    return true
  }

  const headerSecret = request.headers['x-backfill-secret'] ?? request.headers['x-cron-secret']
  if (headerSecret === secret) {
    return true
  }

  return request.query.secret === secret
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>
  }
  if (body && typeof body === 'object') {
    return body as Record<string, unknown>
  }
  throw new Error('请求体必须是 JSON。')
}

function resolveInputPoints(body: Record<string, unknown>): BackfillInputPoint[] {
  const points = body.points ?? body.history
  if (!Array.isArray(points)) {
    throw new Error('请求体必须包含 points 或 history 数组。')
  }
  return points as BackfillInputPoint[]
}

function normalizeInteger(value: unknown, fallback: number | undefined) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
