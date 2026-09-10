import { webcrypto, randomBytes } from 'node:crypto'
import { test, expect, readState, reload, go, live, seed, NOW_ISO, TODAY } from './desk'
import type { AppState, Task } from '../../../src/types'

// ---------------------------------------------------------------------------
// 9. אטלס: בלי חיבור — הודעה; עם חיבור מזויף ו-GitHub מדומה — שליחה מוצפנת,
//    "אטלס חושב…", כישלון ושליחה חוזרת, תשובה עם פקודה שמבוצעת ואפשר לבטל.
//    שום קריאה אמיתית: api.github.com נענה מקומית דרך page.route.
// ---------------------------------------------------------------------------

// -- הצפנה תואמת ל-src/crypto.ts (AES-256-GCM, מעטפת {enc,iv,ct} ב-base64url) --
const AI_KEY = Buffer.alloc(32, 7).toString('base64url')
const subtle = webcrypto.subtle
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))
async function aes(keyB64: string) {
  return subtle.importKey('raw', unb64u(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(plain: string, keyB64: string): Promise<string> {
  const iv = new Uint8Array(randomBytes(12))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await aes(keyB64), new TextEncoder().encode(plain))
  return JSON.stringify({ enc: 1, iv: b64u(iv), ct: b64u(new Uint8Array(ct)) })
}
async function decrypt(envelope: string, keyB64: string): Promise<string> {
  const env = JSON.parse(envelope)
  expect(env.enc).toBe(1)
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(env.iv) }, await aes(keyB64), unb64u(env.ct))
  return new TextDecoder().decode(plain)
}

/** GitHub מדומה: /user, contents (thread.json/today.json), issues */
type Fake = { posted: any[]; issueStatus: number; thread: string | null }
async function mockGitHub(page: any): Promise<Fake> {
  const fake: Fake = { posted: [], issueStatus: 201, thread: null }
  await page.route('https://api.github.com/**', async (route: any) => {
    const req = route.request()
    const url: string = req.url()
    const json = (status: number, body: any, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
    if (url.endsWith('/user')) return json(200, { login: 'tester' })
    if (url.includes('/repos/tester/life-os-atlas/contents/thread.json')) {
      if (!fake.thread) return json(404, { message: 'Not Found' })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { etag: '"t-' + fake.thread.length + '"' }, body: fake.thread })
    }
    if (url.includes('/contents/')) return json(404, { message: 'Not Found' })
    if (url.includes('/repos/tester/life-os-atlas/issues') && req.method() === 'POST') {
      fake.posted.push(JSON.parse(req.postData() ?? '{}'))
      return json(fake.issueStatus, fake.issueStatus === 201 ? { number: fake.posted.length } : { message: 'boom' })
    }
    return json(404, { message: 'unexpected ' + url })
  })
  return fake
}

const composer = (page: any) => page.getByPlaceholder('כתוב לאטלס…')

test.describe('אטלס — בלי חיבור', () => {
  test('מציג שאין חיבור, הקלט מושבת, והדוגמאות מוצגות', async ({ app }) => {
    await go(app, 'אטלס')
    await expect(app.getByText('אטלס עוד לא מחובר במכשיר הזה.')).toBeVisible()
    await expect(composer(app)).toBeDisabled()
    await expect(app.getByRole('button', { name: 'שלח' })).toBeDisabled()
    await expect(app.locator('.chat-empty h3')).toHaveText('אטלס')
    await expect(app.locator('.chat-examples .chip')).toHaveCount(5)
    // מפתח בלי טוקן — עדיין לא מחובר
    const st = await readState(app)
    expect(st?.settings?.aiKey).toBeUndefined()
  })
})

