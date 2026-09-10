// ---------------------------------------------------------------------------
// תשתית לבדיקות הטלפון (Pixel 7, מגע).
// - אותה חסימת רשת כמו ב-../fixtures.ts (שום קריאה החוצה), אבל בלי goto אוטומטי,
//   כדי שאפשר יהיה לזרוע מצב, לקבע שעון ולחקות ערכת נושא לפני הטעינה.
// - עוזרי מדידה שרצים בתוך הדף: גלישה אופקית, ילדים שיוצאים מהכרטיס, שטח
//   הפגיעה של כפתורים (elementFromPoint), ניגודיות אמיתית, סדר תווים ב-.ltr.
// ---------------------------------------------------------------------------
import { test as base, expect, type Page } from '@playwright/test'
import { seedState } from '../../../src/seed'
import type { AppState, CalEvent, Session, Task } from '../../../src/types'

export { expect }

export const STORE_KEY = 'life-os-v1'
export const ATLAS_KEY = 'life-os-atlas-cache'

/** יום רביעי 9.9.2026, 08:00 בישראל (UTC+3) — בוקר רגיל של אמצע שבוע */
export const NOW = Date.UTC(2026, 8, 9, 5, 0, 0)
export const TODAY = '2026-09-09'
export const YESTERDAY = '2026-09-08'
export const TOMORROW = '2026-09-10'
export const WEEK_START = '2026-09-06'
export const LAST_WEEK_START = '2026-08-30'

/** אותו הרגע, אבל 19:00 — כדי ש"תכנון מחר" יופיע בכרטיס המשימות */
export const EVENING = Date.UTC(2026, 8, 9, 16, 0, 0)

/** Pixel 7 ב-Playwright: המסך 412×915, אבל אזור הדף (בלי סרגלי הדפדפן) הוא 412×839 */
export const VIEWPORT = { width: 412, height: 839 }
/** גובה משוער של מה שנשאר מהמסך כשהמקלדת פתוחה בטלפון */
export const KEYBOARD_VIEWPORT = { width: 412, height: 460 }

// ---------------------------------------------------------------------------
// זריעה
// ---------------------------------------------------------------------------
export function makeState(patch: Partial<AppState> = {}): AppState {
  const s = seedState()
  return { ...s, ...patch, settings: { ...s.settings, ...(patch.settings ?? {}) } }
}

let seq = 0
const id = (p: string) => `${p}-${++seq}`

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0)

export function task(p: Partial<Task> & { title: string }): Task {
  return { id: id('t'), updatedAt: T0, trackId: 'trk-study', status: 'todo', order: seq, createdAt: T0, ...p }
}
export function event(p: Partial<CalEvent> & { title: string; date: string }): CalEvent {
  return { id: id('e'), updatedAt: T0, allDay: false, kind: 'personal', ...p }
}
export function session(p: Partial<Session> & { endedAt: number; minutes: number }): Session {
  return { id: id('s'), updatedAt: T0, trackId: 'trk-study', startedAt: p.endedAt - p.minutes * 60000, ...p }
}

/** אסימון רגיל בישראל: yyyy-mm-dd + שעה מקומית → אפוק */
export function local(date: string, hh: number, mm = 0): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d, hh - 3, mm, 0)
}

const LONG = 'פגישה עם המנחה על הפרק השני של הסמינר — להביא את הטיוטה, את הטבלאות ואת השאלות הפתוחות 15.9'

