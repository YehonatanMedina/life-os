import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
vi.hoisted(() => { process.env.TZ = 'Asia/Jerusalem' })
import { blankState, event, pin, rule, task, NOW } from '../logic/helpers'
import { boot, thread, atlasMsg, T } from './harness'
beforeEach(() => pin(NOW))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('probe', async () => {
  const st = blankState({
    rules: [rule({ id: 'r1', days: [1], title: 'קבוע' })],
    tasks: [task({ id: 't1', title: 'קיימת' })],
    workoutPlan: [{ id: 'wd1', updatedAt: 1, dow: 2, title: 'גב', kind: 'gym', exercises: [{ id: 'x1', name: 'מתח', metric: 'bodyweight' }] }],
  })
  const h = await boot(st)
  const cmds: any[] = [
    { id: 'b-rl-daysnull', op: 'addRule', rule: { title: 'ימים null', days: null, start: '10:00', end: '11:00' } },
    { id: 'b-rl-daysstr', op: 'addRule', rule: { title: 'ימים מחרוזת', days: 'abc', start: '10:00', end: '11:00' } },
    { id: 'b-set-types', op: 'setSettings', patch: { wakeTime: 12345, tokenMinutes: 0, dailyTokenGoal: -5, name: { evil: true }, reviewDow: 9 } },
    { id: 'b-task-notitle', op: 'addTask', task: { due: '2026-09-12' } },
    { id: 'b-task-null', op: 'addTask', task: null },
    { id: 'b-op-obj', op: { $: 1 }, task: {} },
    { id: 'b-no-op', task: { title: 'בלי op' } },
    { id: 'b-ex-nodayid', op: 'addExercise', exercise: { name: 'x' } },
    { id: 'b-pt-noid', op: 'patchTask', patch: { status: 'done' } },
    { id: 'b-ex-noname', op: 'addExercise', dayId: 'wd1', exercise: { sets: 'many' } },
    { id: 'b-wd', op: 'addWorkoutDay', day: { dow: 9, exercises: 'nope' } },
    { id: 'b-wg', op: 'setWeekGoals', weekStart: 'garbage', goals: 'x' },
    { id: 'b-wg2', op: 'setWeekGoals', goals: [{ text: { a: 1 } }, null, 5] },
    { id: 'b-tr', op: 'addTrack', track: { name: 5, color: 'red', order: 'z' } },
  ]
  await thread(h, [atlasMsg('a1', T(9), cmds)])
  const ok = await h.At.pollAtlas()
  const s = h.state()
  console.log(JSON.stringify({
    ok, err: h.cache().error,
    applied: Object.keys(s.atlasApplied ?? {}),
    rules: s.rules.filter((r) => r.id.startsWith('rl-b')).map((r) => [r.id, r.days]),
    settings: { w: s.settings.wakeTime, tm: s.settings.tokenMinutes, dg: s.settings.dailyTokenGoal, n: s.settings.name, rd: s.settings.reviewDow },
    tasks: s.tasks.filter((t) => t.id.startsWith('t-b')),
    wd: s.workoutPlan.map((d) => ({ id: d.id, dow: d.dow, ex: d.exercises })),
    weeks: s.weeks,
    tracks: s.tracks.filter((t) => t.id.startsWith('tr-')),
    errors: (h.errors.mock.calls as any[]).map((c) => [String(c[0]), c[1]?.id, String(c[2]?.message ?? c[2])]),
  }, null, 1))
})
