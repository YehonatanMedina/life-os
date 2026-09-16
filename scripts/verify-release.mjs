// ---------------------------------------------------------------------------
// אימות שחרור: מה שנדחף באמת הגיע למכשירים.
//
// למה זה קיים: "npx vite build עבר" ו-"git push עבר" לא אומרים שהאפליקציה
// שביד מעודכנת. ב-16.9.2026 היו שני מקרים באותו בוקר: מהדורת חדשות שנכתבה
// במבנה חורג והכרטיס נעלם בשקט, וקריינות של אתמול שנוגנה מתחת לכותרות של היום.
// שניהם היו נתפסים כאן בשלושים שניות.
//
// הרצה:  node scripts/verify-release.mjs
// יעד אחר:  LIFE_OS_URL=https://.../ node scripts/verify-release.mjs
// יוצא 0 אם הכל תקין, 1 אם לא — ומדפיס בדיוק מה לא.
// ---------------------------------------------------------------------------
import fs from 'fs'

export const DEFAULT_BASE = 'https://yehonatanmedina.github.io/life-os/'

// -- חלקים טהורים (נבדקים ב-tests/unit/logic/verify-release.test.ts) ---------------

/** חותמת הבנייה ש-vite מזריק ל-index.html */
export function buildStamp(html) {
  const m = /name="build" content="([^"]+)"/.exec(String(html ?? ''))
  return m ? m[1] : null
}

/** גרסת המטמון של ה-Service Worker */
export function swVersion(js) {
  const m = /const VERSION = '([^']+)'/.exec(String(js ?? ''))
  return m ? m[1] : null
}

/** תקלות במבנה המהדורה — מה שמעלים את כרטיס החדשות בשקט */
export function editionProblems(ed, today) {
  const p = []
  if (!ed || typeof ed !== 'object') return ['הגיליון אינו JSON של אובייקט']
  if (ed.date !== today) p.push(`התאריך בגיליון ${ed.date} ואצלנו ${today}`)
  const s = ed.sections
  if (!Array.isArray(s)) return [...p, 'sections אינו מערך (כך נראה הבאג של 16.9)']
  const keys = s.map((x) => x?.key)
  if (keys.join(',') !== 'israel,tech,culture') p.push(`מדורים לא בסדר הצפוי: ${keys.join(',') || '(ריק)'}`)
  s.forEach((sec, i) => {
    const st = Array.isArray(sec?.stories) ? sec.stories : []
    if (st.length !== 3) p.push(`מדור ${sec?.key ?? i} מכיל ${st.length} סיפורים`)
    st.forEach((x, j) => {
      if (!x?.headline || !x?.body) p.push(`סיפור ${j + 1} ב-${sec?.key ?? i} בלי כותרת או גוף`)
    })
  })
  return p
}

/** תקלות בקריינות: שדה audio חייב להיות חתום, ולהתאים לקובץ שהוקלט */
export function audioProblems(ed, sidecar) {
  const audio = ed?.audio
  if (audio === undefined) {
    return sidecar?.date === ed?.date
      ? ['יש קריינות לגיליון הזה אבל שדה audio חסר — הרץ node scripts/make-audio.mjs']
      : []
  }
  if (typeof audio !== 'string') return ['שדה audio אינו מחרוזת']
  const m = /[?&]v=([^&]+)/.exec(audio)
  if (!m) return [`audio בלי חתימה (${audio}) — האפליקציה תתעלם ממנו, ובצדק: זו יכולה להיות הקריינות של אתמול`]
  if (!sidecar) return ['audio חתום אבל אין docs/news/audio.json שמעיד על מה הוקלט']
  if (sidecar.date !== ed.date) return [`הקריינות היא של ${sidecar.date} והגיליון של ${ed.date}`]
  if (sidecar.textHash !== m[1]) return [`החתימה בכתובת ${m[1]} ובקובץ ${sidecar.textHash} — הטקסט השתנה אחרי ההקלטה`]
  return []
}

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// -- ההרצה -------------------------------------------------------------------------

