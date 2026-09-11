// ---------------------------------------------------------------------------
// אטלס סבב 2 — thread.json פגום: סוכן מרושל או זדוני. שום דבר לא מפיל, לא
// משחית מצב, ופקודות טובות באותה תשובה עדיין מבוצעות.
//
// בדיקות שמסומנות it.fails מתעדות באג אמיתי (ראו tests/reports/atlas2.md):
// הן "עוברות" כל עוד הבאג קיים, ויתחילו להיכשל כשהטלאי ייכנס — אז מסירים את .fails.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, event, pin, rule, task, NOW } from '../logic/helpers'
import { boot, thread, threadRaw, threadPlain, atlasMsg, userMsg, T, type Harness } from './harness'
import type { AtlasCommand } from '../../../src/atlas'

beforeEach(() => pin(NOW))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ids = (h: Harness) => Object.keys(h.state().atlasApplied ?? {}).sort()

describe('thread.json שאינו במבנה הצפוי', () => {
  it('לא מעטפה ולא JSON — שגיאה בזיכרון, לא זריקה, המצב לא נגע', async () => {
    const h = await boot()
    threadPlain(h, 'this is not json at all')
    expect(await h.At.pollAtlas()).toBe(false)
    expect(h.cache().error).toMatch(/לא הצלחתי/)
    expect(h.cache().messages).toEqual([])
    expect(h.state().atlasApplied).toEqual({})
  })

  it('מעטפה תקינה שמפוענחת לטקסט שאינו JSON', async () => {
    const h = await boot()
    await threadRaw(h, '<html>oops</html>')
    expect(await h.At.pollAtlas()).toBe(false)
    expect(h.cache().error).toMatch(/לא הצלחתי/)
    expect(h.cache().messages).toEqual([])
  })

  it.each([
    ['null', 'null'],
    ['מערך במקום אובייקט', '[]'],
    ['מחרוזת', '"hello"'],
    ['messages שאינו מערך (אובייקט)', '{"messages":{"a":1}}'],
    ['messages שאינו מערך (מחרוזת)', '{"messages":"abc"}'],
    ['messages שאינו מערך (מספר)', '{"messages":42}'],
  ])('%s — לא זורק, השיחה המקומית נשמרת', async (_name, plain) => {
    const local = [userMsg('u1', T(9), 'שלי', { pending: true })]
    const h = await boot(blankState(), { messages: local, today: null, undo: {} })
    await threadRaw(h, plain)
    await h.At.pollAtlas()
    // או שהתעלמנו (אין הודעות → שום שינוי) או שנרשמה שגיאה — בשני המקרים ההודעה שלי לא נעלמה
    expect(h.cache().messages.map((m: any) => m.id)).toContain('u1')
    expect(h.state().atlasApplied).toEqual({})
  })

  it('אובייקט ריק — נחשב שיחה ריקה; ההודעה הממתינה שלי נשארת ממתינה', async () => {
    const local = [userMsg('u1', T(9), 'שלי', { pending: true })]
    const h = await boot(blankState(), { messages: local, today: null, undo: {} })
    await threadRaw(h, '{}')
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.cache().messages).toHaveLength(1)
    expect(h.cache().messages[0].pending).toBe(true)
    expect(h.At.awaitingReply()).toBe(true)
  })
})

