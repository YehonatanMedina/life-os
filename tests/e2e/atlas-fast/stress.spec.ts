// ---------------------------------------------------------------------------
// אטלס — המסלול המהיר לאורך זמן: שני מכשירים שכותבים במקביל ל-thread.json
// (התנגשות sha), זיכרון שגדל מעבר לתקרה, והודעות מהירות בזמן שהודעה עמוקה ממתינה.
// ---------------------------------------------------------------------------
import { test, expect, readAtlasCache, waitSynced } from '../cloud/fixtures'
import { openAtlas, atlasMsg, writeThread } from '../atlas2/helpers'
import { atlasBubbles, bubbles, fastState, repoMemory, repoThread, say, seedFast, settled } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)

const NOISE = /status of (404|409)/

test('שני מכשירים שולחים הודעות מהירות באותו רגע — התנגשות sha נפתרת, thread.json מכיל את ארבע ההודעות, ושניהם רואים הכל', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  const B = await openDevice({ tag: 'B', state: fastState('dB', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await waitSynced(B.page)
  await openAtlas(A.page)
  await openAtlas(B.page)

  // אותה תשובה לשניהם; הכתיבה למאגר תתנגש — מי שמאחר מקבל 409 ומנסה שוב
  claude.reply({ text: 'תשובה ל-A.', chunkDelayMs: 200 })
  claude.reply({ text: 'תשובה ל-B.', chunkDelayMs: 200 })
  await Promise.all([say(A.page, 'הודעה מ-A'), say(B.page, 'הודעה מ-B')])
  await settled(A.page, 20_000)
  await settled(B.page, 20_000)
  await expect.poll(async () => (await repoThread(fake, ai)).length, { timeout: 20_000 }).toBe(4)
  const th = await repoThread(fake, ai)
  expect(new Set(th.map((m) => m.id)).size).toBe(4)
  expect(th.filter((m) => m.from === 'user').map((m) => m.text).sort()).toEqual(['הודעה מ-A', 'הודעה מ-B'])
  expect(th.filter((m) => m.from === 'atlas').map((m) => m.text).sort()).toEqual(['תשובה ל-A.', 'תשובה ל-B.'])

  // כל מכשיר ממשיך לראות את השיחה שלו מיד, ואת של השני אחרי משיכה (כניסה מחדש למסך)
  await expect(bubbles(A.page)).toHaveCount(2)
  await A.page.getByRole('button', { name: 'היום', exact: true }).filter({ visible: true }).first().click()
  await openAtlas(A.page)
  await expect(bubbles(A.page)).toHaveCount(4, { timeout: 15_000 })
  await B.page.getByRole('button', { name: 'היום', exact: true }).filter({ visible: true }).first().click()
  await openAtlas(B.page)
  await expect(bubbles(B.page)).toHaveCount(4, { timeout: 15_000 })
  // בלי כפילויות אצל אף אחד
  for (const d of [A, B]) {
    const c = await readAtlasCache(d.page)
    expect(new Set(c.messages.map((m: any) => m.id)).size).toBe(c.messages.length)
  }
})

test('הזיכרון שהמסלול המהיר מוסיף לא גדל בלי סוף — נגזם מההתחלה, השורות האחרונות נשמרות', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  for (let i = 1; i <= 26; i++) {
    claude.reply({ text: `סבב ${i}.`, block: { commands: [], escalate: null, memory: `זיכרון ${i} ` + 'א'.repeat(380) } })
    await say(A.page, `הודעה ${i}`)
    await settled(A.page)
  }
  await expect.poll(async () => (await repoMemory(fake, ai)).includes('זיכרון 26 '), { timeout: 15_000 }).toBe(true)
  const mem = await repoMemory(fake, ai)
  expect(mem.length).toBeLessThanOrEqual(8000)
  expect(mem).not.toContain('זיכרון 1 ')
  expect(mem.split('\n').every((l) => /^\[\d{1,2}\.\d{1,2} מהיר\] זיכרון \d+ /.test(l))).toBe(true)
  // מה שנשמר הוא מה שנשלח למודל בבקשה הבאה
  claude.reply({ text: 'כן.' })
  await say(A.page, 'זוכר?')
  await settled(A.page)
  expect(claude.last('A')!.system[1].text).toContain('זיכרון 26 ')
})

test('הודעות מהירות בזמן שהודעה עמוקה ממתינה — לא נשלחות למודל כהיסטוריה, והתשובה העמוקה משתלבת במקומה', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)

  claude.reply({ text: 'מעביר לעמוק.', block: { commands: [], escalate: 'תכנון תקופה', memory: null } })
  await say(A.page, 'תבנה לי תוכנית לחודש')
  await expect.poll(() => fake.issues.length, { timeout: 8_000 }).toBe(1)
  const cache1 = await readAtlasCache(A.page)
  const pendingId = cache1.messages.find((m: any) => m.from === 'user').id

  // בינתיים שאלה קצרה — נענית מהר; ההודעה הממתינה לא נכנסת לתורות של המודל
  claude.reply({ text: 'הריצה מחר ב-7.' })
  await say(A.page, 'מתי הריצה?')
  await expect(atlasBubbles(A.page).last()).toContainText('הריצה מחר ב-7.', { timeout: 8_000 })
  const req = claude.last('A')!
  expect(req.messages.map((m) => m.content).join('\n')).not.toContain('תבנה לי תוכנית לחודש')
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()

  // התשובה העמוקה מגיעה — נכנסת לפי הזמן, ההמתנה נגמרת, אין כפילויות
  const th = await repoThread(fake, ai)
  await writeThread(fake, ai, [
    { id: pendingId, at: cache1.messages[0].at, from: 'user', text: 'תבנה לי תוכנית לחודש' },
    ...th,
    atlasMsg('a-deep', new Date().toISOString(), [], { text: 'הנה התוכנית.', replyTo: pendingId }),
  ])
  await expect(atlasBubbles(A.page).last()).toContainText('הנה התוכנית.', { timeout: 20_000 })
  await settled(A.page, 20_000)
  const c = await readAtlasCache(A.page)
  expect(c.messages.map((m: any) => m.text)).toEqual(['תבנה לי תוכנית לחודש', 'מעביר לעמוק.', 'מתי הריצה?', 'הריצה מחר ב-7.', 'הנה התוכנית.'])
  expect(c.messages.filter((m: any) => m.pending)).toHaveLength(0)
})
