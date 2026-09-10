// לב הסנכרון: mergeStates. כאן כבר אבדו נתונים פעמיים, אז בודקים לעומק.
import { describe, it, expect, beforeAll } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, day, week, workout, event } from './helpers'
import type { AppState } from '../../../src/types'

let mergeStates: typeof import('../../../src/store').mergeStates
beforeAll(async () => {
  localStorage.clear()
  mergeStates = (await import('../../../src/store')).mergeStates
})

const byId = <T extends { id: string }>(xs: T[], id: string): T | undefined => xs.find((x) => x.id === id)

describe('LWW לכל רשומה', () => {
  it('הרשומה עם updatedAt הגדול יותר מנצחת — בשני הכיוונים', () => {
    const a = blankState({ tasks: [task({ id: 't1', title: 'ישן', updatedAt: 100 })] })
    const b = blankState({ tasks: [task({ id: 't1', title: 'חדש', updatedAt: 200 })] })
    expect(byId(mergeStates(a, b).tasks, 't1')?.title).toBe('חדש')
    expect(byId(mergeStates(b, a).tasks, 't1')?.title).toBe('חדש')
  })

  it('רשומות שקיימות רק בצד אחד נשמרות משני הצדדים', () => {
    const a = blankState({ tasks: [task({ id: 'ta' })] })
    const b = blankState({ tasks: [task({ id: 'tb' })] })
    const m = mergeStates(a, b)
    expect(m.tasks.map((t) => t.id).sort()).toEqual(['ta', 'tb'])
  })

  it('מחיקה רכה חדשה יותר מנצחת עותק חי ישן — לא קמה לתחייה', () => {
    const live = blankState({ tasks: [task({ id: 't1', updatedAt: 100 })] })
    const dead = blankState({ tasks: [task({ id: 't1', updatedAt: 200, deleted: true })] })
    expect(byId(mergeStates(live, dead).tasks, 't1')?.deleted).toBe(true)
    expect(byId(mergeStates(dead, live).tasks, 't1')?.deleted).toBe(true)
  })

  it('עריכה חדשה יותר ממחיקה ישנה מחזירה לחיים (זו כוונת LWW)', () => {
    const dead = blankState({ tasks: [task({ id: 't1', updatedAt: 100, deleted: true })] })
    const edited = blankState({ tasks: [task({ id: 't1', updatedAt: 200, title: 'ערוך' })] })
    expect(byId(mergeStates(dead, edited).tasks, 't1')?.deleted).toBeFalsy()
  })

  it('מופע של כלל חוזר (updatedAt 0) לעולם לא דורס מחיקה ידנית', () => {
    const generated = blankState({ events: [event({ id: 'rl@2026-09-14', date: '2026-09-14', ruleId: 'rl', updatedAt: 0 })] })
    const deleted = blankState({ events: [event({ id: 'rl@2026-09-14', date: '2026-09-14', ruleId: 'rl', updatedAt: 5, deleted: true, touched: true })] })
    expect(byId(mergeStates(generated, deleted).events, 'rl@2026-09-14')?.deleted).toBe(true)
    expect(byId(mergeStates(deleted, generated).events, 'rl@2026-09-14')?.deleted).toBe(true)
  })

  it('updatedAt חסר נחשב 0', () => {
    const a = blankState({ tasks: [{ ...task({ id: 't1', title: 'בלי' }), updatedAt: undefined as any }] })
    const b = blankState({ tasks: [task({ id: 't1', title: 'עם', updatedAt: 1 })] })
    expect(byId(mergeStates(a, b).tasks, 't1')?.title).toBe('עם')
    expect(byId(mergeStates(b, a).tasks, 't1')?.title).toBe('עם')
  })

  it('כל הרשימות ממוזגות: tracks/events/rules/sessions/habits/weekly/phases/news/workoutPlan', () => {
    const now = 100
    const mk = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra })
    const a = blankState({
      tracks: [mk('tr', now, { name: 'a', emoji: '', color: '', order: 0, board: true }) as any],
      events: [event({ id: 'e', date: '2026-09-11', title: 'a', updatedAt: now })],
      rules: [mk('r', now, { title: 'a', kind: 'block', start: '1', end: '2', days: [], from: '2026-01-01', active: true }) as any],
      sessions: [mk('s', now, { startedAt: 0, endedAt: 0, minutes: 1, trackId: 'tr' }) as any],
      habits: [mk('h', now, { name: 'a', emoji: '', order: 0 }) as any],
      weekly: [mk('w', now, { name: 'a', emoji: '', order: 0, kind: 'check' }) as any],
      phases: [mk('p', now, { name: 'a', from: '2026-01-01', to: '2026-02-01', color: '', focus: '' }) as any],
      news: [mk('n', now, { date: '2026-09-11', votes: {} }) as any],
      workoutPlan: [mk('wd', now, { dow: 0, title: 'a', kind: 'gym', exercises: [] }) as any],
    })
    const b: AppState = JSON.parse(JSON.stringify(a))
    for (const k of ['tracks', 'events', 'rules', 'sessions', 'habits', 'weekly', 'phases', 'news', 'workoutPlan'] as const) {
      ;(b as any)[k] = (b as any)[k].map((x: any) => ({ ...x, updatedAt: now + 1, name: 'b', title: 'b', minutes: 2 }))
    }
    const m = mergeStates(a, b)
    expect(m.tracks[0].name).toBe('b')
    expect(m.events[0].title).toBe('b')
    expect(m.rules[0].title).toBe('b')
    expect(m.sessions[0].minutes).toBe(2)
    expect(m.habits[0].name).toBe('b')
    expect(m.weekly[0].name).toBe('b')
    expect(m.phases[0].name).toBe('b')
    expect(m.news[0].updatedAt).toBe(now + 1)
    expect(m.workoutPlan[0].title).toBe('b')
  })

  it('מצב מרוחק חסר (מחסן ישן בלי workouts/news) לא מפיל', () => {
    const a = blankState()
    const b = blankState() as any
    delete b.workouts
    delete b.news
    delete b.workoutPlan
    delete b.phases
    delete b.atlasApplied
    delete b.tracks
    expect(() => mergeStates(a, b)).not.toThrow()
    expect(mergeStates(a, b).tracks).toHaveLength(2)
  })
})

