// ---------------------------------------------------------------------------
// אטלס סבב 2 — today.json: פתק של אתמול לא מוצג, של היום מוצג בכרטיס, ופתק
// של 2,000 תווים לא שובר את הכרטיס. רץ בשני הפרופילים.
// ---------------------------------------------------------------------------
import { test, expect, waitSynced, readAtlasCache, sleep } from '../cloud/fixtures'
import { baseState, addDaysISO } from '../cloud/state'
import { seedCloud, writeThread, writeToday, composer, today, assertNoHorizontalOverflow } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)
const ALLOW = [/status of 404/]

test('פתק של אתמול — נמשך לזיכרון אבל לא מוצג; פתק של מחר — גם לא', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  await writeToday(fake, ai, { date: addDaysISO(today, -1), text: 'פתק ישן מאתמול', generatedAt: new Date().toISOString() })
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await expect.poll(async () => (await readAtlasCache(A.page))?.today?.text, { timeout: 15_000 }).toBe('פתק ישן מאתמול')
  await expect(A.page.locator('.atlas-card')).toHaveCount(0)
  await expect(A.page.getByText('פתק ישן מאתמול')).toHaveCount(0)
  // מחר (הסוכן הקדים) — גם לא היום
  await writeToday(fake, ai, { date: addDaysISO(today, 1), text: 'פתק של מחר' })
  await composerPoll(A.page)
  await expect.poll(async () => (await readAtlasCache(A.page))?.today?.text, { timeout: 15_000 }).toBe('פתק של מחר')
  await A.page.getByRole('button', { name: 'היום', exact: true }).filter({ visible: true }).first().click()
  await expect(A.page.locator('.atlas-card')).toHaveCount(0)
})

/** כניסה למסך אטלס מפעילה משיכה מיידית */
async function composerPoll(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'אטלס', exact: true }).filter({ visible: true }).first().click()
  await expect(composer(page)).toBeVisible()
  await sleep(800)
}

test('פתק של היום מוצג בכרטיס "אטלס" ב"היום", ולחיצה עליו פותחת את השיחה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  await writeToday(fake, ai, { date: today, text: 'בוקר טוב — היום מבחן, ואחריו לנוח.' })
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  const card = A.page.locator('.atlas-card')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText('הבוקר')
  await expect(card).toContainText('בוקר טוב — היום מבחן, ואחריו לנוח.')
  await card.click()
  await expect(composer(A.page)).toBeVisible()
})

test('פתק של 2,000 תווים (עם שורות ומילים ארוכות) — הכרטיס שלם, בלי גלילה אופקית, הטקסט מלא', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const para = 'היום כדאי להתחיל מהדבר הקשה, ואז לנוח קצת. '
  let text = ''
  while (text.length < 1800) text += para + (text.length % 3 === 0 ? '\n' : '')
  text += 'x'.repeat(200)
  expect(text.length).toBeGreaterThanOrEqual(2000)
  await writeToday(fake, ai, { date: today, text })
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  const card = A.page.locator('.atlas-card')
  await expect(card).toBeVisible({ timeout: 15_000 })
  const shown = await card.locator('.small').first().textContent()
  expect(shown?.length).toBe(text.length)
  await assertNoHorizontalOverflow(A.page, '.app')
  const box = await card.boundingBox()
  const vp = A.page.viewportSize()!
  expect(box!.width).toBeLessThanOrEqual(vp.width)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  // הכרטיס עדיין כפתור אחד לחיץ, ושאר המסך אחריו
  await expect(A.page.getByText('המשימות של היום').first()).toBeAttached()
  await card.click()
  await expect(composer(A.page)).toBeVisible()
})

test('פתק פגום: today.json בלי date / עם date מספרי — נמשך, לא מוצג, לא מפיל', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  await writeToday(fake, ai, { text: 'בלי תאריך' })
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await expect.poll(async () => (await readAtlasCache(A.page))?.today?.text, { timeout: 15_000 }).toBe('בלי תאריך')
  await expect(A.page.locator('.atlas-card')).toHaveCount(0)
  await writeToday(fake, ai, { date: 12345, text: 'תאריך מספרי' })
  await composerPoll(A.page)
  await expect.poll(async () => (await readAtlasCache(A.page))?.today?.text, { timeout: 15_000 }).toBe('תאריך מספרי')
  await A.page.getByRole('button', { name: 'היום', exact: true }).filter({ visible: true }).first().click()
  await expect(A.page.locator('.atlas-card')).toHaveCount(0)
})

test('today.json עם text שאינו מחרוזת — לא מפיל את "היום"', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  await writeToday(fake, ai, { date: today, text: { html: '<b>x</b>' } })
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await expect.poll(async () => JSON.stringify((await readAtlasCache(A.page))?.today?.text ?? null), { timeout: 15_000 }).toContain('html')
  await expect(A.page.getByRole('button', { name: 'אטלס', exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(A.page.getByText('משהו נשבר בטעינה')).toHaveCount(0)
})
