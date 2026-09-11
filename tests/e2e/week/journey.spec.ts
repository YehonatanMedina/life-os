import {
  test, expect, reload, nav, settings, jumpTo, newDay, work, storageBytes, todayRenderMs, isMobile, unlockIfLocked,
  timerCard, tasksCard, habitsCard, habitsCounter, weeklyCard, scheduleCard, workoutCard, whatNow, dayList, greeting, sub,
  pickDay, answerMorning, stopAndSave, weekSeed, SUN_0735,
  SUN, MON, TUE, WED, THU, FRI, SAT, NEXT_SUN, NEXT_MON, BIRTHDAY,
} from './week'
import { readState, live } from '../desktop/desk'
import type { Session, Task, CalEvent, WeekLog } from '../../../src/types'

// ---------------------------------------------------------------------------
// שבוע שלם של שימוש, בהקשר דפדפן אחד שנשאר חי: השעון זז קדימה, בין יום ליום
// הדף מתרענן (כמו לפתוח את האפליקציה בבוקר), ואחרי כל יום בודקים שהמצב
// נשמר ושכל מסך שאמור לשקף את השינוי אכן משקף אותו.
// ---------------------------------------------------------------------------

test.describe('שבוע שלם', () => {
  test.use({ seed: weekSeed, clock: SUN_0735 })
  test.setTimeout(420_000)

  test('ראשון עד ראשון: עבודה, הרגלים, אימונים, משימות, יומן, סקירה — ומה שנשמר', async ({ app }) => {
    const mobile = isMobile(app)
    const sizes: Array<[string, number]> = []
    const renders: Array<[string, number]> = []
    const measure = async (label: string) => {
      sizes.push([label, await storageBytes(app)])
      renders.push([label, await todayRenderMs(app)])
    }

    // =====================================================================
    await test.step('ראשון 13.9, 07:35 — בוקר: כרטיסי הבוקר, התוכנית להיום', async () => {
      if (!mobile) await expect(greeting(app)).toHaveText('בוקר טוב, דני')
      await expect(sub(app)).toHaveText('יום ראשון, 13 בספטמבר')
      await answerMorning(app, 'ontime', 'good')

      const tasks = tasksCard(app)
      await expect(tasks.locator('.item .ttl')).toHaveText(['לקרוא פרק 3', 'לכתוב טיוטה למבוא'])
      await expect(tasks).toContainText('3 אסימונים מתוכננים · קיבולת 6')
      await expect(tasks.getByRole('button', { name: /3 משימות בלי תאריך/ })).toBeVisible()
      // ספירה לאחור למבחן — ארבעה ימים
      const cd = app.locator('.countdowns .cd', { hasText: 'מבחן באלגברה' })
      await expect(cd.locator('.d')).toHaveText(/^4\s*ימים$/)
      await expect(cd).not.toHaveClass(/hot/)
      // הלו״ז: הבלוקים הקבועים של יום ראשון
      await expect(scheduleCard(app).locator('.item .ttl')).toHaveText([
        'שגרת בוקר', 'עבודה עמוקה — בוקר', 'עבודה עמוקה — אחה״צ', 'אימון', 'שגרת ערב',
      ])
      // 07:35 — שגרת הבוקר בעיצומה
      await expect(whatNow(app)).toContainText('עכשיו')
      await expect(whatNow(app)).toContainText('שגרת בוקר')
      await expect(whatNow(app).getByRole('button', { name: 'התחל' })).toHaveCount(0)
      // האימון של היום — ריצה קלה, בלי סימון עדיין
      await expect(workoutCard(app)).toContainText('ריצה קלה')
      await expect(workoutCard(app).locator('.wk-strip .wd.now')).toContainText('א׳')
      await expect(workoutCard(app).locator('.wk-strip .wd.ok')).toHaveCount(0)
      // המעבר השבועי לא מציק — השבוע שעבר ריק
      await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
    })

    await test.step('ראשון 08:31 — בלוק עמוק מהלו״ז, 90 דקות עבודה, סיום', async () => {
      await jumpTo(app, '2026-09-13T08:31:00+03:00')
      await expect(whatNow(app)).toContainText('עכשיו')
      await expect(whatNow(app)).toContainText('עבודה עמוקה — בוקר')
      await whatNow(app).getByRole('button', { name: 'התחל' }).click()
      // בלוק עמוק נפתח ישר על כל המסך
      const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
      await expect(focus).toBeVisible()
      await expect(focus.locator('.focus-track')).toHaveText('📘 לימודים · עבודה עמוקה — בוקר')
      await expect(focus.locator('.focus-time')).toHaveText(/^1:29:5\d$|^1:30:00$/)
      if (mobile) {
        const box = (await focus.boundingBox())!
        const vp = app.viewportSize()!
        expect(box.width).toBeGreaterThanOrEqual(vp.width - 1)
        expect(box.height).toBeGreaterThanOrEqual(vp.height - 1)
      }
      // חצי שעה במצב מיקוד, ואז חוזרים למסך
      await work(app, 30)
      await expect(focus.locator('.focus-sub')).toContainText('30 מתוך 90 דקות')
      await focus.getByRole('button', { name: 'יציאה ממצב מיקוד' }).click()
      await expect(focus).toBeHidden()
      const card = timerCard(app)
      await expect(card).toHaveClass(/live/)
      await expect(card).toContainText('30 מתוך 90 דק׳')
      // עוד שעה
      await work(app, 60)
      await expect(card).toContainText('היעד הושלם — כל דקה נוספת נספרת')
      await expect(card.locator('.timer-time')).toHaveText(/^\+00:0/)
      await stopAndSave(app, 90)
      await expect(card.locator('.ring-wrap .n')).toHaveText('1.0')
      await expect(card).toContainText('1 שע׳ 30 דק׳ מתוך 9 שע׳ היום')
      await expect(card).toContainText('1.0 / 42')
      await expect(card.getByRole('button', { name: /סשן אחד היום · 1 שע׳ 30 דק׳/ })).toBeVisible()
      const st = await readState(app)
      expect(st.timer).toBeNull()
      const ss = live<Session>(st.sessions)
      expect(ss).toHaveLength(1)
      expect(ss[0]).toMatchObject({ minutes: 90, trackId: 'trk-study', label: 'עבודה עמוקה — בוקר' })
    })

    await test.step('ראשון — משימה, הרגלים, ריצה', async () => {
      const tasks = tasksCard(app)
      await tasks.locator('.item', { hasText: 'לקרוא פרק 3' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(tasks.locator('.item', { hasText: 'לקרוא פרק 3' })).toHaveCount(0)
      await expect(tasks).toContainText('אסימון אחד מתוכנן · קיבולת 6')

      await expect(habitsCounter(app)).toHaveText('0/3')
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(habitsCounter(app)).toHaveText('1/3')

      // ריצה: 5 ק״מ ב-30 דק׳
      await workoutCard(app).getByRole('button', { name: 'פתיחת האימון' }).click()
      const ws = app.getByRole('dialog', { name: 'אימון' })
      await expect(ws.locator('.flow-head')).toContainText('ריצה קלה')
      const cardio = ws.locator('.card', { hasText: 'הריצה' })
      for (let i = 0; i < 10; i++) await cardio.getByRole('button', { name: 'הוספת קילומטרים' }).click()
      for (let i = 0; i < 6; i++) await cardio.getByRole('button', { name: 'הוספת דקות' }).click()
      await expect(cardio).toContainText('6:00 לק״מ')
      await ws.getByRole('button', { name: /סיימתי/ }).click()
      await expect(ws).toBeHidden()
      await expect(workoutCard(app)).toContainText('5 ק״מ')
      await expect(workoutCard(app).locator('.wk-strip .wd.ok')).toContainText('א׳')
      const hRow = habitsCard(app).locator('.item', { hasText: 'אימון' })
      await expect(hRow.getByRole('button', { name: 'סמן כבוצע' })).toHaveAttribute('aria-pressed', 'true')
      await expect(hRow.getByRole('button', { name: 'ריצה' })).toHaveClass(/primary/)
      await expect(habitsCounter(app)).toHaveText('2/3')
    })

    await test.step('ראשון 19:00 — תכנון מחר, שגרת ערב', async () => {
      await jumpTo(app, '2026-09-13T19:00:00+03:00')
      // הדחייה של הבוקר (3 שעות) פגה — הנעילה השגויה חוזרת (פגם #1)
      await unlockIfLocked(app)
      if (!mobile) await expect(greeting(app)).toHaveText('ערב טוב, דני')
      await tasksCard(app).getByRole('button', { name: 'תכנון מחר' }).click()
      const sh = app.getByRole('dialog', { name: 'תכנון מחר' })
      await expect(sh).toContainText('יום שני, 14 בספטמבר · קיבולת 6 אסימונים')
      // מחר כבר יש 2 אסימונים (תרגיל 4)
      await expect(sh.locator('.list .item', { hasText: 'תרגיל 4 באלגברה' })).toBeVisible()
      const inp = sh.getByPlaceholder('מה חייב לקרות מחר?')
      await inp.fill('לשלוח מייל למנחה')
      await inp.press('Enter')
      await expect(sh.locator('.list .item')).toHaveCount(2)
      await sh.getByRole('button', { name: /סגור/ }).click()
      await expect(sh).toBeHidden()
      await expect(tasksCard(app).locator('.item', { hasText: 'לשלוח מייל למנחה' })).toHaveCount(0)
      await habitsCard(app).locator('.item', { hasText: 'שגרת ערב' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(habitsCounter(app)).toHaveText('3/3')
    })

    await test.step('ראשון — כל המסכים משקפים: יומן, פרויקטים, סקירה; רענון', async () => {
      await nav(app, 'יומן')
      await app.getByRole('button', { name: 'יום', exact: true }).click()
      await expect(dayList(app)).toContainText('יום ראשון, 13 בספטמבר')
      await expect(dayList(app).locator('.item', { hasText: 'לקרוא פרק 3' }).getByRole('button', { name: 'סמן כבוצע' })).toHaveAttribute('aria-pressed', 'true')
      await app.getByRole('button', { name: 'הבא' }).click()
      await expect(dayList(app)).toContainText('יום שני, 14 בספטמבר')
      await expect(dayList(app).locator('.item', { hasText: 'לשלוח מייל למנחה' })).toBeVisible()

      await nav(app, 'פרויקטים')
      await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
      // 11 בזרע − 1 הושלמה + 1 חדשה = 11 פתוחות
      await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('11 משימות פתוחות')
      await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'הושלם' }) }).locator('h4 .faint')).toHaveText('1')

      await nav(app, 'סקירה')
      await expect(app.locator('.card', { hasText: 'זמן נטו' }).first()).toContainText('1 שע׳ 30 דק׳')
      await expect(app.locator('.daybar', { hasText: 'א׳' })).toContainText('1.0')

      await reload(app)
      await unlockIfLocked(app)
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('1.0')
      await expect(habitsCounter(app)).toHaveText('3/3')
      await expect(workoutCard(app).locator('.wk-strip .wd.ok')).toContainText('א׳')
      const st = await readState(app)
      expect(st.days.find((d: any) => d.date === SUN)).toMatchObject({ wake: 'ontime', habits: { 'hb-morning': true, 'hb-workout': true, 'hb-night': true }, workout: 'run' })
      expect(st.days.find((d: any) => d.date === '2026-09-12').sleep).toBe('good')
      expect(live<Task>(st.tasks).find((t) => t.title === 'לשלוח מייל למנחה')!.due).toBe(MON)
      await measure('ראשון')
    })

    // =====================================================================
    await test.step('שני 14.9, 07:35 — איחור, Power Nap, רישום ידני לאתמול', async () => {
      await newDay(app, '2026-09-14T07:35:00+03:00')
      await expect(sub(app)).toHaveText('יום שני, 14 בספטמבר')
      await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toBeVisible()
      // קמתי מאוחר → הטוסט מציע Power Nap
      await app.getByRole('button', { name: 'לא, מאוחר' }).click()
      await app.locator('.toast').getByRole('button', { name: 'הוסף Power Nap' }).click()
      await app.getByRole('button', { name: 'לא ישנתי טוב', exact: true }).click()
      await expect(scheduleCard(app).locator('.item', { hasText: 'Power Nap' })).toContainText('14:30')

      const tasks = tasksCard(app)
      const late = tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' })
      await expect(late.locator('.sub2')).toHaveText('באיחור 1 יום · מ־13.9 · מחקר · אסימון אחד')
      await expect(tasks.locator('.item .ttl').first()).toHaveText('לכתוב טיוטה למבוא')
      await expect(tasks).toContainText('3 אסימונים מתוכננים · קיבולת 6 · 1 באיחור · 1 בלי הערכה')
      await expect(app.locator('.countdowns .cd', { hasText: 'מבחן' }).locator('.d')).toHaveText(/^3\s*ימים$/)
      // ההרגלים התאפסו
      await expect(habitsCounter(app)).toHaveText('0/3')
      await expect(workoutCard(app)).toContainText('אין אימון היום')

      // 45 דק׳ מחקר על אתמול
      await timerCard(app).getByRole('button', { name: '+ רישום ידני' }).click()
      const sh = app.getByRole('dialog', { name: 'רישום ידני של עבודה' })
      await sh.getByRole('button', { name: /מחקר/ }).click()
      await sh.getByRole('button', { name: '45 דק׳' }).click()
      await pickDay(app, sh.getByRole('button', { name: /יום שני, 14 בספטמבר 2026/ }), 13)
      await expect(sh).toContainText('יום ראשון, 13 בספטמבר 2026')
      await sh.getByRole('button', { name: 'הוספה' }).click()
      await expect(app.locator('.toast')).toContainText('נוספו 45 דקות · יום ראשון, 13 בספטמבר')
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('0.0')
      await expect(timerCard(app)).toContainText('1.5 / 42')
    })

    await test.step('שני — משימה מרשימת היום ביומן, בלוק חודשי מההגדרות, ערכת נושא כהה', async () => {
      await nav(app, 'יומן')
      await app.getByRole('button', { name: 'יום', exact: true }).click()
      await app.getByRole('button', { name: 'הבא' }).click()
      await expect(dayList(app)).toContainText('יום שלישי, 15 בספטמבר')
      const inp = app.getByPlaceholder('+ משימה ליום הזה…')
      await inp.fill('לקנות מחברת')
      await inp.press('Enter')
      await expect(dayList(app).locator('.item', { hasText: 'לקנות מחברת' })).toBeVisible()
      // לא במסך היום (זה של מחר)
      await nav(app, 'היום')
      await expect(tasksCard(app).locator('.item', { hasText: 'לקנות מחברת' })).toHaveCount(0)

      await settings(app)
      const rulesCard = app.locator('.card', { hasText: 'מבנה השבוע הקבוע' })
      await rulesCard.getByRole('button', { name: '+ חדש' }).click()
      const rs = app.getByRole('dialog', { name: 'בלוק קבוע' })
      await rs.getByPlaceholder('למשל: עבודה עמוקה — בוקר').fill('שכר דירה')
      await rs.getByRole('button', { name: 'כל חודש' }).click()
      const md = rs.getByRole('group', { name: 'ביום בחודש' }).locator('input')
      await expect(md).toHaveValue('14')
      await md.fill('15')
      await md.press('Enter')
      await rs.getByRole('button', { name: 'שמירה' }).click()
      await expect(rs).toBeHidden()
      await expect(rulesCard.locator('.item', { hasText: 'שכר דירה' })).toContainText('כל חודש ב־15 בו')
      // ערכת נושא כהה
      await app.locator('.spread', { hasText: 'ערכת נושא' }).getByRole('button', { name: 'כהה' }).click()
      await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark')

      // ביומן: מחר 15.9 יש שכר דירה
      await nav(app, 'יומן')
      await app.getByRole('button', { name: 'יום', exact: true }).click()
      await app.getByRole('button', { name: 'הבא' }).click()
      await expect(dayList(app).locator('.item', { hasText: 'שכר דירה' })).toContainText('09:00–11:00')
      if (!mobile) {
        await app.getByRole('button', { name: 'שבוע', exact: true }).click()
        await expect(app.locator('.wk-col').nth(2).locator('.ev', { hasText: 'שכר דירה' })).toHaveCount(1)
      }
      const st = await readState(app)
      expect(live<CalEvent>(st.events).filter((e) => e.title === 'שכר דירה').map((e) => e.date).sort().slice(0, 3)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15'])
    })

    await test.step('שני — בלוק עבודה עם השהיה, סימון משימה, רענון', async () => {
      await nav(app, 'היום')
      await jumpTo(app, '2026-09-14T10:00:00+03:00')
      const card = timerCard(app)
      await card.getByRole('button', { name: /לימודים/ }).click()
      await work(app, 20)
      await card.getByRole('button', { name: /השהיה/ }).click()
      await jumpTo(app, '2026-09-14T10:40:00+03:00')
      await expect(card).toContainText('20 מתוך 90 דק׳')
      await card.getByRole('button', { name: /המשך/ }).click()
      await work(app, 25)
      await expect(card).toContainText('45 מתוך 90 דק׳')
      await stopAndSave(app, 45)
      await expect(card.locator('.ring-wrap .n')).toHaveText('0.5')
      await expect(card).toContainText('2.0 / 42')

      await tasksCard(app).locator('.item', { hasText: 'תרגיל 4 באלגברה' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await tasksCard(app).locator('.item', { hasText: 'לשלוח מייל למנחה' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(tasksCard(app).locator('.item .ttl')).toHaveText(['לכתוב טיוטה למבוא'])
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()

      await nav(app, 'סקירה')
      await expect(app.locator('.daybar', { hasText: 'א׳' })).toContainText('1.5')
      await expect(app.locator('.daybar', { hasText: 'ב׳' })).toContainText('0.5')
      await expect(app.locator('.card', { hasText: 'זמן נטו' }).first()).toContainText('3 שע׳')

      await reload(app)
      await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('0.5')
      const st = await readState(app)
      expect(st.settings.theme).toBe('dark')
      expect(live<Session>(st.sessions)).toHaveLength(3)
      expect(st.days.find((d: any) => d.date === MON)).toMatchObject({ wake: 'late', nap: true })
      expect(st.days.find((d: any) => d.date === SUN).sleep).toBe('bad')
      await measure('שני')
    })

    // =====================================================================
    await test.step('לילה: 01:00 עדיין יום שני; העבודה נספרת לשני; ב-03:31 היום מתחלף', async () => {
      await jumpTo(app, '2026-09-15T01:00:00+03:00')
      if (!mobile) await expect(greeting(app)).toHaveText('לילה טוב, דני')
      // בטלפון הרמז "היום מתחלף ב־03:30" לא קיים (ראו defects.spec) — בודקים רק את התאריך
      const monHint = mobile ? 'יום שני, 14 בספטמבר' : 'יום שני, 14 בספטמבר · היום מתחלף ב־03:30'
      await expect(sub(app)).toHaveText(monHint)
      await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toHaveCount(0)
      const card = timerCard(app)
      await card.getByRole('button', { name: /מחקר/ }).click()
      await work(app, 60)
      await stopAndSave(app, 60)
      // 45 + 60 = 105 דק׳ = 1.2 אסימונים — על יום שני
      await expect(card.locator('.ring-wrap .n')).toHaveText('1.2')
      await expect(card.getByRole('button', { name: /2 סשנים היום · 1 שע׳ 45 דק׳/ })).toBeVisible()
      await expect(sub(app)).toHaveText(monHint)

      await jumpTo(app, '2026-09-15T03:29:00+03:00')
      await expect(sub(app)).toHaveText(monHint)
      await jumpTo(app, '2026-09-15T03:31:00+03:00')
      await expect(sub(app)).toHaveText('יום שלישי, 15 בספטמבר')
      await expect(card.locator('.ring-wrap .n')).toHaveText('0.0')
      await expect(card).toContainText('2.7 / 42')
      await expect(habitsCounter(app)).toHaveText('0/3')
      // 03:31 זה עדיין לא בוקר — כרטיסי הבוקר מחכים לארבע
      await expect(app.locator('.card', { hasText: 'קמת היום בשעה' })).toHaveCount(0)
      await expect(tasksCard(app).locator('.item .ttl')).toHaveText(['לכתוב טיוטה למבוא', 'לתקן באג בסנכרון', 'לקנות מחברת'])
      await expect(tasksCard(app).locator('.item', { hasText: 'לכתוב טיוטה למבוא' }).locator('.sub2')).toContainText('באיחור 2 ימים · מ־13.9')
      await expect(scheduleCard(app).locator('.item', { hasText: 'שכר דירה' })).toContainText('10:00')
      const st = await readState(app)
      const night = live<Session>(st.sessions).find((x) => x.minutes === 60)!
      expect(new Date(night.endedAt).getHours()).toBe(2)
      // גם בסקירה: יום שני 1.2, שלישי ריק
      await nav(app, 'סקירה')
      await expect(app.locator('.daybar', { hasText: 'ב׳' })).toContainText('1.2')
      await expect(app.locator('.daybar', { hasText: 'ג׳' })).toContainText('·')
    })

    // =====================================================================
    await test.step('שלישי 15.9, 07:35 — דחייה ראשונה, יום הולדת עם תזכורת, הבלוק החודשי', async () => {
      await newDay(app, '2026-09-15T07:35:00+03:00')
      await expect(sub(app)).toHaveText('יום שלישי, 15 בספטמבר')
      await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark')
      await answerMorning(app, 'ontime', 'good')
      await expect(app.locator('.countdowns .cd', { hasText: 'מבחן' })).toHaveClass(/hot/)
      await expect(app.locator('.countdowns .cd', { hasText: 'מבחן' }).locator('.d')).toHaveText(/^2\s*ימים$/)

      const tasks = tasksCard(app)
      await expect(tasks).toContainText('2 אסימונים מתוכננים · קיבולת 6 · 1 באיחור · 1 בלי הערכה')
      await tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' }).getByRole('button', { name: 'דחה למחר' }).click()
      await expect(app.locator('.toast')).toContainText('נדחה למחר')
      await expect(tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' })).toHaveCount(0)
      await expect(tasks).toContainText('אסימון אחד מתוכנן · קיבולת 6 · 1 בלי הערכה')
      await tasks.locator('.item', { hasText: 'לתקן באג בסנכרון' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await tasks.locator('.item', { hasText: 'לקנות מחברת' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(tasks).toContainText('2 הושלמו היום')

      // יום הולדת בהגדרות ← תאריכים קבועים
      await settings(app)
      const dates = app.locator('.card', { hasText: 'תאריכים קבועים' })
      await dates.getByRole('button', { name: 'יום הולדת', exact: true }).click()
      const q = dates.getByLabel('תאריך ושם')
      await q.fill('29.9 יום הולדת לאמא')
      await q.press('Enter')
      await expect(app.locator('.toast')).toContainText('נוסף · 29.9')
      await expect(dates.locator('.item', { hasText: 'יום הולדת לאמא' })).toContainText('חוזר כל שנה')
      // תזכורת "שבועיים לפני" — מעורך האירוע ביומן
      await nav(app, 'יומן')
      await app.getByRole('button', { name: 'חודש', exact: true }).click()
      await app.locator('.cal-cell:not(.out)', { has: app.locator('.n', { hasText: /^29$/ }) }).locator('.pill', { hasText: 'אמא' }).click()
      const ed = app.getByRole('dialog', { name: 'עריכת אירוע' })
      await expect(ed).toBeVisible()
      await ed.getByRole('button', { name: 'שבועיים לפני' }).click()
      await ed.getByRole('button', { name: 'שמירה' }).click()
      await expect(ed).toBeHidden()
      // היום 15.9 = שבועיים לפני 29.9 — התזכורת במסך היום
      await nav(app, 'היום')
      const rem = app.locator('.card.rail.alert', { hasText: 'יום הולדת לאמא' })
      await expect(rem).toContainText('בעוד 14 ימים: יום הולדת לאמא')
      await expect(rem).toContainText('29.9')
      const st = await readState(app)
      expect(live<CalEvent>(st.events).find((e) => e.title === 'יום הולדת לאמא')).toMatchObject({ date: BIRTHDAY, kind: 'birthday', yearly: true, allDay: true, remind: [14] })
    })

    await test.step('שלישי — בלוק אחה״צ מהלו״ז, רענון', async () => {
      await jumpTo(app, '2026-09-15T13:35:00+03:00')
      await expect(whatNow(app)).toContainText('עבודה עמוקה — אחה״צ')
      await scheduleCard(app).locator('.item', { hasText: 'עבודה עמוקה — אחה״צ' }).getByRole('button', { name: 'התחל' }).click()
      const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
      await expect(focus).toBeVisible()
      await app.keyboard.press('Escape')
      await expect(focus).toBeHidden()
      await work(app, 90)
      await stopAndSave(app, 90)
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('1.0')
      await expect(timerCard(app)).toContainText('3.7 / 42')
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await reload(app)
      await expect(app.locator('.card.rail.alert', { hasText: 'יום הולדת לאמא' })).toBeVisible()
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('1.0')
      await measure('שלישי')
    })

    // =====================================================================
    await test.step('רביעי 16.9 — המשימה שנדחתה בזמן, אימון חדר כושר, בלי תזכורת', async () => {
      await newDay(app, '2026-09-16T07:35:00+03:00')
      await expect(sub(app)).toHaveText('יום רביעי, 16 בספטמבר')
      await answerMorning(app, 'ontime', 'good')
      await expect(app.locator('.card.rail.alert', { hasText: 'יום הולדת לאמא' })).toHaveCount(0)
      await expect(app.locator('.countdowns .cd', { hasText: 'מבחן' }).locator('.d')).toHaveText('מחר')
      const tasks = tasksCard(app)
      await expect(tasks.locator('.item .ttl')).toHaveText(['לכתוב טיוטה למבוא', 'לקרוא מאמר'])
      await expect(tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' }).locator('.sub2')).toHaveText('מחקר · אסימון אחד')
      await expect(tasks).toContainText('3 אסימונים מתוכננים · קיבולת 6')

      // חזה וכתפיים
      await expect(workoutCard(app)).toContainText('חזה וכתפיים')
      await workoutCard(app).getByRole('button', { name: 'פתיחת האימון' }).click()
      const ws = app.getByRole('dialog', { name: 'אימון' })
      const bench = ws.locator('.card', { hasText: 'לחיצת חזה' })
      await bench.locator('.setchip').nth(0).click()
      const editor = bench.locator('.set-edit')
      for (let i = 0; i < 16; i++) await editor.getByRole('button', { name: 'הוספת ק״ג' }).click()
      await expect(bench.locator('.setchip').nth(0)).toHaveText(/40×8/)
      await editor.getByRole('button', { name: /אישור/ }).click()
      await bench.locator('.setchip').nth(1).click()
      await bench.locator('.set-edit').getByRole('button', { name: /אישור/ }).click()
      await bench.locator('.setchip').nth(2).click()
      await bench.locator('.set-edit').getByRole('button', { name: /אישור/ }).click()
      await expect(bench.locator('.tiny.faint.ltr')).toHaveText('3/3')
      await ws.getByRole('button', { name: /סיימתי/ }).click()
      await expect(ws).toBeHidden()
      await expect(workoutCard(app).locator('.wk-strip .wd.ok')).toHaveCount(2)
      await expect(habitsCard(app).locator('.item', { hasText: 'אימון' }).getByRole('button', { name: 'כוח' })).toHaveClass(/primary/)
      await workoutCard(app).getByRole('button', { name: 'התקדמות' }).click()
      const prog = app.getByRole('dialog', { name: 'התקדמות' })
      await expect(prog.locator('.card', { hasText: 'לחיצת חזה' })).toContainText('שיא: 40×8')
      await prog.getByRole('button', { name: 'סגירה', exact: true }).last().click()

      await jumpTo(app, '2026-09-16T08:31:00+03:00')
      await whatNow(app).getByRole('button', { name: 'התחל' }).click()
      await app.keyboard.press('Escape')
      await work(app, 90)
      await stopAndSave(app, 90)
      await tasks.locator('.item', { hasText: 'לקרוא מאמר' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(habitsCounter(app)).toHaveText('2/3')
      await reload(app)
      await expect(habitsCounter(app)).toHaveText('2/3')
      await expect(timerCard(app)).toContainText('4.7 / 42')
      await measure('רביעי')
    })

    // =====================================================================
    await test.step('חמישי 17.9 — יום המבחן, דחייה שנייה, קיבולת מופחתת לסופ״ש', async () => {
      await newDay(app, '2026-09-17T07:35:00+03:00')
      await expect(sub(app)).toHaveText('יום חמישי, 17 בספטמבר')
      await answerMorning(app, 'ontime', 'bad')
      await expect(app.locator('.countdowns .cd', { hasText: 'מבחן' }).locator('.d')).toHaveText('היום')
      await expect(scheduleCard(app).locator('.chip', { hasText: 'מבחן באלגברה' })).toBeVisible()
      // easyExamDay כבוי — היעד נשאר 6
      await expect(timerCard(app).locator('.ring-wrap .l')).toHaveText('מתוך 6')
      const tasks = tasksCard(app)
      const late = tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' })
      await expect(late.locator('.sub2')).toHaveText('באיחור 1 יום · מ־16.9 · מחקר · אסימון אחד')
      await late.getByRole('button', { name: 'דחה למחר' }).click()
      await expect(tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' })).toHaveCount(0)
      await tasks.locator('.item', { hasText: 'להכין שאלות למבחן' }).getByRole('button', { name: 'סמן כבוצע' }).click()

      await settings(app)
      await expect(app.getByText('60% מהיעד (4 אסימונים)')).toBeVisible()
      await app.getByRole('switch', { name: 'קיבולת מופחתת בשישי ושבת' }).click()
      await expect(app.getByRole('switch', { name: 'קיבולת מופחתת בשישי ושבת' })).toHaveAttribute('aria-checked', 'true')

      await nav(app, 'היום')
      await jumpTo(app, '2026-09-17T19:00:00+03:00')
      await tasksCard(app).getByRole('button', { name: 'תכנון מחר' }).click()
      const sh = app.getByRole('dialog', { name: 'תכנון מחר' })
      await expect(sh).toContainText('יום שישי, 18 בספטמבר · קיבולת 4 אסימונים')
      await expect(sh.locator('.list .item')).toHaveCount(3)
      const inp = sh.getByPlaceholder('מה חייב לקרות מחר?')
      await inp.fill('לנקות את השולחן')
      await inp.press('Enter')
      await sh.getByRole('button', { name: /סגור/ }).click()
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await reload(app)
      const st = await readState(app)
      expect(st.settings.easyWeekend).toBe(true)
      expect(live<Task>(st.tasks).find((t) => t.id === 't-sun-intro')!.due).toBe(FRI)
      await measure('חמישי')
    })

    // =====================================================================
    await test.step('שישי 18.9 — הטבעת "מתוך 4", כותרת המשימות, המספרים של השבוע', async () => {
      await newDay(app, '2026-09-18T07:35:00+03:00')
      await expect(sub(app)).toHaveText('יום שישי, 18 בספטמבר')
      await answerMorning(app, 'ontime', 'good')
      const card = timerCard(app)
      await expect(card.locator('.ring-wrap .l')).toHaveText('מתוך 4')
      await expect(card).toContainText('0 דק׳ מתוך 6 שע׳ היום')
      const tasks = tasksCard(app)
      await expect(tasks).toContainText('4 אסימונים מתוכננים · קיבולת 4 · 1 בלי הערכה')
      await expect(tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' }).locator('.sub2')).toHaveText('מחקר · אסימון אחד')
      await expect(tasks).not.toContainText('העומס של היום עובר את הקיבולת')
      // בשישי אין בלוק עמוק בלו״ז
      await expect(scheduleCard(app).locator('.item', { hasText: 'עבודה עמוקה' })).toHaveCount(0)
      await card.getByRole('button', { name: /מחקר/ }).click()
      await work(app, 60)
      await stopAndSave(app, 60)
      await expect(card.locator('.ring-wrap .n')).toHaveText('0.7')
      await expect(card.locator('.ring-wrap .l')).toHaveText('מתוך 4')
      await tasks.locator('.item', { hasText: 'לכתוב טיוטה למבוא' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await tasks.locator('.item', { hasText: 'סידור מסמכים' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await tasks.locator('.item', { hasText: 'לסכם הרצאה' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await tasks.locator('.item', { hasText: 'לנקות את השולחן' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await habitsCard(app).locator('.item', { hasText: 'שגרת בוקר' }).getByRole('button', { name: 'סמן כבוצע' }).click()

      await nav(app, 'סקירה')
      const numbers = app.locator('.card', { hasText: 'זמן נטו' }).first()
      // 135 + 105 + 90 + 90 + 60 = 480 דק׳ = 5.3 אסימונים
      await expect(numbers.locator('.ring-wrap .n')).toHaveText('5.3')
      await expect(numbers).toContainText('8 שע׳')
      for (const [d, v] of [['א׳', '1.5'], ['ב׳', '1.2'], ['ג׳', '1.0'], ['ד׳', '1.0'], ['ה׳', '·'], ['ו׳', '0.7']]) {
        await expect(app.locator('.daybar', { hasText: d })).toContainText(v)
      }
      await nav(app, 'פרויקטים')
      await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
      // 13 נוצרו סה״כ (11 זרע + מייל + מחברת + שולחן = 14) − 10 הושלמו = 4 פתוחות... נספור מהמצב
      const st = await readState(app)
      const open = live<Task>(st.tasks).filter((t) => t.status !== 'done').length
      await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText(`${open} משימות פתוחות`)
      expect(open).toBe(3)
      await reload(app)
      await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('0.7')
      await measure('שישי')
    })

    // =====================================================================
    await test.step('שבת 19.9 — בלי נעילה ובלי תזכורת (השבוע שעבר ריק), אסימון שבועי', async () => {
      await newDay(app, '2026-09-19T09:00:00+03:00')
      await expect(sub(app)).toHaveText('יום שבת, 19 בספטמבר')
      await expect(app.locator('.lock-overlay')).toHaveCount(0)
      await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
      await expect(timerCard(app).locator('.ring-wrap .l')).toHaveText('מתוך 4')
      await expect(tasksCard(app).locator('.item')).toHaveCount(0)
      await expect(weeklyCard(app)).toContainText('0/5')
      await weeklyCard(app).locator('.item', { hasText: 'ערב עם המשפחה' }).getByRole('button', { name: 'סמן כבוצע' }).click()
      await expect(weeklyCard(app)).toContainText('1/5')
      await nav(app, 'סקירה')
      // בשבת אפשר לסגור מוקדם, אבל אף אחד לא לוחץ
      await expect(app.getByRole('button', { name: 'סגירת השבוע הנוכחי (מוקדם)' })).toBeVisible()
      await expect(app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' })).toHaveCount(0)
      await reload(app)
      const st = await readState(app)
      expect(st.weeks.find((w: WeekLog) => w.weekStart === SUN).items).toEqual({ 'wk-family': true })
      await measure('שבת')
    })

    // =====================================================================
    await test.step('ראשון 20.9, 07:35 — נעילה, דחייה 3 שעות, חזרה, כיבוי בהגדרות', async () => {
      await newDay(app, '2026-09-20T07:35:00+03:00')
      const lock = app.locator('.lock-overlay')
      await expect(lock).toBeVisible()
      await expect(lock).toContainText('מעבר שבועי')
      await expect(app.locator('.bottomnav, nav.sidebar')).toHaveCount(0)
      await lock.getByRole('button', { name: 'אמלא אחר כך' }).click()
      await expect(lock).toHaveCount(0)
      const nudge = app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })
      await expect(nudge).toContainText('13.9–19.9')
      await expect(nudge).not.toContainText('כבר')
      let st = await readState(app)
      const snooze = st.weeks.find((w: WeekLog) => w.weekStart === SUN).snoozeUntil
      expect(snooze).toBeGreaterThanOrEqual(Date.parse('2026-09-20T10:35:00+03:00'))
      expect(snooze).toBeLessThan(Date.parse('2026-09-20T10:35:30+03:00'))
      // 10:34 — עדיין דחוי; 10:36 — הנעילה חוזרת מעצמה
      await jumpTo(app, '2026-09-20T10:34:00+03:00')
      await expect(lock).toHaveCount(0)
      await jumpTo(app, '2026-09-20T10:36:00+03:00')
      await expect(lock).toBeVisible()
      await lock.getByRole('button', { name: 'אמלא אחר כך' }).click()
      await settings(app)
      const sw = app.getByRole('switch', { name: 'נעילת סקירה שבועית' })
      await expect(sw).toHaveAttribute('aria-checked', 'true')
      await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await jumpTo(app, '2026-09-20T14:00:00+03:00')
      await reload(app)
      await expect(lock).toHaveCount(0)
      st = await readState(app)
      expect(st.settings.reviewLock).toBe(false)
    })

    await test.step('ראשון 20.9 — המעבר השבועי בשישה שלבים, עם תשובות אמיתיות', async () => {
      await nav(app, 'היום')
      await app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' }).click()
      const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
      const title = flow.locator('.flow-head b').first()
      const next = flow.getByRole('button', { name: 'הבא ←' })
      await expect(title).toHaveText('המספרים')
      await expect(flow.locator('.ring-wrap .n')).toHaveText('5.3')
      await expect(flow).toContainText('8 שע׳')
      await next.click()
      await expect(title).toHaveText('הניתוח')
      await expect(flow.locator('.ins').first()).toBeVisible()
      await next.click()
      await expect(title).toHaveText('השאלות')
      const qs = flow.locator('.qcard textarea')
      await qs.nth(0).fill('טיוטת מבוא לסמינר, ופתרון לתרגיל 4')
      await qs.nth(1).fill('טיוטת המבוא נדחתה פעמיים — כי הגיע אחרי הבלוק, לא בתוכו')
      await qs.nth(2).fill('להתחיל את פרק 2 — ראשון 08:30')
      await flow.locator('.scorebar').getByRole('button', { name: '7', exact: true }).click()
      await next.click()
      await expect(title).toHaveText('מטרות')
      await expect(flow).toContainText('לשבוע 20.9 – 26.9')
      // 5 ימים × 6 + שישי־שבת × 4 = 38
      await expect(flow).toContainText('קיבולת של 38 אסימונים')
      await expect(flow).toContainText('בפועל השבוע שנסגר הכניס 5.3')
      const g1 = flow.locator('.qcard', { hasText: 'מטרה 1' })
      await g1.locator('input').fill('לסיים את פרק 2 בסמינר')
      await g1.getByRole('button', { name: /מחקר/ }).click()
      await flow.getByRole('button', { name: '+ מטרה נוספת' }).click()
      await flow.locator('.qcard', { hasText: 'מטרה 2' }).locator('input').fill('שלושה אימונים')
      await next.click()
      await expect(title).toHaveText('המשימות')
      await expect(flow).toContainText('0 משימות בשבוע')
      const pool = flow.locator('.card', { hasText: 'מהמאגר' })
      for (const t of ['לקרוא על SOTA', 'לבנות דף נחיתה', 'לכתוב את פרק 2']) await pool.getByRole('button', { name: `+ ${t}` }).click()
      await expect(flow).toContainText('3 משימות בשבוע')
      await expect(flow).toContainText('8 מתוך 38 אסימונים')
      const dayRow = (d: string) => flow.locator('.item', { has: app.locator(`.tiny.faint.ltr:text-is("${d}")`) })
      await expect(dayRow('20.9')).toContainText('8/6')
      await flow.getByRole('button', { name: 'פזר על ימי השבוע' }).click()
      // 1 + 3 נכנסים לראשון (6), 4 לא נכנסים בשארית (2) → שני
      await expect(dayRow('20.9')).toContainText('4/6')
      await expect(dayRow('20.9')).toContainText('לקרוא על SOTA')
      await expect(dayRow('20.9')).toContainText('לבנות דף נחיתה')
      await expect(dayRow('21.9')).toContainText('4/6')
      await expect(dayRow('21.9')).toContainText('לכתוב את פרק 2')
      await next.click()
      await expect(title).toHaveText('סיום')
      await expect(flow.locator('.card', { hasText: 'מטרות־העל' }).locator('.item')).toHaveCount(2)
      await flow.getByRole('button', { name: /סגירת השבוע$/ }).click()
      await expect(flow).toBeHidden()
      await expect(app.locator('.toast')).toContainText('השבוע נסגר')

      // מסך היום: המטרות, המשימות של היום
      await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
      const goals = app.locator('.card', { hasText: 'מטרות־העל של השבוע' })
      await expect(goals.locator('.item .ttl')).toHaveText(['לסיים את פרק 2 בסמינר', 'שלושה אימונים'])
      await expect(goals).toContainText('0/2')
      await expect(tasksCard(app).locator('.item .ttl')).toHaveText(['לקרוא על SOTA', 'לבנות דף נחיתה'])
      await expect(tasksCard(app)).toContainText('4 אסימונים מתוכננים · קיבולת 6')

      // סקירה: השבוע שנסגר, הגרף, שבועות קודמים
      await nav(app, 'סקירה')
      const hist = app.locator('.card', { hasText: 'שבועות קודמים' })
      await expect(hist.locator('.item')).toHaveCount(1)
      await expect(hist.locator('.item')).toContainText('שבוע 13.9')
      await expect(hist.locator('.item')).toContainText('5.3 אסימונים')
      await expect(hist.locator('.item .chip')).toHaveText('7/10')
      const chart = app.locator('.card', { hasText: 'שעות עבודה לאורך הזמן' })
      const bars = chart.locator('.hist i')
      expect(await bars.count()).toBeGreaterThanOrEqual(1)
      await expect(chart.locator('.hist i[title*="8 שע׳"]')).toHaveCount(1)
      await app.getByRole('button', { name: 'לשבוע הקודם' }).click()
      const closed = app.locator('.card', { hasText: 'השבוע הזה נסגר' })
      await expect(closed.locator('.chip')).toHaveText('7/10')
      await expect(closed).toContainText('טיוטת מבוא לסמינר')

      // יומן: המשימות שפוזרו נוחתות על הימים הנכונים
      await nav(app, 'יומן')
      await app.getByRole('button', { name: 'יום', exact: true }).click()
      await expect(dayList(app)).toContainText('יום ראשון, 20 בספטמבר')
      await expect(dayList(app).locator('.item', { hasText: 'לבנות דף נחיתה' })).toBeVisible()
      await app.getByRole('button', { name: 'הבא' }).click()
      await expect(dayList(app).locator('.item', { hasText: 'לכתוב את פרק 2' })).toBeVisible()

      await reload(app)
      await expect(app.locator('.card', { hasText: 'מטרות־העל של השבוע' })).toContainText('0/2')
      const st = await readState(app)
      const prev = st.weeks.find((w: WeekLog) => w.weekStart === SUN)
      expect(prev.review.score).toBe(7)
      expect(prev.review.snapshot).toMatchObject({ minutes: 480, tasksDone: 11 })
      expect(prev.review.snapshot.daysLogged).toBe(6)
      const cur = st.weeks.find((w: WeekLog) => w.weekStart === NEXT_SUN)
      expect(cur.goals.map((g: any) => g.text)).toEqual(['לסיים את פרק 2 בסמינר', 'שלושה אימונים'])
      expect(typeof cur.plannedAt).toBe('number')
      const tasks = live<Task>(st.tasks)
      expect(tasks.find((t) => t.id === 't-pool-ch2')!.due).toBe(NEXT_MON)
      expect(tasks.find((t) => t.id === 't-pool-landing')!.due).toBe(NEXT_SUN)
      await measure('ראשון הבא')
    })

    await test.step('מדידות: זמן ציור של "היום" וגודל האחסון', async () => {
      const last = sizes[sizes.length - 1][1]
      console.log('storage bytes by day:', JSON.stringify(sizes), '| today render ms:', JSON.stringify(renders))
      expect(last).toBeLessThan(1_000_000)
      // הציור של מסך היום אחרי שבוע של נתונים — מתחת לשנייה
      expect(renders[renders.length - 1][1]).toBeLessThan(1000)
      void SAT
      void THU
      void WED
      void TUE
    })
  })
})
