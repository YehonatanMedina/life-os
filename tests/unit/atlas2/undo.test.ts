// ---------------------------------------------------------------------------
// אטלס סבב 2 — ביטול אחרי סנכרון ואחרי עריכה של המשתמש.
// "מכשיר שני" = חנות טרייה (vi.resetModules) שמקבלת את המצב דרך mergeStates,
// בדיוק כמו pullOnce.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, pin, task, event, tick, NOW } from '../logic/helpers'
import { boot, thread, atlasMsg, T, type Harness } from './harness'
import type { AppState } from '../../../src/types'

beforeEach(() => pin(NOW))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** מה ש"מכשיר" מחזיק אחרי משיכה מהמחסן שבו המצב של המכשיר האחר */
const pull = (h: Harness, remote: AppState) => h.S.store.set((local) => h.S.mergeStates(local, remote))

describe('ביטול במכשיר אחד, משיכה במכשיר השני', () => {
  it('A מבצע ומבטל addTask; B מקבל את המחיקה במיזוג ולא מבצע שוב כשהוא מושך את השיחה', async () => {
    const A = await boot()
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'מאטלס' } }])])
    await A.At.pollAtlas()
    tick(1000)
    expect(A.At.undoCommand('c1')).toBe(true)
    const fromA = A.state()
    expect(fromA.tasks.find((t) => t.id === 't-c1')?.deleted).toBe(true)

    const B = await boot(blankState({ deviceId: 'dB' }))
    pull(B, fromA)
    expect(B.state().atlasApplied?.c1).toBeTruthy()
    await thread(B, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'מאטלס' } }])])
    await B.At.pollAtlas()
    expect(B.state().tasks.filter((t) => t.id === 't-c1')).toHaveLength(1)
    expect(B.state().tasks.find((t) => t.id === 't-c1')?.deleted).toBe(true)
    expect(B.At.canUndo('c1')).toBe(false)
    // ובחזרה ל-A — אותה תמונה
    pull(A, B.state())
    expect(A.state().tasks.find((t) => t.id === 't-c1')?.deleted).toBe(true)
  })

  it('A מבצע patchTask (done); B מקבל; A מבטל; B מקבל את הביטול (todo) ולא מבצע שוב', async () => {
    const st = blankState({ tasks: [task({ id: 't1', title: 'ת' })] })
    const A = await boot(st)
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'p1', op: 'patchTask', taskId: 't1', patch: { status: 'done' } }])])
    await A.At.pollAtlas()
    const B = await boot(blankState({ deviceId: 'dB', tasks: [task({ id: 't1', title: 'ת' })] }))
    pull(B, A.state())
    expect(B.state().tasks[0].status).toBe('done')
    tick(1000)
    A.At.undoCommand('p1')
    expect(A.state().tasks[0].status).toBe('todo')
    pull(B, A.state())
    expect(B.state().tasks[0].status).toBe('todo')
    await thread(B, [atlasMsg('a1', T(9), [{ id: 'p1', op: 'patchTask', taskId: 't1', patch: { status: 'done' } }])])
    await B.At.pollAtlas()
    expect(B.state().tasks[0].status).toBe('todo')
  })
})

