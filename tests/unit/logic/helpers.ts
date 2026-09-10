// עזרי בדיקה משותפים — מצב ריק, חנות טרייה לכל בדיקה, ותאריך מוצמד.
// store.ts קורא את localStorage בזמן הייבוא ומחזיק סינגלטון, ולכן כל בדיקה
// שרוצה חנות נקייה (או "מכשיר" שני) חייבת vi.resetModules() + import דינמי.
import { vi } from 'vitest'
import type { AppState, CalEvent, DayLog, RecurRule, Task, WeekLog, WorkoutLog } from '../../../src/types'

export const KEY = 'life-os-v1'

export const DEFAULTS = {
  wakeTime: '07:30',
  bedTime: '23:30',
  tokenMinutes: 90,
  dailyTokenGoal: 6,
  weeklyTokenGoal: 42,
  theme: 'system' as const,
  sound: true,
  notifications: false,
  reviewDow: 0,
  reviewLock: true,
  autoSync: true,
  name: '',
  dayStartHour: 6,
  dayEndHour: 24,
  easyWeekend: false,
  easyHoliday: false,
  easyExamDay: false,
}

/** מצב ריק לחלוטין — בלי זרע, בלי כללים, עם מסלול אחד */
export function blankState(over: Partial<AppState> = {}): AppState {
  return {
    version: 1,
    settings: { ...DEFAULTS },
    tracks: [
      { id: 'trk-life', updatedAt: 1, name: 'חיים', emoji: '🌿', color: '#888', order: 0, board: true },
      { id: 'trk-study', updatedAt: 1, name: 'לימודים', emoji: '📘', color: '#e54', order: 1, board: true },
    ],
    tasks: [],
    events: [],
    rules: [],
    sessions: [],
    days: [],
    weeks: [],
    habits: [],
    weekly: [],
    phases: [],
    news: [],
    workoutPlan: [],
    workouts: [],
    timer: null,
    deviceId: 'dtest',
    lastSyncAt: 0,
    settingsUpdatedAt: 0,
    resetAt: 0,
    materializedTo: '2026-01-01',
    // המיגרציות בודקות trk-exams — אין כאן, אז הן לא נוגעות. מסמנים בכל זאת.
    migrations: ['no-easy-days-2026-08', 'morning-news-2026-08'],
    atlasApplied: {},
    ...over,
  }
}

export type StoreModule = typeof import('../../../src/store')

/** חנות טרייה שנטענת מהמצב הנתון (או ריק) */
export async function freshStore(state: AppState | null = blankState()): Promise<StoreModule> {
  vi.resetModules()
  localStorage.clear()
  if (state) localStorage.setItem(KEY, JSON.stringify(state))
  return await import('../../../src/store')
}

export const task = (p: Partial<Task> & { id: string }): Task => ({
  updatedAt: 1,
  title: p.id,
  trackId: 'trk-life',
  status: 'todo',
  order: 0,
  ...p,
})

export const event = (p: Partial<CalEvent> & { id: string; date: string }): CalEvent => ({
  updatedAt: 1,
  title: p.id,
  allDay: true,
  kind: 'personal',
  ...p,
})

export const rule = (p: Partial<RecurRule> & { id: string }): RecurRule => ({
  updatedAt: 1,
  title: p.id,
  kind: 'block',
  start: '10:00',
  end: '11:00',
  days: [0, 1, 2, 3, 4],
  from: '2026-01-01',
  active: true,
  ...p,
})

export const day = (p: Partial<DayLog> & { date: string }): DayLog => ({
  id: `day-${p.date}`,
  updatedAt: 1,
  wake: null,
  habits: {},
  steps: {},
  ...p,
})

export const week = (p: Partial<WeekLog> & { weekStart: string }): WeekLog => ({
  id: `wk-${p.weekStart}`,
  updatedAt: 1,
  items: {},
  progress: {},
  ...p,
})

export const workout = (p: Partial<WorkoutLog> & { date: string }): WorkoutLog => ({
  id: `w-${p.date}`,
  updatedAt: 1,
  title: 'אימון',
  kind: 'gym',
  sets: {},
  ...p,
})

/** בודק רקורסיבית שאין NaN/Infinity בשום מקום */
export function assertFinite(v: unknown, path = '$'): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`מספר לא סופי ב-${path}: ${v}`)
    return
  }
  if (Array.isArray(v)) return v.forEach((x, i) => assertFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) assertFinite(x, `${path}.${k}`)
  }
}

/** רגע קבוע — יום שישי 11.9.2026 בשעה 10:00 מקומית */
export const NOW = new Date(2026, 8, 11, 10, 0, 0).getTime()

export function pin(ms: number = NOW) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(ms)
}

export function tick(ms = 1000) {
  vi.setSystemTime(Date.now() + ms)
}
