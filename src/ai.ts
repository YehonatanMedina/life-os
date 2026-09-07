// ---------------------------------------------------------------------------
// ניתוח שבועי של Claude — צינור מוצפן דו־כיווני.
//
// למה ככה: הסוכן בענן צריך לראות את הנתונים כדי לנתח אותם, אבל שום דבר אישי
// לא אמור לשכב גלוי — לא במחסן ובטח לא במאגר הציבורי. לכן:
//
//   האפליקציה  →  week-digest.json במחסן   (מוצפן AES-GCM במפתח הניתוח)
//   הסוכן      →  docs/insights/latest.json (מוצפן באותו מפתח)
//   האפליקציה  →  מפענחת ומציגה
//
// מפתח הניתוח יושב בהגדרות (ולכן מסונכרן ומוצפן יחד עם כל השאר) ובפרומפט
// הפרטי של הסוכן. מי שמגיע לקבצים רואה צופן.
// ---------------------------------------------------------------------------
import { alive, dayLog, store, trackById, weekLog } from './store'
import { addDays, today, weekStart } from './dates'
import { buildWeekStats } from './insights'
import { decryptText, encryptText } from './cloud'
import type { AppState } from './types'

const DIGEST_FILE = 'week-digest.json'
const INSIGHT_URL = './insights/latest.json'
const LAST_WRITE_KEY = 'life-os-digest-at'

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

// -- מה נשלח לניתוח ---------------------------------------------------------
function digest(s: AppState) {
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

/** כותב את חבילת הנתונים המוצפנת למחסן. מוגבל לפעם בשש שעות. */
export async function writeWeekDigest(force = false): Promise<boolean> {
  const s = store.get()
  const key = aiKey(s)
  if (!key) return false
  let token = ''
  let gist = ''
  try {
    token = localStorage.getItem('life-os-gh-token') ?? ''
    gist = localStorage.getItem('life-os-gist-id') ?? ''
    const last = Number(localStorage.getItem(LAST_WRITE_KEY) ?? 0)
    if (!force && Date.now() - last < 6 * 3600_000) return false
  } catch {
    return false
  }
  if (!token || !gist) return false

  try {
    const content = await encryptText(JSON.stringify(digest(s)), key)
    const res = await fetch(`https://api.github.com/gists/${gist}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: { [DIGEST_FILE]: { content } } }),
    })
    if (res.ok) {
      try {
        localStorage.setItem(LAST_WRITE_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
    }
    return res.ok
  } catch {
    return false
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
