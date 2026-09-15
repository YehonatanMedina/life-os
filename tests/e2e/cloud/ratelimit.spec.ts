// ---------------------------------------------------------------------------
// "הסנכרון נכשל" לשעות (14.9.2026). שלושה פגמים שיחד חסמו את החשבון ב-GitHub:
//   1. דופק הטיימר (כל 20 שניות) נחשב שינוי → כתיבה למחסן כל 20 שניות.
//   2. אחרי כשל — ניסיון חוזר כל שנייה.
//   3. 403 של הגבלת קצב נקרא "האסימון נדחה", ונוסה שוב מיד.
// כאן: טיימר רץ לא כותב; בדיקה תקופתית מותנית (304); חסימה משנית וראשית
// מכובדות — גם באטלס; ושגיאת שרת מתמשכת מקבלת ניסיונות מתרחקים.
// ---------------------------------------------------------------------------
import {
  test, expect, readState, waitSynced, waitStatus, gistState, waitPatch, quiet, gotoTab, gotoSettings, addQuickTask, sleep,
} from './fixtures'
import { encryptJSON, newKey } from './crypto'
import { baseState } from './state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)

const gistCalls = (fake: any, from: number, tag = 'A') =>
  (fake.requests as Array<{ tag: string; method: string; path: string; status: number }>)
    .slice(from)
    .filter((r) => r.tag === tag && r.path.startsWith('/gists/'))

test('טיימר רץ דקה: הדופק לא כותב למחסן, הבדיקות התקופתיות עונות 304, ושינוי ממכשיר אחר עדיין מגיע', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const st = baseState({ deviceId: 'dA' })
  const now = Date.now()
  st.timer = { running: true, startedAt: now - 60_000, accumulated: 0, trackId: 'trk-study', label: 'בדיקת דופק', targetMinutes: 50, lastSeen: now }
  const A = await openDevice({ tag: 'A', state: st })
  await waitSynced(A.page)
  await quiet(fake, 3_000)
  // כתיבה בפתיחה (אם הייתה) משנה את המחסן, ולכן הבדיקה הראשונה אחריה מורידה אותו (200) —
  // זה נכון ורצוי. מתחילים לספור רק אחרי ה-304 הראשון.
  const warm = fake.requests.length
  await expect.poll(() => gistCalls(fake, warm).some((r) => r.method === 'GET' && r.status === 304), { timeout: 25_000 }).toBe(true)

  const n = fake.patches.length
  const r0 = fake.requests.length
  const seen0 = (await readState(A.page)).timer!.lastSeen
  await sleep(65_000)
  const after = await readState(A.page)
  // הדופק באמת פעל (שלוש פעימות), והטיימר עדיין רץ
  expect(after.timer!.lastSeen).toBeGreaterThan(seen0)
  expect(after.timer!.running).toBe(true)
  // ...ושום דבר לא נכתב למחסן
  expect(fake.patches.length).toBe(n)
  // בדיקה כל 10 שניות — כולן מותנות, כולן 304
  const gets = gistCalls(fake, r0).filter((r) => r.method === 'GET')
  expect(gets.length).toBeGreaterThanOrEqual(4)
  expect(gets.map((r) => r.status)).toEqual(gets.map(() => 304))

  // מכשיר אחר כתב — הבדיקה הבאה מקבלת 200 ומביאה את השינוי
  const other = baseState({ deviceId: 'dB' })
  other.tasks.push({ ...other.tasks[0], id: 't-from-b', title: 'משימה ממכשיר אחר', updatedAt: Date.now() })
  fake.setGistFile('life-os.json', await encryptJSON(other, key))
  await expect(A.page.getByText('משימה ממכשיר אחר', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  // אחרי מיזוג של שינוי חיצוני מותרת כתיבת יישור אחת (המכשיר מחזיק רשומות מנורמלות).
  // אחריה — שוב שקט, גם כשהדופק ממשיך לפעום.
  await quiet(fake, 3_000)
  expect(fake.patches.length).toBeLessThanOrEqual(n + 1)
  const m = fake.patches.length
  await sleep(25_000)
  expect(fake.patches.length).toBe(m)
})

test('חסימה משנית (403 + retry-after): "ממתין ל-GitHub", בקשה אחת ואז שקט, הסבר בהגדרות, והשינוי נשלח לבד כשהחסימה נגמרת', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/status of 403/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  const blockedUntil = Date.now() + 12_000
  let blocked = 0
  fake.hooks.push(({ tag, path }) => {
    if (tag !== 'A' || !path.startsWith('/gists/') || Date.now() >= blockedUntil) return undefined
    blocked++
    return {
      status: 403,
      body: JSON.stringify({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }),
      headers: { 'retry-after': '12' },
    }
  })
  const r0 = fake.requests.length
  const n = fake.patches.length
  const title = 'משימה בזמן חסימה'
  await addQuickTask(A.page, title)
  await waitStatus(A.page, 'ממתין ל-GitHub', 10_000)

  // בזמן החסימה: הבקשה שנחסמה, ואחריה שום בקשה — לא ניסיון כל שנייה
  await sleep(5_000)
  const during = gistCalls(fake, r0)
  expect(during.map((r) => r.status)).toEqual([403])

  // ההגדרות מסבירות מה קורה; החסימה והתקלה רשומות במכשיר
  await gotoSettings(A.page)
  await expect(A.page.getByText(/GitHub הגביל זמנית את קצב הבקשות\. השינויים שמורים במכשיר ויישלחו לבד ב-\d\d:\d\d/)).toBeVisible()
  await expect(A.page.locator('.sync-grid')).toContainText('rate-limit')
  const ls = await A.page.evaluate(() => ({
    until: Number(localStorage.getItem('life-os-gh-cooldown')),
    log: JSON.parse(localStorage.getItem('life-os-sync-log') || '[]'),
  }))
  expect(ls.until).toBeGreaterThan(Date.now())
  expect(ls.log.some((x: any) => x.err === 'rate-limit' && x.until > x.at)).toBe(true)
  // "סנכרן עכשיו" לא עוקף חסימה
  await A.page.getByRole('button', { name: 'סנכרן עכשיו' }).click()
  await expect(A.page.locator('.toast').filter({ hasText: 'GitHub הגביל זמנית' })).toBeVisible()
  expect(gistCalls(fake, r0)).toHaveLength(1)

  // החסימה נגמרה — נשלח לבד, בלי לגעת בכלום
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 30_000)
  expect(p).toBeTruthy()
  expect(blocked).toBe(1)
  await waitSynced(A.page, 15_000)
  expect((await gistState(fake, key)).tasks.some((t) => t.title === title)).toBe(true)
})

