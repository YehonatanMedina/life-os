import { useCallback, useSyncExternalStore } from 'react'
import type {
  AppState, CalEvent, DayLog, Exercise, ID, ISODate, NewsRating, Rec, RecurRule, Session, SetLog,
  Task, WeekGoal, WeekLog, WorkoutDay, WorkoutLog,
} from './types'
import { addDays, iso, logicalDate, parseISO, today, weekStart } from './dates'
import { HABITS, RULES, SCHEMA_VERSION, TASKS, TRACKS, WEEKLY, EVENTS, DEFAULT_SETTINGS, seedState, newDeviceId, PHASES } from './seed'

const KEY = 'life-os-v1'
const RESET_KEY = 'life-os-reset-at'
const HORIZON_DAYS = 120

// ---------------------------------------------------------------------------
// עזרי רשומות
// ---------------------------------------------------------------------------
export function uid(prefix = 'x'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export const alive = <T extends Rec>(xs: T[]): T[] => xs.filter((x) => !x.deleted)

/** ה-order הבא ברשימה — מתעלם מרשומות שנמחקו */
export const nextOrder = (xs: Array<{ order: number; deleted?: boolean }>): number =>
  alive(xs as any).reduce((m: number, x: any) => Math.max(m, x.order ?? 0), -1) + 1

function upsertList<T extends Rec>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const next = list.slice()
  next[i] = item
  return next
}

/** מיזוג שתי רשימות רשומות — לכל מזהה מנצחת הרשומה עם updatedAt הגדול יותר */
function mergeList<T extends Rec>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>()
  for (const x of a) map.set(x.id, x)
  for (const x of b) {
    const cur = map.get(x.id)
    // תיקו בחותמת — שובר שוויון דטרמיניסטי, אחרת שני מכשירים מתקנים זה את זה לנצח
    const xa = x.updatedAt || 0
    const ca = cur ? cur.updatedAt || 0 : -1
    if (!cur || xa > ca || (xa === ca && JSON.stringify(x) > JSON.stringify(cur))) map.set(x.id, x)
  }
  return [...map.values()]
}

/**
 * מיזוג מפה לפי מפתח: לכל מפתח בנפרד מנצחת החותמת החדשה יותר.
 * זה מה שמונע ממכשיר אחד למחוק את מה שהשני רשם באותה רשומה — הרגל,
 * צעד בשגרה, פריט שבועי או תרגיל. רשומות ישנות בלי חותמות נופלות חזרה
 * ל-updatedAt של הרשומה, וזה מספיק כדי לאחות מה שכבר נשבר.
 */
type Keyed<T> = { map?: Record<string, T>; at?: Record<string, number>; updatedAt?: number }

function mergeKeyed<T>(a: Keyed<T>, b: Keyed<T>): { map: Record<string, T>; at: Record<string, number> } {
  const stamp = (r: Keyed<T>, k: string) => r.at?.[k] ?? r.updatedAt ?? 0
  const map: Record<string, T> = {}
  const at: Record<string, number> = {}
  // מפתח שיש לו חותמת אבל אין לו ערך הוא מצבה (נמחק) — והיא משתתפת בהכרעה
  const keys = new Set([
    ...Object.keys(a.map ?? {}), ...Object.keys(b.map ?? {}),
    ...Object.keys(a.at ?? {}), ...Object.keys(b.at ?? {}),
  ])
  for (const k of keys) {
    // בדיקת נוכחות ולא בדיקת אמת — הערך false הוא ערך, לא היעדר
    const inA = !!a.map && k in a.map
    const inB = !!b.map && k in b.map
    if (inA && inB) {
      const win = stamp(a, k) >= stamp(b, k) ? a : b
      map[k] = (win.map as Record<string, T>)[k]
      at[k] = stamp(win, k)
      continue
    }
    if (!inA && !inB) {
      // שתי מצבות — שומרים את החדשה
      at[k] = Math.max(a.at?.[k] ?? 0, b.at?.[k] ?? 0)
      continue
    }
    // ערך בצד אחד בלבד. הצד השני מנצח רק עם מצבה מפורשת וחדשה יותר —
    // לא עם updatedAt של הרשומה, אחרת הרגל שסומן רק כאן היה נמחק בגלל נגיעה אחרת שם.
    const have = inA ? a : b
    const tomb = (inA ? b : a).at?.[k]
    const s = stamp(have, k)
    if (tomb !== undefined && tomb > s) {
      at[k] = tomb
      continue
    }
    map[k] = (have.map as Record<string, T>)[k]
    at[k] = s
  }
  return { map, at }
}

function mergeDayLogs(a: DayLog[], b: DayLog[]): DayLog[] {
  const map = new Map<string, DayLog>()
  for (const x of a) map.set(x.id, x)
  for (const y of b) {
    const x = map.get(y.id)
    if (!x) {
      map.set(y.id, y)
      continue
    }
    const newer = (x.updatedAt || 0) >= (y.updatedAt || 0) ? x : y
    const older = newer === x ? y : x
    const h = mergeKeyed<boolean>(
      { map: x.habits, at: x.habitsAt, updatedAt: x.updatedAt },
      { map: y.habits, at: y.habitsAt, updatedAt: y.updatedAt },
    )
    const st = mergeKeyed<boolean>(
      { map: x.steps, at: x.stepsAt, updatedAt: x.updatedAt },
      { map: y.steps, at: y.stepsAt, updatedAt: y.updatedAt },
    )
    map.set(y.id, {
      ...newer,
      habits: h.map,
      habitsAt: h.at,
      steps: st.map,
      stepsAt: st.at,
      sleep: newer.sleep ?? older.sleep,
      wake: newer.wake ?? older.wake,
      wakeTime: newer.wakeTime ?? older.wakeTime,
      workout: newer.workout ?? older.workout,
      nap: newer.nap ?? older.nap,
    })
  }
  return [...map.values()]
}

function mergeWeekLogs(a: WeekLog[], b: WeekLog[]): WeekLog[] {
  const map = new Map<string, WeekLog>()
  for (const x of a) map.set(x.id, x)
  for (const y of b) {
    const x = map.get(y.id)
    if (!x) {
      map.set(y.id, y)
      continue
    }
    const newer = (x.updatedAt || 0) >= (y.updatedAt || 0) ? x : y
    const older = newer === x ? y : x
    const it = mergeKeyed<boolean>(
      { map: x.items, at: x.itemsAt, updatedAt: x.updatedAt },
      { map: y.items, at: y.itemsAt, updatedAt: y.updatedAt },
    )
    const pr = mergeKeyed<number>(
      { map: x.progress, at: x.progressAt, updatedAt: x.updatedAt },
      { map: y.progress, at: y.progressAt, updatedAt: y.updatedAt },
    )
    // מטרות השבוע — לפי מטרה, לא כמערך שלם; הסדר לפי הרשומה החדשה
    const gm = mergeKeyed<WeekGoal>(
      { map: x.goals ? Object.fromEntries(x.goals.map((g) => [g.id, g])) : undefined, at: x.goalsAt, updatedAt: x.updatedAt },
      { map: y.goals ? Object.fromEntries(y.goals.map((g) => [g.id, g])) : undefined, at: y.goalsAt, updatedAt: y.updatedAt },
    )
    const goalOrder = [...new Set([...(newer.goals ?? []).map((g) => g.id), ...Object.keys(gm.map)])]
    const goals = x.goals || y.goals ? goalOrder.filter((id) => id in gm.map).map((id) => gm.map[id]) : undefined
    map.set(y.id, {
      ...newer,
      goals,
      goalsAt: goals ? gm.at : undefined,
      items: it.map,
      itemsAt: it.at,
      progress: pr.map,
      progressAt: pr.at,
      review: newer.review ?? older.review,
      plannedAt: newer.plannedAt ?? older.plannedAt,
    })
  }
  return [...map.values()]
}

/**
 * מיזוג יומן אימון אחד. הסטים של כל תרגיל מתמזגים בנפרד לפי החותמת שלהם,
 * כך ששני מכשירים שרשמו באותו אימון — אחד את המתח והשני את הסקוואט —
 * מקבלים בסוף את שניהם. רשומות ישנות בלי setsAt נופלות חזרה ל-updatedAt
 * של הרשומה, וזה מספיק כדי לאחות אימון שכבר נשבר.
 */
