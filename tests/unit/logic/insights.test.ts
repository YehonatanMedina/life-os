import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, day, week, assertFinite, pin, NOW } from './helpers'
import type { AppState, Session } from '../../../src/types'

let I: typeof import('../../../src/insights')
const WS = '2026-09-06' // השבוע של 11.9

beforeEach(async () => {
  pin(NOW)
  vi.resetModules()
  localStorage.clear()
  I = await import('../../../src/insights')
})
afterEach(() => vi.useRealTimers())

const sess = (id: string, trackId: string, minutes: number, endedAt: number): Session => ({
  id, updatedAt: 1, startedAt: endedAt - minutes * 60000, endedAt, minutes, trackId,
})
const at = (d: number, h: number) => new Date(2026, 8, d, h, 0).getTime()

function fullWeek(): AppState {
  const habits = [
    { id: 'h1', updatedAt: 1, name: 'בוקר', emoji: '', order: 0 },
    { id: 'h2', updatedAt: 1, name: 'אימון', emoji: '', order: 1 },
  ]
  const weekly = [
    { id: 'w1', updatedAt: 1, name: 'משפחה', emoji: '', order: 0, kind: 'check' as const },
    { id: 'w2', updatedAt: 1, name: 'חברים', emoji: '', order: 1, kind: 'check' as const },
    { id: 'w3', updatedAt: 1, name: 'מצעים', emoji: '', order: 2, kind: 'check' as const, everyDays: 14, anchorDate: '2026-09-13' },
  ]
  const sessions: Session[] = []
  // שבוע נוכחי: ראשון–חמישי 6–12.9, 3 שעות ביום, ראשון ריק
  for (const d of [7, 8, 9, 10, 11]) sessions.push(sess(`s${d}`, d % 2 ? 'trk-study' : 'trk-life', 180, at(d, 14)))
  // שבועות קודמים (בסיס): 4 שבועות של 600 דקות
  for (let w = 1; w <= 4; w++) sessions.push(sess(`p${w}`, 'trk-study', 600, at(6 - 7 * w + 2, 14)))
  const days = [6, 7, 8, 9, 10, 11].map((d) =>
    day({
      date: `2026-09-${String(d).padStart(2, '0')}`,
      habits: { h1: true, h2: d % 3 === 0 },
      wake: d % 2 ? 'ontime' : 'late',
      sleep: d < 10 ? 'good' : 'bad',
    }),
  )
  return blankState({
    habits,
    weekly,
    sessions,
    days,
    weeks: [week({ weekStart: WS, items: { w1: true }, goals: [{ id: 'g1', text: 'א', done: true }, { id: 'g2', text: 'ב' }] })],
    tasks: [
      task({ id: 'done1', status: 'done', doneAt: at(8, 12), createdAt: at(1, 12) }),
      task({ id: 'new1', createdAt: at(7, 12) }),
      task({ id: 'new2', createdAt: at(7, 13) }),
      task({ id: 'new3', createdAt: at(7, 14) }),
      task({ id: 'new4', createdAt: at(7, 15) }),
      task({ id: 'late1', due: '2026-08-20', createdAt: at(1, 1) }),
      task({ id: 'late2', due: '2026-08-25', createdAt: at(1, 1) }),
      task({ id: 'late3', due: '2026-09-01', createdAt: at(1, 1) }),
    ],
  })
}

