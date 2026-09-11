// המסלול המהיר של אטלס — פירוק התשובה, בניית הבקשה, זרם ה-SSE, חשבון הטוקנים.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, event, rule, pin, NOW, KEY, type StoreModule } from '../logic/helpers'
import type { AppState } from '../../../src/types'

type Fast = typeof import('../../../src/atlasFast')
let F: Fast
let S: StoreModule

async function boot(state: AppState = blankState()) {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem(KEY, JSON.stringify(state))
  S = await import('../../../src/store')
  F = await import('../../../src/atlasFast')
}

beforeEach(async () => {
  pin(NOW)
  await boot()
})
afterEach(() => vi.useRealTimers())

const enc = (s: string) => new TextEncoder().encode(s)
function readerOf(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  let i = 0
  return {
    read: async () => (i < chunks.length ? { value: enc(chunks[i++]), done: false } : { value: undefined, done: true }),
  } as any
}
const sse = (events: Array<[string, unknown]>) => events.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...(d as object) })}\n\n`).join('')

// ---------------------------------------------------------------------------
describe('parseReply — הטקסט והבלוק', () => {
  it('בלי בלוק — כל הטקסט הוא התשובה, בלי פקודות', () => {
    const r = F.parseReply('  שלום. מה קורה?  ')
    expect(r).toEqual({ text: 'שלום. מה קורה?', commands: [] })
  })

  it('בלוק תקין — פקודות מקבלות מזהה אם חסר, escalate ו-memory נקראים', () => {
    const raw = 'הזזתי.\n<<<atlas\n{"commands":[{"op":"addTask","task":{"title":"א"}},{"id":"c9","op":"deleteTask","taskId":"t1"}],"escalate":null,"memory":" הוא מעדיף לרוץ בבוקר "}\n>>>'
    const r = F.parseReply(raw, 1000)
    expect(r.text).toBe('הזזתי.')
    expect(r.commands).toHaveLength(2)
    expect(r.commands[0]).toMatchObject({ op: 'addTask', id: 'f-rs-0' })
    expect(r.commands[1].id).toBe('c9')
    expect(r.escalate).toBeUndefined()
    expect(r.memory).toBe('הוא מעדיף לרוץ בבוקר')
  })

  it('בלוק בלי סוגר, ובלוק שבור — הטקסט נשמר ושום פקודה לא מבוצעת', () => {
    expect(F.parseReply('טקסט\n<<<atlas\n{"commands":[{"op":"addTask","task":{"title":"x"}}]}').commands).toHaveLength(1)
    const broken = F.parseReply('טקסט\n<<<atlas\n{"commands":[{"op":"addTask" \n>>>')
    expect(broken.text).toBe('טקסט')
    expect(broken.commands).toEqual([])
  })

  it('פקודות זבל בבלוק מסוננות; escalate מחרוזת ריקה = אין העברה; memory נחתך ל-400', () => {
    const r = F.parseReply('x\n<<<atlas\n' + JSON.stringify({ commands: [null, 'str', { id: 1 }, { op: 'addTask', task: { title: 'ok' } }], escalate: '  ', memory: 'א'.repeat(900) }) + '\n>>>')
    expect(r.commands.map((c) => c.op)).toEqual(['addTask'])
    expect(r.escalate).toBeUndefined()
    expect(r.memory).toHaveLength(400)
  })

  it('visibleText מסתיר את הבלוק גם כשרק תחילתו הגיעה', () => {
    expect(F.visibleText('שלום ')).toBe('שלום')
    expect(F.visibleText('שלום\n<<')).toBe('שלום\n<<')
    expect(F.visibleText('שלום\n<<<at')).toBe('שלום')
    expect(F.visibleText('שלום\n<<<atlas\n{"commands":[]}\n>>>')).toBe('שלום')
  })
})

// ---------------------------------------------------------------------------
describe('buildRequest — מה נשלח למודל', () => {
  it('שלושה בלוקי מערכת: פרסונה (מטמון), זיכרון (מטמון), הקשר (בלי); תורות מתחלפים שמתחילים במשתמש', () => {
    const s = blankState()
    s.tasks.push(task({ id: 't1',  title: 'לקרוא', due: '2026-09-12' }))
    const req = F.buildRequest({
      text: 'מה עכשיו?',
      memory: 'הוא אוהב בוקר.',
      state: s,
      thread: [
        { from: 'atlas', text: 'פתיחה שלא אמורה להיכנס ראשונה' },
        { from: 'user', text: 'שלום' },
        { from: 'atlas', text: 'שלום.', ops: ['משימה חדשה: א'] },
        { from: 'atlas', text: 'עוד משהו.' },
        { from: 'user', text: 'תודה' },
      ],
    })
    expect(req.model).toBe('claude-sonnet-5')
    expect(req.stream).toBe(true)
    expect(req.system).toHaveLength(3)
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(req.system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(req.system[1].text).toContain('הוא אוהב בוקר.')
    expect(req.system[2].cache_control).toBeUndefined()
    expect(req.system[2].text).toContain('"לקרוא"')
    const roles = req.messages.map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'user'])
    expect(req.messages[1].content).toContain('[פעולות שבוצעו: משימה חדשה: א]')
    expect(req.messages[1].content).toContain('עוד משהו.')
    // ההודעה החדשה מצטרפת לתור האחרון של המשתמש
    expect(req.messages[2].content).toBe('תודה\n\nמה עכשיו?')
  })

  it('חלון השיחה מוגבל ל-16 הודעות, וההקשר קטן (עד ~6K טוקנים גם עם הרבה נתונים)', () => {
    const s = blankState()
    for (let i = 0; i < 200; i++) s.tasks.push(task({ id: `t${i}`,  title: `משימה ${i} עם תיאור ארוך למדי כדי לבדוק גודל`, due: i % 3 ? `2026-10-${String((i % 28) + 1).padStart(2, '0')}` : undefined }))
    for (let i = 0; i < 120; i++) s.events.push(event({ id: `e${i}`,  title: `אירוע ${i}`, date: `2026-09-${String((i % 30) + 1).padStart(2, '0')}`, start: '10:00', end: '11:00' }))
    for (let i = 0; i < 40; i++) s.rules.push(rule({ id: `r${i}`,  title: `בלוק ${i}`, days: [i % 7], start: '08:00', end: '09:00' }))
    const thread = Array.from({ length: 60 }, (_, i) => ({ from: (i % 2 ? 'atlas' : 'user') as 'user' | 'atlas', text: `הודעה ${i}` }))
    const req = F.buildRequest({ text: 'x', memory: '', state: s, thread })
    expect(req.messages.length).toBeLessThanOrEqual(17)
    // ההקשר הדינמי (הלא־ממוטמן) הוא מה שעולה בכל הודעה: עברית ~2.5 תווים לטוקן, 10K תווים ≈ 4K טוקנים
    expect(req.system[2].text.length).toBeLessThan(12_000)
    const ctx = JSON.parse(req.system[2].text.replace(/^[^{]*/, ''))
    expect(ctx.tasks.open.length).toBeLessThanOrEqual(40)
    expect(ctx.events.length).toBeLessThanOrEqual(30)
    expect(ctx.rules.length).toBeLessThanOrEqual(20)
  })

  it('ההקשר: היום כולל טיימר, לו״ז, הרגלים ואימון; אירועים רק ל-10 ימים קדימה; ימי הולדת ב-14 ימים', () => {
    const s = blankState()
    s.events.push(event({ id: 'near',  title: 'קרוב', date: '2026-09-15', start: '10:00', end: '11:00' }))
    s.events.push(event({ id: 'far',  title: 'רחוק', date: '2026-10-15', start: '10:00', end: '11:00' }))
    s.events.push(event({ id: 'bd',  title: 'יומולדת', date: '1990-09-20', allDay: true, kind: 'birthday', yearly: true }))
    s.events.push(event({ id: 'bdfar',  title: 'יומולדת רחוקה', date: '1990-12-20', allDay: true, kind: 'birthday', yearly: true }))
    s.timer = { running: true, startedAt: NOW - 20 * 60_000, accumulated: 0, trackId: 'trk-study', label: '', targetMinutes: 90, lastSeen: NOW }
    const ctx = F.buildFastContext(s, NOW)
    expect(ctx.now).toBe('2026-09-11 10:00')
    expect(ctx.events.map((e) => e.id)).toEqual(['near'])
    expect(ctx.birthdays.map((b) => b.id)).toEqual(['bd'])
    expect(ctx.today.timer).toMatchObject({ running: true, accumulated: 0 })
    expect(ctx.today.habits.length).toBe(s.habits.length)
    expect(ctx.week.weekStart).toBe('2026-09-06')
  })
})

// ---------------------------------------------------------------------------
describe('readStream — זרם SSE בקטעים שרירותיים', () => {
  it('מאחה שורות שנחתכות באמצע, מזרים רק טקסט, ואוסף usage', async () => {
    const full = sse([
      ['message_start', { message: { usage: { input_tokens: 800, cache_creation_input_tokens: 1500, cache_read_input_tokens: 0, output_tokens: 1 } } }],
      ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'שלום ' } }],
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'עולם' } }],
      ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }],
      ['message_stop', {}],
    ])
    // חיתוך כל 5 תווים — כולל באמצע "data:" ובאמצע תו עברי מקודד
    const bytes = enc(full)
    const chunks: string[] = []
    const dec = new TextDecoder()
    for (let i = 0; i < bytes.length; i += 5) chunks.push(dec.decode(bytes.slice(i, i + 5), { stream: true }))
    let text = ''
    const usage = await F.readStream(readerOf(chunks), (d) => (text += d))
    expect(text).toBe('שלום עולם')
    expect(usage).toEqual({ input: 800, cacheWrite: 1500, cacheRead: 0, output: 7 })
  })

  it('אירוע error בזרם — זורק עם ההודעה', async () => {
    const full = sse([['error', { error: { type: 'overloaded_error', message: 'Overloaded' } }]])
    await expect(F.readStream(readerOf([full]), () => undefined)).rejects.toThrow('Overloaded')
  })
})

// ---------------------------------------------------------------------------
describe('askFast — הקריאה עצמה (fetch מדומה)', () => {
  it('מזרים טקסט להצגה בלי הבלוק, מחזיר פקודות, רושם usage; שגיאת 401 מתורגמת', async () => {
    const body = FakeStream('בוצע.\n<<<atlas\n{"commands":[{"op":"addTask","task":{"title":"א"}}],"escalate":null,"memory":null}\n>>>')
    let sent: any = null
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      sent = { headers: init.headers, body: JSON.parse(init.body) }
      return { ok: true, status: 200, body, text: async () => '' }
    }) as any
    const seen: string[] = []
    const r = await F.askFast({ text: 'תוסיף משימה א', thread: [], memory: '', state: S.store.get() }, (v) => seen.push(v), 'sk-ant-test')
    expect(sent.headers['x-api-key']).toBe('sk-ant-test')
    expect(sent.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(sent.body.stream).toBe(true)
    expect(r.text).toBe('בוצע.')
    expect(r.commands).toHaveLength(1)
    expect(seen.every((v) => !v.includes('<<<'))).toBe(true)
    expect(seen[seen.length - 1]).toBe('בוצע.')
    expect(F.readUsage().calls).toBe(1)
    expect(F.readUsage().output).toBeGreaterThan(0)

    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }) })) as any
    await expect(F.askFast({ text: 'x', thread: [], memory: '', state: S.store.get() }, undefined, 'bad')).rejects.toThrow(/מפתח ה-API לא תקין/)
    // כישלון לא נספר כפנייה
    expect(F.readUsage().calls).toBe(1)
  })

  it('בלי מפתח — שגיאה ברורה בלי לגעת ברשת', async () => {
    globalThis.fetch = vi.fn() as any
    await expect(F.askFast({ text: 'x', thread: [], memory: '', state: S.store.get() }, undefined, '')).rejects.toThrow(/אין מפתח/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

function FakeStream(text: string) {
  const full = sse([
    ['message_start', { message: { usage: { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000, output_tokens: 1 } } }],
    ...[...text].map((ch) => ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: ch } }] as [string, unknown]),
    ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } }],
  ])
  const bytes = enc(full)
  let i = 0
  return {
    getReader: () => ({
      read: async () => {
        if (i >= bytes.length) return { value: undefined, done: true }
        const v = bytes.slice(i, i + 11)
        i += 11
        return { value: v, done: false }
      },
    }),
  }
}

// ---------------------------------------------------------------------------
describe('חשבון החודש', () => {
  it('מצטבר לפי חודש, מתאפס בחודש חדש, והעלות מחושבת לפי המחירון', () => {
    F.addUsage({ input: 1000, cacheWrite: 2000, cacheRead: 3000, output: 400 })
    F.addUsage({ input: 1000, cacheWrite: 0, cacheRead: 5000, output: 100 })
    const u = F.readUsage()
    expect(u).toMatchObject({ month: '2026-09', calls: 2, input: 2000, cacheWrite: 2000, cacheRead: 8000, output: 500 })
    // 2000*3 + 2000*3.75 + 8000*0.3 + 500*15 = 6000+7500+2400+7500 = 23400 / 1e6
    expect(F.usageCostUSD(u)).toBeCloseTo(0.0234, 6)
    localStorage.setItem('life-os-atlas-usage', JSON.stringify({ ...u, month: '2026-08' }))
    expect(F.readUsage().calls).toBe(0)
  })
})
