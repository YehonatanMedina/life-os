// ---------------------------------------------------------------------------
// אטלס סבב 2 — ETag / 304 והביצוע הדחוי (applyWhenSafe / flushDeferred).
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { blankState, pin, tick, NOW } from '../logic/helpers'
import { boot, thread, todayFile, atlasMsg, T } from './harness'

beforeEach(() => pin(NOW))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('304', () => {
  it('משיכה עם ETag זהה → 304 → שום דבר לא מבוצע שוב, גם אחרי שהמשתמש מחק את הרשומה', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'א' } }])], '"same"')
    expect(await h.At.pollAtlas()).toBe(true)
    expect(h.cache().threadEtag).toBe('"same"')
    tick(1000)
    h.S.actions.deleteTask('t-c1')
    // עכשיו השרת עונה 304 לכל מי ששולח את ה-ETag
    h.routes['thread.json'] = () => ({ status: 304 })
    for (let i = 0; i < 5; i++) {
      tick(10_000)
      expect(await h.At.pollAtlas()).toBe(false)
    }
    expect(h.state().tasks.filter((t) => t.id === 't-c1')).toHaveLength(1)
    expect(h.state().tasks[0].deleted).toBe(true)
    expect(h.cache().lastPollAt).toBe(Date.now())
    // הבקשות נשאו את ה-ETag
    const req = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('thread.json'))
    expect(req.length).toBe(6)
    for (const c of req.slice(1)) expect(c[1]?.headers?.['If-None-Match']).toBe('"same"')
  })

  it('today.json עם ETag זהה → 304 → הפתק הקודם נשאר', async () => {
    const h = await boot()
    await todayFile(h, { date: '2026-09-11', text: 'בוקר' }, '"d"')
    await h.At.pollAtlas()
    expect(h.At.todayNote(h.cache())?.text).toBe('בוקר')
    h.routes['today.json'] = () => ({ status: 304 })
    await h.At.pollAtlas()
    expect(h.At.todayNote(h.cache())?.text).toBe('בוקר')
  })
})

describe('ביצוע דחוי אחרי טעינה מחדש', () => {
  // FIXME (major): pollAtlas מפעיל applyWhenSafe רק על 200. אם השיחה נשמרה בזיכרון (עם threadEtag)
  //   בזמן שהביצוע נדחה (המחסן עוד לא ענה) והדף נסגר — בטעינה הבאה thread.json עונה 304,
  //   ואף אחד לא מבצע את הפקודות שבזיכרון. הן אובדות עד שהסוכן ישכתב את הקובץ.
  it('פקודות שבזיכרון המקומי ועדיין לא ב-atlasApplied מבוצעות גם כשהשרת עונה 304', async () => {
    const cached = {
      messages: [atlasMsg('a1', T(9), [{ id: 'c-lost', op: 'addTask', task: { title: 'נדחתה ונשכחה' } }])],
      today: null,
      undo: {},
      threadEtag: '"t1"',
    }
    const h = await boot(blankState(), cached)
    h.routes['thread.json'] = () => ({ status: 304 })
    await h.At.pollAtlas()
    expect(h.state().tasks.find((t) => t.id === 't-c-lost')?.title).toBe('נדחתה ונשכחה')
    expect(h.state().atlasApplied?.['c-lost']).toBeTruthy()
  })

  it('כשהמחסן לא מוגדר (רק טוקן + מפתח) — הביצוע מיידי, בלי המתנה למשיכה', async () => {
    const h = await boot()
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'מיד' } }])])
    await h.At.pollAtlas()
    expect(h.state().tasks[0]?.title).toBe('מיד')
  })

  it('כשהמחסן מוגדר ועוד לא נמשך — הפקודות מוצגות אבל לא מבוצעות; אחרי המשיכה הראשונה — מבוצעות (דרך flushDeferred בטיק)', async () => {
    const h = await boot()
    localStorage.setItem('life-os-gist-id', 'g1')
    const Cloud = await import('../../../src/cloud')
    expect(Cloud.cloudConfigured()).toBe(true)
    expect(Cloud.hasPulledOnce()).toBe(false)
    await thread(h, [atlasMsg('a1', T(9), [{ id: 'c1', op: 'addTask', task: { title: 'אחרי המחסן' } }])])
    await h.At.pollAtlas()
    expect(h.cache().messages).toHaveLength(1)
    expect(h.state().tasks).toHaveLength(0)
    // המחסן "ענה": מדמים pullOnce מוצלח דרך fetch של הגיסט
    const orig = globalThis.fetch as any
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url)
      if (u.includes('/gists/g1')) {
        const body = { id: 'g1', files: { 'life-os.json': { truncated: false, content: JSON.stringify({ ...blankState({ deviceId: 'remote' }), settings: { ...blankState().settings } }) } } }
        return { status: 200, ok: true, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }
      }
      return orig(url, init)
    }) as any
    await Cloud.pullOnce()
    expect(Cloud.hasPulledOnce()).toBe(true)
    // הטיק של startAtlas מפעיל flushDeferred
    h.At.startAtlas()
    vi.advanceTimersByTime(5_000)
    expect(h.state().tasks[0]?.title).toBe('אחרי המחסן')
  })
})
