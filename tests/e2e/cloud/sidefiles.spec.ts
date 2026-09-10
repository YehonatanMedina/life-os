// ---------------------------------------------------------------------------
// קבצי הצד: atlas-context.json, pulse.json, week-digest.json (מוצפנים במפתח
// הניתוח) ו-news-feedback.json (גלוי) נכתבים באותה דחיפה של המצב — ולא נשלחים
// שוב כשרק generatedAt/updatedAt השתנו.
// ---------------------------------------------------------------------------
import { test, expect, waitSynced, waitPatch, quiet, addQuickTask, habitCheck, gotoSettings } from './fixtures'
import { decryptJSON, encryptJSON, isEnvelope, newKey } from './crypto'
import { baseState, logicalToday, PLAN_DAY_TITLE, SEED_TASK_TITLE } from './state'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(120_000)

const today = logicalToday()

test('כל דחיפה שמשנה תוכן נושאת את ארבעת קבצי הצד, בצורה ובהצפנה הנכונות', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  fake.setRepoFile('thread.json', await encryptJSON({ messages: [] }, ai))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [/status of 404/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  // שינוי תוכן #1 — משימה
  let n = fake.patches.length
  const title = 'משימה שתופיע בהקשר של אטלס'
  await addQuickTask(A.page, title)
  const p1 = await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  for (const f of ['atlas-context.json', 'pulse.json', 'week-digest.json', 'news-feedback.json']) {
    expect(Object.keys(p1.files), `patch #1 carries ${f}`).toContain(f)
  }
  // הצפנה: שלושת קבצי הניתוח במעטפה, המשוב גלוי
  expect(isEnvelope(p1.files['atlas-context.json'])).toBe(true)
  expect(isEnvelope(p1.files['pulse.json'])).toBe(true)
  expect(isEnvelope(p1.files['week-digest.json'])).toBe(true)
  expect(isEnvelope(p1.files['news-feedback.json'])).toBe(false)
  // ולא במפתח הסנכרון — במפתח הניתוח
  await expect(decryptJSON(p1.files['atlas-context.json'], key)).rejects.toThrow()

  const ctx = await decryptJSON(p1.files['atlas-context.json'], ai)
  expect(ctx.today).toBe(today)
  expect(ctx.settings).toMatchObject({ wakeTime: '07:30', bedTime: '23:30', tokenMinutes: 90 })
  expect(ctx.settings.aiKey).toBeUndefined()
  expect(ctx.tracks.map((t: any) => t.name)).toContain('לימודים')
  expect(ctx.tasks.map((t: any) => t.title)).toEqual(expect.arrayContaining([title, SEED_TASK_TITLE]))
  expect(ctx.tasks.find((t: any) => t.title === title)).toMatchObject({ due: today, status: 'todo' })
  expect(ctx.rules.length).toBeGreaterThan(0)
  expect(ctx.habits.map((h: any) => h.name)).toEqual(expect.arrayContaining(['שגרת בוקר', 'שגרת ערב']))
  expect(ctx.workoutPlan[0]).toMatchObject({ title: PLAN_DAY_TITLE })
  expect(ctx.workoutPlan[0].exercises).toHaveLength(2)
  expect(Array.isArray(ctx.days)).toBe(true)
  expect(ctx.stats.thisWeek.weekStart).toBeTruthy()

  const pulse = await decryptJSON(p1.files['pulse.json'], ai)
  expect(pulse).toMatchObject({ today, wakeTime: '07:30', bedTime: '23:30', timer: null, habitsTotal: 3, habitsDone: 0 })
  expect(typeof pulse.minutesToday).toBe('number')
  expect(typeof pulse.tasksOpen).toBe('number')
  expect(pulse.tasksOpen).toBeGreaterThanOrEqual(2)
  expect(Array.isArray(pulse.deepBlocksToday)).toBe(true)
  expect(pulse.workoutPlanned).toBe(true)
  expect(pulse.workoutDone).toBe(false)

  const digest = await decryptJSON(p1.files['week-digest.json'], ai)
  expect(digest.today).toBe(today)
  expect(digest.weeks).toHaveLength(3)
  expect(digest.weeks[0].perDay).toHaveLength(7)
  expect(digest.settings).toMatchObject({ tokenMinutes: 90, dailyTokenGoal: 6 })

  const feedback = JSON.parse(p1.files['news-feedback.json'])
  expect(feedback.editions).toEqual([])
  expect(typeof feedback.updatedAt).toBe('string')

  // שינוי תוכן #2 — הרגל: ההקשר, הדופק והתקציר משתנים; המשוב על החדשות לא — ולכן לא נשלח שוב
  await quiet(fake, 3_000)
  n = fake.patches.length
  await habitCheck(A.page, 'שגרת בוקר').click()
  const p2 = await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  expect(Object.keys(p2.files)).toEqual(expect.arrayContaining(['atlas-context.json', 'life-os.json', 'pulse.json', 'week-digest.json']))
  const pulse2 = await decryptJSON(p2.files['pulse.json'], ai)
  expect(pulse2.habitsDone).toBe(1)
  const ctx2 = await decryptJSON(p2.files['atlas-context.json'], ai)
  expect(ctx2.days.find((d: any) => d.date === today)?.habitsDone).toEqual(['שגרת בוקר'])
})

