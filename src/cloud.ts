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
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { store, mergeStates } from './store'
import type { AppState } from './types'

const API = 'https://api.github.com'
const FILE = 'life-os.json'
const TOKEN_KEY = 'life-os-gh-token'
const GIST_KEY = 'life-os-gist-id'

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
export function setCredentials(token: string, gistId: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim())
    else localStorage.removeItem(TOKEN_KEY)
    if (gistId) localStorage.setItem(GIST_KEY, gistId.trim())
    else localStorage.removeItem(GIST_KEY)
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
const listeners = new Set<() => void>()
type CloudSnapshot = { status: CloudStatus; lastError: string; lastSyncAt: number }
let snapshotCache: CloudSnapshot = { status, lastError, lastSyncAt }

function setStatus(v: CloudStatus, err = '') {
  if (status === v && lastError === err) return
  status = v
  lastError = err
  snapshotCache = { status, lastError, lastSyncAt }
  listeners.forEach((l) => l())
}
function markSyncedAt(t: number) {
  lastSyncAt = t
  snapshotCache = { status, lastError, lastSyncAt }
  listeners.forEach((l) => l())
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
function snapshotOf(s: AppState): string {
  return JSON.stringify({ ...forCloud(s), lastSyncAt: 0 })
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
  const body = {
    description: 'מערכת ההפעלה — מצב מסונכרן. לא לערוך ידנית.',
    public: false,
    files: { [FILE]: { content: JSON.stringify(forCloud(store.get())) } },
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
  try {
    const parsed = JSON.parse(raw)
    return parsed && Array.isArray(parsed.tasks) ? (parsed as AppState) : null
  } catch {
    return null
  }
}

async function writeRemote(s: AppState): Promise<void> {
  const id = getGistId()
  if (!id) throw new Error('no-gist')
  await api(`/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(forCloud(s)) } } }),
  })
}

/** משיכה + מיזוג. מחזיר true אם משהו השתנה מקומית. */
export async function pullOnce(): Promise<boolean> {
  const remote = await readRemote()
  if (!remote) return false
  const before = snapshotOf(store.get())
  store.set((local) => mergeStates(local, remote))
  return snapshotOf(store.get()) !== before
}

/** מיזוג ואז כתיבה — כך כתיבה מקבילה ממכשיר אחר לא נמחקת */
export async function pushNow(): Promise<void> {
  await pullOnce()
  await writeRemote(store.get())
}

// -- הלולאה ------------------------------------------------------------------
const QUIET_MS = 4000 // כמה שקט צריך אחרי שינוי לפני שליחה
const POLL_MS = 10000 // כל כמה זמן בודקים אם מישהו אחר שינה
const TICK_MS = 2000

let baseline: string | null = null
let dirtySince = 0
let lastPoll = 0
let busy = false
let loop: number | undefined

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
    baseline = snap
    busy = true
    try {
      await pullOnce()
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

  const shouldPush = dirty && Date.now() - dirtySince >= QUIET_MS
  const shouldPoll = !dirty && Date.now() - lastPoll >= POLL_MS
  if (!shouldPush && !shouldPoll) return

  busy = true
  try {
    if (shouldPush) {
      setStatus('sending')
      await pushNow()
      baseline = snapshotOf(store.get())
      dirtySince = 0
      lastPoll = Date.now()
      markSyncedAt(Date.now())
      setStatus('synced')
    } else {
      const changed = await pullOnce()
      baseline = snapshotOf(store.get())
      lastPoll = Date.now()
      if (changed) markSyncedAt(Date.now())
      setStatus('synced')
    }
  } catch (e: any) {
    const m = String(e?.message ?? e)
    setStatus(m === 'auth' ? 'error' : m.startsWith('http') || m === 'not-found' ? 'error' : 'error', m)
  } finally {
    busy = false
  }
}

export function startCloud() {
  if (loop) return
  loop = window.setInterval(() => void tick(), TICK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastPoll = 0 // בחזרה למסך — בודקים מיד
      void tick()
    }
  })
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

export const HE_STATUS: Record<CloudStatus, string> = {
  off: 'לא מחובר',
  synced: 'מסונכרן',
  pending: 'ממתין לשליחה',
  sending: 'שולח…',
  error: 'הסנכרון נכשל',
  offline: 'אין אינטרנט',
}
