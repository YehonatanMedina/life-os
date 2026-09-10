import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, event, rule, day, week, workout, assertFinite, pin, NOW } from './helpers'
import type { AppState } from '../../../src/types'

let A: typeof import('../../../src/ai')
const SECRET = 'SUPER-SECRET-AI-KEY-xyz'
const TOKEN = 'ghp_SUPERSECRETTOKEN'

beforeEach(async () => {
  pin(NOW)
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('life-os-gh-token', TOKEN)
  localStorage.setItem('life-os-crypt-key', 'CRYPTKEYSECRET')
  A = await import('../../../src/ai')
})
afterEach(() => vi.useRealTimers())

function rich(): AppState {
  return blankState({
    settings: { ...blankState().settings, aiKey: SECRET, name: 'יהונתן' },
    tasks: [
      task({ id: 'open', due: '2026-09-11', est: 2, notes: 'הערה' }),
      task({ id: 'late', due: '2026-09-01' }),
      task({ id: 'doneNow', status: 'done', doneAt: NOW - 3600_000 }),
      task({ id: 'doneOld', status: 'done', doneAt: NOW - 20 * 86400_000 }),
      task({ id: 'gone', deleted: true }),
    ],
    events: [
      event({ id: 'manual', date: '2026-09-15', title: 'ידני' }),
      event({ id: 'r@2026-09-14', date: '2026-09-14', ruleId: 'r', title: 'מופע לא נגוע', updatedAt: 0 }),
      event({ id: 'r@2026-09-16', date: '2026-09-16', ruleId: 'r', title: 'מופע נגוע', touched: true }),
      event({ id: 'far', date: '2027-03-01', title: 'רחוק' }),
      event({ id: 'bd', date: '1999-05-05', yearly: true, kind: 'birthday', title: 'יום הולדת' }),
      event({ id: 'deep', date: '2026-09-11', allDay: false, deep: true, start: '09:00', end: '12:00', title: 'עמוק' }),
      event({ id: 'del', date: '2026-09-11', deleted: true }),
    ],
    rules: [rule({ id: 'r', days: [1, 3] }), rule({ id: 'off', active: false })],
    days: [day({ date: '2026-09-11', habits: { h1: true, h2: false }, wake: 'ontime' })],
    weeks: [week({ weekStart: '2026-09-06', items: { w1: true }, goals: [{ id: 'g', text: 'מטרה' }] })],
    habits: [{ id: 'h1', updatedAt: 1, name: 'בוקר', emoji: '', order: 0, steps: [{ id: 's', text: 'צעד' }] }],
    weekly: [{ id: 'w1', updatedAt: 1, name: 'משפחה', emoji: '', order: 0, kind: 'check' }],
    sessions: [{ id: 's1', updatedAt: 1, startedAt: NOW - 3600_000, endedAt: NOW - 1800_000, minutes: 30, trackId: 'trk-study', label: 'x' }],
    workoutPlan: [{ id: 'wd', updatedAt: 1, dow: 5, title: 'שישי', kind: 'gym', exercises: [{ id: 'ex', name: 'לחיצה', metric: 'weight' }] }],
    workouts: [workout({ date: '2026-09-11', sets: { ex: [{ kg: 60 }] }, finishedAt: NOW })],
    timer: { running: true, startedAt: NOW - 600_000, accumulated: 12.4, trackId: 'trk-study', label: 'טיימר', targetMinutes: 90, lastSeen: NOW },
    news: [{ id: 'n', updatedAt: 1, date: '2026-09-11', votes: { a: { v: 1, headline: 'h', section: 's' } }, note: 'טוב' }],
  })
}

describe('סודות לא דולפים', () => {
  it('aiKey/token/crypt-key לא מופיעים בשום חבילה', () => {
    const s = rich()
    for (const build of [A.buildAtlasContext, A.buildPulse, A.buildWeekDigest]) {
      const txt = JSON.stringify(build(s))
      expect(txt).not.toContain(SECRET)
      expect(txt).not.toContain(TOKEN)
      expect(txt).not.toContain('CRYPTKEYSECRET')
      expect(txt).not.toContain('aiKey')
      expect(txt).not.toContain('deviceId')
    }
    expect(A.aiKey(s)).toBe(SECRET)
    expect(A.aiKey(blankState())).toBe('')
  })
})

