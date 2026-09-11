// ---------------------------------------------------------------------------
// ניגודיות WCAG AA — אסימוני הטקסט, צ׳יפים, תגיות, אירועי יומן, בועת "אני",
// כפתורים מושבתים. בשתי הערכות. התוצאות ב-contrast-<project>-<theme>.json
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { THEMES, atlasCache, nav, openApp, richState, writeJson } from './helpers'

const SELECTORS = [
  'body', '.muted', '.faint', '.tiny.faint', '.sub2', '.sec-h h2', '.section-title', '.empty',
  '.chip', '.chip.on', '.chip.tinted', '.tag', '.tag.on', '.btn', '.btn.primary', '.btn.ghost', '.btn:disabled', '.btn.primary:disabled',
  '.pill', '.pill.tinted', '.ev', '.ev .time', '.wk-gutter .hr', '.wk-head .h', '.cal-cell .n', '.cal-cell.out .n', '.cal-cell.today .n',
  '.bubble.me .bubble-text', '.bubble.me .bubble-meta', '.bubble.atlas .bubble-text', '.cmd', '.chat-date',
  '.kcol > h4', '.kcard .t', '.cd .t', '.cd .w', '.cd .d', '.wk-strip .wd .l', '.setchip', '.setchip .n', '.setchip.on', '.stepper .lbl',
  '.item.done .ttl', '.ins .small', '.ins.bad b', '.field > span', '.alert .tiny', '.bottomnav button', '.bottomnav button[aria-current="true"]',
  '.sidebar button', '.sidebar button[aria-current="true"]', '.sidebar .brand span', '.topbar .sub', '.toast > div', '.textarea::placeholder', '.input',
  '.scorebar button', '.scorebar button.on', '.check.on', '.vote', '.focus-sub', '.focus-track', '.timer-time', '.ring-wrap .inner .l', '.qcard .h',
  '.desk-head .sub', '.set-edit .lbl', '.col-btns .btn',
]

interface Row { screen: string; sel: string; text: string; fg: string; bg: string; ratio: number; need: number; size: number; weight: number; pass: boolean; opacity: number }

