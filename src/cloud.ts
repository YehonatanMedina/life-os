// ---------------------------------------------------------------------------
// סנכרון בין מכשירים דרך Gist פרטי ב-GitHub.
//
// למה Gist: זה חשבון שכבר יש לך, הנתונים פרטיים, אין שרת לתחזק, וזה עובד
// מכל דפדפן. האסימון נשמר רק ב-localStorage של המכשיר — הוא לא נשלח לענן
// ולא נמצא בקוד של האתר.
//
// המודל: המצב המקומי הוא מקור האמת. לפני כל כתיבה מושכים את הגרסה שבענן
// וממזגים (לכל רשומה מנצחת החותמת החדשה יותר), ורק אז כותבים את התוצאה.
// כך שני מכשירים שכתבו במקביל לא דורסים אחד את השני.
//
// שלושה כללים שנלמדו בכאב:
//   1. אחרי כל משיכה משווים את *תוכן* התוצאה למה שבמחסן. אם יש אצלנו משהו
//      שאין שם — כותבים מיד. זה מה שמציל שינויים שנעשו לפני שהטלפון הרג את
//      האפליקציה, ומה שמחזיר נתונים שגרסה ישנה במכשיר אחר השמיטה.
//   2. ברגע שהאפליקציה יוצאת מהמסך — דוחפים מיד, בלי לחכות ל"שקט".
//   3. קבצי הצד (משוב חדשות, חבילת הניתוח, הדופק) נכתבים באותה דחיפה של
//      המצב, לא בטיימרים נפרדים שנהרגים יחד עם הלשונית.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { actions, consumeFreshInstall, store, mergeStates } from './store'
import { refreshNotifySchedule } from './push'
import { decryptText, encryptText, newCryptKey, stableStringify } from './crypto'
import { aiKey, buildAtlasContext, buildPulse, buildWeekDigest } from './ai'
import type { AppState } from './types'

export { b64u, unb64u, encryptText, decryptText, newCryptKey } from './crypto'

const API = 'https://api.github.com'
const FILE = 'life-os.json'
const TOKEN_KEY = 'life-os-gh-token'
const GIST_KEY = 'life-os-gist-id'
const CRYPT_KEY = 'life-os-crypt-key'

/** מזהה הבנייה — מוזרק ל-index.html בזמן הבנייה, כדי שכל מכשיר ידע אם הוא מעודכן */
export function buildId(): string {
  try {
    return document.querySelector('meta[name="build"]')?.getAttribute('content') ?? 'dev'
  } catch {
    return 'dev'
  }
}

export type CloudStatus = 'off' | 'synced' | 'pending' | 'sending' | 'error' | 'offline'

// -- הגדרות מקומיות (לא מסונכרנות, לא בקוד) --------------------------------
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
export function getGistId(): string {
  try {
    return localStorage.getItem(GIST_KEY) ?? ''
  } catch {
    return ''
  }
}
export function getCryptKey(): string {
  try {
    return localStorage.getItem(CRYPT_KEY) ?? ''
  } catch {
    return ''
  }
}
/** מזהה החיבור שמעבירים בין מכשירים: מזהה־המחסן ומפתח־ההצפנה יחד */
export function getPairing(): string {
  const id = getGistId()
  const k = getCryptKey()
  return id ? (k ? `${id}#${k}` : id) : ''
}
export function setCredentials(token: string, pairing: string) {
  // המזהה שמועבר בין מכשירים הוא "מזהה#מפתח" — המפתח מפענח את התוכן
  const [gistId, key] = pairing.trim().split('#')
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim())
    else localStorage.removeItem(TOKEN_KEY)
    if (gistId) localStorage.setItem(GIST_KEY, gistId.trim())
    else localStorage.removeItem(GIST_KEY)
    if (key) localStorage.setItem(CRYPT_KEY, key.trim())
    else if (!gistId) localStorage.removeItem(CRYPT_KEY)
  } catch {
    /* ignore */
  }
  baseline = null
  setStatus(token && gistId ? 'pending' : 'off')
  void tick()
}

