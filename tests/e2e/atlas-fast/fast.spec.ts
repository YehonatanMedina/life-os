// ---------------------------------------------------------------------------
// אטלס — המסלול המהיר: תשובה תוך שניות מהאפליקציה (Claude מזויף), פקודות,
// זיכרון, כתיבה ל-thread.json, כשלים, מכשיר שני, רענון.
// ---------------------------------------------------------------------------
import { test, expect, readState, readAtlasCache, waitSynced, gotoTab, sleep } from '../cloud/fixtures'
import { openAtlas, atlasMsg, minutesAgo } from '../atlas2/helpers'
import { TEST_API_KEY, atlasBubbles, bubbles, fastState, repoMemory, repoThread, say, seedFast, settled } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)

const NOISE = /status of 404/

test('הודעה רגילה נענית תוך שניות, בזרימה, בלי Issue; השיחה נכתבת ל-thread.json מוצפן', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  claude.reply({ text: 'שלום. יש לך היום 3 משימות פתוחות ואימון בערב. מה קודם?' })
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.chat-empty')).toContainText('עונה תוך שניות')

  const t0 = Date.now()
  await say(A.page, 'שלום')
  await expect(atlasBubbles(A.page).last()).toContainText('מה קודם?', { timeout: 8_000 })
  const elapsed = Date.now() - t0
  await settled(A.page)
  expect(elapsed, 'תשובה מהירה — לא דקות').toBeLessThan(6_000)

  // אין Issue, אין "אטלס חושב", ההודעה שלו לא ממתינה
  expect(fake.issues).toHaveLength(0)
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)
  await expect(bubbles(A.page)).toHaveCount(2)
  const cache = await readAtlasCache(A.page)
  expect(cache.messages.map((m: any) => [m.from, m.lane, !!m.pending])).toEqual([['user', 'fast', false], ['atlas', 'fast', false]])

  // מה נשלח ל-Claude: המודל, המפתח מההגדרות, 3 בלוקי מערכת (2 במטמון), הזרמה
  const req = claude.last('A')!
  expect(req.model).toBe('claude-sonnet-5')
  expect(req.stream).toBe(true)
  expect(req.headers['x-api-key']).toBe(TEST_API_KEY)
  expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(req.system.map((b) => b.cached)).toEqual([true, true, false])
  expect(req.system[2].text).toContain('משימה קיימת מהזרע')
  expect(req.messages).toEqual([{ role: 'user', content: 'שלום' }])

  // thread.json במאגר: שתי ההודעות, מסומנות כמסלול מהיר, בלי דגלים מקומיים
  await expect.poll(async () => (await repoThread(fake, ai)).length, { timeout: 10_000 }).toBe(2)
  const th = await repoThread(fake, ai)
  expect(th[0]).toMatchObject({ from: 'user', text: 'שלום', lane: 'fast' })
  expect(th[1]).toMatchObject({ from: 'atlas', lane: 'fast', replyTo: th[0].id })
  expect(th[1].text).toContain('מה קודם?')
  expect('pending' in th[0] || 'streaming' in th[1]).toBe(false)
  expect(fake.writes.filter((w) => w.name === 'thread.json')).toHaveLength(1)
})

