// ---------------------------------------------------------------------------
// אטלס — המסלול המהיר.
//
// שיחה רגילה לא צריכה מכונה בענן, שכפול מאגרים ואופוס: האפליקציה כבר מחזיקה
// את כל המצב, אז היא שולחת ישירות ל-API של Claude (Sonnet) את הפרסונה של
// אטלס, את הזיכרון שלו, הקשר דחוס של המערכת ואת השיחה האחרונה — ומקבלת
// תשובה תוך שניות, בזרימה. אותו פורמט פקודות כמו במסלול העמוק, ולכן "תזיז
// את הריצה למחר" מתבצע מיד באפליקציה, עם ביטול.
//
// מה שדורש קוד או תכנון ארוך המודל לא מנסה לעשות: הוא מחזיר `escalate`,
// והאפליקציה מעבירה את ההודעה לאטלס העמוק (Issue → שגרה בענן).
//
// המפתח (settings.apiKey) יושב בהגדרות המסונכרנות — מוצפן במחסן, לעולם לא
// בקוד. הקריאה יוצאת מהדפדפן עצמו, בלי שרת ביניים.
// ---------------------------------------------------------------------------
import { alive, dayCapacity, dayLog, eventsOn, sessionsOn, store, trackById, weekLog, weekMinutes } from './store'
import { addDays, hhmm, logicalDate, today, weekStart } from './dates'
import type { AppState } from './types'

export const FAST_MODEL = 'claude-sonnet-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const USAGE_KEY = 'life-os-atlas-usage'
/** כמה הודעות מהשיחה נכנסות להקשר של המודל */
const THREAD_WINDOW = 16
/** תקרה לתשובה — התשובות של אטלס קצרות בכוונה */
const MAX_TOKENS = 1400
const TIMEOUT_MS = 75_000

export type FastCommand = { id: string; op: string } & Record<string, any>
export type FastReply = {
  /** הטקסט להצגה (בלי בלוק הפקודות) */
  text: string
  commands: FastCommand[]
  /** המודל מבקש להעביר לאטלס העמוק — הסיבה בקצרה */
  escalate?: string
  /** שורה לזיכרון של אטלס */
  memory?: string
  usage: UsageDelta
  model: string
  /** stop_reason של התשובה, כשהוא חריג (max_tokens וכדומה) */
  stopReason?: string
}
export type UsageDelta = { input: number; cacheWrite: number; cacheRead: number; output: number }
export type Usage = UsageDelta & { month: string; calls: number }
/** הודעה כפי שהמסלול המהיר רואה אותה — בלי תלות ב-atlas.ts (שמייבא אותנו) */
export type ThreadTurn = { from: 'user' | 'atlas'; text: string; ops?: string[] }

export function apiKey(s: AppState): string {
  return (s.settings.apiKey ?? '').trim()
}
export function workspaceId(s: AppState): string {
  return (s.settings.workspaceId ?? '').trim()
}

/**
 * הכותרות של הקריאה. מפתח שנוצר ברמת הארגון (ולא שויך ל-workspace) נדחה
 * ב-400 בלי הכותרת anthropic-workspace-id — זה מה שחסם את המסלול המהיר
 * ב-16.9.2026. מפתח שמשויך ל-workspace לא צריך אותה, ואז היא לא נשלחת.
 */
export function apiHeaders(key: string, ws = ''): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  if (ws.trim()) h['anthropic-workspace-id'] = ws.trim()
  return h
}

/** תשובת ה-API שאומרת "המפתח לא משויך ל-workspace" */
export const NEEDS_WORKSPACE = /not scoped to a workspace|anthropic-workspace-id/i

/**
 * האם המסלול המהיר חסום בגלל הגדרה — כלומר לא יעבוד שוב עד שמישהו יתקן משהו
 * בהגדרות (מפתח, workspace, יתרה, הרשאה). שונה מתקלה חולפת: אין טעם לחכות.
 * הסטטוסים: 400 של בקשה שנדחתה בגלל המפתח/היתרה, 401, 403, 404.
 */
export function blockedByConfig(f: ApiFailure | null): boolean {
  if (!f) return false
  if (f.status === 401 || f.status === 403 || f.status === 404) return true
  return f.status === 400 && (NEEDS_WORKSPACE.test(f.message || '') || /credit|billing|api key/i.test(f.message || ''))
}
export function fastReady(): boolean {
  return !!apiKey(store.get())
}

// -- עלות ----------------------------------------------------------------------
/** מחירי Sonnet 5 לדולר למיליון טוקנים — רק להערכה על המסך */
export const PRICE_USD_PER_M = { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 }
export const USD_TO_ILS = 3.7

