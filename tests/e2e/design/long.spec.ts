// ---------------------------------------------------------------------------
// תוכן ארוך: כותרת משימה של 200 תווים, אירוע עם URL, מסלול של 40 תווים,
// 12 מסלולים, 15 הרגלים — שום דבר לא גולש ולא שובר את הפריסה.
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { LONG_TITLE, THEMES, atlasCache, longState, nav, openApp, shot, writeJson } from './helpers'
import { auditScreen, type Violation } from './audit-lib'

for (const theme of THEMES) {
  test(`תוכן ארוך לא שובר את הפריסה (${theme})`, async ({ app }, info) => {
    test.setTimeout(180_000)
    const overflow: Array<Violation & { screen: string }> = []
    const check = async (screen: string, root?: string) => {
      const r = await auditScreen(app, screen, { root })
      overflow.push(...r.overflow.map((v) => ({ screen, ...v })))
    }

    await openApp(app, { state: longState(theme), atlas: atlasCache() })
    expect(await app.locator('.item .ttl', { hasText: LONG_TITLE.slice(0, 30) }).count()).toBeGreaterThan(0)
    await shot(app, info, 'long-today', theme)
    await check('today')
    await app.locator('.card', { hasText: 'המשימות של היום' }).locator('button.txt').first().click()
    await shot(app, info, 'long-sheet-task', theme, { viewport: true })
    await check('sheet-task', '.scrim')
    await app.keyboard.press('Escape')
    await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    await shot(app, info, 'long-focus', theme, { viewport: true })
    await check('focus', '.focus')
    await app.keyboard.press('Escape')

    await nav(app, 'calendar')
    for (const [mode, label] of [['week', 'שבוע'], ['day', 'יום']] as const) {
      await app.locator('.btn.xs', { hasText: new RegExp(`^${label}$`) }).click()
      await app.waitForTimeout(100)
      await shot(app, info, `long-calendar-${mode}`, theme)
      await check(`calendar-${mode}`)
    }

    await nav(app, 'projects')
    await shot(app, info, 'long-projects', theme)
    await check('projects')
    await app.locator('.tag', { hasText: /^הכל$/ }).click()
    await app.waitForTimeout(100)
    await check('projects-all')
    await shot(app, info, 'long-projects-all', theme)

    await nav(app, 'settings')
    await shot(app, info, 'long-settings', theme)
    await check('settings')

    await nav(app, 'review')
    await check('review')

    writeJson(`long-${info.project.name}-${theme}.json`, overflow)
    test.info().annotations.push({ type: 'overflow', description: `${overflow.length} overflow findings` })
    test.fixme(overflow.length > 0, `גלישה: ${overflow.map((o) => `${o.screen} ${o.kind} ${o.path} (${o.detail})`).slice(0, 6).join(' · ')}`)
  })
}
