// ---------------------------------------------------------------------------
// מודל הנתונים של המערכת.
// כל רשומה נושאת updatedAt כדי לאפשר מיזוג בטוח בין המחשב לטלפון.
// מחיקה היא רכה (deleted: true) — גם כדי לא לאבד מידע וגם כדי שמופע
// חוזר שנמחק לא ייווצר מחדש.
// ---------------------------------------------------------------------------

export type ID = string
export type ISODate = string // YYYY-MM-DD
export type HHMM = string // HH:MM

export interface Rec {
  id: ID
  updatedAt: number
  deleted?: boolean
}

/** מסלול = פרויקט־על. גם תגית לאסימוני Deep Work וגם לוח קנבן. */
export interface Track extends Rec {
  name: string
  emoji: string
  color: string
  order: number
  board: boolean
  goal?: string
}

export type TaskStatus = 'todo' | 'doing' | 'waiting' | 'done'
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'waiting', 'done']
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'לביצוע',
  doing: 'בתהליך',
  waiting: 'ממתין',
  done: 'הושלם',
}

export interface SubTask {
  id: ID
  text: string
  done: boolean
}

export interface Task extends Rec {
  title: string
  notes?: string
  trackId: ID
  status: TaskStatus
  due?: ISODate
  /** הערכת אסימונים (בלוקים של 90 דק׳) */
  est?: number
  order: number
  sub?: SubTask[]
  /** על הנתיב הקריטי */
  critical?: boolean
  doneAt?: number
  /** מתי נוצרה — לניתוח השבועי (כמה נכנס מול כמה נסגר) */
  createdAt?: number
}

export type EventKind =
  | 'deadline'
  | 'exam'
  | 'birthday'
  | 'holiday'
  | 'personal'
  | 'block'
  | 'milestone'

export const KIND_LABEL: Record<EventKind, string> = {
  deadline: 'דדליין',
  exam: 'מבחן',
  birthday: 'יום הולדת',
  holiday: 'חג',
  personal: 'אישי',
  block: 'בלוק',
  milestone: 'אבן דרך',
}

export interface CalEvent extends Rec {
  title: string
  date: ISODate
  /** לאירוע רב־יומי (כולל) */
  endDate?: ISODate
  start?: HHMM
  end?: HHMM
  allDay: boolean
  kind: EventKind
  trackId?: ID
  /** יום הולדת חוזר שנתית */
  yearly?: boolean
  /** ערב חג: לא חג מלא — חצי יום עבודה, והבלוקים הקבועים נשארים */
  eve?: boolean
  /** ציפייה מותאמת ליום הזה (אסימונים) — למשל טיסה. גובר על כל הכללים. */
  capacity?: number
  notes?: string
  /** נוצר ממופע חוזר — מאפשר עריכה/מחיקה של מופע בודד */
  ruleId?: ID
  /** האם המשתמש ערך את המופע הזה ידנית (אז לא נוגעים בו) */
  touched?: boolean
  /** האם הבלוק הזה מיועד ל-Deep Work */
  deep?: boolean
  /** תזכורות מראש, בימים לפני האירוע — למשל [14, 3] */
  remind?: number[]
}

/** כלל חזרה — האפליקציה מייצרת ממנו אירועים אמיתיים לאופק של 120 יום */
export interface RecurRule extends Rec {
  title: string
  kind: EventKind
  trackId?: ID
  start: HHMM
  end: HHMM
  /** ימים בשבוע (0 = ראשון) — לחזרה שבועית */
  days: number[]
  /** שבועי (ברירת מחדל) או חודשי */
  freq?: 'weekly' | 'monthly'
  /** לחזרה חודשית: היום בחודש. בחודש קצר יותר — היום האחרון שלו. */
  monthDay?: number
  from: ISODate
  until?: ISODate
  active: boolean
  deep?: boolean
  notes?: string
}

export interface Session extends Rec {
  startedAt: number
  endedAt: number
  minutes: number
  trackId: ID
  label?: string
  manual?: boolean
}