test('פקודות מהמסלול המהיר מבוצעות מיד עם ביטול; זיכרון נכתב ל-memory.json ונכנס לבקשה הבאה', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)

  claude.reply({
    text: 'הוספתי. מחר ב-16:00, שעה.',
    block: {
      commands: [
        { op: 'addEvent', event: { title: 'רופא שיניים מהיר', date: '2026-12-01', start: '16:00', end: '17:00', allDay: false, kind: 'personal' } },
        { op: 'addTask', task: { title: 'להביא כרטיס קופת חולים', due: '2026-12-01' } },
      ],
      escalate: null,
      memory: 'רופא השיניים שלו בתל אביב, מעדיף אחר הצהריים',
    },
  })
  await say(A.page, 'קבעתי רופא שיניים ב-1.12 ב-16:00, שעה')
  await settled(A.page)
  // הבלוק לא מוצג; הצ׳יפים כן, עם ביטול
  await expect(atlasBubbles(A.page).last().locator('.bubble-text')).toHaveText('הוספתי. מחר ב-16:00, שעה.')
  await expect(atlasBubbles(A.page).last().locator('.cmd')).toHaveCount(2)
  await expect(atlasBubbles(A.page).last().locator('.cmd').getByRole('button', { name: 'ביטול' })).toHaveCount(2)
  await expect.poll(async () => {
    const s = await readState(A.page)
    return [s.events.some((e) => e.title === 'רופא שיניים מהיר' && !e.deleted), s.tasks.some((t) => t.title === 'להביא כרטיס קופת חולים' && !t.deleted)]
  }).toEqual([true, true])
  // מזהי הפקודות נגזרים מהמסלול המהיר ונרשמים כמבוצעים
  const s1 = await readState(A.page)
  expect(Object.keys(s1.atlasApplied ?? {}).every((k) => k.startsWith('f-'))).toBe(true)

  // הזיכרון נכתב, ומופיע בבלוק המערכת השני של הבקשה הבאה
  await expect.poll(async () => repoMemory(fake, ai), { timeout: 10_000 }).toContain('רופא השיניים שלו בתל אביב')
  const mem = await repoMemory(fake, ai)
  expect(mem).toMatch(/^\[\d{1,2}\.\d{1,2} מהיר\] /)
  claude.reply({ text: 'כן, כתוב לי.' })
  await say(A.page, 'זוכר איפה הרופא?')
  await settled(A.page)
  expect(claude.last('A')!.system[1].text).toContain('רופא השיניים שלו בתל אביב')
  // השיחה הקודמת נכנסת כתורות, כולל מה שבוצע
  const msgs = claude.last('A')!.messages
  expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  expect(msgs[1].content).toContain('[פעולות שבוצעו:')

  // ביטול מהצ׳יפ מוחק את האירוע
  await atlasBubbles(A.page).nth(0).locator('.cmd').first().getByRole('button', { name: 'ביטול' }).click()
  await expect.poll(async () => (await readState(A.page)).events.find((e) => e.title === 'רופא שיניים מהיר')?.deleted).toBe(true)
})

test('כשל של Claude: ההודעה מסומנת "לא נשלח" עם הסבר בעברית, "שלח שוב" מנסה שוב במסלול המהיר', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE, /status of (401|529)/] })
  await waitSynced(A.page)
  await openAtlas(A.page)

  claude.reply({ status: 529, errorMessage: 'Overloaded' })
  await say(A.page, 'מה המצב?')
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(1, { timeout: 8_000 })
  await expect(A.page.locator('.card.rail.alert')).toContainText('עמוס כרגע')
  await expect(atlasBubbles(A.page)).toHaveCount(0)
  expect(fake.issues).toHaveLength(0)

  claude.reply({ text: 'עכשיו כן.' })
  await A.page.getByRole('button', { name: 'שלח שוב' }).click()
  await settled(A.page)
  await expect(atlasBubbles(A.page).last()).toContainText('עכשיו כן.')
  await expect(A.page.locator('.bubble.failed')).toHaveCount(0)
  expect(claude.requests.filter((r) => r.tag === 'A')).toHaveLength(2)

  // מפתח שגוי — הודעה שמכוונת להגדרות
  claude.reply({ status: 401, errorMessage: 'invalid x-api-key' })
  await say(A.page, 'עוד שאלה')
  await expect(A.page.locator('.card.rail.alert')).toContainText('מפתח ה-API לא תקין', { timeout: 8_000 })
})

test('בלי מפתח API הכל הולך למסלול העמוק, כמו קודם', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key, null)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai, null), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.chat-empty')).toContainText('המסלול המהיר כבוי')
  await expect(A.page.getByRole('button', { name: 'משימה גדולה' })).toHaveCount(0)
  await say(A.page, 'שלום')
  await expect.poll(() => fake.issues.length, { timeout: 8_000 }).toBe(1)
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  expect(claude.requests).toHaveLength(0)
})

