// ---------------------------------------------------------------------------
// תשתית לבדיקות המחשב (1440×900).
// מרחיבה את התשתית המשותפת (חסימת רשת + איסוף שגיאות קונסול) בשלושה דברים:
//  - שעון קבוע: יום שישי 11.9.2026 בשעה 10:00 (אפשר לשנות פר־בדיקה). הזמן
//    ממשיך לזרום בקצב אמיתי מהרגע הזה, ואפשר להריץ אותו קדימה עם page.clock.
//  - זריעת מצב: פונקציה שמקבלת את מצב הפתיחה (seedState) ומחזירה מצב לשמירה
//    ב-localStorage לפני הטעינה הראשונה.
//  - מפתחות localStorage נוספים (למשל טוקן מזויף לאטלס).
// ---------------------------------------------------------------------------
import { test as base, expect, type Page } from '@playwright/test'
import { seedState } from '../../../src/seed'
import type { AppState } from '../../../src/types'

export { expect }
import { readState as readNow, STORE_KEY } from '../fixtures'
export { STORE_KEY }

/** המצב השמור — אחרי שהשמירה המושהית (250 מ״ש) הספיקה לרוץ */
export async function readState(page: Page): Promise<any> {
  await page.waitForTimeout(400)
  return readNow(page)
}

/** הרגע הקבוע של הבדיקות: יום שישי, 10:00 בבוקר (שעון ישראל, קיץ) */
export const NOW_ISO = '2026-09-11T10:00:00+03:00'
export const TODAY = '2026-09-11'
export const TOMORROW = '2026-09-12'
export const YESTERDAY = '2026-09-10'
/** יום ראשון של השבוע הנוכחי, ושל השבוע שהסתיים (זה שהסקירה סוגרת) */
export const WEEK_START = '2026-09-06'
export const PREV_WEEK_START = '2026-08-30'
export const NEXT_WEEK_START = '2026-09-13'

type SeedFn = (s: AppState) => AppState
/** Playwright לא מקבל פונקציה כערך של אופציה — עוטפים באובייקט */
export type Seed = { build: SeedFn }
export const seed = (build: SeedFn): Seed => ({ build })
/** זרע מינימלי: התקנה חדשה עם כרטיס ההסבר סגור */
export const onboarded = seed((s) => ({ ...s, settings: { ...s.settings, onboarded: true } }))

type Options = {
  /** מצב התחלתי — null = התקנה חדשה לגמרי (בלי כלום ב-localStorage) */
  seed: Seed | null
  /** הזמן שבו הדפדפן "חי" בתחילת הבדיקה */
  clock: string | null
  /** מפתחות localStorage נוספים לפני הטעינה */
  extraStorage: Record<string, string>
}

type Fixtures = {
  app: Page
  consoleErrors: string[]
}

export const test = base.extend<Fixtures & Options>({
  seed: [null, { option: true }],
  clock: [NOW_ISO, { option: true }],
  extraStorage: [{}, { option: true }],
  // Service Worker מקאש את הדף — לא רוצים אותו בין בדיקות
  serviceWorkers: 'block',

  consoleErrors: async ({}, use) => {
    await use([])
  },

  app: async ({ page, consoleErrors, seed, clock, extraStorage }, use) => {
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith('http://localhost:5173')) return route.continue()
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      }
      return route.abort()
    })
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      // משאב חיצוני שחסמנו בכוונה, או ה-WebSocket של Vite כששרת הפיתוח המשותף מופעל מחדש — לא באגים של האפליקציה
      if (/net::ERR_FAILED|net::ERR_ABORTED|WebSocket connection to 'ws:\/\/localhost:5173/.test(m.text())) return
      // תשובות 4xx/5xx מ-GitHub המדומה (page.route) — הדפדפן מדווח עליהן כשגיאת משאב, האפליקציה מטפלת בהן
      if (/Failed to load resource/.test(m.text()) && /api\.github\.com/.test(m.location()?.url ?? '')) return
      consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

    if (clock) await page.clock.install({ time: clock })

    const stored: Record<string, string> = { ...extraStorage }
    if (seed) stored['life-os-v1'] = JSON.stringify(seed.build(seedState()))
    if (Object.keys(stored).length) {
      await page.addInitScript((kv: Record<string, string>) => {
        // רק בטעינה הראשונה — אחרי רענון המצב השמור הוא האמת
        if (sessionStorage.getItem('__seeded')) return
        sessionStorage.setItem('__seeded', '1')
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v)
      }, stored)
    }

    await page.goto('/')
    await use(page)
    expect(consoleErrors, 'console errors during the test').toEqual([])
  },
})

// ---------------------------------------------------------------------------
// עוזרים משותפים
// ---------------------------------------------------------------------------

/** מחכה שהחנות תישמר (השמירה מושהית ב-250 מ״ש) ואז מרעננת */
export async function reload(page: Page) {
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.getByRole('button', { name: 'היום', exact: true }).first()).toBeVisible()
}

/** ניווט דרך סרגל הצד */
export async function go(page: Page, label: 'היום' | 'אטלס' | 'יומן' | 'פרויקטים' | 'סקירה' | 'הגדרות') {
  await page.locator('nav.sidebar').getByRole('button', { name: label, exact: true }).click()
  await expect(page.locator('nav.sidebar button[aria-current="true"]')).toHaveText(new RegExp(label))
}

/** הגיליון העליון הפתוח (Sheet) */
export function sheet(page: Page, title?: string) {
  return title ? page.getByRole('dialog', { name: title }) : page.locator('.scrim').last().locator('.sheet')
}

/** בוחר שעה בגיליון "בחירת שעה" שנפתח מהשדה הנתון */
export async function pickTime(page: Page, field: ReturnType<Page['locator']>, hh: number, mm: number) {
  await field.click()
  const d = page.getByRole('dialog', { name: 'בחירת שעה' })
  await expect(d).toBeVisible()
  const h2 = String(hh).padStart(2, '0')
  const m2 = String(mm).padStart(2, '0')
  // שתי הרשתות: 24 כפתורי שעה ואז 12 כפתורי דקות — לוקחים לפי הסדר
  await d.getByRole('button', { name: h2, exact: true }).first().click()
  await d.getByRole('button', { name: m2, exact: true }).last().click()
  await expect(d.locator('.ltr').first()).toHaveText(`${h2}:${m2}`)
  await d.getByRole('button', { name: 'אישור' }).click()
  await expect(d).toBeHidden()
}

/** תעודת זהות של רשומה חיה במצב השמור */
export const live = <T extends { deleted?: boolean }>(xs: T[]): T[] => (xs ?? []).filter((x) => !x.deleted)
