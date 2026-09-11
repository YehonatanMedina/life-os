// ---------------------------------------------------------------------------
// סבב 2 (regress) — הענן. שלוש הבדיקות הראשונות הן העתק של בדיקות שנשארו
// test.fixme(true) ב-tests/e2e/cloud אחרי שהתיקון כבר הוחל (cloud #1, #3, #4);
// כאן הן רצות בלי fixme ומוכיחות שהתיקונים עובדים. הרביעית מכסה את מה שנוסף:
// כפתור "העתקת קישור התקנה" (cloud #8) והחיבור מלשונית פתוחה דרך hashchange (cloud #7).
// ---------------------------------------------------------------------------
import {
  test, expect, readState, reload, waitSynced, waitStatus, quiet, waitPatch, addQuickTask, gotoSettings,
  gistState, sleep, FAKE_TOKEN,
} from '../cloud/fixtures'
import { encryptJSON, setupHash } from '../cloud/crypto'
import { baseState, SEED_TASK_ID, SEED_TASK_TITLE } from '../cloud/state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(120_000)

test('cloud #3 — מחסן עם JSON שבור: "הסנכרון נכשל", הודעה ברורה בהגדרות, ואפס כתיבה מעל הקובץ', async ({ fake, openDevice }) => {
  fake.setGistFile('life-os.json', '{"enc":1,"iv":"broken", this is not json')
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitStatus(A.page, 'הסנכרון נכשל', 10_000)
  await addQuickTask(A.page, 'משימה מול מחסן שבור')
  await sleep(6_000)
  expect(fake.patches).toEqual([])
  await gotoSettings(A.page)
  await expect(A.page.getByText('המחסן קיים אבל לא קריא בגרסה הזו')).toBeVisible()
  // הנתונים המקומיים שלמים
  const s = await readState(A.page)
  expect(s.tasks.some((t) => t.title === 'משימה מול מחסן שבור')).toBe(true)
})

test('cloud #4 — news-feedback.json לא נשלח שוב כשרק updatedAt השתנה', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await quiet(fake, 3_000)
  let n = fake.patches.length
  await addQuickTask(A.page, 'משימה ראשונה')
  await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  await quiet(fake, 3_000)
  n = fake.patches.length
  await addQuickTask(A.page, 'משימה שנייה')
  const p2 = await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  expect(Object.keys(p2.files)).toEqual(['life-os.json'])
})

test('cloud #1 — מכשיר שנפתח פעם אחת לפני החיבור (הזרע כבר נשמר): הקישור לא דורס את הגדרות המחסן', async ({ fake, key, openDevice }) => {
  const remote = baseState({ deviceId: 'dMain', aiKey: 'k'.repeat(43) })
  remote.settings.wakeTime = '05:45'
  remote.settings.name = 'יהונתן'
  fake.setGistFile('life-os.json', await encryptJSON(remote, key))

  const C = await openDevice({ tag: 'C', state: null, creds: false, allowConsole: [/status of 404/] })
  await expect(C.page.getByText('הרגלי היום')).toBeVisible()
  await C.page.getByRole('button', { name: 'סגירה' }).first().click()
  await expect.poll(async () => (await readState(C.page))?.settings?.onboarded).toBe(true)

  await reload(C.page, 'about:blank')
  await reload(C.page, '/' + setupHash({ t: FAKE_TOKEN, p: `${fake.gistId}#${key}`, ak: remote.settings.aiKey }))
  await waitSynced(C.page, 20_000)
  await quiet(fake, 3_000)

  const sc = await readState(C.page)
  const after = await gistState(fake, key)
  expect(sc.settings.wakeTime).toBe('05:45')
  expect(sc.settings.name).toBe('יהונתן')
  expect(after.settings.wakeTime).toBe('05:45')
  expect(after.settings.name).toBe('יהונתן')
  expect(sc.settings.aiKey).toBe(remote.settings.aiKey)
})

test('cloud #8 + #7 — כפתור קישור ההתקנה מייצר {t,p,ak,nk}; מכשיר חדש שפותח אותו מתחבר; לשונית פתוחה מתחברת ב-hashchange', async ({ fake, key, openDevice }) => {
  const ai = 'k'.repeat(43)
  const remote = baseState({ deviceId: 'dMain', aiKey: ai })
  remote.settings.wakeTime = '05:45'
  fake.setGistFile('life-os.json', await encryptJSON(remote, key))

  const A = await openDevice({
    tag: 'A',
    state: baseState({ deviceId: 'dA', aiKey: ai }),
    login: true,
    extra: { 'life-os-notify-key': 'nk-test-123' },
    allowConsole: [/status of 404/],
  })
  await waitSynced(A.page)
  await A.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })
  // אם הלוח לא זמין האפליקציה נופלת ל-prompt — תופסים גם אותו
  let prompted = ''
  A.page.on('dialog', async (d) => {
    prompted = d.defaultValue()
    await d.dismiss()
  })
  await gotoSettings(A.page)
  await A.page.getByRole('button', { name: 'העתקת קישור התקנה למכשיר חדש' }).click()
  await sleep(300)
  const link = prompted || (await A.page.evaluate(() => navigator.clipboard.readText()))
  if (!prompted) await expect(A.page.locator('.toast')).toContainText(/הועתק/)
  expect(link.startsWith('http://localhost:5173/#setup=')).toBe(true)
  const b64 = link.split('#setup=')[1]
  expect(b64).toMatch(/^[A-Za-z0-9\-_]+$/)
  const cfg = JSON.parse(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  expect(cfg).toEqual({ t: FAKE_TOKEN, p: `${fake.gistId}#${key}`, ak: ai, nk: 'nk-test-123' })

  // מכשיר חדש לגמרי פותח את הקישור
  const C = await openDevice({ tag: 'C', state: null, creds: false, url: '/#setup=' + b64, allowConsole: [/status of 404/] })
  await waitSynced(C.page, 20_000)
  expect(new URL(C.page.url()).hash).toBe('')
  const creds = await C.page.evaluate(() => ({
    t: localStorage.getItem('life-os-gh-token'),
    g: localStorage.getItem('life-os-gist-id'),
    k: localStorage.getItem('life-os-crypt-key'),
    nk: localStorage.getItem('life-os-notify-key'),
  }))
  expect(creds).toEqual({ t: FAKE_TOKEN, g: fake.gistId, k: key, nk: 'nk-test-123' })
  const sc = await readState(C.page)
  expect(sc.settings.wakeTime).toBe('05:45')
  expect(sc.settings.aiKey).toBe(ai)
  expect(sc.deviceId).not.toBe('dMain')
  expect(sc.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)

  // לשונית שכבר פתוחה בלי חיבור — הדבקת הקישור משנה רק את ה-hash (בלי מסמך חדש)
  const D = await openDevice({ tag: 'D', state: null, creds: false, allowConsole: [/status of 404/] })
  await waitStatus(D.page, 'לא מחובר', 10_000)
  await D.page.evaluate((h) => {
    location.hash = h
  }, '#setup=' + b64)
  await waitSynced(D.page, 20_000)
  expect(new URL(D.page.url()).hash).toBe('')
  const sd = await readState(D.page)
  expect(sd.settings.wakeTime).toBe('05:45')
  expect(sd.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  expect(sd.deviceId).not.toBe('dMain')
  await quiet(fake, 3_000)
  const after = await gistState(fake, key)
  expect(after.settings.wakeTime).toBe('05:45')
  expect(after.settings.aiKey).toBe(ai)
})
