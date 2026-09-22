// ---------------------------------------------------------------------------
// המעבר הלילי. כל בדיקה כאן מעגנת החלטה אחת — כך שאם מישהו ישנה אותה
// בשקט, הוא ייאלץ להסביר למה.
//
// שלוש התכונות שהבדיקות האלה שומרות עליהן, והן חשובות יותר מכל כלל בודד:
// א-סימטריה (מהירים להוריד, איטיים להעלות), היסטרזיס (שום מצב לא משתנה
// על נקודה אחת), ובקרת טלטלה (שינוי מבני אחד לתרגיל, לא שניים).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { blankState } from './helpers'
import {
  CHANGE_COOLDOWN_DAYS,
  MAX_STRUCTURAL,
  PAIN_HOLD_DAYS,
  STALL,
  canChange,
  easyCheck,
  level,
  nextLoad,
  noteSignals,
  repRange,
  stageExName,
  tendonLoad,
  nightly,
} from '../../../src/adapt'
import { ladder } from '../../../src/skills'
import type { AppState, SetLog, WorkoutDay, WorkoutLog } from '../../../src/types'

const TODAY = '2026-09-22'

const day = (over: Partial<WorkoutDay> = {}): WorkoutDay => ({
  id: 'wd-0',
  updatedAt: 1,
  dow: 0,
  title: 'חדר כושר — משיכה וסטטיים',
  kind: 'gym',
  exercises: [],
  ...over,
})

const log = (date: string, sets: Record<string, SetLog[]>, over: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `w-${date}`,
  updatedAt: 1,
  date,
  dayId: 'wd-0',
  title: 'חדר כושר',
  kind: 'gym',
  sets,
  ...over,
})

function state(plan: WorkoutDay[], workouts: WorkoutLog[]): AppState {
  return blankState({ workoutPlan: plan, workouts })
}

// ---------------------------------------------------------------------------
describe('מה שההערה אומרת', () => {
  it('מילת כאב נתפסת, ועם האזור שלה', () => {
    expect(noteSignals('כאב במרפק בסוף')).toContainEqual({ sig: 'pain', area: 'elbow' })
    expect(noteSignals('הברך הציקה קצת')).toContainEqual({ sig: 'pain', area: 'knee' })
    expect(noteSignals('אכילס מרגיש מתוח')).toContainEqual({ sig: 'pain', area: 'shin' })
  })

  it('שלילה לא נספרת ככאב — זו בדיוק ההערה שכותבים אחרי שבוע של כאב', () => {
    expect(noteSignals('היום בלי כאב בכלל')).toEqual([])
    expect(noteSignals('לא כאב המרפק')).toEqual([])
  })

  it('הערה ריקה לא ממציאה אות', () => {
    expect(noteSignals()).toEqual([])
    expect(noteSignals('   ')).toEqual([])
    expect(noteSignals('אימון טוב')).toEqual([])
  })

  it('עייפות ומחלה נתפסות בנפרד מכאב', () => {
    expect(noteSignals('הייתי מותש').some((x) => x.sig === 'tired')).toBe(true)
    expect(noteSignals('חולה עם חום').some((x) => x.sig === 'sick')).toBe(true)
  })
})

