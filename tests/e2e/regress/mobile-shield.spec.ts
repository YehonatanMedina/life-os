// ---------------------------------------------------------------------------
// סבב 2 (regress) — טלפון: מגן הקליקים (a561495: ספירה, לא שכבה). אחרי סגירת
// גיליון במגע, הטאפ הבא בתוך 350 מ״ש נבלע (הטאפ השני של דאבל־טאפ) — פעם אחת
// בלבד; אחרי החלון, או בטאפ שאחריו, הכל עובר. אין שום שכבה ב-DOM. מגע אמיתי דרך CDP.
// ---------------------------------------------------------------------------
import { test, expect, openApp, openSettings } from '../mobile/helpers'

test.skip(({ isMobile }) => !isMobile, 'mobile only')

test('דאבל־טאפ אחרי ✕ במגע: הטאפ הראשון נבלע, השני עובר; אחרי 350 מ״ש הכל עובר; אין שכבה', async ({ page }) => {
  const errors = await openApp(page)
  const cdp = await page.context().newCDPSession(page)
  const tapAt = async (x: number, y: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const tapOn = async (sel: ReturnType<typeof page.locator>) => {
    const b = (await sel.boundingBox())!
    await tapAt(b.x + b.width / 2, b.y + b.height / 2)
  }
  const overlays = () => page.evaluate(() => document.querySelectorAll('body > div[aria-hidden="true"][style*="9999"]').length)
  const openSheet = async () => {
    await openSettings(page)
    // "+ חדש" הראשון בהגדרות הוא של הבלוקים הקבועים
    await page.getByRole('button', { name: '+ חדש' }).first().click()
    const dlg = page.getByRole('dialog', { name: 'בלוק קבוע' })
    await expect(dlg).toBeVisible()
    await page.waitForTimeout(450)
    return dlg
  }
  const todayBtn = page.locator('.bottomnav button', { hasText: 'היום' })

  // סבב 1: סגירה במגע → הטאפ הבא נבלע, הטאפ שאחריו עובר (המגן חד־פעמי)
  let dlg = await openSheet()
  await tapOn(dlg.getByRole('button', { name: 'סגירה' }))
  await expect(dlg).toBeHidden()
  expect(await overlays()).toBe(0)
  await tapOn(todayBtn)
  await page.waitForTimeout(120)
  await expect(page.locator('.topbar h1')).toHaveText('הגדרות')
  await tapOn(todayBtn)
  await expect(page.locator('.topbar h1')).not.toHaveText('הגדרות')

  // סבב 2: אחרי החלון — הטאפ הראשון כבר עובר
  dlg = await openSheet()
  await tapOn(dlg.getByRole('button', { name: 'סגירה' }))
  await expect(dlg).toBeHidden()
  await page.waitForTimeout(400)
  await tapOn(todayBtn)
  await expect(page.locator('.topbar h1')).not.toHaveText('הגדרות')
  expect(await overlays()).toBe(0)
  await cdp.detach()
  expect(errors).toEqual([])
})
