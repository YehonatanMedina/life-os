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

async function decrypt(env) {
  const key = await crypto.subtle.importKey('raw', unb64u(NOTIFY_KEY), 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(env.iv) }, key, unb64u(env.ct))
  return JSON.parse(new TextDecoder().decode(plain))
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
const due = (payload.items ?? []).filter(
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
