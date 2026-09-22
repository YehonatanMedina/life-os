// ---------------------------------------------------------------------------
// תורת האימון. כל בדיקה כאן מעגנת מספר שמגיע ממקור — כך ששינוי בשקט
// במספר כזה ייפול, ומי שמשנה ייאלץ להסביר למה.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GYM_DAYS,
  HALF_ANCHORS,
  INTENSITY,
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
  longShare,
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
  programFor,
  proposeWeek,
  splitWeek,
  weekChanges,
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
  it('השבוע שנבנה עובר את checkWeek בכל נפח ובכל זמינות חדר כושר', () => {
    for (const km of [10, 16, 24, 31.9, 32, 40, 55]) {
      for (const gym of [[0, 1, 2, 3, 4], [0, 1, 3, 4], [3], [0, 2]]) {
        for (const week of [1, 9]) {
          const w = planWeek({ weekKm: km, week, weeks: 20, gymDays: gym })
          expect(checkWeek(weekKinds(w)), `${km} ק״מ · כושר ${gym.join(',')} · שבוע ${week}`).toEqual([])
        }
      }
    }
  })

  it('ימי ריצה רצופים קיימים בשבוע — וזה תקין', () => {
    const w = planWeek({ weekKm: 36, week: 1, weeks: 20 })
    const runs = w.filter((d) => d.kind === 'run').map((d) => d.dow).sort((a, b) => a - b)
    const consecutive = runs.some((d, i) => i > 0 && d === runs[i - 1] + 1)
    expect(consecutive).toBe(true)
    // ומה שאסור — שני ימים קשים ברצף — לא קיים
    expect(checkWeek(weekKinds(w))).toEqual([])
  })
})