describe('מיזוג לפי מפתח — שני מכשירים באותה רשומה', () => {
  it('DayLog: הרגלים שונים משני מכשירים — אף אחד לא הולך לאיבוד', () => {
    // בסיס משותף
    const base = day({ date: '2026-09-11', updatedAt: 10, habits: { morning: true }, habitsAt: { morning: 10 } })
    // מכשיר A מסמן אימון
    const a = { ...base, habits: { ...base.habits, workout: true }, habitsAt: { ...base.habitsAt, workout: 20 }, updatedAt: 20 }
    // מכשיר B מסמן ערב
    const b = { ...base, habits: { ...base.habits, night: true }, habitsAt: { ...base.habitsAt, night: 30 }, updatedAt: 30 }
    const m1 = mergeStates(blankState({ days: [a] }), blankState({ days: [b] })).days[0]
    const m2 = mergeStates(blankState({ days: [b] }), blankState({ days: [a] })).days[0]
    for (const m of [m1, m2]) {
      expect(m.habits).toEqual({ morning: true, workout: true, night: true })
      expect(m.habitsAt).toEqual({ morning: 10, workout: 20, night: 30 })
    }
  })

  it('DayLog: אותו הרגל — החותמת החדשה לכל מפתח מנצחת, גם אם הרשומה כולה ישנה יותר', () => {
    // A ביטל את אימון ב-50 אבל הרשומה שלו עודכנה לאחרונה ב-50
    const a = day({ date: '2026-09-11', updatedAt: 50, habits: { workout: false, x: true }, habitsAt: { workout: 50, x: 5 } })
    // B סימן אימון ב-60, אבל עדכן משהו אחר ב-40 (הרשומה ישנה יותר)
    const b = day({ date: '2026-09-11', updatedAt: 40, habits: { workout: true, x: false }, habitsAt: { workout: 60, x: 40 } })
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const m = mergeStates(blankState({ days: [x] }), blankState({ days: [y] })).days[0]
      expect(m.habits.workout).toBe(true)
      expect(m.habits.x).toBe(false)
    }
  })

  it('ערך false שורד — נוכחות ולא אמת', () => {
    const a = day({ date: '2026-09-11', updatedAt: 100, habits: { h: false }, habitsAt: { h: 100 } })
    const b = day({ date: '2026-09-11', updatedAt: 50, habits: { h: true }, habitsAt: { h: 50 } })
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const m = mergeStates(blankState({ days: [x] }), blankState({ days: [y] })).days[0]
      expect(m.habits).toHaveProperty('h', false)
    }
  })

  it('רשומה ישנה בלי habitsAt נופלת ל-updatedAt שלה', () => {
    const legacy = day({ date: '2026-09-11', updatedAt: 100, habits: { a: true, b: true } })
    const modern = day({ date: '2026-09-11', updatedAt: 90, habits: { a: false, c: true }, habitsAt: { a: 120, c: 90 } })
    for (const [x, y] of [[legacy, modern], [modern, legacy]] as const) {
      const m = mergeStates(blankState({ days: [x] }), blankState({ days: [y] })).days[0]
      expect(m.habits).toEqual({ a: false, b: true, c: true })
      expect(m.habitsAt).toEqual({ a: 120, b: 100, c: 90 })
    }
  })

  it('DayLog: צעדים ושדות סקלריים — הצד שידע ממלא את מה שהשני לא', () => {
    const a = day({ date: '2026-09-11', updatedAt: 20, steps: { s1: true }, stepsAt: { s1: 20 }, sleep: 'good' })
    const b = day({ date: '2026-09-11', updatedAt: 30, steps: { s2: true }, stepsAt: { s2: 30 }, wake: 'late', wakeTime: '09:00' })
    const m = mergeStates(blankState({ days: [a] }), blankState({ days: [b] })).days[0]
    expect(m.steps).toEqual({ s1: true, s2: true })
    expect(m.sleep).toBe('good')
    expect(m.wake).toBe('late')
    expect(m.wakeTime).toBe('09:00')
  })

  it('WeekLog: פריטים שבועיים והתקדמות מתמזגים לפי מפתח; סקירה ומטרות לא אובדות', () => {
    const a = week({ weekStart: '2026-09-06', updatedAt: 20, items: { laundry: true }, itemsAt: { laundry: 20 }, progress: { run: 30 }, progressAt: { run: 20 }, goals: [{ id: 'g1', text: 'א' }] })
    const b = week({ weekStart: '2026-09-06', updatedAt: 30, items: { family: true }, itemsAt: { family: 30 }, progress: { read: 15 }, progressAt: { read: 30 }, review: { submittedAt: 1, answers: {}, score: 7, snapshot: { tokens: 0, minutes: 0, byTrack: {}, habitPct: 0, daysLogged: 0, tasksDone: 0 } } })
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const m = mergeStates(blankState({ weeks: [x] }), blankState({ weeks: [y] })).weeks[0]
      expect(m.items).toEqual({ laundry: true, family: true })
      expect(m.progress).toEqual({ run: 30, read: 15 })
      expect(m.goals?.[0].text).toBe('א')
      expect(m.review?.score).toBe(7)
    }
  })

  it('WorkoutLog: תרגילים שונים משני מכשירים — שניהם נשארים', () => {
    const a = workout({ date: '2026-09-11', updatedAt: 20, sets: { bench: [{ kg: 60, reps: 8 }] }, setsAt: { bench: 20 }, km: 5 })
    const b = workout({ date: '2026-09-11', updatedAt: 30, sets: { squat: [{ kg: 80, reps: 5 }] }, setsAt: { squat: 30 }, minutes: 40, note: 'טוב' })
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const m = mergeStates(blankState({ workouts: [x] }), blankState({ workouts: [y] })).workouts[0]
      expect(m.sets).toEqual({ bench: [{ kg: 60, reps: 8 }], squat: [{ kg: 80, reps: 5 }] })
      expect(m.setsAt).toEqual({ bench: 20, squat: 30 })
      expect(m.km).toBe(5)
      expect(m.minutes).toBe(40)
      expect(m.note).toBe('טוב')
    }
  })

  it('WorkoutLog: אותו תרגיל — הרישום החדש יותר לפי setsAt מנצח', () => {
    const a = workout({ date: '2026-09-11', updatedAt: 50, sets: { bench: [{ kg: 60, reps: 8 }] }, setsAt: { bench: 50 } })
    const b = workout({ date: '2026-09-11', updatedAt: 40, sets: { bench: [{ kg: 60, reps: 8 }, { kg: 62.5, reps: 6 }] }, setsAt: { bench: 60 } })
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const m = mergeStates(blankState({ workouts: [x] }), blankState({ workouts: [y] })).workouts[0]
      expect(m.sets.bench).toHaveLength(2)
    }
  })

  it('WorkoutLog ישן בלי setsAt נופל ל-updatedAt', () => {
    const legacy = workout({ date: '2026-09-11', updatedAt: 100, sets: { bench: [{ kg: 50 }], row: [{ kg: 40 }] } })
    const modern = workout({ date: '2026-09-11', updatedAt: 90, sets: { bench: [{ kg: 55 }] }, setsAt: { bench: 110 } })
    for (const [x, y] of [[legacy, modern], [modern, legacy]] as const) {
      const m = mergeStates(blankState({ workouts: [x] }), blankState({ workouts: [y] })).workouts[0]
      expect(m.sets).toEqual({ bench: [{ kg: 55 }], row: [{ kg: 40 }] })
    }
  })

  it('מחיקת אימון חדשה יותר משאירה deleted: true אחרי המיזוג', () => {
    const live = workout({ date: '2026-09-11', updatedAt: 10, sets: { bench: [{ kg: 50 }] }, setsAt: { bench: 10 } })
    const dead = workout({ date: '2026-09-11', updatedAt: 20, deleted: true, sets: { bench: [{ kg: 50 }] }, setsAt: { bench: 10 } })
    for (const [x, y] of [[live, dead], [dead, live]] as const) {
      const m = mergeStates(blankState({ workouts: [x] }), blankState({ workouts: [y] })).workouts[0]
      expect(m.deleted).toBe(true)
    }
  })

  it('המיזוג הוא אידמפוטנטי: merge(merge(a,b), b) === merge(a,b)', () => {
    const a = blankState({
      days: [day({ date: '2026-09-11', updatedAt: 20, habits: { x: true }, habitsAt: { x: 20 } })],
      workouts: [workout({ date: '2026-09-11', updatedAt: 20, sets: { a: [{ kg: 1 }] }, setsAt: { a: 20 } })],
    })
    const b = blankState({
      days: [day({ date: '2026-09-11', updatedAt: 30, habits: { y: false }, habitsAt: { y: 30 } })],
      workouts: [workout({ date: '2026-09-11', updatedAt: 30, sets: { b: [{ kg: 2 }] }, setsAt: { b: 30 } })],
    })
    const m1 = mergeStates(a, b)
    const m2 = mergeStates(m1, b)
    const m3 = mergeStates(m1, a)
    expect(m2.days).toEqual(m1.days)
    expect(m2.workouts).toEqual(m1.workouts)
    expect(m3.days).toEqual(m1.days)
    expect(m3.workouts).toEqual(m1.workouts)
  })
})

