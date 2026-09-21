// ---------------------------------------------------------------------------
// מנוע הריצה — כל החשבון של ריצה חיה, בלי תלות במסך, ב-GPS או בדפדפן.
//
// למה הכל כאן ולמה זה טהור: ריצה קורית פעם אחת. אי אפשר "לנסות שוב" מרחק
// שנמדד לא נכון, ואי אפשר לבדוק בטלפון כל שינוי. לכן כל ההחלטות — איזו
// נקודה מתקבלת, מתי הקילומטר נסגר, מתי עצרת ברמזור — הן פונקציות טהורות
// שהבדיקות מריצות על מסלולים מלאכותיים, כולל רעש וקפיצות.
//
// העקרונות (מקורם במדידה, לא בתחושה):
//   * סכימה נאיבית של קריאות ב-1Hz מנפחת את המרחק בכ-30%: הרץ מתקדם שלושה
//     מטרים בשנייה, והרעש הוא ארבעה. לכן המיקום מוחלק (EMA עם קבוע זמן של
//     שתי שניות), והמרחק נצבר רק כשהתקדמת חמישה מטרים מהנקודה האחרונה
//     שנספרה — ומודד מהנקודה ההיא, לא מהקריאה הקודמת.
//   * הקצב הרגעי מ-GPS קופץ. מחשבים אותו על חלון של כמה עשרות שניות.
//   * זמן נטו (בלי רמזורים) הוא מה שמעניין בריצה עירונית, ולכן יש השהיה
//     אוטומטית — אבל המרחק ממשיך להצטבר, כי כן זזת.
//   * הגובה מ-GPS רועש; צבירת עלייה נעשית רק על שינוי משמעותי.
// ---------------------------------------------------------------------------

/** קריאה גולמית מה-GPS */
export type Fix = {
  lat: number
  lon: number
  /** חותמת זמן במילישניות */
  t: number
  /** רדיוס הדיוק במטרים, כפי שהדפדפן מדווח */
  acc?: number
  /** גובה במטרים */
  alt?: number
  /** מהירות במטר לשנייה, כשהמכשיר מדווח אותה */
  spd?: number
}

/** נקודה שנשמרת במסלול: קו רוחב, קו אורך, שניות מתחילת הריצה, גובה */
export type Pt = [number, number, number, number?]

export type Split = {
  /** מספר הקילומטר (1 = הראשון) */
  km: number
  /** שניות שלקח */
  sec: number
  /** עלייה נטו במטרים בקילומטר הזה */
  gainM?: number
}

export type RunState = {
  startedAt: number
  /** המסלול עד עכשיו */
  pts: Pt[]
  /** מרחק מצטבר במטרים */
  meters: number
  /** זמן נטו בשניות — בלי העצירות */
  movingSec: number
  /** זמן מוחלט בשניות מתחילת הריצה */
  elapsedSec: number
  splits: Split[]
  gainM: number
  /** האם המשתמש עצר ידנית */
  paused: boolean
  /** האם המנוע מזהה עמידה במקום (רמזור, מדרגות) */
  still: boolean
  /** הקריאה האחרונה שהתקבלה */
  last?: Fix
  /** גובה אחרון שנספר לצבירה */
  lastAlt?: number
  /** מטרים בתוך הקילומטר הנוכחי */
  kmMeters: number
  /** שניות בתוך הקילומטר הנוכחי */
  kmSec: number
  /** עלייה בתוך הקילומטר הנוכחי */
  kmGain: number
  /** כמה קריאות נדחו, לפי סיבה — לאבחון בסיום */
  rejected: { weak: number; jump: number; tiny: number }
  /** הקריאות האחרונות (חלון קצר) — לזיהוי תנועה אמיתית מול רעש */
  recent: Fix[]
  /**
   * הקריאה האחרונה שהמרחק שלה נספר. כשיוצאים מעצירה (רמזור, או תחילת ריצה
   * שבה החלון עוד לא הכריע) המרחק נמדד מכאן ולא מהקריאה הקודמת — אחרת כל
   * יציאה מעצירה מאבדת את המטרים שבהם באמת זזת.
   */
  lastCounted?: Fix
  /** המיקום המוחלק — עליו נעשים כל החישובים */
  smooth?: { lat: number; lon: number; t: number }
}

