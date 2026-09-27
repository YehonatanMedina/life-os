// ---------------------------------------------------------------------------
// תורת האימון. כל בדיקה כאן מעגנת מספר שמגיע ממקור — כך ששינוי בשקט
// במספר כזה ייפול, ומי שמשנה ייאלץ להסביר למה.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GYM_DAYS,
  DEFAULT_RUNS_PER_WEEK,
  HALF_ANCHORS,
  HALF_TRAINING_LONG_KM,
  HALF_WEEKLY_CAP_KM,
  INTENSITY,
  LONG_RUN_WEEKLY_GROWTH,
  buildWeeksTo,
  halfPlanWeeks,
  TENDON_BUDGET,
  WEEKLY_SETS,
  blockType,
  planWeek,
  qualityRuns,
  LONG_RUN_MIN_MINUTES,
  MDC95,
  RUN_SESSIONS,
  WEEK_FLOOR,
  checkWeek,
  longRunBand,
  longRunHow,
  qualityHow,
  qualityWorkKm,
  MIN_QUALITY_WORK_MIN,
  mmss,
  longShare,
  LONG_MAX_SHARE,
  paces,
  riegel,
  sessionCapKm,
  testChanged,
  vdot,
  volumeRamp,
  staleDays,
  weekKinds,
  TRAINING_DOCTRINE,
  STRENGTH_DOSE,
  proposeWeek,
  splitWeek,
  weekChanges,
  weekForLong,
  type DayKind,
} from '../../../src/training'

const STRENGTH_DOSE_KEYS = Object.keys(STRENGTH_DOSE)

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

