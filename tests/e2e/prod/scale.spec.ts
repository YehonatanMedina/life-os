// ---------------------------------------------------------------------------
// "בעוד שנה" — המצב אחרי שימוש אמיתי ארוך: 1500 משימות, 6000 סשנים, 800
// אירועים, 300 אימונים ושנה של יומני יום. השאלה היא לא אם זה נפתח, אלא אם
// זה עדיין מרגיש מיידי, נשמר בלי להיתקע, ולא מתקרב לגבול האחסון.
//
// אם בדיקה כאן נכשלת — זה לא "הבדיקה מחמירה", זה סימן שהיום של יהונתן
// בעוד שנה ייפתח לאט.
// ---------------------------------------------------------------------------
import { event, expect, fmt, makeState, openApp, session, task, test } from '../mobile/helpers'

// המצב הכבד נמדד בטלפון — שם הוא הכי כבד, ושם הניווט התחתון (.bottomnav)
test.skip(({ isMobile }) => !isMobile, 'mobile only')
test.setTimeout(240_000)

const TRACKS = ['trk-study', 'trk-research', 'trk-project', 'trk-life']

function yearState() {
  const s = makeState()
  s.settings.onboarded = true
  s.settings.reviewLock = false
  const now = Date.now()
  const day = (n: number) => {
    const d = new Date(now + n * 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  for (let i = 0; i < 1500; i++) {
    s.tasks.push(
      task({
        title: `משימה ${i} — לקרוא, לסכם ולשלוח את הגרסה הבאה`,
        trackId: TRACKS[i % 4],
        due: i % 4 === 0 ? day((i % 40) - 20) : undefined,
        est: (i % 3) + 1,
        status: i % 3 === 0 ? 'done' : i % 11 === 0 ? 'doing' : 'todo',
        doneAt: i % 3 === 0 ? now - (i % 300) * 86_400_000 : undefined,
        critical: i % 29 === 0,
        notes: i % 13 === 0 ? 'הערה קצרה עם הקשר, כמו שיהונתן כותב בפועל.' : undefined,
      }),
    )
  }
  for (let i = 0; i < 6000; i++) {
    s.sessions.push(session({ endedAt: now - (i % 365) * 86_400_000 - (i % 9) * 3_600_000, minutes: 25 + (i % 5) * 20, trackId: TRACKS[i % 4] }))
  }
  for (let i = 0; i < 800; i++) {
    const d = day((i % 300) - 150)
    s.events.push(
      event({
        title: `אירוע ${i} — הרצאה, פגישה או תזכורת`,
        date: d,
        start: `${String(8 + (i % 10)).padStart(2, '0')}:00`,
        end: `${String(9 + (i % 10)).padStart(2, '0')}:00`,
        kind: i % 5 === 0 ? 'deadline' : 'personal',
        trackId: TRACKS[i % 4],
      }),
    )
  }
  // אימונים עם סטים — החלק הכי כבד במצב האמיתי
  s.workouts = Array.from({ length: 300 }, (_, i) => ({
    id: `wo-${i}`,
    updatedAt: now - i * 86_400_000,
    date: day(-i),
    dayId: 'wd-a',
    title: i % 3 === 0 ? 'ריצה' : 'חדר כושר',
    kind: i % 3 === 0 ? ('run' as const) : ('gym' as const),
    sets: {
      'ex-1': [{ kg: 40 + (i % 10), reps: 8 }, { kg: 40 + (i % 10), reps: 8 }, { kg: 42.5, reps: 6 }],
      'ex-2': [{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }],
    },
    km: i % 3 === 0 ? 5 + (i % 4) : undefined,
    minutes: 45,
    finishedAt: now - i * 86_400_000 + 3_600_000,
  })) as any
  // שנה של יומני יום (הרגלים, קימה, שינה)
  s.days = Array.from({ length: 365 }, (_, i) => ({
    date: day(-i),
    updatedAt: now - i * 86_400_000,
    wake: i % 4 === 0 ? 'late' : 'ok',
    habits: { 'hb-morning': i % 2 === 0, 'hb-night': i % 3 === 0, 'hb-workout': i % 5 === 0 },
  })) as any
  return s
}

test('מצב של שנה שלמה: נפתח מהר, נשמר, נשאר מגיב, ורחוק מגבול האחסון', async ({ page, errors }) => {
  await page.addInitScript(() => {
    ;(window as any).__lt = []
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) (window as any).__lt.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) })
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      /* ignore */
    }
  })
  const state = yearState()
  errors.push(...(await openApp(page, { state, now: null })))

  await expect(page.getByText('הלו״ז של היום')).toBeVisible({ timeout: 30_000 })
  const interactive = await page.evaluate(() => Math.round(performance.now()))
  await page.waitForTimeout(1500)

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      loadEventEnd: nav ? Math.round(nav.loadEventEnd) : 0,
      longTasks: (window as any).__lt as Array<{ start: number; dur: number }>,
      stateBytes: (localStorage.getItem('life-os-v1') || '').length,
      tasks: (JSON.parse(localStorage.getItem('life-os-v1') || '{}').tasks ?? []).length,
      sessions: (JSON.parse(localStorage.getItem('life-os-v1') || '{}').sessions ?? []).length,
    }
  })
  console.log('scale:', JSON.stringify({ interactive, ...perf, longTasks: perf.longTasks.length }))

  // נשמר במלואו (לא נחתך בדרך)
  expect(perf.tasks).toBe(1500)
  expect(perf.sessions).toBe(6000)
  // אחסון: הרבה מתחת ל-5MB של הדפדפן — אחרת השמירה תתחיל להיכשל
  expect(perf.stateBytes, `state is ${Math.round(perf.stateBytes / 1024)}KB`).toBeLessThan(3_500_000)
  // מיידי לתחושה, גם עם שנה של נתונים
  expect(interactive, `time to interactive ${interactive}ms`).toBeLessThan(4_000)
  const heavy = perf.longTasks.filter((t) => t.start > perf.loadEventEnd && t.dur > 400)
  expect(heavy, `long tasks after load: ${fmt(heavy)}`).toEqual([])

  // ניווט בין כל המסכים נשאר מהיר
  for (const label of ['יומן', 'פרויקטים', 'אימונים', 'סקירה', 'היום'] as const) {
    const t0 = Date.now()
    await page.locator('.bottomnav button', { hasText: label }).click()
    await expect(page.locator('.bottomnav button', { hasText: label })).toHaveAttribute('aria-current', 'true')
    const dt = Date.now() - t0
    expect(dt, `${label} took ${dt}ms`).toBeLessThan(2_500)
  }

  // ועדיין אפשר לעבוד: משימה מהירה נכנסת ונשמרת
  await page.locator('.bottomnav button', { hasText: 'היום' }).click()
  const quick = page.getByPlaceholder('משימה מהירה')
  if (await quick.count()) {
    await quick.fill('משימה על מצב כבד')
    await quick.press('Enter')
    await expect
      .poll(
        async () =>
          page.evaluate(() => (JSON.parse(localStorage.getItem('life-os-v1') || '{}').tasks ?? []).some((t: any) => t.title === 'משימה על מצב כבד')),
        { timeout: 15_000 },
      )
      .toBe(true)
  }
  expect(errors).toEqual([])
})
