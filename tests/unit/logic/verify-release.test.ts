// ---------------------------------------------------------------------------
// אימות שחרור. הרקע: ב-16.9.2026 גם מהדורה במבנה חורג וגם קריינות של אתמול
// עברו בשקט. הבדיקות כאן הן על החלקים שמזהים בדיוק את שני המקרים האלה.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { audioProblems, buildStamp, editionProblems, swVersion } from '../../../scripts/verify-release.mjs'

const story = (n: string) => ({ headline: 'כותרת ' + n, body: 'גוף ' + n })
const section = (key: string) => ({ key, title: key, stories: [story('א'), story('ב'), story('ג')] })
const TODAY = '2026-09-16'
const good = { date: TODAY, sections: [section('israel'), section('tech'), section('culture')] }

describe('חותמות', () => {
  it('חותמת הבנייה נקראת מה-HTML', () => {
    expect(buildStamp('<meta charset="UTF-8" />\n<meta name="build" content="20260916T054804" />')).toBe('20260916T054804')
    expect(buildStamp('<html></html>')).toBeNull()
    expect(buildStamp(null)).toBeNull()
  })

  it('גרסת ה-Service Worker נקראת מהקוד', () => {
    expect(swVersion("const VERSION = 'v8'\nconst SHELL = 'x'")).toBe('v8')
    expect(swVersion('const OTHER = 1')).toBeNull()
  })
})

describe('מבנה המהדורה', () => {
  it('מהדורה תקינה — בלי תקלות', () => {
    expect(editionProblems(good, TODAY)).toEqual([])
  })

  it('sections כאובייקט — נתפס (זה הבאג של 16.9)', () => {
    const asObj = { date: TODAY, sections: { israel: { title: 'ישראל', stories: [story('א')] } } }
    expect(editionProblems(asObj, TODAY).join(' ')).toMatch(/sections אינו מערך/)
  })

  it('מהדורה של אתמול, סדר מדורים אחר, ומדור חסר סיפורים', () => {
    expect(editionProblems({ ...good, date: '2026-09-15' }, TODAY).join(' ')).toMatch(/2026-09-15/)
    const swapped = { ...good, sections: [section('tech'), section('israel'), section('culture')] }
    expect(editionProblems(swapped, TODAY).join(' ')).toMatch(/לא בסדר הצפוי/)
    const short = { ...good, sections: [section('israel'), { key: 'tech', title: 'tech', stories: [story('א')] }, section('culture')] }
    expect(editionProblems(short, TODAY).join(' ')).toMatch(/מכיל 1 סיפורים/)
  })

  it('סיפור בלי גוף, וקלט שאינו מהדורה', () => {
    const holey = { ...good, sections: [{ key: 'israel', title: 'י', stories: [story('א'), story('ב'), { headline: 'בלי גוף' }] }, section('tech'), section('culture')] }
    expect(editionProblems(holey, TODAY).join(' ')).toMatch(/בלי כותרת או גוף/)
    expect(editionProblems(null, TODAY)).toHaveLength(1)
  })
})

describe('הקריינות', () => {
  const side = { date: TODAY, textHash: 'abc1234567', bytes: 9_000_000 }

  it('חתימה שמתאימה לרישום — תקין', () => {
    expect(audioProblems({ ...good, audio: './news/latest.mp3?v=abc1234567' }, side)).toEqual([])
  })

  it('שדה audio בלי חתימה — נתפס', () => {
    expect(audioProblems({ ...good, audio: './news/latest.mp3' }, side).join(' ')).toMatch(/בלי חתימה/)
  })

  it('החתימה של טקסט אחר, או קריינות של יום אחר — נתפס', () => {
    expect(audioProblems({ ...good, audio: './news/latest.mp3?v=ffffffffff' }, side).join(' ')).toMatch(/הטקסט השתנה/)
    expect(audioProblems({ ...good, audio: './news/latest.mp3?v=abc1234567' }, { ...side, date: '2026-09-15' }).join(' ')).toMatch(/2026-09-15/)
  })

  it('בלי שדה audio: תקין אם אין קריינות, תקלה אם יש קריינות שלא נרשמה בגיליון', () => {
    expect(audioProblems(good, null)).toEqual([])
    expect(audioProblems(good, { ...side, date: '2026-09-15' })).toEqual([])
    expect(audioProblems(good, side).join(' ')).toMatch(/שדה audio חסר/)
  })
})