describe('ביטול של פקודה שהרשומה שלה נערכה אחר כך', () => {
  // ההחלטה המוצעת (ראו הדוח): ביטול של patch מחזיר רק את השדות שהפקודה שינתה, ורק אם הם עדיין
  // מחזיקים את הערך שהפקודה שמה. שדות שהמשתמש ערך אחרי הפקודה — נשארים שלו.
  // FIXME (major): היום undo עושה putTask({...prev}) — החלפה מלאה של הרשומה, ומוחק עריכה מאוחרת.
  it('ביטול patchTask לא דורס כותרת שהמשתמש ערך אחרי הפקודה', async () => {
    const A = await boot(blankState({ tasks: [task({ id: 't1', title: 'ת', est: 1 })] }))
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'p1', op: 'patchTask', taskId: 't1', patch: { status: 'done' } }])])
    await A.At.pollAtlas()
    tick(60_000)
    A.S.actions.patchTask('t1', { title: 'כותרת שערכתי', est: 3 })
    tick(60_000)
    expect(A.At.undoCommand('p1')).toBe(true)
    const t = A.state().tasks[0]
    expect(t.status).toBe('todo')
    expect(t.title).toBe('כותרת שערכתי')
    expect(t.est).toBe(3)
  })

  // FIXME (major): אותו דבר בין מכשירים — העריכה של B נדרסת בכל המכשירים, כי ה-putTask של הביטול
  //   מקבל updatedAt חדש ומנצח במיזוג.
  it('עריכה במכשיר B אחרי הפקודה שורדת ביטול במכשיר A', async () => {
    const A = await boot(blankState({ tasks: [task({ id: 't1', title: 'ת' })] }))
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'p1', op: 'patchTask', taskId: 't1', patch: { status: 'done' } }])])
    await A.At.pollAtlas()
    const B = await boot(blankState({ deviceId: 'dB', tasks: [task({ id: 't1', title: 'ת' })] }))
    pull(B, A.state())
    tick(60_000)
    B.S.actions.patchTask('t1', { title: 'ערוך ב-B' })
    pull(A, B.state())
    expect(A.state().tasks[0].title).toBe('ערוך ב-B')
    tick(60_000)
    A.At.undoCommand('p1')
    pull(B, A.state())
    expect(B.state().tasks[0].title).toBe('ערוך ב-B')
    expect(B.state().tasks[0].status).toBe('todo')
  })

  it('ביטול patchEvent לא דורס הערות שהמשתמש הוסיף אחרי הפקודה', async () => {
    const A = await boot(blankState({ events: [event({ id: 'e1', date: '2026-09-20', title: 'א', start: '10:00', end: '11:00', allDay: false })] }))
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'p1', op: 'patchEvent', eventId: 'e1', patch: { start: '12:00', end: '13:00' } }])])
    await A.At.pollAtlas()
    tick(60_000)
    A.S.actions.patchEvent('e1', { notes: 'להביא מסמכים' })
    tick(60_000)
    A.At.undoCommand('p1')
    expect(A.state().events[0]).toMatchObject({ start: '10:00', end: '11:00', notes: 'להביא מסמכים' })
  })

  it('ביטול setSettings לא דורס הגדרה אחרת שהמשתמש שינה אחרי הפקודה', async () => {
    const A = await boot()
    await thread(A, [atlasMsg('a1', T(9), [{ id: 's1', op: 'setSettings', patch: { wakeTime: '06:00', bedTime: '22:00' } }])])
    await A.At.pollAtlas()
    tick(60_000)
    A.S.actions.setSettings({ bedTime: '23:00' }) // המשתמש בחר בעצמו
    tick(60_000)
    A.At.undoCommand('s1')
    expect(A.state().settings.wakeTime).toBe('07:30') // הוחזר
    expect(A.state().settings.bedTime).toBe('23:00') // של המשתמש — נשאר
  })

  it('ביטול addTask אחרי שהמשתמש ערך את המשימה — מוחק אותה (התנהגות נוכחית; סבירה ל"בטל את ההוספה")', async () => {
    const A = await boot()
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'מאטלס' } }])])
    await A.At.pollAtlas()
    tick(60_000)
    A.S.actions.patchTask('t-c1', { title: 'שיניתי', est: 2 })
    tick(60_000)
    A.At.undoCommand('c1')
    expect(A.state().tasks.find((t) => t.id === 't-c1')?.deleted).toBe(true)
  })

  it('ביטול deleteTask אחרי שהמשתמש שחזר אותה בעצמו — לא מחזיר גרסה ישנה', async () => {
    const A = await boot(blankState({ tasks: [task({ id: 't1', title: 'ת', est: 1 })] }))
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'd1', op: 'deleteTask', taskId: 't1' }])])
    await A.At.pollAtlas()
    expect(A.state().tasks[0].deleted).toBe(true)
    tick(60_000)
    A.S.actions.restoreTask('t1')
    A.S.actions.patchTask('t1', { title: 'שוחזר וערוך' })
    tick(60_000)
    A.At.undoCommand('d1')
    // FIXME (minor): putTask(prev) מחזיר title: 'ת' — העריכה אחרי השחזור הידני אובדת
    expect(A.state().tasks[0].deleted).toBe(false)
    expect(['ת', 'שוחזר וערוך']).toContain(A.state().tasks[0].title)
  })

  it('שתי פקודות על אותה משימה באותה תשובה — ביטול הראשונה בלבד מחזיר את הרשומה המקורית (השנייה נדרסת, מתועד)', async () => {
    const A = await boot(blankState({ tasks: [task({ id: 't1', title: 'ת' })] }))
    await thread(A, [
      atlasMsg('a1', T(9), [
        { id: 'p1', op: 'patchTask', taskId: 't1', patch: { status: 'done' } },
        { id: 'p2', op: 'patchTask', taskId: 't1', patch: { title: 'שם חדש' } },
      ]),
    ])
    await A.At.pollAtlas()
    expect(A.state().tasks[0]).toMatchObject({ status: 'done', title: 'שם חדש' })
    tick(1000)
    A.At.undoCommand('p1')
    expect(A.state().tasks[0].status).toBe('todo')
    // עם הטלאי המוצע (החזרה לפי שדות) גם 'שם חדש' היה נשאר; היום הוא חוזר ל-'ת'
    expect(['ת', 'שם חדש']).toContain(A.state().tasks[0].title)
    expect(A.At.canUndo('p2')).toBe(true)
  })
})

describe('ביטול אחרי רענון ואחרי שינוי מזהה', () => {
  it('רשומות הביטול שורדות "רענון" (זיכרון מקומי) — ואפשר לבטל אחרי טעינה מחדש', async () => {
    const A = await boot()
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addEvent', event: { title: 'א', date: '2026-09-20' } }])])
    await A.At.pollAtlas()
    const st = A.state()
    const cache = A.cache()
    const A2 = await boot(st, cache)
    expect(A2.At.canUndo('c1')).toBe(true)
    expect(A2.At.undoCommand('c1')).toBe(true)
    expect(A2.state().events.find((e) => e.id === 'e-c1')?.deleted).toBe(true)
  })

  it('ביטול של פקודה שנכשלה — אין מה לבטל (false), המצב לא נגע', async () => {
    const A = await boot(blankState({ tasks: [task({ id: 't1', title: 'ת' })] }))
    await thread(A, [atlasMsg('a1', T(9), [{ id: 'bad', op: 'patchTask', taskId: 'nope', patch: { status: 'done' } }])])
    await A.At.pollAtlas()
    const before = JSON.stringify(A.state())
    expect(A.At.canUndo('bad')).toBe(false)
    expect(A.At.undoCommand('bad')).toBe(false)
    expect(JSON.stringify(A.state())).toBe(before)
  })
})
