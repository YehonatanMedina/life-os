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
  /**
   * מילות פסילה — שם שמכיל אותן לא מודד את המיומנות הזו גם אם הוא תואם
   * ל-`match`. "שכיבות סמיכה בעמידת ידיים" מכיל "עמידת ידיים" אבל הוא לא
   * החזקה של עמידת ידיים, וסולם אחד שגוזל את התרגיל של סולם אחר הופך את
   * שתי המדידות לשקר.
   */
  exclude?: string[]
  /** מה צריך להחזיק לפני שנוגעים בזה בכלל */
  needs?: string
  stages: SkillStage[]
}

/**
 * סדר המטרות — רשימה אחת שטוחה, מהראשון שעובדים עליו עכשיו ועד האחרון.
 *
 * למה אין כאן קבוצות (20.9.2026): קבוצה יוצרת שתי מחלקות אזרחים — "מה
 * שבתוכנית" מול "מה שאי־פעם". אבל כולן מטרות, וההתקדמות היא מכולן. מה שבאמת
 * משתנה בין מטרה למטרה הוא רק **מתי** נוגעים בה, וזה בדיוק סדר — לא מחלקה.
 *
 * שני כללים שקובעים את הסדר, ואסור לשנות אותו בלעדיהם:
 * 1. **מיומנות שהיא תנאי למיומנות אחרת יושבת לפניה, אף פעם לא אחריה.**
 *    Back Lever קל מ-Front Lever ומלמד את אותה החזקה אופקית, ודגל הדרקון בונה
 *    בדיוק את הליבה ש-Front Lever דורש — ולכן שניהם לפניו.
 * 2. **מה שקובע מקום הוא מתי אפשר לאמן את השלב הראשון בפועל**, לא כמה קשה
 *    הפסגה. כשהפער בין השניים גדול, `needs` אומר מה מפריד מכל אחד מהם.
 *
 * הריצה ראשונה תמיד: היא המטרה היחידה עם תאריך חיצוני, והיא נמדדת שלוש פעמים
 * בשבוע. `RUN_GOAL` הוא לא סולם מיומנות, אבל הוא מטרה ככל השאר ולכן הוא כאן.
 */
export const GOAL_ORDER: string[] = [
  'run',
  'sk-handstand',
  'sk-lsit',
  'sk-pullup',
  'sk-dip',
  // מכאן והלאה — הבאים בתור, בסדר שבו הם נכנסים
  'sk-backlever',
  'sk-dragonflag',
  'sk-frontlever',
  'sk-muscleup',
  'sk-pistol',
  'sk-oapushup',
  'sk-hspu',
  'sk-vsit',
  'sk-flag',
  'sk-planche',
  'sk-oapullup',
]

/** הריצה כמטרה ברשימה — כותרת ואייקון בלבד; השלבים שלה הם RUN_MILESTONES */
export const RUN_GOAL = {
  id: 'run',
  name: 'חצי מרתון',
  emoji: '🏃',
  goal: 'לסיים חצי מרתון, 21.1 ק״מ',
} as const

/**
 * כמה מטרות נמצאות במוקד בו־זמנית — הראשונות ב-`GOAL_ORDER`.
 *
 * המוקד הוא לא "מה נספר" אלא "על מה עובדים עכשיו": ההתקדמות מחושבת מכל
 * המטרות, והמוקד רק אומר לאן הולכת תשומת הלב השבוע. חמש, כי אלה בדיוק
 * המטרות שיש להן תרגיל בתוכנית השבועית שמודד אותן כל שבוע — הריצה,
 * עמידת ידיים, L-Sit, מתח ומקבילים. מטרה שיוצאת מהתוכנית יורדת בסדר.
 */
export const FOCUS_COUNT = 5

