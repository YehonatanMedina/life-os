// ---------------------------------------------------------------------------
// מנוע הריצה. ריצה קורית פעם אחת — אי אפשר "לנסות שוב" מרחק שנמדד לא נכון,
// ולכן כל מקרה שקורה בשטח נבדק כאן על מסלול מלאכותי: רעש GPS בעמידה במקום,
// קפיצה של האנטנה, רמזור, עלייה לכרמל, וסגירת קילומטרים בדיוק בקו.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import {
  type Fix,
  type Pt,
  LIMITS,
  addFix,
  bounds,
  emptyRun,
  fmtClock,
  fmtKm,
  fmtPace,
  haversine,
  judgeFix,
  livePace,
  nearestOnRoute,
  pace,
  polyLength,
  simplify,
} from '../../../src/run'

const T0 = 1_800_000_000_000
// הטכניון — נקודת ההתחלה של רוב הריצות שלו
const LAT = 32.7767
const LON = 35.0225
// מטרים למעלה של קו רוחב ב-32.7767° לפי הנוסחה המקובלת ל-WGS84 — קבוע
// עצמאי, כדי שהבדיקה לא תסתמך על אותו חישוב שהיא בודקת
const M_PER_DEG_LAT = 110_900.6

/** מסלול ישר צפונה במהירות נתונה, קריאה בשנייה */
function straight(opts: { seconds: number; paceMinKm: number; acc?: number; startT?: number; fromLat?: number; alt?: (i: number) => number }): Fix[] {
  const mps = 1000 / (opts.paceMinKm * 60)
  const out: Fix[] = []
  for (let i = 0; i <= opts.seconds; i++) {
    out.push({
      lat: (opts.fromLat ?? LAT) + (i * mps) / M_PER_DEG_LAT,
      lon: LON,
      t: (opts.startT ?? T0) + i * 1000,
      acc: opts.acc ?? 5,
      alt: opts.alt?.(i),
    })
  }
  return out
}

const run = (fixes: Fix[], startedAt = T0) => fixes.reduce((s, f) => addFix(s, f), emptyRun(startedAt))

describe('מרחק', () => {
  it('haversine מול מרחקים ידועים', () => {
    // מעלה של קו רוחב בקו המשווה ≈ 110.57 ק״מ (אליפסואיד, לא כדור)
    expect(haversine(0, 0, 1, 0) / 1000).toBeCloseTo(110.57, 1)
    // ובקו הרוחב של חיפה ≈ 110.90
    expect(haversine(LAT, LON, LAT + 1, LON) / 1000).toBeCloseTo(110.93, 1)
    // 100 מטר צפונה
    expect(haversine(LAT, LON, LAT + 100 / M_PER_DEG_LAT, LON)).toBeCloseTo(100, 0)
    expect(haversine(LAT, LON, LAT, LON)).toBe(0)
  })

  it('ריצה ישרה של 10 דקות בקצב 5:00 — 2 ק״מ בדיוק של פחות מאחוז', () => {
    const s = run(straight({ seconds: 600, paceMinKm: 5 }))
    expect(s.meters / 1000).toBeGreaterThan(1.99)
    expect(s.meters / 1000).toBeLessThan(2.01)
    expect(s.movingSec).toBeGreaterThanOrEqual(595)
    expect(s.elapsedSec).toBe(600)
    expect(pace(s.meters, s.movingSec)).toBeCloseTo(5, 1)
  })
})