describe('buildAtlasContext', () => {
  it('אירועים: רק ידניים או מופעים נגועים, בחלון -7..+60, שנתיים תמיד, מחוקים לא', () => {
    const ctx = A.buildAtlasContext(rich())
    const ids = ctx.events.map((e) => e.id)
    expect(ids).toContain('manual')
    expect(ids).toContain('r@2026-09-16')
    expect(ids).not.toContain('r@2026-09-14')
    expect(ids).not.toContain('far')
    expect(ids).toContain('bd')
    expect(ids).not.toContain('del')
    expect(ctx.events.find((e) => e.id === 'r@2026-09-16')?.fromRule).toBe('r')
    // כללים פעילים בלבד
    expect(ctx.rules.map((r) => r.id)).toEqual(['r'])
  })

  it('משימות: פתוחות תמיד, סגורות רק מ-14 יום; מחוקות לא; שמות מסלולים', () => {
    const ctx = A.buildAtlasContext(rich())
    const ids = ctx.tasks.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['open', 'late', 'doneNow']))
    expect(ids).not.toContain('doneOld')
    expect(ids).not.toContain('gone')
    expect(ctx.tasks.find((t) => t.id === 'open')?.track).toBe('חיים')
    expect(ctx.tracks.map((t) => t.id)).toEqual(['trk-life', 'trk-study'])
  })

  it('ימים/שבועות/אימונים/סטטיסטיקה — טיפוסים ושמות, בלי NaN', () => {
    const ctx = A.buildAtlasContext(rich())
    assertFinite(ctx)
    expect(ctx.days[0].habitsDone).toEqual(['בוקר'])
    expect(ctx.weeks[0].itemsDone).toEqual(['משפחה'])
    expect(ctx.weeks[0].goals).toEqual([{ text: 'מטרה', done: false }])
    expect(ctx.workoutPlan[0].exercises[0].name).toBe('לחיצה')
    expect(ctx.workouts[0].finished).toBe(true)
    expect(ctx.sessions).toHaveLength(1)
    expect(ctx.sessions[0].track).toBe('לימודים')
    expect(ctx.news[0].votes).toBe(1)
    expect(ctx.stats.thisWeek.weekStart).toBe('2026-09-06')
    expect(ctx.stats.lastWeek.weekStart).toBe('2026-08-30')
    expect(ctx.stats.thisWeek.minutes).toBe(30)
    expect(ctx.today).toBe('2026-09-11')
    expect(ctx.settings.name).toBe('יהונתן')
  })

  it('על מצב ריק לחלוטין לא זורק', () => {
    const s = blankState() as any
    delete s.workouts
    delete s.news
    delete s.workoutPlan
    expect(() => A.buildAtlasContext(s)).not.toThrow()
    expect(() => A.buildPulse(s)).not.toThrow()
    expect(() => A.buildWeekDigest(s)).not.toThrow()
    assertFinite(A.buildAtlasContext(s))
  })
})

describe('buildPulse', () => {
  it('כל השדות קיימים ובטיפוס הנכון', () => {
    const p = A.buildPulse(rich())
    assertFinite(p)
    expect(p.today).toBe('2026-09-11')
    expect(typeof p.generatedAt).toBe('string')
    expect(p.wakeTime).toBe('07:30')
    expect(p.bedTime).toBe('23:30')
    expect(p.minutesToday).toBe(30)
    expect(p.sessionsToday).toBe(1)
    expect(p.lastSessionEndedAt).toBe(NOW - 1800_000)
    expect(p.timer).toEqual({ running: true, trackId: 'trk-study', track: 'לימודים', startedAt: NOW - 600_000, accumulated: 12, label: 'טיימר' })
    expect(p.plannedTokensToday).toBe(2)
    expect(p.capacityToday).toBe(6)
    expect(p.deepBlocksToday).toEqual([{ title: 'עמוק', start: '09:00', end: '12:00' }])
    expect(p.habitsDone).toBe(1)
    expect(p.habitsTotal).toBe(1)
    expect(p.wake).toBe('ontime')
    expect(p.tasksOpen).toBe(2) // היום + באיחור
    expect(p.tasksDoneToday).toBe(1)
    expect(p.workoutPlanned).toBe(true) // שישי
    expect(p.workoutDone).toBe(true)
  })

  it('בלי טיימר ובלי סשנים: null ואפסים, לא undefined', () => {
    const p = A.buildPulse(blankState())
    expect(p.timer).toBeNull()
    expect(p.lastSessionEndedAt).toBeNull()
    expect(p.minutesToday).toBe(0)
    expect(p.wake).toBeNull()
    expect(p.workoutPlanned).toBe(false)
    expect(p.workoutDone).toBe(false)
    expect(JSON.stringify(p)).not.toContain('undefined')
  })

  it('tasksDoneToday נספר לפי היום הלוגי המקומי, לא לפי UTC (04:00 בבוקר)', () => {
    // באג מתועד: buildPulse משתמש ב-toISOString (UTC) פחות 3.5 שעות. בישראל (UTC+3)
    // משימה שנסגרה ב-04:00 שייכת ל"היום" (אחרי 03:30) אבל ב-UTC זה 01:00 פחות 3.5 = אתמול.
    const morning = new Date(2026, 8, 11, 4, 0).getTime()
    vi.setSystemTime(morning)
    const s = blankState({ tasks: [task({ id: 'd', status: 'done', doneAt: morning })] })
    expect(A.buildPulse(s).today).toBe('2026-09-11')
    expect(A.buildPulse(s).tasksDoneToday).toBe(1)
  })
})

describe('buildWeekDigest', () => {
  it('שלושה שבועות, באיחור, קרובים — בלי NaN, בשמות מסלולים', () => {
    const s = rich()
    s.events.push(event({ id: 'exam', date: '2026-09-25', kind: 'exam', title: 'מבחן' }))
    s.events.push(event({ id: 'examFar', date: '2026-12-25', kind: 'exam', title: 'רחוק' }))
    const d = A.buildWeekDigest(s)
    assertFinite(d)
    expect(d.weeks.map((w) => w.weekStart)).toEqual(['2026-09-06', '2026-08-30', '2026-08-23'])
    expect(d.weeks[0].minutes).toBe(30)
    expect(d.weeks[0].byTrack).toEqual({ לימודים: 30 })
    expect(d.weeks[0].goals).toEqual([{ text: 'מטרה', done: false }])
    expect(d.overdue.map((o) => o.title)).toEqual(['late'])
    expect(d.upcoming.map((u) => u.title)).toEqual(['מבחן'])
    expect(d.tracks).toEqual(['חיים', 'לימודים'])
    expect(d.settings).toEqual({ tokenMinutes: 90, dailyTokenGoal: 6, weeklyTokenGoal: 42, wakeTime: '07:30', bedTime: '23:30' })
  })
})
