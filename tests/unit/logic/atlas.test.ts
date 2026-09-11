// אטלס — ביצוע פקודות דרך pollAtlas עם fetch מדומה, ביטול, ומיזוג השיחה.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, task, event, rule, pin, tick, NOW, KEY, type StoreModule } from './helpers'
import { encryptText, newCryptKey } from '../../../src/crypto'
import type { AppState } from '../../../src/types'
import type { AtlasMessage, AtlasCommand } from '../../../src/atlas'

type AtlasModule = typeof import('../../../src/atlas')
const CACHE_KEY = 'life-os-atlas-cache'
const AI_KEY = newCryptKey()

let S: StoreModule
let At: AtlasModule
let routes: Record<string, () => { status: number; text?: string; etag?: string }>
let calls: string[]

function resp(r: { status: number; text?: string; etag?: string }) {
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    text: async () => r.text ?? '',
    json: async () => JSON.parse(r.text ?? 'null'),
    headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? r.etag ?? null : null) },
  }
}

async function boot(state: AppState = blankState(), cache: Record<string, unknown> | null = null) {
  vi.resetModules()
  localStorage.clear()
  state.settings.aiKey = AI_KEY
  localStorage.setItem(KEY, JSON.stringify(state))
  localStorage.setItem('life-os-gh-token', 'test-token-not-real')
  localStorage.setItem('life-os-gh-login', 'me')
  if (cache) localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  calls = []
  routes = {}
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    if (!u.startsWith('https://api.github.com/repos/me/life-os-atlas/contents/')) throw new Error('unexpected network: ' + u)
    const name = u.split('/contents/')[1]
    const r = routes[name]
    return resp(r ? r() : { status: 404 })
  }) as any
  S = await import('../../../src/store')
  At = await import('../../../src/atlas')
}

async function thread(messages: AtlasMessage[], etag = '"t1"') {
  const text = await encryptText(JSON.stringify({ messages }), AI_KEY)
  routes['thread.json'] = () => ({ status: 200, text, etag })
}

const atlasMsg = (id: string, at: string, commands: AtlasCommand[], extra: Partial<AtlasMessage> = {}): AtlasMessage => ({
  id, at, from: 'atlas', text: 'בוצע', commands, ...extra,
})

const get = () => S.store.get()