test('מכשיר שני רואה את השיחה המהירה דרך thread.json; רענון שומר אותה; הודעה עמוקה קודמת לא נפגעת', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  // שיחה קודמת מהמסלול העמוק כבר במאגר
  fake.setRepoFile('thread.json', await (await import('../cloud/crypto')).encryptJSON({ messages: [
    { id: 'u-old', at: minutesAgo(30), from: 'user', text: 'שאלה ישנה' },
    atlasMsg('a-old', minutesAgo(28), [], { text: 'תשובה ישנה מהעמוק', replyTo: 'u-old' }),
  ] }, ai))
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(bubbles(A.page)).toHaveCount(2, { timeout: 15_000 })

  claude.reply({ text: 'תשובה מהירה חדשה.' })
  await say(A.page, 'ועכשיו?')
  await settled(A.page)
  await expect(bubbles(A.page)).toHaveCount(4)
  await expect.poll(async () => (await repoThread(fake, ai)).length, { timeout: 10_000 }).toBe(4)
  const th = await repoThread(fake, ai)
  expect(th.map((m) => m.id)).toEqual(['u-old', 'a-old', th[2].id, th[3].id])

  // רענון — השיחה נשארת (מטמון), ואז גם בלי מטמון (מהמאגר)
  ;(A.page as any).__expectReload = true
  await A.page.reload()
  await openAtlas(A.page)
  await expect(bubbles(A.page)).toHaveCount(4, { timeout: 15_000 })
  await A.page.evaluate(() => localStorage.removeItem('life-os-atlas-cache'))
  await A.page.reload()
  ;(A.page as any).__expectReload = false
  await openAtlas(A.page)
  await expect(bubbles(A.page)).toHaveCount(4, { timeout: 15_000 })
  await expect(atlasBubbles(A.page).last()).toContainText('תשובה מהירה חדשה.')

  // מכשיר B — הקשר נפרד, אותו מאגר
  const B = await openDevice({ tag: 'B', state: fastState('dB', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(B.page)
  await openAtlas(B.page)
  await expect(bubbles(B.page)).toHaveCount(4, { timeout: 15_000 })
  await expect(atlasBubbles(B.page).last()).toContainText('תשובה מהירה חדשה.')
  expect(claude.requests.filter((r) => r.tag === 'B')).toHaveLength(0)
})

test('שיחה ארוכה: 30 תורות — כל תשובה תוך שניות, השיחה במאגר מוגבלת, הבקשה מוגבלת ל-16 הודעות, המסך לא גולש', async ({ fake, claude, key, openDevice }) => {
  test.setTimeout(180_000)
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  const times: number[] = []
  for (let i = 1; i <= 30; i++) {
    claude.reply({ text: `תשובה ${i}.`, block: i % 10 === 0 ? { commands: [{ op: 'addTask', task: { title: `משימה מסבב ${i}` } }], escalate: null, memory: `סבב ${i}` } : undefined })
    const t0 = Date.now()
    await say(A.page, `הודעה ${i}`)
    await expect(atlasBubbles(A.page).last()).toContainText(`תשובה ${i}.`, { timeout: 8_000 })
    times.push(Date.now() - t0)
    await settled(A.page)
  }
  expect(Math.max(...times), 'הבועה מופיעה תוך שניות גם בסוף שיחה ארוכה').toBeLessThan(6_000)
  const req = claude.last('A')!
  expect(req.messages.length).toBeLessThanOrEqual(17)
  expect(req.messages[req.messages.length - 1].role).toBe('user')
  await expect(bubbles(A.page)).toHaveCount(60)
  await expect.poll(async () => (await repoThread(fake, ai)).length, { timeout: 15_000 }).toBe(60)
  expect((await readState(A.page)).tasks.filter((t) => t.title.startsWith('משימה מסבב')).length).toBe(3)
  const mem = await repoMemory(fake, ai)
  expect(mem.split('\n')).toHaveLength(3)
  // הזרימה לא השאירה כפילויות או בועות תקועות
  const cache = await readAtlasCache(A.page)
  expect(cache.messages.filter((m: any) => m.streaming || m.pending)).toHaveLength(0)
  expect(new Set(cache.messages.map((m: any) => m.id)).size).toBe(cache.messages.length)
  const over = await A.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  expect(over).toBe(false)
  await gotoTab(A.page, 'היום')
  await sleep(300)
})