describe('הודעות פגומות בתוך messages', () => {
  it('הודעות בלי id / at / from, מספר ומחרוזת — לא זורקות; הודעות תקינות באותו קובץ נשמרות', async () => {
    const h = await boot()
    await thread(h, [
      42,
      'string',
      {},
      { id: 'no-at', from: 'atlas', text: 'בלי זמן' },
      { at: T(9), from: 'atlas', text: 'בלי מזהה' },
      { id: 'no-from', at: T(9, 5), text: 'בלי שולח' },
      atlasMsg('ok', T(10), [{ id: 'c-ok', op: 'addTask', task: { title: 'תקינה' } }]),
    ])
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.cache().error).toBeUndefined()
    expect(h.cache().messages.some((m: any) => m?.id === 'ok')).toBe(true)
    expect(h.state().tasks.find((t) => t.id === 't-c-ok')?.title).toBe('תקינה')
    expect(ids(h)).toEqual(['c-ok'])
  })

  // FIXME (major): ערך null אחד ב-messages → mergeThread זורק (null.id) → כל השיחה "לא ניתנת לקריאה",
  // שום הודעה לא מוצגת ושום פקודה לא מבוצעת עד שהסוכן ישכתב את הקובץ.
  it('null בתוך messages לא מפיל את כל השיחה', async () => {
    const h = await boot()
    await thread(h, [null, atlasMsg('ok', T(10), [{ id: 'c-ok', op: 'addTask', task: { title: 'תקינה' } }])])
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.cache().error).toBeUndefined()
    expect(h.state().tasks.find((t) => t.id === 't-c-ok')?.title).toBe('תקינה')
  })

  it('at בפורמטים משונים — הסדר לפי מה שניתן לפענח, השאר בתחילת הרשימה, בלי זריקה', async () => {
    const h = await boot()
    await thread(h, [
      atlasMsg('epoch', 1757577600000 as any),
      atlasMsg('garbage', 'yesterday-ish'),
      atlasMsg('notz', '2026-09-11T12:00:00'),
      atlasMsg('z', '2026-09-11T08:00:00Z'),
      atlasMsg('nul', null as any),
      atlasMsg('date-only', '2026-09-10'),
    ])
    expect(await h.At.pollAtlas()).toBe(true)
    const order = h.cache().messages.map((m: any) => m.id)
    // 08:00Z = 11:00 בישראל, notz = 12:00 מקומי → z לפני notz; date-only אתמול לפניהם
    expect(order.indexOf('date-only')).toBeLessThan(order.indexOf('z'))
    expect(order.indexOf('z')).toBeLessThan(order.indexOf('notz'))
    expect(order).toHaveLength(6)
  })

  it('אותו מזהה הודעה פעמיים במאגר — הפקודות לא רצות פעמיים', async () => {
    const h = await boot()
    const cmd: AtlasCommand = { id: 'c-dup', op: 'addTask', task: { title: 'פעם אחת' } }
    await thread(h, [atlasMsg('a1', T(9), [cmd]), atlasMsg('a1', T(9), [cmd])])
    await h.At.pollAtlas()
    expect(h.state().tasks.filter((t) => t.title === 'פעם אחת')).toHaveLength(1)
  })

  // FIXME (minor): mergeThread לא מסנן כפילויות מהמאגר — שתי בועות עם אותו key
  // (אזהרת React בקונסול, שתי בועות זהות על המסך).
  it('אותו מזהה הודעה פעמיים במאגר — מוצג פעם אחת', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9)), atlasMsg('a1', T(9))])
    await h.At.pollAtlas()
    expect(h.cache().messages.filter((m: any) => m.id === 'a1')).toHaveLength(1)
  })

  it('commands שאינו מערך (מחרוזת / אובייקט / null / מספר) — מתעלמים', async () => {
    const h = await boot()
    await thread(h, [
      atlasMsg('s', T(9), 'abc' as any),
      atlasMsg('o', T(9, 1), { id: 'x', op: 'addTask', task: { title: 'לא' } } as any),
      atlasMsg('n', T(9, 2), null as any),
      atlasMsg('num', T(9, 3), 7 as any),
      atlasMsg('ok', T(9, 4), [{ id: 'c-ok', op: 'addTask', task: { title: 'כן' } }]),
    ])
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.state().tasks.map((t) => t.title)).toEqual(['כן'])
    expect(ids(h)).toEqual(['c-ok'])
  })
})

