// ---------------------------------------------------------------------------
// תשתית לסימולציית שבוע שלם — רצה גם במחשב (סרגל צד) וגם בטלפון (ניווט תחתון).
// מרחיבה את tests/e2e/desktop/desk.ts (שעון מזויף + זריעה + איסוף שגיאות).
//
// עקרונות:
//  - הזמן זז רק קדימה. בלי טיימר רץ — קפיצה (fastForward). עם טיימר רץ —
//    "עבודה": קפיצות של 150 שנ׳ כדי שהדופק (20 שנ׳) יספיק לרוץ בכל קפיצה
//    ולא יזהה "פער של יותר משלוש דקות" ויעצור את הסשן.
//  - "יום חדש" = קפיצה בזמן + רענון הדף, כמו לפתוח את האפליקציה בבוקר.
// ---------------------------------------------------------------------------
import type { Page } from '@playwright/test'
import { test as base, expect, seed, reload } from '../desktop/desk'
import type { AppState, CalEvent, Task, WorkoutDay } from '../../../src/types'

export { expect, reload }
export const test = base

export type NavLabel = 'היום' | 'אטלס' | 'יומן' | 'פרויקטים' | 'סקירה'

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900

/** ניווט לפי הפרופיל: סרגל צד במחשב, ניווט תחתון בטלפון */
export async function nav(page: Page, label: NavLabel) {
  if (isMobile(page)) {
    await page.locator('.bottomnav button', { hasText: label }).click()
    await expect(page.locator('.bottomnav button[aria-current="true"]')).toHaveText(new RegExp(label))
  } else {
    await page.locator('nav.sidebar').getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('nav.sidebar button[aria-current="true"]')).toHaveText(new RegExp(label))
  }
}

/** ההגדרות — גלגל השיניים בסרגל העליון (טלפון) או בתחתית סרגל הצד (מחשב) */
export async function settings(page: Page) {
  // getByRole מתעלם מאלמנטים מוסתרים, ולכן נשאר רק הכפתור של הפרופיל הנוכחי
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click()
  if (isMobile(page)) await expect(page.locator('.topbar h1')).toHaveText('הגדרות')
  else await expect(page.locator('nav.sidebar button[aria-current="true"]')).toHaveText('הגדרות')
}

const at = (iso: string) => Date.parse(iso.includes('+') ? iso : iso + '+03:00')

/** הזמן הנוכחי של הדף (השעון המזויף) */
export const pageNow = (page: Page) => page.evaluate(() => Date.now())

/**
 * קפיצה קדימה לרגע נתון (ISO ישראל). בלי טיימר רץ בלבד — קפיצה ארוכה עם
 * טיימר רץ נחשבת "המחשב ישן" והסשן נעצר בדופק האחרון (וזה נכון, אבל לא מה
 * שרוצים כאן). מפעילה את הטיימרים פעם אחת בסוף — הדף מצטייר מחדש עם הזמן החדש.
 */
export async function jumpTo(page: Page, iso: string) {
  const target = at(iso)
  const now = await pageNow(page)
  if (target < now) throw new Error(`jumpTo backwards: ${iso} < ${new Date(now).toISOString()}`)
  if (target === now) return
  await page.clock.fastForward(target - now)
  // הדופק/הטיק רצו פעם אחת — מחכים לציור מחדש
  await page.clock.runFor(50)
}

/** יום חדש: קופצים בזמן ומרעננים — כמו לפתוח את האפליקציה בבוקר */
export async function newDay(page: Page, iso: string) {
  await jumpTo(page, iso)
  await reload(page)
}

/**
 * "עבודה" בזמן שהטיימר רץ: מקדמים דקות בקפיצות של 150 שנ׳ — כל קפיצה מפעילה
 * את הדופק (20 שנ׳) פעם אחת, הפער נשאר מתחת ל-3 דקות, והסשן לא נעצר.
 */
export async function work(page: Page, minutes: number) {
  let left = minutes * 60_000
  while (left > 0) {
    const step = Math.min(150_000, left)
    await page.clock.fastForward(step)
    left -= step
  }
  await page.clock.runFor(1_100)
}

/**
 * הסקירה על השבוע הנוכחי. כשיש "סקירה ממתינה" (גם השגויה של פגם #2) המסך
 * נפתח על השבוע שעבר — לוחצים "השבוע" כדי לראות את המספרים של עכשיו.
 */
