// ---------------------------------------------------------------------------
// מצב פתיחה לבדיקות הענן — הזרע של האפליקציה ועליו כמה רשומות ידועות
// (משימה, אירוע, יום אימון עם שני תרגילים) כדי שאפשר יהיה לזהות אותן
// בממשק ובמחסן. תאריכים לפי היום הלוגי של האפליקציה (מתחלף ב-03:30,
// באזור הזמן של הדפדפן בבדיקות — Asia/Jerusalem).
// ---------------------------------------------------------------------------
import { seedState } from '../../../src/seed'
import type { AppState, CalEvent, Task, WorkoutDay } from '../../../src/types'

export const TZ = 'Asia/Jerusalem'

export function ilDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}
export function ilTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))
}
/** היום הלוגי — כמו today() ב-src/dates.ts */
export function logicalToday(ms: number = Date.now()): string {
  return ilDate(ms - 210 * 60_000)
}
export function addDaysISO(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function dowISO(s: string): number {
  return new Date(s + 'T12:00:00Z').getUTCDay()
}
export function weekStartISO(s: string): string {
  return addDaysISO(s, -dowISO(s))
}

export const SEED_TASK_ID = 'tk-seed'
export const SEED_TASK_TITLE = 'משימה קיימת מהזרע'
export const SEED_EVENT_ID = 'ev-seed'
export const SEED_EVENT_TITLE = 'אירוע שאטלס ימחק'
export const PLAN_DAY_ID = 'wd-today'
export const PLAN_DAY_TITLE = 'אימון בדיקה'
export const EX_A = 'ex-a'
export const EX_A_NAME = 'סקוואט בדיקה'
export const EX_B = 'ex-b'
export const EX_B_NAME = 'לחיצת חזה בדיקה'

/** חותמת "אתמול" — חדשה מהזרע (2026-01-01) וישנה מכל מה שהבדיקה תעשה */
export const T1 = Date.now() - 86_400_000

export function baseState(opts: { deviceId: string; aiKey?: string; extra?: Partial<AppState> } ): AppState {
  const today = logicalToday()
  const s = seedState()
  const task: Task = {
    id: SEED_TASK_ID, updatedAt: T1, createdAt: T1, title: SEED_TASK_TITLE, trackId: 'trk-study',
    status: 'todo', due: today, order: 0, est: 1,
  }
  const event: CalEvent = {
    id: SEED_EVENT_ID, updatedAt: T1, title: SEED_EVENT_TITLE, date: today, start: '12:00', end: '13:00',
    allDay: false, kind: 'personal', touched: true,
  }
  const day: WorkoutDay = {
    id: PLAN_DAY_ID, updatedAt: T1, dow: dowISO(today), title: PLAN_DAY_TITLE, kind: 'gym',
    exercises: [
      { id: EX_A, name: EX_A_NAME, sets: 3, reps: '8', metric: 'weight' },
      { id: EX_B, name: EX_B_NAME, sets: 3, reps: '8', metric: 'weight' },
    ],
  }
  return {
    ...s,
    settings: { ...s.settings, onboarded: true, reviewLock: false, ...(opts.aiKey ? { aiKey: opts.aiKey } : {}) },
    settingsUpdatedAt: T1,
    tasks: [task],
    events: [event],
    workoutPlan: [day],
    migrations: ['no-easy-days-2026-08', 'morning-news-2026-08'],
    atlasApplied: {},
    deviceId: opts.deviceId,
    lastSyncAt: T1,
    ...(opts.extra ?? {}),
  }
}
