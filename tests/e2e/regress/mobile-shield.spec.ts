// ---------------------------------------------------------------------------
// סבב 2 (regress) — טלפון: מגן הקליקים עדיין חוסם את הטאפ השני של דאבל־טאפ
// אחרי סגירת גיליון (זה מה שהוא נועד לו), ומשחרר אחרי 350 מ״ש. מגע אמיתי דרך CDP.
// ---------------------------------------------------------------------------
import { test, expect, openApp, openSettings } from '../mobile/helpers'

test.skip(({ isMobile }) => !isMobile, 'mobile only')

test('דאבל־טאפ: הטאפ השני אחרי ✕ לא נוחת על סרגל הניווט; אחרי המגן — כן', async ({ page }) => {
  const errors = await openApp(page)
  await openSettings(page)
  // "+ חדש" הראשון בהגדרות הוא של הבלוקים הקבועים
  await page.getByRole('button', { name: '+ חדש' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'בלוק קבוע' })
  await expect(dlg).toBeVisible()
  await page.waitForTimeout(450) // המגן של הפתיחה (StrictMode בפיתוח) נעלם

  const todayBtn = page.locator('.bottomnav button', { hasText: 'היום' })
  const box = (await todayBtn.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const tap = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const shields = () =>
    page.evaluate(() => document.querySelectorAll('body > div[aria-hidden="true"][style*="9999"]').length)

  await dlg.getByRole('button', { name: 'סגירה' }).click()
  await expect(dlg).toBeHidden()
  expect(await shields()).toBe(1)
  await tap() // הטאפ השני של דאבל־טאפ — נבלע במגן
  await page.waitForTimeout(150)
  await expect(page.locator('.topbar h1')).toHaveText('הגדרות')
  expect(await shields()).toBe(1)

  await page.waitForTimeout(400)
  expect(await shields()).toBe(0)
  await tap() // עכשיו הטאפ מגיע לסרגל
  await expect(page.locator('.topbar h1')).not.toHaveText('הגדרות')
  await cdp.detach()
  expect(errors).toEqual([])
})