export type WakeStatus = 'ontime' | 'late' | null

export interface DayLog extends Rec {
  date: ISODate
  /** איך ישנת בלילה שלפני היום הזה — נשאל בבוקר שאחרי */
  sleep?: 'good' | 'bad'
  wake: WakeStatus
  wakeTime?: HHMM
  habits: Record<string, boolean>
  /** צעדים בתוך שגרות: stepId -> בוצע */
  steps: Record<string, boolean>
  /** חותמת לכל הרגל ולכל צעד בנפרד — כדי ששני מכשירים לא ידרסו זה את זה */
  habitsAt?: Record<string, number>
  stepsAt?: Record<string, number>
  workout?: 'run' | 'strength' | 'other'
  /** נבחר Power Nap אחרי קימה מאוחרת */
  nap?: boolean
}

export interface WeekLog extends Rec {
  /** יום ראשון של השבוע */
  weekStart: ISODate
  items: Record<string, boolean>
  /** פריטי progress: id -> דקות */
  progress: Record<string, number>
  /** חותמת לכל פריט בנפרד — למיזוג בטוח בין מכשירים */
  itemsAt?: Record<string, number>
  progressAt?: Record<string, number>
  review?: Review
  /** דחיית הסקירה עד לחותמת זמן */
  snoozeUntil?: number
  /**
   * מטרות־העל של השבוע הזה. נקבעות בשלב "להגדיר את השבוע" של הסקירה
   * שסוגרת את השבוע הקודם, ומוצגות במסך היום לאורך כל השבוע.
   */
  goals?: WeekGoal[]
  /** חותמת לכל מטרה בנפרד — למיזוג בין מכשירים */
  goalsAt?: Record<string, number>
  /** מתי הושלם שלב תכנון השבוע הזה */
  plannedAt?: number
}

/** מטרת־על שבועית — לא משימה. שלוש כאלה זה הרבה. */
export interface WeekGoal {
  id: ID
  text: string
  trackId?: ID
  done?: boolean
}

/**
 * מה שהוא חשב על מהדורת חדשות אחת. נשמר במכשיר ומסונכרן, ומיוצא
 * למחסן כדי שעורך הבוקר יוכל ללמוד מזה לאורך זמן.
 */
export interface NewsRating extends Rec {
  /** תאריך המהדורה */
  date: ISODate
  /** מפתח הסיפור -> אהבתי/לא אהבתי, עם הכותרת כדי שהמשוב יהיה מובן */
  votes: Record<string, { v: 1 | -1; headline: string; section: string }>
  /** הערה חופשית על המהדורה */
  note?: string
}

export interface Review {
  submittedAt: number
  answers: Record<string, string>
  score: number
  snapshot: {
    tokens: number
    minutes: number
    byTrack: Record<string, number>
    habitPct: number
    daysLogged: number
    tasksDone: number
  }
}

export interface HabitStep {
  id: ID
  text: string
}

export interface HabitDef extends Rec {
  name: string
  emoji: string
  minutes?: number
  order: number
  /** אימון מקבל טיפול מיוחד (ריצה / כוח) */
  special?: 'workout'
  /** צ׳קליסט פנימי */
  steps?: HabitStep[]
}

// ---------------------------------------------------------------------------
// אימונים — התוכנית השבועית, ומה שבאמת בוצע
// ---------------------------------------------------------------------------
export type WorkoutKind = 'gym' | 'run' | 'walk' | 'home' | 'rest'

export const WORKOUT_KIND_LABEL: Record<WorkoutKind, string> = {
  gym: 'חדר כושר',
  run: 'ריצה',
  walk: 'הליכה',
  home: 'בית',
  rest: 'מנוחה',
}

/**
 * איך מודדים את התרגיל:
 * weight — משקל חיצוני · bodyweight — משקל גוף, והק״ג הוא תוספת
 * time — שניות החזקה · reps — חזרות בלבד
 */
export type ExMetric = 'weight' | 'bodyweight' | 'time' | 'reps'

