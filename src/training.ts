// ---------------------------------------------------------------------------
// תורת האימון — החוקים שלפיהם נבנית התוכנית ומשתנה אחרי כל אימון.
//
// למה קובץ ולא פסקה בהנחיה: תוכנית אימונים היא החלטות מספריות שחוזרות כל
// שבוע — כמה קילומטרים, מתי להוריד, מה לעשות כשאימון נכשל. החלטה שיושבת
// בקוד אפשר לבדוק, וההסבר שלה לא הולך לאיבוד. כל מספר כאן מגיע ממקור,
// והמקור כתוב לידו.
//
// שלושה דברים שהמחקר קבע והם הפוכים מהאינטואיציה, והם מעצבים את כל הקובץ:
//
//   1. **ההפרעה בין כוח לריצה היא מקומית לשריר.** 96 נבדקים, 12 שבועות:
//      אימון כוח לפלג גוף עליון *באותו אימון* עם אינטרוולים לרגליים נתן
//      +17.3% בלחיצת חזה מול +16.7% בקבוצת הכוח בלבד (p=0.65).
//      pubmed.ncbi.nlm.nih.gov/39921365/ — לכן סקילים וריצה יכולים לחיות
//      באותו יום, ואפילו באותו בלוק.
//   2. **הכיוון המסוכן הפוך:** כוח רגליים כבד פוגע בריצה 24–48 שעות אחריו
//      (כלכלת ריצה −5.6% ב-24 שעות, זמן עד תשישות −29%).
//      pubmed.ncbi.nlm.nih.gov/23724883/ — לכן אין ריצה קשה יום אחרי רגליים.
//   3. **כלל ה-10% וה-ACWR הם פולקלור.** הניסוי המבוקר היחיד של כלל ה-10%:
//      20.8% פציעות מול 20.3%, p=0.90 (pubmed.ncbi.nlm.nih.gov/17940147/).
//      ל-ACWR יש c-statistic 0.574 מול 0.5 של מודל ריק, והוא משחזר את עצמו
//      עם מכנה אקראי (pubmed.ncbi.nlm.nih.gov/33332011/). מה שכן נמדד, על
//      5,205 רצים ו-588,071 אימונים: **אימון בודד שחורג מהארוך ביותר של 30
//      הימים האחרונים** — 10–30% חריגה = סיכון ×1.64, מעל 100% = ×2.28.
//      pmc.ncbi.nlm.nih.gov/articles/PMC12421110/
// ---------------------------------------------------------------------------

// -- קצבים ממבחן שדה --------------------------------------------------------

/**
 * VDOT לפי דניאלס-גילברט. שתי הנוסחאות מאומתות מול מקור שפיט:
 * pmc.ncbi.nlm.nih.gov/articles/PMC7765687/
 *
 * זה מה שמתרגם "רצתי 5 ק״מ ב-28 דקות" לכל קצבי האימון, במקום לנחש אותם.
 */
export function vdot(meters: number, seconds: number): number {
  if (meters <= 0 || seconds <= 0) return 0
  const minutes = seconds / 60
  const v = meters / minutes
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  return Math.round((vo2 / pct) * 10) / 10
}

/** קצב בדקות לקילומטר מתוך מהירות במטר לדקה */
const paceOf = (mPerMin: number) => (mPerMin > 0 ? 1000 / mPerMin : 0)

/**
 * מהירות שמתאימה לאחוז נתון מ-VDOT. היפוך של אותה פרבולה.
 */
function speedAt(vo2: number): number {
  // vo2 = -4.6 + 0.182258 v + 0.000104 v^2  →  פתרון חיובי של המשוואה
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

export type Paces = {
  /** ריצה קלה — רוב הנפח */
  easy: [number, number]
  /** קצב מרתון — לריצה ארוכה עם סיום מהיר */
  marathon: number
  /** סף — הקצב של האימון האיכותי המרכזי */
  threshold: number
  /** אינטרוולים — עבודה על VO2max */
  interval: number
  /** חזרות קצרות — כלכלת ריצה ומהירות */
  rep: number
  /** קצב חצי מרתון צפוי */
  half: number
}

/**
 * הקצבים מתוך VDOT. האחוזים הם הטבלה של דניאלס: קל 59–74%, מרתון 84%,
 * סף 88%, אינטרוול 98%, חזרות 105% מ-VO2max.
 *
 * קצב חצי המרתון מחושב בנפרד, מרייגל עם k=1.06: נבדק על 2,303 רצים
 * חובבים, ומקדם הכיול **לא נבדל מ-1 בחצי מרתון (p=0.3)** — כלומר לחצי
 * אין צורך בתיקון, בניגוד למרתון (p<0.0001).
 * pmc.ncbi.nlm.nih.gov/articles/PMC5000509/
 */
export function paces(v: number): Paces {
  const p = (pct: number) => Math.round(paceOf(speedAt(v * pct)) * 100) / 100
  return {
    easy: [p(0.74), p(0.59)],
    marathon: p(0.84),
    threshold: p(0.88),
    interval: p(0.98),
    rep: p(1.05),
    half: halfPaceFromVdot(v),
  }
}

/** זמן צפוי למרחק אחר, לפי רייגל */
export function riegel(seconds: number, fromM: number, toM: number, k = 1.06): number {
  if (seconds <= 0 || fromM <= 0 || toM <= 0) return 0
  return seconds * Math.pow(toM / fromM, k)
}

function halfPaceFromVdot(v: number): number {
  // מוצאים את זמן 5,000 המטרים שנותן את ה-VDOT הזה, ומגלגלים אותו לחצי
  let lo = 600
  let hi = 3600
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (vdot(5000, mid) > v) lo = mid
    else hi = mid
  }
  const half = riegel((lo + hi) / 2, 5000, 21097.5)
  return Math.round((half / 60 / 21.0975) * 100) / 100
}

/**
 * מהירות קריטית משני מאמצים. **רק המודל הליניארי מרחק-זמן** — בסקירה של
 * 124 מחקרים השגיאה שלו היא 1–2.8%, ואילו המודל ההיפרבולי בן שלושת
 * הפרמטרים נותן 16.9–70.9% ולא שמיש.
 * pmc.ncbi.nlm.nih.gov/articles/PMC13388421/
 */
export function criticalSpeed(d1: number, t1: number, d2: number, t2: number): { cs: number; dPrime: number } | null {
  if (t2 === t1 || d1 <= 0 || d2 <= 0) return null
  const cs = (d2 - d1) / (t2 - t1)
  if (!Number.isFinite(cs) || cs <= 0) return null
  return { cs, dPrime: d1 - cs * t1 }
}

/**
 * השינוי הקטן ביותר במבחן שאפשר להאמין לו: MDC95 = 1.96·√2·שגיאת מדידה.
 * מתחת לזה — זה רעש, ואסור לעדכן קצבים בגללו.
 *   מבחן 5 ק״מ: שגיאה ~1.5% → 4.2%.  מהירות קריטית משני מאמצים: 0.4% → 1.1%.
 * pubmed.ncbi.nlm.nih.gov/11286357/ · pubmed.ncbi.nlm.nih.gov/24622815/
 */
