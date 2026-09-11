// ---------------------------------------------------------------------------
// אטלס סבב 2 — סוכן מרושל/זדוני כותב thread.json פגום. המסך לא קורס, פקודות
// טובות באותה תשובה מבוצעות, וכל מסך אחר עדיין נטען.
// ---------------------------------------------------------------------------
import { test, expect, readState, readAtlasCache, waitSynced, gotoTab, gotoSettings, sleep } from '../cloud/fixtures'
import { baseState, PLAN_DAY_ID, SEED_TASK_ID } from '../cloud/state'
import { seedCloud, writeThread, openAtlas, atlasMsg, minutesAgo, today, assertNoHorizontalOverflow } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)

const CMD_FAIL = /atlas command failed/

test('תשובה מרושלת: פקודות חסרות/שגויות מסומנות ולא משנות כלום, הטובות מבוצעות, וכל מסך נטען', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [
    atlasMsg('a-sloppy', minutesAgo(2), [
      { id: 'b-pt', op: 'patchTask', taskId: 'no-such-task', patch: { status: 'done' } },
      { id: 'b-de', op: 'deleteEvent', eventId: 'no-such-event' },
      { id: 'b-ex', op: 'addExercise', dayId: 'no-such-day', exercise: { name: 'x' } },
      { id: 'b-rl-null', op: 'addRule', rule: { title: 'ימים null', days: null, start: '10:00', end: '11:00' } },
      { id: 'b-op', op: 'teleport', where: 'הירח' },
      { id: 'b-noop', task: { title: 'בלי op' } },
      { id: 'b-set', op: 'setSettings', patch: { aiKey: 'HACKED', theme: 'dark', notifications: true, nope: 1 } },
      { id: 'b-dup', op: 'addTask', task: { title: 'כפול א', due: today } },
      { id: 'b-dup', op: 'addTask', task: { title: 'כפול ב', due: today } },
      { id: 'b-rl-empty', op: 'addRule', rule: { title: 'בלי ימים', days: [], start: '10:00', end: '11:00' } },
      { id: 'b-md40', op: 'addRule', rule: { title: 'יום 40', freq: 'monthly', monthDay: 40, start: '08:00', end: '08:30' } },
      { id: 'b-del1', op: 'deleteRule', ruleId: 'rl-b-rl-empty' },
      { id: 'b-del2', op: 'deleteRule', ruleId: 'rl-b-rl-empty' },
      { id: 'g-task', op: 'addTask', task: { title: 'משימה טובה', due: today, trackId: 'trk-life' } },
      { id: 'g-event', op: 'addEvent', event: { title: 'אירוע טוב', date: today, start: '18:00', end: '19:00' } },
      { id: 'g-ex', op: 'addExercise', dayId: PLAN_DAY_ID, exercise: { name: 'תרגיל טוב', sets: 2, reps: '5' } },
      { id: 'g-pt', op: 'patchTask', taskId: SEED_TASK_ID, patch: { status: 'done' } },
    ], { text: 'עשיתי הרבה דברים, חלקם לא באמת.' }),
  ])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble.atlas', { hasText: 'עשיתי הרבה' })).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 15_000 }).toBe(16)

  const s = await readState(A.page)
  // הטובות
  expect(s.tasks.find((t) => t.id === 't-g-task')).toMatchObject({ title: 'משימה טובה', due: today })
  expect(s.events.find((e) => e.id === 'e-g-event')).toMatchObject({ title: 'אירוע טוב', date: today })
  expect(s.workoutPlan.find((d) => d.id === PLAN_DAY_ID)!.exercises.some((x) => x.name === 'תרגיל טוב')).toBe(true)
  expect(s.tasks.find((t) => t.id === SEED_TASK_ID)?.status).toBe('done')
  // הרעות — לא שינו כלום
  expect(s.settings.aiKey).toBe(ai)
  expect(s.settings.theme).toBe('system')
  expect(s.settings.notifications).toBe(false)
  expect((s.settings as any).nope).toBeUndefined()
  expect(s.tasks.find((t) => t.id === 't-b-dup')?.title).toBe('כפול א')
  expect(s.tasks.some((t) => t.title === 'כפול ב')).toBe(false)
  expect(s.rules.find((r) => r.id === 'rl-b-rl-null')).toBeUndefined()
  expect(s.rules.find((r) => r.id === 'rl-b-rl-empty')?.deleted).toBe(true)
  const md = s.rules.find((r) => r.id === 'rl-b-md40')
  expect(md).toMatchObject({ freq: 'monthly', monthDay: 40 })
  // הפקודות שנכשלו — בלי "ביטול"; הטובות — עם
  const chips = A.page.locator('.cmd')
  await expect(chips).toHaveCount(17)
  await expect(chips.filter({ hasText: 'משימה חדשה: משימה טובה' }).getByRole('button', { name: 'ביטול' })).toHaveCount(1)
  await expect(chips.filter({ hasText: 'teleport' }).getByRole('button', { name: 'ביטול' })).toHaveCount(0)
  await expect(chips.filter({ hasText: 'משימה עודכנה: משימה' }).first().getByRole('button', { name: 'ביטול' })).toHaveCount(0)
  const cache = await readAtlasCache(A.page)
  expect(Object.keys(cache.undo).sort()).toEqual(['b-dup', 'b-md40', 'b-set', 'g-event', 'g-ex', 'g-pt', 'g-task'].concat(['b-del1', 'b-del2', 'b-rl-empty']).sort())
  await assertNoHorizontalOverflow(A.page)

  // כל מסך נטען
  await gotoTab(A.page, 'היום')
  await expect(A.page.getByText('משימה טובה', { exact: true }).first()).toBeVisible()
  await expect(A.page.getByText('אירוע טוב', { exact: true }).first()).toBeVisible()
  await gotoTab(A.page, 'יומן')
  await expect(A.page.getByText('אירוע טוב', { exact: true }).first()).toBeVisible()
  await gotoTab(A.page, 'פרויקטים')
  await gotoTab(A.page, 'סקירה')
  await gotoSettings(A.page)
  await expect(A.page.locator('.item', { hasText: 'יום 40' }).first()).toBeVisible()
  await sleep(500)
})