describe('סינון קריאות', () => {
  it('קריאה עם דיוק גרוע נדחית ולא נספרת כמרחק', () => {
    const good = straight({ seconds: 10, paceMinKm: 5 })
    const weak: Fix = { lat: LAT + 0.01, lon: LON, t: T0 + 11_000, acc: 80 }
    const s = run([...good, weak])
    expect(judgeFix(run(good), weak)).toBe('weak')
    expect(s.rejected.weak).toBe(1)
    expect(s.meters).toBeLessThan(60)
  })

  it('קפיצת GPS (200 מטר בשנייה) נדחית', () => {
    const good = straight({ seconds: 10, paceMinKm: 5 })
    const jump: Fix = { lat: LAT + 0.002, lon: LON, t: T0 + 11_000, acc: 5 }
    expect(judgeFix(run(good), jump)).toBe('jump')
    const s = run([...good, jump])
    expect(s.rejected.jump).toBe(1)
  })

  it('רעש בעמידה במקום לא מייצר מרחק — הבאג הקלאסי', () => {
    const fixes: Fix[] = []
    for (let i = 0; i <= 120; i++) {
      // ריצוד של עד ±2.5 מטר סביב אותה נקודה
      const j = ((i * 37) % 11) - 5
      fixes.push({ lat: LAT + (j * 0.5) / M_PER_DEG_LAT, lon: LON, t: T0 + i * 1000, acc: 8 })
    }
    const s = run(fixes)
    expect(s.meters).toBe(0)
    expect(s.movingSec).toBe(0)
    expect(s.elapsedSec).toBe(120)
    expect(s.still).toBe(true)
  })

  it('קריאה שחוזרת אחורה בזמן נדחית', () => {
    const good = straight({ seconds: 5, paceMinKm: 5 })
    expect(judgeFix(run(good), { lat: LAT, lon: LON, t: T0 })).toBe('back')
  })

  it('סף הדיוק והמהירות הם מה שכתוב ב-LIMITS', () => {
    expect(LIMITS).toMatchObject({ maxAccuracy: 25, maxSpeed: 8, minStep: 5 })
  })
})

describe('רמזור', () => {
  it('עצירה של דקה: הזמן המוחלט רץ, הזמן נטו לא, והמרחק ממשיך אחריה', () => {
    const a = straight({ seconds: 300, paceMinKm: 5 })
    const stopLat = a[a.length - 1].lat
    const stop: Fix[] = []
    for (let i = 1; i <= 60; i++) stop.push({ lat: stopLat, lon: LON, t: T0 + (300 + i) * 1000, acc: 6 })
    const b = straight({ seconds: 300, paceMinKm: 5, startT: T0 + 361_000, fromLat: stopLat })
    const s = run([...a, ...stop, ...b])

    expect(s.elapsedSec).toBeGreaterThanOrEqual(660)
    // זמן נטו ≈ 600 שניות, בלי הדקה של העצירה
    expect(s.movingSec).toBeGreaterThan(590)
    expect(s.movingSec).toBeLessThan(615)
    expect(s.meters / 1000).toBeGreaterThan(1.98)
    expect(s.meters / 1000).toBeLessThan(2.02)
  })

  it('השהיה ידנית עוצרת גם מרחק וגם זמן נטו', () => {
    let s = run(straight({ seconds: 60, paceMinKm: 5 }))
    const beforeM = s.meters
    s = { ...s, paused: true }
    for (const f of straight({ seconds: 60, paceMinKm: 5, startT: T0 + 61_000, fromLat: LAT + 0.01 })) s = addFix(s, f)
    expect(s.meters).toBe(beforeM)
    expect(s.movingSec).toBeLessThanOrEqual(61)
  })
})

describe('קילומטרים', () => {
  it('קצב 5:00 — כל ספליט ≈ 300 שניות, והמספור רץ', () => {
    const s = run(straight({ seconds: 950, paceMinKm: 5 }))
    expect(s.splits).toHaveLength(3)
    expect(s.splits.map((x) => x.km)).toEqual([1, 2, 3])
    for (const sp of s.splits) {
      expect(sp.sec).toBeGreaterThan(297)
      expect(sp.sec).toBeLessThan(303)
    }
  })

  it('קצב משתנה: קילומטר מהיר וקילומטר איטי נספרים נכון', () => {
    const fast = straight({ seconds: 240, paceMinKm: 4 })
    const slowStart = fast[fast.length - 1]
    const slow = straight({ seconds: 520, paceMinKm: 7, startT: slowStart.t + 1000, fromLat: slowStart.lat })
    const s = run([...fast, ...slow])
    expect(s.splits.length).toBeGreaterThanOrEqual(2)
    expect(s.splits[0].sec).toBeGreaterThan(235)
    expect(s.splits[0].sec).toBeLessThan(245)
    expect(s.splits[1].sec).toBeGreaterThan(400)
    expect(s.splits[1].sec).toBeLessThan(440)
  })

  it('הקילומטר נסגר בדיוק בקו, לא בקריאה הבאה', () => {
    // צעדים של 10 מטר: הקו נופל באמצע צעד
    const fixes: Fix[] = []
    for (let i = 0; i <= 120; i++) {
      fixes.push({ lat: LAT + (i * 10) / M_PER_DEG_LAT, lon: LON, t: T0 + i * 3000, acc: 5 })
    }
    const s = run(fixes)
    expect(s.splits).toHaveLength(1)
    // 1000 מטר ב-10 מטר לכל 3 שניות = 300 שניות
    expect(s.splits[0].sec).toBeGreaterThan(297)
    expect(s.splits[0].sec).toBeLessThan(303)
    // ומה שנשאר נספר לקילומטר הבא
    expect(s.kmMeters).toBeGreaterThan(190)
    expect(s.kmMeters).toBeLessThan(210)
  })
})