// -- מצב ריאקטיבי ------------------------------------------------------------
let status: CloudStatus = 'off'
let lastError = ''
let lastSyncAt = 0
let lastPullAt = 0
let lastPushAt = 0
const listeners = new Set<() => void>()
type CloudSnapshot = {
  status: CloudStatus
  lastError: string
  lastSyncAt: number
  lastPullAt: number
  lastPushAt: number
}
let snapshotCache: CloudSnapshot = { status, lastError, lastSyncAt, lastPullAt, lastPushAt }

function emit() {
  snapshotCache = { status, lastError, lastSyncAt, lastPullAt, lastPushAt }
  listeners.forEach((l) => l())
}
function setStatus(v: CloudStatus, err = '') {
  if (status === v && lastError === err) return
  status = v
  lastError = err
  emit()
}
function markSyncedAt(t: number) {
  lastSyncAt = t
  emit()
}

export function useCloudState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshotCache,
    () => snapshotCache,
  )
}

// -- מה נשלח לענן -----------------------------------------------------------
/** הטיימר והאסימון אף פעם לא עוזבים את המכשיר */
function forCloud(s: AppState): AppState {
  return { ...s, timer: null }
}

/**
 * חתימה של המצב לזיהוי "יש מה לדחוף". הטיימר נכנס בצורה גסה בלבד —
 * התחלה, עצירה ומסלול — כדי שדופק של כל 20 שניות לא יגרור דחיפה.
 */
function snapshotOf(s: AppState): string {
  const t = s.timer
  const timer = t ? `${t.running ? 1 : 0}|${t.trackId}|${t.startedAt}|${t.label}` : ''
  return JSON.stringify({ ...forCloud(s), lastSyncAt: 0, timer })
}

const LIST_KEYS = [
  'tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits',
  'weekly', 'phases', 'news', 'workoutPlan', 'workouts',
] as const

/**
 * תמונת התוכן — רק מה שמסונכרן: הרשומות (ממוינות לפי מזהה) וההגדרות.
 * לא מזהה מכשיר, לא טיימר, לא חותמות מקומיות. שני מכשירים עם אותו תוכן
 * מייצרים אותה מחרוזת, ולכן ההשוואה מולה אומרת בדיוק אם המחסן מפגר.
 */
function contentOf(s: Partial<AppState>): string {
  const lists: Record<string, unknown> = {}
  for (const k of LIST_KEYS) {
    lists[k] = [...((s as any)[k] ?? [])].sort((a: any, b: any) =>
      String(a.id).localeCompare(String(b.id)),
    )
  }
  return stableStringify({ settings: s.settings, settingsUpdatedAt: s.settingsUpdatedAt ?? 0, lists })
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const token = getToken()
  if (!token) throw new Error('no-token')
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401 || res.status === 403) throw new Error('auth')
  if (res.status === 404) throw new Error('not-found')
  if (!res.ok) throw new Error(`http-${res.status}`)
  return res.json()
}

/** יוצר Gist פרטי חדש ומחזיר את המזהה */
export async function createGist(): Promise<string> {
  let key = getCryptKey()
  if (!key) {
    key = newCryptKey()
    try {
      localStorage.setItem(CRYPT_KEY, key)
    } catch {
      /* ignore */
    }
  }
  const content = await encryptText(JSON.stringify(forCloud(store.get())), key)
  const body = {
    description: 'מערכת ההפעלה — מצב מסונכרן ומוצפן. לא לערוך ידנית.',
    public: false,
    files: { [FILE]: { content } },
  }
  const r = await api('/gists', { method: 'POST', body: JSON.stringify(body) })
  return r.id as string
}

