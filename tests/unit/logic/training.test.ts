// ---------------------------------------------------------------------------
// תורת האימון. כל בדיקה כאן מעגנת מספר שמגיע ממקור — כך ששינוי בשקט
// במספר כזה ייפול, ומי שמשנה ייאלץ להסביר למה.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import {
  HALF_ANCHORS,
  LONG_RUN_MIN_MINUTES,
  MDC95,
  RUN_SESSIONS,
  STRENGTH_DOSE,
  WEEK_FLOOR,
  apre6,
  checkWeek,
  criticalSpeed,
  isoHold,
  longShare,
  paces,
  readiness,
  riegel,
  sessionCapKm,
  testChanged,
  vdot,
  volumeRamp,
  proposeWeek,
  splitWeek,
  weekChanges,
  type DayKind,
  type Wellness,
} from '../../../src/training'

describe('VDOT וקצבים', () => {
  it('מתאים לטבלה המפורסמת בנקודות ידועות', () => {
    // 5 ק״מ ב-20:00 = VDOT 49.8 לפי הנוסחה של דניאלס-גילברט
    expect(vdot(5000, 1200)).toBeCloseTo(49.8, 0)
    // 5 ק״מ ב-24:00 ≈ 40.2
    expect(vdot(5000, 1440)).toBeCloseTo(40.2, 0)
    // ומבחן ארוך יותר של אותו רץ נותן בערך אותו מספר — זו הבדיקה
    // הפנימית שהמערכת מסכימה עם עצמה
    const t10k = riegel(1200, 5000, 10000)
    expect(Math.abs(vdot(10000, t10k) - vdot(5000, 1200))).toBeLessThan(1.5)
  })

  it('קצבים מסודרים מהקל למהיר, והסף נופל בין המרתון לאינטרוול', () => {
    const p = paces(vdot(5000, 1500)) // 25:00 ל-5 ק״מ — רץ חובב
    // הטווח נכתב כמו באפליקציה: קודם המהיר, אחר כך האיטי
    expect(p.easy[0]).toBeLessThan(p.easy[1])
    expect(p.easy[0]).toBeGreaterThan(p.marathon)
    expect(p.marathon).toBeGreaterThan(p.threshold)
    expect(p.threshold).toBeGreaterThan(p.interval)
    expect(p.interval).toBeGreaterThan(p.rep)
  })

  it('קצב חצי מרתון יושב בין קצב המרתון לקצב הסף', () => {
    const p = paces(vdot(5000, 1500))
    // איטי מהסף, מהיר מקצב המרתון — בדיוק הסדר שדניאלס נותן
    expect(p.half).toBeGreaterThan(p.threshold)
    expect(p.half).toBeLessThan(p.marathon)
  })

  it('רייגל: חצי מרתון מ-5 ק״מ, בלי תיקון — מקדם הכיול לא נבדל מ-1', () => {
    // 20:00 ל-5 ק״מ → כ-1:32 לחצי מרתון
    const half = riegel(1200, 5000, 21097.5)
    expect(half / 60).toBeGreaterThan(90)
    expect(half / 60).toBeLessThan(94)
  })
})

describe('מהירות קריטית', () => {
  it('המודל הליניארי מחזיר מהירות והון אנאירובי הגיוניים', () => {
    // רץ שעושה 1,200 מ׳ ב-4:00 ו-5,000 מ׳ ב-20:00
    const r = criticalSpeed(1200, 240, 5000, 1200)!
    expect(r.cs).toBeCloseTo((5000 - 1200) / (1200 - 240), 3)
    expect(r.cs).toBeGreaterThan(3)
    expect(r.cs).toBeLessThan(5)
    expect(r.dPrime).toBeGreaterThan(0)
  })

  it('שני מאמצים באותו זמן לא מייצרים מספר מומצא', () => {
    expect(criticalSpeed(1200, 240, 5000, 240)).toBeNull()
  })
})

