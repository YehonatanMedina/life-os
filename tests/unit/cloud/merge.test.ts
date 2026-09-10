// ---------------------------------------------------------------------------
// mergeStates — הלב של "כלום לא הולך לאיבוד". בדיקות יחידה עוינות על מקרי
// הקצה שהבדיקות קצה־לקצה לא יכולות לייצר בזמן סביר.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { mergeStates } from '../../../src/store'
import { seedState } from '../../../src/seed'
import type { AppState, Task } from '../../../src/types'

const T0 = Date.parse('2026-01-01T00:00:00') // חותמת הזרע
const task = (id: string, updatedAt: number, over: Partial<Task> = {}): Task => ({
  id, updatedAt, title: id, trackId: 'trk-study', status: 'todo', order: 0, ...over,
})
const state = (over: Partial<AppState>): AppState => ({ ...seedState(), ...over })

describe('רשומות', () => {
  it('מחיקה חדשה יותר מנצחת רשומה חיה — בשני הכיוונים', () => {
    const local = state({ tasks: [task('a', 100)] })
    const remote = state({ tasks: [task('a', 200, { deleted: true })] })
    expect(mergeStates(local, remote).tasks[0].deleted).toBe(true)
    expect(mergeStates(remote, local).tasks[0].deleted).toBe(true)
  })

  it('עריכה חדשה יותר ממחיקה מחזירה את הרשומה לחיים (מתועד — כך המודל בנוי)', () => {
    const local = state({ tasks: [task('a', 300, { title: 'נערכה אחרי המחיקה' })] })
    const remote = state({ tasks: [task('a', 200, { deleted: true })] })
    const m = mergeStates(local, remote)
    expect(m.tasks[0].deleted).toBeFalsy()
    expect(m.tasks[0].title).toBe('נערכה אחרי המחיקה')
  })

  it('רשומה שקיימת רק בצד אחד נשמרת — בלי קשר למי חדש יותר', () => {
    const local = state({ tasks: [task('only-local', 100)] })
    const remote = state({ tasks: [task('only-remote', 100)], lastSyncAt: 999 })
    const m = mergeStates(local, remote)
    expect(m.tasks.map((t) => t.id).sort()).toEqual(['only-local', 'only-remote'])
  })

  it('תיקו בחותמת: שובר־שוויון דטרמיניסטי — שני המכשירים מתכנסים לאותה גרסה', () => {
    const a = state({ tasks: [task('x', 500, { title: 'גרסה A' })] })
    const b = state({ tasks: [task('x', 500, { title: 'גרסה B' })] })
    expect(mergeStates(a, b).tasks[0].title).toBe(mergeStates(b, a).tasks[0].title)
  })

  it('רשומות ישנות בלי updatedAt נחשבות 0 ומפסידות לכל עריכה', () => {
    const local = state({ tasks: [{ ...task('a', 0), updatedAt: undefined as any }] })
    const remote = state({ tasks: [task('a', 1, { title: 'חדש' })] })
    expect(mergeStates(local, remote).tasks[0].title).toBe('חדש')
  })
})

describe('הגדרות', () => {
  it('מכשיר שהזרע שלו נשמר עם חותמת הגדרות טרייה דורס את הגדרות המחסן (ממצא #1)', () => {
    // זה בדיוק מה שקורה כשפותחים את האתר, סוגרים את כרטיס ההסבר, ורק אז מדביקים את קישור החיבור.
    const fresh = state({ settings: { ...seedState().settings, onboarded: true }, settingsUpdatedAt: Date.now() })
    const remote = state({
      settings: { ...seedState().settings, wakeTime: '05:45', name: 'יהונתן', aiKey: 'k' },
      settingsUpdatedAt: Date.now() - 86_400_000,
      tasks: [task('real', Date.now() - 3_600_000)],
    })
    const m = mergeStates(fresh, remote)
    // הרשומות בסדר — המשימה האמיתית נשמרת
    expect(m.tasks.some((t) => t.id === 'real')).toBe(true)
    // אבל ההגדרות של המחסן אבדו — זה הבאג
    expect(m.settings.wakeTime).toBe('07:30')
    expect(m.settings.name).toBe('')
    expect(m.settings.aiKey).toBeUndefined()
  })

  it('חותמת הגדרות שווה: המקומי מנצח; חדשה יותר בצד השני: הצד השני', () => {
    const l = state({ settings: { ...seedState().settings, name: 'L' }, settingsUpdatedAt: 10 })
    const r = state({ settings: { ...seedState().settings, name: 'R' }, settingsUpdatedAt: 10 })
    expect(mergeStates(l, r).settings.name).toBe('L')
    expect(mergeStates(l, { ...r, settingsUpdatedAt: 11 }).settings.name).toBe('R')
    expect(mergeStates(l, { ...r, settingsUpdatedAt: 11 }).settingsUpdatedAt).toBe(11)
  })
})

