// ---------------------------------------------------------------------------
// עוזרים לבדיקות אטלס סבב 2 — על גבי תשתית הענן (GitHub מזויף, מכשירים).
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { expect, gotoTab, sleep } from '../cloud/fixtures'
import type { FakeGithub } from '../cloud/fakeGithub'
import { encryptJSON, newKey } from '../cloud/crypto'
import { baseState, logicalToday } from '../cloud/state'
import type { AppState } from '../../../src/types'

export const today = logicalToday()

export type Msg = Record<string, unknown>

export async function writeThread(fake: FakeGithub, ai: string, messages: unknown) {
  fake.setRepoFile('thread.json', await encryptJSON({ messages }, ai))
}
export async function writeToday(fake: FakeGithub, ai: string, note: unknown) {
  fake.setRepoFile('today.json', await encryptJSON(note, ai))
}

/** מחסן + מפתח ניתוח מוכנים; מחזיר את מפתח הניתוח */
export async function seedCloud(fake: FakeGithub, key: string, extra: Partial<AppState> = {}, ai = newKey()) {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai, extra }), key))
  return ai
}

export const composer = (page: Page) => page.getByPlaceholder('כתוב לאטלס…')

export async function openAtlas(page: Page) {
  await gotoTab(page, 'אטלס')
  await expect(composer(page)).toBeVisible()
}

export const atlasMsg = (id: string, at: string, commands: unknown[] = [], extra: Msg = {}): Msg => ({
  id, at, from: 'atlas', text: 'בוצע', commands, ...extra,
})
export const userMsg = (id: string, at: string, text = 'שאלה', extra: Msg = {}): Msg => ({ id, at, from: 'user', text, ...extra })

export const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

/** בודק שאין גלילה אופקית בדף ובאלמנט נתון */
export async function assertNoHorizontalOverflow(page: Page, selector = '.chat-list') {
  // אנימציית הכניסה של המסך מזיזה את התוכן כמה פיקסלים — מודדים אחרי שהיא נגמרה
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      elScroll: el?.scrollWidth ?? 0,
      elClient: el?.clientWidth ?? 0,
      inner: window.innerWidth,
      // מי חורג — כדי שהכישלון יגיד איזה אלמנט ולא רק "המסמך רחב מדי"
      wide: Array.from(document.querySelectorAll('body *'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.right > document.documentElement.clientWidth + 1 || r.left < -1)
        .slice(0, 8)
        .map(({ el, r }) => `${el.tagName}.${(el as HTMLElement).className} [${Math.round(r.left)}..${Math.round(r.right)}] ${(el.textContent || '').slice(0, 24)}`),
    }
  }, selector)
  expect(r.docScroll, `document scrollWidth ${r.docScroll} > clientWidth ${r.docClient}; wide: ${r.wide.join(' | ')}`).toBeLessThanOrEqual(r.docClient + 1)
  expect(r.elScroll, `${selector} scrollWidth ${r.elScroll} > clientWidth ${r.elClient}`).toBeLessThanOrEqual(r.elClient + 1)
}

/** מריץ את שעון הדף קדימה בצעדים, עם רגע אמיתי בין צעד לצעד כדי ש-fetch יספיק לחזור */
export async function advance(page: Page, ms: number, step = 1_000) {
  let left = ms
  while (left > 0) {
    const s = Math.min(step, left)
    await page.clock.runFor(s)
    left -= s
    await sleep(25)
  }
  await sleep(150)
}

export const threadGets = (fake: FakeGithub, tag: string) => fake.requestsMatching(/^GET \/repos\/[^/]+\/life-os-atlas\/contents\/thread\.json$/, tag)