test.describe('אטלס — מחובר (GitHub מדומה)', () => {
  test.use({
    seed: seed((s: AppState) => ({ ...s, settings: { ...s.settings, onboarded: true, aiKey: AI_KEY } })),
    extraStorage: { 'life-os-gh-token': 'ghp_FAKE_TOKEN_FOR_TESTS', 'life-os-gh-login': 'tester' },
  })

  test('שליחה: בועה ממתינה, "אטלס חושב…", והגוף שנשלח הוא מעטפה מוצפנת', async ({ app }) => {
    const gh = await mockGitHub(app)
    await go(app, 'אטלס')
    await expect(app.getByText('אטלס עוד לא מחובר')).toHaveCount(0)
    await expect(composer(app)).toBeEnabled()
    // דוגמה ממלאת את השדה
    await app.locator('.chat-examples .chip').first().click()
    await expect(composer(app)).toHaveValue('קבעתי רופא שיניים ביום שלישי ב-16:00, שעה.')
    await composer(app).fill('תוסיף משימה: לקנות חלב היום')
    // במחשב Enter שולח
    await composer(app).press('Enter')
    await expect(composer(app)).toHaveValue('')
    const me = app.locator('.bubble.me')
    await expect(me).toHaveCount(1)
    await expect(me).toContainText('תוסיף משימה: לקנות חלב היום')
    await expect(me.locator('.bubble-meta')).toContainText('10:00')
    await expect(app.locator('.chat-date')).toHaveText('יום שישי, 11 בספטמבר')
    const thinking = app.locator('.bubble.atlas.thinking')
    await expect(thinking).toContainText('אטלס חושב…')
    await app.clock.runFor(65_000)
    await expect(thinking).toContainText(/אטלס חושב… 1:0\d/)

    // הגוף שנשלח: Issue עם כותרת = מזהה ההודעה, וגוף = מעטפה מוצפנת
    await expect.poll(() => gh.posted.length).toBe(1)
    const issue = gh.posted[0]
    expect(issue.title).toMatch(/^u-/)
    expect(issue.body).not.toContain('חלב')
    expect(JSON.stringify(issue)).not.toContain('לקנות')
    const env = JSON.parse(issue.body)
    expect(env).toMatchObject({ enc: 1 })
    expect(typeof env.iv).toBe('string')
    expect(typeof env.ct).toBe('string')
    const plain = JSON.parse(await decrypt(issue.body, AI_KEY))
    expect(plain).toMatchObject({ id: issue.title, text: 'תוסיף משימה: לקנות חלב היום', source: 'app' })
    expect(Date.parse(plain.at)).toBeCloseTo(Date.parse(NOW_ISO), -4)

    // במסך היום: כרטיס "אטלס · עובד על התשובה…"
    await go(app, 'היום')
    await expect(app.locator('.atlas-card')).toContainText('עובד על התשובה…')

    // ההודעה הממתינה שורדת רענון (מטמון מקומי)
    await reload(app)
    await mockGitHub(app)
    await go(app, 'אטלס')
    await expect(app.locator('.bubble.me')).toContainText('לקנות חלב')
    await expect(app.locator('.bubble.atlas.thinking')).toBeVisible()
    const cache = await app.evaluate(() => JSON.parse(localStorage.getItem('life-os-atlas-cache') || 'null'))
    expect(cache.messages).toHaveLength(1)
    expect(cache.messages[0].pending).toBe(true)
    // הטוקן לא דלף למצב השמור
    const raw = await app.evaluate(() => localStorage.getItem('life-os-v1')!)
    expect(raw).not.toContain('ghp_FAKE')
  })

  test('כישלון שליחה: "לא נשלח" + "שלח שוב"; מחיקה מסירה את ההודעה', async ({ app }) => {
    const gh = await mockGitHub(app)
    gh.issueStatus = 500
    await go(app, 'אטלס')
    await composer(app).fill('הודעה שתיכשל')
    await app.getByRole('button', { name: 'שלח' }).click()
    const me = app.locator('.bubble.me')
    await expect(me).toHaveClass(/failed/)
    await expect(me).toContainText('לא נשלח')
    await expect(app.locator('.bubble.atlas.thinking')).toHaveCount(0)
    await expect(app.locator('.card', { hasText: 'השליחה נכשלה. בדוק רשת ונסה שוב.' })).toBeVisible()
    expect(gh.posted).toHaveLength(1)
    // ניסיון חוזר עדיין נכשל
    await me.getByRole('button', { name: 'שלח שוב' }).click()
    await expect.poll(() => gh.posted.length).toBe(2)
    await expect(me).toHaveClass(/failed/)
    // הרשת חזרה — שליחה חוזרת מצליחה
    gh.issueStatus = 201
    await me.getByRole('button', { name: 'שלח שוב' }).click()
    await expect.poll(() => gh.posted.length).toBe(3)
    await expect(me).not.toHaveClass(/failed/)
    await expect(app.locator('.bubble.atlas.thinking')).toBeVisible()
    await expect(app.locator('.card', { hasText: 'השליחה נכשלה' })).toHaveCount(0)
    // אותו מזהה בכל הניסיונות
    expect(new Set(gh.posted.map((p) => p.title)).size).toBe(1)

    // הודעה שנייה נכשלת — מוחקים אותה
    gh.issueStatus = 500
    await composer(app).fill('עוד אחת')
    await composer(app).press('Enter')
    const failed = app.locator('.bubble.me.failed')
    await expect(failed).toHaveCount(1)
    await failed.getByRole('button', { name: 'מחק' }).click()
    await expect(app.locator('.bubble.me')).toHaveCount(1)
    await expect(app.locator('.bubble.me')).toContainText('הודעה שתיכשל')
  })

  test('תשובה מהמאגר: הפקודה מבוצעת פעם אחת, מוצגת, ואפשר לבטל', async ({ app }) => {
    const gh = await mockGitHub(app)
    await go(app, 'אטלס')
    await composer(app).fill('תוסיף משימה לקנות חלב')
    await composer(app).press('Enter')
    await expect.poll(() => gh.posted.length).toBe(1)
    const userId = gh.posted[0].title

    // הסוכן "ענה": thread.json מוצפן עם פקודה addTask
    const replyAt = new Date(Date.parse(NOW_ISO) + 90_000).toISOString()
    gh.thread = await encrypt(
      JSON.stringify({
        messages: [
          { id: userId, at: new Date(Date.parse(NOW_ISO) + 5_000).toISOString(), from: 'user', text: 'תוסיף משימה לקנות חלב' },
          {
            id: 'a-1', at: replyAt, from: 'atlas', replyTo: userId,
            text: 'הוספתי "לקנות חלב" להיום.',
            commands: [{ id: 'cmd-1', op: 'addTask', task: { title: 'לקנות חלב', due: TODAY, trackId: 'trk-life', est: 1 } }],
          },
        ],
      }),
      AI_KEY,
    )
    // כשמחכים לתשובה מושכים כל 20 שניות
    await app.clock.runFor(25_000)
    const atlas = app.locator('.bubble.atlas:not(.thinking)')
    await expect(atlas).toContainText('הוספתי "לקנות חלב" להיום.')
    await expect(app.locator('.bubble.atlas.thinking')).toHaveCount(0)
    const cmd = atlas.locator('.cmd')
    await expect(cmd).toHaveText(/משימה חדשה: לקנות חלב · 2026-09-11/)
    await expect(cmd.getByRole('button', { name: 'ביטול' })).toBeVisible()

    // המשימה קיימת — מזהה נגזר מהפקודה, ומסומנת כבוצעה
    let st = await readState(app)
    const t = live<Task>(st.tasks).find((x) => x.title === 'לקנות חלב')!
    expect(t).toMatchObject({ id: 't-cmd-1', due: TODAY, trackId: 'trk-life', est: 1, status: 'todo' })
    expect(typeof st.atlasApplied['cmd-1']).toBe('number')
    await go(app, 'היום')
    await expect(app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'לקנות חלב' })).toBeVisible()
    await expect(app.locator('.atlas-card')).toContainText('ענה')
    await expect(app.locator('.atlas-card')).toContainText('הוספתי')

    // משיכה נוספת לא מבצעת שוב
    await app.clock.runFor(6 * 60_000)
    st = await readState(app)
    expect(live<Task>(st.tasks).filter((x) => x.title === 'לקנות חלב')).toHaveLength(1)

    // ביטול
    await go(app, 'אטלס')
    await cmd.getByRole('button', { name: 'ביטול' }).click()
    await expect(app.locator('.toast')).toContainText('בוטל')
    await expect(cmd.getByRole('button', { name: 'ביטול' })).toHaveCount(0)
    st = await readState(app)
    expect(live<Task>(st.tasks).filter((x) => x.title === 'לקנות חלב')).toHaveLength(0)
    expect(st.tasks.find((x: Task) => x.id === 't-cmd-1').deleted).toBe(true)
    await go(app, 'היום')
    await expect(app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'לקנות חלב' })).toHaveCount(0)
    // גם אחרי רענון הפקודה לא חוזרת
    await reload(app)
    await mockGitHub(app)
    await app.clock.runFor(6 * 60_000)
    st = await readState(app)
    expect(live<Task>(st.tasks).filter((x) => x.title === 'לקנות חלב')).toHaveLength(0)
  })

  test('טוקן פג (401) — הודעת שגיאה ברורה', async ({ app }) => {
    await app.route('https://api.github.com/**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' }),
    )
    await go(app, 'אטלס')
    await expect(app.locator('.card', { hasText: 'אין גישה למאגר של אטלס — הטוקן פג או חסר הרשאה.' })).toBeVisible()
  })
})
