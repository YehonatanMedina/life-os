// ---------------------------------------------------------------------------
// סבב 2 (regress) — פונקציות שנוספו/שונו בתיקונים: clock(), שובר־השוויון
// ב-mergeList, וההחרגה של המשימות המפוזרות ב-spreadTasks.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { clock, logicalDate, isAfterMidnight } from '../../../src/dates'
import { mergeStates } from '../../../src/store'
import { seedState } from '../../../src/seed'
import type { AppState, Task } from '../../../src/types'
import { blankState, freshStore, pin, task, NOW } from '../logic/helpers'

afterEach(() => {
  vi.useRealTimers()
})

describe('clock() — שעון אחד לכל הטיימרים', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [61.9, '01:01'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [4020, '1:07:00'],
    [36_000, '10:00:00'],
    [-5, '00:00'],
    [NaN, '00:00'],
    [Infinity, '00:00'],
  ])('clock(%s) → %s', (secs, out) => {
    expect(clock(secs as number)).toBe(out)
  })
})

describe('mergeList — תיקו בחותמת', () => {
  const state = (over: Partial<AppState>): AppState => ({ ...seedState(), ...over })

  it('אותה חותמת, אותו תוכן בסדר מפתחות שונה — שני הכיוונים מתכנסים לאותה גרסה', () => {
    const a = state({ tasks: [{ id: 'x', updatedAt: 500, title: 'A', trackId: 'trk-study', status: 'todo', order: 0 } as Task] })
    const b = state({ tasks: [{ title: 'B', id: 'x', status: 'todo', trackId: 'trk-study', order: 0, updatedAt: 500 } as Task] })
    const ab = mergeStates(a, b).tasks.find((t) => t.id === 'x')!
    const ba = mergeStates(b, a).tasks.find((t) => t.id === 'x')!
    expect(ab.title).toBe(ba.title)
  })

  it('תיקו בין מחיקה לעריכה — שני הכיוונים מסכימים, וריצה חוזרת לא משנה כלום', () => {
    const a = state({ tasks: [{ id: 'x', updatedAt: 500, title: 'חיה', trackId: 'trk-study', status: 'todo', order: 0 } as Task] })
    const b = state({ tasks: [{ id: 'x', updatedAt: 500, title: 'חיה', trackId: 'trk-study', status: 'todo', order: 0, deleted: true } as Task] })
    const ab = mergeStates(a, b)
    const ba = mergeStates(b, a)
    expect(!!ab.tasks.find((t) => t.id === 'x')!.deleted).toBe(!!ba.tasks.find((t) => t.id === 'x')!.deleted)
    expect(mergeStates(ab, ba).tasks.find((t) => t.id === 'x')).toEqual(ab.tasks.find((t) => t.id === 'x'))
  })
})

describe('spreadTasks — המשימות שמפזרים לא נספרות כעומס ביום המקור (desktop #4)', () => {
  it('3×4 אסימונים על ראשון, קיבולת 6: ראשון־שני־שלישי, ראשון לא נשאר ריק', async () => {
    pin(NOW) // שישי 11.9
    const S = await freshStore(
      blankState({ tasks: ['a', 'b', 'c'].map((id) => task({ id, due: '2026-09-13', est: 4, updatedAt: 5 })) }),
    )
    expect(S.hasSpreadRoom('2026-09-13', 7)).toBe(true)
    const before = S.spreadTasks(['a', 'b', 'c'], '2026-09-13', 7)
    expect(before.map((x) => x.due)).toEqual(['2026-09-13', '2026-09-13', '2026-09-13'])
    const dues = S.store.get().tasks.map((t) => t.due).sort()
    expect(dues).toEqual(['2026-09-13', '2026-09-14', '2026-09-15'])
  })

  it('משימות של ימים אחרים (לא בפיזור) עדיין נספרות כעומס', async () => {
    pin(NOW)
    const S = await freshStore(
      blankState({
        tasks: [
          task({ id: 'fixed', due: '2026-09-13', est: 6, updatedAt: 5 }), // ראשון מלא
          task({ id: 'm', due: '2026-09-13', est: 4, updatedAt: 5 }),
        ],
      }),
    )
    S.spreadTasks(['m'], '2026-09-13', 7)
    expect(S.store.get().tasks.find((t) => t.id === 'm')!.due).toBe('2026-09-14')
    expect(S.store.get().tasks.find((t) => t.id === 'fixed')!.due).toBe('2026-09-13')
  })
})

describe('logicalDate — לפי שעון הקיר (logic #5)', () => {
  it('03:29 → אתמול, 03:30 → היום; ותמיד מסכים עם isAfterMidnight', () => {
    const t1 = new Date(2026, 8, 11, 3, 29).getTime()
    const t2 = new Date(2026, 8, 11, 3, 30).getTime()
    expect(logicalDate(t1)).toBe('2026-09-10')
    expect(logicalDate(t2)).toBe('2026-09-11')
    // יום מעבר שעון קיץ (27.3.2026): 04:00 בקיר הוא היום
    const dst = new Date(2026, 2, 27, 4, 0).getTime()
    expect(logicalDate(dst)).toBe('2026-03-27')
    expect(isAfterMidnight(new Date(dst))).toBe(false)
  })
})
