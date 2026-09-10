// ---------------------------------------------------------------------------
// צילומי מסך של כל מסך וכל גיליון, בשני הפרופילים ובשתי ערכות הנושא.
// הקבצים נכתבים ל-tests/reports/design/<screen>-<project>-<theme>.png
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { EVENING_MS, THEMES, atlasCache, nav, openApp, richState, shot } from './helpers'

test.describe.configure({ mode: 'parallel' })

for (const theme of THEMES) {
  test.describe(`ערכה ${theme}`, () => {
    test(`היום — מסך, גיליונות, מצב מיקוד (${theme})`, async ({ app }, info) => {
      test.setTimeout(150_000)
      await openApp(app, { state: richState(theme), atlas: atlasCache() })
      await expect(app.locator('.sec-h h2').first()).toHaveText('עכשיו')
      await expect(app.locator('.timer-time')).toBeVisible()
      await shot(app, info, 'today', theme)

      // הרגל עם שלבים פתוח + המאגר פתוח — המצב ה"מלא" של הכרטיסים
      await app.locator('.card', { hasText: 'הרגלי היום' }).locator('button.txt').first().click()
      await app.getByRole('button', { name: /משימות בלי תאריך/ }).click()
      await shot(app, info, 'today-expanded', theme)

      // גיליון משימה מתוך הצ׳קליסט
      await app.locator('.card', { hasText: 'המשימות של היום' }).locator('button.txt').first().click()
      await expect(app.getByRole('dialog', { name: 'משימה' })).toBeVisible()
      await shot(app, info, 'sheet-task', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await expect(app.locator('.scrim')).toHaveCount(0)

      // רישום ידני
      await app.getByRole('button', { name: /רישום ידני/ }).click()
      await expect(app.getByRole('dialog', { name: 'רישום ידני של עבודה' })).toBeVisible()
      await shot(app, info, 'sheet-manual', theme, { viewport: true })
      await app.keyboard.press('Escape')

      // השלבים של התקופה
      await app.locator('button.card', { hasText: 'סמסטר קיץ' }).click()
      await expect(app.getByRole('dialog', { name: 'השלבים של התקופה' })).toBeVisible()
      await shot(app, info, 'sheet-phase', theme, { viewport: true })
      await app.keyboard.press('Escape')

      // האימון של היום
      await app.locator('.wk-strip .wd.now').click()
      const wo = app.getByRole('dialog', { name: 'אימון' })
      await expect(wo).toBeVisible()
      await shot(app, info, 'sheet-workout', theme, { viewport: true })
      // מד הסט — נגיעה על הצ׳יפ הראשון של התרגיל הראשון
      await wo.locator('.setchip').first().click()
      await expect(wo.locator('.set-edit')).toBeVisible()
      await shot(app, info, 'sheet-workout-set', theme, { viewport: true })
      await wo.locator('.flow-head button').last().click()
      await expect(wo).toHaveCount(0)

      // מצב מיקוד
      await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
      await expect(app.locator('.focus')).toBeVisible()
      await shot(app, info, 'focus', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await expect(app.locator('.focus')).toHaveCount(0)
    })

    test(`היום בערב — תכנון מחר (${theme})`, async ({ app }, info) => {
      test.setTimeout(90_000)
      await openApp(app, { state: richState(theme), atlas: atlasCache(), time: EVENING_MS })
      await shot(app, info, 'today-evening', theme)
      await app.getByRole('button', { name: /תכנון מחר/ }).click()
      await expect(app.getByRole('dialog', { name: 'תכנון מחר' })).toBeVisible()
      await shot(app, info, 'sheet-plan', theme, { viewport: true })
      await app.keyboard.press('Escape')
    })

    test(`המעבר השבועי — ששת השלבים (${theme})`, async ({ app }, info) => {
      test.setTimeout(120_000)
      await openApp(app, { state: richState(theme), atlas: atlasCache() })
      await app.locator('button.card.alert', { hasText: 'המעבר השבועי מחכה' }).click()
      const flow = app.locator('.flow')
      await expect(flow).toBeVisible()
      for (let step = 0; step < 6; step++) {
        await app.waitForTimeout(100)
        await shot(app, info, `flow-step${step + 1}`, theme, { viewport: true })
        if (step === 2) {
          await flow.locator('textarea').first().fill('פרק 2 של הדוח, ודף נחיתה חדש.')
          await flow.locator('.scorebar button', { hasText: /^7$/ }).click()
        }
        if (step < 5) await flow.locator('.flow-foot .btn.primary').click()
      }
      await flow.locator('.flow-head button[aria-label="סגירה"]').click()
      await expect(flow).toHaveCount(0)
    })

    test(`יומן — חודש, שבוע, יום, גיליון אירוע (${theme})`, async ({ app }, info) => {
      test.setTimeout(120_000)
      await openApp(app, { state: richState(theme) })
      await nav(app, 'calendar')
      for (const [mode, label] of [['month', 'חודש'], ['week', 'שבוע'], ['day', 'יום']] as const) {
        await app.locator('.btn.xs', { hasText: new RegExp(`^${label}$`) }).click()
        await app.waitForTimeout(150)
        await shot(app, info, `calendar-${mode}`, theme)
      }
      await app.locator('.card .item.tappable').first().click()
      await expect(app.getByRole('dialog', { name: 'עריכת אירוע' })).toBeVisible()
      await shot(app, info, 'sheet-event', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await app.getByRole('button', { name: '+ אירוע' }).click()
      await expect(app.getByRole('dialog', { name: 'אירוע חדש' })).toBeVisible()
      await shot(app, info, 'sheet-event-new', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await app.getByRole('button', { name: 'הדבקת תאריכים' }).click()
      await expect(app.locator('.scrim .sheet')).toBeVisible()
      await shot(app, info, 'sheet-bulk-dates', theme, { viewport: true })
      await app.keyboard.press('Escape')
    })

    test(`פרויקטים — לוח, הכל, גיליון משימה ומסלול (${theme})`, async ({ app }, info) => {
      test.setTimeout(120_000)
      await openApp(app, { state: richState(theme) })
      await nav(app, 'projects')
      await expect(app.locator('.kanban')).toBeVisible()
      await shot(app, info, 'projects', theme)
      await app.locator('.tag', { hasText: /^הכל$/ }).click()
      await app.waitForTimeout(100)
      await shot(app, info, 'projects-all', theme)
      await app.locator('.kcard').first().click()
      await expect(app.getByRole('dialog', { name: 'משימה' })).toBeVisible()
      await shot(app, info, 'sheet-task-board', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await app.locator('.tag', { hasText: /^\+ מסלול$/ }).click()
      await expect(app.getByRole('dialog', { name: 'מסלול חדש' })).toBeVisible()
      await shot(app, info, 'sheet-track', theme, { viewport: true })
      await app.keyboard.press('Escape')
    })

    test(`סקירה (${theme})`, async ({ app }, info) => {
      test.setTimeout(90_000)
      await openApp(app, { state: richState(theme) })
      await nav(app, 'review')
      await expect(app.locator('.sec-h h2', { hasText: 'מה עולה מהנתונים' })).toBeVisible()
      await shot(app, info, 'review', theme)
      // השבוע הנוכחי (בעיצומו) — ברירת המחדל היא השבוע שמחכה לסגירה
      await app.getByRole('button', { name: 'השבוע', exact: true }).click()
      await app.waitForTimeout(100)
      await shot(app, info, 'review-current', theme)
    })

    test(`הגדרות — מסך וגיליונות (${theme})`, async ({ app }, info) => {
      test.setTimeout(120_000)
      await openApp(app, { state: richState(theme) })
      await nav(app, 'settings')
      await expect(app.locator('.card', { hasText: 'מבנה השבוע הקבוע' })).toBeVisible()
      await shot(app, info, 'settings', theme)
      await app.locator('.card', { hasText: 'מבנה השבוע הקבוע' }).locator('.item.tappable').first().click()
      await expect(app.getByRole('dialog', { name: 'בלוק קבוע' })).toBeVisible()
      await shot(app, info, 'sheet-rule', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await app.locator('.card', { hasText: 'הרגלים יומיים' }).locator('.item.tappable').first().click()
      await expect(app.getByRole('dialog', { name: 'הרגל יומי' })).toBeVisible()
      await shot(app, info, 'sheet-habit', theme, { viewport: true })
      await app.keyboard.press('Escape')
      await app.locator('.card', { hasText: 'אסימונים שבועיים' }).locator('.item.tappable').first().click()
      await expect(app.getByRole('dialog', { name: 'אסימון שבועי' })).toBeVisible()
      await shot(app, info, 'sheet-weekly', theme, { viewport: true })
      await app.keyboard.press('Escape')
    })

    test(`אטלס — שיחה עם פקודות (${theme})`, async ({ app }, info) => {
      test.setTimeout(90_000)
      await openApp(app, { state: richState(theme), atlas: atlasCache() })
      await nav(app, 'atlas')
      await expect(app.locator('.bubble.atlas .cmd').first()).toBeVisible()
      await shot(app, info, 'atlas', theme)
    })
  })
}