/** מצב "עשיר": כל כרטיס במסך היום מלא, כדי שבדיקות הפריסה יראו הכל */
export function richState(): AppState {
  const s = makeState({ settings: { ...seedState().settings, onboarded: false, name: 'יהונתן' } })
  s.tracks.push({ id: 'trk-music', updatedAt: T0, name: 'גיטרה ומוזיקה', emoji: '🎸', color: '#ffb224', order: 4, board: true })
  s.tasks = [
    task({ title: 'לקרוא את פרק 3 בספר הלימוד', due: TODAY, est: 2 }),
    task({ title: LONG, due: TODAY, est: 1, critical: true, trackId: 'trk-research' }),
    task({ title: 'להגיש תרגיל 4 באלגברה', due: '2026-09-05', est: 1, status: 'doing' }),
    task({ title: 'לשלוח מייל למנחה', due: '2026-09-01', trackId: 'trk-research' }),
    task({ title: 'לתקן את הבאג בסנכרון', trackId: 'trk-project', est: 3 }),
    task({ title: 'לקנות מיתרים', trackId: 'trk-music', est: 1, sub: [{ id: 'sb1', text: 'לבדוק מידה', done: true }, { id: 'sb2', text: 'להזמין', done: false }] }),
    task({ title: 'משימה שהושלמה הבוקר', due: TODAY, status: 'done', doneAt: local(TODAY, 7, 45) }),
    task({ title: 'ממתין לתשובה מהמזכירות', status: 'waiting', trackId: 'trk-life' }),
    task({ title: 'משימה קריטית לשבוע הבא', due: '2026-09-15', critical: true, est: 2 }),
  ]
  s.events = [
    event({ title: 'יום הולדת לסבתא', date: '1950-09-09', allDay: true, kind: 'birthday', yearly: true, remind: [14, 3] }),
    event({ title: 'יום הולדת לעידו', date: '2001-09-12', allDay: true, kind: 'birthday', yearly: true, remind: [3] }),
    event({ title: 'צום גדליה', date: TODAY, allDay: true, kind: 'holiday', eve: false }),
    event({ title: 'מבחן במרוכבות', date: '2026-09-12', allDay: true, kind: 'exam' }),
    event({ title: 'הגשת סמינר — טיוטה ראשונה', date: '2026-09-19', allDay: true, kind: 'deadline', trackId: 'trk-research' }),
    event({ title: 'אבן דרך: גרסה 1.0', date: '2026-09-29', allDay: true, kind: 'milestone', trackId: 'trk-project' }),
    event({ title: 'סוף הסמסטר', date: '2027-01-20', allDay: true, kind: 'deadline' }),
    event({ title: 'שיעור גיטרה עם יוסי ברחוב הרצל 15.9', date: TODAY, start: '19:00', end: '20:00', kind: 'personal', trackId: 'trk-music' }),
    event({ title: LONG, date: TODAY, start: '12:45', end: '13:15', kind: 'personal', trackId: 'trk-research' }),
    event({ title: 'טיסה לברלין', date: '2026-09-29', endDate: '2026-10-06', allDay: true, kind: 'personal', capacity: 1 }),
    event({ title: 'הרצאה חופפת', date: TODAY, start: '09:00', end: '10:30', kind: 'personal' }),
  ]
  s.sessions = [
    session({ endedAt: local(TODAY, 7, 20), minutes: 45, label: 'קריאה' }),
    session({ endedAt: local(YESTERDAY, 16, 0), minutes: 90, trackId: 'trk-research' }),
    session({ endedAt: local('2026-09-02', 11, 0), minutes: 120 }),
    session({ endedAt: local('2026-09-03', 15, 0), minutes: 60, trackId: 'trk-project' }),
    session({ endedAt: local('2026-08-26', 15, 0), minutes: 200 }),
  ]
  s.days = [
    { id: `day-${YESTERDAY}`, updatedAt: T0, date: YESTERDAY, wake: 'ontime', habits: { 'hb-morning': true }, steps: {} },
  ]
  s.weeks = [
    {
      id: `wk-${WEEK_START}`, updatedAt: T0, weekStart: WEEK_START, items: { 'wk-family': true }, progress: { 'wk-guitar': 45 },
      goals: [
        { id: 'g1', text: 'לסיים את הפרק הראשון בסמינר', trackId: 'trk-research' },
        { id: 'g2', text: 'שלושה אימונים', trackId: 'trk-life', done: true },
      ],
    },
  ]
  s.weekly.push(
    { id: 'wk-guitar', updatedAt: T0, name: 'גיטרה', emoji: '🎸', order: 5, kind: 'progress', targetMinutes: 120, trackId: 'trk-music' },
    { id: 'wk-g1', updatedAt: T0, group: 'gf', name: 'ערב', emoji: '🌆', order: 6, kind: 'check' },
    { id: 'wk-g2', updatedAt: T0, group: 'gf', name: 'שיחה ארוכה', emoji: '📞', order: 7, kind: 'check' },
    { id: 'wk-g3', updatedAt: T0, group: 'gf', name: 'סופ״ש', emoji: '🏝️', order: 8, kind: 'check' },
  )
  s.phases = [
    { id: 'ph1', updatedAt: T0, name: 'ספרינט לפני המבחנים', from: '2026-09-01', to: '2026-10-15', color: '#5b5bd6', focus: 'סמינר קודם, אחר כך מרוכבות', rule: 'בוקר — סמינר. אחה״צ — מרוכבות.' },
  ]
  s.workoutPlan = [
    {
      id: 'wd-wed', updatedAt: T0, dow: 3, title: 'חזה וכתפיים', kind: 'gym', focus: 'חיזוק שרירי החזה, הכתפיים והיד האחורית',
      exercises: [
        { id: 'ex-bench', name: 'לחיצת חזה', sets: 3, reps: '8-10', metric: 'weight', note: 'לאט בירידה' },
        { id: 'ex-pullup', name: 'מתח', sets: 3, reps: 'מקסימום', metric: 'bodyweight' },
        { id: 'ex-lsit', name: 'L-Sit', sets: 3, metric: 'time' },
        { id: 'ex-pushup', name: 'שכיבות סמיכה', sets: 3, reps: '15', metric: 'reps' },
      ],
    },
    { id: 'wd-sun', updatedAt: T0, dow: 0, title: 'ריצה קלה', kind: 'run', exercises: [] },
    { id: 'wd-fri', updatedAt: T0, dow: 5, title: 'רגליים', kind: 'gym', exercises: [{ id: 'ex-squat', name: 'סקוואט', sets: 4, reps: '6', metric: 'weight' }] },
  ]
  s.workouts = [
    { id: 'wo-1', updatedAt: T0, date: '2026-09-02', dayId: 'wd-wed', title: 'חזה וכתפיים', kind: 'gym', sets: { 'ex-bench': [{ kg: 40, reps: 8 }, { kg: 40, reps: 8 }, { kg: 42.5, reps: 6 }], 'ex-lsit': [{ sec: 20 }] }, finishedAt: local('2026-09-02', 18, 40) },
    { id: 'wo-2', updatedAt: T0, date: '2026-09-06', dayId: 'wd-sun', title: 'ריצה קלה', kind: 'run', sets: {}, km: 5.5, minutes: 31, finishedAt: local('2026-09-06', 18, 40) },
  ]
  return s
}