async function readRemote(): Promise<AppState | null> {
  const id = getGistId()
  if (!id) return null
  const g = await api(`/gists/${id}`)
  const f = g?.files?.[FILE]
  if (!f) return null
  // גיסט גדול מגיע קטוע, ואז יש raw_url להורדה מלאה
  const raw: string = f.truncated ? await (await fetch(f.raw_url)).text() : f.content
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed && parsed.enc === 1) {
    const key = getCryptKey()
    if (!key) throw new Error('no-key')
    let plain: string
    try {
      plain = await decryptText(parsed.iv, parsed.ct, key)
    } catch {
      throw new Error('bad-key')
    }
    parsed = JSON.parse(plain)
  }
  return parsed && Array.isArray(parsed.tasks) ? (parsed as AppState) : null
}

// -- קבצי הצד: נגזרים מהמצב ונכתבים באותה דחיפה ------------------------------
// מה שכבר נכתב (בגרסתו הגלויה) — כדי לא לשלוח שוב קובץ שלא השתנה
const sideWritten = new Map<string, string>()

/** משוב על החדשות — הקובץ היחיד שהעורך בענן קורא, ולכן גלוי */
function buildNewsFeedback(s: AppState): string {
  const list = (s.news ?? [])
    .filter((n) => !n.deleted)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-21)
  const editions = list.map((n) => {
    const votes = Object.values(n.votes ?? {})
    return {
      date: n.date,
      liked: votes.filter((v) => v.v === 1).map((v) => `[${v.section}] ${v.headline}`),
      disliked: votes.filter((v) => v.v === -1).map((v) => `[${v.section}] ${v.headline}`),
      note: n.note || undefined,
    }
  })
  return JSON.stringify(
    {
      about: 'משוב של יהונתן על מהדורות הבוקר. נכתב על ידי האפליקציה, נקרא על ידי עורך החדשות.',
      updatedAt: new Date().toISOString(),
      editions,
    },
    null,
    2,
  )
}

/**
 * בונה את קבצי הצד שהשתנו מאז הכתיבה האחרונה. ההשוואה היא על הטקסט הגלוי,
 * כי ההצפנה מייצרת צופן שונה בכל פעם.
 */
async function sideFiles(s: AppState): Promise<Record<string, { content: string }>> {
  const out: Record<string, { content: string }> = {}
  const stamp = (json: string) => json.replace(/"(generatedAt|updatedAt)":"[^"]*"/g, '')

  const feedback = buildNewsFeedback(s)
  if (sideWritten.get('news-feedback.json') !== stamp(feedback)) out['news-feedback.json'] = { content: feedback }

  const ak = aiKey(s)
  if (ak) {
    const pairs: Array<[string, string]> = [
      ['week-digest.json', JSON.stringify(buildWeekDigest(s))],
      ['atlas-context.json', JSON.stringify(buildAtlasContext(s))],
      ['pulse.json', JSON.stringify(buildPulse(s))],
    ]
    for (const [name, plain] of pairs) {
      if (sideWritten.get(name) === stamp(plain)) continue
      out[name] = { content: await encryptText(plain, ak) }
    }
  }
  return out
}

function rememberSide(s: AppState, written: Record<string, { content: string }>) {
  const stamp = (json: string) => json.replace(/"(generatedAt|updatedAt)":"[^"]*"/g, '')
  if (written['news-feedback.json']) sideWritten.set('news-feedback.json', stamp(buildNewsFeedback(s)))
  if (written['week-digest.json']) sideWritten.set('week-digest.json', stamp(JSON.stringify(buildWeekDigest(s))))
  if (written['atlas-context.json']) sideWritten.set('atlas-context.json', stamp(JSON.stringify(buildAtlasContext(s))))
  if (written['pulse.json']) sideWritten.set('pulse.json', stamp(JSON.stringify(buildPulse(s))))
}

async function writeRemote(s: AppState): Promise<void> {
  const id = getGistId()
  if (!id) throw new Error('no-gist')
  const key = getCryptKey()
  const json = JSON.stringify(forCloud(s))
  const content = key ? await encryptText(json, key) : json
  const files: Record<string, { content: string }> = { [FILE]: { content } }
  let side: Record<string, { content: string }> = {}
  try {
    side = await sideFiles(s)
  } catch {
    side = {} // קובץ צד שנכשל לא עוצר את הסנכרון של המצב עצמו
  }
  Object.assign(files, side)
  await api(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files }) })
  rememberSide(s, side)
  lastPushAt = Date.now()
  emit()
}

