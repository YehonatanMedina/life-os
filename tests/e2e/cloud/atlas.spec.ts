// ---------------------------------------------------------------------------
// אטלס מקצה לקצה מול מאגר מזויף: הודעה → Issue מוצפן; thread.json עם תשובה
// ופקודות → ביצוע פעם אחת בכל המכשירים, צ׳יפים עם ביטול, פתק הבוקר,
// ו-atlasApplied שמסתנכרן.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import {
  test, expect, readState, readAtlasCache, waitSynced, waitPatch, quiet, gotoTab, gotoSettings, reload, sleep,
} from './fixtures'
import { decryptJSON, encryptJSON, newKey } from './crypto'
import {
  baseState, logicalToday, weekStartISO, PLAN_DAY_ID, SEED_EVENT_ID, SEED_EVENT_TITLE, SEED_TASK_ID, SEED_TASK_TITLE, T1,
} from './state'
import type { AppState } from '../../../src/types'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(170_000)

const today = logicalToday()
const ws = weekStartISO(today)

const EV_TITLE = 'רופא שיניים'
const TK_TITLE = 'להתקשר לרופא'
const RL_TITLE = 'תשלום שכירות'
const EX_NAME = 'דדליפט'
const GOAL = 'לסיים את הפרויקט'
const NOTE = 'בוקר טוב — היום מבחן קטן, ואחריו לנוח.'
const REPLY = 'קבעתי את רופא השיניים, הוספתי משימה ובלוק חודשי, ועדכנתי את התוכנית.'

const CMD_IDS = ['c-ev1', 'c-tk1', 'c-rl1', 'c-ex1', 'c-wg1', 'c-pt1', 'c-de1']
const commands = () => [
  { id: 'c-ev1', op: 'addEvent', event: { title: EV_TITLE, date: today, start: '16:00', end: '17:00', kind: 'personal' } },
  { id: 'c-tk1', op: 'addTask', task: { title: TK_TITLE, trackId: 'trk-life', due: today } },
  { id: 'c-rl1', op: 'addRule', rule: { title: RL_TITLE, kind: 'block', start: '10:00', end: '10:30', freq: 'monthly', monthDay: 1, from: today } },
  { id: 'c-ex1', op: 'addExercise', dayId: PLAN_DAY_ID, exercise: { name: EX_NAME, sets: 3, reps: '5' } },
  { id: 'c-wg1', op: 'setWeekGoals', weekStart: ws, goals: [{ text: GOAL, trackId: 'trk-study' }] },
  { id: 'c-pt1', op: 'patchTask', taskId: SEED_TASK_ID, patch: { status: 'done' } },
  { id: 'c-de1', op: 'deleteEvent', eventId: SEED_EVENT_ID },
]

async function writeReply(fake: any, ai: string, userMsg: { id: string; at: string; text: string }) {
  const thread = {
    messages: [
      { id: userMsg.id, at: userMsg.at, from: 'user', text: userMsg.text },
      { id: 'a-reply-1', at: new Date().toISOString(), from: 'atlas', text: REPLY, replyTo: userMsg.id, commands: commands() },
    ],
  }
  fake.setRepoFile('thread.json', await encryptJSON(thread, ai))
  fake.setRepoFile('today.json', await encryptJSON({ date: today, text: NOTE, generatedAt: new Date().toISOString() }, ai))
}

/** מה שנשאר במצב אחרי שהפקודות בוצעו — לזריעת המחסן בבדיקות המכשיר השני */
function appliedState(s: AppState, at: number): AppState {
  const day = s.workoutPlan.find((d) => d.id === PLAN_DAY_ID)!
  return {
    ...s,
    events: [
      ...s.events.map((e) => (e.id === SEED_EVENT_ID ? { ...e, deleted: true, touched: true, updatedAt: at } : e)),
      { id: 'e-c-ev1', updatedAt: at, title: EV_TITLE, date: today, start: '16:00', end: '17:00', allDay: false, kind: 'personal', touched: true },
    ],
    tasks: [
      ...s.tasks.map((t) => (t.id === SEED_TASK_ID ? { ...t, status: 'done' as const, doneAt: at, updatedAt: at } : t)),
      { id: 't-c-tk1', updatedAt: at, createdAt: at, title: TK_TITLE, trackId: 'trk-life', status: 'todo', due: today, order: 1 },
    ],
    rules: [
      ...s.rules,
      { id: 'rl-c-rl1', updatedAt: at, title: RL_TITLE, kind: 'block', start: '10:00', end: '10:30', days: [], freq: 'monthly', monthDay: 1, from: today, active: true },
    ],
    workoutPlan: s.workoutPlan.map((d) =>
      d.id === PLAN_DAY_ID ? { ...day, updatedAt: at, exercises: [...day.exercises, { id: 'ex-c-ex1', name: EX_NAME, sets: 3, reps: '5', metric: 'weight' }] } : d,
    ),
    weeks: [{ id: `wk-${ws}`, updatedAt: at, weekStart: ws, items: {}, progress: {}, goals: [{ id: 'g-c-wg1-0', text: GOAL, trackId: 'trk-study' }] }],
    atlasApplied: Object.fromEntries(CMD_IDS.map((id) => [id, at])),
  }
}