export interface Exercise {
  id: ID
  name: string
  /** מספר הסטים המתוכנן */
  sets?: number
  /** טווח החזרות כפי שנכתב בתוכנית — "8-10", "מקסימום" */
  reps?: string
  metric: ExMetric
  note?: string
  /** הפסקה מומלצת בין סטים, בשניות */
  rest?: number
  /** דגשי ביצוע — מה לשים לב אליו בזמן התרגיל */
  cues?: string
  /**
   * קישור לטוטוריאל. ריק זה לא "בלי קישור" — `exerciseTutorial` נופל
   * לחיפוש יוטיוב לפי שם התרגיל, כך שלכל תרגיל יש "איך עושים את זה".
   */
  video?: string
  /**
   * תרגיל מהבלוק הביתי — נעשה בדירה לפני האימון ולא בחדר הכושר, ולכן
   * הוא לא נספר בהערכת אורך האימון. שם יושבים גם מה שדורש תדירות יומית
   * (עמידת ידיים) וגם מה שנראה חריג בחדר כושר.
   */
  home?: boolean
  /**
   * מתי המעבר הלילי שינה את התרגיל הזה שינוי מבני (שם, שלב). זה מה
   * שמונע טלטלה: שינוי מבני אחד לתרגיל בשלושה שבועות, כדי שאפשר יהיה
   * לדעת מה עבד.
   */
  changedAt?: number
}

/**
 * היעד של אימון אירובי — מה לכוון אליו בריצה הזו.
 * בריצה אין סטים וחזרות, ולכן בלי היעד אין לאימון מספר לרוץ אליו.
 */
export interface RunTarget {
  /** מרחק היעד בק״מ */
  km?: number
  /** משך היעד בדקות — כשהריצה נמדדת בזמן ולא במרחק */
  minutes?: number
  /** טווח הקצב המבוקש, דקות לק״מ: "6:40-7:10" או קצב יחיד "5:50" */
  pace?: string
  /** מה עושים בריצה הזו במשפט — האצות בסוף, טמפו, שחרור */
  how?: string
}

/** יום בתוכנית השבועית (0 = ראשון) */
export interface WorkoutDay extends Rec {
  dow: number
  title: string
  kind: WorkoutKind
  focus?: string
  /** רלוונטי לימי run/walk בלבד */
  target?: RunTarget
  exercises: Exercise[]
}

/** סט בודד שבוצע */
export interface SetLog {
  /** משקל בק״ג. ב־bodyweight זו התוספת, ו-0 הוא משקל גוף. */
  kg?: number
  reps?: number
  sec?: number
}

/** אימון שבוצע ביום מסוים */
export interface WorkoutLog extends Rec {
  date: ISODate
  /** היום בתוכנית שממנו נגזר האימון */
  dayId?: ID
  title: string
  kind: WorkoutKind
  /** מזהה תרגיל -> הסטים שבוצעו */
  sets: Record<string, SetLog[]>
  /**
   * חותמת זמן לכל תרגיל בנפרד. בלעדיה שני מכשירים שרשמו באותו אימון
   * דורסים זה את זה — מי שכתב אחרון מוחק את כל מה שהשני רשם.
   */
  setsAt?: Record<string, number>
  km?: number
  minutes?: number
  note?: string
  finishedAt?: number
  /** ריצה שנמדדה ב-GPS: המסלול, הספליטים והזמנים */
  run?: TrackedRun
}

/**
 * ריצה שנמדדה. המסלול נשמר מקודד ומפושט (~12 מטר) — ריצה של שעה יורדת
 * מכמה מאות קילובייטים לכמה קילובייטים, וזה מה שמאפשר לשמור אותו בתוך
 * המצב המסונכרן בלי לנפח אותו.
 */
