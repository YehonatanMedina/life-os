// ---------------------------------------------------------------------------
// סבב 3 — טיימר מושהה על פני רענון: הזמן שנצבר נשמר, ההשהיה נשמרת, המשך
// ממשיך מאותה נקודה, והסיום שומר בדיוק את מה שנעבד. השעון מזויף (desk.ts).
// ---------------------------------------------------------------------------
import { test, expect, readState, reload } from '../../desktop/desk'
import { work, stopAndSave } from '../../week/week'
import { round3Seed, timerCard } from '../helpers'

test.use({ seed: round3Seed })

test('השהיה → רענון → עדיין מושהה עם אותו זמן → המשך → סיום שומר את הסכום', async ({ app }) => {
  await timerCard(app).locator('.tag', { hasText: 'לימודים' }).click()
  await expect(timerCard(app)).toHaveClass(/live/)
  await work(app, 5)
  await timerCard(app).getByRole('button', { name: /השהיה/ }).click()
  await expect(timerCard(app)).toContainText('5 מתוך 90')
  const paused = await readState(app)
  expect(paused.timer.running).toBe(false)
  expect(Math.round(paused.timer.accumulated)).toBe(5)

  // ההשהיה נמשכת 20 דקות — לא נספרות
  await app.clock.fastForward(20 * 60_000)
  await reload(app)
  await expect(timerCard(app)).toHaveClass(/live/)
  await expect(timerCard(app)).toContainText('5 מתוך 90')
  await expect(timerCard(app).getByRole('button', { name: /המשך/ })).toBeVisible()
  // הכותרת של הלשונית והתג בסרגל מציגים את היתרה ולא סופרים
  await expect(app.locator('nav.sidebar .chip.on')).toContainText(/1:24:5\d|1:25:00/)
  await expect.poll(() => app.title()).toContain('85 דק׳')

  await timerCard(app).getByRole('button', { name: /המשך/ }).click()
  await work(app, 3)
  await expect(timerCard(app)).toContainText('8 מתוך 90')
  await stopAndSave(app, 8)
  const st = await readState(app)
  expect(st.timer).toBeNull()
  const s = st.sessions[st.sessions.length - 1]
  expect(s.minutes).toBe(8)
  expect(s.trackId).toBe('trk-study')
})
