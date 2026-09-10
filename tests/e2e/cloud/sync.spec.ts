// ---------------------------------------------------------------------------
// "הכל תמיד מסונכרן בכל מכשיר" — שני הקשרי דפדפן (A, B) על אותו מחסן מזויף.
// מרווח המשיכה באפליקציה הוא 10 שניות, השקט לפני דחיפה 2 שניות — לכן
// ההמתנות כאן נדיבות (עד 35 שניות) אבל דטרמיניסטיות.
// ---------------------------------------------------------------------------
import {
  test, expect, readState, waitSynced, waitStatus, gistState, waitPatch, quiet, gotoTab, gotoSettings,
  addQuickTask, habitCheck, storageOf, sleep, reload, FAKE_TOKEN,
} from './fixtures'
import { encryptJSON, setupHash } from './crypto'
import {
  baseState, logicalToday, SEED_TASK_ID, SEED_TASK_TITLE, EX_A, EX_A_NAME, EX_B, EX_B_NAME, T1,
} from './state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)

const today = logicalToday()

test('A מוסיף משימה → B מציג אותה במסך היום ובפרויקטים תוך 30 שניות', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(A.page)
  await waitSynced(B.page)

  const title = 'משימה שנולדה במכשיר A'
  const n = fake.patches.length
  await addQuickTask(A.page, title)
  await waitStatus(A.page, 'ממתין לשליחה', 5_000)
  const p = await waitPatch(fake, n, (x) => 'life-os.json' in x.files)
  expect(p.tag).toBe('A')
  const remote = await gistState(fake, key)
  expect(remote.tasks.find((t) => t.title === title)?.due).toBe(today)

  // B — מסך היום
  await expect(B.page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  const sb = await readState(B.page)
  const tb = sb.tasks.find((t) => t.title === title)
  expect(tb).toBeTruthy()
  expect(tb!.deleted).toBeFalsy()
  // B — פרויקטים (הלוח פותח על המסלול הראשון; "הכל" מראה את כולם)
  await gotoTab(B.page, 'פרויקטים')
  await B.page.getByRole('button', { name: 'הכל', exact: true }).click()
  await expect(B.page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 10_000 })
  // ואין שכפול — משימה אחת עם המזהה הזה בשני המכשירים ובמחסן
  const sa = await readState(A.page)
  expect(sa.tasks.filter((t) => t.title === title)).toHaveLength(1)
  expect(sb.tasks.filter((t) => t.title === title)).toHaveLength(1)
  expect((await gistState(fake, key)).tasks.filter((t) => t.title === title)).toHaveLength(1)
})

test('הרגל שונה בכל מכשיר באותה דקה — שניהם שורדים בשני המכשירים', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(A.page)
  await waitSynced(B.page)

  // כמעט באותו רגע — כדי שהדחיפות יתנגשו
  await Promise.all([habitCheck(A.page, 'שגרת בוקר').click(), habitCheck(B.page, 'שגרת ערב').click()])
  await expect(habitCheck(A.page, 'שגרת בוקר')).toHaveAttribute('aria-pressed', 'true')
  await expect(habitCheck(B.page, 'שגרת ערב')).toHaveAttribute('aria-pressed', 'true')

  const both = (s: any) => {
    const d = (s.days ?? []).find((x: any) => x.date === today)
    return !!d?.habits?.['hb-morning'] && !!d?.habits?.['hb-night']
  }
  await expect.poll(async () => both(await readState(A.page)), { timeout: 40_000, intervals: [500] }).toBe(true)
  await expect.poll(async () => both(await readState(B.page)), { timeout: 40_000, intervals: [500] }).toBe(true)
  await expect.poll(async () => both(await gistState(fake, key)), { timeout: 20_000 }).toBe(true)

  // ובממשק — שני הסימונים דלוקים בשני המכשירים
  await expect(habitCheck(A.page, 'שגרת ערב')).toHaveAttribute('aria-pressed', 'true')
  await expect(habitCheck(B.page, 'שגרת בוקר')).toHaveAttribute('aria-pressed', 'true')
  // ושום הרגל לא כובה בטעות
  const dA = (await readState(A.page)).days.find((x) => x.date === today)!
  expect(dA.habitsAt?.['hb-morning']).toBeGreaterThan(T1)
  expect(dA.habitsAt?.['hb-night']).toBeGreaterThan(T1)
})

