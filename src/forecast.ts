// ---------------------------------------------------------------------------
// מתי זה קורה — הערכת זמן לכל מטרה בכושר.
//
// השאלה שהקובץ הזה עונה עליה: "מתי אצליח עמידת ידיים?" — לא בתחושה אלא
// מהיומן, ובצורה שאפשר להסתמך עליה לאורך חודשים.
//
// ההערכה בנויה משלוש שכבות, וכל אחת מהן קיימת כדי למנוע סוג אחר של שקר:
//
// 1. **רמה, לא שיא.** לכל אימון מחושב מספר אחד: הערך של הסט ה-n הטוב ביותר,
//    כאשר n הוא מספר הסטים שהשלב דורש. שלב שדורש 3 סטים של 20 שניות נמדד
//    מול הסט השלישי ולא מול הראשון — כי זה בדיוק תנאי המעבר. סט בודד יוצא
//    דופן לא מזיז את הרמה, ולכן גם לא את התחזית.
// 2. **שיפוע על חלון, לא הפרש בין שני אימונים.** הקצב מחושב ברגרסיה ליניארית
//    על האימונים האחרונים. אימון אחד חזק מזיז אותו מעט; אימון אחד חלש לא
//    הופך "עוד חודש" ל"עוד שנה".
// 3. **התכנסות לידע אימון.** לכל שלב יש מספר שבועות טיפוסי (`STAGE_WEEKS`).
//    התחזית האישית נחתכת לטווח סביר סביבו ואז ממוצעת איתו. המשמעות: גם
//    שבוע מצוין וגם שבוע גרוע מזיזים את התאריך בשבועות, לא בחודשים.
//
// ההערכה מתעדכנת מעצמה בכל פעם שנרשם אימון — היא מחושבת מהיומן ולא נשמרת,
// ולכן אין מצב שבו המספר על המסך ישן מהנתונים.
//
// כאן אין שום נתון אישי: רק החוקים. המספרים מגיעים מהמצב שמועבר פנימה.
// ---------------------------------------------------------------------------
import type { AppState, ID, ISODate, SetLog } from './types'
import { addDays, diffDays, today as todayISO, weekStart } from './dates'
import {
  currentStage, exerciseHistory, lastSkillDate, longestRun, runWeeks, skillDaysPerWeek, skillExIds,
} from './store'
import { HALF_ANCHORS, HALF_TRAINING_LONG_KM, baseWeeklyKm, buildWeeksTo } from './training'
import {
  PRIOR_TOUCHES_PER_WEEK, RUN_MILESTONES, RUN_WEEKLY_GROWTH, focusLadders, stageWeeks,
} from './skills'
import type { SkillLadder, StageTarget } from './skills'

/** כמה אימונים צריך לפני שמותר לדבר על קצב אישי */
const MIN_POINTS = 3
/** חלון המדידה — אימונים ישנים מזה כבר לא מתארים את הרמה של היום */
const WINDOW_WEEKS = 10
/** כמה אימונים אחרונים נכנסים לרגרסיה */
const WINDOW_POINTS = 6
/** עד כמה מותר לקצב האישי להתרחק מהידע: פי 3 מהר, פי 2.5 איטי */
const FAST_CAP = 1 / 3
const SLOW_CAP = 2.5
/** כמה מההערכה היא הקצב האישי, וכמה היא הידע הכללי */
const PERSONAL_W = 0.7
/** אי אפשר לסגור שלב בפחות משני אימונים נוספים */
const MIN_SESSIONS = 2
/** גג — מעבר לזה אין משמעות למספר, רק לכיוון */
const MAX_WEEKS = 104
/**
 * עד כמה מותר למתיחה לפי תדירות להאריך את ההערכה. בלי תקרה, חצי נגיעה
 * בשבוע הייתה מכפילה את הידע פי ארבעה והמספר היה חוזר להיות חסר משמעות.
 */
const FREQ_STRETCH_CAP = 3
/** ברירת המחדל לצמיחת הריצה הארוכה: ק״מ בשבוע עם שבוע הפחתה אחת לארבעה */
const DEFAULT_KM_WEEK = 0.75

// ---------------------------------------------------------------------------
// רמה מתוך סטים
// ---------------------------------------------------------------------------

/**
 * הרמה שהוצגה באימון אחד מול יעד מסוים: הערך של הסט ה-n הטוב ביותר, כש-n הוא
 * מספר הסטים שהשלב דורש. אם נעשו פחות סטים מהנדרש — הרמה היא 0, כי השלב
 * בהגדרתו לא נסגר בסט אחד.
 */
