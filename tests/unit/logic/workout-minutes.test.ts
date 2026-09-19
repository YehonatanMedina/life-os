// הערכת אורך האימון — המספר שעונה על "זה נכנס לי לבלוק?"
//
// הבדיקה הזו קיימת כי המודל הקודם ספר רק (סטים-1) הפסקות ו-30 שניות מעבר,
// ולכן יום של תשעה תרגילים הופיע בתור 38 דקות. התוצאה: ימי בית תפחו בלי
// שמישהו ראה את זה. הכלל שנשמר כאן: ההפסקה נספרת אחרי כל סט, ולכל תרגיל
// יש דקת מעבר — ושבעה תרגילים או יותר עוברים את התקרה של 45 דקות.
import { describe, it, expect } from 'vitest'
import { workoutMinutes } from '../../../src/store'
import type { WorkoutDay } from '../../../src/types'

const day = (kind: WorkoutDay['kind'], exercises: WorkoutDay['exercises']): WorkoutDay =>
  ({ id: 'wd', dow: 0, title: 'יום', kind, exercises }) as WorkoutDay

const ex = (n: number, sets: number, rest: number, metric = 'reps') =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: `ת${i}`, sets, rest, metric })) as WorkoutDay['exercises']

describe('workoutMinutes', () => {
  it('סופר דקת מעבר לתרגיל והפסקה אחרי כל סט', () => {
    // תרגיל אחד, 3 סטים של 45 שניות עם הפסקה 60: 60 + 3×105 = 375 שניות
    expect(workoutMinutes(day('gym', ex(1, 3, 60)))).toBe(6)
  })

  it('ריצה והליכה מחזירות 0 — שם היעד הוא המספר, לא הסטים', () => {
    expect(workoutMinutes(day('run', ex(2, 3, 60)))).toBe(0)
    expect(workoutMinutes(day('walk', ex(2, 3, 60)))).toBe(0)
    expect(workoutMinutes(undefined)).toBe(0)
  })

  it('חמישה תרגילים נכנסים ב-45 דקות, תשעה לא', () => {
    expect(workoutMinutes(day('gym', ex(5, 3, 60)))).toBeLessThanOrEqual(45)
    expect(workoutMinutes(day('home', ex(9, 3, 60)))).toBeGreaterThan(45)
  })

  it('החזקות בזמן קצרות מסט חזרות', () => {
    const holds = workoutMinutes(day('home', [{ id: 'h', name: 'החזקה', sets: 3, rest: 60, metric: 'time' }] as WorkoutDay['exercises']))
    const reps = workoutMinutes(day('home', ex(1, 3, 60)))
    expect(holds).toBeLessThanOrEqual(reps)
  })
})
