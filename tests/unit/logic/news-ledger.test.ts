// ---------------------------------------------------------------------------
// פנקס הסיפורים של מהדורת הבוקר. הרקע (20.9.2026): הסיפור של רומי סופר ב-17.9
// תחת כותרת עקיפה ("המשפטן בן שלושים ושבע שפגש נווד אחד") וסופר שוב ב-20.9.
// הכותרות עקיפות בכוונה, ולכן זיהוי החזרה חייב לבוא מגוף הסיפור.
// ---------------------------------------------------------------------------
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLedger, canon, flatten, indexStories, isRepeat, lede, overlap, tokenize } from '../../../scripts/news-ledger.mjs'
import { coveredForFeedback } from '../../../src/cloud'

const tmps: string[] = []
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const story = (headline: string, body: string) => ({ headline, body })
const ed = (date: string, stories: Array<{ headline: string; body: string }>) => ({
  date,
  sections: [{ key: 'culture', title: 'תרבות', stories }],
})

/** ארכיון קטן על הדיסק, במבנה של docs/news */
function archive(editions: unknown[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
  tmps.push(dir)
  fs.mkdirSync(path.join(dir, 'archive'))
  for (const e of editions as Array<{ date: string }>) {
    fs.writeFileSync(path.join(dir, 'archive', `${e.date}.json`), JSON.stringify(e))
  }
  return dir
}

const RUMI_A = story(
  'המשפטן בן שלושים ושבע שפגש נווד אחד',
  'בעיר קוניה שבאנטוליה חי מלומד מוסלמי בשם ג׳לאל א־דין, הידוע בכינוי רומי. לחייו נכנס שמס מתבריז, דרוויש נודד, ' +
    'והידידות ביניהם הוציאה את רומי משגרת בית המדרש אל השירה. משפחתו נמלטה מבלח מפני המונגולים.',
)
const RUMI_B = story(
  'ברח מהמונגולים, איבד חבר, והפך למשורר',
  'רומי נולד באזור בלח, ומשפחתו נמלטה מערבה מפני המונגולים עד שהתיישבה בקוניה שבאנטוליה. בגיל שלושים ושבע פגש ' +
    'את שמס מתבריז, דרוויש נודד, ומאז כתב שירה. ג׳לאל א־דין הפך למשורר המוכר בעולם.',
)
const OTHER = story(
  'אלבום הג׳אז שנמכר יותר מכולם',
  'שני ימי הקלטה בכנסייה משופצת בניו יורק, מיילס דייוויס וביל אוונס, וסולמות במקום אקורדים. האלבום נמכר במיליונים.',
)
const ALSO = story(
  'חפרו באר ומצאו צבא של שמונת אלפים',
  'איכרים בשיאן חפרו באר ומצאו פסלי חימר בגודל אדם, צבא הטרקוטה של הקיסר הראשון. הקבר עצמו עדיין קבור.',
)

describe('מילים', () => {
  it('גרש נשאר בתוך מילה, והמקף מפריד', () => {
    expect(tokenize('ג׳לאל א־דין')).toEqual(['ג׳לאל', 'א', 'דין'])
  })

  it('תחילית נחתכת רק כשהשארית היא מילה שקיימת בארכיון', () => {
    const vocab = new Map([['מונגולים', 4]])
    expect(canon('מהמונגולים', vocab)).toBe('מונגולים')
    expect(canon('מלחמה', vocab)).toBe('מלחמה')
  })
})

describe('זיהוי חזרה', () => {
  const idx = indexStories(flatten([ed('2026-09-17', [RUMI_A, OTHER]), ed('2026-09-20', [RUMI_B, ALSO])]))
  const find = (h: string) => idx.find((s) => s.headline.startsWith(h))!

  it('אותו סיפור בכותרת אחרת — חזרה', () => {
    const o = overlap(find('המשפטן'), find('ברח'))
    expect(o.shared).toEqual(expect.arrayContaining(['רומי', 'שמס', 'מתבריז', 'קוניה']))
    expect(isRepeat(o)).toBe(true)
  })

  it('שני סיפורים שונים — לא חזרה', () => {
    expect(isRepeat(overlap(find('אלבום'), find('חפרו')))).toBe(false)
    expect(isRepeat(overlap(find('המשפטן'), find('חפרו')))).toBe(false)
  })
})

describe('הפתיחה', () => {
  it('משפט ראשון ארוך מספיק — עוצרים בו', () => {
    const first =
      'נשיא המדינה יצחק הרצוג הודיע אתמול שהוא נענה לבקשתו של אלאור אזריה ומוחק את הרישום הפלילי שנשא עשר שנים, בניגוד לעמדת הצבא.'
    expect(lede(`${first} ההחלטה אינה מבטלת את ההרשעה.`)).toBe(first)
  })

  it('משפט ראשון קצר מדי כדי לזהות — מצרפים את הבא אחריו', () => {
    expect(lede('רומי נולד בבלח׳ בשנת אלף מאתיים ושבע. אחר כך הגיע לקוניה.')).toBe(
      'רומי נולד בבלח׳ בשנת אלף מאתיים ושבע. אחר כך הגיע לקוניה.',
    )
  })

  it('לא חורגת מהאורך המרבי גם במשפט אחד ארוך', () => {
    expect(lede('מ'.repeat(500)).length).toBe(220)
  })

  it('שורות ורווחים כפולים מתיישרים', () => {
    expect(lede('שורה ראשונה.\n\nשורה שנייה.')).toBe('שורה ראשונה. שורה שנייה.')
  })
})

describe('הפנקס', () => {
  it('הפתיחה של כל סיפור נשמרת — זה מה שהעורך שופט לפיו', () => {
    const led = buildLedger(archive([ed('2026-09-17', [RUMI_A, OTHER])]))
    expect(led.stories[0].lede).toContain('ג׳לאל א־דין')
    expect(led.stories[0].lede).not.toContain(led.stories[0].headline)
  })

  it('נושאים לכל סיפור, וחזרה מסומנת עם התאריך שבו סופרה', () => {
    const led = buildLedger(archive([ed('2026-09-17', [RUMI_A, OTHER]), ed('2026-09-20', [RUMI_B, ALSO])]))
    expect(led.stories).toHaveLength(4)
    // בארכיון אמיתי הנושאים הם שמות פרטיים (רומי, שמס); בארכיון של ארבעה
    // סיפורים כמעט כל מילה נדירה, ולכן נבדק כאן רק שיש נושאים בכלל
    expect(led.stories[0].subjects.length).toBeGreaterThan(0)
    expect(led.repeats).toHaveLength(1)
    expect(led.repeats[0].alreadyTold.date).toBe('2026-09-17')
  })

  it('ארכיון ריק לא מפיל', () => {
    const led = buildLedger(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-')))
    expect(led.stories).toEqual([])
    expect(led.repeats).toEqual([])
  })
})

describe('מה שנוסע לקובץ המשוב', () => {
  const now = new Date('2026-09-20T05:00:00Z')
  const text = JSON.stringify({
    about: 'מה כבר סופר',
    stories: [
      { date: '2026-06-01', headline: 'ישן', lede: 'פתיחה ישנה.', subjects: ['א'] },
      { date: '2026-09-19', headline: 'טרי', lede: 'פתיחה טרייה.', subjects: ['ב'] },
    ],
  })

  it('חלון של חודש אחרון בלבד', () => {
    const c = coveredForFeedback(text, 30, now) as { stories: Array<{ headline: string }> }
    expect(c.stories.map((s) => s.headline)).toEqual(['טרי'])
  })

  it('הפתיחה נוסעת, רשימת המילים של הבדיקה המכנית לא', () => {
    const c = coveredForFeedback(text, 30, now) as { stories: Array<Record<string, unknown>> }
    expect(c.stories[0].lede).toBe('פתיחה טרייה.')
    expect(c.stories[0]).not.toHaveProperty('subjects')
  })

  it('בלי פנקס, או עם קובץ פגום — פשוט לא מצרפים', () => {
    expect(coveredForFeedback('', 30, now)).toBeUndefined()
    expect(coveredForFeedback('{', 30, now)).toBeUndefined()
  })
})
