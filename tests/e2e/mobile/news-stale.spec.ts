// ---------------------------------------------------------------------------
// מהדורה שאינה של היום אומרת מתי היא.
//
// הרקע (25.9.2026): הכרטיס הציג את הכותרות בלי תאריך, ולכן מהדורה מהמטמון או
// קובץ latest.json שלא התחדש נראו בדיוק כמו חדשות הבוקר של היום. כשהמהדורה
// אינה של היום הלוגי, התאריך שלה יושב בכותרת המשנה.
// ---------------------------------------------------------------------------
import { NOW, edition, expect, makeState, openApp, test } from './helpers'

const onboarded = () => {
  const s = makeState()
  s.settings.onboarded = true
  return s
}

const card = (page: import('@playwright/test').Page) =>
  page.locator('.card', { hasText: 'חדשות הבוקר ·' })

test('מהדורה של אתמול מציגה את התאריך שלה; של היום — לא', async ({ page, errors }) => {
  errors.push(...(await openApp(page, { state: onboarded(), now: NOW, news: edition('2026-09-08') })))
  await expect(card(page)).toContainText('8 בספטמבר')

  errors.push(...(await openApp(page, { state: onboarded(), now: NOW, news: edition() })))
  await expect(card(page)).toContainText('9 סיפורים')
  await expect(card(page)).not.toContainText('בספטמבר ·')
  expect(errors).toEqual([])
})
