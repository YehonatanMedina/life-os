// ---------------------------------------------------------------------------
// תשתית לבדיקות היחידה של אטלס (סבב 2): חנות טרייה + מודול אטלס טרי לכל
// בדיקה, fetch מדומה שמגיש thread.json / today.json מוצפנים (או כל טקסט
// גולמי שרוצים — כדי לדמות סוכן מרושל), ותצפית על הקונסול.
// ---------------------------------------------------------------------------
import { vi } from 'vitest'
import { blankState, KEY } from '../logic/helpers'
import { encryptText, newCryptKey } from '../../../src/crypto'
import type { AppState } from '../../../src/types'
import type { AtlasCommand, AtlasMessage } from '../../../src/atlas'

export type StoreModule = typeof import('../../../src/store')
export type AtlasModule = typeof import('../../../src/atlas')
export type CloudModule = typeof import('../../../src/cloud')

export const CACHE_KEY = 'life-os-atlas-cache'
export const AI_KEY = newCryptKey()

export type Route = () => { status: number; text?: string; etag?: string }

export interface Harness {
  S: StoreModule
  At: AtlasModule
  routes: Record<string, Route>
  calls: string[]
  errors: ReturnType<typeof vi.spyOn>
  state: () => AppState
  cache: () => any
}

function resp(r: { status: number; text?: string; etag?: string }) {
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    text: async () => r.text ?? '',
    json: async () => JSON.parse(r.text ?? 'null'),
    headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? r.etag ?? null : null) },
  }
}

export async function boot(
  state: AppState = blankState(),
  cache: Record<string, unknown> | null = null,
  opts: { token?: boolean; aiKey?: string | null } = {},
): Promise<Harness> {
  vi.resetModules()
  localStorage.clear()
  if (opts.aiKey !== null) state.settings.aiKey = opts.aiKey ?? AI_KEY
  localStorage.setItem(KEY, JSON.stringify(state))
  if (opts.token !== false) localStorage.setItem('life-os-gh-token', 'test-token-not-real')
  localStorage.setItem('life-os-gh-login', 'me')
  if (cache) localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  const calls: string[] = []
  const routes: Record<string, Route> = {}
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    if (!u.startsWith('https://api.github.com/repos/me/life-os-atlas/contents/')) throw new Error('unexpected network: ' + u)
    const name = u.split('/contents/')[1]
    const r = routes[name]
    return resp(r ? r() : { status: 404 })
  }) as any
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const S = await import('../../../src/store')
  const At = await import('../../../src/atlas')
  return {
    S,
    At,
    routes,
    calls,
    errors,
    state: () => S.store.get(),
    cache: () => JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'),
  }
}

/** thread.json מוצפן כראוי עם ההודעות הנתונות */
export async function thread(h: Harness, messages: unknown, etag = '"t' + Math.random().toString(36).slice(2, 6) + '"') {
  const text = await encryptText(JSON.stringify({ messages }), AI_KEY)
  h.routes['thread.json'] = () => ({ status: 200, text, etag })
}

/** thread.json שמפוענח לטקסט גולמי כלשהו (לא בהכרח JSON) */
export async function threadRaw(h: Harness, plain: string, etag = '"raw"') {
  const text = await encryptText(plain, AI_KEY)
  h.routes['thread.json'] = () => ({ status: 200, text, etag })
}

/** thread.json שאינו מעטפה בכלל */
export function threadPlain(h: Harness, body: string, etag = '"plain"') {
  h.routes['thread.json'] = () => ({ status: 200, text: body, etag })
}

export async function todayFile(h: Harness, note: unknown, etag = '"d1"') {
  const text = await encryptText(JSON.stringify(note), AI_KEY)
  h.routes['today.json'] = () => ({ status: 200, text, etag })
}

export const atlasMsg = (id: string, at: string, commands: AtlasCommand[] = [], extra: Partial<AtlasMessage> = {}): AtlasMessage => ({
  id, at, from: 'atlas', text: 'בוצע', commands, ...extra,
})
export const userMsg = (id: string, at: string, text = 'שאלה', extra: Partial<AtlasMessage> = {}): AtlasMessage => ({
  id, at, from: 'user', text, ...extra,
})

export const T = (h: number, m = 0) => `2026-09-11T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`
