// ---------------------------------------------------------------------------
// בונה את אייקוני האפליקציה מסימן המותג. מריצים ביד אחרי שינוי במותג:
//
//   node scripts/make-icons.mjs
//
// אין כאן ספריית גרפיקה בכוונה — הסימן הוא כמה קווים, וקידוד PNG הוא zlib
// ו-CRC. עדיף תסריט קצר שאפשר לקרוא מאשר תלות נוספת בשביל חמישה קבצים.
//
// הסימן זהה ל-Mark ב-src/brand.tsx: כוכב־לכת עם קו אורך וקו משווה, על קו
// אופק שמחזיק אותו. הצבעים הם שלושת צבעי המותג מ-styles.css.
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// צבעי המותג — חייבים להישאר זהים ל---brand-1/2/3 בערכה הבהירה
const BRAND = [
  [0x4b, 0x45, 0xe0],
  [0x7a, 0x3c, 0xe0],
  [0xef, 0x8a, 0x2b],
]

// --- גיאומטריה: הסימן על בד 24×24, כמו ב-SVG --------------------------------
const SPHERE = { cx: 12, cy: 9.6, r: 6 }
const STROKE = 1.55

/** מדגם של עיגול/אליפסה כשרשרת קטעים */
function ellipse(cx, cy, a, b, n = 96) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    pts.push([cx + a * Math.cos(t), cy + b * Math.sin(t)])
  }
  return pts
}

/** קשת הבסיס — בזייה ריבועית, אותה עקומה כמו ב-SVG */
function baseArc(n = 64) {
  const p0 = [2.4, 16.3]
  const p1 = [12, 23.4]
  const p2 = [21.6, 16.3]
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return pts
}

const SHAPES = [
  ellipse(SPHERE.cx, SPHERE.cy, SPHERE.r, SPHERE.r),
  ellipse(SPHERE.cx, SPHERE.cy, 2.35, SPHERE.r), // קו האורך
  [[6, 9.6], [18, 9.6]], // קו המשווה
  baseArc(),
]

/** המרחק מנקודה לקטע */
function segDist(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  let t = len === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = x1 + t * dx
  const qy = y1 + t * dy
  return Math.hypot(px - qx, py - qy)
}

/**
 * מצייר אייקון אחד. `maskable` משאיר שוליים רחבים יותר, כי אנדרואיד חותך
 * ממנו עיגול; אייקון רגיל מקבל פינות מעוגלות בעצמו.
 */
function icon(size, { maskable = false } = {}) {
  const SS = 2 // דגימת־יתר, לקווים חלקים
  const n = size * SS
  const pad = maskable ? 0.29 : 0.17 // שיעור מהצד שנשמר ריק סביב הסימן
  const scale = (n * (1 - 2 * pad)) / 24
  const off = n * pad
  const radius = maskable ? 0 : n * 0.235
  const half = (STROKE * scale) / 2

  // שדה כיסוי של הסימן — נבנה לפי תיבה חוסמת לכל קטע, ולא על כל הבד
  const cov = new Float32Array(n * n)
  const aa = SS * 0.8
  for (const pts of SHAPES) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = [pts[i][0] * scale + off, pts[i][1] * scale + off]
      const b = [pts[i + 1][0] * scale + off, pts[i + 1][1] * scale + off]
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - half - aa))
      const x1 = Math.min(n - 1, Math.ceil(Math.max(a[0], b[0]) + half + aa))
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - half - aa))
      const y1 = Math.min(n - 1, Math.ceil(Math.max(a[1], b[1]) + half + aa))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = segDist(x + 0.5, y + 0.5, a, b)
          const v = Math.min(1, Math.max(0, (half + aa / 2 - d) / aa))
          const k = y * n + x
          if (v > cov[k]) cov[k] = v
        }
      }
    }
  }

  // הרכבה: רקע בגרדיאנט המותג באלכסון, הסימן בלבן מעליו
  const px = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x
      // t לאורך האלכסון, כמו linear-gradient(118deg, …)
      const t = Math.min(1, Math.max(0, (x / n) * 0.62 + (y / n) * 0.38))
      const seg = t < 0.55 ? [BRAND[0], BRAND[1], t / 0.55] : [BRAND[1], BRAND[2], (t - 0.55) / 0.45]
      const [c1, c2, f] = seg
      let r = c1[0] + (c2[0] - c1[0]) * f
      let g = c1[1] + (c2[1] - c1[1]) * f
      let b = c1[2] + (c2[2] - c1[2]) * f
      const m = cov[k]
      if (m > 0) {
        r = r + (255 - r) * m
        g = g + (255 - g) * m
        b = b + (255 - b) * m
      }
      // פינות מעוגלות — אלפא, כדי שהאייקון ייראה נקי גם על רקע כלשהו
      let alpha = 255
      if (radius > 0) {
        const dx = Math.max(radius - (x + 0.5), (x + 0.5) - (n - radius), 0)
        const dy = Math.max(radius - (y + 0.5), (y + 0.5) - (n - radius), 0)
        if (dx > 0 && dy > 0) {
          const d = Math.hypot(dx, dy)
          alpha = Math.round(255 * Math.min(1, Math.max(0, radius - d + 0.5)))
        }
      }
      const o = k * 4
      px[o] = Math.round(r)
      px[o + 1] = Math.round(g)
      px[o + 2] = Math.round(b)
      px[o + 3] = alpha
    }
  }

  // הקטנה חזרה לגודל המבוקש — ממוצע של SS×SS
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const o = ((y * SS + j) * n + x * SS + i) * 4
          r += px[o]; g += px[o + 1]; b += px[o + 2]; a += px[o + 3]
        }
      }
      const c = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / c)
      out[o + 1] = Math.round(g / c)
      out[o + 2] = Math.round(b / c)
      out[o + 3] = Math.round(a / c)
    }
  }
  return out
}

// --- קידוד PNG --------------------------------------------------------------
const CRC = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // שורות עם byte סינון 0 בראש כל אחת
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FILES = [
  ['favicon-32.png', 32, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]

for (const [name, size, opt] of FILES) {
  writeFileSync(join(OUT, name), png(size, icon(size, opt)))
  console.log(name, size)
}