describe('גובה', () => {
  it('עלייה של 100 מטר עם רעש נספרת כ-100, לא כפול', () => {
    const s = run(
      straight({
        seconds: 600,
        paceMinKm: 5,
        alt: (i) => 210 + (i / 600) * 100 + (((i * 17) % 7) - 3) * 0.4,
      }),
    )
    expect(s.gainM).toBeGreaterThan(85)
    expect(s.gainM).toBeLessThan(115)
  })

  it('ירידה לא נספרת כעלייה', () => {
    const s = run(straight({ seconds: 300, paceMinKm: 5, alt: (i) => 300 - (i / 300) * 80 }))
    expect(s.gainM).toBeLessThan(5)
  })
})

describe('קצב רגעי', () => {
  it('מחושב על חלון, ולכן לא מקפץ בין קריאות', () => {
    const s = run(straight({ seconds: 300, paceMinKm: 5 }))
    expect(livePace(s.pts)).toBeGreaterThan(4.7)
    expect(livePace(s.pts)).toBeLessThan(5.3)
  })

  it('בלי מספיק נקודות — 0, והמסך יציג מקף', () => {
    expect(livePace([])).toBe(0)
    expect(livePace([[LAT, LON, 0]])).toBe(0)
    expect(pace(5, 10)).toBe(0)
  })
})

describe('תצוגה', () => {
  it('קצב, שעון ומרחק', () => {
    expect(fmtPace(5)).toBe('5:00')
    expect(fmtPace(5.505)).toBe('5:30')
    expect(fmtPace(0)).toBe('--')
    expect(fmtPace(NaN)).toBe('--')
    expect(fmtClock(75)).toBe('1:15')
    expect(fmtClock(3912)).toBe('1:05:12')
    expect(fmtClock(0)).toBe('0:00')
    expect(fmtKm(7423)).toBe('7.42')
  })
})