test('שני מכשירים רושמים תרגילים שונים באותו יומן אימון — שני התרגילים שורדים', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(A.page)
  await waitSynced(B.page)

  const openWorkout = async (page: typeof A.page) => {
    await page.getByRole('button', { name: /פתיחת האימון|המשך רישום|רישום אימון/ }).first().click()
    const dlg = page.getByRole('dialog', { name: 'אימון' })
    await expect(dlg).toBeVisible()
    return dlg
  }
  const exCard = (dlg: ReturnType<typeof A.page.locator>, name: string) =>
    dlg.locator('.card.pad').filter({ has: A.page.locator('b', { hasText: name }) }).first()

  const dA = await openWorkout(A.page)
  const dB = await openWorkout(B.page)
  const cardA = dA.locator('.card.pad').filter({ hasText: EX_A_NAME }).first()
  const cardB = dB.locator('.card.pad').filter({ hasText: EX_B_NAME }).first()
  await Promise.all([cardA.locator('.setchip').first().click(), cardB.locator('.setchip').first().click()])
  await expect(cardA.locator('.setchip').first()).toHaveClass(/on/)
  await expect(cardB.locator('.setchip').first()).toHaveClass(/on/)
  void exCard

  const both = (s: any) => {
    const w = (s.workouts ?? []).find((x: any) => x.date === today && !x.deleted)
    return !!w?.sets?.[EX_A]?.length && !!w?.sets?.[EX_B]?.length
  }
  await expect.poll(async () => both(await readState(A.page)), { timeout: 40_000, intervals: [500] }).toBe(true)
  await expect.poll(async () => both(await readState(B.page)), { timeout: 40_000, intervals: [500] }).toBe(true)
  await expect.poll(async () => both(await gistState(fake, key)), { timeout: 20_000 }).toBe(true)

  // בממשק: הסט של המכשיר האחר דלוק גם כאן (הגיליון פתוח ומתעדכן מהחנות)
  await expect(dA.locator('.card.pad').filter({ hasText: EX_B_NAME }).locator('.setchip').first()).toHaveClass(/on/, { timeout: 10_000 })
  await expect(dB.locator('.card.pad').filter({ hasText: EX_A_NAME }).locator('.setchip').first()).toHaveClass(/on/, { timeout: 10_000 })
  // ורשומת אימון אחת בלבד לתאריך
  const sa = await readState(A.page)
  expect(sa.workouts.filter((w) => w.date === today)).toHaveLength(1)
  expect(sa.workouts[0].setsAt?.[EX_A]).toBeGreaterThan(T1)
  expect(sa.workouts[0].setsAt?.[EX_B]).toBeGreaterThan(T1)
})

