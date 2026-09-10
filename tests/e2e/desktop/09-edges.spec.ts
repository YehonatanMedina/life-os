import { test, expect, readState, reload, go, live, seed, onboarded, TODAY } from './desk'
import type { AppState, CalEvent, Session, Task } from '../../../src/types'

// ---------------------------------------------------------------------------
// גבולות: היום הלוגי מתחלף ב-03:30, אפס מסלולים, תזכורות וימי הולדת,
//         הרבה פריטים, מספרים בתוך טקסט עברי
// ---------------------------------------------------------------------------

test.describe('אחרי חצות — עדיין אתמול', () => {
  // שבת 01:00 בלילה: היום הלוגי הוא עדיין שישי 11.9
  test.use({
    clock: '2026-09-12T01:00:00+03:00',
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      tasks: [{ id: 't1', title: 'משימה של שישי', trackId: 'trk-life', status: 'todo', order: 0, updatedAt: 1, due: TODAY } as Task],
    })),
  })

  test('הכותרת, המשימות, הסשן וההרגלים נופלים על שישי', async ({ app }) => {
    await expect(app.locator('.desk-head h1').first()).toHaveText('לילה טוב')
    await expect(app.locator('.desk-head .sub').first()).toContainText('יום שישי, 11 בספטמבר · היום מתחלף ב־03:30')
    // סרגל הצד מציג את אותו תאריך
    await expect(app.locator('nav.sidebar .brand span')).toHaveText('יום שישי, 11 בספטמבר')
    // המשימה של שישי עדיין "היום", לא באיחור
    const row = app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'משימה של שישי' })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('באיחור')
    // אין שאלות בוקר בשעה כזאת
    await expect(app.getByText('קמת היום בשעה')).toHaveCount(0)
    // סשן שנרשם עכשיו נספר על שישי
    await app.locator('.timer-card').getByRole('button', { name: '+ רישום ידני' }).click()
    const sh = app.getByRole('dialog', { name: 'רישום ידני של עבודה' })
    await expect(sh).toContainText('יום שישי, 11 בספטמבר 2026')
    await sh.getByRole('button', { name: '30 דק׳' }).click()
    await sh.getByRole('button', { name: 'הוספה' }).click()
    await expect(app.locator('.timer-card .ring-wrap .n')).toHaveText('0.3')
    // וגם טיימר שנגמר עכשיו
    await app.locator('.timer-card').getByRole('button', { name: /מחקר/ }).click()
    await app.clock.runFor(2 * 60_000)
    await app.locator('.timer-card').getByRole('button', { name: /סיים ושמור/ }).click()
    await expect(app.locator('.timer-card')).toContainText('2 סשנים היום · 32 דק׳')
    // הרגל שמסומן עכשיו — על שישי
    await app.locator('.card', { hasText: 'הרגלי היום' }).locator('.item', { hasText: 'שגרת ערב' }).getByRole('button', { name: 'סמן כבוצע' }).click()
    const st = await readState(app)
    expect(st.days.map((d: any) => d.date)).toEqual([TODAY])
    expect(live<Session>(st.sessions).map((x) => x.minutes)).toEqual([30, 2])
    // ובסקירה: יום ו׳ 0.5 שעות
    await go(app, 'סקירה')
    await expect(app.locator('.daybar', { hasText: 'ו׳' })).toContainText('0.5')
    await expect(app.locator('.daybar', { hasText: 'ש׳' })).toContainText('·')
    // היומן נפתח על שישי
    await go(app, 'יומן')
    await expect(app.locator('.wk-head .h.today b')).toHaveText('11')
    // ומעבר ל-03:30 מחליף יום: המשימה של שישי הופכת לאיחור של יום
    // (קפיצה, לא ריצה — 2.5 שעות של טיקים כל שנייה זה איטי מדי; אין טיימר רץ שצריך דופק)
    await app.clock.fastForward(2.5 * 60 * 60_000)
    await go(app, 'היום')
    await expect(app.locator('.desk-head .sub').first()).toContainText('יום שבת, 12 בספטמבר')
    await expect(app.locator('.desk-head .sub').first()).not.toContainText('03:30')
    await expect(app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'משימה של שישי' })).toContainText('באיחור 1 יום')
    await expect(app.locator('.timer-card .ring-wrap .n')).toHaveText('0.0')
  })
})

