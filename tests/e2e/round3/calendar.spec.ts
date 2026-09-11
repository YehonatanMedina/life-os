// ---------------------------------------------------------------------------
// סבב 3 — יומן: יצירה מתצוגת חודש, עריכה ומחיקה מתצוגת יום, ומה שכל זה עושה
// למסך היום; דאבל־קליק על תא בחודש (מתועד כפגם); עריכת בלוק קבוע מההגדרות
// מעדכנת את המופע של היום בלו״ז ובלוח; ערב חג / חג מלא משנים את יעד הטבעת.
// שני הפרופילים.
// ---------------------------------------------------------------------------
import { test, expect, readState, live, pickTime, seed, TODAY } from '../desktop/desk'
import { EVENT_TODAY, go, round3Seed, scheduleCard, timerCard } from './helpers'
import type { AppState, CalEvent } from '../../../src/types'

const dayList = (page: import('@playwright/test').Page) => page.locator('.card', { has: page.locator('input[placeholder="+ משימה ליום הזה…"]') })

test.describe('אירועים', () => {
  test.use({ seed: round3Seed })

  test('יצירה מתצוגת חודש (+ אירוע, כל היום) → פיל בתא; עריכה ומחיקה מתצוגת יום; מסך היום עוקב', async ({ app }) => {
    await go(app, 'יומן')
    await app.getByRole('button', { name: 'חודש', exact: true }).click()
    const cell = app.locator('.cal-cell.today')
    await expect(cell).toBeVisible()
    await app.getByRole('button', { name: '+ אירוע' }).click()
    const sheet = app.getByRole('dialog', { name: 'אירוע חדש' })
    await expect(sheet).toBeVisible()
    await sheet.getByPlaceholder('מה קורה?').fill('יום סידורים')
    const allDay = sheet.locator('[role="switch"]').first()
    await expect(allDay).toHaveAttribute('aria-checked', 'false')
    await allDay.click()
    await expect(allDay).toHaveAttribute('aria-checked', 'true')
    await sheet.getByPlaceholder('מה קורה?').press('Enter')
    await expect(sheet).toBeHidden()
    await expect(cell.locator('.pill', { hasText: 'יום סידורים' })).toBeVisible()

    // תצוגת יום: ברשימה; עריכת הכותרת
    await app.getByRole('button', { name: 'יום', exact: true }).click()
    await dayList(app).locator('.item.tappable', { hasText: 'יום סידורים' }).click()
    const edit = app.getByRole('dialog', { name: 'עריכת אירוע' })
    await expect(edit).toBeVisible()
    await edit.getByPlaceholder('מה קורה?').fill('יום סידורים בעירייה')
    await edit.getByRole('button', { name: 'שמירה' }).click()
    await expect(edit).toBeHidden()
    await expect(dayList(app).locator('.item.tappable', { hasText: 'יום סידורים בעירייה' })).toContainText('כל היום')

    // מסך היום: אירוע כל־היום מופיע בלו״ז לצד האירוע עם השעה
    await go(app, 'היום')
    await expect(scheduleCard(app)).toContainText('יום סידורים בעירייה')
    await expect(scheduleCard(app)).toContainText(EVENT_TODAY)

    // מחיקה מתצוגת חודש (לחיצה על הפיל) → נעלם מהיום
    await go(app, 'יומן')
    await app.getByRole('button', { name: 'חודש', exact: true }).click()
    await app.locator('.cal-cell.today .pill', { hasText: 'יום סידורים' }).click()
    const edit2 = app.getByRole('dialog', { name: 'עריכת אירוע' })
    await edit2.getByRole('button', { name: 'מחיקה' }).click()
    await app.getByRole('dialog', { name: /למחוק/ }).getByRole('button', { name: 'מחיקה' }).click()
    await expect(app.locator('.scrim')).toHaveCount(0)
    await expect(app.locator('.cal-cell.today .pill', { hasText: 'יום סידורים' })).toHaveCount(0)
    await go(app, 'היום')
    await expect(scheduleCard(app)).not.toContainText('יום סידורים')
    const st = await readState(app)
    expect(live<CalEvent>(st.events).some((e) => e.title.startsWith('יום סידורים'))).toBe(false)
    expect(st.events.find((e: CalEvent) => e.title === 'יום סידורים בעירייה')?.deleted).toBe(true)
  })

  test('עריכת שעת בלוק קבוע בהגדרות מזיזה את המופע של היום בלו״ז וביומן, ומשאירה את העבר במקומו', async ({ app }) => {
    await expect(scheduleCard(app).locator('.item', { hasText: 'אימון' }).locator('.ltr').first()).toHaveText('18:00')

    await go(app, 'הגדרות')
    await app.locator('.item.tappable', { hasText: 'אימון' }).first().click()
    const sheet = app.getByRole('dialog', { name: 'בלוק קבוע' })
    await expect(sheet).toBeVisible()
    await pickTime(app, sheet.locator('label.field', { hasText: 'התחלה' }).locator('button.input'), 19, 0)
    await pickTime(app, sheet.locator('label.field', { hasText: 'סיום' }).locator('button.input'), 19, 45)
    await sheet.getByRole('button', { name: 'שמירה' }).click()
    await expect(sheet).toBeHidden()
    await expect(app.locator('.toast')).toContainText('היומן עודכן')

    await go(app, 'היום')
    const row = scheduleCard(app).locator('.item', { hasText: 'אימון' })
    await expect(row.locator('.ltr').first()).toHaveText('19:00')
    await expect(row).toContainText('19:00–19:45')

    await go(app, 'יומן')
    await app.getByRole('button', { name: 'יום', exact: true }).click()
    await expect(dayList(app).locator('.item.tappable', { hasText: 'אימון' }).first()).toContainText('19:00')

    const st = await readState(app)
    const rule = st.rules.find((r: any) => r.id === 'rl-workout')
    expect(rule.start).toBe('19:00')
    const inst = live<CalEvent>(st.events).filter((e) => e.ruleId === 'rl-workout')
    expect(inst.filter((e) => e.date >= TODAY).every((e) => e.start === '19:00')).toBe(true)
    expect(inst.filter((e) => e.date < TODAY).every((e) => e.start === '18:00')).toBe(true)
  })
})

