// ---------------------------------------------------------------------------
// "מה שאני עלול לבקש" — מטריצה של בקשות אמיתיות במסלול המהיר, משפחה אחר
// משפחה של פקודות, עם בדיקה שהמצב באמת השתנה (ולא רק שהבועה נראית טוב).
//
// זו חבילת ה-production: כל פקודה שאטלס יכול להחזיר נבדקת כאן דרך משפט שיהונתן
// באמת היה אומר, כולל הקצוות — עשר פקודות בתשובה אחת, מזהה שלא קיים, פקודה
// לא תקינה, העברה לעמוק יחד עם פעולות, וזיכרון.
// ---------------------------------------------------------------------------
import { test, expect, readState, readAtlasCache, waitSynced, gotoTab } from '../cloud/fixtures'
import { openAtlas } from '../atlas2/helpers'
import { PLAN_DAY_ID, EX_A, SEED_EVENT_ID, SEED_TASK_ID, logicalToday, addDaysISO, weekStartISO } from '../cloud/state'
import { atlasBubbles, fastState, repoMemory, say, seedFast, settled } from '../atlas-fast/helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)

const NOISE = /status of 404/
const TODAY = logicalToday()
const TOMORROW = addDaysISO(TODAY, 1)

type Turn = { msg: string; commands: any[]; memory?: string | null; escalate?: string | null; text?: string }

/** שולח הודעה, מקבל תשובה עם פקודות, ומחכה שהכול יושב */
async function turn(page: any, claude: any, t: Turn) {
  claude.reply({
    text: t.text ?? 'בוצע.',
    block: { commands: t.commands, escalate: t.escalate ?? null, memory: t.memory ?? null },
  })
  await say(page, t.msg)
  await settled(page, 15_000)
}

async function device(fake: any, key: string, openDevice: any, claude: any) {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE, /atlas command failed/] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  return { A, ai }
}

// ---------------------------------------------------------------------------
test('יומן: אירוע חדש, הזזה, מחיקה, כלל שבועי, ואימון של תאריך מסוים', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice, claude)

  await turn(A.page, claude, {
    msg: 'תקבע לי פגישה עם המנחה מחר ב-14:00 לשעה, במסלול מחקר',
    commands: [
      {
        id: 'c1',
        op: 'addEvent',
        event: { title: 'פגישה עם המנחה', date: TOMORROW, start: '14:00', end: '15:00', allDay: false, kind: 'personal', trackId: 'trk-research' },
      },
    ],
  })
  let s = await readState(A.page)
  const meeting = s.events.find((e) => e.title === 'פגישה עם המנחה')!
  expect(meeting).toMatchObject({ date: TOMORROW, start: '14:00', end: '15:00', trackId: 'trk-research' })

  await turn(A.page, claude, {
    msg: 'תזיז את הפגישה לשש בערב',
    commands: [{ id: 'c2', op: 'patchEvent', eventId: meeting.id, patch: { start: '18:00', end: '19:00' } }],
  })
  s = await readState(A.page)
  expect(s.events.find((e) => e.id === meeting.id)).toMatchObject({ start: '18:00', end: '19:00' })

  await turn(A.page, claude, {
    msg: 'תמחק את האירוע של הצהריים היום',
    commands: [{ id: 'c3', op: 'deleteEvent', eventId: SEED_EVENT_ID }],
  })
  s = await readState(A.page)
  expect(s.events.find((e) => e.id === SEED_EVENT_ID)?.deleted).toBe(true)

  await turn(A.page, claude, {
    msg: 'תוסיף לי בלוק קבוע של קריאה ראשון וחמישי 10:00 עד 11:00',
    commands: [
      {
        id: 'c4',
        op: 'addRule',
        rule: { title: 'קריאה', kind: 'block', start: '10:00', end: '11:00', days: [0, 4], freq: 'weekly', from: TODAY, deep: true, trackId: 'trk-study' },
      },
    ],
  })
  s = await readState(A.page)
  const rule = s.rules.find((r) => r.title === 'קריאה')!
  expect(rule).toMatchObject({ days: [0, 4], start: '10:00', end: '11:00', deep: true })

  await turn(A.page, claude, {
    msg: 'מחר אני רוצה לעשות את האימון של היום במקום מה שמתוכנן',
    commands: [{ id: 'c5', op: 'setWorkoutFor', date: TOMORROW, dayId: PLAN_DAY_ID }],
  })
  s = await readState(A.page)
  // setWorkoutFor כותב רשומת אימון לתאריך (לא מפה נפרדת) — ראו atlas.ts
  expect(s.workouts!.find((w: any) => w.date === TOMORROW && !w.deleted)?.dayId).toBe(PLAN_DAY_ID)

  // חמש הפקודות סומנו בבועות, ואין הודעה שנכשלה
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(0)
  await expect(A.page.locator('.cmd.fail')).toHaveCount(0)
  expect(fake.issues).toHaveLength(0)
})

