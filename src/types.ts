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
  notes?: string
  /** נוצר ממופע חוזר — מאפשר עריכה/מחיקה של מופע בודד */
  ruleId?: ID
  /** האם המשתמש ערך את המופע הזה ידנית (אז לא נוגעים בו) */
  touched?: boolean
  /** האם הבלוק הזה מיועד ל-Deep Work */
  deep?: boolean
}

/** כלל חזרה — האפליקציה מייצרת ממנו אירועים אמיתיים לאופק של 120 יום */
export interface RecurRule extends Rec {
  title: string
  kind: EventKind
  trackId?: ID
  start: HHMM
  end: HHMM
  /** ימים בשבוע (0 = ראשון) */
  days: number[]
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
  review?: Review
  /** דחיית הסקירה עד לחותמת זמן */
  snoozeUntil?: number
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

export interface WeeklyDef extends Rec {
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
  /** קיבולת מצומצמת ביום מבחן */
  easyExamDay: boolean
  /** האם כרטיס ההסבר הראשוני נסגר */
  onboarded?: boolean
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
  timer: Timer | null
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
}
