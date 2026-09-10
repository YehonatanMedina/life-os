import { test, expect, readState, reload, go, live, seed, PREV_WEEK_START, WEEK_START, NEXT_WEEK_START } from './desk'
import type { AppState, Session, Task, WeekLog } from '../../../src/types'

// ---------------------------------------------------------------------------
// 7. סקירה: ניווט בין שבועות, המספרים משקפים את הסשנים, המעבר השבועי על
//    שש שלבים, מטרות־העל מגיעות למסך היום, ונעילת יום ראשון
// ---------------------------------------------------------------------------

const at = (iso: string) => Date.parse(iso + '+03:00')
const session = (id: string, endedAt: number, minutes: number, trackId: string): Session => ({
  id, updatedAt: endedAt, startedAt: endedAt - minutes * 60_000, endedAt, minutes, trackId,
})

/** השבוע שהסתיים (30.8–5.9): 90 לימודים בשני, 180 מחקר ברביעי, 45 פרויקט בחמישי */
const withLastWeek = seed((s: AppState) => ({
  ...s,
  settings: { ...s.settings, onboarded: true },
  sessions: [
    session('s1', at('2026-08-31T12:00:00'), 90, 'trk-study'),
    session('s2', at('2026-09-02T12:00:00'), 180, 'trk-research'),
    session('s3', at('2026-09-03T12:00:00'), 45, 'trk-project'),
    // ואחד בשבוע הנוכחי, כדי לוודא שהוא לא נספר בשבוע שעבר
    session('s4', at('2026-09-08T12:00:00'), 60, 'trk-study'),
  ],
  days: [
    { id: 'day-2026-09-01', updatedAt: at('2026-09-01T09:00:00'), date: '2026-09-01', wake: 'ontime', sleep: 'good', habits: { 'hb-morning': true, 'hb-workout': true, 'hb-night': false }, steps: {} },
    { id: 'day-2026-09-02', updatedAt: at('2026-09-02T09:00:00'), date: '2026-09-02', wake: 'late', sleep: 'bad', habits: { 'hb-morning': true }, steps: {} },
  ],
  tasks: [
    { id: 't-done', title: 'נסגרה בשבוע שעבר', trackId: 'trk-study', status: 'done', order: 0, updatedAt: at('2026-09-02T15:00:00'), doneAt: at('2026-09-02T15:00:00'), createdAt: at('2026-08-25T10:00:00') } as Task,
    { id: 't-pool', title: 'משימה במאגר לשבוע הבא', trackId: 'trk-research', status: 'todo', order: 1, updatedAt: at('2026-08-25T10:00:00'), createdAt: at('2026-08-25T10:00:00') } as Task,
    // שלוש משימות כבדות במאגר — לבדיקת הפיזור לפי קיבולת
    ...['א', 'ב', 'ג'].map((x, i) => ({
      id: `t-big-${i}`, title: `עבודה ${x}`, trackId: 'trk-study', status: 'todo', order: 2 + i, est: 4,
      updatedAt: at('2026-08-25T10:00:00'), createdAt: at('2026-08-25T10:00:00'),
    }) as Task),
  ],
}))