/** מהדורת חדשות במבנה של docs/news/latest.json */
export function edition(date = TODAY) {
  const story = (i: number) => ({
    headline: `כותרת ${i}: מה קרה הבוקר ולמה זה חשוב יותר ממה שנדמה`,
    body: 'גוף הכתבה. שלושה משפטים על מה שקרה, מי אמר מה, ומה זה אומר על מחר.\n\nעוד פסקה קצרה עם מספרים: 12.5 מיליארד, 3 שנים, 08:30 בבוקר.',
  })
  return {
    date,
    title: 'חדשות הבוקר · רביעי, 9 בספטמבר',
    minutes: 20,
    intro: 'בוקר טוב. זה מה שקרה.',
    sections: [
      { key: 'israel', title: 'ישראל', stories: [story(1), story(2), story(3)] },
      { key: 'tech', title: 'טכנולוגיה, מתמטיקה וכלכלה', stories: [story(4), story(5), story(6)] },
      { key: 'culture', title: 'העולם התרבותי', stories: [story(7), story(8), story(9)] },
    ],
  }
}

export function atlasCache(withMessages = 8) {
  const messages = []
  for (let i = 0; i < withMessages; i++) {
    const mine = i % 2 === 0
    messages.push({
      id: `m${i}`,
      at: new Date(NOW - (withMessages - i) * 3600_000).toISOString(),
      from: mine ? 'user' : 'atlas',
      text: mine ? `קבעתי רופא שיניים ביום שלישי ב-16:00, שעה. הודעה מספר ${i}` : `סגור. הוספתי ליומן ביום שלישי 16:00–17:00. זה מה שעשיתי (${i}):`,
      commands: mine ? undefined : [{ id: `c${i}`, op: 'addEvent', title: 'רופא שיניים', date: '2026-09-15', start: '16:00', end: '17:00' }],
    })
  }
  return { messages, today: { date: TODAY, text: 'בוקר טוב. היום יש בלוק עמוק אחד ארוך ומבחן בעוד שלושה ימים — הבוקר לסמינר, אחה״צ למרוכבות.' }, undo: {} }
}

