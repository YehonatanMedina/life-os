// ---------------------------------------------------------------------------
// התראות דחיפה לטלפון.
//
// איך זה עובד: הטלפון נרשם ל-Web Push, בונה לוח תזכורות ל-36 השעות הקרובות
// (מהיומן ומהשגרות), מצפין את הכל במפתח ייעודי וכותב לקובץ notify.json במחסן.
// GitHub Action רץ כל כמה דקות, מפענח, ושולח את מה שהגיע זמנו.
// ההתראות מגיעות רק למכשיר שנרשם — הטלפון.
// ---------------------------------------------------------------------------

import { store, alive, dayCapacity, eventsOn, nextOccurrence, planForDow } from './store'
import type { AppState } from './types'
import { addDays, parseISO, today, weekStart } from './dates'

const VAPID_PUBLIC =
  'BDGc0I1zDheeMwCmxAcYYG7MjeCyNUfcjHHbYlTzuNYMoawFcSaVPGCQ0B5XxMGhFwQNvm7iwllvknJna3n6tes'
const NK_KEY = 'life-os-notify-key'
const ENABLED_KEY = 'life-os-push-on'
const TOKEN_KEY = 'life-os-gh-token'
const GIST_KEY = 'life-os-gist-id'
const FILE = 'notify.json'

export function getNotifyKey(): string {
  try {
    return localStorage.getItem(NK_KEY) ?? ''
  } catch {
    return ''
  }
}
export function setNotifyKey(k: string) {
  try {
    if (k) localStorage.setItem(NK_KEY, k)
  } catch {
    /* ignore */
  }
}
export function pushEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function b64u(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function encrypt(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', unb64u(keyB64) as BufferSource, 'AES-GCM', false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plain))
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) })
}
// -- לוח התזכורות ------------------------------------------------------------
type NotifyItem = { id: string; at: number; title: string; body: string }

