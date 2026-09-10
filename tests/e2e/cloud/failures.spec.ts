// ---------------------------------------------------------------------------
// מצבי כשל: 401, אין רשת, מחסן לא קריא, מפתח שגוי, התנגשות 409.
// העיקרון: המכשיר אף פעם לא מוחק את מה שיש לו, ואף פעם לא דורס מחסן שהוא
// לא הצליח לקרוא.
// ---------------------------------------------------------------------------
import {
  test, expect, readState, waitSynced, waitStatus, syncLabel, gistState, waitPatch, quiet, gotoTab, gotoSettings,
  addQuickTask, sleep,
} from './fixtures'
import { encryptJSON, newKey } from './crypto'
import { baseState, SEED_TASK_ID, SEED_TASK_TITLE } from './state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(120_000)

test('401: אטלס מציג שגיאת גישה, הסנכרון במצב שגיאה, והנתונים המקומיים נשארים', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  fake.hooks.push(({ tag }) => (tag === 'A' ? { status: 401, body: JSON.stringify({ message: 'Bad credentials' }) } : undefined))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [/status of 401/] })

  await waitStatus(A.page, 'הסנכרון נכשל')
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()
  await gotoTab(A.page, 'אטלס')
  await expect(A.page.getByText('אין גישה למאגר של אטלס — הטוקן פג או חסר הרשאה.')).toBeVisible({ timeout: 15_000 })
  await gotoSettings(A.page)
  await expect(A.page.getByText('האסימון נדחה או פג. צור אחד חדש והדבק אותו כאן.')).toBeVisible()
  await expect(A.page.locator('.sync-grid')).toContainText('auth')

  // הנתונים המקומיים שלמים, ושום דבר לא נכתב למחסן
  const s = await readState(A.page)
  expect(s.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  expect(s.tracks.filter((t) => !t.deleted).length).toBeGreaterThanOrEqual(4)
  expect(fake.patches).toEqual([])
  expect(fake.issues).toEqual([])
})

test('אין אינטרנט: שינויים נערמים, ונדחפים כשהרשת חוזרת', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  await A.context.setOffline(true)
  const n = fake.patches.length
  const t1 = 'משימה בלי רשת 1'
  const t2 = 'משימה בלי רשת 2'
  await addQuickTask(A.page, t1)
  await waitStatus(A.page, 'אין אינטרנט', 10_000)
  await addQuickTask(A.page, t2)
  await sleep(5_000)
  expect(fake.patches.length).toBe(n)
  // ובלי רשת — עדיין הכל מקומית
  const off = await readState(A.page)
  expect(off.tasks.map((t) => t.title)).toEqual(expect.arrayContaining([t1, t2]))

  await A.context.setOffline(false)
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 15_000)
  expect(p).toBeTruthy()
  await waitSynced(A.page)
  const remote = await gistState(fake, key)
  expect(remote.tasks.map((t) => t.title)).toEqual(expect.arrayContaining([t1, t2]))
})

test('מפתח שגוי: שגיאה ברורה, הנתונים המקומיים נשמרים, ושום דבר לא נכתב על המחסן של האחרים', async ({ fake, key, openDevice }) => {
  const otherKey = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dOther' }), otherKey))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })

  await waitStatus(A.page, 'הסנכרון נכשל')
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()
  await gotoSettings(A.page)
  await expect(A.page.getByText('המחסן מוצפן וחסר המפתח — הדבק את מזהה החיבור המלא (עם החלק שאחרי #).')).toBeVisible()
  await expect(A.page.locator('.sync-grid')).toContainText('bad-key')

  // שינוי מקומי: נשמר אצלנו, אבל אסור שיידרוס את מה שהמכשיר האחר הצפין
  await gotoTab(A.page, 'היום')
  await addQuickTask(A.page, 'משימה עם מפתח שגוי')
  await sleep(6_000)
  expect(fake.patches).toEqual([])
  expect(fake.files['life-os.json']).toBeTruthy()
  const s = await readState(A.page)
  expect(s.tasks.some((t) => t.title === 'משימה עם מפתח שגוי')).toBe(true)
  expect(s.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  await expect(syncLabel(A.page)).toHaveText('הסנכרון נכשל')
})

test('מחסן עם JSON שבור: הנתונים המקומיים לא נמחקים', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', '{"enc":1,"iv":"broken", this is not json')
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()
  await sleep(4_000)
  const s = await readState(A.page)
  expect(s.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  expect(s.habits.filter((h) => !h.deleted)).toHaveLength(3)
})

test('מחסן עם JSON שבור: האפליקציה מציגה שגיאה ולא דורסת את הקובץ בשקט', async ({ fake, key, openDevice }) => {
  // באג אמיתי (ראו tests/reports/cloud.md, ממצא #3): readRemote מחזיר null גם כשהקובץ קיים
  // אבל לא קריא, והאפליקציה מדווחת "מסונכרן" וכותבת מעליו בדחיפה הבאה. גיסט בפורמט
  // שגרסה ישנה במכשיר לא מכירה (למשל מעטפה עתידית) יידרס באותה דרך.
  test.fixme(true, 'מחסן לא קריא נחשב "אין מחסן" — סטטוס מסונכרן וכתיבה מעל הקובץ')
  fake.setGistFile('life-os.json', '{"enc":1,"iv":"broken", this is not json')
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitStatus(A.page, 'הסנכרון נכשל', 10_000)
  await addQuickTask(A.page, 'משימה מול מחסן שבור')
  await sleep(6_000)
  expect(fake.patches).toEqual([])
})

test('התנגשות 409 בכתיבה: נסיון חוזר מצליח והשינוי מגיע למחסן', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/status of 409/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  let conflicts = 0
  fake.hooks.push(({ tag, method }) => {
    if (tag === 'A' && method === 'PATCH' && conflicts === 0) {
      conflicts++
      return { status: 409, body: JSON.stringify({ message: 'Conflict' }) }
    }
    return undefined
  })
  const r0 = fake.requests.length
  const n = fake.patches.length
  await addQuickTask(A.page, 'משימה שנתקלה בהתנגשות')
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 20_000)
  expect(p).toBeTruthy()
  expect(conflicts).toBe(1)
  const statuses = fake.requests.slice(r0).filter((r) => r.tag === 'A' && r.method === 'PATCH').map((r) => r.status)
  expect(statuses[0]).toBe(409)
  expect(statuses).toContain(200)
  await waitSynced(A.page)
  const remote = await gistState(fake, key)
  expect(remote.tasks.some((t) => t.title === 'משימה שנתקלה בהתנגשות')).toBe(true)
})