test.describe('קיבולת בחג', () => {
  const holidaySeed = (eve: boolean) =>
    seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true, easyHoliday: true, easyWeekend: false },
      events: [{ id: 'e-hol', updatedAt: 1, title: 'ראש השנה', date: TODAY, allDay: true, kind: 'holiday', eve, touched: true }],
    }))

  test.describe('ערב חג — חצי יעד', () => {
    test.use({ seed: holidaySeed(true) })
    test('הטבעת מציגה חצי מהיעד היומי', async ({ app }) => {
      const st = await readState(app)
      const half = Math.max(1, Math.round(st.settings.dailyTokenGoal / 2))
      await expect(timerCard(app).locator('.ring-wrap .l')).toHaveText(`מתוך ${half}`)
      await expect(timerCard(app)).not.toContainText('חג — אין יעד היום')
    })
  })

  test.describe('חג מלא — אין יעד', () => {
    test.use({ seed: holidaySeed(false) })
    test('הטבעת מציגה "חג"; כיבוי המתג בהגדרות מחזיר את היעד המלא בלי רענון', async ({ app }) => {
      await expect(timerCard(app).locator('.ring-wrap .l')).toHaveText('חג')
      await expect(timerCard(app)).toContainText('חג — אין יעד היום')
      await go(app, 'הגדרות')
      await app.getByRole('switch', { name: 'קיבולת מופחתת בחגים' }).click()
      await go(app, 'היום')
      const st = await readState(app)
      await expect(timerCard(app).locator('.ring-wrap .l')).toHaveText(`מתוך ${st.settings.dailyTokenGoal}`)
    })
  })
})
