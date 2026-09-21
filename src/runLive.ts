// ---------------------------------------------------------------------------
// ריצה חיה — מה שמחבר בין ה-GPS של הטלפון למנוע (src/run.ts) ולמסך.
//
// שלוש עובדות שקבעו את המבנה כאן:
//
//   1. **אין מעקב ברקע.** דפדפן באנדרואיד מקפיא דף שיצא מהמסך, ומערכת
//      ההפעלה מגבילה מיקום ברקע בלי קשר. לכן המסך חייב להישאר דלוק וקדמי
//      לאורך כל הריצה — יש נעילת מסך ער, ויציאה מהמסך נרשמת כפער גלוי
//      במקום להעמיד פנים שהמסלול רציף.
//   2. **ריצה שאבדה היא אסון קטן.** המצב נכתב לאחסון המקומי כל כמה שניות,
//      ולכן קריסה, רענון או סגירה בטעות לא מוחקים אותה — בפתיחה הבאה
//      מציעים להמשיך.
//   3. **מתחילים רק עם קליטה.** קריאה ראשונה גרועה מזיזה את נקודת ההתחלה
//      מאות מטרים, וזה נראה כמו ריצה שלא הייתה.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'
import { actions, store } from './store'
import { today } from './dates'
import { LIMITS, type Fix, type RunState, addFix, emptyRun, encodePolyline, simplify } from './run'
import { routeById } from './runRoutes'

const KEY = 'life-os-run-live'
/** ריצה שנשמרה לפני יותר מזה — כנראה נשכחה, ולא מציעים להמשיך אותה */
const RESUME_MAX_MS = 12 * 3600_000
/** מעל זה בלי קליטה טובה — מציעים להתחיל בכל זאת */
const ACQUIRE_PATIENCE_MS = 20_000

export type LiveStatus = 'off' | 'acquiring' | 'running' | 'paused' | 'saving'

export type Live = {
  status: LiveStatus
  run: RunState
  routeId?: string
  /** רדיוס הדיוק של הקריאה האחרונה */
  acc?: number
  /** שניות שהמסך לא היה מלפנים — המסלול שם חסר */
  hiddenSec: number
  /** כמה פעמים המסך יצא מקדמת הבמה */
  gaps: number
  /** תקלה להצגה (הרשאה, אין קליטה) */
  error?: string
  /** האם התקבלה כבר קריאה טובה */
  gotFix: boolean
  startedAt: number
}

const OFF: Live = { status: 'off', run: emptyRun(0), hiddenSec: 0, gaps: 0, gotFix: false, startedAt: 0 }

let live: Live = OFF
const listeners = new Set<() => void>()
let watchId: number | null = null
let wakeLock: any = null
let saveTimer: number | undefined
let hiddenAt = 0
let acquireAt = 0
/** נקרא כשנסגר קילומטר — למשוב רטט/קול במסך */
let onSplit: ((km: number) => void) | null = null

function emit() {
  listeners.forEach((l) => l())
}
function set(patch: Partial<Live>) {
  live = { ...live, ...patch }
  emit()
}

export function subscribeLive(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export const getLive = () => live
export function useLiveRun(): Live {
  return useSyncExternalStore(subscribeLive, getLive, () => OFF)
}
export function setSplitHandler(fn: ((km: number) => void) | null) {
  onSplit = fn
}

// -- שמירה מקומית, כדי שריצה לא תאבד -----------------------------------------------

function persist() {
  try {
    if (live.status === 'off') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ ...live, run: { ...live.run, recent: [] } }))
  } catch {
    /* אחסון מלא — הריצה ממשיכה בזיכרון */
  }
}

/** ריצה שנשמרה ולא נסגרה — להצעה "להמשיך?" בפתיחה */
export function savedRun(): Live | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Live
    if (!v?.run || typeof v.startedAt !== 'number') return null
    if (Date.now() - v.startedAt > RESUME_MAX_MS) return null
    return { ...v, run: { ...v.run, recent: [] } }
  } catch {
    return null
  }
}

export function dropSaved() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// -- מסך ער ----------------------------------------------------------------------

async function lockScreen() {
  try {
    wakeLock = await (navigator as any).wakeLock?.request('screen')
  } catch {
    /* לא נתמך — המשתמש יראה אזהרה במסך */
  }
}
function releaseScreen() {
  try {
    wakeLock?.release?.()
  } catch {
    /* ignore */
  }
  wakeLock = null
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
    return
  }
  void lockScreen()
  if (hiddenAt && (live.status === 'running' || live.status === 'paused')) {
    const away = Math.round((Date.now() - hiddenAt) / 1000)
    // פער קצר (החלפת אפליקציה לרגע) לא שווה אזהרה; ארוך — כן, כי שם חסר מסלול
    if (away >= 10) set({ hiddenSec: live.hiddenSec + away, gaps: live.gaps + 1 })
  }
  hiddenAt = 0
}

// -- ה-GPS -------------------------------------------------------------------------

