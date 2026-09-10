// ---------------------------------------------------------------------------
// מה הסוכנים בענן רואים — ואיך התשובות שלהם חוזרות.
//
// שום נתון אישי לא שוכב גלוי: כל מה שיוצא מכאן מוצפן במפתח הניתוח (aiKey),
// שיושב בהגדרות (ולכן מסונכרן ומוצפן יחד עם כל השאר) ובפרומפט הפרטי של
// הסוכנים. הקבצים נכתבים למחסן כחלק מכל דחיפה של הסנכרון — לא בטיימר נפרד.
//
//   week-digest.json    — סטטיסטיקה שבועית, לניתוח של יום ראשון
//   atlas-context.json  — התמונה המלאה של המערכת, לאטלס
//   pulse.json          — דופק: מה קורה עכשיו, למנגנון התזכורות
//   docs/insights/latest.json — הניתוח השבועי שחוזר, מוצפן באותו מפתח
// ---------------------------------------------------------------------------
import { alive, dayCapacity, dayLog, eventsOn, plannedOn, sessionsOn, store, trackById, weekLog } from './store'
import { addDays, today, weekStart } from './dates'
import { buildWeekStats } from './insights'
import { decryptText } from './crypto'
import type { AppState } from './types'

const INSIGHT_URL = './insights/latest.json'

export type Insight = {
  week: string
  generatedAt?: string
  headline?: string
  sections?: Array<{ title: string; text: string }>
  questions?: string[]
}

export function aiKey(s: AppState): string {
  return s.settings.aiKey ?? ''
}

// -- חבילת הניתוח השבועי ------------------------------------------------------
export function buildWeekDigest(s: AppState) {
  const t = today()
  const weeks = [weekStart(t), addDays(weekStart(t), -7), addDays(weekStart(t), -14)].map((ws) => {
    const st = buildWeekStats(s, ws)
    const wl = weekLog(s, ws)
    return {
      weekStart: ws,
      minutes: Math.round(st.minutes),
      tokens: Math.round(st.tokens * 10) / 10,
      perDay: st.perDay.map((d) => ({ date: d.date, minutes: d.minutes, capacity: d.capacity })),
      byTrack: Object.fromEntries(
        Object.entries(st.byTrack).map(([id, m]) => [trackById(s, id)?.name ?? id, Math.round(m)]),
      ),
      tasksDone: st.tasksDone,
      tasksCreated: st.tasksCreated,
      habitPct: Math.round(st.habitPct * 100),
      wakeOnTime: st.wakeOnTime,
      wakeAnswered: st.wakeAnswered,
      goodNights: st.goodNights,
      ratedNights: st.ratedNights,
      minutesAfterGoodNight: Math.round(st.minutesAfterGood),
      minutesAfterBadNight: Math.round(st.minutesAfterBad),
      missedWeeklyItems: st.missedWeekly,
      goals: (wl.goals ?? []).map((g) => ({ text: g.text, done: !!g.done })),
      review: wl.review ? { score: wl.review.score, answers: wl.review.answers } : undefined,
    }
  })

  const overdue = alive(s.tasks)
    .filter((x) => x.due && x.due < t && x.status !== 'done')
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
    .slice(0, 12)
    .map((x) => ({ title: x.title, track: trackById(s, x.trackId)?.name, due: x.due, est: x.est }))

  return {
    about: 'נתוני שימוש מתוך מערכת ניהול הזמן של יהונתן, לניתוח שבועי.',
    generatedAt: new Date().toISOString(),
    today: t,
    settings: {
      tokenMinutes: s.settings.tokenMinutes,
      dailyTokenGoal: s.settings.dailyTokenGoal,
      weeklyTokenGoal: s.settings.weeklyTokenGoal,
      wakeTime: s.settings.wakeTime,
      bedTime: s.settings.bedTime,
    },
    tracks: alive(s.tracks).map((x) => x.name),
    weeks,
    overdue,
    upcoming: alive(s.events)
      .filter((e) => (e.kind === 'exam' || e.kind === 'deadline') && e.date >= t && e.date <= addDays(t, 30))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8)
      .map((e) => ({ title: e.title, date: e.date, kind: e.kind })),
  }
}

// -- התמונה המלאה לאטלס -------------------------------------------------------
/**
 * כל מה שאטלס צריך כדי לנהל: מסלולים, משימות פתוחות, היומן לחודשיים
 * הקרובים, הבלוקים הקבועים, ההרגלים, האימונים, וההיסטוריה הקרובה.
 * מופעים של בלוקים קבועים שלא נערכו ידנית לא נכללים — הכלל מתאר אותם.
 */