beforeEach(() => pin(NOW))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
describe('ביצוע פקודות — יצירה', () => {
  const CREATE: AtlasCommand[] = [
    { id: 'c-tr', op: 'addTrack', track: { name: 'מסלול חדש', emoji: '🎯' } },
    { id: 'c-ev', op: 'addEvent', event: { title: 'רופא', date: '2026-09-20', start: '10:00', end: '10:30', kind: 'personal' } },
    { id: 'c-rl', op: 'addRule', rule: { title: 'בלוק', days: [1], start: '10:00', end: '11:00', deep: true } },
    { id: 'c-t', op: 'addTask', task: { title: 'משימה', due: '2026-09-15', est: 2, trackId: 'tr-c-tr' } },
    { id: 'c-wd', op: 'addWorkoutDay', day: { dow: 1, title: 'רגליים', kind: 'gym', exercises: [{ name: 'סקוואט', sets: 4 }, { name: 'לאנג׳', metric: 'bodyweight' }] } },
    { id: 'c-ex', op: 'addExercise', dayId: 'wd-c-wd', exercise: { name: 'מכרעים', reps: '12' } },
    { id: 'c-g', op: 'setWeekGoals', weekStart: '2026-09-06', goals: [{ text: 'מטרה א' }, { text: 'מטרה ב', trackId: 'trk-life' }] },
    { id: 'c-s', op: 'setSettings', patch: { wakeTime: '06:30', theme: 'dark', aiKey: 'HACKED', notifications: true } },
  ]

  it('כל פקודת יצירה יוצרת את הרשומה הנכונה עם מזהה נגזר', async () => {
    await boot()
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', CREATE)])
    expect(await At.pollAtlas()).toBe(true)
    const s = get()
    expect(s.tracks.find((t) => t.id === 'tr-c-tr')).toMatchObject({ name: 'מסלול חדש', emoji: '🎯', board: true, order: 2 })
    expect(s.events.find((e) => e.id === 'e-c-ev')).toMatchObject({ title: 'רופא', date: '2026-09-20', start: '10:00', touched: true, allDay: false })
    expect(s.rules.find((r) => r.id === 'rl-c-rl')).toMatchObject({ title: 'בלוק', active: true, from: '2026-09-11', kind: 'block' })
    expect(s.events.filter((e) => e.ruleId === 'rl-c-rl' && !e.deleted).length).toBeGreaterThan(15)
    expect(s.tasks.find((t) => t.id === 't-c-t')).toMatchObject({ title: 'משימה', due: '2026-09-15', est: 2, status: 'todo', trackId: 'tr-c-tr', createdAt: NOW })
    const wd = s.workoutPlan.find((d) => d.id === 'wd-c-wd')!
    expect(wd).toMatchObject({ dow: 1, title: 'רגליים', kind: 'gym' })
    expect(wd.exercises.map((x) => x.id)).toEqual(['ex-c-wd-0', 'ex-c-wd-1', 'ex-c-ex'])
    expect(wd.exercises[0]).toMatchObject({ name: 'סקוואט', sets: 4, metric: 'weight' })
    expect(wd.exercises[1]).toMatchObject({ metric: 'bodyweight' })
    expect(wd.exercises[2]).toMatchObject({ name: 'מכרעים', reps: '12', metric: 'weight' })
    expect(S.weekLog(s, '2026-09-06').goals).toEqual([
      { id: 'g-c-g-0', text: 'מטרה א', trackId: undefined },
      { id: 'g-c-g-1', text: 'מטרה ב', trackId: 'trk-life' },
    ])
    expect(s.settings.wakeTime).toBe('06:30')
    expect(s.settings.theme).toBe('system') // לא ברשימה המותרת
    expect(s.settings.aiKey).toBe(AI_KEY) // אי אפשר להחליף מפתח מבחוץ
    expect(s.settings.notifications).toBe(false)
    // כל הפקודות סומנו
    expect(Object.keys(s.atlasApplied ?? {}).sort()).toEqual(CREATE.map((c) => c.id).sort())
    for (const id of CREATE.map((c) => c.id)) expect(At.canUndo(id)).toBe(true)
    // התיאורים בעברית
    for (const c of CREATE) expect(At.describeCommand(c)).toMatch(/[֐-׿]/)
    // המשיכה גם עדכנה את השיחה
    expect(At.useAtlas).toBeDefined()
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).messages[0].id).toBe('a1')
  })

  it('אותו thread פעמיים — בלי כפילויות, בלי ביצוע חוזר', async () => {
    await boot()
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', CREATE)])
    await At.pollAtlas()
    const snap = JSON.stringify({ ...get(), events: get().events.length })
    S.actions.patchTask('t-c-t', { title: 'ערוך ידנית' })
    tick(1000)
    await At.pollAtlas()
    expect(get().tasks.filter((t) => t.id === 't-c-t')).toHaveLength(1)
    expect(get().tasks.find((t) => t.id === 't-c-t')?.title).toBe('ערוך ידנית')
    expect(get().events.filter((e) => e.id === 'e-c-ev')).toHaveLength(1)
    expect(get().workoutPlan.find((d) => d.id === 'wd-c-wd')?.exercises).toHaveLength(3)
    expect(get().tracks.filter((t) => t.id === 'tr-c-tr')).toHaveLength(1)
    expect(Object.keys(get().atlasApplied ?? {})).toHaveLength(CREATE.length)
    expect(JSON.stringify({ ...get(), events: get().events.length, tasks: undefined })).toBe(JSON.stringify({ ...JSON.parse(snap), tasks: undefined }))
  })

  it('מכשיר שני שקיבל atlasApplied בסנכרון לא מבצע שוב, גם אם הרשומה נמחקה אצלו', async () => {
    await boot()
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', CREATE)])
    await At.pollAtlas()
    const synced = get()
    S.actions.deleteTask('t-c-t')
    const afterDelete = get()
    // "מכשיר שני": חנות טרייה עם אותו מצב (כולל atlasApplied) וזיכרון אטלס ריק
    await boot(afterDelete)
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', CREATE)])
    await At.pollAtlas()
    expect(get().tasks.find((t) => t.id === 't-c-t')?.deleted).toBe(true)
    expect(At.canUndo('c-t')).toBe(false)
    expect(synced.atlasApplied).toEqual(get().atlasApplied)
  })
})