export type Limits = {
  /** קריאה עם רדיוס דיוק גרוע מזה נזרקת */
  maxAccuracy: number
  /** מהירות שאי אפשר לרוץ בה (מ׳/ש׳) — קפיצת GPS */
  maxSpeed: number
  /** תזוזה קטנה מזו נחשבת רעש ולא מרחק */
  minStep: number
  /** מתחת למהירות הזו נחשבים עומדים */
  stillSpeed: number
  /** שינוי גובה קטן מזה לא נצבר */
  altStep: number
}

export const LIMITS: Limits = {
  // רדיוס דיוק גרוע מזה — הקריאה לא אמינה מספיק כדי למדוד איתה מרחק
  maxAccuracy: 25,
  maxSpeed: 8,
  /**
   * שער המרחק: צוברים רק כשהתרחקת כך וכך מהנקודה האחרונה שנספרה. זה הפרמטר
   * שקובע את הדיוק — נמוך מדי והרעש נספר כמרחק, גבוה מדי ופינות נחתכות.
   * חמישה מטרים הוא האיזון שנמדד על מסלולים בצורות שונות.
   */
  minStep: 5,
  stillSpeed: 0.6,
  altStep: 3,
}

/** קבוע הזמן של החלקת המיקום, בשניות */
const EMA_TAU = 2

/**
 * תנועה נמדדת על חלון ולא על צעד בודד. בעמידה ברמזור ה-GPS מקפץ 3–5 מטר
 * בכל שנייה, וכל קפיצה כזו "נראית" כמו ריצה — כך נולדים הקילומטרים שלא רצת.
 * על פני 12 שניות, לעומת זאת, עמידה היא עמידה: התזוזה נטו אפסית.
 */
const WINDOW_MS = 12_000
const WINDOW_MIN_MS = 6_000
const WINDOW_MIN_M = 10

/**
 * מטרים למעלה של קו רוחב ושל קו אורך, בקו הרוחב הנתון. הנוסחאות הן הקירוב
 * המקובל לאליפסואיד WGS84. חישוב על כדור בעל רדיוס ממוצע נותן כאן טעות של
 * כ-0.55% — 55 מטר בכל 10 ק״מ, ועוד לכיוון אחד בלבד. בריצה זה ההבדל בין
 * "רצתי 10" ל"רצתי 10.05" בכל ריצה, תמיד באותו כיוון, וזה מצטבר בסטטיסטיקה.
 */
export function metersPerDegree(lat: number): { lat: number; lon: number } {
  const p = (lat * Math.PI) / 180
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  }
}

/**
 * מרחק בין שתי נקודות במטרים. במרחקים של ריצה (מטרים עד קילומטרים) הטלה
 * מקומית סביב קו הרוחב הממוצע מדויקת יותר מהוורסין על כדור, וגם זולה יותר.
 */
export function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const m = metersPerDegree((aLat + bLat) / 2)
  const dy = (bLat - aLat) * m.lat
  const dx = (bLon - aLon) * m.lon
  return Math.hypot(dx, dy)
}

/** השם ההיסטורי — אותו חישוב */
export const haversine = metersBetween

export function emptyRun(startedAt: number): RunState {
  return {
    startedAt,
    pts: [],
    meters: 0,
    movingSec: 0,
    elapsedSec: 0,
    splits: [],
    gainM: 0,
    paused: false,
    still: false,
    kmMeters: 0,
    kmSec: 0,
    kmGain: 0,
    rejected: { weak: 0, jump: 0, tiny: 0 },
    recent: [],
  }
}

