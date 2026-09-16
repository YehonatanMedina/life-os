// ---------------------------------------------------------------------------
// "שגיאה 400" בלי סיבה. 16.9.2026: הודעה במסלול המהיר נדחתה, וכל מה שהוצג היה
// המספר — אי אפשר היה לדעת אם זה המפתח, היתרה, המודל או צורת הבקשה. מעכשיו
// הסיבה של ה-API נשמרת, מוצגת, ונוסעת בדופק המוצפן לאבחון מרחוק.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest'
import {
  FastError, NEEDS_WORKSPACE, VARIANTS, apiHeaders, clearApiFailure, clearRecovery, describeApiError, failureFrom,
  parseApiError, readApiFailure, readRecovery, recordApiFailure, recordRecovery, requestMetrics, variantBody,
} from '../../../src/atlasFast'

const errBody = (type: string, message: string) => JSON.stringify({ type: 'error', error: { type, message } })
const TOO_LONG = errBody('invalid_request_error', 'prompt is too long: 214057 tokens > 200000 maximum')

describe('parseApiError', () => {
  it('מוציא את הסוג וההודעה', () => {
    expect(parseApiError(TOO_LONG)).toEqual({ type: 'invalid_request_error', message: 'prompt is too long: 214057 tokens > 200000 maximum' })
  })

  it('גוף שאינו JSON — נשמר כטקסט, חתוך', () => {
    expect(parseApiError('<html>502 Bad Gateway</html>').message).toBe('<html>502 Bad Gateway</html>')
    expect(parseApiError('x'.repeat(900)).message).toHaveLength(400)
    expect(parseApiError('')).toEqual({ type: '', message: '' })
  })
})

describe('describeApiError', () => {
  it('400 — הסיבה של ה-API נכנסת להודעה, לא רק המספר', () => {
    const msg = describeApiError(400, TOO_LONG)
    expect(msg).toContain('prompt is too long')
    expect(msg).toContain('Claude דחה את הבקשה')
  })

  it('400 בלי הסבר — אומרים את זה במפורש', () => {
    expect(describeApiError(400, '')).toBe('Claude דחה את הבקשה בלי לומר למה')
  })

  it('יתרה, מפתח, הרשאה, מודל, עומס — הסבר בעברית ועוד הסיבה המקורית', () => {
    expect(describeApiError(400, errBody('invalid_request_error', 'Your credit balance is too low'))).toContain('אין יתרה')
    expect(describeApiError(401, errBody('authentication_error', 'API key is invalid.'))).toMatch(/מפתח ה-API לא תקין.*API key is invalid/)
    expect(describeApiError(403, errBody('permission_error', 'no access'))).toContain('platform.claude.com')
    expect(describeApiError(404, errBody('not_found_error', 'model: x'))).toContain('לא מכיר את המודל')
    expect(describeApiError(429, errBody('rate_limit_error', 'slow down'))).toContain('יותר מדי בקשות')
    expect(describeApiError(529, '')).toContain('עמוס כרגע')
    expect(describeApiError(418, '')).toBe('Claude החזיר שגיאה 418 בלי הסבר')
  })
})

describe('מדדי הבקשה', () => {
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: 1400,
    stream: true,
    system: [
      { type: 'text', text: 'פרסונה', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'זיכרון ארוך', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'הקשר' },
    ],
    messages: [
      { role: 'user', content: 'שאלה' },
      { role: 'assistant', content: 'תשובה ארוכה' },
      { role: 'user', content: 'עוד' },
    ],
  }

  it('אורכים בלבד — בלי תוכן, כדי שאפשר יהיה לשתף אבחון', () => {
    const m = requestMetrics(body)
    expect(m).toMatchObject({ model: 'claude-sonnet-5', maxTokens: 1400, stream: true, cacheBlocks: 2 })
    expect(m.systemChars).toEqual([6, 11, 4])
    expect(m.messages).toEqual([
      { role: 'user', chars: 4 },
      { role: 'assistant', chars: 11 },
      { role: 'user', chars: 3 },
    ])
    expect(m.totalChars).toBe(39)
    expect(JSON.stringify(m)).not.toContain('פרסונה')
    expect(JSON.stringify(m)).not.toContain('שאלה')
  })

  it('גוף חסר או פגום לא מפיל', () => {
    expect(requestMetrics(null)).toMatchObject({ model: '', maxTokens: 0, systemChars: [], messages: [], totalChars: 0 })
    expect(requestMetrics({ system: 'לא מערך', messages: null })).toMatchObject({ systemChars: [], messages: [] })
  })
})

