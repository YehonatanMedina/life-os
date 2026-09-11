// ---------------------------------------------------------------------------
// עשן מול Claude האמיתי — רץ רק עם ATLAS_SMOKE=1 ומפתח ב-ANTHROPIC_API_KEY.
// בודק שהפרסונה, ההקשר והפורמט עובדים מול המודל האמיתי: ברכה, תזוזה ביומן
// (פקודה), ובקשת קוד (העברה). עולה כמה אגורות. התשובות מודפסות לבדיקת עין.
//
//   ATLAS_SMOKE=1 ANTHROPIC_API_KEY=sk-ant-… npx vitest run tests/unit/atlas-fast/smoke.test.ts
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, event, KEY } from '../logic/helpers'

const KEY_ENV = process.env.ANTHROPIC_API_KEY ?? ''
const ENABLED = process.env.ATLAS_SMOKE === '1' && !!KEY_ENV

describe.skipIf(!ENABLED)('אטלס המהיר מול Claude האמיתי', () => {
  it('ברכה קצרה, תזוזה ביומן עם פקודה, ובקשת קוד שמועברת לעמוק', async () => {
    vi.resetModules()
    localStorage.clear()
    const s = blankState()
    s.settings.name = 'בדיקה'
    s.tasks.push(task({ id: 't-read', title: 'לקרוא את פרק 3', due: '2026-09-13', trackId: 'trk-study' }))
    s.events.push(event({ id: 'ev-run', title: 'ריצה', date: '2026-09-12', start: '07:00', end: '08:00', allDay: false, kind: 'personal', touched: true }))
    localStorage.setItem(KEY, JSON.stringify(s))
    const F = await import('../../../src/atlasFast')
    ;(globalThis as any).window = globalThis
    const ask = (text: string, thread: any[] = []) => F.askFast({ text, thread, memory: 'הוא מעדיף לרוץ בבוקר.', state: s }, undefined, KEY_ENV)

    const hello = await ask('שלום')
    console.log('[smoke] hello →', hello.text, '| usage', hello.usage)
    expect(hello.text.length).toBeGreaterThan(3)
    expect(hello.commands).toEqual([])
    expect(hello.escalate).toBeUndefined()
    expect(hello.usage.output).toBeGreaterThan(0)

    const move = await ask('תזיז את הריצה של מחר ל-08:00, אותה שעה אורך.', [{ from: 'user', text: 'שלום' }, { from: 'atlas', text: hello.text }])
    console.log('[smoke] move →', move.text, '| commands', JSON.stringify(move.commands))
    expect(move.commands.some((c) => c.op === 'patchEvent' && c.eventId === 'ev-run' && c.patch?.start === '08:00')).toBe(true)
    expect(move.escalate).toBeUndefined()

    const code = await ask('אני רוצה שתוסיף כפתור ייצוא ל-PDF במסך היומן')
    console.log('[smoke] code →', code.text, '| escalate', code.escalate)
    expect(code.escalate).toBeTruthy()
    expect(code.commands).toEqual([])
  }, 120_000)
})