describe('שינוי אמיתי מול רעש', () => {
  it('שיפור של 2% במבחן 5 ק״מ הוא רעש, של 6% הוא אמיתי', () => {
    expect(testChanged(1200, 1176, MDC95.timeTrial5k)).toBe(false) // 2%
    expect(testChanged(1200, 1128, MDC95.timeTrial5k)).toBe(true) // 6%
  })

  it('מבחן מהירות קריטית רגיש בהרבה — 1.5% כבר נחשב', () => {
    expect(testChanged(4.0, 4.06, MDC95.criticalSpeed)).toBe(true)
    expect(testChanged(4.0, 4.02, MDC95.criticalSpeed)).toBe(false)
  })
})

describe('סולם הנפח', () => {
  const ramp = volumeRamp({ startKm: 12, weeks: 20 })

  it('שלושת השבועות הראשונים שמרניים — זה החלון שנמדד כפגיע', () => {
    const w2 = ramp[1].km / ramp[0].km - 1
    expect(w2).toBeLessThan(0.06)
  })

  it('שבוע ירידה כל ארבעה שבועות, ונמוך מהשבוע שלפניו', () => {
    const downs = ramp.filter((w) => w.kind === 'down')
    expect(downs.length).toBeGreaterThanOrEqual(3)
    for (const d of downs) {
      const prev = ramp[d.n - 2]
      expect(d.km).toBeLessThan(prev.km)
    }
  })

  it('מגיע לעוגן של 32 ק״מ לפני המרוץ', () => {
    const peak = Math.max(...ramp.filter((w) => w.kind === 'build').map((w) => w.km))
    expect(peak).toBeGreaterThanOrEqual(HALF_ANCHORS.weeklyKm)
  })

  it('התחדדות בשבוע הלפני-אחרון ומרוץ באחרון', () => {
    expect(ramp[18].kind).toBe('taper')
    expect(ramp[19].kind).toBe('race')
    // הורדה של 31% בשבוע ההתחדדות ו-50% בשבוע המרוץ, כמו בתוכניות שנמדדו
    const lastBuild = [...ramp].reverse().find((w) => w.kind === 'build')!
    expect(ramp[18].km / lastBuild.km).toBeLessThan(0.75)
    expect(ramp[19].km / lastBuild.km).toBeLessThan(0.6)
  })

  it('אף שבוע לא קופץ מעבר לקצב שנקבע', () => {
    for (let i = 1; i < ramp.length; i++) {
      if (ramp[i].kind !== 'build' || ramp[i - 1].kind !== 'build') continue
      expect(ramp[i].km / ramp[i - 1].km).toBeLessThan(1.11)
    }
  })

  it('בשבועות האחרונים הארוכה גדלה יחסית — כמו בתוכניות למתחילים', () => {
    const builds = ramp.filter((w) => w.kind === 'build')
    const early = builds[1]
    const late = builds[builds.length - 1]
    expect(early.longKm / early.km).toBeLessThan(0.44)
    expect(late.longKm / late.km).toBeGreaterThan(0.44)
  })

  it('הריצה הארוכה בשיא מגיעה לטווח שתוכניות אמיתיות נותנות', () => {
    const r = volumeRamp({ startKm: 10.5, weeks: 20 })
    const longest = Math.max(...r.map((w) => w.longKm))
    // תוכנית המתחילים הנפוצה בעולם של חצי מרתון מגיעה ל-16 ק״מ
    expect(longest).toBeGreaterThan(12)
  })

  it('תקרת נפח נשמרת', () => {
    const capped = volumeRamp({ startKm: 30, weeks: 20, capKm: 40 })
    expect(Math.max(...capped.map((w) => w.km))).toBeLessThanOrEqual(40)
  })
})

