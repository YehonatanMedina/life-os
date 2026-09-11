// ---------------------------------------------------------------------------
// סבב 2 (regress) — applyWhenSafe / flushDeferred (cloud #2).
// פקודות אטלס מבוצעות מיד כשאין מחסן מוגדר; עם מחסן — רק אחרי המשיכה הראשונה
// (הטיק של startAtlas מבצע את מה שנדחה). GitHub מדומה: המאגר של אטלס + הגיסט.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, pin, KEY, NOW } from '../logic/helpers'
import { encryptText, newCryptKey } from '../../../src/crypto'
import type { AppState } from '../../../src/types'
import type { AtlasMessage } from '../../../src/atlas'

type StoreModule = typeof import('../../../src/store')
type AtlasModule = typeof import('../../../src/atlas')
type CloudModule = typeof import('../../../src/cloud')

const AI_KEY = newCryptKey()
let S: StoreModule
let At: AtlasModule
let C: CloudModule
let gistContent = ''
let threadText = ''

function resp(r: { status: number; text?: string; etag?: string }) {
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    text: async () => r.text ?? '',
    json: async () => JSON.parse(r.text ?? 'null'),
    headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? r.etag ?? null : null) },
  }
}

async function boot(opts: { gist?: AppState | string }) {
  pin(NOW)
  vi.resetModules()
  localStorage.clear()
  const state = blankState()
  state.settings.aiKey = AI_KEY
  localStorage.setItem(KEY, JSON.stringify(state))
  localStorage.setItem('life-os-gh-token', 'test-token-not-real')
  localStorage.setItem('life-os-gh-login', 'me')
  if (opts.gist !== undefined) {
    localStorage.setItem('life-os-gist-id', 'g1')
    gistContent = typeof opts.gist === 'string' ? opts.gist : JSON.stringify(opts.gist)
  }
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url)
    if (u.startsWith('https://api.github.com/repos/me/life-os-atlas/contents/')) {
      const name = u.split('/contents/')[1]
      return resp(name === 'thread.json' ? { status: 200, text: threadText, etag: '"t1"' } : { status: 404 })
    }
    if (u === 'https://api.github.com/gists/g1' && (!init?.method || init.method === 'GET')) {
      return resp({ status: 200, text: JSON.stringify({ id: 'g1', files: { 'life-os.json': { content: gistContent } } }) })
    }
    throw new Error('unexpected network: ' + u)
  }) as any
  S = await import('../../../src/store')
  At = await import('../../../src/atlas')
  C = await import('../../../src/cloud')
}

async function thread(messages: AtlasMessage[]) {
  threadText = await encryptText(JSON.stringify({ messages }), AI_KEY)
}

const MSG: AtlasMessage = {
  id: 'a1',
  at: '2026-09-11T09:00:00+03:00',
  from: 'atlas',
  text: 'בוצע',
  commands: [{ id: 'c-t', op: 'addTask', task: { title: 'משימה מאטלס', due: '2026-09-15', est: 1, trackId: 'trk-study' } } as any],
}

afterEach(() => {
  vi.useRealTimers()
})

describe('applyWhenSafe / flushDeferred', () => {
  it('בלי מחסן מוגדר — הפקודה מבוצעת מיד במשיכה', async () => {
    await boot({})
    await thread([MSG])
    expect(C.cloudConfigured()).toBe(false)
    expect(await At.pollAtlas()).toBe(true)
    expect(S.store.get().tasks.find((t) => t.id === 't-c-t')?.title).toBe('משימה מאטלס')
    expect(Object.keys(S.store.get().atlasApplied ?? {})).toEqual(['c-t'])
  })

  it('עם מחסן, לפני המשיכה הראשונה — השיחה נשמרת, הפקודה לא מבוצעת; אחרי המשיכה הטיק מבצע אותה פעם אחת', async () => {
    const remote = blankState()
    remote.settings.aiKey = AI_KEY
    await boot({ gist: remote })
    await thread([MSG])
    expect(C.cloudConfigured()).toBe(true)
    expect(C.hasPulledOnce()).toBe(false)
    expect(await At.pollAtlas()).toBe(true)
    // השיחה כבר כאן, הביצוע לא
    expect(JSON.parse(localStorage.getItem('life-os-atlas-cache')!).messages.map((m: any) => m.id)).toEqual(['a1'])
    expect(S.store.get().tasks.find((t) => t.id === 't-c-t')).toBeUndefined()
    expect(S.store.get().atlasApplied ?? {}).toEqual({})

    await C.pullOnce()
    expect(C.hasPulledOnce()).toBe(true)
    // הטיק של startAtlas (כל 5 שניות) מבצע את מה שנדחה
    At.startAtlas()
    await vi.advanceTimersByTimeAsync(5_100)
    expect(S.store.get().tasks.find((t) => t.id === 't-c-t')?.title).toBe('משימה מאטלס')
    expect(Object.keys(S.store.get().atlasApplied ?? {})).toEqual(['c-t'])
    // ולא פעמיים
    await vi.advanceTimersByTimeAsync(10_000)
    expect(S.store.get().tasks.filter((t) => t.title === 'משימה מאטלס')).toHaveLength(1)
  })

  it('המשיכה הראשונה נכשלת (מחסן לא קריא) — הפקודה נשארת דחויה, לא מבוצעת', async () => {
    await boot({ gist: '{"enc":1, this is not json' })
    await thread([MSG])
    await At.pollAtlas()
    await expect(C.pullOnce()).rejects.toThrow('unreadable')
    expect(C.hasPulledOnce()).toBe(false)
    At.startAtlas()
    await vi.advanceTimersByTimeAsync(5_100)
    expect(S.store.get().tasks.find((t) => t.id === 't-c-t')).toBeUndefined()
  })
})
