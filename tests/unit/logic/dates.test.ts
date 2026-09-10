import { describe, it, expect, beforeAll } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import {
  logicalDate, isAfterMidnight, weekStart, addDays, diffDays, addMonths, monthGrid, weekDates,
  parseLooseLine, parseLooseDetailed, minutesToTime, timeToMinutes, minutesToHM, iso, parseISO,
  countdownText, shortDateY, plural,
} from '../../../src/dates'

const at = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi).getTime()

describe('logicalDate — היום מתחלף ב-03:30', () => {
  it('חצות ודקה אחרי חצות שייכים לאתמול', () => {
    expect(logicalDate(at(2026, 9, 11, 0, 0))).toBe('2026-09-10')
    expect(logicalDate(at(2026, 9, 11, 0, 1))).toBe('2026-09-10')
  })
  it('03:29 עדיין אתמול, 03:30 כבר היום', () => {
    expect(logicalDate(at(2026, 9, 11, 3, 29))).toBe('2026-09-10')
    expect(logicalDate(at(2026, 9, 11, 3, 30))).toBe('2026-09-11')
    expect(logicalDate(at(2026, 9, 11, 3, 31))).toBe('2026-09-11')
  })
  it('23:59 הוא היום', () => {
    expect(logicalDate(at(2026, 9, 11, 23, 59))).toBe('2026-09-11')
  })
  it('חוצה חודש ושנה', () => {
    expect(logicalDate(at(2026, 10, 1, 2, 0))).toBe('2026-09-30')
    expect(logicalDate(at(2027, 1, 1, 1, 0))).toBe('2026-12-31')
  })
  it('isAfterMidnight תואם ל-logicalDate ביום רגיל', () => {
    expect(isAfterMidnight(at(2026, 9, 11, 3, 29))).toBe(true)
    expect(isAfterMidnight(at(2026, 9, 11, 3, 30))).toBe(false)
  })
  it('מעבר שעון קיץ (27.3.2026): 03:30–04:29 בשעון הקיר צריכים להיות היום, לא אתמול', () => {
    // בלילה הזה השעה קופצת מ-02:00 ל-03:00, ולכן 03:30 בשעון הקיר הוא רק שעתיים וחצי
    // אחרי חצות. logicalDate מחסר 3.5 שעות "אמיתיות" ונופל על אתמול — בעוד
    // isAfterMidnight (שעון קיר) אומר שכבר היום. שתי הפונקציות סותרות זו את זו.
    const t = at(2026, 3, 27, 4, 0)
    expect(isAfterMidnight(t)).toBe(false)
    // באג מתועד: מצפים ל-2026-03-27, בפועל 2026-03-26
    expect(logicalDate(t)).toBe('2026-03-27')
  })
})

describe('weekStart / addDays / diffDays', () => {
  it('weekStart הוא יום ראשון', () => {
    expect(weekStart('2026-09-11')).toBe('2026-09-06') // שישי -> ראשון
    expect(weekStart('2026-09-06')).toBe('2026-09-06') // ראשון נשאר
    expect(weekStart('2026-09-12')).toBe('2026-09-06') // שבת
    expect(weekStart('2026-09-13')).toBe('2026-09-13') // ראשון הבא
  })
  it('weekStart חוצה חודש ושנה', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-27')
    expect(weekStart('2027-01-01')).toBe('2026-12-27')
  })
  it('addDays חוצה חודש, שנה, ושנה מעוברת', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02')
  })
  it('addDays חוצה מעבר שעון קיץ בלי לאבד יום', () => {
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27')
    expect(addDays('2026-03-26', 2)).toBe('2026-03-28')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })
  it('diffDays סימטרי וחוצה שנה ושעון קיץ', () => {
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(-1)
    expect(diffDays('2026-03-26', '2026-03-28')).toBe(2)
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
  })
  it('addDays ו-diffDays הפוכים זה לזה על 400 ימים', () => {
    let d = '2026-01-01'
    for (let i = 1; i <= 400; i++) {
      d = addDays(d, 1)
      expect(diffDays('2026-01-01', d)).toBe(i)
    }
    expect(d).toBe('2027-02-05')
  })
  it('addMonths מה-31 לא גולש', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
  })
  it('monthGrid: 42 ימים, מתחיל בראשון, כולל את כל החודש', () => {
    const g = monthGrid('2026-09-15')
    expect(g).toHaveLength(42)
    expect(g[0]).toBe('2026-08-30')
    expect(g).toContain('2026-09-01')
    expect(g).toContain('2026-09-30')
  })
  it('weekDates מחזיר 7 ימים ראשון–שבת', () => {
    const w = weekDates('2026-09-11')
    expect(w).toEqual(['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'])
  })
  it('iso/parseISO הם היפוכים בזמן מקומי', () => {
    expect(iso(parseISO('2026-09-11'))).toBe('2026-09-11')
    expect(iso(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })
})

