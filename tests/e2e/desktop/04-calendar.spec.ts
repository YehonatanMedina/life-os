import { test, expect, readState, reload, go, live, pickTime, onboarded, TODAY } from './desk'
import type { CalEvent, RecurRule } from '../../../src/types'

// ---------------------------------------------------------------------------
// 5. יומן: תצוגות, אירועים עם שעה וכל־היום, עריכה ומחיקה, בלוקים קבועים
//    (שבועי + חודשי) מההגדרות — והכל מופיע גם במסך היום
// ---------------------------------------------------------------------------

const dayList = (page: any) => page.locator('.card', { has: page.locator('input[placeholder="+ משימה ליום הזה…"]') })
const label = (page: any) => page.locator('.spread b.truncate').first()
const modeBtn = (page: any, m: 'יום' | 'שבוע' | 'חודש') => page.getByRole('button', { name: m, exact: true })

test.describe('יומן', () => {
  test.use({ seed: onboarded })

  test('חודש / שבוע / יום, קדימה ואחורה, "היום"', async ({ app }) => {
    await go(app, 'יומן')
    // במחשב נפתח על שבוע
    await expect(modeBtn(app, 'שבוע')).toHaveClass(/primary/)
    await expect(label(app)).toHaveText('6.9 – 12.9')
    await expect(app.locator('.wk-head .h.today b')).toHaveText('11')
    // שבעה ימים, שישי־שבת מסומנים כסוף שבוע
    await expect(app.locator('.wk-col')).toHaveCount(7)
    await expect(app.locator('.wk-col.weekend')).toHaveCount(2)
    // הבלוקים הקבועים של השבוע: עבודה עמוקה א׳–ה׳ בלבד
    await expect(app.locator('.ev', { hasText: 'עבודה עמוקה — בוקר' })).toHaveCount(5)
    await expect(app.locator('.ev', { hasText: 'שגרת בוקר' })).toHaveCount(7)

    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('13.9 – 19.9')
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('20.9 – 26.9')
    await app.locator('main').getByRole('button', { name: 'היום', exact: true }).click()
    await expect(label(app)).toHaveText('6.9 – 12.9')

    await modeBtn(app, 'חודש').click()
    await expect(label(app)).toHaveText('ספטמבר 2026')
    await expect(app.locator('.cal-cell.today .n')).toHaveText('11')
    await app.getByRole('button', { name: 'הקודם' }).click()
    await expect(label(app)).toHaveText('אוגוסט 2026')
    await app.getByRole('button', { name: 'הבא' }).click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('אוקטובר 2026')
    await app.locator('main').getByRole('button', { name: 'היום', exact: true }).click()
    await expect(label(app)).toHaveText('ספטמבר 2026')

    // לחיצה על תא פותחת את היום
    // לוחצים על המספר — לחיצה על פיל של אירוע פותחת את האירוע
    await app.locator('.cal-cell:not(.out)', { has: app.locator('.n', { hasText: /^21$/ }) }).locator('.n').click()
    await expect(modeBtn(app, 'יום')).toHaveClass(/primary/)
    await expect(label(app)).toHaveText('יום שני, 21 בספטמבר')
    await expect(dayList(app)).toContainText('יום שני, 21 בספטמבר')
    await expect(dayList(app).locator('.item', { hasText: 'עבודה עמוקה — בוקר' })).toContainText('08:30–12:30 · בלוק')
    await app.getByRole('button', { name: 'הקודם' }).click()
    await expect(label(app)).toHaveText('יום ראשון, 20 בספטמבר')
    // חציית חודש
    await modeBtn(app, 'חודש').click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await app.locator('.cal-cell:not(.out)', { has: app.locator('.n', { hasText: /^1$/ }) }).locator('.n').click()
    await expect(label(app)).toHaveText('יום חמישי, 1 באוקטובר')
    await app.getByRole('button', { name: 'הקודם' }).click()
    await expect(label(app)).toHaveText('יום רביעי, 30 בספטמבר')
  })

  test('אירוע עם שעה: הוספה, מופיע ברשת, ברשימה ובמסך היום; עריכה; מחיקה', async ({ app }) => {
    await go(app, 'יומן')
    await dayList(app).getByRole('button', { name: '+ אירוע' }).click()
    const sh = app.getByRole('dialog', { name: 'אירוע חדש' })
    await expect(sh).toBeVisible()

    // כותרת ריקה — לא נשמר
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.toast')).toContainText('צריך כותרת')
    await expect(sh).toBeVisible()

    await sh.getByPlaceholder('מה קורה?').fill('רופא שיניים')
    const startField = sh.locator('label.field', { hasText: 'התחלה' }).locator('button.input')
    const endField = sh.locator('label.field', { hasText: 'סיום' }).locator('button.input')
    await expect(startField).toHaveText('10:00')
    await expect(endField).toHaveText('11:00')
    // סיום לפני התחלה — נחסם
    await pickTime(app, startField, 16, 0)
    await pickTime(app, endField, 15, 30)
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.toast')).toContainText('שעת הסיום צריכה להיות אחרי שעת ההתחלה')
    await pickTime(app, endField, 17, 0)
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(sh).toBeHidden()
    await expect(app.locator('.toast')).toContainText('האירוע נוסף')

    // ברשת השבוע ובתור עמודת שישי
    const ev = app.locator('.ev', { hasText: 'רופא שיניים' })
    await expect(ev).toHaveCount(1)
    await expect(ev.locator('.time')).toHaveText('16:00–17:00')
    // ברשימת היום
    await expect(dayList(app).locator('.item', { hasText: 'רופא שיניים' })).toContainText('16:00–17:00 · אישי')

    // במסך היום: בלו״ז ובשורת "הבא בתור"
    await go(app, 'היום')
    const sched = app.locator('.card', { hasText: 'הלו״ז של היום' })
    const row = sched.locator('.item', { hasText: 'רופא שיניים' })
    await expect(row).toContainText('16:00')
    await expect(row).toContainText('16:00–17:00')
    const next = app.locator('.card.rail', { hasText: 'הבא בתור' })
    await expect(next).toContainText('רופא שיניים')
    await expect(next).toContainText('16:00–17:00')
    // "ליומן ←" מנווט ליומן על היום
    await sched.getByRole('button', { name: 'ליומן ←' }).click()
    await expect(app.locator('nav.sidebar button[aria-current="true"]')).toHaveText('יומן')
    await expect(dayList(app)).toContainText('יום שישי, 11 בספטמבר')

    // עריכה: כותרת, שעת סיום, מסלול
    await dayList(app).locator('.item', { hasText: 'רופא שיניים' }).click()
    const ed = app.getByRole('dialog', { name: 'עריכת אירוע' })
    await expect(ed).toBeVisible()
    await expect(ed.getByLabel('כותרת', { exact: true })).toHaveValue('רופא שיניים')
    await ed.getByLabel('כותרת', { exact: true }).fill('רופא שיניים — נדחה')
    await pickTime(app, ed.locator('label.field', { hasText: 'סיום' }).locator('button.input'), 17, 30)
    await ed.getByRole('group', { name: 'מסלול (לא חובה)' }).getByRole('button', { name: /חיים/ }).click()
    await ed.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.toast')).toContainText('נשמר')
    const ev2 = app.locator('.ev', { hasText: 'רופא שיניים — נדחה' })
    await expect(ev2.locator('.time')).toHaveText('16:00–17:30')
    await expect(app.locator('.ev', { hasText: /^רופא שיניים$/ })).toHaveCount(0)

    // רענון — ובמסך היום
    await reload(app)
    await expect(app.locator('.card', { hasText: 'הלו״ז של היום' }).locator('.item', { hasText: 'נדחה' })).toContainText('16:00–17:30')
    let st = await readState(app)
    const e = live<CalEvent>(st.events).find((x) => x.title.includes('נדחה'))!
    expect(e).toMatchObject({ date: TODAY, start: '16:00', end: '17:30', allDay: false, kind: 'personal', trackId: 'trk-life', touched: true })

    // מחיקה
    await go(app, 'יומן')
    await dayList(app).locator('.item', { hasText: 'נדחה' }).click()
    await app.getByRole('dialog', { name: 'עריכת אירוע' }).getByRole('button', { name: 'מחיקה' }).click()
    const confirm = app.getByRole('dialog', { name: 'למחוק את האירוע?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'ביטול' }).click()
    await expect(confirm).toBeHidden()
    await expect(app.getByRole('dialog', { name: 'עריכת אירוע' })).toBeVisible()
    await app.getByRole('dialog', { name: 'עריכת אירוע' }).getByRole('button', { name: 'מחיקה' }).click()
    await confirm.getByRole('button', { name: 'מחיקה' }).click()
    await expect(app.locator('.toast')).toContainText('נמחק')
    await expect(app.locator('.ev', { hasText: 'רופא שיניים' })).toHaveCount(0)
    await expect(dayList(app).locator('.item', { hasText: 'רופא שיניים' })).toHaveCount(0)
    await go(app, 'היום')
    await expect(app.locator('.card', { hasText: 'הלו״ז של היום' }).locator('.item', { hasText: 'רופא' })).toHaveCount(0)
    st = await readState(app)
    expect(st.events.find((x: CalEvent) => x.title.includes('רופא')).deleted).toBe(true)
  })

  test('גרירה ברשת השבוע מזיזה את האירוע בשעה', async ({ app }) => {
    await go(app, 'יומן')
    // עבודה עמוקה — בוקר של יום ראשון 08:30–12:30 — גוררים שעה למטה
    const ev = app.locator('.wk-col').nth(0).locator('.ev', { hasText: 'עבודה עמוקה — בוקר' })
    await expect(ev).toHaveCount(1)
    await ev.scrollIntoViewIfNeeded()
    const box = (await ev.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + 8
    await app.mouse.move(x, y)
    await app.mouse.down()
    await app.mouse.move(x, y + 26, { steps: 4 })
    await app.mouse.move(x, y + 52, { steps: 4 })
    await app.mouse.up()
    await expect(app.locator('.wk-col').nth(0).locator('.ev', { hasText: 'עבודה עמוקה — בוקר' }).locator('.time')).toHaveText('09:30–13:30')
    // רק המופע הזה זז — שני עדיין 08:30
    await expect(app.locator('.wk-col').nth(1).locator('.ev', { hasText: 'עבודה עמוקה — בוקר' }).locator('.time')).toHaveText('08:30–12:30')
    const st = await readState(app)
    const moved = st.events.find((e: CalEvent) => e.id === 'rl-work-am@2026-09-06')
    expect(moved).toMatchObject({ start: '09:30', end: '13:30', touched: true })
    // ברשימת היום של ראשון
    await modeBtn(app, 'יום').click()
    for (let i = 0; i < 5; i++) await app.getByRole('button', { name: 'הקודם' }).click()
    await expect(dayList(app)).toContainText('יום ראשון, 6 בספטמבר')
    await expect(dayList(app).locator('.item', { hasText: 'עבודה עמוקה — בוקר' })).toContainText('09:30–13:30')
  })

  test('אירוע כל־היום עם קיבולת מותאמת משנה את הטבעת ואת הקיבולת במסך היום', async ({ app }) => {
    await go(app, 'יומן')
    await dayList(app).getByRole('button', { name: '+ אירוע' }).click()
    const sh = app.getByRole('dialog', { name: 'אירוע חדש' })
    await sh.getByPlaceholder('מה קורה?').fill('נסיעה לצפון')
    await sh.getByRole('switch').first().click() // כל היום
    await expect(sh.locator('label.field', { hasText: 'התחלה' })).toHaveCount(0)
    const cap = sh.getByRole('group', { name: 'קיבולת ליום (אסימונים)' })
    await expect(cap).toBeVisible()
    await cap.getByRole('button', { name: '2' }).click()
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(sh).toBeHidden()

    // שורת "כל היום" ברשת
    await expect(app.locator('.wk-allday .pill', { hasText: 'נסיעה לצפון' })).toBeVisible()
    await expect(dayList(app).locator('.item', { hasText: 'נסיעה לצפון' })).toContainText('כל היום · אישי')

    await go(app, 'היום')
    const sched = app.locator('.card', { hasText: 'הלו״ז של היום' })
    await expect(sched.locator('.chip', { hasText: 'נסיעה לצפון' })).toBeVisible()
    await expect(app.locator('.timer-card .ring-wrap .l')).toHaveText('מתוך 2')
    await expect(app.locator('.timer-card')).toContainText('0 דק׳ מתוך 3 שע׳ היום')
    // הוספת משימות מעל הקיבולת מציגה אזהרה
    const quick = app.getByPlaceholder('משימה מהירה להיום…')
    await quick.fill('משימה כבדה')
    await quick.press('Enter')
    const tasks = app.locator('.card', { hasText: 'המשימות של היום' })
    await tasks.getByRole('button', { name: 'משימה כבדה' }).click()
    const ts = app.getByRole('dialog', { name: 'משימה' })
    const est = ts.locator('label.field', { hasText: 'אסימונים' }).locator('input')
    await est.fill('3')
    await est.press('Enter')
    await ts.getByRole('button', { name: 'שמירה' }).click()
    await expect(tasks).toContainText('3 אסימונים מתוכננים · קיבולת 2')
    await expect(tasks).toContainText('העומס של היום עובר את הקיבולת')
    const st = await readState(app)
    expect(live<CalEvent>(st.events).find((e) => e.title === 'נסיעה לצפון')).toMatchObject({ allDay: true, capacity: 2, date: TODAY })
  })

  test('בלוק קבוע שבועי וחודשי מההגדרות מתממש ביומן; מחיקה מסירה מופעים עתידיים', async ({ app }) => {
    await go(app, 'הגדרות')
    const rulesCard = app.locator('.card', { hasText: 'מבנה השבוע הקבוע' })

    // --- שבועי: חוג גיטרה, שלישי 19:00–20:00 ---
    await rulesCard.getByRole('button', { name: '+ חדש' }).click()
    const rs = app.getByRole('dialog', { name: 'בלוק קבוע' })
    await expect(rs).toBeVisible()
    // בלי שם — נחסם
    await rs.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.toast')).toContainText('צריך שם')
    await rs.getByPlaceholder('למשל: עבודה עמוקה — בוקר').fill('חוג גיטרה')
    await pickTime(app, rs.locator('label.field', { hasText: 'התחלה' }).locator('button.input'), 19, 0)
    await pickTime(app, rs.locator('label.field', { hasText: 'סיום' }).locator('button.input'), 20, 0)
    const days = rs.getByRole('group', { name: 'ימים' })
    for (const d of ['א׳', 'ב׳', 'ד׳', 'ה׳']) await days.getByRole('button', { name: d, exact: true }).click()
    await expect(days.locator('button.primary')).toHaveCount(1)
    await expect(days.locator('button.primary')).toHaveText('ג׳')
    await rs.getByRole('button', { name: 'שמירה' }).click()
    await expect(rs).toBeHidden()
    await expect(app.locator('.toast')).toContainText('נשמר · היומן עודכן מהיום והלאה')
    await expect(rulesCard.locator('.item', { hasText: 'חוג גיטרה' })).toContainText('19:00–20:00 · ג׳')

    // --- חודשי: שכר דירה, 1 בחודש 10:00–10:30 ---
    await rulesCard.getByRole('button', { name: '+ חדש' }).click()
    await rs.getByPlaceholder('למשל: עבודה עמוקה — בוקר').fill('שכר דירה')
    await pickTime(app, rs.locator('label.field', { hasText: 'התחלה' }).locator('button.input'), 10, 0)
    await pickTime(app, rs.locator('label.field', { hasText: 'סיום' }).locator('button.input'), 10, 30)
    await rs.getByRole('button', { name: 'כל חודש' }).click()
    const md = rs.getByRole('group', { name: 'ביום בחודש' }).locator('input')
    await expect(md).toHaveValue('11')
    await md.fill('1')
    await md.press('Enter')
    await rs.getByRole('button', { name: 'שמירה' }).click()
    await expect(rs).toBeHidden()
    await expect(rulesCard.locator('.item', { hasText: 'שכר דירה' })).toContainText('כל חודש ב־1 בו')

    // --- ביומן ---
    await go(app, 'יומן')
    // השבוע: שלישי 8.9 כבר עבר (הכלל מתחיל היום) — אין מופע
    await expect(app.locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(0)
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('13.9 – 19.9')
    const gtr = app.locator('.ev', { hasText: 'חוג גיטרה' })
    await expect(gtr).toHaveCount(1)
    await expect(gtr.locator('.time')).toHaveText('19:00–20:00')
    // בעמודת יום שלישי (אינדקס 2)
    await expect(app.locator('.wk-col').nth(2).locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(1)

    // תצוגת חודש מציגה רק שלושה פילים לתא — בודקים בשבועות ובמצב השמור
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('20.9 – 26.9')
    await expect(app.locator('.wk-col').nth(2).locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(1)
    await expect(app.locator('.ev', { hasText: 'שכר דירה' })).toHaveCount(0)
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('27.9 – 3.10')
    await expect(app.locator('.wk-col').nth(2).locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(1)
    // 1.10 הוא יום חמישי (עמודה 4)
    const rent = app.locator('.wk-col').nth(4).locator('.ev', { hasText: 'שכר דירה' })
    await expect(rent).toHaveCount(1) // חצי שעה — נמוך מכדי להציג שעה בתוך הבלוק
    // תצוגת יום של 1.11 (ראשון)
    await modeBtn(app, 'חודש').click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('נובמבר 2026')
    await app.locator('.cal-cell:not(.out)', { has: app.locator('.n', { hasText: /^1$/ }) }).locator('.n').click()
    await expect(label(app)).toHaveText('יום ראשון, 1 בנובמבר')
    await expect(dayList(app).locator('.item', { hasText: 'שכר דירה' })).toContainText('10:00–10:30')

    let st = await readState(app)
    expect(live<CalEvent>(st.events).filter((e) => e.title === 'חוג גיטרה').length).toBeGreaterThanOrEqual(17)
    expect(live<CalEvent>(st.events).filter((e) => e.title === 'שכר דירה').map((e) => e.date).sort()).toEqual([
      '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01',
    ])

    // --- עריכת הכלל השבועי: שעה אחרת — כל המופעים מתעדכנים ---
    await go(app, 'הגדרות')
    await rulesCard.locator('.item', { hasText: 'חוג גיטרה' }).click()
    await pickTime(app, rs.locator('label.field', { hasText: 'התחלה' }).locator('button.input'), 20, 0)
    await pickTime(app, rs.locator('label.field', { hasText: 'סיום' }).locator('button.input'), 21, 0)
    await rs.getByRole('button', { name: 'שמירה' }).click()
    await expect(rs).toBeHidden()
    st = await readState(app)
    expect(live<CalEvent>(st.events).filter((e) => e.title === 'חוג גיטרה').every((e) => e.start === '20:00' && e.end === '21:00')).toBe(true)

    // --- מחיקת הכלל השבועי ---
    await rulesCard.locator('.item', { hasText: 'חוג גיטרה' }).click()
    await rs.getByRole('button', { name: 'מחיקה' }).click()
    const confirm = app.getByRole('dialog', { name: 'למחוק את הבלוק הקבוע?' })
    await confirm.getByRole('button', { name: 'מחיקה' }).click()
    await expect(app.locator('.toast')).toContainText('הבלוק נמחק')
    await expect(rulesCard.locator('.item', { hasText: 'חוג גיטרה' })).toHaveCount(0)
    await expect(rulesCard.locator('.item', { hasText: 'שכר דירה' })).toHaveCount(1)

    await go(app, 'יומן')
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('13.9 – 19.9')
    await expect(app.locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(0)
    await app.getByRole('button', { name: 'הבא' }).click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(label(app)).toHaveText('27.9 – 3.10')
    await expect(app.locator('.ev', { hasText: 'חוג גיטרה' })).toHaveCount(0)
    await expect(app.locator('.wk-col').nth(4).locator('.ev', { hasText: 'שכר דירה' })).toHaveCount(1)

    await reload(app)
    st = await readState(app)
    expect(live<RecurRule>(st.rules).some((r) => r.title === 'חוג גיטרה')).toBe(false)
    expect(live<CalEvent>(st.events).filter((e) => e.title === 'חוג גיטרה')).toHaveLength(0)
    expect(live<CalEvent>(st.events).filter((e) => e.title === 'שכר דירה')).toHaveLength(4)
  })

  test('מופע של בלוק קבוע: מחיקה של מופע אחד לא מחזירה אותו, ו"בטל מכאן והלאה" מכבה את הסדרה', async ({ app }) => {
    await go(app, 'יומן')
    // מחיקת "שגרת ערב" של היום בלבד
    await dayList(app).locator('.item', { hasText: 'שגרת ערב' }).click()
    const ed = app.getByRole('dialog', { name: 'עריכת אירוע' })
    await expect(ed).toContainText('זה מופע של בלוק קבוע')
    await ed.getByRole('button', { name: 'מחיקה' }).click()
    const confirm = app.getByRole('dialog', { name: 'למחוק את האירוע?' })
    await expect(confirm).toContainText('זה ימחק רק את המופע של היום הזה')
    await confirm.getByRole('button', { name: 'מחיקה' }).click()
    await expect(dayList(app).locator('.item', { hasText: 'שגרת ערב' })).toHaveCount(0)
    await expect(app.locator('.wk-col').nth(6).locator('.ev', { hasText: 'שגרת ערב' })).toHaveCount(1)
    await reload(app)
    await go(app, 'יומן')
    await expect(dayList(app)).toContainText('יום שישי, 11 בספטמבר')
    await expect(dayList(app).locator('.item', { hasText: 'שגרת בוקר' })).toHaveCount(1)
    await expect(dayList(app).locator('.item', { hasText: 'שגרת ערב' })).toHaveCount(0)

    // ביטול כל המופעים של "אימון" מהיום והלאה
    await dayList(app).locator('.item', { hasText: 'אימון' }).click()
    await ed.getByRole('button', { name: 'בטל את כל המופעים מכאן והלאה' }).click()
    await expect(app.locator('.toast')).toContainText('הסדרה בוטלה מהתאריך הזה והלאה')
    await expect(app.locator('.ev', { hasText: 'אימון' })).toHaveCount(5) // ראשון–חמישי של השבוע נשארים
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(app.locator('.ev', { hasText: 'אימון' })).toHaveCount(0)
    await go(app, 'הגדרות')
    await expect(app.locator('.card', { hasText: 'מבנה השבוע הקבוע' }).locator('.item', { hasText: 'אימון' })).toContainText('כבוי')
    const st = await readState(app)
    expect(st.rules.find((r: RecurRule) => r.id === 'rl-workout').active).toBe(false)
  })
})
