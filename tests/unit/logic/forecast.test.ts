// הערכת זמן למטרות הכושר, והכלל שמונע קפיצת שלבים.
//
// שתי הבדיקות המרכזיות כאן נולדו מאותו אירוע אמיתי (19.9): יומן של L-Sit עם
// עקבים על הרצפה — 20/35/50 שניות — "סגר" בבת אחת גם את Tuck, גם את רגל אחת
// וגם את ה-L-Sit המלא, כי לשלבים המתקדמים יש סף נמוך יותר במספרים, וכולם
// נמדדים מול אותו תרגיל. התוצאה הייתה קפיצה משלב 2 לשלב 5.
//
// מה שנשמר כאן: (א) מדידה אוטומטית סוגרת שלב אחד בלבד; (ב) ההערכה נשענת על
// חלון אימונים ומתכנסת לזמן הטיפוסי של השלב, ולכן אימון חריג אחד לא הופך
// חודשיים ליומיים.
import { describe, it, expect } from 'vitest'
import { blankState } from './helpers'
import { currentStage } from '../../../src/store'
import { ladder, stageWeeks } from '../../../src/skills'
import { sessionLevel, skillForecast, slopePerWeek, runForecast } from '../../../src/forecast'
import type { AppState, WorkoutDay, WorkoutLog } from '../../../src/types'

const lsit = ladder('sk-lsit')!

/** תוכנית עם התרגיל שמודד את ה-L-Sit, בדיוק כמו בתוכנית האמיתית */
const plan: WorkoutDay[] = [
  {
    id: 'wd-sat',
    updatedAt: 1,
    dow: 6,
    title: 'בית — סקילים',
    kind: 'home',
    exercises: [
      { id: 'ex-lsit', name: 'L-Sit — הרמת ישבן (עקבים על הרצפה)', sets: 3, reps: '20 שניות', metric: 'time' },
    ],
  } as WorkoutDay,
]

const log = (date: string, secs: number[]): WorkoutLog =>
  ({ id: `w-${date}`, updatedAt: 1, date, title: 'בית', kind: 'home', sets: { 'ex-lsit': secs.map((sec) => ({ sec })) } }) as WorkoutLog

const state = (logs: WorkoutLog[], done: string[] = ['pseudo']): AppState =>
  blankState({
    workoutPlan: plan,
    workouts: logs,
    skills: [{ id: 'sk-lsit', updatedAt: 1, done } as AppState['skills'][number]],
  })

describe('sessionLevel', () => {
  it('הרמה היא הסט ה-n הטוב, כי זה תנאי המעבר', () => {
    const t = { metric: 'time' as const, value: 20, sets: 3 }
    expect(sessionLevel([{ sec: 20 }, { sec: 35 }, { sec: 50 }], t)).toBe(20)
    // סט בודד ענק לא הופך לרמה — חסרים סטים
    expect(sessionLevel([{ sec: 60 }], t)).toBe(0)
  })

  it('תוספת משקל נדרשת מסננת סטים', () => {
    const t = { metric: 'bodyweight' as const, value: 5, sets: 2, kg: 10 }
    expect(sessionLevel([{ kg: 0, reps: 12 }, { kg: 10, reps: 6 }], t)).toBe(0)
    expect(sessionLevel([{ kg: 10, reps: 6 }, { kg: 12.5, reps: 5 }], t)).toBe(5)
  })
})

describe('currentStage — סגירה אוטומטית של שלב אחד בלבד', () => {
  it('3×20 שניות בעקבים על הרצפה סוגרות את השלב השני ולא קופצות לחמישי', () => {
    const s = state([log('2026-09-19', [20, 35, 50])])
    // pseudo סומן ידנית, foot-support נסגר מהיומן — ומכאן עוצרים
    expect(currentStage(s, lsit)).toBe(2)
    expect(lsit.stages[2].id).toBe('tuck')
  })

  it('שלב שסומן ידנית ממשיך להיסגר גם אחרי הסגירה האוטומטית', () => {
    const s = state([log('2026-09-19', [20, 35, 50])], ['pseudo', 'tuck'])
    expect(currentStage(s, lsit)).toBe(3)
  })

  it('בלי יומן — נשארים בשלב הראשון שלא סומן', () => {
    expect(currentStage(state([]), lsit)).toBe(1)
  })
})

