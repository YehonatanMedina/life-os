// ---------------------------------------------------------------------------
// פנקס הסיפורים של מהדורת הבוקר — מה כבר סופר, ומה חוזר על עצמו.
//
// מה זה פותר (20.9.2026): ב-17.9 סופר הסיפור של רומי תחת הכותרת "המשפטן בן
// שלושים ושבע שפגש נווד אחד", וב-20.9 הוא סופר שוב תחת "הסיפור של רומי".
// העורך רואה לפני הכתיבה את הכותרות של הימים האחרונים בלבד, והכותרות כאן
// עקיפות בכוונה — אי אפשר לדעת מהן על מי הסיפור. לכן המדד לחזרה חייב להיות
// גוף הסיפור, לא הכותרת.
//
// המנגנון: כל סיפור בארכיון מתומצת ל"נושאים" — המילים הנדירות שלו ביחס לכל
// הארכיון (רומי, שמס, קוניה, דרוויש). שתי חפיפות נושאים = אותו סיפור.
// הפנקס נכתב ל-docs/news/covered.json, והאפליקציה מצרפת אותו לקובץ המשוב
// שהעורך קורא בכל בוקר לפני שהוא בוחר סיפורים.
//
//   node scripts/news-ledger.mjs build          # בונה את docs/news/covered.json
//   node scripts/news-ledger.mjs brief [ימים]   # מה כבר סופר, לקריאה
//   node scripts/news-ledger.mjs check [קובץ]   # האם הגיליון חוזר על עצמו (יציאה 1)
// ---------------------------------------------------------------------------
import fs from 'fs'
import path from 'path'

export const NEWS_DIR = 'docs/news'
export const LEDGER_FILE = 'covered.json'

/** מדור יכול להגיע כמערך או כאובייקט — אותו נרמול כמו src/news.ts */
export function sectionsOf(ed) {
  const raw = ed?.sections
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.entries(raw).map(([key, v]) => ({ key, title: v?.title ?? key, stories: Array.isArray(v) ? v : v?.stories }))
      : []
  return list.map((s) => ({
    key: String(s?.key ?? ''),
    title: String(s?.title ?? s?.key ?? ''),
    stories: (Array.isArray(s?.stories) ? s.stories : []).filter((st) => st && typeof st.headline === 'string'),
  }))
}

