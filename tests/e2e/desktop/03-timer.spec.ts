import { test, expect, readState, reload, go, live, seed, onboarded, NOW_ISO, TODAY } from './desk'
import type { AppState, Session } from '../../../src/types'

// ---------------------------------------------------------------------------
// 4. טיימר Deep Work: התחלה, מצב מיקוד, השהיה, שמירה, רישום ידני, ביטול,
//    שרידות רענון — והטבעת, הסשנים, השבוע והסקירה משקפים את זה
// ---------------------------------------------------------------------------

const NOW = Date.parse(NOW_ISO)
const timerCard = (page: any) => page.locator('.timer-card')

test.describe('טיימר', () => {
  test.use({ seed: onboarded })

  test('התחלה → כרטיס חי, מצב מיקוד, השהיה/המשך, סיום ושמירה יוצר סשן', async ({ app }) => {
    const card = timerCard(app)
    await card.getByRole('button', { name: /לימודים/ }).click()
    await expect(card).toHaveClass(/live/)
    await expect(card.locator('.chip.tinted')).toContainText('לימודים')
    await expect(card.locator('.timer-time')).toHaveText(/^(89:5\d|90:00)$/)
    await expect(card).toContainText('0 מתוך 90 דק׳')
    // התגית בסרגל הצד
    await expect(app.locator('nav.sidebar .foot .chip')).toBeVisible()

    // מצב מיקוד
    await card.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
    await expect(focus).toBeVisible()
    await expect(focus.locator('.focus-track')).toContainText('לימודים')
    await expect(focus.locator('.focus-time')).toHaveText(/^1:29:/)
    // השהיה בתוך מצב מיקוד — השעון עומד
    await focus.getByRole('button', { name: '⏸ השהיה' }).click()
    await expect(focus.locator('.focus-paused')).toHaveText('מושהה')
    const frozen = await focus.locator('.focus-time').textContent()
    await app.clock.runFor(20_000)
    await expect(focus.locator('.focus-time')).toHaveText(frozen!)
    await focus.getByRole('button', { name: '▶ המשך' }).click()
    await expect(focus.locator('.focus-paused')).toHaveCount(0)
    await app.keyboard.press('Escape')
    await expect(focus).toBeHidden()
    // ובכרטיס: אפשר להשהות משם
    await expect(card.getByRole('button', { name: '⏸ השהיה' })).toBeVisible()

    // חמש דקות של עבודה (הדופק רץ כל 20 שנ׳ — לכן runFor ולא קפיצה)
    await app.clock.runFor(5 * 60_000)
    await expect(card).toContainText('5 מתוך 90 דק׳')
    await expect(card.locator('.timer-time')).toHaveText(/^84:/)
    await expect(app).toHaveTitle(/^8[4-6] דק׳/) // הכותרת מתעדכנת כל 30 שנ׳

    // סיום ושמירה
    await card.getByRole('button', { name: '✓ סיים ושמור' }).click()
    await expect(app.locator('.toast')).toContainText('5 דקות נשמרו · 0.06 אסימונים')
    await expect(card).not.toHaveClass(/live/)
    await expect(card.locator('.ring-wrap .n')).toHaveText('0.1')
    await expect(card).toContainText('5 דק׳ מתוך 9 שע׳ היום')
    await expect(card).toContainText('0.1 / 42')
    await expect(app).toHaveTitle('מערכת ההפעלה')
    await expect(app.locator('nav.sidebar .foot .chip')).toHaveCount(0)

    // הסשנים של היום
    const sess = card.getByRole('button', { name: /סשן אחד היום · 5 דק׳/ })
    await expect(sess).toBeVisible()
    await sess.click()
    const item = card.locator('.list .item').first()
    await expect(item).toContainText('לימודים')
    await expect(item).toContainText('5 דק׳')
    await expect(item).toContainText('10:05')

    // המצב השמור
    let st = await readState(app)
    expect(st.timer).toBeNull()
    const s0 = live<Session>(st.sessions)
    expect(s0).toHaveLength(1)
    expect(s0[0]).toMatchObject({ minutes: 5, trackId: 'trk-study' })
    expect(s0[0].manual).toBeUndefined()

    // בפרויקטים: זמן שהושקע במסלול
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: /לימודים/ }).click()
    const head = app.locator('.card.rail', { hasText: 'לימודים' }).first()
    await expect(head.locator('div', { hasText: /^זמן שהושקע/ }).locator('b')).toHaveText('5 דק׳')

    // בסקירה: השבוע הנוכחי
    await go(app, 'סקירה')
    await expect(app.locator('.card', { hasText: 'זמן נטו' }).first()).toContainText('5 דק׳')
    await expect(app.locator('.daybar', { hasText: 'ו׳' })).toContainText('0.1')

    // מחיקת הסשן מהרשימה
    await go(app, 'היום')
    await timerCard(app).getByRole('button', { name: /סשן אחד היום/ }).click()
    await timerCard(app).getByRole('button', { name: 'מחיקת סשן' }).click()
    await expect(app.locator('.toast')).toContainText('הסשן נמחק')
    await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('0.0')
    st = await readState(app)
    expect(live<Session>(st.sessions)).toHaveLength(0)
    expect(st.sessions[0].deleted).toBe(true)
  })

  test('הטיימר שורד רענון, ופחות מדקה לא נשמר', async ({ app }) => {
    const card = timerCard(app)
    await card.getByRole('button', { name: /מחקר/ }).click()
    await app.clock.runFor(2 * 60_000)
    await expect(card).toContainText('2 מתוך 90 דק׳')
    await reload(app)
    const c2 = timerCard(app)
    await expect(c2).toHaveClass(/live/)
    await expect(c2.locator('.chip.tinted')).toContainText('מחקר')
    await expect(c2).toContainText('2 מתוך 90 דק׳')
    await expect(c2.getByRole('button', { name: '⏸ השהיה' })).toBeVisible()
    await expect(app).toHaveTitle(/^8[78] דק׳/)

    // ביטול בלי לשמור
    await c2.getByRole('button', { name: 'ביטול בלי לשמור' }).click()
    await expect(app.locator('.toast')).toContainText('הסשן בוטל')
    await expect(c2).not.toHaveClass(/live/)

    // התחלה וסיום מיד — פחות מדקה
    await c2.getByRole('button', { name: /פרויקט/ }).click()
    await c2.getByRole('button', { name: '✓ סיים ושמור' }).click()
    await expect(app.locator('.toast')).toContainText('פחות מדקה — לא נשמר')
    const st = await readState(app)
    expect(st.timer).toBeNull()
    expect(live<Session>(st.sessions)).toHaveLength(0)
  })

  test('רישום ידני: מסלול, דקות ותאריך; ביטול לא מוסיף כלום', async ({ app }) => {
    const card = timerCard(app)
    // ביטול
    await card.getByRole('button', { name: '+ רישום ידני' }).click()
    const sh = app.getByRole('dialog', { name: 'רישום ידני של עבודה' })
    await expect(sh).toBeVisible()
    await sh.getByRole('button', { name: '120 דק׳' }).click()
    await sh.getByRole('button', { name: 'סגירה' }).click()
    await expect(sh).toBeHidden()
    let st = await readState(app)
    expect(live<Session>(st.sessions ?? [])).toHaveLength(0)

    // 45 דק׳ מחקר על יום רביעי 9.9
    await card.getByRole('button', { name: '+ רישום ידני' }).click()
    await sh.getByRole('button', { name: /מחקר/ }).click()
    await sh.getByRole('button', { name: '45 דק׳' }).click()
    await sh.getByRole('button', { name: /יום שישי, 11 בספטמבר 2026/ }).click()
    const dp = app.getByRole('dialog', { name: 'בחירת תאריך' })
    await expect(dp).toContainText('ספטמבר 2026')
    await dp.locator('.cal-cell:not(.out)', { hasText: /^9$/ }).click()
    await expect(dp).toBeHidden()
    await expect(sh).toContainText('יום רביעי, 9 בספטמבר 2026')
    await sh.getByRole('button', { name: 'הוספה' }).click()
    await expect(app.locator('.toast')).toContainText('נוספו 45 דקות · יום רביעי, 9 בספטמבר')
    // היום לא השתנה, השבוע כן
    await expect(card.locator('.ring-wrap .n')).toHaveText('0.0')
    await expect(card).toContainText('0.5 / 42')
    await expect(card.locator('.list')).toHaveCount(0)

    // 37 דקות היום, בשדה החופשי
    await card.getByRole('button', { name: '+ רישום ידני' }).click()
    await sh.getByRole('button', { name: /לימודים/ }).click()
    const num = sh.locator('input[inputmode="numeric"]')
    await num.fill('37')
    await num.press('Enter')
    await sh.getByRole('button', { name: 'הוספה' }).click()
    await expect(app.locator('.toast')).toContainText('נוספו 37 דקות · יום שישי, 11 בספטמבר')
    await expect(card.locator('.ring-wrap .n')).toHaveText('0.4')
    await expect(card).toContainText('37 דק׳ מתוך 9 שע׳ היום')
    await expect(card).toContainText('0.9 / 42')
    await expect(card.getByRole('button', { name: /סשן אחד היום · 37 דק׳/ })).toBeVisible()

    st = await readState(app)
    const ss = live<Session>(st.sessions)
    expect(ss).toHaveLength(2)
    expect(ss[0]).toMatchObject({ minutes: 45, trackId: 'trk-research', manual: true })
    expect(new Date(ss[0].endedAt).getDate()).toBe(9)
    expect(ss[1]).toMatchObject({ minutes: 37, trackId: 'trk-study', manual: true })

    // בסקירה: יום ד׳ 0.8 שעות, יום ו׳ 0.6, סה״כ שעה ו-22 דק׳
    await go(app, 'סקירה')
    await expect(app.locator('.daybar', { hasText: 'ד׳' })).toContainText('0.8')
    await expect(app.locator('.daybar', { hasText: 'ו׳' })).toContainText('0.6')
    await expect(app.locator('.card', { hasText: 'זמן נטו' }).first()).toContainText('1 שע׳ 22 דק׳')
    const split = app.locator('.card', { hasText: 'לאן הלך הזמן' })
    await expect(split).toContainText('45 דק׳')
    await expect(split).toContainText('37 דק׳')

    await reload(app)
    await expect(timerCard(app).locator('.ring-wrap .n')).toHaveText('0.4')
  })
})

