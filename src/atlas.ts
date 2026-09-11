// ---------------------------------------------------------------------------
// אטלס — הערוץ בין האפליקציה לסוכן.
//
// איך זה עובד: הודעה שלו נכתבת כ-Issue מוצפן במאגר הפרטי. הסוכן מתעורר
// מהאירוע, קורא את ההקשר המוצפן מהמחסן, חושב, ומחזיר תשובה לתוך thread.json
// (מוצפן) יחד עם פקודות — שינויים שהאפליקציה מבצעת אצלה. האפליקציה מושכת
// את thread.json כל כמה שניות כשמחכים לתשובה, ומדי כמה דקות בשאר הזמן.
//
// הכל מוצפן במפתח הניתוח (settings.aiKey), שיושב גם בפרומפט הפרטי של
// הסוכן — כך שבשום קובץ ובשום מאגר אין טקסט גלוי.
//
// פקודה מבוצעת פעם אחת בלבד בכל המכשירים: המזהים של הרשומות שנוצרות
// נגזרים ממזהה הפקודה (ולכן שני מכשירים שביצעו במקביל יוצרים אותה רשומה),
// ורשימת הפקודות שבוצעו מסונכרנת יחד עם שאר המצב.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'
import { actions, alive, store } from './store'
import { decryptEnvelope, encryptText } from './crypto'
import { aiKey } from './ai'
import { cloudConfigured, hasPulledOnce, nudgePush } from './cloud'
import { today } from './dates'
import type { CalEvent, Exercise, ID, RecurRule, Task, WeekGoal, WorkoutDay } from './types'

const TOKEN_KEY = 'life-os-gh-token'
const LOGIN_KEY = 'life-os-gh-login'
const CACHE_KEY = 'life-os-atlas-cache'
const REPO_NAME = 'life-os-atlas'

// -- טיפוסים -----------------------------------------------------------------
export type AtlasCommand = { id: string; op: string } & Record<string, any>

export interface AtlasMessage {
  id: string
  at: string
  from: 'user' | 'atlas'
  text: string
  commands?: AtlasCommand[]
  replyTo?: string
  /** רק מקומית: נשלחה ועדיין אין תשובה */
  pending?: boolean
  /** רק מקומית: השליחה נכשלה — אפשר לנסות שוב */
  failed?: boolean
}

export interface AtlasToday {
  date: string
  text: string
  generatedAt?: string
}

interface AtlasCache {
  messages: AtlasMessage[]
  today: AtlasToday | null
  /** ETag של thread.json — כדי שמשיכה בלי שינוי לא תעלה כלום במכסה */
  threadEtag?: string
  todayEtag?: string
  /** מה שבוצע ואפשר לבטל: מזהה פקודה -> איך מחזירים */
  undo: Record<string, UndoEntry>
  /** פקודות שנכשלו: מזהה -> הסיבה — כדי שהצ׳יפ יגיד "לא בוצע" ולא ייראה כהצלחה */
  failed?: Record<string, string>
  lastPollAt?: number
  error?: string
}

type UndoEntry =
  | { kind: 'event' | 'task' | 'rule' | 'workoutDay' | 'track'; id: ID; prev: any | null; patch?: Record<string, unknown> }
  | { kind: 'exercise'; dayId: ID; id: ID; prev: Exercise | null; index?: number }
  | { kind: 'weekGoals'; ws: string; prev: WeekGoal[] | undefined }
  | { kind: 'settings'; prev: Record<string, unknown>; patch?: Record<string, unknown> }

/**
 * ביטול של עדכון: מחזירים רק שדות שהפקודה שינתה ושעדיין מחזיקים את הערך שהיא
 * כתבה. שדה שהמשתמש ערך אחר כך (כאן או במכשיר אחר) נשאר שלו.
 */
function revertPatch(current: Record<string, any>, prev: Record<string, any>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) {
    if (JSON.stringify(current[k]) === JSON.stringify(patch[k])) out[k] = prev[k]
  }
  return out
}
/** הרשומה אחרי הביטול — שדה שהפקודה הוסיפה ושלא היה קודם נמחק, לא נשאר כ-undefined */
function reverted<T extends Record<string, any>>(current: T, prev: Record<string, any>, patch: Record<string, unknown>): T {
  const next: Record<string, any> = { ...current, ...revertPatch(current, prev, patch) }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  next.deleted = !!next.deleted
  return next as T
}

