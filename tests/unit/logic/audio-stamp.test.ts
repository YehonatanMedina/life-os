// ---------------------------------------------------------------------------
// חתימת הקריינות. הרקע (16.9.2026): הגיליון הצביע על שם קובץ קבוע, הקריינות
// של הבוקר נפלה, והאפליקציה ניגנה את הקריינות של אתמול מתחת לכותרות של היום.
// ---------------------------------------------------------------------------
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  audioUrl, isAudioFresh, narrationChunks, normalizeSections, readSidecar, stampEditions, textHash, writeSidecar,
} from '../../../scripts/edition-text.mjs'

const ed = {
  date: '2026-09-16',
  intro: 'בוקר טוב, יהונתן.',
  outro: 'שיהיה יום טוב.',
  sections: [
    { key: 'israel', title: 'ישראל', stories: [{ headline: 'כותרת א', body: 'גוף א' }] },
    { key: 'tech', title: 'טכנולוגיה', stories: [{ headline: 'כותרת ב', body: 'גוף ב' }] },
  ],
}

const tmps: string[] = []
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'news-'))
  tmps.push(d)
  fs.mkdirSync(path.join(d, 'archive'))
  return d
}
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('טקסט הקריינות', () => {
  it('פותח בפתיח, מכריז על כל מדור, ומסיים בסיום', () => {
    expect(narrationChunks(ed)).toEqual([
      'בוקר טוב, יהונתן.',
      'פרק ישראל.',
      'כותרת א.',
      'גוף א',
      'פרק טכנולוגיה.',
      'כותרת ב.',
      'גוף ב',
      'שיהיה יום טוב.',
    ])
  })

  it('מדורים כאובייקט מתנרמלים, ומרכאות יורדות (הקריין הקריא אותן)', () => {
    const asObj = { ...ed, sections: { israel: { title: 'ישראל', stories: [{ headline: 'כטב"ם', body: 'גוף' }] } } }
    expect(normalizeSections(asObj).map((s) => s.key)).toEqual(['israel'])
    expect(narrationChunks(asObj)).toContain('כטבם.')
  })

  it('מהדורה ריקה לא מפילה — יוצא טקסט ריק', () => {
    expect(narrationChunks({ date: 'x' })).toEqual([])
    expect(narrationChunks(null)).toEqual([])
  })
})

describe('חתימה', () => {
  it('אותו טקסט — אותה חתימה; תו אחד שונה — חתימה אחרת', () => {
    const a = textHash(narrationChunks(ed))
    expect(a).toMatch(/^[0-9a-f]{10}$/)
    expect(textHash(narrationChunks(ed))).toBe(a)
    expect(textHash(narrationChunks({ ...ed, outro: 'שיהיה יום טוב!' }))).not.toBe(a)
  })

  it('הכתובת נושאת את החתימה — דפדפן לא יגיש קובץ שמור מאתמול', () => {
    expect(audioUrl('abc1234567')).toBe('./news/latest.mp3?v=abc1234567')
  })
})

describe('האם צריך להקליט שוב', () => {
  const hash = textHash(narrationChunks(ed))
  const side = { date: ed.date, textHash: hash, bytes: 9_000_000 }

  it('קריינות שנעשתה מהטקסט הזה — לא מקליטים שוב', () => {
    expect(isAudioFresh(side, ed, hash, 9_000_000)).toBe(true)
  })

  it('גיליון חדש, קריינות של אתמול — מקליטים', () => {
    expect(isAudioFresh({ ...side, date: '2026-09-15' }, ed, hash, 9_000_000)).toBe(false)
    expect(isAudioFresh({ ...side, textHash: 'ffffffffff' }, ed, hash, 9_000_000)).toBe(false)
  })

  it('בלי רישום, או כשהקובץ הוחלף או חתוך — מקליטים', () => {
    expect(isAudioFresh(null, ed, hash, 9_000_000)).toBe(false)
    expect(isAudioFresh(side, ed, hash, 8_000_000)).toBe(false)
    expect(isAudioFresh({ ...side, bytes: 1000 }, ed, hash, 1000)).toBe(false)
  })

  it('הרישום נכתב ונקרא', () => {
    const d = tmpDir()
    expect(readSidecar(d)).toBeNull()
    writeSidecar({ date: ed.date, textHash: hash, bytes: 9_000_000, provider: 'elevenlabs' }, d)
    expect(readSidecar(d)).toMatchObject({ date: ed.date, textHash: hash, provider: 'elevenlabs' })
  })
})

describe('החתמת הגיליון', () => {
  it('מחתימה את היום ואת הארכיון, שומרת על סופי שורה, ולא נוגעת בתאריך אחר', () => {
    const d = tmpDir()
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify(ed, null, 2).replace(/\n/g, '\r\n') + '\r\n')
    fs.writeFileSync(path.join(d, 'archive', '2026-09-16.json'), JSON.stringify(ed, null, 2) + '\n')
    fs.writeFileSync(path.join(d, 'archive', '2026-09-15.json'), JSON.stringify({ ...ed, date: '2026-09-15' }, null, 2) + '\n')

    const url = audioUrl('abc1234567')
    const touched = stampEditions(url, ed.date, d)
    expect(touched).toHaveLength(2)
    const raw = fs.readFileSync(path.join(d, 'latest.json'), 'utf8')
    expect(raw.includes('\r\n')).toBe(true)
    expect(JSON.parse(raw).audio).toBe(url)
    expect(JSON.parse(fs.readFileSync(path.join(d, 'archive', '2026-09-16.json'), 'utf8')).audio).toBe(url)
    expect(JSON.parse(fs.readFileSync(path.join(d, 'archive', '2026-09-15.json'), 'utf8')).audio).toBeUndefined()
    // פעם שנייה — אין מה לשנות
    expect(stampEditions(url, ed.date, d)).toEqual([])
  })

  it('קריינות ששמורה בארכיון לא מוחלפת ב-latest.mp3', () => {
    const d = tmpDir()
    const kept = './news/archive/2026-09-16.mp3?v=0123456789'
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify(ed, null, 2) + '\n')
    fs.writeFileSync(path.join(d, 'archive', '2026-09-16.json'), JSON.stringify({ ...ed, audio: kept }, null, 2) + '\n')

    const url = audioUrl('abc1234567')
    expect(stampEditions(url, ed.date, d)).toEqual([path.join(d, 'latest.json')])
    expect(JSON.parse(fs.readFileSync(path.join(d, 'archive', '2026-09-16.json'), 'utf8')).audio).toBe(kept)
  })

  it('גיליון שלא קיים או שהתאריך בו אחר — לא נוגעים', () => {
    const d = tmpDir()
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify({ ...ed, date: '2026-09-15' }, null, 2) + '\n')
    expect(stampEditions(audioUrl('abc1234567'), ed.date, d)).toEqual([])
  })
})