export function sessionLevel(sets: SetLog[] | undefined, target: StageTarget): number {
  if (!sets?.length) return 0
  const need = Math.max(1, target.sets)
  const value = (v: SetLog) =>
    target.metric === 'time' ? (v.sec ?? 0) : target.metric === 'weight' ? (v.kg ?? 0) : (v.reps ?? 0)
  const heavy = (v: SetLog) => (v.kg ?? 0) >= (target.kg ?? 0)
  const vals = sets.filter(heavy).map(value).filter((x) => x > 0).sort((a, b) => b - a)
  if (vals.length < need) return 0
  return vals[need - 1]
}

export interface LevelPoint { date: ISODate; level: number }

/**
 * הרמה בכל אימון שבו התרגילים המודדים בוצעו, מהישן לחדש.
 *
 * `since` הוא מה שמפריד בין שלב לשלב: כל השלבים נמדדים מול אותו תרגיל
 * בתוכנית, ולכן בלי חיתוך בזמן, האימונים שסגרו את השלב הקודם היו "סוגרים"
 * גם את השלב הבא — שהוא תרגיל אחר שעוד לא בוצע.
 */
export function stageLevels(
  s: AppState,
  exIds: ID[] | undefined,
  target: StageTarget | undefined,
  from: ISODate = todayISO(),
  since?: ISODate,
): LevelPoint[] {
  if (!target || !exIds?.length) return []
  const byDate = new Map<ISODate, number>()
  for (const exId of exIds) {
    for (const h of exerciseHistory(s, exId)) {
      if (diffDays(h.date, from) > WINDOW_WEEKS * 7) continue
      if (since && h.date < since) continue
      const lvl = sessionLevel(h.sets, target)
      if (lvl > (byDate.get(h.date) ?? 0)) byDate.set(h.date, lvl)
    }
  }
  return [...byDate.entries()]
    .map(([date, level]) => ({ date, level }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * מתי נכנסת לשלב: היום שאחרי האימון הראשון שסגר את תנאי המעבר של השלב
 * שלפניו. אם השלב הקודם נסגר בדרך אחרת (סומן ידנית, או לפני שהיה יומן) —
 * אין תאריך, וכל ההיסטוריה נספרת.
 */
export function stageStart(
  s: AppState,
  lad: SkillLadder,
  i: number,
  exIds: ID[],
  from: ISODate = todayISO(),
): ISODate | undefined {
  if (i <= 0) return undefined
  const prev = lad.stages[i - 1]
  if (!prev.target) return undefined
  const hit = stageLevels(s, exIds, prev.target, from).find((p) => p.level >= prev.target!.value)
  return hit ? addDays(hit.date, 1) : undefined
}

/** שיפוע ליניארי ליחידת שבוע. null כשאין מספיק נקודות או שכולן באותו יום */
export function slopePerWeek(points: LevelPoint[]): number | null {
  const pts = points.slice(-WINDOW_POINTS)
  if (pts.length < MIN_POINTS) return null
  const x = pts.map((p) => diffDays(pts[0].date, p.date) / 7)
  const y = pts.map((p) => p.level)
  const n = pts.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    den += (x[i] - mx) ** 2
  }
  if (den === 0) return null
  return num / den
}

/** כמה אימונים בשבוע נוגעים במיומנות, לפי החלון שנמדד */
export function touchesPerWeek(points: LevelPoint[], from: ISODate = todayISO()): number {
  if (!points.length) return 0
  const span = Math.max(7, diffDays(points[0].date, from))
  return (points.length / span) * 7
}

// ---------------------------------------------------------------------------
// התחזית
// ---------------------------------------------------------------------------

/**
 * `cold` — המיומנות לא מתאמנת: אין לה תרגיל בתוכנית השבועית. זה לא
 * "מעט נתונים" ולא "תקוע", ולכן אסור לו להיראות כמוהם: אין קצב, ולכן
 * אין תאריך. עד 27.9.2026 המצב הזה קיבל `prior` והוצג כתאריך אמיתי.
 */
export type Basis = 'done' | 'log' | 'prior' | 'stuck' | 'none' | 'cold'

export interface StageEta {
  stageId: string
  name: string
  /** שבועות מהיום עד סגירת השלב */
  weeks: number
  /** הטווח — מוקדם ומאוחר */
  lo: number
  hi: number
  date: ISODate
  basis: Basis
}

export interface SkillForecast {
  id: string
  name: string
  emoji: string
  goal: string
  /** אינדקס השלב הנוכחי */
  stage: number
  stageName: string
  /** הרמה באימון האחרון, ומה השלב דורש */
  level: number
  need: number
  metric?: StageTarget['metric']
  /** קצב השיפור ליחידת שבוע, כפי שנמדד */
  perWeek: number | null
  /** אימונים בשבוע שנוגעים במיומנות, כפי שנמדד ביומן */
  freq: number
  /** כמה ימים בשבוע התוכנית מודדת אותה — עובדה על התוכנית, לא על היומן */
  planned: number
  /** מתי נרשם סט אחרון בתרגיל שמודד אותה */
  lastDate?: ISODate
  /** כמה ימים עברו מאז. undefined כשאף פעם לא נרשם */
  daysSince?: number
  /** סגירת השלב הנוכחי */
  next: StageEta
  /** כל הדרך עד המטרה */
  goalWeeks: number
  goalLo: number
  goalHi: number
  goalDate: ISODate
  basis: Basis
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function eta(weeks: number, from: ISODate, lo: number, hi: number, basis: Basis, st: { id: string; name: string }): StageEta {
  const w = Math.round(clamp(weeks, 0, MAX_WEEKS))
  return {
    stageId: st.id,
    name: st.name,
    weeks: w,
    lo: Math.round(clamp(lo, 0, MAX_WEEKS)),
    hi: Math.round(clamp(hi, 0, MAX_WEEKS)),
    date: addDays(from, Math.round(w * 7)),
    basis,
  }
}

/**
 * מתי ייסגר השלב הנוכחי, ומתי תיסגר המיומנות כולה.
 *
 * השלב הנוכחי נמדד מהיומן. השלבים שאחריו עוד לא בוצעו ולכן אין להם נתונים —
 * הם מוערכים מהידע הכללי, מוכפל ב"מקדם המהירות" שלך: היחס בין הזמן שלוקח לך
 * השלב הנוכחי לבין הזמן הטיפוסי שלו, חסום ל-0.6–1.6 כדי ששלב אחד טוב לא
 * יכריז עליך פי שלושה מהר מכולם.
 */
export function skillForecast(s: AppState, lad: SkillLadder, from: ISODate = todayISO()): SkillForecast {
  const i = currentStage(s, lad)
  const st = lad.stages[i]
  const exIds = skillExIds(s, lad)
  const since = stageStart(s, lad, i, exIds, from)
  const points = stageLevels(s, exIds, st.target, from, since)
  const prior = stageWeeks(lad.id, st.id)
  const level = points.length ? points[points.length - 1].level : 0
  const need = st.target?.value ?? 0
  const freq = Math.max(0, touchesPerWeek(points, from))
  const slope = slopePerWeek(points)
  // התדירות שהמיומנות באמת מקבלת: מה שנרשם ביומן, ואם התוכנית מבטיחה
  // יותר — מה שהתוכנית מבטיחה. התוכנית היא הצפי קדימה, היומן הוא מה
  // שקרה, והגבוה מביניהם הוא ההערכה ההוגנת לשבוע הבא.
  const planned = skillDaysPerWeek(s, lad)
  const touches = Math.max(freq, planned)
  const lastDate = lastSkillDate(s, lad)
  const daysSince = lastDate ? diffDays(lastDate, from) : undefined

  let weeks = prior
  let basis: Basis = 'prior'
  if (st.target && touches <= 0 && level < need) {
    // אין תרגיל בתוכנית שמאמן את זה ואין נגיעה ביומן. אין קצב, ולכן אין
    // תאריך — המספר כאן הוא כיוון בלבד, והמסך אומר את זה במילים.
    // הבדיקה הזו קודמת ל-`none` בכוונה: "אין תרגיל שמודד" ו"לא מתאמנים
    // על זה" נראו אותו דבר על המסך, והשני הוא הרבה יותר חמור.
    basis = 'cold'
    weeks = prior * FREQ_STRETCH_CAP
  } else if (!st.target || !exIds.length) {
    // השלב עצמו בלי יעד מדיד — רק הידע הכללי, בלי להעמיד פנים שיש נתונים
    basis = 'none'
  } else if (level >= need) {
    weeks = 0
    basis = 'done'
  } else if (slope !== null && slope > 0) {
    const raw = (need - level) / slope
    weeks = PERSONAL_W * clamp(raw, prior * FAST_CAP, prior * SLOW_CAP) + (1 - PERSONAL_W) * prior
    basis = 'log'
  } else if (slope !== null) {
    // תקוע: הרמה לא עולה. לא נכון להבטיח תאריך קרוב, ולא נכון להכריז ייאוש
    weeks = prior * 1.5
    basis = 'stuck'
  } else {
    // אין מספיק אימונים לקצב אישי — הידע הכללי, מוקטן לפי כמה שכבר נסגר
    weeks = prior * (need > 0 ? clamp((need - level) / need, 0.25, 1) : 1)
    basis = 'prior'
  }

  // **מתיחה לפי תדירות.** `STAGE_WEEKS` מניח שתי נגיעות בשבוע
  // (`PRIOR_TOUCHES_PER_WEEK`), ולכן המספר שלו נכון רק למי שבאמת נוגע
  // פעמיים. כשנוגעים פעם אחת — זה לוקח בערך פי שניים. זה חל רק על
  // הערכות שמקורן בידע הכללי: ב-`log` הקצב כבר נמדד על ציר זמן אמיתי,
  // והוא סופג את התדירות בתוכו.
  if ((basis === 'prior' || basis === 'none') && touches > 0 && touches < PRIOR_TOUCHES_PER_WEEK) {
    weeks *= Math.min(FREQ_STRETCH_CAP, PRIOR_TOUCHES_PER_WEEK / touches)
  }

  // רצפה: גם מי שקרוב מאוד צריך עוד שני אימונים כדי שזה ייספר
  if (weeks > 0) weeks = Math.max(weeks, MIN_SESSIONS / Math.max(0.5, touches || 1))

  const speed = basis === 'log' || basis === 'stuck' ? clamp(weeks / Math.max(1, prior), 0.6, 1.6) : 1
  let rest = 0
  for (let k = i + 1; k < lad.stages.length; k++) rest += stageWeeks(lad.id, lad.stages[k].id) * speed

  const next = eta(weeks, from, weeks * 0.7, weeks * 1.5, basis, st)
  const goalWeeks = Math.round(clamp(weeks + rest, 0, MAX_WEEKS))
  return {
    id: lad.id,
    name: lad.name,
    emoji: lad.emoji,
    goal: lad.goal,
    stage: i,
    stageName: st.name,
    level,
    need,
    metric: st.target?.metric,
    perWeek: slope,
    freq: Math.round(freq * 10) / 10,
    planned,
    lastDate,
    daysSince,
    next,
    goalWeeks,
    goalLo: Math.round(goalWeeks * 0.75),
    goalHi: Math.round(clamp(goalWeeks * 1.6, 0, MAX_WEEKS)),
    goalDate: addDays(from, goalWeeks * 7),
    basis,
  }
}

/**
 * התחזית למיומנויות שבמוקד.
 *
 * למה לא לכולן, כשההתקדמות כן נספרת מכולן: תחזית נשענת על קצב שנמדד מהיומן,
 * ולמטרה שאין לה תרגיל בתוכנית אין קצב — התאריך שיצא לה יהיה המקסימום הקבוע,
 * כלומר מספר שנראה כמו נתון ואינו נתון. מוטב לא להבטיח תאריך למה שלא מתאמנים
 * עליו עדיין.
 */
export function fitnessForecast(s: AppState, from: ISODate = todayISO()): SkillForecast[] {
  return focusLadders().map((lad) => skillForecast(s, lad, from))
}

// ---------------------------------------------------------------------------
// ריצה
// ---------------------------------------------------------------------------

export interface RunEta {
  km: number
  name: string
  weeks: number
  date: ISODate
}

export interface RunForecast {
  best: number
  /** הקצב שבו הריצה הארוכה גדלה בפועל, ק״מ לשבוע */
  growth: number
  /** הנפח השבועי האחרון שנסגר */
  weekKm: number
  items: RunEta[]
  goalDate?: ISODate
}

/**
 * מתי כל מרחק ייפול.
 *
 * **התחזית מריצה את הסולם שהתוכנית בונה בפועל** (`buildWeeksTo` ב-training.ts),
 * ולא נוסחה משלה. לכל מיילסטון שני תנאים, ושניהם נדרשים: הריצה הארוכה
 * שמגיעה למרחק, והנפח השבועי שמחזיק אותו (`weekKm` בטבלת המיילסטונים).
 *
 * למה זה חשוב, ולמה זה היה שבור: קודם חושב כאן `log(יעד/נפח)/log(1.1)` —
 * כלומר 10% בשבוע בלי הפסקה — ויצא "חצי מרתון בעוד 14 שבועות", בזמן
 * שהסולם שמייצר את השבוע מגיע באותם 14 שבועות ל-20 ק״מ בשבוע ולארוכה של
 * 9 ק״מ. הסולם האמיתי כולל שבוע ירידה אחד לארבעה ושלושה שבועות פתיחה
 * בחצי הקצב, ולכן הוא איטי מהנוסחה.
 *
 * **המרוץ עצמו הוא שבועיים אחרי שבוע הבנייה האחרון** — התחדדות ושבוע מרוץ.
 * ולארוכה אין צורך להגיע ל-21.1 באימון: היעד הוא `HALF_TRAINING_LONG_KM`
 * (18 ק״מ), כמו שכתוב בטבלת המיילסטונים עצמה.
 */
export function runForecast(s: AppState, from: ISODate = todayISO()): RunForecast {
  const best = longestRun(s).km
  // הארוכה שהגוף עשה בחודש האחרון — הבסיס שהסולם מתחיל ממנו, ולא שיא
  // מלפני חצי שנה.
  const startLongKm = longestRun(s, 30, from).km || best
  // הנפח שממנו בונים הוא **אותו נפח שהתוכנית בונה ממנו** (`baseWeeklyKm`).
  // השבוע הנוכחי חלקי, וביום ראשון בבוקר הוא אפס.
  const weekKm = baseWeeklyKm(runWeeks(s), weekStart(from))
  // הקצב שנמדד בפועל נשאר מוצג — הוא אומר משהו על החודשיים האחרונים — אבל
  // הוא כבר לא זה שקובע את התאריך: ריצה אחת שגדלה ב-3 ק״מ מייצרת שיפוע של
  // ק״מ בשבוע, ואי אפשר להחזיק אותו לחצי שנה.
  const byWeek = new Map<ISODate, number>()
  for (const w of s.workouts ?? []) {
    if (w.deleted || w.kind !== 'run' || !w.km) continue
    if (diffDays(w.date, from) > WINDOW_WEEKS * 7) continue
    const ws = weekStart(w.date)
    if (w.km > (byWeek.get(ws) ?? 0)) byWeek.set(ws, w.km)
  }
  const pts: LevelPoint[] = [...byWeek.entries()]
    .map(([date, level]) => ({ date, level }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const measured = slopePerWeek(pts)
  // התקרה: 10% מהנפח השבועי, ולעולם לא יותר מק״מ בשבוע
  const cap = Math.min(1, Math.max(0.5, (weekKm || best) * RUN_WEEKLY_GROWTH))
  const growth = clamp(measured ?? DEFAULT_KM_WEEK, 0.25, cap)
  const start = { startKm: weekKm || best, startLongKm }
  const items = RUN_MILESTONES.filter((m) => m.km > best).map((m) => {
    // לחצי מרתון אין צורך לרוץ 21 באימון — היעד הוא 18, ואחריו התחדדות
    // ושבוע מרוץ.
    const race = m.km >= HALF_ANCHORS.longKm
    const build = buildWeeksTo({ longKm: Math.min(m.km, HALF_TRAINING_LONG_KM), weekKm: m.weekKm }, start)
    const w = Math.round(clamp(build + (race ? 2 : 0), 1, MAX_WEEKS))
    return { km: m.km, name: m.name, weeks: w, date: addDays(from, w * 7) }
  })
  return {
    best,
    growth: Math.round(growth * 100) / 100,
    weekKm,
    items,
    goalDate: items.length ? items[items.length - 1].date : undefined,
  }
}

// ---------------------------------------------------------------------------
// תצוגה
// ---------------------------------------------------------------------------

/** טקסט קצר להערכה: קרוב — בשבועות, רחוק — בחודש */
export function etaText(weeks: number): string {
  if (weeks <= 0) return 'עכשיו'
  if (weeks === 1) return 'עוד שבוע'
  if (weeks === 2) return 'עוד שבועיים'
  if (weeks <= 10) return `עוד ${weeks} שבועות`
  const months = Math.round(weeks / 4.345)
  if (months <= 2) return `עוד ${months} חודשים`
  if (weeks >= MAX_WEEKS) return 'יותר משנתיים'
  return `עוד כ-${months} חודשים`
}

/** מה ההערכה נשענת עליו, במשפט */
export function basisText(b: Basis): string {
  if (b === 'done') return 'התנאי כבר נסגר — השלב הבא'
  if (b === 'log') return 'לפי הקצב שלך ביומן'
  if (b === 'stuck') return 'הרמה לא עלתה לאחרונה — ההערכה שמרנית'
  if (b === 'cold') return 'אין תרגיל בתוכנית שמאמן את זה — אין קצב ואין תאריך'
  if (b === 'none') return 'אין תרגיל שמודד — הערכה כללית'
  return 'עוד מעט נתונים — הערכה כללית'
}