// ---------------------------------------------------------------------------
// פתיחה
// ---------------------------------------------------------------------------
export type OpenOpts = {
  state?: AppState
  /** אפוק לקיבוע השעון; null = שעון אמיתי */
  now?: number | null
  colorScheme?: 'dark' | 'light'
  news?: any
  atlas?: any
  /** עיכוב מלאכותי ל-CSS של Google Fonts (מ״ש) */
  fontsDelayMs?: number
  goto?: boolean
}

export async function openApp(page: Page, opts: OpenOpts = {}): Promise<string[]> {
  const errors: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost:5173')) return route.continue()
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      const done = () => route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      if (opts.fontsDelayMs) return void setTimeout(done, opts.fontsDelayMs)
      return done()
    }
    return route.abort()
  })
  // חדשות הבוקר — מוגשות מהמקום (docs/news לא מוגש משרת הפיתוח)
  await page.route('**/news/latest.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.news ?? {}) }),
  )
  page.on('console', (m) => {
    if (m.type() === 'error' && !/net::ERR_FAILED|net::ERR_ABORTED/.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  if (opts.now !== null) await page.clock.setFixedTime(opts.now ?? NOW)
  if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme })

  const state = opts.state ?? makeState()
  await page.addInitScript(
    ({ k, v, ak, av }) => {
      localStorage.setItem(k, v)
      if (av) localStorage.setItem(ak, av)
      else localStorage.removeItem(ak)
    },
    { k: STORE_KEY, v: JSON.stringify(state), ak: ATLAS_KEY, av: opts.atlas ? JSON.stringify(opts.atlas) : '' },
  )
  if (opts.goto !== false) {
    await page.goto('/')
    await expect(page.locator('.bottomnav button')).toHaveCount(5)
  }
  return errors
}

export async function readState(page: Page): Promise<AppState> {
  // ההתמדה מושהית ב-250 מ״ש — מחכים לה
  await page.waitForTimeout(400)
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY)
}

export async function nav(page: Page, label: 'היום' | 'אטלס' | 'יומן' | 'פרויקטים' | 'סקירה') {
  await page.locator('.bottomnav button', { hasText: label }).click()
}
export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'הגדרות' }).click()
  await expect(page.locator('.topbar h1')).toHaveText('הגדרות')
}

export const test = base.extend<{ errors: string[] }>({
  errors: async ({}, use) => {
    await use([])
  },
})

// ---------------------------------------------------------------------------
// מדידות בתוך הדף
// ---------------------------------------------------------------------------
export type Box = { x: number; y: number; w: number; h: number }
export type Offender = { el: string; box: Box; note?: string }

export type LayoutReport = {
  scrollWidth: number
  /** רוחב ה-layout viewport. בטלפון הוא *גדל* כשתוכן גולש — הדף כולו מתרחק (zoom-out) */
  innerWidth: number
  /** רוחב המסך ב-CSS px — המספר שאסור לעבור */
  screenWidth: number
  overflowX: Offender[]
  cardOverflow: Offender[]
  clippedText: Offender[]
}

/** האם יש גלישה אופקית, אילו אלמנטים חורגים מהמסך, ואילו חורגים מהכרטיס שלהם */
export async function layoutReport(page: Page, root = 'body'): Promise<LayoutReport> {
  return page.evaluate((rootSel) => {
    const rootEl = document.querySelector(rootSel) ?? document.body
    const desc = (el: Element) => {
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.')
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` «${txt}»` : ''}`
    }
    const box = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
    const visible = (el: Element) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
      if (el.classList.contains('sr')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const inScroller = (el: Element, stop: Element) => {
      let a = el.parentElement
      while (a && a !== stop) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true
        a = a.parentElement
      }
      return false
    }
    // בטלפון (mobile emulation / Android Chrome) innerWidth מתרחב יחד עם התוכן,
    // ולכן משווים לרוחב המסך האמיתי ולא ל-innerWidth
    const W = Math.min(window.innerWidth, screen.width || window.innerWidth)
    const overflowX: any[] = []
    const all = Array.from(rootEl.querySelectorAll<HTMLElement>('*'))
    for (const el of all) {
      if (!visible(el)) continue
      if (inScroller(el, document.documentElement)) continue
      const r = el.getBoundingClientRect()
      if (r.right > W + 1 || r.left < -1) overflowX.push({ el: desc(el), box: box(r) })
    }
    const cardOverflow: any[] = []
    for (const card of Array.from(rootEl.querySelectorAll<HTMLElement>('.card, .sheet, .qcard, .kcard, .bubble'))) {
      if (!visible(card)) continue
      const cr = card.getBoundingClientRect()
      for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
        if (!visible(el)) continue
        if (inScroller(el, card)) continue
        const r = el.getBoundingClientRect()
        if (r.right > cr.right + 1 || r.left < cr.left - 1) {
          cardOverflow.push({ el: desc(el), box: box(r), note: `card ${desc(card)} ${JSON.stringify(box(cr))}` })
        }
      }
    }
    // טקסט שנחתך בלי כוונה (לא .truncate/.clamp2/צ׳יפ)
    const clippedText: any[] = []
    for (const el of all) {
      if (!visible(el)) continue
      if (el.matches('.truncate, .clamp2, .chip, .pill, .kcard .t, .cd .t > div, .bubble-text, select, input, textarea')) continue
      const cs = getComputedStyle(el)
      if (!(cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflow === 'hidden')) continue
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim())) continue
      if (el.scrollWidth > el.clientWidth + 1) clippedText.push({ el: desc(el), box: box(el.getBoundingClientRect()), note: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` })
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, screenWidth: screen.width, overflowX, cardOverflow, clippedText }
  }, root)
}