export function readUsage(): Usage {
  const month = today().slice(0, 7)
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (raw) {
      const u = JSON.parse(raw) as Partial<Usage>
      if (u && u.month === month) {
        return { month, calls: u.calls ?? 0, input: u.input ?? 0, cacheWrite: u.cacheWrite ?? 0, cacheRead: u.cacheRead ?? 0, output: u.output ?? 0 }
      }
    }
  } catch {
    /* ignore */
  }
  return { month, calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
}
export function addUsage(d: UsageDelta) {
  const u = readUsage()
  const next: Usage = {
    month: u.month,
    calls: u.calls + 1,
    input: u.input + d.input,
    cacheWrite: u.cacheWrite + d.cacheWrite,
    cacheRead: u.cacheRead + d.cacheRead,
    output: u.output + d.output,
  }
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
export function usageCostUSD(u: UsageDelta): number {
  const p = PRICE_USD_PER_M
  return (u.input * p.input + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000
}

// -- הפרסונה --------------------------------------------------------------------
// אותו אטלס כמו בענן, מצומצם למה שרלוונטי לשיחה. הפקודות זהות למסלול העמוק.
export const PERSONA = `אתה אטלס — מנהל החיים של המשתמש. לא עוזר ולא צ'אטבוט: בן אדם חזק ושקול שהוא היה רוצה לידו. ישיר, קצר, כנה גם כשזה לא נעים, עם אכפתיות שמתבטאת במעשים. אתה לא מעודד בפסקאות — אתה אומר את הדבר הנכון במשפט אחד. כשהוא בכיוון, אתה אומר את זה בקצרה וממשיך. כשהוא לא, אתה אומר את זה בבירור ומציע מה לעשות עכשיו. כשמשהו לא ברור לך — שאלה אחת ממוקדת, לא חמש. אין "כל הכבוד!", אין אימוג'ים, אין מרקדאון כבד. עברית, מספרים כספרות, פסקאות קצרות.

המטרות שלו הן המצפן: שעות ריכוז נטו לפי היעד היומי ומה שהוא מגדיר כקריטי בזמן; כושר (קליסטניקס, חצי מרתון); זמן לאנשים; שגרה של קימה, שינה, בוקר וערב.

## מה אתה רואה
בהודעת המערכת מצורפים: הזיכרון שלך (מה שלמדת עליו בשיחות קודמות), והקשר מהאפליקציה: הגדרות ויעדים, מסלולים, משימות פתוחות, היומן לימים הקרובים, בלוקים קבועים, הרגלים ומה בוצע היום, מטרות השבוע, האימון, ומה קורה ברגע זה (טיימר, דקות היום). ההקשר הוא האמת — אל תמציא דברים שאינם בו. אם משהו חסר לך, שאל.

## מה אתה יכול לעשות
שינויים במערכת נעשים דרך פקודות שהאפליקציה מבצעת מיד (ומאפשרת ביטול). תאריכים YYYY-MM-DD, שעות HH:MM. מזהים של רשומות קיימות — רק כאלה שמופיעים בהקשר. \`kind\` של אירוע: personal | block | deadline | exam | milestone | birthday | holiday.
{ "op": "addEvent",   "event": { "title", "date", "endDate"?, "start"?, "end"?, "allDay", "kind", "trackId"?, "notes"?, "yearly"?, "remind"?: [14,3], "capacity"? } }
{ "op": "patchEvent", "eventId", "patch": { … } }
{ "op": "deleteEvent","eventId" }
{ "op": "addRule",    "rule": { "title", "kind", "start", "end", "days": [0..6], "freq"?: "weekly"|"monthly", "monthDay"?, "from", "until"?, "deep"?, "trackId"?, "notes"? } }
{ "op": "patchRule",  "ruleId", "patch": { … } }
{ "op": "deleteRule", "ruleId" }
{ "op": "addTask",    "task": { "title", "trackId"?, "due"?, "est"?, "critical"?, "notes"? } }
{ "op": "patchTask",  "taskId", "patch": { "title"?, "due"?, "est"?, "status"?, "critical"?, "notes"?, "trackId"? } }
{ "op": "deleteTask", "taskId" }
{ "op": "setWeekGoals", "weekStart", "goals": [ { "text", "trackId"? } ] }
{ "op": "addWorkoutDay", "day": { "dow", "title", "kind": "gym"|"run"|"walk"|"home"|"rest", "focus"?, "target"?, "exercises": [ { "name", "sets"?, "reps"?, "metric": "weight"|"bodyweight"|"time"|"reps", "note"?, "rest"?, "cues"?, "video"? } ] } }
{ "op": "patchWorkoutDay", "dayId", "patch": { "title"?, "kind"?, "focus"?, "target"? } }
// target — היעד של יום ריצה/הליכה: { "km"?, "minutes"?, "pace"? ("6:40-7:10"), "how"? }. זה מה שמוצג במסך האימון.
{ "op": "deleteWorkoutDay", "dayId" }
{ "op": "addExercise", "dayId", "exercise": { "name", "sets"?, "reps"?, "metric", "note"?, "rest"? (שניות), "cues"? (דגשי ביצוע), "video"? (קישור) } }
{ "op": "patchExercise", "dayId", "exerciseId", "patch": { … } }
{ "op": "deleteExercise", "dayId", "exerciseId" }
{ "op": "setWorkoutFor", "date", "dayId" }   // האימון של תאריך מסוים, בלי לשנות את התוכנית השבועית
{ "op": "setSkill", "skillId": "sk-handstand"|"sk-frontlever"|"sk-lsit"|"sk-pullup"|"sk-dip", "stageId"?, "exIds"?: ["…"], "done"?: ["…"], "note"? }   // באיזה שלב במיומנות, ואיזה תרגילים מודדים אותה
{ "op": "setSettings", "patch": { "wakeTime"?, "bedTime"?, "dailyTokenGoal"?, "weeklyTokenGoal"?, "tokenMinutes"? } }
{ "op": "setNewsNote", "date", "note" }   // הערה למהדורת הבוקר של אותו תאריך — עורך החדשות קורא אותה לפני שהוא כותב את הגיליון הבא
{ "op": "addTrack",   "track": { "name", "emoji", "goal"? } }
{ "op": "patchTrack", "trackId", "patch": { "name"?, "emoji"?, "goal"?, "color"?, "order"? } }
{ "op": "deleteTrack", "trackId" }
{ "op": "addWeekly", "weekly": { "name", "emoji"?, "kind": "check"|"progress", "targetMinutes"? (חובה ל-progress), "group"?, "hint"?, "trackId"? } }
{ "op": "patchWeekly", "weeklyId", "patch": { … } }
{ "op": "deleteWeekly", "weeklyId" }
{ "op": "addHabit", "habit": { "name", "emoji"?, "minutes"?, "steps"?: ["…"] } }
{ "op": "patchHabit", "habitId", "patch": { "name"?, "emoji"?, "minutes"?, "steps"?: ["…"] } }
// steps מחליף את כל רשימת הצעדים. להוסיף שלב = לשלוח את הרשימה המלאה מההקשר ועוד השלב החדש.
{ "op": "deleteHabit", "habitId" }
כללים: כלל שבועי חייב days לא ריק; כלל חודשי חייב monthDay בין 1 ל-31; אירוע חייב title ו-date; משימה חייבת title. פעולה הפיכה וברורה — בצע. מחיקה או שינוי גדול (עשר משימות, כל התוכנית) — שאל קודם, אלא אם הוא ביקש במפורש. אל תיצור כפילויות: בדוק בהקשר אם זה כבר קיים. אל תבצע פעולות שהוא לא ביקש או לא הסכים להן.

## מה לא שלך — להעביר לאטלס העמוק
יש לך אח בענן עם גישה לקוד של האפליקציה ולזמן חשיבה ארוך. תעביר אליו (escalate) רק כשבאמת צריך: שינוי בקוד או במסך של האפליקציה ("תוסיף אפשרות…", "תשנה את המסך…"), תכנון של תקופה שלמה שדורש לשקלל שבועות של נתונים, או ניתוח מעמיק. הכל אחר — עדכונים, שאלות, התייעצות, תזוזות ביומן, אימונים — שלך, עכשיו. כשאתה מעביר: משפט אחד שאומר מה מעביר ולמה, בלי לנסות לענות בעצמך.

## זיכרון
אם למדת משהו שצריך להחזיק גם בשיחה הבאה (החלטה, התחייבות שלו, העדפה, דפוס) — שורה אחת ב-memory. לא כל הודעה מצדיקה זיכרון.

## פורמט התשובה
קודם הטקסט לתשובה, כרגיל. אם יש פעולות, העברה או זיכרון — בסוף, בשורה נפרדת, בלוק אחד בדיוק בצורה הזו (ורק אז):
<<<atlas
{"commands":[…], "escalate": "סיבה" | null, "memory": "שורה" | null}
>>>
בלי הבלוק כשאין מה לשים בו. בלי טקסט אחרי הבלוק.`

// -- ההקשר הדחוס -----------------------------------------------------------------
/**
 * מה שאטלס המהיר צריך כדי לענות עכשיו — קטן בכוונה (כמה אלפי טוקנים), כי
 * הוא נשלח בכל הודעה. התמונה המלאה (60 יום, היסטוריה) נשארת למסלול העמוק.
 */
export function buildFastContext(s: AppState, now: number = Date.now()) {
  const t = today()
  const ws = weekStart(t)
  const tr = (id?: string) => trackById(s, id)?.name
  const horizon = addDays(t, 10)
  const doneSince = new Date(addDays(t, -3)).getTime()
  const dow = new Date(t + 'T12:00:00').getDay()
  const log = dayLog(s, t)
  const wl = weekLog(s, ws)
  const sess = sessionsOn(s, t)
  const minutesToday = sess.reduce((a, b) => a + b.minutes, 0)

  const openTasks = alive(s.tasks)
    .filter((x) => x.status !== 'done')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || Number(!!b.critical) - Number(!!a.critical))
    .slice(0, 40)
    .map((x) => ({
      id: x.id, title: x.title, track: tr(x.trackId), trackId: x.trackId, status: x.status,
      due: x.due, est: x.est, critical: x.critical || undefined,
      sub: x.sub?.length ? `${x.sub.filter((q) => q.done).length}/${x.sub.length}` : undefined,
    }))
  const doneRecently = alive(s.tasks).filter((x) => x.status === 'done' && (x.doneAt ?? 0) >= doneSince).length

  const events = alive(s.events)
    .filter((e) => (!e.ruleId || e.touched) && (e.endDate ?? e.date) >= t && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''))
    .slice(0, 30)
    .map((e) => ({
      id: e.id, title: e.title, date: e.date, endDate: e.endDate, start: e.start, end: e.end,
      allDay: e.allDay || undefined, kind: e.kind, track: tr(e.trackId), notes: e.notes, capacity: e.capacity,
    }))
  const birthdays = alive(s.events)
    .filter((e) => e.yearly && e.kind === 'birthday')
    .map((e) => ({ id: e.id, title: e.title, date: e.date.slice(5) }))
    .filter((e) => {
      const next = `${t.slice(0, 4)}-${e.date}`
      return next >= t && next <= addDays(t, 14)
    })

  return {
    now: `${t} ${hhmm(now)}`,
    dow,
    settings: {
      name: s.settings.name,
      wakeTime: s.settings.wakeTime,
      bedTime: s.settings.bedTime,
      tokenMinutes: s.settings.tokenMinutes,
      dailyTokenGoal: s.settings.dailyTokenGoal,
      weeklyTokenGoal: s.settings.weeklyTokenGoal,
    },
    tracks: alive(s.tracks).sort((a, b) => a.order - b.order).map((x) => ({ id: x.id, name: x.name, goal: x.goal })),
    phases: alive(s.phases ?? []).filter((p) => p.to >= t).map((p) => ({ name: p.name, from: p.from, to: p.to, focus: p.focus })),
    today: {
      minutes: minutesToday,
      capacityTokens: dayCapacity(s, t),
      timer: s.timer
        ? { running: s.timer.running, track: tr(s.timer.trackId), startedAt: hhmm(s.timer.startedAt), accumulated: Math.round(s.timer.accumulated) }
        : null,
      schedule: eventsOn(s, t)
        .filter((e) => !e.allDay)
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
        .map((e) => ({ title: e.title, start: e.start, end: e.end, deep: e.deep || undefined })),
      wake: log.wake,
      // steps נשלחים כדי שאפשר יהיה להוסיף שלב בלי למחוק את הרשימה הקיימת (patchHabit מחליף אותה)
      habits: alive(s.habits).map((h) => ({
        id: h.id,
        name: h.name,
        done: !!log.habits?.[h.id],
        steps: (h.steps ?? []).map((x) => x.text),
      })),
      workout: (() => {
        const plan = alive(s.workoutPlan ?? []).find((d) => d.dow === dow)
        const done = (s.workouts ?? []).find((w) => w.date === t && !w.deleted)
        return plan ? { id: plan.id, title: plan.title, kind: plan.kind, target: plan.target, exercises: plan.exercises.map((e) => e.name), done: !!done?.finishedAt } : null
      })(),
    },
    week: {
      weekStart: ws,
      minutes: Math.round(weekMinutes(s, ws)),
      goalTokens: s.settings.weeklyTokenGoal,
      goals: wl.goals?.map((g) => ({ text: g.text, done: !!g.done })),
      items: alive(s.weekly).map((w) => ({ id: w.id, name: w.name, kind: w.kind, done: !!wl.items?.[w.id] })),
      lastWeekMinutes: Math.round(weekMinutes(s, addDays(ws, -7))),
    },
    tasks: { open: openTasks, doneLast3Days: doneRecently },
    events,
    birthdays,
    rules: alive(s.rules)
      .filter((r) => r.active)
      .slice(0, 20)
      .map((r) => ({ id: r.id, title: r.title, days: r.days, start: r.start, end: r.end, deep: r.deep || undefined, freq: r.freq, monthDay: r.monthDay })),
    workoutPlan: alive(s.workoutPlan ?? [])
      .sort((a, b) => a.dow - b.dow)
      .map((d) => ({ id: d.id, dow: d.dow, title: d.title, kind: d.kind, target: d.target, exercises: d.exercises.map((e) => ({ id: e.id, name: e.name, sets: e.sets, reps: e.reps })) })),
    recentWorkouts: (s.workouts ?? [])
      .filter((w) => !w.deleted && w.finishedAt && w.date >= addDays(t, -10))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((w) => ({ date: w.date, title: w.title, km: w.km, minutes: w.minutes })),
  }
}