describe('slopePerWeek', () => {
  it('שתי נקודות זה לא קצב', () => {
    expect(slopePerWeek([{ date: '2026-09-05', level: 10 }, { date: '2026-09-12', level: 20 }])).toBeNull()
  })

  it('שיפור של 5 שניות בשבוע מוחזר כ-5', () => {
    const v = slopePerWeek([
      { date: '2026-09-05', level: 10 },
      { date: '2026-09-12', level: 15 },
      { date: '2026-09-19', level: 20 },
    ])
    expect(v).toBeCloseTo(5, 5)
  })
})

describe('skillForecast', () => {
  const from = '2026-09-19'

  it('אימון חריג אחד לא מכווץ את ההערכה לאפס', () => {
    // קפיצה של 30 שניות בשבוע היחיד האחרון — הקצב נחתך מול הזמן הטיפוסי
    const s = state([log('2026-09-05', [5, 5, 5]), log('2026-09-12', [8, 9, 9]), log('2026-09-19', [19, 40, 50])])
    const f = skillForecast(s, lsit, from)
    expect(f.stage).toBe(1)
    expect(f.next.weeks).toBeGreaterThanOrEqual(1)
    // לא יותר מהיר מפי שלושה מהזמן הטיפוסי של השלב
    expect(f.next.weeks).toBeGreaterThanOrEqual(Math.round(stageWeeks('sk-lsit', 'foot-support') / 3))
  })

  it('רמה שלא זזה נותנת הערכה שמרנית ולא הבטחה', () => {
    const s = state([log('2026-09-05', [10, 10, 10]), log('2026-09-12', [10, 10, 10]), log('2026-09-19', [10, 10, 10])])
    const f = skillForecast(s, lsit, from)
    expect(f.basis).toBe('stuck')
    expect(f.next.weeks).toBeGreaterThan(stageWeeks('sk-lsit', 'foot-support'))
  })

  it('תנאי שנסגר מאפס את הזמן לשלב הבא, והמטרה עדיין רחוקה', () => {
    const s = state([log('2026-09-19', [20, 35, 50])])
    const f = skillForecast(s, lsit, from)
    // כאן כבר נמצאים ב-tuck, שעוד לא בוצע אף פעם
    expect(f.stageName).toContain('Tuck')
    expect(f.goalWeeks).toBeGreaterThan(f.next.weeks)
    expect(f.goalDate > from).toBe(true)
  })

  it('הטווח עוטף את ההערכה', () => {
    const s = state([log('2026-09-05', [5, 5, 5]), log('2026-09-12', [8, 9, 9]), log('2026-09-19', [12, 13, 14])])
    const f = skillForecast(s, lsit, from)
    expect(f.next.lo).toBeLessThanOrEqual(f.next.weeks)
    expect(f.next.hi).toBeGreaterThanOrEqual(f.next.weeks)
    expect(f.goalLo).toBeLessThanOrEqual(f.goalWeeks)
    expect(f.goalHi).toBeGreaterThanOrEqual(f.goalWeeks)
  })
})

describe('runForecast', () => {
  const runs: WorkoutLog[] = [
    { id: 'r1', updatedAt: 1, date: '2026-09-04', title: 'ארוכה', kind: 'run', sets: {}, km: 4 },
    { id: 'r2', updatedAt: 1, date: '2026-09-11', title: 'ארוכה', kind: 'run', sets: {}, km: 5 },
    { id: 'r3', updatedAt: 1, date: '2026-09-18', title: 'ארוכה', kind: 'run', sets: {}, km: 6 },
  ] as WorkoutLog[]

  it('הצמיחה נחתכת לכלל ה-10% ולא מבטיחה חצי מרתון בחודש', () => {
    const f = runForecast(blankState({ workouts: runs }), '2026-09-19')
    expect(f.best).toBe(6)
    expect(f.growth).toBeLessThanOrEqual(1)
    const half = f.items[f.items.length - 1]
    expect(half.km).toBe(21.1)
    expect(half.weeks).toBeGreaterThan(12)
  })

  it('בלי ריצות בכלל יש עדיין כיוון, לא חלוקה באפס', () => {
    const f = runForecast(blankState({ workouts: [] }), '2026-09-19')
    expect(f.items.length).toBe(7)
    expect(Number.isFinite(f.items[0].weeks)).toBe(true)
  })
})