describe('פקודות חסרות שדות', () => {
  const SLOPPY_STATE = () => blankState({
    rules: [rule({ id: 'r1', days: [1], title: 'קבוע' })],
    tasks: [task({ id: 't1', title: 'קיימת' })],
    events: [event({ id: 'e1', date: '2026-09-20', title: 'א' })],
    workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight' }] }],
  })
  const BAD: AtlasCommand[] = [
    { id: 'b-pt-unknown', op: 'patchTask', taskId: 'no-such', patch: { status: 'done' } },
    { id: 'b-pt-noid', op: 'patchTask', patch: { status: 'done' } },
    { id: 'b-rl-daysnull', op: 'addRule', rule: { title: 'ימים null', days: null, start: '10:00', end: '11:00' } },
    { id: 'b-ex-noday', op: 'addExercise', dayId: 'no-such', exercise: { name: 'x' } },
    { id: 'b-ex-nodayid', op: 'addExercise', exercise: { name: 'x' } },
    { id: 'b-wd-exstr', op: 'addWorkoutDay', day: { dow: 9, exercises: 'nope' } },
    { id: 'b-wg-str', op: 'setWeekGoals', weekStart: 'garbage', goals: 'x' },
    { id: 'b-wg-null', op: 'setWeekGoals', weekStart: '2026-09-06', goals: [{ text: 'א' }, null] },
    { id: 'b-op-obj', op: { $: 1 } as any, task: {} },
    { id: 'b-no-op', task: { title: 'בלי op' } } as any,
    { id: 'b-set', op: 'setSettings', patch: { aiKey: 'HACKED', theme: 'dark', bogus: 1, notifications: true, autoSync: false } },
    { id: 'b-del-1', op: 'deleteRule', ruleId: 'r1' },
    { id: 'b-del-2', op: 'deleteRule', ruleId: 'r1' },
    { id: 'b-dup', op: 'addTask', task: { title: 'כפול א' } },
    { id: 'b-dup', op: 'addTask', task: { title: 'כפול ב' } },
  ]
  const GOOD: AtlasCommand[] = [
    { id: 'g-task', op: 'addTask', task: { title: 'טובה', due: '2026-09-12' } },
    { id: 'g-event', op: 'addEvent', event: { title: 'טוב', date: '2026-09-12', start: '09:00', end: '10:00' } },
  ]

  it('פקודות שזורקות או חסרות — מסומנות כבוצעו בלי לשנות מצב; הטובות באותה תשובה מבוצעות; ההגדרות המוגנות לא נגעו', async () => {
    const h = await boot(SLOPPY_STATE())
    const before = h.state()
    await thread(h, [atlasMsg('a1', T(9), [...BAD, ...GOOD])])
    expect(await h.At.pollAtlas()).toBe(true)
    const s = h.state()
    expect(s.tasks.find((t) => t.id === 't-g-task')).toMatchObject({ title: 'טובה', due: '2026-09-12', status: 'todo' })
    expect(s.events.find((e) => e.id === 'e-g-event')).toMatchObject({ title: 'טוב', date: '2026-09-12' })
    expect(h.At.canUndo('g-task')).toBe(true)
    expect(ids(h)).toEqual([...new Set([...BAD, ...GOOD].map((c) => c.id))].sort())
    // כפילות מזהה — רק הראשונה
    expect(s.tasks.find((t) => t.id === 't-b-dup')?.title).toBe('כפול א')
    expect(s.tasks.some((t) => t.title === 'כפול ב')).toBe(false)
    // הגדרות מוגנות
    expect(s.settings.aiKey).toBe(before.settings.aiKey)
    expect(s.settings.theme).toBe(before.settings.theme)
    expect((s.settings as any).bogus).toBeUndefined()
    expect(s.settings.notifications).toBe(before.settings.notifications)
    expect(s.settings.autoSync).toBe(before.settings.autoSync)
    // deleteRule פעמיים — מחוק פעם אחת, לא זורק
    expect(s.rules.find((r) => r.id === 'r1')?.deleted).toBe(true)
    // days: null זרק בתוך upsertRule לפני שהכלל נכנס — לא נשאר כלל שבור
    expect(s.rules.find((r) => r.id === 'rl-b-rl-daysnull')).toBeUndefined()
    // הפגומות שזרקו לא ניתנות לביטול, ורשומות בקונסול
    expect(h.At.canUndo('b-pt-unknown')).toBe(false)
    expect(h.errors.mock.calls.filter((c) => c[0] === 'atlas command failed').length).toBeGreaterThanOrEqual(8)
  })

  // FIXME (major): applyCommand לא מאמת שדות — הרשומות הפגומות נכנסות למצב ומסונכרנות:
  //   addEvent בלי date / עם date שאינו ISO, addRule עם days שאינו מערך (הגדרות → r.days.map קורס),
  //   addTask בלי title (היום/סקירה → t.title.length קורס), addTrack עם name שאינו מחרוזת.
  //   sanitize() בטעינה הבאה זורק אותן — כלומר הן "נעלמות" ברענון, אבל עד אז המסכים קורסים.
  it('רשומות פגומות מבחינת מבנה לא נכנסות למצב', async () => {
    const h = await boot(SLOPPY_STATE())
    await thread(h, [
      atlasMsg('a1', T(9), [
        { id: 'b-ev-nodate', op: 'addEvent', event: { title: 'בלי תאריך', start: '10:00', end: '11:00' } },
        { id: 'b-ev-baddate', op: 'addEvent', event: { title: 'תאריך זבל', date: 'מחר', start: '10:00', end: '11:00' } },
        { id: 'b-rl-daysstr', op: 'addRule', rule: { title: 'ימים מחרוזת', days: 'abc', start: '10:00', end: '11:00' } },
        { id: 'b-task-notitle', op: 'addTask', task: { due: '2026-09-12' } },
        { id: 'b-task-null', op: 'addTask', task: null },
        { id: 'b-tr', op: 'addTrack', track: { name: 5, color: 'red', order: 'z' } },
      ]),
    ])
    await h.At.pollAtlas()
    const s = h.state()
    expect(s.events.filter((e) => typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))).toEqual([])
    expect(s.rules.filter((r) => !Array.isArray(r.days))).toEqual([])
    expect(s.tasks.filter((t) => typeof t.title !== 'string')).toEqual([])
    expect(s.tracks.filter((t) => typeof t.name !== 'string')).toEqual([])
  })

  // FIXME (major): setSettings מסנן רק לפי שם המפתח, לא לפי סוג/טווח — name כאובייקט קורס ברינדור,
  //   tokenMinutes: 0 → חלוקה באפס בקיבולת, reviewDow: 9 → אין יום סקירה, wakeTime מספר → פרסור שעה נכשל.
  it('setSettings דוחה ערכים מהסוג/הטווח הלא נכון', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'b-set-types', op: 'setSettings', patch: { wakeTime: 12345, tokenMinutes: 0, dailyTokenGoal: -5, name: { evil: true }, reviewDow: 9 } }])])
    await h.At.pollAtlas()
    const s = h.state()
    expect(typeof s.settings.wakeTime).toBe('string')
    expect(s.settings.tokenMinutes).toBeGreaterThan(0)
    expect(s.settings.dailyTokenGoal).toBeGreaterThanOrEqual(0)
    expect(typeof s.settings.name).toBe('string')
    expect(s.settings.reviewDow).toBeLessThanOrEqual(6)
  })

  it('setSettings עם ערכים תקינים בלבד — עובד וניתן לביטול (הבסיס להשוואה)', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'ok-set', op: 'setSettings', patch: { wakeTime: '06:00', reviewDow: 5 } }])])
    await h.At.pollAtlas()
    expect(h.state().settings).toMatchObject({ wakeTime: '06:00', reviewDow: 5 })
    expect(h.At.undoCommand('ok-set')).toBe(true)
    expect(h.state().settings).toMatchObject({ wakeTime: '07:30', reviewDow: 0 })
  })

  it('monthDay: 40 — נדחה: יום בחודש הוא 1–31, הפקודה מסומנת ולא נוצר כלום', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'md', op: 'addRule', rule: { title: 'יום 40', freq: 'monthly', monthDay: 40, start: '10:00', end: '11:00' } }])])
    await h.At.pollAtlas()
    expect(h.state().rules.find((r) => r.id === 'rl-md')).toBeUndefined()
    expect(h.state().events.some((e) => e.ruleId === 'rl-md')).toBe(false)
    expect(h.state().atlasApplied?.md).toBeTruthy()
    expect(h.At.undoCommand('md')).toBe(false)
  })

  it('addRule עם days: [] ובלי freq — נדחה: כלל בלי ימים הוא זבל, הפקודה מסומנת ולא נוצר כלום', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'nd', op: 'addRule', rule: { title: 'ריק', days: [], start: '10:00', end: '11:00' } }])])
    await h.At.pollAtlas()
    expect(h.state().rules.find((r) => r.id === 'rl-nd')).toBeUndefined()
    expect(h.state().atlasApplied?.nd).toBeTruthy()
    expect(h.At.undoCommand('nd')).toBe(false)
  })

  // FIXME (major): describeCommand → default מחזיר c.op כמו שהוא. op שהוא אובייקט/מערך → React זורק
  //   "Objects are not valid as a React child" והמסך של אטלס כולו לבן (ראו tests/e2e/atlas2/malformed.spec.ts).
  it('describeCommand מחזיר תמיד מחרוזת — גם ל-op שאינו מחרוזת', async () => {
    const h = await boot()
    expect(typeof h.At.describeCommand({ id: 'x', op: { $: 1 } as any })).toBe('string')
    expect(typeof h.At.describeCommand({ id: 'x', op: undefined as any })).toBe('string')
  })

  it('describeCommand עם שדות שאינם מחרוזות — לא זורק, מחזיר מחרוזת', async () => {
    const h = await boot()
    expect(typeof h.At.describeCommand({ id: 'x', op: 'addTask', task: { title: { a: 1 } } })).toBe('string')
    expect(typeof h.At.describeCommand({ id: 'x', op: 'addEvent', event: null })).toBe('string')
    expect(typeof h.At.describeCommand({ id: 'x', op: 'setSettings', patch: null })).toBe('string')
    expect(typeof h.At.describeCommand({ id: 'x', op: 'setWeekGoals', goals: 'abc' })).toBe('string')
  })
})

