// ---------------------------------------------------------------------------
// מה שנשבר בשטח ולא בקוד: פער בקליטה, קצב קריאות שהמערכת האטה, הליכה,
// פניות חדות, רעש אנכי ושעון שקפץ. כל בדיקה כאן נולדה מליקוי שנמדד —
// הערך שכתוב לפני התיקון מופיע בהערה, כדי שאם מישהו יחזיר את ההתנהגות
// הישנה, הבדיקה תסביר מה אבד.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { type Fix, LIMITS, addFix, decodePolyline, emptyRun, encodePolyline, judgeFix, reanchor, simplify } from '../../../src/run'

const T0 = 1_800_000_000_000
const LAT = 32.7767
const LON = 35.0225
const M_PER_DEG_LAT = 110_900.6
const M_PER_DEG_LON = 93_565.5

const run = (fixes: Fix[], startedAt = T0) => fixes.reduce((s, f) => addFix(s, f), emptyRun(startedAt))

/** קריאה בזמן t (שניות מההתחלה) על קו ישר צפונה במהירות נתונה */
const north = (sec: number, mps: number, extra: Partial<Fix> = {}): Fix => ({
  lat: LAT + (sec * mps) / M_PER_DEG_LAT,
  lon: LON,
  t: T0 + sec * 1000,
  acc: 6,
  ...extra,
})

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())

// ---------------------------------------------------------------------------

describe('פער בקליטה', () => {
  /** רץ 60 שניות, נעלם ל-gap שניות (וממשיך לרוץ), וחוזר ל-60 שניות */
  function withGap(gapSec: number, mps = 1000 / 300) {
    const xs: Fix[] = []
    for (let i = 0; i <= 60; i++) xs.push(north(i, mps))
    for (let i = 60 + gapSec; i <= 120 + gapSec; i++) xs.push(north(i, mps))
    return { state: run(xs), truth: (120 + gapSec) * mps }
  }

  // לפני התיקון: פער של 30 שניות איבד 120 מטר, דקה 220 מטר, וחמש דקות
  // 1,020 מטר — יותר מחצי מהריצה — והמסך לא הראה שום סימן.
  for (const gap of [15, 30, 60, 300]) {
    it(`פער של ${gap} שניות נספר כקו ישר ולא נמחק`, () => {
      const { state, truth } = withGap(gap)
      expect(Math.abs(state.meters - truth) / truth, `${gap}s`).toBeLessThan(0.03)
    })
  }

  it('מה שהוערך בקו ישר נשמר בנפרד, כדי שהסיכום יוכל להגיד את זה', () => {
    const { state } = withGap(60)
    expect(state.est.meters).toBeGreaterThan(150)
    expect(state.est.sec).toBeGreaterThan(55)
    // ריצה רגילה בלי פערים לא מדווחת על הערכה
    const clean = run(Array.from({ length: 121 }, (_, i) => north(i, 1000 / 300)))
    expect(clean.est.meters).toBe(0)
  })

  it('פער מגושר נספר גם בזמן, כדי שהקצב לא יתייפה', () => {
    const { state, truth } = withGap(300)
    // הפיתוי הוא לספור את המרחק ולא את הזמן. זו בדיוק הטעות שאי אפשר
    // לגלות בדיעבד: הקצב היה יוצא מהיר ממה שנרוץ.
    expect(state.movingSec).toBeGreaterThan(380)
    expect(state.elapsedSec).toBeGreaterThan(400)
    const paceSecPerKm = state.movingSec / (state.meters / 1000)
    expect(paceSecPerKm).toBeGreaterThan(290)
    expect(paceSecPerKm).toBeLessThan(310)
    expect(state.meters / truth).toBeGreaterThan(0.97)
  })

  it('פער של עשרים דקות לא מגושר בכלל — מתחיל קטע חדש', () => {
    // הטלפון היה סגור, או שהייתה נסיעה. קו ישר על עשרים דקות הוא המצאה,
    // וכאן עדיף לאבד מרחק מאשר להמציא אותו.
    const { state } = withGap(1200)
    const beforeGap = 60 * (1000 / 300)
    const afterGap = 60 * (1000 / 300)
    expect(state.meters).toBeLessThan(beforeGap + afterGap + 50)
    expect(state.meters).toBeGreaterThan(beforeGap + afterGap - 50)
  })

  it('קו ישר במהירות של רכב נדחה', () => {
    // 18 שניות, 140 מטר = 7.8 מ׳/ש׳. זה לא קצב ריצה, זו נסיעה.
    const s = run(Array.from({ length: 31 }, (_, i) => north(i, 1000 / 300)))
    const far: Fix = {
      lat: s.last!.lat + 140 / M_PER_DEG_LAT,
      lon: LON,
      t: s.last!.t + 18_000,
      acc: 6,
    }
    expect(judgeFix(s, far)).toBe('jump')
    expect(addFix(s, far).meters).toBe(s.meters)
  })
})

