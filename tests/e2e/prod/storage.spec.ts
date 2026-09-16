// ---------------------------------------------------------------------------
// האחסון של הדפדפן נגמר (או חסום). זה קורה באמת: מצב גלישה פרטית, אחסון מלא,
// או מכשיר שמנקה לבד. הדרישה: האפליקציה אומרת את זה, ממשיכה לעבוד, ומה שנעשה
// מגיע למחסן — כדי שרענון לא ימחק את היום.
// ---------------------------------------------------------------------------
import { test, expect, readState, waitSynced, gistState, addQuickTask, gotoTab, reload, sleep } from '../cloud/fixtures'
import { encryptJSON } from '../cloud/crypto'
import { baseState } from '../cloud/state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(120_000)

/** משתיק את השמירה של המצב (רק את המפתח של האפליקציה) */
const breakSave = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const proto = Storage.prototype as any
    if (!proto.__origSet) proto.__origSet = proto.setItem
    proto.setItem = function (k: string, v: string) {
      if (k === 'life-os-v1') throw new DOMException('quota', 'QuotaExceededError')
      return proto.__origSet.call(this, k, v)
    }
  })

const fixSave = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const proto = Storage.prototype as any
    if (proto.__origSet) proto.setItem = proto.__origSet
  })

test('אחסון מלא: פס אזהרה, האפליקציה ממשיכה, והשינוי מגיע למחסן — ואחרי שהאחסון מתפנה הוא נשמר גם ברענון', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/שמירה נכשלה/] })
  await waitSynced(A.page)

  await breakSave(A.page)
  const title = 'משימה כשהאחסון מלא'
  await addQuickTask(A.page, title)

  // הפס מופיע, והמשימה על המסך (הזיכרון עובד)
  await expect(A.page.getByText('השמירה המקומית נכשלה')).toBeVisible({ timeout: 10_000 })
  await expect(A.page.getByText(title, { exact: true }).first()).toBeVisible()

  // ...והשינוי מגיע למחסן, כי שם הוא שורד רענון
  await expect
    .poll(async () => (await gistState(fake, key)).tasks.some((t: any) => t.title === title), { timeout: 30_000 })
    .toBe(true)

  // האחסון מתפנה: הפס נעלם עם השינוי הבא, והמצב נכתב באמת
  await fixSave(A.page)
  const second = 'משימה אחרי שהתפנה מקום'
  await addQuickTask(A.page, second)
  await expect(A.page.getByText('השמירה המקומית נכשלה')).toHaveCount(0, { timeout: 10_000 })
  await expect
    .poll(
      async () =>
        A.page.evaluate(() => {
          try {
            const s = JSON.parse(localStorage.getItem('life-os-v1') || '{}')
            return (s.tasks ?? []).filter((t: any) => /משימה כשהאחסון מלא|משימה אחרי שהתפנה מקום/.test(t.title)).length
          } catch {
            return -1
          }
        }),
      { timeout: 10_000 },
    )
    .toBe(2)

  // רענון — שתי המשימות שם
  await reload(A.page)
  await expect(A.page.getByText(second, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(A.page.getByText(title, { exact: true }).first()).toBeVisible()
})

test('האחסון נמחק מתחת לרגליים (ניקוי של הדפדפן): האפליקציה חוזרת מהמחסן ולא מתחילה מאפס', async ({ fake, key, openDevice }) => {
  const st = baseState({ deviceId: 'dA' })
  st.tasks.push({ ...st.tasks[0], id: 't-keep', title: 'משימה שחייבת לחזור', updatedAt: Date.now() })
  fake.setGistFile('life-os.json', await encryptJSON(st, key))
  const A = await openDevice({ tag: 'A', state: st })
  await waitSynced(A.page)
  await expect(A.page.getByText('משימה שחייבת לחזור', { exact: true }).first()).toBeVisible()

  // ניקוי מלא של האחסון — חוץ ממה שדרוש לחיבור למחסן
  await A.page.evaluate(() => {
    const keep = ['life-os-gh-token', 'life-os-gist-id', 'life-os-crypt-key', 'life-os-notify-key']
    const saved = keep.map((k) => [k, localStorage.getItem(k)] as const)
    localStorage.clear()
    for (const [k, v] of saved) if (v) localStorage.setItem(k, v)
  })
  await reload(A.page)

  // חוזר מהמחסן, בלי מסך אפס
  await expect(A.page.getByText('משימה שחייבת לחזור', { exact: true }).first()).toBeVisible({ timeout: 25_000 })
  await gotoTab(A.page, 'היום')
  const s = await readState(A.page)
  expect(s.tasks.some((t) => t.id === 't-keep')).toBe(true)
  expect(s.tracks.length).toBeGreaterThan(0)
})

test('שתי לשוניות פתוחות על אותו מכשיר: כתיבה בשנייה לא מוחקת את מה שהראשונה עשתה', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  const B = await A.context.newPage()
  await B.goto('/')
  await expect(B.getByRole('button', { name: 'שיחה' }).first()).toBeVisible({ timeout: 20_000 })

  await addQuickTask(A.page, 'מלשונית א')
  await sleep(1_500)
  await addQuickTask(B, 'מלשונית ב')

  // שתיהן במחסן, ואף אחת לא נמחקה
  await expect
    .poll(
      async () => {
        const s = await gistState(fake, key)
        return ['מלשונית א', 'מלשונית ב'].filter((x) => s.tasks.some((t: any) => t.title === x)).length
      },
      { timeout: 40_000 },
    )
    .toBe(2)
  await reload(A.page)
  await expect(A.page.getByText('מלשונית ב', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(A.page.getByText('מלשונית א', { exact: true }).first()).toBeVisible()
})
