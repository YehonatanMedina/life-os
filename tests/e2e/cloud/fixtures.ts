// ---------------------------------------------------------------------------
// תשתית לבדיקות הענן: "מכשיר" = הקשר דפדפן משלו, עם GitHub מזויף משותף,
// אישורים מזוייפים ב-localStorage, ומצב פתיחה ידוע. כל הרשת החיצונית חסומה.
// ---------------------------------------------------------------------------
import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import type { AppState } from '../../../src/types'
import { FakeGithub, installFakeGithub, type Patch } from './fakeGithub'
import { FakeAnthropic, installFakeAnthropic } from './fakeAnthropic'
import { decryptJSON, newKey } from './crypto'

export { expect }
export const STORE_KEY = 'life-os-v1'
export const ATLAS_CACHE_KEY = 'life-os-atlas-cache'
export const FAKE_TOKEN = 'gho_test'

export type Device = {
  tag: string
  context: BrowserContext
  page: Page
  errors: string[]
  allow: RegExp[]
}

export type OpenOpts = {
  tag: string
  /** מצב פתיחה ב-localStorage. null/undefined = התקנה חדשה (זרע) */
  state?: AppState | null
  /** האם לזרוע אסימון + מזהה מחסן + מפתח (ברירת מחדל: כן) */
  creds?: boolean
  /** לזרוע גם את שם המשתמש של אטלס (חוסך את GET /user) */
  login?: boolean
  /** ערכים נוספים ל-localStorage */
  extra?: Record<string, string>
  storageState?: Awaited<ReturnType<BrowserContext['storageState']>>
  url?: string
  /** שגיאות קונסול שמותר להתעלם מהן בבדיקה הזו */
  allowConsole?: RegExp[]
}

type Fixtures = {
  fake: FakeGithub
  /** Claude API מזויף — המסלול המהיר של אטלס */
  claude: FakeAnthropic
  key: string
  openDevice: (opts: OpenOpts) => Promise<Device>
}

export const test = base.extend<Fixtures>({
  fake: async ({}, use) => {
    await use(new FakeGithub())
  },
  claude: async ({}, use) => {
    await use(new FakeAnthropic())
  },
  key: async ({}, use) => {
    await use(newKey())
  },
  openDevice: async ({ browser, contextOptions, fake, claude, key }, use) => {
    const devices: Device[] = []
    await use(async (opts) => {
      const context = await browser.newContext({ ...contextOptions, storageState: opts.storageState })
      // חסימה גורפת קודם — ההתקנה של המזויף אחריה, ולכן היא גוברת
      await context.route('**/*', (route) => {
        const url = route.request().url()
        if (url.startsWith('http://localhost:5173')) return route.continue()
        if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
          return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
        }
        return route.abort()
      })
      await installFakeGithub(context, fake, opts.tag)
      await installFakeAnthropic(context, claude, opts.tag)
      const seed = {
        creds: opts.creds === false ? null : { token: FAKE_TOKEN, gist: fake.gistId, key },
        state: opts.state ? JSON.stringify(opts.state) : null,
        login: opts.login ? fake.login : null,
        extra: opts.extra ?? {},
      }
      // רק אם עוד אין — כדי שרענון של הדף לא ידרוס מה שהאפליקציה שמרה
      await context.addInitScript((seed) => {
        const put = (k: string, v: string | null) => {
          if (v != null && localStorage.getItem(k) == null) localStorage.setItem(k, v)
        }
        if (seed.creds) {
          put('life-os-gh-token', seed.creds.token)
          put('life-os-gist-id', seed.creds.gist)
          put('life-os-crypt-key', seed.creds.key)
        }
        put('life-os-v1', seed.state)
        put('life-os-gh-login', seed.login)
        for (const [k, v] of Object.entries(seed.extra)) put(k, v)
      }, seed)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('console', (m) => {
        const t = m.text()
        // משאבים חיצוניים שחסמנו בכוונה, ו-HMR של שרת הפיתוח — לא באגים של האפליקציה
        if (m.type() !== 'error') return
        if (/net::ERR_FAILED|net::ERR_ABORTED|WebSocket connection to 'ws:\/\/localhost:5173|\[vite\]/.test(t)) return
        errors.push(t)
      })
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
      // רענון לא צפוי באמצע בדיקה מאפס את הניווט ומסתיר באגים — מתעדים אותו
      let loads = 0
      page.on('load', () => {
        loads++
        if (loads > 1 && !(page as any).__expectReload) errors.push(`unexpected page reload #${loads - 1} at ${new Date().toISOString()}`)
      })
      await page.goto(opts.url ?? '/')
      const dev: Device = { tag: opts.tag, context, page, errors, allow: opts.allowConsole ?? [] }
      devices.push(dev)
      return dev
    })
    for (const d of devices) await d.context.close().catch(() => undefined)
    for (const d of devices) {
      const bad = d.errors.filter((e) => !d.allow.some((re) => re.test(e)))
      expect(bad, `console errors on device ${d.tag}`).toEqual([])
    }
  },
})

