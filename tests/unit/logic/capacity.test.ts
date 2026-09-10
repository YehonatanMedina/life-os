// קיבולת וסלקטורים — dayCapacity, capacityBetween, tasksDueOn, spreadTasks
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, freshStore, task, event, pin, NOW, type StoreModule } from './helpers'
import type { AppState } from '../../../src/types'

let S: StoreModule
const settings = (over: Partial<AppState['settings']>) => ({ ...blankState().settings, ...over })

beforeEach(async () => {
  pin(NOW) // 11.9.2026, יום שישי
  S = await freshStore()
})
afterEach(() => vi.useRealTimers())

describe('dayCapacity', () => {
  it('ברירת המחדל: היעד היומי בכל יום, כולל שישי־שבת וחגים ("אין ויתורים")', () => {
    const s = blankState({
      events: [event({ id: 'h', date: '2026-09-12', kind: 'holiday' }), event({ id: 'x', date: '2026-09-13', kind: 'exam' })],
    })
    expect(S.dayCapacity(s, '2026-09-11')).toBe(6) // שישי
    expect(S.dayCapacity(s, '2026-09-12')).toBe(6) // שבת + חג
    expect(S.dayCapacity(s, '2026-09-13')).toBe(6) // ראשון + מבחן
  })

  it('easyWeekend: 60% בשישי־שבת, מעוגל, לפחות 1', () => {
    const s = blankState({ settings: settings({ easyWeekend: true, dailyTokenGoal: 6 }) })
    expect(S.dayCapacity(s, '2026-09-10')).toBe(6) // חמישי
    expect(S.dayCapacity(s, '2026-09-11')).toBe(4) // שישי: round(3.6)
    expect(S.dayCapacity(s, '2026-09-12')).toBe(4) // שבת
    const one = blankState({ settings: settings({ easyWeekend: true, dailyTokenGoal: 1 }) })
    expect(S.dayCapacity(one, '2026-09-11')).toBe(1)
  })

  it('easyHoliday: חג מלא = 0, ערב חג = חצי, חג רב־יומי חוסם את כל הימים', () => {
    const s = blankState({
      settings: settings({ easyHoliday: true }),
      events: [
        event({ id: 'eve', date: '2026-09-11', kind: 'holiday', eve: true }),
        event({ id: 'rh', date: '2026-09-12', endDate: '2026-09-13', kind: 'holiday' }),
      ],
    })
    expect(S.dayCapacity(s, '2026-09-11')).toBe(3)
    expect(S.dayCapacity(s, '2026-09-12')).toBe(0)
    expect(S.dayCapacity(s, '2026-09-13')).toBe(0)
    expect(S.dayCapacity(s, '2026-09-14')).toBe(6)
    expect(S.isBlockedDay(s, '2026-09-12')).toBe(true)
    expect(S.isBlockedDay(s, '2026-09-11')).toBe(false)
  })

  it('ערב חג בסוף שבוע עם easyWeekend: חצי מה-60%', () => {
    const s = blankState({
      settings: settings({ easyHoliday: true, easyWeekend: true, dailyTokenGoal: 6 }),
      events: [event({ id: 'eve', date: '2026-09-11', kind: 'holiday', eve: true })],
    })
    expect(S.dayCapacity(s, '2026-09-11')).toBe(2) // round(4/2)
  })

  it('easyExamDay: מבחן אחד = 2, שניים = 1, ולא יותר מהבסיס', () => {
    const s = blankState({
      settings: settings({ easyExamDay: true }),
      events: [
        event({ id: 'x1', date: '2026-09-14', kind: 'exam' }),
        event({ id: 'x2', date: '2026-09-15', kind: 'exam' }),
        event({ id: 'x3', date: '2026-09-15', kind: 'exam' }),
      ],
    })
    expect(S.dayCapacity(s, '2026-09-14')).toBe(2)
    expect(S.dayCapacity(s, '2026-09-15')).toBe(1)
    const tiny = blankState({ settings: settings({ easyExamDay: true, dailyTokenGoal: 1 }), events: s.events })
    expect(S.dayCapacity(tiny, '2026-09-14')).toBe(1)
  })

  it('capacity על אירוע גובר על הכל — גם על חג, גם 0', () => {
    const s = blankState({
      settings: settings({ easyHoliday: true }),
      events: [
        event({ id: 'flight', date: '2026-09-29', endDate: '2026-10-06', capacity: 2 }),
        event({ id: 'hol', date: '2026-10-01', kind: 'holiday' }),
        event({ id: 'zero', date: '2026-10-10', capacity: 0 }),
        event({ id: 'bad', date: '2026-10-11', capacity: NaN }),
        event({ id: 'neg', date: '2026-10-12', capacity: -1 }),
      ],
    })
    expect(S.dayCapacity(s, '2026-09-29')).toBe(2)
    expect(S.dayCapacity(s, '2026-10-01')).toBe(2) // חג בתוך הטיסה — הטיסה קובעת
    expect(S.dayCapacity(s, '2026-10-06')).toBe(2)
    expect(S.dayCapacity(s, '2026-10-07')).toBe(6)
    expect(S.dayCapacity(s, '2026-10-10')).toBe(0)
    expect(S.dayCapacity(s, '2026-10-11')).toBe(6) // NaN מתעלמים
    expect(S.dayCapacity(s, '2026-10-12')).toBe(6) // שלילי מתעלמים
  })

  it('שני אירועים עם capacity — הקטן מנצח; אירוע מחוק לא נספר', () => {
    const s = blankState({
      events: [
        event({ id: 'a', date: '2026-09-20', capacity: 4 }),
        event({ id: 'b', date: '2026-09-20', capacity: 1 }),
        event({ id: 'c', date: '2026-09-21', capacity: 0, deleted: true }),
      ],
    })
    expect(S.dayCapacity(s, '2026-09-20')).toBe(1)
    expect(S.dayCapacity(s, '2026-09-21')).toBe(6)
  })

  it('יום הולדת שנתי לא משפיע על הקיבולת, אבל מופיע ב-eventsOn', () => {
    const s = blankState({ events: [event({ id: 'bd', date: '1999-09-20', kind: 'birthday', yearly: true })] })
    expect(S.dayCapacity(s, '2026-09-20')).toBe(6)
    expect(S.eventsOn(s, '2026-09-20').map((e) => e.id)).toEqual(['bd'])
    expect(S.eventsOn(s, '2026-09-21')).toHaveLength(0)
  })

  it('29.2 שנתי מוצג ב-28.2 בשנה לא מעוברת בלבד', () => {
    const s = blankState({ events: [event({ id: 'bd', date: '2000-02-29', kind: 'birthday', yearly: true })] })
    expect(S.eventsOn(s, '2027-02-28')).toHaveLength(1)
    expect(S.eventsOn(s, '2028-02-28')).toHaveLength(0)
    expect(S.eventsOn(s, '2028-02-29')).toHaveLength(1)
    expect(S.nextOccurrence(s.events[0], '2026-09-11')).toBe('2027-02-29')
  })

  it('capacityBetween סוכם קיבולת אמיתית (כולל)', () => {
    const s = blankState({
      settings: settings({ easyHoliday: true }),
      events: [event({ id: 'h', date: '2026-09-13', kind: 'holiday' })],
    })
    // 12 (שבת, 6) + 13 (חג, 0) + 14 (6) = 12
    expect(S.capacityBetween(s, '2026-09-12', '2026-09-14')).toBe(12)
    expect(S.capacityBetween(s, '2026-09-14', '2026-09-13')).toBe(0)
  })
})

