// ---------------------------------------------------------------------------
// המעבר הלילי — מה משתנה בתוכנית אחרי מה שבאמת קרה.
//
// למה קובץ ולא הנחיה לסוכן: "תסתכל על האימון ותחליט" מייצר החלטה אחרת בכל
// לילה על אותם נתונים. כאן ההחלטה נגזרת מהיומן בכללים כתובים — אותו קלט,
// אותה החלטה — והסוכן הלילי מקבל אותה מוכנה יחד עם הפקודה שמבצעת אותה
// (`patchExercise`, `setSkill`), ותפקידו לאשר, לנסח, ולטפל במה שהכללים
// לא מכסים. מה שהוא כן מחליט — נשאר ניתן לביטול בלחיצה.
//
// חמישה כללים שמעצבים את כל הקובץ, וכולם נלמדו מהדרך שבה מערכות כאלה
// נכשלות:
//
//   1. **א-סימטריה.** מהירים להוריד, איטיים להעלות. הורדה שגויה עולה
//      אימון אחד; העלאה שגויה עולה חודש.
//   2. **היסטרזיס.** שום מצב לא משתנה על נקודה אחת. שגיאת הדיווח העצמי
//      היא ±1.45 חזרות, ורעש המדידה במשקל מוערך הוא 3–5% — ולכן תקיעוּת
//      היא שלושה אימונים, ושינוי מתחת ל-5% הוא רעש.
//   3. **בקרת טלטלה.** שינוי מבני אחד לתרגיל בשלושה שבועות, ולכל היותר
//      שניים בכל התוכנית בשבוע. מערכת שמשנה שני דברים ביחד לא יכולה
//      לדעת מה עבד, והמשתמש מרגיש שהתוכנית מתנדנדת.
//   4. **טקסט חופשי הוא לא מדידה.** זיהוי מילים בהערה יכול לטעות, ולכן
//      הדבר היחיד שפועל לבדו הוא **מילת כאב** — שם מחיר הטעות א-סימטרי.
//   5. **הקשר לפני מספר.** תרגיל רגליים ב-24 השעות שאחרי ריצה קשה ייקרא
//      נמוך מסיבות שאינן כוח. מספר כזה לא מפעיל החלטה.
// ---------------------------------------------------------------------------
import type { AppState, Exercise, ExMetric, ID, ISODate, SetLog, WorkoutDay } from './types'
import { addDays, diffDays, logicalDate, today as todayISO } from './dates'
import { alive, exerciseHistory, runWeeks, workoutDayOn } from './store'
import { SKILL_LADDERS, matchesSkill } from './skills'
import type { SkillLadder, SkillStage } from './skills'
import { TENDON_BUDGET, paces, vdot } from './training'

// -- מה שההערה אומרת ----------------------------------------------------------

export type Signal = 'pain' | 'hard' | 'easy' | 'tired' | 'sick'

/** אזור הגוף שמילת הכאב מצביעה עליו — ממנו נגזר מה מחזיקים השבוע */
export type Area = 'elbow' | 'shoulder' | 'knee' | 'shin' | 'back' | 'other'

export const AREA_NAME: Record<Area, string> = {
  elbow: 'מרפק',
  shoulder: 'כתף',
  knee: 'ברך',
  shin: 'שוק / אכילס',
  back: 'גב תחתון',
  other: 'כאב שלא צוין אזור',
}

const WORDS: Array<{ sig: Signal; area?: Area; re: RegExp }> = [
  // כאב — כל אחת מהן פועלת לבדה
  { sig: 'pain', area: 'elbow', re: /מרפק|אפיקונדיל|טניס אלבו|גולף אלבו/ },
  { sig: 'pain', area: 'shoulder', re: /כתף|כתפיים כואב|רוטטור|שרוול מסובב/ },
  { sig: 'pain', area: 'knee', re: /ברך|ברכיים|פיקה/ },
  { sig: 'pain', area: 'shin', re: /אכילס|שוקיים|פלנטר|כף רגל|קרסול/ },
  { sig: 'pain', area: 'back', re: /גב תחתון|מותן|דיסק/ },
  { sig: 'pain', area: 'other', re: /כאב|כואב|צורב|צריבה|דקירה|נתפס|תפס לי|פציעה/ },
  // עומס — אלה רק מטים החלטה שהמספרים כבר נוטים אליה
  { sig: 'hard', re: /קשה מאוד|כבד מדי|לא הצלחתי|נשברתי|בקושי|לא סיימתי/ },
  { sig: 'easy', re: /קל מדי|היה קל|נשאר לי|יכולתי עוד|בקלות/ },
  { sig: 'tired', re: /עייף|מותש|לא ישנתי|שינה גרועה|אפס אנרגיה|סחוט/ },
  { sig: 'sick', re: /חולה|שפעת|חום|הצטננ|כאב גרון|וירוס/ },
]