function mergeWorkoutLog(x: WorkoutLog, y: WorkoutLog): WorkoutLog {
  const newer = (x.updatedAt || 0) >= (y.updatedAt || 0) ? x : y
  const older = newer === x ? y : x
  const merged = mergeKeyed<SetLog[]>(
    { map: x.sets, at: x.setsAt, updatedAt: x.updatedAt },
    { map: y.sets, at: y.setsAt, updatedAt: y.updatedAt },
  )
  return {
    ...newer,
    sets: merged.map,
    setsAt: merged.at,
    // מספרים שנרשמו רק בצד אחד לא הולכים לאיבוד
    km: newer.km ?? older.km,
    minutes: newer.minutes ?? older.minutes,
    note: newer.note || older.note,
    finishedAt: newer.finishedAt ?? older.finishedAt,
  }
}

function mergeWorkouts(a: WorkoutLog[], b: WorkoutLog[]): WorkoutLog[] {
  const map = new Map<string, WorkoutLog>()
  for (const x of a) map.set(x.id, x)
  for (const y of b) {
    const x = map.get(y.id)
    map.set(y.id, x ? mergeWorkoutLog(x, y) : y)
  }
  return [...map.values()]
}

export function mergeStates(local: AppState, remote: AppState): AppState {
  // ההגדרות הן אובייקט אחד בלי חותמת לכל שדה, ולכן מנצחת מי שנערכה לאחרונה
  const useRemote =
    (remote.settingsUpdatedAt || 0) > (local.settingsUpdatedAt || 0) && !!remote.settings
  return {
    ...local,
    settings: useRemote ? remote.settings : local.settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt || 0, remote.settingsUpdatedAt || 0),
    tracks: mergeList(local.tracks, remote.tracks || []),
    tasks: mergeList(local.tasks, remote.tasks || []),
    events: mergeList(local.events, remote.events || []),
    rules: mergeList(local.rules, remote.rules || []),
    sessions: mergeList(local.sessions, remote.sessions || []),
    days: mergeDayLogs(local.days, remote.days || []),
    weeks: mergeWeekLogs(local.weeks, remote.weeks || []),
    habits: mergeList(local.habits, remote.habits || []),
    weekly: mergeList(local.weekly, remote.weekly || []),
    phases: mergeList(local.phases, remote.phases || []),
    news: mergeList(local.news || [], remote.news || []),
    workoutPlan: mergeList(local.workoutPlan || [], remote.workoutPlan || []),
    workouts: mergeWorkouts(local.workouts || [], remote.workouts || []),
    // איחוד — פקודה שבוצעה באחד המכשירים בוצעה
    atlasApplied: { ...(remote.atlasApplied || {}), ...(local.atlasApplied || {}) },
    // הטיימר הוא תמיד מקומי — buildDocument מאפס אותו לפני פרסום
    timer: local.timer,
    lastSyncAt: Math.max(local.lastSyncAt || 0, remote.lastSyncAt || 0),
    resetAt: Math.max(local.resetAt || 0, remote.resetAt || 0),
  }
}

// ---------------------------------------------------------------------------
// מופעים חוזרים
// ---------------------------------------------------------------------------
export function ruleEventId(ruleId: ID, date: ISODate): string {
  return `${ruleId}@${date}`
}

/** האם כלל חזרה חל בתאריך נתון — שבועי לפי ימים, חודשי לפי היום בחודש */
export function ruleMatches(r: RecurRule, d: ISODate): boolean {
  const dt = parseISO(d)
  if (r.freq === 'monthly') {
    const want = r.monthDay ?? parseISO(r.from).getDate()
    const lastOfMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
    return dt.getDate() === Math.min(want, lastOfMonth)
  }
  return r.days.includes(dt.getDay())
}

/**
 * מייצר אירועים אמיתיים מכל כלל חזרה פעיל, עד לאופק של 120 יום.
 * המזהה קבוע (rule@date-מקורי) — ולכן גרירה, עריכה או מחיקה של מופע
 * בודד לא תיצור אותו מחדש.
 */
export function materialize(state: AppState): AppState {
  const from = addDays(today(), -14)
  const to = addDays(today(), HORIZON_DAYS)

  // ימי חג מורידים בלוקים של עבודה עמוקה רק כשמתג החגים דלוק.
  // כרגע הוא כבוי — לומדים גם בחג. שגרות אישיות נשארות תמיד.
  const holidays = new Set<ISODate>()
  for (const e of state.settings.easyHoliday ? state.events : []) {
    if (e.deleted || e.kind !== 'holiday' || e.eve) continue
    let d = e.date
    const last = e.endDate ?? e.date
    let g = 0
    while (d <= last && g++ < 40) {
      holidays.add(d)
      d = addDays(d, 1)
    }
  }

  // ניקוי: מופעים חוזרים ישנים מאוד שלא נגעו בהם — כדי שהאחסון לא יתנפח
  const pruneBefore = addDays(today(), -60)
  const deepRules = new Set(state.rules.filter((r) => r.deep).map((r) => r.id))
  let events = state.events.filter(
    (e) =>
      !(e.ruleId && e.date < pruneBefore && !e.touched) &&
      !(e.ruleId && deepRules.has(e.ruleId) && !e.touched && holidays.has(e.date)),
  )
  const pruned = events.length !== state.events.length

  const existing = new Set(events.map((e) => e.id))
  const added: CalEvent[] = []

  for (const rule of state.rules) {
    if (rule.deleted || !rule.active) continue
    let d = rule.from > from ? rule.from : from
    const end = rule.until && rule.until < to ? rule.until : to
    let guard = 0
    while (d <= end && guard++ < 400) {
      if (ruleMatches(rule, d) && !(rule.deep && holidays.has(d))) {
        const id = ruleEventId(rule.id, d)
        if (!existing.has(id)) {
          added.push({
            id,
            updatedAt: 0, // חותמת אפס: כל עריכה של המשתמש תמיד תנצח
            title: rule.title,
            date: d,
            start: rule.start,
            end: rule.end,
            allDay: false,
            kind: rule.kind,
            trackId: rule.trackId,
            notes: rule.notes,
            ruleId: rule.id,
            deep: rule.deep,
          })
          existing.add(id)
        }
      }
      d = addDays(d, 1)
    }
  }

  if (!added.length && !pruned && state.materializedTo === to) return state
  return { ...state, events: [...events, ...added], materializedTo: to }
}

// ---------------------------------------------------------------------------
// טעינה / שמירה
// ---------------------------------------------------------------------------
/**
 * מיגרציות חד־פעמיות. רצות רק על נתונים שכבר קיימים במכשיר, מסומנות
 * ב-migrations כדי לא לרוץ פעמיים, ומוגנות בבדיקת תוכן כדי לא לגעת
 * בהתקנה גנרית חדשה.
 */
const MIGRATIONS: Array<{ id: string; run: (s: AppState) => AppState }> = [
  // שתי המיגרציות של אוגוסט 2026 כבר רצו על כל המכשירים (הרשימה מסונכרנת). הגוף הוסר
  // מהמאגר הציבורי — הוא הכיל תוכן אישי. המזהים נשארים כדי שלא ירוצו שוב.
  { id: 'no-easy-days-2026-08', run: (s) => s },
  { id: 'morning-news-2026-08', run: (s) => s },
]

function applyMigrations(s: AppState): AppState {
  const done = new Set(s.migrations ?? [])
  let out = s
  let changed = false
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    out = m.run(out)
    done.add(m.id)
    changed = true
  }
  return changed ? { ...out, migrations: [...done] } : s
}

/** משלים שדות הגדרות חדשים בלי לגעת בתוכן — התוכן שייך למשתמש */
function fillDefaults(s: AppState): AppState {
  return {
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    phases: s.phases ?? [],
    news: s.news ?? [],
    workoutPlan: s.workoutPlan ?? [],
    workouts: s.workouts ?? [],
    atlasApplied: s.atlasApplied ?? {},
  }
}