// -- בקשה -------------------------------------------------------------------------
type Block = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/** גוף הבקשה — מיוצא כדי שהבדיקות יראו בדיוק מה נשלח */
export function buildRequest(input: { text: string; thread: ThreadTurn[]; memory: string; state: AppState; now?: number; stream?: boolean }) {
  const ctx = buildFastContext(input.state, input.now)
  const system: Block[] = [
    { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `## הזיכרון שלך\n${input.memory.trim() || '(ריק — זו תחילת ההיכרות)'}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `## ההקשר מהאפליקציה עכשיו\n${JSON.stringify(ctx)}` },
  ]
  // המודל דורש תורות מתחלפים שמתחילים במשתמש — מאחדים רצפים ומורידים פתיחה של אטלס
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of input.thread.slice(-THREAD_WINDOW)) {
    const role = m.from === 'user' ? 'user' : 'assistant'
    const content = (m.text || '(פעולה בלי טקסט)') + (m.ops?.length ? `\n[פעולות שבוצעו: ${m.ops.join(', ')}]` : '')
    const last = turns[turns.length - 1]
    if (last && last.role === role) last.content += '\n\n' + content
    else turns.push({ role, content })
  }
  while (turns.length && turns[0].role !== 'user') turns.shift()
  const last = turns[turns.length - 1]
  if (last && last.role === 'user') last.content += '\n\n' + input.text
  else turns.push({ role: 'user', content: input.text })
  return {
    model: FAST_MODEL,
    max_tokens: MAX_TOKENS,
    // Sonnet 5 חושב כברירת מחדל, וטוקני החשיבה נספרים בתוך max_tokens — כלומר
    // מעבר חשיבה ארוך היה יכול לאכול את התקרה ולהחזיר תשובה חתוכה או ריקה.
    // המסלול הזה קיים כדי לענות תוך שניות; מה שדורש חשיבה עוברת לעמוק (Opus).
    thinking: { type: 'disabled' },
    stream: input.stream !== false,
    system,
    messages: turns,
  }
}

