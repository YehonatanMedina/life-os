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
import { consumeFreshInstall, store, mergeStates } from './store'
import { refreshNotifySchedule } from './push'
import type { AppState } from './types'

const API = 'https://api.github.com'
const FILE = 'life-os.json'
const TOKEN_KEY = 'life-os-gh-token'
const GIST_KEY = 'life-os-gist-id'
const CRYPT_KEY = 'life-os-crypt-key'

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

// -- הצפנה ------------------------------------------------------------------
// AES-GCM עם מפתח אקראי שנוצר במכשיר. מה שיושב ב-GitHub הוא צופן חסר משמעות
// למי שאין לו את המפתח — והמפתח עובר רק בתוך מזהה החיבור, לא נשמר בענן.
function b64u(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export function newCryptKey(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(32)))
}
async function aesKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64u(b64) as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}
async function encryptText(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await aesKey(keyB64)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  )
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) })
}
async function decryptText(ivB64: string, ctB64: string, keyB64: string): Promise<string> {
  const key = await aesKey(keyB64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(ivB64) as BufferSource },
    key,
    unb64u(ctB64) as BufferSource,
  )
  return new TextDecoder().decode(plain)
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

async function writeRemote(s: AppState): Promise<void> {
  const id = getGistId()
  if (!id) throw new Error('no-gist')
  const key = getCryptKey()
  const json = JSON.stringify(forCloud(s))
  const content = key ? await encryptText(json, key) : json
  await api(`/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content } } }),
  })
}

/** משיכה + מיזוג. מחזיר true אם משהו השתנה מקומית. */
export async function pullOnce(): Promise<boolean> {
  const remote = await readRemote()
  if (!remote) return false
  const before = snapshotOf(store.get())
  if (consumeFreshInstall()) {
    // מכשיר חדש: מה שבענן הוא התמונה, לא תוספת לתוכן הפתיחה
    store.replace({ ...remote, timer: null })
  } else {
    store.set((local) => mergeStates(local, remote))
  }
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
      refreshNotifySchedule()
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

/**
 * חיבור בקליק אחד: פתיחת הכתובת עם ‎#setup=…‎ מגדירה את המכשיר ונעלמת.
 * ה-fragment אף פעם לא נשלח לשרת, והשורה מוחלפת בהיסטוריה מיד.
 */
function consumeSetupLink() {
  try {
    const m = location.hash.match(/#setup=([A-Za-z0-9\-_]+)/)
    if (!m) return
    const cfg = JSON.parse(new TextDecoder().decode(unb64u(m[1])))
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
