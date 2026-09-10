import { test, expect } from './fixtures'

// עשן: האפליקציה עולה, הניווט קיים, ואין שגיאות קונסול
test('האפליקציה נטענת עם חמישה יעדים בניווט', async ({ app }) => {
  await expect(app.getByRole('button', { name: 'אטלס' }).first()).toBeVisible()
  const labels = ['היום', 'אטלס', 'יומן', 'פרויקטים', 'סקירה']
  for (const l of labels) await expect(app.getByRole('button', { name: l, exact: true }).first()).toBeVisible()
})