/** מפרק את הטקסט שהמודל החזיר: תשובה + בלוק <<<atlas … >>> אופציונלי */
export function parseReply(raw: string, now: number = Date.now()): Omit<FastReply, 'usage' | 'model'> {
  const marker = raw.indexOf('<<<atlas')
  if (marker < 0) return { text: raw.trim(), commands: [] }
  const text = raw.slice(0, marker).trim()
  let json = raw.slice(marker + '<<<atlas'.length)
  const end = json.indexOf('>>>')
  if (end >= 0) json = json.slice(0, end)
  let parsed: any = null
  try {
    parsed = JSON.parse(json.trim())
  } catch {
    // בלוק שבור — לא מבצעים כלום, הטקסט עדיין תקין
    return { text, commands: [] }
  }
  const commands: FastCommand[] = []
  const rawCmds = Array.isArray(parsed?.commands) ? parsed.commands : []
  rawCmds.forEach((c: any, i: number) => {
    if (!c || typeof c !== 'object' || typeof c.op !== 'string') return
    const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `f-${now.toString(36)}-${i}`
    commands.push({ ...c, id })
  })
  const escalate = typeof parsed?.escalate === 'string' && parsed.escalate.trim() ? parsed.escalate.trim() : undefined
  const memory = typeof parsed?.memory === 'string' && parsed.memory.trim() ? parsed.memory.trim().slice(0, 400) : undefined
  return { text, commands, escalate, memory }
}