/** תוויות סרגל הניווט התחתון — חמש, לא נחתכות, בתוך הכפתור */
export async function navLabelsReport(page: Page) {
  return page.evaluate(() => {
    const out: any[] = []
    for (const b of Array.from(document.querySelectorAll<HTMLElement>('.bottomnav button'))) {
      const r = b.getBoundingClientRect()
      const tn = Array.from(b.childNodes).find((n) => n.nodeType === 3 && (n.textContent || '').trim())
      let text = ''
      let tr: DOMRect | null = null
      if (tn) {
        const rg = document.createRange()
        rg.selectNodeContents(tn)
        tr = rg.getBoundingClientRect()
        text = (tn.textContent || '').trim()
      }
      out.push({
        text,
        btn: { w: Math.round(r.width), h: Math.round(r.height) },
        label: tr ? { l: Math.round(tr.left), r: Math.round(tr.right), t: Math.round(tr.top), b: Math.round(tr.bottom) } : null,
        inside: tr ? tr.left >= r.left - 0.5 && tr.right <= r.right + 0.5 && tr.bottom <= r.bottom + 0.5 : false,
        clipped: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1,
        fontSize: getComputedStyle(b).fontSize,
      })
    }
    return out
  })
}

/** גוללים לתחתית ובודקים שהכרטיס האחרון נגמר מעל סרגל הניווט */
export async function lastContentAboveNav(page: Page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const nav = document.querySelector('.bottomnav')!.getBoundingClientRect()
    let lastBottom = -Infinity
    let last = ''
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.main > *, .main .page > *, .main .stack > *, .main .sec > *, .main .card'))) {
      const r = el.getBoundingClientRect()
      if (r.height === 0) continue
      if (r.bottom > lastBottom) {
        lastBottom = r.bottom
        last = el.className
      }
    }
    return { lastBottom: Math.round(lastBottom), navTop: Math.round(nav.top), last, scrollY: window.scrollY, scrollH: document.documentElement.scrollHeight }
  })
}

/** מצב הגיליון העליון: גולל בפנים? שורת הפעולות בתוך המסך? */
export async function sheetReport(page: Page) {
  return page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll<HTMLElement>('.sheet'))
    const sh = sheets[sheets.length - 1]
    if (!sh) return null
    const cs = getComputedStyle(sh)
    const r = sh.getBoundingClientRect()
    const act = sh.querySelector<HTMLElement>('.sheet-actions')
    const ar = act?.getBoundingClientRect()
    const H = window.innerHeight
    const focused = document.activeElement as HTMLElement | null
    const fr = focused && focused !== document.body ? focused.getBoundingClientRect() : null
    return {
      overflowY: cs.overflowY,
      scrollHeight: sh.scrollHeight,
      clientHeight: sh.clientHeight,
      scrolls: sh.scrollHeight > sh.clientHeight + 1,
      sheet: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
      actions: ar ? { top: Math.round(ar.top), bottom: Math.round(ar.bottom), visible: ar.top >= 0 && ar.bottom <= H + 1 } : null,
      focused: fr ? { tag: focused!.tagName, top: Math.round(fr.top), bottom: Math.round(fr.bottom), visible: fr.top >= 0 && fr.bottom <= H + 1 } : null,
      innerHeight: H,
    }
  })
}