/** רק בהתקנה חדשה — אחרת רשומות שנמחקו היו חוזרות לחיים בכל טעינה */
function applySeedAdditions(s: AppState): AppState {
  // מוסיף רשומות זרע חדשות שלא קיימות כלל (כדי שעדכוני גרסה יוסיפו תוכן),
  // אבל לא מחזיר לחיים משהו שהמשתמש מחק.
  const add = <T extends Rec>(cur: T[], seed: T[]): T[] => {
    const have = new Set(cur.map((x) => x.id))
    const extra = seed.filter((x) => !have.has(x.id))
    return extra.length ? [...cur, ...extra.map((x) => ({ ...x }))] : cur
  }
  return {
    ...s,
    tracks: add(s.tracks, TRACKS),
    tasks: add(s.tasks, TASKS),
    events: add(s.events, EVENTS),
    rules: add(s.rules, RULES),
    habits: add(s.habits, HABITS),
    weekly: add(s.weekly, WEEKLY),
    phases: add(s.phases ?? [], PHASES),
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
  }
}

/**
 * מסנן רשומות פגומות (null, בלי id, אירוע בלי תאריך) מכל המערכים.
 * קובץ שנערך ביד או ייבוא חתוך לא אמור להשאיר מסך לבן.
 */
function sanitize(p: any): AppState {
  const ok = (x: any) => !!x && typeof x === 'object' && typeof x.id === 'string' && !!x.id
  const arr = (v: any, extra: (x: any) => boolean = () => true) =>
    Array.isArray(v) ? v.filter((x) => ok(x) && extra(x)) : []
  const isDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  // טיימר עם מספרים לא־מספרים היה מצייר NaN:NaN במקום שעון
  const num = (v: any) => typeof v === 'number' && Number.isFinite(v)
  const sane = (t: any) =>
    t && typeof t === 'object' && num(t.startedAt) && num(t.accumulated) && typeof t.trackId === 'string'
      ? { ...t, targetMinutes: num(t.targetMinutes) && t.targetMinutes > 0 ? t.targetMinutes : 90 }
      : null
  return {
    ...p,
    tracks: arr(p.tracks, (t) => typeof t.name === 'string'),
    tasks: arr(p.tasks, (t) => typeof t.title === 'string'),
    events: arr(p.events, (e) => isDate(e.date)),
    rules: arr(p.rules, (r) => Array.isArray(r.days)),
    habits: arr(p.habits),
    weekly: arr(p.weekly),
    phases: arr(p.phases, (x) => isDate(x.from) && isDate(x.to)),
    sessions: arr(p.sessions, (x) => num(x.minutes) && num(x.endedAt)),
    news: arr(p.news, (n) => isDate(n.date)),
    workoutPlan: arr(p.workoutPlan, (w) => Array.isArray(w.exercises)),
    workouts: arr(p.workouts, (w) => isDate(w.date)),
    timer: sane(p.timer),
    days: arr(p.days, (d) => isDate(d.date)),
    weeks: arr(p.weeks, (w) => isDate(w.weekStart)),
  } as AppState
}

function safeParse(raw: string | null, keepCopy = false): AppState | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !Array.isArray(p.tasks)) throw new Error('shape')
    return sanitize(p)
  } catch {
    // שומרים עותק של מה שלא הצלחנו לקרוא, כדי שאפשר יהיה לשחזר ידנית
    if (keepCopy) {
      try {
        localStorage.setItem('life-os-v1-corrupt', raw)
        console.error('מצב שמור לא ניתן לקריאה — נשמר עותק תחת life-os-v1-corrupt')
      } catch {
        /* ignore */
      }
    }
    return null
  }
}

/**
 * התקנה חדשה לגמרי — לא היה כלום באחסון. במקרה כזה המשיכה הראשונה מהענן
 * מחליפה את תוכן הפתיחה במקום להתמזג איתו, אחרת המסלולים הגנריים היו
 * נערמים על התוכן האמיתי.
 */
let freshInstall = false

const SEED_STAMP = Date.parse('2026-01-01T00:00:00') // T0 של הזרע ב-seed.ts
/**
 * מכשיר "בתולי": רק רשומות זרע (או מופעי כללים בחותמת 0) ואף יומן. במשיכה
 * הראשונה המחסן הוא התמונה — לא תוספת. ההגדרות המקומיות (onboarded וכו')
 * הן ברירות מחדל ולא שוות דריסה של המחסן.
 */
export function isPristine(s: AppState): boolean {
  const lists: Rec[][] = [s.tracks, s.tasks, s.events, s.rules, s.habits, s.weekly, s.phases ?? [], s.workoutPlan ?? [], s.news ?? []]
  const untouched = lists.every((l) => l.every((x) => (x.updatedAt || 0) <= SEED_STAMP))
  return untouched && !s.sessions.length && !s.days.length && !s.weeks.length && !(s.workouts ?? []).length
}

export function consumeFreshInstall(): boolean {
  const v = freshInstall
  freshInstall = false
  return v
}

export function loadState(): AppState {
  let s: AppState | null = null
  try {
    s = safeParse(localStorage.getItem(KEY), true)
  } catch {
    s = null
  }
  if (!s) {
    s = seedState()
    freshInstall = true
  }
  s = applyMigrations(s)
  // הגנות לפני מיזוג הזרע — מצב ישן או פגום לא יפיל את האפליקציה
  for (const k of ['tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits', 'weekly', 'phases', 'news', 'workoutPlan', 'workouts'] as const) {
    if (!Array.isArray((s as any)[k])) (s as any)[k] = []
  }
  s = fillDefaults(s)
  if (!s.deviceId) s.deviceId = newDeviceId()
  if (!s.version) s.version = SCHEMA_VERSION
  s = reconcileTimer(s)
  return materialize(s)
}

/**
 * טיימר שנשאר רץ בזמן שהלשונית הייתה סגורה לא אמור לצבור שעות דמיוניות.
 * מסתמכים על הדופק האחרון: אם הוא ישן מ-3 דקות, הסשן נעצר שם.
 */
/** הקטע הרצוף הארוך ביותר שסביר שבאמת נעבד — הבלוק הארוך ביותר בשגרה הוא 4 שעות */
export const MAX_STRETCH_MIN = 240

function reconcileTimer(s: AppState): AppState {
  const t = s.timer
  if (!t || !t.running) return s
  const seen = t.lastSeen || t.startedAt
  const gapMin = (Date.now() - seen) / 60000
  if (gapMin <= 3) return s
  const worked = t.accumulated + Math.max(0, (seen - t.startedAt) / 60000)
  return {
    ...s,
    timer: { ...t, running: false, accumulated: worked, startedAt: Date.now(), lastSeen: Date.now() },
  }
}

let saveTimer: number | undefined
let persistError = false
const errorListeners = new Set<() => void>()

export function subscribePersistError(l: () => void) {
  errorListeners.add(l)
  return () => {
    errorListeners.delete(l)
  }
}
export function getPersistError() {
  return persistError
}

function persist(s: AppState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
      if (persistError) {
        persistError = false
        errorListeners.forEach((l) => l())
      }
    } catch (e) {
      console.error('שמירה נכשלה', e)
      if (!persistError) {
        persistError = true
        errorListeners.forEach((l) => l())
      }
    }
  }, 250)
}

// ---------------------------------------------------------------------------
// חנות
// ---------------------------------------------------------------------------
type Listener = () => void

class Store {
  state: AppState
  private listeners = new Set<Listener>()

  constructor() {
    this.state = loadState()
    // מה שהתיישר בטעינה (טיימר אחרי שינה, מיגרציה, מופעים חדשים) — לדיסק מיד
    persist(this.state)
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  get = () => this.state

  set = (fn: (s: AppState) => AppState) => {
    const next = fn(this.state)
    if (next === this.state) return
    this.state = next
    persist(next)
    this.listeners.forEach((l) => l())
  }

  /** החלפה מלאה — משמש בייבוא / סנכרון */
  replace = (s: AppState) => {
    // גם מחסן שנערך ביד או גיבוי ישן עוברים את אותו סינון של הטעינה
    this.state = materialize(fillDefaults(sanitize(s)))
    persist(this.state)
    this.listeners.forEach((l) => l())
  }
}

export const store = new Store()

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}


// ---------------------------------------------------------------------------
// פעולות
// ---------------------------------------------------------------------------
const stamp = <T extends Rec>(x: T): T => ({ ...x, updatedAt: Date.now() })