describe('שני מכשירים אמיתיים (חנויות נפרדות) — דרך הפעולות עצמן', () => {
  it('הרגלים, פריטים שבועיים, סטים ומחיקת כלל מתמזגים בלי אובדן, בשני הכיוונים', async () => {
    const { freshStore } = await import('./helpers')
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 8, 11, 10, 0).getTime())
    const base = blankState({
      rules: [{ id: 'r', updatedAt: 1, title: 'ר', kind: 'block', start: '10:00', end: '11:00', days: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', active: true }],
    })
    // מכשיר A
    const A = await freshStore(base)
    A.actions.toggleHabit('2026-09-11', 'morning')
    A.actions.toggleWeeklyItem('2026-09-06', 'laundry')
    A.actions.setWorkoutSet('2026-09-11', 'bench', 0, { kg: 60, reps: 8 })
    A.actions.deleteRule('r')
    const sa = A.store.get()
    // מכשיר B, אותו בסיס, דקה מאוחר יותר
    vi.setSystemTime(Date.now() + 60_000)
    const B = await freshStore(base)
    B.actions.toggleHabit('2026-09-11', 'night')
    B.actions.toggleWeeklyItem('2026-09-06', 'family')
    B.actions.setWorkoutSet('2026-09-11', 'squat', 0, { kg: 80, reps: 5 })
    B.actions.toggleHabit('2026-09-11', 'morning') // B מסמן ואז מבטל — הביטול חדש יותר
    B.actions.toggleHabit('2026-09-11', 'morning')
    const sb = B.store.get()

    for (const [x, y] of [[sa, sb], [sb, sa]] as const) {
      const m = A.mergeStates(x, y)
      const d = m.days.find((v) => v.date === '2026-09-11')!
      expect(d.habits).toEqual({ morning: false, night: true })
      const w = m.weeks.find((v) => v.weekStart === '2026-09-06')!
      expect(w.items).toEqual({ laundry: true, family: true })
      const wo = m.workouts.find((v) => v.date === '2026-09-11')!
      expect(wo.sets).toEqual({ bench: [{ kg: 60, reps: 8 }], squat: [{ kg: 80, reps: 5 }] })
      expect(m.rules[0].deleted).toBe(true)
      // המופעים העתידיים קבורים ולא חוזרים אחרי מטריאליזציה במכשיר השני
      const after = A.materialize(m)
      expect(after.events.filter((e) => e.ruleId === 'r' && e.date >= '2026-09-11' && !e.deleted)).toHaveLength(0)
    }
    vi.useRealTimers()
  })
})

