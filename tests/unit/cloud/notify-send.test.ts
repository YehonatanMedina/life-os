// @vitest-environment node
// ---------------------------------------------------------------------------
// scripts/notify-send.mjs — הסקריפט רץ בטעינה (top-level await), ולכן כל
// מקרה מייבא אותו מחדש עם fetch מזויף, שעון מזויף ו-web-push מזויף.
// שום רשת אמיתית: כל קריאה עוברת דרך globalThis.fetch שמוחלף כאן.
// ---------------------------------------------------------------------------
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCipheriv, randomBytes } from 'node:crypto'

// web-push מזויף — האובייקט נוצר כאן (לפני שהסקריפט מייבא) ויושב על globalThis
// כדי לשרוד vi.resetModules(); ה-factory של vi.mock מורם ולכן מפנה אליו בעצלות.
const WP = { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
;(globalThis as any).__wp = WP
vi.mock('web-push', () => ({ default: (globalThis as any).__wp }))
const wp = () => WP

const b64u = (b: Buffer) => b.toString('base64url')
function encrypt(obj: unknown, keyB64: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64url'), iv)
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final(), c.getAuthTag()])
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(ct) })
}

const NOTIFY_KEY = b64u(randomBytes(32))
const AI_KEY = b64u(randomBytes(32))
const GIST_ID = 'gist-notify-test'
const SUB = { endpoint: 'https://push.example/sub1', keys: { p256dh: 'p', auth: 'a' } }

class ExitSignal extends Error {
  constructor(public code: number) {
    super('exit ' + code)
  }
}

type Scenario = {
  /** תוכן notify.json (מוצפן במפתח ההתראות). null = אין קובץ */
  notify?: { sub?: unknown; items?: unknown[] } | null
  pulse?: Record<string, unknown>
  pulseKey?: string
  sent?: Record<string, number>
  /** reminders.json במאגר של אטלס — מחרוזת גולמית או אובייקט; undefined = 404 */
  reminders?: unknown
  aiKey?: string | null
  send?: (sub: unknown, payload: string, opts: unknown) => Promise<unknown>
  /**
   * נאמן ל-GitHub: contents API מחזיר טקסט גולמי רק כש-Accept הוא raw; אחרת JSON עם
   * content ב-base64. ברירת המחדל מקלה (תמיד raw) כדי לבדוק את הלוגיקה שאחרי הפענוח.
   */
  strictContents?: boolean
}

async function run(sc: Scenario, nowIso: string) {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(nowIso))
  process.env.GIST_TOKEN = 'gho_test'
  process.env.GIST_ID = GIST_ID
  process.env.NOTIFY_KEY = NOTIFY_KEY
  process.env.VAPID_PUBLIC = 'BPUBLIC'
  process.env.VAPID_PRIVATE = 'PRIVATE'
  if (sc.aiKey === null) delete process.env.AI_KEY
  else process.env.AI_KEY = sc.aiKey ?? AI_KEY

  const files: Record<string, { content: string }> = {}
  if (sc.notify !== null) files['notify.json'] = { content: encrypt({ sub: SUB, items: [], ...(sc.notify ?? {}) }, NOTIFY_KEY) }
  if (sc.pulse) files['pulse.json'] = { content: encrypt(sc.pulse, sc.pulseKey ?? AI_KEY) }
  if (sc.sent) files['notify-sent.json'] = { content: JSON.stringify(sc.sent) }

  const calls: Array<{ method: string; url: string; body?: string; headers?: Record<string, string> }> = []
  const res = (status: number, body: string, contentType = 'application/json') =>
    new Response(body, { status, headers: { 'content-type': contentType } })
  globalThis.fetch = vi.fn(async (input: any, init: any = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: init.body, headers: init.headers })
    if (!url.startsWith('https://api.github.com')) throw new Error('unexpected host ' + url)
    if (url.endsWith('/user')) return res(200, JSON.stringify({ login: 'tester' }))
    if (url.includes('/repos/tester/life-os-atlas/contents/reminders.json')) {
      if (sc.reminders === undefined) return res(404, JSON.stringify({ message: 'Not Found' }))
      const text = typeof sc.reminders === 'string' ? sc.reminders : JSON.stringify(sc.reminders)
      const accept = String(init.headers?.Accept ?? init.headers?.accept ?? '')
      if (sc.strictContents && !accept.includes('raw')) {
        return res(200, JSON.stringify({ name: 'reminders.json', encoding: 'base64', content: Buffer.from(text).toString('base64') }))
      }
      return res(200, text, 'application/vnd.github.raw+json')
    }
    if (url.endsWith(`/gists/${GIST_ID}`) && method === 'GET') return res(200, JSON.stringify({ id: GIST_ID, files }))
    if (url.endsWith(`/gists/${GIST_ID}`) && method === 'PATCH') return res(200, JSON.stringify({ id: GIST_ID }))
    return res(404, JSON.stringify({ message: 'no route' }))
  }) as any

  wp().setVapidDetails.mockClear().mockImplementation(() => undefined)
  wp().sendNotification.mockClear().mockImplementation(sc.send ?? (async () => ({ statusCode: 201 })))
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitSignal(code ?? 0)
  }) as any)

  let exitCode: number | null = null
  try {
    await import('../../../scripts/notify-send.mjs')
  } catch (e) {
    if (e instanceof ExitSignal) exitCode = e.code
    else throw e
  }
  const patch = calls.find((c) => c.method === 'PATCH')
  const sentFile = patch ? JSON.parse(JSON.parse(patch.body!).files['notify-sent.json'].content) : null
  const sends = wp().sendNotification.mock.calls.map((c: any[]) => ({ sub: c[0], payload: JSON.parse(c[1]), opts: c[2] }))
  return { calls, exitCode, logs, sentFile, sends }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const TODAY = '2026-09-11'