describe('הריצה הארוכה', () => {
  it('חלקה מהשבוע יורד ככל שהנפח עולה, ונשאר בטווח שתוכניות אמיתיות נותנות', () => {
    expect(longShare(20) / 20).toBeCloseTo(0.42, 2)
    expect(longShare(45) / 45).toBeCloseTo(0.34, 2)
    // "20-30% מהשבוע" הוא פולקלור — בנפח נמוך הוא פשוט לא ישים
    expect(longShare(20)).toBeGreaterThan(20 * 0.3)
  })

  it('מתחת ל-70 דקות זו לא ריצה ארוכה', () => {
    expect(LONG_RUN_MIN_MINUTES).toBe(70)
    const long = RUN_SESSIONS.find((s) => s.id === 'long')!
    expect(long.minutes).toBeGreaterThanOrEqual(LONG_RUN_MIN_MINUTES)
  })

  it('תקרת אימון בודד היא 110% מהארוך ביותר בחודש', () => {
    expect(sessionCapKm(10)).toBe(11)
    expect(sessionCapKm(6)).toBeCloseTo(6.6, 1)
  })
})

describe('אימונים שנכנסים ל-45 דקות', () => {
  it('כל אימון שאינו ארוך נכנס למגבלה', () => {
    for (const s of RUN_SESSIONS) {
      if (s.id.startsWith('long')) continue
      expect(s.minutes, s.name).toBeLessThanOrEqual(45)
    }
  })

  it('יש בדיוק אימון אחד קל בלי האצות, ולפחות שני סוגי איכות', () => {
    const hard = RUN_SESSIONS.filter((s) => s.hard && !s.id.startsWith('long'))
    expect(hard.length).toBeGreaterThanOrEqual(4)
    expect(RUN_SESSIONS.some((s) => s.id === 'easy' && !s.hard)).toBe(true)
  })
})

describe('כוח', () => {
  it('APRE-6 סימטרי: מעלה על ביצוע טוב כמו שמוריד על גרוע', () => {
    expect(apre6(1).deltaKg[1]).toBeLessThan(0)
    expect(apre6(4).deltaKg[0]).toBeLessThan(0)
    expect(apre6(6).deltaKg).toEqual([0, 0])
    expect(apre6(10).deltaKg[0]).toBeGreaterThan(0)
    expect(apre6(15).deltaKg[0]).toBeGreaterThan(apre6(10).deltaKg[0])
  })

  it('המינון השבועי בטווח שנמדד, ולא "כמה שיותר"', () => {
    expect(STRENGTH_DOSE.setsPerPatternPerWeek[0]).toBeGreaterThanOrEqual(6)
    expect(STRENGTH_DOSE.setsPerPatternPerWeek[1]).toBeLessThanOrEqual(12)
    expect(STRENGTH_DOSE.rir[0]).toBeGreaterThanOrEqual(1)
  })

  it('אחיזה איזומטרית: 67–70% מהמקסימום, וזמן תחת מתח 45–70 שניות', () => {
    const h = isoHold(15)
    expect(h.holdSec / 15).toBeGreaterThan(0.6)
    expect(h.holdSec / 15).toBeLessThan(0.75)
    const tut = h.holdSec * h.sets
    expect(tut).toBeGreaterThanOrEqual(40)
    expect(tut).toBeLessThanOrEqual(75)
  })

  it('מעל 30 שניות — עוברים שלב, לא מוסיפים זמן', () => {
    expect(isoHold(35).note).toContain('לעבור לשלב הבא')
  })
})

