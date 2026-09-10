import { describe, it, expect } from 'vitest'
import { encryptText, decryptText, decryptEnvelope, stableStringify, newCryptKey, b64u, unb64u } from '../../../src/crypto'

describe('crypto — AES-GCM', () => {
  it('הצפנה ופענוח מחזירים את המקור, כולל עברית ואימוג׳י', async () => {
    const key = newCryptKey()
    const plain = 'שלום עולם 🌍 — "quotes" \n newline'
    const env = await encryptText(plain, key)
    const parsed = JSON.parse(env)
    expect(parsed.enc).toBe(1)
    expect(typeof parsed.iv).toBe('string')
    expect(typeof parsed.ct).toBe('string')
    expect(await decryptText(parsed.iv, parsed.ct, key)).toBe(plain)
    expect(await decryptEnvelope(env, key)).toBe(plain)
  })

  it('כל הצפנה עם IV שונה — אותו טקסט לא מייצר אותו צופן', async () => {
    const key = newCryptKey()
    const a = await encryptText('x', key)
    const b = await encryptText('x', key)
    expect(a).not.toBe(b)
  })

  it('צופן שנפגם נדחה (תג האימות)', async () => {
    const key = newCryptKey()
    const env = JSON.parse(await encryptText('סודי', key))
    const bytes = unb64u(env.ct)
    bytes[0] ^= 0xff
    await expect(decryptText(env.iv, b64u(bytes), key)).rejects.toBeTruthy()
  })

  it('מפתח שגוי נדחה', async () => {
    const env = JSON.parse(await encryptText('סודי', newCryptKey()))
    await expect(decryptText(env.iv, env.ct, newCryptKey())).rejects.toBeTruthy()
  })

  it('decryptEnvelope מחזיר טקסט לא מוצפן כמו שהוא', async () => {
    const raw = JSON.stringify({ messages: [] })
    expect(await decryptEnvelope(raw, newCryptKey())).toBe(raw)
  })

  it('b64u הוא היפוך של unb64u, בלי ריפוד', () => {
    for (const n of [0, 1, 2, 3, 4, 31, 32]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff)
      const s = b64u(bytes)
      expect(s).not.toMatch(/[+/=]/)
      expect(Array.from(unb64u(s))).toEqual(Array.from(bytes))
    }
  })
})

describe('stableStringify', () => {
  it('לא תלוי בסדר המפתחות, גם בעומק', () => {
    const a = { b: 1, a: { y: [1, { q: 2, p: 3 }], x: 'v' } }
    const b = { a: { x: 'v', y: [1, { p: 3, q: 2 }] }, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
  it('משמיט undefined אבל שומר null ו-false ו-0', () => {
    expect(stableStringify({ a: undefined, b: null, c: false, d: 0 })).toBe('{"b":null,"c":false,"d":0}')
    expect(stableStringify({ a: undefined })).toBe(stableStringify({}))
  })
  it('סדר במערך נשמר (הוא משמעותי)', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })
  it('ערכים פרימיטיביים', () => {
    expect(stableStringify('א')).toBe('"א"')
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(undefined)).toBe('null')
  })
})
