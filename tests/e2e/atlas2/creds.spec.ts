// ---------------------------------------------------------------------------
// אטלס סבב 2 — אישורים: טוקן יש, settings.aiKey אין → הודעת "לא מחובר", שום
// קריאה למאגר של אטלס; המפתח מגיע בסנכרון → המסך נהיה שמיש בלי רענון.
// ---------------------------------------------------------------------------
import { test, expect, readState, waitSynced, sleep } from '../cloud/fixtures'
import { baseState, T1 } from '../cloud/state'
import { encryptJSON, newKey } from '../cloud/crypto'
import { writeThread, openAtlas, composer, atlasMsg, minutesAgo, today } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)
const ALLOW = [/status of 404/]

const atlasCalls = (fake: any, tag: string) => fake.requestsMatching(/life-os-atlas/, tag)

test('טוקן בלי aiKey (גם במחסן) — הודעה, קלט מושבת, ואף בקשה למאגר של אטלס במשך 12 שניות', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const ai = newKey()
  await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'c1', op: 'addTask', task: { title: 'לא אמור להגיע', due: today } }])])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.getByText('אטלס עוד לא מחובר במכשיר הזה.')).toBeVisible()
  await expect(composer(A.page)).toBeDisabled()
  await expect(A.page.getByRole('button', { name: 'שלח' })).toBeDisabled()
  // גם מעבר מסך וחזרה, וגם הזמן — לא מייצרים בקשות
  await A.page.getByRole('button', { name: 'היום', exact: true }).filter({ visible: true }).first().click()
  await sleep(6_000)
  await openAtlas(A.page)
  await sleep(6_000)
  expect(atlasCalls(fake, 'A')).toEqual([])
  expect(fake.requestsMatching(/^GET \/user$/, 'A')).toEqual([])
  expect((await readState(A.page)).tasks.some((t) => t.title === 'לא אמור להגיע')).toBe(false)
  expect((await readState(A.page)).settings.aiKey).toBeUndefined()
})

test('aiKey מגיע מהמחסן בסנכרון — ההודעה נעלמת, הקלט נפתח, המשיכה מתחילה והפקודות מבוצעות — בלי רענון', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  // המחסן: הגדרות חדשות יותר מהמכשיר, עם המפתח
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai, extra: { settingsUpdatedAt: T1 + 60_000 } }), key))
  await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'c1', op: 'addTask', task: { title: 'הגיע אחרי המפתח', due: today } }], { text: 'שלום, עכשיו אני מחובר' })])
  // המחסן איטי — כדי לראות את המסך במצב "לא מחובר" קודם
  fake.hooks.push(({ tag, method, path }) => (tag === 'A' && method === 'GET' && path.startsWith('/gists/') ? { delayMs: 4_000 } : undefined))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), login: true, allowConsole: ALLOW })
  await openAtlas(A.page)
  await expect(A.page.getByText('אטלס עוד לא מחובר במכשיר הזה.')).toBeVisible()
  await expect(composer(A.page)).toBeDisabled()
  expect(atlasCalls(fake, 'A')).toEqual([])

  await waitSynced(A.page, 30_000)
  await expect.poll(async () => (await readState(A.page)).settings.aiKey, { timeout: 15_000 }).toBe(ai)
  await expect(A.page.getByText('אטלס עוד לא מחובר במכשיר הזה.')).toHaveCount(0, { timeout: 10_000 })
  await expect(composer(A.page)).toBeEnabled()
  // המשיכה מתחילה מעצמה (טיק של 5 שניות) והשיחה מופיעה
  await expect(A.page.locator('.bubble.atlas', { hasText: 'עכשיו אני מחובר' })).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => (await readState(A.page)).tasks.some((t) => t.title === 'הגיע אחרי המפתח'), { timeout: 15_000 }).toBe(true)
  expect(atlasCalls(fake, 'A').length).toBeGreaterThan(0)
  // ואפשר לשלוח
  await composer(A.page).fill('תודה')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect.poll(() => fake.issues.length, { timeout: 10_000 }).toBe(1)
})

test('aiKey יש, טוקן אין — "לא מחובר", אין רשת; והמסכים האחרים לא נוגעים באטלס', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  await writeThread(fake, ai, [atlasMsg('a1', minutesAgo(1), [{ id: 'c1', op: 'addTask', task: { title: 'לא', due: today } }])])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), creds: false, allowConsole: ALLOW })
  await openAtlas(A.page)
  await expect(A.page.getByText('אטלס עוד לא מחובר במכשיר הזה.')).toBeVisible()
  await expect(composer(A.page)).toBeDisabled()
  await sleep(6_000)
  expect(fake.requests.filter((r) => r.tag === 'A')).toEqual([])
  expect((await readState(A.page)).tasks.some((t) => t.title === 'לא')).toBe(false)
})

test('טוקן פג (401 מהמאגר של אטלס) — הודעת שגיאה, לא מסך לבן, והסנכרון של המצב לא נפגע', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  await writeThread(fake, ai, [])
  fake.hooks.push(({ tag, path }) => (tag === 'A' && path.includes('life-os-atlas') ? { status: 401 } : undefined))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [/status of 401/] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.alert', { hasText: 'אין גישה למאגר של אטלס' })).toBeVisible({ timeout: 15_000 })
  await expect(composer(A.page)).toBeEnabled()
  await composer(A.page).fill('ניסיון')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect(A.page.locator('.bubble.me.failed')).toBeVisible({ timeout: 10_000 })
  await expect(A.page.locator('.alert', { hasText: 'השליחה נכשלה' })).toBeVisible()
  await expect(A.page.getByRole('button', { name: 'שלח שוב' })).toBeVisible()
})
