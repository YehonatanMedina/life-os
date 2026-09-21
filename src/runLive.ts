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
import { logicalDate } from './dates'
import { LIMITS, type Fix, type RunState, addFix, emptyRun, encodePolyline, reanchor, simplify } from './run'
import { routeById } from './runRoutes'

const KEY = 'life-os-run-live'
/** ריצה שנשמרה לפני יותר מזה — כנראה נשכחה, ולא מציעים להמשיך אותה */
const RESUME_MAX_MS = 12 * 3600_000
/** מעל זה בלי קליטה טובה — מציעים להתחיל בכל זאת */
const ACQUIRE_PATIENCE_MS = 20_000
/** כל כמה זמן נשמר המצב המקומי */
const PERSIST_MS = 15_000
/** בלי קריאה יותר מזה — המסך מודה שאין קליטה במקום להראות מספר ישן */
export const STALE_FIX_MS = 15_000

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
  /** מתי הגיעה הקריאה האחרונה — מסך שמראה ±6 מ׳ ירוק בלי קליטה הוא שקר */
  lastFixAt?: number
  /** האם הדפדפן מונע כיבוי מסך. 'no' הוא אזהרה גלויה, לא שקט */
  wake: 'unknown' | 'on' | 'no'
  startedAt: number
}

const OFF: Live = { status: 'off', run: emptyRun(0), hiddenSec: 0, gaps: 0, gotFix: false, wake: 'unknown', startedAt: 0 }

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
    if (live.status === 'off') {
      localStorage.removeItem(KEY)
      return
    }
    // המסלול נשמר מפושט: ריצה של שעה ב-1Hz היא 3600 נקודות וכ-150 קילובייט,
    // וכתיבה כזו כל כמה שניות נתקעת במעבד של הטלפון דווקא בסוף ריצה ארוכה.
    // פישוט לארבעה מטרים מוריד אותה לכמה קילובייטים ולא משנה שום מספר —
    // המרחק, הזמנים והספליטים נשמרים כמו שהם.
    const run = { ...live.run, recent: [], pts: simplify(live.run.pts, 4) }
    localStorage.setItem(KEY, JSON.stringify({ ...live, run }))
  } catch {
    // אחסון מלא: הריצה ממשיכה בזיכרון, אבל אסור שזה יקרה בשקט — אם הדף
    // ייסגר עכשיו, מה שנרוץ מכאן ואילך יאבד.
    if (!live.error) set({ error: 'אין מקום לשמור את הריצה במכשיר. אל תסגור את המסך עד הסיום.' })
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
    // ריצה שנשמרה תמיד ממשיכה כרצה, ומקטע חדש: מי שנשמר בזמן השהיה נשאר
    // מושהה לנצח, והמסך היה מראה שעון שרץ עם מרחק קפוא.
    return { ...v, run: reanchor({ ...v.run, recent: [], paused: false }) }
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
    const api = (navigator as any).wakeLock
    if (!api?.request) {
      if (live.status !== 'off') set({ wake: 'no' })
      return
    }
    wakeLock = await api.request('screen')
    if (live.status !== 'off') set({ wake: 'on' })
  } catch {
    // נדחה (חוסך סוללה, מסך שלא מלפנים) — זו אזהרה למסך, לא שקט
    if (live.status !== 'off') set({ wake: 'no' })
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
  // קואורדינטה פגומה מגיעה לפעמים ממכשירים שמדמים מיקום, והיא מרעילה כל
  // חשבון שאחריה (NaN משתיק כל השוואה)
  if (!Number.isFinite(p.coords?.latitude) || !Number.isFinite(p.coords?.longitude)) return

  // זמן ההגעה, ולא חותמת המכשיר: חותמת אחת שקפצה לעתיד הרעילה את השעון,
  // וכל הקריאות אחריה נדחו כ"אחורה" — הריצה נראתה תקינה ולא זזה יותר.
  const fix: Fix = {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    t: Date.now(),
    acc: p.coords.accuracy,
    alt: p.coords.altitude ?? undefined,
    spd: p.coords.speed ?? undefined,
  }

  if (live.status === 'acquiring') {
    const good = fix.acc !== undefined && fix.acc <= LIMITS.maxAccuracy
    const patient = Date.now() - acquireAt > ACQUIRE_PATIENCE_MS
    set({ acc: fix.acc, gotFix: live.gotFix || good, lastFixAt: fix.t })
    if (!good && !patient) return
    // הקריאה הזו היא נקודת ההתחלה
    const started = Date.now()
    set({
      status: 'running',
      startedAt: started,
      run: addFix(emptyRun(started), { ...fix, t: started }),
      lastFixAt: started,
      error: undefined,
    })
    persist()
    return
  }

  if (live.status !== 'running' && live.status !== 'paused') return
  const before = live.run.splits.length
  const run = addFix(live.run, fix)
  // קליטה חזרה — השגיאה הקודמת כבר לא נכונה, ולא נשארת על המסך עד הסוף
  set({ run, acc: fix.acc, lastFixAt: fix.t, error: undefined })
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

/**
 * שתי הגנות על ריצה שרצה: מחווה של "חזור" (הדבר הקל ביותר ללחוץ בטעות
 * ביד אחת) לא יוצאת מהמסך, וסגירה או רענון שואלים קודם. בלי זה, הנעילה
 * שמונעת נגיעה בטעות לא שווה כלום — המחווה עוברת מסביבה.
 */
function onPop() {
  if (live.status === 'off') return
  try {
    history.pushState({ run: 1 }, '')
  } catch {
    /* ignore */
  }
  set({ error: 'כדי לצאת מהריצה — לחיצה ארוכה על "סיום", או "מחיקת הריצה" בהשהיה.' })
}
function onUnload(e: BeforeUnloadEvent) {
  if (live.status === 'off') return
  e.preventDefault()
  e.returnValue = ''
}
function guard(on: boolean) {
  if (on) {
    try {
      history.pushState({ run: 1 }, '')
    } catch {
      /* ignore */
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onUnload)
  } else {
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('beforeunload', onUnload)
  }
}

function teardown() {
  stopWatch()
  releaseScreen()
  document.removeEventListener('visibilitychange', onVisibility)
  guard(false)
  if (saveTimer) window.clearInterval(saveTimer)
  saveTimer = undefined
}

export function startRun(routeId?: string) {
  // הפעלה כפולה (לחיצה כפולה, או מסך שנפתח פעמיים) לא תשאיר מאזין וטיימר יתומים
  teardown()
  acquireAt = Date.now()
  live = { ...OFF, status: 'acquiring', routeId, startedAt: Date.now(), run: emptyRun(Date.now()) }
  if (!navigator.geolocation) {
    // המסך נפתח בכל זאת עם ההסבר. קודם זה נשמר על status: 'off', כלומר
    // הכפתור פשוט לא עשה כלום.
    live = { ...live, error: 'הדפדפן הזה לא יודע לאתר מיקום.' }
    emit()
    return
  }
  emit()
  startWatch()
  void lockScreen()
  document.addEventListener('visibilitychange', onVisibility)
  guard(true)
  saveTimer = window.setInterval(persist, PERSIST_MS)
}

/** ממשיכים ריצה שנשמרה (קריסה, רענון, סגירה בטעות) */
export function resumeSaved(saved: Live) {
  teardown()
  live = { ...saved, status: 'running', run: reanchor({ ...saved.run, paused: false }), error: undefined }
  emit()
  startWatch()
  void lockScreen()
  document.addEventListener('visibilitychange', onVisibility)
  guard(true)
  saveTimer = window.setInterval(persist, PERSIST_MS)
}

/**
 * מתחיל למדוד עם הקליטה שיש עכשיו. קיים כי לפעמים אין קליטה טובה ואי
 * אפשר לחכות — עדיף להתחיל עם דיוק בינוני מאשר לא לצאת לרוץ.
 */
export function startAnyway() {
  if (live.status !== 'acquiring') return
  acquireAt = 0
}

export function pauseRun() {
  if (live.status !== 'running') return
  set({ status: 'paused', run: { ...live.run, paused: true } })
  persist()
}

export function resumeRun() {
  if (live.status !== 'paused') return
  // עיגון מחדש: מי שעצר, נסע והמשיך לא יקבל את הדרך במכונית כמרחק ריצה
  // גם אם לא הגיעה שום קריאה בזמן ההשהיה.
  set({ status: 'running', run: reanchor({ ...live.run, paused: false }) })
  persist()
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
  est?: { meters: number; sec: number }
  rejected?: RunState['rejected']
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
    est: r.est?.meters ? { meters: Math.round(r.est.meters), sec: Math.round(r.est.sec) } : undefined,
    rejected: r.rejected,
  }
}

