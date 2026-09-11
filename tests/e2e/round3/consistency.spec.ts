// ---------------------------------------------------------------------------
// סבב 3 — עקביות בין מסכים אחרי כל שינוי, בלי רענון:
//  - מטרות השבוע: סימון ב"היום" נראה ב"סקירה" ולהפך
//  - שינוי שם מסלול בפרויקטים → שורות המשימות והטיימר ב"היום"
//  - מחיקת מסלול בזמן שטיימר רץ עליו → הטיימר ממשיך, בלי מסך לבן, בכל המסכים
// רץ בשני הפרופילים.
// ---------------------------------------------------------------------------
import { test, expect, readState, live } from '../desktop/desk'
import { openReview } from '../week/week'
import { GOAL_1, GOAL_2, TASK_A, TASK_B, go, goalsCard, round3Seed, taskRow, timerCard, topSheet } from './helpers'
import type { Task } from '../../../src/types'

test.use({ seed: round3Seed })

test('מטרות השבוע: סימון ב"היום" מעדכן את "סקירה" ולהפך, והמונה נכון בשניהם', async ({ app }) => {
  const todayCard = goalsCard(app)
  await expect(todayCard).toBeVisible()
  await expect(todayCard.locator('.card-h .ltr')).toHaveText('0/2')
  await todayCard.locator('.item', { hasText: GOAL_1 }).getByRole('button', { name: 'סמן כבוצע' }).click()
  await expect(todayCard.locator('.card-h .ltr')).toHaveText('1/2')

  await openReview(app)
  const reviewCard = goalsCard(app)
  await expect(reviewCard).toBeVisible()
  await expect(reviewCard.locator('.card-h .ltr')).toHaveText('1/2')
  await expect(reviewCard.locator('.item', { hasText: GOAL_1 }).locator('.ttl')).toHaveCSS('text-decoration-line', 'line-through')
  await reviewCard.locator('.item', { hasText: GOAL_2 }).getByRole('button', { name: 'סמן כבוצע' }).click()
  await expect(reviewCard.locator('.card-h .ltr')).toHaveText('2/2')

  await go(app, 'היום')
  await expect(goalsCard(app).locator('.card-h .ltr')).toHaveText('2/2')
  const st = await readState(app)
  const wk = st.weeks.find((w: any) => w.weekStart === '2026-09-06')
  expect(wk.goals.every((g: any) => g.done)).toBe(true)
  // חותמות פר־מטרה (מיזוג בין מכשירים)
  expect(Object.keys(wk.goalsAt ?? {})).toEqual(expect.arrayContaining(['g-1', 'g-2']))
})

test('שינוי שם וצבע של מסלול בפרויקטים מתעדכן בשורות המשימות ובבורר הטיימר ב"היום"', async ({ app }) => {
  await expect(taskRow(app, TASK_A).locator('.sub2')).toContainText('לימודים')
  await expect(timerCard(app).locator('.tag', { hasText: 'לימודים' })).toBeVisible()

  await go(app, 'פרויקטים')
  // המסלול הראשון נבחר כברירת מחדל — לימודים
  await app.getByRole('button', { name: 'עריכת המסלול' }).click()
  const sheet = app.getByRole('dialog', { name: 'עריכת מסלול' })
  await sheet.getByPlaceholder('שם המסלול').fill('תואר ראשון')
  await sheet.getByRole('button', { name: 'צבע 6' }).click()
  await sheet.getByRole('button', { name: 'שמירה' }).click()
  await expect(sheet).toBeHidden()
  await expect(app.locator('.tag', { hasText: 'תואר ראשון' }).first()).toBeVisible()

  await go(app, 'היום')
  await expect(taskRow(app, TASK_A).locator('.sub2')).toContainText('תואר ראשון')
  await expect(taskRow(app, TASK_A).locator('.sub2')).not.toContainText('לימודים')
  await expect(timerCard(app).locator('.tag', { hasText: 'תואר ראשון' })).toBeVisible()
  await expect(timerCard(app).locator('.tag', { hasText: 'לימודים' })).toHaveCount(0)
  // הנקודה הצבעונית של השורה קיבלה את הצבע החדש (#0090ff = צבע 6)
  await expect(taskRow(app, TASK_A).locator('.dot')).toHaveCSS('background-color', 'rgb(0, 144, 255)')

  await go(app, 'הגדרות')
  // בלוק קבוע עם מסלול "חיים" לא נפגע; ההגדרות נטענות
  await expect(app.getByText('סנכרון בין מכשירים')).toBeVisible()
})

test('מחיקת מסלול בזמן שטיימר רץ עליו: הטיימר ממשיך כ"ללא מסלול", המשימות שלו נשארות, ושום מסך לא נופל', async ({ app }) => {
  await timerCard(app).locator('.tag', { hasText: 'לימודים' }).click()
  await expect(timerCard(app)).toHaveClass(/live/)
  await expect(timerCard(app).locator('.chip.tinted')).toContainText('לימודים')

  await go(app, 'פרויקטים')
  await app.getByRole('button', { name: 'עריכת המסלול' }).click()
  const sheet = app.getByRole('dialog', { name: 'עריכת מסלול' })
  await sheet.getByRole('button', { name: 'מחיקה' }).click()
  const confirm = app.getByRole('dialog', { name: 'למחוק את המסלול?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /מחק|מחיקה/ }).click()
  await expect(app.locator('.scrim')).toHaveCount(0)
  // הבורר קפץ למסלול הבא, לא נשאר על מסלול שאיננו
  await expect(app.locator('.tag.on').first()).not.toContainText('לימודים')

  await go(app, 'היום')
  await expect(timerCard(app)).toHaveClass(/live/)
  await expect(timerCard(app).locator('.chip.tinted')).toContainText('ללא מסלול')
  await expect(taskRow(app, TASK_A).locator('.sub2')).toContainText('ללא מסלול')
  await expect(taskRow(app, TASK_B).locator('.sub2')).toContainText('מחקר')
  // מצב מיקוד — "Deep Work" בלי שם מסלול, ובלי שגיאה
  await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
  const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
  await expect(focus.locator('.focus-track')).toHaveText('Deep Work')
  await app.keyboard.press('Escape')
  await expect(focus).toBeHidden()

  // סקירה ויומן נטענים
  await go(app, 'סקירה')
  await expect(app.locator('.page, .main').first()).toBeVisible()
  await go(app, 'יומן')
  await expect(app.getByRole('button', { name: '+ אירוע' })).toBeVisible()

  const st = await readState(app)
  expect(st.timer?.running).toBe(true)
  expect(live<Task>(st.tasks).map((t) => t.title)).toEqual(expect.arrayContaining([TASK_A, TASK_B]))
  expect(st.tracks.find((t: any) => t.id === 'trk-study').deleted).toBe(true)
})
