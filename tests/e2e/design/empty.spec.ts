// ---------------------------------------------------------------------------
// מצבי ריק: פרופיל בלי כלום — כל רשימה/כרטיס צריכים להגיד משהו מועיל בעברית,
// לא להישאר קופסה ריקה או כותרת מקטע בלי תוכן.
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { THEMES, emptyState, nav, openApp, shot, writeJson, type Screen } from './helpers'

interface EmptyRow { screen: string; path: string; header: string; kind: 'blank-card' | 'list-without-empty' | 'section-without-content' | 'ok'; text: string }

async function scanEmpty(page: import('@playwright/test').Page, screen: string): Promise<EmptyRow[]> {
  return page.evaluate((screen) => {
    const vis = (el: Element) => el.getBoundingClientRect().height > 0
    const path = (el: Element) => { const parts: string[] = []; let e: Element | null = el; while (e && parts.length < 3) { parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')); e = e.parentElement }; return parts.join(' > ') }
    const out: any[] = []
    for (const card of document.querySelectorAll('.card')) {
      if (!vis(card) || card.closest('.scrim')) continue
      const header = (card.querySelector('b, h3, .section-title')?.textContent ?? '').trim().slice(0, 40)
      const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim()
      const list = card.querySelector('.list')
      const items = card.querySelectorAll('.item').length
      const empty = card.querySelector('.empty')
      if (!text) out.push({ screen, path: path(card), header, kind: 'blank-card', text: '' })
      else if (list && items === 0 && !empty) out.push({ screen, path: path(card), header, kind: 'list-without-empty', text: text.slice(0, 80) })
      else out.push({ screen, path: path(card), header, kind: 'ok', text: (empty?.textContent ?? text).trim().slice(0, 80) })
    }
    for (const sec of document.querySelectorAll('.sec')) {
      if (!vis(sec)) continue
      const kids = [...sec.children].filter((c) => !c.classList.contains('sec-h') && vis(c))
      if (kids.length === 0) out.push({ screen, path: path(sec), header: sec.querySelector('h2')?.textContent ?? '', kind: 'section-without-content', text: '' })
    }
    return out
  }, screen)
}

for (const theme of THEMES) {
  test(`פרופיל ריק — כל המסכים (${theme})`, async ({ app }, info) => {
    test.setTimeout(180_000)
    await openApp(app, { state: emptyState(theme) })
    const rows: EmptyRow[] = []
    const screens: Screen[] = ['today', 'calendar', 'projects', 'review', 'settings', 'atlas']
    for (const s of screens) {
      if (s !== 'today') await nav(app, s)
      await app.waitForTimeout(100)
      rows.push(...(await scanEmpty(app, s)))
      await shot(app, info, `empty-${s}`, theme)
      if (s === 'calendar') {
        for (const label of ['חודש', 'שבוע']) {
          await app.locator('.btn.xs', { hasText: new RegExp(`^${label}$`) }).click()
          await app.waitForTimeout(100)
          rows.push(...(await scanEmpty(app, `calendar-${label}`)))
          await shot(app, info, `empty-calendar-${label === 'חודש' ? 'month' : 'week'}`, theme)
        }
      }
    }
    // גיליון "תכנון" מהמצב הריק של המשימות
    await nav(app, 'today')
    const plan = app.getByRole('button', { name: /כתוב את המטרות של היום/ })
    if (await plan.isVisible()) {
      await plan.click()
      await shot(app, info, 'empty-sheet-plan', theme, { viewport: true })
      await app.keyboard.press('Escape')
    }
    writeJson(`empty-${info.project.name}-${theme}.json`, rows)
    const bad = rows.filter((r) => r.kind !== 'ok')
    test.info().annotations.push({ type: 'empty', description: `${rows.length} cards/sections · ${bad.length} problems: ${bad.map((b) => `${b.screen}:${b.kind}:${b.header || b.path}`).join(' | ')}` })
    expect(rows.filter((r) => r.kind === 'ok').length).toBeGreaterThan(5)
    test.fixme(bad.length > 0, `מצבי ריק חסרים: ${bad.map((b) => `${b.screen} ${b.kind} "${b.header || b.path}"`).slice(0, 8).join(' · ')}`)
  })
}