/** פער ארוך מזה לא מגושר — GPS שנעלם לדקה לא מייצר קו ישר מומצא */
const BRIDGE_MAX_MS = 30_000

/**
 * החלקה מעריכית עם קבוע זמן: משקל הקריאה החדשה תלוי בזמן שעבר, ולכן היא
 * עובדת גם כשהקריאות מגיעות בקצב לא אחיד (וזה המצב בדפדפן).
 */
export function smoothFix(prev: { lat: number; lon: number; t: number } | undefined, fix: Fix, tau = EMA_TAU): { lat: number; lon: number; t: number } {
  if (!prev) return { lat: fix.lat, lon: fix.lon, t: fix.t }
  const dt = Math.max(0, (fix.t - prev.t) / 1000)
  const a = 1 - Math.exp(-dt / tau)
  return { lat: prev.lat + (fix.lat - prev.lat) * a, lon: prev.lon + (fix.lon - prev.lon) * a, t: fix.t }
}

/**
 * האם החלון האחרון מעיד על תנועה אמיתית. שני מבחנים, ושניהם נחוצים:
 *   1. מרחק נטו — עמידה לא מזיזה אותך.
 *   2. **ישירוּת**: תנועה אמיתית היא כיוונית, ורעש מתפתל. היחס בין המרחק
 *      נטו (מהתחלת החלון לסופו) לבין אורך המסלול בתוכו הוא קרוב ל-1 בריצה,
 *      ונמוך ברעש. בלי המבחן הזה, הטיה מתמשכת של ה-GPS בעמידה ממציאה
 *      מאות מטרים.
 */
export function windowMoving(recent: Fix[], lim: Limits = LIMITS): boolean {
  if (recent.length < 2) return false
  const a = recent[0]
  const b = recent[recent.length - 1]
  const span = b.t - a.t
  const net = metersBetween(a.lat, a.lon, b.lat, b.lon)
  let path = 0
  for (let i = 1; i < recent.length; i++) path += metersBetween(recent[i - 1].lat, recent[i - 1].lon, recent[i].lat, recent[i].lon)
  const straight = path > 0 ? net / path : 0
  if (span >= WINDOW_MIN_MS) return net >= WINDOW_MIN_M && straight >= 0.55
  // חלון קצר מדי להכרעה (תחילת ריצה): רק תזוזה חד-משמעית נחשבת
  return net >= 10 && straight >= 0.6
}

export type FixVerdict = 'first' | 'ok' | 'still' | 'weak' | 'jump' | 'tiny' | 'back'

/**
 * האם לקבל את הקריאה, ולמה לא. מופרד מהעדכון כדי שאפשר יהיה לבדוק כל סיבה
 * בנפרד ולהציג למשתמש מונה דחיות אמיתי.
 */
export function judgeFix(state: RunState, fix: Fix, lim: Limits = LIMITS): FixVerdict {
  if (fix.acc !== undefined && fix.acc > lim.maxAccuracy) return 'weak'
  const prev = state.last
  if (!prev) return 'first'
  const dt = (fix.t - prev.t) / 1000
  if (dt <= 0) return 'back'
  const raw = metersBetween(prev.lat, prev.lon, fix.lat, fix.lon)
  if (raw / dt > lim.maxSpeed) return 'jump'
  const recent = trimWindow([...state.recent, fix])
  if (!windowMoving(recent, lim)) return 'still'
  // המרחק נמדד על המיקום המוחלק ומהנקודה האחרונה שנספרה — כך שער של חמישה
  // מטרים מסנן רעש בלי לחתוך ריצה איטית
  const s = smoothFix(state.smooth, fix)
  const from = state.lastCounted ?? prev
  return metersBetween(from.lat, from.lon, s.lat, s.lon) < lim.minStep ? 'tiny' : 'ok'
}