export const MDC95 = { timeTrial5k: 0.0416, criticalSpeed: 0.0111, threeMinTest: 0.0485 }

/** האם מבחן חדש באמת שונה מהקודם, או שזה רעש */
export function testChanged(prev: number, now: number, mdc: number): boolean {
  if (!prev || !now) return false
  return Math.abs(now - prev) / prev > mdc
}

// -- נפח שבועי: בנייה, שבוע ירידה, והתחדדות -----------------------------------

export type WeekPlan = {
  /** מספר השבוע בתוכנית, מ-1 */
  n: number
  km: number
  kind: 'build' | 'down' | 'taper' | 'race'
  /** הריצה הארוכה של השבוע, בקילומטרים */
  longKm: number
  note?: string
}

/**
 * העוגנים היחידים שנמדדו לחצי מרתון, על 556 רצים חובבים:
 *   * מעל 32 ק״מ בשבוע — 4:19 דקות מהר יותר (95%CI 1.85–6.52)
 *   * ריצה ארוכה מעל 21 ק״מ — 3:52 דקות (95%CI 1.44–6.31)
 *   * ושום מאפיין אימון לא נקשר לפציעה באותו מדגם.
 * pmc.ncbi.nlm.nih.gov/articles/PMC7496388/
 */
export const HALF_ANCHORS = { weeklyKm: 32, longKm: 21 }

/**
 * הריצה הארוכה היא הדבר שאימון אינטרוולים לא קונה. שתי קבוצות רצים
 * **מותאמות בזוגות לפי זמן 10 ק״מ ו-VO2max**, שנבדלות רק בהרגל: מי שמעולם
 * לא עבר 70 דקות איבד 6.0% מכלכלת הריצה על פני 90 דקות, מול 3.1% אצל מי
 * שרץ ארוך — והעמידוּת התואמה עם הריצה הארוכה השבועית ב-r=−0.67.
 * pubmed.ncbi.nlm.nih.gov/40878015/
 *
 * לכן: ריצה ארוכה מתחת ל-70 דקות היא ריצה רגילה, לא ארוכה.
 */
export const LONG_RUN_MIN_MINUTES = 70

/** קילומטרים בספרה אחת — עיגול לשלם בנפח נמוך מעוות את קצב הגידול */
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * בונה את סולם הנפח עד המרוץ.
 *
 * הקצב: כ-10% לשבוע. הערה חשובה על הכלל הזה — הוא **לא** כלל בטיחות
 * (הניסוי היחיד שבדק אותו לא מצא הבדל בפציעות, p=0.90), אלא פשוט מה
 * שתוכניות מפורסמות עושות בפועל בנפח הזה: 9%±4 לשבוע.
 * pubmed.ncbi.nlm.nih.gov/38695978/
 *
 * מה שכן מבוסס: **שלושת השבועות הראשונים של בנייה חדשה הם החלון הפגיע**
 * (עלייה של 20–60% העלתה סיכון ביום 21 ב-22.6%, ולא ביום 56 או 98)
 * pubmed.ncbi.nlm.nih.gov/30526231/ — ולכן ההתחלה שמרנית.
 *
 * התחדדות: הורדת נפח 41–60% עם שמירה על העצימות והתדירות — זו המסקנה של
 * מטא-אנליזה על 27 מחקרים, והיא גם אומרת במפורש שלא להוריד ימי אימון.
 * pubmed.ncbi.nlm.nih.gov/17762369/
 */
export function volumeRamp(opts: {
  startKm: number
  weeks: number
  /** כמה שבועות בנייה לפני כל שבוע ירידה */
  downEvery?: number
  growth?: number
  /** תקרת נפח שבועי */
  capKm?: number
}): WeekPlan[] {
  const downEvery = opts.downEvery ?? 4
  const growth = opts.growth ?? 0.1
  const cap = opts.capKm ?? 60
  const out: WeekPlan[] = []
  let km = Math.max(1, opts.startKm)
  let lastBuild = km

  for (let n = 1; n <= opts.weeks; n++) {
    const left = opts.weeks - n
    if (left === 0) {
      out.push({ n, km: r1(lastBuild * 0.5), kind: 'race', longKm: 0, note: 'שבוע המרוץ' })
      continue
    }
    if (left === 1) {
      out.push({ n, km: r1(lastBuild * 0.69), kind: 'taper', longKm: r1(lastBuild * 0.25), note: 'התחדדות' })
      continue
    }
    if (n % downEvery === 0) {
      const down = r1(lastBuild * 0.7)
      out.push({ n, km: down, kind: 'down', longKm: r1(down * 0.3), note: 'שבוע ירידה' })
      continue
    }
    // שלושת השבועות הראשונים — חצי מקצב הגידול
    const g = n <= 3 ? growth / 2 : growth
    km = Math.min(cap, n === 1 ? km : lastBuild * (1 + g))
    lastBuild = km
    // בשלושת שבועות הבנייה האחרונים הארוכה לוקחת חלק גדול יותר — ככה
    // עושות תוכניות למתחילים (43–52% מהשבוע), וזה מה שמקרב את הארוכה
    // למרחק שבאמת מכין למרוץ.
    const finalBuild = left <= 5
    out.push({ n, km: r1(km), kind: 'build', longKm: r1(finalBuild ? km * 0.45 : longShare(km)) })
  }
  return out
}

/**
 * כמה מהשבוע יהיה בריצה הארוכה. תוכניות מפורסמות בנפח הזה נותנות ~46%
 * (pubmed.ncbi.nlm.nih.gov/38695978/), ותוכניות למתחילים אפילו 43–52%.
 * ה"כלל" של 20–30% הוא פולקלור בלי מקור, ובנפח נמוך הוא פשוט לא ישים.
 */
export function longShare(weekKm: number): number {
  const share = weekKm < 25 ? 0.42 : weekKm < 40 ? 0.38 : 0.34
  return weekKm * share
}

/**
 * התקרה לאימון בודד: 110% מהארוך ביותר ב-30 הימים האחרונים. זה הכלל
 * היחיד עם דוז-רספונס אמיתי על מדגם של 5,205 רצים.
 * pmc.ncbi.nlm.nih.gov/articles/PMC12421110/
 */
export function sessionCapKm(longest30dKm: number): number {
  return Math.round(longest30dKm * 1.1 * 10) / 10
}

// -- אימונים שנכנסים ל-45 דקות ------------------------------------------------

export type RunSession = {
  id: string
  name: string
  /** מה זה מפתח */
  develops: string
  /** דקות סך הכל, כולל חימום ושחרור */
  minutes: number
  /** כל כמה זמן אפשר לחזור עליו */
  every: string
  /** האם זה יום קשה — לצורך ספירת ימים קשים בשבוע */
  hard: boolean
}