describe('שינוי אמיתי מול רעש', () => {
  it('שיפור של 2% במבחן 5 ק״מ הוא רעש, של 6% הוא אמיתי', () => {
    expect(testChanged(1200, 1176, MDC95.timeTrial5k)).toBe(false) // 2%
    expect(testChanged(1200, 1128, MDC95.timeTrial5k)).toBe(true) // 6%
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

  // -- הארוכה בתוך הסולם -------------------------------------------------
  //
  // עד 27.9.2026 `volumeRamp` גזר את הארוכה כאחוז מהנפח בלבד, ומזה יצאו
  // ארבע תקלות שכל אחת מהן הפרה חוק שהקובץ עצמו מצטט. ארבע הבדיקות הבאות
  // הן בדיוק הן.

  it('הארוכה לא קופצת יותר מ-10% בשבוע — התקרה שהסולם עצמו מצטט', () => {
    // זו הייתה התקלה הכי חמורה: `left <= 5` הקפיץ את הארוכה מ-38% ל-45%
    // מנפח גדול יותר, כלומר כ-30% בריצה אחת — הפרה של `sessionCapKm`.
    for (const r of [ramp, volumeRamp({ startKm: 13.5, weeks: 23, startLongKm: 7.01 })]) {
      const builds = r.filter((w) => w.kind === 'build')
      for (let i = 1; i < builds.length; i++) {
        // התקרה חלה על הערך האמיתי, והתצוגה מעוגלת ל-100 מטר בשני הקצוות —
        // ומכאן הסבילות: 0.05 על כל קצה, והראשון מוכפל ב-1.1.
        expect(builds[i].longKm, `שבוע ${builds[i].n}`)
          .toBeLessThanOrEqual(builds[i - 1].longKm * (1 + LONG_RUN_WEEKLY_GROWTH) + 0.11)
      }
    }
  })

  it('שבוע ירידה מוריד נפח ולא מוחק את הארוכה', () => {
    // קודם: `down * 0.3` — 30% מנפח שכבר ירד 30%, כלומר ארוכה של 2.4 ק״מ
    // בשבוע הרביעי. זה שובר את WEEK_FLOOR.longRuns.
    const r = volumeRamp({ startKm: 13.5, weeks: 23, startLongKm: 7.01 })
    for (const d of r.filter((w) => w.kind === 'down')) {
      const prevLong = r[d.n - 2].longKm
      expect(d.km, `שבוע ${d.n}`).toBeLessThan(r[d.n - 2].km)
      expect(d.longKm, `שבוע ${d.n}`).toBeGreaterThanOrEqual(prevLong * 0.7 - 0.05)
    }
  })

  it('התחדדות שומרת על הארוכה — מורידים נפח, לא עצימות ותדירות', () => {
    // קודם: 25% מהנפח האחרון — ארוכה של 5 ק״מ שבוע לפני חצי מרתון.
    const r = volumeRamp({ startKm: 13.5, weeks: 23, startLongKm: 7.01 })
    const taper = r.find((w) => w.kind === 'taper')!
    const lastBuild = [...r].reverse().find((w) => w.kind === 'build')!
    expect(taper.longKm / lastBuild.longKm).toBeGreaterThan(0.5)
    expect(taper.km / lastBuild.km).toBeLessThan(0.75)
  })

  it('הסולם מגיע למה שחצי מרתון דורש — 18 ק״מ בארוכה ו-32 בשבוע', () => {
    const startKm = weekForLong(10.5, 7.01)
    const weeks = halfPlanWeeks({ startKm, startLongKm: 7.01 })
    const r = volumeRamp({ startKm, weeks, startLongKm: 7.01 })
    const builds = r.filter((w) => w.kind === 'build')
    expect(Math.max(...builds.map((w) => w.longKm))).toBeCloseTo(HALF_TRAINING_LONG_KM, 1)
    expect(Math.max(...builds.map((w) => w.km))).toBeGreaterThanOrEqual(HALF_ANCHORS.weeklyKm)
    // ולא מעל תקרת הנפח — מעבר ל-40 אין תשואה נמדדת לחצי מרתון
    expect(Math.max(...builds.map((w) => w.km))).toBeLessThanOrEqual(HALF_WEEKLY_CAP_KM + 0.05)
  })

  it('ארוכה שהיא כבר חלק גדול מהשבוע עומדת במקום — לא מתקצרת ולא גדלה', () => {
    // 7 ק״מ מתוך שבוע של 13.5 הם 52%. מה שצריך לגדול הוא השבוע, ולכן
    // הארוכה מחזיקה עד שהחלק שלה חוזר לטווח — וזו בדיוק ההוראה הנכונה.
    const r = volumeRamp({ startKm: 13.5, weeks: 23, startLongKm: 7.01 })
    expect(r[0].longKm).toBeGreaterThanOrEqual(7)
    expect(r[1].longKm).toBe(r[0].longKm)
    // ובסוף היא כן מגיעה לחלק שתוכניות למתחילים נותנות
    const late = [...r].reverse().find((w) => w.kind === 'build')!
    expect(late.longKm / late.km).toBeGreaterThan(0.44)
  })

  it('אורך התוכנית נגזר מהסולם עצמו, ולא מנוסחה שנייה', () => {
    // הבאג: התחזית חישבה log(יעד/נפח)/log(1.1) ואמרה 14 שבועות, בזמן
    // שהסולם מגיע באותם 14 שבועות ל-20 ק״מ בשבוע ולארוכה של 9.
    const from = { startKm: 13.5, startLongKm: 7.01 }
    const weeks = halfPlanWeeks(from)
    const r = volumeRamp({ startKm: from.startKm, weeks, startLongKm: from.startLongKm })
    expect(r[weeks - 1].kind).toBe('race')
    expect(r[weeks - 2].kind).toBe('taper')
    // שבוע הבנייה האחרון הוא זה שמגיע ליעד, ולא שבוע לפני או אחרי
    const lastBuild = [...r].reverse().find((w) => w.kind === 'build')!
    expect(lastBuild.n).toBe(weeks - 2)
    expect(buildWeeksTo({ longKm: HALF_TRAINING_LONG_KM, weekKm: HALF_ANCHORS.weeklyKm }, from)).toBe(weeks - 2)
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

describe('מה שהוסר, ולמה אסור שיחזור', () => {
  it('כלל ה-10% לא מוצג כאמצעי בטיחות בשום מקום בדוקטרינה', () => {
    const all = JSON.stringify(TRAINING_DOCTRINE)
    // הוא מותר כקצב תכנון, ואסור כהבטחת בטיחות
    expect(TRAINING_DOCTRINE.forbidden.some((x) => x.includes('כלל ה-10%'))).toBe(true)
    expect(all).not.toContain('הכלל שמונע פציעות')
  })

  it('יש תשובה אחת לשאלה "כמה סטים לדפוס תנועה בשבוע"', () => {
    expect((STRENGTH_DOSE_KEYS as readonly string[]).includes('setsPerPatternPerWeek')).toBe(false)
    expect(WEEKLY_SETS.pull.length).toBe(2)
  })

  it('הדוקטרינה מסבירה ימי ריצה רצופים — זו השאלה הראשונה שכל אחד שואל', () => {
    expect(TRAINING_DOCTRINE.week.some((x) => x.includes('רצופים'))).toBe(true)
  })
})

describe('הכרטיס בודק את עצמו', () => {
  it('השבוע שנבנה עובר את checkWeek בכל הרכב', () => {
    for (const km of [8, 15, 24, 32, 45]) {
      for (const gym of [[0, 1, 2, 3, 4], [0, 1, 3, 4], [0, 2, 4], [3]]) {
        for (const runs of [3, 4, 5]) {
          for (const week of [1, 12]) {
            const w = planWeek({ weekKm: km, week, weeks: 20, gymDays: gym, runsPerWeek: runs })
            expect(w.length).toBe(7)
            expect(checkWeek(weekKinds(w)), `${km} ק״מ · כושר ${gym.join(',')} · ${runs} ריצות · שבוע ${week}`).toEqual([])
          }
        }
      }
    }
  })
})

describe('השבוע שהחוקים מייצרים', () => {
  const week = planWeek({ weekKm: 15, week: 1, weeks: 20 })
  const strength = week.filter((d) => d.kind === 'gym' || d.kind === 'home')
  const runs = week.filter((d) => d.kind === 'run')

  it('ברירת המחדל: שלוש ריצות וארבעה ימי כוח', () => {
    expect(DEFAULT_RUNS_PER_WEEK).toBe(3)
    expect(runs.length).toBe(3)
    expect(strength.length).toBe(4)
    expect(week.length).toBe(7)
  })

  it('שלוש הריצות מפוזרות, ואין שתיים ברצף', () => {
    const d = runs.map((r) => r.dow).sort((a, b) => a - b)
    for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1], d.join(',')).toBeGreaterThanOrEqual(2)
    // וגם במעבר השבוע: שבת ← ראשון
    expect(!(d.includes(6) && d.includes(0)), d.join(',')).toBe(true)
  })

  it('שלוש הריצות הן ארוכה, איכות וקלה — ואין רביעית', () => {
    expect(runs.filter((d) => /ארוכה/.test(d.title)).length).toBe(1)
    expect(runs.filter((d) => /איכות/.test(d.title)).length).toBe(1)
    expect(runs.filter((d) => /קלה/.test(d.title)).length).toBe(1)
  })

  it('אין תקרת זמן על ריצה — והארוכה אומרת את זה במפורש', () => {
    const long = week.find((d) => /ארוכה/.test(d.title))!
    expect(long.how).toContain('אין עליה תקרת זמן')
    expect(long.dow).toBe(6)
  })

  it('שלושה ימים קשים בדיוק: איכות, רגליים, ארוכה', () => {
    const hard = week.filter((d) => d.hard)
    expect(hard.length).toBe(3)
    expect(hard.map((d) => d.dow).sort()).toEqual([1, 2, 6])
  })

  it('ריצת האיכות 48 שעות מהארוכה, ורגליים אחריה ולא לפניה', () => {
    const q = week.find((d) => /איכות/.test(d.title))!
    const legs = week.find((d) => d.role === 'legs')!
    expect(q.dow).toBe(1)
    expect(legs.dow).toBe(2)
    // למחרת הרגליים אין ריצה קשה
    expect(week.find((d) => d.dow === 3)!.hard).toBe(false)
  })

  it('ארבעה תפקידים שונים, וסטטיים לא בימים עוקבים', () => {
    expect(strength.map((d) => d.role)).toEqual(['pull', 'legs', 'statics', 'push'])
    const statics = week.filter((d) => d.role === 'pull' || d.role === 'statics').map((d) => d.dow)
    expect(statics.length).toBe(2)
    expect(Math.abs(statics[1] - statics[0])).toBeGreaterThanOrEqual(2)
  })

  it('פחות ימי כוח — פחות תפקידים, והחשובים נשארים', () => {
    const roles = (runsPerWeek: number) =>
      planWeek({ weekKm: 15, week: 1, weeks: 20, runsPerWeek })
        .filter((d) => d.kind === 'gym' || d.kind === 'home')
        .map((d) => d.role)
        .sort()
    expect(roles(4)).toEqual(['legs', 'pull', 'push'])
    expect(roles(5)).toEqual(['legs', 'pull'])
  })

  it('יום סגור מקבל את הגרסה הביתית ולא נמחק', () => {
    const noTue = planWeek({ weekKm: 15, week: 1, weeks: 20, gymDays: [0, 1, 3, 4] })
    const tue = noTue.find((d) => d.dow === 2)!
    expect(tue.kind).toBe('home')
    expect(tue.title).toContain('בבית')
    expect(tue.exercises.length).toBeGreaterThan(0)
    expect(noTue.length).toBe(7)
  })

  it('הבלוק ההולך ומשתנה: פירמידלי קודם, פולרי אחר כך', () => {
    expect(blockType(1)).toBe('pyramidal')
    expect(blockType(9)).toBe('polarized')
    expect(week.find((d) => /איכות/.test(d.title))!.title).toContain('סף')
    const late = planWeek({ weekKm: 15, week: 12, weeks: 20 })
    expect(late.find((d) => /איכות/.test(d.title))!.title).toContain('אינטרוולים')
  })

  it('חלוקת הנפח מסתכמת לשבוע, והארוכה היא הגדולה', () => {
    const s = splitWeek(24, 3)
    expect(s.long + s.quality + s.easy).toBeCloseTo(24, 0)
    expect(s.long).toBeGreaterThan(s.quality)
    expect(s.quality).toBeGreaterThan(s.easy)
  })

  it('נפח קטן מייצר ריצות קצרות ולא שליליות', () => {
    for (const km of [6, 10.5, 15]) {
      const sp = splitWeek(km, 3)
      expect(sp.easy).toBeGreaterThan(0)
      expect(sp.long).toBeGreaterThan(sp.easy)
    }
  })

  // -- הרצפה של הריצה הארוכה ---------------------------------------------
  //
  // הבאג שהתגלה 27.9.2026: שבוע של 10.5 ק״מ עם ריצה ארוכה אחרונה של 7.01
  // ק״מ ייצר "ריצה ארוכה" של 4.4 ק״מ — 42% מהשבוע, וקצרה ב-37% ממה שכבר
  // נרוץ — ועליה כתוב "70 דקות ומעלה" בזמן שזה 31 דקות.
  it('הארוכה לא יורדת מתחת למה שכבר נרוץ בחודש האחרון', () => {
    const plain = splitWeek(10.5, 3)
    expect(plain.long).toBeCloseTo(4.4, 1)

    const fixed = splitWeek(10.5, 3, 7.01)
    expect(fixed.long).toBeGreaterThanOrEqual(7)
    // ולא מעל 110% מהארוכה בחודש — התקרה היחידה עם דוז-רספונס על פציעות
    expect(fixed.long).toBeLessThanOrEqual(sessionCapKm(7.01))
  })

  it('כשהרצפה גוררת את הארוכה למעלה — הנפח גדל, והקלות לא מתכווצות', () => {
    const plain = splitWeek(10.5, 3)
    const fixed = splitWeek(10.5, 3, 7.01)
    expect(fixed.weekKm).toBeGreaterThan(plain.weekKm)
    expect(fixed.easy).toBeGreaterThanOrEqual(plain.easy)
    expect(fixed.quality).toBeGreaterThanOrEqual(plain.quality)
    // והשבוע עדיין מסתכם בימים שלו
    expect(fixed.long + fixed.quality + fixed.easy).toBeCloseTo(fixed.weekKm, 0)
    // הארוכה לא בולעת יותר מהקצה העליון של מה שתוכניות למתחילים נותנות
    expect(fixed.long / fixed.weekKm).toBeLessThanOrEqual(LONG_MAX_SHARE + 0.01)
  })

  it('כשהשבוע כבר גדול מספיק — אחוז מהשבוע הוא שקובע, לא הרצפה', () => {
    const s = splitWeek(40, 3, 13)
    expect(s.long).toBeCloseTo(longShare(40), 1)
    expect(s.weekKm).toBeCloseTo(40, 1)
  })

  it('בלי יומן ריצות ההתנהגות לא משתנה', () => {
    const a = splitWeek(24, 3)
    const b = splitWeek(24, 3, 0)
    expect(a).toEqual(b)
  })

  it('weekForLong מחזיר את הבסיס כשאין ארוכה, ומרים אותו כשיש', () => {
    expect(weekForLong(10.5, 0)).toBe(10.5)
    expect(weekForLong(40, 7)).toBe(40)
    expect(weekForLong(10.5, 7.01)).toBeGreaterThan(10.5)
    expect(longRunBand(7.01)).toEqual({ min: 7, max: 7.7 })
  })

  it('הטקסט של הארוכה לא מבטיח 70 דקות כשהמרחק לא נותן אותן', () => {
    const short = longRunHow(7)
    expect(short).not.toContain('70 דקות ומעלה')
    expect(short).toContain('49 דקות')
    expect(longRunHow(11)).toContain('70 דקות ומעלה')
    // ובתוך התוכנית עצמה
    const day = planWeek({ weekKm: 10.5, week: 1, weeks: 14, longest30Km: 7.01 })
      .find((d) => d.dow === 6)!
    expect(day.km).toBeGreaterThanOrEqual(7)
    expect(day.how).not.toContain('70 דקות ומעלה')
  })

  // -- הטקסט של יום האיכות -----------------------------------------------
  //
  // הבאג שהתגלה 27.9.2026, אותה משפחה כמו הארוכה של 4.4: על יום של 3.3
  // ק״מ היה כתוב "15 דקות חימום · 5×5 דקות סף · 10 שחרור" — 54 דקות
  // ריצה, כלומר כ-7.6 ק״מ, ובשבוע שתקציב הסף שלו הוא תשע דקות.
  it('תקציב עבודת האיכות לא עובר את תקרת דניאלס ולא את היום עצמו', () => {
    const p = paces(29)
    // 10% מ-13.5 ק״מ = 1.35, וזה פחות מ-55% מהיום (1.8)
    const work = qualityWorkKm({ km: 3.3, weekKm: 13.5, workPace: p.threshold })
    expect(work).toBeCloseTo(1.35, 2)
    expect(work * p.threshold).toBeGreaterThanOrEqual(MIN_QUALITY_WORK_MIN)
    // וכשהיום קטן, היום הוא שחוסם ולא השבוע
    expect(qualityWorkKm({ km: 2, weekKm: 40, workPace: p.threshold })).toBeCloseTo(1.1, 2)
  })

  it('הטקסט של יום האיכות מסתכם למרחק שכתוב על אותו יום', () => {
    const p = paces(29)
    const how = qualityHow({
      km: 3.3,
      weekKm: 13.5,
      workPace: p.threshold,
      easyPace: (p.easy[0] + p.easy[1]) / 2,
    })
    expect(how).toContain(mmss(p.threshold))
    // הנוסח הישן — 5×5 דקות על 3.3 ק״מ — לא יכול לחזור
    expect(how).not.toContain('5×5')
    const total = Number(how.match(/כ-(\d+) דקות/)![1])
    // המרחק כפול הקצב הממוצע, בסובלנות של 15%
    const implied = 3.3 * ((p.easy[0] + p.easy[1]) / 2)
    expect(total).toBeLessThan(implied * 1.15)
    expect(total).toBeGreaterThan(3.3 * p.threshold)
  })

  it('מתחת לשמונה דקות עבודה הטקסט לא מתחזה לאימון סף', () => {
    const p = paces(29)
    const how = qualityHow({ km: 1.2, weekKm: 4, workPace: p.threshold })
    expect(how).toContain('ספרינטי עלייה')
    expect(how).not.toContain('בקצב סף')
  })

  it('יום האיכות בתוכנית מתאר את המרחק שלו, לא נוסח קבוע', () => {
    const day = planWeek({
      weekKm: 10.5,
      week: 1,
      weeks: 14,
      longest30Km: 7.01,
      gymDays: [0, 1, 2, 3, 4],
      paces: paces(29),
    }).find((d) => /איכות/.test(d.title))!
    expect(day.km).toBeGreaterThan(0)
    const total = Number(day.how!.match(/כ-(\d+) דקות/)![1])
    // 25 דקות ריצה הן לא 54, והמרחק הוא זה שקובע
    expect(total).toBeLessThan(day.km! * 9)
    expect(total).toBeGreaterThan(day.km! * 5)
  })

  it('התוכנית לא מייצרת ארוכה שהיא עצמה הייתה מסמנת כהפרה', () => {
    const days = planWeek({ weekKm: 10.5, week: 1, weeks: 14, longest30Km: 7.01, gymDays: [0, 1, 2, 3, 4] })
    const current = days.map((d) => ({ dow: d.dow, kind: d.kind, title: d.title, km: d.km }))
    const { fixes, changes } = weekChanges(current, days, 7.01)
    // אין נסיגה, ואין "הפרה" שאי אפשר לתקן — הפער ל-70 דקות נאמר כמצב ולא כליקוי
    expect(fixes).toEqual([])
    expect(changes.some((c) => /פחות מ-70 דקות/.test(c))).toBe(true)
  })

  it('ארוכה קצרה ממה שכבר נרוץ נרשמת כהפרה', () => {
    const days = planWeek({ weekKm: 10.5, week: 1, weeks: 14, gymDays: [0, 1, 2, 3, 4] })
    const current = days.map((d) => ({ dow: d.dow, kind: d.kind, title: d.title, km: d.km }))
    const { fixes } = weekChanges(current, days, 7.01)
    expect(fixes.some((f) => /נסיגה/.test(f))).toBe(true)
  })

  it('כשיש קצבים — לכל ריצה טווח, והקל איטי מהאיכותי', () => {
    const p = paces(vdot(5000, 1500))
    const w = planWeek({ weekKm: 24, week: 1, weeks: 20, paces: p })
    for (const r of w.filter((d) => d.kind === 'run')) expect(r.pace, r.title).toBeTruthy()
    const easy = w.find((d) => /קלה/.test(d.title))!.pace!
    const quality = w.find((d) => /איכות/.test(d.title))!.pace!
    expect(easy).toContain('-')
    expect(quality).not.toContain('-')
    const num = (t: string) => Number(t.split(':')[0]) + Number(t.split(':')[1]) / 60
    expect(num(easy.split('-')[0])).toBeGreaterThan(num(quality))
  })

  it('בלי מבחן שדה אין קצב מומצא', () => {
    for (const d of planWeek({ weekKm: 24, week: 1, weeks: 20 })) expect(d.pace).toBeUndefined()
  })

  it('ברירת המחדל של ימי הכושר היא ראשון עד חמישי', () => {
    expect(DEFAULT_GYM_DAYS).toEqual([0, 1, 2, 3, 4])
  })
})

describe('תקציב הגיד ומינון הסקילים', () => {
  const week = planWeek({ weekKm: 15, week: 1, weeks: 20 })
  const main = (role: string) => week.find((d) => d.role === role)!.exercises.filter((e) => !e.home)

  it('התקרות קיימות ומספריות — בלעדיהן הכוח מקדים את הגיד', () => {
    expect(TENDON_BUDGET.perSessionSec).toBeGreaterThan(0)
    expect(TENDON_BUDGET.perWeekSec).toBeGreaterThanOrEqual(TENDON_BUDGET.perSessionSec)
    expect(TENDON_BUDGET.minWeeksPerStage).toBeGreaterThanOrEqual(8)
  })

  it('הנפח השבועי של משיכה ודחיפה בטווח, ומאוזן', () => {
    const sets = (re: RegExp) =>
      week.reduce(
        (a, d) => a + d.exercises.filter((e) => !e.home && re.test(e.name)).reduce((x, e) => x + (e.sets ?? 0), 0),
        0,
      )
    const pull = sets(/מתח \(Pull|חתירה|פולי|סופרמן/)
    const push = sets(/מקבילים|לחיצת כתפיים|שכיבות סמיכה/)
    expect(pull).toBeGreaterThanOrEqual(WEEKLY_SETS.pull[0])
    expect(pull).toBeLessThanOrEqual(WEEKLY_SETS.pull[1])
    expect(push).toBeGreaterThanOrEqual(WEEKLY_SETS.push[0])
    expect(push).toBeLessThanOrEqual(WEEKLY_SETS.push[1])
    // יחס מעל 1.5:1 הוא ההכנה הקלאסית לכאב כתף
    expect(pull / push).toBeLessThanOrEqual(1.5)
  })

  // מ-23.9.2026 אין בתוכנית החזקה בזרוע ישרה (Front Lever ופסאודו-פלאנש
  // ירדו לבקשתו). התקרה נשארת, כי היא מה שיאכוף את המינון ביום שהן יחזרו.
  it('תקציב הגיד: זמן האחיזה בזרוע ישרה מתחת לתקרה', () => {
    let sec = 0
    for (const d of week) {
      for (const e of d.exercises) {
        if (!/Front Lever|פלאנש/.test(e.name) || e.metric !== 'time') continue
        sec += (e.sets ?? 0) * Number(/(\d+)/.exec(e.reps ?? '')?.[1] ?? 0)
      }
    }
    expect(sec).toBe(0)
    expect(sec).toBeLessThanOrEqual(TENDON_BUDGET.perWeekSec)
  })

  const pullDays = (w: typeof week) =>
    w.filter((d) => d.exercises.some((e) => !e.home && /מתח \(Pull|חתירה|פולי|סופרמן/.test(e.name))).map((d) => d.dow)

  it('משיכה פעמיים בשבוע בכל הרכב — גם כשאין יום משיכה שני', () => {
    for (const runs of [3, 4]) {
      const w = planWeek({ weekKm: 15, week: 1, weeks: 20, runsPerWeek: runs })
      const days = pullDays(w)
      expect(days.length, `${runs} ריצות`).toBe(2)
      expect(Math.abs(days[1] - days[0]), `${runs} ריצות`).toBeGreaterThanOrEqual(2)
    }
  })

  it('משיכה פעמיים בשבוע, ולא בימים עוקבים', () => {
    const days = pullDays(week)
    expect(days.length).toBe(2)
    expect(Math.abs(days[1] - days[0])).toBeGreaterThanOrEqual(2)
  })

  // מה שהחליף את ה-Front Lever הוא משיכה אמיתית, ולא כלום
  it('אין Front Lever ואין פסאודו-פלאנש בשום יום', () => {
    for (const d of week) {
      for (const e of d.exercises) {
        expect(/Front Lever|פסאודו/.test(e.name), `${d.title}: ${e.name}`).toBe(false)
      }
    }
  })

  it('עמידת ידיים בכל יום, ותמיד בבלוק הביתי', () => {
    for (const d of week) {
      const hs = d.exercises.find((e) => /עמידת ידיים על הקיר/.test(e.name))
      expect(hs, `יום ${d.dow}`).toBeTruthy()
      expect(hs!.home).toBe(true)
    }
  })

  it('יש דפוס Hinge אחד, והוא בחדר כושר ולא בבית', () => {
    const hinge = main('legs').find((e) => /גשר ירך/.test(e.name))
    expect(hinge).toBeTruthy()
    expect(hinge!.metric).toBe('weight')
  })

  it('אין מכרע, Split Squat או סקוואט בשום יום חדר כושר', () => {
    for (const d of week.filter((x) => x.kind === 'gym')) {
      for (const ex of d.exercises) {
        if (ex.home) continue
        expect(/מכרע|lunge|split squat|סקוואט|דדליפט|deadlift/i.test(ex.name), `${d.title}: ${ex.name}`).toBe(false)
      }
    }
  })

  it('הבלוק הביתי לא בולע את האימון: כל יום כוח נכנס לתקרה בלעדיו', () => {
    const minutes = (list: Array<{ sets?: number; rest?: number; metric: string }>) => {
      let sec = 0
      for (const ex of list) {
        const sets = Math.max(1, ex.sets ?? 3)
        sec += 60 + sets * ((ex.metric === 'time' ? 40 : 45) + (ex.rest ?? 90))
      }
      return Math.round(sec / 60)
    }
    for (const d of week.filter((x) => x.kind === 'gym' || x.kind === 'home')) {
      expect(minutes(d.exercises.filter((e) => !e.home)), d.title).toBeLessThanOrEqual(45)
      expect(minutes(d.exercises.filter((e) => e.home)), `בית · ${d.title}`).toBeLessThanOrEqual(14)
    }
  })
})

describe('מבנה השבוע', () => {
  /** השבוע שנבנה: כוח, קל, כוח+רגליים, קל, כוח, איכות, ארוכה */
  const good: DayKind[][] = [
    ['upper', 'skills'],
    ['quality-run'],
    ['legs', 'upper'],
    ['easy-run'],
    ['quality-run'],
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

  it('יותר מארבעה ימים קשים — נתפס', () => {
    const bad: DayKind[][] = [['quality-run'], ['legs'], ['easy-run'], ['quality-run'], ['legs'], ['quality-run'], ['long-run']]
    expect(checkWeek(bad).some((x) => x.includes('ימים קשים'))).toBe(true)
  })

  it('שלושה אימוני איכות — נתפס, כי התשובה לתקרת הזמן היא ריצה נוספת', () => {
    const bad: DayKind[][] = [['upper'], ['quality-run'], ['easy-run'], ['quality-run'], ['easy-run'], ['quality-run'], ['long-run']]
    expect(checkWeek(bad).some((x) => x.includes('אימוני איכות'))).toBe(true)
  })

  it('שני ימי סטטיים ברצף — נתפס, כי הגיד מסתגל לאט מהשריר', () => {
    const bad: DayKind[][] = [['upper', 'skills'], ['upper', 'skills'], ['easy-run'], ['easy-run'], ['legs'], ['easy-run'], ['long-run']]
    expect(checkWeek(bad).some((x) => x.includes('סטטיים'))).toBe(true)
  })

  it('הריצה הארוכה לבד ביום שלה', () => {
    const bad: DayKind[][] = [['upper'], ['easy-run'], ['legs'], ['easy-run'], ['upper'], ['easy-run'], ['long-run', 'legs']]
    expect(checkWeek(bad).some((x) => x.includes('חולקת יום'))).toBe(true)
  })

  it('כוח פלג גוף עליון באותו יום עם ריצה הוא מותר', () => {
    const shared: DayKind[][] = [['upper', 'easy-run'], ['easy-run'], ['legs'], ['easy-run'], ['upper'], ['easy-run'], ['long-run']]
    expect(checkWeek(shared).filter((x) => x.includes('פלג גוף')).length).toBe(0)
  })

  it('רצפת השבוע מוגדרת ולא ריקה', () => {
    expect(WEEK_FLOOR.longRuns).toBeGreaterThanOrEqual(1)
    expect(WEEK_FLOOR.qualityRuns).toBeGreaterThanOrEqual(1)
    expect(WEEK_FLOOR.strengthSessions).toBeGreaterThanOrEqual(2)
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

  it('תופס שיש פחות משלושה ימי ריצה — הרצפה, לא היעד', () => {
    // בתוכנית הזו יש שלוש ריצות, כלומר בדיוק הרצפה — ולכן אין תיקון
    const { fixes } = weekChanges(current, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(fixes.some((f) => f.includes('ימי ריצה'))).toBe(false)
    // שתיים — כן
    const thin = current.filter((d) => d.kind !== 'run' || d.dow === 5)
    const { fixes: f2 } = weekChanges(thin, proposeWeek({ weekKm: 24, week: 9, weeks: 20 }))
    expect(f2.some((f) => f.includes('ימי ריצה'))).toBe(true)
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
