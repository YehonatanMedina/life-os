// ---------------------------------------------------------------------------
// Claude API מזויף — למסלול המהיר של אטלס. מותקן לכל הקשר דפדפן דרך
// context.route על https://api.anthropic.com/v1/messages.
//
// תשובות מתוזמנות: כל תסריט הוא {text, block?} — הטקסט נשלח בזרימת SSE בקטעים
// קטנים (כמו האמיתי), והבלוק (<<<atlas … >>>) בסוף. בלי תסריט — תשובת ברירת
// מחדל קצרה. כל בקשה נרשמת עם הגוף המפורק, כדי שהבדיקות יראו מה בדיוק נשלח.
// ---------------------------------------------------------------------------
import type { BrowserContext, Route } from '@playwright/test'

export type Script = {
  text: string
  /** בלוק הפקודות/העברה/זיכרון — נעטף ב-<<<atlas … >>> */
  block?: Record<string, unknown> | string
  /** השהיה בין קטעי הזרימה (מ״ש) */
  chunkDelayMs?: number
  /** השהיה לפני התשובה הראשונה */
  delayMs?: number
  /** במקום תשובה — שגיאת HTTP */
  status?: number
  errorMessage?: string
  /** לחתוך את הזרם באמצע (מדמה נפילת רשת) */
  cutAfterChars?: number
  usage?: { input?: number; cacheWrite?: number; cacheRead?: number; output?: number }
}

export type CapturedRequest = {
  tag: string
  at: number
  model: string
  stream: boolean
  maxTokens: number
  system: Array<{ text: string; cached: boolean }>
  messages: Array<{ role: string; content: string }>
  headers: Record<string, string>
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
}

export class FakeAnthropic {
  scripts: Script[] = []
  requests: CapturedRequest[] = []
  /** תשובה כשאין תסריט בתור */
  fallback: Script = { text: 'קיבלתי.' }

  reply(s: Script | string) {
    this.scripts.push(typeof s === 'string' ? { text: s } : s)
  }

  /** הבקשה האחרונה של מכשיר מסוים */
  last(tag?: string): CapturedRequest | undefined {
    const xs = tag ? this.requests.filter((r) => r.tag === tag) : this.requests
    return xs[xs.length - 1]
  }

  static sse(script: Script): string {
    const block = script.block === undefined ? '' : '\n<<<atlas\n' + (typeof script.block === 'string' ? script.block : JSON.stringify(script.block)) + '\n>>>'
    const full = script.text + block
    const u = script.usage ?? {}
    const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    let out = ev('message_start', {
      message: {
        id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [],
        usage: { input_tokens: u.input ?? 900, cache_creation_input_tokens: u.cacheWrite ?? 0, cache_read_input_tokens: u.cacheRead ?? 2200, output_tokens: 1 },
      },
    })
    out += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    // קטעים של כמה תווים — גבולות שרירותיים, כולל באמצע מילה ובאמצע הבלוק
    const size = 7
    for (let i = 0; i < full.length; i += size) {
      out += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: full.slice(i, i + size) } })
    }
    out += ev('content_block_stop', { index: 0 })
    out += ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: u.output ?? Math.ceil(full.length / 3) } })
    out += ev('message_stop', {})
    return out
  }

  async handle(tag: string, route: Route): Promise<void> {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers())) headers[k.toLowerCase()] = v
    let body: any = {}
    try {
      body = JSON.parse(req.postData() ?? '{}')
    } catch {
      /* ignore */
    }
    this.requests.push({
      tag,
      at: Date.now(),
      model: String(body.model ?? ''),
      stream: !!body.stream,
      maxTokens: Number(body.max_tokens ?? 0),
      system: Array.isArray(body.system) ? body.system.map((b: any) => ({ text: String(b?.text ?? ''), cached: !!b?.cache_control })) : [],
      messages: Array.isArray(body.messages) ? body.messages.map((m: any) => ({ role: String(m.role), content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })) : [],
      headers,
    })
    if (!headers['x-api-key']) {
      return route.fulfill({ status: 401, headers: CORS, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } }) })
    }
    const script = this.scripts.shift() ?? this.fallback
    if (script.delayMs) await new Promise((r) => setTimeout(r, script.delayMs))
    if (script.status) {
      return route.fulfill({
        status: script.status,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: script.errorMessage ?? `fake ${script.status}` } }),
      })
    }
    if (!body.stream) {
      // בדיקת החיבור מההגדרות — תשובה רגילה
      const u = script.usage ?? {}
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: script.text }], stop_reason: 'end_turn', usage: { input_tokens: u.input ?? 12, output_tokens: u.output ?? 3 } }),
      })
    }
    let sse = FakeAnthropic.sse(script)
    if (script.cutAfterChars) sse = sse.slice(0, script.cutAfterChars)
    // Playwright לא מזרים גוף בהדרגה — שולחים את הכל בבת אחת; ההשהיה מדמה את זמן ההמתנה
    if (script.chunkDelayMs) await new Promise((r) => setTimeout(r, script.chunkDelayMs))
    return route.fulfill({ status: 200, headers: { ...CORS, 'cache-control': 'no-cache' }, contentType: 'text/event-stream', body: sse })
  }
}

export async function installFakeAnthropic(context: BrowserContext, fake: FakeAnthropic, tag: string): Promise<void> {
  await context.route('https://api.anthropic.com/**', (route) => fake.handle(tag, route))
}
