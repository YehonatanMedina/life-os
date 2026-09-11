// ---------------------------------------------------------------------------
// סבב 2 (regress) — מחשב: planFrom במעבר השבועי (סגירה מוקדמת ביום ראשון חייבת
// לתכנן שבוע מלא), clock() בכל ארבעת המקומות, ומגן הקליקים השקוף לעכבר.
// ---------------------------------------------------------------------------
import { test, expect, readState, go, seed, live, onboarded } from '../desktop/desk'
import type { Session, Task } from '../../../src/types'

test.skip(({ isMobile }) => !!isMobile, 'desktop only')

const at = (iso: string) => Date.parse(iso + '+03:00')
const session = (id: string, endedAt: number, minutes: number, trackId: string): Session => ({
  id, updatedAt: endedAt, startedAt: endedAt - minutes * 60_000, endedAt, minutes, trackId,
})

test.describe('סגירה מוקדמת ביום ראשון — planFrom', () => {
  test.use({
    clock: '2026-09-13T10:00:00+03:00', // יום ראשון; השבוע 6.9–12.9 הסתיים אתמול
    seed: seed((s) => ({
      ...s,
      settings: { ...s.settings, onboarded: true, reviewLock: false },
      sessions: [session('s1', at('2026-09-08T12:00:00'), 90, 'trk-study')],
      tasks: [
        { id: 't-pool', title: 'משימה במאגר לשבוע הבא', trackId: 'trk-research', status: 'todo', order: 1, updatedAt: at('2026-09-01T10:00:00'), createdAt: at('2026-09-01T10:00:00') } as Task,
      ],
    })),
  })

  test('שלב המטרות: 42 אסימונים לשבוע 13.9–19.9; שלב המשימות: כל שבעת הימים, והמשימות נוחתות על ראשון 13.9', async ({ app }) => {
    await app.locator('.card.rail', { hasText: /המעבר השבועי/ }).first().click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    await expect(flow).toBeVisible()
    const title = flow.locator('.flow-head b').first()
    const next = flow.getByRole('button', { name: 'הבא ←' })

    await expect(title).toHaveText('המספרים')
    await expect(flow.locator('.ring-wrap .n')).toHaveText('1.0')
    await next.click()
    await expect(title).toHaveText('הניתוח')
    await next.click()
    await expect(title).toHaveText('השאלות')
    await flow.locator('.qcard textarea').first().fill('שבוע סביר')
    await flow.locator('.scorebar').getByRole('button', { name: '7', exact: true }).click()
    await next.click()

    await expect(title).toHaveText('מטרות')
    await expect(flow).toContainText('לשבוע 13.9 – 19.9')
    await expect(flow).toContainText('קיבולת של 42 אסימונים')
    await next.click()

    await expect(title).toHaveText('המשימות')
    const dayRow = (d: string) => flow.locator('.item', { has: app.locator(`.tiny.faint.ltr:text-is("${d}")`) })
    for (const d of ['13.9', '14.9', '15.9', '16.9', '17.9', '18.9', '19.9']) await expect(dayRow(d)).toHaveCount(1)
    await expect(dayRow('12.9')).toHaveCount(0)
    await expect(dayRow('20.9')).toHaveCount(0)

    await flow.locator('.card', { hasText: 'מהמאגר' }).getByRole('button', { name: /משימה במאגר לשבוע הבא/ }).click()
    const inp = flow.getByPlaceholder('מה עוד חייב לקרות בשבוע הבא?')
    await inp.fill('להגיש דו״ח')
    await inp.press('Enter')
    await expect(dayRow('13.9')).toContainText('להגיש דו״ח')
    await expect(dayRow('13.9')).toContainText('משימה במאגר לשבוע הבא')
    const st = await readState(app)
    expect(live<Task>(st.tasks).find((t) => t.title === 'להגיש דו״ח')!.due).toBe('2026-09-13')
    expect(live<Task>(st.tasks).find((t) => t.id === 't-pool')!.due).toBe('2026-09-13')
  })
})

test.describe('clock() — שעון אחד בכרטיס, בסרגל, במיקוד ובכותרת הלשונית', () => {
  const NOW = Date.parse('2026-09-11T10:00:00+03:00')
  test.use({
    seed: seed((s) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      timer: { running: true, startedAt: NOW, accumulated: 0, trackId: 'trk-study', label: 'עבודה', targetMinutes: 120, lastSeen: NOW },
    })),
  })

  test('יעד של 120 דק׳: h:mm:ss בכל מקום, והכותרת מתקתקת בדקה הנכונה', async ({ app }) => {
    const card = app.locator('.timer-card')
    await expect(card.locator('.timer-time')).toHaveText(/^(2:00:00|1:59:5\d)$/)
    await expect(app.locator('nav.sidebar .foot .chip')).toHaveText(/(2:00:00|1:59:5\d)$/)
    await expect.poll(() => app.title()).toBe('120 דק׳ · מערכת ההפעלה')

    await app.clock.runFor(61_000)
    await expect.poll(() => app.title(), { timeout: 5_000 }).toBe('119 דק׳ · מערכת ההפעלה')
    await expect(card.locator('.timer-time')).toHaveText(/^1:58:5\d$/)
    await expect(app.locator('nav.sidebar .foot .chip')).toHaveText(/1:58:5\d$/)

    await card.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
    await expect(focus.locator('.focus-time')).toHaveText(/^1:58:[45]\d$/)
    await app.keyboard.press('Escape')
    await expect(focus).toBeHidden()
  })
})

test.describe('מגן הקליקים (ui.tsx › shieldClicks)', () => {
  test.use({ seed: onboarded })

  // a561495: המגן הוא ספירה (click בלכידה) ולא שכבה. ב-2272316 (שכבה שמוסרת ב-pointerdown)
  // הקליק הראשון של העכבר אחרי הסגירה עדיין נבלע — Chrome משגר click רק על אב משותף של יעדי
  // mousedown/mouseup, ולאלמנט שנותק אין כזה. נמדד כאן לפני ההחלפה: had=1 → הניווט לא קרה.
  test('עכבר עובר מיד אחרי סגירת גיליון (בתוך 350 מ״ש), ואין שום שכבה ב-DOM', async ({ app }) => {
    const overlays = () =>
      app.evaluate(() => document.querySelectorAll('body > div[aria-hidden="true"][style*="9999"]').length)
    await go(app, 'הגדרות')
    // "+ חדש" הראשון בהגדרות הוא של הבלוקים הקבועים
    await app.getByRole('button', { name: '+ חדש' }).first().click()
    const dlg = app.getByRole('dialog', { name: 'בלוק קבוע' })
    await expect(dlg).toBeVisible()
    expect(await overlays()).toBe(0)

    const todayBtn = app.locator('nav.sidebar').getByRole('button', { name: 'היום', exact: true })
    const box = (await todayBtn.boundingBox())!
    const t0 = Date.now()
    await dlg.getByRole('button', { name: 'סגירה' }).click()
    // קליק עכבר בלי בדיקות actionability — מיד, בתוך חלון ה-350 מ״ש
    await app.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const elapsed = Date.now() - t0
    await expect(app.locator('nav.sidebar button[aria-current="true"]')).toHaveText(/היום/, { timeout: 1_500 })
    expect(elapsed, 'הקליק נמדד בתוך חלון המגן').toBeLessThan(350)
    expect(await overlays()).toBe(0)
    await app.waitForTimeout(400)
    expect(await overlays()).toBe(0)
  })
})
