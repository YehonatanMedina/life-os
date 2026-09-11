// ---------------------------------------------------------------------------
// סבב 2 (regress) — isPristine ב-pullOnce.
// התיקון של cloud.md #1: מכשיר שמחזיק רק זרע (גם אם נגע בהגדרות — סגירת
// כרטיס ההסבר) מקבל את המחסן כתמונה במקום למזג ולדרוס את ההגדרות.
// כאן מאמתים שהתיקון עובד, ומחפשים מה הוא שבר: הבדיקה נעשית בכל משיכה ולא
// רק בחיבור — ולכן מכשיר "בתולי" מאבד כל שינוי מקומי שאינו רשומה.
// GitHub מדומה: GET/PATCH על gists/g1 בלבד, בלי הצפנה (readRemote מקבל JSON גלוי).
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.TZ = 'Asia/Jerusalem'
})

import { seedState } from '../../../src/seed'
import type { AppState } from '../../../src/types'

const KEY = 'life-os-v1'
const MIGRATED = ['no-easy-days-2026-08', 'morning-news-2026-08']
type StoreModule = typeof import('../../../src/store')
type CloudModule = typeof import('../../../src/cloud')

let S: StoreModule
let C: CloudModule
let remote: AppState
let patches: AppState[]
let calls: string[]

/** מחסן שנכתב ממכשיר ראשי: הזרע + הגדרות אמיתיות, בלי שום רשומה של המשתמש */
function gistState(over: Partial<AppState> = {}): AppState {
  const s = seedState()
  return {
    ...s,
    migrations: MIGRATED,
    deviceId: 'dMain',
    settings: { ...s.settings, onboarded: true, wakeTime: '05:45', name: 'יהונתן' },
    settingsUpdatedAt: Date.now() - 86_400_000,
    ...over,
  }
}

async function boot(local: AppState | null, remoteState: AppState) {
  vi.resetModules()
  localStorage.clear()
  if (local) localStorage.setItem(KEY, JSON.stringify(local))
  localStorage.setItem('life-os-gh-token', 'test-token-not-real')
  localStorage.setItem('life-os-gist-id', 'g1')
  remote = remoteState
  patches = []
  calls = []
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${u}`)
    if (u !== 'https://api.github.com/gists/g1') throw new Error('unexpected network: ' + u)
    if (method === 'PATCH') {
      const files = JSON.parse(init.body).files
      remote = JSON.parse(files['life-os.json'].content)
      patches.push(remote)
      return { status: 200, ok: true, json: async () => ({ id: 'g1' }), text: async () => '' }
    }
    return {
      status: 200,
      ok: true,
      text: async () => '',
      json: async () => ({ id: 'g1', files: { 'life-os.json': { content: JSON.stringify(remote) } } }),
    }
  }) as any
  S = await import('../../../src/store')
  C = await import('../../../src/cloud')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('isPristine — חיבור מכשיר שנפתח פעם אחת (cloud #1)', () => {
  it('זרע + כרטיס ההסבר נסגר + ערכה כהה: עדיין "בתולי", והמשיכה הראשונה מחליפה בהגדרות המחסן', async () => {
    const s0 = seedState()
    const local: AppState = {
      ...s0,
      migrations: MIGRATED,
      deviceId: 'dPhone',
      // ההגדרות נגועות (onboarded + theme) — וזה בדיוק המצב שהתיקון נועד לו
      settings: { ...s0.settings, onboarded: true, theme: 'dark' },
      settingsUpdatedAt: Date.now(),
    }
    await boot(local, gistState())
    expect(S.isPristine(S.store.get())).toBe(true)
    expect(C.hasPulledOnce()).toBe(false)
    await C.pullOnce()
    const s = S.store.get()
    expect(s.settings.wakeTime).toBe('05:45')
    expect(s.settings.name).toBe('יהונתן')
    // ערכת הנושא היא חלק מההגדרות המסונכרנות — המחסן קובע גם אותה (התנהגות קיימת, מתועדת)
    expect(s.settings.theme).toBe('system')
    expect(s.deviceId).toBe('dPhone')
    expect(C.hasPulledOnce()).toBe(true)
    expect(patches).toHaveLength(0)
  })

  it('מכשיר "בתולי" שהוסיף משימה אחת — כבר לא בתולי: מיזוג, וההגדרות החדשות שלו מנצחות', async () => {
    const s0 = seedState()
    const local: AppState = {
      ...s0,
      migrations: MIGRATED,
      deviceId: 'dPhone',
      settings: { ...s0.settings, onboarded: true, wakeTime: '06:30' },
      settingsUpdatedAt: Date.now(),
    }
    await boot(local, gistState())
    S.actions.addTask({ title: 'משימה ראשונה', trackId: 'trk-study' })
    expect(S.isPristine(S.store.get())).toBe(false)
    await C.pullOnce()
    const s = S.store.get()
    expect(s.tasks.some((t) => t.title === 'משימה ראשונה')).toBe(true)
    expect(s.settings.wakeTime).toBe('06:30')
    // מיזוג ההגדרות הוא LWW על האובייקט כולו (settingsUpdatedAt) — המקומי החדש מנצח בכל השדות,
    // כולל name שלא שונה כאן. התנהגות קיימת ומתועדת (cloud.md), לא רגרסיה.
    expect(s.settings.name).toBe('')
  })

  // ---- רגרסיה: isPristine נבדק במשיכה הראשונה של כל סשן, לא רק בחיבור --------------
  // המכשיר הראשי ביום הראשון: פתח, חיבר סנכרון, שינה שעת קימה — ועוד לא רשם כלום.
  // ב-HEAD 685363b זה קורה בכל משיכה; בעץ העבודה (!hasPulledOnce() && isPristine) רק
  // במשיכה הראשונה של הסשן — אבל גם אז: שינוי הגדרות לפני המשיכה הראשונה (פתיחה
  // אופליין, או שינוי מהיר לפני שהטיק הראשון ענה) נדרס ע"י המחסן והדחיפה כותבת את הישן.
  it.fails('מכשיר בלי רשומות ששינה שעת קימה לפני המשיכה הראשונה — השינוי שורד את הדחיפה', async () => {
    const rm = gistState()
    // אחרי המשיכה הראשונה המכשיר מחזיק בדיוק את המחסן
    await boot({ ...rm, deviceId: 'dMain' }, rm)
    S.actions.setSettings({ wakeTime: '06:15' })
    await C.pushNow()
    expect(S.store.get().settings.wakeTime).toBe('06:15')
    expect(remote.settings.wakeTime).toBe('06:15')
  })

  // ב-HEAD 685363b נכשל (store.replace עם timer: null); בעץ העבודה (timer: local.timer) עובר
  it('הטיימר הראשון במכשיר בלי סשנים — המשיכה התקופתית לא מכבה אותו', async () => {
    const rm = gistState()
    await boot({ ...rm, deviceId: 'dMain' }, rm)
    S.actions.startTimer('trk-study', 'עבודה עמוקה')
    expect(S.store.get().timer?.running).toBe(true)
    await C.pullOnce()
    expect(S.store.get().timer?.running).toBe(true)
  })

  it('התקנה חדשה לגמרי (אין כלום ב-localStorage) — החלפה, והמזהה של המכשיר נשאר שלו', async () => {
    await boot(null, gistState())
    const mine = S.store.get().deviceId
    expect(mine).not.toBe('dMain')
    await C.pullOnce()
    expect(S.store.get().settings.wakeTime).toBe('05:45')
    expect(S.store.get().deviceId).toBe(mine)
  })
})