// -- מצב מקומי ------------------------------------------------------------------
let cache: AtlasCache = load()
const listeners = new Set<() => void>()

function load(): AtlasCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const c = JSON.parse(raw)
      return { messages: [], today: null, undo: {}, ...c }
    }
  } catch {
    /* ignore */
  }
  return { messages: [], today: null, undo: {} }
}
function save(next: Partial<AtlasCache>) {
  cache = { ...cache, ...next }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const get = () => cache

export function useAtlas(): AtlasCache {
  return useSyncExternalStore(subscribe, get, get)
}

/** האם יש חיבור לערוץ — טוקן ומפתח */
export function atlasReady(): boolean {
  return !!token() && !!aiKey(store.get())
}

function token(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

// -- GitHub -----------------------------------------------------------------------
const gh = (path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') =>
  fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

/** המאגר הפרטי שייך למי שהטוקן שייך לו — לא כתוב בקוד */
async function repo(): Promise<string> {
  let login = ''
  try {
    login = localStorage.getItem(LOGIN_KEY) ?? ''
  } catch {
    /* ignore */
  }
  if (!login) {
    const r = await gh('/user')
    if (!r.ok) throw new Error(`user ${r.status}`)
    login = (await r.json()).login
    try {
      localStorage.setItem(LOGIN_KEY, login)
    } catch {
      /* ignore */
    }
  }
  return `${login}/${REPO_NAME}`
}

async function readFile(name: string, etag?: string): Promise<{ status: number; text?: string; etag?: string }> {
  const r = await gh(
    `/repos/${await repo()}/contents/${name}`,
    { headers: etag ? { 'If-None-Match': etag } : {}, cache: 'no-store' },
    'application/vnd.github.raw+json',
  )
  if (r.status === 304) return { status: 304 }
  if (!r.ok) return { status: r.status }
  return { status: 200, text: await r.text(), etag: r.headers.get('etag') ?? undefined }
}

// -- שליחה ----------------------------------------------------------------------
export function newMessageId(): string {
  return `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * שולח הודעה לאטלס. ההודעה מופיעה מיד בשיחה כ"ממתינה", ונסגרת כשהתשובה
 * מגיעה. אם השליחה נכשלת — נשארת עם סימון ואפשר לשלוח שוב.
 */
export async function sendToAtlas(text: string, source: 'text' | 'voice' = 'text'): Promise<boolean> {
  const clean = text.trim()
  if (!clean) return false
  const s = store.get()
  const key = aiKey(s)
  if (!key || !token()) {
    save({ error: 'אין חיבור לאטלס — צריך את קישור ההתקנה מהמחשב.' })
    return false
  }
  const msg: AtlasMessage = { id: newMessageId(), at: new Date().toISOString(), from: 'user', text: clean, pending: true }
  save({ messages: [...cache.messages, msg], error: undefined })
  // ההקשר במחסן צריך להיות טרי לפני שהסוכן קורא אותו
  nudgePush()
  return retrySend(msg.id)
}

export async function retrySend(id: string): Promise<boolean> {
  const msg = cache.messages.find((m) => m.id === id)
  if (!msg) return false
  const key = aiKey(store.get())
  try {
    const body = await encryptText(
      JSON.stringify({ id: msg.id, at: msg.at, text: msg.text, source: 'app' }),
      key,
    )
    const r = await gh(`/repos/${await repo()}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: msg.id, body }),
    })
    if (!r.ok) throw new Error(`issue ${r.status}`)
    save({
      messages: cache.messages.map((m) => (m.id === id ? { ...m, pending: true, failed: false } : m)),
      error: undefined,
    })
    // מיד אחרי שליחה — משיכה צפופה
    pollSoon()
    return true
  } catch (e) {
    save({
      messages: cache.messages.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)),
      error: 'השליחה נכשלה. בדוק רשת ונסה שוב.',
    })
    return false
  }
}

export function discardMessage(id: string) {
  save({ messages: cache.messages.filter((m) => m.id !== id) })
}

