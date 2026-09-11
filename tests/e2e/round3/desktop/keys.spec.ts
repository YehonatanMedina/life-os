// ---------------------------------------------------------------------------
// סבב 3 — מקלדת: מחסנית Escape (גיליון + אישור מקונן), כליאת מיקוד בתוך גיליון,
// קיצורי הניווט מאחורי מצב מיקוד, ו-Enter בהוספה מהירה עם קלט ריק.
// ---------------------------------------------------------------------------
import { test, expect, readState } from '../../desktop/desk'
import { TASK_A, round3Seed, taskRow, timerCard } from '../helpers'

test.use({ seed: round3Seed })

test('Escape סוגר רק את האישור המקונן, ואז את הגיליון; Escape שלישי לא משנה מסך', async ({ app }) => {
  await taskRow(app, TASK_A).locator('button.txt').click()
  const sheet = app.getByRole('dialog', { name: 'משימה' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'מחיקה' }).click()
  const confirm = app.getByRole('dialog', { name: 'למחוק את המשימה?' })
  await expect(confirm).toBeVisible()
  await expect(app.locator('[role="dialog"]')).toHaveCount(2)
  await app.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(sheet).toBeVisible()
  await app.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(app.locator('.scrim')).toHaveCount(0)
  await app.keyboard.press('Escape')
  await expect(app.locator('nav.sidebar button[aria-current="true"]')).toHaveText('היום')
  // המשימה לא נמחקה
  expect((await readState(app)).tasks.find((t: any) => t.title === TASK_A).deleted).toBeFalsy()
})

test('Tab בתוך גיליון פתוח לא בורח לדף שמאחור', async ({ app }) => {
  await taskRow(app, TASK_A).locator('button.txt').click()
  const sheet = app.getByRole('dialog', { name: 'משימה' })
  await expect(sheet).toBeVisible()
  const escaped: string[] = []
  for (let i = 0; i < 40; i++) {
    await app.keyboard.press('Tab')
    const where = await app.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      if (!a || a === document.body) return 'body'
      return a.closest('.sheet') ? 'sheet' : `${a.tagName.toLowerCase()} "${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 20)}"`
    })
    if (where !== 'sheet') escaped.push(`Tab#${i + 1} → ${where}`)
  }
  expect(escaped, 'focus left the open dialog').toEqual([])
})

test('קיצור ניווט במצב מיקוד לא מחליף את המסך שמאחוריו', async ({ app }) => {
  await timerCard(app).locator('.tag', { hasText: 'לימודים' }).click()
  await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
  const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
  await expect(focus).toBeVisible()
  await app.keyboard.press('3')
  await expect(app.locator('nav.sidebar button[aria-current="true"]')).toHaveText('היום')
  await app.keyboard.press('Escape')
  await expect(focus).toBeHidden()
  await expect(app.locator('nav.sidebar button[aria-current="true"]')).toHaveText('היום')
})

test('Enter בהוספה מהירה עם קלט ריק או רווחים לא יוצר משימה', async ({ app }) => {
  const before = (await readState(app)).tasks.length
  const input = app.getByPlaceholder('משימה מהירה להיום…')
  await input.press('Enter')
  await input.fill('   ')
  await input.press('Enter')
  await app.waitForTimeout(400)
  expect((await readState(app)).tasks.length).toBe(before)
  await input.fill('  משימה עם רווחים  ')
  await input.press('Enter')
  await expect(taskRow(app, 'משימה עם רווחים')).toBeVisible()
  const t = (await readState(app)).tasks.find((x: any) => x.title.includes('משימה עם רווחים'))
  expect(t.title).toBe('משימה עם רווחים')
})