test.describe('סקירה', () => {
  test.use({ seed: withLastWeek })

  test('המספרים משקפים את הסשנים, וניווט בין שבועות', async ({ app }) => {
    // במסך היום: תזכורת למעבר
    const nudge = app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })
    await expect(nudge).toBeVisible()
    await expect(nudge).toContainText('30.8–5.9')
    await expect(nudge).toContainText('כבר 5 ימים')

    await go(app, 'סקירה')
    await expect(app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' })).toContainText('30.8 – 5.9')
    // כשיש סקירה ממתינה — המסך נפתח על השבוע שעבר
    const head = app.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first()
    await expect(head).toContainText('שבוע 30.8 – 5.9')
    await expect(head.locator('.chip', { hasText: 'בעיצומו' })).toHaveCount(0)

    const numbers = app.locator('.card', { hasText: 'זמן נטו' }).first()
    await expect(numbers.locator('.ring-wrap .n')).toHaveText('3.5')
    await expect(numbers.locator('.ring-wrap .l')).toHaveText('מתוך 42')
    const stat = (t: string) => numbers.locator('.grid3 > div', { has: app.locator(`.tiny.faint:text-is("${t}")`) }).locator('b')
    await expect(stat('זמן נטו')).toHaveText('5 שע׳ 15 דק׳')
    await expect(stat('ימים ביעד')).toHaveText('0/7')
    await expect(stat('משימות שנסגרו')).toHaveText('1')
    await expect(stat('לילות טובים')).toHaveText('1/2')
    // הרגלים: יום 1 = 2/3, יום 2 = 1/3 → ממוצע 50%
    await expect(stat('הרגלים')).toHaveText('50%')

    const bars = app.locator('.card', { hasText: 'עבודה לפי יום' })
    await expect(bars.locator('.daybar', { hasText: 'ב׳' })).toContainText('1.5')
    await expect(bars.locator('.daybar', { hasText: 'ד׳' })).toContainText('3.0')
    await expect(bars.locator('.daybar', { hasText: 'ה׳' })).toContainText('0.8')
    await expect(bars.locator('.daybar', { hasText: 'ג׳' })).toContainText('·')

    const split = app.locator('.card', { hasText: 'לאן הלך הזמן' })
    await expect(split).toContainText('לימודים')
    await expect(split).toContainText('1 שע׳ 30 דק׳')
    await expect(split).toContainText('3 שע׳')
    await expect(split).toContainText('45 דק׳')
    await expect(split).not.toContainText('חיים')

    // הניתוח המקומי
    const ins = app.locator('.card', { hasText: 'הניתוח של השבוע' })
    await expect(ins).toBeVisible()
    await expect(ins).toContainText('מהיעד השבועי')

    // ניווט: לשבוע הנוכחי (‹), ואז אי אפשר קדימה
    const nextBtn = app.getByRole('button', { name: 'לשבוע הבא' })
    const prevBtn = app.getByRole('button', { name: 'לשבוע הקודם' })
    await nextBtn.click()
    await expect(head).toContainText('שבוע 6.9 – 12.9')
    await expect(head.locator('.chip', { hasText: 'בעיצומו' })).toBeVisible()
    await expect(nextBtn).toBeDisabled()
    await expect(numbers.locator('.ring-wrap .n')).toHaveText('0.7')
    await expect(stat('זמן נטו')).toHaveText('1 שע׳')
    await expect(stat('משימות שנסגרו')).toHaveText('0')
    await prevBtn.click()
    await prevBtn.click()
    await expect(head).toContainText('שבוע 23.8 – 29.8')
    await expect(numbers.locator('.ring-wrap .n')).toHaveText('0.0')
    await expect(app.locator('.card', { hasText: 'לאן הלך הזמן' })).toHaveCount(0)
    await app.getByRole('button', { name: 'השבוע', exact: true }).click()
    await expect(head).toContainText('שבוע 6.9 – 12.9')
    // גרף לאורך זמן: שני שבועות
    await expect(app.locator('.card', { hasText: 'שעות עבודה לאורך הזמן' }).locator('.hist i')).toHaveCount(2)
  })

  test('המעבר השבועי: שישה שלבים, אימות, מטרות ומשימות לשבוע הבא, סגירה', async ({ app }) => {
    await app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    await expect(flow).toBeVisible()
    const title = flow.locator('.flow-head b').first()
    const next = flow.getByRole('button', { name: 'הבא ←' })
    const back = flow.getByRole('button', { name: 'חזרה' })

    // 1. המספרים
    await expect(title).toHaveText('המספרים')
    await expect(flow).toContainText('שלב 1/6')
    await expect(flow.locator('.ring-wrap .n')).toHaveText('3.5')
    await expect(back).toHaveCount(0)
    await next.click()

    // 2. הניתוח
    await expect(title).toHaveText('הניתוח')
    await expect(flow.locator('.ins').first()).toBeVisible()
    await expect(flow.getByRole('button', { name: /ניתוח מעמיק עם Claude/ })).toBeVisible()
    await next.click()

    // 3. השאלות — חייבים תשובה אחת וציון
    await expect(title).toHaveText('השאלות')
    await expect(flow.locator('.qcard textarea')).toHaveCount(5)
    await next.click()
    await expect(app.locator('.toast')).toContainText('ענה לפחות על שאלה אחת')
    await expect(title).toHaveText('השאלות')
    await flow.locator('.qcard textarea').first().fill('טיוטה ראשונה של הסמינר')
    await next.click()
    await expect(app.locator('.toast')).toContainText('סמן איך הרגיש השבוע')
    await flow.getByRole('button', { name: '+ עוד 4 שאלות' }).click()
    await expect(flow.locator('.qcard textarea')).toHaveCount(9)
    await flow.locator('.scorebar').getByRole('button', { name: '7', exact: true }).click()
    await next.click()

    // 4. מטרות — לשבוע 6.9–12.9 (השבוע הנוכחי, כי הסקירה מאוחרת)
    await expect(title).toHaveText('מטרות')
    await expect(flow).toContainText('לשבוע 6.9 – 12.9')
    // סגירה מאוחרת (שישי): מתכננים רק את הימים שנשארו — שישי ושבת, 6 אסימונים כל אחד
    await expect(flow).toContainText('קיבולת של 12 אסימונים')
    await expect(flow).toContainText('בפועל השבוע שנסגר הכניס 3.5')
    const g1 = flow.locator('.qcard', { hasText: 'מטרה 1' })
    await g1.locator('input').fill('לסיים את פרק 1 בסמינר')
    await g1.getByRole('button', { name: /מחקר/ }).click()
    await flow.getByRole('button', { name: '+ מטרה נוספת' }).click()
    const g2 = flow.locator('.qcard', { hasText: 'מטרה 2' })
    await g2.locator('input').fill('לרוץ 10 ק״מ')
    await flow.getByRole('button', { name: '+ מטרה נוספת' }).click()
    await expect(flow.getByRole('button', { name: '+ מטרה נוספת' })).toHaveCount(0) // שלוש לכל היותר
    await flow.locator('.qcard', { hasText: 'מטרה 3' }).getByRole('button', { name: 'מחיקת המטרה' }).click()
    await expect(flow.locator('.qcard', { hasText: /^מטרה \d/ })).toHaveCount(2)
    // חזרה ושוב קדימה — המצב נשמר
    await back.click()
    await expect(title).toHaveText('השאלות')
    await expect(flow.locator('.scorebar button.on')).toHaveText('7')
    await next.click()
    await expect(g1.locator('input')).toHaveValue('לסיים את פרק 1 בסמינר')
    await next.click()

    // 5. המשימות
    await expect(title).toHaveText('המשימות')
    await expect(flow).toContainText('0 משימות בשבוע')
    // משיכה מהמאגר
    await flow.locator('.card', { hasText: 'מהמאגר' }).getByRole('button', { name: /משימה במאגר לשבוע הבא/ }).click()
    await expect(flow).toContainText('משימה אחת בשבוע')
    // משימה חדשה
    const inp = flow.getByPlaceholder('מה עוד חייב לקרות בשבוע הבא?')
    await inp.fill('להגיש דו״ח')
    await inp.press('Enter')
    await expect(flow).toContainText('2 משימות בשבוע')
    // סגירה מאוחרת: המשימות נוחתות על היום הראשון שנשאר (שישי 11.9), לא על ראשון שעבר
    const sunday = flow.locator('.item', { has: app.locator('.tiny.faint.ltr:text-is("11.9")') })
    await expect(sunday).toContainText('להגיש דו״ח')
    await expect(sunday).toContainText('משימה במאגר לשבוע הבא')
    await next.click()

    // 6. סיום
    await expect(title).toHaveText('סיום')
    await expect(flow).toContainText('השבוע הבא, בשורה אחת')
    await expect(flow.locator('.card', { hasText: 'מטרות־העל' }).locator('.item')).toHaveCount(2)
    await expect(flow).toContainText('משימות בשבוע')
    await flow.getByRole('button', { name: /סגירת השבוע$/ }).click()
    await expect(flow).toBeHidden()
    await expect(app.locator('.toast')).toContainText('השבוע נסגר')

    // במסך היום: התזכורת נעלמה, מטרות־העל של השבוע מוצגות
    await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
    const goals = app.locator('.card', { hasText: 'מטרות־העל של השבוע' })
    await expect(goals).toBeVisible()
    await expect(goals.locator('.item')).toHaveCount(2)
    await expect(goals.locator('.item').nth(0)).toContainText('לסיים את פרק 1 בסמינר')
    await expect(goals.locator('.item').nth(0).locator('.sub2')).toHaveText('מחקר')
    await expect(goals).toContainText('0/2')
    await goals.locator('.item').nth(1).getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(goals).toContainText('1/2')

    // בסקירה: השבוע נסגר, ציון, שבועות קודמים
    await go(app, 'סקירה')
    await expect(app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' })).toHaveCount(0)
    await app.getByRole('button', { name: 'לשבוע הקודם' }).click()
    await expect(app.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first()).toContainText('שבוע 30.8 – 5.9')
    const closed = app.locator('.card', { hasText: 'השבוע הזה נסגר' })
    await expect(closed).toBeVisible()
    await expect(closed.locator('.chip')).toHaveText('7/10')
    await expect(closed).toContainText('טיוטה ראשונה של הסמינר')
    await app.getByRole('button', { name: 'השבוע', exact: true }).click()
    const hist = app.locator('.card', { hasText: 'שבועות קודמים' })
    await expect(hist.locator('.item')).toHaveCount(1)
    await expect(hist.locator('.item')).toContainText('3.5 אסימונים')
    await expect(hist.locator('.item')).toContainText('50% הרגלים')
    await expect(hist.locator('.item .chip')).toHaveText('7/10')
    // בשבוע הנוכחי — המטרות מוצגות גם כאן
    await expect(app.locator('.card', { hasText: 'מטרות־העל של השבוע' })).toContainText('1/2')

    // המצב השמור
    const st = await readState(app)
    const prev = st.weeks.find((w: WeekLog) => w.weekStart === PREV_WEEK_START)
    expect(prev.review.score).toBe(7)
    expect(prev.review.snapshot).toMatchObject({ minutes: 315, tasksDone: 1, daysLogged: 2 })
    expect(prev.review.snapshot.tokens).toBeCloseTo(3.5)
    const cur = st.weeks.find((w: WeekLog) => w.weekStart === WEEK_START)
    expect(cur.goals.map((g: any) => [g.text, g.trackId, !!g.done])).toEqual([
      ['לסיים את פרק 1 בסמינר', 'trk-research', false],
      ['לרוץ 10 ק״מ', undefined, true],
    ])
    expect(typeof cur.plannedAt).toBe('number')
    const tasks = live<Task>(st.tasks)
    // סגירה מאוחרת — התאריך הוא היום שנשאר (שישי), לא ראשון שעבר
    expect(tasks.find((t) => t.title === 'להגיש דו״ח')!.due).toBe('2026-09-11')
    expect(tasks.find((t) => t.id === 't-pool')!.due).toBe('2026-09-11')

    await reload(app)
    await expect(app.locator('.card', { hasText: 'מטרות־העל של השבוע' })).toContainText('1/2')
  })

  test('"פזר על ימי השבוע" מחלק לפי הקיבולת ואפשר לבטל', async ({ app }) => {
    await go(app, 'סקירה')
    await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    const next = flow.getByRole('button', { name: 'הבא ←' })
    await next.click()
    await next.click()
    await flow.locator('.qcard textarea').first().fill('x')
    await flow.locator('.scorebar').getByRole('button', { name: '5', exact: true }).click()
    await next.click()
    await next.click()
    await expect(flow.locator('.flow-head b').first()).toHaveText('המשימות')
    const inp = flow.getByPlaceholder('מה עוד חייב לקרות בשבוע הבא?')
    for (const t of ['א', 'ב', 'ג']) {
      await inp.fill(`משימה ${t}`)
      await inp.press('Enter')
    }
    await expect(flow).toContainText('3 משימות בשבוע')
    await flow.getByRole('button', { name: 'פזר על ימי השבוע' }).click()
    await expect(app.locator('.toast')).toContainText('המשימות פוזרו על ימי השבוע')
    // בלי הערכת אסימונים: מוגבל ל-cap+2 משימות ליום — כולן נכנסות ליום הראשון שנשאר (שישי 11.9)
    const friday = flow.locator('.item', { has: app.locator('.tiny.faint.ltr:text-is("11.9")') })
    await expect(friday).toContainText('משימה א')
    await expect(friday).toContainText('משימה ג')

    let st = await readState(app)
    expect(live<Task>(st.tasks).filter((t) => /^משימה [אבג]$/.test(t.title)).every((t) => t.due === '2026-09-11')).toBe(true)
  })

  test('"פזר על ימי השבוע" עם הערכות אסימונים מכבד את הקיבולת היומית', async ({ app }) => {
    await go(app, 'סקירה')
    await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    const next = flow.getByRole('button', { name: 'הבא ←' })
    for (let i = 0; i < 2; i++) await next.click()
    await flow.locator('.qcard textarea').first().fill('x')
    await flow.locator('.scorebar').getByRole('button', { name: '5', exact: true }).click()
    await next.click()
    await next.click()
    // מושכים שלוש משימות של 4 אסימונים מהמאגר
    const pool = flow.locator('.card', { hasText: 'מהמאגר' })
    for (const x of ['א', 'ב', 'ג']) await pool.getByRole('button', { name: `+ עבודה ${x}` }).click()
    await expect(flow).toContainText('3 משימות בשבוע')
    await expect(flow).toContainText('12 מתוך 12 אסימונים')
    const dayRow = (d: string) => flow.locator('.item', { has: app.locator(`.tiny.faint.ltr:text-is("${d}")`) })
    await expect(dayRow('11.9')).toContainText('12/6')
    await flow.getByRole('button', { name: 'פזר על ימי השבוע' }).click()
    // המשימות שמפזרים לא נספרות כעומס קיים: 4 לשישי, 4 לשבת, והשלישית ליום הפנוי יותר
    await expect(dayRow('11.9')).toContainText('8/6')
    await expect(dayRow('12.9')).toContainText('4/6')
    const st = await readState(app)
    expect(live<Task>(st.tasks).filter((t) => t.title.startsWith('עבודה ')).map((t) => t.due).sort()).toEqual(['2026-09-11', '2026-09-11', '2026-09-12'])
  })

  test('הטוסט (כולל כפתור "ביטול") מוסתר מאחורי המסך המלא של המעבר השבועי', async ({ app }) => {
    await go(app, 'סקירה')
    await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    const next = flow.getByRole('button', { name: 'הבא ←' })
    await next.click()
    await next.click()
    await next.click() // בלי תשובות — טוסט אימות
    await expect(app.locator('.toast')).toContainText('ענה לפחות על שאלה אחת')
    // styles.css: .toast z-index 200, .flow z-index 300 — הטוסט מאחורי המסך המלא
    const covered = await app.evaluate(() => {
      const t = document.querySelector('.toast') as HTMLElement
      const r = t.getBoundingClientRect()
      return !document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.toast')
    })
    expect(covered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
test.describe('נעילת יום ראשון', () => {
  test.use({
    clock: '2026-09-13T09:00:00+03:00',
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      sessions: [session('s1', at('2026-09-08T12:00:00'), 90, 'trk-study')],
    })),
  })

  test('ביום ראשון עם נתונים האפליקציה ננעלת; "אמלא אחר כך" דוחה; הכיבוי נשמר', async ({ app }) => {
    const lock = app.locator('.lock-overlay')
    await expect(lock).toBeVisible()
    await expect(lock).toContainText('מעבר שבועי')
    await expect(app.locator('nav.sidebar')).toHaveCount(0)
    // פתיחת המעבר מהנעילה — על השבוע 6.9–12.9
    await lock.getByRole('button', { name: 'פתיחת המעבר השבועי' }).click()
    const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
    await expect(flow).toContainText('שבוע 6.9 – 12.9')
    await expect(flow.locator('.ring-wrap .n')).toHaveText('1.0')
    await flow.getByRole('button', { name: 'סגירה' }).click()
    await expect(lock).toBeVisible()
    // דחייה
    await lock.getByRole('button', { name: 'אמלא אחר כך' }).click()
    await expect(lock).toHaveCount(0)
    await expect(app.locator('nav.sidebar')).toBeVisible()
    await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toContainText('6.9–12.9')
    let st = await readState(app)
    expect(st.weeks.find((w: WeekLog) => w.weekStart === WEEK_START).snoozeUntil).toBeGreaterThan(Date.parse('2026-09-13T11:00:00+03:00'))
    // אחרי רענון — עדיין דחוי
    await reload(app)
    await expect(app.locator('.lock-overlay')).toHaveCount(0)
    // מעבר ל"השבוע הבא" בסקירה: 13.9 מסומן בעיצומו
    await go(app, 'סקירה')
    await expect(app.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first()).toContainText('שבוע 6.9 – 12.9')
    await app.getByRole('button', { name: 'לשבוע הבא' }).click()
    await expect(app.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first()).toContainText(`שבוע 13.9 – 19.9`)
    void NEXT_WEEK_START
  })

  test('"אל תנעל לי את האפליקציה" מכבה את הנעילה לתמיד', async ({ app }) => {
    await app.locator('.lock-overlay').getByRole('button', { name: 'אל תנעל לי את האפליקציה' }).click()
    await expect(app.locator('.lock-overlay')).toHaveCount(0)
    await reload(app)
    await expect(app.locator('.lock-overlay')).toHaveCount(0)
    const st = await readState(app)
    expect(st.settings.reviewLock).toBe(false)
    await go(app, 'הגדרות')
    await expect(app.getByRole('switch', { name: 'נעילת סקירה שבועית' })).toHaveAttribute('aria-checked', 'false')
  })
})
