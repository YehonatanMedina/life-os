// ---------------------------------------------------------------------------
// הצפנה/פענוח של הצינור בין האפליקציה לסוכן הניתוח השבועי.
//
//   node scripts/insight-crypto.mjs dec <key> <in.enc.json> <out.json>
//   node scripts/insight-crypto.mjs enc <key> <in.json>     <out.enc.json>
//
// המפתח מגיע כארגומנט — הוא לא נמצא בקוד ולא במאגר. הפורמט זהה לזה של
// האפליקציה: {"enc":1,"iv":<base64url>,"ct":<base64url של הצופן + תג GCM>}.
// ---------------------------------------------------------------------------
import crypto from 'crypto'
import fs from 'fs'

const [, , mode, key, input, output] = process.argv
if (!mode || !key || !input || !output) {
  console.error('usage: insight-crypto.mjs enc|dec <key> <in> <out>')
  process.exit(2)
}

const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const b64u = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const raw = fs.readFileSync(input, 'utf8')

if (mode === 'dec') {
  const env = JSON.parse(raw)
  if (env.enc !== 1) {
    // כבר גלוי — פשוט מעתיקים
    fs.writeFileSync(output, raw)
    console.log('plain (not encrypted)')
    process.exit(0)
  }
  const all = unb64u(env.ct)
  const d = crypto.createDecipheriv('aes-256-gcm', unb64u(key), unb64u(env.iv))
  d.setAuthTag(all.subarray(all.length - 16))
  const plain = Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8')
  JSON.parse(plain) // נכשל בקול רם אם התוצאה לא JSON תקין
  fs.writeFileSync(output, plain)
  console.log('decrypted', plain.length, 'chars')
} else if (mode === 'enc') {
  JSON.parse(raw)
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', unb64u(key), iv)
  const ct = Buffer.concat([c.update(Buffer.from(raw, 'utf8')), c.final(), c.getAuthTag()])
  fs.writeFileSync(output, JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(ct) }))
  console.log('encrypted ->', output)
} else {
  console.error('unknown mode', mode)
  process.exit(2)
}