function onPosition(p: GeolocationPosition) {
  const fix: Fix = {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    t: p.timestamp || Date.now(),
    acc: p.coords.accuracy,
    alt: p.coords.altitude ?? undefined,
    spd: p.coords.speed ?? undefined,
  }

  if (live.status === 'acquiring') {
    const good = fix.acc !== undefined && fix.acc <= LIMITS.maxAccuracy
    const patient = Date.now() - acquireAt > ACQUIRE_PATIENCE_MS
    set({ acc: fix.acc, gotFix: live.gotFix || good })
    if (!good && !patient) return
    // הקריאה הזו היא נקודת ההתחלה
    const started = Date.now()
    set({ status: 'running', startedAt: started, run: addFix(emptyRun(started), { ...fix, t: started }), error: undefined })
    persist()
    return
  }

  if (live.status !== 'running' && live.status !== 'paused') return
  const before = live.run.splits.length
  const run = addFix(live.run, fix)
  set({ run, acc: fix.acc })
  if (run.splits.length > before) onSplit?.(run.splits.length)
}

function onPosError(e: GeolocationPositionError) {
  const msg =
    e.code === e.PERMISSION_DENIED
      ? 'אין הרשאת מיקום. בכרום: הקש על המנעול שליד הכתובת ← הרשאות ← מיקום ← אישור.'
      : e.code === e.POSITION_UNAVAILABLE
        ? 'אין קליטת GPS כרגע. צא לשמיים פתוחים ונסה שוב.'
        : 'ה-GPS לא הגיב בזמן. נסה שוב.'
  set({ error: msg })
}

function startWatch() {
  if (watchId !== null || !navigator.geolocation) return
  watchId = navigator.geolocation.watchPosition(onPosition, onPosError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30_000,
  })
}
function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

// -- הפעולות ----------------------------------------------------------------------

export function startRun(routeId?: string) {
  if (!navigator.geolocation) {
    set({ ...OFF, status: 'off', error: 'הדפדפן הזה לא יודע לאתר מיקום.' })
    return
  }
  acquireAt = Date.now()
  live = { ...OFF, status: 'acquiring', routeId, startedAt: Date.now(), run: emptyRun(Date.now()) }
  emit()
  startWatch()
  void lockScreen()
  document.addEventListener('visibilitychange', onVisibility)
  saveTimer = window.setInterval(persist, 5000)
}

/** ממשיכים ריצה שנשמרה (קריסה, רענון, סגירה בטעות) */
export function resumeSaved(saved: Live) {
  live = { ...saved, status: 'running', error: undefined }
  emit()
  startWatch()
  void lockScreen()
  document.addEventListener('visibilitychange', onVisibility)
  saveTimer = window.setInterval(persist, 5000)
}

export function pauseRun() {
  if (live.status !== 'running') return
  set({ status: 'paused', run: { ...live.run, paused: true } })
  persist()
}

export function resumeRun() {
  if (live.status !== 'paused') return
  set({ status: 'running', run: { ...live.run, paused: false } })
  persist()
}

function teardown() {
  stopWatch()
  releaseScreen()
  document.removeEventListener('visibilitychange', onVisibility)
  if (saveTimer) window.clearInterval(saveTimer)
  saveTimer = undefined
}

/** זורק את הריצה בלי לשמור */
export function discardRun() {
  teardown()
  dropSaved()
  live = OFF
  emit()
}

export type RunSummary = {
  km: number
  minutes: number
  movingSec: number
  elapsedSec: number
  splits: RunState['splits']
  poly: string
  routeId?: string
  gaps: number
  startedAt: number
}

export function summarize(l: Live = live): RunSummary {
  const r = l.run
  return {
    km: Math.round((r.meters / 1000) * 100) / 100,
    minutes: Math.max(1, Math.round(r.movingSec / 60)),
    movingSec: Math.round(r.movingSec),
    elapsedSec: Math.round(r.elapsedSec),
    splits: r.splits,
    poly: encodePolyline(simplify(r.pts, 12)),
    routeId: l.routeId,
    gaps: l.gaps,
    startedAt: l.startedAt,
  }
}

/**
 * מסיים ושומר את הריצה כאימון של היום. משתמש בפעולה הקיימת, ולכן הכל —
 * הסטטיסטיקה השבועית, ההשוואה ליעד, הסנכרון — עובד בלי שינוי.
 */
export function finishRun(): RunSummary | null {
  if (live.status === 'off') return null
  const sum = summarize()
  const date = today()
  const s = store.get()
  const existing = (s.workouts ?? []).find((w) => w.date === date && !w.deleted)
  const route = routeById(live.routeId)
  const title = existing?.title || route?.name || 'ריצה'
  actions.patchWorkout(date, {
    title,
    kind: existing && existing.kind !== 'run' ? existing.kind : 'run',
    km: sum.km,
    minutes: sum.minutes,
    run: sum,
    finishedAt: Date.now(),
  })
  teardown()
  dropSaved()
  live = OFF
  emit()
  return sum
}
