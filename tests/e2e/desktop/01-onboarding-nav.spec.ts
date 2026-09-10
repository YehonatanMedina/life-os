import { test, expect, readState, reload, go, TODAY } from './desk'

// ---------------------------------------------------------------------------
// 1. התקנה חדשה: מבנה הפתיחה, כרטיס ההסבר, וניווט במחשב
// ---------------------------------------------------------------------------

test.describe('התקנה חדשה', () => {
  test('מסך היום מציג את מבנה הפתיחה וכרטיס ההסבר נסגר לתמיד', async ({ app }) => {
    // כרטיס ההסבר
    const intro = app.locator('.card', { hasText: 'איך זה עובד' })
    await expect(intro).toBeVisible()
    await expect(intro).toContainText('אסימון')

    // ברכה לפי השעה (10:00 = בוקר) ותאריך
    await expect(app.locator('.desk-head h1').first()).toHaveText('בוקר טוב')
    await expect(app.locator('.desk-head .sub').first()).toContainText('יום שישי, 11 בספטמבר')

    // ארבעת המסלולים הגנריים מוצעים כתגים להתחלת טיימר
    const timerCard = app.locator('.timer-card')
    for (const name of ['לימודים', 'מחקר', 'פרויקט', 'חיים']) {
      await expect(timerCard.getByRole('button', { name: new RegExp(name) })).toBeVisible()
    }
    await expect(timerCard).toContainText('0 דק׳ מתוך 9 שע׳ היום')
    await expect(timerCard.locator('.ring-wrap .n')).toHaveText('0.0')
    await expect(timerCard.locator('.ring-wrap .l')).toHaveText('מתוך 6')

    // הרגלים: שלושה, אפס מסומנים
    const habits = app.locator('.card', { hasText: 'הרגלי היום' })
    await expect(habits).toContainText('0/3')
    for (const h of ['שגרת בוקר', 'אימון', 'שגרת ערב']) await expect(habits).toContainText(h)

    // אסימונים שבועיים: חמישה
    const weekly = app.locator('.card', { hasText: 'אסימונים צפים' })
    await expect(weekly).toContainText('0/5')
    await expect(weekly).toContainText('כביסה')

    // אימונים: עוד אין תוכנית
    await expect(app.locator('.card', { hasText: 'אימונים' })).toContainText('עוד אין תוכנית שבועית')

    // המשימות: ריק, עם הזמנה לכתוב מטרות (לפני 17:00)
    const tasks = app.locator('.card', { hasText: 'המשימות של היום' })
    await expect(tasks).toContainText('עוד לא נכתבו מטרות להיום')

    // הלו״ז: הבלוקים הקבועים של שישי (בוקר, אימון, ערב — בלי עבודה עמוקה)
    const sched = app.locator('.card', { hasText: 'הלו״ז של היום' })
    await expect(sched).toContainText('שגרת בוקר')
    await expect(sched).toContainText('אימון')
    await expect(sched).toContainText('שגרת ערב')
    await expect(sched).not.toContainText('עבודה עמוקה')

    // שאלות הבוקר
    await expect(app.getByText('קמת היום בשעה')).toBeVisible()
    await expect(app.getByText('איך ישנת אתמול בלילה?')).toBeVisible()

    // סגירת כרטיס ההסבר — נשמר גם אחרי רענון
    await intro.getByRole('button', { name: 'סגירה' }).click()
    await expect(intro).toBeHidden()
    const st = await readState(app)
    expect(st.settings.onboarded).toBe(true)
    await reload(app)
    await expect(app.locator('.card', { hasText: 'איך זה עובד' })).toHaveCount(0)
  })

  test('הגדרות: חמישה בלוקים קבועים, שלושה הרגלים, חמישה שבועיים', async ({ app }) => {
    await go(app, 'הגדרות')
    const rules = app.locator('.card', { hasText: 'מבנה השבוע הקבוע' })
    for (const r of ['עבודה עמוקה — בוקר', 'עבודה עמוקה — אחה״צ', 'שגרת בוקר', 'אימון', 'שגרת ערב']) {
      await expect(rules.locator('.item', { hasText: r })).toHaveCount(1)
    }
    await expect(rules.locator('.item', { hasText: 'עבודה עמוקה — בוקר' })).toContainText('08:30–12:30')
    await expect(app.locator('.card', { hasText: 'הרגלים יומיים' }).locator('.item')).toHaveCount(3)
    await expect(app.locator('.card', { hasText: 'אסימונים שבועיים' }).locator('.item')).toHaveCount(5)
    await expect(app.getByText(/כרגע: 6 אסימונים ביום = 9\.0 שעות נטו, 42 בשבוע/)).toBeVisible()
  })

  test('פרויקטים: ארבעה מסלולים ולוח ריק', async ({ app }) => {
    await go(app, 'פרויקטים')
    const tags = app.locator('.tag-scroll').first()
    for (const name of ['לימודים', 'מחקר', 'פרויקט', 'חיים']) {
      await expect(tags.getByRole('button', { name: new RegExp(name) })).toBeVisible()
    }
    await expect(app.getByText('הלוח ריק')).toBeVisible()
    // ארבע עמודות
    for (const c of ['לביצוע', 'בתהליך', 'ממתין', 'הושלם']) await expect(app.locator('.kcol h4', { hasText: c })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
test.describe('ניווט במחשב', () => {
  test('סרגל צד: חמישה יעדים + הגדרות בתחתית, סימון פעיל, כותרת מסך', async ({ app }) => {
    const side = app.locator('nav.sidebar')
    await expect(side).toBeVisible()
    // הסרגל התחתון של הטלפון לא מוצג במחשב
    await expect(app.locator('nav.bottomnav')).toBeHidden()

    const labels = ['היום', 'אטלס', 'יומן', 'פרויקטים', 'סקירה']
    const main = side.locator('> button')
    await expect(main).toHaveCount(5)
    for (let i = 0; i < 5; i++) await expect(main.nth(i)).toHaveText(labels[i])
    await expect(side.locator('.foot button', { hasText: 'הגדרות' })).toBeVisible()
    await expect(side.locator('.brand')).toContainText('מערכת ההפעלה')

    // ברירת מחדל: היום
    await expect(main.nth(0)).toHaveAttribute('aria-current', 'true')
    await expect(app).toHaveTitle('מערכת ההפעלה')

    const heads: Record<string, string> = {
      אטלס: 'אטלס',
      יומן: 'יומן',
      פרויקטים: 'פרויקטים',
      סקירה: 'סקירה',
    }
    for (const [label, h1] of Object.entries(heads)) {
      await side.getByRole('button', { name: label, exact: true }).click()
      await expect(side.locator('button[aria-current="true"]')).toHaveCount(1)
      await expect(side.locator('button[aria-current="true"]')).toHaveText(label)
      if (label !== 'אטלס') await expect(app.locator('.desk-head h1')).toHaveText(h1)
    }

    // הגדרות — הכפתור בתחתית מסומן, ואף כפתור ראשי לא
    await side.locator('.foot button', { hasText: 'הגדרות' }).click()
    await expect(side.locator('.foot button[aria-current="true"]')).toHaveText('הגדרות')
    await expect(main.filter({ has: app.locator('[aria-current="true"]') })).toHaveCount(0)
    await expect(app.locator('.desk-head h1')).toHaveText('הגדרות')
  })

  test('מקשי קיצור 1–6 ו-, מחליפים מסך, אבל לא מתוך שדה קלט או גיליון', async ({ app }) => {
    const side = app.locator('nav.sidebar')
    const active = side.locator('button[aria-current="true"]')
    const map: Array<[string, string]> = [
      ['2', 'אטלס'],
      ['3', 'יומן'],
      ['4', 'פרויקטים'],
      ['5', 'סקירה'],
      ['6', 'הגדרות'],
      ['1', 'היום'],
      [',', 'הגדרות'],
    ]
    for (const [key, label] of map) {
      await app.keyboard.press(key)
      await expect(active).toHaveText(label)
    }

    // בתוך שדה קלט המספרים הם טקסט
    await app.keyboard.press('1')
    await expect(active).toHaveText('היום')
    const quick = app.getByPlaceholder('משימה מהירה להיום…')
    await quick.click()
    await app.keyboard.type('3')
    await expect(active).toHaveText('היום')
    await expect(quick).toHaveValue('3')
    await quick.fill('')
    await app.keyboard.press('Escape')

    // כשגיליון פתוח — המקשים לא מנווטים
    await app.getByRole('button', { name: '+ רישום ידני' }).click()
    await expect(app.getByRole('dialog', { name: 'רישום ידני של עבודה' })).toBeVisible()
    await app.keyboard.press('4')
    await expect(active).toHaveText('היום')
    await app.keyboard.press('Escape')
    await expect(app.getByRole('dialog', { name: 'רישום ידני של עבודה' })).toBeHidden()
    await app.keyboard.press('4')
    await expect(active).toHaveText('פרויקטים')
  })

  test('כותרת הלשונית משקפת את הטיימר', async ({ app }) => {
    await expect(app).toHaveTitle('מערכת ההפעלה')
    await app.locator('.timer-card').getByRole('button', { name: /לימודים/ }).click()
    await expect(app).toHaveTitle(/^90 דק׳ · מערכת ההפעלה$/)
    // הכותרת מתעדכנת כל 30 שניות — אחרי דקה וחצי היא כבר ירדה
    await app.clock.runFor(95_000)
    await expect(app).toHaveTitle(/^(88|89) דק׳ · מערכת ההפעלה$/)
    await expect(app.locator('.timer-time')).toHaveText(/^88:/)
    // ביטול — הכותרת חוזרת
    await app.getByRole('button', { name: 'ביטול בלי לשמור' }).click()
    await expect(app).toHaveTitle('מערכת ההפעלה')
    const st = await readState(app)
    expect(st.timer).toBeNull()
    expect(st.sessions).toEqual([])
  })
})