describe('קצב קריאות איטי', () => {
  // לפני התיקון: מ-13 שניות ומעלה הריצה נרשמה 0.00 ק״מ, "עומד" לכל אורכה,
  // ואז נמחקה בסיום בלי הודעה. זה מה שקורה כשאנדרואיד חוסך סוללה.
  for (const step of [5, 13, 20, 30, 45]) {
    it(`קריאה כל ${step} שניות מודדת את המרחק`, () => {
      const mps = 1000 / 300
      const xs: Fix[] = []
      for (let sec = 0; sec <= 600; sec += step) xs.push(north(sec, mps))
      const s = run(xs)
      const truth = 600 * mps
      expect(Math.abs(s.meters - truth) / truth, `${step}s`).toBeLessThan(0.04)
      expect(s.still, 'לא "עומד" בזמן ריצה').toBe(false)
    })
  }
})

describe('הליכה ופניות', () => {
  it('הליכה ב-12 דקות לקילומטר נמדדת, עם מהירות מהמכשיר', () => {
    // לפני התיקון: 28% מהמרחק אבד, ורק 70% מהזמן נספר כתנועה — כי מבחן
    // הישירוּת על חלון רועש הכריז "עמידה" על הליכה.
    const r = rng(99)
    const mps = 1000 / 720
    let s = emptyRun(T0)
    for (let i = 0; i <= 600; i++) {
      s = addFix(s, {
        lat: LAT + (i * mps + gauss(r) * 3) / M_PER_DEG_LAT,
        lon: LON + (gauss(r) * 3) / M_PER_DEG_LON,
        t: T0 + i * 1000,
        acc: 8,
        spd: Math.max(0, mps + gauss(r) * 0.25),
      })
    }
    const truth = 600 * mps
    expect(Math.abs(s.meters - truth) / truth).toBeLessThan(0.08)
    expect(s.movingSec).toBeGreaterThan(540)
  })

  it('עמידה עם מהירות מהמכשיר לא מוסיפה מרחק', () => {
    // הדרך השנייה שבה אפשר לטעות: להאמין לדופלר יותר מדי. בעמידה
    // המכשיר מדווח כמעט אפס, ורעש המיקום הוא 8 מטר.
    const r = rng(1234)
    let s = emptyRun(T0)
    for (let i = 0; i <= 300; i++) {
      s = addFix(s, {
        lat: LAT + (gauss(r) * 8) / M_PER_DEG_LAT,
        lon: LON + (gauss(r) * 8) / M_PER_DEG_LON,
        t: T0 + i * 1000,
        acc: 10,
        spd: Math.abs(gauss(r) * 0.3),
      })
    }
    expect(s.meters).toBeLessThan(40)
    expect(s.movingSec).toBeLessThan(20)
  })

  it('פניית פרסה בטיילת — מה שקורה בריצת הלוך-חזור אמיתית', () => {
    // המקרה שבאמת קורה לו: ריצה ישרה, פנייה אחת, וחזרה. כאן ההחלקה
    // עולה מעט מאוד.
    const mps = 3.3
    let s = emptyRun(T0)
    for (let i = 0; i <= 600; i++) {
      const d = i * mps
      const along = d <= 1000 ? d : 2000 - d
      s = addFix(s, { lat: LAT + along / M_PER_DEG_LAT, lon: LON, t: T0 + i * 1000, acc: 6, spd: mps })
    }
    const truth = 600 * mps
    expect(Math.abs(s.meters - truth) / truth).toBeLessThan(0.05)
  })

  it('סרפנטינה עם קטעים של 25 מטר — המקרה הגרוע ביותר, ומתועד ככזה', () => {
    // פנייה של 180 מעלות כל עשר שניות היא התבנית הקשה ביותר לכל מד GPS:
    // כל החלקה חותכת את הפינות. לפני התיקון נמדדו 21% פחות; היום 13%,
    // וזו התקרה של השיטה הזו. בריצות שלו (כביש, טיילת) זה לא קורה.
    const mps = 2.5
    const leg = 25
    let s = emptyRun(T0)
    for (let i = 0; i <= 400; i++) {
      const d = i * mps
      const k = Math.floor(d / leg)
      const into = d - k * leg
      const x = k % 2 === 0 ? into : leg - into
      s = addFix(s, {
        lat: LAT + (d * 0.35) / M_PER_DEG_LAT,
        lon: LON + x / M_PER_DEG_LON,
        t: T0 + i * 1000,
        acc: 6,
        spd: mps,
      })
    }
    const truth = 400 * mps
    expect(Math.abs(s.meters - truth) / truth).toBeLessThan(0.15)
  })
})

