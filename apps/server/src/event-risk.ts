import type {
  EconomicEvent,
  EconomicEventCategory,
  EconomicEventImportance,
  EconomicEventRisk,
  EventIntelligenceItem,
  EventIntelligenceResponse,
  EventIntelligenceSourceBoundary,
} from './types.js'

const MINUTE_MS = 60 * 1000

type ConfiguredEconomicEvent = {
  id?: string
  label?: string
  category?: EconomicEventCategory
  importance?: EconomicEventImportance
  scheduledAt?: string
  sourceUrl?: string
}

export function buildEconomicEventRisk(timestamp: string, configuredEvents = loadConfiguredEvents()): EconomicEventRisk {
  const nowMs = new Date(timestamp).getTime()
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now()
  const allEvents = [...configuredEvents, ...buildEstimatedMacroEvents(new Date(safeNowMs))]
    .filter((event) => Number.isFinite(new Date(event.scheduledAt).getTime()))
    .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime())
  const windowed = allEvents
    .map((event) => ({
      ...event,
      minutesToEvent: Math.round((new Date(event.scheduledAt).getTime() - safeNowMs) / MINUTE_MS),
    }))
    .filter((event) => event.minutesToEvent >= -120 && event.minutesToEvent <= 180)
    .sort((left, right) => Math.abs(left.minutesToEvent) - Math.abs(right.minutesToEvent))
  const activeEvent = windowed[0] ?? null
  const upcomingEvents = allEvents
    .map((event) => ({
      ...event,
      minutesToEvent: Math.round((new Date(event.scheduledAt).getTime() - safeNowMs) / MINUTE_MS),
    }))
    .filter((event) => event.minutesToEvent >= 0 && event.minutesToEvent <= 48 * 60)
    .slice(0, 5)

  if (!activeEvent) {
    return {
      level: upcomingEvents.length > 0 ? 'watch' : 'none',
      phase: 'normal',
      scorePenalty: upcomingEvents.length > 0 ? 2 : 0,
      scoreCap: 100,
      positionMultiplier: upcomingEvents.length > 0 ? 0.85 : 1,
      activeEvent: null,
      upcomingEvents,
      summary: upcomingEvents.length > 0
        ? `未来 48 小时有 ${upcomingEvents.length} 个宏观事件，当前不在核心事件风控窗口。`
        : '当前未落入重大宏观事件风控窗口。',
      warnings: upcomingEvents.length > 0 ? ['接近事件日时，策略会提前压低追单和仓位。'] : [],
      updatedAt: new Date(safeNowMs).toISOString(),
    }
  }

  const phase = eventPhase(activeEvent.minutesToEvent)
  const severity = eventSeverity(activeEvent.importance, phase)
  return {
    level: severity.level,
    phase,
    scorePenalty: severity.scorePenalty,
    scoreCap: severity.scoreCap,
    positionMultiplier: severity.positionMultiplier,
    activeEvent,
    upcomingEvents,
    summary: buildEventSummary(activeEvent, phase, severity.level),
    warnings: buildEventWarnings(activeEvent, phase),
    updatedAt: new Date(safeNowMs).toISOString(),
  }
}

export function buildEventIntelligenceResponse(
  timestamp: string,
  configuredEvents = loadConfiguredEvents(),
): EventIntelligenceResponse {
  const risk = buildEconomicEventRisk(timestamp, configuredEvents)
  const safeNowMs = Number.isFinite(new Date(timestamp).getTime())
    ? new Date(timestamp).getTime()
    : Date.now()
  const allEvents = [
    ...(risk.activeEvent ? [risk.activeEvent] : []),
    ...risk.upcomingEvents,
    ...buildEventObservationWatchlist(new Date(safeNowMs), configuredEvents),
  ]
  const uniqueEvents = new Map<string, EconomicEvent & { minutesToEvent: number }>()
  for (const event of allEvents) {
    uniqueEvents.set(event.id, event)
  }
  const items = Array.from(uniqueEvents.values())
    .sort((left, right) => Math.abs(left.minutesToEvent) - Math.abs(right.minutesToEvent))
    .map((event) => toEventIntelligenceItem(event, risk))

  return {
    version: 'event-intelligence-v4',
    generatedAt: new Date().toISOString(),
    current: risk,
    activeItem: risk.activeEvent ? toEventIntelligenceItem(risk.activeEvent, risk) : null,
    items,
    sourceBoundaries: buildSourceBoundaries(),
    summary: risk.summary,
    usageBoundary: '事件智能仅用于风控、等待确认和仓位折减；configured 可进入生产风控，estimated 只能作为估算提醒，rss 与 mirror 当前只作观察/学习证据，不放大交易信号。',
    warnings: [
      ...risk.warnings,
      '未配置真实日历时，NFP/CPI/PCE/FOMC 为常规发布时间估算，不代表官方最终发布时间。',
      'RSS 新闻与镜像学习信号不得替代可交易报价源或真实事件日历。',
    ],
  }
}

