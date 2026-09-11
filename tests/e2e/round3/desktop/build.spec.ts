// ---------------------------------------------------------------------------
// סבב 3 — זיהוי גרסה חדשה. האפליקציה קוראת ./index.html ומשווה את
// <meta name="build"> לשלה. בשרת הפיתוח אין meta כזה (buildId()==='dev' והבדיקה
// מדולגת), ולכן מזריקים אחד לדף דרך page.route ומגישים index.html "מרוחק" אחר.
//  - כרטיס "יש גרסה חדשה" בכל מסך; לחיצה על "עדכון" מרעננת.
//  - רענון אוטומטי בחזרה מרקע (>60 שנ׳) רק כשהכל מסונכרן ואין טיימר — ומה
//    זה עושה לגיליון פתוח עם טקסט שלא נשמר.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { test as desk, expect, readState } from '../../desktop/desk'
import { test as cloud, waitSynced, reload as cloudReload } from '../../cloud/fixtures'
import { baseState, SEED_TASK_TITLE } from '../../cloud/state'
import { go, round3Seed, TASK_A, taskRow, timerCard } from '../helpers'

const ORIGIN = 'http://localhost:5173'
const BUILD_CARD = 'יש גרסה חדשה של האפליקציה.'

/** הדף עצמו נטען עם build=mine; ./index.html שהאפליקציה מושכת עונה build=remote */
async function fakeBuilds(page: Page, mine: string, remote: string) {
  await page.route(`${ORIGIN}/`, async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace('<head>', `<head><meta name="build" content="${mine}" />`)
    await route.fulfill({ response: res, body: html })
  })
  await page.route(`${ORIGIN}/index.html`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta name="build" content="${remote}" /></head><body></body></html>` }),
  )
}

async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((st) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => st === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

/** האם הדף נטען מחדש בתוך ms */
function reloadWithin(page: Page, ms: number): Promise<boolean> {
  return page.waitForEvent('load', { timeout: ms }).then(() => true, () => false)
}

/** ה-HMR של Vite מתלונן כשהדף מוגש דרך route.fulfill — אזהרת שרת פיתוח, לא באג של האפליקציה */
const dropVite = (errors: string[]) => errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('[vite]')))

desk.describe('בלי ענן (desk)', () => {
  desk.use({ seed: round3Seed })

  desk('גרסה חדשה: הכרטיס מופיע בכל מסך, ההגדרות מציגות את הבנייה שלי, ו"עדכון" מרענן', async ({ app, consoleErrors }) => {
    desk.info().annotations.push({ type: 'note', description: 'vite HMR warnings are filtered' })
    await fakeBuilds(app, 'A', 'B')
    await app.reload()
    const card = app.locator('.card', { hasText: BUILD_CARD })
    await expect(card).toBeVisible()
    for (const v of ['אטלס', 'יומן', 'פרויקטים', 'סקירה', 'הגדרות'] as const) {
      await go(app, v)
      await expect(card, `build card on ${v}`).toBeVisible()
    }
    await expect(app.locator('.card', { hasText: 'סנכרון בין מכשירים' })).toContainText('A')
    const reloaded = reloadWithin(app, 5_000)
    await card.getByRole('button', { name: 'עדכון' }).click()
    expect(await reloaded).toBe(true)
    dropVite(consoleErrors)
  })

  desk('אותה גרסה: אין כרטיס', async ({ app, consoleErrors }) => {
    await fakeBuilds(app, 'A', 'A')
    await app.reload()
    await expect(app.getByRole('button', { name: 'היום', exact: true }).first()).toBeVisible()
    await app.waitForTimeout(600)
    await expect(app.locator('.card', { hasText: BUILD_CARD })).toHaveCount(0)
    dropVite(consoleErrors)
  })

  desk('בלי ענן: חזרה מרקע של יותר מדקה מרעננת לבד (אין מה לסנכרן, אין טיימר)', async ({ app, consoleErrors }) => {
    await fakeBuilds(app, 'A', 'B')
    await app.reload()
    await expect(app.locator('.card', { hasText: BUILD_CARD })).toBeVisible()
    await setVisibility(app, 'hidden')
    await app.clock.runFor(61_000)
    const reloaded = reloadWithin(app, 5_000)
    await setVisibility(app, 'visible')
    expect(await reloaded).toBe(true)
    dropVite(consoleErrors)
  })
})

cloud.describe('עם ענן (מסונכרן)', () => {
  cloud.setTimeout(90_000)

  cloud('חזרה מרקע כשהכל מסונכרן: גיליון פתוח עם טקסט שלא נשמר דוחה את הרענון; אחרי הסגירה הוא קורה', async ({ fake, key, openDevice }) => {
    // הטעינה הראשונה בלי meta (buildId 'dev' — הבדיקה מדולגת); מזריקים ומרעננים
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/\[vite\]/] })
    await fakeBuilds(A.page, 'A', 'B')
    await cloudReload(A.page)
    await waitSynced(A.page)
    await expect(A.page.locator('.card', { hasText: BUILD_CARD })).toBeVisible()

    // גיליון פתוח עם טקסט שטרם נשמר
    await taskRow(A.page, SEED_TASK_TITLE).locator('button.txt').click()
    const sheet = A.page.getByRole('dialog', { name: 'משימה' })
    await expect(sheet).toBeVisible()
    const title = sheet.locator('input.input').first()
    await title.fill(SEED_TASK_TITLE + ' — עריכה שלא נשמרה')

    await setVisibility(A.page, 'hidden')
    await A.page.evaluate(() => {
      const o = Date.now
      Date.now = () => o() + 61_000
    })
    // גיליון פתוח — הרענון נדחה, הטקסט נשאר, הכרטיס עדיין מציע עדכון
    ;(A.page as any).__expectReload = false
    const reloaded = reloadWithin(A.page, 4_000)
    await setVisibility(A.page, 'visible')
    expect(await reloaded).toBe(false)
    await expect(sheet).toBeVisible()
    await expect(title).toHaveValue(SEED_TASK_TITLE + ' — עריכה שלא נשמרה')
    await expect(A.page.locator('.card', { hasText: BUILD_CARD })).toBeVisible()

    // סגרנו בלי לשמור → בחזרה הבאה מרקע הרענון האוטומטי קורה
    await A.page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await setVisibility(A.page, 'hidden')
    await A.page.evaluate(() => {
      const o = Date.now
      Date.now = () => o() + 61_000
    })
    ;(A.page as any).__expectReload = true
    const reloaded2 = reloadWithin(A.page, 6_000)
    await setVisibility(A.page, 'visible')
    const did = await reloaded2
    ;(A.page as any).__expectReload = false
    expect(did).toBe(true)
  })

  cloud('חזרה מרקע כשהכל מסונכרן ואין גיליון: רענון אוטומטי בלי לאבד כלום', async ({ fake, key, openDevice }) => {
    // הטעינה הראשונה בלי meta (buildId 'dev' — הבדיקה מדולגת); מזריקים ומרעננים
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/\[vite\]/] })
    await fakeBuilds(A.page, 'A', 'B')
    await cloudReload(A.page)
    await waitSynced(A.page)
    await expect(A.page.locator('.card', { hasText: BUILD_CARD })).toBeVisible()
    await setVisibility(A.page, 'hidden')
    await A.page.evaluate(() => {
      const o = Date.now
      Date.now = () => o() + 61_000
    })
    ;(A.page as any).__expectReload = true
    const reloaded = reloadWithin(A.page, 6_000)
    await setVisibility(A.page, 'visible')
    expect(await reloaded).toBe(true)
    ;(A.page as any).__expectReload = false
    await waitSynced(A.page)
    await expect(taskRow(A.page, SEED_TASK_TITLE)).toBeVisible()
    expect(fake.patches.length).toBeLessThanOrEqual(1)
  })

  cloud('טיימר רץ: חזרה מרקע לא מרעננת, הכרטיס נשאר, והטיימר ממשיך', async ({ openDevice }) => {
    // הטעינה הראשונה בלי meta (buildId 'dev' — הבדיקה מדולגת); מזריקים ומרעננים
    const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/\[vite\]/] })
    await fakeBuilds(A.page, 'A', 'B')
    await cloudReload(A.page)
    await waitSynced(A.page)
    await timerCard(A.page).locator('.tag').first().click()
    await expect(timerCard(A.page)).toHaveClass(/live/)
    await waitSynced(A.page)
    await setVisibility(A.page, 'hidden')
    await A.page.evaluate(() => {
      const o = Date.now
      Date.now = () => o() + 61_000
    })
    const reloaded = reloadWithin(A.page, 4_000)
    await setVisibility(A.page, 'visible')
    expect(await reloaded).toBe(false)
    await A.page.evaluate(() => {
      const o = Date.now
      Date.now = () => o() - 61_000
    })
    await expect(A.page.locator('.card', { hasText: BUILD_CARD })).toBeVisible()
    await expect(timerCard(A.page)).toHaveClass(/live/)
    expect((await readState(A.page)).timer?.running).toBe(true)
  })
})
