import { describe, it, expect } from 'vitest'
import { logicalDate, addDays } from '../../src/dates'

describe('היום הלוגי מתחלף ב-03:30', () => {
  it('01:00 בלילה שייך לאתמול', () => {
    const d = new Date(2026, 8, 11, 1, 0, 0) // 11.9 01:00 מקומי
    expect(logicalDate(d.getTime())).toBe('2026-09-10')
  })
  it('03:30 כבר שייך להיום', () => {
    const d = new Date(2026, 8, 11, 3, 30, 0)
    expect(logicalDate(d.getTime())).toBe('2026-09-11')
  })
  it('addDays חוצה חודש', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })
})