/**
 * מה שההערה מדווחת. מחזיר גם את האזור, כי "כואב המרפק" ו"כואבת הברך"
 * מובילים לשתי החלטות שונות לגמרי.
 *
 * שלילה נלקחת בחשבון במפורש: "בלי כאב" ו"היום לא כאב" הן בדיוק ההערות
 * שכותבים אחרי שבוע של כאב, והן היו נתפסות כדיווח על כאב.
 */
export function noteSignals(text?: string): Array<{ sig: Signal; area?: Area }> {
  const t = (text ?? '').trim()
  if (!t) return []
  const hits = WORDS.map((w) => ({ w, at: w.re.exec(t)?.index ?? -1 }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)

  const out: Array<{ sig: Signal; area?: Area }> = []
  const negated: number[] = []
  for (const { w, at } of hits) {
    // שלילה: המילה שלפני. "בלי כאב", "לא כאב"
    const before = t.slice(Math.max(0, at - 24), at)
    let off = /(^|\s)(בלי|ללא|אין|לא)\s*\S*\s*$/.test(before)
    // והמשך אותה פסוקית: ב"לא כאב המרפק" השלילה חלה גם על "מרפק",
    // שיושב ארבעה תווים אחרי המילה שכבר נשללה
    if (!off && negated.some((n) => at - n <= 12)) off = true
    if (off) {
      negated.push(at)
      continue
    }
    if (!out.some((x) => x.sig === w.sig && x.area === w.area)) out.push({ sig: w.sig, area: w.area })
  }
  return out
}

// -- מה שהסטים אומרים ---------------------------------------------------------

/** טווח החזרות כפי שנכתב בתוכנית — "8-10" → [8,10], "15" → [15,15] */
export function repRange(reps?: string): [number, number] | null {
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(reps ?? '')
  if (m) return [Number(m[1]), Number(m[2])]
  const one = /(\d+)/.exec(reps ?? '')
  return one ? [Number(one[1]), Number(one[1])] : null
}

const valueOf = (v: SetLog, metric: ExMetric): number => (metric === 'time' ? (v.sec ?? 0) : (v.reps ?? 0))
const topKg = (sets: SetLog[]): number => Math.max(0, ...sets.map((x) => x.kg ?? 0))

/**
 * הקפיצה הבאה במשקל. היא אחוז ולא מספר קבוע: 2.5 ק״ג על חתירה של 20 הם
 * 12%, ועל לחיצת רגליים של 200 הם 1.25% — אותו מספר, שתי משמעויות. בפועל
 * מעגלים למה שיש במתלה.
 */
export function nextLoad(kg: number, metric: ExMetric): number {
  if (metric === 'bodyweight') return kg < 5 ? 2.5 : Math.round(kg * 0.07 * 2) / 2
  return kg <= 20 ? 1.25 : kg <= 60 ? 2.5 : 5
}

/** הרמה באימון אחד: הסט ה-n הטוב, כש-n הוא מספר הסטים שהתוכנית מבקשת */
export function level(sets: SetLog[], need: number, metric: ExMetric): number {
  const vals = sets
    .map((x) => (metric === 'weight' || metric === 'bodyweight' ? (x.kg ?? 0) * 100 + (x.reps ?? 0) : valueOf(x, metric)))
    .sort((a, b) => b - a)
  return vals.length >= need ? vals[need - 1] : 0
}

// -- ההחלטה -------------------------------------------------------------------

export type Verdict = 'progress' | 'hold' | 'back-off' | 'advance' | 'watch'

export const VERDICT_LABEL: Record<Verdict, string> = {
  progress: 'להעלות',
  hold: 'להישאר',
  'back-off': 'להוריד',
  advance: 'לעבור שלב',
  watch: 'לשים לב',
}

export type Call = {
  dayId: ID
  dayTitle: string
  exId: ID
  name: string
  metric: ExMetric
  verdict: Verdict
  /** מה משתנה, במשפט שאפשר לפעול לפיו */
  what: string
  /** על סמך מה — המספרים עצמם, לא "נראה טוב" */
  why: string
  /** האם זה שינוי מבני (שם התרגיל, שלב) — עליו חלה בקרת הטלטלה */
  structural?: boolean
  /** בדיוק מה ש-patchExercise צריך לקבל. חסר = אין מה לשנות בתוכנית */
  patch?: Partial<Exercise>
  /** שלב במיומנות שנסגר — setSkill */
  skill?: { id: string; stageId: string }
}

/** כמה אימונים בלי עלייה נחשבים תקיעוּת */
export const STALL = 3
/** כמה ימים מחזיקים אחרי מילת כאב */
export const PAIN_HOLD_DAYS = 7
/** כמה ימים בין שני שינויים מבניים באותו תרגיל */
export const CHANGE_COOLDOWN_DAYS = 21
/** כמה שינויים מבניים מותר להוציא בלילה אחד, בכל התוכנית */
export const MAX_STRUCTURAL = 2

/** האזורים שכל דפוס תנועה משלם עליהם — לתרגום מילת כאב להחזקה */
const AREA_MATCH: Record<Area, RegExp> = {
  elbow: /מתח|pull|חתירה|פולי|כפיפות מרפק|lever|planche|פלאנש|דגל|מקבילים|dip/i,
  shoulder: /עמידת ידיים|handstand|לחיצ|דחיפה|press|מקבילים|dip|הנפות|לצדדים|face pull|פייס|פלאנש|planche/i,
  knee: /לחיצת רגליים|leg press|כפיפות ברכיים|leg curl|סקוואט|מכרע|lunge|פיסטול|step|מדרגה|גשר ירך/i,
  shin: /עקבים|calf|סוליאוס|פוגו|קפיצ|plyo/i,
  back: /hollow|סירה|דגל הדרקון|leg raise|הרמות רגליים|גשר ירך|lever/i,
  other: /.^/,
}

/** מוסיף שורה להערה של תרגיל בלי לאבד את מה שכתוב בה */
function noteWith(note: string | undefined, line: string): string {
  const keep = (note ?? '').replace(/(^|\s*·\s*)הפעם [^·]*/g, '').trim()
  return keep ? `${keep} · ${line}` : line
}

/** האם מותר להוציא שינוי מבני לתרגיל הזה — או שהוא בתקופת צינון */
export function canChange(ex: Exercise, date: ISODate): boolean {
  if (!ex.changedAt) return true
  return diffDays(logicalDate(ex.changedAt), date) >= CHANGE_COOLDOWN_DAYS
}

/**
 * השם שהתרגיל מקבל כשהוא עובר שלב. הוא **חייב** להמשיך להיתפס על ידי
 * מילות הזיהוי של הסולם — אחרת המסע מאבד את התרגיל שמודד אותו, וההתקדמות
 * קופאת בלי שאף אחד ישים לב. "Advanced Tuck" לבדו לא מכיל "front lever".
 */
export function stageExName(lad: SkillLadder, stage: SkillStage): string {
  return matchesSkill(lad, stage.name) ? stage.name : `${lad.name} — ${stage.name}`
}

/**
 * ההחלטה על תרגיל אחד.
 *
 * הכלל הוא **התקדמות כפולה**: קודם מטפסים בחזרות בתוך הטווח שכתוב
 * בתוכנית, וכשכל הסטים הנדרשים נסגרו בראש הטווח — מעלים משקל וחוזרים
 * לתחתית. זה הכלל שמונע את שתי הטעויות הנפוצות: להעלות אחרי סט טוב אחד,
 * ולהישאר על אותו משקל חודשיים כי הטווח נסגר פעם אחת.
 *
 * באחיזה סטטית אין משקל, ולכן המדרגה היא **התנוחה**: כשתנאי המעבר של
 * השלב נסגר בכל הסטים — עוברים לשלב הבא במקום להוסיף שניות.
 */
export function callFor(
  s: AppState,
  day: WorkoutDay,
  ex: Exercise,
  date: ISODate,
  held: Set<Area>,
  hardRunYesterday = false,
): Call | null {
  const base = { dayId: day.id, dayTitle: day.title, exId: ex.id, name: ex.name, metric: ex.metric }
  const hist = exerciseHistory(s, ex.id).filter((h) => h.date <= date)
  if (!hist.length) return null

  // כאב באזור שהתרגיל עובר דרכו — זה גובר על כל מספר
  for (const area of held) {
    if (AREA_MATCH[area].test(ex.name)) {
      return {
        ...base,
        verdict: 'back-off',
        what: 'להחזיק את העומס, ולעצור סט לפני מה שצורב',
        why: `דווח כאב ב${AREA_NAME[area]} בשבוע האחרון, והתרגיל הזה עובר דרכו.`,
      }
    }
  }

  const last = hist[hist.length - 1]
  const sets = last.sets
  const need = Math.max(1, ex.sets ?? sets.length)
  const range = repRange(ex.reps)
  const legs = AREA_MATCH.knee.test(ex.name) || AREA_MATCH.shin.test(ex.name)

  // -- אחיזה סטטית: המדרגה היא התנוחה, לא השעון
  if (ex.metric === 'time') {
    const lad = SKILL_LADDERS.find((l) => matchesSkill(l, ex.name))
    const target = range?.[1] ?? 0
    const hit = sets.filter((x) => (x.sec ?? 0) >= target).length
    if (target && hit >= need) {
      // תנאי המעבר נסגר. שלב חדש הוא שינוי מבני, ולכן הוא דורש גם
      // אימון שני שסוגר אותו — לא קופצים שלב על אימון אחד.
      const prev = hist[hist.length - 2]
      const twice = !!prev && prev.sets.filter((x) => (x.sec ?? 0) >= target).length >= need
      const stage = lad ? stageOf(s, lad) : undefined
      const next = lad && stage !== undefined ? lad.stages[stage + 1] : undefined
      if (twice && next && canChange(ex, date)) {
        return {
          ...base,
          verdict: 'advance',
          what: `לעבור ל${next.name} — ${next.criteria}`,
          why: `${need} סטים סגרו ${target} שניות בשני אימונים רצופים. מעל זה מוסיפים מנוף ולא שניות.`,
          structural: true,
          patch: { name: stageExName(lad!, next), reps: next.criteria, changedAt: Date.now() },
          skill: { id: lad!.id, stageId: next.id },
        }
      }
      return {
        ...base,
        verdict: twice ? 'advance' : 'progress',
        what: twice ? 'לעבור לגרסה קשה יותר של התנוחה' : `${need}×${target + 2} שניות`,
        why: twice
          ? 'תנאי המעבר נסגר פעמיים ברצף.'
          : `${hit} סטים החזיקו ${target} שניות. מוסיפים שתי שניות, וכשזה נסגר פעמיים ברצף — עוברים שלב.`,
        patch: twice ? undefined : { reps: `${target + 2} שניות` },
      }
    }
    return stallOrHold(base, hist, need, ex.metric, `הטווח (${ex.reps ?? '—'}) עוד לא נסגר בכל הסטים`, legs, hardRunYesterday)
  }

  // -- חזרות ומשקל: התקדמות כפולה
  if (!range) return null
  const kg = topKg(sets)
  const atTop = sets.filter((x) => (x.kg ?? 0) >= kg && valueOf(x, ex.metric) >= range[1]).length
  if (atTop >= need) {
    // בתרגיל שנמדד בחזרות בלבד (קפיצות, שכיבות סמיכה בבית) אין משקל
    // להוסיף, ולכן המדרגה היא חזרות — ובקפיצות היא גם לא אמורה לטפס
    // בלי גבול, כי המינון שנמדד הוא ארבעים נגיעות.
    if (ex.metric === 'reps') {
      return {
        ...base,
        verdict: 'progress',
        what: `${need}×${range[1] + 2}`,
        why: `${atTop} סטים סגרו ${range[1]} חזרות — ראש הטווח.`,
        patch: { reps: `${range[1] + 2}` },
      }
    }
    const step = nextLoad(kg, ex.metric)
    const bw = ex.metric === 'bodyweight'
    return {
      ...base,
      verdict: 'progress',
      what: bw ? `להוסיף ${step} ק״ג בחגורה, ולחזור ל-${range[0]} חזרות` : `${kg + step} ק״ג, ולחזור ל-${range[0]} חזרות`,
      why: `${atTop} סטים סגרו ${range[1]} חזרות${kg ? ` ב-${kg} ק״ג` : ''} באימון האחרון — ראש הטווח.`,
      patch: { note: noteWith(ex.note, bw ? `הפעם +${step} ק״ג` : `הפעם ${kg + step} ק״ג`) },
    }
  }

  const low = sets.filter((x) => valueOf(x, ex.metric) < range[0]).length
  if (low >= Math.ceil(need / 2) && hist.length >= 2 && !(legs && hardRunYesterday)) {
    const prevKg = topKg(hist[hist.length - 2].sets)
    if (kg >= prevKg && kg > 0) {
      const down = Math.round((kg * 0.9) / 2.5) * 2.5
      return {
        ...base,
        verdict: 'back-off',
        what: `לרדת ל-${down} ק״ג ולבנות את הטווח מחדש`,
        why: `${low} סטים נפלו מתחת ל-${range[0]} חזרות. משקל שלא נותן את תחתית הטווח הוא משקל לפעם אחרת.`,
        patch: { note: noteWith(ex.note, `הפעם ${down} ק״ג`) },
      }
    }
  }

  return stallOrHold(base, hist, need, ex.metric, `הטווח (${ex.reps ?? '—'}) עוד לא נסגר בכל הסטים`, legs, hardRunYesterday)
}

/** השלב הנוכחי בסולם, בלי לייבא את כל שכבת החנות */
function stageOf(s: AppState, lad: { id: string; stages: Array<{ id: string }> }): number | undefined {
  const saved = (s.skills ?? []).find((k) => k.id === lad.id && !k.deleted)?.stageId
  const i = saved ? lad.stages.findIndex((x) => x.id === saved) : -1
  return i >= 0 ? i : 0
}

/** תקוע או פשוט באמצע הדרך — ההבדל הוא שלושה אימונים בלי עלייה */
function stallOrHold(
  base: Omit<Call, 'verdict' | 'what' | 'why'>,
  hist: Array<{ date: ISODate; sets: SetLog[] }>,
  need: number,
  metric: ExMetric,
  reason: string,
  legs: boolean,
  hardRunYesterday: boolean,
): Call {
  if (legs && hardRunYesterday) {
    return {
      ...base,
      verdict: 'hold',
      what: 'אותו עומס — המספר של היום לא נחשב',
      why: 'תרגיל רגליים ב-24 השעות שאחרי ריצה קשה נקרא נמוך מסיבות שאינן כוח. לא מסיקים ממנו.',
    }
  }
  const recent = hist.slice(-STALL)
  if (recent.length >= STALL) {
    const lv = recent.map((h) => level(h.sets, need, metric))
    // רעש: שינוי של פחות מ-5% הוא לא שינוי
    const first = lv[0] || 1
    const grew = lv.some((x) => x > first * 1.05)
    if (!grew) {
      return {
        ...base,
        verdict: 'watch',
        what: 'להוסיף סט אחד, ואם גם זה לא זז — להחליף את התרגיל',
        why: `${STALL} אימונים בלי עלייה של 5% ברמה. משנים דבר אחד בכל פעם, והזול מביניהם הוא נפח.`,
      }
    }
  }
  return { ...base, verdict: 'hold', what: 'אותו עומס, לסגור את הטווח', why: reason }
}

// -- בדיקות ברמת השבוע ---------------------------------------------------------

/**
 * **האם הריצות הקלות באמת קלות.** זו הבדיקה שהכי משתלם לבנות: בהשוואה
 * ישירה על רצים חובבים, היתרון של חלוקה פולרית קיים **רק אצל מי שבאמת
 * רץ קל בימים הקלים** (+7.0% מול +1.6%, ES 1.29) — ונעלם לגמרי כשמכניסים
 * את מי שלא עמד בזה. pubmed.ncbi.nlm.nih.gov/23752040/
 *
 * ה-VDOT נגזר מהריצה המהירה ביותר ב-60 הימים האחרונים מעל 3 ק״מ. זו לא
 * ריצת מבחן, ולכן היא **מזלזלת** ביכולת ומייצרת טווח קל איטי מדי — ולכן
 * נדרשות שתי ריצות מתוך ארבע, ולא אחת.
 */
export function fieldVdot(s: AppState, date: ISODate): number | null {
  const best = (s.workouts ?? [])
    .filter((w) => !w.deleted && w.kind === 'run' && (w.km ?? 0) >= 3 && w.minutes && w.date <= date)
    .filter((w) => diffDays(w.date, date) <= 60)
    .sort((a, b) => a.minutes! / a.km! - b.minutes! / b.km!)[0]
  return best ? vdot(best.km! * 1000, best.minutes! * 60) : null
}

export function easyCheck(s: AppState, date: ISODate): { tooFast: number; of: number; range?: [number, number] } {
  const runs = (s.workouts ?? []).filter((w) => !w.deleted && w.kind === 'run' && w.km && w.minutes && w.date <= date)
  const recent = runs.filter((w) => diffDays(w.date, date) <= 60)
  const best = recent.filter((w) => (w.km ?? 0) >= 3).sort((a, b) => a.minutes! / a.km! - b.minutes! / b.km!)[0]
  const v = fieldVdot(s, date)
  if (!best || v === null) return { tooFast: 0, of: 0 }
  // הקצבים כאן הם בדקות לקילומטר, כמו בכל האפליקציה
  const p = paces(v)
  // ריצה "קלה" היא כל ריצה שאינה הארוכה ואינה המהירה של השבוע
  const easy = recent
    .filter((w) => diffDays(w.date, date) <= 28)
    .filter((w) => (w.km ?? 0) < (best.km ?? 0) * 1.6)
    .slice(-4)
  const tooFast = easy.filter((w) => w.minutes! / w.km! < p.easy[0]).length
  return { tooFast, of: easy.length, range: [p.easy[0], p.easy[1]] }
}

/**
 * תקציב הגיד — שניות אחיזה בזרוע ישרה. זו התקרה שמונעת את הפציעה
 * הקלאסית של הקליסטניקס, שבה הכוח מקדים את הגיד בשבועות.
 */
export function tendonLoad(s: AppState, date: ISODate): { week: number; maxSession: number } {
  const plan = alive(s.workoutPlan ?? [])
  const straight = new Set<ID>()
  for (const d of plan) for (const ex of d.exercises) if (/lever|planche|פלאנש|דגל/i.test(ex.name)) straight.add(ex.id)
  let week = 0
  let maxSession = 0
  for (const w of s.workouts ?? []) {
    if (w.deleted || diffDays(w.date, date) > 7 || w.date > date) continue
    let session = 0
    for (const id of straight) for (const st of w.sets?.[id] ?? []) session += st.sec ?? 0
    week += session
    maxSession = Math.max(maxSession, session)
  }
  return { week, maxSession }
}

// -- הלילה כולו ---------------------------------------------------------------

export type Nightly = {
  date: ISODate
  /** כמה אימונים נרשמו בשבוע האחרון — בלי זה אין על מה להחליט */
  logged: number
  calls: Call[]
  /** מה שדורש אדם: כאב, מחלה, חריגה */
  flags: string[]
  /** מה שקרה בשבוע, בשפה שאפשר להחליט לפיה */
  week: string[]
}

/**
 * מה שהמעבר הלילי מקבל: החלטה לכל תרגיל שנרשם השבוע, יחד עם הפקודה
 * שמבצעת אותה. מה שלא נרשם — לא מופיע, כי אין עליו מה להגיד.
 */
export function nightly(s: AppState, date: ISODate = todayISO()): Nightly {
  const logs = (s.workouts ?? [])
    .filter((w) => !w.deleted && diffDays(w.date, date) <= 8 && w.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date))
  const flags: string[] = []
  const held = new Set<Area>()

  for (const w of logs) {
    if (diffDays(w.date, date) > PAIN_HOLD_DAYS) continue
    for (const sg of noteSignals(w.note)) {
      if (sg.sig === 'pain') {
        held.add(sg.area ?? 'other')
        flags.push(
          `${w.date} · ${AREA_NAME[sg.area ?? 'other']} — "${(w.note ?? '').trim().slice(0, 80)}". ` +
            `כאב שמותר להתאמן איתו הוא כזה שעומד בכל התנאים: מתחת ל-3 מתוך 10, לא מחמיר תוך כדי, ` +
            `לא מחמיר למחרת, והכוח חוזר עד האימון הבא. אם אחד מהם נשבר — יורדים שלב, לא מפסיקים.`,
        )
      }
      if (sg.sig === 'sick') flags.push(`${w.date} · דיווח על מחלה — אימון איכות לא מתקיים עד יומיים אחרי שזה נגמר`)
    }
  }

  const plan = alive(s.workoutPlan ?? [])
  const calls: Call[] = []
  const seen = new Set<ID>()
  let structural = 0
  for (const w of [...logs].reverse()) {
    const day = plan.find((d) => d.id === w.dayId) ?? workoutDayOn(s, w.date)
    if (!day) continue
    // האם אתמול הייתה ריצה קשה — הקשר שמבטל מסקנה מתרגיל רגליים
    const prev = (s.workouts ?? []).find((x) => !x.deleted && x.date === addDays(w.date, -1))
    const hardRunYesterday = !!prev && prev.kind === 'run' && /איכות|אינטרוול|סף|טמפו|ארוכה/.test(prev.title)
    for (const ex of day.exercises) {
      if (seen.has(ex.id) || !w.sets?.[ex.id]?.length) continue
      seen.add(ex.id)
      const c = callFor(s, day, ex, date, held, hardRunYesterday)
      if (!c) continue
      if (c.structural) {
        if (structural >= MAX_STRUCTURAL) continue
        structural++
      }
      calls.push(c)
    }
  }

  const order: Verdict[] = ['back-off', 'advance', 'progress', 'watch', 'hold']
  calls.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict))

  return { date, logged: logs.length, calls, flags, week: weekNotes(s, date, logs.length, flags) }
}