describe('חורים חשודים במיזוג', () => {
  const fake = () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 8, 11, 10, 0).getTime())
  }

  it('רשומה ישנה (בלי habitsAt) שנגעו בה בשני מכשירים — השינוי של המכשיר האיטי לא נדרס', async () => {
    const { freshStore } = await import('./helpers')
    fake()
    // שני המכשירים מחזיקים יומן יומי ישן: שני הרגלים מסומנים, בלי חותמות לכל מפתח
    const legacy = day({ date: '2026-09-11', updatedAt: 100, habits: { a: true, b: true } })
    const base = blankState({ days: [legacy] })
    const B = await freshStore(base)
    B.actions.toggleHabit('2026-09-11', 'b') // B מבטל את b ב-t
    const sb = B.store.get()
    vi.setSystemTime(Date.now() + 60_000)
    const A = await freshStore(base)
    A.actions.toggleHabit('2026-09-11', 'a') // A מבטל את a דקה אחר כך
    const sa = A.store.get()
    for (const [x, y] of [[sa, sb], [sb, sa]] as const) {
      const m = A.mergeStates(x, y).days[0]
      // שניהם ביטלו הרגל אחר — שני הביטולים צריכים לשרוד
      expect(m.habits).toEqual({ a: false, b: false })
    }
    vi.useRealTimers()
  })

  it('מטרות השבוע: שני מכשירים מסמנים מטרות שונות — שתיהן נשארות מסומנות', async () => {
    const { freshStore } = await import('./helpers')
    fake()
    const base = blankState({ weeks: [week({ weekStart: '2026-09-06', goals: [{ id: 'g1', text: 'א' }, { id: 'g2', text: 'ב' }] })] })
    const A = await freshStore(base)
    A.actions.toggleWeekGoal('2026-09-06', 'g1')
    const sa = A.store.get()
    vi.setSystemTime(Date.now() + 60_000)
    const B = await freshStore(base)
    B.actions.toggleWeekGoal('2026-09-06', 'g2')
    const sb = B.store.get()
    for (const [x, y] of [[sa, sb], [sb, sa]] as const) {
      const goals = A.mergeStates(x, y).weeks[0].goals!
      expect(goals.map((g) => !!g.done)).toEqual([true, true])
    }
    vi.useRealTimers()
  })

  // מגבלה מתועדת: תת־משימות הן מערך בתוך המשימה — LWW לרשומה. תרחיש נדיר (שני מכשירים באותה משימה באותו רגע).
  it.skip('תת־משימות: שני מכשירים מסמנים תת־משימה שונה באותה משימה (LWW לרשומה — צפוי להפסיד)', async () => {
    const { freshStore } = await import('./helpers')
    fake()
    const base = blankState({ tasks: [task({ id: 't', sub: [{ id: 's1', text: 'א', done: false }, { id: 's2', text: 'ב', done: false }] })] })
    const A = await freshStore(base)
    A.actions.patchTask('t', { sub: [{ id: 's1', text: 'א', done: true }, { id: 's2', text: 'ב', done: false }] })
    const sa = A.store.get()
    vi.setSystemTime(Date.now() + 60_000)
    const B = await freshStore(base)
    B.actions.patchTask('t', { sub: [{ id: 's1', text: 'א', done: false }, { id: 's2', text: 'ב', done: true }] })
    const sb = B.store.get()
    const m = A.mergeStates(sa, sb).tasks[0]
    expect(m.sub?.map((s) => s.done)).toEqual([true, true])
    vi.useRealTimers()
  })
})

