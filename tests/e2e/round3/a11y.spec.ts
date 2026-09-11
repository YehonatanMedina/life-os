// ---------------------------------------------------------------------------
// סבב 3 — נגישות: לכל אלמנט אינטראקטיבי גלוי יש שם נגיש, לכל דיאלוג יש
// aria-label, אין מזהים כפולים, ובניווט מסומן בדיוק יעד אחד. רץ בשני הפרופילים,
// על כל מסך ועל הגיליונות הראשיים.
// ---------------------------------------------------------------------------
import { test, expect } from '../desktop/desk'
import { a11yScan, go, round3Seed, TASK_A, taskRow, topSheet, type A11yReport } from './helpers'
import type { Page } from '@playwright/test'

test.use({ seed: round3Seed })

const findings: Record<string, A11yReport> = {}

async function scan(page: Page, name: string) {
  await page.waitForTimeout(150)
  const r = await a11yScan(page)
  findings[name] = r
  expect.soft(r.dupIds, `${name}: duplicate ids`).toEqual([])
  expect.soft(r.dialogsUnnamed, `${name}: dialogs without a name`).toEqual([])
  // בטלפון ההגדרות אינן בניווט התחתון — שם הסימון יושב על גלגל השיניים
  if (r.currentNav !== -1) expect.soft(r.currentNav + (r.gearCurrent ? 1 : 0), `${name}: exactly one aria-current nav item`).toBe(1)
  return r
}

async function closeSheet(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('.scrim')).toHaveCount(0)
}

test('כל מסך וכל גיליון: שמות נגישים, דיאלוגים עם שם, בלי מזהים כפולים', async ({ app }) => {
  test.setTimeout(90_000)
  const unnamed: Record<string, string[]> = {}
  const collect = (name: string, r: A11yReport) => {
    if (r.unnamed.length) unnamed[name] = r.unnamed
  }

  // -- היום + הגיליונות שלו
  collect('today', await scan(app, 'today'))
  await taskRow(app, TASK_A).locator('button.txt').click()
  await expect(topSheet(app)).toBeVisible()
  collect('today/task-sheet', await scan(app, 'today/task-sheet'))
  await closeSheet(app)
  await app.getByRole('button', { name: '+ רישום ידני' }).click()
  await expect(topSheet(app)).toBeVisible()
  collect('today/manual-sheet', await scan(app, 'today/manual-sheet'))
  await closeSheet(app)

  // -- אטלס
  await go(app, 'אטלס')
  collect('atlas', await scan(app, 'atlas'))

  // -- יומן: שלוש התצוגות + גיליון אירוע
  await go(app, 'יומן')
  for (const mode of ['יום', 'שבוע', 'חודש'] as const) {
    await app.getByRole('button', { name: mode, exact: true }).click()
    collect(`calendar/${mode}`, await scan(app, `calendar/${mode}`))
  }
  await app.getByRole('button', { name: '+ אירוע' }).click()
  await expect(app.getByRole('dialog', { name: 'אירוע חדש' })).toBeVisible()
  collect('calendar/event-sheet', await scan(app, 'calendar/event-sheet'))
  await closeSheet(app)

  // -- פרויקטים + גיליון מסלול
  await go(app, 'פרויקטים')
  collect('projects', await scan(app, 'projects'))
  await app.getByRole('button', { name: 'עריכת המסלול' }).click()
  await expect(app.getByRole('dialog', { name: 'עריכת מסלול' })).toBeVisible()
  collect('projects/track-sheet', await scan(app, 'projects/track-sheet'))
  await closeSheet(app)

  // -- סקירה
  await go(app, 'סקירה')
  collect('review', await scan(app, 'review'))

  // -- הגדרות + הגיליונות
  await go(app, 'הגדרות')
  collect('settings', await scan(app, 'settings'))
  await app.locator('.item.tappable', { hasText: 'שגרת בוקר' }).first().click()
  await expect(topSheet(app)).toBeVisible()
  collect('settings/first-sheet', await scan(app, 'settings/first-sheet'))
  await closeSheet(app)
  await app.locator('.item.tappable', { hasText: 'עבודה עמוקה — בוקר' }).first().click()
  await expect(app.getByRole('dialog', { name: 'בלוק קבוע' })).toBeVisible()
  collect('settings/rule-sheet', await scan(app, 'settings/rule-sheet'))
  await closeSheet(app)

  const report = Object.entries(unnamed).map(([k, v]) => `${k}:\n  ${v.join('\n  ')}`).join('\n')
  // פגמים ידועים (round3.md A11Y-1, A11Y-2): מתגי role=switch בלי aria-label, ושדות בתוך
  // Field (div role=group + span) שאינם מקושרים ל-label — הכותרת, ההערות, המטרה, הדקות.
  const known = /^(button\.switch\[role=switch\]|input\.input|textarea\.textarea|input\.ltr\.grow) @ sheet$/
  const unexpected = Object.entries(unnamed).flatMap(([k, v]) => v.filter((x) => !known.test(x)).map((x) => `${k}: ${x}`))
  expect(unexpected, `interactive elements without an accessible name:\n${report}`).toEqual([])
  const knownHits = Object.values(unnamed).flat().filter((x) => known.test(x))
  test.info().annotations.push({ type: 'known-defect', description: `unnamed role=switch buttons in sheets: ${knownHits.length}` })
})

test('מתגי role=switch בגיליון המשימה ובגיליון האירוע נושאים שם נגיש', async ({ app }) => {
  await taskRow(app, TASK_A).locator('button.txt').click()
  const sw = topSheet(app).locator('[role="switch"]')
  await expect(sw.first()).toBeVisible()
  for (const el of await sw.all()) await expect(el).toHaveAttribute('aria-label', /.+/)
})

test('שדה בתוך Field (כותרת המשימה, הערות) מקושר ל-label', async ({ app }) => {
  await taskRow(app, TASK_A).locator('button.txt').click()
  const r = await a11yScan(app)
  expect(r.unnamed.filter((x) => /input|textarea/.test(x))).toEqual([])
})