/**
 * משלים חותמת לכל מפתח קיים שאין לו — מה-updatedAt הישן של הרשומה.
 * בלי זה, אחרי נגיעה במפתח אחד ברשומה ישנה, שאר המפתחות נופלים במיזוג
 * ל-updatedAt החדש ודורסים שינוי חדש יותר במכשיר השני.
 */
function backfillAt(
  map: Record<string, unknown> | undefined,
  at: Record<string, number> | undefined,
  fallback: number,
): Record<string, number> {
  const out = { ...(at ?? {}) }
  for (const k of Object.keys(map ?? {})) if (!(k in out)) out[k] = fallback
  return out
}

/**
 * חותמות למפה שעודכנה ב-patch גולמי (בלי מפת חותמות מפורשת): כל מפתח שערכו
 * השתנה מקבל "עכשיו", מפתח שנעלם מקבל מצבה, והשאר נופלים ל-updatedAt הישן.
 * כך גם קריאה ישירה ל-patchDay/patchWeek/patchWorkout לא דורסת את המכשיר השני.
 */
function stampMap(
  curMap: Record<string, unknown> | undefined,
  curAt: Record<string, number> | undefined,
  nextMap: Record<string, unknown> | undefined,
  nextAt: Record<string, number> | undefined,
  oldUpdatedAt: number,
): Record<string, number> | undefined {
  if (nextMap === undefined && nextAt === undefined) return curAt
  const out = backfillAt(curMap, curAt, oldUpdatedAt)
  const now = Date.now()
  if (nextMap) {
    for (const k of Object.keys(nextMap)) {
      const changed = !curMap || !(k in curMap) || JSON.stringify(curMap[k]) !== JSON.stringify(nextMap[k])
      if (changed && !(nextAt && k in nextAt)) out[k] = now
    }
    for (const k of Object.keys(curMap ?? {})) if (!(k in nextMap) && !(nextAt && k in nextAt)) out[k] = now
  }
  return { ...out, ...(nextAt ?? {}) }
}