describe('רישום התקלה', () => {
  beforeEach(() => {
    localStorage.clear()
    clearApiFailure()
  })

  it('נשמר ונקרא; תוכן פגום באחסון מתעלמים ממנו', () => {
    expect(readApiFailure()).toBeNull()
    recordApiFailure({ at: 1_800_000_000_000, where: 'send', status: 400, message: 'prompt is too long' })
    expect(readApiFailure()).toMatchObject({ status: 400, where: 'send', message: 'prompt is too long' })
    localStorage.setItem('life-os-atlas-apifail', '{not json')
    expect(readApiFailure()).toBeNull()
    localStorage.setItem('life-os-atlas-apifail', '{"status":"400"}')
    expect(readApiFailure()).toBeNull()
  })

  it('failureFrom: קורא את הגוף, רושם סטטוס, סיבה, request-id ומדדים, ומחזיר הודעה בעברית', async () => {
    const res = new Response(TOO_LONG, { status: 400, headers: { 'request-id': 'req_abc123' } })
    const body = { model: 'claude-sonnet-5', max_tokens: 1400, stream: true, system: [{ type: 'text', text: 'ארוך מאוד' }], messages: [{ role: 'user', content: 'שלום' }] }
    const shown = await failureFrom(res, body, 'test')
    expect(shown).toContain('prompt is too long')
    const f = readApiFailure()!
    expect(f).toMatchObject({ status: 400, where: 'test', errType: 'invalid_request_error', requestId: 'req_abc123' })
    expect(f.message).toContain('214057')
    expect(f.req).toMatchObject({ model: 'claude-sonnet-5', totalChars: 13 })
    expect(f.at).toBeGreaterThan(Date.now() - 5_000)
  })

  it('failureFrom בלי request-id ובלי גוף — עדיין רושם', async () => {
    await failureFrom(new Response('', { status: 500 }), {}, 'send')
    const f = readApiFailure()!
    expect(f).toMatchObject({ status: 500, where: 'send', message: '' })
    expect(f.requestId).toBeUndefined()
  })

  it('clearApiFailure מוחק — הצלחה מנקה את הדגל', () => {
    recordApiFailure({ at: Date.now(), where: 'send', status: 400, message: 'x' })
    clearApiFailure()
    expect(readApiFailure()).toBeNull()
  })
})

describe('גרסאות הבקשה', () => {
  const full = {
    model: 'claude-sonnet-5',
    max_tokens: 1400,
    stream: true,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: 'פרסונה', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'זיכרון', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'הקשר' },
    ],
    messages: [
      { role: 'user', content: 'ראשונה' },
      { role: 'assistant', content: 'תשובה' },
      { role: 'user', content: 'ההודעה עכשיו' },
    ],
  }

  it('הסדר: מלאה, רזה, חשופה', () => {
    expect(VARIANTS).toEqual(['full', 'lean', 'bare'])
  })

  it('מלאה — בדיוק מה שנבנה', () => {
    expect(variantBody(full, 'full')).toBe(full)
  })

  it('רזה — בלי הזיכרון, בלי מטמון, רק ההודעה הנוכחית; ההקשר נשאר', () => {
    const b = variantBody(full, 'lean')
    expect(b.system.map((x: any) => x.text)).toEqual(['פרסונה', 'הקשר'])
    expect(b.system.every((x: any) => !x.cache_control)).toBe(true)
    expect(b.messages).toEqual([{ role: 'user', content: 'ההודעה עכשיו' }])
    expect(b.model).toBe('claude-sonnet-5')
    expect(b.stream).toBe(true)
  })

  it('חשופה — פרסונה והודעה אחת, ובלי הגדרת חשיבה (אם מודל ידחה אותה, הגרסה הזאת תזהה)', () => {
    const b = variantBody(full, 'bare')
    expect(b.system.map((x: any) => x.text)).toEqual(['פרסונה'])
    expect(b.messages).toHaveLength(1)
    expect('thinking' in b).toBe(false)
    // הרזה כן שומרת את הגדרת החשיבה — היא בודקת את הזיכרון וההיסטוריה
    expect(variantBody(full, 'lean').thinking).toEqual({ type: 'disabled' })
  })

  it('גוף חסר לא מפיל', () => {
    expect(variantBody({}, 'lean')).toMatchObject({ system: [], messages: [] })
    expect(variantBody({ system: [{ text: 'רק פרסונה' }], messages: [] }, 'bare').messages).toEqual([])
  })
})

