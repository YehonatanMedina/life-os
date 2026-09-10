// ---------------------------------------------------------------------------
// שולח ההתראות. רץ ב-GitHub Action כל כמה דקות:
// קורא את notify.json מהמחסן, מפענח, שולח את מה שהגיע זמנו, ומסמן שנשלח.
// הסודות (טוקן, מפתח פענוח, מפתח VAPID) חיים רק ב-Secrets של המאגר.
// ---------------------------------------------------------------------------
import webpush from 'web-push'

const {
  GIST_TOKEN,
  GIST_ID,
  NOTIFY_KEY,
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  // מפתח הניתוח — לפענוח הדופק (pulse.json) לצורך הפינג של אטלס. אופציונלי.
  AI_KEY,
} = process.env

if (!GIST_TOKEN || !GIST_ID || !NOTIFY_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.log('missing secrets — skipping')
  process.exit(0)
}

const FILE = 'notify.json'
const SENT_FILE = 'notify-sent.json'
const WINDOW_MS = 45 * 60_000 // לא שולחים דבר שהתאחר ביותר מ-45 דקות

const api = (path, init = {}) =>
  fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GIST_TOKEN}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

const unb64u = (s) => Buffer.from(s, 'base64url')

async function decrypt(env, keyB64 = NOTIFY_KEY) {
  const key = await crypto.subtle.importKey('raw', unb64u(keyB64), 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(env.iv) }, key, unb64u(env.ct))
  return JSON.parse(new TextDecoder().decode(plain))
}

// -- אטלס: תזכורות בשעה מדויקת, ופינג כשבלוק עמוק רץ בלי טיימר ------------------
const ATLAS_REPO = 'life-os-atlas'
const IL = 'Asia/Jerusalem'

/** "HH:MM" של רגע נתון בשעון ישראל */
function ilTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: IL, hour: '2-digit', minute: '2-digit', hour12: false })
}
function ilDate(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: IL })
}

/** תזכורות שאטלס כתב למאגר הפרטי — פריטים עם שעה מלאה (ISO עם אזור זמן) */
async function atlasReminders() {
  const u = await api('/user')
  if (!u.ok) return []
  const { login } = await u.json()
  const r = await api(`/repos/${login}/${ATLAS_REPO}/contents/reminders.json`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  })
  if (!r.ok) return []
  let list
  try {
    list = JSON.parse(await r.text())
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((x) => x && typeof x.id === 'string' && typeof x.at === 'string')
    .map((x) => ({
      id: `atlas-${x.id}`,
      at: Date.parse(x.at),
      title: String(x.title ?? 'אטלס'),
      body: String(x.body ?? ''),
    }))
    .filter((x) => Number.isFinite(x.at))
}

/**
 * הפינג של אטלס: בלוק עבודה עמוקה רץ כבר עשרים דקות ויותר, אין טיימר,
 * ושום קטע עבודה לא נרשם מאז שהבלוק התחיל. פעם אחת לבלוק. לא לפני הקימה.
 * הדופק מתעדכן בכל דחיפה של הסנכרון — אם הוא ישן, זה בעצמו אומר שהאפליקציה לא נגעה.
 */
async function atlasCheckin(gist, now) {
  if (!AI_KEY) return []
  const f = gist.files?.['pulse.json']
  if (!f?.content) return []
  let p
  try {
    p = await decrypt(JSON.parse(f.content), AI_KEY)
  } catch {
    return []
  }
  const today = ilDate(now)
  if (p.today !== today) return [] // דופק מאתמול — אין מה להסיק ממנו על היום
  const hm = ilTime(now)
  if (hm < (p.wakeTime ?? '07:30')) return []
  if (p.timer?.running) return []
  const out = []
  for (const b of p.deepBlocksToday ?? []) {
    if (!(b.start <= hm && hm < b.end)) continue
    const [h, m] = b.start.split(':').map(Number)
    const [nh, nm] = hm.split(':').map(Number)
    const into = nh * 60 + nm - (h * 60 + m)
    if (into < 20) continue
    // קטע שנרשם אחרי תחילת הבלוק = הוא עובד, גם בלי טיימר פעיל
    const started = new Date(`${today}T${b.start}:00`).getTime() // UTC לצורך השוואה גסה בלבד
    const lastEnd = p.lastSessionEndedAt ?? 0
    if (lastEnd && ilTime(lastEnd) >= b.start && ilDate(lastEnd) === today) continue
    void started
    out.push({
      id: `atlas-checkin-${today}-${b.start}`,
      at: now,
      title: 'אטלס',
      body: `${b.title} התחיל ב-${b.start} ואין טיימר. מה קורה?`,
    })
  }
  return out
}

const res = await api(`/gists/${GIST_ID}`)
if (!res.ok) {
  console.log('gist fetch failed', res.status)
  process.exit(0)
}
const gist = await res.json()
const f = gist.files?.[FILE]
if (!f?.content) {
  console.log('no notify.json yet')
  process.exit(0)
}

let payload
try {
  payload = await decrypt(JSON.parse(f.content))
} catch (e) {
  console.log('decrypt failed:', e.message)
  process.exit(0)
}

// מה כבר נשלח — קובץ נפרד, לא מוצפן (מכיל רק מזהים וזמנים)
let sent = {}
try {
  sent = JSON.parse(gist.files?.[SENT_FILE]?.content ?? '{}')
} catch {
  sent = {}
}

const now = Date.now()
let extra = []
try {
  extra = [...(await atlasReminders()), ...(await atlasCheckin(gist, now))]
} catch (e) {
  console.log('atlas items failed:', e.message)
}
const due = [...(payload.items ?? []), ...extra].filter(
  (it) => it.at <= now && it.at > now - WINDOW_MS && !sent[it.id],
)

if (!due.length) {
  console.log('nothing due ·', (payload.items ?? []).length, 'scheduled')
  process.exit(0)
}

webpush.setVapidDetails('mailto:notify@life-os.local', VAPID_PUBLIC, VAPID_PRIVATE)

let ok = 0
for (const it of due) {
  try {
    await webpush.sendNotification(
      payload.sub,
      JSON.stringify({ title: it.title, body: it.body, tag: it.id }),
      { TTL: 3600 },
    )
    sent[it.id] = now
    ok++
  } catch (e) {
    console.log('send failed', it.id, e.statusCode ?? e.message)
    if (e.statusCode === 404 || e.statusCode === 410) {
      // המנוי מת — אין טעם להמשיך לנסות עד שהטלפון יירשם מחדש
      sent[it.id] = now
    }
  }
}

// ניקוי מזהים ישנים מ-48 שעות
for (const k of Object.keys(sent)) if (now - sent[k] > 48 * 3600_000) delete sent[k]

await api(`/gists/${GIST_ID}`, {
  method: 'PATCH',
  body: JSON.stringify({ files: { [SENT_FILE]: { content: JSON.stringify(sent) } } }),
})
console.log(`sent ${ok}/${due.length}`)
