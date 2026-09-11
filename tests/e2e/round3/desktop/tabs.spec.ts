// ---------------------------------------------------------------------------
// סבב 3 — שתי לשוניות של אותו דפדפן על אותו localStorage.
// החנות היא סינגלטון בזיכרון של כל לשונית, והשמירה דוחה 250 מ״ש — לשונית
// שנפתחה קודם ושומרת אחרי, דורסת את מה שהלשונית השנייה כתבה.
// ---------------------------------------------------------------------------
import { test, expect, readState } from '../../fixtures'
import type { Page } from '@playwright/test'

async function secondTab(app: Page): Promise<Page> {
  const page = await app.context().newPage()
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost:5173')) return route.continue()
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    return route.abort()
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'היום', exact: true }).first()).toBeVisible()
  return page
}

const dismissIntro = async (page: Page) => {
  const x = page.getByRole('button', { name: 'סגירה' }).first()
  if (await x.isVisible().catch(() => false)) await x.click()
}

test('לשונית ב׳ ששומרת אחרי לשונית א׳ דורסת את המשימה שנוספה בא׳', async ({ app }) => {
  await dismissIntro(app)
  const b = await secondTab(app)
  await dismissIntro(b)

  const input = app.getByPlaceholder('משימה מהירה להיום…')
  await input.fill('משימה מלשונית א')
  await input.press('Enter')
  await expect(app.getByText('משימה מלשונית א')).toBeVisible()
  await app.waitForTimeout(500)
  expect((await readState(app)).tasks.some((t: any) => t.title === 'משימה מלשונית א')).toBe(true)

  // לשונית ב׳ מסמנת הרגל — פעולה שלא נוגעת במשימות
  await b.locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).first().click()
  await b.waitForTimeout(500)

  // המשימה של א׳ צריכה להיות במצב השמור — וגם ב-ב׳ אחרי רענון (המיזוג בין הלשוניות לוקח עד כשנייה)
  await expect.poll(async () => (await readState(app)).tasks.some((t: any) => t.title === 'משימה מלשונית א'), { timeout: 3_000 }).toBe(true)
  await expect.poll(async () => (await readState(b)).tasks.some((t: any) => t.title === 'משימה מלשונית א'), { timeout: 3_000 }).toBe(true)
  await b.reload()
  await expect(b.getByText('משימה מלשונית א')).toBeVisible()
})

test('טיימר שהתחיל בלשונית א׳ שורד שמירה מלשונית ב׳ ולא נספר פעמיים', async ({ app }) => {
  await dismissIntro(app)
  const b = await secondTab(app)
  await dismissIntro(b)
  await app.locator('.timer-card .tag').first().click()
  await expect(app.locator('.timer-card')).toHaveClass(/live/)
  await app.waitForTimeout(500)
  expect((await readState(app)).timer?.running).toBe(true)

  // ב׳ לא יודעת על הטיימר ושומרת משהו אחר
  await b.locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).first().click()
  await b.waitForTimeout(500)
  await expect.poll(async () => (await readState(app)).timer?.running, { timeout: 3_000 }).toBe(true)
  await expect.poll(async () => (await readState(b)).timer?.running, { timeout: 3_000 }).toBe(true)
  await b.reload()
  await expect(b.locator('.timer-card')).toHaveClass(/live/)
})
