// ---------------------------------------------------------------------------
// טיפוגרפיה בטלפון:
// - גופן הגיבוי כשגוגל פונטס חסום: אין טקסט בלתי נראה, ואין חסימת ציור
// - מספרים ב-.ltr לא מתהפכים ("08:30–12:30", "15.9")
// - עברית עם מספרים בסוף לא מאבדת את המספר בחיתוך (truncate)
// ---------------------------------------------------------------------------
import { clippedDigitsReport, expect, fmt, ltrOrderReport, nav, openApp, openSettings, richState, test } from './helpers'

test.describe('טיפוגרפיה', () => {
  test('גוגל פונטס חסום → גופן גיבוי, טקסט נראה, בלי FOIT', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    const info = await page.evaluate(async () => {
      await (document as any).fonts.ready
      const body = getComputedStyle(document.body).fontFamily
      const num = getComputedStyle(document.querySelector('.ring-wrap .n')!).fontFamily
      const faces = (document as any).fonts.size
      const loading = [...(document as any).fonts].filter((f: any) => f.status === 'loading').length
      const label = document.querySelector('.bottomnav button')!
      const r = label.getBoundingClientRect()
      return { body, num, faces, loading, status: (document as any).fonts.status, labelW: r.width, labelH: r.height }
    })
    expect(info.body.startsWith("'IBM Plex Sans Hebrew'") || info.body.startsWith('"IBM Plex Sans Hebrew"') || info.body.startsWith('IBM Plex Sans Hebrew')).toBe(true)
    expect(info.body).toContain('sans-serif')
    expect(info.num).toContain('monospace')
    // ה-CSS של גוגל ריק → אין @font-face בכלל → הטקסט מצויר מיד בגופן המערכת
    expect(info.faces).toBe(0)
    expect(info.loading).toBe(0)
    expect(info.status).toBe('loaded')
    expect(info.labelW).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('גיליון סגנון חיצוני איטי לא אמור לחסום את הציור הראשון', async ({ page, errors }) => {
    // גוגל פונטס עונה אחרי 3 שניות. הדף אמור לצייר את המעטפת לפני כן.
    const t0 = Date.now()
    errors.push(...(await openApp(page, { state: richState(), fontsDelayMs: 3000, goto: false })))
    await page.goto('/', { waitUntil: 'commit' })
    await page.waitForTimeout(1500)
    // מה רואים אחרי שנייה וחצי? (צילום לדוח)
    await page.screenshot({ path: 'test-results/mobile-fonts-slow-css-1500ms.png' })
    const at1500 = await page.evaluate(() => ({
      mounted: !!document.querySelector('.bottomnav'),
      painted: performance.getEntriesByType('paint').length > 0,
    }))
    await page.waitForFunction(() => performance.getEntriesByType('paint').some((p) => p.name === 'first-contentful-paint'), null, { timeout: 15000 })
    const loadMs = Date.now() - t0
    const paint = await page.evaluate(() => {
      const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
      const css = performance.getEntriesByType('resource').find((r) => r.name.includes('fonts.googleapis.com')) as PerformanceResourceTiming | undefined
      return { fcp: fcp ? Math.round(fcp.startTime) : null, cssEnd: css ? Math.round(css.responseEnd) : null }
    })
    await expect(page.locator('.bottomnav button')).toHaveCount(5)
    expect(errors).toEqual([])
    const blocked = !at1500.painted || (paint.fcp !== null && paint.fcp >= 2500)
    test.fixme(blocked, `render-blocking <link rel=stylesheet> to fonts.googleapis.com: nothing painted at 1500ms (React mounted: ${at1500.mounted}); FCP at ${paint.fcp}ms, CSS answered at ${paint.cssEnd}ms — see report`)
    expect(paint.fcp, fmt({ ...paint, at1500, loadMs })).toBeLessThan(2500)
  })

  test('מספרים ב-.ltr בסדר לוגי: היום, יומן, הגדרות', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    // היום — לו״ז ("08:30–12:30"), תזכורות ("12.9"), טבעת ("0.5 / 42")
    await expect(page.getByText('הלו״ז של היום')).toBeVisible()
    let r = await ltrOrderReport(page)
    expect(r.checked).toBeGreaterThan(5)
    expect(r.bad, `today: mirrored digits\n${fmt(r.bad)}`).toEqual([])
    const sched = await page.locator('.item .sub2.ltr').first().evaluate((el) => {
      const rg = document.createRange()
      const tn = el.firstChild as Text
      rg.setStart(tn, 0)
      rg.setEnd(tn, 1)
      const a = rg.getBoundingClientRect().left
      rg.setStart(tn, tn.length - 1)
      rg.setEnd(tn, tn.length)
      const b = rg.getBoundingClientRect().left
      return { text: el.textContent, firstLeft: a, lastLeft: b }
    })
    expect(sched.text).toMatch(/^\d\d:\d\d–\d\d:\d\d$/)
    expect(sched.firstLeft).toBeLessThan(sched.lastLeft)

    // יומן — רשימת היום והכותרת של השבוע
    await nav(page, 'יומן')
    await expect(page.locator('.wk')).toBeVisible()
    r = await ltrOrderReport(page)
    expect(r.bad, `calendar: mirrored digits\n${fmt(r.bad)}`).toEqual([])
    await page.getByRole('button', { name: 'שבוע', exact: true }).click()
    const wk = await page.locator('.spread .truncate').first().evaluate((el) => {
      const tn = el.firstChild as Text
      const at = (i: number) => {
        const rg = document.createRange()
        rg.setStart(tn, i)
        rg.setEnd(tn, i + 1)
        return rg.getBoundingClientRect().left
      }
      return { text: tn.textContent, first: at(0), last: at(tn.length - 1) }
    })
    expect(wk.text).toBe('6.9 – 12.9')
    expect(wk.first, 'week label must read 6.9 → 12.9 left to right, not mirrored').toBeLessThan(wk.last)

    // הגדרות — "08:30–12:30 · א׳ ב׳ ג׳ ד׳ ה׳"
    await openSettings(page)
    r = await ltrOrderReport(page)
    expect(r.checked).toBeGreaterThan(3)
    expect(r.bad, `settings: mirrored digits\n${fmt(r.bad)}`).toEqual([])
    expect(errors).toEqual([])
  })

  test('כותרת עברית שמסתיימת במספר לא מאבדת אותו בחיתוך', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: richState() })))
    await expect(page.getByText('הלו״ז של היום')).toBeVisible()
    // הלו״ז של היום: כותרת ארוכה עם "15.9" בסוף ב-.ttl.truncate
    let lost = await clippedDigitsReport(page, '.truncate')
    await nav(page, 'יומן')
    await expect(page.locator('.wk')).toBeVisible()
    lost = lost.concat((await clippedDigitsReport(page, '.truncate')).map((x) => ({ ...x, screen: 'calendar' })))
    if (lost.length) await page.screenshot({ path: 'test-results/mobile-truncate-eats-digits.png', fullPage: true })
    expect(errors).toEqual([])
    test.fixme(lost.length > 0, `RTL text-overflow:ellipsis clips the trailing number: ${lost.map((l) => `«${l.text.slice(-24)}» lost "${l.lostDigits}"`).join(' | ')}`)
    expect(lost, fmt(lost)).toEqual([])
  })
})
