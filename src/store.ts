import { useCallback, useSyncExternalStore } from 'react'
import type {
  AppState, CalEvent, DayLog, ID, ISODate, Rec, RecurRule, Session, Task, WeekLog,
} from './types'
import { addDays, iso, parseISO, today, weekStart } from './dates'
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
    if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) map.set(x.id, x)
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
    days: mergeList(local.days, remote.days || []),
    weeks: mergeList(local.weeks, remote.weeks || []),
    habits: mergeList(local.habits, remote.habits || []),
    weekly: mergeList(local.weekly, remote.weekly || []),
    phases: mergeList(local.phases, remote.phases || []),
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
      const dowN = parseISO(d).getDay()
      if (rule.days.includes(dowN) && !(rule.deep && holidays.has(d))) {
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
  {
    // 28.8: אין ויתורים — לומדים גם בחגים וגם בימי מבחן. שלושת הבלוקים של
    // החברה במקום פריט אחד, וטיסה 29.9–6.10 ביומן.
    id: 'no-easy-days-2026-08',
    run: (s) => {
      const mine = s.tracks.some((t) => t.id === 'trk-exams' && !t.deleted)
      if (!mine) return s
      const now = Date.now()
      let weekly = s.weekly
      const gf = weekly.find((w) => w.id === 'wk-gf' && !w.deleted)
      if (gf) {
        const base = gf.order
        weekly = weekly.map((w) => (w.id === 'wk-gf' ? { ...w, deleted: true, updatedAt: now } : w))
        weekly = [
          ...weekly,
          { id: 'wk-gf-talk', updatedAt: now, name: 'דיברתי איתה', emoji: '💬', order: base, kind: 'check' as const, group: 'gf' },
          { id: 'wk-gf-fun', updatedAt: now, name: 'עשיתי איתה', emoji: '💛', order: base + 0.1, kind: 'check' as const, group: 'gf' },
          { id: 'wk-gf-init', updatedAt: now, name: 'יזמתי איתה', emoji: '✨', order: base + 0.2, kind: 'check' as const, group: 'gf' },
        ]
      }
      let events = s.events
      if (!events.some((e) => e.id === 'ev-flight-2610')) {
        events = [
          ...events,
          {
            id: 'ev-flight-2610', updatedAt: now, title: 'טיסה ✈️', date: '2026-09-29',
            endDate: '2026-10-06', allDay: true, kind: 'personal' as const,
            notes: 'לא ידוע כמה אפשר יהיה לעבוד — נחיה ונראה. אם תרצה ציפייה מותאמת לימים האלה, קבע "קיבולת ליום" מתוך עריכת האירוע.',
          },
        ]
      }
      return {
        ...s,
        weekly,
        events,
        settings: { ...s.settings, easyHoliday: false, easyExamDay: false },
        settingsUpdatedAt: Date.now(),
      }
    },
  },
  {
    // 28.8: שלב אחרון בשגרת הבוקר — לקרוא חדשות
    id: 'morning-news-2026-08',
    run: (s) => {
      if (!s.tracks.some((t) => t.id === 'trk-exams' && !t.deleted)) return s
      const now = Date.now()
      return {
        ...s,
        habits: s.habits.map((h) => {
          if (h.id !== 'hb-morning' || h.deleted) return h
          const steps = h.steps ?? []
          if (steps.some((x) => x.text.includes('חדשות'))) return h
          return { ...h, steps: [...steps, { id: 'hm-news', text: 'לקרוא חדשות' }], updatedAt: now }
        }),
      }
    },
  },
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
  return { ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings }, phases: s.phases ?? [] }
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
    tracks: arr(p.tracks),
    tasks: arr(p.tasks),
    events: arr(p.events, (e) => isDate(e.date)),
    rules: arr(p.rules, (r) => Array.isArray(r.days)),
    habits: arr(p.habits),
    weekly: arr(p.weekly),
    phases: arr(p.phases, (x) => isDate(x.from) && isDate(x.to)),
    sessions: arr(p.sessions),
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
  for (const k of ['tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits', 'weekly', 'phases'] as const) {
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
    this.state = materialize(fillDefaults(s))
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
          if (r.days.includes(parseISO(d).getDay()) && !(r.deep && holidays.has(d))) wanted.add(d)
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
      return { ...s, days: upsertList(s.days, { ...base, ...patch, updatedAt: Date.now() }) }
    })
  },
  toggleHabit(date: ISODate, habitId: string) {
    const cur = store.get().days.find((d) => d.date === date)
    const val = !(cur?.habits?.[habitId])
    actions.patchDay(date, { habits: { ...(cur?.habits ?? {}), [habitId]: val } })
  },
  toggleStep(date: ISODate, stepId: string) {
    const cur = store.get().days.find((d) => d.date === date)
    const val = !(cur?.steps?.[stepId])
    actions.patchDay(date, { steps: { ...(cur?.steps ?? {}), [stepId]: val } })
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
      return { ...s, weeks: upsertList(s.weeks, { ...base, ...patch, updatedAt: Date.now() }) }
    })
  },
  toggleWeeklyItem(ws: ISODate, itemId: string) {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const val = !(cur?.items?.[itemId])
    actions.patchWeek(ws, { items: { ...(cur?.items ?? {}), [itemId]: val } })
  },
  /** מחזיר את השינוי שבאמת בוצע (אחרי חסימה באפס) */
  addWeeklyProgress(ws: ISODate, itemId: string, minutes: number): number {
    const cur = store.get().weeks.find((w) => w.weekStart === ws)
    const before = cur?.progress?.[itemId] ?? 0
    const now = Math.max(0, before + minutes)
    actions.patchWeek(ws, { progress: { ...(cur?.progress ?? {}), [itemId]: now } })
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
      if (Date.now() - seen > 3 * 60000) return reconcileTimer(s)
      return { ...s, timer: { ...t, lastSeen: Date.now() } }
    })
  },
  pauseTimer() {
    store.set((s) => {
      if (!s.timer || !s.timer.running) return s
      const add = (Date.now() - s.timer.startedAt) / 60000
      return { ...s, timer: { ...s.timer, running: false, accumulated: s.timer.accumulated + add } }
    })
  },
  resumeTimer() {
    store.set((s) => {
      if (!s.timer || s.timer.running) return s
      return { ...s, timer: { ...s.timer, running: true, startedAt: Date.now(), lastSeen: Date.now() } }
    })
  },
  /** מסיים את הסשן ושומר אותו. מחזיר את מספר הדקות. */
  stopTimer(save = true): number {
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
            iso(new Date(x.endedAt)) === d,
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
    const keys = ['tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits', 'weekly'] as const
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
    return out as AppState
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
  return alive(s.sessions).filter((x) => iso(new Date(x.endedAt)) === date)
}

export function minutesOn(s: AppState, date: ISODate): number {
  return sessionsOn(s, date).reduce((a, b) => a + b.minutes, 0)
}


export function weekSessions(s: AppState, ws: ISODate): Session[] {
  const we = addDays(ws, 7)
  return alive(s.sessions).filter((x) => {
    const d = iso(new Date(x.endedAt))
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
  for (const d of days) {
    const cap = dayCapacity(s, d)
    leftTokens.set(d, Math.max(0, cap - plannedOn(s, d)))
    // גם מספר המשימות ליום מוגבל — אחרת כל המשימות בלי הערכת זמן נופלות על היום הראשון
    const open = alive(s.tasks).filter((x) => x.due === d && x.status !== 'done').length
    leftCount.set(d, Math.max(0, cap + 2 - open))
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

