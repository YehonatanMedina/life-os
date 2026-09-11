// ---------------------------------------------------------------------------
// עוזרים לבדיקות המסלול המהיר של אטלס — מחסן מזויף + Claude מזויף.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { expect, readAtlasCache } from '../cloud/fixtures'
import type { FakeGithub } from '../cloud/fakeGithub'
import { decryptJSON, encryptJSON, newKey } from '../cloud/crypto'
import { baseState } from '../cloud/state'
import type { AppState } from '../../../src/types'

export const TEST_API_KEY = 'sk-ant-test-0123456789'

/** מצב מכשיר/מחסן עם מפתח ה-API של המסלול המהיר */
export function fastState(deviceId: string, ai: string, apiKey: string | null = TEST_API_KEY): AppState {
  const st = baseState({ deviceId, aiKey: ai })
  if (apiKey) st.settings.apiKey = apiKey
  return st
}

/** מחסן + מפתח ניתוח + מפתח API; מחזיר את מפתח הניתוח */
export async function seedFast(fake: FakeGithub, key: string, apiKey: string | null = TEST_API_KEY, ai = newKey()) {
  fake.setGistFile('life-os.json', await encryptJSON(fastState('dGist', ai, apiKey), key))
  return ai
}

/** thread.json כפי שהוא במאגר המזויף, מפוענח */
export async function repoThread(fake: FakeGithub, ai: string): Promise<any[]> {
  const f = fake.repo.get('thread.json')
  if (!f) return []
  const t = await decryptJSON<{ messages?: any[] }>(f.text, ai)
  return t.messages ?? []
}
export async function repoMemory(fake: FakeGithub, ai: string): Promise<string> {
  const f = fake.repo.get('memory.json')
  if (!f) return ''
  const m = await decryptJSON<{ notes?: string }>(f.text, ai)
  return m.notes ?? ''
}

export const bubbles = (page: Page) => page.locator('.bubble:not(.thinking)')
export const atlasBubbles = (page: Page) => page.locator('.bubble.atlas:not(.thinking)')

/** שולח הודעה מהמלחין */
export async function say(page: Page, text: string) {
  const ta = page.locator('.composer textarea')
  await ta.fill(text)
  await page.getByRole('button', { name: 'שלח' }).click()
}

/** מחכה שהתשובה המהירה תסתיים (אין בועה בזרימה, ההודעה לא ממתינה) */
export async function settled(page: Page, timeout = 10_000) {
  await expect(page.locator('.bubble.streaming')).toHaveCount(0, { timeout })
  await expect(page.locator('.bubble.thinking')).toHaveCount(0, { timeout })
  await expect.poll(async () => {
    const c = await readAtlasCache(page)
    return (c?.messages ?? []).some((m: any) => m.pending)
  }, { timeout }).toBe(false)
}