// ---------------------------------------------------------------------------
export const SKILL_LADDERS: SkillLadder[] = [
  {
    id: 'sk-handstand',
    name: 'עמידת ידיים',
    emoji: '🤸',
    goal: 'עמידת ידיים חופשית, 30 שניות',
    why: 'הכתף החזקה והיציבה ביותר שאפשר לבנות, והבסיס לכל תרגיל דחיפה מתקדם. גם השיווי משקל הוא מיומנות נלמדת — לא כישרון.',
    match: ['עמידת ידיים', 'handstand'],
    exclude: ['שכיבות סמיכה', 'push-up', 'push up', 'hspu'],
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
  {
    id: 'sk-frontlever',
    name: 'Front Lever',
    emoji: '🪂',
    goal: 'Front Lever מלא, 10 שניות',
    why: 'התרגיל שבונה גב רחב וליבה שאין דרך לזייף. כל שלב בו נראה בגב תוך שבועות.',
    match: ['front lever', 'שכמות', 'scapular'],
    // הסולם הארוך ביותר כאן: הרגל הראשונה היא תלייה ומשיכות שכמות — אפשר להתחיל
    // אותה השבוע — והפסגה היא שנים. הוא בקבוצה הראשונה בגלל הרגל הראשונה, ולכן
    // `needs` אומר במפורש מה מפריד ממנה ומה מפריד מהמלא.
    needs: 'לשלב הראשון — כלום מלבד מוט. למלא — מתח עם תוספת של כשליש ממשקל הגוף, וליבה ברמת דגל הדרקון',
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
  // --- קבוצה 2: הבא בתור ------------------------------------------------------
  {
    id: 'sk-backlever',
    name: 'Back Lever',
    emoji: '🔄',
    goal: 'Back Lever מלא, 10 שניות',
    why: 'ההפוך של ה-Front Lever וקל ממנו בהרבה — לכן זה ההישג הראשון שנראה בלתי אפשרי ובעצם מגיע מהר. הוא גם הדרך הבטוחה ללמד את המרפק והכתף להחזיק גוף אופקי, וזה בדיוק מה שה-Front Lever דורש אחר כך.',
    match: ['back lever', 'german hang', 'תלייה גרמנית'],
    needs: 'תלייה 60 שנ׳, וכתף בריאה',
    stages: [
      {
        id: 'german-hang',
        name: 'תלייה גרמנית',
        what: 'מהתלייה, מעבירים את הרגליים דרך הידיים ונשארים תלויים עם הגב לכיוון המוט.',
        criteria: '3 סטים של 20 שניות',
        target: { metric: 'time', value: 20, sets: 3 },
        tip: 'נכנסים לזה לאט מאוד. זו התנוחה שהכי הרבה כתפיים נפגעו בה מחיפזון.',
        search: 'german hang skin the cat progression',
      },
      {
        id: 'tuck',
        name: 'Tuck Back Lever',
        what: 'ברכיים לחזה, הגב מקביל לרצפה, פנים למטה.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
      },
      {
        id: 'adv-tuck',
        name: 'Advanced Tuck',
        what: 'פותחים את האגן, הגב שטוח.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
      },
      {
        id: 'one-leg',
        name: 'רגל אחת ישרה',
        what: '',
        criteria: '3 סטים של 10 שניות לכל צד',
        target: { metric: 'time', value: 10, sets: 3 },
      },
      {
        id: 'straddle',
        name: 'Straddle',
        what: 'שתי רגליים ישרות ופתוחות.',
        criteria: '3 סטים של 10 שניות',
        target: { metric: 'time', value: 10, sets: 3 },
      },
      {
        id: 'full',
        name: 'Back Lever מלא',
        what: 'המטרה.',
        criteria: '10 שניות, גוף אחד ישר',
        target: { metric: 'time', value: 10, sets: 1 },
        search: 'full back lever tutorial',
      },
    ],
  },
  {
    id: 'sk-dragonflag',
    name: 'דגל הדרקון',
    emoji: '🐉',
    goal: 'Dragon Flag, 3 סטים של 5',
    why: 'תרגיל הליבה שברוס לי עשה, ואין בו שום דרך לרמות: או שהגוף ישר או שהוא לא. גם בונה בדיוק את הליבה שה-Front Lever צריך.',
    match: ['dragon', 'דגל הדרקון'],
    needs: 'Hollow Hold 45 שנ׳',
    stages: [
      {
        id: 'tuck',
        name: 'ברכיים מכופפות',
        what: 'שוכבים, אוחזים בספסל או ברגל ספה מעל הראש, מרימים את הגוף על השכמות והברכיים מכופפות.',
        criteria: '3 סטים של 8 חזרות מבוקרות',
        target: { metric: 'reps', value: 8, sets: 3 },
        tip: 'רק השכמות על הרצפה. אם חלק מהגב התחתון נשען — זה עוד לא התרגיל.',
        search: 'dragon flag progression beginner',
      },
      {
        id: 'one-leg',
        name: 'רגל אחת ישרה',
        what: 'רגל אחת נפרשת, השנייה מכופפת.',
        criteria: '3 סטים של 8 לכל צד',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'negative',
        name: 'ירידה איטית מלאה',
        what: 'גוף ישר, ירידה של 5 שניות, וחזרה למעלה בברכיים מכופפות.',
        criteria: '3 סטים של 5 ירידות',
        target: { metric: 'reps', value: 5, sets: 3 },
        tip: 'הגב התחתון לא נכנס לקשת. ברגע שהוא מתקמר — עוצרים את הסט.',
        search: 'dragon flag negatives',
      },
      {
        id: 'full-5',
        name: '3×5 מלאים',
        what: 'המטרה.',
        criteria: '5 חזרות מלאות בכל אחד מ-3 הסטים',
        target: { metric: 'reps', value: 5, sets: 3 },
      },
    ],
  },
  {
    id: 'sk-muscleup',
    name: 'מאסל־אפ',
    emoji: '🚀',
    goal: 'מאסל־אפ נקי במוט, 3 חזרות',
    why: 'המיומנות שהופכת מתח ומקבילים לתנועה אחת, והראשונה שאנשים בחדר כושר עוצרים להסתכל עליה. גם הבדיקה האמיתית לכוח משיכה מתפרץ.',
    match: ['muscle-up', 'muscle up', 'מאסל'],
    needs: 'מתח 3×10 ומקבילים 3×10 במשקל גוף',
    stages: [
      {
        id: 'explosive-pull',
        name: 'משיכה מתפרצת',
        what: 'מתח שנמשך בכוח עד שהמוט נוגע בעצם החזה, לא בסנטר.',
        criteria: '3 סטים של 5 משיכות עד החזה',
        target: { metric: 'bodyweight', value: 5, sets: 3 },
        tip: 'אם המוט לא מגיע לחזה אין מאיפה לעשות את המעבר. זה לא עניין של טכניקה אלא של גובה.',
        search: 'explosive pull ups chest to bar',
      },
      {
        id: 'straight-bar-dip',
        name: 'דחיפות על מוט ישר',
        what: 'למעלה מעל המוט, ידיים ישרות, יורדים עד שהחזה נוגע במוט וחוזרים.',
        criteria: '3 סטים של 8',
        target: { metric: 'bodyweight', value: 8, sets: 3 },
        tip: 'זה החצי השני של התרגיל, וכמעט כולם מגלים אותו רק אחרי שהם נתקעים במעבר.',
        search: 'straight bar dips tutorial',
      },
      {
        id: 'transition',
        name: 'המעבר',
        what: 'מעבר מסביב למוט בעזרת גומייה או קפיצה מהרצפה — רק החלק של הסיבוב סביב המוט.',
        criteria: '3 סטים של 3 מעברים בעזרה',
        target: { metric: 'bodyweight', value: 3, sets: 3 },
        tip: 'המרפקים מסתובבים קדימה והראש נכנס מעל המוט. לא מנסים לעלות — מנסים להסתובב.',
        search: 'muscle up transition drill band',
      },
      {
        id: 'first',
        name: 'המאסל־אפ הראשון',
        what: 'אחד, גם אם מכוער.',
        criteria: 'חזרה אחת ללא עזרה',
        target: { metric: 'bodyweight', value: 1, sets: 1 },
      },
      {
        id: 'strict-3',
        name: '3 חזרות נקיות',
        what: 'המטרה — בלי נדנוד רגליים.',
        criteria: '3 חזרות רצופות, ללא קיפ',
        target: { metric: 'bodyweight', value: 3, sets: 1 },
        search: 'strict muscle up progression',
      },
    ],
  },
  {
    id: 'sk-pistol',
    name: 'סקוואט על רגל אחת',
    emoji: '🦵',
    goal: 'Pistol Squat, 3 סטים של 5 לכל רגל',
    why: 'כוח רגל אחת הוא מה שמונע פציעות בריצה, ופער בין הרגליים מתגלה כאן לפני שהוא מתגלה בכאב. גם לא דורש שום ציוד.',
    match: ['pistol', 'סקוואט על רגל'],
    needs: 'סקוואט 90 ק״ג ל-10, וניידות קרסול',
    stages: [
      {
        id: 'assisted',
        name: 'בעזרת אחיזה',
        what: 'מחזיקים עמוד או משקוף עם יד אחת ויורדים על רגל אחת עד הסוף.',
        criteria: '3 סטים של 8 לכל רגל',
        target: { metric: 'reps', value: 8, sets: 3 },
        tip: 'היד עוזרת לשיווי משקל, לא מושכת למעלה.',
        search: 'assisted pistol squat progression',
      },
      {
        id: 'box',
        name: 'ירידה לספסל',
        what: 'יורדים על רגל אחת עד שהישבן נוגע בספסל, ומורידים את גובה הספסל בהדרגה.',
        criteria: '3 סטים של 8 לכל רגל מספסל בגובה 30 ס״מ',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'negative',
        name: 'ירידה איטית',
        what: 'ירידה של 5 שניות עד הסוף, ועלייה בשתי רגליים.',
        criteria: '3 סטים של 5 ירידות לכל רגל',
        target: { metric: 'reps', value: 5, sets: 3 },
        tip: 'העקב לא עולה מהרצפה. אם הוא עולה — הקרסול חסום, וזו עבודת ניידות ולא כוח.',
        search: 'pistol squat negative ankle mobility',
      },
      {
        id: 'full-1',
        name: 'הראשון המלא',
        what: 'ירידה ועלייה על רגל אחת, בלי עזרה.',
        criteria: 'חזרה אחת נקייה בכל רגל',
        target: { metric: 'reps', value: 1, sets: 2 },
      },
      {
        id: 'full-5',
        name: '3×5 לכל רגל',
        what: 'המטרה.',
        criteria: '5 חזרות בכל אחד מ-3 הסטים, בשתי הרגליים',
        target: { metric: 'reps', value: 5, sets: 3 },
      },
    ],
  },
  {
    id: 'sk-oapushup',
    name: 'שכיבת סמיכה ביד אחת',
    emoji: '💪',
    goal: 'שכיבת סמיכה ביד אחת, 3 בכל צד',
    why: 'הדחיפה הכי מרשימה שאפשר לעשות בסלון בלי ציוד, וגם מה שמלמד את הליבה להתנגד לסיבוב.',
    match: ['סמיכה ביד אחת', 'archer push', 'שכיבות קשת'],
    needs: 'שכיבות יהלום 3×12',
    stages: [
      {
        id: 'archer',
        name: 'שכיבות קשת',
        what: 'ידיים רחוק זו מזו, יורדים לכיוון יד אחת והשנייה נשארת ישרה.',
        criteria: '3 סטים של 8 לכל צד',
        target: { metric: 'reps', value: 8, sets: 3 },
        tip: 'היד הישרה לא דוחפת. אם היא עוזרת, זו שכיבה רגילה רחבה.',
        search: 'archer push up tutorial',
      },
      {
        id: 'uneven',
        name: 'יד אחת מוגבהת',
        what: 'יד אחת על ספר או מדרגה, השנייה על הרצפה. מעלים את הגובה בהדרגה.',
        criteria: '3 סטים של 8 לכל צד מגובה 20 ס״מ',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'elevated-oa',
        name: 'יד אחת על הגבהה גבוהה',
        what: 'כבר באמת יד אחת, אבל היד על שולחן או ספסל — כך חלק מהמשקל נופל על הרגליים.',
        criteria: '3 סטים של 5 לכל צד',
        target: { metric: 'reps', value: 5, sets: 3 },
        tip: 'רגליים פתוחות רחב. זה מה שמחזיק את האגן מלהסתובב.',
        search: 'elevated one arm push up progression',
      },
      {
        id: 'negative',
        name: 'ירידה ביד אחת',
        what: 'ירידה של 4-5 שניות על הרצפה ביד אחת, ועלייה בשתיים.',
        criteria: '3 סטים של 3 לכל צד',
        target: { metric: 'reps', value: 3, sets: 3 },
      },
      {
        id: 'full-3',
        name: '3 חזרות בכל צד',
        what: 'המטרה.',
        criteria: '3 חזרות מלאות בכל יד',
        target: { metric: 'reps', value: 3, sets: 2 },
        search: 'one arm push up form',
      },
    ],
  },

  // --- קבוצה 3: מתקדם --------------------------------------------------------
  {
    id: 'sk-hspu',
    name: 'שכיבות סמיכה בעמידת ידיים',
    emoji: '🔻',
    goal: 'HSPU על הקיר, 3 סטים של 5',
    why: 'הדחיפה האנכית החזקה ביותר במשקל גוף. מי שעושה אותה לא צריך לחיצת כתפיים.',
    match: ['hspu', 'פייק', 'handstand push'],
    needs: 'עמידה פנים לקיר 45 שנ׳',
    stages: [
      {
        id: 'pike',
        name: 'פייק פוש-אפס',
        what: 'ישבן למעלה, ראש יורד לרצפה בין הידיים.',
        criteria: '3 סטים של 10',
        target: { metric: 'reps', value: 10, sets: 3 },
        tip: 'מרפקים 45 מעלות לאחור, לא לצדדים. מרפק לצדדים זה איך שנפצעת בכתף.',
        search: 'pike push up form shoulder',
      },
      {
        id: 'deficit-pike',
        name: 'פייק עם ידיים מוגבהות',
        what: 'ידיים על שני ספרים, כדי שהראש ירד מתחת לגובה הידיים.',
        criteria: '3 סטים של 8',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'elevated-pike',
        name: 'פייק עם רגליים על כיסא',
        what: 'רגליים על כיסא, הגוף כמעט אנכי — כאן הופך להיות באמת לחיצה מעל הראש.',
        criteria: '3 סטים של 8',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'wall-half',
        name: 'חצי טווח על הקיר',
        what: 'בעמידה על הקיר, ירידה של חצי הדרך וחזרה.',
        criteria: '3 סטים של 5',
        target: { metric: 'reps', value: 5, sets: 3 },
        tip: 'שמים כרית מתחת לראש. לא בשביל להישען עליה — בשביל לא לפחד.',
        search: 'wall handstand push up progression',
      },
      {
        id: 'wall-full',
        name: 'טווח מלא על הקיר',
        what: 'הראש נוגע ברצפה וחוזר עד נעילת מרפקים.',
        criteria: '5 חזרות בכל אחד מ-3 הסטים',
        target: { metric: 'reps', value: 5, sets: 3 },
      },
      {
        id: 'free',
        name: 'חופשי',
        what: 'המטרה הרחוקה — בלי קיר.',
        criteria: 'חזרה אחת בעמידה חופשית',
        target: { metric: 'reps', value: 1, sets: 1 },
      },
    ],
  },
  {
    id: 'sk-vsit',
    name: 'V-Sit',
    emoji: '✌️',
    goal: 'V-Sit על הרצפה, 10 שניות',
    why: 'ה-L-Sit עם הרגליים מעל הראש. דורש כפיפות ירך וגמישות המסטרינגס יחד עם כוח — ולכן מעט מאוד אנשים מגיעים אליו.',
    match: ['v-sit', 'v sit'],
    needs: 'L-Sit 30 שנ׳',
    stages: [
      {
        id: 'compression',
        name: 'כפיפות בישיבה',
        what: 'ישיבה ברגליים ישרות, מרימים את שתיהן מהרצפה ומחזיקים — Seated Leg Lifts.',
        criteria: '3 סטים של 10 הרמות',
        target: { metric: 'reps', value: 10, sets: 3 },
        tip: 'זו לא עבודת ליבה אלא עבודת כפיפי ירך. הן החוליה החלשה כאן, לא הבטן.',
        search: 'compression work v sit progression',
      },
      {
        id: 'high-lsit',
        name: 'החזקה מעל 90 מעלות',
        what: 'אותה החזקה, אבל הרגליים עולות מעל קו המקביל לרצפה.',
        criteria: '3 סטים של 10 שניות',
        target: { metric: 'time', value: 10, sets: 3 },
      },
      {
        id: 'one-leg-v',
        name: 'רגל אחת גבוהה',
        what: 'רגל אחת ב-45 מעלות מעל הקו, השנייה ב-90.',
        criteria: '3 סטים של 10 שניות לכל צד',
        target: { metric: 'time', value: 10, sets: 3 },
      },
      {
        id: 'v-5',
        name: 'V-Sit — 5 שניות',
        what: 'שתי הרגליים גבוה.',
        criteria: '3 סטים של 5 שניות',
        target: { metric: 'time', value: 5, sets: 3 },
      },
      {
        id: 'v-10',
        name: 'V-Sit — 10 שניות',
        what: 'המטרה.',
        criteria: '10 שניות רצופות',
        target: { metric: 'time', value: 10, sets: 1 },
      },
    ],
  },
  {
    id: 'sk-flag',
    name: 'דגל אנושי',
    emoji: '🚩',
    goal: 'Human Flag, 5 שניות',
    why: 'התרגיל שנראה הכי בלתי אפשרי מכולם, והוא בעיקר עניין של אלכסונים ולא של כוח טהור. מי שרואה אותו לא שוכח.',
    match: ['דגל אנושי', 'human flag'],
    needs: 'לחיצת כתפיים במשקל גוף, וליבה של דגל הדרקון',
    stages: [
      {
        id: 'support',
        name: 'אחיזה ותמיכה על עמוד',
        what: 'עמוד אנכי, יד עליונה מושכת ויד תחתונה דוחפת. פשוט להחזיק את הגוף לחוץ לעמוד ברגליים על הרצפה.',
        criteria: '3 סטים של 10 שניות לכל צד',
        target: { metric: 'time', value: 10, sets: 3 },
        tip: 'היד התחתונה דוחפת את העמוד, לא נשענת עליו. זה כל הסוד של התרגיל.',
        search: 'human flag support hold progression',
      },
      {
        id: 'vertical',
        name: 'דגל אנכי',
        what: 'הרגליים באוויר אבל למעלה — כמו עמידת ידיים על הצד. הקל ביותר, כי המנוף קצר.',
        criteria: '3 סטים של 10 שניות',
        target: { metric: 'time', value: 10, sets: 3 },
      },
      {
        id: 'chamber',
        name: 'רגליים מכופפות',
        what: 'מורידים מהאנכי לזווית, עם הברכיים אסופות לחזה.',
        criteria: '3 סטים של 8 שניות',
        target: { metric: 'time', value: 8, sets: 3 },
      },
      {
        id: 'straddle',
        name: 'Straddle Flag',
        what: 'רגליים ישרות ופתוחות, הגוף כמעט מקביל לרצפה.',
        criteria: '3 סטים של 5 שניות',
        target: { metric: 'time', value: 5, sets: 3 },
      },
      {
        id: 'full',
        name: 'דגל מלא',
        what: 'המטרה.',
        criteria: '5 שניות, גוף ישר ומקביל לרצפה',
        target: { metric: 'time', value: 5, sets: 1 },
      },
    ],
  },

  // --- קבוצה 4: החלום -------------------------------------------------------
  {
    id: 'sk-planche',
    name: 'פלאנש',
    emoji: '🕊️',
    goal: 'Full Planche, 5 שניות',
    why: 'הכוח הסטטי הגדול ביותר במשקל גוף — הגוף מקביל לרצפה בלי שום מגע מלבד הידיים. שנים של עבודה, וכתפיים שאין עליהן ויכוח.',
    match: ['planche', 'פלאנש'],
    needs: 'עמידת ידיים חופשית 30 שנ׳, ו-Tuck Front Lever',
    stages: [
      {
        id: 'lean',
        name: 'Planche Lean',
        what: 'מנח שכיבת סמיכה, מזיזים את הכתפיים קדימה מעבר לידיים ומחזיקים.',
        criteria: '3 סטים של 20 שניות עם הכתפיים מעבר לאצבעות',
        target: { metric: 'time', value: 20, sets: 3 },
        tip: 'הכף יד מסובבת חוצה, והשורשים סופגים את כל העומס. עוברים לעבודת אמות במקביל, אחרת זו דלקת.',
        search: 'planche lean progression wrist',
      },
      {
        id: 'pseudo',
        name: 'Pseudo Planche Push-ups',
        what: 'שכיבות סמיכה מתוך ה-Lean.',
        criteria: '3 סטים של 8',
        target: { metric: 'reps', value: 8, sets: 3 },
      },
      {
        id: 'tuck',
        name: 'Tuck Planche',
        what: 'ברכיים אסופות, כל הגוף באוויר על הידיים.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
      },
      {
        id: 'adv-tuck',
        name: 'Advanced Tuck',
        what: 'גב שטוח, אגן נפתח.',
        criteria: '3 סטים של 15 שניות',
        target: { metric: 'time', value: 15, sets: 3 },
      },
      {
        id: 'straddle',
        name: 'Straddle Planche',
        what: 'רגליים ישרות ופתוחות.',
        criteria: '3 סטים של 8 שניות',
        target: { metric: 'time', value: 8, sets: 3 },
      },
      {
        id: 'full',
        name: 'Full Planche',
        what: 'המטרה הרחוקה ביותר בתוכנית.',
        criteria: '5 שניות, רגליים צמודות וישרות',
        target: { metric: 'time', value: 5, sets: 1 },
      },
    ],
  },
  {
    id: 'sk-oapullup',
    name: 'מתח ביד אחת',
    emoji: '☝️',
    goal: 'מתח ביד אחת, חזרה אחת נקייה',
    why: 'מבחן הכוח היחסי הקשה ביותר שיש. מי שמגיע לזה נמצא בקבוצה קטנה מאוד.',
    match: ['מתח ביד אחת', 'one arm pull', 'archer pull', 'משיכות קשת'],
    needs: 'מתח עם תוספת של כמחצית ממשקל הגוף — הרבה מעבר ליעד של 20 ק״ג',
    stages: [
      {
        id: 'archer',
        name: 'משיכות קשת',
        what: 'אחיזה רחבה, מושכים לכיוון יד אחת והשנייה נשארת ישרה.',
        criteria: '3 סטים של 5 לכל צד',
        target: { metric: 'bodyweight', value: 5, sets: 3 },
        search: 'archer pull up tutorial',
      },
      {
        id: 'assisted',
        name: 'יד שנייה על מגבת',
        what: 'יד אחת על המוט, השנייה אוחזת במגבת שתלויה ממנו — ומחליקים את היד למטה לאורך המגבת כדי להקטין את העזרה.',
        criteria: '3 סטים של 5 לכל צד',
        target: { metric: 'bodyweight', value: 5, sets: 3 },
      },
      {
        id: 'negative',
        name: 'ירידה ביד אחת',
        what: 'מתחילים למעלה ויורדים ב-5-8 שניות ביד אחת.',
        criteria: '3 סטים של 3 לכל צד',
        target: { metric: 'bodyweight', value: 3, sets: 3 },
        tip: 'המרפק והכתף סופגים כאן עומס שאין לו אח ורע. סט אחד בשבוע יותר מספיק בהתחלה.',
        search: 'one arm pull up negatives elbow health',
      },
      {
        id: 'full-1',
        name: 'החזרה הראשונה',
        what: 'המטרה.',
        criteria: 'חזרה אחת מלאה ביד אחת',
        target: { metric: 'bodyweight', value: 1, sets: 1 },
      },
    ],
  },
]

export function ladder(id: string): SkillLadder | undefined {
  return SKILL_LADDERS.find((x) => x.id === id)
}

// ---------------------------------------------------------------------------
// כמה זמן לוקח שלב — ידע אימון, לא נתון אישי.
//
// המספרים הם שבועות טיפוסיים למי שכבר מתאמן, בשתי נגיעות בשבוע במיומנות.
// הם לא נבואה: תפקידם לעגן את ההערכה האישית. הערכה שמחושבת רק מהשיפוע של
// החודש האחרון קופצת בין "עוד שבועיים" ל"עוד שנה" אחרי סשן אחד חלש, ולכן
// ההערכה מתכנסת אליהם (`src/forecast.ts`) ולא יכולה להתרחק מהם בלי גבול.
//
// הטבלה יושבת בנפרד מהסולמות כדי שהסולמות יישארו קריאים וכדי שכיול של
// המספרים יהיה שינוי במקום אחד.
// ---------------------------------------------------------------------------
export const STAGE_WEEKS: Record<string, Record<string, number>> = {
  'sk-handstand': { base: 2, 'wall-walk': 3, 'chest-wall': 6, 'shoulder-taps': 6, 'kick-up': 4, 'free-10': 10, 'free-30': 12 },
  'sk-frontlever': { hang: 4, tuck: 6, 'adv-tuck': 8, 'one-leg': 10, straddle: 12, full: 14 },
  'sk-lsit': { pseudo: 3, 'foot-support': 3, tuck: 4, 'one-leg': 5, 'full-15': 6, 'full-30': 6 },
  'sk-pullup': { 'bw-8': 3, 'bw-12': 6, w5: 6, w10: 8, w15: 10, w20: 12 },
  'sk-dip': { 'bw-10': 3, 'bw-15': 5, w5: 5, w10: 8, w15: 10, w20: 12 },
}

/** ברירת המחדל לשלב שאין לו מספר בטבלה — מכוון להיות שמרני */
export const DEFAULT_STAGE_WEEKS = 8

/** כמה שבועות לוקח שלב לאדם טיפוסי */
export function stageWeeks(ladderId: string, stageId: string): number {
  return STAGE_WEEKS[ladderId]?.[stageId] ?? DEFAULT_STAGE_WEEKS
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

// -- קצב ---------------------------------------------------------------------
// הקצב נכתב בתוכנית כטקסט ("6:40-7:10"), כי ככה מדברים עליו. הפענוח כאן הוא
// מה שמאפשר להשוות אותו למה שבאמת רצת.

/** קצב יחיד לדקות עשרוניות לק״מ. "6:40" → 6.667. null אם זה לא קצב. */
export function parsePace(text: string): number | null {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 60
}

/** טווח הקצב מתוך טקסט: "6:40-7:10" → [6.667, 7.167]. קצב יחיד → טווח באורך אפס. */
export function parsePaceRange(text?: string): [number, number] | null {
  if (!text) return null
  const parts = text.split(/[-–—]/)
  if (parts.length === 1) {
    const one = parsePace(parts[0])
    return one === null ? null : [one, one]
  }
  if (parts.length !== 2) return null
  const lo = parsePace(parts[0])
  const hi = parsePace(parts[1])
  if (lo === null || hi === null) return null
  return lo <= hi ? [lo, hi] : [hi, lo]
}

/** דקות עשרוניות לק״מ כטקסט קצב: 6.667 → "6:40" */
export function paceText(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return ''
  let min = Math.floor(minPerKm)
  let sec = Math.round((minPerKm - min) * 60)
  if (sec === 60) {
    min += 1
    sec = 0
  }
  return `${min}:${String(sec).padStart(2, '0')}`
}

/**
 * איפה הקצב שרצת ביחס לטווח. 'fast' הוא מהר מדי ולא הישג: ריצה קלה שנרצת
 * מהר היא בדיוק מה שגונב את הרגליים מהריצה הארוכה.
 */
export function gradePace(actual: number, range: [number, number]): 'fast' | 'in' | 'slow' {
  // שוליים של 5 שניות לק״מ — GPS ורמזורים לא מודדים לשנייה
  const tol = 5 / 60
  if (actual < range[0] - tol) return 'fast'
  if (actual > range[1] + tol) return 'slow'
  return 'in'
}

/** התאמת שם תרגיל למילות הזיהוי של סולם */
export function matchesSkill(lad: SkillLadder, exName: string): boolean {
  const n = exName.toLowerCase()
  if (lad.exclude?.some((m) => n.includes(m.toLowerCase()))) return false
  return lad.match.some((m) => n.includes(m.toLowerCase()))
}

/** המקום של מטרה ברשימה. מטרה שלא ברשימה נדחפת לסוף ולא נעלמת. */
export function goalRank(id: string): number {
  const i = GOAL_ORDER.indexOf(id)
  return i === -1 ? GOAL_ORDER.length : i
}

/** כל הסולמות, בסדר המטרות */
export function laddersInOrder(): SkillLadder[] {
  return [...SKILL_LADDERS].sort((a, b) => goalRank(a.id) - goalRank(b.id))
}

/** המטרות שבמוקד עכשיו — הראשונות ברשימה, הריצה כלולה */
export function focusGoalIds(): string[] {
  return GOAL_ORDER.slice(0, FOCUS_COUNT)
}

/** האם המטרה הזו במוקד עכשיו */
export function isFocusGoal(id: string): boolean {
  return goalRank(id) < FOCUS_COUNT
}

/** הסולמות שבמוקד — בלי הריצה, שאינה סולם מיומנות */
export function focusLadders(): SkillLadder[] {
  return laddersInOrder().filter((x) => isFocusGoal(x.id))
}