export async function openReview(page: Page) {
  await nav(page, 'סקירה')
  // הכפתור קיים רק כשהמסך לא על השבוע הנוכחי
  const btn = page.getByRole('button', { name: 'השבוע', exact: true })
  if (await btn.isVisible()) await btn.click()
  await expect(page.locator('.sec-h, .sec .spread').filter({ hasText: 'שבוע' }).first().locator('.chip', { hasText: 'בעיצומו' })).toBeVisible()
}

/** גודל המצב השמור בבייטים (UTF-8) */
export async function storageBytes(page: Page): Promise<number> {
  return page.evaluate(() => new Blob([localStorage.getItem('life-os-v1') || '']).size)
}

/** זמן ציור של מסך "היום" — מרגע הניווט אליו עד שהטבעת נראית */
export async function todayRenderMs(page: Page): Promise<number> {
  const t0 = Date.now()
  await nav(page, 'היום')
  await expect(page.locator('.timer-card .ring-wrap .n')).toBeVisible()
  return Date.now() - t0
}

// ---------------------------------------------------------------------------
// עוזרי מסך
// ---------------------------------------------------------------------------
export const timerCard = (page: Page) => page.locator('.timer-card')
export const tasksCard = (page: Page) => page.locator('.card', { hasText: 'המשימות של היום' })
export const habitsCard = (page: Page) => page.locator('.card', { hasText: 'הרגלי היום' })
export const habitsCounter = (page: Page) => habitsCard(page).locator('.card-h .tiny.faint.ltr, .spread .tiny.faint.ltr').first()
export const weeklyCard = (page: Page) => page.locator('.card', { hasText: 'אסימונים צפים' })
export const scheduleCard = (page: Page) => page.locator('.card', { hasText: 'הלו״ז של היום' })
export const workoutCard = (page: Page) => page.locator('.card', { has: page.locator('.wk-strip') })
export const whatNow = (page: Page) => page.locator('.card.rail', { hasText: /עכשיו|הבא בתור/ }).first()
export const dayList = (page: Page) => page.locator('.card', { has: page.locator('input[placeholder="+ משימה ליום הזה…"]') })
/** הברכה ("בוקר טוב, דני") קיימת רק במחשב — בטלפון הסרגל העליון מציג את שם המסך */
export const greeting = (page: Page) => page.locator('.desk-head h1')
/** התאריך של היום הלוגי: בכותרת המסך במחשב, בסרגל העליון בטלפון */
export const sub = (page: Page) => (isMobile(page) ? page.locator('.topbar .sub') : page.locator('.desk-head .sub'))

/** בוחר תאריך בגיליון "בחירת תאריך" שנפתח מהכפתור הנתון (אותו חודש) */
export async function pickDay(page: Page, opener: ReturnType<Page['locator']>, day: number) {
  await opener.click()
  const dp = page.getByRole('dialog', { name: 'בחירת תאריך' })
  await expect(dp).toBeVisible()
  await dp.locator('.cal-cell:not(.out)', { hasText: new RegExp(`^${day}$`) }).click()
  await expect(dp).toBeHidden()
}

/**
 * פגם ידוע (ראו defects.spec + הדוח): ביום הסקירה הנעילה קופצת ברגע שיש *איזשהו*
 * נתון במכשיר — גם כשהשבוע שהיא רוצה לסכם ריק לגמרי. המשתמש לוחץ "אמלא אחר כך".
 * מחזיר true אם הנעילה הופיעה, כדי שהמסע יוכל לתעד את זה.
 */
export async function unlockIfLocked(page: Page): Promise<boolean> {
  const lock = page.locator('.lock-overlay')
  const shown = await lock.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)
  if (!shown) return false
  await lock.getByRole('button', { name: 'אמלא אחר כך' }).click()
  await expect(lock).toHaveCount(0)
  return true
}

/** עונה על שני כרטיסי הבוקר */
export async function answerMorning(page: Page, wake: 'ontime' | 'late', sleep: 'good' | 'bad') {
  const wakeBtn = page.getByRole('button', { name: wake === 'ontime' ? 'כן, קמתי בזמן' : 'לא, מאוחר', exact: true })
  await expect(wakeBtn).toBeVisible()
  await wakeBtn.click()
  await unlockIfLocked(page)
  await expect(page.locator('.card', { hasText: 'קמת היום בשעה' })).toHaveCount(0)
  const sleepBtn = page.getByRole('button', { name: sleep === 'good' ? 'ישנתי טוב' : 'לא ישנתי טוב', exact: true })
  await expect(sleepBtn).toBeVisible()
  await sleepBtn.click()
  await expect(page.locator('.card', { hasText: 'איך ישנת אתמול' })).toHaveCount(0)
}

