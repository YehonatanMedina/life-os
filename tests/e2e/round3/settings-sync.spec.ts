// ---------------------------------------------------------------------------
// סבב 3 — כל מתגי ההגדרות: נשמרים אחרי רענון ומגיעים למכשיר שני דרך המחסן
// המזויף. שני הפרופילים (במחשב הגיליון של ההגדרות במרכז, בטלפון מסך מלא).
// ---------------------------------------------------------------------------
import { test, expect, waitSynced, quiet, gistState, gotoSettings, reload, readState } from '../cloud/fixtures'
import { baseState } from '../cloud/state'

test.setTimeout(90_000)

const SWITCHES = ['קיבולת מופחתת בשישי ושבת', 'קיבולת מופחתת בחגים', 'קיבולת מופחתת בימי מבחן', 'צליל בסיום אסימון', 'נעילת סקירה שבועית'] as const
const KEYS = ['easyWeekend', 'easyHoliday', 'easyExamDay', 'sound', 'reviewLock'] as const

test('חמישה מתגים + ערכת נושא: נשמרים ברענון, נכתבים למחסן, ומופיעים במכשיר ב׳', async ({ fake, key, openDevice }) => {
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await gotoSettings(A.page)
  const before = (await readState(A.page)).settings
  const target: Record<string, boolean> = {}
  for (let i = 0; i < SWITCHES.length; i++) {
    const sw = A.page.getByRole('switch', { name: SWITCHES[i] })
    await expect(sw).toHaveAttribute('aria-checked', String(before[KEYS[i]]))
    await sw.click()
    target[KEYS[i]] = !before[KEYS[i]]
    await expect(sw).toHaveAttribute('aria-checked', String(target[KEYS[i]]))
  }
  await A.page.getByRole('button', { name: 'כהה', exact: true }).click()
  await expect(A.page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await quiet(fake)
  await waitSynced(A.page)
  const remote = await gistState(fake, key)
  for (const k of KEYS) expect(remote.settings[k], `gist ${k}`).toBe(target[k])
  expect(remote.settings.theme).toBe('dark')

  await reload(A.page)
  await expect(A.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await gotoSettings(A.page)
  for (let i = 0; i < SWITCHES.length; i++) {
    await expect(A.page.getByRole('switch', { name: SWITCHES[i] })).toHaveAttribute('aria-checked', String(target[KEYS[i]]))
  }

  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(B.page)
  await expect.poll(async () => (await readState(B.page)).settings.theme, { timeout: 30_000 }).toBe('dark')
  await expect(B.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await gotoSettings(B.page)
  for (let i = 0; i < SWITCHES.length; i++) {
    await expect(B.page.getByRole('switch', { name: SWITCHES[i] }), `B ${KEYS[i]}`).toHaveAttribute('aria-checked', String(target[KEYS[i]]))
  }
})