describe('קריאת התוכנית', () => {
  it('טווח חזרות מפוענח משתי הצורות', () => {
    expect(repRange('8-10')).toEqual([8, 10])
    expect(repRange('15')).toEqual([15, 15])
    expect(repRange('10 שניות')).toEqual([10, 10])
    expect(repRange('מקסימום')).toBeNull()
  })

  it('הקפיצה במשקל היא אחוז ולא מספר קבוע', () => {
    // 2.5 ק״ג על חתירה של 20 הם 12%; על לחיצת רגליים של 200 הם 1.25%
    expect(nextLoad(20, 'weight')).toBeLessThan(nextLoad(200, 'weight'))
    expect(nextLoad(200, 'weight')).toBe(5)
  })

  it('הרמה היא הסט ה-n הטוב, לא השיא', () => {
    const sets: SetLog[] = [{ sec: 20 }, { sec: 12 }, { sec: 11 }]
    expect(level(sets, 3, 'time')).toBe(11)
    expect(level(sets, 1, 'time')).toBe(20)
    // פחות סטים ממה שנדרש — הרמה היא אפס, כי השלב לא נסגר בסט אחד
    expect(level(sets, 5, 'time')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('התקדמות כפולה', () => {
  const plan = [
    day({ exercises: [{ id: 'ex-row', name: 'חתירה במשקולות', sets: 3, reps: '8-10', metric: 'weight', rest: 90 }] }),
  ]

  it('כל הסטים בראש הטווח — מעלים משקל וחוזרים לתחתית', () => {
    const s = state(plan, [log(TODAY, { 'ex-row': [{ kg: 22, reps: 10 }, { kg: 22, reps: 10 }, { kg: 22, reps: 10 }] })])
    const c = nightly(s, TODAY).calls[0]
    expect(c.verdict).toBe('progress')
    expect(c.what).toContain('24.5')
    expect(c.what).toContain('8')
    expect(c.patch?.note).toContain('24.5')
  })

  it('סט אחד בראש הטווח — לא מספיק', () => {
    const s = state(plan, [log(TODAY, { 'ex-row': [{ kg: 22, reps: 10 }, { kg: 22, reps: 8 }, { kg: 22, reps: 8 }] })])
    expect(nightly(s, TODAY).calls[0].verdict).toBe('hold')
  })

  it('רוב הסטים מתחת לתחתית הטווח — יורדים, ובאותה אגרסיביות', () => {
    const s = state(plan, [
      log('2026-09-15', { 'ex-row': [{ kg: 30, reps: 8 }, { kg: 30, reps: 8 }, { kg: 30, reps: 8 }] }),
      log(TODAY, { 'ex-row': [{ kg: 30, reps: 5 }, { kg: 30, reps: 4 }, { kg: 30, reps: 6 }] }),
    ])
    const c = nightly(s, TODAY).calls[0]
    expect(c.verdict).toBe('back-off')
    expect(c.what).toContain('27.5')
  })

  it('תרגיל שנמדד בחזרות בלבד מתקדם בחזרות, לא במשקל דמיוני', () => {
    const plan = [day({ exercises: [{ id: 'ex-pogo', name: 'קפיצות פוגו', sets: 4, reps: '10', metric: 'reps' }] })]
    const s = state(plan, [log(TODAY, { 'ex-pogo': [{ reps: 10 }, { reps: 10 }, { reps: 10 }, { reps: 10 }] })])
    const c = nightly(s, TODAY).calls[0]
    expect(c.verdict).toBe('progress')
    expect(c.what).not.toContain('ק״ג')
    expect(c.patch?.reps).toBe('12')
  })

  it('אין נתונים — אין החלטה, ולא ניחוש', () => {
    expect(nightly(state(plan, []), TODAY).calls).toEqual([])
  })
})

describe('אחיזה סטטית — המדרגה היא התנוחה', () => {
  const fl = { id: 'ex-fl', name: 'Front Lever — Tuck', sets: 3, reps: '10 שניות', metric: 'time' as const }
  const plan = [day({ exercises: [fl] })]
  const full: Record<string, SetLog[]> = { 'ex-fl': [{ sec: 11 }, { sec: 10 }, { sec: 10 }] }

  it('אימון אחד שסוגר את התנאי — מוסיפים שניות, לא עוברים שלב', () => {
    const c = nightly(state(plan, [log(TODAY, full)]), TODAY).calls[0]
    expect(c.verdict).toBe('progress')
    expect(c.what).toContain('12')
    expect(c.structural).toBeFalsy()
  })

  it('שני אימונים רצופים שסוגרים — עוברים שלב, והשם נשאר מזוהה', () => {
    const s = state(plan, [log('2026-09-15', full), log(TODAY, full)])
    s.skills = [{ id: 'sk-frontlever', updatedAt: 1, stageId: 'tuck' }]
    const c = nightly(s, TODAY).calls[0]
    expect(c.verdict).toBe('advance')
    expect(c.structural).toBe(true)
    expect(c.skill).toEqual({ id: 'sk-frontlever', stageId: 'adv-tuck' })
    // הכלל שמונע ניתוק של המסע: השם החדש חייב להמשיך להיתפס
    expect(c.patch?.name).toContain('Front Lever')
  })

  it('שם השלב תמיד נשאר מזוהה על ידי הסולם', () => {
    const lad = ladder('sk-frontlever')!
    for (const st of lad.stages) {
      const name = stageExName(lad, st)
      expect(lad.match.some((m) => name.toLowerCase().includes(m.toLowerCase())), name).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
describe('כאב גובר על כל מספר', () => {
  const plan = [
    day({
      exercises: [
        { id: 'ex-pull', name: 'מתח (Pull-ups)', sets: 3, reps: '4-6', metric: 'bodyweight' },
        { id: 'ex-calf', name: 'הרמות עקבים בעמידה', sets: 3, reps: '6-8', metric: 'weight' },
      ],
    }),
  ]
  const perfect = {
    'ex-pull': [{ kg: 0, reps: 6 }, { kg: 0, reps: 6 }, { kg: 0, reps: 6 }],
    'ex-calf': [{ kg: 40, reps: 8 }, { kg: 40, reps: 8 }, { kg: 40, reps: 8 }],
  }

  it('כאב במרפק מחזיק את המשיכה — גם כשכל הסטים נסגרו', () => {
    const s = state(plan, [log(TODAY, perfect, { note: 'המרפק צרב בסוף' })])
    const n = nightly(s, TODAY)
    const pull = n.calls.find((c) => c.exId === 'ex-pull')!
    const calf = n.calls.find((c) => c.exId === 'ex-calf')!
    expect(pull.verdict).toBe('back-off')
    // והרגליים ממשיכות כרגיל — הכאב הוא מקומי, לא גלובלי
    expect(calf.verdict).toBe('progress')
    expect(n.flags.length).toBe(1)
  })

  it('כאב ישן משבוע וחצי כבר לא מחזיק', () => {
    const s = state(plan, [log('2026-09-08', perfect, { note: 'כאב במרפק' }), log(TODAY, perfect)])
    expect(PAIN_HOLD_DAYS).toBeLessThan(14)
    expect(nightly(s, TODAY).calls.find((c) => c.exId === 'ex-pull')!.verdict).toBe('progress')
  })
})

describe('היסטרזיס ובקרת טלטלה', () => {
  it('תקיעוּת היא שלושה אימונים, לא אחד', () => {
    const plan = [day({ exercises: [{ id: 'ex-p', name: 'לחיצת חזה', sets: 3, reps: '8-10', metric: 'weight' }] })]
    const flat = { 'ex-p': [{ kg: 40, reps: 8 }, { kg: 40, reps: 8 }, { kg: 40, reps: 8 }] }
    const two = state(plan, [log('2026-09-15', flat), log(TODAY, flat)])
    expect(nightly(two, TODAY).calls[0].verdict).toBe('hold')
    const three = state(plan, [log('2026-09-08', flat), log('2026-09-15', flat), log(TODAY, flat)])
    expect(STALL).toBe(3)
    expect(nightly(three, TODAY).calls[0].verdict).toBe('watch')
  })

  it('תרגיל ששונה לאחרונה לא משתנה שוב', () => {
    const fresh = { id: 'x', name: 'Front Lever — Tuck', metric: 'time' as const, changedAt: Date.parse('2026-09-20') }
    const old = { id: 'x', name: 'Front Lever — Tuck', metric: 'time' as const, changedAt: Date.parse('2026-08-01') }
    expect(canChange(fresh, TODAY)).toBe(false)
    expect(canChange(old, TODAY)).toBe(true)
    expect(canChange({ id: 'x', name: 'y', metric: 'time' }, TODAY)).toBe(true)
    expect(CHANGE_COOLDOWN_DAYS).toBeGreaterThanOrEqual(21)
  })

  it('לא יותר משני שינויים מבניים בלילה אחד', () => {
    const ex = (i: number) => ({ id: `fl${i}`, name: `Front Lever — Tuck ${i}`, sets: 3, reps: '10 שניות', metric: 'time' as const })
    const plan = [day({ exercises: [ex(1), ex(2), ex(3)] })]
    const hit: Record<string, SetLog[]> = {
      fl1: [{ sec: 10 }, { sec: 10 }, { sec: 10 }],
      fl2: [{ sec: 10 }, { sec: 10 }, { sec: 10 }],
      fl3: [{ sec: 10 }, { sec: 10 }, { sec: 10 }],
    }
    const s = state(plan, [log('2026-09-15', hit), log(TODAY, hit)])
    s.skills = [{ id: 'sk-frontlever', updatedAt: 1, stageId: 'tuck' }]
    const n = nightly(s, TODAY)
    expect(n.calls.filter((c) => c.structural).length).toBeLessThanOrEqual(MAX_STRUCTURAL)
  })

  it('תרגיל רגליים ביום שאחרי ריצה קשה לא מפעיל החלטה', () => {
    const plan = [
      day({ exercises: [{ id: 'ex-lp', name: 'לחיצת רגליים במכונה', sets: 3, reps: '4-6', metric: 'weight' }] }),
    ]
    const weak = { 'ex-lp': [{ kg: 150, reps: 3 }, { kg: 150, reps: 3 }, { kg: 150, reps: 3 }] }
    const s = state(plan, [
      log('2026-09-14', { 'ex-lp': [{ kg: 150, reps: 6 }, { kg: 150, reps: 6 }, { kg: 150, reps: 6 }] }),
      { ...log('2026-09-21', {}), kind: 'run', title: 'ריצת איכות — סף', km: 8, minutes: 45 },
      log(TODAY, weak),
    ])
    const c = nightly(s, TODAY).calls[0]
    expect(c.verdict).toBe('hold')
    expect(c.why).toContain('24 השעות')
  })
})

// ---------------------------------------------------------------------------
describe('בדיקות ברמת השבוע', () => {
  it('תקציב הגיד נספר מהיומן', () => {
    const plan = [day({ exercises: [{ id: 'ex-fl', name: 'Front Lever — Tuck', sets: 5, reps: '10 שניות', metric: 'time' }] })]
    const big = { 'ex-fl': Array.from({ length: 14 }, () => ({ sec: 10 })) }
    const s = state(plan, [log(TODAY, big)])
    const t = tendonLoad(s, TODAY)
    expect(t.maxSession).toBe(140)
    expect(t.week).toBe(140)
    expect(nightly(s, TODAY).week.some((w) => w.includes('זרוע ישרה'))).toBe(true)
  })

  it('ריצה קלה שנרוצה מהר מדי נתפסת — אבל רק אחרי שתיים מתוך ארבע', () => {
    // מבחן שדה: 5 ק״מ ב-25 דקות. הטווח הקל שנגזר ממנו הוא איטי בהרבה.
    const runs = (paceMin: number, n: number): WorkoutLog[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        updatedAt: 1,
        date: `2026-09-${String(15 + i).padStart(2, '0')}`,
        title: 'ריצה קלה',
        kind: 'run' as const,
        sets: {},
        km: 5,
        minutes: 5 * paceMin,
      }))
    const fast = blankState({
      workouts: [
        { id: 'tt', updatedAt: 1, date: '2026-09-01', title: 'מבחן', kind: 'run', sets: {}, km: 5, minutes: 25 },
        ...runs(5.2, 4),
      ],
    })
    const e = easyCheck(fast, TODAY)
    expect(e.of).toBeGreaterThanOrEqual(3)
    expect(e.tooFast).toBeGreaterThanOrEqual(2)
    expect(nightly(fast, TODAY).week.some((w) => w.includes('קלות'))).toBe(true)

    const slow = blankState({
      workouts: [
        { id: 'tt', updatedAt: 1, date: '2026-09-01', title: 'מבחן', kind: 'run', sets: {}, km: 5, minutes: 25 },
        ...runs(6.8, 4),
      ],
    })
    expect(easyCheck(slow, TODAY).tooFast).toBe(0)
  })

  it('בלי אימונים — אומרים את זה, ולא ממציאים החלטות', () => {
    const n = nightly(blankState(), TODAY)
    expect(n.calls).toEqual([])
    expect(n.week[0]).toContain('לא נרשם')
  })
})