/**
 * מה שנכנס ל-45 דקות כולל חימום 10 ושחרור 5.
 *
 * מה שהמגבלה באמת עולה: כמעט כלום. במחקר של 1,032 רצי חצי מרתון, **משך
 * האימון החציוני כבר עומד על 47 דקות** — כלומר 45 דקות זו הנורמה ולא
 * מגבלה. frontiersin.org/articles/10.3389/fphys.2021.620404/full
 * מה שכן נחסם זה בלוק סף רצוף ארוך, והפתרון הוא אינטרוולי סף.
 *
 * קטעי עבודה של 3–5 דקות עדיפים על 30/30: במטא-אנליזה של 239 פרוטוקולים,
 * קטעים של שתי דקות ומעלה נתנו משמעותית יותר זמן ב-VO2max.
 * pmc.ncbi.nlm.nih.gov/articles/PMC13480085/
 * וההתאוששות בין קטעים של ארבע דקות — שתי דקות, לא יותר: רצים שבחרו לבד
 * בחרו 118±23 שניות, ומעבר לזה המהירות לא השתפרה.
 * pubmed.ncbi.nlm.nih.gov/16177614/
 */
export const RUN_SESSIONS: RunSession[] = [
  { id: 'easy', name: 'ריצה קלה', develops: 'נפח — הדבר שהכי תואם עם שיפור', minutes: 45, every: 'כמה שרוצים', hard: false },
  { id: 'easy-strides', name: 'ריצה קלה + האצות', develops: 'נפח, ובסוף 6 האצות של 20 שניות לכלכלת ריצה', minutes: 45, every: 'פעם-פעמיים בשבוע', hard: false },
  { id: 'tempo20', name: 'טמפו רצוף 20 דקות', develops: 'סף לקטט — הקצב של חצי מרתון', minutes: 35, every: 'שבועי', hard: true },
  { id: 'cruise-5x5', name: 'אינטרוולי סף 5×5 דקות', develops: 'סף, עם יותר דקות סף מטמפו רצוף באותו זמן', minutes: 44, every: 'שבועי', hard: true },
  { id: 'cruise-4x6', name: 'אינטרוולי סף 4×6 דקות', develops: 'סף במהירות גבוהה יותר', minutes: 42, every: 'שבועי', hard: true },
  { id: 'vo2-5x4', name: 'אינטרוולים 5×4 דקות', develops: 'VO2max — קטעים ארוכים נותנים יותר זמן בצריכה מרבית', minutes: 43, every: 'שבועי', hard: true },
  { id: 'vo2-6x3', name: 'אינטרוולים 6×3 דקות', develops: 'VO2max', minutes: 43, every: 'שבועי', hard: true },
  { id: 'fartlek', name: 'פרטלק 10×(דקה/דקה)', develops: 'VO2max בלי שעון — טוב כשהרגליים לא בטוחות', minutes: 35, every: 'חלופה לאינטרוולים', hard: true },
  { id: 'hills', name: 'עליות 10×45 שניות', develops: 'כוח וכלכלת ריצה, עם פחות עומס על הרגל', minutes: 36, every: 'כל שבועיים', hard: true },
  { id: 'long', name: 'ריצה ארוכה', develops: 'עמידוּת — הדבר היחיד שאינטרוולים לא קונים', minutes: 70, every: 'שבועי', hard: true },
  { id: 'long-fast-finish', name: 'ארוכה עם סיום בקצב מרוץ', develops: 'עמידוּת + קצב מרוץ תחת עייפות', minutes: 90, every: 'בארבעת השבועות לפני המרוץ', hard: true },
]

/** אימונים שלא נכנסים ל-45 דקות — כאן כדי שלא ייבנו בטעות */
export const RUN_SESSIONS_TOO_LONG = [
  { name: '6×1000 מ׳ סף', minutes: 48 },
  { name: '6×4 דקות אינטרוול', minutes: 49 },
  { name: '4×8 דקות סף', minutes: 53 },
  { name: '2×20 דקות סף', minutes: 58 },
]

// -- כוח: כמה, באיזו עצימות, ומה משנים אחרי אימון ------------------------------

/**
 * העומס שמשפר ריצה הוא **כבד**. במטא-אנליזה הגדולה ביותר (31 מחקרים,
 * 652 רצים): עומס גבוה (≥80% ממקסימום) ES −0.266 (p=0.039), ואילו עומס
 * בינוני (40–79%) לא מובהק (p=0.131) ואיזומטרי לא מובהק (p=0.253).
 * pmc.ncbi.nlm.nih.gov/articles/PMC11052887/
 *
 * ומה שעובד **בלי מוט**: מחקר שהריץ לחיצת רגליים, כפיפות ברכיים והרמות
 * עקבים בלבד, 2× בשבוע, 10 שבועות, עד 90% ממקסימום — עלות החמצן ירדה
 * ב-2.0% (p=0.001), והמשתנה היחיד שתאם את השיפור היה **הרמות עקבים**
 * (r=−0.477, p=0.046). pubmed.ncbi.nlm.nih.gov/39523854/
 */
export const RUNNER_LEG_WORK = [
  {
    name: 'לחיצת רגליים במכונה',
    sets: '4×4–6',
    load: '80–85% ממקסימום, ירידה מבוקרת ודחיפה מהירה',
    why: 'עמוד השדרה של כל פרוטוקול שנמדד בלי מוט. גם מגדל את הישבן ב-15.4%.',
    src: 'pubmed.ncbi.nlm.nih.gov/18460997/',
  },
  {
    name: 'הרמות עקבים בעמידה',
    sets: '4×6–8',
    load: 'כבד, טווח מלא',
    why: 'המשתנה היחיד שתאם עם שיפור עלות החמצן. גם המבחן שמנטר אכילס.',
    src: 'pubmed.ncbi.nlm.nih.gov/39523854/',
  },
  {
    name: 'הרמות עקבים בישיבה',
    sets: '3–4×8–12',
    load: 'בינוני-כבד',
    why: 'ברך כפופה ב-90 מעלות מכוונת לסוליאוס — השריר הדומיננטי בריצה.',
    src: 'pubmed.ncbi.nlm.nih.gov/12173959/',
  },
  {
    name: 'כפיפות ברכיים במכונה',
    sets: '3×8–12',
    load: 'בינוני-כבד, ירידה איטית',
    why: 'עבודה אקסצנטרית להמסטרינג בלי תרגיל שנראה חריג בחדר כושר.',
    src: 'pubmed.ncbi.nlm.nih.gov/39523854/',
  },
  {
    name: 'קפיצות פוגו',
    sets: '4×10 (40 נגיעות)',
    load: 'משקל גוף, קרקע רכה',
    why: 'חמש דקות ביום, שישה שבועות — כלכלת ריצה השתפרה ב-12 ו-14 קמ״ש. בבית, בלי ציוד.',
    src: 'pubmed.ncbi.nlm.nih.gov/36914662/',
  },
]

