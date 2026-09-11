// ---------------------------------------------------------------------------
// סבב 3 — אטלס בטלפון (Pixel 7, GitHub מזויף):
//  - שליחה בלי רשת: "לא נשלח" + "שלח שוב"; חזרה לרשת ושליחה חוזרת; ההודעה
//    הממתינה שורדת רענון ולא נשלחת פעמיים.
//  - תשובה שמגיעה בזמן שהמסך "היום" פתוח: הכרטיס מתעדכן, הפקודה מבוצעת,
//    וביטול מהשיחה מחזיר את המצב.
//  - שיחה ארוכה: כניסה למסך צריכה לנחות על ההודעה האחרונה והמלחין מעל הסרגל
//    (מתועד כפגם); עם מקלדת פתוחה (חלון נמוך) המלחין נגיש אחרי גלילה לסוף.
// ---------------------------------------------------------------------------
import { test, expect, waitSynced, gotoTab, reload, sleep, readState } from '../../cloud/fixtures'
import { baseState, logicalToday } from '../../cloud/state'
import { seedCloud, writeThread, composer, openAtlas, atlasMsg, userMsg } from '../../atlas2/helpers'
import type { Page } from '@playwright/test'

test.setTimeout(90_000)
const ALLOW = [/status of 404/, /status of 503/]
const today = logicalToday()

async function setOnline(page: Page, online: boolean) {
  await page.evaluate((on) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
    window.dispatchEvent(new Event(on ? 'online' : 'offline'))
  }, online)
}

const sendBtn = (page: Page) => page.getByRole('button', { name: 'שלח', exact: true })

const longThread = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const at = new Date(Date.now() - (n + 10 - i) * 60_000).toISOString()
    return i % 2 ? atlasMsg(`a-${i}`, at, [], { text: `תשובה ${i} — משפט אחד או שניים על מה שנעשה.` }) : userMsg(`u-${i}`, at, `שאלה ${i}`)
  })

/** מיקומים: המלחין, הסרגל התחתון, הבועה האחרונה — יחסית לחלון */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    const c = q('.composer'), n = q('.bottomnav')
    const bubbles = document.querySelectorAll('.bubble')
    const last = bubbles[bubbles.length - 1].getBoundingClientRect()
    const ta = document.querySelector('.composer .textarea') as HTMLElement
    const t = ta.getBoundingClientRect()
    const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)
    return {
      scrollY: window.scrollY, inner: window.innerHeight,
      cTop: c.top, cBottom: c.bottom, navTop: n.top, lastTop: last.top, lastBottom: last.bottom,
      hitIsTextarea: hit === ta, docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth,
    }
  })
}

test('שליחה בלי רשת → "לא נשלח"; חזרה לרשת → "שלח שוב" מצליח; ההודעה הממתינה שורדת רענון בלי שליחה כפולה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)

  let offline = true
  fake.hooks.push((r) => (offline && r.method === 'POST' && /\/issues$/.test(r.path) ? { status: 503 } : undefined))
  await setOnline(A.page, false)
  await composer(A.page).fill('תזכיר לי מחר בבוקר לקנות חלב')
  await sendBtn(A.page).click()
  const bubble = A.page.locator('.bubble.me', { hasText: 'לקנות חלב' })
  await expect(bubble).toBeVisible()
  await expect(bubble).toHaveClass(/failed/)
  await expect(bubble).toContainText('לא נשלח')
  await expect(A.page.getByText('השליחה נכשלה')).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)

  offline = false
  await setOnline(A.page, true)
  await bubble.getByRole('button', { name: 'שלח שוב' }).click()
  await expect(bubble).not.toHaveClass(/failed/)
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  await expect(A.page.getByText('השליחה נכשלה')).toHaveCount(0)
  expect(fake.issues.length).toBe(1)

  await reload(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble.me', { hasText: 'לקנות חלב' })).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  await sleep(3_000)
  expect(fake.issues.length).toBe(1)
})