export const actions = {
  // ---- הגדרות ----
  setSettings(patch: Partial<AppState['settings']>) {
    store.set((s) => ({
      ...s,
      settings: { ...s.settings, ...patch },
      settingsUpdatedAt: Date.now(),
    }))
  },

  // ---- משימות ----
  addTask(partial: Partial<Task> & { title: string; trackId?: ID }) {
    const t: Task = {
      status: 'todo',
      order: nextOrder(store.get().tasks),
      trackId: defaultTrackId(store.get()) ?? '',
      ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)),
      // חייב לבוא אחרי הפריסה — אחרת טיוטה עם id ריק דורסת את המזהה
      id: uid('t'),
      updatedAt: Date.now(),
      createdAt: Date.now(),
    } as Task
    store.set((s) => ({ ...s, tasks: [...s.tasks, t] }))
    return t
  },
  patchTask(id: ID, patch: Partial<Task>) {
    store.set((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    }))
  },
  toggleTaskDone(id: ID) {
    store.set((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === 'done' ? 'todo' : 'done',
              doneAt: t.status === 'done' ? undefined : Date.now(),
              updatedAt: Date.now(),
            }
          : t,
      ),
    }))
  },
  deleteTask(id: ID) {
    store.set((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, deleted: true, updatedAt: Date.now() } : t)),
    }))
  },
  /** הכנסה של משימה עם מזהה נתון — לאטלס, שמזהיו נגזרים מהפקודה */
  putTask(t: Omit<Task, 'updatedAt' | 'order'> & Partial<Pick<Task, 'order'>>) {
    const s = store.get()
    const full = {
      order: nextOrder(s.tasks),
      createdAt: Date.now(),
      ...t,
      trackId: t.trackId || defaultTrackId(s) || '',
      updatedAt: Date.now(),
    } as Task
    store.set((st) => ({ ...st, tasks: upsertList(st.tasks, full) }))
  },
  restoreTask(id: ID) {
    store.set((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, deleted: false, updatedAt: Date.now() } : t)),
    }))
  },

  // ---- אירועים ----
  /** הוספה של הרבה אירועים בבת אחת — כתיבה אחת לחנות במקום אחת לכל שורה */
  addEvents(list: Array<Partial<CalEvent> & { title: string; date: ISODate }>) {
    if (!list.length) return
    const now = Date.now()
    const evs = list.map(
      (partial) =>
        ({
          allDay: false,
          kind: 'personal',
          ...partial,
          id: uid('e'),
          updatedAt: now,
          touched: true,
        }) as CalEvent,
    )
    store.set((s) => ({ ...s, events: [...s.events, ...evs] }))
  },
  addEvent(partial: Partial<CalEvent> & { title: string; date: ISODate }) {
    const e: CalEvent = {
      allDay: false,
      kind: 'personal',
      ...partial,
      // חייב לבוא אחרי הפריסה — אחרת טיוטה עם id ריק דורסת את המזהה
      id: uid('e'),
      updatedAt: Date.now(),
      touched: true,
    } as CalEvent
    store.set((s) => ({ ...s, events: [...s.events, e] }))
    return e
  },
  /** הכנסה של אירוע עם מזהה נתון — לאטלס */
  putEvent(e: Omit<CalEvent, 'updatedAt'>) {
    store.set((s) => ({ ...s, events: upsertList(s.events, { ...e, updatedAt: Date.now() } as CalEvent) }))
  },
  patchEvent(id: ID, patch: Partial<CalEvent>) {
    store.set((s) => ({
      ...s,
      events: s.events.map((e) => (e.id === id ? { ...e, ...patch, touched: true, updatedAt: Date.now() } : e)),
    }))
  },
  deleteEvent(id: ID) {
    // touched — כדי שרענון של הכלל החוזר לא יחזיר מופע שנמחק בכוונה
    store.set((s) => ({
      ...s,
      events: s.events.map((e) =>
        e.id === id ? { ...e, deleted: true, touched: true, updatedAt: Date.now() } : e,
      ),
    }))
  },
  /** מוחק את כל המופעים העתידיים של כלל, ומכבה אותו */
  stopRule(ruleId: ID, fromDate: ISODate) {
    store.set((s) => ({
      ...s,
      rules: s.rules.map((r) => (r.id === ruleId ? { ...r, active: false, updatedAt: Date.now() } : r)),
      events: s.events.map((e) =>
        e.ruleId === ruleId && e.date >= fromDate && !e.touched && !e.deleted
          ? { ...e, deleted: true, updatedAt: Date.now() }
          : e,
      ),
    }))
  },
  upsertRule(r: RecurRule) {
    const from = today()
    store.set((st) => {
      const rules = upsertList(st.rules, stamp(r))
      const now = Date.now()
      const holidays = new Set<string>()
      for (const e of st.settings.easyHoliday ? st.events : []) {
        if (e.deleted || e.kind !== 'holiday' || e.eve) continue
        let hd = e.date
        const last = e.endDate ?? e.date
        let g = 0
        while (hd <= last && g++ < 40) {
          holidays.add(hd)
          hd = addDays(hd, 1)
        }
      }
      const wanted = new Set<string>()
      if (r.active) {
        const to = addDays(from, HORIZON_DAYS)
        const end = r.until && r.until < to ? r.until : to
        let d = r.from > from ? r.from : from
        let guard = 0
        while (d <= end && guard++ < 400) {
          if (ruleMatches(r, d) && !(r.deep && holidays.has(d))) wanted.add(d)
          d = addDays(d, 1)
        }
      }

      // מופעים קיימים של הכלל מהיום והלאה: מרעננים, קוברים או משאירים.
      // אף פעם לא מוחקים באמת — אחרת המכשיר השני היה מחזיר אותם במיזוג.
      const seen = new Set<string>()
      const events = st.events.map((e) => {
        if (e.ruleId !== r.id || e.date < from) return e
        // מה שהמשתמש הזיז או מחק ידנית — לא נוגעים
        if (e.touched) {
          seen.add(e.date)
          return e
        }
        seen.add(e.date)
        if (!wanted.has(e.date)) {
          return e.deleted ? e : { ...e, deleted: true, updatedAt: now }
        }
        return {
          ...e,
          deleted: false,
          title: r.title,
          start: r.start,
          end: r.end,
          kind: r.kind,
          trackId: r.trackId,
          notes: r.notes,
          deep: r.deep,
          updatedAt: now,
        }
      })

      const added: CalEvent[] = []
      for (const d of wanted) {
        if (seen.has(d)) continue
        added.push({
          id: ruleEventId(r.id, d),
          updatedAt: now,
          title: r.title,
          date: d,
          start: r.start,
          end: r.end,
          allDay: false,
          kind: r.kind,
          trackId: r.trackId,
          notes: r.notes,
          ruleId: r.id,
          deep: r.deep,
        })
      }
      return { ...st, rules, events: [...events, ...added] }
    })
  },
  /** מוחק כלל חוזר ואת כל המופעים העתידיים שלו (חוץ ממופעים שהוזזו ידנית) */
  deleteRule(ruleId: ID) {
    const from = today()
    const now = Date.now()
    store.set((st) => ({
      ...st,
      rules: st.rules.map((r) =>
        r.id === ruleId ? { ...r, active: false, deleted: true, updatedAt: now } : r,
      ),
      events: st.events.map((e) =>
        e.ruleId === ruleId && e.date >= from && !e.touched && !e.deleted
          ? { ...e, deleted: true, updatedAt: now }
          : e,
      ),
    }))
  },

  // ---- מסלולים ----
  upsertTrack(t: AppState['tracks'][number]) {
    store.set((s) => ({ ...s, tracks: upsertList(s.tracks, stamp(t)) }))
  },
  deleteTrack(id: ID) {
    store.set((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, deleted: true, updatedAt: Date.now() } : t)),
    }))
  },

  // ---- הרגלים ----
  upsertHabit(h: AppState['habits'][number]) {
    store.set((s) => ({ ...s, habits: upsertList(s.habits, stamp(h)) }))
  },
  deleteHabit(id: ID) {
    store.set((s) => ({
      ...s,
      habits: s.habits.map((h) => (h.id === id ? { ...h, deleted: true, updatedAt: Date.now() } : h)),
    }))
  },
  upsertWeekly(w: AppState['weekly'][number]) {
    store.set((s) => ({ ...s, weekly: upsertList(s.weekly, stamp(w)) }))
  },
  deleteWeekly(id: ID) {
    store.set((s) => ({
      ...s,
      weekly: s.weekly.map((w) => (w.id === id ? { ...w, deleted: true, updatedAt: Date.now() } : w)),
    }))
  },

  // ---- יומן יומי ----
  patchDay(date: ISODate, patch: Partial<DayLog>) {
    store.set((s) => {
      const cur = s.days.find((d) => d.date === date)
      const base: DayLog = cur ?? {
        id: `day-${date}`,
        updatedAt: 0,
        date,
        wake: null,
        habits: {},
        steps: {},
      }
      const habitsAt = stampMap(base.habits, base.habitsAt, patch.habits, patch.habitsAt, base.updatedAt)
      const stepsAt = stampMap(base.steps, base.stepsAt, patch.steps, patch.stepsAt, base.updatedAt)
      return { ...s, days: upsertList(s.days, { ...base, ...patch, habitsAt, stepsAt, updatedAt: Date.now() }) }
    })
  },
  toggleHabit(date: ISODate, habitId: string) {
    const cur = store.get().days.find((d) => d.date === date)
    const val = !(cur?.habits?.[habitId])
    actions.patchDay(date, {
      habits: { ...(cur?.habits ?? {}), [habitId]: val },
      habitsAt: { ...backfillAt(cur?.habits, cur?.habitsAt, cur?.updatedAt ?? 0), [habitId]: Date.now() },
    })
  },
  /** קובע הרגל לערך מסוים (לא מחליף) — לסימון אוטומטי מסיום אימון או מכל השלבים */
  setHabit(date: ISODate, habitId: string, val: boolean, extra: Partial<DayLog> = {}) {
    const cur = store.get().days.find((d) => d.date === date)
    actions.patchDay(date, {
      ...extra,
      habits: { ...(cur?.habits ?? {}), [habitId]: val },
      habitsAt: { ...backfillAt(cur?.habits, cur?.habitsAt, cur?.updatedAt ?? 0), [habitId]: Date.now() },
    })
  },
  toggleStep(date: ISODate, stepId: string) {
    const cur = store.get().days.find((d) => d.date === date)
    const val = !(cur?.steps?.[stepId])
    actions.patchDay(date, {
      steps: { ...(cur?.steps ?? {}), [stepId]: val },
      stepsAt: { ...backfillAt(cur?.steps, cur?.stepsAt, cur?.updatedAt ?? 0), [stepId]: Date.now() },
    })
  },

  // ---- יומן שבועי ----
  patchWeek(ws: ISODate, patch: Partial<WeekLog>) {
    store.set((s) => {
      const cur = s.weeks.find((w) => w.weekStart === ws)
      const base: WeekLog = cur ?? {
        id: `wk-${ws}`,
        updatedAt: 0,
        weekStart: ws,
        items: {},
        progress: {},
      }
      const byId = (g?: WeekGoal[]) => (g ? Object.fromEntries(g.map((x) => [x.id, x])) : undefined)
      const itemsAt = stampMap(base.items, base.itemsAt, patch.items, patch.itemsAt, base.updatedAt)
      const progressAt = stampMap(base.progress, base.progressAt, patch.progress, patch.progressAt, base.updatedAt)
      const goalsAt = stampMap(byId(base.goals), base.goalsAt, byId(patch.goals), patch.goalsAt, base.updatedAt)
      return { ...s, weeks: upsertList(s.weeks, { ...base, ...patch, itemsAt, progressAt, goalsAt, updatedAt: Date.now() }) }
    })
  },
  toggleWeeklyItem(ws: ISODate, itemId: string) {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const val = !(cur?.items?.[itemId])
    actions.patchWeek(ws, {
      items: { ...(cur?.items ?? {}), [itemId]: val },
      itemsAt: { ...backfillAt(cur?.items, cur?.itemsAt, cur?.updatedAt ?? 0), [itemId]: Date.now() },
    })
  },
  // ---- אימונים ----
  /** יוצר או מעדכן יום בתוכנית */
  upsertWorkoutDay(d: WorkoutDay) {
    store.set((s) => ({ ...s, workoutPlan: upsertList(s.workoutPlan ?? [], stamp(d)) }))
  },
  patchWorkoutDay(id: ID, patch: Partial<WorkoutDay>) {
    store.set((s) => ({
      ...s,
      workoutPlan: (s.workoutPlan ?? []).map((d) =>
        d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
      ),
    }))
  },
  deleteWorkoutDay(id: ID) {
    actions.patchWorkoutDay(id, { deleted: true })
  },
  /** מוסיף תרגיל בשורה אחת — השאר נערך אחר כך */
  addExercise(dayId: ID, name: string, partial: Partial<Exercise> = {}): ID {
    const ex: Exercise = { id: uid('ex'), name, sets: 3, reps: '10', metric: 'weight', ...partial }
    store.set((s) => ({
      ...s,
      workoutPlan: (s.workoutPlan ?? []).map((d) =>
        d.id === dayId ? { ...d, exercises: [...d.exercises, ex], updatedAt: Date.now() } : d,
      ),
    }))
    return ex.id
  },
  patchExercise(dayId: ID, exId: ID, patch: Partial<Exercise>) {
    store.set((s) => ({
      ...s,
      workoutPlan: (s.workoutPlan ?? []).map((d) =>
        d.id === dayId
          ? {
              ...d,
              exercises: d.exercises.map((x) => (x.id === exId ? { ...x, ...patch } : x)),
              updatedAt: Date.now(),
            }
          : d,
      ),
    }))
  },
  deleteExercise(dayId: ID, exId: ID) {
    store.set((s) => ({
      ...s,
      workoutPlan: (s.workoutPlan ?? []).map((d) =>
        d.id === dayId
          ? { ...d, exercises: d.exercises.filter((x) => x.id !== exId), updatedAt: Date.now() }
          : d,
      ),
    }))
  },
  /** הזזת תרגיל למעלה או למטה ברשימה */
  moveExercise(dayId: ID, exId: ID, dir: -1 | 1) {
    store.set((s) => ({
      ...s,
      workoutPlan: (s.workoutPlan ?? []).map((d) => {
        if (d.id !== dayId) return d
        const list = [...d.exercises]
        const i = list.findIndex((x) => x.id === exId)
        const j = i + dir
        if (i === -1 || j < 0 || j >= list.length) return d
        ;[list[i], list[j]] = [list[j], list[i]]
        return { ...d, exercises: list, updatedAt: Date.now() }
      }),
    }))
  },

  /** יומן האימון של יום מסוים — נוצר בפעם הראשונה שנוגעים בו */
  patchWorkout(date: ISODate, patch: Partial<WorkoutLog>) {
    store.set((s) => {
      const list = s.workouts ?? []
      const cur = list.find((w) => w.date === date && !w.deleted)
      const base: WorkoutLog = cur ?? {
        id: `w-${date}`,
        updatedAt: 0,
        date,
        title: '',
        kind: 'gym',
        sets: {},
      }
      const setsAt = stampMap(base.sets, base.setsAt, patch.sets, patch.setsAt, base.updatedAt)
      return { ...s, workouts: upsertList(list, { ...base, ...patch, setsAt, updatedAt: Date.now() }) }
    })
  },
  /** רישום סט בודד. null מוחק אותו. */
  setWorkoutSet(date: ISODate, exId: ID, idx: number, val: SetLog | null) {
    const cur = (store.get().workouts ?? []).find((w) => w.date === date && !w.deleted)
    const sets = { ...(cur?.sets ?? {}) }
    const arr = [...(sets[exId] ?? [])]
    while (arr.length < idx) arr.push({})
    if (val === null) arr.splice(idx, 1)
    else arr[idx] = val
    sets[exId] = arr
    // חותמת לתרגיל הזה בלבד — כדי שמכשיר אחר שרשם תרגיל אחר לא יידרס
    const setsAt = { ...backfillAt(cur?.sets, cur?.setsAt, cur?.updatedAt ?? 0), [exId]: Date.now() }
    actions.patchWorkout(date, { sets, setsAt })
  },
  deleteWorkout(date: ISODate) {
    store.set((s) => ({
      ...s,
      workouts: (s.workouts ?? []).map((w) =>
        w.date === date ? { ...w, deleted: true, updatedAt: Date.now() } : w,
      ),
    }))
  },

  /** פקודות של אטלס שבוצעו במכשיר הזה — מצטרף למפה המסונכרנת */
  markAtlasApplied(ids: Record<string, number>) {
    store.set((s) => ({ ...s, atlasApplied: { ...(s.atlasApplied ?? {}), ...ids } }))
  },

  /** מטרות־העל של שבוע. נקבעות בסקירה, מוצגות במסך היום כל השבוע. */
  setWeekGoals(ws: ISODate, goals: WeekGoal[]) {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const now = Date.now()
    const prev = Object.fromEntries((cur?.goals ?? []).map((g) => [g.id, g]))
    // חותמת קיימת לכל מטרה שלא השתנתה, חותמת חדשה למטרה שנוספה או נערכה,
    // ומצבה (חותמת בלי ערך) לכל מטרה שהוסרה — כך ההסרה מנצחת גם בצד השני
    const goalsAt = backfillAt(prev, cur?.goalsAt, cur?.updatedAt ?? 0)
    for (const id of Object.keys(prev)) if (!goals.some((g) => g.id === id)) goalsAt[id] = now
    for (const g of goals) if (JSON.stringify(prev[g.id]) !== JSON.stringify(g)) goalsAt[g.id] = now
    actions.patchWeek(ws, { goals, goalsAt })
  },
  toggleWeekGoal(ws: ISODate, goalId: ID) {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const goals = (cur?.goals ?? []).map((g) => (g.id === goalId ? { ...g, done: !g.done } : g))
    actions.patchWeek(ws, {
      goals,
      goalsAt: { ...backfillAt(Object.fromEntries(goals.map((g) => [g.id, g])), cur?.goalsAt, cur?.updatedAt ?? 0), [goalId]: Date.now() },
    })
  },

  // ---- משוב על החדשות ----
  /** אהבתי / לא אהבתי סיפור. לחיצה שנייה על אותו כפתור מבטלת. */
  rateNewsStory(
    date: ISODate,
    key: string,
    v: 1 | -1,
    meta: { headline: string; section: string },
  ) {
    store.set((s) => {
      const list = s.news ?? []
      const cur = list.find((n) => n.date === date && !n.deleted)
      const votes = { ...(cur?.votes ?? {}) }
      if (votes[key]?.v === v) delete votes[key]
      else votes[key] = { v, headline: meta.headline, section: meta.section }
      const base: NewsRating = cur ?? { id: `news-${date}`, updatedAt: 0, date, votes: {} }
      return { ...s, news: upsertList(list, { ...base, votes, updatedAt: Date.now() }) }
    })
  },
  setNewsNote(date: ISODate, note: string) {
    store.set((s) => {
      const list = s.news ?? []
      const cur = list.find((n) => n.date === date && !n.deleted)
      const base: NewsRating = cur ?? { id: `news-${date}`, updatedAt: 0, date, votes: {} }
      return { ...s, news: upsertList(list, { ...base, note, updatedAt: Date.now() }) }
    })
  },

  /** מחזיר את השינוי שבאמת בוצע (אחרי חסימה באפס) */
  addWeeklyProgress(ws: ISODate, itemId: string, minutes: number): number {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const before = cur?.progress?.[itemId] ?? 0
    const now = Math.max(0, before + minutes)
    actions.patchWeek(ws, {
      progress: { ...(cur?.progress ?? {}), [itemId]: now },
      progressAt: { ...backfillAt(cur?.progress, cur?.progressAt, cur?.updatedAt ?? 0), [itemId]: Date.now() },
    })
    return now - before
  },

  // ---- Deep Work ----
  startTimer(trackId: ID, label = '', targetMinutes?: number) {
    store.set((s) => ({
      ...s,
      timer: {
        running: true,
        startedAt: Date.now(),
        accumulated: 0,
        trackId,
        label,
        targetMinutes: targetMinutes ?? s.settings.tokenMinutes,
        lastSeen: Date.now(),
      },
    }))
  },
  /** מיישר את הטיימר לפי הדופק האחרון — נקרא כשחוזרים ללשונית */
  reconcileNow() {
    store.set((s) => reconcileTimer(s))
  },
  markTimerNotified() {
    store.set((s) => (s.timer && !s.timer.notified ? { ...s, timer: { ...s.timer, notified: true } } : s))
  },
  /**
   * דופק — נקרא כל 20 שניות מה-UI.
   * אם עברו יותר מ-3 דקות מהדופק הקודם (המחשב היה סגור / הלשונית קפאה),
   * לא מקדמים את הדופק אלא עוצרים את הסשן בנקודה האחרונה שבה באמת היינו.
   */
  touchTimer() {
    store.set((s) => {
      const t = s.timer
      if (!t || !t.running) return s
      const seen = t.lastSeen || t.startedAt
      const now = Date.now()
      if (now - seen > 3 * 60000) return reconcileTimer(s)
      // טיימר שנשכח דולק בלשונית פתוחה (קרה: 10.5 שעות על "מבחנים" בלילה): אחרי 4 שעות
      // רצופות משהים ושומרים בדיוק 4 שעות. המשתמש מחליט אם להמשיך, לסיים או לבטל.
      const stretch = (now - t.startedAt) / 60000
      if (stretch >= MAX_STRETCH_MIN) {
        return { ...s, timer: { ...t, running: false, accumulated: t.accumulated + MAX_STRETCH_MIN, startedAt: now, lastSeen: now, autoPaused: 'long' } }
      }
      return { ...s, timer: { ...t, lastSeen: now } }
    })
  },
  pauseTimer() {
    store.set((s) => {
      // אם המחשב ישן — הסשן כבר נעצר בדופק האחרון, לא עכשיו
      const r = reconcileTimer(s)
      if (!r.timer || !r.timer.running) return r
      const add = (Date.now() - r.timer.startedAt) / 60000
      return { ...r, timer: { ...r.timer, running: false, accumulated: r.timer.accumulated + add } }
    })
  },
  resumeTimer() {
    store.set((s) => {
      if (!s.timer || s.timer.running) return s
      const { autoPaused: _ap, ...t } = s.timer
      return { ...s, timer: { ...t, running: true, startedAt: Date.now(), lastSeen: Date.now() } }
    })
  },
  /** מסיים את הסשן ושומר אותו. מחזיר את מספר הדקות. */
  stopTimer(save = true): number {
    // שינה של המחשב לא נספרת כעבודה
    actions.reconcileNow()
    const s = store.get()
    if (!s.timer) return 0
    const t = s.timer
    const total = t.accumulated + (t.running ? (Date.now() - t.startedAt) / 60000 : 0)
    const minutes = Math.round(total)
    if (save && minutes >= 1) {
      const session: Session = {
        id: uid('s'),
        updatedAt: Date.now(),
        startedAt: Date.now() - minutes * 60000,
        endedAt: Date.now(),
        minutes,
        trackId: t.trackId,
        label: t.label,
      }
      store.set((st) => ({ ...st, sessions: [...st.sessions, session], timer: null }))
    } else {
      store.set((st) => ({ ...st, timer: null }))
    }
    return minutes
  },
  addSession(trackId: ID, minutes: number, when: number = Date.now(), label = '') {
    const session: Session = {
      id: uid('s'),
      updatedAt: Date.now(),
      startedAt: when - minutes * 60000,
      endedAt: when,
      minutes,
      trackId,
      label,
      manual: true,
    }
    store.set((s) => ({ ...s, sessions: [...s.sessions, session] }))
    return session
  },
  /**
   * מקצר (או מוחק) את הסשן האחרון היום — לתיקון הקלדה בטעות.
   * label מצמצם לסשנים שנוצרו מאותו מקור בדיוק, כדי שלא נמחק עבודה אחרת.
   */
  trimLastSession(trackId: ID, minutes: number, label?: string) {
    if (minutes <= 0) return
    store.set((s) => {
      const d = today()
      const list = s.sessions
        .filter(
          (x) =>
            !x.deleted &&
            x.trackId === trackId &&
            (label === undefined || x.label === label) &&
            logicalDate(x.endedAt) === d,
        )
        .sort((a, b) => b.endedAt - a.endedAt)
      const last = list[0]
      if (!last) return s
      const left = last.minutes - minutes
      return {
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === last.id
            ? left >= 1
              ? { ...x, minutes: left, updatedAt: Date.now() }
              : { ...x, deleted: true, updatedAt: Date.now() }
            : x,
        ),
      }
    })
  },
  deleteSession(id: ID) {
    store.set((s) => ({
      ...s,
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x)),
    }))
  },

  // ---- כללי ----
  replaceAll(s: AppState) {
    store.replace(s)
  },
  /** בודק ומנרמל קובץ גיבוי לפני ייבוא. מחזיר null אם הוא לא תקין. */
  normalizeImport(raw: any): AppState | null {
    if (!raw || typeof raw !== 'object') return null
    const keys = ['tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits', 'weekly', 'news', 'workoutPlan', 'workouts'] as const
    if (!Array.isArray(raw.tasks) || !Array.isArray(raw.events)) return null
    const out: any = { ...raw }
    for (const k of keys) if (!Array.isArray(out[k])) out[k] = []
    out.settings = { ...DEFAULT_SETTINGS, ...(out.settings ?? {}) }
    out.timer = null
    out.version = SCHEMA_VERSION
    if (!out.deviceId) out.deviceId = newDeviceId()
    if (typeof out.lastSyncAt !== 'number') out.lastSyncAt = 0
    if (typeof out.settingsUpdatedAt !== 'number') out.settingsUpdatedAt = 0
    if (typeof out.materializedTo !== 'string') out.materializedTo = today()
    // רשומות ללא מזהה נזרקות — הן שוברות מיזוג
    for (const k of keys) out[k] = out[k].filter((x: any) => x && typeof x.id === 'string' && x.id.length > 0)
    // אותו סינון כמו בטעינה: כלל בלי ימים, אירוע בלי תאריך, שלב פגום — לא נכנסים
    return sanitize(out)
  },
  resetAll() {
    const now = Date.now()
    try {
      localStorage.removeItem(KEY)
      // מסמנים את רגע האיפוס כדי שתמונת מצב ישנה שמוטמעת בדף לא תחזיר הכל
      localStorage.setItem(RESET_KEY, String(now))
    } catch {
      /* ignore */
    }
    store.replace({ ...seedState(), resetAt: now, lastSyncAt: now })
  },
}