/**
 * התאמת משקל לפי הסט העליון — APRE-6, הכלל האוטורגולטורי היחיד שנבדק
 * בניסוי מבוקר (23 ספורטאי ליגה, שישה שבועות, עלה על פריודיזציה ליניארית).
 * pubmed.ncbi.nlm.nih.gov/20543732/
 *
 * שימו לב שהוא **סימטרי**: הוא מעלה משקל על ביצוע טוב באותה אגרסיביות
 * שהוא מוריד על ביצוע גרוע. תוכנית שרק יודעת להוריד היא תוכנית שנשחקת.
 */
export function apre6(reps: number): { deltaKg: [number, number]; text: string } {
  if (reps <= 2) return { deltaKg: [-5, -2.5], text: 'להוריד 2.5–5 ק״ג' }
  if (reps <= 4) return { deltaKg: [-2.5, 0], text: 'להוריד עד 2.5 ק״ג' }
  if (reps <= 7) return { deltaKg: [0, 0], text: 'להישאר באותו משקל' }
  if (reps <= 12) return { deltaKg: [2.5, 5], text: 'להעלות 2.5–5 ק״ג' }
  return { deltaKg: [5, 10], text: 'להעלות 5–10 ק״ג' }
}

/**
 * סטים שבועיים לכל דפוס תנועה. כל סט שבועי נוסף שווה ES 0.023 (כ-0.37%),
 * עם תשואה פוחתת שחדה יותר לכוח מאשר להיפרטרופיה.
 * pubmed.ncbi.nlm.nih.gov/27433992/ · pubmed.ncbi.nlm.nih.gov/41343037/
 * ורצפת התחזוקה בשבוע כבד של ריצה: 3–6 סטים קשים לתרגיל.
 * pubmed.ncbi.nlm.nih.gov/34527944/
 */
export const STRENGTH_DOSE = { setsPerPatternPerWeek: [6, 10], maintenanceSets: [3, 6], reps: [3, 6], rir: [1, 2], restSec: 120 }

/**
 * עבודה איזומטרית (פרונט לבר, L-Sit): אחיזה בעבודה היא 67–70% מהאחיזה
 * המקסימלית, והזמן תחת מתח לכל תרגיל 45–70 שניות. מעל אחיזה מקסימלית של
 * 30 שניות — עוברים לגרסה קשה יותר במקום להוסיף זמן.
 * stevenlow.org/prilepin-tables-for-bodyweight-strength-isometric-and-eccentric-exercises/
 * (קונצנזוס אימון; מתכתב היטב עם מינון איזומטרי שפיט:
 * pubmed.ncbi.nlm.nih.gov/30943568/)
 *
 * **מה שלא מיישמים:** כלל של "ירידה של X% בזמן האחיזה → לעצור". מהימנות
 * המדידה הזו היא ICC 0.64 — הנמוכה מבין 29 מדדים נוירו-שריריים שנבדקו
 * (pubmed.ncbi.nlm.nih.gov/16427317/), וסף באחוזים היה נורה על רעש.
 * הסימן לעצור הוא **התנוחה שנשברת**, לא השעון.
 */
export function isoHold(maxSec: number): { holdSec: number; sets: number; note: string } {
  if (maxSec <= 0) return { holdSec: 0, sets: 0, note: 'צריך קודם למדוד אחיזה מקסימלית' }
  if (maxSec >= 30) return { holdSec: 20, sets: 3, note: 'מעל 30 שניות — הגיע הזמן לעבור לשלב הבא, לא להוסיף זמן' }
  const hold = Math.max(3, Math.round(maxSec * 0.68))
  const sets = Math.max(3, Math.min(7, Math.round(56 / hold)))
  return { holdSec: hold, sets, note: 'עוצרים כשהתנוחה נשברת, לא כשהשעון מגיע' }
}

// -- אוטורגולציה: מה משתנה אחרי אימון ------------------------------------------

export type Wellness = {
  /** 1 (גרוע) עד 5 (מצוין) */
  sleep: number
  fatigue: number
  soreness: number
  motivation: number
}

export type Readiness = {
  action: 'go' | 'modify' | 'downgrade'
  reasons: string[]
  score: number
}

/**
 * החלטת המוכנוּת היומית.
 *
 * למה דיווח עצמי ולא שעון: בסקירה של 56 מחקרים, מדדים סובייקטיביים שיקפו
 * עומס אימון **ברגישות ובעקביות טובות יותר** ממדדים אובייקטיביים, והם
 * בדרך כלל לא מתואמים זה לזה. pmc.ncbi.nlm.nih.gov/articles/PMC4789708/
 * ובהשוואה ישירה בשלוש זרועות על רצים חובבים, הנחיה לפי שאלון מתח עצמי
 * ניצחה גם הנחיה לפי HRV וגם תוכנית קבועה (5 ק״מ: −12.8% מול −8.3%).
 * pubmed.ncbi.nlm.nih.gov/36940300/
 *
 * ושלוש מגבלות שנבנו לתוך הכלל:
 *   * **לא פועלים על נקודה בודדת.** דורשים שתי דרישות, או יומיים ברצף.
 *   * **אף פעם לא מעלים עומס בגלל אות טוב.** מערכת שמגיבה לכל אות טוב
 *     מנפחת נפח; היתרון של אימון מונחה-מוכנות על תוכנית קבועה הוא
 *     SMD 0.20 ולא מובהק. pubmed.ncbi.nlm.nih.gov/34639599/
 *   * **ציון מוכנוּת לא מוצג לפני האימון**, כדי שלא ייצור את מה שהוא
 *     מנבא (אפקט ציפייה).
 */
export function readiness(today: Wellness, history: Wellness[]): Readiness {
  const sum = (w: Wellness) => w.sleep + w.fatigue + w.soreness + w.motivation
  const score = sum(today)
  const reasons: string[] = []

  // דגלים קשים — כל אחד לבדו מוריד את היום
  if (today.sleep <= 1) reasons.push('שינה קצרה מאוד')
  if (today.soreness <= 1) reasons.push('כאבי שרירים חזקים')

  if (history.length >= 5) {
    const xs = history.map(sum)
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length)
    // חצי סטיית תקן מתחת לממוצע — הסף שבו השתמשו הניסויים המונחים
    if (sd > 0 && score < mean - 0.5 * sd) reasons.push('מתחת לממוצע שלך בשבוע האחרון')
  }

  if (reasons.some((r) => r.includes('שינה') || r.includes('כאבי'))) return { action: 'downgrade', reasons, score }
  if (reasons.length >= 2) return { action: 'downgrade', reasons, score }
  if (reasons.length === 1) return { action: 'modify', reasons, score }
  return { action: 'go', reasons, score }
}