// -- עוזרים -------------------------------------------------------------------
/**
 * המצב השמור. השמירה ל-localStorage דחויה ב-250 מ״ש אחרי כל שינוי — לכן
 * מחכים רגע לפני הקריאה, אחרת רואים תמונה שקדמה לשינוי האחרון.
 */
export async function readState(page: Page): Promise<AppState> {
  await sleep(450)
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY)
}
export async function readAtlasCache(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), ATLAS_CACHE_KEY)
}

/** תווית מצב הסנכרון (הטקסט לקוראי מסך של הנקודה בסרגל) */
export function syncLabel(page: Page): Locator {
  return page.locator('.sr').filter({ hasText: /מסונכרן|ממתין לשליחה|שולח|הסנכרון נכשל|אין אינטרנט|לא מחובר/ }).first()
}
export async function waitStatus(page: Page, text: string | RegExp, timeout = 20_000) {
  await expect(syncLabel(page)).toHaveText(text, { timeout })
}
export async function waitSynced(page: Page, timeout = 20_000) {
  await waitStatus(page, 'מסונכרן', timeout)
}

/** המצב כפי שהוא במחסן — מפוענח */
export async function gistState(fake: FakeGithub, key: string): Promise<AppState> {
  const raw = fake.files['life-os.json']
  if (!raw) throw new Error('no life-os.json in fake gist')
  return decryptJSON<AppState>(raw, key)
}

/** ממתין לטלאי הבא (מאינדקס נתון) — אופציונלית כזה שעונה לתנאי */
export async function waitPatch(
  fake: FakeGithub,
  fromIndex: number,
  pred: (p: Patch) => boolean | Promise<boolean> = () => true,
  timeout = 25_000,
): Promise<Patch> {
  const t0 = Date.now()
  let i = fromIndex
  while (Date.now() - t0 < timeout) {
    while (i < fake.patches.length) {
      const p = fake.patches[i++]
      if (await pred(p)) return p
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`no matching PATCH within ${timeout}ms (patches: ${fake.patches.length}, from ${fromIndex})`)
}

/** ממתין עד שאין טלאים חדשים במשך ms */
export async function quiet(fake: FakeGithub, ms = 3_000, max = 30_000) {
  const t0 = Date.now()
  let n = fake.patches.length
  let since = Date.now()
  while (Date.now() - t0 < max) {
    if (fake.patches.length !== n) {
      n = fake.patches.length
      since = Date.now()
    }
    if (Date.now() - since >= ms) return
    await new Promise((r) => setTimeout(r, 100))
  }
}

export function nav(page: Page, label: string): Locator {
  return page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first()
}
export async function gotoTab(page: Page, label: 'היום' | 'אטלס' | 'יומן' | 'פרויקטים' | 'סקירה') {
  await nav(page, label).click()
}
export async function gotoSettings(page: Page) {
  await page.getByRole('button', { name: 'הגדרות' }).filter({ visible: true }).first().click()
  await expect(page.getByText('סנכרון בין מכשירים')).toBeVisible()
}

export async function addQuickTask(page: Page, title: string) {
  const input = page.getByPlaceholder('משימה מהירה להיום…')
  await input.fill(title)
  await input.press('Enter')
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
}

/** כפתור הסימון של הרגל בכרטיס "הרגלי היום" */
export function habitCheck(page: Page, name: string): Locator {
  return page.locator('.item').filter({ hasText: name }).getByRole('button', { name: 'סמן כבוצע' }).first()
}

export async function storageOf(context: BrowserContext, settleMs = 700) {
  // השמירה המקומית דחויה ב-250 מ״ש — נותנים לה לנחות
  await new Promise((r) => setTimeout(r, settleMs))
  return context.storageState()
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** רענון/ניווט מכוון בבדיקה — שלא יירשם כרענון לא צפוי */
export async function reload(page: Page, url?: string) {
  ;(page as any).__expectReload = true
  if (url) await page.goto(url)
  else await page.reload()
  ;(page as any).__expectReload = false
}