test('שינוי שלא משנה את קבצי הצד (חוץ מ-generatedAt) לא שולח אותם שוב', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  fake.setRepoFile('thread.json', await encryptJSON({ messages: [] }, ai))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), login: true, allowConsole: [/status of 404/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  // דחיפה ראשונה בסשן שולחת הכל — מוציאים אותה מהדרך
  let n = fake.patches.length
  await addQuickTask(A.page, 'משימה ראשונה')
  await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  await quiet(fake, 3_000)

  // הגדרה שאף קובץ צד לא מכיל — צליל בסיום אסימון
  n = fake.patches.length
  await gotoSettings(A.page)
  await A.page.getByRole('switch', { name: 'צליל בסיום אסימון' }).click()
  const p = await waitPatch(fake, n, (x) => 'life-os.json' in x.files)
  // שלושת הקבצים המוצפנים לא נשלחים שוב (רק generatedAt היה משתנה בהם)
  for (const f of ['atlas-context.json', 'pulse.json', 'week-digest.json']) expect(Object.keys(p.files), `${f} re-sent`).not.toContain(f)
  // ואין דחיפה נוספת "מיותרת" אחריה
  await quiet(fake, 4_000)
  const encryptedSide = (x: { files: Record<string, string> }) => Object.keys(x.files).some((f) => /^(atlas-context|pulse|week-digest)\.json$/.test(f))
  expect(fake.patches.slice(n + 1).filter((x) => x.tag === 'A' && encryptedSide(x))).toEqual([])
})

test('news-feedback.json לא נשלח שוב כשרק updatedAt השתנה', async ({ fake, key, openDevice }) => {
  // באג אמיתי (ראו tests/reports/cloud.md, ממצא #4): הביטוי שמנקה את החותמת לפני ההשוואה
  // מצפה ל-"updatedAt":"…" בלי רווח, אבל המשוב נכתב עם JSON.stringify(…, null, 2) — "updatedAt": "…"
  // — ולכן החותמת אף פעם לא מנוקה והקובץ נשלח מחדש בכל דחיפה.
  test.fixme(true, 'news-feedback.json נשלח בכל PATCH — הרווח אחרי הנקודתיים לא נתפס ב-stamp()')
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await quiet(fake, 3_000)
  let n = fake.patches.length
  await addQuickTask(A.page, 'משימה ראשונה')
  const p1 = await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  expect(Object.keys(p1.files)).toContain('news-feedback.json')
  await quiet(fake, 3_000)
  n = fake.patches.length
  await addQuickTask(A.page, 'משימה שנייה')
  const p2 = await waitPatch(fake, n, (p) => 'life-os.json' in p.files)
  expect(Object.keys(p2.files)).toEqual(['life-os.json'])
})

test('בלי מפתח ניתוח: רק news-feedback.json (גלוי) מצטרף למצב', async ({ fake, key, openDevice }) => {
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist' }), key))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA' }) })
  await waitSynced(A.page)
  await quiet(fake, 3_000)
  const n = fake.patches.length
  await addQuickTask(A.page, 'משימה בלי מפתח')
  const p = await waitPatch(fake, n, (x) => 'life-os.json' in x.files)
  expect(Object.keys(p.files).sort()).toEqual(['life-os.json', 'news-feedback.json'])
  expect(isEnvelope(p.files['life-os.json'])).toBe(true)
  expect(isEnvelope(p.files['news-feedback.json'])).toBe(false)
  // המצב במחסן אף פעם לא גלוי, ולא מכיל את הטיימר
  const remote = await decryptJSON(p.files['life-os.json'], key)
  expect(remote.timer).toBeNull()
  expect(remote.tasks.some((t: any) => t.title === 'משימה בלי מפתח')).toBe(true)
})