// -- משיכה ----------------------------------------------------------------------
let polling = false
let fastUntil = 0
let timer: number | undefined

/**
 * מתי הסריקה הבאה של אטלס בענן (כל שעה בדקה 20, בין 07:00 ל-24:00 שעון ישראל).
 * ה-webhook עונה מהר יותר כשהוא פעיל; זה הגבול העליון הכן להצגה למשתמש.
 */
export function nextSweepAt(now: number = Date.now()): Date {
  const d = new Date(now)
  d.setSeconds(0, 0)
  if (d.getMinutes() >= 20) d.setHours(d.getHours() + 1)
  d.setMinutes(20)
  if (d.getHours() < 7) d.setHours(7, 20, 0, 0)
  if (d.getHours() > 23) {
    d.setDate(d.getDate() + 1)
    d.setHours(7, 20, 0, 0)
  }
  return d
}

/** יש הודעה שעדיין מחכה לתשובה? */
export function awaitingReply(): boolean {
  return cache.messages.some((m) => m.from === 'user' && m.pending)
}

function pollSoon() {
  fastUntil = Date.now() + 15 * 60_000
  void pollAtlas()
}

/** מושך את השיחה ואת פתק הבוקר. מחזיר true אם משהו השתנה. */
export async function pollAtlas(): Promise<boolean> {
  if (polling || !atlasReady() || !navigator.onLine) return false
  polling = true
  let changed = false
  try {
    const key = aiKey(store.get())
    const th = await readFile('thread.json', cache.threadEtag)
    if (th.status === 200 && th.text) {
      const plain = await decryptEnvelope(th.text, key)
      const remote = JSON.parse(plain) as { messages?: unknown }
      const merged = mergeThread(cache.messages, remote?.messages)
      save({ messages: merged, threadEtag: th.etag, lastPollAt: Date.now(), error: undefined })
      changed = true
      applyWhenSafe(merged)
    } else if (th.status === 304 || th.status === 404) {
      save({ lastPollAt: Date.now(), error: undefined })
      // השיחה במטמון עשויה להכיל פקודות שעוד לא בוצעו (מטמון שנשמר לפני הסנכרון)
      if (th.status === 304 && cache.messages.length) applyWhenSafe(cache.messages)
    } else if (th.status === 401 || th.status === 403) {
      save({ error: 'אין גישה למאגר של אטלס — הטוקן פג או חסר הרשאה.' })
    }

    const td = await readFile('today.json', cache.todayEtag)
    if (td.status === 200 && td.text) {
      const note = JSON.parse(await decryptEnvelope(td.text, key)) as AtlasToday
      save({ today: note, todayEtag: td.etag })
      changed = true
    }
  } catch (e) {
    save({ error: 'לא הצלחתי לקרוא את אטלס: ' + String((e as Error)?.message ?? e) })
  } finally {
    polling = false
  }
  return changed
}

/**
 * השיחה מהמאגר היא האמת. מה שנשאר מקומי: הודעות שלו שעדיין לא הגיעו לשם
 * (ממתינות או נכשלו).
 */
const isMsg = (m: any): m is AtlasMessage =>
  !!m && typeof m === 'object' && typeof m.id === 'string' && (m.from === 'user' || m.from === 'atlas') && typeof m.text === 'string'

function mergeThread(local: AtlasMessage[], remoteRaw: unknown): AtlasMessage[] {
  // רק הודעות תקינות, ובלי כפילויות — הראשונה לכל מזהה
  const seen = new Set<string>()
  const remote: AtlasMessage[] = []
  for (const m of Array.isArray(remoteRaw) ? remoteRaw : []) {
    if (!isMsg(m) || seen.has(m.id)) continue
    seen.add(m.id)
    remote.push({ ...m, at: typeof m.at === 'string' ? m.at : new Date(Number(m.at) || 0).toISOString(), pending: false })
  }
  const answered = new Set(remote.filter((m) => m.replyTo).map((m) => m.replyTo))
  const oldest = remote.length >= 80 ? Math.min(...remote.map((m) => Date.parse(m.at) || 0)) : 0
  const extra = local
    .filter((m) => isMsg(m) && m.from === 'user' && !seen.has(m.id) && !answered.has(m.id))
    // הודעה שישנה מכל חלון השיחה במאגר כבר לא באמת ממתינה — הסוכן חתך אותה
    .map((m) => (m.pending && oldest && (Date.parse(m.at) || 0) < oldest ? { ...m, pending: false } : m))
  const out = [...remote, ...extra]
  // לפי זמן אמיתי, לא לפי המחרוזת — ISO עם אזורי זמן שונים לא ממוין לקסיקוגרפית
  return out.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0)).slice(-120)
}