function hhmmToMs(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00`).getTime()
}

/** בונה את התזכורות ל-36 השעות הקרובות מתוך המצב */
export function buildScheduleItems(s: AppState): NotifyItem[] {
  const items: NotifyItem[] = []
  const now = Date.now()
  const horizon = now + 36 * 3600_000

  // כלל ברזל: שום התראה לפני שעת הקימה — לא מעירים אותו
  const floorOf = (d: string) => hhmmToMs(d, s.settings.wakeTime)

  const add = (id: string, at: number, title: string, body: string) => {
    const day = id.slice(0, 10)
    if (at < floorOf(day)) return
    if (at > now - 5 * 60_000 && at < horizon) items.push({ id, at, title, body })
  }

  for (const d of [today(), addDays(today(), 1)]) {
    // שגרות — לפי ההגדרות, לא לפי מופעי היומן, כדי שיעבדו גם אם היומן זז.
    // התראת הקימה כוללת את החדשות — פינג אחד, לא שניים.
    add(`${d}-wake`, hhmmToMs(d, s.settings.wakeTime), 'בוקר טוב ☀️', 'שגרת בוקר — וגיליון החדשות של הבוקר כבר מחכה באפליקציה.')
    add(`${d}-night`, hhmmToMs(d, '23:00'), 'שגרת ערב 🌙', 'לסדר, לתכנן את מחר, ולישון בזמן.')

    // מה שקורה היום בלי שעה — יום הולדת, חג, טיסה. פינג אחד, אחרי הקימה.
    const evs = eventsOn(s, d)
    const allDay = evs.filter((e) => e.allDay)
    if (allDay.length) {
      const bd = allDay.filter((e) => e.kind === 'birthday')
      add(
        `${d}-allday`,
        hhmmToMs(d, s.settings.wakeTime) + 15 * 60_000,
        bd.length ? '🎂 יום הולדת היום' : 'היום ביומן',
        allDay.map((e) => e.title).join(' · '),
      )
    }

    // תזכורות מראש שהוגדרו על אירוע — "שבועיים ליום ההולדת של…"
    for (const e of alive(s.events)) {
      if (!e.remind?.length) continue
      const occ = nextOccurrence(e, d)
      for (const n of e.remind) {
        if (addDays(occ, -n) !== d) continue
        add(
          `${d}-rm-${e.id}-${n}`,
          hhmmToMs(d, s.settings.wakeTime) + 20 * 60_000,
          n >= 14 ? `🎁 עוד שבועיים: ${e.title}` : n === 7 ? `🎁 עוד שבוע: ${e.title}` : `🎁 עוד ${n} ימים: ${e.title}`,
          'יש עוד זמן לארגן משהו — וזה בדיוק העניין.',
        )
      }
    }

    // סגירת השבוע — ביום הסקירה, אם עוד לא מולאה
    if (parseISO(d).getDay() === s.settings.reviewDow) {
      const lastWs = addDays(weekStart(d), -7)
      const wl = s.weeks.find((w) => w.weekStart === lastWs && !w.deleted)
      if (!wl?.review) {
        add(`${d}-review`, hhmmToMs(d, '10:00'), '🧭 המעבר השבועי', 'לסגור את השבוע שהיה ולהגדיר את המטרות של זה שמתחיל.')
      }
    }

    // אירועים ובלוקים מהיומן — תזכורת 10 דקות לפני
    for (const e of evs) {
      if (e.allDay || !e.start) continue
      // שגרות כבר מכוסות למעלה — לא כפול
      if (e.ruleId === 'rl-morning' || e.ruleId === 'rl-night') continue
      const at = hhmmToMs(d, e.start) - 10 * 60_000
      const isWorkout = e.ruleId === 'rl-workout'
      // באימון מזכירים מה מתוכנן היום — זה מה שמוריד את החיכוך לצאת
      const plan = isWorkout ? planForDow(s, parseISO(d).getDay()) : undefined
      add(
        `${d}-${e.id}`,
        at,
        isWorkout ? 'אימון בעוד 10 דקות 🏃' : `בעוד 10 דקות: ${e.title}`,
        isWorkout
          ? plan
            ? `${plan.title}. הכל כבר מחכה באפליקציה — רק לסמן.`
            : 'ריצה או כוח — העיקר שקורה.'
          : `מתחיל ב־${e.start}.`,
      )
    }

    // תכנון מחר — אם עוד אין משימות למחר, דחיפה ב-21:30
    const tomorrow = addDays(d, 1)
    const planned = s.tasks.filter((t) => !t.deleted && t.due === tomorrow && t.status !== 'done').length
    if (d === today() && planned === 0 && dayCapacity(s, tomorrow) > 0) {
      add(`${d}-plan`, hhmmToMs(d, '21:30'), 'מחר עוד ריק 📝', 'שתי דקות של תכנון עכשיו שוות בוקר שלם מחר.')
    }
  }

  return items.sort((a, b) => a.at - b.at)
}

// -- כתיבה למחסן -------------------------------------------------------------
let lastWrite = 0

export async function writeNotifySchedule(force = false): Promise<boolean> {
  if (!pushEnabled()) return false
  const nk = getNotifyKey()
  let token = ''
  let gist = ''
  try {
    token = localStorage.getItem(TOKEN_KEY) ?? ''
    gist = localStorage.getItem(GIST_KEY) ?? ''
  } catch {
    return false
  }
  if (!nk || !token || !gist) return false
  if (!force && Date.now() - lastWrite < 30 * 60_000) return false

  const reg = await navigator.serviceWorker?.ready
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub) return false

  const payload = {
    sub: sub.toJSON(),
    items: buildScheduleItems(store.get()),
    updatedAt: Date.now(),
  }
  const content = await encrypt(JSON.stringify(payload), nk)
  const res = await fetch(`https://api.github.com/gists/${gist}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: { [FILE]: { content } } }),
  })
  if (res.ok) lastWrite = Date.now()
  return res.ok
}

/** הרשמה להתראות במכשיר הזה */
export async function enablePush(): Promise<'ok' | 'denied' | 'no-key' | 'unsupported' | 'error'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!getNotifyKey()) return 'no-key'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: unb64u(VAPID_PUBLIC) as BufferSource,
    })
    try {
      localStorage.setItem(ENABLED_KEY, '1')
    } catch {
      /* ignore */
    }
    const ok = await writeNotifySchedule(true)
    return ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function disablePush(): Promise<void> {
  try {
    localStorage.setItem(ENABLED_KEY, '0')
  } catch {
    /* ignore */
  }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    await sub?.unsubscribe()
  } catch {
    /* ignore */
  }
}

/** רענון הלוח — נקרא מהאפליקציה אחרי סנכרון ובפתיחה */
export function refreshNotifySchedule() {
  void writeNotifySchedule(false).catch(() => undefined)
}