export function buildAtlasContext(s: AppState) {
  const t = today()
  const from = addDays(t, -7)
  const to = addDays(t, 60)
  const hist = addDays(t, -30)
  const doneSince = new Date(addDays(t, -14)).getTime()

  const tr = (id?: string) => trackById(s, id)?.name

  return {
    about: 'התמונה המלאה של מערכת ניהול הזמן של יהונתן, לאטלס.',
    generatedAt: new Date().toISOString(),
    today: t,
    settings: {
      name: s.settings.name,
      wakeTime: s.settings.wakeTime,
      bedTime: s.settings.bedTime,
      tokenMinutes: s.settings.tokenMinutes,
      dailyTokenGoal: s.settings.dailyTokenGoal,
      weeklyTokenGoal: s.settings.weeklyTokenGoal,
      reviewDow: s.settings.reviewDow,
    },
    tracks: alive(s.tracks)
      .sort((a, b) => a.order - b.order)
      .map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, goal: x.goal })),
    phases: alive(s.phases).map((p) => ({ id: p.id, name: p.name, from: p.from, to: p.to, focus: p.focus })),
    tasks: alive(s.tasks)
      .filter((x) => x.status !== 'done' || (x.doneAt ?? 0) >= doneSince)
      .map((x) => ({
        id: x.id, title: x.title, track: tr(x.trackId), trackId: x.trackId, status: x.status,
        due: x.due, est: x.est, critical: x.critical, notes: x.notes, doneAt: x.doneAt,
        sub: x.sub?.map((sub) => ({ text: sub.text, done: sub.done })),
      })),
    events: alive(s.events)
      .filter((e) => (!e.ruleId || e.touched) && (e.yearly || ((e.endDate ?? e.date) >= from && e.date <= to)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        id: e.id, title: e.title, date: e.date, endDate: e.endDate, start: e.start, end: e.end,
        allDay: e.allDay, kind: e.kind, track: tr(e.trackId), notes: e.notes, yearly: e.yearly,
        remind: e.remind, capacity: e.capacity, fromRule: e.ruleId,
      })),
    rules: alive(s.rules)
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id, title: r.title, kind: r.kind, start: r.start, end: r.end, days: r.days,
        from: r.from, until: r.until, deep: r.deep, track: tr(r.trackId), notes: r.notes,
      })),
    habits: alive(s.habits).map((h) => ({ id: h.id, name: h.name, steps: h.steps?.map((x) => x.text) })),
    weekly: alive(s.weekly).map((w) => ({ id: w.id, name: w.name, kind: w.kind, targetMinutes: w.targetMinutes })),
    days: alive(s.days)
      .filter((d) => d.date >= hist && d.date <= t)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date, sleep: d.sleep, wake: d.wake, workout: d.workout,
        habitsDone: Object.entries(d.habits ?? {}).filter(([, v]) => v).map(([k]) => alive(s.habits).find((h) => h.id === k)?.name ?? k),
      })),
    weeks: alive(s.weeks)
      .filter((w) => w.weekStart >= addDays(t, -56))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((w) => ({
        weekStart: w.weekStart,
        itemsDone: Object.entries(w.items ?? {}).filter(([, v]) => v).map(([k]) => alive(s.weekly).find((x) => x.id === k)?.name ?? k),
        goals: w.goals?.map((g) => ({ text: g.text, done: !!g.done })),
        review: w.review ? { score: w.review.score, answers: w.review.answers } : undefined,
      })),
    sessions: alive(s.sessions)
      .filter((x) => new Date(x.endedAt - 3.5 * 3600_000).toISOString().slice(0, 10) >= hist)
      .map((x) => ({ endedAt: x.endedAt, minutes: x.minutes, track: tr(x.trackId), label: x.label })),
    workoutPlan: alive(s.workoutPlan ?? [])
      .sort((a, b) => a.dow - b.dow)
      .map((d) => ({
        id: d.id, dow: d.dow, title: d.title, kind: d.kind, focus: d.focus,
        exercises: d.exercises.map((e) => ({ id: e.id, name: e.name, sets: e.sets, reps: e.reps, metric: e.metric, note: e.note })),
      })),
    workouts: (s.workouts ?? [])
      .filter((w) => !w.deleted && w.date >= addDays(t, -60))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: w.date, title: w.title, kind: w.kind, sets: w.sets, km: w.km, minutes: w.minutes, note: w.note, finished: !!w.finishedAt })),
    news: (s.news ?? [])
      .filter((n) => !n.deleted && n.date >= addDays(t, -14))
      .map((n) => ({ date: n.date, votes: Object.keys(n.votes ?? {}).length, note: n.note })),
    stats: {
      thisWeek: compactStats(s, weekStart(t)),
      lastWeek: compactStats(s, addDays(weekStart(t), -7)),
    },
  }
}