describe('FastError', () => {
  it('נושא סטטוס ותשובה לשאלה אם ניסיון חוזר יעזור', () => {
    const e = new FastError('Claude דחה את הבקשה', 400, true)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('FastError')
    expect({ status: e.status, permanent: e.permanent }).toEqual({ status: 400, permanent: true })
    const t = new FastError('עמוס', 529, false)
    expect(t.permanent).toBe(false)
  })
})

describe('רישום התאוששות', () => {
  beforeEach(() => {
    localStorage.clear()
    clearRecovery()
  })

  it('איזו גרסה כן עברה, ואחרי איזה סטטוס', () => {
    expect(readRecovery()).toBeNull()
    recordRecovery('lean', 400)
    expect(readRecovery()).toMatchObject({ variant: 'lean', afterStatus: 400 })
    clearRecovery()
    expect(readRecovery()).toBeNull()
  })

  it('אחסון פגום מתעלמים ממנו', () => {
    localStorage.setItem('life-os-atlas-recovery', 'לא json')
    expect(readRecovery()).toBeNull()
    localStorage.setItem('life-os-atlas-recovery', '{"variant":"lean"}')
    expect(readRecovery()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// מפתח שנוצר ברמת הארגון ולא שויך ל-workspace. 16.9.2026: זה מה שחסם את המסלול
// המהיר לגמרי — כל בקשה נדחתה ב-400, וההודעה הוצגה כ"שגיאה 400" בלי סיבה.
// ---------------------------------------------------------------------------
const WS_MSG =
  'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use. Add the header, or use an API key that is scoped to a workspace.'

describe('מפתח ברמת הארגון', () => {
  it('הכותרת נשלחת רק כשיש מזהה, ומנוקה מרווחים', () => {
    const base = apiHeaders('sk-ant-x')
    expect(base['x-api-key']).toBe('sk-ant-x')
    expect(base['anthropic-version']).toBe('2023-06-01')
    expect(base['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect('anthropic-workspace-id' in base).toBe(false)
    expect(apiHeaders(' sk-ant-y ', '  wrkspc_abc  ')['anthropic-workspace-id']).toBe('wrkspc_abc')
    expect('anthropic-workspace-id' in apiHeaders('sk-ant-y', '   ')).toBe(false)
  })

  it('הביטוי מזהה את התשובה של ה-API', () => {
    expect(NEEDS_WORKSPACE.test(WS_MSG)).toBe(true)
    expect(NEEDS_WORKSPACE.test('Your credit balance is too low')).toBe(false)
  })

  it('ההודעה אומרת מה לעשות — שתי הדרכים, בעברית', () => {
    const msg = describeApiError(400, JSON.stringify({ error: { type: 'invalid_request_error', message: WS_MSG } }))
    expect(msg).toContain('ברמת הארגון')
    expect(msg).toContain('API keys')
    expect(msg).toContain('wrkspc_')
    expect(msg).not.toContain('בלי לומר למה')
  })
})
