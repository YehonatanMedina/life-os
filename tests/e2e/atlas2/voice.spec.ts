// ---------------------------------------------------------------------------
// אטלס סבב 2 — קלט בקול: webkitSpeechRecognition מדומה דרך addInitScript.
// תוצאות ביניים וסופיות ממלאות את התיבה, השליחה עוצרת את ההאזנה, ושגיאת
// not-allowed מציגה טוסט. רץ בשני הפרופילים.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { test as base, expect, waitSynced, readAtlasCache } from '../cloud/fixtures'
import { baseState } from '../cloud/state'
import { seedCloud, writeThread, openAtlas, composer } from './helpers'

const ALLOW = [/status of 404/]

const test = base.extend<{ srPage: (p: Page) => Promise<void> }>({
  srPage: async ({}, use) => {
    await use(async () => undefined)
  },
})

/** מזריק זיהוי דיבור מדומה לכל דף בהקשר — לפני שהאפליקציה נטענת */
const SR_INIT = () => {
  class FakeSR {
    lang = ''
    interimResults = false
    continuous = false
    onresult: ((ev: any) => void) | null = null
    onerror: ((ev: any) => void) | null = null
    onend: (() => void) | null = null
    started = 0
    stopped = 0
    constructor() {
      ;(window as any).__srInstances = (window as any).__srInstances ?? []
      ;(window as any).__srInstances.push(this)
      ;(window as any).__sr = this
    }
    start() {
      this.started++
      if ((window as any).__srThrowOnStart) throw new Error('InvalidStateError')
    }
    stop() {
      this.stopped++
      this.onend?.()
    }
    abort() {
      this.stopped++
      this.onend?.()
    }
  }
  ;(window as any).webkitSpeechRecognition = FakeSR
}

const result = (page: Page, parts: Array<[string, boolean]>) =>
  page.evaluate((parts) => {
    const results = parts.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript }, length: 1 }))
    ;(window as any).__sr.onresult({ results })
  }, parts)

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)

test('דיבור: ביניים → סופי ממלאים את התיבה; שליחה עוצרת את ההאזנה ושולחת את הטקסט', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await A.context.addInitScript(SR_INIT)
  await A.page.reload()
  await waitSynced(A.page)
  await openAtlas(A.page)
  const mic = A.page.getByRole('button', { name: 'דבר' })
  await expect(mic).toBeVisible()
  await mic.click()
  await expect(A.page.getByRole('button', { name: 'עצור הקלטה' })).toHaveAttribute('aria-pressed', 'true')
  await expect(composer(A.page)).toHaveAttribute('placeholder', 'מקשיב…')
  expect(await A.page.evaluate(() => ({ lang: (window as any).__sr.lang, interim: (window as any).__sr.interimResults, cont: (window as any).__sr.continuous, started: (window as any).__sr.started })))
    .toEqual({ lang: 'he-IL', interim: true, cont: true, started: 1 })

  await result(A.page, [['קבעתי', false]])
  await expect(composer(A.page)).toHaveValue('קבעתי')
  await result(A.page, [['קבעתי רופא', false]])
  await expect(composer(A.page)).toHaveValue('קבעתי רופא')
  await result(A.page, [['קבעתי רופא שיניים ', true], ['מחר בארבע', false]])
  await expect(composer(A.page)).toHaveValue('קבעתי רופא שיניים מחר בארבע')
  await result(A.page, [['קבעתי רופא שיניים ', true], ['מחר בארבע.', true]])
  await expect(composer(A.page)).toHaveValue('קבעתי רופא שיניים מחר בארבע.')

  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect(composer(A.page)).toHaveValue('')
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')
  await expect(composer(A.page)).toHaveAttribute('placeholder', 'כתוב לאטלס…')
  expect(await A.page.evaluate(() => (window as any).__sr.stopped)).toBeGreaterThanOrEqual(1)
  await expect(A.page.locator('.bubble.me')).toContainText('קבעתי רופא שיניים מחר בארבע.')
  await expect.poll(() => fake.issues.length, { timeout: 10_000 }).toBe(1)
  // תוצאה שמגיעה אחרי העצירה (המנוע מאחר) — לא מזהמת את התיבה הריקה
  await result(A.page, [['רעש מאוחר', true]])
  await expect(composer(A.page)).toHaveValue('')
})

test('טקסט שהוקלד לפני ההקלטה נשמר; עצירה ידנית; שגיאת not-allowed — טוסט וההאזנה נעצרת', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await A.context.addInitScript(SR_INIT)
  await A.page.reload()
  await waitSynced(A.page)
  await openAtlas(A.page)
  await composer(A.page).fill('הערה:')
  await A.page.getByRole('button', { name: 'דבר' }).click()
  await result(A.page, [['להתקשר לרופא', false]])
  await expect(composer(A.page)).toHaveValue('הערה: להתקשר לרופא')
  // עצירה ידנית
  await A.page.getByRole('button', { name: 'עצור הקלטה' }).click()
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')
  await expect(composer(A.page)).toHaveValue('הערה: להתקשר לרופא')
  expect(await A.page.evaluate(() => (window as any).__sr.stopped)).toBe(1)

  // הקלטה שנייה — מופע חדש; שגיאת הרשאה
  await A.page.getByRole('button', { name: 'דבר' }).click()
  expect(await A.page.evaluate(() => (window as any).__srInstances.length)).toBe(2)
  await A.page.evaluate(() => (window as any).__sr.onerror({ error: 'not-allowed' }))
  await expect(A.page.locator('.toast')).toContainText('אין הרשאה למיקרופון')
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')
  await expect(composer(A.page)).toHaveAttribute('placeholder', 'כתוב לאטלס…')
  // הטקסט שהיה — נשאר
  await expect(composer(A.page)).toHaveValue('הערה: להתקשר לרופא')

  // שגיאה אחרת (network) — בלי טוסט הרשאה, אבל ההאזנה נעצרת
  await A.page.getByRole('button', { name: 'דבר' }).click()
  await A.page.evaluate(() => (window as any).__sr.onerror({ error: 'network' }))
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')

  // המנוע נגמר מעצמו (onend) — הכפתור חוזר למצב רגיל
  await A.page.getByRole('button', { name: 'דבר' }).click()
  await A.page.evaluate(() => (window as any).__sr.onend())
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')

  // start() שזורק — טוסט ולא קריסה
  await A.page.evaluate(() => ((window as any).__srThrowOnStart = true))
  await A.page.getByRole('button', { name: 'דבר' }).click()
  await expect(A.page.locator('.toast')).toContainText('לא הצלחתי להפעיל את המיקרופון')
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveAttribute('aria-pressed', 'false')
})

test('בלי זיהוי דיבור בדפדפן — אין כפתור מיקרופון, והשליחה בטקסט עובדת', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  const hasSR = await A.page.evaluate(() => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  await expect(A.page.getByRole('button', { name: 'דבר' })).toHaveCount(hasSR ? 1 : 0)
  await composer(A.page).fill('טקסט רגיל')
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect(A.page.locator('.bubble.me')).toContainText('טקסט רגיל')
  await expect.poll(async () => (await readAtlasCache(A.page)).messages.length).toBe(1)
})

test('אטלס לא מחובר (בלי מפתח) — המיקרופון מושבת', async ({ fake, key, openDevice }) => {
  await seedCloud(fake, key, {}, undefined)
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), login: true, allowConsole: ALLOW })
  await A.context.addInitScript(SR_INIT)
  await A.page.reload()
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.getByRole('button', { name: 'דבר' })).toBeDisabled()
  await expect(composer(A.page)).toBeDisabled()
})