/**
 * מסיים ושומר את הריצה כאימון של היום. משתמש בפעולה הקיימת, ולכן הכל —
 * הסטטיסטיקה השבועית, ההשוואה ליעד, הסנכרון — עובד בלי שינוי.
 */
/** מתחת לזה זו לא ריצה — התחלה בטעות, או יציאה לפני שזזת */
const MIN_SAVE_METERS = 100

export function finishRun(): RunSummary | null {
  if (live.status === 'off') return null
  // ריצה של עשרה מטרים לא תיכנס ליומן כאימון ותשבש את הסטטיסטיקה השבועית
  if (live.run.meters < MIN_SAVE_METERS) {
    discardRun()
    return null
  }
  const sum = summarize()
  // התאריך הוא של **תחילת** הריצה, לפי היום הלוגי: ריצה שיצאה ב-03:00
  // נרשמה קודם למחרת, ודרסה את האימון של אותו יום.
  const date = logicalDate(live.startedAt)
  const s = store.get()
  const existing = (s.workouts ?? []).find((w) => w.date === date && !w.deleted)
  const route = routeById(live.routeId)
  const other = existing && existing.kind !== 'run' && existing.kind !== 'walk'
  actions.patchWorkout(date, {
    title: existing?.title || route?.name || 'ריצה',
    // אימון אחר שנרשם באותו יום לא נדרס: הכותרת, הסוג והדקות שלו נשארות,
    // והריצה מתווספת עם המרחק והמסלול שלה. קודם 72 דקות חדר כושר נמחקו.
    kind: other ? existing!.kind : 'run',
    ...(other ? {} : { minutes: sum.minutes }),
    km: sum.km,
    run: sum,
    finishedAt: Date.now(),
  })
  teardown()
  dropSaved()
  live = OFF
  emit()
  return sum
}
