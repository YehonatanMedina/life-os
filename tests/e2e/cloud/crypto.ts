// ---------------------------------------------------------------------------
// הצפנה בצד Node — מראה מדויקת של src/crypto.ts, כדי שהבדיקות יוכלו לקרוא
// מה האפליקציה כתבה למחסן המזויף ולכתוב לו תוכן שהאפליקציה תפענח.
// המעטפה: {"enc":1,"iv":<base64url>,"ct":<base64url של הצופן + תג GCM>}
// ---------------------------------------------------------------------------
import { webcrypto } from 'node:crypto'

const subtle = webcrypto.subtle

export const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')
export const unb64u = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64url'))

/** מפתח AES-256 חדש — 32 בייטים ב-base64url, כמו newCryptKey באפליקציה */
export function newKey(): string {
  return b64u(webcrypto.getRandomValues(new Uint8Array(32)))
}

async function aesKey(b64: string): Promise<CryptoKey> {
  return subtle.importKey('raw', unb64u(b64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptText(plain: string, keyB64: string): Promise<string> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const key = await aesKey(keyB64)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) })
}

export async function encryptJSON(value: unknown, keyB64: string): Promise<string> {
  return encryptText(JSON.stringify(value), keyB64)
}

export async function decryptText(ivB64: string, ctB64: string, keyB64: string): Promise<string> {
  const key = await aesKey(keyB64)
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(ivB64) }, key, unb64u(ctB64))
  return new TextDecoder().decode(plain)
}

/** מפענח מעטפה; טקסט לא מוצפן חוזר כמו שהוא */
export async function decryptEnvelope(raw: string, keyB64: string): Promise<string> {
  const env = JSON.parse(raw)
  if (env && env.enc === 1) return decryptText(env.iv, env.ct, keyB64)
  return raw
}

export async function decryptJSON<T = any>(raw: string, keyB64: string): Promise<T> {
  return JSON.parse(await decryptEnvelope(raw, keyB64)) as T
}

export function isEnvelope(raw: string): boolean {
  try {
    const env = JSON.parse(raw)
    return !!env && env.enc === 1 && typeof env.iv === 'string' && typeof env.ct === 'string'
  } catch {
    return false
  }
}

/** ‎#setup=…‎ — הפורמט ש-consumeSetupLink ב-src/cloud.ts קורא */
export function setupHash(cfg: { t?: string; p?: string; ak?: string; nk?: string }): string {
  return '#setup=' + Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64url')
}