function buildEventObservationWatchlist(
  now: Date,
  configuredEvents: EconomicEvent[],
): Array<EconomicEvent & { minutesToEvent: number }> {
  const safeNowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now()
  const horizonMinutes = 14 * 24 * 60
  return [...configuredEvents, ...buildEstimatedMacroEvents(new Date(safeNowMs))]
    .map((event) => ({
      ...event,
      minutesToEvent: Math.round((new Date(event.scheduledAt).getTime() - safeNowMs) / MINUTE_MS),
    }))
    .filter((event) => event.minutesToEvent >= 0 && event.minutesToEvent <= horizonMinutes)
    .sort((left, right) => left.minutesToEvent - right.minutesToEvent)
    .slice(0, 6)
}

function loadConfiguredEvents(): EconomicEvent[] {
  const raw = process.env.ECONOMIC_EVENT_CALENDAR_JSON
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as ConfiguredEconomicEvent[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((item, index) => normalizeConfiguredEvent(item, index))
  } catch {
    return []
  }
}

function toEventIntelligenceItem(
  event: EconomicEvent & { minutesToEvent: number },
  currentRisk: EconomicEventRisk,
): EventIntelligenceItem {
  const phase = eventPhase(event.minutesToEvent)
  const severity = eventSeverity(event.importance, phase)
  const isActive = currentRisk.activeEvent?.id === event.id
  const boundary = sourceBoundary(event.source)
  return {
    ...event,
    phase,
    riskLevel: isActive ? currentRisk.level : severity.level,
    scorePenalty: isActive ? currentRisk.scorePenalty : severity.scorePenalty,
    scoreCap: isActive ? currentRisk.scoreCap : severity.scoreCap,
    positionMultiplier: isActive ? currentRisk.positionMultiplier : severity.positionMultiplier,
    sourceUsage: boundary.sourceUsage,
    sourceBoundary: boundary.summary,
    isProductionEligible: boundary.isProductionEligible,
    warnings: buildEventWarnings(event, phase),
  }
}

function buildSourceBoundaries(): EventIntelligenceSourceBoundary[] {
  return (['configured', 'estimated', 'rss', 'mirror'] as const).map(sourceBoundary)
}

function sourceBoundary(source: EconomicEvent['source']): EventIntelligenceSourceBoundary {
  const boundaries: Record<EconomicEvent['source'], EventIntelligenceSourceBoundary> = {
    configured: {
      source: 'configured',
      sourceUsage: 'production_calendar',
      isProductionEligible: true,
      participatesInScoring: true,
      summary: '人工/环境变量配置的明确事件时间，可进入事件风控评分与仓位折减。',
    },
    estimated: {
      source: 'estimated',
      sourceUsage: 'estimation_only',
      isProductionEligible: false,
      participatesInScoring: true,
      summary: '基于常规发布时间生成的估算窗口，只用于提前提醒和保守降级，不能视为官方日历。',
    },
    rss: {
      source: 'rss',
      sourceUsage: 'news_watch_only',
      isProductionEligible: false,
      participatesInScoring: false,
      summary: '新闻/RSS 只作为事件感知线索，不参与强提醒放大或独立交易评分。',
    },
    mirror: {
      source: 'mirror',
      sourceUsage: 'mirror_learning',
      isProductionEligible: false,
      participatesInScoring: false,
      summary: '离线镜像/历史学习信号只用于复盘和证据解释，不作为实时生产触发器。',
    },
  }
  return boundaries[source]
}

function normalizeConfiguredEvent(item: ConfiguredEconomicEvent, index: number): EconomicEvent[] {
  if (!item.scheduledAt || !item.label) {
    return []
  }
  const scheduledAtMs = new Date(item.scheduledAt).getTime()
  if (!Number.isFinite(scheduledAtMs)) {
    return []
  }
  return [{
    id: item.id ?? `configured-event-${index}`,
    label: item.label,
    category: item.category ?? 'liquidity',
    importance: item.importance ?? 'A',
    scheduledAt: new Date(scheduledAtMs).toISOString(),
    source: 'configured',
    sourceUrl: item.sourceUrl,
  }]
}