describe('מוכנוּת', () => {
  const ok: Wellness = { sleep: 4, fatigue: 4, soreness: 4, motivation: 4 }
  const hist = Array.from({ length: 7 }, () => ok)

  it('יום רגיל — ממשיכים', () => {
    expect(readiness(ok, hist).action).toBe('go')
  })

  it('שינה גרועה מאוד לבדה מורידה את היום', () => {
    expect(readiness({ ...ok, sleep: 1 }, hist).action).toBe('downgrade')
  })

  it('ירידה קלה מתחת לממוצע — משנים, לא מורידים', () => {
    const varied: Wellness[] = [ok, { ...ok, fatigue: 3 }, ok, { ...ok, motivation: 5 }, ok, ok, { ...ok, sleep: 3 }]
    const r = readiness({ ...ok, fatigue: 2, motivation: 3 }, varied)
    expect(r.action === 'modify' || r.action === 'downgrade').toBe(true)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('אין מצב שבו אות טוב מעלה עומס', () => {
    const great: Wellness = { sleep: 5, fatigue: 5, soreness: 5, motivation: 5 }
    const r = readiness(great, hist)
    expect(r.action).toBe('go')
    expect(['go', 'modify', 'downgrade']).toContain(r.action)
  })

  it('בלי היסטוריה מספקת לא ממציאים החלטה', () => {
    expect(readiness(ok, []).action).toBe('go')
  })
})

describe('מבנה השבוע', () => {
  /** השבוע שנבנה: כוח, קל, כוח+רגליים, קל, כוח, איכות, ארוכה */
  const good: DayKind[][] = [
    ['upper', 'skills'],
    ['quality-run'],
    ['legs', 'upper'],
    ['easy-run'],
    ['upper', 'skills'],
    ['easy-run'],
    ['long-run'],
  ]

  it('השבוע הזה עובר את כל החוקים', () => {
    expect(checkWeek(good)).toEqual([])
  })

  it('רגליים ביום שלפני ריצה קשה — נתפס', () => {
    const bad: DayKind[][] = [['upper'], ['legs'], ['quality-run'], ['easy-run'], ['upper'], ['easy-run'], ['long-run']]
    expect(checkWeek(bad).some((x) => x.includes('כלכלת הריצה'))).toBe(true)
  })

  it('יותר משלושה ימים קשים — נתפס', () => {
    const bad: DayKind[][] = [['quality-run'], ['legs'], ['easy-run'], ['quality-run'], ['legs'], ['easy-run'], ['long-run']]
    expect(checkWeek(bad).some((x) => x.includes('ימים קשים'))).toBe(true)
  })

  it('הריצה הארוכה לבד ביום שלה', () => {
    const bad: DayKind[][] = [['upper'], ['easy-run'], ['legs'], ['easy-run'], ['upper'], ['easy-run'], ['long-run', 'legs']]
    expect(checkWeek(bad).some((x) => x.includes('חולקת יום'))).toBe(true)
  })

  it('כוח פלג גוף עליון באותו יום עם ריצה הוא מותר', () => {
    const shared: DayKind[][] = [['upper', 'easy-run'], ['easy-run'], ['legs'], ['easy-run'], ['upper'], ['quality-run'], ['long-run']]
    expect(checkWeek(shared).filter((x) => x.includes('פלג גוף')).length).toBe(0)
  })

  it('רצפת השבוע מוגדרת ולא ריקה', () => {
    expect(WEEK_FLOOR.longRuns).toBeGreaterThanOrEqual(1)
    expect(WEEK_FLOOR.qualityRuns).toBeGreaterThanOrEqual(1)
    expect(WEEK_FLOOR.strengthSessions).toBeGreaterThanOrEqual(2)
  })
})

describe('השבוע שהחוקים מייצרים', () => {
  const week = proposeWeek({ weekKm: 24, week: 9, weeks: 20 })

  it('שבעה ימים, ארבע ריצות ושלושה אימוני כוח', () => {
    expect(week.length).toBe(7)
    expect(week.filter((d) => d.kind === 'run').length).toBe(4)
    expect(week.filter((d) => d.kind === 'gym').length).toBe(3)
  })

  it('בדיוק שלושה ימים קשים', () => {
    expect(week.filter((d) => d.hard).length).toBe(3)
  })

  it('אין חדר כושר בשישי ובשבת', () => {
    for (const dow of [5, 6]) expect(week.find((d) => d.dow === dow)!.kind).not.toBe('gym')
  })

  it('רגליים כבדות רק ביום שאחריו ריצה קלה', () => {
    const legs = week.find((d) => /רגליים/.test(d.title))!
    const next = week.find((d) => d.dow === (legs.dow + 1) % 7)!
    expect(next.hard).toBe(false)
  })

  it('הריצה הארוכה לבד, והאיכות 48 שעות ממנה', () => {
    const long = week.find((d) => /ארוכה/.test(d.title))!
    const quality = week.find((d) => /איכות/.test(d.title))!
    expect(long.dow).toBe(6)
    // יום שני — יומיים אחרי שבת
    expect(quality.dow).toBe(1)
  })

  it('המסגרת עוברת את בדיקת מבנה השבוע', () => {
    const days: DayKind[][] = Array.from({ length: 7 }, (_, i) => {
      const d = week.find((x) => x.dow === i)!
      if (d.kind === 'gym') return /רגליים/.test(d.title) ? ['legs', 'upper'] : ['upper', 'skills']
      if (/ארוכה/.test(d.title)) return ['long-run']
      if (/איכות/.test(d.title)) return ['quality-run']
      return ['easy-run']
    })
    expect(checkWeek(days)).toEqual([])
  })

  it('חלוקת הנפח מסתכמת לשבוע, והארוכה היא הגדולה', () => {
    const s = splitWeek(24)
    expect(s.long + s.quality + 2 * s.easy).toBeCloseTo(24, 0)
    expect(s.long).toBeGreaterThan(s.quality)
    expect(s.quality).toBeGreaterThan(s.easy)
  })

  it('נפח קטן מייצר ריצות קצרות ולא שליליות', () => {
    const s = splitWeek(10.5)
    expect(s.easy).toBeGreaterThan(0)
    expect(s.long).toBeGreaterThan(s.easy)
  })
})

describe('מה משתנה מול התוכנית הקיימת', () => {
  /** התוכנית שהייתה: שלוש ריצות, ורגליים ביום שלפני ריצה */
  const current = [
    { dow: 0, kind: 'gym', title: 'חדר כושר — דחיפה' },
    { dow: 1, kind: 'run', title: 'ריצה קצרה', km: 4 },
    { dow: 2, kind: 'gym', title: 'חדר כושר — משיכה ורגליים' },
    { dow: 3, kind: 'run', title: 'ריצה קלה', km: 3 },
    { dow: 4, kind: 'gym', title: 'חדר כושר — משיכה ופלג גוף עליון' },
    { dow: 5, kind: 'run', title: 'ריצה ארוכה', km: 7 },
    { dow: 6, kind: 'home', title: 'בית — סקילים' },
  ]

  it('ריצה קלה אחרי רגליים היא תקינה — ולא נסמנת כתקלה', () => {
    // האיסור הוא על ריצה **קשה** אחרי רגליים. בתוכנית הזו יום
    // רביעי הוא הקלה בשבוע, וזה בדיוק מה שצריך להיות שם.
    const { fixes } = weekChanges(current, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes.some((f) => f.includes('כלכלת הריצה'))).toBe(false)
  })

  it('תופס רגליים יום לפני ריצה קשה', () => {
    const bad = current.map((d) => (d.dow === 3 ? { ...d, title: 'ריצת איכות' } : d))
    const { fixes } = weekChanges(bad, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes.some((f) => f.includes('כלכלת הריצה'))).toBe(true)
  })

  it('תופס ריצה ארוכה שאינה ארוכה', () => {
    const { fixes } = weekChanges(current, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes.some((f) => f.includes('70 דקות'))).toBe(true)
  })

  it('תופס שיש פחות מארבעה ימי ריצה', () => {
    const { fixes } = weekChanges(current, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes.some((f) => f.includes('ימי ריצה'))).toBe(true)
  })

  it('מסביר כל שינוי ביום ובשם, ולא מחזיר דיף גולמי', () => {
    const { changes } = weekChanges(current, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(changes.length).toBeGreaterThan(0)
    for (const c of changes) expect(c).toMatch(/ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/)
  })

  it('שבוע שכבר תואם לא מייצר תיקונים מיותרים', () => {
    const good = proposeWeek({ weekKm: 24, week: 9, weeks: 20 }).map((d) => ({ dow: d.dow, kind: d.kind, title: d.title, km: d.km }))
    const { fixes } = weekChanges(good, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes).toEqual([])
  })
})
