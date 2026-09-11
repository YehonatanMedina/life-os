// ---------------------------------------------------------------------------
// עזרי הביקורת העיצובית.
// - זמן קבוע (יום רביעי 09.09.2026 10:40) כדי שכל צילום וכל מדידה יהיו דטרמיניסטיים.
// - שלושה פרופילים: עשיר (יום אמיתי), ריק (התקנה חדשה בלי כלום), ארוך (טקסטים קיצוניים).
// - ניווט, צילום, ומדידות getComputedStyle שרצות בתוך הדפדפן.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, type TestInfo } from '@playwright/test'
import { STORE_KEY } from '../fixtures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type Theme = 'light' | 'dark'
export const THEMES: Theme[] = ['light', 'dark']

/** יום רביעי, 10:40 בבוקר, שעון ישראל (קיץ, +03:00) */
export const FIXED_MS = Date.parse('2026-09-09T10:40:00+03:00')
export const TODAY = '2026-09-09'
export const REPORT_DIR = path.resolve(__dirname, '../../reports/design')

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}
const at = (iso: string, hhmm: string) => Date.parse(`${iso}T${hhmm}:00+03:00`)

const T0 = Date.parse('2026-01-01T00:00:00')
const rec = <T extends { id: string }>(o: T) => ({ updatedAt: T0, ...o })

// ---------------------------------------------------------------------------
// פרופילים
// ---------------------------------------------------------------------------
export const TRACKS = [
  rec({ id: 'trk-study', name: 'לימודים', emoji: '📘', color: '#e5484d', order: 0, board: true }),
  rec({ id: 'trk-research', name: 'מחקר', emoji: '🔭', color: '#0090ff', order: 1, board: true }),
  rec({ id: 'trk-project', name: 'פרויקט', emoji: '🚀', color: '#30a46c', order: 2, board: true }),
  rec({ id: 'trk-life', name: 'חיים', emoji: '🌿', color: '#8b8d98', order: 3, board: true }),
]

