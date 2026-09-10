// ---------------------------------------------------------------------------
// שלמות הפריסה בטלפון — כל מסך וכל גיליון.
// לכל מסך: אין גלילה אופקית, שום אלמנט לא יוצא מהמסך או מהכרטיס שלו,
// תוויות הניווט שלמות, הכרטיס האחרון נגמר מעל הסרגל, וגיליונות גוללים בפנים
// עם שורת פעולות שנשארת על המסך גם כשהמקלדת "פתוחה".
// ---------------------------------------------------------------------------
import {
  EVENING, KEYBOARD_VIEWPORT, VIEWPORT, atlasCache, edition, expect, fmt, lastContentAboveNav, layoutReport,
  nav, navLabelsReport, openApp, openSettings, richState, sheetReport, test,
} from './helpers'
import type { Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/mobile-${name}.png`, fullPage: true })

/** הבדיקה הבסיסית של כל מסך */
async function checkScreen(page: Page, name: string, root = 'body') {
  await page.waitForTimeout(250)
  const rep = await layoutReport(page, root)
  const bad = rep.scrollWidth > rep.screenWidth || rep.innerWidth > rep.screenWidth || rep.overflowX.length > 0 || rep.cardOverflow.length > 0
  if (bad) await shot(page, `layout-${name}`)
  expect.soft(rep.scrollWidth, `${name}: scrollWidth ${rep.scrollWidth} > screen width ${rep.screenWidth}`).toBeLessThanOrEqual(rep.screenWidth)
  expect.soft(rep.innerWidth, `${name}: layout viewport expanded to ${rep.innerWidth}px (page zoomed out on the phone)`).toBeLessThanOrEqual(rep.screenWidth)
  expect.soft(rep.overflowX, `${name}: elements outside the viewport\n${fmt(rep.overflowX)}`).toEqual([])
  expect.soft(rep.cardOverflow, `${name}: elements outside their card\n${fmt(rep.cardOverflow)}`).toEqual([])
  return rep
}

test.describe('פריסה — מסכים', () => {
  test('היום: גלישה, כרטיסים, ניווט, תחתית', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState(), news: edition(), atlas: atlasCache(4) })))
    await expect(page.getByText('הלו״ז של היום')).toBeVisible()
    await expect(page.getByText('חדשות הבוקר ·', { exact: false })).toBeVisible()
    await checkScreen(page, 'today')

    const labels = await navLabelsReport(page)
    expect(labels.map((l) => l.text)).toEqual(['היום', 'אטלס', 'יומן', 'פרויקטים', 'סקירה'])
    for (const l of labels) {
      expect.soft(l.inside, `nav label «${l.text}» outside its button ${fmt(l)}`).toBe(true)
      expect.soft(l.clipped, `nav label «${l.text}» clipped ${fmt(l)}`).toBe(false)
    }

    const bottom = await lastContentAboveNav(page)
    expect.soft(bottom.lastBottom, `last content (${bottom.last}) bottom ${bottom.lastBottom} vs nav top ${bottom.navTop}`).toBeLessThanOrEqual(bottom.navTop)

    // כרטיס החדשות פתוח על כל הכתבות + הערה
    await page.getByRole('button', { name: 'פתח את כל הכתבות' }).click()
    await page.getByRole('button', { name: /^(✍️ )?הערה למהדורה$/ }).click()
    await checkScreen(page, 'today-news-open')
    expect(errors).toEqual([])
  })

  test('אטלס: שיחה ארוכה, המלחין לא נבלע מתחת לסרגל', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState(), atlas: atlasCache(14) })))
    await nav(page, 'אטלס')
    await expect(page.locator('.bubble').first()).toBeVisible()
    await checkScreen(page, 'atlas')
    // המלחין (composer) חייב להיות נגיש: בתוך המסך ומעל סרגל הניווט
    const pos = await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const c = document.querySelector('.composer')!.getBoundingClientRect()
      const n = document.querySelector('.bottomnav')!.getBoundingClientRect()
      const ta = document.querySelector('.composer .textarea')!.getBoundingClientRect()
      const mid = document.elementFromPoint(ta.left + ta.width / 2, ta.top + ta.height / 2)
      return {
        composer: { top: Math.round(c.top), bottom: Math.round(c.bottom) },
        navTop: Math.round(n.top),
        innerHeight: window.innerHeight,
        textareaHitBy: mid ? mid.tagName + '.' + mid.className : null,
        docScrolls: document.documentElement.scrollHeight > window.innerHeight,
      }
    })
    if (pos.composer.bottom > pos.navTop + 1) await shot(page, 'atlas-composer-under-nav')
    expect.soft(pos.composer.bottom, `composer bottom ${pos.composer.bottom} is below nav top ${pos.navTop} — ${fmt(pos)}`).toBeLessThanOrEqual(pos.navTop + 1)
    expect.soft(pos.textareaHitBy, `textarea covered by ${pos.textareaHitBy}`).toMatch(/TEXTAREA/)
    expect(errors).toEqual([])
  })

  test('יומן: יום / שבוע / חודש', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'יומן')
    await expect(page.locator('.wk')).toBeVisible()
    await checkScreen(page, 'calendar-day')
    await page.getByRole('button', { name: 'שבוע', exact: true }).click()
    await expect(page.locator('.wk-col')).toHaveCount(7)
    await checkScreen(page, 'calendar-week')
    // גוף הרשת גולל בפנים ולא מותח את הדף
    const wk = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('.wk-body')!
      return { overflowY: getComputedStyle(b).overflowY, sh: b.scrollHeight, ch: b.clientHeight, maxH: getComputedStyle(b).maxHeight }
    })
    expect.soft(wk.overflowY).toBe('auto')
    expect.soft(wk.sh, `week body should scroll internally ${fmt(wk)}`).toBeGreaterThan(wk.ch)
    await page.getByRole('button', { name: 'חודש', exact: true }).click()
    await expect(page.locator('.cal-cell')).toHaveCount(42)
    await checkScreen(page, 'calendar-month')
    const bottom = await lastContentAboveNav(page)
    expect.soft(bottom.lastBottom).toBeLessThanOrEqual(bottom.navTop)
    expect(errors).toEqual([])
  })

  test('פרויקטים: קנבן, מסלול בודד והכל', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'פרויקטים')
    await expect(page.locator('.kanban')).toBeVisible()
    await checkScreen(page, 'projects-track')
    await page.getByRole('button', { name: 'הכל', exact: true }).click()
    await expect(page.locator('.kcard').first()).toBeVisible()
    await checkScreen(page, 'projects-all')
    const bottom = await lastContentAboveNav(page)
    expect.soft(bottom.lastBottom).toBeLessThanOrEqual(bottom.navTop)
    expect(errors).toEqual([])
  })

  test('סקירה + המעבר השבועי בכל שלב', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'סקירה')
    await expect(page.getByText('שעות עבודה לאורך הזמן')).toBeVisible()
    await checkScreen(page, 'review')
    const bottom = await lastContentAboveNav(page)
    expect.soft(bottom.lastBottom).toBeLessThanOrEqual(bottom.navTop)

    // המעבר של השבוע שהסתיים (יש סשן בשבוע שעבר → "סגירת השבוע שהסתיים")
    await page.getByText('סגירת השבוע שהסתיים').click()
    const flow = page.locator('.flow')
    await expect(flow).toBeVisible()
    const box = await flow.boundingBox()
    expect(box).toEqual(expect.objectContaining({ x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }))
    for (let step = 0; step < 6; step++) {
      await checkScreen(page, `flow-step-${step}`, '.flow')
      // גוף השלב גולל בפנים, הראש והרגל קבועים
      const foot = await page.locator('.flow-foot').boundingBox()
      expect.soft(foot!.y + foot!.height, `flow foot must sit at the bottom of the screen on step ${step}`).toBeLessThanOrEqual(VIEWPORT.height + 1)
      if (step === 2) {
        await page.locator('.qcard textarea').first().fill('סיימתי את הפרק')
        await page.locator('.scorebar button', { hasText: '7' }).click()
      }
      if (step < 5) await page.getByRole('button', { name: 'הבא ←' }).click()
    }
    await expect(page.getByText('השבוע הבא, בשורה אחת')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('הגדרות: הדף וכל הגיליונות', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await openSettings(page)
    await expect(page.getByText('מבנה השבוע הקבוע')).toBeVisible()
    await checkScreen(page, 'settings')
    const bottom = await lastContentAboveNav(page)
    expect.soft(bottom.lastBottom).toBeLessThanOrEqual(bottom.navTop)
    await page.evaluate(() => window.scrollTo(0, 0))

    // בלוק קבוע — שבועי
    await page.getByText('עבודה עמוקה — בוקר', { exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'בלוק קבוע' })).toBeVisible()
    await checkSheet(page, 'rule-weekly')
    // חודשי
    await page.getByRole('button', { name: 'כל חודש' }).click()
    await expect(page.getByText('ביום בחודש')).toBeVisible()
    await checkSheet(page, 'rule-monthly')
    await page.getByRole('button', { name: 'ביטול' }).click()

    // הרגל
    await page.locator('.card', { hasText: 'הרגלים יומיים' }).getByText('שגרת ערב').click()
    await expect(page.getByRole('dialog', { name: 'הרגל יומי' })).toBeVisible()
    await checkSheet(page, 'habit')
    await page.getByRole('button', { name: 'ביטול' }).click()

    // פריט שבועי
    await page.locator('.card', { hasText: 'אסימונים שבועיים' }).getByText('החלפת מצעים').click()
    await expect(page.getByRole('dialog', { name: 'אסימון שבועי' })).toBeVisible()
    await page.getByRole('button', { name: 'מד התקדמות' }).click()
    await checkSheet(page, 'weekly')
    await page.getByRole('button', { name: 'ביטול' }).click()
    expect(errors).toEqual([])
  })

  test('גיליונות מהיום: משימה, רישום ידני, תכנון מחר, שלבי התקופה', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState(), now: EVENING })))
    // משימה
    await page.getByText('לקרוא את פרק 3 בספר הלימוד').click()
    await expect(page.getByRole('dialog', { name: 'משימה' })).toBeVisible()
    await checkSheet(page, 'task')
    await page.getByRole('button', { name: 'ביטול' }).click()
    // רישום ידני
    await page.getByRole('button', { name: '+ רישום ידני' }).click()
    await expect(page.getByRole('dialog', { name: 'רישום ידני של עבודה' })).toBeVisible()
    await checkSheet(page, 'manual')
    await page.locator('.sheet').last().getByRole('button', { name: 'סגירה' }).click()
    // תכנון מחר (בערב הכפתור בכרטיס המשימות)
    await page.getByRole('button', { name: /^(🌙 )?תכנון מחר$/ }).click()
    await expect(page.getByRole('dialog', { name: 'תכנון מחר' })).toBeVisible()
    await checkSheet(page, 'plan-tomorrow')
    await page.getByRole('button', { name: /^סגור/ }).click()
    // שלבי התקופה
    await page.locator('.truncate', { hasText: 'ספרינט לפני המבחנים' }).click()
    await expect(page.getByRole('dialog', { name: 'השלבים של התקופה' })).toBeVisible()
    await checkSheet(page, 'phases')
    expect(errors).toEqual([])
  })

  test('גיליונות מהיומן ומהפרויקטים: אירוע, מסלול', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await nav(page, 'יומן')
    await page.getByRole('button', { name: '+ אירוע' }).click()
    await expect(page.getByRole('dialog', { name: 'אירוע חדש' })).toBeVisible()
    await checkSheet(page, 'event-new')
    // בורר שעה בתוך הגיליון
    await page.locator('.field', { hasText: 'התחלה' }).locator('button.input').click()
    await expect(page.getByRole('dialog', { name: 'בחירת שעה' })).toBeVisible()
    await checkSheet(page, 'time-picker')
    await page.getByRole('button', { name: 'אישור' }).click()
    // בורר תאריך
    await page.locator('.field', { hasText: 'תאריך' }).first().locator('button.input').click()
    await expect(page.getByRole('dialog', { name: 'בחירת תאריך' })).toBeVisible()
    await checkSheet(page, 'date-picker')
    await page.getByRole('button', { name: 'סגירה' }).last().click()
    await page.getByRole('button', { name: 'ביטול' }).click()

    await nav(page, 'פרויקטים')
    await page.getByRole('button', { name: '+ מסלול' }).click()
    await expect(page.getByRole('dialog', { name: 'מסלול חדש' })).toBeVisible()
    await checkSheet(page, 'track')
    expect(errors).toEqual([])
  })

  test('אימונים: רישום, התוכנית, התקדמות — מסכים מלאים', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await page.getByRole('button', { name: 'פתיחת האימון' }).click()
    await expect(page.getByRole('dialog', { name: 'אימון' })).toBeVisible()
    await page.locator('.setchip').first().click()
    await expect(page.locator('.set-edit')).toBeVisible()
    await checkScreen(page, 'workout-log', '.flow')
    await page.locator('.flow-head').getByRole('button', { name: /^(✎ )?עריכה$/ }).click()
    await checkScreen(page, 'workout-edit', '.flow')
    await page.locator('.flow-foot').getByRole('button', { name: 'סגירה' }).click()

    await page.getByRole('button', { name: 'התוכנית' }).click()
    await expect(page.getByRole('dialog', { name: 'תוכנית האימונים' })).toBeVisible()
    await page.locator('.flow').getByText('חזה וכתפיים').click()
    await expect(page.getByText('התרגילים של יום רביעי')).toBeVisible()
    await checkScreen(page, 'workout-plan', '.flow')
    await page.getByRole('button', { name: 'סיום' }).click()

    await page.getByRole('button', { name: 'התקדמות' }).click()
    await expect(page.getByRole('dialog', { name: 'התקדמות' })).toBeVisible()
    await page.locator('.flow').getByText('לחיצת חזה').click()
    await checkScreen(page, 'progress-strength', '.flow')
    await page.locator('.flow-head').getByRole('button', { name: 'ריצה', exact: true }).click()
    await expect(page.getByText('קילומטרים בשבוע')).toBeVisible()
    await checkScreen(page, 'progress-run', '.flow')
    expect(errors).toEqual([])
  })

  test('מצב מיקוד ממלא את המסך', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await page.locator('.tag', { hasText: 'לימודים' }).first().click()
    await expect(page.locator('.timer-time')).toBeVisible()
    await page.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    const focus = page.locator('.focus')
    await expect(focus).toBeVisible()
    const box = await focus.boundingBox()
    expect(box).toEqual({ x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height })
    await checkScreen(page, 'focus', '.focus')
    const time = await page.locator('.focus-time').boundingBox()
    expect(time!.x).toBeGreaterThanOrEqual(0)
    expect(time!.x + time!.width).toBeLessThanOrEqual(VIEWPORT.width)
    expect(errors).toEqual([])
  })
})

/**
 * גיליון: בודק פריסה, שהוא גולל בפנים (אם יש מה לגלול), ושכשמתמקדים בשדה
 * והמסך מתקצר (המקלדת) — שורת הפעולות והשדה עדיין נראים.
 */
async function checkSheet(page: Page, name: string) {
  await page.waitForTimeout(250)
  const rep = await layoutReport(page, '.scrim')
  if (rep.overflowX.length || rep.cardOverflow.length) await shot(page, `sheet-${name}`)
  expect.soft(rep.overflowX, `${name}: sheet content outside the viewport\n${fmt(rep.overflowX)}`).toEqual([])
  expect.soft(rep.cardOverflow, `${name}: sheet content outside its card\n${fmt(rep.cardOverflow)}`).toEqual([])
  const before = await sheetReport(page)
  expect.soft(before?.overflowY, `${name}: sheet should scroll internally`).toBe('auto')
  // הדף מאחור נעול
  const locked = await page.evaluate(() => document.documentElement.style.overflow)
  expect.soft(locked, `${name}: page behind the sheet must be locked`).toBe('hidden')

  // "מקלדת": מתמקדים בשדה הראשון ומקצרים את המסך
  const input = page.locator('.sheet').last().locator('input:not(.sr), textarea').first()
  if ((await input.count()) > 0) {
    await input.focus()
    await page.setViewportSize(KEYBOARD_VIEWPORT)
    await page.waitForTimeout(200)
    const kb = await sheetReport(page)
    if (kb?.actions && !kb.actions.visible) await page.screenshot({ path: `test-results/mobile-sheet-${name}-keyboard.png` })
    if (kb?.actions) expect.soft(kb.actions.visible, `${name}: sticky actions off-screen with keyboard open ${fmt(kb)}`).toBe(true)
    expect.soft(kb?.focused?.visible, `${name}: focused field hidden with keyboard open ${fmt(kb)}`).toBe(true)
    // הגיליון עצמו גולל
    if (kb && kb.scrolls) {
      const moved = await page.evaluate(() => {
        const sh = Array.from(document.querySelectorAll<HTMLElement>('.sheet')).pop()!
        const y0 = sh.scrollTop
        sh.scrollTop = y0 + 120
        return sh.scrollTop !== y0
      })
      expect.soft(moved, `${name}: sheet did not scroll internally`).toBe(true)
    }
    await page.setViewportSize(VIEWPORT)
    await page.waitForTimeout(150)
  }
}