// ---------------------------------------------------------------------------
test('משימות, מסלולים ומטרות שבוע: הוספה, סימון כבוצע, מחיקה, מסלול חדש ושינוי שם', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice, claude)

  await turn(A.page, claude, {
    msg: 'תוסיף משימה קריטית להגיש את טופס המילואים עד חמישי, שעה וחצי עבודה',
    commands: [
      { id: 'c1', op: 'addTask', task: { title: 'להגיש את טופס המילואים', due: addDaysISO(TODAY, 3), est: 1.5, critical: true, trackId: 'trk-life' } },
    ],
  })
  let s = await readState(A.page)
  const t1 = s.tasks.find((t) => t.title === 'להגיש את טופס המילואים')!
  expect(t1).toMatchObject({ critical: true, est: 1.5, trackId: 'trk-life' })

  await turn(A.page, claude, {
    msg: 'סיימתי את המשימה של הטופס',
    commands: [{ id: 'c2', op: 'patchTask', taskId: t1.id, patch: { status: 'done' } }],
  })
  s = await readState(A.page)
  expect(s.tasks.find((t) => t.id === t1.id)?.status).toBe('done')

  await turn(A.page, claude, {
    msg: 'תמחק את המשימה מהזרע, היא לא רלוונטית',
    commands: [{ id: 'c3', op: 'deleteTask', taskId: SEED_TASK_ID }],
  })
  s = await readState(A.page)
  expect(s.tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBe(true)

  await turn(A.page, claude, {
    msg: 'תפתח מסלול חדש לעסק של הקלפים',
    commands: [{ id: 'c4', op: 'addTrack', track: { name: 'רביעיות', emoji: '🃏', goal: 'למכור אלף חבילות' } }],
  })
  s = await readState(A.page)
  const track = s.tracks.find((x) => x.name === 'רביעיות')!
  expect(track.goal).toContain('אלף')

  await turn(A.page, claude, {
    msg: 'תשנה את השם של המסלול ל"רביעיות עדתי"',
    commands: [{ id: 'c5', op: 'patchTrack', trackId: track.id, patch: { name: 'רביעיות עדתי' } }],
  })
  s = await readState(A.page)
  expect(s.tracks.find((x) => x.id === track.id)?.name).toBe('רביעיות עדתי')

  await turn(A.page, claude, {
    msg: 'המטרות שלי לשבוע: לנעול רעיון לסמינר, ולרוץ שלוש פעמים',
    commands: [
      {
        id: 'c6',
        op: 'setWeekGoals',
        weekStart: weekStartISO(TODAY),
        goals: [{ text: 'לנעול רעיון לסמינר', trackId: 'trk-study' }, { text: 'לרוץ שלוש פעמים' }],
      },
    ],
  })
  s = await readState(A.page)
  const wl = (s.weeks ?? []).find((w: any) => w.weekStart === weekStartISO(TODAY))
  expect((wl?.goals ?? []).map((g: any) => g.text)).toEqual(['לנעול רעיון לסמינר', 'לרוץ שלוש פעמים'])
  await expect(A.page.locator('.cmd.fail')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
test('אימונים ומיומנויות: יום חדש, תרגיל, עדכון משקל, מחיקה, ושלב במיומנות', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice, claude)

  await turn(A.page, claude, {
    msg: 'תוסיף יום ריצה קלה בשלישי, חצי שעה',
    commands: [
      {
        id: 'c1',
        op: 'addWorkoutDay',
        day: { dow: 2, title: 'ריצה קלה', kind: 'run', target: { km: 5, minutes: 30, pace: '6:00-6:30' }, exercises: [] },
      },
    ],
  })
  let s = await readState(A.page)
  const day = s.workoutPlan!.find((d: any) => d.title === 'ריצה קלה')!
  expect(day).toMatchObject({ dow: 2, kind: 'run' })
  expect(day.target).toMatchObject({ km: 5 })

  await turn(A.page, claude, {
    msg: 'תוסיף מקבילים לאימון של היום, שלושה סטים',
    commands: [{ id: 'c2', op: 'addExercise', dayId: PLAN_DAY_ID, exercise: { name: 'מקבילים', sets: 3, reps: '6-8', metric: 'bodyweight', rest: 120 } }],
  })
  s = await readState(A.page)
  const plan = s.workoutPlan!.find((d: any) => d.id === PLAN_DAY_ID)!
  const dips = plan.exercises.find((e: any) => e.name === 'מקבילים')!
  expect(dips).toMatchObject({ sets: 3, metric: 'bodyweight' })

  await turn(A.page, claude, {
    msg: 'סגרתי את הטווח בסקוואט, תעלה משקל',
    commands: [{ id: 'c3', op: 'patchExercise', dayId: PLAN_DAY_ID, exerciseId: EX_A, patch: { note: '+2.5 ק"ג — סגר טווח' } }],
  })
  s = await readState(A.page)
  expect(s.workoutPlan!.find((d: any) => d.id === PLAN_DAY_ID)!.exercises.find((e: any) => e.id === EX_A)!.note).toContain('2.5')

  await turn(A.page, claude, {
    msg: 'תוריד את המקבילים, אין לי כוח אליהם',
    commands: [{ id: 'c4', op: 'deleteExercise', dayId: PLAN_DAY_ID, exerciseId: dips.id }],
  })
  s = await readState(A.page)
  expect(s.workoutPlan!.find((d: any) => d.id === PLAN_DAY_ID)!.exercises.some((e: any) => e.id === dips.id)).toBe(false)

  await turn(A.page, claude, {
    msg: 'הצלחתי להחזיק עמידת ידיים 20 שניות ליד הקיר',
    commands: [{ id: 'c5', op: 'setSkill', skillId: 'sk-handstand', note: '20 שניות ליד הקיר' }],
  })
  s = await readState(A.page)
  expect((s.skills ?? []).find((x: any) => x.id === 'sk-handstand')?.note ?? '').toContain('20')

  await turn(A.page, claude, {
    msg: 'תמחק את יום הריצה של שלישי',
    commands: [{ id: 'c6', op: 'deleteWorkoutDay', dayId: day.id }],
  })
  s = await readState(A.page)
  expect(s.workoutPlan!.find((d: any) => d.id === day.id)?.deleted).toBe(true)
  await expect(A.page.locator('.cmd.fail')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
test('הרגלים, שבועיים, הגדרות והערה לחדשות — והזיכרון נשמר', async ({ fake, claude, key, openDevice }) => {
  const { A, ai } = await device(fake, key, openDevice, claude)

  await turn(A.page, claude, {
    msg: 'תוסיף הרגל של קריאה לפני השינה, עשרים דקות',
    commands: [{ id: 'c1', op: 'addHabit', habit: { name: 'קריאה לפני שינה', emoji: '📖', minutes: 20 } }],
    memory: 'רוצה לקרוא 20 דקות לפני השינה',
  })
  let s = await readState(A.page)
  const habit = s.habits.find((h) => h.name === 'קריאה לפני שינה')!
  expect(habit.minutes).toBe(20)

  await turn(A.page, claude, {
    msg: 'תעדכן את ההרגל לחצי שעה',
    commands: [{ id: 'c2', op: 'patchHabit', habitId: habit.id, patch: { minutes: 30 } }],
  })
  s = await readState(A.page)
  expect(s.habits.find((h) => h.id === habit.id)?.minutes).toBe(30)

  await turn(A.page, claude, {
    msg: 'תוסיף משהו שבועי: לדבר עם סבתא',
    commands: [{ id: 'c3', op: 'addWeekly', weekly: { name: 'לדבר עם סבתא', kind: 'check', group: 'אנשים' } }],
  })
  s = await readState(A.page)
  const weekly = s.weekly.find((w) => w.name === 'לדבר עם סבתא')!
  expect(weekly.kind).toBe('check')

  await turn(A.page, claude, {
    msg: 'אני רוצה לקום ב-7:00 ולישון ב-23:00, ויעד של 7 שעות ריכוז ביום',
    commands: [{ id: 'c4', op: 'setSettings', patch: { wakeTime: '07:00', bedTime: '23:00', dailyTokenGoal: 7 } }],
  })
  s = await readState(A.page)
  expect(s.settings).toMatchObject({ wakeTime: '07:00', bedTime: '23:00', dailyTokenGoal: 7 })

  await turn(A.page, claude, {
    msg: 'תגיד למהדורת הבוקר שאני רוצה יותר על מדע ופחות על פוליטיקה',
    commands: [{ id: 'c5', op: 'setNewsNote', date: TODAY, note: 'יותר מדע, פחות פוליטיקה' }],
  })
  s = await readState(A.page)
  expect((s.news ?? []).find((n: any) => n.date === TODAY)?.note).toContain('מדע')

  await turn(A.page, claude, {
    msg: 'תמחק את השבועי של סבתא, זה כבר קורה לבד',
    commands: [{ id: 'c6', op: 'deleteWeekly', weeklyId: weekly.id }],
  })
  s = await readState(A.page)
  expect(s.weekly.find((w) => w.id === weekly.id)?.deleted).toBe(true)

  // הזיכרון של אטלס נכתב למאגר הפרטי
  await expect.poll(async () => await repoMemory(fake, ai), { timeout: 20_000 }).toContain('20 דקות לפני השינה')
  await expect(A.page.locator('.cmd.fail')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
test('קצוות: עשר פקודות בתשובה אחת, מזהה שלא קיים, פקודה לא תקינה, וביטול — הכל בלי לשבור מסך', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice, claude)

  const many = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`,
    op: 'addTask',
    task: { title: `משימה מרובה ${i + 1}`, trackId: 'trk-study', due: TODAY },
  }))
  await turn(A.page, claude, { msg: 'תפרק לי את הסמינר לעשר משימות', commands: many })
  let s = await readState(A.page)
  expect(s.tasks.filter((t) => /^משימה מרובה /.test(t.title))).toHaveLength(10)

  // ביטול של אחת מהן מהצ׳יפ
  const bubble = atlasBubbles(A.page).last()
  await bubble.locator('.cmd').first().getByRole('button', { name: 'ביטול' }).click()
  await expect
    .poll(async () => (await readState(A.page)).tasks.filter((t) => /^משימה מרובה /.test(t.title) && !t.deleted).length, { timeout: 10_000 })
    .toBe(9)

  // מזהה שלא קיים + פקודה לא תקינה (כלל שבועי בלי ימים) — מסומנות, והטובה עוברת
  await turn(A.page, claude, {
    msg: 'תזיז את הפגישה של אתמול ותוסיף כלל',
    commands: [
      { id: 'b1', op: 'patchEvent', eventId: 'ev-does-not-exist', patch: { start: '09:00' } },
      { id: 'b2', op: 'addRule', rule: { title: 'כלל שבור', kind: 'block', start: '09:00', end: '10:00', days: [], freq: 'weekly', from: TODAY } },
      { id: 'b3', op: 'addTask', task: { title: 'המשימה הטובה', due: TODAY } },
    ],
  })
  await expect(A.page.locator('.cmd.fail')).toHaveCount(2, { timeout: 10_000 })
  s = await readState(A.page)
  expect(s.tasks.some((t) => t.title === 'המשימה הטובה' && !t.deleted)).toBe(true)
  expect(s.rules.some((r) => r.title === 'כלל שבור')).toBe(false)

  // העברה לעמוק יחד עם פעולה: הפעולה מתבצעת, וה-Issue נפתח
  claude.reply({
    text: 'רשמתי את המשימה. את השינוי במסך עצמו אני מעביר לעמוק.',
    block: { commands: [{ id: 'e1', op: 'addTask', task: { title: 'לפני ההעברה', due: TODAY } }], escalate: 'שינוי קוד', memory: null },
  })
  await say(A.page, 'תוסיף משימה, ואחר כך תשנה את מסך היום שיראה את השבוע')
  await expect.poll(() => fake.issues.length, { timeout: 15_000 }).toBe(1)
  s = await readState(A.page)
  expect(s.tasks.some((t) => t.title === 'לפני ההעברה')).toBe(true)

  // כל המסכים נטענים אחרי כל זה
  for (const tab of ['היום', 'יומן', 'פרויקטים', 'אימונים', 'סקירה', 'שיחה']) {
    await gotoTab(A.page, tab)
    // האפליקציה עצמה עומדת: הניווט קיים, ואין מסך קריסה
    await expect(A.page.locator('.app').first()).toBeVisible()
    await expect(A.page.getByRole('button', { name: 'שיחה' }).first()).toBeVisible()
    await expect(A.page.getByText('משהו נשבר')).toHaveCount(0)
  }
  const cache = await readAtlasCache(A.page)
  expect((cache?.messages ?? []).some((m: any) => m.failed)).toBe(false)
})
