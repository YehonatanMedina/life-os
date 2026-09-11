// ---------------------------------------------------------------------------
// אטלס סבב 2 — רינדור עוין: <script>, ישויות HTML, תווי היפוך כיוון, אמוג׳י
// ZWJ, שורה של 5,000 תווים בלי רווח — מוצגים כטקסט, בלי הרצה, בלי שבירת פריסה.
// רץ בשני הפרופילים (מחשב וטלפון).
// ---------------------------------------------------------------------------
import { test, expect, waitSynced, gotoTab, readState } from '../cloud/fixtures'
import { baseState } from '../cloud/state'
import { seedCloud, writeThread, writeToday, openAtlas, atlasMsg, userMsg, minutesAgo, today, assertNoHorizontalOverflow } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)
const ALLOW = [/status of 404/]

const SCRIPT = '<script>window.__pwned = 1</script><img src=x onerror="window.__pwned=2"><a href="javascript:window.__pwned=3">קישור</a>'
const ENTITIES = '&lt;b&gt;לא מודגש&lt;/b&gt; &amp;amp; &#x202E;'
const RTL = 'abc ‮def‬ ghi ‏‎؜ end'
const ZWJ = '👨‍👩‍👧‍👦 🏳️‍🌈 👩🏽‍💻 🧑‍🤝‍🧑'
const LONG = 'א'.repeat(2500) + 'x'.repeat(2500)

test('טקסט עוין בהודעות ובצ׳יפים — מוצג כטקסט, לא רץ, הפריסה שלמה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [
    userMsg('u1', minutesAgo(6), SCRIPT),
    atlasMsg('a-script', minutesAgo(5), [
      { id: 'c-script', op: 'addTask', task: { title: SCRIPT, due: today } },
      { id: 'c-long', op: 'addEvent', event: { title: LONG, date: today, start: '20:00', end: '21:00' } },
    ], { text: SCRIPT, replyTo: 'u1' }),
    atlasMsg('a-ent', minutesAgo(4), [], { text: ENTITIES }),
    atlasMsg('a-rtl', minutesAgo(3), [], { text: RTL }),
    atlasMsg('a-zwj', minutesAgo(2), [], { text: ZWJ }),
    atlasMsg('a-long', minutesAgo(1), [], { text: LONG }),
  ])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  const bubbles = A.page.locator('.bubble:not(.thinking)')
  await expect(bubbles).toHaveCount(6, { timeout: 15_000 })

  // כטקסט — התוכן זהה לקלט, ואין אלמנטים שנוצרו ממנו
  const texts = A.page.locator('.bubble-text')
  await expect(texts.nth(0)).toHaveText(SCRIPT)
  await expect(texts.nth(1)).toHaveText(SCRIPT)
  await expect(texts.nth(2)).toHaveText(ENTITIES)
  await expect(texts.nth(3)).toHaveText(RTL)
  await expect(texts.nth(4)).toHaveText(ZWJ)
  await expect(texts.nth(5)).toHaveText(LONG)
  expect(await A.page.locator('.bubble script, .bubble img, .bubble a').count()).toBe(0)
  expect(await A.page.evaluate(() => (window as any).__pwned)).toBeUndefined()
  // הצ׳יפ עם כותרת המשימה העוינת — טקסט
  await expect(A.page.locator('.cmd', { hasText: 'משימה חדשה:' })).toContainText('<script>')
  expect(await A.page.locator('.cmd script, .cmd img, .cmd a').count()).toBe(0)

  // פריסה: שום גלילה אופקית, כל בועה בתוך הרשימה
  await assertNoHorizontalOverflow(A.page)
  const list = await A.page.locator('.chat-list').boundingBox()
  for (let i = 0; i < 6; i++) {
    const b = await bubbles.nth(i).boundingBox()
    expect(b, `bubble ${i} box`).toBeTruthy()
    expect(b!.x, `bubble ${i} left`).toBeGreaterThanOrEqual(list!.x - 1)
    expect(b!.x + b!.width, `bubble ${i} right`).toBeLessThanOrEqual(list!.x + list!.width + 1)
  }
  // הצ׳יפ עם 5,000 תווים לא מרחיב את הבועה מעבר לרשימה
  const cmdLong = await A.page.locator('.cmd', { hasText: 'נוסף ליומן:' }).boundingBox()
  expect(cmdLong!.x + cmdLong!.width).toBeLessThanOrEqual(list!.x + list!.width + 1)
  expect(cmdLong!.x).toBeGreaterThanOrEqual(list!.x - 1)
  // הקומפוזר עדיין נגיש ובגובה סביר
  const comp = await A.page.locator('.composer').boundingBox()
  const vp = A.page.viewportSize()!
  expect(comp!.y + comp!.height).toBeLessThanOrEqual(vp.height + 1)

  // המשימה והאירוע העוינים — במסך היום, כטקסט
  await gotoTab(A.page, 'היום')
  await expect(A.page.locator('.item', { hasText: '<script>' }).first()).toBeVisible()
  expect(await A.page.evaluate(() => (window as any).__pwned)).toBeUndefined()
  await assertNoHorizontalOverflow(A.page, '.app')
  const s = await readState(A.page)
  expect(s.tasks.find((t) => t.id === 't-c-script')?.title).toBe(SCRIPT)
  expect(s.events.find((e) => e.id === 'e-c-long')?.title).toBe(LONG)
  await gotoTab(A.page, 'יומן')
  await assertNoHorizontalOverflow(A.page, '.app')
  expect(await A.page.evaluate(() => (window as any).__pwned)).toBeUndefined()
})

test('פתק הבוקר עם HTML ותווי כיוון — טקסט בכרטיס "היום"', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeToday(fake, ai, { date: today, text: `${SCRIPT}\n${RTL}\n${ZWJ}` })
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  const card = A.page.locator('.atlas-card')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText('<script>')
  expect(await card.locator('script, img, a').count()).toBe(0)
  expect(await A.page.evaluate(() => (window as any).__pwned)).toBeUndefined()
  await assertNoHorizontalOverflow(A.page, '.app')
})

test('מצב כהה: אותו טקסט עוין, אותה פריסה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key, { settings: { ...baseState({ deviceId: 'x' }).settings, theme: 'dark', aiKey: ai } })
  await writeThread(fake, ai, [atlasMsg('a-long', minutesAgo(1), [], { text: LONG }), atlasMsg('a-rtl', minutesAgo(1), [], { text: RTL })])
  const st = baseState({ deviceId: 'dA', aiKey: ai })
  st.settings.theme = 'dark'
  const A = await openDevice({ tag: 'A', state: st, login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble-text')).toHaveCount(2, { timeout: 15_000 })
  expect(await A.page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark')
  await assertNoHorizontalOverflow(A.page)
})
