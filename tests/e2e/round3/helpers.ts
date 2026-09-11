// ---------------------------------------------------------------------------
// סבב 3 — עוזרים משותפים. יושבים על תשתית המחשב (desk.ts: שעון קבוע + זריעה)
// דרך week.ts (ניווט שעובד בשני הפרופילים), ועל תשתית הענן לבדיקות עם GitHub מזויף.
// ---------------------------------------------------------------------------
import type { Locator, Page } from '@playwright/test'
import { expect } from '../desktop/desk'
import type { AppState, CalEvent, Task, WeekLog } from '../../../src/types'
import { seed, TODAY, WEEK_START } from '../desktop/desk'

export { TODAY, WEEK_START }

const T0 = Date.parse('2026-09-10T10:00:00+03:00')

export const TASK_A = 'לקרוא פרק 7 בספר'
export const TASK_B = 'לכתוב סיכום למאמר'
export const GOAL_1 = 'לסיים את פרק הרקע'
export const GOAL_2 = 'שלושה אימונים השבוע'
export const EVENT_TODAY = 'פגישה עם המנחה'

/** זרע קטן ומלא: שתי משימות להיום, אירוע להיום, שתי מטרות לשבוע, ותוכנית אימון ליום שישי */
export const round3Seed = seed((s: AppState) => {
  const tasks: Task[] = [
    { id: 't-a', updatedAt: T0, createdAt: T0, title: TASK_A, trackId: 'trk-study', status: 'todo', due: TODAY, order: 0, est: 1 },
    { id: 't-b', updatedAt: T0, createdAt: T0, title: TASK_B, trackId: 'trk-research', status: 'todo', due: TODAY, order: 1, est: 2 },
  ]
  const events: CalEvent[] = [
    { id: 'e-today', updatedAt: T0, title: EVENT_TODAY, date: TODAY, start: '14:00', end: '15:00', allDay: false, kind: 'personal', touched: true },
  ]
  const week: WeekLog = {
    id: `wk-${WEEK_START}`, updatedAt: T0, weekStart: WEEK_START, items: {}, progress: {},
    goals: [
      { id: 'g-1', text: GOAL_1, trackId: 'trk-research' },
      { id: 'g-2', text: GOAL_2, trackId: 'trk-life' },
    ],
  }
  return {
    ...s,
    settings: { ...s.settings, onboarded: true, name: 'דני', sound: false },
    tasks,
    events,
    weeks: [week],
    workoutPlan: [{ id: 'wd-fri', updatedAt: T0, dow: 5, title: 'רגליים', kind: 'gym', exercises: [{ id: 'ex-squat', name: 'סקוואט', sets: 3, reps: '8', metric: 'weight' }] }],
  }
})

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900

/**
 * כפתור ניווט של הפרופיל הנוכחי. ממוקם בתוך הסרגל עצמו — ליומן יש כפתור "היום" משלו
 * (קפיצה להיום) שמופיע לפני הניווט התחתון בסדר ה-DOM.
 */
export function navBtn(page: Page, label: string): Locator {
  if (isMobile(page)) {
    if (label === 'הגדרות') return page.locator('.topbar').getByRole('button', { name: 'הגדרות', exact: true })
    return page.locator('.bottomnav').getByRole('button', { name: label, exact: true })
  }
  return page.locator('nav.sidebar').getByRole('button', { name: label, exact: true })
}
export async function go(page: Page, label: 'היום' | 'אטלס' | 'יומן' | 'פרויקטים' | 'סקירה' | 'הגדרות') {
  // מגן הקליקים (ui.tsx): טאפ אחד בתוך 350 מ״ש מסגירת גיליון נבלע בכוונה — מחכים לו
  if (isMobile(page)) await page.waitForTimeout(400)
  await navBtn(page, label).click()
  const active = isMobile(page) ? page.locator('.bottomnav button[aria-current="true"]') : page.locator('nav.sidebar button[aria-current="true"]')
  if (label === 'הגדרות' && isMobile(page)) await expect(page.locator('.topbar h1')).toHaveText('הגדרות')
  else await expect(active).toHaveText(new RegExp(label))
}

