// קצב ריצה — פענוח הטווח שנכתב בתוכנית, והשוואה למה שבאמת נרוץ.
import { describe, it, expect } from 'vitest'
import { gradePace, paceText, parsePace, parsePaceRange } from '../../../src/skills'

describe('parsePace', () => {
  it('מפענח קצב תקין לדקות עשרוניות', () => {
    expect(parsePace('6:40')).toBeCloseTo(6 + 40 / 60, 5)
    expect(parsePace(' 5:00 ')).toBe(5)
    expect(parsePace('12:05')).toBeCloseTo(12 + 5 / 60, 5)
  })
  it('דוחה מה שאינו קצב', () => {
    expect(parsePace('6:60')).toBeNull()
    expect(parsePace('קל')).toBeNull()
    expect(parsePace('6')).toBeNull()
    expect(parsePace('')).toBeNull()
  })
})

describe('parsePaceRange', () => {
  it('טווח משני קצבים', () => {
    const r = parsePaceRange('6:40-7:10')!
    expect(r[0]).toBeCloseTo(6 + 40 / 60, 5)
    expect(r[1]).toBeCloseTo(7 + 10 / 60, 5)
  })
  it('מקבל מקף ארוך ומסדר טווח הפוך', () => {
    expect(parsePaceRange('7:10–6:40')).toEqual(parsePaceRange('6:40-7:10'))
  })
  it('קצב יחיד הוא טווח באורך אפס', () => {
    const r = parsePaceRange('5:50')!
    expect(r[0]).toBe(r[1])
  })
  it('null על טקסט חופשי או על ריק', () => {
    expect(parsePaceRange('קל ונוח')).toBeNull()
    expect(parsePaceRange(undefined)).toBeNull()
  })
})

describe('paceText', () => {
  it('חוזר לטקסט', () => {
    expect(paceText(6 + 40 / 60)).toBe('6:40')
    expect(paceText(5)).toBe('5:00')
  })
  it('עיגול של 59.7 שניות לא מייצר 6:60', () => {
    expect(paceText(5 + 59.7 / 60)).toBe('6:00')
  })
  it('ריק כשאין מה להציג', () => {
    expect(paceText(0)).toBe('')
    expect(paceText(NaN)).toBe('')
  })
})

describe('gradePace', () => {
  const range: [number, number] = [6 + 40 / 60, 7 + 10 / 60]
  it('בתוך הטווח', () => {
    expect(gradePace(6 + 50 / 60, range)).toBe('in')
  })
  it('מהר מדי ואיטי מדי', () => {
    expect(gradePace(6, range)).toBe('fast')
    expect(gradePace(8, range)).toBe('slow')
  })
  it('שוליים של 5 שניות לק״מ נחשבים בטווח', () => {
    expect(gradePace(6 + 37 / 60, range)).toBe('in')
    expect(gradePace(7 + 13 / 60, range)).toBe('in')
    expect(gradePace(6 + 30 / 60, range)).toBe('fast')
  })
})
