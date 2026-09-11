// ---------------------------------------------------------------------------
// אטלס — המעבר בין המסלולים: העברה אוטומטית לעמוק, "משימה גדולה" ידנית,
// והתשובה העמוקה שמגיעה אחר כך ומתמזגת בלי כפילויות. וגם כרטיס ההגדרות.
// ---------------------------------------------------------------------------
import { test, expect, readState, readAtlasCache, waitSynced, gotoTab, gotoSettings } from '../cloud/fixtures'
import { openAtlas, atlasMsg, writeThread } from '../atlas2/helpers'
import { decryptJSON } from '../cloud/crypto'
import { atlasBubbles, bubbles, fastState, repoThread, say, seedFast, settled } from './helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(90_000)

const NOISE = /status of 404/

test('העברה אוטומטית: המהיר מחזיר escalate → הסבר בבועה, Issue נפתח, "אטלס חושב"; התשובה העמוקה מתמזגת בלי כפילות', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)

  claude.reply({ text: 'זה שינוי בקוד — מעביר לאטלס העמוק.', block: { commands: [], escalate: 'שינוי במסך היומן', memory: null } })
  await say(A.page, 'תוסיף כפתור ייצוא ליומן')
  // ההסבר מוצג, ההודעה עדיין ממתינה, Issue נפתח
  await expect(atlasBubbles(A.page).last()).toContainText('מעביר לאטלס העמוק', { timeout: 8_000 })
  await expect.poll(() => fake.issues.length, { timeout: 8_000 }).toBe(1)
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  const cache = await readAtlasCache(A.page)
  const user = cache.messages.find((m: any) => m.from === 'user')
  expect(user).toMatchObject({ pending: true, lane: 'deep' })
  const note = cache.messages.find((m: any) => m.from === 'atlas')
  expect(note.replyTo).toBeUndefined()
  // ה-Issue נושא את ההודעה המקורית עם המזהה שלה
  const issue = await decryptJSON<{ id: string; text: string }>(fake.issues[0].body, ai)
  expect(issue).toMatchObject({ id: user.id, text: 'תוסיף כפתור ייצוא ליומן' })
  // ב-thread.json: ההסבר נכתב, ההודעה שלו לא — כדי שהסריקה בענן תדע שהיא עוד לא נענתה
  await expect.poll(async () => (await repoThread(fake, ai)).length, { timeout: 10_000 }).toBe(1)
  expect((await repoThread(fake, ai))[0]).toMatchObject({ from: 'atlas', lane: 'fast' })

  // התשובה העמוקה מגיעה למאגר (עם ההודעה שלו, כמו שהשגרה כותבת)
  const th = await repoThread(fake, ai)
  await writeThread(fake, ai, [
    { id: user.id, at: user.at, from: 'user', text: user.text },
    ...th,
    atlasMsg('a-deep-1', new Date().toISOString(), [{ id: 'c-deep-1', op: 'addTask', task: { title: 'משימה מהעמוק' } }], { text: 'הוספתי את הכפתור. ראה יומן.', replyTo: user.id }),
  ])
  await expect(atlasBubbles(A.page).last()).toContainText('הוספתי את הכפתור', { timeout: 20_000 })
  await settled(A.page, 20_000)
  await expect(bubbles(A.page)).toHaveCount(3)
  await expect(A.page.locator('.bubble.me')).toHaveCount(1)
  await expect.poll(async () => (await readState(A.page)).tasks.some((t) => t.title === 'משימה מהעמוק')).toBe(true)
})

test('"משימה גדולה" שולחת ישירות לעמוק בלי לשאול את Claude; הטוגל מתאפס אחרי שליחה', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  const toggle = A.page.getByRole('button', { name: 'משימה גדולה' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(A.page.locator('.composer textarea')).toHaveAttribute('placeholder', /אטלס העמוק/)
  await say(A.page, 'תבנה לי תוכנית לחודש')
  await expect.poll(() => fake.issues.length, { timeout: 8_000 }).toBe(1)
  await expect(A.page.locator('.bubble.thinking')).toBeVisible()
  expect(claude.requests).toHaveLength(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect((await readAtlasCache(A.page)).messages[0]).toMatchObject({ lane: 'deep', pending: true })
})

test('תשובה מהירה שמגיעה כשמסך "היום" פתוח — הכרטיס מציג אותה; הכרטיס אומר "עובד על התשובה" רק במסלול העמוק', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  claude.reply({ text: 'תשובה קצרה למסך היום.', delayMs: 1500 })
  await say(A.page, 'שאלה')
  await gotoTab(A.page, 'היום')
  await expect(A.page.locator('.atlas-card')).toContainText('תשובה קצרה למסך היום.', { timeout: 10_000 })
  await expect(A.page.locator('.atlas-card')).toContainText('ענה')
})

test('הגדרות → אטלס: הדבקת מפתח נשמרת ומסונכרנת, בדיקת חיבור עובדת, והחשבון מתעדכן', async ({ fake, claude, key, openDevice }) => {
  const ai = await seedFast(fake, key, null)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai, null), login: true, allowConsole: [NOISE] })
  await waitSynced(A.page)
  await gotoSettings(A.page)
  const card = A.page.locator('.card', { hasText: 'מפתח API של Claude' })
  await expect(card).toContainText('מהיר: כבוי')
  const input = card.getByLabel('מפתח API של Claude')
  await expect(input).toHaveAttribute('type', 'password')
  await input.fill('sk-ant-pasted-key')
  await input.blur()
  await expect(card).toContainText('מהיר: פעיל')
  await expect.poll(async () => (await readState(A.page)).settings.apiKey).toBe('sk-ant-pasted-key')

  claude.reply({ text: 'מוכן', usage: { input: 12, output: 3 } })
  await card.getByRole('button', { name: 'בדיקת חיבור' }).click()
  await expect(A.page.locator('.toast')).toContainText('מחובר', { timeout: 8_000 })
  expect(claude.last('A')!.headers['x-api-key']).toBe('sk-ant-pasted-key')
  expect(claude.last('A')!.stream).toBe(false)
  await expect(card).toContainText('1 פניות')

  // המפתח מגיע למחסן מוצפן (ולכן למכשירים האחרים)
  await waitSynced(A.page)
  await expect.poll(async () => {
    const f = fake.files['life-os.json']
    if (!f) return ''
    const s = await decryptJSON<any>(f, key)
    return s.settings?.apiKey ?? ''
  }, { timeout: 15_000 }).toBe('sk-ant-pasted-key')
  // המחסן עצמו לא מכיל את המפתח בגלוי
  expect(fake.files['life-os.json']).not.toContain('sk-ant-pasted-key')

  // מסך אטלס עכשיו במסלול המהיר
  await gotoTab(A.page, 'אטלס')
  await expect(A.page.getByRole('button', { name: 'משימה גדולה' })).toBeVisible()
})