/** מתחיל את המשיכה התקופתית — מהאפליקציה */
export function startAtlas() {
  if (timer) return
  const tick = () => {
    flushDeferred()
    const waiting = awaitingReply()
    const fast = Date.now() < fastUntil || waiting
    const gap = fast ? 10_000 : 5 * 60_000
    // ברקע מושכים רק כשמחכים לתשובה — כדי שהיא תחכה מוכנה כשהוא חוזר,
    // וכדי שפקודות יבוצעו גם אם החלון ממוזער. הדפדפן ממילא מאט טיימרים ברקע.
    const visible = document.visibilityState === 'visible'
    if ((visible || waiting) && Date.now() - (cache.lastPollAt ?? 0) >= gap - 500) void pollAtlas()
  }
  timer = window.setInterval(tick, 5_000)
  const onBack = () => {
    if (document.visibilityState === 'visible') void pollAtlas()
  }
  document.addEventListener('visibilitychange', onBack)
  window.addEventListener('focus', onBack)
  window.setTimeout(() => void pollAtlas(), 2500)
}

// -- ביצוע פקודות -------------------------------------------------------------------
/**
 * פקודות מבוצעות רק אחרי שמצב המחסן (עם atlasApplied) התמזג — אחרת פקודה
 * שבוטלה במכשיר אחר תבוצע כאן מחדש, תהיה חדשה מהמחיקה, ותנצח במיזוג.
 * השיחה עצמה מוצגת מיד; הביצוע נדחה עד המשיכה הראשונה.
 */
let deferred = false
function applyWhenSafe(messages: AtlasMessage[]) {
  if (cloudConfigured() && !hasPulledOnce()) {
    deferred = true
    return
  }
  deferred = false
  applyPending(messages)
}
/** נקרא מהטיק — מבצע מה שנדחה ברגע שהמחסן דיבר */
function flushDeferred() {
  if (deferred && (!cloudConfigured() || hasPulledOnce())) applyWhenSafe(cache.messages)
}
/** מזהה רשומה שנגזר ממזהה הפקודה — אותו מזהה בכל מכשיר */
const derived = (prefix: string, cmd: AtlasCommand) => `${prefix}-${cmd.id}`

function applyPending(messages: AtlasMessage[]) {
  const s = store.get()
  const done = s.atlasApplied ?? {}
  const undo: Record<string, UndoEntry> = { ...cache.undo }
  const failed: Record<string, string> = { ...(cache.failed ?? {}) }
  const applied: Record<string, number> = {}
  for (const m of messages) {
    if (m.from !== 'atlas' || !m.commands?.length) continue
    for (const c of m.commands) {
      if (!c?.id || done[c.id] || applied[c.id]) continue
      try {
        const u = applyCommand(c)
        if (u) undo[c.id] = u
        applied[c.id] = Date.now()
      } catch (e) {
        console.error('atlas command failed', c, e)
        // מסמנים כבוצעה כדי שלא תרוץ שוב ושוב בכל משיכה
        applied[c.id] = Date.now()
        failed[c.id] = String((e as Error)?.message ?? e)
      }
    }
  }
  if (Object.keys(applied).length) {
    actions.markAtlasApplied(applied)
    // מנקים ביטולים ישנים — 200 אחרונים
    const keys = Object.keys(undo)
    for (const k of keys.slice(0, Math.max(0, keys.length - 1000))) delete undo[k]
    const fkeys = Object.keys(failed)
    for (const k of fkeys.slice(0, Math.max(0, fkeys.length - 1000))) delete failed[k]
    save({ undo, failed })
  }
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const strip = (o: Record<string, any>) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined))

