// ---------------------------------------------------------------------------
// טקסט הקריינות של מהדורת הבוקר, והחתמת קובץ השמע.
//
// מה זה פותר (16.9.2026): הגיליון נכתב עם "audio": "./news/latest.mp3" — שם
// קובץ קבוע. הקריינות של הבוקר נפלה, הקובץ הישן נשאר במקומו, והאפליקציה ניגנה
// בשקט את הקריינות של אתמול מתחת לכותרות של היום.
//
// מעכשיו: רק שלב הקריינות כותב את השדה audio, ותמיד עם חתימה של הטקסט שממנו
// הוקלט (?v=hash). מהדורה בלי קריינות פשוט נקראת בקול של הדפדפן — עדיף מלנגן
// את אתמול — ודפדפן לא יגיש קובץ שמור במקום חדש, כי הכתובת משתנה.
// ---------------------------------------------------------------------------
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const NEWS_DIR = 'docs/news'
export const AUDIO_FILE = 'docs/news/latest.mp3'
export const AUDIO_REL = './news/latest.mp3'

/** sections יכול להגיע כמערך או כאובייקט לפי מדור — אותו נרמול כמו src/news.ts */
export function normalizeSections(ed) {
  const raw = ed?.sections
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([key, v]) => ({
    key,
    title: v?.title ?? key,
    stories: Array.isArray(v) ? v : (v?.stories ?? []),
  }))
}

/** הקטעים שנשלחים לקריינות, בסדר הקראה */
export function narrationChunks(ed) {
  const parts = [ed?.intro]
  for (const sec of normalizeSections(ed)) {
    parts.push(`פרק ${sec.title}.`)
    for (const st of sec.stories ?? []) {
      parts.push(st.headline + '.')
      parts.push(st.body)
    }
  }
  parts.push(ed?.outro)
  return parts.filter(Boolean).map((t) => String(t).replace(/["״]/g, ''))
}

/** חתימה של הטקסט עצמו — מזהה קריינות, לא תאריך ולא מספר גרסה */
export function textHash(chunks) {
  const text = Array.isArray(chunks) ? chunks.join('\n\n') : String(chunks)
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 10)
}

export function audioUrl(hash) {
  return `${AUDIO_REL}?v=${hash}`
}

export function readSidecar(dir = NEWS_DIR) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'audio.json'), 'utf8'))
  } catch {
    return null
  }
}

export function writeSidecar(info, dir = NEWS_DIR) {
  fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify(info, null, 2) + '\n')
}

/** האם הקריינות שכבר יש היא של הטקסט הזה בדיוק (ולא של מהדורה אחרת) */
export function isAudioFresh(sidecar, ed, hash, bytes) {
  return (
    !!sidecar &&
    bytes > 500_000 &&
    sidecar.date === ed?.date &&
    sidecar.textHash === hash &&
    sidecar.bytes === bytes
  )
}

/** כותב את שדה audio בגיליון של היום ובעותק שבארכיון. מחזיר את הקבצים שנגעו בהם. */
export function stampEditions(url, date, dir = NEWS_DIR) {
  const touched = []
  for (const p of [path.join(dir, 'latest.json'), path.join(dir, 'archive', `${date}.json`)]) {
    let raw
    try {
      raw = fs.readFileSync(p, 'utf8')
    } catch {
      continue
    }
    const j = JSON.parse(raw)
    if (j.date !== date || j.audio === url) continue
    // מהדורה בארכיון ששמרו לה קובץ קריינות משלה — לא מחזירים אותה ל-latest.mp3,
    // שנדרס כל בוקר. זה מה שמאפשר להשמיע מהדורה ישנה כמו שהוקלטה.
    if (/[\/]archive[\/]/.test(p) && typeof j.audio === 'string' && j.audio.includes('/archive/')) continue
    j.audio = url
    let out = JSON.stringify(j, null, 2) + '\n'
    if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n')
    fs.writeFileSync(p, out)
    touched.push(p)
  }
  return touched
}