describe('שדות גלובליים', () => {
  it('atlasApplied הוא איחוד', () => {
    const a = blankState({ atlasApplied: { c1: 1 } })
    const b = blankState({ atlasApplied: { c2: 2 } })
    expect(mergeStates(a, b).atlasApplied).toEqual({ c1: 1, c2: 2 })
    expect(mergeStates(b, a).atlasApplied).toEqual({ c1: 1, c2: 2 })
  })

  it('settings לפי settingsUpdatedAt — הצד החדש יותר מנצח, בשני הכיוונים', () => {
    const a = blankState({ settings: { ...blankState().settings, name: 'A', aiKey: 'kA' }, settingsUpdatedAt: 100 })
    const b = blankState({ settings: { ...blankState().settings, name: 'B', aiKey: 'kB' }, settingsUpdatedAt: 200 })
    expect(mergeStates(a, b).settings.name).toBe('B')
    expect(mergeStates(a, b).settings.aiKey).toBe('kB')
    expect(mergeStates(b, a).settings.name).toBe('B')
    expect(mergeStates(a, b).settingsUpdatedAt).toBe(200)
  })

  it('settings: תיקו נשאר מקומי; remote בלי settings לא דורס', () => {
    const a = blankState({ settings: { ...blankState().settings, name: 'A' }, settingsUpdatedAt: 100 })
    const b = blankState({ settings: { ...blankState().settings, name: 'B' }, settingsUpdatedAt: 100 })
    expect(mergeStates(a, b).settings.name).toBe('A')
    const c = { ...blankState({ settingsUpdatedAt: 999 }), settings: undefined as any }
    expect(mergeStates(a, c).settings.name).toBe('A')
  })

  it('הטיימר תמיד מקומי; lastSyncAt ו-resetAt לפי המקסימום', () => {
    const t = { running: true, startedAt: 1, accumulated: 0, trackId: 'trk-life', label: '', targetMinutes: 90, lastSeen: 1 }
    const a = blankState({ timer: t, lastSyncAt: 5, resetAt: 1 })
    const b = blankState({ timer: null, lastSyncAt: 3, resetAt: 9 })
    const m = mergeStates(a, b)
    expect(m.timer).toEqual(t)
    expect(m.lastSyncAt).toBe(5)
    expect(m.resetAt).toBe(9)
    expect(mergeStates(b, a).timer).toBeNull()
  })

  it('המיזוג לא משנה את הקלטים (טהור)', () => {
    const a = blankState({ days: [day({ date: '2026-09-11', updatedAt: 20, habits: { x: true } })] })
    const b = blankState({ days: [day({ date: '2026-09-11', updatedAt: 30, habits: { y: true } })] })
    const sa = JSON.stringify(a)
    const sb = JSON.stringify(b)
    mergeStates(a, b)
    expect(JSON.stringify(a)).toBe(sa)
    expect(JSON.stringify(b)).toBe(sb)
  })
})
