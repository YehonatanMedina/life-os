// ---------------------------------------------------------------------------
// תשתית משותפת לבדיקות הקצה־לקצה.
// - חוסמת כל רשת שאינה localhost (גופנים, GitHub) — הבדיקות לא נוגעות בעולם.
// - אוספת שגיאות קונסול ו-pageerror, ומכשילה בדיקה אם היו כאלה.
// - עוזרי זמן: היום הלוגי של האפליקציה מתחלף ב-03:30.
// ---------------------------------------------------------------------------
import { test as base, expect, type Page } from '@playwright/test'

type Fixtures = {
  app: Page
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  consoleErrors: async ({}, use) => {
    await use([])
  },
  app: async ({ page, consoleErrors }, use) => {
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith('http://localhost:5173')) return route.continue()
      // גופנים — תשובה ריקה כדי שלא תהיה שגיאת רשת; הפריסה נבדקת עם גופן הגיבוי
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      }
      return route.abort()
    })
    page.on('console', (m) => {
      // כישלון טעינה של משאב חיצוני שחסמנו בכוונה אינו באג של האפליקציה
      if (m.type() !== 'error') return
      if (/net::ERR_FAILED|net::ERR_ABORTED/.test(m.text())) return
      // תשובות 4xx/5xx מדומות מ-GitHub הן חלק מהבדיקה, לא באג של האפליקציה
      if (/api\.github\.com/.test(m.location()?.url ?? '')) return
      consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    await page.goto('/')
    await use(page)
    expect(consoleErrors, 'console errors during the test').toEqual([])
  },
})

export { expect }

/** מזהה הסקריפט של המצב השמור — כדי לקרוא/לכתוב את החנות ישירות בבדיקות */
export const STORE_KEY = 'life-os-v1'

export async function readState(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY)
}