// FIXME (major): אין שום סימון בממשק לפקודה שנכשלה. הצ׳יפ "משימה עודכנה: משימה" נראה כמו הצלחה —
//   המשתמש חושב שאטלס עדכן משהו שלא קיים. (ההבדל היחיד: אין כפתור "ביטול".)
test.fixme('פקודה שנכשלה מסומנת בצ׳יפ כ"לא בוצע"', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'b-pt', op: 'patchTask', taskId: 'no-such', patch: { status: 'done' } }])])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.cmd').first()).toBeVisible({ timeout: 15_000 })
  await expect(A.page.locator('.cmd').first()).toContainText(/לא בוצע|נכשל/)
})

test.describe('הודעות שמפילות את המסך', () => {
  // FIXME (critical): dayOf(at) ב-Atlas.tsx עושה at.slice(0, 10) כשהתאריך לא ניתן לפענוח —
  //   at חסר / null / מספר → TypeError בזמן רינדור → כל האפליקציה מסך לבן (React unmount).
  //   גם ההודעה השנייה נפגעת: showDate משווה ל-messages[i-1].at.
  test.fixme('הודעה בלי at (או at מספרי) לא מפילה את המסך', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [
      { id: 'no-at', from: 'atlas', text: 'בלי זמן' },
      { id: 'epoch', at: Date.now(), from: 'atlas', text: 'זמן מספרי' },
      atlasMsg('ok', minutesAgo(1), [], { text: 'תקינה' }),
    ])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true })
    await waitSynced(A.page)
    await openAtlas(A.page)
    await expect(A.page.locator('.bubble.atlas', { hasText: 'תקינה' })).toBeVisible({ timeout: 15_000 })
    await expect(A.page.locator('.bubble.atlas', { hasText: 'בלי זמן' })).toBeVisible()
    await expect(A.page.getByRole('button', { name: 'היום', exact: true }).first()).toBeVisible()
  })

  // FIXME (critical): describeCommand → default מחזיר את c.op עצמו; אובייקט → "Objects are not valid as a
  //   React child" → מסך לבן. אותו דבר ל-text שאינו מחרוזת (Bubble מרנדר {m.text}).
  test.fixme('op שאינו מחרוזת / text שאינו מחרוזת — מוצגים כטקסט, לא מפילים', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [
      atlasMsg('obj-op', minutesAgo(3), [{ id: 'c-obj', op: { $gt: 1 } }], { text: 'פקודה עם op אובייקט' }),
      atlasMsg('obj-text', minutesAgo(2), [], { text: { html: '<b>x</b>' } }),
      atlasMsg('ok', minutesAgo(1), [], { text: 'תקינה' }),
    ])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
    await waitSynced(A.page)
    await openAtlas(A.page)
    await expect(A.page.locator('.bubble.atlas', { hasText: 'תקינה' })).toBeVisible({ timeout: 15_000 })
    await expect(A.page.locator('.bubble.atlas', { hasText: 'פקודה עם op אובייקט' })).toBeVisible()
  })

  // FIXME (major): null אחד ב-messages → mergeThread זורק → "לא הצלחתי לקרוא את אטלס" — כל השיחה
  //   נעלמת (גם הודעות תקינות) ושום פקודה לא מבוצעת עד שהסוכן ישכתב את הקובץ.
  test.fixme('null בתוך messages — ההודעות התקינות עדיין מוצגות והפקודות מבוצעות', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [null, atlasMsg('ok', minutesAgo(1), [{ id: 'c-ok', op: 'addTask', task: { title: 'אחרי null', due: today } }], { text: 'תקינה' })])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true })
    await waitSynced(A.page)
    await openAtlas(A.page)
    await expect(A.page.locator('.bubble.atlas', { hasText: 'תקינה' })).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => (await readState(A.page)).tasks.some((t) => t.title === 'אחרי null')).toBe(true)
  })

  test('התנהגות נוכחית: null ב-messages → הודעת שגיאה, השיחה ריקה, שום פקודה לא בוצעה', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [null, atlasMsg('ok', minutesAgo(1), [{ id: 'c-ok', op: 'addTask', task: { title: 'אחרי null', due: today } }], { text: 'תקינה' })])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true })
    await waitSynced(A.page)
    await openAtlas(A.page)
    await expect(A.page.locator('.alert', { hasText: 'לא הצלחתי לקרוא את אטלס' })).toBeVisible({ timeout: 15_000 })
    await expect(A.page.locator('.bubble.atlas')).toHaveCount(0)
    expect((await readState(A.page)).tasks.some((t) => t.title === 'אחרי null')).toBe(false)
  })
})