const RULES = [
  rec({ id: 'rl-work-am', title: 'עבודה עמוקה — בוקר', kind: 'block', start: '08:30', end: '12:30', days: [0, 1, 2, 3, 4], from: '2026-01-01', active: true, deep: true }),
  rec({ id: 'rl-work-pm', title: 'עבודה עמוקה — אחה״צ', kind: 'block', start: '13:30', end: '17:30', days: [0, 1, 2, 3, 4], from: '2026-01-01', active: true, deep: true }),
  rec({ id: 'rl-morning', title: 'שגרת בוקר', kind: 'block', start: '07:30', end: '07:50', days: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', active: true }),
  rec({ id: 'rl-workout', title: 'אימון', kind: 'block', trackId: 'trk-life', start: '18:00', end: '18:40', days: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', active: true }),
  rec({ id: 'rl-night', title: 'שגרת ערב', kind: 'block', start: '23:10', end: '23:30', days: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', active: true }),
]

const HABITS = [
  rec({ id: 'hb-morning', name: 'שגרת בוקר', emoji: '☀️', minutes: 20, order: 0, steps: [
    { id: 'hm1', text: 'לסדר מיטה' }, { id: 'hm2', text: 'להתלבש' }, { id: 'hm3', text: 'לצחצח שיניים' }, { id: 'hm4', text: 'ארוחת בוקר' },
  ] }),
  rec({ id: 'hb-workout', name: 'אימון', emoji: '🏃', minutes: 40, order: 1, special: 'workout' }),
  rec({ id: 'hb-read', name: 'קריאה', emoji: '📚', minutes: 20, order: 2 }),
  rec({ id: 'hb-night', name: 'שגרת ערב', emoji: '🌙', minutes: 20, order: 3, steps: [
    { id: 'hn1', text: 'לסדר איזור' }, { id: 'hn2', text: 'לארגן את מחר — מטרות ויומן' }, { id: 'hn3', text: 'לצחצח שיניים' }, { id: 'hn4', text: 'לקרוא' },
  ] }),
]

const WEEKLY = [
  rec({ id: 'wk-family', name: 'ערב עם המשפחה', emoji: '🕯️', order: 0, kind: 'check' }),
  rec({ id: 'wk-friends', name: 'פגישה עם חברים', emoji: '🫂', order: 1, kind: 'check', hint: 'לא צריך לקבוע מראש — רק לסמן כשקרה.' }),
  rec({ id: 'wk-call', name: 'טלפון למישהו שלא דיברתי איתו מזמן', emoji: '📞', order: 2, kind: 'check' }),
  rec({ id: 'wk-laundry', name: 'כביסה', emoji: '🧺', order: 3, kind: 'check', alertDow: 3, hint: 'תזכורת קבועה ביום רביעי.' }),
  rec({ id: 'wk-guitar', name: 'גיטרה', emoji: '🎸', order: 4, kind: 'progress', targetMinutes: 120 }),
]

const SETTINGS = {
  wakeTime: '07:30', bedTime: '23:30', tokenMinutes: 90, dailyTokenGoal: 6, weeklyTokenGoal: 42,
  theme: 'light', sound: false, notifications: false, reviewDow: 0, reviewLock: false, autoSync: false,
  name: 'יהונתן', dayStartHour: 6, dayEndHour: 24, easyWeekend: false, easyHoliday: false, easyExamDay: false,
  onboarded: true,
}

function session(id: string, trackId: string, iso: string, endHHMM: string, minutes: number) {
  const endedAt = at(iso, endHHMM)
  return { id, updatedAt: endedAt, trackId, startedAt: endedAt - minutes * 60_000, endedAt, minutes }
}

/** יום אמיתי: טיימר רץ, משימות באיחור ולהיום, אירועים, יום הולדת, סקירה שמחכה, אימון מתוכנן */
export function richState(theme: Theme = 'light') {
  const d = (n: number) => addDays(TODAY, n)
  const lastWs = '2026-08-30'
  const ws = '2026-09-06'
  const prevWs = '2026-08-23'

  const sessions = [
    session('s-t1', 'trk-study', TODAY, '09:30', 55),
    session('s-t2', 'trk-research', TODAY, '10:20', 40),
    session('s-y1', 'trk-study', d(-1), '11:40', 170),
    session('s-y2', 'trk-project', d(-1), '16:30', 95),
    session('s-m1', 'trk-research', d(-2), '12:00', 200),
    session('s-m2', 'trk-study', d(-2), '17:10', 120),
    session('s-s1', 'trk-study', d(-3), '12:10', 150),
  ]
  // השבוע שעבר — כדי שהמעבר השבועי יחכה ושהסקירה תראה מספרים
  const lastDays = [0, 1, 2, 3, 4, 6]
  const lastMin = [240, 310, 180, 400, 90, 130]
  lastDays.forEach((k, i) => {
    sessions.push(session(`s-l${k}a`, ['trk-study', 'trk-research', 'trk-project'][i % 3], addDays(lastWs, k), '12:20', Math.round(lastMin[i] * 0.6)))
    sessions.push(session(`s-l${k}b`, ['trk-research', 'trk-study', 'trk-life'][i % 3], addDays(lastWs, k), '17:00', Math.round(lastMin[i] * 0.4)))
  })
  ;[0, 1, 2, 3, 4].forEach((k) => {
    sessions.push(session(`s-p${k}`, 'trk-study', addDays(prevWs, k), '13:00', 200 + k * 20))
  })

  const days: any[] = [
    rec({ id: `day-${TODAY}`, date: TODAY, wake: 'ontime', wakeTime: '07:25', habits: { 'hb-morning': true }, steps: { hm1: true, hm2: true, hm3: true, hm4: true } }),
    rec({ id: `day-${d(-1)}`, date: d(-1), wake: 'ontime', sleep: 'good', habits: { 'hb-morning': true, 'hb-workout': true, 'hb-read': true, 'hb-night': true }, steps: {}, workout: 'run' }),
    rec({ id: `day-${d(-2)}`, date: d(-2), wake: 'late', sleep: 'bad', habits: { 'hb-morning': true, 'hb-night': true }, steps: {} }),
  ]
  lastDays.forEach((k, i) => {
    days.push(rec({ id: `day-${addDays(lastWs, k)}`, date: addDays(lastWs, k), wake: i % 2 ? 'ontime' : 'late', sleep: i % 3 ? 'good' : 'bad', habits: { 'hb-morning': true, 'hb-workout': i % 2 === 0, 'hb-read': true, 'hb-night': i !== 4 }, steps: {} }))
  })

  const sub = (id: string, text: string, done = false) => ({ id, text, done })
  const tasks = [
    rec({ id: 't1', title: 'לסיים את תרגיל 3 באלגוריתמים', trackId: 'trk-study', status: 'todo', due: TODAY, est: 2, order: 0, critical: true, createdAt: at(d(-4), '20:00'), sub: [sub('t1a', 'לקרוא את השאלה פעמיים', true), sub('t1b', 'הוכחת נכונות'), sub('t1c', 'ניתוח סיבוכיות')] }),
    rec({ id: 't2', title: 'לקרוא את המאמר של קרלין על פונקציות גיבוב', trackId: 'trk-research', status: 'doing', due: TODAY, est: 1, order: 1, createdAt: at(d(-2), '20:00') }),
    rec({ id: 't3', title: 'לעדכן את דף הנחיתה של המשחק', trackId: 'trk-project', status: 'todo', due: TODAY, est: 1, order: 2, createdAt: at(d(-1), '21:00') }),
    rec({ id: 't4', title: 'להגיש את הטופס למזכירות', trackId: 'trk-life', status: 'todo', due: d(-3), order: 3, createdAt: at(d(-6), '20:00') }),
    rec({ id: 't5', title: 'להכין סיכום לפגישה עם המנחה', trackId: 'trk-research', status: 'todo', due: d(-1), est: 1, order: 4, critical: true, createdAt: at(d(-3), '20:00') }),
    rec({ id: 't6', title: 'לענות לספק ההדפסה על המהדורה השנייה', trackId: 'trk-project', status: 'waiting', order: 5, createdAt: at(d(-9), '20:00') }),
    rec({ id: 't7', title: 'לכתוב הוכחה לטענה 2', trackId: 'trk-research', status: 'todo', est: 2, order: 6, createdAt: at(d(-5), '20:00') }),
    rec({ id: 't8', title: 'לשלוח מייל לאלונים', trackId: 'trk-study', status: 'done', due: TODAY, order: 7, doneAt: at(TODAY, '09:05'), createdAt: at(d(-1), '20:00') }),
    rec({ id: 't9', title: 'לתכנן את שבוע המבחנים', trackId: 'trk-study', status: 'doing', due: d(2), est: 1, order: 8, createdAt: at(d(-1), '20:00') }),
    rec({ id: 't10', title: 'להזמין קרטונים למשלוח', trackId: 'trk-project', status: 'done', order: 9, doneAt: at(d(-3), '15:00'), createdAt: at(d(-8), '20:00') }),
    rec({ id: 't11', title: 'לקבוע תור לרופא שיניים', trackId: 'trk-life', status: 'todo', due: d(4), order: 10, createdAt: at(d(-2), '20:00') }),
    rec({ id: 't12', title: 'לסכם את ההרצאה על ניתוח אמורטיזציה', trackId: 'trk-study', status: 'todo', due: d(1), est: 1, order: 11, createdAt: at(d(-2), '20:00') }),
  ]

  const events = [
    rec({ id: 'e-meet', title: 'פגישה עם המנחה — סטטוס המחקר', date: TODAY, start: '10:00', end: '11:30', allDay: false, kind: 'personal', trackId: 'trk-research' }),
    rec({ id: 'e-ws', title: 'סדנת כתיבה אקדמית', date: TODAY, start: '16:00', end: '17:30', allDay: false, kind: 'personal', trackId: 'trk-study' }),
    rec({ id: 'e-allday', title: 'יום עיון בפקולטה', date: TODAY, allDay: true, kind: 'personal' }),
    rec({ id: 'e-bday', title: 'עידו', date: '1999-09-09', allDay: true, kind: 'birthday', yearly: true }),
    rec({ id: 'e-bday2', title: 'סבתא רחל', date: '1950-' + d(3).slice(5), allDay: true, kind: 'birthday', yearly: true, remind: [3, 14] }),
    rec({ id: 'e-exam', title: 'מבחן באלגוריתמים', date: d(5), start: '09:00', end: '12:00', allDay: false, kind: 'exam', trackId: 'trk-study' }),
    rec({ id: 'e-dead', title: 'הגשת דוח מחקר', date: d(12), allDay: true, kind: 'deadline', trackId: 'trk-research' }),
    rec({ id: 'e-mile', title: 'השקת המהדורה השנייה', date: d(20), allDay: true, kind: 'milestone', trackId: 'trk-project' }),
    rec({ id: 'e-hol', title: 'ראש השנה', date: d(9), endDate: d(10), allDay: true, kind: 'holiday' }),
    rec({ id: 'e-dent', title: 'רופא שיניים', date: d(6), start: '16:00', end: '17:00', allDay: false, kind: 'personal', remind: [1] }),
    rec({ id: 'e-tmw', title: 'הרצאת אורח — למידה עמוקה', date: d(1), start: '14:00', end: '15:30', allDay: false, kind: 'personal', trackId: 'trk-study' }),
  ]

  const weeks = [
    rec({ id: `wk-${ws}`, weekStart: ws, items: { 'wk-laundry': true }, progress: { 'wk-guitar': 45 }, plannedAt: at(ws, '20:00'),
      goals: [
        { id: 'g1', text: 'לסגור את פרק 3 של הדוח', trackId: 'trk-research' },
        { id: 'g2', text: 'להעלות את הגרסה החדשה של האתר', trackId: 'trk-project', done: true },
        { id: 'g3', text: 'שלושה אימונים' },
      ] }),
    rec({ id: `wk-${lastWs}`, weekStart: lastWs, items: { 'wk-family': true }, progress: {}, goals: [{ id: 'g0', text: 'להגיש את התרגיל הרביעי', trackId: 'trk-study', done: true }] }),
    rec({ id: `wk-${prevWs}`, weekStart: prevWs, items: {}, progress: {},
      review: { submittedAt: at(addDays(prevWs, 7), '09:00'), score: 7,
        answers: { q3: 'טיוטה ראשונה של פרק 2, ודף נחיתה חדש.', q1: 'ההוכחה של טענה 2 — כי לא היה לי בלוק שקט.', q4: 'הנתונים מהניסוי, יום שלישי 09:00.' },
        snapshot: { tokens: 12.4, minutes: 1120, byTrack: { 'trk-study': 700, 'trk-research': 420 }, habitPct: 0.71, daysLogged: 6, tasksDone: 9 } } }),
  ]

  const ex = (id: string, name: string, metric: string, sets: number, reps: string, note?: string) => ({ id, name, metric, sets, reps, note })
  const workoutPlan = [
    rec({ id: 'wd-0', dow: 0, title: 'רגליים', kind: 'gym', focus: 'סקוואט כבד', exercises: [ex('x-sq', 'סקוואט', 'weight', 4, '5'), ex('x-rdl', 'דדליפט רומני', 'weight', 3, '8-10'), ex('x-lunge', 'לאנג׳ים', 'bodyweight', 3, '12')] }),
    rec({ id: 'wd-1', dow: 1, title: 'ריצה קלה', kind: 'run', focus: 'קצב נוח, 5 ק״מ', exercises: [ex('x-run', 'ריצה', 'time', 1, '')] }),
    rec({ id: 'wd-3', dow: 3, title: 'פלג גוף עליון', kind: 'gym', focus: 'לחיצת חזה — פלוס 2.5 ק״ג', exercises: [
      ex('x-bench', 'לחיצת חזה', 'weight', 4, '8-10'), ex('x-pull', 'מתח', 'bodyweight', 3, 'מקסימום'), ex('x-lsit', 'L-Sit', 'time', 3, '30 שנ׳', 'ידיים ישרות'), ex('x-ohp', 'לחיצת כתפיים', 'weight', 3, '10'),
    ] }),
    rec({ id: 'wd-5', dow: 5, title: 'הליכה ארוכה', kind: 'walk', exercises: [] }),
  ]
  const workouts = [
    rec({ id: 'wo-sun', date: d(-3), dayId: 'wd-0', title: 'רגליים', kind: 'gym', finishedAt: at(d(-3), '18:50'),
      sets: { 'x-sq': [{ kg: 80, reps: 5 }, { kg: 85, reps: 5 }, { kg: 85, reps: 5 }, { kg: 85, reps: 4 }], 'x-rdl': [{ kg: 60, reps: 10 }, { kg: 60, reps: 9 }, { kg: 60, reps: 8 }], 'x-lunge': [{ kg: 0, reps: 12 }, { kg: 0, reps: 12 }, { kg: 0, reps: 10 }] } }),
    rec({ id: 'wo-mon', date: d(-2), dayId: 'wd-1', title: 'ריצה קלה', kind: 'run', finishedAt: at(d(-2), '19:00'), km: 5.2, minutes: 29, sets: {} }),
    rec({ id: 'wo-lw', date: addDays(lastWs, 3), dayId: 'wd-3', title: 'פלג גוף עליון', kind: 'gym', finishedAt: at(addDays(lastWs, 3), '18:55'),
      sets: { 'x-bench': [{ kg: 50, reps: 10 }, { kg: 52.5, reps: 9 }, { kg: 52.5, reps: 8 }, { kg: 52.5, reps: 8 }], 'x-pull': [{ kg: 0, reps: 8 }, { kg: 0, reps: 7 }, { kg: 0, reps: 6 }], 'x-lsit': [{ sec: 25 }, { sec: 22 }, { sec: 20 }], 'x-ohp': [{ kg: 30, reps: 10 }, { kg: 30, reps: 10 }, { kg: 30, reps: 9 }] } }),
  ]

  return {
    version: 1,
    settings: { ...SETTINGS, theme },
    tracks: TRACKS,
    tasks, events, rules: RULES, sessions, days, weeks,
    habits: HABITS, weekly: WEEKLY,
    phases: [rec({ id: 'ph1', name: 'סמסטר קיץ — ספרינט מבחנים', from: d(-20), to: d(25), color: '#5b5bd6', focus: 'אלגוריתמים ומחקר לפני הכל. הפרויקט — רק בערבים.', rule: '' })],
    news: [], workoutPlan, workouts,
    timer: { running: true, startedAt: FIXED_MS - 23 * 60_000, accumulated: 0, trackId: 'trk-study', label: 'תרגיל 3', targetMinutes: 90, lastSeen: FIXED_MS },
    deviceId: 'd-design', lastSyncAt: 0, settingsUpdatedAt: 0, resetAt: 0, materializedTo: '2026-01-01', migrations: [], atlasApplied: {},
  }
}

/** ערב של אותו יום — לכפתור "תכנון מחר" ולמצב הערב של המשימות */
export const EVENING_MS = Date.parse('2026-09-09T21:10:00+03:00')

/** פרופיל ריק לגמרי — אפילו בלי המסלולים והבלוקים של הזרע */
export function emptyState(theme: Theme = 'light') {
  return {
    version: 1,
    settings: { ...SETTINGS, theme, name: '', onboarded: false },
    tracks: [], tasks: [], events: [], rules: [], sessions: [], days: [], weeks: [],
    habits: [], weekly: [], phases: [], news: [], workoutPlan: [], workouts: [],
    timer: null, deviceId: 'd-empty', lastSyncAt: 0, settingsUpdatedAt: 0, resetAt: 0, materializedTo: '2026-01-01', migrations: [], atlasApplied: {},
  }
}

export const LONG_TITLE =
  'לסיים את הניתוח האמורטיזי המלא של מבנה הנתונים החדש כולל הוכחת החסם העליון על מספר הפעולות בסדרה של n פעולות, לכתוב את ההוכחה בצורה פורמלית ולהעביר למנחה לבדיקה לפני יום שלישי בבוקר כדי שיהיה זמן לתקן הערות'
export const URL_TITLE = 'הרצאה בזום https://us02web.zoom.us/j/84123456789?pwd=Q2xhdWRlRGVzaWduQXVkaXQyMDI2 — קישור בתיאור'
export const LONG_TRACK = 'הכנה למבחן הגמר בתורת הקומפילציה — סמסטר ב'

/** תוכן קיצוני: כותרת של 200 תווים, כתובת URL, 12 מסלולים, 15 הרגלים */
export function longState(theme: Theme = 'light') {
  const s = richState(theme) as any
  const extraTracks = Array.from({ length: 8 }, (_, i) =>
    rec({ id: `trk-x${i}`, name: i === 0 ? LONG_TRACK : `מסלול נוסף ${i + 1}`, emoji: ['🎯', '🧪', '🎨', '🛠️', '🎓', '💡', '📈', '🧭'][i], color: ['#8e4ec6', '#e93d82', '#12a594', '#ffb224', '#6e56cf', '#0090ff', '#d9730d', '#2b9a66'][i], order: 4 + i, board: true }),
  )
  s.tracks = [...TRACKS, ...extraTracks]
  s.tasks = [
    rec({ id: 'tl1', title: LONG_TITLE, trackId: 'trk-x0', status: 'todo', due: TODAY, est: 3, order: -1, critical: true, createdAt: FIXED_MS - 86400_000 }),
    rec({ id: 'tl2', title: 'https://github.com/yehonatanmedina/life-os/issues/1234567890/very-long-issue-slug-that-never-ends', trackId: 'trk-project', status: 'doing', due: TODAY, order: -2, createdAt: FIXED_MS - 86400_000 }),
    ...s.tasks,
  ]
  s.events = [
    rec({ id: 'e-url', title: URL_TITLE, date: TODAY, start: '14:00', end: '15:00', allDay: false, kind: 'personal', trackId: 'trk-x0' }),
    rec({ id: 'e-url-live', title: URL_TITLE, date: TODAY, start: '10:30', end: '11:00', allDay: false, kind: 'personal' }),
    rec({ id: 'e-long-dead', title: LONG_TITLE.slice(0, 120), date: addDays(TODAY, 2), allDay: true, kind: 'deadline', trackId: 'trk-x0' }),
    ...s.events,
  ]
  s.habits = [
    ...HABITS,
    ...Array.from({ length: 11 }, (_, i) => rec({ id: `hb-x${i}`, name: i === 0 ? 'הרגל עם שם ארוך במיוחד שנועד לבדוק גלישה של טקסט בשורה' : `הרגל ${i + 5}`, emoji: ['🧘', '💧', '🥗', '🚿', '📝', '🎹', '🌱', '🧹', '🪥', '📵', '🛏️'][i], minutes: 5 + i, order: 4 + i })),
  ]
  s.timer = { ...s.timer, trackId: 'trk-x0', label: LONG_TITLE.slice(0, 60) }
  return s
}

/** מטמון אטלס — פתק בוקר, ושיחה עם פקודות שאפשר לבטל */
export function atlasCache() {
  const y = addDays(TODAY, -1)
  return {
    messages: [
      { id: 'm1', at: new Date(at(y, '18:02')).toISOString(), from: 'user', text: 'קבעתי רופא שיניים ביום שלישי ב-16:00, שעה.' },
      { id: 'm2', at: new Date(at(y, '18:04')).toISOString(), from: 'atlas', replyTo: 'm1',
        text: 'קבעתי. שלישי 16:00–17:00, ותזכורת יום לפני. זה נופל על בלוק אחה״צ — קיצרתי אותו לסיים ב-15:45.',
        commands: [
          { id: 'cmd-1', op: 'addEvent', event: { title: 'רופא שיניים', date: addDays(TODAY, 6), start: '16:00' } },
          { id: 'cmd-2', op: 'addTask', task: { title: 'להביא צילומי רנטגן', due: addDays(TODAY, 6) } },
        ] },
      { id: 'm3', at: new Date(at(TODAY, '09:55')).toISOString(), from: 'user', text: 'מה הכי חשוב שאעשה עכשיו?' },
      { id: 'm4', at: new Date(at(TODAY, '09:57')).toISOString(), from: 'atlas', replyTo: 'm3',
        text: 'תרגיל 3 באלגוריתמים. הוא קריטי, המבחן בעוד חמישה ימים, ויש לך בלוק פתוח עד 12:30.\nלפני הפגישה עם המנחה ב-10:00 — שתי שורות סטטוס, לא יותר.' },
    ],
    today: { date: TODAY, text: 'בוקר טוב. חמישה ימים למבחן: הבלוק של הבוקר הולך לתרגיל 3, ואחה״צ לסיכום למנחה. האימון ב-18:00 — פלג גוף עליון, כמו שבוע שעבר פלוס 2.5 ק״ג בלחיצת חזה.', generatedAt: new Date(at(TODAY, '07:20')).toISOString() },
    undo: { 'cmd-1': { kind: 'event', id: 'ev-atlas-1', prev: null }, 'cmd-2': { kind: 'task', id: 't-atlas-2', prev: null } },
  }
}

// ---------------------------------------------------------------------------
// פתיחה, ניווט, צילום
// ---------------------------------------------------------------------------
export interface OpenOpts {
  state: any
  atlas?: any
  time?: number
}

/** מזריק מצב + מטמון אטלס, מקבע את השעון, וטוען מחדש */
export async function openApp(page: Page, opts: OpenOpts) {
  await page.addInitScript(
    ({ key, state, atlas }) => {
      localStorage.setItem(key, JSON.stringify(state))
      if (atlas) localStorage.setItem('life-os-atlas-cache', JSON.stringify(atlas))
      else localStorage.removeItem('life-os-atlas-cache')
    },
    { key: STORE_KEY, state: opts.state, atlas: opts.atlas ?? null },
  )
  await page.clock.setFixedTime(opts.time ?? FIXED_MS)
  await page.goto('/')
  await page.locator('.main').waitFor()
  // בלי תנועה: מעברי רקע/צבע (.12s) והחלקת היומן היו נמדדים באמצע האנימציה.
  // (הערכה הכהה נקבעת ב-useEffect אחרי הציור הראשון — ראו הדוח.)
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
  await page.waitForTimeout(150)
}

export type Screen = 'today' | 'atlas' | 'calendar' | 'projects' | 'review' | 'settings'
const NAV_LABEL: Record<Screen, string> = { today: 'היום', atlas: 'אטלס', calendar: 'יומן', projects: 'פרויקטים', review: 'סקירה', settings: 'הגדרות' }

export async function nav(page: Page, screen: Screen) {
  if (screen === 'settings') {
    const side = page.locator('.sidebar button', { hasText: /^הגדרות$/ })
    if (await side.isVisible()) await side.click()
    else await page.locator('.topbar .iconbtn[aria-label="הגדרות"]').click()
  } else {
    const label = NAV_LABEL[screen]
    const btn = page.locator('.sidebar button, .bottomnav button').filter({ hasText: new RegExp(`^${label}$`) }).locator('visible=true').first()
    await btn.click()
  }
  await page.waitForTimeout(120)
}

export function project(info: TestInfo): string {
  return info.project.name
}

export function themeOf(state: any): Theme {
  return state.settings.theme
}

/** צילום מלא של המסך (או של אזור התצוגה בלבד — לשכבות־על) */
export async function shot(page: Page, info: TestInfo, name: string, theme: Theme, opts: { viewport?: boolean } = {}) {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  const file = path.join(REPORT_DIR, `${name}-${project(info)}-${theme}.png`)
  await page.screenshot({ path: file, fullPage: !opts.viewport, animations: 'disabled', caret: 'hide' })
  return path.basename(file)
}

export function writeJson(name: string, data: unknown) {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(data, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// מדידות בתוך הדפדפן
// ---------------------------------------------------------------------------
/** סולם הגדלים המתועד; 42 ומעלה שמור למכשור (טיימר, מצב מיקוד) */
// 10.5 — מדרגה מתועדת לתוויות מכשור צפופות בלבד (README › מערכת העיצוב)
export const FONT_SCALE = [10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 18, 19, 20, 22, 24, 26, 30, 32]

/** נתיב CSS קצר ומובן לאלמנט — לדוחות */
export const cssPathFn = `
  (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && parts.length < 5) {
      let p = e.tagName.toLowerCase();
      if (e.classList.length) p += '.' + [...e.classList].slice(0, 3).join('.');
      parts.unshift(p);
      if (e.classList.contains('card') || e.classList.contains('sheet') || e.classList.contains('flow') || e.classList.contains('focus')) break;
      e = e.parentElement;
    }
    return parts.join(' > ');
  }
`

/** מנתח צבע מחושב: rgb / rgba / color(srgb …) */
export const parseColorFn = `
  (str) => {
    if (!str) return null;
    let m = str.match(/^rgba?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = str.match(/^color\\(srgb ([^)]+)\\)$/);
    if (m) {
      const parts = m[1].split('/');
      const p = parts[0].trim().split(/\\s+/).map(Number);
      const a = parts[1] !== undefined ? Number(parts[1]) : 1;
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a };
    }
    m = str.match(/^#([0-9a-f]{6})$/i);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    return null;
  }
`

export const contrastFn = `
  (fg, bg) => {
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
`