describe('שמירה ומפה', () => {
  const line: Pt[] = Array.from({ length: 200 }, (_, i) => [LAT + (i * 5) / M_PER_DEG_LAT, LON, i * 2] as Pt)

  it('קו ישר מתכווץ לשתי נקודות', () => {
    expect(simplify(line, 8)).toHaveLength(2)
  })

  it('עיקול נשמר בתוך הסבילות', () => {
    const curve: Pt[] = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 100) * Math.PI
      return [LAT + (Math.sin(a) * 300) / M_PER_DEG_LAT, LON + (Math.cos(a) * 300) / (M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180)), i] as Pt
    })
    const s = simplify(curve, 8)
    expect(s.length).toBeGreaterThan(5)
    expect(s.length).toBeLessThan(curve.length)
    expect(s[0]).toEqual(curve[0])
    expect(s[s.length - 1]).toEqual(curve[curve.length - 1])
    // האורך לא משתנה מהותית
    const before = polyLength(curve.map((p) => [p[0], p[1]] as [number, number]))
    const after = polyLength(s.map((p) => [p[0], p[1]] as [number, number]))
    expect(Math.abs(after - before) / before).toBeLessThan(0.02)
  })

  it('ריצה של שעה מתכווצת לגודל שאפשר לשמור', () => {
    const hour = run(straight({ seconds: 3600, paceMinKm: 5 })).pts
    // שער המרחק כבר מדלל: נקודה כל ~5 מטר, לא כל שנייה
    expect(hour.length).toBeGreaterThan(1200)
    const small = simplify(hour, 8)
    expect(JSON.stringify(small).length).toBeLessThan(20_000)
  })

  it('מסלול: אורך, נקודה קרובה, ותיבה תוחמת', () => {
    const poly: Array<[number, number]> = [
      [LAT, LON],
      [LAT + 500 / M_PER_DEG_LAT, LON],
      [LAT + 1000 / M_PER_DEG_LAT, LON],
    ]
    expect(polyLength(poly)).toBeCloseTo(1000, -1)
    const near = nearestOnRoute(poly, LAT + 250 / M_PER_DEG_LAT, LON + 0.0002)
    expect(near.meters).toBeLessThan(25)
    expect(near.index).toBe(0)
    const off = nearestOnRoute(poly, LAT + 250 / M_PER_DEG_LAT, LON + 0.01)
    expect(off.meters).toBeGreaterThan(500)
    const b = bounds(poly)!
    expect(b.minLat).toBeCloseTo(LAT, 5)
    expect(b.maxLat).toBeCloseTo(LAT + 1000 / M_PER_DEG_LAT, 5)
    expect(bounds([])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// הבדיקה שקובעת אם אפשר לסמוך על המספר על המסך. מודל הרעש: הטיה מתמשכת
// (AR(1), קבוע זמן דקה) ועוד רעש לבן — כך נראה GPS של טלפון בפועל. סכימה
// נאיבית של הקריאות מנפחת את המרחק בעשרות אחוזים; זו בדיוק הסיבה שהמנוע
// מחליק, משער ומגשר.
// ---------------------------------------------------------------------------
describe('דיוק מול רעש GPS אמיתי', () => {
  const md = (lat: number) => {
    const p = (lat * Math.PI) / 180
    return { lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p), lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) }
  }
  const MD = md(LAT)

  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
  }
  const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())

  /** ריבוע של 500 מטר — עם פינות אמיתיות, כדי שהחלקה לא "תחתוך" בחינם */
  function truePoint(sec: number): [number, number] {
    const d = sec * (1000 / 300)
    const p = d % 2000
    const leg = 500
    let x = 0
    let y = 0
    if (p < leg) y = p
    else if (p < 2 * leg) {
      y = leg
      x = p - leg
    } else if (p < 3 * leg) {
      x = leg
      y = leg - (p - 2 * leg)
    } else x = leg - (p - 3 * leg)
    return [LAT + y / MD.lat, LON + x / MD.lon]
  }

  function simulate(sigma: number, seed: number, seconds = 1800) {
    const r = rng(seed)
    let bx = 0
    let by = 0
    let s = emptyRun(T0)
    let naive = 0
    let prev: [number, number] | null = null
    const a = Math.exp(-1 / 60)
    for (let i = 0; i <= seconds; i++) {
      bx = bx * a + gauss(r) * sigma * Math.sqrt(1 - a * a)
      by = by * a + gauss(r) * sigma * Math.sqrt(1 - a * a)
      const [tlat, tlon] = truePoint(i)
      const lat = tlat + (by + gauss(r) * 1.5) / MD.lat
      const lon = tlon + (bx + gauss(r) * 1.5) / MD.lon
      if (prev) naive += haversine(prev[0], prev[1], lat, lon)
      prev = [lat, lon]
      s = addFix(s, { lat, lon, t: T0 + i * 1000, acc: 6 })
    }
    return { engine: s.meters, naive, truth: seconds * (1000 / 300) }
  }

  it('שטח פתוח: סכימה נאיבית מנפחת עשרות אחוזים, המנוע בתוך 1.5%', () => {
    const runs = [1, 2, 3, 4].map((sd) => simulate(4, sd * 7919))
    const err = (k: 'engine' | 'naive') => runs.reduce((a, r) => a + Math.abs(r[k] - r.truth) / r.truth, 0) / runs.length
    expect(err('naive'), 'סכימה נאיבית').toBeGreaterThan(0.15)
    expect(err('engine'), 'המנוע').toBeLessThan(0.015)
  })

  it('עיר צפופה (רעש כפול): המנוע נשאר בתוך 4%', () => {
    const runs = [5, 6, 7].map((sd) => simulate(10, sd * 7919))
    const err = runs.reduce((a, r) => a + Math.abs(r.engine - r.truth) / r.truth, 0) / runs.length
    expect(err).toBeLessThan(0.04)
  })

  it('עמידה של חמש דקות באמצע ריצה לא מוסיפה מרחק מדומה', () => {
    const r = rng(4242)
    let s = emptyRun(T0)
    const [lat0, lon0] = truePoint(0)
    for (let i = 0; i <= 300; i++) {
      s = addFix(s, { lat: lat0 + (gauss(r) * 4) / MD.lat, lon: lon0 + (gauss(r) * 4) / MD.lon, t: T0 + i * 1000, acc: 8 })
    }
    // מאות מטרים מדומים הם מה שקורה בלי סינון; כאן — עשרות בודדות לכל היותר
    expect(s.meters).toBeLessThan(40)
  })
})