/**
 * מה עושים עם אימון שלא התקיים. **מוחקים אותו, לא דוחפים את השבוע קדימה.**
 * דחיפה של יום מתנגשת בין הריצה הארוכה לבין יום הרגליים ומפרה את כלל
 * 24 השעות. ומעל הכל — אסור להשלים נפח על ידי הארכת ריצה אחרת, כי זה
 * בדיוק החריגה שנמדדה כמסוכנת (×1.64 עד ×2.28).
 * pmc.ncbi.nlm.nih.gov/articles/PMC12421110/
 *
 * יוצא דופן: אם המחיקה שוברת את רצפת השבוע (ריצה ארוכה אחת, אימון איכות
 * אחד, שני אימוני כוח), מחליפים אותו לתוך היום הבא במקום אימון בעדיפות
 * נמוכה יותר — באותה עצימות ובאותו משך.
 */
export const WEEK_FLOOR = { longRuns: 1, qualityRuns: 1, strengthSessions: 2 }

export type DayKind = 'easy-run' | 'quality-run' | 'long-run' | 'legs' | 'upper' | 'skills' | 'walk' | 'rest'

/**
 * בודק את מבנה השבוע מול החוקים. מחזיר את ההפרות בשפה שאפשר לתקן לפיה.
 *
 * החוקים ומקורם:
 *   * **אין ריצה קשה עד 24 שעות אחרי רגליים כבדות** — כלכלת ריצה יורדת
 *     5.6–10% ב-24 שעות, והעלות נשארת מוגברת עד 48.
 *     pubmed.ncbi.nlm.nih.gov/23724883/ · pubmed.ncbi.nlm.nih.gov/31165339/
 *   * **עד שלושה ימים קשים בשבוע.** כל הניסויים המונחים התכנסו לזה: 13.2
 *     אימונים קשים לאורך 8 שבועות ניצחו 17.7. pubmed.ncbi.nlm.nih.gov/26909534/
 *   * **כוח פלג גוף עליון יכול לחלוק יום עם ריצה** — ההפרעה מקומית לשריר.
 *     pubmed.ncbi.nlm.nih.gov/39921365/
 *   * **הריצה הארוכה לבד.** היא היחידה שלא מוגבלת ב-45 דקות, והיא היקרה
 *     ביותר מבחינת עייפות.
 */
export function checkWeek(days: DayKind[][]): string[] {
  const bad: string[] = []
  const has = (i: number, k: DayKind) => days[i % 7]?.includes(k)
  const hardDays = days.filter((d) => d.some((k) => k === 'quality-run' || k === 'long-run' || k === 'legs')).length
  if (hardDays > 3) bad.push(`${hardDays} ימים קשים בשבוע — התקרה היא שלושה`)

  for (let i = 0; i < 7; i++) {
    if (has(i, 'legs') && (has(i + 1, 'quality-run') || has(i + 1, 'long-run'))) {
      bad.push(`יום ${i + 1}: רגליים כבדות, ולמחרת ריצה קשה — כלכלת הריצה יורדת ב-24 השעות האלה`)
    }
    if (has(i, 'long-run') && days[i].length > 1) {
      bad.push(`יום ${i + 1}: הריצה הארוכה חולקת יום עם אימון נוסף`)
    }
    if (has(i, 'quality-run') && (has(i + 1, 'quality-run') || has(i + 1, 'long-run'))) {
      bad.push(`יום ${i + 1}: שני ימי ריצה קשים ברצף`)
    }
  }
  const runs = days.filter((d) => d.some((k) => k.endsWith('run'))).length
  if (runs < 3) bad.push('פחות משלושה ימי ריצה בשבוע — הנפח לא ייבנה')
  return bad
}

/**
 * הליכה היא לא יום מנוחה, וגם לא נפח ריצה.
 * לפי מדד ה-MET: הליכה נמרצת היא 4.8 MET מול 9.3 לריצה קלה — כלומר
 * **45 דקות הליכה נמרצת ≈ העלות המטבולית של 21 דקות ריצה קלה**.
 * pacompendium.com/walking/
 * היא גם לא פוגעת בהסתגלות: 15 דקות ריצה קלה אחרי כל אימון אינטרוולים,
 * ארבעה שבועות, נתנו סף אנאירובי **טוב יותר** מישיבה, למרות 15% יותר עומס.
 * frontiersin.org/articles/10.3389/fphys.2018.00415/full
 */
export const WALK_TO_RUN_RATIO = 0.46

// -- מה שנשלח לאטלס -----------------------------------------------------------

/**
 * החוקים שאטלס מקבל בכל לילה. הם כתובים כאן ולא בהנחיה כדי ששינוי בהם
 * יעבור דרך בדיקות, ושהמקור שלהם לא ילך לאיבוד.
 *
 * שימו לב למה שנמצא כאן פעמיים בכוונה: **כללי הרצפה**. מערכת שמגיבה לכל
 * אות עייפות מתכנסת לאימון קל לנצח — היתרון של אימון מונחה-מוכנות על
 * תוכנית קבועה הוא SMD 0.20 ולא מובהק (pubmed.ncbi.nlm.nih.gov/34639599/),
 * ולכן הסכנה האמיתית היא לא לפספס אות אלא לשחוק את הגירוי.
 */