describe('שעות ודקות', () => {
  it('minutesToTime חותך ל-00:00–23:59', () => {
    expect(minutesToTime(-10)).toBe('00:00')
    expect(minutesToTime(1500)).toBe('23:59')
    expect(minutesToTime(90)).toBe('01:30')
  })
  it('timeToMinutes סובלני לקלט חלקי', () => {
    expect(timeToMinutes('08:30')).toBe(510)
    expect(timeToMinutes('')).toBe(0)
    expect(timeToMinutes('7')).toBe(420)
  })
  it('minutesToHM בעברית בלי נקודתיים', () => {
    expect(minutesToHM(45)).toBe('45 דק׳')
    expect(minutesToHM(120)).toBe('2 שע׳')
    expect(minutesToHM(450)).toBe('7 שע׳ 30 דק׳')
    expect(minutesToHM(-5)).toBe('0 דק׳')
  })
  it('minutesToHM על NaN לא מצייר "NaN שע׳ NaN דק׳"', () => {
    // באג מתועד: Math.max(0, NaN) הוא NaN, וזה מגיע למסך אם סשן אחד פגום
    expect(minutesToHM(NaN)).toBe('0 דק׳')
  })
  it('countdownText / plural / shortDateY', () => {
    expect(countdownText(0)).toBe('היום!')
    expect(countdownText(1)).toBe('מחר')
    expect(countdownText(-3)).toBe('עבר לפני 3 ימים')
    expect(plural(1, 'אסימון אחד', 'אסימונים')).toBe('אסימון אחד')
    expect(plural(3, 'אסימון אחד', 'אסימונים')).toBe('3 אסימונים')
    expect(shortDateY('2027-01-01', '2026-09-11')).toBe('1.1.2027')
    expect(shortDateY('2026-10-01', '2026-09-11')).toBe('1.10')
  })
})

describe('parseLooseLine — תאריך מתוך טקסט חופשי (מ-2026-09-11)', () => {
  const from = '2026-09-11'
  it('"30/8 יום הולדת" — המופע הבא, כי 30.8 כבר עבר', () => {
    expect(parseLooseLine('30/8 יום הולדת', from)).toEqual({ date: '2027-08-30', title: 'יום הולדת' })
  })
  it('"30.8.1999" — שנה מלאה, בלי כותרת', () => {
    expect(parseLooseDetailed('30.8.1999', from)).toEqual({ date: '1999-08-30', title: '' })
  })
  it('"2026-08-30 מבחן" — ISO עם שנה מפורשת, גם אם עבר', () => {
    expect(parseLooseLine('2026-08-30 מבחן', from)).toEqual({ date: '2026-08-30', title: 'מבחן' })
  })
  it('התאריך יכול להופיע אחרי השם', () => {
    expect(parseLooseLine('עידו 30/8', from)).toEqual({ date: '2027-08-30', title: 'עידו' })
    expect(parseLooseLine('פגישה עם דנה 15.10', from)).toEqual({ date: '2026-10-15', title: 'פגישה עם דנה' })
  })
  it('תאריך היום עצמו נחשב השנה, לא בשנה הבאה', () => {
    expect(parseLooseLine('11.9 היום', from)?.date).toBe('2026-09-11')
  })
  it('29.2 נופל על שנה מעוברת', () => {
    expect(parseLooseLine('29.2 יום הולדת', from)?.date).toBe('2028-02-29')
  })
  it('31.4 לא קיים — אין תאריך, הכותרת נשארת שלמה', () => {
    expect(parseLooseDetailed('31.4 משהו', from)).toEqual({ date: null, title: '31.4 משהו' })
  })
  it('שנה דו־ספרתית לעולם לא בעתיד (שנת לידה)', () => {
    expect(parseLooseLine('30/8/99 עידו', from)?.date).toBe('1999-08-30')
    expect(parseLooseLine('30/8/26 עידו', from)?.date).toBe('2026-08-30')
    expect(parseLooseLine('30/8/27 עידו', from)?.date).toBe('1927-08-30')
  })
  it('פורמטים: 2026/08/30, 2026.8.30, 30-8', () => {
    expect(parseLooseLine('2026/08/30 א', from)?.date).toBe('2026-08-30')
    expect(parseLooseLine('2026.8.30 א', from)?.date).toBe('2026-08-30')
    expect(parseLooseLine('30-8 א', from)?.date).toBe('2027-08-30')
  })
  it('מספרים ארוכים וגרסאות לא נחשבים תאריך', () => {
    expect(parseLooseLine('חדר 305.8', from)).toBeNull()
    expect(parseLooseLine('v1.2.3 שחרור', from)).toBeNull()
    expect(parseLooseLine('טלפון 052-1234567', from)).toBeNull()
  })
  it('תווי כיווניות בלתי נראים מוסרים', () => {
    expect(parseLooseLine('‏30/8‎ יום הולדת', from)).toEqual({ date: '2027-08-30', title: 'יום הולדת' })
  })
  it('מפרידים בקצוות מנוקים, באמצע השם נשמרים', () => {
    expect(parseLooseLine('30/8 - יום הולדת', from)?.title).toBe('יום הולדת')
    expect(parseLooseLine('יום-הולדת 30/8', from)?.title).toBe('יום-הולדת')
    expect(parseLooseLine('30/8: עידו, אמא', from)?.title).toBe('עידו, אמא')
  })
  it('שורה ריקה ומרווחים', () => {
    expect(parseLooseDetailed('   ', from)).toEqual({ date: null, title: '' })
    expect(parseLooseDetailed('סתם טקסט', from)).toEqual({ date: null, title: 'סתם טקסט' })
  })
  it('חודש 13 ויום 0 נדחים', () => {
    expect(parseLooseLine('5.13 משהו', from)).toBeNull()
    expect(parseLooseLine('0.5 משהו', from)).toBeNull()
  })
  it('ISO עם תאריך לא קיים נדחה', () => {
    expect(parseLooseLine('2027-02-29 מבחן', from)).toBeNull()
  })
})