function buildEstimatedMacroEvents(now: Date): EconomicEvent[] {
  const events: EconomicEvent[] = []
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  for (let monthOffset = -1; monthOffset <= 2; monthOffset += 1) {
    const cursor = new Date(Date.UTC(year, month + monthOffset, 1))
    events.push(estimatedEvent(cursor, 'nfp', '非农就业 NFP 常规发布窗口（估算）', 'jobs', 'S', firstWeekday(cursor, 5), 13, 30))
    events.push(estimatedEvent(cursor, 'cpi', '美国 CPI 通胀数据常规发布窗口（估算）', 'inflation', 'S', nthWeekday(cursor, 3, 2), 13, 30))
    events.push(estimatedEvent(cursor, 'pce', '美国核心 PCE 通胀数据常规发布窗口（估算）', 'inflation', 'S', lastWeekday(cursor, 5), 13, 30))
    events.push(estimatedEvent(cursor, 'fomc-watch', 'FOMC/美联储讲话常规风险窗口（估算）', 'fed', 'A', nthWeekday(cursor, 3, 3), 18, 0))
  }
  return events
}

function estimatedEvent(
  monthDate: Date,
  key: string,
  label: string,
  category: EconomicEventCategory,
  importance: EconomicEventImportance,
  day: number,
  hour: number,
  minute: number,
): EconomicEvent {
  const scheduledAt = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), day, hour, minute))
  return {
    id: `estimated-${key}-${scheduledAt.toISOString().slice(0, 10)}`,
    label,
    category,
    importance,
    scheduledAt: scheduledAt.toISOString(),
    source: 'estimated',
  }
}

function eventPhase(minutesToEvent: number): EconomicEventRisk['phase'] {
  if (minutesToEvent >= 0) {
    return 'pre_event'
  }
  if (minutesToEvent >= -30) {
    return 'post_first_wave'
  }
  if (minutesToEvent >= -120) {
    return 'post_confirmation'
  }
  return 'normal'
}

function eventSeverity(importance: EconomicEventImportance, phase: EconomicEventRisk['phase']) {
  const base = importance === 'S' ? 1 : importance === 'A' ? 0.72 : 0.45
  const phaseWeight = phase === 'pre_event' ? 1 : phase === 'post_first_wave' ? 0.9 : phase === 'post_confirmation' ? 0.55 : 0
  const risk = base * phaseWeight
  if (risk >= 0.88) {
    return { level: 'critical' as const, scorePenalty: 16, scoreCap: 56, positionMultiplier: 0.25 }
  }
  if (risk >= 0.62) {
    return { level: 'elevated' as const, scorePenalty: 10, scoreCap: 64, positionMultiplier: 0.45 }
  }
  if (risk > 0) {
    return { level: 'watch' as const, scorePenalty: 5, scoreCap: 72, positionMultiplier: 0.65 }
  }
  return { level: 'none' as const, scorePenalty: 0, scoreCap: 100, positionMultiplier: 1 }
}

function buildEventSummary(
  event: EconomicEvent & { minutesToEvent: number },
  phase: EconomicEventRisk['phase'],
  level: EconomicEventRisk['level'],
) {
  const phaseText = phase === 'pre_event'
    ? `距离事件约 ${event.minutesToEvent} 分钟`
    : phase === 'post_first_wave'
      ? `事件后第一波 ${Math.abs(event.minutesToEvent)} 分钟`
      : `事件后确认窗口 ${Math.abs(event.minutesToEvent)} 分钟`
  const sourceText = event.source === 'configured' ? '真实配置日历' : '常规发布时间估算'
  return `${event.label}，${phaseText}，${sourceText}，风险等级 ${level}。`
}

function buildEventWarnings(event: EconomicEvent & { minutesToEvent: number }, phase: EconomicEventRisk['phase']) {
  const base = event.importance === 'S'
    ? 'S级事件容易造成黄金急涨急跌、假突破和滑点。'
    : '事件窗口波动和流动性不稳定，信号需要降级。'
  return [
    base,
    phase === 'pre_event'
      ? '事件前不追第一波，只允许观察或极轻仓等待确认。'
      : phase === 'post_first_wave'
        ? '事件后第一波不直接放大强信号，先等回踩/反抽验证真假突破。'
        : phase === 'post_confirmation'
          ? '事件后进入二次确认期，仍需降低仓位并扩大容错。'
          : '当前不在核心事件风控窗口，临近事件时再提高等待确认要求。',
  ]
}

function firstWeekday(monthDate: Date, weekday: number) {
  return nthWeekday(monthDate, weekday, 1)
}

function nthWeekday(monthDate: Date, weekday: number, nth: number) {
  const firstDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)).getUTCDay()
  const delta = (weekday - firstDay + 7) % 7
  return 1 + delta + (nth - 1) * 7
}

function lastWeekday(monthDate: Date, weekday: number) {
  const last = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0))
  const delta = (last.getUTCDay() - weekday + 7) % 7
  return last.getUTCDate() - delta
}
