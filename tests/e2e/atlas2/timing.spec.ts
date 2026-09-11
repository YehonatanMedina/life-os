// ---------------------------------------------------------------------------
// אטלס סבב 2 — תזמון המשיכה, נמדד עם page.clock:
//   רגיל: משיכה ראשונה אחרי 2.5 שניות, ואז כל 5 דקות.
//   אחרי שליחה: מיד, ואז כל 10 שניות עד שהתשובה מגיעה.
//   ברקע: רק כשמחכים לתשובה.
//   ETag: תשובה שכבר נמשכה חוזרת 304 ולא מבוצעת שוב.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { test, expect, readState, readAtlasCache, waitSynced, reload, sleep, quiet } from '../cloud/fixtures'
import { baseState } from '../cloud/state'
import type { FakeGithub } from '../cloud/fakeGithub'
import { seedCloud, writeThread, openAtlas, composer, atlasMsg, userMsg, advance, threadGets, today } from './helpers'
import { decryptJSON } from '../cloud/crypto'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)
const ALLOW = [/status of 404/]

/** מכשיר עם שעון מזויף שמותקן לפני שהאפליקציה נטענת */
async function clockedDevice(openDevice: any, opts: { tag: string; state: any }) {
  const D = await openDevice({ ...opts, url: 'about:blank', login: true, allowConsole: ALLOW })
  await D.page.clock.install({ time: new Date() })
  await reload(D.page, '/')
  return D
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

const status = (fake: FakeGithub, tag: string) => threadGets(fake, tag).map((r) => r.status)

test('קצב: 2.5 שניות ואז 5 דקות; אחרי שליחה — מיד ואז כל 10 שניות; אחרי התשובה — האם המהיר נפסק?', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await clockedDevice(openDevice, { tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }) })
  await advance(A.page, 3_000, 1_000)
  await waitSynced(A.page)
  await advance(A.page, 3_000, 1_000)
  expect(threadGets(fake, 'A').length, 'משיכה ראשונה אחרי 2.5 שניות').toBe(1)
  // דקה — אין משיכה נוספת (לא מחכים לתשובה, החלון גלוי)
  await advance(A.page, 60_000)
  expect(threadGets(fake, 'A').length).toBe(1)
  // 5 דקות — משיכה שנייה
  await advance(A.page, 4 * 60_000 + 10_000)
  expect(threadGets(fake, 'A').length).toBe(2)

  // שליחה → מיד + כל 10 שניות
  await openAtlas(A.page) // כניסה למסך = משיכה מיידית
  await advance(A.page, 500, 500)
  const base = threadGets(fake, 'A').length
  await composer(A.page).fill('שאלה')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect.poll(() => fake.issues.length).toBe(1)
  await advance(A.page, 1_000, 500)
  expect(threadGets(fake, 'A').length, 'משיכה מיד אחרי שליחה').toBe(base + 1)
  await advance(A.page, 60_000)
  const fast = threadGets(fake, 'A').length - base - 1
  console.log(`[atlas2] while awaiting: ${fast} polls in 60s`)
  expect(fast).toBeGreaterThanOrEqual(5)
  expect(fast).toBeLessThanOrEqual(7)

  // התשובה נוחתת
  const issueBody = await decryptJSON(fake.issues[0].body, ai)
  await writeThread(fake, ai, [
    userMsg(issueBody.id, issueBody.at, issueBody.text),
    atlasMsg('a1', new Date().toISOString(), [{ id: 'c1', op: 'addTask', task: { title: 'מהתשובה', due: today } }], { replyTo: issueBody.id, text: 'הנה' }),
  ])
  await advance(A.page, 12_000)
  await expect(A.page.locator('.bubble.atlas', { hasText: 'הנה' })).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)
  await expect.poll(async () => (await readAtlasCache(A.page)).messages.some((m: any) => m.pending)).toBe(false)

  // אחרי התשובה: 60 שניות — כמה משיכות?
  const afterReply = threadGets(fake, 'A').length
  await advance(A.page, 60_000)
  const after = threadGets(fake, 'A').length - afterReply
  console.log(`[atlas2] after reply: ${after} polls in 60s (fastUntil keeps 10s cadence for 15 min after send)`)
  // FIXME (minor): fastUntil = שליחה + 15 דקות, לא מתאפס כשהתשובה מגיעה — עוד ~90 משיכות (304) בחינם.
  // כשהטלאי ייכנס: expect(after).toBe(0)
  expect(after).toBeLessThanOrEqual(7)

  // 304: הכל אחרי המשיכה שהביאה את התשובה הוא 304, ושום דבר לא מבוצע שוב
  const codes = status(fake, 'A')
  const lastOk = codes.lastIndexOf(200)
  expect(codes.slice(lastOk + 1).every((c) => c === 304)).toBe(true)
  expect(codes.slice(lastOk + 1).length).toBeGreaterThanOrEqual(5)
  const s = await readState(A.page)
  expect(s.tasks.filter((t) => t.title === 'מהתשובה')).toHaveLength(1)
  expect(Object.keys(s.atlasApplied ?? {})).toEqual(['c1'])
  await quiet(fake, 2_000, 10_000)
})

