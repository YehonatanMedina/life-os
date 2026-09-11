// כל פעולה מיוצאת של החנות — עם זמן מוצמד ומכשיר טרי לכל בדיקה
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, freshStore, task, event, rule, day, week, workout, pin, tick, NOW, KEY, type StoreModule } from './helpers'
import type { AppState } from '../../../src/types'

let S: StoreModule
const get = () => S.store.get()

beforeEach(async () => {
  pin(NOW) // שישי 11.9.2026 10:00
  S = await freshStore()
})
afterEach(() => vi.useRealTimers())

// ---------------------------------------------------------------------------
describe('משימות', () => {
  it('addTask: ברירות מחדל, מזהה ייחודי, createdAt, מסלול ברירת מחדל "חיים"', () => {
    const t = S.actions.addTask({ title: 'א' })
    expect(t.id).toMatch(/^t-/)
    expect(t.status).toBe('todo')
    expect(t.trackId).toBe('trk-life')
    expect(t.createdAt).toBe(NOW)
    expect(t.updatedAt).toBe(NOW)
    expect(t.order).toBe(0)
    const t2 = S.actions.addTask({ title: 'ב', id: '' as any, trackId: 'trk-study', est: 2, due: undefined })
    expect(t2.id).toMatch(/^t-/)
    expect(t2.id).not.toBe(t.id)
    expect(t2.order).toBe(1)
    expect(t2.trackId).toBe('trk-study')
    expect('due' in t2).toBe(false) // undefined לא דורס ברירת מחדל
    expect(get().tasks).toHaveLength(2)
  })

  it('patchTask מעדכן רק את המשימה ומחתים', () => {
    const a = S.actions.addTask({ title: 'א' })
    const b = S.actions.addTask({ title: 'ב' })
    tick(5000)
    S.actions.patchTask(a.id, { title: 'א2', due: '2026-09-20' })
    const s = get()
    expect(s.tasks.find((t) => t.id === a.id)).toMatchObject({ title: 'א2', due: '2026-09-20', updatedAt: NOW + 5000 })
    expect(s.tasks.find((t) => t.id === b.id)?.updatedAt).toBe(NOW)
  })

  it('toggleTaskDone הלוך ושוב — doneAt נקבע ומתאפס, due לא נוגעים', () => {
    const a = S.actions.addTask({ title: 'א', due: '2026-09-01' })
    tick(1000)
    S.actions.toggleTaskDone(a.id)
    let t = get().tasks[0]
    expect(t.status).toBe('done')
    expect(t.doneAt).toBe(NOW + 1000)
    tick(1000)
    S.actions.toggleTaskDone(a.id)
    t = get().tasks[0]
    expect(t.status).toBe('todo')
    expect(t.doneAt).toBeUndefined()
    expect(t.due).toBe('2026-09-01')
  })

  it('deleteTask רך + restoreTask', () => {
    const a = S.actions.addTask({ title: 'א' })
    S.actions.deleteTask(a.id)
    expect(get().tasks[0].deleted).toBe(true)
    expect(S.alive(get().tasks)).toHaveLength(0)
    S.actions.restoreTask(a.id)
    expect(get().tasks[0].deleted).toBe(false)
    expect(S.alive(get().tasks)).toHaveLength(1)
  })

  it('putTask מכניס עם מזהה נתון, ומחליף אם קיים (בלי כפילות)', () => {
    S.actions.putTask({ id: 't-cmd1', title: 'א', trackId: '', status: 'todo' })
    expect(get().tasks).toHaveLength(1)
    expect(get().tasks[0]).toMatchObject({ id: 't-cmd1', trackId: 'trk-life', order: 0, createdAt: NOW })
    S.actions.putTask({ id: 't-cmd1', title: 'ב', trackId: 'trk-study', status: 'doing' })
    expect(get().tasks).toHaveLength(1)
    expect(get().tasks[0]).toMatchObject({ title: 'ב', trackId: 'trk-study', status: 'doing' })
  })

  it('nextOrder מתעלם ממחוקים', () => {
    expect(S.nextOrder([{ order: 5, deleted: true }, { order: 2 }])).toBe(3)
    expect(S.nextOrder([])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('אירועים', () => {
  it('addEvent/addEvents: touched, מזהה ייחודי, ברירות מחדל', () => {
    const e = S.actions.addEvent({ title: 'א', date: '2026-09-20', id: '' as any })
    expect(e.id).toMatch(/^e-/)
    expect(e.touched).toBe(true)
    expect(e.allDay).toBe(false)
    expect(e.kind).toBe('personal')
    S.actions.addEvents([])
    expect(get().events).toHaveLength(1)
    S.actions.addEvents([{ title: 'ב', date: '2026-09-21' }, { title: 'ג', date: '2026-09-22', kind: 'exam' }])
    const evs = get().events
    expect(evs).toHaveLength(3)
    expect(new Set(evs.map((x) => x.id)).size).toBe(3)
    expect(evs[2].kind).toBe('exam')
  })

  it('patchEvent מסמן touched; deleteEvent רך + touched', () => {
    const e = S.actions.addEvent({ title: 'א', date: '2026-09-20' })
    S.actions.patchEvent(e.id, { title: 'ב' })
    expect(get().events[0]).toMatchObject({ title: 'ב', touched: true })
    S.actions.deleteEvent(e.id)
    expect(get().events[0]).toMatchObject({ deleted: true, touched: true })
    expect(S.eventsOn(get(), '2026-09-20')).toHaveLength(0)
  })

  it('putEvent מחליף לפי מזהה', () => {
    S.actions.putEvent({ id: 'e-c1', title: 'א', date: '2026-09-20', allDay: true, kind: 'personal' })
    S.actions.putEvent({ id: 'e-c1', title: 'ב', date: '2026-09-21', allDay: true, kind: 'personal' })
    expect(get().events).toHaveLength(1)
    expect(get().events[0]).toMatchObject({ title: 'ב', date: '2026-09-21' })
  })
})

// ---------------------------------------------------------------------------
describe('כללי חזרה', () => {
  it('ruleMatches שבועי וחודשי, כולל 31 שנחתך לחודש קצר', () => {
    const weekly = rule({ id: 'w', days: [0, 2] })
    expect(S.ruleMatches(weekly, '2026-09-13')).toBe(true) // ראשון
    expect(S.ruleMatches(weekly, '2026-09-15')).toBe(true) // שלישי
    expect(S.ruleMatches(weekly, '2026-09-14')).toBe(false)
    const m31 = rule({ id: 'm', freq: 'monthly', monthDay: 31, days: [] })
    expect(S.ruleMatches(m31, '2026-10-31')).toBe(true)
    expect(S.ruleMatches(m31, '2026-09-30')).toBe(true) // ספטמבר קצר
    expect(S.ruleMatches(m31, '2026-09-29')).toBe(false)
    expect(S.ruleMatches(m31, '2027-02-28')).toBe(true)
    expect(S.ruleMatches(m31, '2028-02-29')).toBe(true)
    expect(S.ruleMatches(m31, '2028-02-28')).toBe(false)
    const mDefault = rule({ id: 'm2', freq: 'monthly', days: [], from: '2026-01-15' })
    expect(S.ruleMatches(mDefault, '2026-09-15')).toBe(true)
    expect(S.ruleMatches(mDefault, '2026-09-14')).toBe(false)
  })

  it('upsertRule שבועי: מייצר מופעים מהיום עד האופק (120 יום), מזהה rule@date', () => {
    S.actions.upsertRule(rule({ id: 'r1', days: [1], from: '2026-01-01' }))
    const evs = get().events.filter((e) => e.ruleId === 'r1')
    expect(evs.length).toBeGreaterThan(15)
    expect(evs.every((e) => new Date(e.date + 'T12:00').getDay() === 1)).toBe(true)
    expect(evs.every((e) => e.date >= '2026-09-11')).toBe(true)
    expect(evs.every((e) => e.date <= '2027-01-09')).toBe(true)
    expect(evs.some((e) => e.date > '2027-01-09')).toBe(false)
    expect(evs[0].id).toBe(`r1@${evs[0].date}`)
    expect(evs[0]).toMatchObject({ start: '10:00', end: '11:00', kind: 'block', allDay: false, updatedAt: NOW })
    expect(get().rules[0].id).toBe('r1')
  })

  it('upsertRule חודשי עם monthDay 31: מופע בכל חודש, בחודש קצר ביום האחרון', () => {
    S.actions.upsertRule(rule({ id: 'm', freq: 'monthly', monthDay: 31, days: [], from: '2026-01-01' }))
    const dates = get().events.filter((e) => e.ruleId === 'm').map((e) => e.date).sort()
    expect(dates).toEqual(['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31'])
  })

  it('upsertRule עם until — לא מעבר לו; רשומה לא פעילה — בלי מופעים', () => {
    S.actions.upsertRule(rule({ id: 'r', days: [0, 1, 2, 3, 4, 5, 6], until: '2026-09-15' }))
    const dates = get().events.filter((e) => e.ruleId === 'r').map((e) => e.date).sort()
    expect(dates).toEqual(['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'])
    S.actions.upsertRule(rule({ id: 'off', days: [0, 1, 2, 3, 4, 5, 6], active: false }))
    expect(get().events.filter((e) => e.ruleId === 'off')).toHaveLength(0)
  })

  it('עריכת כלל: מופעים שלא נגעו בהם מתרעננים, מופעים שנגעו בהם נשארים, ימים שירדו נקברים (לא נמחקים)', () => {
    S.actions.upsertRule(rule({ id: 'r', days: [1, 3], title: 'ישן' }))
    const mon = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-14')!
    const wed = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-16')!
    S.actions.patchEvent(wed.id, { start: '15:00' }) // touched
    tick(1000)
    S.actions.upsertRule(rule({ id: 'r', days: [1], title: 'חדש', start: '12:00' }))
    const s = get()
    const mon2 = s.events.find((e) => e.id === mon.id)!
    const wed2 = s.events.find((e) => e.id === wed.id)!
    expect(mon2).toMatchObject({ title: 'חדש', start: '12:00', deleted: false, updatedAt: NOW + 1000 })
    expect(wed2).toMatchObject({ title: 'ישן', start: '15:00', touched: true })
    expect(wed2.deleted).toBeFalsy()
    // רביעי אחר, שלא נגעו בו — נקבר עם חותמת, לא הוסר מהרשימה
    const wed3 = s.events.find((e) => e.ruleId === 'r' && e.date === '2026-09-23')!
    expect(wed3).toMatchObject({ deleted: true, updatedAt: NOW + 1000 })
    expect(s.events.filter((e) => e.ruleId === 'r' && e.date === '2026-09-14')).toHaveLength(1) // בלי כפילות
  })

  it('מופע שנמחק ידנית לא חוזר לחיים בעריכת הכלל, ולא במטריאליזציה בטעינה', async () => {
    S.actions.upsertRule(rule({ id: 'r', days: [1] }))
    const mon = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-14')!
    S.actions.deleteEvent(mon.id)
    tick(1000)
    S.actions.upsertRule(rule({ id: 'r', days: [1], title: 'עריכה' }))
    expect(get().events.find((e) => e.id === mon.id)?.deleted).toBe(true)
    // טעינה מחדש
    const st = await freshStore(get())
    expect(st.store.get().events.filter((e) => e.id === mon.id)).toHaveLength(1)
    expect(st.store.get().events.find((e) => e.id === mon.id)?.deleted).toBe(true)
  })

  it('stopRule: מכבה, קובר עתידיים לא־נגועים, משאיר נגועים ועבר', async () => {
    S = await freshStore(blankState({ rules: [rule({ id: 'r', days: [0, 1, 2, 3, 4, 5, 6] })] }))
    // materialize בטעינה יצר מופעים מ-14 יום אחורה
    const past = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-05')!
    expect(past).toBeDefined()
    const fut = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-20')!
    S.actions.patchEvent(fut.id, { title: 'הוזז' })
    S.actions.stopRule('r', '2026-09-11')
    const s = get()
    expect(s.rules[0].active).toBe(false)
    expect(s.rules[0].deleted).toBeFalsy()
    expect(s.events.find((e) => e.id === past.id)?.deleted).toBeFalsy()
    expect(s.events.find((e) => e.id === fut.id)?.deleted).toBeFalsy()
    const others = s.events.filter((e) => e.ruleId === 'r' && e.date >= '2026-09-11' && e.id !== fut.id)
    expect(others.length).toBeGreaterThan(100)
    expect(others.every((e) => e.deleted)).toBe(true)
    // טעינה מחדש לא מחזירה אותם (הכלל כבוי)
    const st = await freshStore(s)
    expect(st.store.get().events.filter((e) => e.ruleId === 'r' && e.date >= '2026-09-11' && !e.deleted).map((e) => e.id)).toEqual([fut.id])
  })

  it('deleteRule: מחיקה רכה של הכלל, קבורת העתידיים, שמירת הנגועים', async () => {
    S = await freshStore(blankState({ rules: [rule({ id: 'r', days: [0, 1, 2, 3, 4, 5, 6] })] }))
    const fut = get().events.find((e) => e.ruleId === 'r' && e.date === '2026-09-20')!
    S.actions.patchEvent(fut.id, { title: 'הוזז' })
    S.actions.deleteRule('r')
    const s = get()
    expect(s.rules[0]).toMatchObject({ deleted: true, active: false })
    expect(s.events.find((e) => e.id === fut.id)?.deleted).toBeFalsy()
    expect(s.events.filter((e) => e.ruleId === 'r' && e.date >= '2026-09-11' && e.id !== fut.id).every((e) => e.deleted)).toBe(true)
    const st = await freshStore(s)
    expect(st.store.get().rules[0].deleted).toBe(true)
    expect(st.store.get().events.filter((e) => e.ruleId === 'r' && !e.deleted && e.date >= '2026-09-11')).toHaveLength(1)
  })

  it('materialize: אופק 120 יום, 14 יום אחורה, בלי כפילויות בטעינה חוזרת, גיזום מעבר ל-60 יום', async () => {
    S = await freshStore(blankState({ rules: [rule({ id: 'r', days: [0, 1, 2, 3, 4, 5, 6] })], events: [
      event({ id: 'r@2026-06-01', date: '2026-06-01', ruleId: 'r', updatedAt: 0 }),
      event({ id: 'r@2026-06-02', date: '2026-06-02', ruleId: 'r', touched: true, updatedAt: 5 }),
    ] }))
    let s = get()
    const mine = s.events.filter((e) => e.ruleId === 'r')
    const dates = mine.map((e) => e.date).sort()
    expect(dates[0]).toBe('2026-06-02') // הנגוע נשאר, הישן נגזם
    expect(mine.find((e) => e.date === '2026-06-01')).toBeUndefined()
    expect(dates[1]).toBe('2026-08-28') // 14 יום אחורה
    expect(dates[dates.length - 1]).toBe('2027-01-09') // 120 יום קדימה
    expect(s.materializedTo).toBe('2027-01-09')
    const n = s.events.length
    const st = await freshStore(s)
    s = st.store.get()
    expect(s.events).toHaveLength(n)
    expect(new Set(s.events.map((e) => e.id)).size).toBe(n)
    // materialize על מצב מעודכן מחזיר את אותו אובייקט (בלי כתיבה מיותרת)
    expect(st.materialize(s)).toBe(s)
  })

  it('materialize: בלוק deep לא נוצר בחג רק כשהמתג דלוק', async () => {
    const base = blankState({
      rules: [rule({ id: 'deep', days: [0, 1, 2, 3, 4, 5, 6], deep: true }), rule({ id: 'pers', days: [0, 1, 2, 3, 4, 5, 6] })],
      events: [event({ id: 'h', date: '2026-09-20', kind: 'holiday' }), event({ id: 'eve', date: '2026-09-19', kind: 'holiday', eve: true })],
    })
    let st = await freshStore(base)
    expect(st.store.get().events.some((e) => e.id === 'deep@2026-09-20')).toBe(true)
    st = await freshStore({ ...base, settings: { ...base.settings, easyHoliday: true } })
    const s = st.store.get()
    expect(s.events.some((e) => e.id === 'deep@2026-09-20')).toBe(false)
    expect(s.events.some((e) => e.id === 'deep@2026-09-19')).toBe(true) // ערב חג נשאר
    expect(s.events.some((e) => e.id === 'pers@2026-09-20')).toBe(true) // אישי נשאר
  })
})

// ---------------------------------------------------------------------------
describe('הרגלים, צעדים, פריטים שבועיים', () => {
  it('toggleHabit: ערך + חותמת לכל מפתח, מזהה day-<date>', () => {
    S.actions.toggleHabit('2026-09-11', 'hb-a')
    tick(1000)
    S.actions.toggleHabit('2026-09-11', 'hb-b')
    let d = get().days[0]
    expect(d.id).toBe('day-2026-09-11')
    expect(d.habits).toEqual({ 'hb-a': true, 'hb-b': true })
    expect(d.habitsAt).toEqual({ 'hb-a': NOW, 'hb-b': NOW + 1000 })
    expect(d.updatedAt).toBe(NOW + 1000)
    tick(1000)
    S.actions.toggleHabit('2026-09-11', 'hb-a')
    d = get().days[0]
    expect(d.habits).toEqual({ 'hb-a': false, 'hb-b': true })
    expect(d.habitsAt['hb-a']).toBe(NOW + 2000)
    expect(d.habitsAt['hb-b']).toBe(NOW + 1000) // לא נגעו
    expect(get().days).toHaveLength(1)
  })

  it('toggleStep עם stepsAt; patchDay יוצר ומעדכן', () => {
    S.actions.toggleStep('2026-09-11', 's1')
    expect(get().days[0].steps).toEqual({ s1: true })
    expect(get().days[0].stepsAt).toEqual({ s1: NOW })
    S.actions.patchDay('2026-09-11', { wake: 'ontime', sleep: 'good' })
    expect(get().days[0]).toMatchObject({ wake: 'ontime', sleep: 'good', steps: { s1: true } })
    S.actions.patchDay('2026-09-12', { nap: true })
    expect(get().days).toHaveLength(2)
    expect(S.dayLog(get(), '2026-09-12').nap).toBe(true)
    expect(S.dayLog(get(), '2026-09-13')).toMatchObject({ id: 'day-2026-09-13', wake: null, habits: {} })
  })

  it('toggleWeeklyItem / addWeeklyProgress עם חותמות; התקדמות לא יורדת מתחת ל-0', () => {
    S.actions.toggleWeeklyItem('2026-09-06', 'wk-a')
    let w = get().weeks[0]
    expect(w.id).toBe('wk-2026-09-06')
    expect(w.items).toEqual({ 'wk-a': true })
    expect(w.itemsAt).toEqual({ 'wk-a': NOW })
    tick(1000)
    expect(S.actions.addWeeklyProgress('2026-09-06', 'wk-p', 30)).toBe(30)
    expect(S.actions.addWeeklyProgress('2026-09-06', 'wk-p', -50)).toBe(-30)
    w = get().weeks[0]
    expect(w.progress).toEqual({ 'wk-p': 0 })
    expect(w.progressAt).toEqual({ 'wk-p': NOW + 1000 })
    expect(w.items).toEqual({ 'wk-a': true })
    expect(get().weeks).toHaveLength(1)
  })

  it('habitPct: לפי הרגלים חיים בלבד', async () => {
    S = await freshStore(blankState({ habits: [
      { id: 'h1', updatedAt: 1, name: 'א', emoji: '', order: 0 },
      { id: 'h2', updatedAt: 1, name: 'ב', emoji: '', order: 1 },
      { id: 'h3', updatedAt: 1, name: 'ג', emoji: '', order: 2, deleted: true },
    ] }))
    S.actions.toggleHabit('2026-09-11', 'h1')
    S.actions.toggleHabit('2026-09-11', 'h3')
    expect(S.habitPct(get(), '2026-09-11')).toBe(0.5)
    expect(S.habitPct(blankState(), '2026-09-11')).toBe(0)
  })

  it('periodicDue: כל 14 יום — שבוע כן, שבוע לא; לפני העוגן — לא', () => {
    const def = { everyDays: 14, anchorDate: '2026-09-06' }
    expect(S.periodicDue(def, '2026-09-06')).toBe(true)
    expect(S.periodicDue(def, '2026-09-13')).toBe(false)
    expect(S.periodicDue(def, '2026-09-20')).toBe(true)
    expect(S.periodicDue(def, '2026-08-30')).toBe(false)
    expect(S.periodicDue({ everyDays: 7 }, '2026-09-06')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('אימונים', () => {
  it('setWorkoutSet: יוצר יומן w-<date>, מרפד עד האינדקס, חותמת לתרגיל בלבד; null מוחק', () => {
    S.actions.setWorkoutSet('2026-09-11', 'bench', 0, { kg: 60, reps: 8 })
    tick(1000)
    S.actions.setWorkoutSet('2026-09-11', 'bench', 2, { kg: 65, reps: 6 })
    tick(1000)
    S.actions.setWorkoutSet('2026-09-11', 'squat', 0, { kg: 80, reps: 5 })
    let w = get().workouts[0]
    expect(w.id).toBe('w-2026-09-11')
    expect(w.sets.bench).toEqual([{ kg: 60, reps: 8 }, {}, { kg: 65, reps: 6 }])
    expect(w.sets.squat).toEqual([{ kg: 80, reps: 5 }])
    expect(w.setsAt).toEqual({ bench: NOW + 1000, squat: NOW + 2000 })
    S.actions.setWorkoutSet('2026-09-11', 'bench', 1, null)
    w = get().workouts[0]
    expect(w.sets.bench).toEqual([{ kg: 60, reps: 8 }, { kg: 65, reps: 6 }])
    expect(w.setsAt.bench).toBe(NOW + 2000)
    expect(get().workouts).toHaveLength(1)
    expect(S.workoutHasData(w)).toBe(true)
    expect(S.workoutOn(get(), '2026-09-11')).toBe(w)
  })

  it('patchWorkout / deleteWorkout; אחרי מחיקה — patch יוצר רשומה חדשה עם אותו מזהה ומחליף את המחוקה', () => {
    S.actions.patchWorkout('2026-09-11', { km: 5, minutes: 30, kind: 'run' })
    expect(get().workouts[0]).toMatchObject({ km: 5, minutes: 30, kind: 'run' })
    S.actions.deleteWorkout('2026-09-11')
    expect(get().workouts[0].deleted).toBe(true)
    expect(S.workoutOn(get(), '2026-09-11')).toBeUndefined()
    S.actions.patchWorkout('2026-09-11', { km: 1 })
    expect(get().workouts).toHaveLength(1)
    expect(get().workouts[0].deleted).toBeFalsy()
    expect(get().workouts[0].km).toBe(1)
    expect(get().workouts[0].minutes).toBeUndefined()
  })

  it('תוכנית: upsertWorkoutDay/addExercise/patchExercise/moveExercise/deleteExercise/deleteWorkoutDay', () => {
    S.actions.upsertWorkoutDay({ id: 'wd1', updatedAt: 0, dow: 1, title: 'רגליים', kind: 'gym', exercises: [] })
    const a = S.actions.addExercise('wd1', 'סקוואט')
    const b = S.actions.addExercise('wd1', 'לאנג׳', { metric: 'bodyweight', sets: 4 })
    let d = get().workoutPlan[0]
    expect(d.exercises.map((x) => x.name)).toEqual(['סקוואט', 'לאנג׳'])
    expect(d.exercises[0]).toMatchObject({ sets: 3, reps: '10', metric: 'weight' })
    expect(d.exercises[1]).toMatchObject({ sets: 4, metric: 'bodyweight' })
    S.actions.patchExercise('wd1', a, { reps: '5' })
    S.actions.moveExercise('wd1', b, -1)
    d = get().workoutPlan[0]
    expect(d.exercises.map((x) => x.id)).toEqual([b, a])
    expect(d.exercises[1].reps).toBe('5')
    S.actions.moveExercise('wd1', b, -1) // כבר ראשון — לא זז ולא נשבר
    expect(get().workoutPlan[0].exercises[0].id).toBe(b)
    S.actions.deleteExercise('wd1', a)
    expect(get().workoutPlan[0].exercises).toHaveLength(1)
    expect(S.planForDow(get(), 1)?.id).toBe('wd1')
    S.actions.deleteWorkoutDay('wd1')
    expect(S.planForDow(get(), 1)).toBeUndefined()
  })

  it('bestSet/exerciseHistory/lastSetsOf', async () => {
    S = await freshStore(blankState({ workouts: [
      workout({ date: '2026-09-01', sets: { b: [{ kg: 50, reps: 10 }, { kg: 55, reps: 5 }] } }),
      workout({ date: '2026-09-08', sets: { b: [{ kg: 55, reps: 8 }, {}] } }),
      workout({ date: '2026-09-10', sets: { b: [{ kg: 60, reps: 8 }] }, deleted: true }),
      workout({ date: '2026-09-11', sets: { b: [{}] } }),
    ] }))
    expect(S.bestSet([{ kg: 50, reps: 10 }, { kg: 55, reps: 5 }], 'weight')).toEqual({ kg: 55, reps: 5 })
    expect(S.bestSet([{ sec: 30 }, { sec: 45 }], 'time')).toEqual({ sec: 45 })
    expect(S.bestSet([], 'weight')).toBeUndefined()
    expect(S.bestSet([{ kg: 0, reps: 10 }, { kg: 0, reps: 8 }], 'bodyweight')).toEqual({ kg: 0, reps: 10 })
    expect(S.exerciseHistory(get(), 'b').map((h) => h.date)).toEqual(['2026-09-01', '2026-09-08'])
    expect(S.exerciseHistory(get(), 'b')[1].sets).toEqual([{ kg: 55, reps: 8 }])
    expect(S.lastSetsOf(get(), 'b', '2026-09-11')?.date).toBe('2026-09-08')
    expect(S.lastSetsOf(get(), 'b', '2026-09-01')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
describe('מטרות השבוע', () => {
  it('setWeekGoals + toggleWeekGoal', () => {
    S.actions.setWeekGoals('2026-09-06', [{ id: 'g1', text: 'א' }, { id: 'g2', text: 'ב' }])
    S.actions.toggleWeekGoal('2026-09-06', 'g1')
    let w = S.weekLog(get(), '2026-09-06')
    expect(w.goals).toEqual([{ id: 'g1', text: 'א', done: true }, { id: 'g2', text: 'ב' }])
    S.actions.toggleWeekGoal('2026-09-06', 'g1')
    w = S.weekLog(get(), '2026-09-06')
    expect(w.goals?.[0].done).toBe(false)
    S.actions.toggleWeekGoal('2026-09-13', 'nope') // שבוע בלי מטרות — לא נשבר
    expect(S.weekLog(get(), '2026-09-13').goals).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('טיימר', () => {
  it('start → pause → resume → stop סופר דקות נכון ויוצר סשן', () => {
    S.actions.startTimer('trk-study', 'אלגו', 45)
    expect(get().timer).toMatchObject({ running: true, accumulated: 0, trackId: 'trk-study', label: 'אלגו', targetMinutes: 45 })
    heartbeat(10) // הלשונית פתוחה — הדופק רץ
    S.actions.pauseTimer()
    expect(get().timer?.running).toBe(false)
    expect(get().timer?.accumulated).toBeCloseTo(10)
    tick(60 * 60000) // הפסקה ארוכה לא נספרת
    S.actions.resumeTimer()
    heartbeat(5)
    const min = S.actions.stopTimer(true)
    expect(min).toBe(15)
    expect(get().timer).toBeNull()
    const sess = get().sessions[0]
    expect(sess).toMatchObject({ minutes: 15, trackId: 'trk-study', label: 'אלגו', endedAt: Date.now() })
    expect(sess.startedAt).toBe(Date.now() - 15 * 60000)
    expect(S.minutesOn(get(), '2026-09-11')).toBe(15)
  })

  it('startTimer בלי יעד לוקח את tokenMinutes; stopTimer(false) לא שומר; פחות מדקה לא נשמר', () => {
    S.actions.startTimer('trk-life')
    expect(get().timer?.targetMinutes).toBe(90)
    tick(30000)
    expect(S.actions.stopTimer(true)).toBe(1) // 0.5 מעוגל ל-1? Math.round(0.5) = 1 — ונשמר
    expect(get().sessions).toHaveLength(1)
    S.actions.startTimer('trk-life')
    tick(20000)
    expect(S.actions.stopTimer(true)).toBe(0)
    expect(get().sessions).toHaveLength(1)
    S.actions.startTimer('trk-life')
    heartbeat(10)
    expect(S.actions.stopTimer(false)).toBe(10)
    expect(get().sessions).toHaveLength(1)
    expect(get().timer).toBeNull()
    expect(S.actions.stopTimer()).toBe(0)
  })

  it('pause/resume בלי טיימר או במצב לא מתאים — no-op', () => {
    S.actions.pauseTimer()
    S.actions.resumeTimer()
    expect(get().timer).toBeNull()
    S.actions.startTimer('trk-life')
    const t = get().timer
    S.actions.resumeTimer() // כבר רץ
    expect(get().timer).toBe(t)
    S.actions.pauseTimer()
    const p = get().timer
    S.actions.pauseTimer()
    expect(get().timer).toBe(p)
  })

  it('touchTimer מקדם דופק; אחרי פער של יותר מ-3 דקות עוצר בנקודה האחרונה', () => {
    S.actions.startTimer('trk-life')
    tick(20000)
    S.actions.touchTimer()
    expect(get().timer?.lastSeen).toBe(NOW + 20000)
    tick(2 * 60 * 60000) // שעתיים בלי דופק
    S.actions.touchTimer()
    const t = get().timer!
    expect(t.running).toBe(false)
    expect(t.accumulated).toBeCloseTo(20 / 60, 3) // 20 שניות בלבד
  })

  /** מדמה את הדופק של ה-UI: touchTimer כל 20 שניות לאורך N דקות */
  const heartbeat = (minutes: number) => {
    for (let i = 0; i < minutes * 3; i++) {
      tick(20000)
      S.actions.touchTimer()
    }
  }

  it('reconcileNow: טיימר שנשכח לילה שלם לא צובר דקות דמיוניות', () => {
    S.actions.startTimer('trk-life')
    heartbeat(25)
    expect(get().timer?.running).toBe(true)
    tick(8 * 60 * 60000) // 8 שעות בלי דופק (המחשב ישן)
    S.actions.reconcileNow()
    const t = get().timer!
    expect(t.running).toBe(false)
    expect(t.accumulated).toBeCloseTo(25)
    expect(S.actions.stopTimer(true)).toBe(25)
    expect(get().sessions[0].minutes).toBe(25)
  })

  it('reconcileTimer בטעינה: מצב שמור עם טיימר רץ ודופק ישן נעצר; דופק טרי נשאר רץ', async () => {
    const running: AppState['timer'] = { running: true, startedAt: NOW - 5 * 3600_000, accumulated: 7, trackId: 'trk-life', label: '', targetMinutes: 90, lastSeen: NOW - 5 * 3600_000 + 12 * 60000 }
    let st = await freshStore(blankState({ timer: running }))
    let t = st.store.get().timer!
    expect(t.running).toBe(false)
    expect(t.accumulated).toBeCloseTo(19)
    expect(st.actions.stopTimer(true)).toBe(19)
    // בלי lastSeen (רשומה ישנה) — נופל ל-startedAt
    st = await freshStore(blankState({ timer: { ...running, lastSeen: undefined as any } }))
    expect(st.store.get().timer?.accumulated).toBeCloseTo(7)
    // דופק לפני דקה — ממשיך לרוץ
    st = await freshStore(blankState({ timer: { ...running, startedAt: NOW - 2 * 60000, lastSeen: NOW - 60000 } }))
    expect(st.store.get().timer?.running).toBe(true)
  })

  it('stopTimer/pauseTimer אחרי קפיאה ארוכה בלי דופק — לא סופרים את זמן הקפיאה', () => {
    // באג מתועד: stopTimer ו-pauseTimer סופרים Date.now() - startedAt בלי להסתכל על lastSeen.
    // אם המשתמש חוזר ללשונית ולוחץ "סיים" לפני שהדופק (20 שניות) או visibilitychange הספיקו
    // להריץ reconcile — הסשן מקבל שעות דמיוניות.
    S.actions.startTimer('trk-life')
    heartbeat(10)
    expect(get().timer?.running).toBe(true)
    tick(6 * 3600_000) // המחשב נרדם; המשתמש חוזר ולוחץ "סיים" לפני הדופק הבא
    expect(S.actions.stopTimer(true)).toBe(10)
  })

  it('pauseTimer אחרי קפיאה — נעצר בדופק האחרון', () => {
    S.actions.startTimer('trk-life')
    heartbeat(10)
    tick(6 * 3600_000)
    S.actions.pauseTimer()
    expect(get().timer?.accumulated).toBeCloseTo(10)
  })

  it('markTimerNotified', () => {
    S.actions.markTimerNotified()
    S.actions.startTimer('trk-life')
    S.actions.markTimerNotified()
    expect(get().timer?.notified).toBe(true)
    const t = get().timer
    S.actions.markTimerNotified()
    expect(get().timer).toBe(t)
  })
})

// ---------------------------------------------------------------------------
describe('סשנים', () => {
  it('addSession ידני; sessionsOn לפי היום הלוגי (01:00 בלילה שייך לאתמול)', () => {
    const s1 = S.actions.addSession('trk-study', 30)
    expect(s1).toMatchObject({ minutes: 30, manual: true, endedAt: NOW, startedAt: NOW - 30 * 60000 })
    const night = new Date(2026, 8, 12, 1, 0).getTime()
    S.actions.addSession('trk-study', 20, night, 'לילה')
    expect(S.minutesOn(get(), '2026-09-11')).toBe(50)
    expect(S.minutesOn(get(), '2026-09-12')).toBe(0)
    expect(S.weekMinutes(get(), '2026-09-06')).toBe(50)
    expect(S.weekMinutes(get(), '2026-09-13')).toBe(0)
    expect(S.minutesByTrack(S.weekSessions(get(), '2026-09-06'))).toEqual({ 'trk-study': 50 })
  })

  it('trimLastSession מקצר את האחרון של היום לפי מסלול ותווית, ומוחק כשלא נשאר', () => {
    S.actions.addSession('trk-study', 30, NOW - 3600_000, 'a')
    S.actions.addSession('trk-study', 40, NOW, 'b')
    S.actions.addSession('trk-life', 10, NOW)
    S.actions.trimLastSession('trk-study', 15, 'a')
    let s = get()
    expect(s.sessions.find((x) => x.label === 'a')?.minutes).toBe(15)
    expect(s.sessions.find((x) => x.label === 'b')?.minutes).toBe(40)
    S.actions.trimLastSession('trk-study', 40)
    s = get()
    expect(s.sessions.find((x) => x.label === 'b')?.deleted).toBe(true)
    S.actions.trimLastSession('trk-study', 0)
    S.actions.trimLastSession('trk-none', 5)
    expect(S.minutesOn(get(), '2026-09-11')).toBe(25)
    S.actions.deleteSession(s.sessions[2].id)
    expect(S.minutesOn(get(), '2026-09-11')).toBe(15)
  })
})

// ---------------------------------------------------------------------------
describe('הגדרות, מסלולים, הרגלים ופריטים', () => {
  it('setSettings מחתים settingsUpdatedAt', () => {
    S.actions.setSettings({ name: 'י', aiKey: 'k' })
    expect(get().settings.name).toBe('י')
    expect(get().settings.aiKey).toBe('k')
    expect(get().settingsUpdatedAt).toBe(NOW)
  })
  it('upsert/delete למסלול, הרגל, פריט שבועי', () => {
    S.actions.upsertTrack({ id: 'tr', updatedAt: 0, name: 'א', emoji: '', color: '', order: 9, board: true })
    S.actions.upsertHabit({ id: 'h', updatedAt: 0, name: 'א', emoji: '', order: 0 })
    S.actions.upsertWeekly({ id: 'w', updatedAt: 0, name: 'א', emoji: '', order: 0, kind: 'check' })
    expect(S.trackById(get(), 'tr')?.updatedAt).toBe(NOW)
    S.actions.deleteTrack('tr')
    S.actions.deleteHabit('h')
    S.actions.deleteWeekly('w')
    expect(S.trackById(get(), 'tr')).toBeUndefined()
    expect(S.alive(get().habits)).toHaveLength(0)
    expect(S.alive(get().weekly)).toHaveLength(0)
    expect(S.defaultTrackId(get())).toBe('trk-life')
    S.actions.deleteTrack('trk-life')
    expect(S.defaultTrackId(get())).toBe('trk-study')
  })
  it('markAtlasApplied מצטבר', () => {
    S.actions.markAtlasApplied({ a: 1 })
    S.actions.markAtlasApplied({ b: 2 })
    expect(get().atlasApplied).toEqual({ a: 1, b: 2 })
  })
  it('rateNewsStory/setNewsNote', () => {
    S.actions.rateNewsStory('2026-09-11', 'k1', 1, { headline: 'h', section: 's' })
    expect(get().news[0].votes.k1.v).toBe(1)
    S.actions.rateNewsStory('2026-09-11', 'k1', 1, { headline: 'h', section: 's' })
    expect(get().news[0].votes.k1).toBeUndefined()
    S.actions.setNewsNote('2026-09-11', 'הערה')
    expect(get().news).toHaveLength(1)
    expect(get().news[0].note).toBe('הערה')
  })
})

// ---------------------------------------------------------------------------
describe('ייבוא, איפוס, טעינה', () => {
  it('normalizeImport: קלט פגום לא זורק', () => {
    const N = S.actions.normalizeImport
    expect(N(null)).toBeNull()
    expect(N('x')).toBeNull()
    expect(N({})).toBeNull()
    expect(N({ tasks: [], events: 'x' })).toBeNull()
    const out = N({
      tasks: [null, 1, { id: '' }, { title: 'בלי מזהה' }, { id: 't1', title: 'א' }],
      events: [null, { id: 'e-nodate', title: 'בלי תאריך' }, { id: 'e1', date: '2026-09-11', title: 'ב' }],
      rules: [null, { id: 'r1', days: [1], from: '2026-01-01', active: true, title: 'r', kind: 'block', start: '1', end: '2' }],
      days: 'garbage',
      timer: { startedAt: NaN, accumulated: NaN, running: true, trackId: 'x' },
      settings: { name: 'י' },
    })!
    expect(out).not.toBeNull()
    expect(out.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(out.rules.map((r) => r.id)).toEqual(['r1'])
    expect(out.days).toEqual([])
    expect(out.timer).toBeNull()
    expect(out.settings.name).toBe('י')
    expect(out.settings.tokenMinutes).toBe(90)
    expect(out.deviceId).toBeTruthy()
    expect(out.materializedTo).toBe('2026-09-11')
    expect(out.version).toBe(1)
  })

  it('normalizeImport + replaceAll: כלל בלי days, אירוע בלי תאריך, שלב null — לא מפילים את האפליקציה', () => {
    // באג מתועד: normalizeImport לא מסנן כמו sanitize() של הטעינה. כלל בלי days מפיל
    // את materialize (r.days.includes) בתוך replaceAll עצמו; אירוע yearly בלי date מפיל
    // eventsOn (e.date.slice) בכל מסך; phases לא מסוננים בכלל.
    const out = S.actions.normalizeImport({
      tasks: [],
      events: [{ id: 'bd', yearly: true, kind: 'birthday', title: 'בלי תאריך' }],
      rules: [{ id: 'r1', from: '2026-01-01', active: true, title: 'r', kind: 'block', start: '1', end: '2' }],
      phases: [null, { id: 'p' }],
    })!
    expect(() => S.actions.replaceAll(out)).not.toThrow()
    expect(() => S.eventsOn(get(), '2026-09-11')).not.toThrow()
    expect(() => S.alive(get().phases)).not.toThrow()
  })

  it('replaceAll מטריאליזציה ומשלים ברירות מחדל', () => {
    const raw: any = { ...blankState({ rules: [rule({ id: 'r', days: [0, 1, 2, 3, 4, 5, 6] })] }) }
    delete raw.workouts
    delete raw.news
    S.actions.replaceAll(raw)
    expect(get().workouts).toEqual([])
    expect(get().news).toEqual([])
    expect(get().events.filter((e) => e.ruleId === 'r').length).toBeGreaterThan(100)
  })

  it('resetAll: מצב זרע, resetAt, מחיקת המפתח ב-localStorage', () => {
    S.actions.addTask({ title: 'א' })
    S.actions.resetAll()
    const s = get()
    expect(s.tasks).toHaveLength(0)
    expect(s.resetAt).toBe(NOW)
    expect(s.lastSyncAt).toBe(NOW)
    expect(s.tracks.map((t) => t.id)).toContain('trk-study')
    expect(localStorage.getItem('life-os-reset-at')).toBe(String(NOW))
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('loadState: localStorage פגום → זרע + עותק corrupt; שמירה מתבצעת אחרי 250ms', async () => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem(KEY, '{not json')
    const st = await import('../../../src/store')
    expect(st.store.get().tracks.length).toBeGreaterThan(0)
    expect(localStorage.getItem('life-os-v1-corrupt')).toBe('{not json')
    expect(st.consumeFreshInstall()).toBe(true)
    expect(st.consumeFreshInstall()).toBe(false)
    st.actions.addTask({ title: 'נשמר' })
    vi.advanceTimersByTime(300)
    expect(JSON.parse(localStorage.getItem(KEY)!).tasks[0].title).toBe('נשמר')
  })

  it('loadState: רשומות פגומות מסוננות, טיימר NaN מאופס, מערכים חסרים מושלמים', async () => {
    const raw: any = {
      ...blankState(),
      tasks: [null, { id: 't1', title: 'א' }, { title: 'x' }],
      events: [{ id: 'e-nodate' }, { id: 'e1', date: '2026-09-11', title: 'ב' }],
      rules: [{ id: 'r-nodays', from: '2026-01-01', active: true }],
      timer: { running: true, startedAt: NaN, accumulated: 0, trackId: 'trk-life' },
    }
    delete raw.days
    delete raw.phases
    const st = await freshStore(raw)
    const s = st.store.get()
    expect(s.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(s.events.map((e) => e.id)).toEqual(['e1'])
    expect(s.rules).toEqual([])
    expect(s.timer).toBeNull()
    expect(s.days).toEqual([])
    expect(s.phases).toEqual([])
    expect(st.consumeFreshInstall()).toBe(false)
  })

  it('subscribe/set: מאזינים מקבלים עדכון, set שמחזיר אותו מצב לא מודיע', () => {
    let n = 0
    const off = S.store.subscribe(() => n++)
    S.store.set((s) => s)
    expect(n).toBe(0)
    S.actions.addTask({ title: 'א' })
    expect(n).toBe(1)
    off()
    S.actions.addTask({ title: 'ב' })
    expect(n).toBe(1)
  })
})

// ---------------------------------------------------------------------------
describe('טיימר שנשכח דולק בלשונית פתוחה', () => {
  const beat = (minutes: number) => {
    for (let i = 0; i < minutes * 3; i++) {
      tick(20_000)
      S.actions.touchTimer()
    }
  }

  it('אחרי 4 שעות רצופות הטיימר מושהה מעצמו, נשמרות בדיוק 240 דקות, והמשך מנקה את הסימון', () => {
    S.actions.startTimer('trk-study')
    beat(239)
    expect(get().timer?.running).toBe(true)
    beat(2)
    const t = get().timer!
    expect(t.running).toBe(false)
    expect(t.autoPaused).toBe('long')
    expect(Math.round(t.accumulated)).toBe(240)
    S.actions.resumeTimer()
    expect(get().timer?.running).toBe(true)
    expect(get().timer?.autoPaused).toBeUndefined()
    // סיום שומר את מה שנצבר, לא את 10 השעות של הלילה
    beat(10)
    expect(S.actions.stopTimer(true)).toBe(250)
  })

  it('עבודה אמיתית על פני 03:30 (פחות מ-4 שעות) לא נעצרת — היום הלוגי לא קוטע סשן', () => {
    pin(new Date(2026, 8, 11, 2, 0, 0).getTime())
    S.actions.startTimer('trk-study')
    beat(120)
    expect(get().timer?.running).toBe(true)
    expect(get().timer?.autoPaused).toBeUndefined()
    expect(S.actions.stopTimer(true)).toBe(120)
  })

  it('השהיה ידנית והשהיה בגלל לשונית קפואה לא מסמנות autoPaused', () => {
    S.actions.startTimer('trk-study')
    beat(30)
    S.actions.pauseTimer()
    expect(get().timer?.autoPaused).toBeUndefined()
    S.actions.resumeTimer()
    tick(10 * 60_000) // הלשונית קפאה 10 דקות — הדופק הבא מיישר לנקודה האחרונה
    S.actions.touchTimer()
    expect(get().timer?.running).toBe(false)
    expect(get().timer?.autoPaused).toBeUndefined()
  })
})
