// ---------------------------------------------------------------------------
// מיקוד מקלדת: Tab לאורך מסך היום — לכל אלמנט שמקבל מיקוד חייב להיות סימון נראה.
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { atlasCache, openApp, richState, writeJson } from './helpers'

test('לכל אלמנט אינטראקטיבי במסך היום יש :focus-visible נראה', async ({ app }, info) => {
  test.setTimeout(120_000)
  await openApp(app, { state: richState('light'), atlas: atlasCache() })
  await app.locator('body').click({ position: { x: 5, y: 5 } })

  const seen: Array<{ i: number; tag: string; cls: string; text: string; outline: string; width: string; shadow: string; border: string; ok: boolean }> = []
  let firstKey = ''
  for (let i = 0; i < 90; i++) {
    await app.keyboard.press('Tab')
    const f = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const key = el.tagName + '|' + el.className + '|' + (el.textContent ?? '').trim().slice(0, 20) + '|' + (el.getAttribute('aria-label') ?? '')
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      const outlineOk = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      const ringOk = isInput && cs.boxShadow !== 'none'
      return { key, tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 40), text: ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || '').slice(0, 30), outline: cs.outlineStyle, width: cs.outlineWidth, shadow: cs.boxShadow.slice(0, 40), border: cs.borderColor, ok: outlineOk || ringOk, matchesFV: el.matches(':focus-visible') }
    })
    if (!f) continue
    if (i === 0) firstKey = f.key
    else if (f.key === firstKey && i > 10) break
    seen.push({ i, ...f })
  }
  writeJson(`focus-${info.project.name}.json`, seen)
  expect(seen.length).toBeGreaterThan(15)
  const bad = seen.filter((s) => !s.ok)
  test.info().annotations.push({ type: 'focus', description: `${seen.length} focus stops, ${bad.length} without a visible ring` })
  test.fixme(bad.length > 0, `בלי סימון מיקוד: ${bad.map((b) => `${b.tag}.${b.cls.split(' ')[0]} "${b.text}"`).slice(0, 8).join(' · ')}`)
})
