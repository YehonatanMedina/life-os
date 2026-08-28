// ---------------------------------------------------------------------------
// תוכן הפתיחה — מה שרואים בהתקנה חדשה, לפני שמחברים סנכרון.
//
// בכוונה גנרי: התוכן האמיתי (מסלולים, תאריכים, שלבים, הרגלים) הוא של המשתמש
// ונשמר במכשיר ובמחסן הפרטי שלו, לא בקוד של האתר.
// הזרע נטען פעם אחת בלבד — בהתקנה חדשה. אחר כך הוא לא נוגע בשום דבר.
// ---------------------------------------------------------------------------
import type {
  AppState, CalEvent, HabitDef, Phase, RecurRule, Settings, Task, Track, WeeklyDef,
} from './types'

export const SCHEMA_VERSION = 1

/** חותמת בסיס לרשומות הזרע — קדומה, כדי שכל עריכה של המשתמש תנצח במיזוג */
const T0 = Date.parse('2026-01-01T00:00:00')

function rec<T extends { id: string }>(o: T): T & { updatedAt: number } {
  return { updatedAt: T0, ...o }
}

// ---------------------------------------------------------------------------
// מסלולים
// ---------------------------------------------------------------------------
export const TRACKS: Track[] = [
  rec({ id: 'trk-study', name: 'לימודים', emoji: '📘', color: '#e5484d', order: 0, board: true }),
  rec({ id: 'trk-research', name: 'מחקר', emoji: '🔭', color: '#0090ff', order: 1, board: true }),
  rec({ id: 'trk-project', name: 'פרויקט', emoji: '🚀', color: '#30a46c', order: 2, board: true }),
  rec({ id: 'trk-life', name: 'חיים', emoji: '🌿', color: '#8b8d98', order: 3, board: true }),
]

// ---------------------------------------------------------------------------
// שלבים — חלונות זמן. ריק בהתחלה; מוסיפים כשיש תקופה אמיתית לתחום.
// ---------------------------------------------------------------------------
export const PHASES: Phase[] = []

// ---------------------------------------------------------------------------
// אירועים — ריק. מוסיפים ב"הגדרות ← תאריכים קבועים" או ביומן.
// ---------------------------------------------------------------------------
export const EVENTS: CalEvent[] = []

// ---------------------------------------------------------------------------
// מבנה השבוע הקבוע
// ---------------------------------------------------------------------------
export const RULES: RecurRule[] = [
  rec({
    id: 'rl-work-am', title: 'עבודה עמוקה — בוקר', kind: 'block' as const,
    start: '08:30', end: '12:30', days: [0, 1, 2, 3, 4],
    from: '2026-01-01', active: true, deep: true,
    notes: 'שעות קבועות ללימודים, פרויקטים ומחקר. לא קובעים עליהן דברים אחרים אלא אם חייבים.',
  }),
  rec({
    id: 'rl-work-pm', title: 'עבודה עמוקה — אחה״צ', kind: 'block' as const,
    start: '13:30', end: '17:30', days: [0, 1, 2, 3, 4],
    from: '2026-01-01', active: true, deep: true,
    notes: 'שעות קבועות ללימודים, פרויקטים ומחקר. לא קובעים עליהן דברים אחרים אלא אם חייבים.',
  }),
  rec({
    id: 'rl-morning', title: 'שגרת בוקר', kind: 'block' as const,
    start: '07:30', end: '07:50', days: [0, 1, 2, 3, 4, 5, 6],
    from: '2026-01-01', active: true,
  }),
  rec({
    id: 'rl-workout', title: 'אימון', kind: 'block' as const, trackId: 'trk-life',
    start: '18:00', end: '18:40', days: [0, 1, 2, 3, 4, 5, 6],
    from: '2026-01-01', active: true,
  }),
  rec({
    id: 'rl-night', title: 'שגרת ערב', kind: 'block' as const,
    start: '23:10', end: '23:30', days: [0, 1, 2, 3, 4, 5, 6],
    from: '2026-01-01', active: true,
  }),
]

// ---------------------------------------------------------------------------
// משימות
// ---------------------------------------------------------------------------
// ריק בכוונה. המשימות הן שלך — האפליקציה לא מפרקת לך את העבודה לחלקים.
// אפשר להוסיף ממסך "היום", מהיומן, או מלוח הקנבן.
// ---------------------------------------------------------------------------
export const TASKS: Task[] = []

// ---------------------------------------------------------------------------
// הרגלים יומיים
// ---------------------------------------------------------------------------
export const HABITS: HabitDef[] = [
  rec({
    id: 'hb-morning', name: 'שגרת בוקר', emoji: '☀️', minutes: 20, order: 0,
    steps: [
      { id: 'hm1', text: 'לסדר מיטה' },
      { id: 'hm2', text: 'להתלבש' },
      { id: 'hm3', text: 'לצחצח שיניים' },
      { id: 'hm4', text: 'ארוחת בוקר' },
    ],
  }),
  rec({ id: 'hb-workout', name: 'אימון', emoji: '🏃', minutes: 40, order: 1, special: 'workout' as const }),
  rec({
    id: 'hb-night', name: 'שגרת ערב', emoji: '🌙', minutes: 20, order: 2,
    steps: [
      { id: 'hn1', text: 'לסדר איזור' },
      { id: 'hn2', text: 'לארגן את מחר — מטרות ויומן' },
      { id: 'hn3', text: 'לצחצח שיניים' },
      { id: 'hn4', text: 'לקרוא' },
    ],
  }),
]