const count = (s: AppState) => ({
  events: s.events.filter((e) => e.id === 'e-c-ev1').length,
  liveEvents: s.events.filter((e) => e.title === EV_TITLE && !e.deleted).length,
  tasks: s.tasks.filter((t) => t.id === 't-c-tk1').length,
  rules: s.rules.filter((r) => r.id === 'rl-c-rl1').length,
  exercises: (s.workoutPlan.find((d) => d.id === PLAN_DAY_ID)?.exercises ?? []).filter((x) => x.name === EX_NAME).length,
  goals: (s.weeks.find((w) => w.weekStart === ws)?.goals ?? []).length,
})

async function openAtlas(page: Page) {
  await gotoTab(page, 'אטלס')
  await expect(page.getByPlaceholder('כתוב לאטלס…')).toBeVisible()
}

test('סבב מלא: הודעה → Issue מוצפן → תשובה עם פקודות מבוצעת פעם אחת, מוצגת בכל מסך, ניתנת לביטול', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  fake.setGistFile('life-os.json', await encryptJSON(baseState({ deviceId: 'dGist', aiKey: ai }), key))
  fake.setRepoFile('thread.json', await encryptJSON({ messages: [] }, ai))
  const A = await openDevice({ tag: 'A', state: baseState({ deviceId: 'dA', aiKey: ai }), allowConsole: [/status of 404/] })
  await waitSynced(A.page)
  await quiet(fake, 3_000)

  // -- שליחה ------------------------------------------------------------------
  await openAtlas(A.page)
  const text = 'קבעתי רופא שיניים היום ב-16:00, שעה.'
  await A.page.getByPlaceholder('כתוב לאטלס…').fill(text)
  await A.page.getByRole('button', { name: 'שלח' }).click()
  await expect(A.page.locator('.bubble.me', { hasText: text })).toBeVisible()
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()

  await expect.poll(() => fake.issues.length, { timeout: 10_000 }).toBe(1)
  const issue = fake.issues[0]
  expect(fake.requestsMatching(/^GET \/user$/, 'A').length).toBeGreaterThan(0)
  const body = await decryptJSON(issue.body, ai)
  expect(Object.keys(body).sort()).toEqual(['at', 'id', 'source', 'text'])
  expect(body.text).toBe(text)
  expect(body.source).toBe('app')
  expect(body.id).toMatch(/^u-/)
  expect(Number.isFinite(Date.parse(body.at))).toBe(true)
  expect(issue.title).toBe(body.id)
  // הגוף לא קריא בלי המפתח
  expect(issue.body).not.toContain('רופא')
  // ההקשר במחסן טרי לפני שהסוכן קורא אותו
  await waitPatch(fake, 0, (p) => 'atlas-context.json' in p.files, 15_000)

  // -- תשובה ------------------------------------------------------------------
  await writeReply(fake, ai, body)
  const landed = Date.now()
  // המשיכה המהירה היא כל 20 שניות על טיק של 10 — בפועל עד ~30 שניות מהרגע שהתשובה נחתה
  await expect(A.page.locator('.bubble.atlas', { hasText: REPLY })).toBeVisible({ timeout: 45_000 })
  console.log(`[atlas] reply visible ${Math.round((Date.now() - landed) / 1000)}s after it landed in the repo`)
  await expect(A.page.locator('.bubble.thinking')).toHaveCount(0)
  const chips = A.page.locator('.cmd')
  await expect(chips).toHaveCount(7)
  await expect(chips.filter({ hasText: 'ביטול' })).toHaveCount(7)
  await expect(chips.filter({ hasText: `נוסף ליומן: ${EV_TITLE}` })).toHaveCount(1)
  await expect(chips.filter({ hasText: `משימה חדשה: ${TK_TITLE}` })).toHaveCount(1)
  await expect(chips.filter({ hasText: `בלוק קבוע חדש: ${RL_TITLE}` })).toHaveCount(1)
  await expect(chips.filter({ hasText: `תרגיל נוסף: ${EX_NAME}` })).toHaveCount(1)
  await expect(chips.filter({ hasText: 'מטרות השבוע נקבעו (1)' })).toHaveCount(1)
  await expect(chips.filter({ hasText: `משימה עודכנה: ${SEED_TASK_TITLE}` })).toHaveCount(1)
  await expect(chips.filter({ hasText: `נמחק מהיומן: ${SEED_EVENT_TITLE}` })).toHaveCount(1)

  // -- המצב ---------------------------------------------------------------------
  const s = await readState(A.page)
  expect(Object.keys(s.atlasApplied ?? {}).sort()).toEqual([...CMD_IDS].sort())
  expect(s.events.find((e) => e.id === 'e-c-ev1')).toMatchObject({ title: EV_TITLE, date: today, start: '16:00', end: '17:00', allDay: false, touched: true })
  expect(s.tasks.find((t) => t.id === 't-c-tk1')).toMatchObject({ title: TK_TITLE, status: 'todo', due: today, trackId: 'trk-life' })
  expect(s.rules.find((r) => r.id === 'rl-c-rl1')).toMatchObject({ title: RL_TITLE, freq: 'monthly', monthDay: 1, active: true })
  expect(s.events.filter((e) => e.ruleId === 'rl-c-rl1' && !e.deleted).length).toBeGreaterThanOrEqual(3)
  expect(s.workoutPlan.find((d) => d.id === PLAN_DAY_ID)!.exercises.find((x) => x.id === 'ex-c-ex1')).toMatchObject({ name: EX_NAME, sets: 3, reps: '5', metric: 'weight' })
  expect(s.weeks.find((w) => w.weekStart === ws)?.goals).toEqual([{ id: 'g-c-wg1-0', text: GOAL, trackId: 'trk-study' }])
  const seedTask = s.tasks.find((t) => t.id === SEED_TASK_ID)!
  expect(seedTask.status).toBe('done')
  expect(seedTask.doneAt).toBeGreaterThan(T1)
  expect(s.events.find((e) => e.id === SEED_EVENT_ID)).toMatchObject({ deleted: true, touched: true })
  expect(count(s)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
  const cache = await readAtlasCache(A.page)
  expect(Object.keys(cache.undo).sort()).toEqual([...CMD_IDS].sort())
  expect(cache.today).toMatchObject({ date: today, text: NOTE })

  // -- הממשק ----------------------------------------------------------------------
  await gotoTab(A.page, 'היום')
  const atlasCard = A.page.locator('.atlas-card')
  await expect(atlasCard).toBeVisible()
  await expect(atlasCard).toContainText('אטלס')
  await expect(atlasCard).toContainText(NOTE)
  await expect(A.page.getByText(TK_TITLE, { exact: true }).first()).toBeVisible()
  await expect(A.page.getByText(EV_TITLE, { exact: true }).first()).toBeVisible()
  await expect(A.page.getByText(SEED_EVENT_TITLE, { exact: true })).toHaveCount(0)
  await expect(A.page.getByText(SEED_TASK_TITLE, { exact: true })).toHaveCount(0)

  await gotoTab(A.page, 'יומן')
  await expect(A.page.getByText(EV_TITLE, { exact: true }).first()).toBeVisible()
  await expect(A.page.getByText(SEED_EVENT_TITLE, { exact: true })).toHaveCount(0)

  await gotoTab(A.page, 'פרויקטים')
  await A.page.getByRole('button', { name: 'הכל', exact: true }).click()
  await expect(A.page.getByText(TK_TITLE, { exact: true }).first()).toBeVisible()
  await expect(A.page.locator('.t', { hasText: SEED_TASK_TITLE }).first()).toHaveCSS('text-decoration-line', 'line-through')

  await gotoSettings(A.page)
  const ruleRow = A.page.locator('.item', { hasText: RL_TITLE }).first()
  await expect(ruleRow).toBeVisible()
  await expect(ruleRow).toContainText('כל חודש ב־1 בו')

  await gotoTab(A.page, 'היום')
  await A.page.getByRole('button', { name: /פתיחת האימון|המשך רישום|רישום אימון/ }).first().click()
  const dlg = A.page.getByRole('dialog', { name: 'אימון' })
  await expect(dlg.locator('b', { hasText: EX_NAME })).toBeVisible()
  await dlg.locator('button[aria-label="סגירה"]').click()

  // -- atlasApplied בדחיפה הבאה --------------------------------------------------------
  await waitPatch(fake, 0, async (p) => {
    if (!('life-os.json' in p.files)) return false
    const st = await decryptJSON<AppState>(p.files['life-os.json'], key)
    return CMD_IDS.every((id) => !!st.atlasApplied?.[id])
  }, 20_000)
  await quiet(fake, 3_000)

  // -- ביטול פקודה אחת -------------------------------------------------------------------
  await openAtlas(A.page)
  await chips.filter({ hasText: `משימה חדשה: ${TK_TITLE}` }).getByRole('button', { name: 'ביטול' }).click()
  await expect(A.page.getByText('בוטל').first()).toBeVisible()
  await expect(chips.filter({ hasText: `משימה חדשה: ${TK_TITLE}` }).getByRole('button', { name: 'ביטול' })).toHaveCount(0)
  await expect(chips.filter({ hasText: 'ביטול' })).toHaveCount(6)
  await expect.poll(async () => (await readState(A.page)).tasks.find((t) => t.id === 't-c-tk1')?.deleted).toBe(true)
  await gotoTab(A.page, 'היום')
  await expect(A.page.getByText(TK_TITLE, { exact: true })).toHaveCount(0)

  // -- רענון: שום דבר לא מבוצע פעמיים -------------------------------------------------------
  await waitSynced(A.page)
  await quiet(fake, 3_000)
  await reload(A.page)
  await waitSynced(A.page)
  await sleep(6_000) // משיכת אטלס ראשונה אחרי 2.5 שניות
  const s2 = await readState(A.page)
  expect(count(s2)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
  expect(s2.tasks.find((t) => t.id === 't-c-tk1')?.deleted).toBe(true)
  expect(s2.events.filter((e) => e.title === EV_TITLE)).toHaveLength(1)
  expect(Object.keys(s2.atlasApplied ?? {}).sort()).toEqual([...CMD_IDS].sort())
  await openAtlas(A.page)
  await expect(A.page.locator('.bubble.atlas', { hasText: REPLY })).toBeVisible()
  await expect(A.page.locator('.cmd')).toHaveCount(7)
  // המחסן: אחד מכל דבר
  const remote = await decryptJSON<AppState>(fake.files['life-os.json'], key)
  expect(count(remote)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
})

test('מכשיר שני: מקבל atlasApplied בסנכרון ולא מבצע שוב; ואם משך את השיחה לפני הסנכרון — המזהים מונעים כפילות', async ({ fake, key, openDevice }) => {
  const ai = newKey()
  const at = Date.now() - 60_000
  const base = baseState({ deviceId: 'dGist', aiKey: ai })
  fake.setGistFile('life-os.json', await encryptJSON(appliedState(base, at), key))
  const user = { id: 'u-test1', at: new Date(at - 30_000).toISOString(), text: 'קבעתי רופא שיניים' }
  await writeReply(fake, ai, user)

  // -- B: סנכרון קודם (המחסן עונה מיד), משיכת אטלס אחרי 2.5 שניות --------------------
  const B = await openDevice({ tag: 'B', state: baseState({ deviceId: 'dB', aiKey: ai }), login: true })
  await waitSynced(B.page)
  await expect.poll(async () => (await readAtlasCache(B.page))?.messages?.length ?? 0, { timeout: 15_000 }).toBe(2)
  await sleep(1_000)
  const sb = await readState(B.page)
  expect(Object.keys(sb.atlasApplied ?? {}).sort()).toEqual([...CMD_IDS].sort())
  expect(count(sb)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
  // לא בוצע כאן — אין מה לבטל
  expect((await readAtlasCache(B.page)).undo).toEqual({})
  await openAtlas(B.page)
  await expect(B.page.locator('.cmd')).toHaveCount(7)
  await expect(B.page.locator('.cmd').getByRole('button', { name: 'ביטול' })).toHaveCount(0)
  // המשימה של אטלס מוצגת ב-B כרגיל
  await gotoTab(B.page, 'היום')
  await expect(B.page.getByText(TK_TITLE, { exact: true }).first()).toBeVisible()
  await B.context.close()

  // -- B2: המחסן איטי (9 שניות) — משיכת אטלס מגיעה קודם, אבל הביצוע נדחה עד המשיכה הראשונה ----
  fake.hooks.push(({ tag, method, path }) => (tag === 'B2' && method === 'GET' && path.startsWith('/gists/') ? { delayMs: 9_000 } : undefined))
  const n = fake.patches.length
  const B2 = await openDevice({ tag: 'B2', state: baseState({ deviceId: 'dB2', aiKey: ai }), login: true })
  // השיחה כבר מוצגת, אבל שום פקודה לא בוצעה לפני שהמחסן ענה
  await expect.poll(async () => (await readAtlasCache(B2.page))?.messages?.length ?? 0, { timeout: 8_000 }).toBe(2)
  expect(Object.keys((await readState(B2.page)).atlasApplied ?? {})).toEqual([])
  // אחרי שהמחסן ענה — atlasApplied מגיע מהמיזוג, ולא מבצעים כאן שוב (אין מה לבטל)
  await expect.poll(async () => Object.keys((await readState(B2.page)).atlasApplied ?? {}).length, { timeout: 25_000 }).toBe(7)
  expect(Object.keys((await readAtlasCache(B2.page)).undo)).toEqual([])
  await waitSynced(B2.page, 30_000)
  await waitPatch(fake, n, (p) => p.tag === 'B2' && 'life-os.json' in p.files, 30_000)
  await quiet(fake, 3_000)

  const s2 = await readState(B2.page)
  expect(count(s2)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
  expect(s2.tasks.find((t) => t.id === SEED_TASK_ID)?.status).toBe('done')
  expect(s2.events.find((e) => e.id === SEED_EVENT_ID)?.deleted).toBe(true)
  expect(s2.tasks.find((t) => t.id === 't-c-tk1')?.deleted).toBeFalsy()
  const remote = await decryptJSON<AppState>(fake.files['life-os.json'], key)
  expect(count(remote)).toEqual({ events: 1, liveEvents: 1, tasks: 1, rules: 1, exercises: 1, goals: 1 })
  expect(Object.keys(remote.atlasApplied ?? {}).sort()).toEqual([...CMD_IDS].sort())
  await gotoTab(B2.page, 'היום')
  await expect(B2.page.getByText(TK_TITLE, { exact: true })).toHaveCount(1)
  await expect(B2.page.getByText(EV_TITLE, { exact: true })).toHaveCount(1)
})

test('ביטול במכשיר אחד שורד מכשיר שני שמשך את השיחה לפני הסנכרון', async ({ fake, key, openDevice }) => {
  // באג אמיתי (ראו tests/reports/cloud.md, ממצא #2): מכשיר שני שמושך את thread.json לפני
  // שהמחסן ענה מבצע את הפקודות מחדש. הרשומה שנוצרת אצלו חדשה יותר מהמחיקה של הביטול,
  // ולכן במיזוג היא מנצחת — הביטול מתבטל בכל המכשירים.
  const ai = newKey()
  const at = Date.now() - 60_000
  const applied = appliedState(baseState({ deviceId: 'dGist', aiKey: ai }), at)
  // המכשיר הראשון ביטל את הבלוק החודשי
  applied.rules = applied.rules.map((r) => (r.id === 'rl-c-rl1' ? { ...r, deleted: true, updatedAt: at + 10_000 } : r))
  fake.setGistFile('life-os.json', await encryptJSON(applied, key))
  await writeReply(fake, ai, { id: 'u-test2', at: new Date(at - 30_000).toISOString(), text: 'קבעתי' })

  fake.hooks.push(({ tag, method, path }) => (tag === 'B2' && method === 'GET' && path.startsWith('/gists/') ? { delayMs: 9_000 } : undefined))
  const B2 = await openDevice({ tag: 'B2', state: baseState({ deviceId: 'dB2', aiKey: ai }), login: true })
  await expect.poll(async () => Object.keys((await readState(B2.page)).atlasApplied ?? {}).length, { timeout: 25_000 }).toBe(7)
  await waitSynced(B2.page, 30_000)
  await quiet(fake, 3_000)
  const s2 = await readState(B2.page)
  expect(s2.rules.find((r) => r.id === 'rl-c-rl1')?.deleted).toBe(true)
  const remote = await decryptJSON<AppState>(fake.files['life-os.json'], key)
  expect(remote.rules.find((r) => r.id === 'rl-c-rl1')?.deleted).toBe(true)
})
