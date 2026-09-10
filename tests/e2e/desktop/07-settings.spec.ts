import fs from 'node:fs'
import path from 'node:path'
import { test, expect, readState, reload, go, live, pickTime, seed, onboarded, TODAY } from './desk'
import { seedState } from '../../../src/seed'
import type { AppState, Task } from '../../../src/types'

// ---------------------------------------------------------------------------
// 8. הגדרות: שעת קימה, ערכת נושא, יעדים, ייצוא/ייבוא גיבוי, איפוס —
//    וכל שינוי מגיע למסך היום
// ---------------------------------------------------------------------------

test.describe('הגדרות', () => {
  test.use({ seed: onboarded })

  test('שעת קימה משנה את שאלת הבוקר ואת יעד השינה', async ({ app }) => {
    await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toContainText('07:30')
    await go(app, 'הגדרות')
    await pickTime(app, app.locator('label.field', { hasText: 'שעת קימה' }).locator('button.input'), 6, 30)
    await pickTime(app, app.locator('label.field', { hasText: 'שעת שינה' }).locator('button.input'), 22, 45)
    await go(app, 'היום')
    await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toContainText('06:30')
    await expect(app.locator('.card', { hasText: 'איך ישנת אתמול' })).toContainText('היעד: 22:45 עד 06:30')
    await reload(app)
    await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toContainText('06:30')
    const st = await readState(app)
    expect(st.settings).toMatchObject({ wakeTime: '06:30', bedTime: '22:45' })
    expect(st.settingsUpdatedAt).toBeGreaterThan(0)
    // תשובה לשאלת הבוקר — הכרטיס נעלם ונשמר ביום
    await app.getByRole('button', { name: 'כן, קמתי בזמן' }).click()
    await expect(app.locator('.toast')).toContainText('העוגן נשמר')
    await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toHaveCount(0)
    await app.getByRole('button', { name: 'לא ישנתי טוב' }).click()
    await expect(app.locator('.card', { hasText: 'איך ישנת אתמול' })).toHaveCount(0)
    const st2 = await readState(app)
    expect(st2.days.find((d: any) => d.date === TODAY).wake).toBe('ontime')
    expect(st2.days.find((d: any) => d.date === '2026-09-10').sleep).toBe('bad')
  })

  test('ערכת נושא: כהה / בהיר / מערכת משנה data-theme ונשמרת', async ({ app }) => {
    const html = app.locator('html')
    await expect(html).not.toHaveAttribute('data-theme', /./)
    await go(app, 'הגדרות')
    const row = app.locator('.spread', { hasText: 'ערכת נושא' })
    await row.getByRole('button', { name: 'כהה' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(row.getByRole('button', { name: 'כהה' })).toHaveClass(/primary/)
    await expect(app.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#0e1013')
    // הרקע באמת כהה
    const bg = await app.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const [r, g, b] = bg.match(/\d+/g)!.map(Number)
    expect(r + g + b).toBeLessThan(150)
    await row.getByRole('button', { name: 'בהיר' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect(app.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#f6f7f9')
    await row.getByRole('button', { name: 'מערכת' }).click()
    await expect(html).not.toHaveAttribute('data-theme', /./)
    await row.getByRole('button', { name: 'כהה' }).click()
    await reload(app)
    await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark')
    const st = await readState(app)
    expect(st.settings.theme).toBe('dark')
  })

  test('יעד יומי, אורך אסימון ויעד שבועי משנים את הטבעת והקיבולת', async ({ app }) => {
    await go(app, 'הגדרות')
    const num = (label: string) => app.locator('label.field', { hasText: label }).locator('input')
    await num('יעד יומי').fill('4')
    await num('יעד יומי').press('Enter')
    await expect(app.getByText(/כרגע: 4 אסימונים ביום = 6\.0 שעות נטו/)).toBeVisible()
    await num('אורך אסימון').fill('60')
    await num('אורך אסימון').press('Enter')
    await expect(app.getByText(/כרגע: 4 אסימונים ביום = 4\.0 שעות נטו/)).toBeVisible()
    await num('יעד שבועי').fill('30')
    await num('יעד שבועי').press('Enter')
    // חיתוך לגבולות: 99 → 12
    await num('יעד יומי').fill('99')
    await num('יעד יומי').press('Enter')
    await expect(num('יעד יומי')).toHaveValue('12')
    await num('יעד יומי').fill('4')
    await num('יעד יומי').press('Enter')
    // ריק — נשאר הערך הקודם
    await num('יעד יומי').fill('')
    await num('יעד יומי').press('Enter')
    await expect(num('יעד יומי')).toHaveValue('4')

    await go(app, 'היום')
    const card = app.locator('.timer-card')
    await expect(card.locator('.ring-wrap .l')).toHaveText('מתוך 4')
    await expect(card).toContainText('0 דק׳ מתוך 4 שע׳ היום')
    await expect(card).toContainText('0.0 / 30')
    await expect(card).toContainText('בלוק של 60 דק׳')
    // רישום ידני של 60 דק׳ = אסימון שלם
    await card.getByRole('button', { name: '+ רישום ידני' }).click()
    const sh = app.getByRole('dialog', { name: 'רישום ידני של עבודה' })
    await sh.getByRole('button', { name: '60 דק׳' }).click()
    await sh.getByRole('button', { name: 'הוספה' }).click()
    await expect(card.locator('.ring-wrap .n')).toHaveText('1.0')
    await expect(card).toContainText('1.0 / 30')
    // הטיימר מכוון ל-60
    await card.getByRole('button', { name: /לימודים/ }).click()
    await expect(card).toContainText('0 מתוך 60 דק׳')
    await expect(app).toHaveTitle(/^60 דק׳/)
    await card.getByRole('button', { name: 'ביטול בלי לשמור' }).click()
    // הקיבולת במשימות
    const quick = app.getByPlaceholder('משימה מהירה להיום…')
    await quick.fill('משימה')
    await quick.press('Enter')
    await app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'משימה' }).locator('button.txt').click()
    const ts = app.getByRole('dialog', { name: 'משימה' })
    await ts.locator('label.field', { hasText: 'אסימונים' }).locator('input').fill('1')
    await ts.locator('label.field', { hasText: 'אסימונים' }).locator('input').press('Enter')
    await ts.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.card', { hasText: 'המשימות של היום' })).toContainText('אסימון אחד מתוכנן · קיבולת 4')
  })

  test('קיבולת מופחתת בשישי־שבת משנה את היעד של היום (שישי)', async ({ app }) => {
    await go(app, 'הגדרות')
    await expect(app.getByText('60% מהיעד (4 אסימונים)')).toBeVisible()
    await app.getByRole('switch', { name: 'קיבולת מופחתת בשישי ושבת' }).click()
    await expect(app.getByRole('switch', { name: 'קיבולת מופחתת בשישי ושבת' })).toHaveAttribute('aria-checked', 'true')
    await go(app, 'היום')
    await expect(app.locator('.timer-card .ring-wrap .l')).toHaveText('מתוך 4')
    await expect(app.locator('.timer-card')).toContainText('0 דק׳ מתוך 6 שע׳ היום')
    // ובפרויקטים — הקיבולת עד יעד: מוסיפים דדליין ביום ראשון ובודקים 4+4+6=14
    await go(app, 'יומן')
    await app.locator('.card', { has: app.locator('input[placeholder="+ משימה ליום הזה…"]') }).getByRole('button', { name: '+ אירוע' }).click()
    const sh = app.getByRole('dialog', { name: 'אירוע חדש' })
    await sh.getByPlaceholder('מה קורה?').fill('הגשה')
    await sh.getByRole('switch').first().click()
    await sh.getByRole('group', { name: 'סוג' }).getByRole('button', { name: 'דדליין' }).click()
    await sh.getByRole('button', { name: /יום שישי, 11 בספטמבר 2026/ }).click()
    await app.getByRole('dialog', { name: 'בחירת תאריך' }).locator('.cal-cell:not(.out)', { hasText: /^13$/ }).click()
    await sh.getByRole('group', { name: 'מסלול (לא חובה)' }).getByRole('button', { name: /לימודים/ }).click()
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: /לימודים/ }).click()
    const inp = app.getByPlaceholder('+ משימה ללימודים')
    await inp.fill('לסיים הכל')
    await inp.press('Enter')
    await app.locator('.kcard', { hasText: 'לסיים הכל' }).click()
    const ts = app.getByRole('dialog', { name: 'משימה' })
    await ts.locator('label.field', { hasText: 'אסימונים' }).locator('input').fill('20')
    await ts.locator('label.field', { hasText: 'אסימונים' }).locator('input').press('Enter')
    await ts.getByRole('button', { name: 'שמירה' }).click()
    const head = app.locator('.card.rail', { hasText: 'לימודים' }).first()
    await expect(head).toContainText('מחרתיים')
    await expect(head).toContainText('לא נכנס: 20 אסימונים מול קיבולת של 14 עד 13.9')
    // במסך היום: הספירה לאחור
    await go(app, 'היום')
    await expect(app.locator('.countdowns .cd', { hasText: 'הגשה' })).toContainText('2')
  })

  test('הרגל חדש מההגדרות מופיע במסך היום; מחיקה מסירה אותו', async ({ app }) => {
    await go(app, 'הגדרות')
    await app.locator('.card', { hasText: 'הרגלים יומיים' }).getByRole('button', { name: '+ חדש' }).click()
    const sh = app.getByRole('dialog', { name: 'הרגל יומי' })
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.toast')).toContainText('צריך שם')
    await sh.locator('label.field', { hasText: 'שם' }).locator('input').fill('מדיטציה')
    await sh.locator('label.field', { hasText: 'דקות' }).locator('input').fill('10')
    await sh.locator('label.field', { hasText: 'דקות' }).locator('input').press('Enter')
    const step = sh.getByPlaceholder('+ שלב חדש')
    await step.fill('לשבת')
    await step.press('Enter')
    await step.fill('לנשום')
    await step.press('Enter')
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(sh).toBeHidden()
    await expect(app.locator('.card', { hasText: 'הרגלים יומיים' }).locator('.item', { hasText: 'מדיטציה' })).toContainText('10 דק׳ · 2 שלבים')
    await go(app, 'היום')
    const habits = app.locator('.card', { hasText: 'הרגלי היום' })
    await expect(habits).toContainText('0/4')
    await expect(habits.locator('.item', { hasText: 'מדיטציה' })).toContainText('10 דק׳ · 0/2 שלבים')
    // מחיקה
    await go(app, 'הגדרות')
    await app.locator('.card', { hasText: 'הרגלים יומיים' }).locator('.item', { hasText: 'מדיטציה' }).click()
    await sh.getByRole('button', { name: 'מחיקה' }).click()
    await app.getByRole('dialog', { name: 'למחוק את ההרגל?' }).getByRole('button', { name: 'מחיקה' }).click()
    await expect(app.locator('.card', { hasText: 'הרגלים יומיים' }).locator('.item', { hasText: 'מדיטציה' })).toHaveCount(0)
    await go(app, 'היום')
    await expect(habits).toContainText('0/3')
  })
})

// ---------------------------------------------------------------------------
test.describe('גיבוי ואיפוס', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true, name: 'דני' },
      tasks: [{ id: 't1', title: 'משימה קיימת', trackId: 'trk-life', status: 'todo', order: 0, updatedAt: 1, due: TODAY } as Task],
    })),
  })

  test('ייצוא מוריד JSON מלא; ייבוא מחליף את הנתונים אחרי אישור; קובץ פגום נדחה', async ({ app }, testInfo) => {
    await go(app, 'הגדרות')
    // --- ייצוא ---
    const [dl] = await Promise.all([
      app.waitForEvent('download'),
      app.getByRole('button', { name: 'ייצוא גיבוי' }).click(),
    ])
    expect(dl.suggestedFilename()).toBe('life-os-2026-09-11.json')
    await expect(app.locator('.toast')).toContainText('קובץ הגיבוי ירד')
    const exported = JSON.parse(fs.readFileSync((await dl.path())!, 'utf8'))
    expect(exported.version).toBe(1)
    expect(exported.settings.name).toBe('דני')
    expect(exported.tasks.map((t: any) => t.title)).toEqual(['משימה קיימת'])
    expect(exported.tracks).toHaveLength(4)
    expect(exported.rules).toHaveLength(5)
    // הגיבוי לא מכיל אסימונים או מפתחות
    expect(JSON.stringify(exported)).not.toMatch(/ghp_|gh-token/)

    // --- קובץ פגום ---
    fs.mkdirSync(testInfo.outputDir, { recursive: true })
    const bad = path.join(testInfo.outputDir, 'bad.json')
    fs.writeFileSync(bad, '{"hello": 1}')
    await app.locator('input[type="file"]').setInputFiles(bad)
    await expect(app.locator('.toast')).toContainText('הקובץ לא נראה כמו גיבוי של המערכת')
    await expect(app.getByRole('dialog', { name: 'לייבא את הגיבוי?' })).toHaveCount(0)

    // --- ייבוא: גיבוי עם מסלול אחד, שתי משימות וסשן ---
    const other: AppState = {
      ...seedState(),
      settings: { ...seedState().settings, onboarded: true, name: 'רות', dailyTokenGoal: 3 },
      tracks: [{ id: 'trk-x', name: 'תזה', emoji: '🎓', color: '#0090ff', order: 0, board: true, updatedAt: 5 }],
      tasks: [
        { id: 'tx1', title: 'משימה מיובאת', trackId: 'trk-x', status: 'todo', order: 0, updatedAt: 5, due: TODAY },
        { id: 'tx2', title: 'עוד אחת', trackId: 'trk-x', status: 'done', order: 1, updatedAt: 5, doneAt: 5 },
      ],
      sessions: [{ id: 'sx', updatedAt: 5, startedAt: Date.parse('2026-09-11T08:00:00+03:00'), endedAt: Date.parse('2026-09-11T09:00:00+03:00'), minutes: 60, trackId: 'trk-x' }],
      rules: [],
    }
    const good = path.join(testInfo.outputDir, 'backup.json')
    fs.writeFileSync(good, JSON.stringify(other))
    await app.locator('input[type="file"]').setInputFiles(good)
    const confirm = app.getByRole('dialog', { name: 'לייבא את הגיבוי?' })
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('backup.json — 2 משימות, סשן אחד')
    // ביטול — שום דבר לא השתנה
    await confirm.getByRole('button', { name: 'ביטול' }).click()
    await expect(confirm).toBeHidden()
    let st = await readState(app)
    expect(st.settings.name).toBe('דני')
    // אישור — קודם יורד גיבוי אוטומטי
    await app.locator('input[type="file"]').setInputFiles(good)
    const [pre] = await Promise.all([
      app.waitForEvent('download'),
      confirm.getByRole('button', { name: 'ייבוא' }).click(),
    ])
    expect(pre.suggestedFilename()).toBe('life-os-pre-import-2026-09-11.json')
    await expect(app.locator('.toast')).toContainText('הנתונים יובאו')
    await expect(app.getByText('מזהה מכשיר:')).toBeVisible()

    await go(app, 'היום')
    await expect(app.locator('.desk-head h1').first()).toHaveText('בוקר טוב, רות')
    await expect(app.locator('.timer-card .ring-wrap .n')).toHaveText('0.7')
    await expect(app.locator('.timer-card .ring-wrap .l')).toHaveText('מתוך 3')
    await expect(app.locator('.timer-card').getByRole('button', { name: /תזה/ })).toBeVisible()
    await expect(app.locator('.timer-card').getByRole('button', { name: /לימודים/ })).toHaveCount(0)
    const tasks = app.locator('.card', { hasText: 'המשימות של היום' })
    await expect(tasks.locator('.item', { hasText: 'משימה מיובאת' })).toBeVisible()
    await expect(tasks.locator('.item', { hasText: 'משימה קיימת' })).toHaveCount(0)
    // בלי בלוקים קבועים — הלו״ז ריק
    await expect(app.locator('.card', { hasText: 'הלו״ז של היום' })).toContainText('היום פנוי ביומן')
    await reload(app)
    st = await readState(app)
    expect(st.settings.name).toBe('רות')
    expect(live<Task>(st.tasks).map((t) => t.id).sort()).toEqual(['tx1', 'tx2'])
    expect(st.timer).toBeNull()
  })

  test('איפוס להתחלה מחזיר את נתוני הפתיחה ומסמן resetAt', async ({ app }) => {
    await go(app, 'הגדרות')
    await app.getByRole('button', { name: 'איפוס להתחלה' }).click()
    const confirm = app.getByRole('dialog', { name: 'לאפס הכל?' })
    await expect(confirm).toContainText('פעולה בלתי הפיכה')
    await confirm.getByRole('button', { name: 'ביטול' }).click()
    let st = await readState(app)
    expect(st.settings.name).toBe('דני')
    await app.getByRole('button', { name: 'איפוס להתחלה' }).click()
    await confirm.getByRole('button', { name: 'איפוס' }).click()
    await expect(app.locator('.toast')).toContainText('הכל אופס להתחלה')
    await go(app, 'היום')
    await expect(app.locator('.desk-head h1').first()).toHaveText('בוקר טוב')
    await expect(app.locator('.card', { hasText: 'איך זה עובד' })).toBeVisible()
    await expect(app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item')).toHaveCount(0)
    st = await readState(app)
    expect(st.settings.name).toBe('')
    expect(st.settings.onboarded).toBeUndefined()
    expect(st.tasks).toEqual([])
    expect(st.resetAt).toBeGreaterThan(0)
    expect(st.tracks).toHaveLength(4)
    const resetAt = await app.evaluate(() => localStorage.getItem('life-os-reset-at'))
    expect(Number(resetAt)).toBeGreaterThan(0)
    await reload(app)
    await expect(app.locator('.card', { hasText: 'איך זה עובד' })).toBeVisible()
  })
})