export const TRAINING_DOCTRINE = {
  about: 'החוקים שלפיהם התוכנית נבנית ומשתנה. כל מספר מגיע ממקור שכתוב לידו.',
  week: [
    'עד שלושה ימים קשים בשבוע (איכות, ארוכה, רגליים כבדות). 13.2 אימונים קשים ב-8 שבועות ניצחו 17.7 — pubmed.ncbi.nlm.nih.gov/26909534/',
    'אין ריצה קשה ב-24 השעות שאחרי רגליים כבדות — כלכלת ריצה יורדת 5.6–10% — pubmed.ncbi.nlm.nih.gov/23724883/',
    'כוח פלג גוף עליון וריצה יכולים לחלוק יום, ואפילו אימון — ההפרעה מקומית לשריר — pubmed.ncbi.nlm.nih.gov/39921365/',
    'הריצה הארוכה לבד ביום שלה, ולפחות 70 דקות — מתחת לזה היא לא קונה עמידוּת — pubmed.ncbi.nlm.nih.gov/40878015/',
    'רוב הנפח קל. חלוקת עצימות פירמידלית (כ-80/15/5), לא פולריזציה — בחובבים אין הבדל, ובאימון איכות מרוכז מגיעים לאותה תוצאה ב-17% פחות זמן — pubmed.ncbi.nlm.nih.gov/39888556/',
  ],
  progress: [
    'נפח שבועי עולה כ-10%, עם שבוע ירידה של 30% כל רביעי. זה מה שתוכניות אמיתיות עושות, לא כלל בטיחות — pubmed.ncbi.nlm.nih.gov/38695978/',
    'אימון בודד לא חורג מ-110% מהארוך ביותר ב-30 הימים האחרונים. זה הכלל היחיד עם דוז-רספונס אמיתי — pmc.ncbi.nlm.nih.gov/articles/PMC12421110/',
    'בשלושת השבועות הראשונים של בנייה חדשה מעלים חצי מהקצב — זה החלון שנמדד כפגיע — pubmed.ncbi.nlm.nih.gov/30526231/',
    'קצבים משתנים רק כשמבחן שדה השתנה מעבר לשגיאת המדידה: 4.2% במבחן 5 ק״מ.',
    'משקל בתרגיל עולה ויורד לפי הסט העליון (APRE-6), ובאותה אגרסיביות לשני הכיוונים — pubmed.ncbi.nlm.nih.gov/20543732/',
    'אחיזה סטטית: 67–70% מהמקסימום, 45–70 שניות תחת מתח, ומעל 30 שניות עוברים שלב במקום להוסיף זמן.',
  ],
  adapt: [
    'מחליטים לפי דיווח עצמי ולא לפי שעון — הוא נמדד כרגיש ועקבי יותר — pmc.ncbi.nlm.nih.gov/articles/PMC4789708/',
    'לא פועלים על נקודה בודדת: שתי דרישות, או יומיים ברצף.',
    'לעולם לא מוסיפים עומס בגלל אות טוב. מותר להוריד, לשמור, או לחזור לתוכנית.',
    'אימון שלא התקיים נמחק, לא נדחף קדימה, ובשום מצב לא מושלם על ידי הארכת ריצה אחרת.',
    'רצפת השבוע: ריצה ארוכה אחת, אימון איכות אחד, שני אימוני כוח. הורדה שתשבור את הרצפה — מורידים משהו אחר.',
    'שבוע ירידה כל 5–6 שבועות, ומוקדם יותר אם היו שלוש הורדות בשבוע אחד.',
  ],
  forbidden: [
    'ACWR — c-statistic 0.574 מול 0.5 של מודל ריק, ומשחזר את עצמו עם מכנה אקראי — pubmed.ncbi.nlm.nih.gov/33332011/',
    'כלל ה-10% כאמצעי בטיחות — הניסוי היחיד: 20.8% מול 20.3%, p=0.90 — pubmed.ncbi.nlm.nih.gov/17940147/',
    'סף של "ירידה של X% בזמן האחיזה" — מהימנות המדידה ICC 0.64, הסף היה נורה על רעש.',
    'מדד מונוטוניות כאזהרה — בקבוצת הרצים היחידה שנבדקה הוא לא ניבא כלום (p>0.05).',
    'הצגת ציון מוכנוּת לפני האימון — הוא יוצר את מה שהוא מנבא.',
  ],
  gymConstraints: [
    'בלי סקוואט, דדליפט ומכרעים עם מוט בחדר כושר. התחליף שנמדד: לחיצת רגליים, כפיפות ברכיים והרמות עקבים — עלות החמצן ירדה 2.0% — pubmed.ncbi.nlm.nih.gov/39523854/',
    'דדליפט רומני — לא בחדר כושר. בבית זה בסדר.',
    'תרגיל שנראה חריג בחדר כושר עובר לתחילת האימון ונעשה בבית.',
    'מכרעים במשקל גוף בבית — מותרים.',
  ],
} as const

// -- מהחוקים אל השבוע ---------------------------------------------------------

export type ProposedDay = {
  dow: number
  kind: 'gym' | 'home' | 'run' | 'walk'
  title: string
  focus: string
  /** לימי ריצה */
  km?: number
  minutes?: number
  /** מה עושים היום, במשפט */
  how?: string
  /** האם זה יום קשה — לספירה ולבדיקה */
  hard: boolean
}

export type WeekProposal = {
  days: ProposedDay[]
  weekKm: number
  /** השבוע בתוכנית, מתוך כמה */
  week: number
  weeks: number
  /** מה השתנה מול התוכנית הקיימת, בשפה שאפשר להחליט לפיה */
  changes: string[]
  /** הפרות שנמצאו בתוכנית הקיימת */
  fixes: string[]
}

/**
 * חלוקת הנפח השבועי בין ארבעה ימי ריצה. הארוכה לוקחת את החלק שלה
 * (`longShare`), ומה שנשאר מתחלק בין האיכות לשתי הקלות — האיכות מעט
 * ארוכה יותר, כי היא כוללת חימום ושחרור.
 */
export function splitWeek(weekKm: number): { long: number; quality: number; easy: number } {
  const long = Math.round(longShare(weekKm) * 10) / 10
  const rest = Math.max(0, weekKm - long)
  const quality = Math.round(rest * 0.36 * 10) / 10
  const easy = Math.round(((rest - quality) / 2) * 10) / 10
  return { long, quality, easy }
}

/**
 * השבוע שהחוקים מייצרים.
 *
 * למה דווקא הסדר הזה — כל יום כאן הוא תוצאה של אילוץ, לא של טעם:
 *
 *   ראשון  כוח (דחיפה)      — אחרי הארוכה של שבת, ופלג גוף עליון לא מפריע לה
 *   שני    ריצת איכות       — 48 שעות אחרי הארוכה, וזה המרחק המינימלי בין קשים
 *   שלישי  כוח (משיכה+רגליים) — רגליים כבדות רק כאן, כי מחר ריצה קלה בלבד
 *   רביעי  ריצה קלה         — 24 שעות אחרי רגליים; קלה מותרת, קשה לא
 *   חמישי  כוח (משיכה+סטטיים) — בלי רגליים, כדי לא לזהם את שישי ושבת
 *   שישי   ריצה קלה         — אין חדר כושר
 *   שבת    ריצה ארוכה       — אין חדר כושר, והיא לבד ביום שלה
 *
 * שלושה ימים קשים בדיוק: איכות, רגליים, ארוכה.
 */
export function proposeWeek(opts: { weekKm: number; week: number; weeks: number; longRunMinutes?: number }): ProposedDay[] {
  const s = splitWeek(opts.weekKm)
  return [
    {
      dow: 0,
      kind: 'gym',
      title: 'חדר כושר — דחיפה ושוקיים',
      focus: 'עמידת ידיים בהתחלה כשהכתף טרייה, אחר כך הדחיפה הכבדה, ובסוף הרמות עקבים',
      how: 'הרמות עקבים הן התרגיל היחיד שהשינוי בו תאם עם שיפור עלות החמצן בריצה.',
      hard: false,
    },
    {
      dow: 1,
      kind: 'run',
      title: 'ריצת איכות',
      focus: 'האימון האיכותי היחיד בשבוע',
      km: s.quality,
      hard: true,
    },
    {
      dow: 2,
      kind: 'gym',
      title: 'חדר כושר — משיכה ורגליים',
      focus: 'היום היחיד עם רגליים כבדות, כי למחרת יש רק ריצה קלה',
      how: 'לחיצת רגליים כבדה (4×4–6) וכפיפות ברכיים. בלי סקוואט, דדליפט או מכרעים.',
      hard: true,
    },
    {
      dow: 3,
      kind: 'run',
      title: 'ריצה קלה',
      focus: 'קלה בכוונה — 24 שעות אחרי רגליים',
      km: s.easy,
      how: 'אם הרגליים כבדות מאתמול זה צפוי. קלה באמת, ואם צריך — הליכה.',
      hard: false,
    },
    {
      dow: 4,
      kind: 'gym',
      title: 'חדר כושר — משיכה וסטטיים',
      focus: 'מתח, פרונט לבר ו-L-Sit. בלי רגליים, כדי לא לזהם את סוף השבוע',
      hard: false,
    },
    {
      dow: 5,
      kind: 'run',
      title: 'ריצה קלה + האצות',
      focus: 'נפח קל, ובסוף שש האצות של 20 שניות',
      km: s.easy,
      how: 'ההאצות קצרות בכוונה: ארוכות מזה כבר לוקחות מהארוכה של מחר.',
      hard: false,
    },
    {
      dow: 6,
      kind: 'run',
      title: 'ריצה ארוכה',
      focus: 'הדבר היחיד שאימון אינטרוולים לא קונה — עמידוּת',
      km: s.long,
      minutes: opts.longRunMinutes,
      how: 'קצב נוח לכל האורך. זו הריצה היחידה שלא מוגבלת ב-45 דקות.',
      hard: true,
    },
  ]
}

