// ---------------------------------------------------------------------------
// מה שקורה כשהרשת והשרת לא משתפים פעולה — במסלול המהיר, במקומות שבהם
// "נראה שזה עבד" הוא הכי מסוכן:
//   * זרם שנקטע באמצע התשובה — חצי תשובה עם חצי בלוק פקודות.
//   * חסימת קצב (429) ושרת שנופל (500) — ניסיון חוזר שמצליח.
//   * שתי הודעות בלי לחכות, ורענון באמצע.
// הדרישה: שום פקודה חלקית לא מתבצעת, שום תשובה חתוכה לא מוצגת כשלמה, ותמיד
// יש דרך לקבל את התשובה — "שלח שוב" או המסלול העמוק.
// ---------------------------------------------------------------------------
import { test, expect, readState, readAtlasCache, waitSynced, reload } from '../cloud/fixtures'
import { openAtlas } from '../atlas2/helpers'
import { logicalToday } from '../cloud/state'
import { atlasBubbles, bubbles, fastState, say, seedFast, settled } from '../atlas-fast/helpers'

test.describe.configure({ mode: 'parallel' })
test.setTimeout(150_000)

const NOISE = /status of 404/
const TODAY = logicalToday()

async function device(fake: any, key: string, openDevice: any, allow: RegExp[] = []) {
  const ai = await seedFast(fake, key)
  const A = await openDevice({ tag: 'A', state: fastState('dA', ai), login: true, allowConsole: [NOISE, ...allow] })
  await waitSynced(A.page)
  await openAtlas(A.page)
  return { A, ai }
}

test('זרם שנקטע באמצע: ההודעה מסומנת "לא נשלח" עם הסבר, אף פקודה חלקית לא מתבצעת, ו"שלח שוב" מביא תשובה שלמה', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice)

  // תשובה עם בלוק פקודות — ונחתכת באמצע הבלוק
  claude.reply({
    text: 'מוסיף את המשימה. ',
    block: { commands: [{ id: 'x1', op: 'addTask', task: { title: 'משימה מזרם שנקטע', due: TODAY } }], escalate: null, memory: null },
    cutAfterChars: 900,
  })
  await say(A.page, 'תוסיף משימה לסמינר')

  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(1, { timeout: 15_000 })
  await expect(A.page.locator('.card.rail.alert')).toContainText('נקטע באמצע')
  // שום משימה לא נוצרה — בלוק חתוך הוא לא פקודה
  const s1 = await readState(A.page)
  expect(s1.tasks.some((t) => t.title === 'משימה מזרם שנקטע')).toBe(false)
  // ואין בועה של אטלס שנשארה תלויה
  await expect(A.page.locator('.bubble.streaming')).toHaveCount(0)

  // שלח שוב — הפעם התשובה שלמה, והמשימה נכנסת
  claude.reply({
    text: 'נוסף.',
    block: { commands: [{ id: 'x2', op: 'addTask', task: { title: 'משימה מזרם שנקטע', due: TODAY } }], escalate: null, memory: null },
  })
  await A.page.getByRole('button', { name: 'שלח שוב' }).click()
  await settled(A.page, 15_000)
  await expect
    .poll(async () => (await readState(A.page)).tasks.some((t) => t.title === 'משימה מזרם שנקטע' && !t.deleted), { timeout: 10_000 })
    .toBe(true)
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(0)
})

test('429 ואחריו 500: הודעות חולפות עם "שלח שוב", ולא מעבר לעמוק — ואז תשובה', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice, [/status of (429|500)/])

  claude.reply({ status: 429, errorMessage: 'rate limit', errorType: 'rate_limit_error' })
  await say(A.page, 'מה עכשיו?')
  await expect(A.page.locator('.card.rail.alert')).toContainText('יותר מדי בקשות', { timeout: 12_000 })
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(1)
  expect(fake.issues).toHaveLength(0)

  claude.reply({ status: 500, errorMessage: 'boom' })
  await A.page.getByRole('button', { name: 'שלח שוב' }).click()
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(1, { timeout: 12_000 })
  expect(fake.issues).toHaveLength(0)

  claude.reply({ text: 'עכשיו כן: שני בלוקים והגשה מחר.' })
  await A.page.getByRole('button', { name: 'שלח שוב' }).click()
  await expect(atlasBubbles(A.page).last()).toContainText('שני בלוקים', { timeout: 12_000 })
  await settled(A.page)
  await expect(A.page.locator('.bubble.me.failed')).toHaveCount(0)
  // שלוש בקשות בסך הכל — לא לופ
  expect(claude.requests.filter((r) => r.tag === 'A')).toHaveLength(3)
})