function compactStats(s: AppState, ws: string) {
  const st = buildWeekStats(s, ws)
  return {
    weekStart: ws,
    minutes: Math.round(st.minutes),
    tokens: Math.round(st.tokens * 10) / 10,
    goalTokens: st.goalTokens,
    perDay: st.perDay.map((d) => ({ date: d.date, minutes: d.minutes, capacity: d.capacity })),
    byTrack: Object.fromEntries(Object.entries(st.byTrack).map(([id, m]) => [trackById(s, id)?.name ?? id, Math.round(m)])),
    tasksDone: st.tasksDone,
    overdue: st.overdue.length,
    habitPct: Math.round(st.habitPct * 100),
  }
}

// -- הדופק ---------------------------------------------------------------------
/**
 * מה קורה ברגע זה — למנגנון התזכורות שרץ בענן כל כמה דקות.
 * נגזר מהמצב בלבד, ונכתב מחדש בכל דחיפה (שכל מכשיר עושה), ולכן תמיד טרי.
 */
export function buildPulse(s: AppState) {
  const t = today()
  const sess = sessionsOn(s, t)
  const minutesToday = sess.reduce((a, b) => a + b.minutes, 0)
  const lastSession = sess.sort((a, b) => b.endedAt - a.endedAt)[0]
  const log = dayLog(s, t)
  const timer = s.timer
    ? {
        running: s.timer.running,
        trackId: s.timer.trackId,
        track: trackById(s, s.timer.trackId)?.name,
        startedAt: s.timer.startedAt,
        accumulated: Math.round(s.timer.accumulated),
        label: s.timer.label,
      }
    : null
  const deepBlocks = eventsOn(s, t)
    .filter((e) => !e.allDay && e.deep && e.start && e.end)
    .map((e) => ({ title: e.title, start: e.start as string, end: e.end as string }))
  const tasksToday = alive(s.tasks).filter((x) => x.due === t || (x.due && x.due < t && x.status !== 'done'))

  return {
    generatedAt: new Date().toISOString(),
    today: t,
    wakeTime: s.settings.wakeTime,
    bedTime: s.settings.bedTime,
    minutesToday,
    sessionsToday: sess.length,
    lastSessionEndedAt: lastSession?.endedAt ?? null,
    timer,
    plannedTokensToday: plannedOn(s, t),
    capacityToday: dayCapacity(s, t),
    deepBlocksToday: deepBlocks,
    habitsDone: Object.entries(log.habits ?? {}).filter(([, v]) => v).length,
    habitsTotal: alive(s.habits).length,
    wake: log.wake,
    tasksOpen: tasksToday.filter((x) => x.status !== 'done').length,
    tasksDoneToday: alive(s.tasks).filter((x) => x.status === 'done' && x.doneAt && new Date(x.doneAt - 3.5 * 3600_000).toISOString().slice(0, 10) === t).length,
    workoutPlanned: !!alive(s.workoutPlan ?? []).find((d) => d.dow === new Date(t + 'T12:00:00').getDay() && d.kind !== 'rest'),
    workoutDone: !!(s.workouts ?? []).find((w) => w.date === t && !w.deleted && w.finishedAt),
  }
}

// -- מה חוזר משם -------------------------------------------------------------
const CACHE_KEY = 'life-os-insight-cache'

/** מושך את הניתוח האחרון שהסוכן כתב ומפענח אותו. null אם אין. */
export async function fetchInsight(): Promise<Insight | null> {
  const key = aiKey(store.get())
  const fromCache = (): Insight | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      return raw ? (JSON.parse(raw) as Insight) : null
    } catch {
      return null
    }
  }
  if (!key) return fromCache()
  try {
    const res = await fetch(INSIGHT_URL, { cache: 'no-cache' })
    if (!res.ok) return fromCache()
    const env = await res.json()
    const plain = env && env.enc === 1 ? await decryptText(env.iv, env.ct, key) : JSON.stringify(env)
    const parsed = JSON.parse(plain) as Insight
    if (!parsed || !parsed.week) return fromCache()
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed))
    } catch {
      /* ignore */
    }
    return parsed
  } catch {
    return fromCache()
  }
}