/** תיאור קצר של יום בתוכנית קיימת, להשוואה */
export type CurrentDay = { dow: number; kind: string; title: string; km?: number }

/**
 * מה משתנה, ולמה. מוחזר כטקסט כדי שההחלטה תהיה מול הסבר ולא מול דיף.
 */
export function weekChanges(current: CurrentDay[], proposed: ProposedDay[]): { changes: string[]; fixes: string[] } {
  const changes: string[] = []
  const fixes: string[] = []
  const HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const byDow = new Map<number, CurrentDay>()
  for (const d of current) if (!byDow.has(d.dow)) byDow.set(d.dow, d)

  // הפרות בתוכנית הקיימת. שימו לב לדיוק: האיסור הוא על ריצה **קשה** אחרי
  // רגליים, לא על כל ריצה — ריצה קלה למחרת היא בדיוק מה שצריך לעשות שם.
  const hardRun = (d?: CurrentDay) => !!d && d.kind === 'run' && /איכות|ארוכה|אינטרוול|טמפו|סף/.test(d.title)
  for (let i = 0; i < 7; i++) {
    const cur = byDow.get(i)
    if (cur && /רגליים/.test(cur.title) && hardRun(byDow.get((i + 1) % 7))) {
      fixes.push(`${HE[i]} רגליים ולמחרת ריצה קשה — כלכלת הריצה יורדת ב-24 השעות האלה`)
    }
  }
  const runDays = current.filter((d) => d.kind === 'run').length
  if (runDays < 4) fixes.push(`${runDays} ימי ריצה בשבוע — בתקרה של 45 דקות התדירות היא הדרך היחידה להעלות נפח`)
  // ריצה ארוכה שאינה ארוכה: מתחת ל-70 דקות היא לא קונה עמידוּת
  const longest = Math.max(0, ...current.filter((d) => d.kind === 'run').map((d) => d.km ?? 0))
  if (longest > 0 && longest * 7 < LONG_RUN_MIN_MINUTES) {
    fixes.push(`הארוכה בשבוע היא ${longest} ק״מ — בקצב שלך זה פחות מ-70 דקות, ומתחת לזה היא ריצה רגילה ולא ארוכה`)
  }

  for (const p of proposed) {
    const cur = byDow.get(p.dow)
    if (!cur) {
      changes.push(`${HE[p.dow]}: נוסף — ${p.title}`)
      continue
    }
    if (cur.kind !== p.kind) changes.push(`${HE[p.dow]}: ${cur.title} ← ${p.title}`)
    else if (p.km !== undefined && cur.km !== undefined && Math.abs(cur.km - p.km) >= 0.5) {
      changes.push(`${HE[p.dow]}: ${cur.km} ק״מ ← ${p.km}`)
    }
  }
  return { changes, fixes }
}

/**
 * הנפח שממנו בונים. **לא** השבוע הנוכחי — הוא חלקי כמעט תמיד, וביום ראשון
 * בבוקר הוא אפס, מה שהיה מאפס את כל התוכנית. ולא הממוצע, כי שבוע אחד חלש
 * (מבחנים, מחלה) היה מוריד את הבסיס. מה שכן: **הגבוה מבין השבועות השלמים
 * האחרונים** — זה הנפח שהגוף כבר יודע לעשות.
 *
 * הרשימה מגיעה מ-runWeeks: [תחילת שבוע, קילומטרים], מהישן לחדש.
 */
export function baseWeeklyKm(weeks: Array<[string, number]>, thisWeekStart: string, look = 4): number {
  const done = weeks.filter(([ws]) => ws !== thisWeekStart)
  if (!done.length) {
    // אין שבוע שלם עדיין — לוקחים את מה שיש עכשיו, כדי לא להתחיל מאפס
    const now = weeks.find(([ws]) => ws === thisWeekStart)
    return now ? Math.round(now[1] * 10) / 10 : 0
  }
  const recent = done.slice(-look).map(([, km]) => km)
  return Math.round(Math.max(...recent) * 10) / 10
}

// -- התרגילים עצמם ------------------------------------------------------------

export type ProposedExercise = {
  name: string
  sets?: number
  reps?: string
  metric: 'weight' | 'bodyweight' | 'reps' | 'time'
  note?: string
  rest?: number
  cues?: string
  /** למה התרגיל הזה נמצא כאן, במשפט אחד עם מקור */
  why?: string
}

/**
 * הסדר בתוך האימון הוא החלטה, לא טעם:
 *
 *   1. **עמידת ידיים ראשונה, תמיד.** בסקירה שיטתית של 38 מחקרים על עייפות
 *      ולמידה מוטורית, 65% הראו פגיעה ברכישת מיומנות — והעייפות שמזיקה
 *      היא **מקומית לשריר**, לא קרדיווסקולרית. כלומר מה שהורס תרגול
 *      עמידת ידיים זה כתף עייפה, לא ריאות עייפות.
 *      pubmed.ncbi.nlm.nih.gov/42480681/
 *   2. **הכבד אחרי זה.** במטא-אנליזה של סדר תרגילים, העלייה בכוח הגדולה
 *      ביותר היא בתרגילים שנעשים בתחילת האימון.
 *      pubmed.ncbi.nlm.nih.gov/32077380/
 *   3. **סטטיים אחרי המשיכה הכבדה**, כי הם מתחרים על אותו תקציב.
 *   4. **זוגות אנטגוניסטיים** (מתח מול מקבילים): חוסכים כמחצית מזמן
 *      האימון בלי הבדל בכוח או בהיפרטרופיה. pubmed.ncbi.nlm.nih.gov/39903375/
 *      זו הדרך היחידה להכניס את הכל ל-45 דקות.
 */
