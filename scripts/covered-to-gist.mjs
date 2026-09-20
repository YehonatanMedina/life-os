// ---------------------------------------------------------------------------
// מעביר את פנקס הסיפורים (docs/news/covered.json) אל קובץ המשוב שבמחסן.
//
// למה: העורך בענן קורא בכל בוקר רק את news-feedback.json. האפליקציה מצרפת לו
// את הפנקס בכל סנכרון, אבל אם הטלפון לא נפתח מאז הגיליון הקודם — העורך היה
// כותב בלי לדעת מה כבר סיפר. הסקריפט הזה רץ אחרי כל גיליון ומעדכן את השדה
// covered בלבד, בלי לגעת במשוב עצמו (הסימונים וההערות הם של האפליקציה).
// ---------------------------------------------------------------------------
import fs from 'fs'

const { GIST_TOKEN, GIST_ID } = process.env
const FILE = 'news-feedback.json'
const DAYS = 30

if (!GIST_TOKEN || !GIST_ID) {
  console.log('no gist credentials — skipping')
  process.exit(0)
}

const api = (path, init = {}) =>
  fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GIST_TOKEN}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

const led = JSON.parse(fs.readFileSync('docs/news/covered.json', 'utf8'))
const from = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10)
const covered = {
  about: led.about,
  stories: (led.stories ?? []).filter((s) => s.date >= from),
  repeats: led.repeats ?? [],
}

const res = await api(`/gists/${GIST_ID}`)
if (!res.ok) {
  console.log('gist read failed:', res.status)
  process.exit(0)
}
const gist = await res.json()
const f = gist.files?.[FILE]
// קובץ גדול מגיע חתוך, ואז יש raw_url לתוכן המלא
const raw = f?.truncated && f?.raw_url ? await (await fetch(f.raw_url)).text() : f?.content
let feedback
try {
  feedback = raw ? JSON.parse(raw) : { about: 'משוב המשתמש על מהדורות הבוקר.', editions: [] }
} catch {
  console.log('feedback file is not valid json — leaving it alone')
  process.exit(0)
}

feedback.covered = covered
const body = JSON.stringify(feedback, null, 2)
const put = await api(`/gists/${GIST_ID}`, {
  method: 'PATCH',
  body: JSON.stringify({ files: { [FILE]: { content: body } } }),
})
console.log(put.ok ? `covered → ${FILE}: ${covered.stories.length} stories` : `gist write failed: ${put.status}`)