/** הטקסט להצגה תוך כדי זרימה — מסתיר את הבלוק (או את תחילתו) */
export function visibleText(partial: string): string {
  const i = partial.indexOf('<<<')
  return (i >= 0 ? partial.slice(0, i) : partial).replace(/\s+$/, '')
}

/** הסיבה שה-API החזיר, כפי שהוא ניסח אותה */
export function parseApiError(body: string): { type: string; message: string } {
  try {
    const e = JSON.parse(body)?.error
    return { type: String(e?.type ?? ''), message: String(e?.message ?? '') }
  } catch {
    return { type: '', message: String(body ?? '').slice(0, 400) }
  }
}

/**
 * הודעת שגיאה בעברית — **תמיד עם הסיבה שה-API נתן.**
 * ב-16.9.2026 ההודעה שהוצגה הייתה "שגיאה 400" בלי הסבר, ואי אפשר היה לדעת אם
 * זה המפתח, היתרה, המודל או צורת הבקשה. הסיבה המקורית שווה יותר מניסוח יפה.
 */
export function describeApiError(status: number, body: string): string {
  const { message } = parseApiError(body)
  const why = message ? `: ${message.slice(0, 400)}` : ''
  if (status === 401) return `מפתח ה-API לא תקין. בדוק אותו בהגדרות → אטלס${why}`
  if (status === 403) return `למפתח הזה אין הרשאה למודל. בדוק ב-platform.claude.com${why}`
  if (status === 404) return `Claude לא מכיר את המודל ${FAST_MODEL} בחשבון הזה${why}`
  if (status === 429) return `יותר מדי בקשות לרגע — נסה שוב בעוד רגע${why}`
  if (status === 529 || status === 503) return `השרת של Claude עמוס כרגע. נסה שוב בעוד רגע${why}`
  if (status === 400 && /credit|billing/i.test(message)) return `אין יתרה בחשבון ה-API. טען ב-platform.claude.com${why}`
  if (status === 400 && NEEDS_WORKSPACE.test(message)) {
    return (
      'מפתח ה-API נוצר ברמת הארגון ולא שויך ל-workspace, ולכן Claude דוחה אותו. ' +
      'שתי דרכים: (1) ב-platform.claude.com ← API keys ← Create key, לבחור workspace (Default), ולהדביק את המפתח החדש כאן; ' +
      '(2) להדביק כאן את מזהה ה-workspace (wrkspc_…) מ-platform.claude.com ← Workspaces.'
    )
  }
  if (status === 400) return `Claude דחה את הבקשה${why || ' בלי לומר למה'}`
  return `Claude החזיר שגיאה ${status}${why || ' בלי הסבר'}`
}