export const PROGRAM: Record<number, { exercises: ProposedExercise[] }> = {
  // ראשון — דחיפה ושוקיים
  0: {
    exercises: [
      {
        name: 'תרגול עמידת ידיים על הקיר',
        sets: 4,
        reps: 'מקסימום זמן',
        metric: 'time',
        rest: 60,
        cues: 'פנים לקיר, החזה כמעט נוגע, ידיים 20–30 ס״מ מהקיר.',
        note: 'ראשון באימון, כשהכתף טרייה. עוצרים כשהתנוחה מתחילה להישבר ולא כשנגמר הכוח.',
        why: 'עייפות מקומית פוגעת ברכישת מיומנות; עייפות קרדיווסקולרית פחות.',
      },
      { name: 'מקבילים (Dips)', sets: 3, reps: '6-8', metric: 'bodyweight', rest: 120, note: 'RIR 1–2. כשנסגרים 3×15 במשקל גוף — עוברים לחגורה.' },
      { name: 'לחיצת חזה בשיפוע עליון (משקולות)', sets: 3, reps: '8-10', metric: 'weight', rest: 120 },
      { name: 'לחיצת כתפיים בישיבה (משקולות)', sets: 3, reps: '8-10', metric: 'weight', rest: 90 },
      { name: 'הרחקת כתפיים — הנפות לצדדים במשקולות', sets: 3, reps: '12-15', metric: 'weight', rest: 60 },
      { name: 'פייס פול בכבל (Face Pull)', sets: 3, reps: '15', metric: 'weight', rest: 60, note: 'מאזן שלושה תרגילי דחיפה, ומחזיק כתף בריאה בעמידת ידיים.' },
      {
        name: 'הרמות עקבים בעמידה',
        sets: 4,
        reps: '6-8',
        metric: 'weight',
        rest: 90,
        cues: 'טווח מלא — עקב יורד מתחת לגובה המדרגה, ועלייה עד הסוף.',
        note: 'כבד. אם 8 חזרות קלות — מוסיפים משקל.',
        why: 'בפרוטוקול שנמדד על רצים, השינוי בהרמות עקבים היה המשתנה היחיד שתאם עם שיפור עלות החמצן (r=−0.477).',
      },
    ],
  },
  // שלישי — משיכה ורגליים
  2: {
    exercises: [
      { name: 'תרגול עמידת ידיים על הקיר', sets: 3, reps: 'מקסימום זמן', metric: 'time', rest: 60, note: 'בלוק קצר יותר מיום ראשון — לפני משיכה כבדה.' },
      {
        name: 'מתח (Pull-ups)',
        sets: 4,
        reps: '5-8',
        metric: 'bodyweight',
        rest: 120,
        note: 'RIR 1–2, לא עד כישלון. אם הסט העליון נותן 8–12 — מוסיפים משקל בפעם הבאה.',
        why: 'שישה עד עשרה סטים קשים לדפוס תנועה בשבוע; מעבר לזה התשואה פוחתת, וחדה במיוחד לכוח.',
      },
      { name: 'חתירה במשקולות בודדות או במכונה', sets: 3, reps: '8-10 לכל יד', metric: 'weight', rest: 90 },
      {
        name: 'לחיצת רגליים במכונה (Leg Press)',
        sets: 4,
        reps: '4-6',
        metric: 'weight',
        rest: 150,
        cues: 'ירידה מבוקרת, דחיפה מהירה ככל האפשר.',
        note: 'כבד — 80–85% ממה שאפשר להרים פעם אחת. זה היום היחיד בשבוע עם רגליים כבדות.',
        why: 'עומס ≥80% משפר כלכלת ריצה; עומס בינוני (40–79%) לא נמדד כמובהק.',
      },
      { name: 'כפיפות ברכיים במכונה (Leg Curls)', sets: 3, reps: '8-12', metric: 'weight', rest: 90, cues: 'ירידה איטית — שם עיקר העבודה.' },
      {
        name: 'הרמות עקבים בישיבה',
        sets: 3,
        reps: '8-12',
        metric: 'weight',
        rest: 60,
        why: 'ברך כפופה ב-90 מעלות מכוונת לסוליאוס — השריר שתורם הכי הרבה לדחיפה בריצה.',
      },
    ],
  },
  // חמישי — משיכה וסטטיים
  4: {
    exercises: [
      { name: 'תרגול עמידת ידיים על הקיר', sets: 3, reps: 'מקסימום זמן', metric: 'time', rest: 60 },
      { name: 'מתח (Pull-ups)', sets: 3, reps: '5-8', metric: 'bodyweight', rest: 120, note: 'יום המשיכה השני. RIR 1–2.' },
      {
        name: 'Tuck Front Lever',
        sets: 5,
        reps: '10 שניות',
        metric: 'time',
        rest: 120,
        cues: 'הגב מקביל לרצפה, לא הישבן. מרפקים ישרים.',
        note: 'אחיזת עבודה היא כ-70% מהאחיזה המקסימלית. עוצרים כשהתנוחה נשברת, לא כשהשעון מגיע.',
        why: 'עבודה סטטית היא כוח ולא מיומנות, ולכן היא באה אחרי המשיכה הכבדה ולא לפניה.',
      },
      { name: 'משיכת פולי עליון (Lat Pulldown)', sets: 3, reps: '10-12', metric: 'weight', rest: 90 },
      { name: 'L-Sit — Tuck (כל הגוף באוויר)', sets: 3, reps: '20 שניות', metric: 'time', rest: 90, cues: 'כתפיים למטה, ידיים ישרות, אגן נכנס פנימה.' },
      { name: 'הרמות רגליים בתלייה (Hanging Leg Raises)', sets: 3, reps: '10-12', metric: 'reps', rest: 90, note: 'ברכיים מכופפות אם הישרות לא נקיות. זה מה שמחבר את חדר הכושר ל-L-Sit ול-Front Lever.' },
      { name: 'כפיפות מרפק במשקולות', sets: 3, reps: '10-12', metric: 'weight', rest: 60, note: 'התרגיל הישיר היחיד לזרוע הקדמית בשבוע.' },
    ],
  },
  // שישי — הבלוק הביתי שנוסע עם הריצה הקלה
  5: {
    exercises: [
      {
        name: 'קפיצות פוגו',
        sets: 4,
        reps: '10',
        metric: 'reps',
        rest: 45,
        cues: 'קרסול נוקשה, מגע קצר בקרקע, ברך כמעט ישרה.',
        note: 'ארבעים נגיעות. לפני הריצה, על קרקע רכה.',
        why: 'חמש דקות קפיצות ביום, שישה שבועות — כלכלת הריצה השתפרה ב-12 ו-14 קמ״ש. הכי זול שיש, ובבית.',
      },
      { name: 'מכרעים (Lunges) במשקל גוף', sets: 3, reps: '15 לכל רגל', metric: 'reps', rest: 60, note: 'בבית, אחרי הריצה.' },
      { name: 'Hollow Body Hold (החזקת סירה)', sets: 3, reps: '30 שניות', metric: 'time', rest: 60, note: 'אותה תנוחה בדיוק של עמידת ידיים ושל Front Lever, רק בשכיבה.' },
    ],
  },
}

/** מוסיף לכל יום בהצעה את התרגילים שלו */
export function programFor(dow: number): ProposedExercise[] {
  return PROGRAM[dow]?.exercises ?? []
}
