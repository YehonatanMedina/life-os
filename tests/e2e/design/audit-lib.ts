// ---------------------------------------------------------------------------
// סורק העקביות — רץ בתוך הדפדפן על המסך הנוכחי ומחזיר חריגות.
// פונקציה אחת גדולה, כדי שאפשר יהיה להריץ אותה על כל מסך/גיליון בקריאה אחת.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { FONT_SCALE } from './helpers'

export interface Violation {
  kind: string
  path: string
  text: string
  detail: string
}

export interface AuditResult {
  screen: string
  fontFamily: Violation[]
  fontScale: Violation[]
  cardBg: Violation[]
  headers: Array<{ path: string; text: string; style: string }>
  buttonHeights: Array<{ classes: string; heights: number[]; samples: string[] }>
  spacing: Violation[]
  emoji: Violation[]
  glyphs: Violation[]
  overflow: Violation[]
  textCount: number
}

/** תוים שהם אימוג׳י של ממש (פיקטוגרפיים), ובנפרד — סמלים טיפוגרפיים (✓ ✕ ← ▾) */
export const EMOJI_RE = /\p{Extended_Pictographic}/u
export const GLYPH_RE = /[←-⇿✓✕▸▾◂◄‹›⟵-⟿⬅-⬇]/u

export async function auditScreen(page: Page, screen: string, opts: { root?: string } = {}): Promise<AuditResult> {
  return page.evaluate(
    ({ screen, scale, rootSel }) => {
      const EMOJI_RE = /\p{Extended_Pictographic}/u
      const GLYPH_RE = /[←-⇿✓✕▸▾◂◄‹›⟵-⟿⬅-⬇]/u
      const root: Element = (rootSel && document.querySelector(rootSel)) || document.body
      const cssPath = (el: Element) => {
        const parts: string[] = []
        let e: Element | null = el
        while (e && e.nodeType === 1 && parts.length < 5) {
          let p = e.tagName.toLowerCase()
          if (e.classList.length) p += '.' + [...e.classList].slice(0, 3).join('.')
          parts.unshift(p)
          if (e.classList.contains('card') || e.classList.contains('sheet') || e.classList.contains('flow') || e.classList.contains('focus') || e.classList.contains('sidebar') || e.classList.contains('topbar') || e.classList.contains('bottomnav')) break
          e = e.parentElement
        }
        return parts.join(' > ')
      }
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return false
        const cs = getComputedStyle(el)
        return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.sr')
      }
      const ownText = (el: Element) =>
        [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').replace(/\s+/g, ' ').trim()

      const res: any = { screen, fontFamily: [], fontScale: [], cardBg: [], headers: [], buttonHeights: [], spacing: [], emoji: [], glyphs: [], overflow: [], textCount: 0 }

      // -- גופן וגודל על כל אלמנט עם טקסט ישיר ---------------------------------
      const NUM_OK = '.timer-time, .ring-wrap .inner .n, .cd .d, .stepper .val, .focus-time'
      for (const el of root.querySelectorAll('*')) {
        if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'OPTION'].includes(el.tagName)) continue
        const t = ownText(el)
        if (!t || !visible(el)) continue
        res.textCount++
        const cs = getComputedStyle(el)
        const fam = cs.fontFamily
        const size = parseFloat(cs.fontSize)
        const isMono = fam.startsWith('"IBM Plex Mono"') || fam.startsWith('IBM Plex Mono')
        const isUi = fam.startsWith('"IBM Plex Sans Hebrew"') || fam.startsWith('IBM Plex Sans Hebrew')
        if (isMono && !el.matches(NUM_OK)) res.fontFamily.push({ kind: 'mono-outside-instrument', path: cssPath(el), text: t.slice(0, 40), detail: fam.slice(0, 40) })
        else if (!isMono && !isUi) res.fontFamily.push({ kind: 'not-font-ui', path: cssPath(el), text: t.slice(0, 40), detail: fam.slice(0, 60) })
        const ok = scale.includes(size) || size >= 42
        if (!ok) res.fontScale.push({ kind: 'off-scale', path: cssPath(el), text: t.slice(0, 40), detail: `${size}px` })
      }

      // -- רקע כרטיסים --------------------------------------------------------
      const cardVar = getComputedStyle(document.documentElement).getPropertyValue('--card').trim()
      const probe = document.createElement('div')
      probe.style.background = cardVar
      document.body.appendChild(probe)
      const cardRgb = getComputedStyle(probe).backgroundColor
      probe.remove()
      for (const el of root.querySelectorAll('.card')) {
        if (!visible(el)) continue
        const bg = getComputedStyle(el).backgroundColor
        if (bg !== cardRgb) {
          const b = el.querySelector('b')
          res.cardBg.push({ kind: 'tinted-card', path: cssPath(el), text: (b?.textContent ?? ownText(el)).slice(0, 40), detail: `${bg} (inline: ${(el as HTMLElement).style.background || (el as HTMLElement).style.backgroundColor || '—'})` })
        }
      }

      // -- כותרות מקטע: אותו קול -------------------------------------------------
      for (const el of root.querySelectorAll('.sec-h h2, .eyebrow, .section-title')) {
        if (!visible(el)) continue
        const cs = getComputedStyle(el)
        res.headers.push({ path: cssPath(el), text: (el.textContent ?? '').trim().slice(0, 30), style: `${cs.fontSize}/${cs.fontWeight}/${cs.color}/${cs.letterSpacing}/${cs.lineHeight}` })
      }

      // -- כפתורים מאותה מחלקה: אותו גובה --------------------------------------
      const groups = new Map<string, { heights: number[]; samples: string[] }>()
      for (const el of root.querySelectorAll('button.btn')) {
        if (!visible(el)) continue
        const key = [...el.classList].sort().join('.')
        const h = Math.round(el.getBoundingClientRect().height * 2) / 2
        const g = groups.get(key) ?? { heights: [], samples: [] }
        if (!g.heights.includes(h)) {
          g.heights.push(h)
          g.samples.push(`${h}px: ${(el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label') || '?'}`)
        }
        groups.set(key, g)
      }
      for (const [classes, g] of groups) if (g.heights.length > 1) res.buttonHeights.push({ classes, heights: g.heights.sort((a, b) => a - b), samples: g.samples })

      // -- ריווח מתועד ---------------------------------------------------------
      const expect = (sel: string, prop: string, want: string, kind: string) => {
        for (const el of root.querySelectorAll(sel)) {
          if (!visible(el)) continue
          const got = (getComputedStyle(el) as any)[prop] as string
          if (got !== want) res.spacing.push({ kind, path: cssPath(el), text: (el.querySelector('b')?.textContent ?? ownText(el) ?? '').slice(0, 30), detail: `${prop}: ${got} (expected ${want})` })
        }
      }
      expect('.card.pad', 'padding', '14px', 'card.pad')
      expect('.card-h', 'padding', '12px 13px 6px', 'card-h')
      expect('.item', 'padding', '11px 13px', 'item')
      expect('.sec', 'gap', '10px', 'sec-gap')
      expect('.page', 'gap', '22px', 'page-gap')
      // כותרות כרטיס שנבנו ידנית (.spread עם padding) במקום .card-h
      for (const el of root.querySelectorAll('.card > .spread:first-child, .card > div.spread')) {
        if (!visible(el) || !el.querySelector('b')) continue
        const p = getComputedStyle(el).padding
        res.spacing.push({ kind: 'adhoc-card-header', path: cssPath(el), text: (el.querySelector('b')?.textContent ?? '').slice(0, 30), detail: `padding: ${p}` })
      }

      // -- אימוג׳ים בכרום המערכת ------------------------------------------------
      const CHROME = '.sec-h, .card-h b, .section-title, .topbar, .bottomnav, .sidebar, .desk-head, .sheet h3, .flow-head, .empty, .card > .spread > b, .card > .spread > div > b, .card.pad > b, .alert b, .cmd, .chat-empty, .focus-sub, .focus-track'
      const seen = new Set<string>()
      // מותר: אימוג׳י של מסלול/הרגל/פריט שבועי של המשתמש, ואייקון סוג האימון
      const USER_EMOJI = /^[📘🔭🚀🌿☀️🏃📚🌙🕯️🫂📞🧺🎸🎯🧪🎨🛠️🎓💡📈🧭🧘💧🥗🚿📝🎹🌱🧹🪥📵🛏️]/u
      const WORKOUT_KIND = /^[🏋️🏃🚶🤸😌]/u
      const allowed = (el: Element, t: string) =>
        (USER_EMOJI.test(t) && !!el.closest('.focus-track, .card.rail, .tag, .item, .kcard, .chip.tinted, .sheet, .flow-head, .bubble')) ||
        (WORKOUT_KIND.test(t) && !!el.closest('.card, .flow-head') && !/אימונים/.test(t))
      const push = (arr: any[], kind: string, el: Element, t: string) => {
        const k = kind + '|' + t
        if (seen.has(k)) return
        if (allowed(el, t)) return
        seen.add(k)
        arr.push({ kind, path: cssPath(el), text: t.slice(0, 50), detail: [...t].filter((c) => EMOJI_RE.test(c) || GLYPH_RE.test(c)).join(' ') })
      }
      for (const el of root.querySelectorAll(CHROME)) {
        if (!visible(el)) continue
        for (const node of el.querySelectorAll('*')) {
          const t = ownText(node)
          if (!t) continue
          if (EMOJI_RE.test(t)) push(res.emoji, 'chrome', node, t)
          else if (GLYPH_RE.test(t)) push(res.glyphs, 'chrome', node, t)
        }
        const t = ownText(el)
        if (t && EMOJI_RE.test(t)) push(res.emoji, 'chrome', el, t)
        else if (t && GLYPH_RE.test(t)) push(res.glyphs, 'chrome', el, t)
      }
      // כפתורי מערכת (btn / scorebar / focus) — לא tag (מסלול של המשתמש)
      for (const el of root.querySelectorAll('button.btn, .scorebar button, .focus-x, .focus-actions button, .flow-foot button, .sheet-actions button')) {
        if (!visible(el)) continue
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!t) continue
        if (EMOJI_RE.test(t)) push(res.emoji, 'button', el, t)
        else if (GLYPH_RE.test(t)) push(res.glyphs, 'button', el, t)
      }

      // -- גלישה אופקית -----------------------------------------------------------
      const vw = document.documentElement.clientWidth
      if (document.documentElement.scrollWidth > vw + 1) res.overflow.push({ kind: 'page-scrollWidth', path: 'html', text: '', detail: `${document.documentElement.scrollWidth} > ${vw}` })
      for (const el of root.querySelectorAll('.card, .sheet, .kcard, .item, .bubble, .cd, .tag, .chip, .flow-body, .alert')) {
        if (!visible(el)) continue
        if (el.closest('.hstack-scroll, .kcol, .wk-body, .tag-scroll')) continue
        const r = el.getBoundingClientRect()
        if (r.right > vw + 1 || r.left < -1) res.overflow.push({ kind: 'outside-viewport', path: cssPath(el), text: (el.textContent ?? '').trim().slice(0, 40), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} vw ${vw}` })
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll' && !el.classList.contains('chip') && !el.classList.contains('tag') && !el.classList.contains('bubble'))
          res.overflow.push({ kind: 'content-overflows-box', path: cssPath(el), text: (el.textContent ?? '').trim().slice(0, 40), detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` })
      }
      return res as AuditResult
    },
    { screen, scale: FONT_SCALE, rootSel: opts.root ?? '' },
  )
}