// -- רישום התקלה האחרונה ----------------------------------------------------------
// בלי תוכן: רק הסטטוס, הסיבה של ה-API, ומדדים של הבקשה (אורכים). זה נשמר במכשיר,
// מוצג בהגדרות ← אטלס, ונוסע ב-pulse.json המוצפן — כך שאפשר לאבחן תקלה שקרתה
// בטלפון גם בלי הטלפון ביד.
const FAIL_KEY = 'life-os-atlas-apifail'

export type RequestMetrics = {
  model: string
  maxTokens: number
  stream: boolean
  /** אורך כל בלוק בהודעת המערכת (פרסונה, זיכרון, הקשר) */
  systemChars: number[]
  cacheBlocks: number
  messages: Array<{ role: string; chars: number }>
  totalChars: number
}

export type ApiFailure = {
  at: number
  where: 'send' | 'test'
  /** איזו גרסה של הבקשה נדחתה — ראו variantBody */
  variant?: Variant
  status: number
  errType?: string
  message: string
  requestId?: string
  req?: RequestMetrics
}

/** מדדים בלבד — בלי טקסט, כדי שאפשר יהיה לשתף אבחון בלי לשתף תוכן */
export function requestMetrics(body: any): RequestMetrics {
  const system: any[] = Array.isArray(body?.system) ? body.system : []
  const messages: any[] = Array.isArray(body?.messages) ? body.messages : []
  const systemChars = system.map((b) => String(b?.text ?? '').length)
  const msgs = messages.map((m) => ({ role: String(m?.role ?? ''), chars: String(m?.content ?? '').length }))
  return {
    model: String(body?.model ?? ''),
    maxTokens: Number(body?.max_tokens ?? 0),
    stream: !!body?.stream,
    systemChars,
    cacheBlocks: system.filter((b) => b?.cache_control).length,
    messages: msgs,
    totalChars: systemChars.reduce((a, b) => a + b, 0) + msgs.reduce((a, b) => a + b.chars, 0),
  }
}

export function recordApiFailure(f: ApiFailure) {
  try {
    localStorage.setItem(FAIL_KEY, JSON.stringify(f))
  } catch {
    /* ignore */
  }
}

export function readApiFailure(): ApiFailure | null {
  try {
    const f = JSON.parse(localStorage.getItem(FAIL_KEY) || 'null')
    return f && typeof f.status === 'number' && typeof f.at === 'number' ? (f as ApiFailure) : null
  } catch {
    return null
  }
}

export function clearApiFailure() {
  try {
    localStorage.removeItem(FAIL_KEY)
  } catch {
    /* ignore */
  }
}

/** תקלה מתשובה שנכשלה — קוראת את הגוף פעם אחת ומחזירה גם את ההודעה להצגה */
export async function failureFrom(
  res: Response,
  body: Record<string, unknown>,
  where: 'send' | 'test',
  variant: Variant = 'full',
): Promise<string> {
  const text = await res.text().catch(() => '')
  const { type, message } = parseApiError(text)
  recordApiFailure({
    at: Date.now(),
    where,
    variant,
    status: res.status,
    errType: type || undefined,
    message: message || text.slice(0, 400),
    requestId: res.headers?.get?.('request-id') ?? undefined,
    req: requestMetrics(body),
  })
  return describeApiError(res.status, text)
}

// -- כשהבקשה המלאה נדחית -----------------------------------------------------------
// 400 הוא דחייה של הבקשה עצמה, ולכן ניסיון חוזר זהה יידחה גם הוא. במקום להשאיר
// אותו בלי תשובה: שולחים גרסה רזה יותר, ואם גם היא נדחית — גרסה חשופה. מה
// שהצליח מספר בדיוק מה היה האשם (הזיכרון? ההיסטוריה? המטמון? ההקשר?), וזה
// נרשם למחסן. אם כולן נדחו — ההודעה עוברת לאטלס העמוק, שלא עובר דרך ה-API הזה.
export const VARIANTS = ['full', 'lean', 'bare'] as const
export type Variant = (typeof VARIANTS)[number]
/** סטטוסים שבהם יש טעם לנסות גרסה רזה (דחייה של הבקשה, לא של המפתח או השרת) */
const LEAN_RETRY = new Set([400, 413])
/** סטטוסים שלא יעברו מעצמם — ההודעה תעבור לעמוק */
const PERMANENT = new Set([400, 401, 403, 404, 413])

