// ---------------------------------------------------------------------------
// סבב 3 — פתיחת גיליון מתוך דף שגלל: המקום בדף צריך להישמר בזמן שהגיליון פתוח
// ואחרי סגירתו. שני הפרופילים.
// ---------------------------------------------------------------------------
import { test, expect } from '../desktop/desk'
import { go, round3Seed } from './helpers'

test.use({ seed: round3Seed })

test('גיליון שנפתח מתוך יומן שגלל לא מקפיץ את הדף לראש, והסגירה מחזירה לאותו מקום', async ({ app }) => {
  await go(app, 'יומן')
  await app.getByRole('button', { name: 'יום', exact: true }).click()
  const dayList = app.locator('.card', { has: app.locator('input[placeholder="+ משימה ליום הזה…"]') })
  const item = dayList.locator('.item.tappable', { hasText: 'שגרת בוקר' })
  await item.scrollIntoViewIfNeeded()
  await app.evaluate(() => window.scrollTo(0, Math.max(300, window.scrollY)))
  await app.waitForTimeout(200)
  const before = await app.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(0)
  await item.click()
  const sheet = app.getByRole('dialog', { name: 'עריכת אירוע' })
  await expect(sheet).toBeVisible()
  expect(await app.evaluate(() => window.scrollY), 'scroll position while the sheet is open').toBe(before)
  await app.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await app.waitForTimeout(300)
  expect(await app.evaluate(() => window.scrollY), 'scroll position after closing the sheet').toBe(before)
})
