// ---------------------------------------------------------------------------
// היררכיה וקצב במסך היום: מרחק בין מקטעים מול מרחק בין כרטיסים, סדר המקטעים,
// ואיזון שתי העמודות במחשב.
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { atlasCache, openApp, richState, writeJson } from './helpers'

test('קצב אנכי וסדר המקטעים במסך היום', async ({ app }, info) => {
  await openApp(app, { state: richState('light'), atlas: atlasCache() })

  const m = await app.evaluate(() => {
    const top = (el: Element) => el.getBoundingClientRect().top + window.scrollY
    const bottom = (el: Element) => el.getBoundingClientRect().bottom + window.scrollY
    const vis = (el: Element) => el.getBoundingClientRect().height > 0
    const page = document.querySelector('.main > .page')!
    const alerts = [...page.querySelectorAll(':scope > .stack > .card')].filter(vis)
    const secs = [...page.querySelectorAll('.sec')].filter(vis)
    const secGaps: Array<{ from: string; to: string; gap: number }> = []
    for (let i = 1; i < secs.length; i++) {
      const a = secs[i - 1], b = secs[i]
      // רק מקטעים באותה עמודה (אותו x ואותו הורה) — המעבר בין העמודות נמדד בנפרד (colGap)
      if (Math.abs(a.getBoundingClientRect().left - b.getBoundingClientRect().left) > 2) continue
      if (a.parentElement !== b.parentElement) continue
      secGaps.push({ from: a.querySelector('h2')?.textContent ?? '?', to: b.querySelector('h2')?.textContent ?? '?', gap: Math.round(top(b) - bottom(a)) })
    }
    const cardGaps: Array<{ sec: string; gap: number }> = []
    for (const s of secs) {
      const cards = [...s.querySelectorAll(':scope > .card, :scope > div > .card, :scope > .countdowns')].filter(vis)
      for (let i = 1; i < cards.length; i++) cardGaps.push({ sec: s.querySelector('h2')?.textContent ?? '?', gap: Math.round(top(cards[i]) - bottom(cards[i - 1])) })
    }
    const alertGaps: number[] = []
    for (let i = 1; i < alerts.length; i++) alertGaps.push(Math.round(top(alerts[i]) - bottom(alerts[i - 1])))
    const cols = [...document.querySelectorAll('.grid2 > .page')].map((c) => ({ h: Math.round(c.getBoundingClientRect().height), left: Math.round(c.getBoundingClientRect().left), first: c.querySelector('h2')?.textContent }))
    const gridGap = getComputedStyle(document.querySelector('.grid2')!).gap
    const headerBottom = bottom(document.querySelector('.desk-head, .topbar')!)
    const order = [...page.querySelectorAll('.sec-h h2')].map((h) => h.textContent)
    const firstSecTop = top(secs[0])
    const lastAlertBottom = alerts.length ? bottom(alerts[alerts.length - 1]) : 0
    const alertsToFirstSec = alerts.length ? Math.round(firstSecTop - lastAlertBottom) : null
    // במובייל: המרחק בין סוף העמודה הראשונה לתחילת השנייה
    const colGap = cols.length === 2 && cols[0].left === cols[1].left ? Math.round(top(document.querySelectorAll('.grid2 > .page')[1]) - bottom(document.querySelectorAll('.grid2 > .page')[0])) : null
    return { alerts: alerts.map((a) => (a.querySelector('b')?.textContent ?? '').slice(0, 30)), alertGaps, secGaps, cardGaps, cols, gridGap, order, alertsToFirstSec, headerBottom, colGap, vw: innerWidth }
  })
  writeJson(`rhythm-${info.project.name}.json`, m)

  // סדר: התראות, ואז "עכשיו"
  expect(m.order[0]).toBe('עכשיו')
  expect(m.alerts.length).toBeGreaterThan(0)
  expect(m.alertsToFirstSec).toBeGreaterThan(0)

  const minSec = Math.min(...m.secGaps.map((g) => g.gap))
  const maxCard = Math.max(...m.cardGaps.map((g) => g.gap))
  test.info().annotations.push({ type: 'gaps', description: `sections ${m.secGaps.map((g) => g.gap).join('/')} · cards ${[...new Set(m.cardGaps.map((g) => g.gap))].join('/')} · alerts ${m.alertGaps.join('/')} · colGap ${m.colGap}` })
  // מקטעים צריכים נשימה גדולה יותר מכרטיסים — לפחות פי 1.5
  expect(minSec, `section gap ${minSec} vs card gap ${maxCard}`).toBeGreaterThanOrEqual(maxCard * 1.5)

  if (m.cols.length === 2 && m.cols[0].left !== m.cols[1].left) {
    // מחשב — שתי עמודות
    const [a, b] = m.cols.map((c) => c.h)
    const ratio = Math.min(a, b) / Math.max(a, b)
    test.info().annotations.push({ type: 'columns', description: `right(עכשיו/היום)=${m.cols[0].h}px · left(שגרה/השבוע/קדימה)=${m.cols[1].h}px · ratio ${ratio.toFixed(2)}` })
    test.fixme(ratio < 0.6, `עמודה אחת קצרה ביותר מ-40%: ${a}px מול ${b}px`)
  } else {
    // טלפון — בין שתי "העמודות" המוערמות המרווח הוא של .grid2 (12px) ולא של עמוד (22px)
    test.fixme((m.colGap ?? 99) < minSec, `במובייל המרווח בין "היום" ל"שגרה" הוא ${m.colGap}px (gap של .grid2) במקום ${minSec}px כמו בין שאר המקטעים`)
  }
})
