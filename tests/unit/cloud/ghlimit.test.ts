// ---------------------------------------------------------------------------
// ghLimit — זיהוי חסימות קצב של GitHub, המתנה אחרי כשל, וחסימה משותפת למכשיר.
// הרקע: כשל אחד הפך לניסיון כל שנייה, ו-403 של הגבלת קצב נראה כמו "האסימון נדחה".
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest'
import {
  GhLimited, PERSISTENT_ERRORS, clearGhCooldown, ghCooldownUntil, logSyncFailure, noteGhResponse, rateLimitUntil,
  readSyncLog, retryDelay, setGhCooldown,
} from '../../../src/ghLimit'

const NOW = 1_800_000_000_000
const H = (h: Record<string, string>) => (n: string) => h[n] ?? null
const SECONDARY = '{"message":"You have exceeded a secondary rate limit. Please wait a few minutes before you try again."}'

describe('rateLimitUntil', () => {
  it('retry-after קובע — גם ב-403 וגם ב-429', () => {
    expect(rateLimitUntil(403, H({ 'retry-after': '30' }), SECONDARY, NOW)).toBe(NOW + 30_000)
    expect(rateLimitUntil(429, H({ 'retry-after': '5' }), '', NOW)).toBe(NOW + 5_000)
  })

  it('מכסה ראשית שנגמרה: עד זמן האיפוס ועוד שנייה; איפוס שכבר עבר — לפחות 5 שניות', () => {
    const reset = String(NOW / 1000 + 600)
    expect(rateLimitUntil(403, H({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }), '{"message":"API rate limit exceeded"}', NOW)).toBe(NOW + 601_000)
    const past = String(NOW / 1000 - 10)
    expect(rateLimitUntil(403, H({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': past }), '', NOW)).toBe(NOW + 5_000)
  })

  it('חסימה משנית בלי כותרות: דקה, מכפילים ברצף, תקרה של 15 דקות', () => {
    const waits = [0, 1, 2, 3, 4, 9].map((c) => rateLimitUntil(403, H({}), SECONDARY, NOW, c) - NOW)
    expect(waits).toEqual([60_000, 120_000, 240_000, 480_000, 900_000, 900_000])
  })

  it('429 בלי שום רמז — עדיין חסימה (דקה)', () => {
    expect(rateLimitUntil(429, H({}), '', NOW)).toBe(NOW + 60_000)
  })

  it('403 של הרשאה (מכסה מלאה, בלי "rate limit") הוא לא חסימת קצב', () => {
    const body = '{"message":"Resource not accessible by personal access token"}'
    expect(rateLimitUntil(403, H({ 'x-ratelimit-remaining': '4999' }), body, NOW)).toBe(0)
  })

  it('401, 404, 409, 500 — לא חסימת קצב', () => {
    for (const s of [401, 404, 409, 500, 502]) expect(rateLimitUntil(s, H({ 'retry-after': '9' }), SECONDARY, NOW)).toBe(0)
  })
})

describe('retryDelay', () => {
  it('כשל חולף: 2 שניות ומכפילים, עד 5 דקות — לא כל שנייה', () => {
    const d = Array.from({ length: 10 }, (_, i) => retryDelay(i + 1, 'http-502', 0.5))
    expect(d).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000])
  })

  it('כשל קבוע (אסימון/מחסן/מפתח): מתחילים מדקה', () => {
    for (const err of ['auth', 'not-found', 'bad-key', 'unreadable']) {
      expect(PERSISTENT_ERRORS.has(err)).toBe(true)
      expect([1, 2, 3, 4].map((f) => retryDelay(f, err, 0.5))).toEqual([60_000, 120_000, 240_000, 300_000])
    }
  })

  it('פיזור של ±15% — שני מכשירים לא מנסים שוב באותה מילישנייה', () => {
    expect(retryDelay(3, 'network', 0)).toBe(6_800)
    expect(retryDelay(3, 'network', 1)).toBe(9_200)
  })
})

describe('חסימה משותפת למכשיר', () => {
  beforeEach(() => {
    clearGhCooldown()
    localStorage.clear()
  })

  it('נרשמת, נקראת, ופגה', () => {
    const until = Date.now() + 60_000
    setGhCooldown(until)
    expect(ghCooldownUntil()).toBe(until)
    expect(ghCooldownUntil(until + 1)).toBe(0)
  })

  it('לשונית אחרת במכשיר נחסמה (כתבה לאחסון) — גם כאן חסום', () => {
    const until = Date.now() + 30_000
    localStorage.setItem('life-os-gh-cooldown', String(until))
    expect(ghCooldownUntil()).toBe(until)
  })

  it('חסימה קצרה לא מקצרת חסימה ארוכה שכבר רשומה', () => {
    const long = Date.now() + 600_000
    setGhCooldown(long)
    setGhCooldown(Date.now() + 1_000)
    expect(Number(localStorage.getItem('life-os-gh-cooldown'))).toBe(long)
    expect(ghCooldownUntil()).toBe(long)
  })

  it('noteGhResponse: קורא מעותק, רושם חסימה, והגוף עדיין זמין למי שקרא', async () => {
    const res = new Response(SECONDARY, { status: 403 })
    const until = await noteGhResponse(res)
    expect(until).toBeGreaterThan(Date.now() + 55_000)
    expect(ghCooldownUntil()).toBe(until)
    expect((await res.json()).message).toMatch(/secondary rate limit/)
  })

  it('noteGhResponse: חסימות ברצף מתארכות; הצלחה מאפסת את הרצף', async () => {
    const a = await noteGhResponse(new Response(SECONDARY, { status: 403 }))
    const b = await noteGhResponse(new Response(SECONDARY, { status: 403 }))
    expect(b - Date.now()).toBeGreaterThan(a - Date.now() + 50_000)
    await noteGhResponse(new Response('{}', { status: 200 }))
    clearGhCooldown()
    const c = await noteGhResponse(new Response(SECONDARY, { status: 403 }))
    expect(c - Date.now()).toBeLessThan(61_000)
  })

  it('noteGhResponse: 403 של הרשאה ו-304 לא חוסמים', async () => {
    expect(await noteGhResponse(new Response('{"message":"Bad credentials"}', { status: 403, headers: { 'x-ratelimit-remaining': '4000' } }))).toBe(0)
    expect(await noteGhResponse(new Response(null, { status: 304 }))).toBe(0)
    expect(ghCooldownUntil()).toBe(0)
  })

  it('GhLimited נושא את הזמן ואת הקוד rate-limit', () => {
    const e = new GhLimited(NOW)
    expect(e.message).toBe('rate-limit')
    expect(e.until).toBe(NOW)
  })
})

describe('יומן תקלות', () => {
  beforeEach(() => localStorage.clear())

  it('שומר 30 אחרונות, ומתעלם מתוכן פגום', () => {
    for (let i = 0; i < 40; i++) logSyncFailure({ at: i, err: `e${i}` })
    const xs = readSyncLog()
    expect(xs).toHaveLength(30)
    expect(xs[0].err).toBe('e10')
    expect(xs[29].err).toBe('e39')
    localStorage.setItem('life-os-sync-log', '{not json')
    expect(readSyncLog()).toEqual([])
  })
})
