import { test, expect, readState, reload, go, live, onboarded, TODAY, TOMORROW, WEEK_START } from './desk'
import type { Task, WeeklyDef, WorkoutLog } from '../../../src/types'

// ---------------------------------------------------------------------------
// 6. הרגלים, צעדי שגרה, אסימונים שבועיים, אימון — והחיבורים ביניהם
// ---------------------------------------------------------------------------

const habitsCard = (page: any) => page.locator('.card', { hasText: 'הרגלי היום' })
const weeklyCard = (page: any) => page.locator('.card', { hasText: 'אסימונים צפים' })
const workoutCard = (page: any) => page.locator('.card', { hasText: 'אימונים' }).or(page.locator('.card', { has: page.locator('.wk-strip') }))

test.describe('הרגלים ושגרות', () => {
  test.use({ seed: onboarded })

  test('סימון הרגל, צ׳קליסט שלבים שמשלים את ההרגל, ושרידות רענון', async ({ app }) => {
    const card = habitsCard(app)
    const counter = card.locator('.spread .tiny.faint.ltr')
    await expect(counter).toHaveText('0/3')

    // סימון ישיר של "אימון"
    const workoutRow = card.locator('.item', { hasText: 'אימון' })
    await workoutRow.getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(counter).toHaveText('1/3')
    await expect(workoutRow.getByRole('button', { name: 'סמן כבוצע' })).toHaveAttribute('aria-pressed', 'true')
    await expect(workoutRow.locator('.ttl')).toHaveCSS('text-decoration-line', 'line-through')
    // ריצה / כוח על ההרגל המיוחד
    await workoutRow.getByRole('button', { name: 'ריצה' }).click()
    await expect(workoutRow.getByRole('button', { name: 'ריצה' })).toHaveClass(/primary/)
    // ביטול
    await workoutRow.getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(counter).toHaveText('0/3')

    // צ׳קליסט של שגרת הבוקר
    const morning = card.locator('.item', { hasText: 'שגרת בוקר' })
    await expect(morning).toContainText('20 דק׳ · 0/4 שלבים')
    await morning.getByRole('button', { name: /שגרת בוקר/ }).click()
    await expect(morning.getByRole('button', { name: /שגרת בוקר/ })).toHaveAttribute('aria-expanded', 'true')
    const steps = card.locator('.item', { has: app.locator('.check.sm') })
    await expect(steps).toHaveCount(4)
    await expect(steps.nth(0)).toContainText('לסדר מיטה')
    await steps.nth(0).getByRole('button', { name: 'סמן כבוצע' }).click()
    await steps.nth(2).getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(morning).toContainText('2/4 שלבים')
    await expect(counter).toHaveText('0/3')
    // השלמת כל השלבים מסמנת את ההרגל עצמו
    await steps.nth(1).getByRole('button', { name: 'סמן כבוצע' }).click()
    await steps.nth(3).getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(morning).toContainText('4/4 שלבים')
    await expect(counter).toHaveText('1/3')

    let st = await readState(app)
    const day = st.days.find((d: any) => d.date === TODAY)
    expect(day.habits).toEqual({ 'hb-workout': false, 'hb-morning': true })
    expect(day.steps).toEqual({ hm1: true, hm3: true, hm2: true, hm4: true })
    expect(day.workout).toBe('run')

    await reload(app)
    await expect(habitsCard(app).locator('.spread .tiny.faint.ltr')).toHaveText('1/3')
    await expect(habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' })).toContainText('4/4 שלבים')
  })

  test('השלב "לארגן את מחר" פותח תכנון מחר; המשימה נוחתת על מחר ביומן', async ({ app }) => {
    const card = habitsCard(app)
    await card.locator('.item', { hasText: 'שגרת ערב' }).getByRole('button', { name: /שגרת ערב/ }).click()
    const planStep = card.locator('.item', { hasText: 'לארגן את מחר' })
    await planStep.getByRole('button', { name: '🌙 פתח' }).click()
    const sh = app.getByRole('dialog', { name: 'תכנון מחר' })
    await expect(sh).toBeVisible()
    await expect(sh).toContainText('יום שבת, 12 בספטמבר')
    const inp = sh.getByPlaceholder('מה חייב לקרות מחר?')
    await inp.fill('לקרוא מאמר')
    await inp.press('Enter')
    await expect(sh.locator('.list .item', { hasText: 'לקרוא מאמר' })).toBeVisible()
    await sh.getByRole('button', { name: /סגור/ }).click()
    // לא במסך היום
    await expect(app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'לקרוא מאמר' })).toHaveCount(0)
    const st = await readState(app)
    expect(live<Task>(st.tasks).find((t) => t.title === 'לקרוא מאמר')!.due).toBe(TOMORROW)
    await go(app, 'יומן')
    await app.getByRole('button', { name: 'יום', exact: true }).click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(app.locator('.card', { has: app.locator('input[placeholder="+ משימה ליום הזה…"]') }).locator('.item', { hasText: 'לקרוא מאמר' })).toBeVisible()
  })

  test('אסימונים שבועיים: סימון, פריט התקדמות חדש מההגדרות, "+ זמן" ו"−15"', async ({ app }) => {
    const card = weeklyCard(app)
    const counter = card.locator('.spread .tiny.faint.ltr')
    await expect(counter).toHaveText('0/5')
    // "כביסה" — תזכורת ביום ראשון, היום שישי: בלי תג
    const laundry = card.locator('.item', { hasText: 'כביסה' })
    await expect(laundry.locator('.chip')).toHaveCount(0)
    await laundry.getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(counter).toHaveText('1/5')
    await expect(laundry.locator('.ttl')).toHaveCSS('text-decoration-line', 'line-through')

    // פריט התקדמות חדש
    await go(app, 'הגדרות')
    await app.locator('.card', { hasText: 'אסימונים שבועיים' }).getByRole('button', { name: '+ חדש' }).click()
    const sh = app.getByRole('dialog', { name: 'אסימון שבועי' })
    await sh.locator('label.field', { hasText: 'שם' }).locator('input').fill('גיטרה')
    await sh.getByRole('button', { name: 'מד התקדמות' }).click()
    const target = sh.getByRole('group', { name: 'יעד דקות בשבוע' }).locator('input')
    await expect(target).toHaveValue('180')
    await target.fill('120')
    await target.press('Enter')
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(sh).toBeHidden()
    await expect(app.locator('.card', { hasText: 'אסימונים שבועיים' }).locator('.item', { hasText: 'גיטרה' })).toContainText('יעד 120 דק׳')

    await go(app, 'היום')
    const g = weeklyCard(app).locator('.item', { hasText: 'גיטרה' })
    await expect(g).toContainText('0 דק׳ מתוך 2 שע׳')
    await g.getByRole('button', { name: '+ זמן' }).click()
    await g.getByRole('button', { name: '+30' }).click()
    await g.getByRole('button', { name: '+45' }).click()
    await expect(g).toContainText('1 שע׳ 15 דק׳ מתוך 2 שע׳')
    await g.getByRole('button', { name: '−15' }).click()
    await expect(g).toContainText('1 שע׳ מתוך 2 שע׳')
    // הסימונים לא סופרים את פריט ההתקדמות
    await expect(weeklyCard(app).locator('.spread .tiny.faint.ltr')).toHaveText('1/5')
    // ולא נוצר סשן Deep Work (אין מסלול)
    let st = await readState(app)
    expect(live(st.sessions ?? [])).toHaveLength(0)
    const wk = st.weeks.find((w: any) => w.weekStart === WEEK_START)
    expect(wk.items).toEqual({ 'wk-laundry': true })
    const gid = live<WeeklyDef>(st.weekly).find((w) => w.name === 'גיטרה')!.id
    expect(wk.progress[gid]).toBe(60)

    await reload(app)
    await expect(weeklyCard(app).locator('.item', { hasText: 'גיטרה' })).toContainText('1 שע׳ מתוך 2 שע׳')
    await expect(weeklyCard(app).locator('.spread .tiny.faint.ltr')).toHaveText('1/5')
  })
})