test('תשובה מגיעה כשמסך "היום" פתוח: הכרטיס עובר מ"עובד על התשובה" ל"ענה", המשימה נכנסת, וביטול מהשיחה מסיר אותה', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, [])
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await composer(A.page).fill('תוסיף משימה להיום: לקנות מיתרים')
  await sendBtn(A.page).click()
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  expect(fake.issues.length).toBe(1)
  const msgId = fake.issues[0].title

  await gotoTab(A.page, 'היום')
  const card = A.page.locator('.atlas-card')
  await expect(card).toContainText('עובד על התשובה')

  await writeThread(fake, ai, [
    userMsg(msgId, new Date(Date.now() - 30_000).toISOString(), 'תוסיף משימה להיום: לקנות מיתרים'),
    atlasMsg('a-1', new Date().toISOString(), [{ id: 'c-mit', op: 'addTask', task: { title: 'לקנות מיתרים', trackId: 'trk-life', due: today } }], {
      text: 'הוספתי "לקנות מיתרים" להיום.', replyTo: msgId,
    }),
  ])
  // בזמן המתנה המשיכה היא כל 10 שניות
  await expect(card).toContainText('ענה', { timeout: 20_000 })
  await expect(card).toContainText('הוספתי "לקנות מיתרים" להיום.')
  const tasksCard = A.page.locator('.card', { hasText: 'המשימות של היום' })
  await expect(tasksCard.locator('.item', { hasText: 'לקנות מיתרים' })).toBeVisible()

  await card.click()
  await expect(composer(A.page)).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)
  const cmd = A.page.locator('.cmd', { hasText: 'לקנות מיתרים' })
  await expect(cmd).toBeVisible()
  await cmd.getByRole('button', { name: 'ביטול' }).click()
  await expect(A.page.locator('.toast')).toContainText('בוטל')
  await gotoTab(A.page, 'היום')
  await expect(tasksCard.locator('.item', { hasText: 'לקנות מיתרים' })).toHaveCount(0)
  await expect(card).toContainText('ענה')
  const st = await readState(A.page)
  expect(st.tasks.find((t: any) => t.title === 'לקנות מיתרים')?.deleted).toBe(true)
})

test('שיחה ארוכה: הכניסה למסך נוחתת על ההודעה האחרונה והמלחין מעל הסרגל; תשובה חדשה נגללת לעין', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  const many = longThread(16)
  await writeThread(fake, ai, many)
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble').first()).toBeVisible({ timeout: 15_000 })
  await A.page.waitForTimeout(500)
  const g = await geometry(A.page)
  expect(g.lastBottom, 'last message inside the viewport on entry').toBeLessThanOrEqual(g.cTop + 2)
  expect(g.lastTop, 'last message inside the viewport on entry').toBeGreaterThanOrEqual(0)
  expect(g.cBottom, 'composer fully above the bottom nav').toBeLessThanOrEqual(g.navTop + 1)
  expect(g.hitIsTextarea, 'textarea not covered by the nav').toBe(true)

  await writeThread(fake, ai, [...many, atlasMsg('a-new', new Date().toISOString(), [], { text: 'הודעה חדשה שהגיעה עכשיו' })])
  await gotoTab(A.page, 'היום')
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble', { hasText: 'הודעה חדשה שהגיעה עכשיו' })).toBeVisible({ timeout: 15_000 })
  await A.page.waitForTimeout(400)
  const g2 = await geometry(A.page)
  expect(g2.lastBottom, 'new reply scrolled into view').toBeLessThanOrEqual(g2.cTop + 2)
  expect(g2.lastTop).toBeGreaterThanOrEqual(0)
})

test('מקלדת פתוחה (412×460) אחרי גלילה לסוף: המלחין על המסך ומעל הסרגל, טקסט רב־שורתי לא מסתיר אותו, בלי גלישה אופקית', async ({ fake, key, openDevice }) => {
  const ai = await seedCloud(fake, key)
  await writeThread(fake, ai, longThread(12))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: ALLOW })
  await waitSynced(A.page)
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble').first()).toBeVisible({ timeout: 15_000 })

  await A.page.setViewportSize({ width: 412, height: 460 })
  await A.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await composer(A.page).click()
  await composer(A.page).type('שורה ראשונה\nשורה שנייה\nשורה שלישית')
  await A.page.waitForTimeout(200)
  const g = await geometry(A.page)
  expect(g.cBottom, 'composer bottom within viewport').toBeLessThanOrEqual(g.inner + 1)
  expect(g.cTop, 'composer top within viewport').toBeGreaterThanOrEqual(0)
  expect(g.cBottom, 'composer above bottom nav').toBeLessThanOrEqual(g.navTop + 1)
  expect(g.hitIsTextarea, 'textarea not covered').toBe(true)
  expect(g.docScroll).toBeLessThanOrEqual(g.docClient + 1)
  await expect(composer(A.page)).toHaveValue('שורה ראשונה\nשורה שנייה\nשורה שלישית')
})
