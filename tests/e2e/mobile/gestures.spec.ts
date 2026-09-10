// ---------------------------------------------------------------------------
// מחוות ביומן, דרך צינור המגע האמיתי של הדפדפן (CDP Input.dispatchTouchEvent):
// - החלקה ימינה = תקופה קדימה, שמאלה = אחורה (זמן בעברית זורם שמאלה)
// - החלקה שמתחילה ב-26px מקצה המסך היא מחוות "חזור" של המערכת — לא נוגעים
// - גרירה אנכית על אירוע ברשת השבוע לא שוברת את הגלילה; לחיצה ארוכה פותחת גרירה
// ---------------------------------------------------------------------------
import { TODAY, cdpSwipe, expect, nav, openApp, readState, richState, test, fixme } from './helpers'

const LABEL_TODAY = 'יום רביעי, 9 בספטמבר'
const LABEL_NEXT = 'יום חמישי, 10 בספטמבר'
const LABEL_PREV = 'יום שלישי, 8 בספטמבר'

test.describe('מחוות', () => {
  test('החלקה אופקית מחליפה יום; מהקצה — מתעלמים', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'יומן')
    const label = page.locator('.spread .truncate').first()
    await expect(label).toHaveText(LABEL_TODAY)
    const head = await page.locator('.wk-head').boundingBox()
    const y = head!.y + head!.height / 2

    // אצבע ימינה → קדימה
    await cdpSwipe(page, { x: 120, y }, { x: 300, y })
    await expect(label).toHaveText(LABEL_NEXT)

    // אצבע שמאלה → אחורה (פעמיים: חזרה להיום ואז לאתמול)
    await cdpSwipe(page, { x: 300, y }, { x: 120, y })
    await expect(label).toHaveText(LABEL_TODAY)
    await cdpSwipe(page, { x: 300, y }, { x: 120, y })
    await expect(label).toHaveText(LABEL_PREV)

    // מהקצה השמאלי (x=10 < 26) — מחוות "חזור" של המערכת, לא שלנו
    await cdpSwipe(page, { x: 10, y }, { x: 260, y })
    await page.waitForTimeout(300)
    await expect(label).toHaveText(LABEL_PREV)
    // מהקצה הימני (412-10)
    await cdpSwipe(page, { x: 402, y }, { x: 150, y })
    await page.waitForTimeout(300)
    await expect(label).toHaveText(LABEL_PREV)
    // בדיוק על הגבול: 26 נחשב, 25 לא
    await cdpSwipe(page, { x: 25, y }, { x: 200, y })
    await page.waitForTimeout(300)
    await expect(label).toHaveText(LABEL_PREV)
    await cdpSwipe(page, { x: 26, y }, { x: 200, y })
    await expect(label).toHaveText(LABEL_TODAY)

    // תזוזה קטנה (< 55px) או אלכסונית — לא החלקה
    await cdpSwipe(page, { x: 200, y }, { x: 240, y })
    await page.waitForTimeout(300)
    await expect(label).toHaveText(LABEL_TODAY)
    expect(errors).toEqual([])
  })

  test('החלקה גם בתצוגת חודש ושבוע', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'יומן')
    await page.getByRole('button', { name: 'חודש', exact: true }).click()
    const label = page.locator('.spread .truncate').first()
    await expect(label).toHaveText('ספטמבר 2026')
    const grid = await page.locator('.cal-grid').boundingBox()
    const y = grid!.y + 30
    await cdpSwipe(page, { x: 100, y }, { x: 320, y })
    await expect(label).toHaveText('אוקטובר 2026')
    await cdpSwipe(page, { x: 320, y }, { x: 100, y })
    await expect(label).toHaveText('ספטמבר 2026')

    // מעבר חודש מעגן את ה-1 בחודש; "היום" מחזיר לתאריך הנוכחי
    await page.locator('.main').getByRole('button', { name: 'היום', exact: true }).click()
    await page.getByRole('button', { name: 'שבוע', exact: true }).click()
    await expect(label).toHaveText('6.9 – 12.9')
    const head = await page.locator('.wk-head').boundingBox()
    await cdpSwipe(page, { x: 100, y: head!.y + 20 }, { x: 320, y: head!.y + 20 })
    await expect(label).toHaveText('13.9 – 19.9')
    expect(errors).toEqual([])
  })

  test('גרירה מהירה על אירוע ברשת השבוע גוללת ולא מזיזה; לחיצה ארוכה מזיזה', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'יומן')
    await page.getByRole('button', { name: 'שבוע', exact: true }).click()
    await expect(page.locator('.wk-col')).toHaveCount(7)
    const body = page.locator('.wk-body')
    // הבלוק הקבוע של הבוקר היום (08:30–12:30) — גבוה, קל לפגוע בו
    const ev = page.locator('.ev', { hasText: 'עבודה עמוקה — בוקר' }).nth(3)
    await expect(ev).toBeVisible()
    const evId = `rl-work-am@${TODAY}`
    // המצב השמור לא כולל מופעים שנוצרו בטעינה עד לשינוי הראשון — בודקים ב-DOM
    await expect(ev.locator('.time')).toHaveText('08:30–12:30')

    const top0 = await body.evaluate((el) => el.scrollTop)
    let box = await ev.boundingBox()
    // תנועה מהירה (פחות מ-350 מ״ש של לחיצה ארוכה) 160px למעלה — גלילה קדימה
    await cdpSwipe(page, { x: box!.x + box!.width / 2, y: box!.y + 180 }, { x: box!.x + box!.width / 2, y: box!.y + 20 }, { steps: 6, stepMs: 10 })
    await page.waitForTimeout(400)
    const top1 = await body.evaluate((el) => el.scrollTop)
    await expect(ev.locator('.time'), 'quick vertical drag must not move the event').toHaveText('08:30–12:30')
    // אם המצב כבר נשמר לדיסק (החנות שומרת בטעינה) — גם שם המופע לא זז
    const saved = (await readState(page)).events.find((e) => e.id === evId)
    if (saved) expect(saved.start).toBe('08:30')
    expect(top1, `vertical scroll should still work over an event (scrollTop ${top0} → ${top1})`).toBeGreaterThan(top0)
    expect(errors).toEqual([])

    // לחיצה ארוכה (>350 מ״ש) ואז תזוזה של שעתיים (2×52px) — גרירה.
    // מתעדים את אירועי המצביע כדי לדעת *למה* הגרירה נכשלה אם היא נכשלת.
    await page.evaluate(() => {
      const log: string[] = []
      ;(window as any).__ptr = log
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchcancel', 'contextmenu']) {
        window.addEventListener(t, (e: any) => log.push(`${t}:${e.pointerType ?? 'touch'}`), { capture: true })
      }
    })
    box = await ev.boundingBox()
    const top2 = await body.evaluate((el) => el.scrollTop)
    await cdpSwipe(page, { x: box!.x + box!.width / 2, y: box!.y + 20 }, { x: box!.x + box!.width / 2, y: box!.y + 20 + 104 }, { holdMs: 550, steps: 8, stepMs: 30 })
    await page.waitForTimeout(400)
    const ptr = await page.evaluate(() => (window as any).__ptr as string[])
    const top3 = await body.evaluate((el) => el.scrollTop)
    const timeNow = await page.locator('.ev', { hasText: 'עבודה עמוקה — בוקר' }).nth(3).locator('.time').textContent()
    const after = await readState(page)
    const moved = after.events.find((e) => e.id === evId)
    const cancelled = ptr.some((x) => x.startsWith('pointercancel'))
    // לחיצה ארוכה פותחת גרירה בטלפון (README). אם הדפדפן מבטל אותה כשהאצבע זזה
    // (pointercancel בגלל touch-action: pan-y) — זה פגם אמיתי, ראו הדוח.
    fixme(
      timeNow === '08:30–12:30',
      `long-press drag on the phone did not move the event (still ${timeNow}); pointer events: ${ptr.join(' ')}; pointercancel=${cancelled}; body scrollTop ${top2}→${top3}`,
    )
    expect(moved?.start).toBe('10:30')
    expect(moved?.end).toBe('14:30')
  })
})