function weekNotes(s: AppState, date: ISODate, logged: number, flags: string[]): string[] {
  const out: string[] = []
  if (!logged) {
    out.push('לא נרשם אף אימון בשבוע האחרון — אין על מה להחליט, והתוכנית נשארת כמו שהיא')
    return out
  }

  const planned = alive(s.workoutPlan ?? []).filter((d) => d.kind !== 'rest').length
  if (planned && logged < planned - 2) {
    out.push(`${logged} אימונים נרשמו מול ${planned} בתוכנית — אימון שלא התקיים נמחק, לא נדחף קדימה, ובשום מצב לא מושלם על ידי הארכת ריצה אחרת`)
  }

  const t = tendonLoad(s, date)
  if (t.maxSession > TENDON_BUDGET.perSessionSec) {
    out.push(`${t.maxSession} שניות אחיזה בזרוע ישרה באימון אחד — התקרה היא ${TENDON_BUDGET.perSessionSec}. הגיד מסתגל ב-8–12 שבועות, השריר ב-6–8, והפער הזה הוא מנגנון הפציעה`)
  }
  if (t.week > TENDON_BUDGET.perWeekSec) {
    out.push(`${t.week} שניות אחיזה בזרוע ישרה בשבוע — התקרה היא ${TENDON_BUDGET.perWeekSec}`)
  }

  const e = easyCheck(s, date)
  if (e.of >= 3 && e.tooFast >= 2 && e.range) {
    const fmt = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`
    out.push(
      `${e.tooFast} מתוך ${e.of} הריצות הקלות האחרונות היו מהירות מהטווח הקל (${fmt(e.range[0])}–${fmt(e.range[1])} לק״מ). ` +
        'זה לא פרט טכני: היתרון של חלוקת עצימות קיים רק אצל מי שבאמת רץ קל בימים הקלים, ונעלם לגמרי אצל מי שלא',
    )
  }

  // נפח: מה שנמדד באמת הוא עלייה של מעל 30% על פני שבועיים
  const weeks = runWeeks(s)
  if (weeks.length >= 3) {
    const [a, b, c] = weeks.slice(-3).map(([, km]) => km)
    if (a > 0 && c > a * 1.3) out.push(`הנפח השבועי עלה מ-${a} ל-${c} ק״מ בשבועיים — מעל 30%, והסף הזה נמדד על 874 רצים`)
    else if (b > 0 && c < b * 0.75) out.push(`הנפח ירד מ-${b} ל-${c} ק״מ — אם זה לא שבוע ירידה מתוכנן, כדאי לדעת למה`)
  }

  if (flags.length >= 3) out.push('שלושה דיווחי כאב או מחלה בשבוע — זה הזמן לשבוע ירידה: חצי מהסטים, אותו משקל, אותה תדירות')
  return out
}