test('מכסה ראשית נגמרה (403, remaining=0): גם אטלס לא שולח בקשות עד האיפוס, ואחריו הכל ממשיך', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [/status of 403/, /status of 404/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  const resetAt = Date.now() + 10_000
  fake.hooks.push(({ tag }) =>
    tag === 'A' && Date.now() < resetAt
      ? {
          status: 403,
          body: JSON.stringify({ message: 'API rate limit exceeded for user ID 1.' }),
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.ceil(resetAt / 1000)) },
        }
      : undefined,
  )
  const n = fake.patches.length
  const title = 'משימה כשהמכסה נגמרה'
  await addQuickTask(A.page, title)
  await waitStatus(A.page, 'ממתין ל-GitHub', 10_000)

  // פתיחת מסך אטלס מושכת את השיחה — אבל בזמן חסימה הבקשה לא יוצאת
  const blockedAt = fake.requests.length
  await gotoTab(A.page, 'שיחה')
  await expect(A.page.getByText(/GitHub מגביל כרגע את קצב הבקשות — אטלס ימשיך לבד ב-\d\d:\d\d/)).toBeVisible({ timeout: 8_000 })
  await sleep(2_000)
  expect(fake.requests.slice(blockedAt).filter((r) => r.tag === 'A')).toEqual([])

  // אחרי האיפוס: הסנכרון שולח לבד, ואטלס קורא שוב בכניסה הבאה למסך
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 30_000)
  expect(p).toBeTruthy()
  await waitSynced(A.page, 15_000)
  await gotoTab(A.page, 'היום')
  await gotoTab(A.page, 'שיחה')
  await expect(A.page.getByText(/GitHub מגביל כרגע את קצב הבקשות/)).toHaveCount(0, { timeout: 10_000 })
  expect(fake.requestsMatching(/life-os-atlas\/contents/, 'A').length).toBeGreaterThan(0)
})

test('שגיאת שרת מתמשכת (502): הניסיונות מתרחקים — לא כל שנייה — והשינוי נשלח כשהשרת חוזר', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/status of 502/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  let down = true
  fake.hooks.push(({ tag, method }) => (down && tag === 'A' && method === 'PATCH' ? { status: 502 } : undefined))
  const r0 = fake.requests.length
  const n = fake.patches.length
  const title = 'משימה כשהשרת נפל'
  await addQuickTask(A.page, title)
  await waitStatus(A.page, 'הסנכרון נכשל', 10_000)
  await sleep(20_000)

  // בלי המתנה היו כאן ~20 ניסיונות. עם 2, 4, 8, 16 שניות — ארבעה עד חמישה.
  const attempts = gistCalls(fake, r0).filter((r) => r.method === 'PATCH').length
  expect(attempts).toBeGreaterThanOrEqual(2)
  expect(attempts).toBeLessThanOrEqual(6)
  await gotoSettings(A.page)
  await expect(A.page.getByText(/GitHub לא זמין כרגע \(שגיאת שרת\)\. השינויים שמורים במכשיר\. ננסה שוב לבד ב-\d\d:\d\d/)).toBeVisible()

  down = false
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 45_000)
  expect(p).toBeTruthy()
  await waitSynced(A.page)
  expect((await gistState(fake, key)).tasks.some((t) => t.title === title)).toBe(true)
})