// ---------------------------------------------------------------------------
test.describe('אימונים', () => {
  test.use({ seed: onboarded })

  test('בניית תוכנית, רישום סטים, סיום → "בוצע" וההרגל מסומן; התקדמות', async ({ app }) => {
    // בניית התוכנית: יום שישי, סקוואט 3×8-10
    const empty = app.locator('.card', { hasText: 'עוד אין תוכנית שבועית' })
    await empty.getByRole('button', { name: 'בניית התוכנית' }).click()
    const plan = app.getByRole('dialog', { name: 'תוכנית האימונים' })
    await expect(plan).toBeVisible()
    await plan.getByRole('button', { name: /^יום שישי/ }).click()
    const dayCard = plan.locator('.card', { hasText: 'יום שישי · אימון שישי' })
    await expect(dayCard).toBeVisible()
    // באג ידוע (ראו הדוח): היום הראשון שנוסף נסגר מיד — פותחים אותו שוב
    await dayCard.getByRole('button', { name: /יום שישי · אימון שישי/ }).click()
    await dayCard.locator('label.field', { hasText: 'שם האימון' }).locator('input').fill('רגליים')
    const exInput = dayCard.getByPlaceholder('＋ תרגיל חדש — שם ו-Enter')
    await exInput.fill('סקוואט')
    await exInput.press('Enter')
    await exInput.fill('לחיצת רגליים')
    await exInput.press('Enter')
    await expect(dayCard.locator('.list .item')).toHaveCount(2)
    // התרגיל השני נפתח לעריכה אוטומטית — חזרות
    await dayCard.locator('label.field', { hasText: 'חזרות' }).locator('input').fill('8-10')
    // הזזה: לחיצת רגליים למעלה
    await dayCard.locator('.item', { hasText: 'לחיצת רגליים' }).getByRole('button', { name: 'הזזה למעלה' }).click()
    await expect(dayCard.locator('.list .item .ttl').first()).toHaveText('לחיצת רגליים')
    await plan.getByRole('button', { name: 'סיום' }).click()
    await expect(plan).toBeHidden()

    // הכרטיס במסך היום
    const card = app.locator('.card', { has: app.locator('.wk-strip') })
    await expect(card).toContainText('🏋️ רגליים')
    await expect(card).toContainText('יום שישי · חדר כושר')
    await expect(card.locator('.wk-strip .wd.now')).toContainText('ו׳')
    await expect(card.locator('.wk-strip .wd.ok')).toHaveCount(0)
    await expect(card.locator('.chip', { hasText: 'בוצע' })).toHaveCount(0)

    // רישום
    await card.getByRole('button', { name: 'פתיחת האימון' }).click()
    const ws = app.getByRole('dialog', { name: 'אימון' })
    await expect(ws).toBeVisible()
    await expect(ws.locator('.flow-head')).toContainText('רגליים')
    const squat = ws.locator('.card', { hasText: 'סקוואט' })
    await expect(squat).toContainText('3 סטים')
    await expect(squat.locator('.setchip:not(.add)')).toHaveCount(3)
    await expect(squat.locator('.tiny.faint.ltr')).toHaveText('0/3')
    await squat.locator('.setchip').nth(0).click()
    const editor = squat.locator('.set-edit')
    await expect(editor).toBeVisible()
    // ברירת מחדל 0×8 — מעלים ל-10 ק״ג ו-10 חזרות
    for (let i = 0; i < 4; i++) await editor.getByRole('button', { name: 'הוספת ק״ג' }).click()
    await editor.getByRole('button', { name: 'הוספת חזרות' }).click()
    await editor.getByRole('button', { name: 'הוספת חזרות' }).click()
    await expect(squat.locator('.setchip').nth(0)).toHaveText(/10×10/)
    await editor.getByRole('button', { name: '✓ אישור' }).click()
    await expect(editor).toBeHidden()
    // הסט השני נזרע מהראשון
    await squat.locator('.setchip').nth(1).click()
    await expect(squat.locator('.setchip').nth(1)).toHaveText(/10×10/)
    await squat.locator('.set-edit').getByRole('button', { name: 'הפחתת חזרות' }).click()
    await expect(squat.locator('.setchip').nth(1)).toHaveText(/10×9/)
    await squat.locator('.set-edit').getByRole('button', { name: '✓ אישור' }).click()
    await expect(squat.locator('.tiny.faint.ltr')).toHaveText('2/3')
    // הערה
    await ws.getByPlaceholder('כאב, אנרגיה, מה לשנות בפעם הבאה…').fill('הרגיש טוב')

    // המצב לפני סיום: הכרטיס אומר "המשך רישום", ההרגל עוד לא מסומן
    await ws.getByRole('button', { name: 'סגירה' }).click()
    await expect(card.getByRole('button', { name: 'המשך רישום' })).toBeVisible()
    await expect(card.locator('.wk-strip .wd.part')).toHaveCount(1)
    await expect(habitsCard(app).locator('.spread .tiny.faint.ltr')).toHaveText('0/3')

    // סיום
    await card.getByRole('button', { name: 'המשך רישום' }).click()
    await ws.getByRole('button', { name: '✓ סיימתי' }).click()
    await expect(ws).toBeHidden()
    await expect(app.locator('.toast')).toContainText('האימון נשמר')
    await expect(card.locator('.chip', { hasText: '✓ בוצע' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'צפייה באימון' })).toBeVisible()
    await expect(card.locator('.wk-strip .wd.ok')).toContainText('ו׳')
    // ההרגל "אימון" סומן אוטומטית, כ"כוח"
    const hRow = habitsCard(app).locator('.item', { hasText: 'אימון' })
    await expect(hRow.getByRole('button', { name: 'סמן כבוצע' })).toHaveAttribute('aria-pressed', 'true')
    await expect(hRow.getByRole('button', { name: 'כוח' })).toHaveClass(/primary/)
    await expect(habitsCard(app).locator('.spread .tiny.faint.ltr')).toHaveText('1/3')

    let st = await readState(app)
    const w = live<WorkoutLog>(st.workouts).find((x) => x.date === TODAY)!
    expect(w.title).toBe('רגליים')
    expect(w.kind).toBe('gym')
    expect(typeof w.finishedAt).toBe('number')
    expect(w.note).toBe('הרגיש טוב')
    const exId = st.workoutPlan[0].exercises.find((x: any) => x.name === 'סקוואט').id
    expect(w.sets[exId]).toEqual([{ kg: 10, reps: 10 }, { kg: 10, reps: 9 }])
    expect(typeof w.setsAt[exId]).toBe('number')
    expect(st.days.find((d: any) => d.date === TODAY).habits['hb-workout']).toBe(true)

    // התקדמות
    await card.getByRole('button', { name: 'התקדמות' }).click()
    const prog = app.getByRole('dialog', { name: 'התקדמות' })
    await expect(prog.locator('.card', { hasText: 'סקוואט' })).toContainText('שיא: 10×10 · אחרון: 10×10 · אימון אחד')
    await expect(prog.locator('.card', { hasText: 'לחיצת רגליים' })).toHaveCount(0)
    await prog.getByRole('button', { name: 'ריצה' }).click()
    await expect(prog).toContainText('עוד לא נרשמו ריצות')
    await prog.getByRole('button', { name: 'סגירה', exact: true }).last().click()
    await expect(prog).toBeHidden()

    // שרידות
    await reload(app)
    const c2 = app.locator('.card', { has: app.locator('.wk-strip') })
    await expect(c2.locator('.chip', { hasText: '✓ בוצע' })).toBeVisible()
    await c2.getByRole('button', { name: 'צפייה באימון' }).click()
    await expect(app.getByRole('dialog', { name: 'אימון' }).locator('.card', { hasText: 'סקוואט' }).locator('.setchip').nth(1)).toHaveText(/10×9/)
    await expect(app.getByRole('dialog', { name: 'אימון' }).locator('.chip', { hasText: '✓ נשמר' })).toBeVisible()
  })

  test('יום בלי אימון בתוכנית: הכרטיס מציע רישום ובחירת אימון אחר', async ({ app }) => {
    await app.locator('.card', { hasText: 'עוד אין תוכנית שבועית' }).getByRole('button', { name: 'בניית התוכנית' }).click()
    const plan = app.getByRole('dialog', { name: 'תוכנית האימונים' })
    await plan.getByRole('button', { name: /^יום ראשון/ }).click()
    const dayCard = plan.locator('.card', { hasText: 'יום ראשון · אימון ראשון' })
    await dayCard.getByRole('button', { name: /יום ראשון · אימון ראשון/ }).click()
    await dayCard.getByRole('button', { name: /ריצה/ }).click()
    await plan.getByRole('button', { name: 'סיום' }).click()

    const card = app.locator('.card', { has: app.locator('.wk-strip') })
    await expect(card).toContainText('אין אימון היום')
    await card.getByRole('button', { name: 'רישום אימון' }).click()
    const ws = app.getByRole('dialog', { name: 'אימון' })
    await expect(ws).toContainText('אין אימון מתוכנן ליום הזה')
    await ws.getByRole('button', { name: 'בחירת אימון' }).click()
    await ws.getByRole('button', { name: /א׳ · אימון ראשון/ }).click()
    // ריצה: קילומטרים ודקות עם קצב
    const cardio = ws.locator('.card', { hasText: 'הריצה' })
    for (let i = 0; i < 10; i++) await cardio.getByRole('button', { name: 'הוספת קילומטרים' }).click()
    for (let i = 0; i < 6; i++) await cardio.getByRole('button', { name: 'הוספת דקות' }).click()
    await expect(cardio).toContainText('קצב ממוצע:')
    await expect(cardio).toContainText('6:00 לק״מ')
    await ws.getByRole('button', { name: '✓ סיימתי' }).click()
    await expect(card).toContainText('5 ק״מ')
    const hRow = habitsCard(app).locator('.item', { hasText: 'אימון' })
    await expect(hRow.getByRole('button', { name: 'ריצה' })).toHaveClass(/primary/)
    await card.getByRole('button', { name: 'התקדמות' }).click()
    const prog = app.getByRole('dialog', { name: 'התקדמות' })
    await prog.getByRole('button', { name: 'ריצה' }).click()
    await expect(prog).toContainText('5 ק״מ')
    await expect(prog.locator('.card', { hasText: 'הקצב האחרון' })).toContainText('6:00')
    const st = await readState(app)
    expect(live<WorkoutLog>(st.workouts)[0]).toMatchObject({ km: 5, minutes: 30, kind: 'run' })
  })
})