describe('מפות לפי מפתח — הרגלים, פריטים שבועיים, סטים', () => {
  it('הרגלים שונים מאותו יום משני מכשירים — שניהם שורדים, וחותמת לכל מפתח', () => {
    const day = (habits: Record<string, boolean>, habitsAt: Record<string, number>, updatedAt: number) => ({
      id: 'day-2026-09-11', updatedAt, date: '2026-09-11', wake: null, habits, steps: {}, habitsAt,
    })
    const local = state({ days: [day({ 'hb-morning': true }, { 'hb-morning': 1000 }, 1000)] })
    const remote = state({ days: [day({ 'hb-night': true }, { 'hb-night': 1001 }, 1001)] })
    const m = mergeStates(local, remote).days[0]
    expect(m.habits).toEqual({ 'hb-morning': true, 'hb-night': true })
    expect(m.habitsAt).toEqual({ 'hb-morning': 1000, 'hb-night': 1001 })
  })

  it('ביטול סימון (false) הוא ערך, לא היעדר — מנצח כשהוא חדש יותר', () => {
    const local = state({ days: [{ id: 'd', updatedAt: 10, date: '2026-09-11', wake: null, habits: { h: true }, steps: {}, habitsAt: { h: 10 } }] })
    const remote = state({ days: [{ id: 'd', updatedAt: 20, date: '2026-09-11', wake: null, habits: { h: false }, steps: {}, habitsAt: { h: 20 } }] })
    expect(mergeStates(local, remote).days[0].habits.h).toBe(false)
  })

  it('יומן אימון: תרגילים שונים משני מכשירים מתמזגים; ק״מ ודקות שנרשמו בצד אחד נשמרים', () => {
    const local = state({ workouts: [{ id: 'w-1', updatedAt: 10, date: '2026-09-11', title: 'א', kind: 'gym', sets: { ex1: [{ kg: 60, reps: 8 }] }, setsAt: { ex1: 10 }, km: 3 }] })
    const remote = state({ workouts: [{ id: 'w-1', updatedAt: 11, date: '2026-09-11', title: 'א', kind: 'gym', sets: { ex2: [{ kg: 40, reps: 10 }] }, setsAt: { ex2: 11 }, minutes: 45 }] })
    const m = mergeStates(local, remote).workouts[0]
    expect(Object.keys(m.sets).sort()).toEqual(['ex1', 'ex2'])
    expect(m.km).toBe(3)
    expect(m.minutes).toBe(45)
  })

  it('סט שנמחק במכשיר אחד (מערך ריק, חותמת חדשה) לא חוזר מהמכשיר השני', () => {
    const local = state({ workouts: [{ id: 'w-1', updatedAt: 10, date: '2026-09-11', title: 'א', kind: 'gym', sets: { ex1: [{ kg: 60, reps: 8 }] }, setsAt: { ex1: 10 } }] })
    const remote = state({ workouts: [{ id: 'w-1', updatedAt: 20, date: '2026-09-11', title: 'א', kind: 'gym', sets: { ex1: [] }, setsAt: { ex1: 20 } }] })
    expect(mergeStates(local, remote).workouts[0].sets.ex1).toEqual([])
  })
})

describe('אטלס וטיימר', () => {
  it('atlasApplied הוא איחוד — פקודה שבוצעה באחד המכשירים בוצעה', () => {
    const m = mergeStates(state({ atlasApplied: { a: 1 } }), state({ atlasApplied: { b: 2 } }))
    expect(m.atlasApplied).toEqual({ a: 1, b: 2 })
  })

  it('הטיימר תמיד מקומי — לא מגיע מהמחסן', () => {
    const timer = { running: true, startedAt: 1, accumulated: 0, trackId: 't', label: '', targetMinutes: 90, lastSeen: 1 }
    expect(mergeStates(state({ timer: null }), state({ timer })).timer).toBeNull()
    expect(mergeStates(state({ timer }), state({ timer: null })).timer).toEqual(timer)
  })

  it('רשומות מהזרע (חותמת 2026-01-01) מפסידות לכל עריכה של המשתמש', () => {
    const local = state({})
    const remote = state({ tracks: local.tracks.map((t) => (t.id === 'trk-study' ? { ...t, name: 'שונה', updatedAt: T0 + 1 } : t)) })
    expect(mergeStates(local, remote).tracks.find((t) => t.id === 'trk-study')?.name).toBe('שונה')
  })
})