// ---------------------------------------------------------------------------
test.describe('טיימר שהגיע ליעד', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true, sound: false },
      timer: {
        running: true,
        startedAt: NOW - 89.5 * 60_000,
        accumulated: 0,
        trackId: 'trk-project',
        label: 'בלוק בוקר',
        targetMinutes: 90,
        lastSeen: NOW - 5_000,
      },
    })),
  })

  test('בסיום 90 דקות: התראה, ספירה חיובית, ושמירה של אסימון שלם', async ({ app }) => {
    const card = timerCard(app)
    await expect(card).toHaveClass(/live/)
    await expect(card).toContainText('89 מתוך 90 דק׳')
    // בשני צעדים — הטוסט חי 2.6 שניות, וריצה ארוכה של השעון הייתה מוחקת אותו
    await app.clock.runFor(28_000)
    await expect(card.locator('.timer-time')).toHaveText(/^00:/)
    await app.clock.runFor(3_000)
    await expect(app.locator('.toast')).toContainText('אסימון הושלם · 90 דקות ריכוז נטו')
    await expect(card.locator('.timer-time')).toHaveText(/^\+00:/)
    await expect(card).toContainText('היעד הושלם — כל דקה נוספת נספרת')
    // מצב מיקוד מציג את התווית ואת החריגה
    await card.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    const focus = app.getByRole('dialog', { name: 'מצב מיקוד' })
    await expect(focus.locator('.focus-track')).toHaveText('🚀 פרויקט · בלוק בוקר')
    await expect(focus.locator('.focus-time')).toHaveText(/^\+00:/)
    await focus.getByRole('button', { name: '✓ סיים ושמור' }).click()
    await expect(focus).toBeHidden()
    await expect(app.locator('.toast')).toContainText('90 דקות נשמרו · 1.00 אסימונים')
    await expect(card.locator('.ring-wrap .n')).toHaveText('1.0')
    await expect(card).toContainText('1 שע׳ 30 דק׳ מתוך 9 שע׳ היום')
    const st = await readState(app)
    expect(live<Session>(st.sessions)[0]).toMatchObject({ minutes: 90, trackId: 'trk-project', label: 'בלוק בוקר' })
  })
})