test('A מוחק משימה → B מאבד אותה, והיא לא חוזרת אחרי ש-B כותב משהו אחר', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(A.page)
  await waitSynced(B.page)
  await expect(B.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()

  // מחיקה דרך לוח הפרויקטים: כרטיס → גיליון → מחיקה → אישור
  await gotoTab(A.page, 'פרויקטים')
  await A.page.getByText(SEED_TASK_TITLE, { exact: true }).first().click()
  await A.page.getByRole('button', { name: 'מחיקה' }).first().click()
  await A.page.getByRole('button', { name: 'מחיקה' }).last().click()
  await expect.poll(async () => (await readState(A.page)).tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBe(true)

  // B מאבד אותה
  await expect(B.page.getByText(SEED_TASK_TITLE, { exact: true })).toHaveCount(0, { timeout: 35_000 })
  await expect.poll(async () => (await readState(B.page)).tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBe(true)

  // B כותב משהו אחר — המחיקה חייבת לשרוד את הדחיפה שלו
  const n = fake.patches.length
  await addQuickTask(B.page, 'משימה חדשה מ-B אחרי המחיקה')
  await waitPatch(fake, n, (p) => p.tag === 'B' && 'life-os.json' in p.files)
  await quiet(fake, 3_000)
  const remote = await gistState(fake, key)
  expect(remote.tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBe(true)
  expect(remote.tasks.find((t) => t.title === 'משימה חדשה מ-B אחרי המחיקה')).toBeTruthy()
  // ועוד סיבוב משיכה ב-A — עדיין מחוקה, ולא חזרה לממשק
  await sleep(12_000)
  expect((await readState(A.page)).tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBe(true)
  await gotoTab(A.page, 'היום')
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true })).toHaveCount(0)
  await expect(A.page.getByText('משימה חדשה מ-B אחרי המחיקה', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
})

test('הגדרה שהשתנתה ב-A מופיעה ב-B', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB' }) })
  await waitSynced(A.page)
  await waitSynced(B.page)

  await gotoSettings(A.page)
  // שעת קימה 07:30 → 06:30
  const wakeBtn = (page: typeof A.page) => page.locator('label.field', { hasText: 'שעת קימה' }).locator('button')
  await expect(wakeBtn(A.page)).toHaveText('07:30')
  await wakeBtn(A.page).click()
  await A.page.getByRole('button', { name: '06', exact: true }).click()
  await expect.poll(async () => (await readState(A.page)).settings.wakeTime).toBe('06:30')

  await expect.poll(async () => (await readState(B.page)).settings.wakeTime, { timeout: 35_000, intervals: [500] }).toBe('06:30')
  await gotoSettings(B.page)
  await expect(wakeBtn(B.page)).toHaveText('06:30')
  // ההגדרות האחרות של B לא נפגעו
  const sb = await readState(B.page)
  expect(sb.settings.bedTime).toBe('23:30')
  expect(sb.settings.onboarded).toBe(true)
})

test('מכשיר חדש עם קישור התקנה: המצב מהמחסן מחליף את הזרע, deviceId נשאר שלו', async ({ fake, key, openDevice }) => {
  const remote = baseState({ deviceId: 'dMain', aiKey: 'k'.repeat(43) })
  // רשומות שמוכיחות "החלפה" ולא "מיזוג": מסלול מהזרע שנמחק, ומסלול מותאם
  remote.tracks = [
    ...remote.tracks.map((t) => (t.id === 'trk-project' ? { ...t, deleted: true, updatedAt: T1 } : t)),
    { id: 'trk-custom', updatedAt: T1, name: 'מסלול מותאם', emoji: '🧪', color: '#123456', order: 9, board: true },
  ]
  remote.settings.wakeTime = '05:45'
  fake.setGistFile('life-os.json', await encryptJSON(remote, key))

  const C = await openDevice({
    tag: 'C',
    state: null,
    creds: false,
    url: '/' + setupHash({ t: FAKE_TOKEN, p: `${fake.gistId}#${key}`, ak: remote.settings.aiKey }),
    // יש מפתח ניתוח → אטלס מושך thread.json/today.json שעדיין לא קיימים במאגר
    allowConsole: [/status of 404/],
  })
  await waitSynced(C.page, 20_000)
  // הקישור נעלם מהכתובת
  expect(new URL(C.page.url()).hash).toBe('')
  const creds = await C.page.evaluate(() => ({
    t: localStorage.getItem('life-os-gh-token'), g: localStorage.getItem('life-os-gist-id'), k: localStorage.getItem('life-os-crypt-key'),
  }))
  expect(creds).toEqual({ t: FAKE_TOKEN, g: fake.gistId, k: key })

  const sc = await readState(C.page)
  expect(sc.deviceId).not.toBe('dMain')
  expect(sc.deviceId).toMatch(/^d[a-z0-9]{8}$/)
  expect(sc.tracks.find((t) => t.id === 'trk-custom')?.name).toBe('מסלול מותאם')
  expect(sc.tracks.find((t) => t.id === 'trk-project')?.deleted).toBe(true)
  expect(sc.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  expect(sc.settings.wakeTime).toBe('05:45')
  expect(sc.settings.aiKey).toBe(remote.settings.aiKey)
  await expect(C.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()

  // המחסן לא נדרס בהגדרות ברירת המחדל של המכשיר החדש
  await quiet(fake, 3_000)
  const after = await gistState(fake, key)
  expect(after.settings.wakeTime).toBe('05:45')
  expect(after.tracks.find((t) => t.id === 'trk-project')?.deleted).toBe(true)
  expect(after.deviceId).not.toBe('dMain')
})

test('מכשיר שנפתח פעם אחת לפני החיבור (הזרע כבר נשמר) — הקישור לא דורס את הגדרות המחסן', async ({ fake, key, openDevice }) => {
  // באג אמיתי (ראו tests/reports/cloud.md, ממצא #1): freshInstall נקבע רק לפי "אין כלום ב-localStorage".
  // מכשיר שנפתח פעם אחת (סגירת כרטיס ההסבר → settingsUpdatedAt טרי) ואז חובר, מנצח במיזוג ההגדרות
  // ודורס במחסן את שעת הקימה, השם וכל שאר ההגדרות של המכשיר הראשי.
  test.fixme(true, 'ההגדרות של המחסן נדרסות בברירות המחדל של מכשיר שנפתח לפני החיבור')
  const remote = baseState({ deviceId: 'dMain', aiKey: 'k'.repeat(43) })
  remote.settings.wakeTime = '05:45'
  remote.settings.name = 'יהונתן'
  fake.setGistFile('life-os.json', await encryptJSON(remote, key))

  // פתיחה ראשונה בלי חיבור: סוגרים את כרטיס ההסבר (זו הפעולה הראשונה של כל אחד),
  // וזה שומר את הזרע ב-localStorage עם חותמת הגדרות טרייה
  const C = await openDevice({ tag: 'C', state: null, creds: false, allowConsole: [/status of 404/] })
  await expect(C.page.getByText('הרגלי היום')).toBeVisible()
  await C.page.getByRole('button', { name: 'סגירה' }).first().click()
  await expect.poll(async () => (await readState(C.page))?.settings?.onboarded).toBe(true)

  // עכשיו הקישור — כמו שקורה בפועל כשמעתיקים אותו מהמחשב לטלפון (מסמך חדש, לא רק שינוי hash)
  await reload(C.page, 'about:blank')
  await reload(C.page, '/' + setupHash({ t: FAKE_TOKEN, p: `${fake.gistId}#${key}`, ak: remote.settings.aiKey }))
  await waitSynced(C.page, 20_000)
  await quiet(fake, 3_000)

  const sc = await readState(C.page)
  const after = await gistState(fake, key)
  // ההגדרות של המחסן (המכשיר הראשי) חייבות לשרוד — לא ברירות המחדל של מכשיר ריק
  expect(sc.settings.wakeTime).toBe('05:45')
  expect(sc.settings.name).toBe('יהונתן')
  expect(after.settings.wakeTime).toBe('05:45')
  expect(after.settings.name).toBe('יהונתן')
  expect(sc.settings.aiKey).toBe(remote.settings.aiKey)
})

test('הרג האפליקציה: שינוי שהדחיפה שלו נכשלה נדחף בפתיחה הבאה תוך 15 שניות', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  let blockA = false
  fake.hooks.push(({ tag, method }) => (blockA && tag === 'A' && method === 'PATCH' ? { status: 500 } : undefined))

  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }), allowConsole: [/status of 500/] })
  await waitSynced(A.page)
  blockA = true
  const title = 'שינוי לפני שהטלפון הרג את האפליקציה'
  const reqs = fake.requests.length
  await addQuickTask(A.page, title)
  // הדחיפה נוסתה ונכשלה
  await expect.poll(() => fake.requests.slice(reqs).filter((r) => r.tag === 'A' && r.method === 'PATCH' && r.status === 500).length, { timeout: 15_000 }).toBeGreaterThan(0)
  await waitStatus(A.page, 'הסנכרון נכשל', 10_000)
  expect((await gistState(fake, key)).tasks.find((t) => t.title === title)).toBeUndefined()

  // "הרג": שומרים את האחסון של המכשיר, סוגרים, ופותחים מחדש עם אותו אחסון
  const storage = await storageOf(A.context)
  await A.context.close()
  blockA = false
  const n = fake.patches.length
  const A2 = await openDevice({ tag: 'A', storageState: storage })
  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 15_000)
  expect(p).toBeTruthy()
  const remote = await gistState(fake, key)
  expect(remote.tasks.find((t) => t.title === title)?.deleted).toBeFalsy()
  await waitSynced(A2.page)
  await expect(A2.page.getByText(title, { exact: true }).first()).toBeVisible()
})

test('remoteBehind: מחסן שהוחלף בתמונה ישנה בלי רשומה מקבל אותה בחזרה במשיכה הבאה', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  // מישהו (גרסה ישנה במכשיר אחר) כתב תמונה בלי המשימה מהזרע
  const stale = baseState({ deviceId: 'dOld' })
  stale.tasks = []
  stale.lastSyncAt = T1 - 1000
  fake.setGistFile('life-os.json', await encryptJSON(stale, key))
  const n = fake.patches.length

  const p = await waitPatch(fake, n, (x) => x.tag === 'A' && 'life-os.json' in x.files, 20_000)
  expect(p).toBeTruthy()
  const remote = await gistState(fake, key)
  expect(remote.tasks.find((t) => t.id === SEED_TASK_ID)?.title).toBe(SEED_TASK_TITLE)
  // והמשימה לא נעלמה מקומית לרגע
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true }).first()).toBeVisible()
  expect((await readState(A.page)).tasks.find((t) => t.id === SEED_TASK_ID)?.deleted).toBeFalsy()
  await waitSynced(A.page)
})