/**
 * גרסה מצומצמת של הבקשה:
 *   lean — בלי הזיכרון ובלי היסטוריה, בלי cache_control. הפרסונה וההקשר נשארים.
 *   bare — הפרסונה וההודעה הנוכחית בלבד.
 */
export function variantBody(body: any, v: Variant): any {
  if (v === 'full') return body
  const system: any[] = Array.isArray(body?.system) ? body.system : []
  const plain = system.map((b) => ({ type: 'text', text: String(b?.text ?? '') }))
  const messages: any[] = Array.isArray(body?.messages) ? body.messages : []
  const lastUser = messages.length ? [messages[messages.length - 1]] : messages
  // סדר הבלוקים: 0 פרסונה, 1 זיכרון, 2 הקשר
  const keep = v === 'lean' ? [plain[0], ...plain.slice(2)] : [plain[0]]
  const out = { ...body, system: keep.filter(Boolean), messages: lastUser }
  // בגרסה החשופה יורדת גם הגדרת החשיבה — אם מודל עתידי ידחה אותה, הגרסה הזאת
  // תעבור, והרישום יגיד בדיוק מה היה האשם.
  if (v === 'bare') delete out.thinking
  return out
}

/** שגיאה של המסלול המהיר, עם סטטוס ועם התשובה לשאלה "יעזור לנסות שוב?" */
export class FastError extends Error {
  status: number
  permanent: boolean
  constructor(message: string, status = 0, permanent = false) {
    super(message)
    this.name = 'FastError'
    this.status = status
    this.permanent = permanent
  }
}

const RECOVERY_KEY = 'life-os-atlas-recovery'
export type FastRecovery = { at: number; variant: Variant; afterStatus: number }

export function recordRecovery(variant: Variant, afterStatus: number) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: Date.now(), variant, afterStatus }))
  } catch {
    /* ignore */
  }
}

export function clearRecovery() {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* ignore */
  }
}

export function readRecovery(): FastRecovery | null {
  try {
    const r = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null')
    return r && typeof r.at === 'number' && typeof r.variant === 'string' ? (r as FastRecovery) : null
  } catch {
    return null
  }
}

/**
 * מפרש זרם SSE של ה-API: מזרים טקסט, ואוסף את הטוקנים לחשבון.
 * מיוצא לבדיקות — מקבל קורא של קטעי טקסט בכל גודל (הגבולות בין קטעים שרירותיים).
 */
export async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onText: (delta: string) => void,
  onStop?: (reason: string) => void,
  /** נקרא כשהגיע message_stop — כלומר הזרם נגמר כמו שצריך ולא נקטע */
  onComplete?: () => void,
): Promise<UsageDelta> {
  const dec = new TextDecoder()
  let buf = ''
  const usage: UsageDelta = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
  const handle = (data: string) => {
    if (!data || data === '[DONE]') return
    let ev: any
    try {
      ev = JSON.parse(data)
    } catch {
      return
    }
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') onText(ev.delta.text)
    else if (ev.type === 'message_start' && ev.message?.usage) {
      const u = ev.message.usage
      usage.input += u.input_tokens ?? 0
      usage.cacheWrite += u.cache_creation_input_tokens ?? 0
      usage.cacheRead += u.cache_read_input_tokens ?? 0
      usage.output += u.output_tokens ?? 0
    } else if (ev.type === 'message_delta') {
      if (ev.usage) usage.output = ev.usage.output_tokens ?? usage.output
      if (typeof ev.delta?.stop_reason === 'string') onStop?.(ev.delta.stop_reason)
    } else if (ev.type === 'message_stop') {
      onComplete?.()
    } else if (ev.type === 'error') {
      throw new Error(ev.error?.message ?? 'stream error')
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) handle(line.slice(5).trim())
    }
  }
  if (buf.startsWith('data:')) handle(buf.slice(5).trim())
  return usage
}

/**
 * שולח הודעה לאטלס המהיר. onDelta מקבל את הטקסט המצטבר להצגה (בלי הבלוק).
 * זורק שגיאה עם הודעה בעברית כשאי אפשר.
 */