/** סיום הטיימר ושמירה, ואימות הטוסט */
export async function stopAndSave(page: Page, expectMinutes: number) {
  await timerCard(page).getByRole('button', { name: /סיים ושמור/ }).click()
  await expect(page.locator('.toast')).toContainText(`${expectMinutes} דקות נשמרו`)
  await expect(timerCard(page)).not.toHaveClass(/live/)
}

// ---------------------------------------------------------------------------
// הזרע של השבוע: התקנה שכבר עברה את כרטיס ההסבר, משימות עם הערכות אסימונים
// לכל יום, מבחן ביום חמישי, ותוכנית אימונים (ריצה בראשון, חזה ברביעי).
// ---------------------------------------------------------------------------
export const SUN = '2026-09-13'
export const MON = '2026-09-14'
export const TUE = '2026-09-15'
export const WED = '2026-09-16'
export const THU = '2026-09-17'
export const FRI = '2026-09-18'
export const SAT = '2026-09-19'
export const NEXT_SUN = '2026-09-20'
export const NEXT_MON = '2026-09-21'
export const BIRTHDAY = '2026-09-29'

const T0 = Date.parse('2026-09-12T10:00:00+03:00')
let n = 0
const task = (p: Partial<Task> & { id: string; title: string }): Task => ({
  trackId: 'trk-study', status: 'todo', order: n++, updatedAt: T0, createdAt: T0, ...p,
})

export const TASKS: Task[] = [
  task({ id: 't-sun-read', title: 'לקרוא פרק 3', due: SUN, est: 2 }),
  task({ id: 't-sun-intro', title: 'לכתוב טיוטה למבוא', trackId: 'trk-research', due: SUN, est: 1 }),
  task({ id: 't-mon-ex', title: 'תרגיל 4 באלגברה', due: MON, est: 2 }),
  task({ id: 't-tue-bug', title: 'לתקן באג בסנכרון', trackId: 'trk-project', due: TUE, est: 1 }),
  task({ id: 't-wed-paper', title: 'לקרוא מאמר', trackId: 'trk-research', due: WED, est: 2 }),
  task({ id: 't-thu-q', title: 'להכין שאלות למבחן', due: THU, est: 1 }),
  task({ id: 't-fri-docs', title: 'סידור מסמכים', trackId: 'trk-life', due: FRI, est: 1 }),
  task({ id: 't-fri-sum', title: 'לסכם הרצאה', due: FRI, est: 2 }),
  // המאגר — בלי תאריך; נמשך בשלב המשימות של המעבר השבועי
  task({ id: 't-pool-sota', title: 'לקרוא על SOTA', trackId: 'trk-research', est: 1 }),
  task({ id: 't-pool-landing', title: 'לבנות דף נחיתה', trackId: 'trk-project', est: 3 }),
  task({ id: 't-pool-ch2', title: 'לכתוב את פרק 2', trackId: 'trk-research', est: 4 }),
]

export const EVENTS: CalEvent[] = [
  { id: 'ev-exam', updatedAt: T0, title: 'מבחן באלגברה', date: THU, allDay: true, kind: 'exam', touched: true },
]

export const PLAN: WorkoutDay[] = [
  { id: 'wd-sun', updatedAt: T0, dow: 0, title: 'ריצה קלה', kind: 'run', exercises: [] },
  {
    id: 'wd-wed', updatedAt: T0, dow: 3, title: 'חזה וכתפיים', kind: 'gym',
    exercises: [
      { id: 'ex-bench', name: 'לחיצת חזה', sets: 3, reps: '8', metric: 'weight' },
      { id: 'ex-push', name: 'שכיבות סמיכה', sets: 2, reps: '15', metric: 'reps' },
    ],
  },
]

export const weekSeed = seed((s: AppState) => ({
  ...s,
  settings: { ...s.settings, onboarded: true, name: 'דני', sound: false },
  tasks: TASKS.map((t) => ({ ...t })),
  events: EVENTS.map((e) => ({ ...e })),
  workoutPlan: PLAN.map((d) => ({ ...d })),
}))

export const SUN_0735 = '2026-09-13T07:35:00+03:00'