// ---------------------------------------------------------------------------
describe('ביצוע פקודות — עדכון ומחיקה', () => {
  function seeded(): AppState {
    return blankState({
      events: [event({ id: 'e1', date: '2026-09-20', title: 'א' })],
      rules: [rule({ id: 'r1', days: [1], title: 'ר' })],
      tasks: [task({ id: 't1', title: 'ת', est: 1 })],
      workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight' }] }],
    })
  }
  const PATCH: AtlasCommand[] = [
    { id: 'p-ev', op: 'patchEvent', eventId: 'e1', patch: { title: 'ב', start: '09:00' } },
    { id: 'p-rl', op: 'patchRule', ruleId: 'r1', patch: { title: 'ר2', days: [2] } },
    { id: 'p-t', op: 'patchTask', taskId: 't1', patch: { status: 'done', notes: 'סיימתי' } },
    { id: 'p-wd', op: 'patchWorkoutDay', dayId: 'wd1', patch: { title: 'גב וכתפיים' } },
    { id: 'p-ex', op: 'patchExercise', dayId: 'wd1', exerciseId: 'x1', patch: { reps: '8', note: 'לאט' } },
  ]
  const DELETE: AtlasCommand[] = [
    { id: 'd-ev', op: 'deleteEvent', eventId: 'e1' },
    { id: 'd-rl', op: 'deleteRule', ruleId: 'r1' },
    { id: 'd-t', op: 'deleteTask', taskId: 't1' },
    { id: 'd-ex', op: 'deleteExercise', dayId: 'wd1', exerciseId: 'x1' },
    { id: 'd-wd', op: 'deleteWorkoutDay', dayId: 'wd1' },
  ]

  it('עדכונים', async () => {
    await boot(seeded())
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', PATCH)])
    await At.pollAtlas()
    const s = get()
    expect(s.events.find((e) => e.id === 'e1')).toMatchObject({ title: 'ב', start: '09:00', touched: true })
    expect(s.rules.find((r) => r.id === 'r1')).toMatchObject({ title: 'ר2', days: [2] })
    // מהיום והלאה — רק שלישי; העבר (ימי שני) נשאר כפי שהיה
    expect(s.events.filter((e) => e.ruleId === 'r1' && !e.deleted && e.date >= '2026-09-11').every((e) => new Date(e.date + 'T12:00').getDay() === 2)).toBe(true)
    expect(s.events.filter((e) => e.ruleId === 'r1' && !e.deleted && e.date >= '2026-09-11').length).toBeGreaterThan(15)
    expect(s.events.filter((e) => e.ruleId === 'r1' && !e.deleted && e.date < '2026-09-11').every((e) => new Date(e.date + 'T12:00').getDay() === 1)).toBe(true)
    expect(s.tasks.find((t) => t.id === 't1')).toMatchObject({ status: 'done', notes: 'סיימתי', doneAt: NOW })
    expect(s.workoutPlan[0].title).toBe('גב וכתפיים')
    expect(s.workoutPlan[0].exercises[0]).toMatchObject({ reps: '8', note: 'לאט', name: 'מתח' })
    for (const c of PATCH) expect(At.describeCommand(c)).toMatch(/[֐-׿]/)
    expect(At.describeCommand(PATCH[0])).toContain('ב')
    expect(At.describeCommand(PATCH[2])).toContain('ת')
  })

  it('מחיקות — רכות, המופעים העתידיים של הכלל נקברים', async () => {
    await boot(seeded())
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', DELETE)])
    await At.pollAtlas()
    const s = get()
    expect(s.events.find((e) => e.id === 'e1')?.deleted).toBe(true)
    expect(s.rules.find((r) => r.id === 'r1')).toMatchObject({ deleted: true, active: false })
    expect(s.events.filter((e) => e.ruleId === 'r1' && e.date >= '2026-09-11' && !e.deleted)).toHaveLength(0)
    expect(s.tasks.find((t) => t.id === 't1')?.deleted).toBe(true)
    expect(s.workoutPlan[0].exercises).toHaveLength(0)
    expect(s.workoutPlan[0].deleted).toBe(true)
    for (const c of DELETE) expect(At.describeCommand(c)).toMatch(/[֐-׿]/)
  })

  it('פקודה לא מוכרת או על רשומה חסרה — נרשמת כבוצעה, לא מפילה, והשאר ממשיכות', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await boot(seeded())
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'bad-1', op: 'teleport', where: 'הירח' },
        { id: 'bad-2', op: 'patchTask', taskId: 'no-such', patch: { title: 'x' } },
        { id: 'bad-3', op: 'deleteEvent', eventId: 'no-such' },
        { id: 'bad-4', op: 'addExercise', dayId: 'no-such', exercise: { name: 'x' } },
        { id: 'bad-5', op: 'patchExercise', dayId: 'wd1', exerciseId: 'no-such', patch: {} },
        { id: '', op: 'addTask', task: { title: 'בלי מזהה' } },
        null as any,
        { id: 'ok-1', op: 'addTask', task: { title: 'אחרי הכשלונות' } },
      ]),
    ])
    expect(await At.pollAtlas()).toBe(true)
    const s = get()
    expect(Object.keys(s.atlasApplied ?? {}).sort()).toEqual(['bad-1', 'bad-2', 'bad-3', 'bad-4', 'bad-5', 'ok-1'])
    expect(s.tasks.find((t) => t.id === 't-ok-1')?.title).toBe('אחרי הכשלונות')
    expect(s.tasks.some((t) => t.title === 'בלי מזהה')).toBe(false)
    expect(At.canUndo('bad-1')).toBe(false)
    expect(At.describeCommand({ id: 'bad-1', op: 'teleport' })).toBe('teleport')
    expect(err).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe('ביצוע פקודות — מסלולים, אסימונים שבועיים והרגלים', () => {
  function seeded(): AppState {
    return blankState({
      weekly: [
        { id: 'wk1', updatedAt: 1, name: 'גיטרה', emoji: '🎸', order: 0, kind: 'progress', targetMinutes: 180 },
        { id: 'wk2', updatedAt: 1, name: 'כביסה', emoji: '🧺', order: 1, kind: 'check' },
      ],
      habits: [{ id: 'hb1', updatedAt: 1, name: 'שגרת בוקר', emoji: '🌅', order: 0, steps: [{ id: 's0', text: 'לסדר מיטה' }] }],
    })
  }

  it('יצירה, עדכון ומחיקה של מסלול, אסימון שבועי והרגל', async () => {
    await boot(seeded())
    const CMDS: AtlasCommand[] = [
      { id: 'c-1', op: 'patchTrack', trackId: 'trk-study', patch: { goal: 'מבחן ב־6.11', order: 'שלישי', name: '' } },
      { id: 'c-2', op: 'deleteWeekly', weeklyId: 'wk1' },
      { id: 'c-3', op: 'patchWeekly', weeklyId: 'wk2', patch: { name: 'כביסה ומצעים', everyDays: 14, alertDow: 5 } },
      { id: 'c-4', op: 'addWeekly', weekly: { name: 'ריצה ארוכה', kind: 'progress', targetMinutes: 90, trackId: 'trk-life' } },
      { id: 'c-5', op: 'addHabit', habit: { name: 'מתיחות', minutes: 10, steps: ['גב', { text: 'ירכיים' }, 7] } },
      { id: 'c-6', op: 'patchHabit', habitId: 'hb1', patch: { name: 'בוקר', special: 'שינה' } },
    ]
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', CMDS)])
    expect(await At.pollAtlas()).toBe(true)
    const s = get()
    // שדה מהטיפוס הלא נכון נזרק, השאר נכנס
    expect(s.tracks.find((t) => t.id === 'trk-study')).toMatchObject({ goal: 'מבחן ב־6.11', order: 1, name: 'לימודים' })
    expect(s.weekly.find((w) => w.id === 'wk1')?.deleted).toBe(true)
    expect(s.weekly.find((w) => w.id === 'wk2')).toMatchObject({ name: 'כביסה ומצעים', everyDays: 14, alertDow: 5, kind: 'check' })
    expect(s.weekly.find((w) => w.id === 'wk-c-4')).toMatchObject({ name: 'ריצה ארוכה', kind: 'progress', targetMinutes: 90, trackId: 'trk-life', order: 1, emoji: '•' })
    expect(s.habits.find((h) => h.id === 'hb-c-5')).toMatchObject({ name: 'מתיחות', minutes: 10, order: 1 })
    expect(s.habits.find((h) => h.id === 'hb-c-5')?.steps).toEqual([{ id: 'hb-c-5-s0', text: 'גב' }, { id: 'hb-c-5-s1', text: 'ירכיים' }])
    expect(s.habits.find((h) => h.id === 'hb1')).toMatchObject({ name: 'בוקר' })
    expect(s.habits.find((h) => h.id === 'hb1')?.special).toBeUndefined()
    expect(Object.keys(s.atlasApplied ?? {}).sort()).toEqual(CMDS.map((c) => c.id).sort())
    for (const c of CMDS) expect(At.describeCommand(c)).toMatch(/[֐-׿]/)
    expect(At.describeCommand(CMDS[1])).toContain('גיטרה')
  })

  it('פקודה בלי שדה תקין, ואסימון progress בלי יעד — נדחות ולא משנות כלום', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await boot(seeded())
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'b-1', op: 'patchWeekly', weeklyId: 'wk2', patch: { targetMinutes: 3 } },
        { id: 'b-2', op: 'addWeekly', weekly: { name: 'קריאה', kind: 'progress' } },
        { id: 'b-3', op: 'patchWeekly', weeklyId: 'wk2', patch: { kind: 'progress' } },
        { id: 'b-4', op: 'deleteHabit', habitId: 'no-such' },
        { id: 'b-5', op: 'deleteTrack', trackId: 'trk-life' },
      ]),
    ])
    await At.pollAtlas()
    const s = get()
    expect(s.weekly.find((w) => w.id === 'wk2')).toMatchObject({ name: 'כביסה', kind: 'check' })
    expect(s.weekly.find((w) => w.id === 'wk2')?.targetMinutes).toBeUndefined()
    expect(s.weekly.some((w) => w.name === 'קריאה')).toBe(false)
    expect(s.tracks.find((t) => t.id === 'trk-life')?.deleted).toBe(true)
    for (const id of ['b-1', 'b-2', 'b-3', 'b-4']) expect(At.canUndo(id)).toBe(false)
    expect(At.commandFailed('b-1')).toContain('patchWeekly')
  })

  it('ביטול מחזיר אסימון שנמחק, ומבטל עדכון של מסלול בלי לדרוס עריכה ידנית', async () => {
    await boot(seeded())
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'u-1', op: 'deleteWeekly', weeklyId: 'wk1' },
        { id: 'u-2', op: 'patchTrack', trackId: 'trk-study', patch: { goal: 'יעד של אטלס', emoji: '🎯' } },
        { id: 'u-3', op: 'addHabit', habit: { name: 'קריאה' } },
      ]),
    ])
    await At.pollAtlas()
    // הוא ערך ידנית את האמוג׳י אחרי הפקודה — הביטול לא נוגע בו
    S.actions.upsertTrack({ ...get().tracks.find((t) => t.id === 'trk-study')!, emoji: '📗' })
    expect(At.undoCommand('u-1')).toBe(true)
    expect(At.undoCommand('u-2')).toBe(true)
    expect(At.undoCommand('u-3')).toBe(true)
    const s = get()
    expect(s.weekly.find((w) => w.id === 'wk1')).toMatchObject({ deleted: false, name: 'גיטרה', targetMinutes: 180 })
    expect(s.tracks.find((t) => t.id === 'trk-study')).toMatchObject({ emoji: '📗', name: 'לימודים' })
    expect(s.tracks.find((t) => t.id === 'trk-study')?.goal).toBeUndefined()
    expect(s.habits.find((h) => h.id === 'hb-u-3')?.deleted).toBe(true)
    expect(At.undoCommand('u-1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('undoCommand', () => {
  it('ביטול יצירה מסיר (מחיקה רכה) את מה שנוצר; ביטול פעמיים מחזיר false', async () => {
    await boot()
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'c-tr', op: 'addTrack', track: { name: 'מסלול' } },
        { id: 'c-ev', op: 'addEvent', event: { title: 'א', date: '2026-09-20' } },
        { id: 'c-rl', op: 'addRule', rule: { title: 'ר', days: [1], start: '10:00', end: '11:00' } },
        { id: 'c-t', op: 'addTask', task: { title: 'ת' } },
        { id: 'c-wd', op: 'addWorkoutDay', day: { dow: 1, title: 'יום', exercises: [] } },
        { id: 'c-ex', op: 'addExercise', dayId: 'wd-c-wd', exercise: { name: 'x' } },
        { id: 'c-g', op: 'setWeekGoals', weekStart: '2026-09-06', goals: [{ text: 'מ' }] },
        { id: 'c-s', op: 'setSettings', patch: { wakeTime: '05:00', name: 'י' } },
      ]),
    ])
    await At.pollAtlas()
    tick(1000)
    expect(At.undoCommand('c-ex')).toBe(true)
    expect(get().workoutPlan.find((d) => d.id === 'wd-c-wd')?.exercises).toHaveLength(0)
    expect(At.undoCommand('c-wd')).toBe(true)
    expect(get().workoutPlan.find((d) => d.id === 'wd-c-wd')?.deleted).toBe(true)
    expect(At.undoCommand('c-t')).toBe(true)
    expect(get().tasks.find((t) => t.id === 't-c-t')?.deleted).toBe(true)
    expect(At.undoCommand('c-rl')).toBe(true)
    expect(get().rules.find((r) => r.id === 'rl-c-rl')?.deleted).toBe(true)
    expect(get().events.filter((e) => e.ruleId === 'rl-c-rl' && !e.deleted)).toHaveLength(0)
    expect(At.undoCommand('c-ev')).toBe(true)
    expect(get().events.find((e) => e.id === 'e-c-ev')?.deleted).toBe(true)
    expect(At.undoCommand('c-tr')).toBe(true)
    expect(get().tracks.find((t) => t.id === 'tr-c-tr')?.deleted).toBe(true)
    expect(At.undoCommand('c-g')).toBe(true)
    expect(S.weekLog(get(), '2026-09-06').goals).toEqual([])
    expect(At.undoCommand('c-s')).toBe(true)
    expect(get().settings.wakeTime).toBe('07:30')
    expect(get().settings.name).toBe('')
    expect(At.undoCommand('c-s')).toBe(false)
    expect(At.canUndo('c-t')).toBe(false)
    // הפקודות נשארות מסומנות — לא ירוצו שוב במשיכה הבאה
    await At.pollAtlas()
    expect(get().tasks.find((t) => t.id === 't-c-t')?.deleted).toBe(true)
    expect(get().events.find((e) => e.id === 'e-c-ev')?.deleted).toBe(true)
  })

  it('ביטול עדכון מחזיר בדיוק את הרשומה הקודמת (חוץ מ-updatedAt)', async () => {
    const st = blankState({
      events: [event({ id: 'e1', date: '2026-09-20', title: 'א', notes: 'הערה' })],
      tasks: [task({ id: 't1', title: 'ת', est: 1 })],
      rules: [rule({ id: 'r1', days: [1], title: 'ר' })],
      workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight' }] }],
      weeks: [{ id: 'wk-2026-09-06', updatedAt: 1, weekStart: '2026-09-06', items: {}, progress: {}, goals: [{ id: 'old', text: 'ישן', done: true }] }],
    })
    await boot(st)
    const before = get()
    const prevEvent = before.events.find((e) => e.id === 'e1')!
    const prevTask = before.tasks.find((t) => t.id === 't1')!
    const prevRule = before.rules.find((r) => r.id === 'r1')!
    const prevDay = before.workoutPlan[0]
    // createdAt: putTask משלים אותו כשחסר — תוספת קוסמטית, לא שינוי תוכן
    const strip = (o: any) => {
      const { updatedAt, createdAt, ...rest } = o
      return rest
    }
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'p-ev', op: 'patchEvent', eventId: 'e1', patch: { title: 'ב', start: '09:00', notes: null } },
        { id: 'p-t', op: 'patchTask', taskId: 't1', patch: { status: 'done', est: 3 } },
        { id: 'p-rl', op: 'patchRule', ruleId: 'r1', patch: { title: 'ר2', days: [3] } },
        { id: 'p-wd', op: 'patchWorkoutDay', dayId: 'wd1', patch: { title: 'אחר', focus: 'כוח' } },
        { id: 'p-g', op: 'setWeekGoals', weekStart: '2026-09-06', goals: [{ text: 'חדש' }] },
      ]),
    ])
    await At.pollAtlas()
    expect(get().tasks.find((t) => t.id === 't1')?.status).toBe('done')
    tick(1000)
    At.undoCommand('p-ev')
    At.undoCommand('p-t')
    At.undoCommand('p-rl')
    At.undoCommand('p-wd')
    At.undoCommand('p-g')
    const s = get()
    expect(strip(s.events.find((e) => e.id === 'e1'))).toEqual(strip({ ...prevEvent, deleted: false }))
    expect(strip(s.tasks.find((t) => t.id === 't1'))).toEqual(strip({ ...prevTask, deleted: false }))
    expect(strip(s.rules.find((r) => r.id === 'r1'))).toEqual(strip({ ...prevRule, deleted: false }))
    expect(s.events.filter((e) => e.ruleId === 'r1' && !e.deleted).every((e) => new Date(e.date + 'T12:00').getDay() === 1)).toBe(true)
    expect(strip(s.workoutPlan[0])).toEqual(strip({ ...prevDay, deleted: false }))
    expect(S.weekLog(s, '2026-09-06').goals).toEqual([{ id: 'old', text: 'ישן', done: true }])
  })

  it('ביטול patchExercise מסיר שדות שהעדכון הוסיף', async () => {
    // באג מתועד: undo של exercise עושה patchExercise(prev) — מיזוג, לא החלפה. שדה שהפקודה
    // הוסיפה (note) ולא היה קודם נשאר אחרי הביטול.
    await boot(blankState({ workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight' }] }] }))
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', [{ id: 'p-ex', op: 'patchExercise', dayId: 'wd1', exerciseId: 'x1', patch: { note: 'לאט', reps: '8' } }])])
    await At.pollAtlas()
    At.undoCommand('p-ex')
    expect(get().workoutPlan[0].exercises[0]).toEqual({ id: 'x1', name: 'מתח', metric: 'bodyweight' })
  })

  it('ביטול מחיקה מחזיר את הרשומה לחיים', async () => {
    await boot(blankState({
      events: [event({ id: 'e1', date: '2026-09-20', title: 'א' })],
      tasks: [task({ id: 't1', title: 'ת' })],
      rules: [rule({ id: 'r1', days: [1] })],
      workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight', sets: 3 }] }],
    }))
    await thread([
      atlasMsg('a1', '2026-09-11T09:00:00+03:00', [
        { id: 'd-ev', op: 'deleteEvent', eventId: 'e1' },
        { id: 'd-t', op: 'deleteTask', taskId: 't1' },
        { id: 'd-rl', op: 'deleteRule', ruleId: 'r1' },
        { id: 'd-ex', op: 'deleteExercise', dayId: 'wd1', exerciseId: 'x1' },
        { id: 'd-wd', op: 'deleteWorkoutDay', dayId: 'wd1' },
      ]),
    ])
    await At.pollAtlas()
    tick(1000)
    for (const id of ['d-wd', 'd-ex', 'd-rl', 'd-t', 'd-ev']) expect(At.undoCommand(id)).toBe(true)
    const s = get()
    expect(s.events.find((e) => e.id === 'e1')?.deleted).toBe(false)
    expect(s.tasks.find((t) => t.id === 't1')?.deleted).toBe(false)
    expect(s.rules.find((r) => r.id === 'r1')).toMatchObject({ deleted: false, active: true })
    expect(s.events.filter((e) => e.ruleId === 'r1' && e.date >= '2026-09-11' && !e.deleted).length).toBeGreaterThan(15)
    expect(s.workoutPlan[0].deleted).toBe(false)
    expect(s.workoutPlan[0].exercises[0]).toMatchObject({ id: 'x1', name: 'מתח', metric: 'bodyweight', sets: 3 })
  })

  it('ביטול deleteExercise מחזיר את התרגיל בדיוק ובמקומו המקורי', async () => {
    // באג מתועד: undo של exercise שנמחק עושה addExercise(prev) — מקבל ברירות מחדל
    // (reps: '10', sets: 3) על שדות שלא היו, ונוחת בסוף הרשימה במקום במקום המקורי.
    await boot(blankState({ workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [
      { id: 'x1', name: 'מתח', metric: 'bodyweight' },
      { id: 'x2', name: 'חתירה', metric: 'weight', reps: '8' },
    ] }] }))
    await thread([atlasMsg('a1', '2026-09-11T09:00:00+03:00', [{ id: 'd-ex', op: 'deleteExercise', dayId: 'wd1', exerciseId: 'x1' }])])
    await At.pollAtlas()
    At.undoCommand('d-ex')
    expect(get().workoutPlan[0].exercises).toEqual([
      { id: 'x1', name: 'מתח', metric: 'bodyweight' },
      { id: 'x2', name: 'חתירה', metric: 'weight', reps: '8' },
    ])
  })
})