const YESTERDAY = '2026-09-10'
const at = (hhmm: string, date = TODAY) => `${date}T${hhmm}:00+03:00`
const pulse = (over: Record<string, unknown> = {}) => ({
  generatedAt: at('09:00'),
  today: TODAY,
  wakeTime: '07:30',
  bedTime: '23:30',
  timer: null,
  lastSessionEndedAt: null,
  deepBlocksToday: [
    { title: 'עבודה עמוקה — בוקר', start: '09:00', end: '12:00' },
    { title: 'עבודה עמוקה — אחה״צ', start: '13:30', end: '17:30' },
  ],
  ...over,
})
const CHECKIN_AM = `atlas-checkin-${TODAY}-09:00`

describe('atlasCheckin — הפינג של אטלס בבלוק עמוק בלי טיימר', () => {
  it('נשלח פעם אחת אחרי 20 דקות בתוך הבלוק, ונרשם ב-notify-sent.json', async () => {
    const r = await run({ pulse: pulse() }, at('09:25'))
    expect(r.sends).toHaveLength(1)
    expect(r.sends[0].payload).toEqual({ title: 'אטלס', body: 'עבודה עמוקה — בוקר התחיל ב-09:00 ואין טיימר. מה קורה?', tag: CHECKIN_AM })
    expect(r.sends[0].sub).toEqual(SUB)
    expect(r.sends[0].opts).toEqual({ TTL: 3600 })
    expect(r.sentFile).toEqual({ [CHECKIN_AM]: Date.parse(at('09:25')) })
    expect(r.logs.at(-1)).toBe('sent 1/1')
    // ואז — לא שוב באותו בלוק
    const again = await run({ pulse: pulse(), sent: r.sentFile! }, at('09:40'))
    expect(again.sends).toHaveLength(0)
    expect(again.exitCode).toBe(0)
    expect(again.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('בדיוק 20 דקות לתוך הבלוק — כן; 19 — לא', async () => {
    expect((await run({ pulse: pulse() }, at('09:20'))).sends).toHaveLength(1)
    expect((await run({ pulse: pulse() }, at('09:19'))).sends).toHaveLength(0)
  })

  it('לא לפני שעת הקימה', async () => {
    const r = await run({ pulse: pulse({ wakeTime: '10:00' }) }, at('09:30'))
    expect(r.sends).toHaveLength(0)
    expect(r.logs.some((l) => l.startsWith('nothing due'))).toBe(true)
  })

  it('לא כשטיימר רץ', async () => {
    const r = await run({ pulse: pulse({ timer: { running: true, trackId: 'trk-study', startedAt: Date.parse(at('09:00')), accumulated: 0, label: '' } }) }, at('09:30'))
    expect(r.sends).toHaveLength(0)
  })

  it('טיימר מושהה לא נחשב רץ — הפינג יוצא', async () => {
    const r = await run({ pulse: pulse({ timer: { running: false, trackId: 'trk-study', startedAt: 0, accumulated: 12, label: '' } }) }, at('09:30'))
    expect(r.sends).toHaveLength(1)
  })

  it('לא כשקטע עבודה נרשם אחרי תחילת הבלוק', async () => {
    const r = await run({ pulse: pulse({ lastSessionEndedAt: Date.parse(at('09:05')) }) }, at('09:30'))
    expect(r.sends).toHaveLength(0)
  })

  it('קטע שהסתיים לפני הבלוק, או באותה שעה אתמול — לא מונע', async () => {
    expect((await run({ pulse: pulse({ lastSessionEndedAt: Date.parse(at('08:50')) }) }, at('09:30'))).sends).toHaveLength(1)
    expect((await run({ pulse: pulse({ lastSessionEndedAt: Date.parse(at('09:05', YESTERDAY)) }) }, at('09:30'))).sends).toHaveLength(1)
  })

  it('דופק מאתמול — לא מסיקים ממנו כלום', async () => {
    const r = await run({ pulse: pulse({ today: YESTERDAY }) }, at('09:30'))
    expect(r.sends).toHaveLength(0)
  })

  it('בלוק שני ביום מקבל מזהה משלו', async () => {
    const r = await run({ pulse: pulse(), sent: { [CHECKIN_AM]: Date.parse(at('09:25')) } }, at('14:00'))
    expect(r.sends).toHaveLength(1)
    expect(r.sends[0].payload.tag).toBe(`atlas-checkin-${TODAY}-13:30`)
    // המזהה של הבוקר נשאר בקובץ (לא עברו 48 שעות)
    expect(Object.keys(r.sentFile!).sort()).toEqual([CHECKIN_AM, `atlas-checkin-${TODAY}-13:30`].sort())
  })

  it('מחוץ לבלוק — לא', async () => {
    expect((await run({ pulse: pulse() }, at('12:30'))).sends).toHaveLength(0)
  })

  it('בלי AI_KEY, או דופק שמוצפן במפתח אחר — בלי פינג ובלי קריסה', async () => {
    expect((await run({ pulse: pulse(), aiKey: null }, at('09:30'))).sends).toHaveLength(0)
    const other = b64u(randomBytes(32))
    const r = await run({ pulse: pulse(), pulseKey: other }, at('09:30'))
    expect(r.sends).toHaveLength(0)
    expect(r.exitCode).toBe(0)
  })
})

describe('atlasReminders — תזכורות בשעה מדויקת מ-reminders.json', () => {
  const rem = (hhmm: string, id = 'r1', date = TODAY) => ({ id, at: `${date}T${hhmm}:00+03:00`, title: 'אטלס', body: 'תזכורת: הרצאה' })

  it('תזכורת שהגיע זמנה (בתוך 45 דקות) נשלחת עם המזהה atlas-<id>', async () => {
    const r = await run({ reminders: [rem('09:20')] }, at('09:25'))
    expect(r.sends).toHaveLength(1)
    expect(r.sends[0].payload).toEqual({ title: 'אטלס', body: 'תזכורת: הרצאה', tag: 'atlas-r1' })
    expect(r.sentFile).toHaveProperty('atlas-r1')
  })

  // באג אמיתי (ראו tests/reports/cloud.md, ממצא #5): api() בסקריפט בונה headers חדש ולא ממזג את
  // init.headers, ולכן ה-Accept: raw של reminders.json נזרק. GitHub עונה ב-JSON עם content ב-base64,
  // JSON.parse מחזיר אובייקט ולא מערך, atlasReminders מחזיר [] — ושום תזכורת של אטלס לא יוצאת לעולם.
  it.fails('מול GitHub אמיתי (Accept לא raw → base64) התזכורת עדיין נשלחת', async () => {
    const r = await run({ reminders: [rem('09:20')], strictContents: true }, at('09:25'))
    const c = r.calls.find((x) => x.url.includes('reminders.json'))!
    expect(c.headers?.Accept).toBe('application/vnd.github.raw+json')
    expect(r.sends).toHaveLength(1)
  })

  it('מתעד את הבאג: בתשובה נאמנה ל-GitHub לא נשלחת שום תזכורת', async () => {
    const r = await run({ reminders: [rem('09:20')], strictContents: true }, at('09:25'))
    expect(r.sends).toHaveLength(0)
    expect(r.logs.some((l) => l.startsWith('nothing due'))).toBe(true)
  })

  it('גבול החלון: 44 דקות — כן, 45 ומעלה — לא; עתיד — לא', async () => {
    expect((await run({ reminders: [rem('08:41')] }, at('09:25'))).sends).toHaveLength(1)
    expect((await run({ reminders: [rem('08:40')] }, at('09:25'))).sends).toHaveLength(0)
    expect((await run({ reminders: [rem('09:26')] }, at('09:25'))).sends).toHaveLength(0)
    expect((await run({ reminders: [rem('09:25')] }, at('09:25'))).sends).toHaveLength(1)
  })

  it('אזור זמן: ISO ב-UTC מתורגם נכון (06:20Z = 09:20 בישראל)', async () => {
    const r = await run({ reminders: [{ id: 'z', at: `${TODAY}T06:20:00Z`, title: 'אטלס', body: 'x' }] }, at('09:25'))
    expect(r.sends).toHaveLength(1)
    expect(r.sends[0].payload.tag).toBe('atlas-z')
  })

  it('דה-דופליקציה דרך notify-sent.json', async () => {
    const r = await run({ reminders: [rem('09:20')], sent: { 'atlas-r1': Date.parse(at('09:21')) } }, at('09:25'))
    expect(r.sends).toHaveLength(0)
  })

  it('קובץ שבור, לא רשימה, או פריטים בלי id/at — מתעלמים בלי קריסה', async () => {
    expect((await run({ reminders: '{not json' }, at('09:25'))).sends).toHaveLength(0)
    expect((await run({ reminders: { id: 'x', at: at('09:20') } }, at('09:25'))).sends).toHaveLength(0)
    const r = await run({ reminders: [{ at: at('09:20') }, { id: 'y' }, { id: 'bad', at: 'לא תאריך' }, null, rem('09:20', 'ok')] }, at('09:25'))
    expect(r.sends.map((s) => s.payload.tag)).toEqual(['atlas-ok'])
  })

  it('כותרת וגוף חסרים — ברירת מחדל "אטלס" וגוף ריק', async () => {
    const r = await run({ reminders: [{ id: 'bare', at: at('09:20') }] }, at('09:25'))
    expect(r.sends[0].payload).toEqual({ title: 'אטלס', body: '', tag: 'atlas-bare' })
  })
})

describe('שליחה, מנוי מת וניקוי', () => {
  const item = (id: string, hhmm: string) => ({ id, at: Date.parse(at(hhmm)), title: 'בוקר טוב ☀️', body: 'שגרת בוקר' })

  it('פריטי notify.json שהגיע זמנם נשלחים; עתידיים ועתיקים לא', async () => {
    const r = await run({ notify: { items: [item('due', '09:20'), item('future', '09:30'), item('old', '08:00')] } }, at('09:25'))
    expect(r.sends.map((s) => s.payload.tag)).toEqual(['due'])
    expect(r.logs.at(-1)).toBe('sent 1/1')
  })

  it('מנוי מת (410/404) מסומן כנשלח כדי לא לנסות שוב; כשל אחר (500) לא', async () => {
    const dead = async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 })
    }
    const r = await run({ notify: { items: [item('a', '09:20')] }, send: dead }, at('09:25'))
    expect(r.sentFile).toEqual({ a: Date.parse(at('09:25')) })
    expect(r.logs.at(-1)).toBe('sent 0/1')

    const missing = async () => {
      throw Object.assign(new Error('nf'), { statusCode: 404 })
    }
    expect((await run({ notify: { items: [item('a', '09:20')] }, send: missing }, at('09:25'))).sentFile).toEqual({ a: Date.parse(at('09:25')) })

    const flaky = async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 })
    }
    const r3 = await run({ notify: { items: [item('a', '09:20')] }, send: flaky }, at('09:25'))
    expect(r3.sentFile).toEqual({})
    expect(r3.calls.some((c) => c.method === 'PATCH')).toBe(true)
  })

  it('מזהים בני יותר מ-48 שעות מנוקים מ-notify-sent.json', async () => {
    const now = Date.parse(at('09:25'))
    const r = await run(
      { notify: { items: [item('new', '09:20')] }, sent: { old: now - 49 * 3600_000, recent: now - 47 * 3600_000 } },
      at('09:25'),
    )
    expect(Object.keys(r.sentFile!).sort()).toEqual(['new', 'recent'])
  })

  it('בלי notify.json (הטלפון לא נרשם) — יוצאים לפני אטלס, גם כשיש תזכורת שהגיע זמנה', async () => {
    const r = await run({ notify: null, pulse: pulse(), reminders: [{ id: 'r', at: at('09:20') }] }, at('09:25'))
    expect(r.exitCode).toBe(0)
    expect(r.sends).toHaveLength(0)
    expect(r.calls.some((c) => c.url.includes('reminders.json'))).toBe(false)
    expect(r.logs).toContain('no notify.json yet')
  })

  it('סודות חסרים — יציאה שקטה בלי שום קריאת רשת', async () => {
    vi.resetModules()
    delete process.env.GIST_TOKEN
    const f = vi.fn()
    globalThis.fetch = f as any
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new ExitSignal(c ?? 0)
    }) as any)
    await expect(import('../../../scripts/notify-send.mjs')).rejects.toBeInstanceOf(ExitSignal)
    expect(f).not.toHaveBeenCalled()
  })
})