describe('גובה מול רעש אנכי', () => {
  // לפני התיקון היה כאן מחגר: כל רעש של שני מטרים הצטבר. נמדדו 580 מטרי
  // "עלייה" על שישה קילומטרים שטוחים לגמרי (ובסיגמא של 5 מטר — 2,274).
  for (const sigma of [2, 3, 5, 8]) {
    it(`שישה קילומטרים שטוחים עם רעש של ${sigma} מטר — פחות מ-90 מטר עלייה מדומה`, () => {
      const r = rng(sigma * 31)
      const mps = 1000 / 300
      let s = emptyRun(T0)
      for (let i = 0; i <= 1800; i++) {
        s = addFix(s, { ...north(i, mps), alt: 200 + gauss(r) * sigma, spd: mps })
      }
      expect(s.gainM, `sigma=${sigma}`).toBeLessThan(90)
    })
  }

  it('עלייה אמיתית לרכס עדיין נמדדת', () => {
    const r = rng(7)
    const mps = 1000 / 330
    let s = emptyRun(T0)
    // 1,200 שניות, עלייה של 280 מטר — העלייה מהטכניון לאוניברסיטה
    for (let i = 0; i <= 1200; i++) {
      s = addFix(s, { ...north(i, mps), alt: 196 + (i / 1200) * 280 + gauss(r) * 3, spd: mps })
    }
    expect(s.gainM).toBeGreaterThan(230)
    expect(s.gainM).toBeLessThan(330)
  })
})

describe('שעון', () => {
  it('חותמת זמן מהעתיד לא הורגת את המשך הריצה', () => {
    // לפני התיקון: קריאה אחת שקפצה שעה קדימה נשמרה כ"אחרונה", וכל מה
    // שאחריה נדחה כ"אחורה" — המרחק נעצר, השעון המשיך, ואף מונה לא ידע.
    const mps = 1000 / 300
    const xs: Fix[] = []
    for (let i = 0; i <= 120; i++) xs.push(north(i, mps))
    xs.splice(60, 0, { ...north(60, mps), t: T0 + 3_600_000 })
    const s = run(xs)
    const truth = 120 * mps
    // המחיר: שלוש הקריאות שנדחו עד שהמנוע הבין שהחותמת השמורה היא
    // הפגומה, ועוד העיגון מחדש. לפני התיקון אבדו 53% מהריצה.
    expect(Math.abs(s.meters - truth) / truth).toBeLessThan(0.08)
    expect(s.rejected.back).toBeGreaterThan(0)
  })
})

describe('עיגון מחדש', () => {
  it('נסיעה בזמן השהיה לא נכנסת כמרחק — גם בלי קריאות באמצע', () => {
    // מה שקרה בשטח: עצר, כיבה מסך, נסע 140 מטר, לחץ "המשך". המנוע
    // גישר על הנסיעה כי נקודת הספירה נשארה במקום שבו עצר.
    const mps = 1000 / 300
    let s = run(Array.from({ length: 61 }, (_, i) => north(i, mps)))
    const before = s.meters
    s = reanchor({ ...s, paused: false })
    // הקריאה הראשונה אחרי העיגון היא נקודת התחלה חדשה, ולא קו ישר מהעבר
    const away: Fix = { lat: LAT + 400 / M_PER_DEG_LAT, lon: LON, t: T0 + 200_000, acc: 6, spd: mps }
    s = addFix(s, away)
    expect(s.meters).toBeCloseTo(before, 1)
    // וממשיכים למדוד כרגיל מהנקודה החדשה
    for (let i = 201; i <= 260; i++) {
      s = addFix(s, { lat: away.lat + ((i - 200) * mps) / M_PER_DEG_LAT, lon: LON, t: T0 + i * 1000, acc: 6, spd: mps })
    }
    expect(s.meters - before).toBeGreaterThan(60 * mps * 0.9)
  })

  it('עיגון מחדש לא מוחק את המסלול שנמדד', () => {
    const s = run(Array.from({ length: 61 }, (_, i) => north(i, 1000 / 300)))
    const after = addFix(reanchor(s), north(120, 1000 / 300))
    expect(after.pts.length).toBe(s.pts.length + 1)
    expect(after.splits).toEqual(s.splits)
  })
})

describe('קידוד ופענוח עמידים', () => {
  it('קריאה פגומה לא משטחת את המסלול לקו ישר', () => {
    const pts = Array.from({ length: 40 }, (_, i) => [LAT + i * 0.0002, LON + Math.sin(i / 3) * 0.0006, i] as [number, number, number])
    const bad = [...pts]
    bad[17] = [NaN, NaN, 17]
    expect(simplify(bad as never, 6).length).toBeGreaterThan(5)
  })

  it('מחרוזת שנקטעה מפוענחת עד הנקודה השלמה האחרונה', () => {
    const pts = Array.from({ length: 12 }, (_, i) => [LAT + i * 0.0003, LON + i * 0.0002] as [number, number])
    const enc = encodePolyline(pts as never)
    const cut = decodePolyline(enc.slice(0, enc.length - 1))
    expect(cut.length).toBeLessThanOrEqual(pts.length)
    for (const p of cut) {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Math.abs(p[0] - LAT)).toBeLessThan(0.02)
    }
  })
})

describe('גבולות', () => {
  it('הקבועים שהבדיקות מסתמכות עליהם לא זזו בשקט', () => {
    expect(LIMITS.dopplerStill).toBeLessThan(1.2)
    expect(LIMITS.bridgeSpeed).toBeLessThan(LIMITS.maxSpeed)
    expect(LIMITS.altStep).toBeGreaterThanOrEqual(5)
  })
})