test.describe('רשומות פגומות שנכנסות למצב', () => {
  // FIXME (critical): addRule עם days שאינו מערך נכנס למצב (ruleMatches לא זורק על מחרוזת) —
  //   מסך ההגדרות עושה r.days.map → TypeError → מסך לבן. ברענון sanitize() זורק את הכלל — עד אז ההגדרות לא נגישות.
  test.fixme('addRule עם days: "abc" לא מפיל את ההגדרות', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'b-days', op: 'addRule', rule: { title: 'ימים מחרוזת', days: 'abc', start: '10:00', end: '11:00' } }])])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
    await waitSynced(A.page)
    await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 15_000 }).toBe(1)
    await gotoSettings(A.page)
    await expect(A.page.getByText('סנכרון בין מכשירים')).toBeVisible()
  })

  // FIXME (major): addTask בלי title נכנס למצב; מסכים שעושים t.title.length / t.title.trim() קורסים
  //   (היום — רשימת "לבחור להיום"; סקירה; פרויקטים — עריכה).
  test.fixme('addTask בלי title לא מפיל את "היום" ו"סקירה"', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [
      { id: 'b-notitle', op: 'addTask', task: { due: today, trackId: 'trk-study', critical: true } },
      { id: 'b-notitle-2', op: 'addTask', task: { trackId: 'trk-study' } },
    ])])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
    await waitSynced(A.page)
    await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 15_000 }).toBe(2)
    await gotoTab(A.page, 'סקירה')
    await gotoTab(A.page, 'פרויקטים')
    await A.page.getByRole('button', { name: 'הכל', exact: true }).click()
    await gotoTab(A.page, 'היום')
    await sleep(500)
    expect((await readState(A.page)).tasks.filter((t) => typeof t.title !== 'string')).toEqual([])
  })

  // FIXME (major): setSettings עם name שאינו מחרוזת נכנס להגדרות; כל מקום שמרנדר {settings.name} קורס.
  test.fixme('setSettings עם name אובייקט לא נכנס ולא מפיל', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'b-name', op: 'setSettings', patch: { name: { evil: true }, tokenMinutes: 0, reviewDow: 9 } }])])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
    await waitSynced(A.page)
    await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 15_000 }).toBe(1)
    await gotoSettings(A.page)
    await gotoTab(A.page, 'היום')
    await gotoTab(A.page, 'סקירה')
    const s = await readState(A.page)
    expect(typeof s.settings.name).toBe('string')
    expect(s.settings.tokenMinutes).toBeGreaterThan(0)
  })

  test('addEvent בלי date — לא מוצג בשום מקום, לא מפיל, ונזרק ברענון (התנהגות נוכחית)', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [
      { id: 'b-nodate', op: 'addEvent', event: { title: 'אירוע בלי תאריך', start: '10:00', end: '11:00' } },
      { id: 'b-baddate', op: 'addEvent', event: { title: 'אירוע תאריך זבל', date: 'מחר', start: '10:00', end: '11:00' } },
    ])])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [CMD_FAIL] })
    await waitSynced(A.page)
    await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 15_000 }).toBe(2)
    // FIXME (minor): הרשומה נכנסת למצב (ומסונכרנת למחסן) בלי תאריך — sanitize זורק אותה רק בטעינה הבאה
    const s = await readState(A.page)
    expect(s.events.filter((e) => e.title.startsWith('אירוע ')).length).toBe(2)
    await gotoTab(A.page, 'יומן')
    await gotoTab(A.page, 'היום')
    await expect(A.page.getByText('אירוע בלי תאריך')).toHaveCount(0)
    await gotoTab(A.page, 'סקירה')
    await sleep(300)
  })
})

