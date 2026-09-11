// ---------------------------------------------------------------------------
// סבב 3 — כרטיסי ההתראות וההתקנה בהגדרות: הודעות נכונות כשאין מפתח התראות
// וכשהדפדפן לא מציע התקנה; בלי רשת ובלי Service Worker (חסום בבדיקות).
// ---------------------------------------------------------------------------
import { test, expect } from '../../desktop/desk'
import { go, round3Seed } from '../helpers'

test.use({ seed: round3Seed })

test('התראות: בלי מפתח — הסבר וטוסט "חסר מפתח"; התקנה: הדפדפן לא מציע — הוראות ידניות', async ({ app }) => {
  await go(app, 'הגדרות')
  const notify = app.locator('.card', { hasText: 'התראות לטלפון' })
  await expect(notify).toContainText('כבוי')
  await expect(notify).toContainText('במכשיר הזה עוד אין מפתח התראות')
  await notify.getByRole('button', { name: 'הדלק התראות במכשיר הזה' }).click()
  await expect(app.locator('.toast')).toContainText('חסר מפתח התראות')
  await expect(notify).toContainText('כבוי')

  const install = app.locator('.card', { hasText: 'התקנה כאפליקציה' })
  await expect(install).toContainText('הדפדפן לא מציע התקנה כרגע')
  await expect(install.getByRole('button', { name: 'התקנה על המכשיר הזה' })).toHaveCount(0)
})

test('התראות מערכת: כשההרשאה נדחית המתג נשאר כבוי ומופיע טוסט', async ({ app }) => {
  await app.evaluate(() => {
    ;(window as any).Notification = { permission: 'denied', requestPermission: async () => 'denied' }
  })
  await go(app, 'הגדרות')
  const sw = app.getByRole('switch', { name: 'התראות מערכת' })
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.click()
  await expect(app.locator('.toast')).toContainText('ההרשאה נדחתה')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
})
