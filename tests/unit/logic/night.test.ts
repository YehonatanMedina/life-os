// ---------------------------------------------------------------------------
// שגרת הערב: היומן הכתוב שורד מיזוג בין מכשירים, ההרגל הישן עובר לחלונות
// בלי לאבד שלבים שהמשתמש הוסיף, ושיבוץ משימה מוצא חלון פנוי אמיתי.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { journalBetween, mergeStates, migrateNightSteps } from '../../../src/store'
import { freeSlot, nightHabit, resumeStage, stageOfStep } from '../../../src/views/NightFlow'
import { NIGHT_STEPS, seedState } from '../../../src/seed'
import type { AppState, CalEvent, DayLog, HabitDef } from '../../../src/types'

const state = (over: Partial<AppState>): AppState => ({ ...seedState(), ...over })
const day = (over: Partial<DayLog>): DayLog => ({
  id: 'day-2026-09-26', updatedAt: 0, date: '2026-09-26', wake: null, habits: {}, steps: {}, ...over,
})

describe('היומן הכתוב במיזוג', () => {
  it('סימון הרגל מאוחר יותר במכשיר אחר לא דורס פסקה שנכתבה כאן', () => {
    const phone = state({ days: [day({ updatedAt: 100, journal: 'יום טוב, סגרתי את הפרק', journalAt: 100 })] })
    const desk = state({ days: [day({ updatedAt: 200, habits: { 'hb-night': true }, habitsAt: { 'hb-night': 200 } })] })
    for (const m of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      expect(m.days[0].journal).toBe('יום טוב, סגרתי את הפרק')
      expect(m.days[0].habits['hb-night']).toBe(true)
    }
  })

  it('עריכה חדשה יותר של היומן מנצחת — בשני הכיוונים', () => {
    const a = state({ days: [day({ updatedAt: 300, journal: 'טיוטה', journalAt: 100 })] })
    const b = state({ days: [day({ updatedAt: 150, journal: 'הגרסה המלאה', journalAt: 150 })] })
    expect(mergeStates(a, b).days[0].journal).toBe('הגרסה המלאה')
    expect(mergeStates(b, a).days[0].journal).toBe('הגרסה המלאה')
  })

  it('"לילה טוב" נשמר מאיזה צד שהוא', () => {
    const a = state({ days: [day({ updatedAt: 300 })] })
    const b = state({ days: [day({ updatedAt: 100, nightAt: 100 })] })
    expect(mergeStates(a, b).days[0].nightAt).toBe(100)
  })

  it('journalBetween מחזיר רק ימים שנכתב בהם, מהישן לחדש', () => {
    const s = state({
      days: [
        day({ id: 'd3', date: '2026-09-23', journal: 'שלישי' }),
        day({ id: 'd1', date: '2026-09-21', journal: 'ראשון' }),
        day({ id: 'd2', date: '2026-09-22', journal: '   ' }),
        day({ id: 'd9', date: '2026-09-29', journal: 'שבוע אחר' }),
      ],
    })
    expect(journalBetween(s, '2026-09-20', '2026-09-26')).toEqual([
      { date: '2026-09-21', text: 'ראשון' },
      { date: '2026-09-23', text: 'שלישי' },
    ])
  })
})

describe('מעבר ההרגל הישן לחלונות', () => {
  const old: HabitDef = {
    id: 'hb-night', updatedAt: 1, name: 'שגרת ערב', emoji: '🌙', minutes: 20, order: 2,
    steps: [
      { id: 'hn1', text: 'לסדר איזור' },
      { id: 'hn2', text: 'לארגן את מחר — מטרות ויומן' },
      { id: 'hs-mine', text: 'להכין בגדים למחר' },
      { id: 'hn3', text: 'לצחצח שיניים' },
      { id: 'hn4', text: 'לקרוא' },
    ],
  }

  it('ארבעה חלונות, והשלב שהוסיף בעצמו נשאר בצ׳קליסט לפני הקריאה', () => {
    const s = migrateNightSteps(state({ habits: [old] }))
    const h = s.habits.find((x) => x.id === 'hb-night')!
    expect(h.steps!.map((x) => x.id)).toEqual(['hn5', 'hn2', 'hn1', 'hn3', 'hs-mine', 'hn4'])
    expect(h.steps!.map((x) => stageOfStep(x))).toEqual([0, 1, 2, 2, 2, 3])
    expect(h.steps!.find((x) => x.id === 'hn1')!.text).toBe('לסדר חדר')
    expect(h.updatedAt).toBeGreaterThan(1)
  })

  it('רצה פעם אחת — שגרה שכבר יש בה חלונות לא נוגעים בה', () => {
    const once = migrateNightSteps(state({ habits: [old] }))
    expect(migrateNightSteps(once)).toBe(once)
  })

  it('שגרה שנמחקה לא חוזרת לחיים', () => {
    const s = state({ habits: [{ ...old, deleted: true }] })
    expect(migrateNightSteps(s)).toBe(s)
  })

  it('התקנה חדשה כבר באה עם החלונות', () => {
    expect(nightHabit(seedState())!.steps).toEqual(NIGHT_STEPS)
  })
})

describe('ממשיכים מהחלון שעוד לא נסגר', () => {
  it('כתב ובנה את מחר — ממשיכים בצ׳קליסט; סגר הכל חוץ מהקריאה — לקריאה', () => {
    const base = seedState()
    const s1 = { ...base, days: [day({ steps: { hn5: true, hn2: true } })] }
    expect(resumeStage(s1, '2026-09-26')).toBe(2)
    const s2 = { ...base, days: [day({ steps: { hn5: true, hn2: true, hn1: true, hn3: true } })] }
    expect(resumeStage(s2, '2026-09-26')).toBe(3)
    expect(resumeStage(base, '2026-09-26')).toBe(0)
  })
})

describe('שיבוץ משימה בחלון פנוי', () => {
  const ev = (start: string, end: string, deep = false): CalEvent => ({
    id: `e-${start}`, updatedAt: 1, title: start, date: '2026-09-27', start, end, allDay: false, kind: 'personal', deep,
  })

  it('מדלג על אירוע תפוס, אבל בלוק עבודה עמוקה הוא בדיוק המקום למשימה', () => {
    const s = state({ rules: [], events: [ev('08:30', '12:30', true), ev('09:00', '10:00')] })
    // 08:30 פנוי רק אם הפגישה לא חוסמת: 90 דקות מ-08:30 נתקעות בפגישה של 09:00
    expect(freeSlot(s, '2026-09-27', 90, 8 * 60 + 30)).toBe(10 * 60)
    expect(freeSlot(s, '2026-09-27', 30, 8 * 60 + 30)).toBe(8 * 60 + 30)
  })
})