// ---------------------------------------------------------------------------
// באגים מתועדים — נכשלים עד שיתוקנו
// ---------------------------------------------------------------------------
test.describe('באגים ידועים', () => {
  test.use({ seed: onboarded })

  test.fixme('השלמת כל השלבים מסמנת את ההרגל בלי חותמת habitsAt (מיזוג בין מכשירים)', async ({ app }) => {
    const card = habitsCard(app)
    const morning = card.locator('.item', { hasText: 'שגרת בוקר' })
    await morning.getByRole('button', { name: /שגרת בוקר/ }).click()
    const steps = card.locator('.item', { has: app.locator('.check.sm') })
    for (let i = 0; i < 4; i++) await steps.nth(i).getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(card.locator('.spread .tiny.faint.ltr')).toHaveText('1/3')
    const st = await readState(app)
    const day = st.days.find((d: any) => d.date === TODAY)
    expect(day.habits['hb-morning']).toBe(true)
    // Today.tsx ~שורה 1228: patchDay(date, { habits }) בלי habitsAt — צריך גם חותמת
    expect(typeof day.habitsAt?.['hb-morning']).toBe('number')
  })

  test.fixme('היום הראשון שנוסף לתוכנית האימונים נשאר פתוח לעריכה', async ({ app }) => {
    await app.locator('.card', { hasText: 'עוד אין תוכנית שבועית' }).getByRole('button', { name: 'בניית התוכנית' }).click()
    const plan = app.getByRole('dialog', { name: 'תוכנית האימונים' })
    await plan.getByRole('button', { name: /^יום שישי/ }).click()
    // Workout.tsx WorkoutCard: PlanSheet מרונדר בשני ענפים שונים (אין תוכנית / יש תוכנית),
    // ולכן אחרי הוספת היום הראשון הוא נמחק ונבנה מחדש ו-openDay מתאפס
    await expect(plan.locator('.card', { hasText: 'יום שישי · אימון שישי' }).locator('label.field', { hasText: 'שם האימון' })).toBeVisible()
  })
})