describe('משימות לפי תאריך', () => {
  it('tasksDueOn: רק פתוחות, רק חיות, רק בתאריך המדויק', () => {
    const s = blankState({
      tasks: [
        task({ id: 'a', due: '2026-09-11' }),
        task({ id: 'b', due: '2026-09-11', status: 'done' }),
        task({ id: 'c', due: '2026-09-11', deleted: true }),
        task({ id: 'd', due: '2026-09-10' }),
        task({ id: 'e' }),
      ],
    })
    expect(S.tasksDueOn(s, '2026-09-11').map((t) => t.id)).toEqual(['a'])
    expect(S.plannedOn(blankState({ tasks: [task({ id: 'a', due: '2026-09-11', est: 2 }), task({ id: 'b', due: '2026-09-11', est: 3, status: 'doing' }), task({ id: 'c', due: '2026-09-11', est: 9, status: 'done' })] }), '2026-09-11')).toBe(5)
  })

  it('משימה באיחור: due לא נכתב מחדש בטעינה/מטריאליזציה, והיא נשארת "פתוחה באיחור"', async () => {
    const st = await freshStore(blankState({ tasks: [task({ id: 'late', due: '2026-09-01' })] }))
    const t = st.store.get().tasks.find((x) => x.id === 'late')!
    expect(t.due).toBe('2026-09-01')
    expect(t.status).toBe('todo')
    // הסלקטור של היום לא מציג אותה (היא לא של היום) — ה-UI מציג אותה כ"באיחור"
    expect(st.tasksDueOn(st.store.get(), '2026-09-11')).toHaveLength(0)
    // סימון ופתיחה מחדש לא נוגעים ב-due
    st.actions.toggleTaskDone('late')
    st.actions.toggleTaskDone('late')
    expect(st.store.get().tasks.find((x) => x.id === 'late')?.due).toBe('2026-09-01')
  })
})

