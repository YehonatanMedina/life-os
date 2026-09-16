// ---------------------------------------------------------------------------
// מעבר שעון קיץ/חורף בישראל. היום הלוגי מתחלף ב-03:30, ובלילה של המעבר
// השעון לא זורם רגיל: בסוף אוקטובר השעה 01:00–02:00 קורית פעמיים, ובסוף מרץ
// 02:00 מדלגת ל-03:00. כאן מוודאים שהתאריך שהאפליקציה רושמת עליו — סשן,
// הרגל, משימה — לא קופץ יום קדימה או אחורה בלילה הזה.
//
// התאריכים: 25.10.2026 (חזרה לשעון חורף), 27.3.2026 (מעבר לשעון קיץ).
// הבדיקות רצות ב-Asia/Jerusalem (נקבע ב-vi.hoisted למטה).
// ---------------------------------------------------------------------------
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { DAY_SWITCH_MIN, addDays, isAfterMidnight, logicalDate, weekStart } from '../../../src/dates'

/** רגע לפי שעון הקיר המקומי */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
/** רגע לפי UTC — כדי לתפוס את השעה הכפולה בלילה של מעבר השעון */
const utc = (iso: string) => new Date(iso).getTime()

describe('שעון חורף — 25.10.2026, 02:00 חוזרת ל-01:00', () => {
  it('השעה הכפולה 01:30 נופלת על 24.10 בשני המעברים — לא יום קדימה', () => {
    // 01:30 שעון קיץ (UTC+3) ואחריה 01:30 שעון חורף (UTC+2) — אותה שעת קיר, שני רגעים
    const firstPass = utc('2026-10-24T22:30:00Z')
    const secondPass = utc('2026-10-24T23:30:00Z')
    expect(new Date(firstPass).getHours()).toBe(1)
    expect(new Date(secondPass).getHours()).toBe(1)
    expect(logicalDate(firstPass)).toBe('2026-10-24')
    expect(logicalDate(secondPass)).toBe('2026-10-24')
    expect(isAfterMidnight(firstPass)).toBe(true)
    expect(isAfterMidnight(secondPass)).toBe(true)
  })

  it('03:29 עדיין 24.10, 03:30 כבר 25.10 — הגבול נשמר גם ביום המעבר', () => {
    expect(logicalDate(at(2026, 10, 25, 3, 29))).toBe('2026-10-24')
    expect(logicalDate(at(2026, 10, 25, 3, 30))).toBe('2026-10-25')
    expect(isAfterMidnight(at(2026, 10, 25, 3, 30))).toBe(false)
  })

  it('היום ארך 25 שעות ובכל זאת ערב 25.10 הוא 25.10', () => {
    expect(logicalDate(at(2026, 10, 25, 12, 0))).toBe('2026-10-25')
    expect(logicalDate(at(2026, 10, 25, 23, 59))).toBe('2026-10-25')
    expect(logicalDate(at(2026, 10, 26, 2, 0))).toBe('2026-10-25')
  })

  it('addDays מעל המעבר לא מחליק יום (הוא עובד על תאריכים, לא על מילישניות)', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-10-23', 7)).toBe('2026-10-30')
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19')
  })

  it('תחילת השבוע נשארת ראשון, גם בשבוע של המעבר', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-25')
    expect(weekStart('2026-10-24')).toBe('2026-10-18')
    expect(weekStart('2026-10-31')).toBe('2026-10-25')
  })
})

describe('שעון קיץ — 27.3.2026, 02:00 מדלגת ל-03:00', () => {
  it('01:59 הוא עדיין 26.3, ו-03:30 (הרגע שאחרי הדילוג) הוא 27.3', () => {
    expect(logicalDate(at(2026, 3, 27, 1, 59))).toBe('2026-03-26')
    expect(logicalDate(at(2026, 3, 27, 3, 30))).toBe('2026-03-27')
    expect(logicalDate(at(2026, 3, 27, 4, 0))).toBe('2026-03-27')
  })

  it('השעה שלא קיימת (02:30) לא מפילה ולא מחזירה תאריך שגוי', () => {
    // הדפדפן מזיז 02:30 ל-03:30 שעון קיץ; העיקר שהתאריך נשאר של היום שהתחיל
    const d = logicalDate(at(2026, 3, 27, 2, 30))
    expect(['2026-03-26', '2026-03-27']).toContain(d)
  })

  it('היום ארך 23 שעות — ובכל זאת 23:00 של 27.3 הוא 27.3', () => {
    expect(logicalDate(at(2026, 3, 27, 23, 0))).toBe('2026-03-27')
    expect(logicalDate(at(2026, 3, 28, 3, 29))).toBe('2026-03-27')
  })

  it('addDays ותחילת שבוע מעל המעבר', () => {
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27')
    expect(addDays('2026-03-27', 1)).toBe('2026-03-28')
    expect(weekStart('2026-03-27')).toBe('2026-03-22')
  })
})

describe('הגבול עצמו', () => {
  it('03:30 בדקות, ולא חצות', () => {
    expect(DAY_SWITCH_MIN).toBe(210)
  })

  it('כל יום בשנה: התאריך הלוגי ב-12:00 שווה לתאריך הקיר, וב-01:00 ליום שלפניו', () => {
    for (let m = 1; m <= 12; m++) {
      for (const day of [1, 15, 28]) {
        const noon = at(2026, m, day, 12, 0)
        const iso = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        expect(logicalDate(noon)).toBe(iso)
        expect(logicalDate(at(2026, m, day, 1, 0))).toBe(addDays(iso, -1))
      }
    }
  })

  it('שנה מעוברת: 29.2.2028 ו-1.3 סביבו', () => {
    expect(logicalDate(at(2028, 2, 29, 12, 0))).toBe('2028-02-29')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(logicalDate(at(2028, 3, 1, 1, 0))).toBe('2028-02-29')
  })

  it('סוף שנה: 31.12 בלילה עדיין 31.12', () => {
    expect(logicalDate(at(2026, 12, 31, 23, 59))).toBe('2026-12-31')
    expect(logicalDate(at(2027, 1, 1, 2, 0))).toBe('2026-12-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
