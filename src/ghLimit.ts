// ---------------------------------------------------------------------------
// GitHub מגביל קצב. כל מה שמדבר מהאפליקציה עם api.github.com (הסנכרון, אטלס,
// לוח ההתראות) עובר כאן:
//
//   1. מזהים חסימת קצב — ראשית (5000 בקשות בשעה) או משנית (יותר מדי כתיבות
//      בזמן קצר). GitHub מחזיר אותן כ-403 או 429, ולכן בלי הזיהוי הזה הן
//      נראו כמו "האסימון נדחה".
//   2. זוכרים עד מתי חסומים — משותף לכל הלשוניות והחלונות במכשיר — ולא
//      שולחים שום בקשה עד אז. בקשות שממשיכות להגיע בזמן חסימה רק מאריכות אותה.
//   3. אחרי כשל רגיל: מחכים יותר ויותר (2, 4, 8… שניות, עד 5 דקות), לא כל שנייה.
//
// נלמד בכאב (14.9.2026): דופק הטיימר גרם לכתיבה למחסן כל 20 שניות, כשל אחד
// הפך לניסיון חוזר כל שנייה, ו-GitHub חסם את החשבון לשעות.
// ---------------------------------------------------------------------------

const COOLDOWN_KEY = 'life-os-gh-cooldown'
const LOG_KEY = 'life-os-sync-log'

/** נזרקת כשהבקשה לא נשלחה (או נחסמה) בגלל הגבלת קצב — עם הזמן שבו מותר לנסות שוב */
export class GhLimited extends Error {
  until: number
  constructor(until: number) {
    super('rate-limit')
    this.until = until
  }
}

let memUntil = 0
let streak = 0

/** עד מתי GitHub חוסם את המכשיר הזה (0 = לא חסום) */
export function ghCooldownUntil(now = Date.now()): number {
  let stored = 0
  try {
    stored = Number(localStorage.getItem(COOLDOWN_KEY) || 0) || 0
  } catch {
    /* ignore */
  }
  const until = Math.max(memUntil, stored)
  return until > now ? until : 0
}

export function setGhCooldown(until: number) {
  memUntil = Math.max(memUntil, until)
  try {
    const cur = Number(localStorage.getItem(COOLDOWN_KEY) || 0) || 0
    if (until > cur) localStorage.setItem(COOLDOWN_KEY, String(Math.round(until)))
  } catch {
    /* ignore */
  }
}

export function clearGhCooldown() {
  memUntil = 0
  streak = 0
  try {
    localStorage.removeItem(COOLDOWN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * מתשובה של GitHub: עד מתי חסומים. 0 = זו לא הגבלת קצב (למשל 403 של הרשאה).
 * לפי ההנחיות של GitHub: retry-after אם יש; אחרת, אם המכסה נגמרה — עד זמן
 * האיפוס; אחרת (חסימה משנית בלי כותרות) — לפחות דקה, ומכפילים ברצף.
 */
export function rateLimitUntil(
  status: number,
  header: (name: string) => string | null,
  body: string,
  now: number,
  consecutive = 0,
): number {
  if (status !== 403 && status !== 429) return 0
  const retryAfter = Number(header('retry-after') ?? '')
  if (Number.isFinite(retryAfter) && retryAfter > 0) return now + retryAfter * 1000
  const reset = Number(header('x-ratelimit-reset') ?? '')
  if (header('x-ratelimit-remaining') === '0' && reset > 0) return Math.max(now + 5_000, reset * 1000 + 1_000)
  if (status === 429 || /rate limit|abuse detection/i.test(body)) {
    return now + Math.min(15 * 60_000, 60_000 * 2 ** Math.min(Math.max(0, consecutive), 4))
  }
  return 0
}

/**
 * בודק תשובה ורושם חסימה אם יש. מחזיר את זמן הסיום של החסימה, או 0.
 * קורא את הגוף מעותק — מי שקרא לפונקציה עדיין יכול לקרוא את התשובה.
 */
export async function noteGhResponse(res: Response): Promise<number> {
  if (res.status !== 403 && res.status !== 429) {
    if (res.ok || res.status === 304) streak = 0
    return 0
  }
  let body = ''
  try {
    body = await res.clone().text()
  } catch {
    /* ignore */
  }
  const until = rateLimitUntil(res.status, (n) => res.headers?.get?.(n) ?? null, body, Date.now(), streak)
  if (until) {
    streak++
    setGhCooldown(until)
  }
  return until
}

/** כשלים שלא יעברו מעצמם בעוד שנייה — אסימון, מחסן, מפתח. מנסים שוב לאט. */
export const PERSISTENT_ERRORS = new Set(['auth', 'not-found', 'no-key', 'bad-key', 'unreadable', 'no-token', 'no-gist'])

/** כמה לחכות לפני הניסיון הבא, אחרי `failures` כשלים ברצף */
export function retryDelay(failures: number, err: string, rand = Math.random()): number {
  const base = PERSISTENT_ERRORS.has(err) ? 60_000 : 2_000
  const d = Math.min(5 * 60_000, base * 2 ** Math.max(0, failures - 1))
  return Math.round(d * (0.85 + rand * 0.3))
}

// -- יומן תקלות: כדי שבפעם הבאה יהיה אפשר לראות מה קרה, לא לנחש -------------------
export type SyncLogEntry = { at: number; err: string; until?: number }

export function readSyncLog(): SyncLogEntry[] {
  try {
    const xs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    return Array.isArray(xs) ? xs.filter((x) => x && typeof x.at === 'number' && typeof x.err === 'string') : []
  } catch {
    return []
  }
}

export function logSyncFailure(e: SyncLogEntry) {
  try {
    const xs = readSyncLog()
    xs.push(e)
    localStorage.setItem(LOG_KEY, JSON.stringify(xs.slice(-30)))
  } catch {
    /* ignore */
  }
}

/** HH:MM בשעון המקומי */
export function hhmmOf(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