describe('ימים שנשארו מגרסה קודמת', () => {
  const days = planWeek({ weekKm: 24, week: 1, weeks: 20 })
  const twin = (dow: number) => (dow === 0 ? 'בבית — משיכה, דחיפה וסטטיים' : dow === 2 ? 'בבית — רגליים' : undefined)

  it('היום הראשון של כל יום-בשבוע לעולם לא נחשב מיותר — הוא יוחלף', () => {
    const plan = [
      { id: 'a', dow: 0, title: 'משהו ישן לגמרי' },
      { id: 'b', dow: 6, title: 'בית — סקילים' },
    ]
    expect(staleDays(plan, days, twin)).toEqual([])
  })

  it('יום נוסף שאינו התאום הביתי — מיותר', () => {
    const plan = [
      { id: 'a', dow: 0, title: 'חדר כושר — משיכה, דחיפה וסטטיים' },
      { id: 'b', dow: 0, title: 'בית — סקילים ישן' },
    ]
    expect(staleDays(plan, days, twin).map((d) => d.id)).toEqual(['b'])
  })

  it('התאום הביתי עצמו לא מיותר', () => {
    const plan = [
      { id: 'a', dow: 0, title: 'חדר כושר — משיכה, דחיפה וסטטיים' },
      { id: 'b', dow: 0, title: 'בבית — משיכה, דחיפה וסטטיים' },
      { id: 'c', dow: 2, title: 'חדר כושר — רגליים ושוקיים' },
      { id: 'd', dow: 2, title: 'בבית — רגליים' },
    ]
    expect(staleDays(plan, days, twin)).toEqual([])
  })

  it('תאום עם כותרת ישנה כן מיותר — כי הוא כבר לא זה שנבנה', () => {
    const plan = [
      { id: 'a', dow: 0, title: 'חדר כושר — משיכה, דחיפה וסטטיים' },
      { id: 'b', dow: 0, title: 'בבית — משיכה וסטטיים' },
    ]
    expect(staleDays(plan, days, twin).map((d) => d.id)).toEqual(['b'])
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

describe('השבוע שהחוקים מייצרים', () => {
  const week = planWeek({ weekKm: 24, week: 1, weeks: 20 })
  const big = planWeek({ weekKm: 36, week: 1, weeks: 20 })

  it('שבעה ימים, חמש ריצות ושני אימוני כוח', () => {
    expect(week.length).toBe(7)
    // תחת תקרת זמן, תדירות היא הדרך היחידה להעלות נפח — ולכן ריצה
    // חמישית ולא אימון קשה שלישי
    expect(week.filter((d) => d.kind === 'run').length).toBe(5)
    // ושני ימי כוח ולא שלושה: שלושה פגעו בסף האירובי
    expect(week.filter((d) => d.kind === 'gym').length).toBe(2)
    expect(INTENSITY.strengthSessionsPerWeek).toBe(2)
  })

  it('מתחת ל-32 ק״מ יש אימון איכות אחד, ומעל — שניים', () => {
    expect(qualityRuns(24)).toBe(1)
    expect(qualityRuns(HALF_ANCHORS.weeklyKm)).toBe(2)
    expect(week.filter((d) => d.hard && d.kind === 'run' && /איכות/.test(d.title)).length).toBe(1)
    expect(big.filter((d) => d.kind === 'run' && /איכות/.test(d.title)).length).toBe(2)
  })

  it('בנפח נמוך שלושה ימים קשים, ובנפח גבוה ארבעה — ולא יותר', () => {
    expect(week.filter((d) => d.hard).length).toBe(3)
    expect(big.filter((d) => d.hard).length).toBe(4)
  })

  it('שני אימוני האיכות רחוקים 72 שעות', () => {
    const q = big.filter((d) => /איכות/.test(d.title)).map((d) => d.dow)
    expect(q.length).toBe(2)
    expect(Math.abs(q[1] - q[0])).toBe(3)
  })

  it('אין חדר כושר בשישי ובשבת', () => {
    for (const dow of [5, 6]) expect(week.find((d) => d.dow === dow)!.kind).not.toBe('gym')
  })

  it('יום סגור מקבל את הגרסה הביתית ולא נמחק', () => {
    // בלי חדר כושר בשלישי — היום נשאר, בתור בית
    const noTue = planWeek({ weekKm: 24, week: 1, weeks: 20, gymDays: [0, 1, 3, 4] })
    const tue = noTue.find((d) => d.dow === 2)!
    expect(tue.kind).toBe('home')
    expect(tue.title).toContain('בבית')
    expect(noTue.length).toBe(7)
    // וכשאין חדר כושר בכלל — עדיין שבעה ימים, ועדיין שני ימי כוח
    const none = planWeek({ weekKm: 24, week: 1, weeks: 20, gymDays: [3] })
    expect(none.filter((d) => d.kind === 'home').length).toBe(2)
  })

  it('רגליים כבדות רק ביום שאחריו ריצה קלה', () => {
    const legs = week.find((d) => /רגליים/.test(d.title))!
    const next = week.find((d) => d.dow === (legs.dow + 1) % 7)!
    expect(next.hard).toBe(false)
  })

  it('הריצה הארוכה לבד, והיום שאחריה פלג גוף עליון בלבד', () => {
    const long = week.find((d) => /ארוכה/.test(d.title))!
    expect(long.dow).toBe(6)
    // ראשון: משיכה וסטטיים — בלי רגליים, כי אובדן הכוח אחרי הארוכה
    // נמשך 24–48 שעות
    const after = week.find((d) => d.dow === 0)!
    expect(after.hard).toBe(false)
    expect(/רגליים/.test(after.title)).toBe(false)
  })

  it('הבלוק ההולך ומשתנה: פירמידלי קודם, פולרי אחר כך', () => {
    expect(blockType(1)).toBe('pyramidal')
    expect(blockType(8)).toBe('pyramidal')
    expect(blockType(9)).toBe('polarized')
    const late = planWeek({ weekKm: 36, week: 12, weeks: 20 })
    expect(late.find((d) => d.dow === 4)!.title).toContain('אינטרוולים')
  })

  it('המסגרת עוברת את בדיקת מבנה השבוע', () => {
    for (const w of [week, big]) {
      const days: DayKind[][] = Array.from({ length: 7 }, (_, i) => {
        const d = w.find((x) => x.dow === i)!
        if (d.kind === 'gym' || d.kind === 'home') return /רגליים/.test(d.title) ? ['legs', 'skills'] : ['upper', 'skills']
        if (/ארוכה/.test(d.title)) return ['long-run']
        if (/איכות/.test(d.title)) return ['quality-run']
        return ['easy-run']
      })
      expect(checkWeek(days)).toEqual([])
    }
  })

  it('חלוקת הנפח מסתכמת לשבוע, והארוכה היא הגדולה', () => {
    const s = splitWeek(24)
    expect(s.qualityDays).toBe(1)
    expect(s.long + s.quality + 3 * s.easy).toBeCloseTo(24, 0)
    expect(s.long).toBeGreaterThan(s.quality)
    expect(s.quality).toBeGreaterThan(s.easy)

    const b = splitWeek(36)
    expect(b.qualityDays).toBe(2)
    expect(b.long + 2 * b.quality + 2 * b.easy).toBeCloseTo(36, 0)
  })

  it('נפח קטן מייצר ריצות קצרות ולא שליליות', () => {
    const s = splitWeek(10.5)
    expect(s.easy).toBeGreaterThan(0)
    expect(s.long).toBeGreaterThan(s.easy)
  })

  it('ברירת המחדל של ימי הכושר היא ראשון עד חמישי', () => {
    expect(DEFAULT_GYM_DAYS).toEqual([0, 1, 2, 3, 4])
  })

  it('כשיש קצבים — לכל ריצה טווח, והקל איטי מהאיכותי', () => {
    const p = paces(vdot(5000, 1500))
    const w = planWeek({ weekKm: 36, week: 1, weeks: 20, paces: p })
    const runs = w.filter((d) => d.kind === 'run')
    for (const r of runs) expect(r.pace, r.title).toBeTruthy()
    const easy = w.find((d) => d.dow === 3)!.pace!
    const quality = w.find((d) => d.dow === 1)!.pace!
    // הקל הוא טווח, האיכותי הוא מספר אחד — והקל איטי יותר
    expect(easy).toContain('-')
    expect(quality).not.toContain('-')
    const num = (t: string) => Number(t.split(':')[0]) + Number(t.split(':')[1]) / 60
    expect(num(easy.split('-')[0])).toBeGreaterThan(num(quality))
  })

  it('בלי מבחן שדה אין קצב מומצא', () => {
    for (const d of planWeek({ weekKm: 36, week: 1, weeks: 20 })) expect(d.pace).toBeUndefined()
  })
})

describe('תקציב הגיד ומינון הסקילים', () => {
  it('התקרות קיימות ומספריות — בלעדיהן הכוח מקדים את הגיד', () => {
    expect(TENDON_BUDGET.perSessionSec).toBeGreaterThan(0)
    expect(TENDON_BUDGET.perWeekSec).toBeGreaterThanOrEqual(TENDON_BUDGET.perSessionSec)
    // הגיד מסתגל ב-8–12 שבועות, ולכן אסור לקרוא לשלב "תקוע" לפני כן
    expect(TENDON_BUDGET.minWeeksPerStage).toBeGreaterThanOrEqual(8)
  })

  it('התוכנית עומדת במינון השבועי של משיכה ודחיפה', () => {
    // אחיזה נספרת כחזרה לכל שתי שניות, וסט של 10 שניות הוא סט אחד
    const sets = (dow: number, re: RegExp) =>
      programFor(dow)
        .filter((e) => !e.home && re.test(e.name))
        .reduce((a, e) => a + (e.sets ?? 0), 0)
    const pull = /Front Lever|מתח/
    const push = /פסאודו|מקבילים|לחיצת כתפיים/
    const weeklyPull = sets(0, pull) + sets(2, pull)
    const weeklyPush = sets(0, push) + sets(2, push)
    expect(weeklyPull).toBeGreaterThanOrEqual(WEEKLY_SETS.pull[0])
    expect(weeklyPull).toBeLessThanOrEqual(WEEKLY_SETS.pull[1])
    expect(weeklyPush).toBeGreaterThanOrEqual(WEEKLY_SETS.push[0])
    expect(weeklyPush).toBeLessThanOrEqual(WEEKLY_SETS.push[1])
    // ויחס משיכה־דחיפה מאוזן: מעל 1.5:1 זו ההכנה הקלאסית לכאב כתף
    expect(weeklyPull / weeklyPush).toBeLessThanOrEqual(1.5)
  })

  it('יש דפוס Hinge אחד, והוא בחדר כושר ולא בבית', () => {
    const hinge = programFor(2).find((e) => /גשר ירך/.test(e.name))
    expect(hinge).toBeTruthy()
    expect(hinge!.home).toBeFalsy()
    expect(hinge!.metric).toBe('weight')
  })

  it('אין מכרע, Split Squat או סקוואט בשום יום חדר כושר', () => {
    for (const dow of [0, 2]) {
      for (const ex of programFor(dow)) {
        if (ex.home) continue
        expect(/מכרע|lunge|split squat|סקוואט|דדליפט|deadlift/i.test(ex.name), `${dow}: ${ex.name}`).toBe(false)
      }
    }
  })

  it('Front Lever נעשה פעמיים בשבוע, ולא בימים עוקבים', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => programFor(d).some((e) => /Front Lever/.test(e.name)))
    expect(days.length).toBe(2)
    expect(Math.abs(days[1] - days[0])).toBeGreaterThanOrEqual(2)
  })

  it('עמידת ידיים בכל יום, ותמיד בבלוק הביתי', () => {
    for (let d = 0; d < 7; d++) {
      const hs = programFor(d).find((e) => /עמידת ידיים/.test(e.name))
      expect(hs, `יום ${d}`).toBeTruthy()
      expect(hs!.home).toBe(true)
    }
  })

  it('הבלוק הביתי לא בולע את האימון: כל יום כושר נכנס ל-45 דקות בלעדיו', () => {
    const minutes = (list: ReturnType<typeof programFor>) => {
      let sec = 0
      for (const ex of list) {
        const sets = Math.max(1, ex.sets ?? 3)
        const rest = ex.rest ?? 90
        sec += 60 + sets * ((ex.metric === 'time' ? 40 : 45) + rest)
      }
      return Math.round(sec / 60)
    }
    for (const d of [0, 2]) {
      expect(minutes(programFor(d).filter((e) => !e.home)), `יום ${d}`).toBeLessThanOrEqual(46)
      expect(minutes(programFor(d).filter((e) => e.home)), `בית ${d}`).toBeLessThanOrEqual(14)
    }
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
