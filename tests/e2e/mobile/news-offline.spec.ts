// ---------------------------------------------------------------------------
// מהדורה שלא נטענה אומרת את זה.
//
// הרקע (25.9.2026): "אני לא רואה את חדשות הבוקר בטלפון". כשה-fetch נכשל ואין
// מטמון, הכרטיס הוחזר כ-null — בדיוק אותה תמונה כמו בוקר בלי מהדורה, בלי שום
// רמז שמשהו נשבר ובלי מה ללחוץ. מעכשיו זו שורה עם "נסה שוב".
// ---------------------------------------------------------------------------
import { NOW, edition, expect, makeState, openApp, test } from './helpers'

const onboarded = () => {
  const s = makeState()
  s.settings.onboarded = true
  return s
}

test('אין רשת ואין מטמון: שורה עם "נסה שוב", ולחיצה מביאה את המהדורה', async ({ page, errors }) => {
  errors.push(...(await openApp(page, { state: onboarded(), now: NOW, goto: false })))
  // הנתיב שנרשם אחרון נבדק ראשון — הבקשה הראשונה נופלת, השנייה מצליחה
  let fail = true
  await page.route('**/news/latest.json', (route) =>
    fail
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(edition()) }),
  )
  await page.goto('/')
  await expect(page.locator('.bottomnav button')).toHaveCount(6)

  const card = page.locator('.card', { hasText: 'חדשות הבוקר' })
  await expect(card).toContainText('המהדורה לא נטענה')

  fail = false
  await card.getByRole('button', { name: 'נסה שוב' }).click()
  await expect(page.locator('.card', { hasText: 'חדשות הבוקר ·' })).toContainText('9 סיפורים')
  expect(errors).toEqual([])
})