// ---------------------------------------------------------------------------
// שטח פגיעה — נמדד ב-elementFromPoint, כך ש-::before שמרחיב את האזור נספר
// ---------------------------------------------------------------------------
export type Hit = { el: string; w: number; h: number; hitW: number; hitH: number; covered?: boolean; box: Box }

export async function touchTargets(page: Page, root = 'body', max = 400): Promise<Hit[]> {
  return page.evaluate(
    ({ rootSel, max }) => {
      const rootEl = document.querySelector(rootSel) ?? document.body
      const sel = 'button, [role="button"], .check, .chip, .tag, .switch, .setchip, .vote, .pm, .cal-cell, a[href], label.btn'
      const desc = (el: Element) => {
        const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.')
        const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` «${txt}»` : ''}`
      }
      const out: any[] = []
      const els = Array.from(rootEl.querySelectorAll<HTMLElement>(sel)).filter((el) => {
        if ((el as HTMLButtonElement).disabled) return false
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false
        if (el.classList.contains('sr')) return false
        // צ׳יפ שאינו כפתור הוא תווית, לא יעד מגע
        if (el.classList.contains('chip') && el.tagName !== 'BUTTON') return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      const hit = (el: Element, x: number, y: number) => {
        const t = document.elementFromPoint(x, y)
        return !!t && (t === el || el.contains(t))
      }
      let n = 0
      for (const el of els) {
        if (n++ >= max) break
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        const r = el.getBoundingClientRect()
        const cx = Math.round(r.left + r.width / 2)
        const cy = Math.round(r.top + r.height / 2)
        const H = window.innerHeight
        const W = window.innerWidth
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue
        const covered = !hit(el, cx, cy)
        let l = cx
        let rr = cx
        let t = cy
        let b = cy
        if (!covered) {
          while (l > 0 && cx - l < 60 && hit(el, l - 1, cy)) l--
          while (rr < W - 1 && rr - cx < 60 && hit(el, rr + 1, cy)) rr++
          while (t > 0 && cy - t < 60 && hit(el, cx, t - 1)) t--
          while (b < H - 1 && b - cy < 60 && hit(el, cx, b + 1)) b++
        }
        out.push({
          el: desc(el),
          w: Math.round(r.width),
          h: Math.round(r.height),
          hitW: covered ? 0 : rr - l + 1,
          hitH: covered ? 0 : b - t + 1,
          covered,
          box: { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        })
      }
      window.scrollTo(0, 0)
      return out
    },
    { rootSel: root, max },
  )
}

// ---------------------------------------------------------------------------
// ניגודיות — צבע הטקסט מול הרקע האפקטיבי (עם שקיפות ו-opacity)
// ---------------------------------------------------------------------------
export type ContrastRow = {
  el: string
  fg: string
  bg: string
  ratio: number
  size: number
  weight: number
  need: number
  ok: boolean
  strictOk: boolean
}

export async function contrastReport(page: Page, selector: string, root = 'body'): Promise<ContrastRow[]> {
  return page.evaluate(
    ({ selector, rootSel }) => {
      const rootEl = document.querySelector(rootSel) ?? document.body
      const cv = document.createElement('canvas')
      cv.width = cv.height = 1
      const ctx = cv.getContext('2d', { willReadFrequently: true })!
      const toRGBA = (s: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = s
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2], d[3] / 255]
      }
      const over = (top: number[], bot: number[]) => {
        const a = top[3]
        return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]
      }
      const lum = (c: number[]) => {
        const f = (v: number) => {
          const x = v / 255
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const contrast = (a: number[], b: number[]) => {
        const la = lum(a)
        const lb = lum(b)
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
      }
      const hex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
      const desc = (el: Element) => {
        const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.')
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` «${txt}»` : ''}`
      }
      const bgOf = (el: Element) => {
        const layers: number[][] = []
        let a: Element | null = el
        while (a) {
          const c = toRGBA(getComputedStyle(a).backgroundColor)
          if (c[3] > 0) {
            layers.push(c)
            if (c[3] >= 0.999) break
          }
          a = a.parentElement
        }
        if (!layers.length) return [255, 255, 255, 1]
        let out = layers[layers.length - 1]
        for (let i = layers.length - 2; i >= 0; i--) out = over(layers[i], out)
        return out
      }
      const opacityOf = (el: Element) => {
        let o = 1
        let a: Element | null = el
        while (a && a !== document.body) {
          o *= Number(getComputedStyle(a).opacity)
          a = a.parentElement
        }
        return o
      }
      const rows: any[] = []
      for (const el of Array.from(rootEl.querySelectorAll<HTMLElement>(selector))) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim())) continue
        const bg = bgOf(el)
        const op = opacityOf(el)
        let fg = toRGBA(cs.color)
        fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg)
        const size = parseFloat(cs.fontSize)
        const weight = Number(cs.fontWeight) || 400
        const large = size >= 24 || (size >= 18.66 && weight >= 700)
        const need = large || weight >= 700 ? 3 : 4.5
        const ratio = contrast(fg, bg)
        rows.push({ el: desc(el), fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100, size, weight, need, ok: ratio >= need, strictOk: ratio >= (large ? 3 : 4.5) })
      }
      return rows.sort((a, b) => a.ratio - b.ratio)
    },
    { selector, rootSel: root },
  )
}