export const tasksCard = (page: Page) => page.locator('.card', { hasText: 'המשימות של היום' })
export const timerCard = (page: Page) => page.locator('.timer-card')
export const goalsCard = (page: Page) => page.locator('.card', { hasText: 'מטרות־העל של השבוע' })
export const scheduleCard = (page: Page) => page.locator('.card', { hasText: 'הלו״ז של היום' })
export const topSheet = (page: Page) => page.locator('.scrim').last().locator('.sheet')

/** שורת משימה בכרטיס "המשימות של היום" */
export const taskRow = (page: Page, title: string) => tasksCard(page).locator('.item', { hasText: title })

// ---------------------------------------------------------------------------
// נגישות — סריקה בתוך הדף
// ---------------------------------------------------------------------------
export type A11yReport = {
  unnamed: string[]
  dialogsUnnamed: string[]
  dupIds: string[]
  currentNav: number
  /** גלגל השיניים בסרגל העליון (טלפון) מסומן aria-current — ההגדרות לא בניווט התחתון */
  gearCurrent: boolean
}

export async function a11yScan(page: Page): Promise<A11yReport> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const nameOf = (el: Element): string => {
      const al = el.getAttribute('aria-label')
      if (al && al.trim()) return al.trim()
      const lb = el.getAttribute('aria-labelledby')
      if (lb) {
        const t = lb.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim()
        if (t) return t
      }
      const tag = el.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const id = el.getAttribute('id')
        if (id) {
          const l = document.querySelector(`label[for="${CSS.escape(id)}"]`)
          if (l && text(l)) return text(l)
        }
        const wrap = el.closest('label')
        if (wrap) {
          const clone = wrap.cloneNode(true) as HTMLElement
          clone.querySelectorAll('input,textarea,select').forEach((x) => x.remove())
          if (text(clone)) return text(clone)
        }
        const ph = el.getAttribute('placeholder')
        if (ph && ph.trim()) return ph.trim()
        const ti = el.getAttribute('title')
        if (ti && ti.trim()) return ti.trim()
        if (tag === 'select') return text(el) ? 'options' : ''
        return ''
      }
      const t = text(el)
      if (t) return t
      const ti = el.getAttribute('title')
      if (ti && ti.trim()) return ti.trim()
      const img = el.querySelector('img[alt], svg[aria-label], [aria-label]')
      if (img) return (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim()
      return ''
    }
    const describe = (el: Element) => {
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')
      const role = el.getAttribute('role')
      const where = el.closest('.sheet') ? 'sheet' : el.closest('.card') ? 'card:' + text(el.closest('.card')!.querySelector('.card-h, .section-title, b, h2, h3')).slice(0, 20) : 'page'
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${role ? `[role=${role}]` : ''} @ ${where}`
    }
    const sel = 'button, [role="button"], input:not([type="hidden"]), textarea, select, a[href], [role="switch"], [role="checkbox"], [role="tab"]'
    const unnamed: string[] = []
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!visible(el)) continue
      if (!nameOf(el)) unnamed.push(describe(el))
    }
    const dialogsUnnamed: string[] = []
    for (const d of Array.from(document.querySelectorAll('[role="dialog"]'))) {
      if (!visible(d)) continue
      if (!d.getAttribute('aria-label') && !d.getAttribute('aria-labelledby')) dialogsUnnamed.push(describe(d) + ' :: ' + text(d).slice(0, 40))
    }
    const ids = new Map<string, number>()
    for (const el of Array.from(document.querySelectorAll('[id]'))) ids.set(el.id, (ids.get(el.id) ?? 0) + 1)
    const dupIds = Array.from(ids.entries()).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`)
    const navs = Array.from(document.querySelectorAll('nav.sidebar, nav.bottomnav')).filter(visible)
    const currentNav = navs.length ? navs[0].querySelectorAll('button[aria-current="true"]').length : -1
    const gear = document.querySelector('.topbar .iconbtn[aria-label="הגדרות"]')
    const gearCurrent = !!gear && visible(gear) && gear.getAttribute('aria-current') === 'true'
    return { unnamed: Array.from(new Set(unnamed)), dialogsUnnamed, dupIds, currentNav, gearCurrent }
  })
}
