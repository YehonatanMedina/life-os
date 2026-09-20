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
// ארבעה כללים שנלמדו בכאב:
//   1. אחרי כל משיכה משווים את *תוכן* התוצאה למה שבמחסן. אם יש אצלנו משהו
//      שאין שם — כותבים מיד. זה מה שמציל שינויים שנעשו לפני שהטלפון הרג את
//      האפליקציה, ומה שמחזיר נתונים שגרסה ישנה במכשיר אחר השמיטה.
//   2. ברגע שהאפליקציה יוצאת מהמסך — דוחפים מיד, בלי לחכות ל"שקט".
//   3. קבצי הצד (משוב חדשות, חבילת הניתוח, הדופק) נכתבים באותה דחיפה של
//      המצב, לא בטיימרים נפרדים שנהרגים יחד עם הלשונית.
//   4. GitHub מגביל קצב. דופק הטיימר הוא לא שינוי (הוא גרם לכתיבה כל 20 שניות
//      — 693 כתיבות ביום), כשל לא מנוסה שוב כל שנייה (הניסיונות מתרחקים), וחסימת
//      קצב מכובדת עד הרגע ש-GitHub נתן (ghLimit). הבדיקה התקופתית מותנית
//      ב-ETag: כשלא השתנה כלום התשובה 304 — בלי הורדה ובלי ספירה במכסה.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { actions, consumeFreshInstall, getPersistError, isPristine, store, mergeStates, subscribePersistError } from './store'
import { refreshNotifySchedule } from './push'
import { decryptText, encryptText, newCryptKey, stableStringify } from './crypto'
import { aiKey, buildAtlasContext, buildPulse, buildWeekDigest } from './ai'
import {
  GhLimited, PERSISTENT_ERRORS, clearGhCooldown, ghCooldownUntil, hhmmOf, logSyncFailure, noteGhResponse, retryDelay,
} from './ghLimit'
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

/** limited = GitHub הגביל את קצב הבקשות; ממתינים לזמן שהוא נתן */
export type CloudStatus = 'off' | 'synced' | 'pending' | 'sending' | 'error' | 'limited' | 'offline'

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
  const prevToken = getToken()
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
  remoteEtag = ''
  failures = 0
  retryAt = 0
  // חסימת קצב שייכת לאסימון — אסימון חדש מתחיל נקי
  if (token.trim() !== prevToken) clearGhCooldown()
  setStatus(token && gistId ? 'pending' : 'off')
  void tick()
}

// -- מצב ריאקטיבי ------------------------------------------------------------
let status: CloudStatus = 'off'
let lastError = ''
let lastSyncAt = 0
let lastPullAt = 0
let lastPushAt = 0
/** אחרי כשל: לא לפני הרגע הזה */
let retryAt = 0
const listeners = new Set<() => void>()
type CloudSnapshot = {
  status: CloudStatus
  lastError: string
  lastSyncAt: number
  lastPullAt: number
  lastPushAt: number
  retryAt: number
}
let snapshotCache: CloudSnapshot = { status, lastError, lastSyncAt, lastPullAt, lastPushAt, retryAt }