// ---------------------------------------------------------------------------
// טיפוגרפיה: סדר תווים ב-.ltr, ותווים שנחתכו ב-.truncate
// ---------------------------------------------------------------------------
export async function ltrOrderReport(page: Page, selector = '.ltr') {
  return page.evaluate((selector) => {
    const bad: any[] = []
    let checked = 0
    const walker = (el: Element): Text[] => {
      const out: Text[] = []
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n: Node | null
      while ((n = w.nextNode())) if ((n.textContent || '').trim()) out.push(n as Text)
      return out
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!/\d/.test(text)) continue
      const rects: Array<{ ch: string; x: number; y: number }> = []
      for (const tn of walker(el)) {
        const s = tn.textContent || ''
        for (let i = 0; i < s.length; i++) {
          if (!/[0-9:.–\-/]/.test(s[i])) continue
          const rg = document.createRange()
          rg.setStart(tn, i)
          rg.setEnd(tn, i + 1)
          const cr = rg.getBoundingClientRect()
          if (cr.width === 0) continue
          rects.push({ ch: s[i], x: cr.left, y: Math.round(cr.top) })
        }
      }
      checked++
      // באותה שורה — כל תו חייב להיות מימין לקודמו (ב-LTR: x עולה)
      for (let i = 1; i < rects.length; i++) {
        if (rects[i].y !== rects[i - 1].y) continue
        if (rects[i].x < rects[i - 1].x - 0.5) {
          bad.push({ el: el.className, text, at: `${rects[i - 1].ch}→${rects[i].ch}`, x: [Math.round(rects[i - 1].x), Math.round(rects[i].x)] })
          break
        }
      }
    }
    return { checked, bad }
  }, selector)
}

/** ספרות שנמצאות מחוץ לתיבה הנראית של אלמנט חותך (truncate) — "15.9" שהפך ל-"9" */
export async function clippedDigitsReport(page: Page, selector = '.truncate') {
  return page.evaluate((selector) => {
    const out: any[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n: Node | null
      const lost: string[] = []
      let text = ''
      while ((n = w.nextNode())) {
        const s = n.textContent || ''
        text += s
        for (let i = 0; i < s.length; i++) {
          if (!/[0-9]/.test(s[i])) continue
          const rg = document.createRange()
          rg.setStart(n, i)
          rg.setEnd(n, i + 1)
          const cr = rg.getBoundingClientRect()
          if (cr.left < r.left - 0.5 || cr.right > r.right + 0.5) lost.push(s[i])
        }
      }
      if (lost.length) out.push({ el: el.className, text: text.trim().slice(0, 60), lostDigits: lost.join('') })
    }
    return out
  }, selector)
}

// ---------------------------------------------------------------------------
// מגע דרך CDP — נוגע בצינור המחוות האמיתי של הדפדפן (גלילה, לחיצה ארוכה)
// ---------------------------------------------------------------------------
export async function cdpSwipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { steps?: number; holdMs?: number; stepMs?: number } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const steps = opts.steps ?? 8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
  if (opts.holdMs) await page.waitForTimeout(opts.holdMs)
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
    await page.waitForTimeout(opts.stepMs ?? 16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

export const fmt = (o: unknown) => JSON.stringify(o, null, 1)
