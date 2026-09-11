// ---------------------------------------------------------------------------
// סבב 3 — פרויקטים: תתי־משימות (הוספה, סימון, שמירה, שרידות רענון), העברת
// משימה בין מסלולים (הבורר, המונים ומסך היום עוקבים), וקידום שלב בכפתור
// (הדרך היחידה בטלפון, שם אין גרירה). שני הפרופילים.
// ---------------------------------------------------------------------------
import { test, expect, readState, reload, live } from '../desktop/desk'
import { TASK_A, go, round3Seed, taskRow, topSheet } from './helpers'
import type { Task } from '../../../src/types'

test.use({ seed: round3Seed })

const card = (page: import('@playwright/test').Page, title: string) => page.locator('.kcard', { hasText: title })

test('תתי־משימות: שתיים נוספות, אחת מסומנת, הכרטיס מציג 1/2 גם אחרי רענון', async ({ app }) => {
  await go(app, 'פרויקטים')
  await card(app, TASK_A).click()
  const sheet = app.getByRole('dialog', { name: 'משימה' })
  await expect(sheet).toBeVisible()
  const sub = sheet.getByPlaceholder('+ תת־משימה')
  await sub.fill('לקרוא את החצי הראשון')
  await sub.press('Enter')
  await sub.fill('לסכם')
  await sub.press('Enter')
  await expect(sub).toHaveValue('')
  await sheet.locator('.item', { hasText: 'לקרוא את החצי הראשון' }).getByRole('button', { name: 'סמן כבוצע' }).click()
  await sheet.getByRole('button', { name: 'שמירה' }).click()
  await expect(sheet).toBeHidden()
  await expect(card(app, TASK_A).locator('.chip', { hasText: '1/2' })).toBeVisible()

  await reload(app)
  await go(app, 'פרויקטים')
  await expect(card(app, TASK_A).locator('.chip', { hasText: '1/2' })).toBeVisible()
  const st = await readState(app)
  const t = live<Task>(st.tasks).find((x) => x.title === TASK_A)!
  expect(t.sub?.map((x) => [x.text, x.done])).toEqual([['לקרוא את החצי הראשון', true], ['לסכם', false]])

  // ביטול (סגירה בלי שמירה) לא משנה כלום
  await card(app, TASK_A).click()
  await sheet.getByPlaceholder('+ תת־משימה').fill('לא יישמר')
  await sheet.getByPlaceholder('+ תת־משימה').press('Enter')
  await sheet.getByRole('button', { name: 'ביטול' }).click()
  await expect(card(app, TASK_A).locator('.chip', { hasText: '1/2' })).toBeVisible()
})

test('העברת משימה למסלול אחר: המונה בבורר, הלוח של שני המסלולים, ושורת המשימה ב"היום"', async ({ app }) => {
  await go(app, 'פרויקטים')
  const countOf = async (name: string) => {
    const tag = app.locator('.tag', { hasText: name }).first()
    const txt = (await tag.textContent()) ?? ''
    const m = txt.match(/(\d+)/)
    return m ? Number(m[1]) : 0
  }
  const studyBefore = await countOf('לימודים')
  const lifeBefore = await countOf('חיים')
  await card(app, TASK_A).click()
  const sheet = app.getByRole('dialog', { name: 'משימה' })
  await sheet.locator('.tag', { hasText: 'חיים' }).click()
  await sheet.getByRole('button', { name: 'שמירה' }).click()
  await expect(sheet).toBeHidden()
  await expect(card(app, TASK_A)).toHaveCount(0)
  expect(await countOf('לימודים')).toBe(studyBefore - 1)
  expect(await countOf('חיים')).toBe(lifeBefore + 1)
  await app.locator('.tag', { hasText: 'חיים' }).first().click()
  await expect(card(app, TASK_A)).toBeVisible()

  await go(app, 'היום')
  await expect(taskRow(app, TASK_A).locator('.sub2')).toContainText('חיים')
})

test('"העבר לשלב הבא" מקדם לביצוע → בתהליך → ממתין → לביצוע, ו-✓ משלים; "היום" מציג את ההשלמה', async ({ app }) => {
  await go(app, 'פרויקטים')
  const col = (label: string) => app.locator('.kcol', { has: app.locator('h4', { hasText: label }) })
  await expect(col('לביצוע').locator('.kcard', { hasText: TASK_A })).toBeVisible()
  const next = () => card(app, TASK_A).getByRole('button', { name: 'העבר לשלב הבא' }).click()
  await next()
  await expect(col('בתהליך').locator('.kcard', { hasText: TASK_A })).toBeVisible()
  await next()
  await expect(col('ממתין').locator('.kcard', { hasText: TASK_A })).toBeVisible()
  await next()
  await expect(col('לביצוע').locator('.kcard', { hasText: TASK_A })).toBeVisible()
  await card(app, TASK_A).getByRole('button', { name: 'סמן כהושלם' }).click()
  await expect(col('הושלם').locator('.kcard', { hasText: TASK_A })).toBeVisible()
  const st = await readState(app)
  const t = live<Task>(st.tasks).find((x) => x.title === TASK_A)!
  expect(t.status).toBe('done')
  expect(typeof t.doneAt).toBe('number')

  // ב"היום" משימה שהושלמה יורדת מהרשימה הפתוחה; השנייה נשארת
  await go(app, 'היום')
  await expect(taskRow(app, TASK_A)).toHaveCount(0)
  await expect(taskRow(app, 'לכתוב סיכום למאמר')).toBeVisible()
})
