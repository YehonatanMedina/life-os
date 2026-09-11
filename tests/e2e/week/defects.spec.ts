import { test, expect, jumpTo, nav, openReview, sub, weekSeed, SUN_0735 } from './week'
import { readState, seed, live } from '../desktop/desk'
import type { AppState, WeekLog } from '../../../src/types'

// ---------------------------------------------------------------------------
// פגמים שאומתו במסע השבועי — כל אחד משוחזר כאן בנפרד. 1–4 תוקנו בסבב 2 (נעילה ותזכורת
// רק על שבוע עם תוכן, יום סקירה שאינו ראשון, רמז 03:30 גם בטלפון); 5 הוא התנהגות מתועדת.
// ---------------------------------------------------------------------------

const at = (iso: string) => Date.parse(iso + '+03:00')

test.describe('פגם 1 — הנעילה ביום הסקירה קופצת גם כשהשבוע שהיא מסכמת ריק', () => {
  test.use({ seed: weekSeed, clock: SUN_0735 })

  test('התקנה שמתחילה ביום ראשון: הנגיעה הראשונה נועלת את האפליקציה על שבוע בלי כלום', async ({ app }) => {
    await expect(app.locator('.lock-overlay')).toHaveCount(0)
    // "כן, קמתי בזמן" — יומן יום ראשון נוצר, ואיתו הנעילה על השבוע 6.9–12.9
    await app.getByRole('button', { name: 'כן, קמתי בזמן', exact: true }).click()
    await expect(app.locator('.toast')).toContainText('העוגן נשמר')
    // צפוי: אין מה לסכם בשבוע שעבר — אין נעילה
    await expect(app.locator('.lock-overlay')).toHaveCount(0)
    await expect(app.locator('.timer-card')).toBeVisible()
  })
})

test.describe('פגם 2 — תשובת השינה של בוקר ראשון "פותחת" את השבוע שעבר לסקירה', () => {
  test.use({ seed: weekSeed, clock: SUN_0735 })

  test('אחרי "ישנתי טוב" מופיעה תזכורת מעבר על 6.9–12.9, והסקירה נפתחת על השבוע הריק', async ({ app }) => {
    await app.getByRole('button', { name: 'ישנתי טוב', exact: true }).click()
    await expect(app.locator('.toast')).toContainText('לילה טוב נספר')
    const st = await readState(app)
    // התשובה נכתבת על אתמול (12.9) — זה נכון בפני עצמו
    expect(st.days.find((d: any) => d.date === '2026-09-12').sleep).toBe('good')
    // אבל השבוע 6.9–12.9 לא באמת קרה — לא אמורה להיות תזכורת
    await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
    // והסקירה צריכה להיפתח על השבוע הנוכחי
    await nav(app, 'סקירה')
    await expect(app.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first()).toContainText('שבוע 13.9 – 19.9')
  })
})

test.describe('פגם 3 — reviewDow שאינו ראשון: הנעילה מבקשת את השבוע הלא נכון', () => {
  // שבת 19.9 בערב, עם reviewDow = 6 ונתונים אמיתיים בשבוע 13.9–19.9
  test.use({
    clock: '2026-09-19T20:00:00+03:00',
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true, reviewDow: 6 },
      sessions: [{ id: 's1', updatedAt: at('2026-09-15T12:00:00'), startedAt: at('2026-09-15T10:30:00'), endedAt: at('2026-09-15T12:00:00'), minutes: 90, trackId: 'trk-study' }],
    })),
  })

  test('בשבת, יום הסקירה, הנעילה פותחת את 6.9–12.9 (ריק) במקום את 13.9–19.9 (עם 90 דק׳)', async ({ app }) => {
    const lock = app.locator('.lock-overlay')
    await expect(lock).toBeVisible()
    await lock.getByRole('button', { name: 'פתיחת המעבר השבועי' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    // צפוי: השבוע שמסתיים היום, עם האסימון שנרשם בו
    await expect(flow).toContainText('שבוע 13.9 – 19.9')
    await expect(flow.locator('.ring-wrap .n')).toHaveText('1.0')
  })
})

test.describe('פגם 4 — בטלפון אין את הרמז "היום מתחלף ב־03:30" אחרי חצות', () => {
  test.use({ seed: weekSeed, clock: '2026-09-14T01:00:00+03:00' })

  test('01:00 בלילה: המחשב אומר שהיום הלוגי הוא עדיין אתמול, הטלפון לא', async ({ app }) => {
    await expect(sub(app)).toHaveText('יום ראשון, 13 בספטמבר · היום מתחלף ב־03:30')
  })
})

test.describe('פגם 5 — טיימר שרץ על פני 03:30: הסשן כולו נופל על היום החדש', () => {
  test.use({ seed: weekSeed, clock: '2026-09-14T02:50:00+03:00' })

  test('בלוק 02:50–03:50 נרשם כולו על יום שני, וטבעת יום ראשון לא זזה', async ({ app }) => {
    // התנהגות מתועדת (README: "בלוק שנגמר באחת בלילה נספר על היום שהתחיל בבוקר") — הסשן משויך
    // לפי רגע הסיום. כאן רק מוודאים שאין כפילות ושאין קפיצה של הטיימר במעבר.
    const card = app.locator('.timer-card')
    await card.getByRole('button', { name: /לימודים/ }).click()
    for (let i = 0; i < 24; i++) await app.clock.fastForward(150_000)
    await app.clock.runFor(1_100)
    await expect(sub(app)).toHaveText('יום שני, 14 בספטמבר')
    await expect(card).toContainText('60 מתוך 90 דק׳')
    await card.getByRole('button', { name: /סיים ושמור/ }).click()
    await expect(app.locator('.toast')).toContainText('60 דקות נשמרו')
    await expect(card.locator('.ring-wrap .n')).toHaveText('0.7')
    const st = await readState(app)
    expect(live(st.sessions)).toHaveLength(1)
    await openReview(app)
    await expect(app.locator('.daybar', { hasText: 'א׳' })).toContainText('·')
    await expect(app.locator('.daybar', { hasText: 'ב׳' })).toContainText('1.0')
    void jumpTo
    void (null as unknown as WeekLog)
  })
})
