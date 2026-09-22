// ---------------------------------------------------------------------------
// תורת האימון. כל בדיקה כאן מעגנת מספר שמגיע ממקור — כך ששינוי בשקט
// במספר כזה ייפול, ומי שמשנה ייאלץ להסביר למה.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GYM_DAYS,
  DEFAULT_RUNS_PER_WEEK,
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
  const gym = week.filter((d) => d.kind === 'gym')
  const runs = week.filter((d) => d.kind === 'run')

  it('ברירת המחדל: שלוש ריצות וארבעה ימי כוח', () => {
    expect(DEFAULT_RUNS_PER_WEEK).toBe(3)
    expect(runs.length).toBe(3)
    expect(gym.length).toBe(4)
    expect(week.length).toBe(7)
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
    expect(gym.map((d) => d.role)).toEqual(['pull', 'legs', 'statics', 'push'])
    const statics = week.filter((d) => d.role === 'pull' || d.role === 'statics').map((d) => d.dow)
    expect(statics.length).toBe(2)
    expect(Math.abs(statics[1] - statics[0])).toBeGreaterThanOrEqual(2)
  })

  it('פחות ימי כושר — פחות תפקידים, והחשובים נשארים', () => {
    const three = planWeek({ weekKm: 15, week: 1, weeks: 20, runsPerWeek: 4 })
    expect(three.filter((d) => d.kind === 'gym').map((d) => d.role)).toEqual(['pull', 'legs', 'push'])
    const two = planWeek({ weekKm: 15, week: 1, weeks: 20, runsPerWeek: 5 })
    expect(two.filter((d) => d.kind === 'gym').map((d) => d.role)).toEqual(['pull', 'legs'])
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
    const pull = sets(/Front Lever|מתח \(Pull|חתירה/)
    const push = sets(/פסאודו|מקבילים|לחיצת כתפיים|שכיבות סמיכה בעמידת ידיים/)
    expect(pull).toBeGreaterThanOrEqual(WEEKLY_SETS.pull[0])
    expect(pull).toBeLessThanOrEqual(WEEKLY_SETS.pull[1])
    expect(push).toBeGreaterThanOrEqual(WEEKLY_SETS.push[0])
    expect(push).toBeLessThanOrEqual(WEEKLY_SETS.push[1])
    // יחס מעל 1.5:1 הוא ההכנה הקלאסית לכאב כתף
    expect(pull / push).toBeLessThanOrEqual(1.5)
  })

  it('תקציב הגיד: זמן האחיזה השבועי מתחת לתקרה', () => {
    let sec = 0
    for (const d of week) {
      for (const e of d.exercises) {
        if (!/Front Lever|פלאנש/.test(e.name) || e.metric !== 'time') continue
        sec += (e.sets ?? 0) * Number(/(\d+)/.exec(e.reps ?? '')?.[1] ?? 0)
      }
    }
    expect(sec).toBeGreaterThan(0)
    expect(sec).toBeLessThanOrEqual(TENDON_BUDGET.perWeekSec)
  })

  it('Front Lever פעמיים בשבוע בכל הרכב — גם כשאין יום סטטיים', () => {
    for (const runs of [3, 4]) {
      const w = planWeek({ weekKm: 15, week: 1, weeks: 20, runsPerWeek: runs })
      const days = w.filter((d) => d.exercises.some((e) => /Front Lever/.test(e.name))).map((d) => d.dow)
      expect(days.length, `${runs} ריצות`).toBe(2)
      expect(Math.abs(days[1] - days[0]), `${runs} ריצות`).toBeGreaterThanOrEqual(2)
    }
  })

  it('Front Lever פעמיים בשבוע, ולא בימים עוקבים', () => {
    const days = week.filter((d) => d.exercises.some((e) => /Front Lever/.test(e.name))).map((d) => d.dow)
    expect(days.length).toBe(2)
    expect(Math.abs(days[1] - days[0])).toBeGreaterThanOrEqual(2)
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