export interface TrackedRun {
  /** מרחק בק״מ */
  km: number
  /** זמן נטו בדקות — מה שנרשם כאימון */
  minutes: number
  movingSec: number
  elapsedSec: number
  splits: Array<{ km: number; sec: number; gainM?: number }>
  /** המסלול, מקודד באלגוריתם הפוליליין */
  poly: string
  /** המסלול המתוכנן שנבחר, אם נבחר */
  routeId?: string
  /** כמה פעמים המסך יצא מקדמת הבמה — שם המסלול חסר */
  gaps: number
  startedAt: number
  /** מה שהוערך בקו ישר כשלא הייתה קליטה — מרחק ושניות */
  est?: { meters: number; sec: number }
  /** כמה קריאות נדחו ולמה — כדי שאפשר יהיה לדעת כמה הריצה הזו אמינה */
  rejected?: { weak: number; jump: number; tiny: number; back: number }
}

/**
 * ההתקדמות במיומנות אחת. סולם השלבים עצמו הוא ידע אימון גנרי ויושב בקוד
 * (`src/skills.ts`); כאן נשמר רק מה שאישי — באיזה שלב אתה, ואיזה תרגילים
 * בתוכנית מודדים אותו.
 */
export interface SkillProgress extends Rec {
  /** מזהה הסולם מתוך הקטלוג */
  stageId?: string
  /** תרגילים בתוכנית שמודדים את השלב הנוכחי */
  exIds?: ID[]
  /** שלבים שסומנו כהושלמו ידנית */
  done?: string[]
  note?: string
  startedAt?: ISODate
}

export interface WeeklyDef extends Rec {
  /** פריטים עם אותו group מוצגים בשורה אחת במסך היום */
  group?: string
  name: string
  emoji: string
  order: number
  kind: 'check' | 'progress'
  /** ל-progress: יעד דקות שבועי */
  targetMinutes?: number
  /** תזכורת מחזורית (מצעים כל 14 יום) */
  everyDays?: number
  anchorDate?: ISODate
  /** יום בשבוע להתראה (0 = ראשון) */
  alertDow?: number
  hint?: string
  /** אם מוגדר — הזמן שנרשם כאן נספר גם כאסימוני Deep Work במסלול הזה */
  trackId?: ID
}

export interface Phase extends Rec {
  id: ID
  name: string
  from: ISODate
  to: ISODate
  color: string
  focus: string
  /** משפט אחד שלו על התקופה. ריק = הגיליון מציג רק את התאריכים האמיתיים שבחלון. */
  rule?: string
}

export interface Settings {
  wakeTime: HHMM
  bedTime: HHMM
  tokenMinutes: number
  dailyTokenGoal: number
  weeklyTokenGoal: number
  theme: 'system' | 'light' | 'dark'
  sound: boolean
  notifications: boolean
  /** יום הסקירה השבועית (0 = ראשון) */
  reviewDow: number
  reviewLock: boolean
  autoSync: boolean
  name: string
  /** שעת התחלה בתצוגת היומן */
  dayStartHour: number
  dayEndHour: number
  /** קיבולת מופחתת בשישי־שבת */
  easyWeekend: boolean
  /** קיבולת אפס בחג מלא, חצי בערב חג */
  easyHoliday: boolean
  /**
   * הימים שבהם יש גישה לחדר כושר (0 = ראשון). ברירת המחדל היא ראשון עד
   * חמישי — בשישי ובשבת אין. מכאן נגזר השבוע: יום בלי חדר כושר מקבל את
   * הגרסה הביתית שלו ולא נמחק.
   */
  gymDays?: number[]
  /**
   * תאריכים בודדים שבהם אין חדר כושר, למרות שהיום בשבוע פתוח — שבוע שבו
   * הוא סגור, נסיעה, מבחן. ביום כזה האפליקציה מציגה את התאום הביתי של
   * אותו אימון (`workoutDayOn`), בלי לשנות את התוכנית השבועית.
   */
  gymOff?: ISODate[]
  /**
   * כמה ריצות בשבוע. **תקרה, לא יעד** — השבוע נבנה סביב המספר הזה, ומה
   * שנשאר הולך לכוח. נקבע 22.9.2026 על שלוש.
   */
  runsPerWeek?: number
  /** תקרת הזמן לאימון, בדקות */
  capMinutes?: number
  /**
   * האם התקרה חלה גם על ריצות. ברירת המחדל היא **לא**: ריצה מוגבלת בזמן
   * שיש, לא בתקרה — ושלוש ריצות בלי תקרה נושאות יותר נפח מחמש חסומות.
   */
  capRuns?: boolean
  /** קיבולת מצומצמת ביום מבחן */
  easyExamDay: boolean
  /** האם כרטיס ההסבר הראשוני נסגר */
  onboarded?: boolean
  /**
   * מפתח הצפנה לצינור הניתוח השבועי. יושב כאן (ולכן מסונכרן ומוצפן יחד עם
   * שאר המצב) ובפרומפט הפרטי של הסוכן — כך שהנתונים שעוברים ביניהם לא
   * מונחים גלויים בשום מקום.
   */
  aiKey?: string
  /**
   * מפתח API של Claude למסלול המהיר של אטלס (ישירות מהדפדפן). יושב
   * בהגדרות המסונכרנות — מוצפן במחסן, לעולם לא בקוד.
   */
  apiKey?: string
  /**
   * מזהה ה-workspace ב-Claude (wrkspc_…). נדרש **רק** כשמפתח ה-API נוצר ברמת
   * הארגון ולא שויך ל-workspace — במקרה כזה ה-API דוחה כל בקשה בלי הכותרת
   * anthropic-workspace-id. מפתח שמשויך ל-workspace לא צריך את זה.
   */
  workspaceId?: string
}