// ---------------------------------------------------------------------------
describe('mergeThread דרך pollAtlas', () => {
  it('הודעה ממתינה נשארת עד שמגיעה תשובה עם replyTo; ממוין לפי זמן אמיתי', async () => {
    const local: AtlasMessage[] = [
      { id: 'u1', at: '2026-09-11T09:00:00+03:00', from: 'user', text: 'ראשונה', pending: true },
      { id: 'u2', at: '2026-09-11T09:05:00+03:00', from: 'user', text: 'שנייה', pending: true },
      { id: 'u3', at: '2026-09-11T09:06:00+03:00', from: 'user', text: 'נכשלה', failed: true },
    ]
    await boot(blankState(), { messages: local, today: null, undo: {} })
    // תשובה ל-u1 בלבד. הזמנים: ISO עם Z שקודם לקסיקוגרפית אבל מאוחר בפועל
    await thread([
      { id: 'u1', at: '2026-09-11T09:00:00+03:00', from: 'user', text: 'ראשונה' },
      { id: 'a1', at: '2026-09-11T06:02:00Z', from: 'atlas', text: 'תשובה', replyTo: 'u1' },
    ])
    await At.pollAtlas()
    const msgs = JSON.parse(localStorage.getItem(CACHE_KEY)!).messages as AtlasMessage[]
    expect(msgs.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'u3'])
    expect(msgs.find((m) => m.id === 'u1')?.pending).toBe(false)
    expect(msgs.find((m) => m.id === 'u2')?.pending).toBe(true)
    expect(msgs.find((m) => m.id === 'u3')?.failed).toBe(true)
    expect(At.awaitingReply()).toBe(true)
    // עכשיו מגיעה תשובה ל-u2 בלי שההודעה עצמה במאגר
    await thread([
      { id: 'u1', at: '2026-09-11T09:00:00+03:00', from: 'user', text: 'ראשונה' },
      { id: 'a1', at: '2026-09-11T06:02:00Z', from: 'atlas', text: 'תשובה', replyTo: 'u1' },
      { id: 'a2', at: '2026-09-11T09:10:00+03:00', from: 'atlas', text: 'תשובה 2', replyTo: 'u2' },
    ], '"t2"')
    await At.pollAtlas()
    const msgs2 = JSON.parse(localStorage.getItem(CACHE_KEY)!).messages as AtlasMessage[]
    expect(msgs2.map((m) => m.id)).toEqual(['u1', 'a1', 'u3', 'a2'])
    expect(At.awaitingReply()).toBe(false)
    At.discardMessage('u3')
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).messages.map((m: AtlasMessage) => m.id)).toEqual(['u1', 'a1', 'a2'])
  })

  it('304/404 לא משנים כלום; 401 מסמן שגיאה; today.json של היום מוצג ושל אתמול לא', async () => {
    await boot()
    routes['thread.json'] = () => ({ status: 304 })
    expect(await At.pollAtlas()).toBe(false)
    routes['thread.json'] = () => ({ status: 401 })
    await At.pollAtlas()
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).error).toContain('טוקן')
    routes['thread.json'] = () => ({ status: 404 })
    routes['today.json'] = () => ({ status: 200, text: '__pending__' })
    const enc = await encryptText(JSON.stringify({ date: '2026-09-11', text: 'בוקר טוב' }), AI_KEY)
    routes['today.json'] = () => ({ status: 200, text: enc, etag: '"d"' })
    expect(await At.pollAtlas()).toBe(true)
    const c = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(c.error).toBeUndefined()
    expect(At.todayNote(c)?.text).toBe('בוקר טוב')
    expect(At.todayNote({ ...c, today: { date: '2026-09-10', text: 'ישן' } })).toBeNull()
    expect(calls.some((c) => c.includes('/user'))).toBe(false)
    expect(calls.every((c) => c.startsWith('GET https://api.github.com/repos/me/life-os-atlas/contents/'))).toBe(true)
  })

  it('בלי טוקן או בלי מפתח — לא פונים לרשת', async () => {
    await boot()
    localStorage.removeItem('life-os-gh-token')
    expect(At.atlasReady()).toBe(false)
    expect(await At.pollAtlas()).toBe(false)
    expect(calls).toHaveLength(0)
    localStorage.setItem('life-os-gh-token', 't')
    S.actions.setSettings({ aiKey: '' })
    expect(At.atlasReady()).toBe(false)
    expect(await At.pollAtlas()).toBe(false)
    expect(calls).toHaveLength(0)
    expect(await At.sendToAtlas('שלום')).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('thread.json שלא ניתן לפענוח (מפתח אחר) — שגיאה בזיכרון, לא זריקה, ואין ביצוע', async () => {
    await boot()
    const other = await encryptText(JSON.stringify({ messages: [atlasMsg('a', '2026-09-11T09:00:00+03:00', [{ id: 'x', op: 'addTask', task: { title: 'x' } }])] }), newCryptKey())
    routes['thread.json'] = () => ({ status: 200, text: other })
    expect(await At.pollAtlas()).toBe(false)
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).error).toContain('לא הצלחתי')
    expect(get().tasks).toHaveLength(0)
    expect(get().atlasApplied).toEqual({})
  })
})