/** המחסן מפגר אחרינו — הפעם הבאה שנתעורר תכתוב אליו */
let remoteBehind = false

/** משיכה + מיזוג. מחזיר true אם משהו השתנה מקומית. */
export async function pullOnce(): Promise<boolean> {
  const remote = await readRemote()
  if (!remote) return false
  const before = snapshotOf(store.get())
  if (consumeFreshInstall()) {
    // מכשיר חדש: מה שבענן הוא התמונה, לא תוספת לתוכן הפתיחה.
    // מזהה המכשיר נשאר שלנו — אחרת כל המכשירים היו נקראים באותו שם.
    store.replace({ ...remote, timer: null, deviceId: store.get().deviceId })
  } else {
    store.set((local) => mergeStates(local, remote))
  }
  // אם תוצאת המיזוג שונה ממה שבמחסן — אנחנו מחזיקים משהו שהוא לא. כותבים.
  remoteBehind = contentOf(store.get()) !== contentOf(remote)
  lastPullAt = Date.now()
  emit()
  return snapshotOf(store.get()) !== before
}

/** מיזוג ואז כתיבה — כך כתיבה מקבילה ממכשיר אחר לא נמחקת */
export async function pushNow(): Promise<void> {
  await pullOnce()
  await writeRemote(store.get())
  remoteBehind = false
}

// -- הלולאה ------------------------------------------------------------------
const QUIET_MS = 2000 // כמה שקט צריך אחרי שינוי לפני שליחה
const POLL_MS = 10000 // כל כמה זמן בודקים אם מישהו אחר שינה
const TICK_MS = 1000

let baseline: string | null = null
let dirtySince = 0
let lastPoll = 0
let busy = false
let loop: number | undefined
let urgent = false

/** בקשה לדחוף בהזדמנות הראשונה, בלי לחכות לשקט */
export function nudgePush() {
  urgent = true
  void tick()
}

/** לשימוש מכפתור "סנכרן עכשיו": משיכה, מיזוג וכתיבה — בלי קשר למצב */
export async function syncNow(): Promise<void> {
  if (busy) return
  busy = true
  try {
    setStatus('sending')
    await pullOnce()
    await writeRemote(store.get())
    remoteBehind = false
    baseline = snapshotOf(store.get())
    dirtySince = 0
    urgent = false
    lastPoll = Date.now()
    markSyncedAt(Date.now())
    setStatus('synced')
    refreshNotifySchedule()
  } catch (e: any) {
    setStatus('error', String(e?.message ?? e))
    throw e
  } finally {
    busy = false
  }
}

async function tick() {
  if (busy) return
  const token = getToken()
  const gist = getGistId()
  if (!token || !gist) {
    setStatus('off')
    return
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline')
    return
  }

  const s = store.get()
  const snap = snapshotOf(s)
  if (baseline === null) {
    // פתיחה: מושכים, ממזגים — ואם יש אצלנו משהו שהמחסן לא מכיר, כותבים מיד.
    // בלי זה, שינויים שנעשו לפני שהאפליקציה נהרגה לא היו נשלחים לעולם.
    baseline = snap
    busy = true
    try {
      await pullOnce()
      if (remoteBehind) {
        setStatus('sending')
        await writeRemote(store.get())
        remoteBehind = false
      }
      baseline = snapshotOf(store.get())
      lastPoll = Date.now()
      markSyncedAt(Date.now())
      setStatus('synced')
    } catch (e: any) {
      setStatus('error', String(e?.message ?? e))
    } finally {
      busy = false
    }
    return
  }

  const dirty = snap !== baseline
  if (dirty && !dirtySince) {
    dirtySince = Date.now()
    setStatus('pending')
  }
  if (!dirty) dirtySince = 0

  const shouldPush = (dirty && (urgent || Date.now() - dirtySince >= QUIET_MS)) || remoteBehind
  const shouldPoll = !dirty && Date.now() - lastPoll >= POLL_MS
  if (!shouldPush && !shouldPoll) return

  busy = true
  try {
    if (shouldPush) {
      setStatus('sending')
      await pushNow()
      baseline = snapshotOf(store.get())
      dirtySince = 0
      urgent = false
      lastPoll = Date.now()
      markSyncedAt(Date.now())
      setStatus('synced')
      refreshNotifySchedule()
    } else {
      const changed = await pullOnce()
      if (remoteBehind) {
        setStatus('sending')
        await writeRemote(store.get())
        remoteBehind = false
      }
      baseline = snapshotOf(store.get())
      lastPoll = Date.now()
      if (changed) markSyncedAt(Date.now())
      setStatus('synced')
    }
  } catch (e: any) {
    setStatus('error', String(e?.message ?? e))
  } finally {
    busy = false
  }
}