function applyCommand(c: AtlasCommand): UndoEntry | null {
  const s = store.get()
  switch (c.op) {
    case 'addEvent': {
      const id = c.event?.id || derived('e', c)
      if (s.events.some((e) => e.id === id)) return null
      const ev = strip(c.event)
      // אירוע בלי תאריך תקין היה חי בזיכרון עד הרענון ומפיל כל מסך שמצייר אותו
      if (!isDate(ev.date) || typeof ev.title !== 'string' || !ev.title) throw new Error('addEvent: bad date/title')
      if (ev.endDate !== undefined && !isDate(ev.endDate)) delete ev.endDate
      actions.putEvent({ allDay: false, kind: 'personal', ...ev, id, touched: true } as CalEvent)
      return { kind: 'event', id, prev: null }
    }
    case 'patchEvent': {
      const prev = s.events.find((e) => e.id === c.eventId)
      if (!prev) throw new Error('event not found')
      const patch = strip(c.patch)
      if (patch.date !== undefined && !isDate(patch.date)) throw new Error('patchEvent: bad date')
      actions.patchEvent(c.eventId, patch)
      // patchEvent מסמן touched — גם זה חלק מהשינוי שהביטול מחזיר
      return { kind: 'event', id: c.eventId, prev, patch: { ...patch, touched: true } }
    }
    case 'deleteEvent': {
      const prev = s.events.find((e) => e.id === c.eventId)
      if (!prev) throw new Error('event not found')
      actions.deleteEvent(c.eventId)
      return { kind: 'event', id: c.eventId, prev }
    }
    case 'addRule': {
      const id = c.rule?.id || derived('rl', c)
      if (s.rules.some((r) => r.id === id)) return null
      const rl = strip(c.rule)
      const isHM = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
      if (typeof rl.title !== 'string' || !rl.title.trim() || !isHM(rl.start) || !isHM(rl.end)) throw new Error('addRule: bad title/times')
      if (rl.days !== undefined && !(Array.isArray(rl.days) && rl.days.every((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))) throw new Error('addRule: bad days')
      if (rl.from !== undefined && !isDate(rl.from)) delete rl.from
      if (rl.freq !== 'monthly' && !(rl.days as unknown[] | undefined)?.length) throw new Error('addRule: no days')
      if (rl.freq === 'monthly' && !(Number.isInteger(rl.monthDay) && rl.monthDay >= 1 && rl.monthDay <= 31)) throw new Error('addRule: bad monthDay')
      const r = {
        active: true,
        days: [],
        kind: 'block',
        from: today(),
        ...rl,
        id,
        updatedAt: Date.now(),
      } as unknown as RecurRule
      actions.upsertRule(r)
      return { kind: 'rule', id, prev: null }
    }
    case 'patchRule': {
      const prev = s.rules.find((r) => r.id === c.ruleId)
      if (!prev) throw new Error('rule not found')
      const patch = strip(c.patch)
      actions.upsertRule({ ...prev, ...patch, id: prev.id })
      return { kind: 'rule', id: prev.id, prev, patch }
    }
    case 'deleteRule': {
      const prev = s.rules.find((r) => r.id === c.ruleId)
      if (!prev) throw new Error('rule not found')
      actions.deleteRule(c.ruleId)
      return { kind: 'rule', id: c.ruleId, prev }
    }
    case 'addTask': {
      const id = c.task?.id || derived('t', c)
      if (s.tasks.some((t) => t.id === id)) return null
      const tk = strip(c.task)
      if (typeof tk.title !== 'string' || !tk.title.trim()) throw new Error('addTask: no title')
      if (tk.due !== undefined && !isDate(tk.due)) throw new Error('addTask: bad due')
      actions.putTask({ status: 'todo', ...tk, id } as Task)
      return { kind: 'task', id, prev: null }
    }
    case 'patchTask': {
      const prev = s.tasks.find((t) => t.id === c.taskId)
      if (!prev) throw new Error('task not found')
      const patch = strip(c.patch)
      if (typeof patch.title === 'string' && !patch.title.trim()) delete patch.title
      if (patch.due !== undefined && !isDate(patch.due)) throw new Error('patchTask: bad due')
      if (patch.status === 'done' && prev.status !== 'done') patch.doneAt = Date.now()
      actions.patchTask(c.taskId, patch)
      return { kind: 'task', id: c.taskId, prev, patch }
    }
    case 'deleteTask': {
      const prev = s.tasks.find((t) => t.id === c.taskId)
      if (!prev) throw new Error('task not found')
      actions.deleteTask(c.taskId)
      return { kind: 'task', id: c.taskId, prev }
    }
    case 'setWeekGoals': {
      const ws = c.weekStart
      const prev = s.weeks.find((w) => w.weekStart === ws)?.goals
      const goals: WeekGoal[] = (c.goals ?? []).map((g: any, i: number) => {
        const id = g.id || `${derived('g', c)}-${i}`
        // שליחה חוזרת של אותה מטרה לא מוחקת סימון שכבר נעשה
        return { id, text: String(g.text ?? ''), trackId: g.trackId, done: prev?.find((x) => x.id === id)?.done }
      })
      actions.setWeekGoals(ws, goals)
      return { kind: 'weekGoals', ws, prev }
    }
    case 'addWorkoutDay': {
      const id = c.day?.id || derived('wd', c)
      if ((s.workoutPlan ?? []).some((d) => d.id === id)) return null
      const wd = strip(c.day)
      if (!Number.isInteger(wd.dow) || wd.dow < 0 || wd.dow > 6 || typeof wd.title !== 'string') throw new Error('addWorkoutDay: bad day')
      const day: WorkoutDay = {
        kind: 'gym',
        title: '',
        dow: 0,
        ...wd,
        id,
        updatedAt: Date.now(),
        exercises: (c.day?.exercises ?? []).map((x: any, i: number) => ({
          metric: 'weight',
          ...strip(x),
          id: x.id || `${derived('ex', c)}-${i}`,
        })),
      } as WorkoutDay
      actions.upsertWorkoutDay(day)
      return { kind: 'workoutDay', id, prev: null }
    }
    case 'patchWorkoutDay': {
      const prev = (s.workoutPlan ?? []).find((d) => d.id === c.dayId)
      if (!prev) throw new Error('day not found')
      const patch = strip(c.patch)
      actions.patchWorkoutDay(c.dayId, patch)
      return { kind: 'workoutDay', id: c.dayId, prev, patch }
    }
    case 'deleteWorkoutDay': {
      const prev = (s.workoutPlan ?? []).find((d) => d.id === c.dayId)
      if (!prev) throw new Error('day not found')
      actions.deleteWorkoutDay(c.dayId)
      return { kind: 'workoutDay', id: c.dayId, prev }
    }
    case 'addExercise': {
      const day = (s.workoutPlan ?? []).find((d) => d.id === c.dayId)
      if (!day) throw new Error('day not found')
      const id = c.exercise?.id || derived('ex', c)
      if (day.exercises.some((x) => x.id === id)) return null
      const { name, ...rest } = strip(c.exercise)
      actions.addExercise(c.dayId, String(name ?? ''), { metric: 'weight', ...rest, id })
      return { kind: 'exercise', dayId: c.dayId, id, prev: null }
    }
    case 'patchExercise': {
      const day = (s.workoutPlan ?? []).find((d) => d.id === c.dayId)
      const prev = day?.exercises.find((x) => x.id === c.exerciseId)
      if (!prev) throw new Error('exercise not found')
      actions.patchExercise(c.dayId, c.exerciseId, strip(c.patch))
      return { kind: 'exercise', dayId: c.dayId, id: c.exerciseId, prev, index: day!.exercises.indexOf(prev) }
    }
    case 'deleteExercise': {
      const day = (s.workoutPlan ?? []).find((d) => d.id === c.dayId)
      const prev = day?.exercises.find((x) => x.id === c.exerciseId)
      if (!prev) throw new Error('exercise not found')
      actions.deleteExercise(c.dayId, c.exerciseId)
      return { kind: 'exercise', dayId: c.dayId, id: c.exerciseId, prev, index: day!.exercises.indexOf(prev) }
    }
    case 'setSettings': {
      const patch = strip(c.patch)
      const allowed = ['wakeTime', 'bedTime', 'dailyTokenGoal', 'weeklyTokenGoal', 'tokenMinutes', 'name', 'reviewDow']
      const NUM = ['dailyTokenGoal', 'weeklyTokenGoal', 'tokenMinutes', 'reviewDow']
      // רק מפתחות מותרים, ורק מהטיפוס הנכון — "6" או NaN היו הופכים את הקיבולת ל-NaN
      const RANGE: Record<string, [number, number]> = { dailyTokenGoal: [1, 24], weeklyTokenGoal: [1, 168], tokenMinutes: [10, 240], reviewDow: [0, 6] }
      const okVal = (k: string, v: unknown) =>
        NUM.includes(k)
          ? typeof v === 'number' && Number.isFinite(v) && v >= RANGE[k][0] && v <= RANGE[k][1]
          : k === 'wakeTime' || k === 'bedTime'
            ? typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
            : typeof v === 'string'
      const safe = Object.fromEntries(Object.entries(patch).filter(([k, v]) => allowed.includes(k) && okVal(k, v)))
      if (!Object.keys(safe).length) throw new Error('setSettings: nothing valid')
      const prev = Object.fromEntries(Object.keys(safe).map((k) => [k, (s.settings as any)[k]]))
      actions.setSettings(safe)
      return { kind: 'settings', prev, patch: safe }
    }
    case 'addTrack': {
      const id = c.track?.id || derived('tr', c)
      if (s.tracks.some((t) => t.id === id)) return null
      const tr = strip(c.track)
      if (typeof tr.name !== 'string' || !tr.name.trim()) throw new Error('addTrack: no name')
      if (typeof tr.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(tr.color)) delete tr.color
      if (typeof tr.order !== 'number' || !Number.isFinite(tr.order)) delete tr.order
      if (typeof tr.emoji !== 'string') delete tr.emoji
      if (typeof tr.goal !== 'string') delete tr.goal
      actions.upsertTrack({
        color: '#5b5bd6',
        board: true,
        order: alive(s.tracks).length,
        emoji: '📌',
        name: '',
        ...tr,
        id,
        updatedAt: Date.now(),
      })
      return { kind: 'track', id, prev: null }
    }
    default:
      throw new Error('unknown op ' + c.op)
  }
}

/** מחזיר את מה שפקודה עשתה. אחרי ביטול, הפקודה לא תרוץ שוב. */
export function undoCommand(cmdId: string): boolean {
  const u = cache.undo[cmdId]
  if (!u) return false
  switch (u.kind) {
    case 'event': {
      const cur = store.get().events.find((e) => e.id === u.id)
      if (u.prev && u.patch && cur) actions.putEvent(reverted(cur, u.prev, u.patch))
      else if (u.prev) actions.putEvent({ ...u.prev, deleted: u.prev.deleted ?? false })
      else actions.deleteEvent(u.id)
      break
    }
    case 'task': {
      const cur = store.get().tasks.find((t) => t.id === u.id)
      if (u.prev && u.patch && cur) actions.putTask(reverted(cur, u.prev, u.patch))
      else if (u.prev) actions.putTask({ ...u.prev, deleted: u.prev.deleted ?? false })
      else actions.deleteTask(u.id)
      break
    }
    case 'rule': {
      const cur = store.get().rules.find((r) => r.id === u.id)
      if (u.prev && u.patch && cur) actions.upsertRule(reverted(cur, u.prev, u.patch))
      else if (u.prev) actions.upsertRule({ ...u.prev, deleted: u.prev.deleted ?? false })
      else actions.deleteRule(u.id)
      break
    }
    case 'workoutDay': {
      const cur = (store.get().workoutPlan ?? []).find((d) => d.id === u.id)
      if (u.prev && u.patch && cur) actions.upsertWorkoutDay(reverted(cur, u.prev, u.patch))
      else if (u.prev) actions.upsertWorkoutDay({ ...u.prev, deleted: u.prev.deleted ?? false })
      else actions.deleteWorkoutDay(u.id)
      break
    }
    case 'exercise':
      if (u.prev) {
        // החלפה מלאה במקום המקורי — לא מיזוג, ולא הוספה בסוף עם ברירות מחדל
        const day = (store.get().workoutPlan ?? []).find((d) => d.id === u.dayId)
        if (day) {
          const list = day.exercises.filter((x) => x.id !== u.id)
          list.splice(Math.min(u.index ?? list.length, list.length), 0, u.prev)
          actions.patchWorkoutDay(u.dayId, { exercises: list })
        }
      } else actions.deleteExercise(u.dayId, u.id)
      break
    case 'weekGoals':
      actions.setWeekGoals(u.ws, u.prev ?? [])
      break
    case 'settings':
      actions.setSettings((u.patch ? revertPatch(store.get().settings as any, u.prev, u.patch) : u.prev) as any)
      break
    case 'track':
      if (u.prev) actions.upsertTrack(u.prev)
      else actions.deleteTrack(u.id)
      break
  }
  const undo = { ...cache.undo }
  delete undo[cmdId]
  save({ undo })
  return true
}

export function canUndo(cmdId: string): boolean {
  return !!cache.undo[cmdId]
}
/** למה הפקודה נכשלה (או '' אם בוצעה) */
export function commandFailed(cmdId: string): string {
  return cache.failed?.[cmdId] ?? ''
}

// -- תיאור פקודה בעברית --------------------------------------------------------------
export function describeCommand(c: AtlasCommand): string {
  if (!c || typeof c !== 'object' || typeof c.op !== 'string') return 'פקודה לא מוכרת'
  const s = store.get()
  const ev = (id: string) => s.events.find((e) => e.id === id)?.title ?? 'אירוע'
  const tk = (id: string) => s.tasks.find((t) => t.id === id)?.title ?? 'משימה'
  const rl = (id: string) => s.rules.find((r) => r.id === id)?.title ?? 'בלוק קבוע'
  const wd = (id: string) => (s.workoutPlan ?? []).find((d) => d.id === id)?.title ?? 'יום אימון'
  const ex = (dayId: string, id: string) =>
    (s.workoutPlan ?? []).find((d) => d.id === dayId)?.exercises.find((x) => x.id === id)?.name ?? 'תרגיל'
  switch (c.op) {
    case 'addEvent':
      return `נוסף ליומן: ${c.event?.title ?? ''}${c.event?.date ? ` · ${c.event.date}` : ''}${c.event?.start ? ` ${c.event.start}` : ''}`
    case 'patchEvent':
      return `עודכן ביומן: ${ev(c.eventId)}`
    case 'deleteEvent':
      return `נמחק מהיומן: ${ev(c.eventId)}`
    case 'addRule':
      return `בלוק קבוע חדש: ${c.rule?.title ?? ''}`
    case 'patchRule':
      return `בלוק קבוע עודכן: ${rl(c.ruleId)}`
    case 'deleteRule':
      return `בלוק קבוע הוסר: ${rl(c.ruleId)}`
    case 'addTask':
      return `משימה חדשה: ${c.task?.title ?? ''}${c.task?.due ? ` · ${c.task.due}` : ''}`
    case 'patchTask':
      return `משימה עודכנה: ${tk(c.taskId)}`
    case 'deleteTask':
      return `משימה נמחקה: ${tk(c.taskId)}`
    case 'setWeekGoals':
      return `מטרות השבוע נקבעו (${(c.goals ?? []).length})`
    case 'addWorkoutDay':
      return `יום אימון חדש: ${c.day?.title ?? ''}`
    case 'patchWorkoutDay':
      return `יום אימון עודכן: ${wd(c.dayId)}`
    case 'deleteWorkoutDay':
      return `יום אימון הוסר: ${wd(c.dayId)}`
    case 'addExercise':
      return `תרגיל נוסף: ${c.exercise?.name ?? ''}`
    case 'patchExercise':
      return `תרגיל עודכן: ${ex(c.dayId, c.exerciseId)}`
    case 'deleteExercise':
      return `תרגיל הוסר: ${ex(c.dayId, c.exerciseId)}`
    case 'setSettings':
      return `הגדרות עודכנו: ${Object.keys(c.patch ?? {}).join(', ')}`
    case 'addTrack':
      return `מסלול חדש: ${c.track?.name ?? ''}`
    default:
      return c.op
  }
}

/** הפתק של הבוקר — רק אם הוא של היום */
export function todayNote(c: AtlasCache): AtlasToday | null {
  // פתק פגום (טקסט שאינו מחרוזת) לא מפיל את "היום" — פשוט אין פתק
  const t = c.today
  return t && typeof t === 'object' && typeof t.text === 'string' && t.date === today() ? t : null
}
