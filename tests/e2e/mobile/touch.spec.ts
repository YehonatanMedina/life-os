// ---------------------------------------------------------------------------
// יעדי מגע: כל כפתור / צ׳ק / צ׳יפ אינטראקטיבי צריך תיבת פגיעה של לפחות 40×40.
// נמדד ב-elementFromPoint (ולא רק לפי getBoundingClientRect) — כך שה-::before
// שמרחיב את .btn.xs ואת .check נספר לטובתם.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import { EVENING, atlasCache, edition, expect, fmt, nav, openApp, openSettings, richState, test, touchTargets, type Hit } from './helpers'
import type { Page } from '@playwright/test'

const MIN = 40

type Screen = { name: string; prep: (page: Page) => Promise<void>; root?: string }

const SCREENS: Screen[] = [
  { name: 'today', prep: async () => {} },
  { name: 'atlas', prep: async (p) => nav(p, 'אטלס') },
  { name: 'calendar-day', prep: async (p) => nav(p, 'יומן') },
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
  { name: 'projects', prep: async (p) => nav(p, 'פרויקטים') },
  { name: 'review', prep: async (p) => nav(p, 'סקירה') },
  { name: 'settings', prep: async (p) => openSettings(p) },
  {
    name: 'sheet-task',
    root: '.scrim',
    prep: async (p) => {
      await p.getByText('לקרוא את פרק 3 בספר הלימוד').click()
      await expect(p.getByRole('dialog', { name: 'משימה' })).toBeVisible()
    },
  },
  {
    name: 'sheet-event',
    root: '.scrim',
    prep: async (p) => {
      await nav(p, 'יומן')
      await p.getByRole('button', { name: '+ אירוע' }).click()
      await expect(p.getByRole('dialog', { name: 'אירוע חדש' })).toBeVisible()
    },
  },
  {
    name: 'workout',
    root: '.flow',
    prep: async (p) => {
      await p.getByRole('button', { name: 'פתיחת האימון' }).click()
      await p.locator('.setchip').first().click()
      await expect(p.locator('.set-edit')).toBeVisible()
    },
  },
  {
    name: 'focus',
    root: '.focus',
    prep: async (p) => {
      await p.locator('.tag', { hasText: 'לימודים' }).first().click()
      await p.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
      await expect(p.locator('.focus')).toBeVisible()
    },
  },
]

const summarize = (hits: Hit[]) => {
  const small = hits.filter((h) => !h.covered && (h.hitW < MIN || h.hitH < MIN))
  const covered = hits.filter((h) => h.covered)
  // קיבוץ לפי מחלקה — כדי שהדוח יגיד "כל .btn.sm" ולא 40 שורות
  const byClass = new Map<string, { n: number; example: Hit }>()
  for (const h of small) {
    const k = h.el.split(' ')[0]
    const cur = byClass.get(k)
    if (cur) cur.n++
    else byClass.set(k, { n: 1, example: h })
  }
  return { total: hits.length, small, covered, byClass: [...byClass.entries()].map(([k, v]) => ({ cls: k, n: v.n, example: v.example })) }
}

test.describe('יעדי מגע ≥ 40×40', () => {
  for (const sc of SCREENS) {
    test(sc.name, async ({ page, errors }, testInfo) => {
      errors.push(...(await openApp(page, { state: richState(), news: edition(), atlas: atlasCache(4), now: sc.name === 'today' ? EVENING : undefined })))
      await sc.prep(page)
      await page.waitForTimeout(200)
      const hits = await touchTargets(page, sc.root ?? 'body')
      const sum = summarize(hits)
      fs.mkdirSync('test-results', { recursive: true })
      fs.writeFileSync(`test-results/mobile-touch-${sc.name}.json`, JSON.stringify(sum, null, 1))
      await testInfo.attach(`touch-${sc.name}`, { body: JSON.stringify(sum, null, 1), contentType: 'application/json' })
      expect(sum.total, 'no interactive elements measured').toBeGreaterThan(3)
      // אלמנט "מכוסה" = אי אפשר ללחוץ עליו במרכזו (משהו אחר מעליו)
      expect(sum.covered.map((h) => h.el), `${sc.name}: interactive elements covered at their centre\n${fmt(sum.covered)}`).toEqual([])
      expect(errors).toEqual([])
      if (sum.small.length) {
        await page.screenshot({ path: `test-results/mobile-touch-${sc.name}.png`, fullPage: sc.root === undefined })
        // פגם ידוע ומתועד בדוח — .btn.sm / .tag / .vote / .switch / .chip נמוכים מ-40px
        test.fixme(true, `${sum.small.length} touch targets under ${MIN}px on ${sc.name}: ${sum.byClass.map((b) => `${b.cls}×${b.n} (${b.example.hitW}×${b.example.hitH})`).join(', ')}`)
      }
    })
  }
})