async function main() {
  const base = (process.env.LIFE_OS_URL || DEFAULT_BASE).replace(/\/?$/, '/')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const rows = []
  const add = (ok, what, detail = '') => rows.push({ ok, what, detail })

  const get = async (path) => {
    const res = await fetch(base + path, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  }

  // 1. הבנייה החיה היא זו שבנינו
  const localStamp = buildStamp(fs.readFileSync('docs/index.html', 'utf8'))
  try {
    const live = buildStamp(await (await get('index.html')).text())
    add(!!live && live === localStamp, 'הבנייה שמוגשת', live === localStamp ? live : `חי ${live}, מקומי ${localStamp}`)
  } catch (e) {
    add(false, 'הבנייה שמוגשת', `לא נגיש: ${e.message}`)
  }

  // 2. Service Worker — גרסת המטמון עלתה, אחרת מכשירים מחזיקים נכסים ישנים
  const localSw = swVersion(fs.readFileSync('public/sw.js', 'utf8'))
  try {
    const live = swVersion(await (await get('sw.js')).text())
    add(!!live && live === localSw, 'גרסת ה-Service Worker', live === localSw ? live : `חי ${live}, מקומי ${localSw}`)
  } catch (e) {
    add(false, 'גרסת ה-Service Worker', `לא נגיש: ${e.message}`)
  }

  // 3. manifest — השם, הזהות והאייקונים שמוגשים
  const localMan = readJSON('docs/manifest.webmanifest')
  try {
    const live = await (await get('manifest.webmanifest')).json()
    const same = live.name === localMan?.name && live.id === localMan?.id && live.theme_color === localMan?.theme_color
    add(same, 'manifest (שם, זהות, צבע)', same ? `${live.name} · id=${live.id}` : `חי ${live.name}/${live.id}, מקומי ${localMan?.name}/${localMan?.id}`)
    for (const icon of live.icons ?? []) {
      try {
        await get(icon.src.replace('./', ''))
      } catch (e) {
        add(false, `אייקון ${icon.src}`, e.message)
      }
    }
  } catch (e) {
    add(false, 'manifest', `לא נגיש: ${e.message}`)
  }

  // 4. מהדורת הבוקר — מבנה, ולא מהדורה של אתמול
  let liveEd = null
  try {
    liveEd = await (await get('news/latest.json')).json()
    const probs = editionProblems(liveEd, today)
    add(probs.length === 0, 'מהדורת הבוקר', probs.length ? probs.join('; ') : `${liveEd.date}, תשעה סיפורים`)
  } catch (e) {
    add(false, 'מהדורת הבוקר', `לא נגיש: ${e.message}`)
  }

  // 5. הקריינות — חתומה על הטקסט הזה, והקובץ באמת שם
  if (liveEd) {
    const probs = audioProblems(liveEd, readJSON('docs/news/audio.json'))
    if (probs.length) add(false, 'קריינות', probs.join('; '))
    else if (liveEd.audio) {
      try {
        const res = await fetch(base + liveEd.audio.replace('./', ''), { method: 'HEAD' })
        const bytes = Number(res.headers.get('content-length') || 0)
        add(res.ok && bytes > 500_000, 'קריינות', `${liveEd.audio} · ${bytes} בתים`)
      } catch (e) {
        add(false, 'קריינות', `הקובץ לא נגיש: ${e.message}`)
      }
    } else {
      add(true, 'קריינות', 'אין קובץ שמע למהדורה הזו — האפליקציה תקריא בעצמה')
    }
  }

  const pad = Math.max(...rows.map((r) => r.what.length))
  for (const r of rows) console.log(`${r.ok ? 'תקין  ' : 'תקלה  '}${r.what.padEnd(pad)}  ${r.detail}`)
  const bad = rows.filter((r) => !r.ok)
  if (bad.length) {
    console.log(`\n${bad.length} תקלות. תקן ואמת שוב — אל תדווח "מעודכן".`)
    process.exit(1)
  }
  console.log('\nהכל מוגש נכון. אם שינית את manifest (שם, אייקון, זהות) — ראה "שחרור ואימות" ב-README: התווית של האפליקציה המותקנת לא מתחלפת לבד מיד.')
}

// מריצים רק כשקוראים לקובץ ישירות, כדי שהבדיקות יוכלו לייבא אותו
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await main()
}