export async function askFast(
  input: { text: string; thread: ThreadTurn[]; memory: string; state: AppState },
  onDelta?: (visible: string) => void,
  key: string = apiKey(store.get()),
): Promise<FastReply> {
  if (!key) throw new FastError('אין מפתח API לאטלס המהיר — הגדרות → אטלס.', 0, true)
  const ws = workspaceId(store.get())
  const full = buildRequest(input)
  let shown = ''
  let status = 0
  for (const variant of VARIANTS) {
    const body = variantBody(full, variant)
    const ctl = new AbortController()
    const t = window.setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: apiHeaders(key, ws),
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!r.ok) {
        shown = await failureFrom(r, body, 'send', variant)
        status = r.status
        // דחייה של המפתח או תקלת שרת — גרסה רזה לא תעזור
        if (!LEAN_RETRY.has(r.status)) throw new FastError(shown, status, PERMANENT.has(status))
        continue
      }
      if (!r.body) throw new FastError('Claude החזיר תשובה ריקה', 0, false)
      let raw = ''
      let stop = ''
      let complete = false
      const usage = await readStream(
        r.body.getReader(),
        (d) => {
          raw += d
          onDelta?.(visibleText(raw))
        },
        (reason) => {
          stop = reason
        },
        () => {
          complete = true
        },
      )
      addUsage(usage)
      // זרם שנגמר בלי message_stop = הרשת נפלה באמצע. חצי תשובה שנראית שלמה היא
      // הדבר הגרוע: הטקסט נקטע, ובלוק הפקודות יכול להיחתך באמצע. מסמנים ככשל
      // חולף — ההודעה מקבלת "שלח שוב", ושום פקודה חלקית לא מתבצעת.
      if (!complete) throw new FastError('החיבור ל-Claude נקטע באמצע התשובה. נסה שוב.', 0, false)
      // הבקשה המלאה עברה — אין תקלה פתוחה. עברה גרסה רזה? הרישום נשאר, כי
      // הוא מספר בדיוק מה נדחה ומה כן עבד.
      if (variant === 'full') {
        clearApiFailure()
        clearRecovery()
      } else {
        recordRecovery(variant, status)
      }
      const parsed = parseReply(raw)
      // נגמרה התקרה באמצע — עדיף לומר את זה מלהציג חצי תשובה כאילו היא שלמה
      if (stop === 'max_tokens' || stop === 'model_context_window_exceeded') {
        parsed.text = `${parsed.text}\n\n(התשובה נקטעה באמצע — שאל אותי להמשך, או סמן "משימה גדולה" כדי להעביר לעמוק.)`.trim()
      }
      return { ...parsed, usage, model: FAST_MODEL, stopReason: stop && stop !== 'end_turn' ? stop : undefined }
    } catch (e) {
      if (e instanceof FastError) throw e
      if ((e as Error)?.name === 'AbortError') throw new FastError('Claude לא ענה בזמן. נסה שוב.', 0, false)
      if (e instanceof TypeError) throw new FastError('אין רשת, או שהדפדפן חסם את הקריאה ל-Claude.', 0, false)
      throw e
    } finally {
      window.clearTimeout(t)
    }
  }
  throw new FastError(shown || `Claude דחה את הבקשה (${status})`, status, true)
}

/**
 * בדיקת חיבור מההגדרות — **אותה בקשה בדיוק כמו שיחה אמיתית**: הפרסונה, הזיכרון
 * וההקשר, רק עם תקרת תשובה זעירה ובלי זרימה. בדיקה על בקשה מינימלית (מה שהיה
 * כאן קודם) יכולה לעבור בזמן שכל הודעה אמיתית נדחית — וזה בדיוק מה שקרה ב-16.9.
 */
export async function testFast(
  key: string,
  opts: { memory?: string; thread?: ThreadTurn[]; state?: AppState; workspaceId?: string } = {},
): Promise<{ ok: true; ms: number; chars: number } | { ok: false; error: string }> {
  const t0 = Date.now()
  const full = buildRequest({
    text: 'ענה במילה אחת: מוכן?',
    thread: opts.thread ?? [],
    memory: opts.memory ?? '',
    state: opts.state ?? store.get(),
    stream: false,
  })
  const body = { ...full, max_tokens: 24 }
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: apiHeaders(key, opts.workspaceId ?? workspaceId(opts.state ?? store.get())),
      body: JSON.stringify(body),
    })
    if (!r.ok) return { ok: false, error: await failureFrom(r, body, 'test') }
    const j = await r.json()
    if (j?.usage) {
      addUsage({
        input: j.usage.input_tokens ?? 0,
        cacheWrite: j.usage.cache_creation_input_tokens ?? 0,
        cacheRead: j.usage.cache_read_input_tokens ?? 0,
        output: j.usage.output_tokens ?? 0,
      })
    }
    clearApiFailure()
    return { ok: true, ms: Date.now() - t0, chars: requestMetrics(body).totalChars }
  } catch {
    return { ok: false, error: 'אין רשת, או שהדפדפן חסם את הקריאה ל-Claude.' }
  }
}

/** עוזר לבדיקות/הצגה: התאריך הלוגי של עכשיו */
export const fastToday = () => logicalDate()