describe('spreadTasks / hasSpreadRoom', () => {
  it('לא חורג מהקיבולת כשיש מקום', async () => {
    const st = await freshStore(
      blankState({
        tasks: ['a', 'b', 'c', 'd', 'e'].map((id) => task({ id, est: 3 })),
      }),
    )
    const before = st.spreadTasks(['a', 'b', 'c', 'd', 'e'], '2026-09-11', 21)
    expect(before).toEqual(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, due: undefined })))
    const s = st.store.get()
    const days = new Set(s.tasks.map((t) => t.due))
    for (const d of days) {
      expect(d).toBeDefined()
      expect(st.plannedOn(s, d!)).toBeLessThanOrEqual(st.dayCapacity(s, d!))
    }
    // 5×3 = 15 אסימונים, 6 ליום → לפחות 3 ימים
    expect(days.size).toBeGreaterThanOrEqual(3)
    // הראשון נוחת היום
    expect(s.tasks.find((t) => t.id === 'a')?.due).toBe('2026-09-11')
  })

  it('מדלג על ימים חסומים (חג) ואוכף גם מגבלת מספר משימות ליום', async () => {
    const st = await freshStore(
      blankState({
        settings: settings({ easyHoliday: true }),
        events: [event({ id: 'h', date: '2026-09-11', endDate: '2026-09-12', kind: 'holiday' })],
        tasks: Array.from({ length: 20 }, (_, i) => task({ id: `t${i}` })), // בלי הערכה
      }),
    )
    st.spreadTasks(st.store.get().tasks.map((t) => t.id), '2026-09-11', 21)
    const s = st.store.get()
    for (const t of s.tasks) {
      expect(t.due).toBeDefined()
      expect(t.due! >= '2026-09-13').toBe(true)
    }
    const count: Record<string, number> = {}
    for (const t of s.tasks) count[t.due!] = (count[t.due!] ?? 0) + 1
    for (const [d, n] of Object.entries(count)) expect(n).toBeLessThanOrEqual(st.dayCapacity(s, d) + 2)
  })

  it('כשאין מקום בכלל בטווח — לא נוגעים במשימות', async () => {
    const st = await freshStore(
      blankState({
        settings: settings({ easyHoliday: true }),
        events: [event({ id: 'h', date: '2026-09-11', endDate: '2026-10-11', kind: 'holiday' })],
        tasks: [task({ id: 'a', est: 1, due: '2026-08-01' })],
      }),
    )
    expect(st.hasSpreadRoom('2026-09-11', 21)).toBe(false)
    expect(st.hasSpreadRoom('2026-10-12', 21)).toBe(true)
    st.spreadTasks(['a'], '2026-09-11', 21)
    expect(st.store.get().tasks[0].due).toBe('2026-08-01')
  })

  it('משימה גדולה מכל יום — נופלת ליום הכי פנוי, ולא נזרקת', async () => {
    const st = await freshStore(blankState({ tasks: [task({ id: 'big', est: 20 })] }))
    st.spreadTasks(['big'], '2026-09-11', 3)
    expect(st.store.get().tasks[0].due).toBe('2026-09-11')
  })

  it('לא מפזר אל תוך ימים שכבר מלאים ממשימות קיימות', async () => {
    const st = await freshStore(
      blankState({
        tasks: [task({ id: 'full', est: 6, due: '2026-09-11' }), task({ id: 'new', est: 1 })],
      }),
    )
    st.spreadTasks(['new'], '2026-09-11', 21)
    expect(st.store.get().tasks.find((t) => t.id === 'new')?.due).toBe('2026-09-12')
  })
})
