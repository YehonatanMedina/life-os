// ---------------------------------------------------------------------------
// סולמות המיומנויות — ידע אימון גנרי, לא נתונים של המשתמש.
//
// כל מיומנות היא רצף שלבים. שלב הוא לא "תרגיל" אלא **תנאי מעבר מדיד**: מה
// צריך להחזיק, כמה, ובכמה סטים — כדי שהשאלה "אני כבר בשלב הבא?" תהיה
// שאלה של נתונים ולא של תחושה. מה שאישי (באיזה שלב אתה, ואיזה תרגיל
// בתוכנית מודד אותך) נשמר במצב, ב-`skills`.
//
// אין כאן מזהי סרטונים מומצאים: קישור טוטוריאל הוא תמיד חיפוש יוטיוב
// דטרמיניסטי, שגם לא מתיישן כשסרטון יורד.
// ---------------------------------------------------------------------------
import type { ExMetric } from './types'

/** קישור חיפוש ליוטיוב — עדיף על מזהה סרטון שעלול להיעלם או להיות שגוי */
export function tutorial(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

/** תנאי המעבר של שלב, בשפה שאפשר למדוד מול יומן האימונים */
export interface StageTarget {
  metric: ExMetric
  /** שניות ל-time, חזרות ל-reps/bodyweight, ק״ג ל-weight */
  value: number
  /** בכמה סטים צריך להחזיק את הערך הזה */
  sets: number
  /** תוספת משקל נדרשת (bodyweight בלבד) */
  kg?: number
}

export interface SkillStage {
  id: string
  /** שם השלב — מה שמופיע על המיילסטון */
  name: string
  /** מה עושים בפועל */
  what: string
  /** תנאי המעבר, בשפה אנושית */
  criteria: string
  /** המדידה, לחישוב אוטומטי מול הלוג */
  target?: StageTarget
  /** הדבר האחד שמפיל את רוב האנשים בשלב הזה */
  tip?: string
  /** מונח לחיפוש טוטוריאל */
  search?: string
}

export interface SkillLadder {
  id: string
  name: string
  emoji: string
  /** מטרת־העל */
  goal: string
  /** למה זה שווה את הזמן */
  why: string
  /**
   * מילות זיהוי לתרגיל שמודד את המיומנות, מול השמות בתוכנית. בזכותן המסע
   * מודד את עצמו כבר בפתיחה הראשונה, בלי שאף אחד יחבר ידנית תרגיל לשלב.
   * `exIds` בהתקדמות השמורה גובר עליהן.
   */
  match: string[]
  stages: SkillStage[]
}

// ---------------------------------------------------------------------------
export const SKILL_LADDERS: SkillLadder[] = [
  {
    id: 'sk-handstand',
    name: 'עמידת ידיים',
    emoji: '🤸',
    goal: 'עמידת ידיים חופשית, 30 שניות',
    why: 'הכתף החזקה והיציבה ביותר שאפשר לבנות, והבסיס לכל תרגיל דחיפה מתקדם. גם השיווי משקל הוא מיומנות נלמדת — לא כישרון.',
    match: ['עמידת ידיים', 'handstand'],
    stages: [
      {
        id: 'base',
        name: 'הבסיס — ליבה וכתף',
        what: 'פלאנק 60 שניות, ו-Hollow Hold 30 שניות.',
        criteria: 'פלאנק 60 שנ׳ נקי + Hollow Hold 30 שנ׳',
        target: { metric: 'time', value: 60, sets: 1 },
        tip: 'בלי הבסיס הזה הגוף מתקפל באוויר ואי אפשר לתקן את זה למעלה.',
        search: 'hollow body hold tutorial',
      },
      {
        id: 'wall-walk',
        name: 'טיפוס על הקיר',
        what: 'שכיבת סמיכה עם הרגליים על הקיר, מטפסים עם הרגליים למעלה ומקרבים את הידיים לקיר.',
        criteria: '3 סטים של טיפוס עד 30 ס״מ מהקיר וחזרה',
        target: { metric: 'time', value: 20, sets: 3 },
        tip: 'המרפקים ננעלים לפני שמתחילים לטפס, לא אחרי.',
        search: 'wall walk handstand progression',
      },
      {
        id: 'chest-wall',
        name: 'עמידה פנים לקיר',
        what: 'החזה כמעט נוגע בקיר, ידיים 20-30 ס״מ ממנו, מבט בין הידיים.',
        criteria: '45 שניות בנוח, בכל אחד מ-4 סטים',
        target: { metric: 'time', value: 45, sets: 4 },
        tip: 'זו העמידה שבונה את הקו הישר. גב לקיר זה נוח יותר ומלמד קשת — לכן פנים.',
        search: 'chest to wall handstand hold',
      },
      {
        id: 'shoulder-taps',
        name: 'נגיעות כתף על הקיר',
        what: 'מהעמידה פנים לקיר, מעבירים משקל ליד אחת ונוגעים בכתף הנגדית.',
        criteria: '3 סטים של 10 נגיעות לכל צד, בלי לאבד את הקו',
        target: { metric: 'reps', value: 10, sets: 3 },
        tip: 'זה השלב שמלמד את הגוף מה זה משקל על יד אחת — בלעדיו העמידה החופשית תמיד תיפול הצדה.',
        search: 'handstand shoulder taps wall',
      },
      {
        id: 'kick-up',
        name: 'בעיטה ושליטה בירידה',
        what: 'גב לקיר, בעיטה לעמידה, ותרגול יציאה מבוקרת (גלגלון או צעד החוצה).',
        criteria: '10 בעיטות רצופות עם נחיתה מבוקרת, בלי ליפול על הגב',
        target: { metric: 'reps', value: 10, sets: 3 },
        tip: 'קודם לומדים ליפול בבטחה, ורק אז מנסים להחזיק. אחרת הפחד עוצר את העמידה.',
        search: 'handstand kick up bail out safely',
      },
      {
        id: 'free-10',
        name: 'עמידה חופשית — 10 שניות',
        what: 'ללא קיר, תיקונים באצבעות.',
        criteria: '10 שניות, 3 פעמים באותו אימון',
        target: { metric: 'time', value: 10, sets: 3 },
        tip: 'התיקון נעשה בלחיצת האצבעות על הרצפה, לא בכיפוף הגב.',
        search: 'freestanding handstand balance fingers',
      },
      {
        id: 'free-30',
        name: 'עמידה חופשית — 30 שניות',
        what: 'המטרה.',
        criteria: '30 שניות רצופות, ללא קיר',
        target: { metric: 'time', value: 30, sets: 1 },
        search: 'freestanding handstand 30 seconds',
      },
    ],
  },
  {
    id: 'sk-frontlever',
    name: 'Front Lever',
    emoji: '🪂',
    goal: 'Front Lever מלא, 10 שניות',
    why: 'התרגיל שבונה גב רחב וליבה שאין דרך לזייף. כל שלב בו נראה בגב תוך שבועות.',
    match: ['front lever', 'שכמות', 'scapular'],
    stages: [
      {
        id: 'hang',
        name: 'תלייה ומשיכות שכמות',
        what: 'תלייה פסיבית, ואז Scapular Pulls — מרפקים ישרים, מורידים כתפיים ומקרבים שכמות.',
        criteria: 'תלייה 60 שנ׳, ו-3 סטים של 8 משיכות שכמות נקיות',
        target: { metric: 'reps', value: 8, sets: 3 },
        tip: 'זה השריר שמחזיק את כל התרגיל. מי שמדלג עליו נתקע ב-Tuck לחודשים.',
        search: 'scapular pull ups tutorial',
      },
      {
        id: 'tuck',
        name: 'Tuck Front Lever',
        what: 'ברכיים לחזה, הגב מקביל לרצפה.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
        tip: 'הגב מקביל לרצפה, לא הישבן. אם האגן גבוה מהכתפיים — זה עוד לא Tuck.',
        search: 'tuck front lever tutorial',
      },
      {
        id: 'adv-tuck',
        name: 'Advanced Tuck',
        what: 'אותו דבר, עם הגב שטוח והברכיים מתרחקות מהחזה.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
        tip: 'פותחים את הזווית באגן בכמה מעלות בכל שבוע, לא בבת אחת.',
        search: 'advanced tuck front lever',
      },
      {
        id: 'one-leg',
        name: 'רגל אחת ישרה',
        what: 'רגל אחת נפרשת, השנייה נשארת מכופפת. מחליפים צד.',
        criteria: '3 סטים של 10 שניות לכל צד',
        target: { metric: 'time', value: 10, sets: 3 },
        search: 'one leg front lever progression',
      },
      {
        id: 'straddle',
        name: 'Straddle Front Lever',
        what: 'שתי רגליים ישרות ופתוחות לצדדים.',
        criteria: '3 סטים של 10 שניות',
        target: { metric: 'time', value: 10, sets: 3 },
        tip: 'ככל שהרגליים פתוחות יותר, המנוף קצר יותר. סוגרים אותן בהדרגה.',
        search: 'straddle front lever progression',
      },
      {
        id: 'full',
        name: 'Front Lever מלא',
        what: 'המטרה.',
        criteria: '10 שניות, גוף אחד ישר',
        target: { metric: 'time', value: 10, sets: 1 },
        search: 'full front lever',
      },
    ],
  },
  {
    id: 'sk-lsit',
    name: 'L-Sit',
    emoji: '📐',
    goal: 'L-Sit על הרצפה, 30 שניות',
    why: 'ליבה, כופפי ירך ודחיפת כתף בתרגיל אחד. גם השער ל-V-Sit ולעמידת ידיים מכוח.',
    match: ['l-sit', 'l sit', 'lsit'],
    stages: [
      {
        id: 'pseudo',
        name: 'Pseudo L-Sit Lifts',
        what: 'ישיבה על הרצפה, רגליים ישרות, ידיים לצדדים. דוחפים את הרצפה, מרימים רגל אחת ומחזירים.',
        criteria: '3 סטים של 15 הרמות לכל רגל',
        target: { metric: 'reps', value: 15, sets: 3 },
        tip: 'הכתפיים נדחפות למטה ומרחיקות את האוזניים — כאן נבנה הכוח שמרים את הישבן אחר כך.',
        search: 'pseudo l sit lifts progression',
      },
      {
        id: 'foot-support',
        name: 'הרמת ישבן, עקבים על הרצפה',
        what: 'אותה ישיבה, אבל מרימים את הישבן מהרצפה והעקבים נשארים למטה.',
        criteria: '3 סטים של 20 שניות עם הישבן באוויר',
        target: { metric: 'time', value: 20, sets: 3 },
        tip: 'הרגע שהישבן עולה הוא הרגע שהתרגיל מתחיל. עד אז זו רק ישיבה.',
        search: 'foot supported l sit',
      },
      {
        id: 'tuck',
        name: 'Tuck L-Sit',
        what: 'כל הגוף באוויר, ברכיים מכופפות לחזה.',
        criteria: '3 סטים של 20 שניות',
        target: { metric: 'time', value: 20, sets: 3 },
        tip: 'עדיף על מקבילות או שני ספרים עבים — הרצפה לא סולחת על ידיים קצרות.',
        search: 'tuck l sit tutorial',
      },
      {
        id: 'one-leg',
        name: 'רגל אחת ישרה',
        what: 'מה-Tuck, פורשים רגל אחת ישרה קדימה.',
        criteria: '3 סטים של 15 שניות לכל צד',
        target: { metric: 'time', value: 15, sets: 3 },
        search: 'one leg l sit progression',
      },
      {
        id: 'full-15',
        name: 'L-Sit מלא — 15 שניות',
        what: 'שתי רגליים ישרות ב-90 מעלות.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
        tip: 'ברכיים נעולות ואצבעות רגליים מתוחות. רגליים מכופפות זה עוד Tuck.',
        search: 'full l sit hold',
      },
      {
        id: 'full-30',
        name: 'L-Sit — 30 שניות',
        what: 'המטרה.',
        criteria: '30 שניות רצופות על הרצפה',
        target: { metric: 'time', value: 30, sets: 1 },
        search: 'l sit 30 second hold',
      },
    ],
  },
  {
    id: 'sk-pullup',
    name: 'מתח במשקל',
    emoji: '🧲',
    goal: 'מתח עם תוספת 20 ק״ג, 3 סטים של 5',
    why: 'המדד הכי ישיר לכוח משיכה. גם מה שהופך את ה-Front Lever מאפשרי לקל.',
    match: ['pull-up', 'pull up', 'pullup'],
    stages: [
      {
        id: 'bw-8',
        name: 'משקל גוף — 3×8',
        what: 'מתח באחיזה עליונה, טווח מלא: מזרועות ישרות עד סנטר מעל המוט.',
        criteria: '8 חזרות נקיות בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 8, sets: 3 },
        tip: 'טווח מלא. חצי חזרה לא נספרת ולא בונה.',
      },
      {
        id: 'bw-12',
        name: 'משקל גוף — 3×12',
        what: 'אותו דבר, יותר חזרות.',
        criteria: '12 חזרות בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 12, sets: 3 },
        tip: 'מכאן והלאה עוד חזרות זה בזבוז זמן — מוסיפים משקל.',
      },
      {
        id: 'w5',
        name: '+5 ק״ג',
        what: 'חגורת משקל, או תרמיל עם צלחת.',
        criteria: '6 חזרות עם 5 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 6, sets: 3, kg: 5 },
      },
      {
        id: 'w10',
        name: '+10 ק״ג',
        what: '',
        criteria: '6 חזרות עם 10 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 6, sets: 3, kg: 10 },
      },
      {
        id: 'w15',
        name: '+15 ק״ג',
        what: '',
        criteria: '5 חזרות עם 15 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 5, sets: 3, kg: 15 },
      },
      {
        id: 'w20',
        name: '+20 ק״ג',
        what: 'המטרה.',
        criteria: '5 חזרות עם 20 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 5, sets: 3, kg: 20 },
      },
    ],
  },
  {
    id: 'sk-dip',
    name: 'מקבילים במשקל',
    emoji: '⛓️',
    goal: 'מקבילים עם תוספת 20 ק״ג, 3 סטים של 5',
    why: 'הדחיפה החזקה ביותר במשקל גוף, והמקבילה של המתח בצד השני של הגוף.',
    match: ['מקבילים', 'dip'],
    stages: [
      {
        id: 'bw-10',
        name: 'משקל גוף — 3×10',
        what: 'ירידה עד 90 מעלות במרפק, כתפיים לא צונחות לאוזניים.',
        criteria: '10 חזרות בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 10, sets: 3 },
        tip: 'ירידה עמוקה מדי לפני שהכתף מוכנה היא הפציעה הכי נפוצה בתרגיל הזה.',
        search: 'dips proper form shoulder safe',
      },
      {
        id: 'bw-15',
        name: 'משקל גוף — 3×15',
        what: '',
        criteria: '15 חזרות בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 15, sets: 3 },
      },
      {
        id: 'w5',
        name: '+5 ק״ג',
        what: '',
        criteria: '8 חזרות עם 5 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 8, sets: 3, kg: 5 },
      },
      {
        id: 'w10',
        name: '+10 ק״ג',
        what: '',
        criteria: '8 חזרות עם 10 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 8, sets: 3, kg: 10 },
      },
      {
        id: 'w15',
        name: '+15 ק״ג',
        what: '',
        criteria: '6 חזרות עם 15 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 6, sets: 3, kg: 15 },
      },
      {
        id: 'w20',
        name: '+20 ק״ג',
        what: 'המטרה.',
        criteria: '5 חזרות עם 20 ק״ג בכל אחד מ-3 הסטים',
        target: { metric: 'bodyweight', value: 5, sets: 3, kg: 20 },
      },
    ],
  },
]

export function ladder(id: string): SkillLadder | undefined {
  return SKILL_LADDERS.find((x) => x.id === id)
}

// ---------------------------------------------------------------------------
// ריצה — הדרך לחצי מרתון
//
// המיילסטון הוא הריצה הארוכה, כי היא זו שקובעת אם המרחק אפשרי. הנפח
// השבועי הוא מה שמחזיק אותה, ולכן הוא מופיע לצידה ולא במקומה.
// ---------------------------------------------------------------------------
export interface RunMilestone {
  km: number
  name: string
  /** מה הנפח השבועי שצריך להחזיק כדי שהריצה הארוכה הזו תהיה בטוחה */
  weekKm: number
  note: string
}

export const RUN_MILESTONES: RunMilestone[] = [
  { km: 5, name: '5 ק״מ רצוף', weekKm: 12, note: 'המרחק הראשון שהוא כבר לא "לצאת לרוץ". בקצב שאפשר לדבר בו.' },
  { km: 8, name: '8 ק״מ', weekKm: 18, note: 'כאן מתחילים להרגיש את ההבדל בין כושר לב לסיבולת רגליים.' },
  { km: 10, name: '10 ק״מ', weekKm: 24, note: 'חצי הדרך. מכאן הריצה הארוכה מקבלת יום קבוע בשבוע.' },
  { km: 12, name: '12 ק״מ', weekKm: 28, note: 'הזמן להתחיל לתרגל שתייה תוך כדי ריצה.' },
  { km: 15, name: '15 ק״מ', weekKm: 32, note: 'הריצה הראשונה שדורשת תכנון מסלול ולא רק זמן פנוי.' },
  { km: 18, name: '18 ק״מ', weekKm: 36, note: 'הריצה הארוכה שממנה כבר יודעים שחצי מרתון יקרה. אין צורך לרוץ 21 באימון.' },
  { km: 21.1, name: 'חצי מרתון', weekKm: 36, note: 'המטרה. שלושת השבועות שלפני — הפחתת נפח, לא הוספה.' },
]

/** הכלל שמונע פציעות: לא יותר מ-10% נפח בשבוע */
export const RUN_WEEKLY_GROWTH = 0.1

/** התאמת שם תרגיל למילות הזיהוי של סולם */
export function matchesSkill(lad: SkillLadder, exName: string): boolean {
  const n = exName.toLowerCase()
  return lad.match.some((m) => n.includes(m.toLowerCase()))
}