// ---------------------------------------------------------------------------
test.describe('אפס מסלולים', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      tracks: s.tracks.map((t) => ({ ...t, deleted: true, updatedAt: 2 })),
    })),
  })

  test('בלי מסלולים: אין טיימר, הקנבן מבקש מסלול, ומשימה מהירה נשמרת "ללא מסלול"', async ({ app }) => {
    const card = app.locator('.timer-card')
    await expect(card).toContainText('אין מסלולים. פותחים אחד במסך "פרויקטים"')
    await expect(card.locator('.tag')).toHaveCount(0)
    // רישום ידני — כפתור ההוספה מושבת בלי מסלול
    await card.getByRole('button', { name: '+ רישום ידני' }).click()
    await expect(app.getByRole('dialog', { name: 'רישום ידני של עבודה' }).getByRole('button', { name: 'הוספה' })).toBeDisabled()
    await app.keyboard.press('Escape')

    const quick = app.getByPlaceholder('משימה מהירה להיום…')
    await quick.fill('משימה יתומה')
    await quick.press('Enter')
    const row = app.locator('.card', { hasText: 'המשימות של היום' }).locator('.item', { hasText: 'משימה יתומה' })
    await expect(row.locator('.sub2')).toHaveText('ללא מסלול')

    await go(app, 'פרויקטים')
    await expect(app.locator('.tag-scroll').first().locator('.tag')).toHaveCount(2) // הכל + מסלול
    await expect(app.getByText('צור מסלול כדי להוסיף משימות')).toBeVisible()
    await expect(app.locator('.kcard', { hasText: 'משימה יתומה' }).locator('.chip', { hasText: 'ללא מסלול' })).toBeVisible()

    // יוצרים מסלול חדש — הטיימר חוזר
    await app.getByRole('button', { name: '+ מסלול' }).click()
    const sh = app.getByRole('dialog', { name: 'מסלול חדש' })
    await sh.getByPlaceholder('שם המסלול').fill('תואר')
    await sh.getByRole('button', { name: 'צבע 6' }).click()
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(app.locator('.tag-scroll').first().getByRole('button', { name: /תואר/ })).toBeVisible()
    await go(app, 'היום')
    await expect(card.getByRole('button', { name: /תואר/ })).toBeVisible()
    const st = await readState(app)
    expect(live(st.tracks)).toHaveLength(1)
    expect(live<Task>(st.tasks)[0].trackId).toBe('')
  })
})

// ---------------------------------------------------------------------------
test.describe('תזכורות, ימי הולדת, וספירה לאחור', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      events: [
        // יום הולדת שנתי מ-1999 — היום
        { id: 'e-bday', updatedAt: 1, title: 'עידו', date: '1999-09-11', allDay: true, kind: 'birthday', yearly: true },
        // חתונה בעוד 3 ימים עם תזכורת 3 ימים לפני
        { id: 'e-wed', updatedAt: 1, title: 'חתונה של נעם', date: '2026-09-14', allDay: true, kind: 'personal', remind: [3] },
        // מבחן בעוד 10 ימים ודדליין בעוד 40
        { id: 'e-exam', updatedAt: 1, title: 'מבחן באינפי', date: '2026-09-21', allDay: true, kind: 'exam' },
        { id: 'e-dl', updatedAt: 1, title: 'הגשת סמינר', date: '2026-10-21', allDay: true, kind: 'deadline', trackId: 'trk-research' },
      ] as CalEvent[],
    })),
  })

  test('הכרטיסים במסך היום, ואותם תאריכים ביומן', async ({ app }) => {
    await expect(app.locator('.card.rail', { hasText: 'יום הולדת היום: עידו' })).toBeVisible()
    await expect(app.locator('.card.rail', { hasText: 'בעוד 3 ימים: חתונה של נעם' })).toContainText('14.9')
    const cds = app.locator('.countdowns .cd')
    await expect(cds).toHaveCount(2)
    await expect(cds.nth(0)).toContainText('10')
    await expect(cds.nth(0)).toContainText('מבחן באינפי')
    await expect(cds.nth(0)).toContainText('יום ב׳ · 21.9')
    await expect(cds.nth(1)).toContainText('40')
    await expect(cds.nth(1)).toContainText('הגשת סמינר')
    // "מה מחכה קדימה" — רק אבני דרך ודדליינים בחודש הקרוב: הסמינר רחוק מדי
    await expect(app.locator('.card', { hasText: 'מה מחכה קדימה' })).toHaveCount(0)
    // יום ההולדת לא מופיע כאירוע כל־היום בלו״ז (יש לו כרטיס משלו)
    await expect(app.locator('.card', { hasText: 'הלו״ז של היום' }).locator('.chip', { hasText: 'עידו' })).toHaveCount(0)

    // ביומן: יום ההולדת על 11.9 בכל שנה
    await go(app, 'יומן')
    await expect(app.locator('.wk-allday .pill', { hasText: 'עידו' })).toHaveCount(1)
    await app.getByRole('button', { name: 'חודש' }).click()
    for (let i = 0; i < 12; i++) await app.getByRole('button', { name: 'הבא' }).click()
    await expect(app.locator('.spread b.truncate').first()).toHaveText('ספטמבר 2027')
    await expect(app.locator('.cal-cell:not(.out)', { has: app.locator('.pill', { hasText: 'עידו' }) }).locator('.n')).toHaveText(['11'])

    // בפרויקטים: היעד הבא של מחקר
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: /מחקר/ }).click()
    const head = app.locator('.card.rail', { hasText: 'מחקר' }).first()
    await expect(head).toContainText('בעוד 40 ימים')
    await expect(head).toContainText('21.10')
    await expect(app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' })).toBeVisible()
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('עד 21.9 (מבחן באינפי)')
  })
})