test('ברקע: כשלא מחכים — אין משיכות; כשמחכים — כל 10 שניות; התשובה מגיעה ברקע ומחכה מוכנה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await clockedDevice(openDevice, { tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }) })
  await advance(A.page, 3_000, 1_000)
  await waitSynced(A.page)
  await advance(A.page, 3_000, 1_000)
  expect(threadGets(fake, 'A').length).toBe(1)

  await setHidden(A.page, true)
  await advance(A.page, 6 * 60_000, 10_000)
  expect(threadGets(fake, 'A').length, 'ברקע בלי המתנה — אפס משיכות גם אחרי 6 דקות').toBe(1)

  // חזרה למסך → משיכה מיידית
  await setHidden(A.page, false)
  await advance(A.page, 1_000, 500)
  expect(threadGets(fake, 'A').length).toBe(2)

  // שליחה, ואז לרקע
  await openAtlas(A.page)
  await advance(A.page, 500, 500)
  await composer(A.page).fill('שאלה ברקע')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect.poll(() => fake.issues.length).toBe(1)
  await advance(A.page, 1_000, 500)
  await setHidden(A.page, true)
  const n0 = threadGets(fake, 'A').length
  await advance(A.page, 30_000)
  const hiddenPolls = threadGets(fake, 'A').length - n0
  console.log(`[atlas2] hidden while awaiting: ${hiddenPolls} polls in 30s`)
  expect(hiddenPolls).toBeGreaterThanOrEqual(2)
  expect(hiddenPolls).toBeLessThanOrEqual(4)

  // התשובה נוחתת בזמן שברקע — מבוצעת שם
  const body = await decryptJSON(fake.issues[0].body, ai)
  await writeThread(fake, ai, [
    userMsg(body.id, body.at, body.text),
    atlasMsg('a1', new Date().toISOString(), [{ id: 'c-bg', op: 'addTask', task: { title: 'בוצע ברקע', due: today } }], { replyTo: body.id, text: 'ברקע' }),
  ])
  await advance(A.page, 12_000)
  await expect.poll(async () => (await readState(A.page)).tasks.some((t) => t.title === 'בוצע ברקע')).toBe(true)
  expect(await A.page.evaluate(() => document.visibilityState)).toBe('hidden')
  // אחרי התשובה, עדיין ברקע: אין המתנה → אין משיכות
  const n1 = threadGets(fake, 'A').length
  await advance(A.page, 60_000)
  expect(threadGets(fake, 'A').length - n1, 'ברקע אחרי התשובה — אפס').toBe(0)
  await setHidden(A.page, false)
  await expect(A.page.locator('.bubble.atlas', { hasText: 'ברקע' })).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)
})

test('הודעה ממתינה שמעולם לא נענתה — "אטלס חושב…" ומשיכה כל 10 שניות בלי סוף (מתועד)', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await clockedDevice(openDevice, { tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }) })
  await advance(A.page, 3_000, 1_000)
  await waitSynced(A.page)
  await openAtlas(A.page)
  await composer(A.page).fill('שאלה שלא תיענה')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect.poll(() => fake.issues.length).toBe(1)
  await advance(A.page, 20 * 60_000, 30_000) // 20 דקות — מעבר ל-fastUntil
  const n0 = threadGets(fake, 'A').length
  await advance(A.page, 60_000)
  const perMinute = threadGets(fake, 'A').length - n0
  console.log(`[atlas2] unanswered after 20min: ${perMinute} polls/min`)
  await expect(A.page.locator('.bubble.thinking')).toContainText(/לוקח יותר מהרגיל/)
  // FIXME (minor): אין תקרה — 6 משיכות בדקה לנצח (גם ברקע) בגלל הודעה אחת שאבדה אצל הסוכן.
  expect(perMinute).toBeGreaterThanOrEqual(5)
})

test('עדכון thread.json בזמן שהמסך פתוח — מופיע עד 10 שניות; כניסה למסך מושכת מיד', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [atlasMsg('a0', new Date(Date.now() - 60_000).toISOString(), [], { text: 'ראשונה' })])
  const A = await clockedDevice(openDevice, { tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }) })
  await advance(A.page, 3_000, 1_000)
  await waitSynced(A.page)
  await advance(A.page, 3_000, 1_000)
  // הסוכן כותב הודעה יזומה (בלי שאלה שלי) — במסך אחר: לא נמשכת עד 5 דקות
  await writeThread(fake, ai, [atlasMsg('a0', new Date(Date.now() - 60_000).toISOString(), [], { text: 'ראשונה' }), atlasMsg('a1', new Date().toISOString(), [], { text: 'יזומה' })])
  await advance(A.page, 30_000)
  expect((await readAtlasCache(A.page)).messages.map((m: any) => m.id)).toEqual(['a0'])
  // כניסה למסך אטלס — משיכה מיידית
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble.atlas', { hasText: 'יזומה' })).toBeVisible({ timeout: 5_000 })
  await sleep(300)
})