export interface Timer {
  running: boolean
  /** מתי החל הקטע הנוכחי */
  startedAt: number
  /** דקות שנצברו לפני ההפסקה הנוכחית */
  accumulated: number
  trackId: ID
  label: string
  targetMinutes: number
  /** דופק — מתעדכן כל 20 שניות כשהלשונית פתוחה, כדי שטיימר שנשכח לא יצבור זמן דמיוני */
  lastSeen: number
  /** האם כבר הודענו שהיעד הושלם (כדי לא לצלצל שוב בכל חזרה למסך) */
  notified?: boolean
  /** הושהה אוטומטית אחרי 4 שעות רצופות בלשונית פתוחה — טיימר שנשכח דולק */
  autoPaused?: 'long'
}

export interface AppState {
  version: number
  settings: Settings
  tracks: Track[]
  tasks: Task[]
  events: CalEvent[]
  rules: RecurRule[]
  sessions: Session[]
  days: DayLog[]
  weeks: WeekLog[]
  habits: HabitDef[]
  weekly: WeeklyDef[]
  phases: Phase[]
  /** משוב על מהדורות החדשות */
  news: NewsRating[]
  /** התוכנית השבועית של האימונים */
  workoutPlan: WorkoutDay[]
  /** מה שבאמת בוצע */
  workouts: WorkoutLog[]
  /** באיזה שלב אתה בכל מיומנות — הסולמות עצמם בקוד */
  skills: SkillProgress[]
  timer: Timer | null
  /** מתי הטיימר השתנה לאחרונה — כדי ששתי לשוניות יסכימו מי מהן מחזיקה את הגרסה הטרייה */
  timerStamp?: number
  deviceId: string
  lastSyncAt: number
  /** מתי ההגדרות נערכו לאחרונה — לצורך מיזוג בין מכשירים */
  settingsUpdatedAt: number
  /** מתי בוצע איפוס מלא — מונע מתמונת מצב ישנה להחזיר את הנתונים */
  resetAt: number
  /** עד איזה תאריך כבר יוצרו מופעים חוזרים */
  materializedTo: ISODate
  /** מיגרציות חד־פעמיות שכבר רצו על המצב הזה */
  migrations?: string[]
  /** פקודות של אטלס שכבר בוצעו (מזהה -> מתי) — כדי שכל מכשיר יבצע פעם אחת */
  atlasApplied?: Record<string, number>
}
