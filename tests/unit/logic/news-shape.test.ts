// ---------------------------------------------------------------------------
// נרמול מהדורת הבוקר. הרקע: ב-16.9.2026 השגרה כתבה sections כאובייקט לפי מדור,
// הכרטיס דחה את הקובץ בשקט, ולא היו חדשות. מאז שתי הצורות עובדות.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { archivedEdition, normalizeEdition } from '../../../src/news'

const story = (n: string) => ({ headline: 'כותרת ' + n, body: 'גוף ' + n })
const base = { date: '2026-09-16', title: 'חדשות הבוקר', intro: 'בוקר טוב', outro: 'שיהיה יום טוב' }

describe('normalizeEdition', () => {
  it('מערך רגיל עובר כמו שהוא, לפי הסדר', () => {
    const ed = normalizeEdition({
      ...base,
      sections: [
        { key: 'israel', title: 'ישראל', stories: [story('א')] },
        { key: 'tech', title: 'טכנולוגיה', stories: [story('ב'), story('ג')] },
      ],
    })!
    expect(ed.sections.map((s) => s.key)).toEqual(['israel', 'tech'])
    expect(ed.sections[1].stories).toHaveLength(2)
  })

  it('אובייקט לפי מדור הופך למערך, עם הכותרות והסיפורים', () => {
    const ed = normalizeEdition({
      ...base,
      sections: {
        israel: { title: 'ישראל', stories: [story('א')] },
        tech: { title: 'טכנולוגיה, מדע וכלכלה', stories: [story('ב')] },
        culture: { title: 'תרבות', stories: [story('ג')] },
      },
    })!
    expect(ed.sections.map((s) => s.key)).toEqual(['israel', 'tech', 'culture'])
    expect(ed.sections[1].title).toBe('טכנולוגיה, מדע וכלכלה')
    expect(ed.sections.flatMap((s) => s.stories)).toHaveLength(3)
  })

  it('מדור שהוא מערך סיפורים ישר מקבל את המפתח ככותרת', () => {
    const ed = normalizeEdition({ ...base, sections: { israel: [story('א')] } })!
    expect(ed.sections[0]).toMatchObject({ key: 'israel', title: 'israel' })
  })

  it('מדור ריק נזרק, ומהדורה בלי אף סיפור מחזירה null', () => {
    const ed = normalizeEdition({
      ...base,
      sections: [
        { key: 'israel', title: 'ישראל', stories: [story('א')] },
        { key: 'tech', title: 'טק', stories: [] },
      ],
    })!
    expect(ed.sections).toHaveLength(1)
    expect(normalizeEdition({ ...base, sections: [] })).toBeNull()
    expect(normalizeEdition({ ...base, sections: { tech: { title: 'טק', stories: [] } } })).toBeNull()
  })

  it('שמע בלי חתימה לא מנוגן (יכול להיות של אתמול); עם חתימה — כן', () => {
    const one = { ...base, sections: [{ key: 'israel', title: 'ישראל', stories: [story('א')] }] }
    expect(normalizeEdition({ ...one, audio: './news/latest.mp3' })!.audio).toBeUndefined()
    expect(normalizeEdition({ ...one, audio: './news/latest.mp3?v=' })!.audio).toBeUndefined()
    expect(normalizeEdition({ ...one, audio: 42 })!.audio).toBeUndefined()
    expect(normalizeEdition(one)!.audio).toBeUndefined()
    expect(normalizeEdition({ ...one, audio: './news/latest.mp3?v=abc1234567' })!.audio).toBe(
      './news/latest.mp3?v=abc1234567',
    )
  })

  it('סיפור פגום נזרק; קלט שהוא לא מהדורה מחזיר null', () => {
    const ed = normalizeEdition({
      ...base,
      sections: [{ key: 'israel', title: 'ישראל', stories: [story('א'), { headline: 'בלי גוף' }, null] }],
    })!
    expect(ed.sections[0].stories).toHaveLength(1)
    expect(normalizeEdition(null)).toBeNull()
    expect(normalizeEdition({ sections: [] })).toBeNull()
    expect(normalizeEdition('לא מהדורה')).toBeNull()
  })

  it('מהדורה מהארכיון מנגנת רק קריינות ששמורה לה', () => {
    const secs = [{ key: 'israel', title: 'ישראל', stories: [story('א')] }]
    const ed = normalizeEdition({ ...base, sections: secs, audio: './news/latest.mp3?v=abc1234567' })!
    // latest.mp3 מתחלף כל בוקר — מהדורה ישנה שמצביעה עליו תוקרא בקול הדפדפן
    expect(archivedEdition(ed)!.audio).toBeUndefined()
    const kept = normalizeEdition({ ...base, sections: secs, audio: './news/archive/2026-09-21.mp3?v=abc1234567' })!
    expect(archivedEdition(kept)!.audio).toBe('./news/archive/2026-09-21.mp3?v=abc1234567')
    expect(archivedEdition(null)).toBeNull()
  })
})