function emit() {
  snapshotCache = { status, lastError, lastSyncAt, lastPullAt, lastPushAt, retryAt }
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
/**
 * הטיימר וחותמת הטיימר אף פעם לא עוזבים את המכשיר. החותמת מתעדכנת בכל דופק
 * (כל 20 שניות); כשהיא נכנסה לחתימה, טיימר רץ = כתיבה למחסן כל 20 שניות.
 */
function forCloud(s: AppState): AppState {
  const { timerStamp: _deviceOnly, ...rest } = s
  return { ...rest, timer: null }
}

/**
 * חתימה של המצב לזיהוי "יש מה לדחוף". הטיימר נכנס בצורה גסה בלבד —
 * התחלה, עצירה ומסלול — כדי שדופק של כל 20 שניות לא יגרור דחיפה.
 */
let snapFor: AppState | null = null
let snapCache = ''
function snapshotOf(s: AppState): string {
  // אותו אובייקט מצב = אותה חתימה; החנות מחליפה את האובייקט בכל שינוי
  if (s === snapFor) return snapCache
  const t = s.timer
  const timer = t ? `${t.running ? 1 : 0}|${t.trackId}|${t.startedAt}|${t.label}` : ''
  snapFor = s
  snapCache = JSON.stringify({ ...forCloud(s), lastSyncAt: 0, timer })
  return snapCache
}

const LIST_KEYS = [
  'tracks', 'tasks', 'events', 'rules', 'sessions', 'days', 'weeks', 'habits',
  'weekly', 'phases', 'news', 'workoutPlan', 'workouts', 'skills',
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
  return stableStringify({ settings: s.settings, settingsUpdatedAt: s.settingsUpdatedAt ?? 0, lists, atlasApplied: s.atlasApplied ?? {} })
}

/**
 * בקשה ל-GitHub. בזמן חסימת קצב לא יוצאת בכלל; חסימה חדשה נרשמת למכשיר כולו.
 * 304 (בקשה מותנית שלא השתנה בה כלום) חוזרת כמו שהיא.
 */
async function api(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  if (!token) throw new Error('no-token')
  const blocked = ghCooldownUntil()
  if (blocked) throw new GhLimited(blocked)
  let res: Response
  try {
    res = await fetch(API + path, {
      ...init,
      // המטמון של הדפדפן הגיש גרסה בת עד דקה — וזה ייצר כתיבות מיותרות "כי המחסן מפגר"
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error('network')
  }
  const limited = await noteGhResponse(res)
  if (limited) throw new GhLimited(limited)
  if (res.status === 304) return res
  if (res.status === 401 || res.status === 403) throw new Error('auth')
  if (res.status === 404) throw new Error('not-found')
  if (!res.ok) throw new Error(`http-${res.status}`)
  return res
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
    description: 'אטלס — מצב מסונכרן ומוצפן. לא לערוך ידנית.',
    public: false,
    files: { [FILE]: { content } },
  }
  const r = await api('/gists', { method: 'POST', body: JSON.stringify(body) })
  return (await r.json()).id as string
}

/** ה-ETag של הגרסה האחרונה שנקראה, פוענחה ומוזגה — לבדיקה המותנית הבאה */
let remoteEtag = ''

async function readRemote(): Promise<AppState | null | 'unchanged'> {
  const id = getGistId()
  if (!id) return null
  const res = await api(`/gists/${id}`, remoteEtag ? { headers: { 'If-None-Match': remoteEtag } } : undefined)
  if (res.status === 304) return 'unchanged'
  const etag = res.headers?.get?.('etag') ?? ''
  const g = await res.json()
  const f = g?.files?.[FILE]
  if (!f) return null
  // גיסט גדול מגיע קטוע, ואז יש raw_url להורדה מלאה
  let raw: string = f.content
  if (f.truncated) {
    const rr = await fetch(f.raw_url, { cache: 'no-store' }).catch(() => null)
    if (!rr) throw new Error('network')
    if (!rr.ok) throw new Error(`http-${rr.status}`)
    raw = await rr.text()
  }
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    // קובץ קיים אבל שבור (או פורמט של גרסה חדשה יותר) — לא "אין מחסן", ואסור לדרוס אותו
    throw new Error('unreadable')
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
  if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('unreadable')
  // רק גרסה שבאמת נקראה עד הסוף מקבלת "ראיתי" — אחרת 304 היה מסתיר אותה לתמיד
  remoteEtag = etag
  return parsed as AppState
}

// -- קבצי הצד: נגזרים מהמצב ונכתבים באותה דחיפה ------------------------------
/**
 * חתימת תוכן בלי חותמות זמן — גם ב-JSON מיושר עם רווח אחרי הנקודתיים.
 * since (תחילת חלון "מה נכנס ביומיים האחרונים" בהקשר של אטלס) זז בכל מילישנייה;
 * בלעדיו בחתימה, קובץ ההקשר (~100KB) נשלח מחדש בכל כתיבה.
 */
const sideStamp = (json: string) => json.replace(/"(generatedAt|updatedAt|since)":\s*"[^"]*"/g, '')
// מה שכבר נכתב (בגרסתו הגלויה) — כדי לא לשלוח שוב קובץ שלא השתנה
const sideWritten = new Map<string, string>()

// -- פנקס הסיפורים שכבר סופרו ------------------------------------------------
// העורך בענן רואה לפני הכתיבה את הכותרות של הימים האחרונים בלבד, והן עקיפות
// בכוונה — אי אפשר לדעת מהן על מי הסיפור, ולכן סיפורים חזרו (רומי סופר ב-17.9
// וב-20.9). docs/news/covered.json נבנה מהארכיון על ידי scripts/news-ledger.mjs
// ומחזיק לכל סיפור את המילים המזהות שלו. הוא נוסע בתוך קובץ המשוב, כי זה
// הקובץ היחיד שהעורך קורא בכל בוקר לפני שהוא בוחר סיפורים.
const COVERED_URL = './news/covered.json'
const COVERED_TTL = 6 * 60 * 60 * 1000
const COVERED_DAYS = 30
let coveredText = ''
let coveredAt = 0

async function refreshCovered(): Promise<void> {
  if (coveredText && Date.now() - coveredAt < COVERED_TTL) return
  try {
    const r = await fetch(COVERED_URL, { cache: 'no-cache' })
    if (!r.ok) return
    const t = await r.text()
    JSON.parse(t)
    coveredText = t
    coveredAt = Date.now()
  } catch {
    // אין רשת או שהקובץ עוד לא נבנה — הפנקס פשוט לא מצורף הפעם
  }
}

/** הפנקס כפי שהוא נכנס לקובץ המשוב: חלון של חודשיים, בלי חותמת זמן */
export function coveredForFeedback(text: string, days = COVERED_DAYS, now = new Date()): unknown {
  if (!text) return undefined
  try {
    const j = JSON.parse(text) as { about?: string; stories?: Array<{ date: string }> }
    const all = Array.isArray(j.stories) ? j.stories : []
    const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
    const stories = all.filter((x) => typeof x?.date === 'string' && x.date >= from)
    if (!stories.length) return undefined
    return { about: j.about, stories }
  } catch {
    return undefined
  }
}

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
      about: 'משוב המשתמש על מהדורות הבוקר. נכתב על ידי האפליקציה, נקרא על ידי עורך החדשות.',
      updatedAt: new Date().toISOString(),
      editions,
      covered: coveredForFeedback(coveredText),
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
  const stamp = sideStamp

  await refreshCovered()
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
  const stamp = sideStamp
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
  if (remote === 'unchanged') {
    // המחסן לא זז מאז המיזוג האחרון — אין מה למזג, ו-remoteBehind נשאר כמו שחושב אז
    lastPullAt = Date.now()
    emit()
    return false
  }
  if (!remote) return false
  const local = store.get()
  const before = snapshotOf(local)
  // רק במבט הראשון על המחסן: מכשיר חדש או בתולי לוקח את התמונה כמו שהיא.
  // אחר כך המצב המקומי כבר *הוא* המחסן ומיזוג רגיל נכון וזול יותר.
  if (consumeFreshInstall() || (!hasPulledOnce() && isPristine(local))) {
    // המחסן הוא האמת — כולל ההגדרות: מכשיר שרק נפתח (סגר את כרטיס ההסבר, בחר ערכה)
    // לא דורס שעת קימה, שם ומפתח שחיים במחסן. הטיימר נשאר מקומי.
    store.replace({
      ...remote,
      timer: local.timer,
      deviceId: local.deviceId,
      atlasApplied: { ...(remote.atlasApplied || {}), ...(local.atlasApplied || {}) },
    })
  } else {
    const merged = mergeStates(local, remote)
    // מיזוג שלא שינה כלום לא מייצר מצב חדש — אחרת כל משיכה מציירת את כל העץ וכותבת לדיסק
    if (snapshotOf(merged) !== before) store.set(() => merged)
  }
  // אם תוצאת המיזוג שונה ממה שבמחסן — אנחנו מחזיקים משהו שהוא לא. כותבים.
  remoteBehind = contentOf(store.get()) !== contentOf(remote)
  lastPullAt = Date.now()
  // מפתח הניתוח מקישור ההתקנה נכנס רק עכשיו — אחרי המשיכה, ורק אם למחסן אין אחד
  if (pendingAk) {
    if (!store.get().settings.aiKey) actions.setSettings({ aiKey: pendingAk })
    pendingAk = ''
  }
  emit()
  return snapshotOf(store.get()) !== before
}

/** האם המכשיר הזה כבר משך פעם אחת מהמחסן בסשן הזה */
export function hasPulledOnce(): boolean {
  return lastPullAt > 0
}
export function cloudConfigured(): boolean {
  return !!getToken() && !!getGistId()
}

/** מיזוג ואז כתיבה — כך כתיבה מקבילה ממכשיר אחר לא נמחקת */
export async function pushNow(): Promise<void> {
  await pullOnce()
  await writeRemote(store.get())
  remoteBehind = false
}

// -- הלולאה ------------------------------------------------------------------
const QUIET_MS = 2000 // כמה שקט צריך אחרי שינוי לפני שליחה
const POLL_MS = 10_000 // כל כמה זמן בודקים אם מישהו אחר שינה (כשהמסך פתוח)
const POLL_HIDDEN_MS = 2 * 60_000 // לשונית ברקע: אין מי שיראה — בודקים לעתים רחוקות
const TICK_MS = 1000

let baseline: string | null = null
let dirtySince = 0
let lastPoll = 0
let busy = false
let loop: number | undefined
let urgent = false
/** כשלים ברצף — קובעים כמה לחכות לפני הניסיון הבא */
let failures = 0
/** מתי יצאה הבקשה האחרונה — כדי שחזרה למסך לא תעקוף את ההמתנה בלי סוף */
let lastTryAt = 0

const pollGap = () => (typeof document !== 'undefined' && document.visibilityState === 'hidden' ? POLL_HIDDEN_MS : POLL_MS)

function onFail(e: unknown) {
  const err = String((e as Error)?.message ?? e)
  const now = Date.now()
  failures++
  const until = e instanceof GhLimited ? e.until : 0
  retryAt = now + Math.max(retryDelay(failures, err), until ? until - now : 0)
  logSyncFailure({ at: now, err, ...(until ? { until } : {}) })
  setStatus(until ? 'limited' : 'error', err)
  emit()
}
function onOk() {
  failures = 0
  retryAt = 0
}

/**
 * אירוע שמצדיק לנסות לפני הזמן (חזרה למסך, חזרת רשת, יציאה מהמסך) — רק בכשל
 * חולף, לא בחסימת קצב ולא בשגיאת אסימון/מפתח, ולא יותר מפעם ב-minGapMs.
 */
function pokeRetry(minGapMs: number) {
  if (!retryAt || ghCooldownUntil() || PERSISTENT_ERRORS.has(lastError)) return
  if (Date.now() - lastTryAt >= minGapMs) retryAt = 0
}

/** הסבר בעברית לשגיאת סנכרון — להגדרות, לטוסט ולסרגל */
export function describeSyncError(err: string, retry = 0): string {
  const later = retry > Date.now() ? ` ננסה שוב לבד ב-${hhmmOf(retry)}.` : ' ננסה שוב לבד.'
  if (err === 'auth') return 'האסימון נדחה או פג. צור אחד חדש והדבק אותו כאן.'
  if (err === 'not-found') return 'המחסן לא נמצא. בדוק את מזהה החיבור.'
  if (err === 'no-key' || err === 'bad-key') return 'המחסן מוצפן וחסר המפתח — הדבק את מזהה החיבור המלא (עם החלק שאחרי #).'
  if (err === 'unreadable') return 'המחסן קיים אבל לא קריא בגרסה הזו — לא נכתב עליו. עדכן את האפליקציה או בדוק את המפתח.'
  if (err === 'rate-limit') {
    return `GitHub הגביל זמנית את קצב הבקשות. השינויים שמורים במכשיר ויישלחו לבד${retry > Date.now() ? ` ב-${hhmmOf(retry)}` : ''}.`
  }
  if (err === 'network') return 'אין חיבור ל-GitHub כרגע. השינויים שמורים במכשיר.' + later
  if (/^http-5\d\d$/.test(err)) return 'GitHub לא זמין כרגע (שגיאת שרת). השינויים שמורים במכשיר.' + later
  if (err === 'http-409') return 'התנגשות בכתיבה מול מכשיר אחר.' + later
  return `שגיאה: ${err}.` + later
}

/** האם בטוח לרענן את הדף עכשיו — הכל נשלח ואין טיימר רץ */
export function safeToReload(): boolean {
  const s = store.get()
  // גיליון/זרימה/מצב מיקוד פתוחים — יש טקסט שעלול ללכת לאיבוד; טיימר רץ — לא קוטעים
  const busy = typeof document !== 'undefined' && !!document.querySelector('.scrim, .flow, .focus, .lock-overlay')
  if (busy || s.timer?.running) return false
  // בלי ענן אין מה לדחוף — השמירה המקומית נכתבת לפני היציאה
  if (status === 'off') return true
  return status === 'synced' && baseline !== null && snapshotOf(s) === baseline
}

/** בקשה לדחוף בהזדמנות הראשונה, בלי לחכות לשקט */
export function nudgePush() {
  urgent = true
  pokeRetry(10_000)
  void tick()
}

/** לשימוש מכפתור "סנכרן עכשיו": משיכה, מיזוג וכתיבה — בלי קשר למצב (אבל לא בזמן חסימת קצב) */
export async function syncNow(): Promise<void> {
  if (busy) return
  const blocked = ghCooldownUntil()
  if (blocked) {
    retryAt = Math.max(retryAt, blocked)
    setStatus('limited', 'rate-limit')
    emit()
    throw new GhLimited(blocked)
  }
  busy = true
  lastTryAt = Date.now()
  try {
    setStatus('sending')
    await pullOnce()
    await writeRemote(store.get())
    remoteBehind = false
    baseline = snapshotOf(store.get())
    dirtySince = 0
    urgent = false
    lastPoll = Date.now()
    onOk()
    markSyncedAt(Date.now())
    setStatus('synced')
    refreshNotifySchedule()
  } catch (e) {
    onFail(e)
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
  // אחרי כשל מחכים לתור שלנו. בלי זה כשל אחד הפך לניסיון כל שנייה — ו-GitHub חסם.
  if (Date.now() < retryAt) return

  const s = store.get()
  const snap = snapshotOf(s)
  if (baseline === null) {
    // פתיחה: מושכים, ממזגים — ואם יש אצלנו משהו שהמחסן לא מכיר, כותבים מיד.
    // בלי זה, שינויים שנעשו לפני שהאפליקציה נהרגה לא היו נשלחים לעולם.
    baseline = snap
    busy = true
    lastTryAt = Date.now()
    try {
      await pullOnce()
      if (remoteBehind) {
        setStatus('sending')
        await writeRemote(store.get())
        remoteBehind = false
      }
      baseline = snapshotOf(store.get())
      lastPoll = Date.now()
      onOk()
      markSyncedAt(Date.now())
      setStatus('synced')
    } catch (e) {
      onFail(e)
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
  const shouldPoll = !dirty && Date.now() - lastPoll >= pollGap()
  if (!shouldPush && !shouldPoll) return

  busy = true
  lastTryAt = Date.now()
  try {
    if (shouldPush) {
      setStatus('sending')
      await pushNow()
      baseline = snapshotOf(store.get())
      dirtySince = 0
      urgent = false
      lastPoll = Date.now()
      onOk()
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
      onOk()
      setStatus('synced')
    }
  } catch (e) {
    onFail(e)
  } finally {
    busy = false
  }
}

/**
 * חיבור בקליק אחד: פתיחת הכתובת עם ‎#setup=…‎ מגדירה את המכשיר ונעלמת.
 * ה-fragment אף פעם לא נשלח לשרת, והשורה מוחלפת בהיסטוריה מיד.
 */
let pendingAk = ''

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
    // מפתח הניתוח מוחל אחרי המשיכה הראשונה (ראו pullOnce) — כדי לא להקפיץ את חותמת
    // ההגדרות לפני שהמחסן דיבר. בלי מחסן (רק מפתח) — מיד.
    if (cfg && typeof cfg.ak === 'string' && cfg.ak) {
      if (getToken() && getGistId()) pendingAk = cfg.ak
      else actions.setSettings({ aiKey: cfg.ak })
    }
    // מפתח ה-API של המסלול המהיר — ההגדרות ממילא מסונכרנות, זה רק כדי שיעבוד מהרגע הראשון
    if (cfg && typeof cfg.ck === 'string' && cfg.ck && !store.get().settings.apiKey) actions.setSettings({ apiKey: cfg.ck })
    history.replaceState(null, '', location.pathname + location.search)
  } catch {
    /* ignore */
  }
}

export function startCloud() {
  if (loop) return
  // שמירה מקומית שנכשלה (אחסון מלא) — דוחפים מיד למחסן, כדי שהיום לא ייעלם ברענון
  subscribePersistError(() => {
    if (getPersistError()) nudgePush()
  })
  consumeSetupLink()
  // קישור התקנה שהודבק בלשונית פתוחה — ניווט hash בלבד, בלי טעינה מחדש
  window.addEventListener('hashchange', () => {
    consumeSetupLink()
    baseline = null
    remoteEtag = ''
    void tick()
  })
  loop = window.setInterval(() => void tick(), TICK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastPoll = 0 // בחזרה למסך — בודקים מיד (אבל לא עוקפים חסימת קצב)
      pokeRetry(15_000)
      void tick()
    } else {
      // יוצאים מהמסך: אם יש מה לדחוף — עכשיו, לפני שהמערכת מקפיאה אותנו
      nudgePush()
    }
  })
  window.addEventListener('pagehide', () => nudgePush())
  window.addEventListener('online', () => {
    pokeRetry(0)
    void tick()
  })
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
  limited: 'ממתין ל-GitHub',
  offline: 'אין אינטרנט',
}