test.describe('עומס', () => {
  test('300 פקודות בתשובה אחת — 300 צ׳יפים, כולן מבוצעות, המסך מגיב', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    const cmds = []
    for (let i = 0; i < 300; i++) cmds.push({ id: `m-${i}`, op: 'addTask', task: { title: `משימה ${i}`, due: today, trackId: 'trk-life' } })
    await writeThread(fake, ai, [atlasMsg('big', minutesAgo(1), cmds, { text: 'שלוש מאות' })])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true })
    await waitSynced(A.page)
    const t0 = Date.now()
    await openAtlas(A.page)
    await expect(A.page.locator('.cmd')).toHaveCount(300, { timeout: 20_000 })
    await expect.poll(async () => Object.keys((await readState(A.page)).atlasApplied ?? {}).length, { timeout: 20_000 }).toBe(300)
    console.log(`[atlas2] 300 commands applied+rendered in ${Date.now() - t0}ms`)
    expect((await readState(A.page)).tasks.filter((t) => t.id.startsWith('t-m-'))).toHaveLength(300)
    // המסך עדיין מגיב — כתיבה בתיבה
    await A.page.getByPlaceholder('כתוב לאטלס…').fill('עדיין חי')
    await expect(A.page.getByPlaceholder('כתוב לאטלס…')).toHaveValue('עדיין חי')
    await gotoTab(A.page, 'היום')
    await expect(A.page.getByText('משימה 0', { exact: true }).first()).toBeVisible()
    await assertNoHorizontalOverflow(A.page, '.app')
  })

  test('הודעה של 200 KB — מוצגת, בלי גלילה אופקית, והשיחה נשמרת בזיכרון', async ({ fake, key, openDevice }) => {
    const ai = await seedCloud(fake, key)
    const text = ('מילה ארוכה מאוד '.repeat(64) + '\n').repeat(200)
    expect(text.length).toBeGreaterThan(200 * 1024)
    await writeThread(fake, ai, [atlasMsg('long', minutesAgo(1), [], { text })])
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true })
    await waitSynced(A.page)
    await openAtlas(A.page)
    const bubble = A.page.locator('.bubble.atlas .bubble-text')
    await expect(bubble).toBeVisible({ timeout: 15_000 })
    expect((await bubble.textContent())?.length).toBe(text.length)
    await assertNoHorizontalOverflow(A.page)
    expect((await readAtlasCache(A.page)).messages[0].text.length).toBe(text.length)
  })
})