// ---------------------------------------------------------------------------
// סלקטורים
// ---------------------------------------------------------------------------
export function sessionsOn(s: AppState, date: ISODate): Session[] {
  return alive(s.sessions).filter((x) => logicalDate(x.endedAt) === date)
}

export function minutesOn(s: AppState, date: ISODate): number {
  return sessionsOn(s, date).reduce((a, b) => a + b.minutes, 0)
}


export function weekSessions(s: AppState, ws: ISODate): Session[] {
  const we = addDays(ws, 7)
  return alive(s.sessions).filter((x) => {
    const d = logicalDate(x.endedAt)
    return d >= ws && d < we
  })
}

export function weekMinutes(s: AppState, ws: ISODate): number {
  return weekSessions(s, ws).reduce((a, b) => a + b.minutes, 0)
}

export function minutesByTrack(sessions: Session[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of sessions) out[x.trackId] = (out[x.trackId] ?? 0) + x.minutes
  return out
}

export function dayLog(s: AppState, date: ISODate): DayLog {
  return (
    s.days.find((d) => d.date === date) ?? {
      id: `day-${date}`,
      updatedAt: 0,
      date,
      wake: null,
      habits: {},
      steps: {},
    }
  )
}

export function weekLog(s: AppState, ws: ISODate): WeekLog {
  return (
    s.weeks.find((w) => w.weekStart === ws) ?? {
      id: `wk-${ws}`,
      updatedAt: 0,
      weekStart: ws,
      items: {},
      progress: {},
    }
  )
}