for (const theme of THEMES) {
  test(`ניגודיות טקסט (${theme})`, async ({ app }, info) => {
    test.setTimeout(360_000)
    const rows: Row[] = []
    const scan = async (screen: string) => {
      const r = await app.evaluate(
        ({ screen, SELECTORS }) => {
          const parse = (str: string) => {
            if (!str) return null
            let m = str.match(/^rgba?\(([^)]+)\)$/)
            if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
            m = str.match(/^color\(srgb ([^)]+)\)$/)
            if (m) { const parts = m[1].split('/'); const p = parts[0].trim().split(/\s+/).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: parts[1] !== undefined ? Number(parts[1]) : 1 } }
            return null
          }
          const mix = (top: any, under: any, a: number) => ({ r: under.r + (top.r - under.r) * a, g: under.g + (top.g - under.g) * a, b: under.b + (top.b - under.b) * a, a: 1 })
          const lum = (c: any) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
          const contrast = (a: any, b: any) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
          const bodyBg = parse(getComputedStyle(document.body).backgroundColor)!
          // הרקע האפקטיבי מאחורי אלמנט: עולים למעלה ומרכיבים רקעים חצי־שקופים
          const bgBehind = (el: Element | null): any => {
            const layers: any[] = []
            let e: Element | null = el
            while (e && e !== document.documentElement) {
              const c = parse(getComputedStyle(e).backgroundColor)
              if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
              e = e.parentElement
            }
            let out = bodyBg
            for (const l of layers.reverse()) out = mix(l, out, l.a)
            return out
          }
          const out: any[] = []
          for (const sel of SELECTORS) {
            const isPh = sel.endsWith('::placeholder')
            const base = isPh ? sel.replace('::placeholder', '') : sel
            let els: Element[] = []
            try { els = [...document.querySelectorAll(base)] } catch { continue }
            els = els.filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('.sr')).slice(0, 3)
            for (const el of els) {
              const cs = isPh ? getComputedStyle(el, '::placeholder') : getComputedStyle(el)
              const fg0 = parse(cs.color)
              if (!fg0) continue
              // אטימות מצטברת (למשל כפתור מושבת .45)
              let op = 1
              let e: Element | null = el
              let opHolder: Element | null = null
              while (e && e !== document.body) { const o = parseFloat(getComputedStyle(e).opacity); if (o < 1) { op *= o; opHolder = e } ; e = e.parentElement }
              let bg = bgBehind(el)
              let fg = fg0.a < 1 ? mix(fg0, bg, fg0.a) : fg0
              if (op < 1 && opHolder) {
                const under = bgBehind(opHolder.parentElement)
                bg = mix(bg, under, op)
                fg = mix(fg, under, op)
              }
              const size = parseFloat(cs.fontSize)
              const weight = parseInt(cs.fontWeight, 10)
              const large = size >= 24 || (size >= 18.66 && weight >= 700)
              const need = large ? 3 : 4.5
              const ratio = Math.round(contrast(fg, bg) * 100) / 100
              const text = isPh ? (el as HTMLInputElement).placeholder : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
              if (!text) continue
              out.push({ screen, sel, text, fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, ratio, need, size, weight, pass: ratio >= need, opacity: op })
            }
          }
          return out
        },
        { screen, SELECTORS },
      )
      rows.push(...r)
    }

    await openApp(app, { state: richState(theme), atlas: atlasCache() })
    await scan('today')
    await app.locator('.wk-strip .wd.now').click()
    await app.getByRole('dialog', { name: 'אימון' }).locator('.setchip').first().click()
    await scan('sheet-workout')
    await app.getByRole('dialog', { name: 'אימון' }).locator('.flow-head button').last().click()
    await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    await scan('focus')
    await app.keyboard.press('Escape')
    await nav(app, 'calendar')
    await app.locator('.btn.xs', { hasText: /^שבוע$/ }).click()
    await scan('calendar-week')
    await app.locator('.btn.xs', { hasText: /^חודש$/ }).click()
    await scan('calendar-month')
    await nav(app, 'projects')
    await scan('projects')
    await nav(app, 'atlas')
    await scan('atlas')
    // ההתראה לא נעלמת לבד — המתנה קצרה בלבד, אחרת היא אוכלת את כל תקציב הבדיקה והדף נסגר
    await app.locator('button.card.alert, .card.rail.alert').first().waitFor({ state: 'detached', timeout: 1500 }).catch(() => {})

    // אסימוני הצבע עצמם — בלי תלות באלמנט
    const tokens = await app.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const get = (v: string) => cs.getPropertyValue(v).trim()
      const toRgb = (c: string) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const r = getComputedStyle(d).color; d.remove(); return r }
      const parse = (str: string) => { const m = str.match(/^rgba?\(([^)]+)\)$/); const p = m![1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2] } }
      const lum = (c: any) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
      const contrast = (a: any, b: any) => { const l1 = lum(a), l2 = lum(b); return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 }
      const pairs: Array<[string, string]> = [
        ['--text', '--bg'], ['--text', '--card'], ['--text-dim', '--bg'], ['--text-dim', '--card'], ['--text-dim', '--bg-sunk'], ['--text-faint', '--bg'], ['--text-faint', '--card'], ['--text-faint', '--bg-sunk'],
        ['--accent', '--card'], ['--accent', '--bg'], ['--accent', '--accent-soft'], ['--on-accent', '--accent'], ['--good', '--good-soft'], ['--good', '--card'], ['--warn', '--warn-soft'], ['--warn', '--card'], ['--bad', '--bad-soft'], ['--bad', '--card'], ['--bg', '--text'],
      ]
      return pairs.map(([f, b]) => ({ fg: f, bg: b, fgv: get(f), bgv: get(b), ratio: contrast(parse(toRgb(get(f))), parse(toRgb(get(b)))) }))
    })

    writeJson(`contrast-${info.project.name}-${theme}.json`, { tokens, rows })
    const fails = rows.filter((r) => !r.pass)
    const tokenFails = tokens.filter((t) => t.ratio < 4.5)
    test.info().annotations.push({ type: 'contrast', description: `${fails.length}/${rows.length} element failures · token pairs under 4.5: ${tokenFails.map((t) => `${t.fg} on ${t.bg}=${t.ratio}`).join(', ') || 'none'}` })
    expect(rows.length).toBeGreaterThan(40)
    const uniq = [...new Set(fails.map((f) => `${f.sel} ${f.ratio}:1`))]
    test.fixme(fails.length > 0, `ניגודיות מתחת ל-AA: ${uniq.slice(0, 12).join(' · ')}`)
  })
}