test('שתי הודעות בזו אחר זו בלי לחכות: שתיהן נענות, בסדר, ובלי תשובה כפולה', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice)
  claude.reply({ text: 'ראשונה.', chunkDelayMs: 400 })
  claude.reply({ text: 'שנייה.' })

  await say(A.page, 'שאלה ראשונה')
  await say(A.page, 'שאלה שנייה')
  await settled(A.page, 20_000)

  const texts = await atlasBubbles(A.page).allInnerTexts()
  expect(texts.filter((t) => /ראשונה\./.test(t))).toHaveLength(1)
  expect(texts.filter((t) => /שנייה\./.test(t))).toHaveLength(1)
  await expect(bubbles(A.page)).toHaveCount(4)
  const cache = await readAtlasCache(A.page)
  expect((cache?.messages ?? []).filter((m: any) => m.from === 'user')).toHaveLength(2)
  expect((cache?.messages ?? []).some((m: any) => m.pending || m.failed)).toBe(false)
})

test('רענון בזמן שהתשובה בדרך: ההודעה לא נעלמת ולא נשלחת פעמיים', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice)
  claude.reply({ text: 'תשובה אחרי רענון.', chunkDelayMs: 2_500 })
  await say(A.page, 'שאלה לפני רענון')
  await A.page.waitForTimeout(400)
  await reload(A.page)
  await openAtlas(A.page)

  // ההודעה שלו שם, ולא נוצרה כפילות
  await expect(A.page.getByText('שאלה לפני רענון', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  const cache = await readAtlasCache(A.page)
  expect((cache?.messages ?? []).filter((m: any) => m.text === 'שאלה לפני רענון')).toHaveLength(1)
  // הבקשה לא נשלחת מחדש לבד (אין כפילות במודל), ותמיד יש דרך להמשיך
  expect(claude.requests.filter((r) => r.tag === 'A').length).toBeLessThanOrEqual(2)
  const failed = A.page.locator('.bubble.me.failed')
  if (await failed.count()) {
    claude.reply({ text: 'ואחרי שלח שוב.' })
    await A.page.getByRole('button', { name: 'שלח שוב' }).click()
    await expect(atlasBubbles(A.page).last()).toContainText('ואחרי שלח שוב', { timeout: 12_000 })
  }
})

test('תשובה ארוכה מאוד (25 אלף תווים): נשמרת, מוצגת, ולא תוקעת את המסך', async ({ fake, claude, key, openDevice }) => {
  const { A } = await device(fake, key, openDevice)
  const long = 'שורה של תוכן ארוך שחוזרת שוב ושוב כדי לבדוק גלילה וזיכרון. '.repeat(430)
  claude.reply({ text: long })
  const t0 = Date.now()
  await say(A.page, 'תסביר לי הכל על הסמינר')
  await settled(A.page, 30_000)
  expect(Date.now() - t0).toBeLessThan(25_000)

  const cache = await readAtlasCache(A.page)
  const last = (cache?.messages ?? []).filter((m: any) => m.from === 'atlas').pop()
  expect((last?.text ?? '').length).toBeGreaterThan(20_000)
  // המסך עדיין מגיב: אפשר לעבור מסך ולחזור
  await expect(A.page.locator('.composer textarea')).toBeVisible()
  await reload(A.page)
  await openAtlas(A.page)
  await expect(atlasBubbles(A.page).last()).toContainText('שורה של תוכן ארוך', { timeout: 15_000 })
})
