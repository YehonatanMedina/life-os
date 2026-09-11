// ---------------------------------------------------------------------------
// סבב 2 (regress) — backfillAt (logic #1) ו-goalsAt (logic #4).
// התיקון הושם בתוך toggleHabit/toggleStep/toggleWeeklyItem/addWeeklyProgress/
// setWorkoutSet/toggleWeekGoal. אבל יש נתיבים שכותבים את אותן מפות דרך
// patchDay/patchWeek ישירות — ושם אין backfill ואין goalsAt:
//   • Review.tsx › WeeklyFlow.finish: patchWeek(nextWs, { goals, plannedAt })
//   • Today.tsx › DailyHabits (כל הצעדים הושלמו): patchDay(date, { habits, habitsAt: {[h]: now} })
//   • Workout.tsx › WorkoutSheet.finish: patchDay(date, { habits, habitsAt: {[hb]: now} })
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, day, freshStore, pin, tick, NOW } from '../logic/helpers'

afterEach(() => {
  vi.useRealTimers()
})

describe('חותמות לפי מפתח — הנתיבים שעוקפים את פעולות ה-toggle', () => {
  it('setWeekGoals + toggleWeekGoal בשני מכשירים — שני הסימונים שורדים (logic #4 נסגר)', async () => {
    pin(NOW)
    const ws = '2026-09-13'
    const A = await freshStore(blankState())
    A.actions.setWeekGoals(ws, [{ id: 'g1', text: 'א' }, { id: 'g2', text: 'ב' }])
    const B = await freshStore(JSON.parse(JSON.stringify(A.store.get())))
    tick(60_000)
    A.actions.toggleWeekGoal(ws, 'g1')
    tick(60_000)
    B.actions.toggleWeekGoal(ws, 'g2')
    for (const [x, y] of [[A, B], [B, A]] as const) {
      const wk = x.mergeStates(x.store.get(), y.store.get()).weeks.find((w) => w.weekStart === ws)!
      expect(wk.goals?.map((g) => [g.id, !!g.done])).toEqual([['g1', true], ['g2', true]])
    }
  })

  // ב-HEAD 685363b זה הנתיב של WeeklyFlow.finish; בעץ העבודה הוא עבר ל-setWeekGoals (נסגר),
  // אבל patchWeek הגולמי עדיין כותב goals בלי goalsAt — כל קורא עתידי ייפול לאותו בור.
  it('patchWeek גולמי עם goals (בלי goalsAt): סימון במכשיר השני שורד עריכה מאוחרת של אותו שבוע', async () => {
    pin(NOW)
    const ws = '2026-09-13'
    const A = await freshStore(blankState())
    // מה ש-WeeklyFlow.finish עשה ב-HEAD — לא setWeekGoals
    A.actions.patchWeek(ws, { goals: [{ id: 'g1', text: 'א' }, { id: 'g2', text: 'ב' }], plannedAt: Date.now() })
    const B = await freshStore(JSON.parse(JSON.stringify(A.store.get())))
    tick(60_000)
    B.actions.toggleWeekGoal(ws, 'g1') // B: g1 ✓ בחותמת t2
    tick(60_000)
    A.actions.toggleWeeklyItem(ws, 'wk-x') // A: עריכה אחרת באותו שבוע → updatedAt = t3, goalsAt עדיין אין
    for (const [x, y] of [[A, B], [B, A]] as const) {
      const wk = x.mergeStates(x.store.get(), y.store.get()).weeks.find((w) => w.weekStart === ws)!
      expect(wk.goals?.find((g) => g.id === 'g1')?.done, 'הסימון של B נדרס ע"י updatedAt של A').toBe(true)
      expect(wk.items?.['wk-x']).toBe(true)
    }
  })

  // ב-HEAD 685363b זה הנתיב של Today.tsx (כל הצעדים) ו-Workout.tsx (סיום אימון); בעץ העבודה
  // שניהם עברו ל-actions.setHabit עם backfill (נסגר). patchDay הגולמי עדיין לא משלים חותמות.
  it('patchDay גולמי עם habitsAt חלקי על רשומה ישנה: ביטול ידני של הרגל אחר במכשיר השני שורד', async () => {
    pin(NOW)
    const date = '2026-09-11'
    // רשומה מלפני החותמות — habits בלי habitsAt
    const legacy = day({ date, updatedAt: NOW - 3_600_000, habits: { a: true, b: true } })
    const A = await freshStore(blankState({ days: [legacy] }))
    const B = await freshStore(blankState({ days: [legacy] }))
    tick(60_000)
    B.actions.toggleHabit(date, 'b') // B: b ← false, כל המפתחות מקבלים חותמת (backfill)
    tick(60_000)
    // Today.tsx › DailyHabits — בדיוק הקוד אחרי "כל הצעדים הושלמו"
    const fresh = A.dayLog(A.store.get(), date)
    A.actions.patchDay(date, {
      habits: { ...fresh.habits, a: true },
      habitsAt: { ...(fresh.habitsAt ?? {}), a: Date.now() },
    })
    for (const [x, y] of [[A, B], [B, A]] as const) {
      const d = x.mergeStates(x.store.get(), y.store.get()).days.find((z) => z.date === date)!
      expect(d.habits, 'b של A נופל ל-updatedAt החדש ודורס את הביטול של B').toEqual({ a: true, b: false })
    }
  })

  it('toggleHabit על רשומה ישנה בשני מכשירים — הביטול המאוחר שורד (logic #1 נסגר)', async () => {
    pin(NOW)
    const date = '2026-09-11'
    const legacy = day({ date, updatedAt: NOW - 3_600_000, habits: { a: true, b: true } })
    const A = await freshStore(blankState({ days: [legacy] }))
    const B = await freshStore(blankState({ days: [legacy] }))
    tick(60_000)
    B.actions.toggleHabit(date, 'b')
    tick(60_000)
    A.actions.toggleHabit(date, 'a')
    for (const [x, y] of [[A, B], [B, A]] as const) {
      const d = x.mergeStates(x.store.get(), y.store.get()).days.find((z) => z.date === date)!
      expect(d.habits).toEqual({ a: false, b: false })
    }
  })
})