export function trackById(s: AppState, id?: ID) {
  const t = s.tracks.find((x) => x.id === id)
  return t && !t.deleted ? t : undefined
}

/** אירועים שרלוונטיים ליום מסוים (כולל רב־יומיים וימי הולדת שנתיים) */
export function eventsOn(s: AppState, date: ISODate): CalEvent[] {
  return alive(s.events).filter((e) => {
    if (e.yearly) {
      if (e.date.slice(5) === date.slice(5)) return true
      // 29 בפברואר מוצג ב-28 בפברואר בשנים שאינן מעוברות
      if (e.date.slice(5) === '02-29' && date.slice(5) === '02-28') {
        const y = Number(date.slice(0, 4))
        return !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)
      }
      return false
    }
    if (e.endDate) return date >= e.date && date <= e.endDate
    return e.date === date
  })
}

/** התאריך הבא שבו האירוע קורה — ליום הולדת חוזר זה המופע הקרוב */
export function nextOccurrence(e: CalEvent, from: ISODate): ISODate {
  if (!e.yearly) return e.date
  const y = Number(from.slice(0, 4))
  const cand = `${y}-${e.date.slice(5)}`
  return cand >= from ? cand : `${y + 1}-${e.date.slice(5)}`
}

export function tasksDueOn(s: AppState, date: ISODate): Task[] {
  return alive(s.tasks).filter((t) => t.due === date && t.status !== 'done')
}

/**
 * קיבולת האסימונים של יום מסוים: אפס בחג מלא, חצי בערב חג, מופחת בשישי־שבת,
 * ומצומצם מאוד ביום מבחן. משמש לפיזור אוטומטי ולטבעת של היום.
 */
