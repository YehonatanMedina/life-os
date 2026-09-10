// בדיקת שפיות למכשירי המדידה: מוודאים שהם באמת תופסים גלישה, חריגה מכרטיס,
// ניגודיות גרועה ויעד מגע קטן — אחרת "הכל עבר" לא אומר כלום.
import { contrastReport, expect, layoutReport, openApp, test, touchTargets } from './helpers'

test('מכשירי המדידה תופסים פגמים מלאכותיים', async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => {
    // כרטיס בלי overflow:hidden (הטיימר) — כדי שהחריגה תגיע עד קצה המסך
    const card = document.querySelector('.timer-card') as HTMLElement
    const wide = document.createElement('div')
    wide.className = 'probe-wide'
    wide.style.cssText = 'width:600px;height:10px;background:red'
    card.appendChild(wide)
    const lowc = document.createElement('div')
    lowc.className = 'probe-lowc'
    lowc.textContent = 'טקסט חיוור'
    lowc.style.cssText = 'color:#ccc;background:#fff;font-size:12px'
    card.appendChild(lowc)
    const tiny = document.createElement('button')
    tiny.className = 'probe-tiny'
    tiny.textContent = 'x'
    tiny.style.cssText = 'width:12px;height:12px;padding:0;border:0;display:block;font-size:8px;line-height:12px;overflow:hidden'
    card.appendChild(tiny)
    // וגם חריגה בתוך כרטיס עם פס (overflow:hidden) — נתפסת כחריגה מהכרטיס
    const rail = document.querySelector('.card.rail') as HTMLElement
    const clipped = document.createElement('div')
    clipped.className = 'probe-clipped'
    clipped.style.cssText = 'width:500px;height:4px;background:blue'
    rail.appendChild(clipped)
  })
  const rep = await layoutReport(page)
  // בטלפון תוכן רחב מרחיב את ה-layout viewport — המדידה חייבת לתפוס גם את זה
  expect(rep.innerWidth).toBeGreaterThan(rep.screenWidth)
  expect(rep.scrollWidth).toBeGreaterThan(rep.screenWidth)
  expect(rep.overflowX.some((o) => o.el.includes('probe-wide'))).toBe(true)
  expect(rep.cardOverflow.some((o) => o.el.includes('probe-wide'))).toBe(true)
  expect(rep.cardOverflow.some((o) => o.el.includes('probe-clipped'))).toBe(true)
  const c = await contrastReport(page, '.probe-lowc')
  expect(c[0].ratio).toBeLessThan(2)
  const hits = await touchTargets(page)
  const t = hits.find((h) => h.el.includes('probe-tiny'))
  expect(t?.hitW).toBe(12)
  expect(t?.hitH).toBe(12)
  // ה-::before של .check מרחיב את אזור הפגיעה: inset:-10px נמדד מקופסת הריפוד
  // (בתוך הגבול של 2px), ולכן בפועל 24 + 8 + 8 = 40, לא 44
  const check = hits.find((h) => h.el.startsWith('button.check'))
  expect(check?.hitW).toBeGreaterThanOrEqual(40)
  expect(check?.hitH).toBeGreaterThanOrEqual(40)
})