// ---------------------------------------------------------------------------
test.describe('הרבה פריטים', () => {
  const N = 60
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      tasks: Array.from({ length: N }, (_, i) => ({
        id: `t-${i}`,
        title: `משימה מספר ${i + 1} עם 12.5% ומספרים 2026`,
        trackId: ['trk-study', 'trk-research', 'trk-project', 'trk-life'][i % 4],
        status: (['todo', 'doing', 'waiting', 'done'] as const)[i % 4],
        order: i,
        updatedAt: 1,
        due: i % 3 === 0 ? TODAY : i % 3 === 1 ? '2026-09-01' : undefined,
        est: i % 5,
        critical: i % 7 === 0,
        doneAt: i % 4 === 3 ? Date.parse('2026-09-11T08:00:00+03:00') : undefined,
      })) as Task[],
      sessions: Array.from({ length: 40 }, (_, i) => ({
        id: `s-${i}`,
        updatedAt: 1,
        startedAt: Date.parse('2026-09-11T06:00:00+03:00') - i * 86_400_000,
        endedAt: Date.parse('2026-09-11T06:30:00+03:00') - i * 86_400_000,
        minutes: 30 + (i % 4) * 15,
        trackId: ['trk-study', 'trk-research'][i % 2],
      })) as Session[],
    })),
  })

  test('כל המסכים נטענים, המספרים מסתכמים נכון, ואין גלילה אופקית', async ({ app }) => {
    const tasksCard = app.locator('.card', { hasText: 'המשימות של היום' })
    // 45 פתוחות (לא done): מתוכן due היום או באיחור מוצגות; המאגר מקופל
    const st = await readState(app)
    const open = live<Task>(st.tasks).filter((t) => t.status !== 'done')
    const shown = open.filter((t) => t.due)
    const backlog = open.filter((t) => !t.due)
    await expect(tasksCard.locator('.item').filter({ has: app.locator('.check') })).toHaveCount(shown.length)
    await expect(tasksCard.getByRole('button', { name: new RegExp(`${backlog.length} משימות בלי תאריך`) })).toBeVisible()
    const planned = shown.reduce((a, t) => a + (t.est ?? 0), 0)
    const late = shown.filter((t) => t.due! < TODAY).length
    await expect(tasksCard).toContainText(`${planned} אסימונים מתוכננים`)
    await expect(tasksCard).toContainText(`${late} באיחור`)
    // קריטיות: עד 6 בכרטיס, והשאר מצוינות
    const critical = open.filter((t) => t.critical)
    const focus = app.locator('.card', { hasText: 'הנתיב הקריטי' })
    await expect(focus.locator('.item')).toHaveCount(Math.min(6, critical.length))
    if (critical.length > 6) await expect(focus).toContainText(`ועוד ${critical.length - 6} קריטיות`)
    // המספרים 12.5% ו-2026 נשארים שלמים (לא מתפרקים ב-RTL)
    await expect(tasksCard.locator('.ttl').first()).toContainText('12.5%')
    await expect(tasksCard.locator('.ttl').first()).toContainText('2026')

    // הטבעת: הסשן של היום (30 דק׳ ב-06:30)
    await expect(app.locator('.timer-card')).toContainText('30 דק׳ מתוך 9 שע׳ היום')

    for (const v of ['פרויקטים', 'יומן', 'סקירה', 'הגדרות', 'היום'] as const) {
      await go(app, v)
      const overflow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `גלילה אופקית ב-${v}`).toBeLessThanOrEqual(0)
    }
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    await expect(app.locator('.kcard')).toHaveCount(N)
    await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'הושלם' }) }).locator('h4 .faint')).toHaveText('15')
    // הסקירה: הגרף לאורך זמן מסכם 40 ימים (3.8–11.9) לשישה שבועות
    await go(app, 'סקירה')
    const hist = app.locator('.card', { hasText: 'שעות עבודה לאורך הזמן' })
    await expect(hist.locator('.hist i')).toHaveCount(6)
    await hist.getByRole('button', { name: 'לפי יום' }).click()
    await expect(hist.locator('.hist i')).toHaveCount(40)
  })
})