export function dayCapacity(s: AppState, date: ISODate): number {
  const { easyWeekend, easyHoliday, easyExamDay, dailyTokenGoal } = s.settings
  const evs = eventsOn(s, date)
  // ציפייה מותאמת שנקבעה על אירוע (טיסה וכדומה) — גוברת על כל הכללים
  const overrides = evs
    .map((e) => e.capacity)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c >= 0)
  if (overrides.length) return Math.min(...overrides)
  const hol = easyHoliday ? evs.filter((e) => e.kind === 'holiday') : []
  // חג מלא = אפס. ערב חג = חצי יום.
  if (hol.some((e) => !e.eve)) return 0
  const d = parseISO(date).getDay()
  let base = easyWeekend && (d === 5 || d === 6)
    ? Math.max(1, Math.round(dailyTokenGoal * 0.6))
    : dailyTokenGoal
  if (hol.length) base = Math.max(1, Math.round(base / 2))
  const exams = easyExamDay ? evs.filter((e) => e.kind === 'exam').length : 0
  // ביום מבחן נשאר קצת זמן, אבל לא יום עבודה
  if (exams) return Math.max(0, Math.min(base, exams >= 2 ? 1 : 2))
  return base
}

/** מסלול ברירת המחדל למשימה חדשה — "חיים" אם קיים, אחרת הראשון שיש */
export function defaultTrackId(s: AppState): ID | undefined {
  const live = alive(s.tracks)
  return live.find((t) => t.id === 'trk-life')?.id ?? live.sort((a, b) => a.order - b.order)[0]?.id
}

/** סך הקיבולת בין שני תאריכים (כולל) — לפי הקיבולת האמיתית של כל יום */
export function capacityBetween(s: AppState, from: ISODate, to: ISODate): number {
  let total = 0
  let d = from
  let guard = 0
  while (d <= to && guard++ < 800) {
    total += dayCapacity(s, d)
    d = addDays(d, 1)
  }
  return total
}

/** האם היום חסום לגמרי לעבודה (חג מלא — לא ערב חג) */
export function isBlockedDay(s: AppState, date: ISODate): boolean {
  return s.settings.easyHoliday && eventsOn(s, date).some((e) => e.kind === 'holiday' && !e.eve)
}

/** סך האסימונים המתוכננים ליום (משימות פתוחות עם תאריך היעד הזה) */
export function plannedOn(s: AppState, date: ISODate): number {
  return alive(s.tasks)
    .filter((t) => t.due === date && t.status !== 'done')
    .reduce((a, t) => a + (t.est ?? 0), 0)
}

/**
 * מפזר משימות על הימים הקרובים בלי לחרוג מהקיבולת היומית.
 * מחזיר את התאריכים הקודמים כדי לאפשר ביטול.
 */
/** האם לפיזור יש בכלל לאן ללכת בטווח הנתון */
export function hasSpreadRoom(fromDate: ISODate, horizon = 21): boolean {
  const s = store.get()
  for (let i = 0; i < horizon; i++) if (dayCapacity(s, addDays(fromDate, i)) > 0) return true
  return false
}

export function spreadTasks(ids: ID[], fromDate: ISODate, horizon = 21): Array<{ id: ID; due?: ISODate }> {
  const s = store.get()
  const before = ids.map((id) => {
    const t = s.tasks.find((x) => x.id === id)
    return { id, due: t?.due }
  })

  // רק ימים שאפשר באמת לעבוד בהם (בלי חגים)
  const days = Array.from({ length: horizon }, (_, i) => addDays(fromDate, i)).filter(
    (d) => dayCapacity(s, d) > 0,
  )
  if (!days.length) return before

  const leftTokens = new Map<ISODate, number>()
  const leftCount = new Map<ISODate, number>()
  // המשימות שמפזרים לא נספרות כעומס קיים ביום שהן יושבות בו עכשיו
  const moving = new Set(ids)
  for (const d of days) {
    const cap = dayCapacity(s, d)
    const others = alive(s.tasks).filter((x) => x.due === d && x.status !== 'done' && !moving.has(x.id))
    leftTokens.set(d, Math.max(0, cap - others.reduce((a, t) => a + (t.est ?? 0), 0)))
    // גם מספר המשימות ליום מוגבל — אחרת כל המשימות בלי הערכת זמן נופלות על היום הראשון
    leftCount.set(d, Math.max(0, cap + 2 - others.length))
  }

  const tasks = ids
    .map((id) => s.tasks.find((x) => x.id === id))
    .filter((t): t is Task => !!t)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))

  for (const t of tasks) {
    const need = Math.max(0, t.est ?? 0)
    let target =
      days.find((d) => (leftTokens.get(d) ?? 0) >= need && (leftCount.get(d) ?? 0) > 0) ?? null
    // אם באמת אין מקום — ליום הכי פנוי מבין ימי העבודה
    if (!target) {
      target = days.reduce(
        (best, d) => ((leftTokens.get(d) ?? -99) > (leftTokens.get(best) ?? -99) ? d : best),
        days[0],
      )
    }
    leftTokens.set(target, (leftTokens.get(target) ?? 0) - need)
    leftCount.set(target, (leftCount.get(target) ?? 0) - 1)
    actions.patchTask(t.id, { due: target })
  }
  return before
}

/** אחוז השלמת הרגלים ליום */
export function habitPct(s: AppState, date: ISODate): number {
  const habits = alive(s.habits)
  if (!habits.length) return 0
  const log = dayLog(s, date)
  const done = habits.filter((h) => log.habits[h.id]).length
  return done / habits.length
}

/** האם תזכורת מחזורית (מצעים) פעילה השבוע */
export function periodicDue(def: { everyDays?: number; anchorDate?: ISODate }, ws: ISODate): boolean {
  if (!def.everyDays || def.everyDays <= 7 || !def.anchorDate) return true
  const anchorWs = weekStart(def.anchorDate)
  const diffWeeks = Math.round((parseISO(ws).getTime() - parseISO(anchorWs).getTime()) / 86400000 / 7)
  if (diffWeeks < 0) return false
  const periodWeeks = Math.max(1, Math.round(def.everyDays / 7))
  return diffWeeks % periodWeeks === 0
}


// ---------------------------------------------------------------------------
// אימונים
// ---------------------------------------------------------------------------
/** יום התוכנית של יום בשבוע מסוים */
export function planForDow(s: AppState, dow: number): WorkoutDay | undefined {
  return alive(s.workoutPlan ?? []).find((d) => d.dow === dow)
}

export function workoutOn(s: AppState, date: ISODate): WorkoutLog | undefined {
  return (s.workouts ?? []).find((w) => w.date === date && !w.deleted)
}

/** האם נרשם משהו באימון הזה — סט אחד, קילומטר אחד או דקה אחת */
export function workoutHasData(w?: WorkoutLog): boolean {
  if (!w) return false
  if (w.km || w.minutes) return true
  return Object.values(w.sets ?? {}).some((arr) => arr.some((x) => x && (x.kg || x.reps || x.sec)))
}

/**
 * ניקוד של סט — כדי שאפשר יהיה להשוות בין סטים ולצייר מגמה.
 * במשקל (כולל תוספת על משקל גוף) המשקל קובע והחזרות שוברות שוויון:
 * 47.5×9 חזק מ-45×10, ו-0×10 חזק מ-0×8.
 */
export function setScore(v: SetLog | undefined, metric: string): number {
  if (!v) return 0
  if (metric === 'time') return v.sec ?? 0
  if (metric === 'reps') return v.reps ?? 0
  return (v.kg ?? 0) + (v.reps ?? 0) / 100
}

/** הסט הטוב ביותר בקבוצת סטים, לפי אופן המדידה */
export function bestSet(sets: SetLog[] | undefined, metric: string): SetLog | undefined {
  if (!sets?.length) return undefined
  return sets
    .filter((x) => x && (x.kg || x.reps || x.sec))
    .sort((a, b) => setScore(b, metric) - setScore(a, metric))[0]
}

/** כל הפעמים שתרגיל מסוים בוצע, מהישן לחדש */
export function exerciseHistory(
  s: AppState,
  exId: ID,
): Array<{ date: ISODate; sets: SetLog[] }> {
  return (s.workouts ?? [])
    .filter((w) => !w.deleted && w.sets?.[exId]?.some((x) => x && (x.kg || x.reps || x.sec)))
    .map((w) => ({ date: w.date, sets: w.sets[exId].filter((x) => x && (x.kg || x.reps || x.sec)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** מה עשית בפעם הקודמת בתרגיל הזה (לא כולל היום) */
export function lastSetsOf(s: AppState, exId: ID, before: ISODate): { date: ISODate; sets: SetLog[] } | undefined {
  const h = exerciseHistory(s, exId).filter((x) => x.date < before)
  return h[h.length - 1]
}
