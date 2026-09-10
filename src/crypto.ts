// ---------------------------------------------------------------------------
// הצפנה — AES-256-GCM דרך WebCrypto. מודול בלי תלויות, כדי שגם הסנכרון
// וגם צינור הניתוח יוכלו להשתמש בו בלי תלות מעגלית.
//
// המעטפה: {"enc":1,"iv":<base64url>,"ct":<base64url של הצופן + תג>} —
// אותו פורמט שהסוכן בענן קורא וכותב עם scripts/insight-crypto.mjs.
// ---------------------------------------------------------------------------

export function b64u(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function newCryptKey(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(32)))
}

async function aesKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64u(b64) as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptText(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await aesKey(keyB64)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  )
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) })
}

export async function decryptText(ivB64: string, ctB64: string, keyB64: string): Promise<string> {
  const key = await aesKey(keyB64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(ivB64) as BufferSource },
    key,
    unb64u(ctB64) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}

/** מפענח מעטפה שלמה; טקסט שלא מוצפן חוזר כמו שהוא */
export async function decryptEnvelope(raw: string, keyB64: string): Promise<string> {
  const env = JSON.parse(raw)
  if (env && env.enc === 1) return decryptText(env.iv, env.ct, keyB64)
  return raw
}

/**
 * JSON עם מפתחות ממוינים — שני מכשירים עם אותו תוכן מייצרים אותה מחרוזת,
 * גם אם סדר השדות ברשומה שונה. משמש להשוואת תוכן מול המחסן.
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'
}