// ---------------------------------------------------------------------------
test.describe('טיימר שנשכח פתוח', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      timer: {
        running: true,
        startedAt: NOW - 30 * 60_000,
        accumulated: 0,
        trackId: 'trk-study',
        label: '',
        targetMinutes: 90,
        // הדופק האחרון לפני 10 דקות — המחשב היה סגור
        lastSeen: NOW - 10 * 60_000,
      },
    })),
  })

  test('נעצר בנקודת הדופק האחרונה ולא צובר זמן דמיוני', async ({ app }) => {
    const card = timerCard(app)
    await expect(card).toHaveClass(/live/)
    await expect(card.getByRole('button', { name: '▶ המשך' })).toBeVisible()
    await expect(card).toContainText('20 מתוך 90 דק׳')
    await app.clock.runFor(60_000)
    await expect(card).toContainText('20 מתוך 90 דק׳')
    // גם אחרי רענון נוסף — אותן 20 דקות, לא יותר
    await reload(app)
    await expect(timerCard(app)).toContainText('20 מתוך 90 דק׳')
    await expect(timerCard(app).getByRole('button', { name: '▶ המשך' })).toBeVisible()
    // המשך → הזמן ממשיך מ־20
    await timerCard(app).getByRole('button', { name: '▶ המשך' }).click()
    await app.clock.runFor(60_000)
    await expect(timerCard(app)).toContainText('21 מתוך 90 דק׳')
    const st = await readState(app)
    expect(st.timer.running).toBe(true)
    expect(Math.floor(st.timer.accumulated)).toBe(20)
  })
})
