import { test, expect } from './fixtures'

// עשן: האפליקציה עולה, הניווט קיים, ואין שגיאות קונסול
test('האפליקציה נטענת עם שישה יעדים בניווט', async ({ app }) => {
  await expect(app.getByRole('button', { name: 'שיחה' }).first()).toBeVisible()
  const labels = ['היום', 'שיחה', 'יומן', 'אימונים', 'פרויקטים', 'סקירה']
  for (const l of labels) await expect(app.getByRole('button', { name: l, exact: true }).first()).toBeVisible()
})