// ---------------------------------------------------------------------------
// אסימונים שבועיים צפים — אין להם שעה, רק צריך שיקרו במהלך השבוע
// ---------------------------------------------------------------------------
export const WEEKLY: WeeklyDef[] = [
  rec({ id: 'wk-family', name: 'ערב עם המשפחה', emoji: '🕯️', order: 0, kind: 'check' as const }),
  rec({ id: 'wk-friends', name: 'פגישה עם חברים', emoji: '🫂', order: 1, kind: 'check' as const,
    hint: 'לא צריך לקבוע מראש — רק לסמן כשקרה.' }),
  rec({ id: 'wk-call', name: 'טלפון למישהו שלא דיברתי איתו מזמן', emoji: '📞', order: 2, kind: 'check' as const }),
  rec({ id: 'wk-laundry', name: 'כביסה', emoji: '🧺', order: 3, kind: 'check' as const, alertDow: 0,
    hint: 'תזכורת קבועה ביום ראשון.' }),
  rec({ id: 'wk-sheets', name: 'החלפת מצעים', emoji: '🛏️', order: 4, kind: 'check' as const, everyDays: 14 }),
]

// ---------------------------------------------------------------------------
// שאלון הסקירה השבועית
// ---------------------------------------------------------------------------
export const REVIEW_QUESTIONS: Array<{ id: string; q: string; hint?: string }> = [
  { id: 'q1', q: 'כמה משימות דחיתי השבוע, ולאיזה תאריך?', hint: 'אם התשובה מעל חמש — התוכנית לא ריאלית, לא אתה. מה יורד ממנה?' },
  { id: 'q2', q: 'כמה מהאסימונים שלי נחתו על הנתיב הקריטי?', hint: 'תסתכל על "לאן הלך הזמן". שבוע מלא במסלול הלא נכון הוא שבוע אבוד.' },
  { id: 'q3', q: 'מה יצרתי השבוע שלא היה קיים לפניו?', hint: 'קובץ, טיוטה, הוכחה, מייל שנשלח. קריאה היא לא יצירה.' },
  { id: 'q4', q: 'מה החסם הבא בפועל, ומתי בדיוק אני מטפל בו?', hint: 'תאריך ושעה, לא "בקרוב".' },
  { id: 'q5', q: 'מה לקח יותר זמן ממה שהערכתי, ולמה?', hint: 'זה מה שמתקן את ההערכות של השבוע הבא.' },
  { id: 'q6', q: 'כמה ימים קמתי בשעת היעד, ואיך אני מרגיש פיזית?', hint: 'שינה, אוכל, כאבים. זה המדד שמתריע ראשון, לפני כל השאר.' },
  { id: 'q7', q: 'פיניתי זמן לאנשים שחשובים לי?', hint: 'מי לא ראה אותי כבר שבועיים?' },
  { id: 'q8', q: 'מה שלושת הדברים שחייבים להיסגר עד יום ראשון הבא?' },
  { id: 'q9', q: 'מה אני מוריד מהצלחת בשבוע הבא?', hint: 'להגיד לא זה חלק מהתוכנית, לא כישלון בה. תמחק משימה אחת עכשיו.' },
]

// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: Settings = {
  wakeTime: '07:30',
  bedTime: '23:30',
  tokenMinutes: 90,
  dailyTokenGoal: 6,
  weeklyTokenGoal: 42,
  theme: 'system',
  sound: true,
  notifications: false,
  reviewDow: 0,
  reviewLock: true,
  autoSync: true,
  name: '',
  dayStartHour: 6,
  dayEndHour: 24,
  // "אין ויתורים" — היעד המלא בכל יום. חריגים מדליקים בהגדרות, או קובעים
  // קיבולת מותאמת ליום ספציפי מתוך עריכת אירוע (למשל טיסה).
  easyWeekend: false,
  easyHoliday: false,
  easyExamDay: false,
}

export function newDeviceId(): string {
  return 'd' + Math.random().toString(36).slice(2, 10)
}

export function seedState(): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    tracks: TRACKS.map((t) => ({ ...t })),
    tasks: TASKS.map((t) => ({ ...t })),
    events: EVENTS.map((e) => ({ ...e })),
    rules: RULES.map((r) => ({ ...r })),
    sessions: [],
    days: [],
    weeks: [],
    habits: HABITS.map((h) => ({ ...h })),
    weekly: WEEKLY.map((w) => ({ ...w })),
    phases: PHASES.map((p) => ({ ...p })),
    timer: null,
    deviceId: newDeviceId(),
    lastSyncAt: 0,
    settingsUpdatedAt: 0,
    resetAt: 0,
    materializedTo: '2026-01-01',
  }
}