describe('עומס', () => {
  it('300 פקודות בתשובה אחת — כולן מבוצעות וכולן מסומנות, בזמן סביר', async () => {
    const h = await boot()
    const cmds: AtlasCommand[] = []
    for (let i = 0; i < 300; i++) cmds.push({ id: `m-${i}`, op: 'addTask', task: { title: `משימה ${i}`, due: '2026-09-12' } })
    await thread(h, [atlasMsg('big', T(9), cmds)])
    const t0 = performance.now()
    expect(await h.At.pollAtlas()).toBe(true)
    const ms = performance.now() - t0
    expect(h.state().tasks).toHaveLength(300)
    expect(ids(h)).toHaveLength(300)
    expect(ms).toBeLessThan(5_000)
  })

  // FIXME (minor): ניקוי הביטולים משאיר 200 אחרונים — בתשובה של 300 פקודות, 100 הראשונות
  //   מאבדות את "ביטול" מיד, באותה תשובה שבה הופיעו.
  it('300 פקודות בתשובה אחת — כולן ניתנות לביטול מיד אחרי הביצוע', async () => {
    const h = await boot()
    const cmds: AtlasCommand[] = []
    for (let i = 0; i < 300; i++) cmds.push({ id: `m-${i}`, op: 'addTask', task: { title: `משימה ${i}` } })
    await thread(h, [atlasMsg('big', T(9), cmds)])
    await h.At.pollAtlas()
    expect(cmds.filter((c) => h.At.canUndo(c.id)).length).toBe(300)
  })

  it('הודעה של 200 KB — נשמרת בזיכרון ומוצגת, בלי זריקה', async () => {
    const h = await boot()
    const text = 'א'.repeat(200 * 1024)
    await thread(h, [atlasMsg('long', T(9), [], { text })])
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.cache().messages[0].text.length).toBe(text.length)
    expect(h.cache().error).toBeUndefined()
  })

  it('300 addRule — נגמר בזמן סביר', async () => {
    const h = await boot()
    const cmds: AtlasCommand[] = []
    for (let i = 0; i < 300; i++) cmds.push({ id: `r-${i}`, op: 'addRule', rule: { title: `כלל ${i}`, days: [i % 7], start: '10:00', end: '11:00' } })
    await thread(h, [atlasMsg('rules', T(9), cmds)])
    const t0 = performance.now()
    await h.At.pollAtlas()
    const ms = performance.now() - t0
    expect(h.state().rules).toHaveLength(300)
    console.log(`[atlas2] 300 addRule → ${h.state().events.length} events in ${Math.round(ms)}ms`)
    expect(ms).toBeLessThan(15_000)
  })
})
