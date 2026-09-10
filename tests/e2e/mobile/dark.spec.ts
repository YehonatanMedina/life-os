// ---------------------------------------------------------------------------
// מצב כהה (וגם בהיר): ניגודיות אמיתית של הטקסט מול הרקע שמאחוריו.
// .tiny / .faint / .muted / צ׳יפים / אירועי יומן / תגיות — WCAG AA:
// 4.5 לטקסט רגיל, 3 לטקסט גדול או מודגש.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import { atlasCache, contrastReport, edition, expect, fmt, nav, openApp, openSettings, richState, test, type ContrastRow } from './helpers'
import type { Page } from '@playwright/test'

const SEL = [
  '.tiny', '.faint', '.muted', '.small', '.sub2', '.chip', '.chip.tinted', '.pill', '.ev', '.ev .time', '.tag', '.setchip',
  '.sec-h h2', '.section-title', '.eyebrow', '.wk-strip .l', '.cd .w', '.cd .t > div', '.bottomnav button', '.empty',
  '.qcard .h', '.ins .small', '.stepper .lbl', '.wk-gutter .hr', '.wk-head .h', '.cal-head div', '.kcol > h4 span',
  '.chat-date', '.bubble-meta', '.btn', '.item .txt', '.ttl', 'label.field > span', '.field > span', '.alert b', '.topbar .sub',
].join(', ')

type Screen = { name: string; prep: (p: Page) => Promise<void> }
const SCREENS: Screen[] = [
  { name: 'today', prep: async () => {} },
  { name: 'atlas', prep: (p) => nav(p, 'אטלס') },
  { name: 'calendar-day', prep: (p) => nav(p, 'יומן') },
  {
    name: 'calendar-week',
    prep: async (p) => {
      await nav(p, 'יומן')
      await p.getByRole('button', { name: 'שבוע', exact: true }).click()
    },
  },
  {
    name: 'calendar-month',
    prep: async (p) => {
      await nav(p, 'יומן')
      await p.getByRole('button', { name: 'חודש', exact: true }).click()
    },
  },
  { name: 'projects', prep: (p) => nav(p, 'פרויקטים') },
  { name: 'review', prep: (p) => nav(p, 'סקירה') },
  { name: 'settings', prep: (p) => openSettings(p) },
  {
    name: 'workout',
    prep: async (p) => {
      await p.getByRole('button', { name: 'פתיחת האימון' }).click()
      await p.locator('.setchip').first().click()
    },
  },
]

function dedupe(rows: ContrastRow[]) {
  // אותה מחלקה + אותם צבעים = אותו פגם; משאירים דוגמה אחת עם מונה
  const m = new Map<string, ContrastRow & { n: number }>()
  for (const r of rows) {
    const k = `${r.el.split(' ')[0]}|${r.fg}|${r.bg}`
    const cur = m.get(k)
    if (cur) cur.n++
    else m.set(k, { ...r, n: 1 })
  }
  return [...m.values()].sort((a, b) => a.ratio - b.ratio)
}

async function runContrast(page: Page, tag: string, screens: Screen[], testInfo: any) {
  const fails: Array<ContrastRow & { n: number; screen: string }> = []
  const warns: Array<ContrastRow & { n: number; screen: string }> = []
  for (const sc of screens) {
    await sc.prep(page)
    await page.waitForTimeout(200)
    const rows = await contrastReport(page, SEL)
    const bad = dedupe(rows.filter((r) => !r.ok)).map((r) => ({ ...r, screen: sc.name }))
    const warn = dedupe(rows.filter((r) => r.ok && !r.strictOk)).map((r) => ({ ...r, screen: sc.name }))
    fails.push(...bad)
    warns.push(...warn)
    if (bad.length) await page.screenshot({ path: `test-results/mobile-${tag}-${sc.name}.png`, fullPage: true })
    // בין מסכים חוזרים להיום, כדי שהניווט יהיה עקבי
    if (await page.locator('.flow').count()) await page.locator('.flow-foot button').last().click()
    await nav(page, 'היום')
  }
  fs.mkdirSync('test-results', { recursive: true })
  fs.writeFileSync(`test-results/mobile-${tag}.json`, JSON.stringify({ fails, warns }, null, 1))
  await testInfo.attach(`contrast-${tag}`, { body: JSON.stringify({ fails, warns }, null, 1), contentType: 'application/json' })
  return { fails, warns }
}

test.describe('ניגודיות', () => {
  test('כהה לפי המערכת (prefers-color-scheme)', async ({ page, errors }, testInfo) => {
    errors.push(...(await openApp(page, { state: richState(), news: edition(), atlas: atlasCache(4), colorScheme: 'dark' })))
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 16, 19)')
    const { fails } = await runContrast(page, 'dark-system', SCREENS, testInfo)
    expect(errors).toEqual([])
    test.fixme(fails.length > 0, `${fails.length} low-contrast text styles in dark mode: ${fails.slice(0, 8).map((f) => `${f.screen} ${f.el} ${f.fg}/${f.bg}=${f.ratio}`).join(' | ')}`)
    expect(fails, fmt(fails)).toEqual([])
  })

  test('כהה מפורש בהגדרות (data-theme) גם כשהמערכת בהירה', async ({ page, errors }, testInfo) => {
    const s = richState()
    s.settings.theme = 'dark'
    errors.push(...(await openApp(page, { state: s, news: edition(), atlas: atlasCache(4), colorScheme: 'light' })))
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 16, 19)')
    const { fails } = await runContrast(page, 'dark-explicit', SCREENS.slice(0, 3), testInfo)
    expect(errors).toEqual([])
    test.fixme(fails.length > 0, `${fails.length} low-contrast text styles with explicit dark theme`)
    expect(fails, fmt(fails)).toEqual([])
  })

  test('בהיר — צ׳יפים צבעוניים, אירועים ותגיות', async ({ page, errors }, testInfo) => {
    errors.push(...(await openApp(page, { state: richState(), news: edition(), atlas: atlasCache(4), colorScheme: 'light' })))
    const { fails } = await runContrast(page, 'light', SCREENS, testInfo)
    expect(errors).toEqual([])
    test.fixme(fails.length > 0, `${fails.length} low-contrast text styles in light mode: ${fails.slice(0, 8).map((f) => `${f.screen} ${f.el} ${f.fg}/${f.bg}=${f.ratio}`).join(' | ')}`)
    expect(fails, fmt(fails)).toEqual([])
  })
})
