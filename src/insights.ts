// ---------------------------------------------------------------------------
// ניתוח השבוע.
//
// כל מה שכאן נגזר מהנתונים שכבר נמצאים במכשיר — בלי רשת, בלי לשלוח כלום
// החוצה. המטרה היא לא "עוד גרף" אלא משפטים שאפשר להחליט לפיהם: מה זז,
// מול מה זה נמדד, ומה הדבר האחד שכדאי לשנות בשבוע הבא.
//
// הכלל: אף תובנה לא נאמרת בלי בסיס. אם אין מספיק נתונים להשוואה —
// פשוט לא אומרים אותה.
// ---------------------------------------------------------------------------
import type { AppState, ID, ISODate, Task } from './types'
import {
  HE_DAYS, addDays, diffDays, minutesToHM, parseISO, shortDate, today, weekDates, weekStart,
} from './dates'
import {
  alive, dayCapacity, dayLog, habitPct, minutesByTrack, minutesOn, periodicDue, trackById,
  weekLog, weekMinutes, weekSessions,
} from './store'

export type Tone = 'good' | 'warn' | 'bad' | 'info'
export type Insight = { id: string; tone: Tone; title: string; text: string }

export type WeekStats = {
  ws: ISODate
  minutes: number
  tokens: number
  goalTokens: number
  /** קיבולת אמיתית של השבוע לפי הכללים של כל יום */
  capacityTokens: number
  perDay: Array<{ date: ISODate; minutes: number; capacity: number }>
  byTrack: Record<string, number>
  prevMinutes: number
  /** ממוצע השבועות הקודמים שהיה בהם משהו (עד ארבעה) */
  baselineMinutes: number
  baselineByTrack: Record<string, number>
  baselineWeeks: number
  tasksDone: number
  tasksCreated: number
  overdue: Task[]
  oldestOverdueDays: number
  habitPct: number
  weakestHabit?: string
  wakeOnTime: number
  wakeAnswered: number
  goodNights: number
  ratedNights: number
  minutesAfterGood: number
  minutesAfterBad: number
  missedWeekly: string[]
  doneWeekly: number
  totalWeekly: number
  goalsDone: number
  goalsTotal: number
  daysAtGoal: number
  zeroDays: number
  bestDay?: { date: ISODate; minutes: number }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** דקות עבודה בשבוע מסוים — 0 אם אין */
function weekMin(s: AppState, ws: ISODate): number {
  return weekMinutes(s, ws)
}

export function taskCreatedAt(t: Task): number {
  if (t.createdAt) return t.createdAt
  // מזהים ישנים נוצרו כ-"t-<זמן בבסיס 36><אקראי>" — אפשר לחלץ מהם את הזמן
  const m = /^[a-z]+-([0-9a-z]{8})/.exec(t.id)
  if (m) {
    const n = parseInt(m[1], 36)
    if (Number.isFinite(n) && n > Date.parse('2020-01-01') && n < Date.now() + 86400000) return n
  }
  return t.updatedAt || 0
}

export function buildWeekStats(s: AppState, ws: ISODate): WeekStats {
  const dates = weekDates(ws)
  const t = today()
  const sess = weekSessions(s, ws)
  const minutes = sess.reduce((a, b) => a + b.minutes, 0)
  const tokenMin = s.settings.tokenMinutes || 90

  const perDay = dates.map((d) => ({
    date: d,
    minutes: minutesOn(s, d),
    capacity: dayCapacity(s, d),
  }))

  // בסיס להשוואה: עד ארבעה שבועות קודמים שהיה בהם בכלל רישום
  const prevWeeks: ISODate[] = []
  for (let i = 1; i <= 8 && prevWeeks.length < 4; i++) {
    const w = addDays(ws, -7 * i)
    if (weekMin(s, w) > 0) prevWeeks.push(w)
  }
  const baselineMinutes = prevWeeks.length
    ? prevWeeks.reduce((a, w) => a + weekMin(s, w), 0) / prevWeeks.length
    : 0
  const baselineByTrack: Record<string, number> = {}
  for (const w of prevWeeks) {
    const bt = minutesByTrack(weekSessions(s, w))
    for (const [k, v] of Object.entries(bt)) baselineByTrack[k] = (baselineByTrack[k] ?? 0) + v
  }
  for (const k of Object.keys(baselineByTrack)) {
    baselineByTrack[k] = baselineByTrack[k] / Math.max(1, prevWeeks.length)
  }

  const from = parseISO(ws).getTime()
  const to = parseISO(addDays(ws, 7)).getTime()
  const tasksDone = alive(s.tasks).filter((x) => x.doneAt && x.doneAt >= from && x.doneAt < to).length
  const tasksCreated = alive(s.tasks).filter((x) => {
    const c = taskCreatedAt(x)
    return c >= from && c < to
  }).length

  const overdue = alive(s.tasks)
    .filter((x) => x.due && x.due < t && x.status !== 'done')
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  const oldestOverdueDays = overdue.length ? diffDays(overdue[0].due as string, t) : 0

  // הרגלים — רק ימים שכבר עברו, אחרת סוף השבוע מוריד את הציון בלי סיבה
  const past = dates.filter((d) => d <= t)
  const logged = past.filter((d) => s.days.some((x) => x.date === d && !x.deleted))
  const hp = logged.length ? logged.reduce((a, d) => a + habitPct(s, d), 0) / logged.length : 0
  const habits = alive(s.habits)
  let weakestHabit: string | undefined
  if (habits.length && logged.length >= 3) {
    const scored = habits
      .map((h) => ({ h, n: logged.filter((d) => dayLog(s, d).habits[h.id]).length }))
      .sort((a, b) => a.n - b.n)
    if (scored[0] && scored[0].n < logged.length * 0.6) weakestHabit = scored[0].h.name
  }

  const wakeAnswered = past.filter((d) => dayLog(s, d).wake).length
  const wakeOnTime = past.filter((d) => dayLog(s, d).wake === 'ontime').length

  const rated = past.map((d) => ({ d, v: dayLog(s, d).sleep })).filter((x) => x.v)
  const goodNights = rated.filter((x) => x.v === 'good').length
  const afterGood = rated.filter((x) => x.v === 'good').map((x) => minutesOn(s, x.d))
  const afterBad = rated.filter((x) => x.v === 'bad').map((x) => minutesOn(s, x.d))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  const wl = weekLog(s, ws)
  const weeklyItems = alive(s.weekly).filter((w) => (w.everyDays ? periodicDue(w, ws) : true))
  const missedWeekly = weeklyItems
    .filter((w) => w.kind === 'check' && !wl.items[w.id])
    .map((w) => w.name)
  const doneWeekly = weeklyItems.filter((w) => w.kind === 'check' && wl.items[w.id]).length
  const goals = wl.goals ?? []

  const dailyGoalMin = s.settings.dailyTokenGoal * tokenMin
  const daysAtGoal = past.filter((d) => minutesOn(s, d) >= dailyGoalMin).length
  const zeroDays = past.filter((d) => minutesOn(s, d) === 0 && dayCapacity(s, d) > 0).length
  const best = [...perDay].sort((a, b) => b.minutes - a.minutes)[0]

  return {
    ws,
    minutes,
    tokens: minutes / tokenMin,
    goalTokens: s.settings.weeklyTokenGoal,
    capacityTokens: perDay.reduce((a, d) => a + d.capacity, 0),
    perDay,
    byTrack: minutesByTrack(sess),
    prevMinutes: weekMin(s, addDays(ws, -7)),
    baselineMinutes,
    baselineByTrack,
    baselineWeeks: prevWeeks.length,
    tasksDone,
    tasksCreated,
    overdue,
    oldestOverdueDays,
    habitPct: hp,
    weakestHabit,
    wakeOnTime,
    wakeAnswered,
    goodNights,
    ratedNights: rated.length,
    minutesAfterGood: avg(afterGood),
    minutesAfterBad: avg(afterBad),
    missedWeekly,
    doneWeekly,
    totalWeekly: weeklyItems.filter((w) => w.kind === 'check').length,
    goalsDone: goals.filter((g) => g.done).length,
    goalsTotal: goals.length,
    daysAtGoal,
    zeroDays,
    bestDay: best && best.minutes > 0 ? { date: best.date, minutes: best.minutes } : undefined,
  }
}

/**
 * מהמספרים לתובנות. הסדר כאן הוא סדר החשיבות — הראשונה היא זו שהוא
 * יקרא אם יקרא רק אחת.
 */
export function buildInsights(s: AppState, st: WeekStats): Insight[] {
  const out: Insight[] = []
  const push = (id: string, tone: Tone, title: string, text: string) => out.push({ id, tone, title, text })
  const tokenMin = s.settings.tokenMinutes || 90
  const hours = st.minutes / 60

  // ---- 1. הכמות מול היעד -------------------------------------------------
  if (st.minutes === 0) {
    push('none', 'info', 'אין נתונים לשבוע הזה', 'לא נרשמה עבודה בשבוע הזה, אז אין ממה להסיק. אם עבדת בלי טיימר — אפשר להשלים ברישום ידני, וזה ישנה את כל התמונה.')
  } else {
    const pct = Math.round((st.tokens / Math.max(1, st.goalTokens)) * 100)
    if (st.tokens >= st.goalTokens) {
      push('goal', 'good', 'עמדת ביעד השבועי', `${round1(st.tokens)} אסימונים (${minutesToHM(st.minutes)} נטו) מול יעד של ${st.goalTokens}. זה שבוע שאפשר לחזור עליו.`)
    } else {
      const gapH = (st.goalTokens - st.tokens) * tokenMin / 60
      push('goal', pct >= 80 ? 'info' : 'warn', `${pct}% מהיעד השבועי`, `${round1(st.tokens)} אסימונים מתוך ${st.goalTokens}. הפער הוא ${round1(gapH)} שעות — כלומר בערך ${round1(gapH / 6)} שעות ליום עבודה.`)
    }
  }

  // ---- 2. מגמה מול הבסיס --------------------------------------------------
  if (st.baselineWeeks >= 2 && st.minutes > 0 && st.baselineMinutes > 0) {
    const d = (st.minutes - st.baselineMinutes) / st.baselineMinutes
    const p = Math.round(Math.abs(d) * 100)
    if (p >= 12) {
      push(
        'trend',
        d > 0 ? 'good' : 'warn',
        d > 0 ? `עלייה של ${p}% מהממוצע` : `ירידה של ${p}% מהממוצע`,
        `הממוצע של ${st.baselineWeeks} השבועות הקודמים הוא ${minutesToHM(Math.round(st.baselineMinutes))} בשבוע, והשבוע יצאו ${minutesToHM(st.minutes)}.`,
      )
    } else {
      push('trend', 'info', 'שבוע יציב', `ההפרש מהממוצע של השבועות הקודמים הוא פחות מ-12%. הקצב שלך עקבי, וזה בעצמו נתון.`)
    }
  }

  // ---- 3. הפיזור על פני הימים --------------------------------------------
  if (st.minutes > 0) {
    if (st.zeroDays >= 2) {
      push('zero', 'warn', `${st.zeroDays} ימים בלי כלום`, `היו ${st.zeroDays} ימים עם קיבולת שבהם לא נרשמה אפילו דקה. שני ימים כאלה שווים בערך ${round1((st.zeroDays * s.settings.dailyTokenGoal * tokenMin) / 60)} שעות — יותר מכל פער אחר ברשימה.`)
    } else if (st.daysAtGoal >= 4) {
      push('steady', 'good', `${st.daysAtGoal} ימים סגרו את היעד היומי`, 'העקביות היומית היא מה שמייצר את המספר השבועי, לא יום אחד ענק.')
    }
    if (st.bestDay) {
      const dow = HE_DAYS[parseISO(st.bestDay.date).getDay()]
      push('best', 'info', `היום החזק: יום ${dow}`, `${minutesToHM(st.bestDay.minutes)} ב-${shortDate(st.bestDay.date)}. שווה לבדוק מה היה שונה בו — שעת קימה, מקום, או פשוט יום פנוי מפגישות.`)
    }
  }

  // ---- 4. לאן הלך הזמן ----------------------------------------------------
  const tracks = alive(s.tracks)
  if (st.minutes > 0 && tracks.length > 1) {
    const sorted = tracks
      .map((tr) => ({ tr, m: st.byTrack[tr.id] ?? 0, b: st.baselineByTrack[tr.id] ?? 0 }))
      .sort((a, b) => b.m - a.m)
    const top = sorted[0]
    if (top && top.m / st.minutes > 0.6) {
      push('focus', 'info', `${Math.round((top.m / st.minutes) * 100)}% מהזמן הלך ל"${top.tr.name}"`, 'ריכוז כזה הוא מצוין כשהוא בכוונה, ומסוכן כשהוא ברירת מחדל. השאלה היחידה: זה היה המסלול הנכון השבוע?')
    }
    const dropped = sorted.find((x) => x.m === 0 && x.b >= 90)
    if (dropped) {
      push('dropped', 'warn', `"${dropped.tr.name}" נעלם השבוע`, `בשבועות הקודמים הוא קיבל בממוצע ${minutesToHM(Math.round(dropped.b))} בשבוע, והשבוע אפס. אם זה בכוונה — מצוין. אם לא, זה הדבר הראשון להחזיר.`)
    }
  }

  // ---- 5. משימות: מה נכנס מול מה נסגר -------------------------------------
  if (st.tasksCreated + st.tasksDone > 0) {
    const gap = st.tasksCreated - st.tasksDone
    if (gap >= 3) {
      push('inflow', 'warn', 'המאגר גדל', `נכנסו ${st.tasksCreated} משימות ונסגרו ${st.tasksDone}. בקצב הזה הרשימה תמשיך להתארך גם אם תעבוד יותר — הפתרון הוא למחוק, לא להאיץ.`)
    } else if (st.tasksDone > st.tasksCreated) {
      push('inflow', 'good', 'צמצמת את הרשימה', `נסגרו ${st.tasksDone} משימות מול ${st.tasksCreated} שנכנסו.`)
    }
  }
  if (st.overdue.length >= 3) {
    push('debt', st.oldestOverdueDays >= 10 ? 'bad' : 'warn', `${st.overdue.length} משימות באיחור`, `הוותיקה מחכה כבר ${st.oldestOverdueDays} ימים ("${st.overdue[0].title}"). משימה שנדחתה שלוש פעמים בדרך כלל לא צריכה תאריך חדש אלא החלטה: לפרק, להעביר למישהו, או למחוק.`)
  }

  // ---- 6. גוף, שינה, שגרה --------------------------------------------------
  if (st.ratedNights >= 4) {
    const badN = st.ratedNights - st.goodNights
    if (badN >= 3) {
      push('sleep', 'bad', `${badN} לילות לא טובים`, 'זה המדד שמתריע ראשון. כל שאר המספרים בעמוד הזה תלויים בו, וגם השבוע הבא.')
    } else if (st.goodNights === st.ratedNights) {
      push('sleep', 'good', 'כל הלילות היו טובים', 'השינה מסודרת — זה הבסיס שמחזיק את כל השאר.')
    }
    if (st.minutesAfterGood > 0 && st.minutesAfterBad > 0) {
      const d = st.minutesAfterGood - st.minutesAfterBad
      if (Math.abs(d) >= 45) {
        push(
          'sleep-work',
          d > 0 ? 'info' : 'info',
          d > 0 ? 'אחרי לילה טוב אתה עובד יותר' : 'הקשר בין שינה לעבודה הפוך אצלך השבוע',
          d > 0
            ? `בממוצע ${minutesToHM(Math.round(st.minutesAfterGood))} אחרי לילה טוב מול ${minutesToHM(Math.round(st.minutesAfterBad))} אחרי לילה גרוע. ההפרש הוא ${minutesToHM(Math.round(Math.abs(d)))} ליום — שעת שינה היא השקעה בעבודה, לא מס עליה.`
            : `דווקא אחרי לילות פחות טובים נרשמה יותר עבודה. לרוב זה סימן לימים ארוכים שנגמרים מאוחר ומקצרים את הלילה שאחריהם.`,
        )
      }
    }
  }
  if (st.weakestHabit) {
    push('habit', 'warn', `ההרגל שנופל: ${st.weakestHabit}`, 'הרגל שנשבר יותר מפעמיים בשבוע בדרך כלל לא במקום הנכון ביום. שווה להזיז אותו, לא להתאמץ יותר.')
  }
  if (st.wakeAnswered >= 4 && st.wakeOnTime <= st.wakeAnswered / 2) {
    push('wake', 'warn', `קמת בזמן ב-${st.wakeOnTime} מתוך ${st.wakeAnswered} ימים`, 'שעת הקימה היא העוגן שקובע את היום כולו. אם היא זזה, הכל זז אחריה.')
  }

  // ---- 7. אנשים ------------------------------------------------------------
  if (st.missedWeekly.length > 0 && st.totalWeekly > 0) {
    push(
      'weekly',
      st.missedWeekly.length >= st.totalWeekly ? 'warn' : 'info',
      `נשארו פתוחים: ${st.missedWeekly.slice(0, 3).join(' · ')}`,
      'האסימונים הצפים הם מה שלא צועק כשהוא לא קורה, ולכן הם הראשונים להיעלם. הם גם מה שנשאר בסוף.',
    )
  }

  // ---- 8. המטרות של השבוע שנסגר -------------------------------------------
  if (st.goalsTotal > 0) {
    push(
      'goals',
      st.goalsDone === st.goalsTotal ? 'good' : st.goalsDone === 0 ? 'warn' : 'info',
      `${st.goalsDone} מתוך ${st.goalsTotal} מטרות־על הושלמו`,
      st.goalsDone === st.goalsTotal
        ? 'הגדרת נכון ועמדת בזה. השבוע הבא יכול להיות שאפתני יותר.'
        : st.goalsDone === 0
          ? 'אף מטרה לא נסגרה. לרוב זה אומר שהן היו גדולות מדי, ולא שהשבוע היה גרוע.'
          : 'חלק נסגר. שווה לשאול מה הבדיל בין זו שנסגרה לזו שלא.',
    )
  }

  return out
}

/**
 * חבילת נתונים לניתוח מעמיק עם מודל שפה.
 * נוצרת בלחיצה ומועתקת ללוח — שום דבר לא נשלח מהאפליקציה לשום מקום.
 */
export function digestForClaude(
  s: AppState,
  st: WeekStats,
  wl: { review?: { answers: Record<string, string>; score: number }; goals?: Array<{ text: string; done?: boolean }> },
): string {
  const L: string[] = []
  const nameOf = (id: ID) => trackById(s, id)?.name ?? 'ללא מסלול'
  const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`

  L.push('אני רוצה ניתוח מעמיק של השבוע שלי. הנה הנתונים מתוך מערכת ניהול הזמן שלי.')
  L.push('')
  L.push(`## השבוע ${st.ws} עד ${addDays(st.ws, 6)}`)
  L.push(`זמן ריכוז נטו: ${hhmm(st.minutes)} שעות (${round1(st.tokens)} בלוקים של ${s.settings.tokenMinutes} דקות). יעד שבועי: ${st.goalTokens} בלוקים.`)
  if (st.baselineWeeks) L.push(`ממוצע ${st.baselineWeeks} השבועות הקודמים: ${hhmm(st.baselineMinutes)} שעות.`)
  L.push('')
  L.push('### לפי יום (שעות עבודה נטו / קיבולת מתוכננת בבלוקים)')
  for (const d of st.perDay) {
    L.push(`- ${HE_DAYS[parseISO(d.date).getDay()]} ${shortDate(d.date)}: ${round1(d.minutes / 60)} שעות, קיבולת ${d.capacity}`)
  }
  L.push('')
  L.push('### לפי מסלול (השבוע מול ממוצע קודם, בשעות)')
  for (const [id, m] of Object.entries(st.byTrack)) {
    L.push(`- ${nameOf(id)}: ${round1(m / 60)} (ממוצע קודם ${round1((st.baselineByTrack[id] ?? 0) / 60)})`)
  }
  L.push('')
  L.push('### משימות')
  L.push(`נסגרו ${st.tasksDone}, נוצרו ${st.tasksCreated}, פתוחות באיחור ${st.overdue.length}.`)
  if (st.overdue.length) {
    L.push('הכי ותיקות באיחור:')
    for (const t of st.overdue.slice(0, 6)) L.push(`- ${t.title} (${nameOf(t.trackId)}, מ-${t.due})`)
  }
  L.push('')
  L.push('### גוף ושגרה')
  L.push(`הרגלים: ${Math.round(st.habitPct * 100)}%. קימה בזמן: ${st.wakeOnTime} מתוך ${st.wakeAnswered} ימים שדווחו. לילות טובים: ${st.goodNights} מתוך ${st.ratedNights}.`)
  if (st.minutesAfterGood && st.minutesAfterBad) {
    L.push(`ממוצע עבודה אחרי לילה טוב: ${round1(st.minutesAfterGood / 60)} שעות; אחרי לילה גרוע: ${round1(st.minutesAfterBad / 60)} שעות.`)
  }
  if (st.missedWeekly.length) L.push(`פריטים שבועיים שלא קרו: ${st.missedWeekly.join(', ')}.`)
  if (wl.goals?.length) {
    L.push('')
    L.push('### מטרות־העל שהוגדרו לשבוע הזה')
    for (const g of wl.goals) L.push(`- ${g.done ? '✔' : '✘'} ${g.text}`)
  }
  if (wl.review) {
    L.push('')
    L.push(`### מה שכתבתי בסקירה (ציון תחושה: ${wl.review.score}/10)`)
    for (const q of REVIEW_QS) {
      const a = wl.review.answers[q.id]
      if (a && a.trim()) L.push(`**${q.q}**\n${a.trim()}`)
    }
  }
  L.push('')
  L.push('## מה אני מבקש')
  L.push('1. שלוש תובנות שאני כנראה לא רואה בעצמי מהנתונים האלה — לא סיכום של מה שכתוב, אלא מה שנובע ממנו.')
  L.push('2. השערה אחת על הסיבה השורשית לפער הכי גדול בין מה שתכננתי למה שקרה.')
  L.push('3. שני שינויים קונקרטיים לשבוע הבא שאפשר לבצע בלי להוסיף שעות.')
  L.push('4. שאלה אחת קשה שכדאי שאשאל את עצמי.')
  L.push('תענה בעברית, ישיר, בלי מחמאות מיותרות.')
  return L.join('\n')
}

/** מיובא בנפרד כדי לא ליצור תלות מעגלית עם קובץ הזרע */
const REVIEW_QS: Array<{ id: string; q: string }> = [
  { id: 'q3', q: 'מה יצרתי השבוע שלא היה קיים לפניו?' },
  { id: 'q1', q: 'מה נדחה השבוע, ולמה באמת?' },
  { id: 'q4', q: 'מה החסם הבא בפועל, ומתי בדיוק אני מטפל בו?' },
  { id: 'q6', q: 'איך אני מרגיש פיזית ומנטלית?' },
  { id: 'q9', q: 'מה אני מוריד מהצלחת בשבוע הבא?' },
  { id: 'q2', q: 'כמה מהזמן שלי נחת על הנתיב הקריטי?' },
  { id: 'q5', q: 'מה לקח יותר זמן ממה שהערכתי, ולמה?' },
  { id: 'q7', q: 'פיניתי זמן לאנשים שחשובים לי?' },
  { id: 'q10', q: 'מה למדתי השבוע על איך אני עובד?' },
]

/** ההמלצה האחת של השבוע — נגזרת מהתובנה הכי דחופה */
export function headlineAdvice(list: Insight[]): string {
  const bad = list.find((i) => i.tone === 'bad')
  const warn = list.find((i) => i.tone === 'warn')
  const first = bad ?? warn
  if (!first) return 'אין דגל אדום השבוע. תשמור על מה שעובד ותעלה מדרגה במקום אחד בלבד.'
  return first.title
}