/**
 * חיבור בקליק אחד: פתיחת הכתובת עם ‎#setup=…‎ מגדירה את המכשיר ונעלמת.
 * ה-fragment אף פעם לא נשלח לשרת, והשורה מוחלפת בהיסטוריה מיד.
 */
function consumeSetupLink() {
  try {
    const m = location.hash.match(/#setup=([A-Za-z0-9\-_]+)/)
    if (!m) return
    const raw = new TextDecoder().decode(
      Uint8Array.from(
        atob(m[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (m[1].length % 4)) % 4)),
        (c) => c.charCodeAt(0),
      ),
    )
    const cfg = JSON.parse(raw)
    // קישור יכול לשאת חיבור מלא (t+p), מפתח התראות (nk), או שניהם —
    // מה שחסר לא נוגעים בו
    if (cfg && typeof cfg.t === 'string' && typeof cfg.p === 'string') {
      setCredentials(cfg.t, cfg.p)
    }
    if (cfg && typeof cfg.nk === 'string' && cfg.nk) {
      try {
        localStorage.setItem('life-os-notify-key', cfg.nk)
      } catch {
        /* ignore */
      }
    }
    // מפתח הניתוח נכנס להגדרות דרך הפעולה הרגילה — כך הוא מקבל חותמת ומסתנכרן לכל מכשיר
    if (cfg && typeof cfg.ak === 'string' && cfg.ak) actions.setSettings({ aiKey: cfg.ak })
    history.replaceState(null, '', location.pathname + location.search)
  } catch {
    /* ignore */
  }
}

export function startCloud() {
  if (loop) return
  consumeSetupLink()
  loop = window.setInterval(() => void tick(), TICK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastPoll = 0 // בחזרה למסך — בודקים מיד
      void tick()
    } else {
      // יוצאים מהמסך: אם יש מה לדחוף — עכשיו, לפני שהמערכת מקפיאה אותנו
      nudgePush()
    }
  })
  window.addEventListener('pagehide', () => nudgePush())
  window.addEventListener('online', () => void tick())
  void tick()
}

/** הורדת קובץ גיבוי */
export async function saveFile(filename: string, data: string): Promise<boolean> {
  try {
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

/** שמירה מיידית לפני שהלשונית נסגרת */
let flushInstalled = false
export function installFlush() {
  if (flushInstalled) return
  flushInstalled = true
  const flush = () => {
    try {
      localStorage.setItem('life-os-v1', JSON.stringify(store.get()))
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

/** תאימות: דירוג חדשות מבקש דחיפה מיידית — המשוב נכתב כחלק מהדחיפה */
export function queueNewsFeedback() {
  nudgePush()
}

export const HE_STATUS: Record<CloudStatus, string> = {
  off: 'לא מחובר',
  synced: 'מסונכרן',
  pending: 'ממתין לשליחה',
  sending: 'שולח…',
  error: 'הסנכרון נכשל',
  offline: 'אין אינטרנט',
}