// מילה עברית: אותיות, עם גרש/גרשיים באמצע (ג'לאל, צה"ל). המקף העברי מפריד.
const WORD = /[א-ת]+(?:['"׳״][א-ת]+)*/g

export function tokenize(text) {
  return String(text ?? '').match(WORD) ?? []
}

const PREFIX = new Set(['ו', 'ה', 'ב', 'ל', 'כ', 'מ', 'ש'])

/**
 * מסיר תחיליות רק כשהשארית היא מילה שקיימת בפני עצמה בארכיון. כך
 * "מהמונגולים" ו"המונגולים" נפגשים ב"מונגולים", ו"מלחמה" לא הופכת ל"לחמה".
 */
export function canon(word, vocab, depth = 0) {
  if (depth >= 2 || word.length < 5 || !PREFIX.has(word[0])) return word
  const rest = canon(word.slice(1), vocab, depth + 1)
  return vocab.has(rest) ? rest : word
}

/** כל הגיליונות שבארכיון, מהישן לחדש */
export function readArchive(dir = NEWS_DIR) {
  const adir = path.join(dir, 'archive')
  if (!fs.existsSync(adir)) return []
  return fs
    .readdirSync(adir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(adir, f), 'utf8'))
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** מיישר גיליונות לרשימת סיפורים שטוחה */
export function flatten(editions) {
  const out = []
  for (const ed of editions) {
    const date = String(ed?.date ?? '')
    if (!date) continue
    for (const sec of sectionsOf(ed)) {
      for (const st of sec.stories) {
        out.push({ date, section: sec.title || sec.key, headline: st.headline, text: `${st.headline} ${st.body ?? ''}` })
      }
    }
  }
  return out
}

// סיפור נדיר = מילה שמופיעה בחלק קטן מהסיפורים. מילות קישור ומספרים במילים
// מופיעים כמעט בכל סיפור ונושרים מעצמם — בלי רשימת מילות עצירה לתחזק.
const RARE_SHARE = 0.05

/**
 * בונה אינדקס: לכל סיפור חתימה של מילים נדירות עם משקל (idf).
 * מקבל את כל הסיפורים יחד, כי "נדיר" נמדד מול הארכיון כולו.
 */
export function indexStories(stories) {
  const vocab = new Map()
  const raw = stories.map((s) => tokenize(s.text))
  for (const words of raw) for (const w of words) vocab.set(w, (vocab.get(w) ?? 0) + 1)

  const counts = raw.map((words) => {
    const m = new Map()
    for (const w of words) {
      const c = canon(w, vocab)
      if (c.length < 3) continue
      m.set(c, (m.get(c) ?? 0) + 1)
    }
    return m
  })

  const df = new Map()
  for (const m of counts) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const N = Math.max(1, stories.length)
  const maxDf = Math.max(2, Math.floor(N * RARE_SHARE))

  return stories.map((s, i) => {
    // הווקטור כולו משמש להשוואה; רק הראשונים בו מוצגים כ"נושאים"
    const sig = [...counts[i].entries()]
      .filter(([t]) => (df.get(t) ?? 0) <= maxDf)
      .map(([t, tf]) => ({ t, w: Math.log(N / (df.get(t) ?? 1)) * (1 + Math.log(tf)) }))
      .sort((a, b) => b.w - a.w)
    return { ...s, sig, weight: sig.reduce((a, x) => a + x.w, 0) }
  })
}

/** חפיפה בין שתי חתימות: 0 עד 1, לפי המשקל המשותף מול הקטנה שבשתיהן */
export function overlap(a, b) {
  const map = new Map(a.sig.map((x) => [x.t, x.w]))
  const shared = []
  let w = 0
  for (const x of b.sig) {
    if (!map.has(x.t)) continue
    shared.push(x.t)
    w += Math.min(map.get(x.t), x.w)
  }
  const base = Math.min(a.weight, b.weight) || 1
  return { score: w / base, shared }
}

// סף החזרה: נמדד מול הארכיון של אוגוסט–ספטמבר 2026 (207 סיפורים). זוגות
// שהם באמת אותו סיפור — ונציה, רומי, טלסקופ רומן, הריבית, שטיח באיה — יושבים
// על 0.24 ומעלה; סיפורי המשך אמיתיים (לבנון 12.9 מול 14.9, התקציב 19.9 מול
// 20.9) נופלים ל-0.21 ומטה, ומסומנים "קרוב" — ראוי לאזכור, לא חזרה.
export const REPEAT = { score: 0.24, shared: 4 }
export const NEAR = { score: 0.15, shared: 3 }

export function isRepeat(o) {
  return o.score >= REPEAT.score && o.shared.length >= REPEAT.shared
}
export function isNear(o) {
  return !isRepeat(o) && o.score >= NEAR.score && o.shared.length >= NEAR.shared
}

/**
 * לכל סיפור בתאריך הנבדק — ההתאמה הטובה ביותר מבין הסיפורים הקודמים.
 * סיפורים מאותו תאריך לא נבדקים זה מול זה.
 */
export function matchesFor(indexed, date) {
  const prev = indexed.filter((s) => s.date < date)
  return indexed
    .filter((s) => s.date === date)
    .map((s) => {
      let best = null
      for (const p of prev) {
        const o = overlap(p, s)
        if (!best || o.score > best.o.score) best = { p, o }
      }
      return { story: s, best }
    })
}

/** חזרות שנמצאו בגיליונות האחרונים — משוב לעורך על מה שכבר קרה */
export function recentRepeats(indexed, days = 7) {
  const dates = [...new Set(indexed.map((s) => s.date))].sort()
  const out = []
  for (const date of dates.slice(-days)) {
    for (const { story, best } of matchesFor(indexed, date)) {
      if (!best || !isRepeat(best.o)) continue
      out.push({
        date,
        headline: story.headline,
        alreadyTold: { date: best.p.date, headline: best.p.headline },
        shared: best.o.shared.slice(0, 8),
      })
    }
  }
  return out
}

/** הפנקס: לכל סיפור תאריך, מדור, כותרת ונושאים */
export function buildLedger(dir = NEWS_DIR) {
  const stories = flatten(readArchive(dir))
  const indexed = indexStories(stories)
  return {
    about:
      'מה כבר סופר במהדורות הבוקר. "subjects" הן המילים המזהות של הסיפור, מתוך הגוף שלו — ' +
      'הכותרות עקיפות בכוונה ואי אפשר לדעת מהן על מי הסיפור. לפני בחירת סיפור לגיליון חדש: ' +
      'אם הנושא כבר מופיע כאן, אל תספר אותו שוב. התפתחות או זווית חדשה מותרות, ואז פותחים ' +
      'בכך שכבר סופר ואומרים מה חדש. "repeats" הן חזרות שכבר נתפסו בגיליונות האחרונים. ' +
      'נכתב אוטומטית על ידי scripts/news-ledger.mjs.',
    updatedAt: new Date().toISOString(),
    stories: indexed.map((s) => ({
      date: s.date,
      section: s.section,
      headline: s.headline,
      subjects: s.sig.slice(0, 8).map((x) => x.t),
    })),
    repeats: recentRepeats(indexed),
  }
}

export function briefText(dir = NEWS_DIR, days = 45) {
  const led = buildLedger(dir)
  const cut = led.stories.length ? led.stories[led.stories.length - 1].date : ''
  const from = new Date(new Date(cut || Date.now()).getTime() - days * 86400000).toISOString().slice(0, 10)
  const lines = ['סיפורים שכבר סופרו (תאריך | מדור | נושאים | כותרת):']
  for (const s of led.stories.filter((x) => x.date >= from)) {
    lines.push(`${s.date} | ${s.section} | ${s.subjects.join(', ')} | ${s.headline}`)
  }
  return lines.join('\n')
}

/** שורה אחת לכל סיפור — קובץ קריא בלי לנפח אותו פי שלושה */
export function serialize(led) {
  const row = (x) => '    ' + JSON.stringify(x)
  return (
    '{\n' +
    `  "about": ${JSON.stringify(led.about)},\n` +
    `  "updatedAt": ${JSON.stringify(led.updatedAt)},\n` +
    `  "repeats": [\n${led.repeats.map(row).join(',\n')}\n  ],\n` +
    `  "stories": [\n${led.stories.map(row).join(',\n')}\n  ]\n}\n`
  )
}

function cli() {
  const [cmd = 'build', arg] = process.argv.slice(2)
  if (cmd === 'build') {
    const led = buildLedger()
    fs.writeFileSync(path.join(NEWS_DIR, LEDGER_FILE), serialize(led))
    console.log(`covered.json: ${led.stories.length} stories`)
    return 0
  }
  if (cmd === 'brief') {
    console.log(briefText(NEWS_DIR, Number(arg) || 45))
    return 0
  }
  if (cmd === 'check') {
    const file = arg || path.join(NEWS_DIR, 'latest.json')
    const ed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const fresh = flatten([ed])
    if (!fresh.length) {
      console.error('check: אין סיפורים בגיליון')
      return 1
    }
    // הגיליון הנבדק מחליף את מה שיש בארכיון לאותו תאריך
    const past = flatten(readArchive()).filter((s) => s.date !== ed.date)
    const indexed = indexStories([...past, ...fresh])
    let repeats = 0
    for (const { story, best } of matchesFor(indexed, ed.date)) {
      if (!best) continue
      const tag = isRepeat(best.o) ? 'חזרה' : isNear(best.o) ? 'קרוב' : ''
      if (!tag) continue
      if (tag === 'חזרה') repeats++
      console.log(
        `${tag} (${best.o.score.toFixed(2)}): "${story.headline}"\n  כבר סופר ב-${best.p.date}: "${best.p.headline}"\n  משותף: ${best.o.shared.slice(0, 8).join(', ')}`,
      )
    }
    if (!repeats) {
      console.log('אין חזרות')
      return 0
    }
    if (process.env.NEWS_ALLOW_REPEAT === '1') {
      console.log(`${repeats} חזרות — עברו עם NEWS_ALLOW_REPEAT=1`)
      return 0
    }
    console.error(`${repeats} סיפורים שכבר סופרו. החלף אותם, או — אם זו באמת התפתחות חדשה — פתח בכך שכבר סופר ורוץ שוב עם NEWS_ALLOW_REPEAT=1.`)
    return 1
  }
  console.error('usage: news-ledger.mjs build|brief [days]|check [file]')
  return 2
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(cli())