describe('buildWeekStats', () => {
  it('שבוע ריק: הכל אפס, בלי NaN, בלי זריקה', () => {
    const st = I.buildWeekStats(blankState(), WS)
    assertFinite(st)
    expect(st.minutes).toBe(0)
    expect(st.tokens).toBe(0)
    expect(st.perDay).toHaveLength(7)
    expect(st.perDay[0].date).toBe(WS)
    expect(st.capacityTokens).toBe(42)
    expect(st.habitPct).toBe(0)
    expect(st.baselineWeeks).toBe(0)
    expect(st.bestDay).toBeUndefined()
    expect(st.zeroDays).toBe(6) // ראשון–שישי כבר עברו (היום שישי)
    expect(st.missedWeekly).toEqual([])
    const ins = I.buildInsights(blankState(), st)
    expect(ins.map((i) => i.id)).toEqual(['none'])
    expect(ins[0].tone).toBe('info')
    expect(I.headlineAdvice(ins)).toContain('אין דגל אדום')
  })

  it('tokenMinutes 0 לא יוצר חלוקה באפס', () => {
    const s = blankState({ settings: { ...blankState().settings, tokenMinutes: 0 }, sessions: [sess('a', 'trk-life', 90, at(8, 12))] })
    const st = I.buildWeekStats(s, WS)
    assertFinite(st)
    expect(st.tokens).toBe(1)
    assertFinite(I.buildInsights(s, st))
  })

  it('שבוע עם סשנים בלבד', () => {
    const s = blankState({ sessions: [sess('a', 'trk-study', 90, at(8, 12)), sess('b', 'trk-study', 90, at(8, 15)), sess('c', 'trk-life', 30, at(12, 1))] })
    const st = I.buildWeekStats(s, WS)
    assertFinite(st)
    expect(st.minutes).toBe(210) // 01:00 בשבת שייך לשישי
    expect(st.tokens).toBeCloseTo(210 / 90)
    expect(st.byTrack).toEqual({ 'trk-study': 180, 'trk-life': 30 })
    expect(st.bestDay).toEqual({ date: '2026-09-08', minutes: 180 })
    expect(st.perDay.find((d) => d.date === '2026-09-11')?.minutes).toBe(30)
    expect(st.zeroDays).toBe(4)
    const ins = I.buildInsights(s, st)
    const ids = ins.map((i) => i.id)
    expect(ids).toContain('goal')
    expect(ins.find((i) => i.id === 'goal')?.tone).toBe('warn')
    expect(ids).toContain('zero')
    expect(ids).toContain('best')
    expect(ids).toContain('focus') // 86% ללימודים
    expect(ids).not.toContain('trend') // אין בסיס
    for (const i of ins) {
      expect(i.title).not.toMatch(/NaN|undefined/)
      expect(i.text).not.toMatch(/NaN|undefined/)
    }
  })

  it('שבוע מלא: כל השדות מחושבים, כל התובנות עקביות', () => {
    const s = fullWeek()
    const st = I.buildWeekStats(s, WS)
    assertFinite(st)
    expect(st.minutes).toBe(900)
    expect(st.baselineWeeks).toBe(4)
    expect(st.baselineMinutes).toBe(600)
    expect(st.prevMinutes).toBe(600)
    expect(st.tasksDone).toBe(1)
    expect(st.tasksCreated).toBe(4)
    expect(st.overdue.map((t) => t.id)).toEqual(['late1', 'late2', 'late3'])
    expect(st.oldestOverdueDays).toBe(22)
    expect(st.habitPct).toBeCloseTo((1 + 2 / 6) / 2) // h1 תמיד, h2 ב-6 ו-9
    expect(st.weakestHabit).toBe('אימון')
    expect(st.wakeAnswered).toBe(6)
    expect(st.wakeOnTime).toBe(3)
    expect(st.ratedNights).toBe(6)
    expect(st.goodNights).toBe(4)
    expect(st.minutesAfterGood).toBeCloseTo((0 + 180 + 180 + 180) / 4)
    expect(st.minutesAfterBad).toBe(180)
    expect(st.missedWeekly).toEqual(['חברים']) // מצעים לא בשבוע הזה (העוגן 13.9)
    expect(st.doneWeekly).toBe(1)
    expect(st.totalWeekly).toBe(2)
    expect(st.goalsDone).toBe(1)
    expect(st.goalsTotal).toBe(2)
    expect(st.daysAtGoal).toBe(0)
    expect(st.zeroDays).toBe(1)
    expect(st.bestDay?.minutes).toBe(180)

    const ins = I.buildInsights(s, st)
    assertFinite(ins)
    const by = Object.fromEntries(ins.map((i) => [i.id, i]))
    expect(by.goal.tone).toBe('warn') // 10 מתוך 42
    expect(by.trend.tone).toBe('good') // +50%
    expect(by.trend.title).toContain('50%')
    expect(by.inflow.tone).toBe('warn') // 4 נכנסו, 1 נסגרה
    expect(by.debt.tone).toBe('bad') // 22 יום
    expect(by.debt.text).toContain('late1')
    expect(by.habit.title).toContain('אימון')
    expect(by.wake.tone).toBe('warn')
    expect(by.weekly.title).toContain('חברים')
    expect(by.goals.tone).toBe('info')
    expect(by.best).toBeDefined()
    expect(I.headlineAdvice(ins)).toBe(by.debt.title)
    for (const i of ins) expect(i.text + i.title).not.toMatch(/NaN|undefined|null/)
    expect(new Set(ins.map((i) => i.id)).size).toBe(ins.length)
  })

  it('digestForClaude מייצר טקסט בלי NaN/undefined', () => {
    const s = fullWeek()
    const st = I.buildWeekStats(s, WS)
    const wl = s.weeks[0]
    const txt = I.digestForClaude(s, st, { goals: wl.goals, review: { answers: { q3: 'יצרתי' }, score: 6 } })
    expect(txt).toContain('יצרתי')
    expect(txt).toContain('✔ א')
    expect(txt).not.toMatch(/NaN|undefined/)
    const empty = I.digestForClaude(blankState(), I.buildWeekStats(blankState(), WS), {})
    expect(empty).not.toMatch(/NaN|undefined/)
  })

  it('שבוע שעדיין לא התחיל (עתידי) — אין ימים שעברו, אין ציונים', () => {
    const st = I.buildWeekStats(fullWeek(), '2026-09-20')
    assertFinite(st)
    expect(st.zeroDays).toBe(0)
    expect(st.wakeAnswered).toBe(0)
    expect(st.habitPct).toBe(0)
  })

  it('שינה: 3 לילות גרועים → bad; קשר שינה–עבודה מדווח רק עם 45 דקות הפרש', () => {
    const s = blankState({
      days: [6, 7, 8, 9, 10].map((d) => day({ date: `2026-09-0${d}`.replace('-010', '-10'), sleep: d <= 8 ? 'bad' : 'good' })),
      sessions: [sess('a', 'trk-life', 200, at(9, 12)), sess('b', 'trk-life', 200, at(10, 12)), sess('c', 'trk-life', 30, at(7, 12))],
    })
    const st = I.buildWeekStats(s, WS)
    expect(st.ratedNights).toBe(5)
    expect(st.goodNights).toBe(2)
    const by = Object.fromEntries(I.buildInsights(s, st).map((i) => [i.id, i]))
    expect(by.sleep.tone).toBe('bad')
    expect(by['sleep-work'].title).toContain('אחרי לילה טוב')
  })

  it('taskCreatedAt: createdAt, ואם אין — מהמזהה, ואם אין — updatedAt', () => {
    const t0 = new Date(2026, 8, 1, 12).getTime()
    expect(I.taskCreatedAt(task({ id: 'x', createdAt: 5, updatedAt: 9 }))).toBe(5)
    expect(I.taskCreatedAt(task({ id: `t-${t0.toString(36)}abc`, updatedAt: 9 }))).toBe(t0)
    expect(I.taskCreatedAt(task({ id: 'seed-1', updatedAt: 9 }))).toBe(9)
    expect(I.taskCreatedAt(task({ id: 't-zzzzzzzz', updatedAt: 9 }))).toBe(9) // מהעתיד — לא מקובל
  })
})