function trimWindow(xs: Fix[]): Fix[] {
  const last = xs[xs.length - 1]
  const out = xs.filter((f) => last.t - f.t <= WINDOW_MS)
  return out.length ? out : [last]
}

/**
 * מוסיף קריאה למצב הריצה. מחזיר מצב חדש (ולא משנה את הקיים) כדי שהמסך
 * יוכל להסתמך על השוואת הפניות, ושהבדיקות יוכלו להריץ מסלול שלם בשורה אחת.
 */
export function addFix(state: RunState, fix: Fix, lim: Limits = LIMITS): RunState {
  const verdict = judgeFix(state, fix, lim)
  if (verdict === 'weak' || verdict === 'jump' || verdict === 'back') {
    const rejected = { ...state.rejected }
    if (verdict === 'weak') rejected.weak++
    if (verdict === 'jump') rejected.jump++
    return { ...state, rejected }
  }

  const elapsedSec = Math.max(0, Math.round((fix.t - state.startedAt) / 1000))
  const sec = Math.max(0, (fix.t - (state.last?.t ?? fix.t)) / 1000)

  const recent = trimWindow([...state.recent, fix])
  const smooth = smoothFix(state.smooth, fix)

  if (verdict === 'first') {
    return {
      ...state,
      last: fix,
      lastCounted: fix,
      smooth,
      lastAlt: fix.alt,
      elapsedSec,
      recent,
      pts: [[round6(fix.lat), round6(fix.lon), elapsedSec, fix.alt === undefined ? undefined : Math.round(fix.alt)]],
    }
  }

  // עמידה במקום: הזמן המוחלט רץ, הזמן נטו לא, והמרחק לא מנופח ברעש
  if (verdict === 'still' || state.paused) {
    // בהשהיה ידנית נקודת הספירה נעה איתך: מי שעצר, נסע ולחץ "המשך" לא יקבל
    // את הדרך במכונית כמרחק ריצה.
    return {
      ...state,
      last: fix,
      lastCounted: state.paused ? fix : state.lastCounted,
      smooth: state.paused ? { lat: fix.lat, lon: fix.lon, t: fix.t } : smooth,
      elapsedSec,
      recent,
      still: verdict === 'still' && !state.paused,
    }
  }
  if (verdict === 'tiny') {
    // עוד לא עברנו את שער המרחק. גם הזמן לא נספר כאן — הוא ייספר במלואו
    // כשהשער ייפתח, מהנקודה האחרונה שנספרה. אחרת אותן שניות נספרות פעמיים,
    // והקצב נראה איטי בחצי.
    const t = { ...state.rejected, tiny: state.rejected.tiny + 1 }
    return { ...state, last: fix, smooth, elapsedSec, recent, still: false, rejected: t }
  }

  const prev = state.last!
  const from = state.lastCounted ?? prev
  // גישור: המרחק מהנקודה האחרונה שנספרה, אלא אם עבר יותר מדי זמן (GPS שנעלם)
  const bridged = fix.t - from.t <= BRIDGE_MAX_MS
  const d = bridged
    ? metersBetween(from.lat, from.lon, smooth.lat, smooth.lon)
    : metersBetween(state.smooth?.lat ?? prev.lat, state.smooth?.lon ?? prev.lon, smooth.lat, smooth.lon)
  // כמה זמן לזקוף לזמן נטו: אם הפער שגושר נעשה בתנועה (תחילת ריצה, או
  // חלון שהתלבט) — כל הפער. אם הוא היה עמידה אמיתית (רמזור) — רק הצעד
  // האחרון, אחרת דקה בצומת הייתה נכנסת לקצב.
  const gapSec = (fix.t - from.t) / 1000
  const useSec = bridged && gapSec > 0 && d / gapSec >= lim.stillSpeed ? gapSec : sec
  let gain = 0
  let lastAlt = state.lastAlt
  if (fix.alt !== undefined) {
    if (lastAlt === undefined) lastAlt = fix.alt
    else if (fix.alt - lastAlt >= lim.altStep) {
      gain = fix.alt - lastAlt
      lastAlt = fix.alt
    } else if (lastAlt - fix.alt >= lim.altStep) {
      lastAlt = fix.alt
    }
  }

  let meters = state.meters + d
  let kmMeters = state.kmMeters + d
  let kmSec = state.kmSec + useSec
  let kmGain = state.kmGain + gain
  const splits = state.splits

  // סגירת קילומטר: הזמן מחולק לפי המרחק בתוך הקטע, לא "בערך"
  const out: Split[] = splits
  let newSplits = out
  while (kmMeters >= 1000) {
    const over = kmMeters - 1000
    const share = d > 0 ? (d - over) / d : 1
    const secToLine = kmSec - useSec + useSec * share
    newSplits = [...newSplits, { km: newSplits.length + 1, sec: Math.round(secToLine), gainM: Math.round(kmGain) }]
    kmSec = useSec * (1 - share)
    kmGain = 0
    kmMeters = over
  }

  return {
    ...state,
    last: fix,
    // נקודת הספירה היא המיקום המוחלק, כדי שהשער הבא יימדד מאותו מרחב
    lastCounted: { lat: smooth.lat, lon: smooth.lon, t: fix.t, acc: fix.acc, alt: fix.alt },
    smooth,
    lastAlt,
    elapsedSec,
    recent,
    still: false,
    meters,
    movingSec: state.movingSec + useSec,
    gainM: state.gainM + gain,
    splits: newSplits,
    kmMeters,
    kmSec,
    kmGain,
    pts: [...state.pts, [round6(smooth.lat), round6(smooth.lon), elapsedSec, fix.alt === undefined ? undefined : Math.round(fix.alt)]],
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

// -- קצב ותצוגה ------------------------------------------------------------------

/** קצב בדקות לקילומטר. 0 כשאין מספיק נתונים — המסך מציג מקף במקום מספר מומצא. */
export function pace(meters: number, sec: number): number {
  if (meters < 20 || sec <= 0) return 0
  return sec / 60 / (meters / 1000)
}

/**
 * הקצב הרגעי: על פני החלון האחרון. נמדד שקצב על חלון של חמש שניות מקפץ
 * בין 4:42 ל-6:41 כשרצים בדיוק 5:30 — כלומר הוא תיאטרון. חלון של דקה נותן
 * 5:19–5:45, וזה כבר מספר שאפשר לרוץ לפיו.
 */
export function livePace(pts: Pt[], windowSec = 60): number {
  if (pts.length < 2) return 0
  const last = pts[pts.length - 1]
  let i = pts.length - 1
  while (i > 0 && last[2] - pts[i - 1][2] < windowSec) i--
  if (i === pts.length - 1) return 0
  let m = 0
  for (let k = i; k < pts.length - 1; k++) m += metersBetween(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])
  return pace(m, last[2] - pts[i][2])
}

/**
 * דקות לק״מ -> "5:42". 0 -> "--".
 * `round5` מעגל לחמש שניות — לקצב החי, שאין בו דיוק של שנייה בודדת.
 */
export function fmtPace(minPerKm: number, round5 = false): string {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--'
  let total = Math.round(minPerKm * 60)
  if (round5) total = Math.round(total / 5) * 5
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** שניות -> "42:07" או "1:05:12" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`
}

/** מטרים -> "7.42" (ק״מ, שתי ספרות) */
export function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(2)
}

// -- שמירה --------------------------------------------------------------------

/**
 * פישוט Ramer–Douglas–Peucker. ריצה של שעה ב-1Hz היא 3,600 נקודות ו-~150KB;
 * אחרי פישוט ב-8 מטר נשארות כמה מאות, המסלול על המפה נראה זהה, והמחסן
 * (וגם האחסון בטלפון) לא מתנפחים עם כל ריצה.
 */
export function simplify(pts: Pt[], toleranceM = 8): Pt[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let far = -1
    let best = toleranceM
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegment(pts[i], pts[a], pts[b])
      if (d > best) {
        best = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = true
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** מרחק נקודה מקטע, במטרים (מישורי — מדויק דיו במרחקים של ריצה) */
export function pointToSegment(p: Pt | [number, number], a: Pt | [number, number], b: Pt | [number, number]): number {
  const m = metersPerDegree(a[0])
  const mPerDegLat = m.lat
  const mPerDegLon = m.lon
  const px = (p[1] - a[1]) * mPerDegLon
  const py = (p[0] - a[0]) * mPerDegLat
  const bx = (b[1] - a[1]) * mPerDegLon
  const by = (b[0] - a[0]) * mPerDegLat
  const len2 = bx * bx + by * by
  if (len2 === 0) return Math.hypot(px, py)
  let t = (px * bx + py * by) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - t * bx, py - t * by)
}

/** המרחק מהמסלול המתוכנן, והקטע הקרוב ביותר — ל"סטית מהמסלול" ולהתקדמות */
export function nearestOnRoute(poly: Array<[number, number]>, lat: number, lon: number): { meters: number; index: number } {
  let best = Infinity
  let index = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const d = pointToSegment([lat, lon], poly[i], poly[i + 1])
    if (d < best) {
      best = d
      index = i
    }
  }
  return { meters: best, index }
}

/** אורך מסלול במטרים */
export function polyLength(poly: Array<[number, number]>): number {
  let m = 0
  for (let i = 0; i < poly.length - 1; i++) m += metersBetween(poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1])
  return m
}

/** התיבה התוחמת של קבוצת נקודות — למפה שמתאימה את עצמה */
export function bounds(pts: Array<[number, number] | Pt>): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  if (!pts.length) return null
  let minLat = 90
  let maxLat = -90
  let minLon = 180
  let maxLon = -180
  for (const p of pts) {
    if (p[0] < minLat) minLat = p[0]
    if (p[0] > maxLat) maxLat = p[0]
    if (p[1] < minLon) minLon = p[1]
    if (p[1] > maxLon) maxLon = p[1]
  }
  return { minLat, maxLat, minLon, maxLon }
}

// -- קידוד מסלול ------------------------------------------------------------------
// המסלול נשמר בתוך רשומת האימון, שמסתנכרנת למחסן ונשמרת באחסון המקומי. מסלול
// גולמי של ריצה הוא מאות קילובייטים — כאן הוא מפושט ומקודד באלגוריתם הפוליליין
// של גוגל (דיוק חמש ספרות, כמטר אחד): עשרה קילומטרים יורדים לכמה קילובייטים.

function encSigned(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1
  let out = ''
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
    n >>= 5
  }
  return out + String.fromCharCode(n + 63)
}

/** [lat,lon] -> מחרוזת קומפקטית */
export function encodePolyline(pts: Array<[number, number] | Pt>, precision = 5): string {
  const f = Math.pow(10, precision)
  let lat = 0
  let lon = 0
  let out = ''
  for (const p of pts) {
    const la = Math.round(p[0] * f)
    const lo = Math.round(p[1] * f)
    out += encSigned(la - lat) + encSigned(lo - lon)
    lat = la
    lon = lo
  }
  return out
}

/** מחרוזת -> [lat,lon] */
export function decodePolyline(str: string, precision = 5): Array<[number, number]> {
  const f = Math.pow(10, precision)
  const out: Array<[number, number]> = []
  let i = 0
  let lat = 0
  let lon = 0
  while (i < str.length) {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0
    result = 0
    do {
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lon += result & 1 ? ~(result >> 1) : result >> 1
    out.push([lat / f, lon / f])
  }
  return out
}
