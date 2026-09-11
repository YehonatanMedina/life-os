import { test, expect, readState, reload, go, live, seed, onboarded, TODAY, TOMORROW } from './desk'
import type { AppState, Task } from '../../../src/types'

// ---------------------------------------------------------------------------
// 3. משימות: הוספה מהירה, עריכה בגיליון, סימון, דחייה, מאגר, איחור —
//    וכל שינוי נבדק בכל מסך שאמור להראות אותו (היום · פרויקטים · יומן)
// ---------------------------------------------------------------------------

const T0 = Date.parse('2026-09-01T10:00:00+03:00')
const task = (p: Partial<Task> & { id: string; title: string }): Task => ({
  trackId: 'trk-study',
  status: 'todo',
  order: 0,
  updatedAt: T0,
  createdAt: T0,
  ...p,
})

const quickAdd = (page: any) => page.getByPlaceholder('משימה מהירה להיום…')
const tasksCard = (page: any) => page.locator('.card', { hasText: 'המשימות של היום' })

test.describe('הוספה ועריכה', () => {
  test.use({ seed: onboarded })

  test('הוספה מהירה מופיעה בהיום, בקנבן, ובקיבולת; עריכה בגיליון משנה את כולם', async ({ app }) => {
    const card = tasksCard(app)
    const quick = quickAdd(app)

    // רווחים בלבד — לא נוסף כלום
    await quick.fill('   ')
    await quick.press('Enter')
    await expect(card.locator('.item')).toHaveCount(0)

    // משימה ראשונה — מסלול ברירת המחדל "חיים"
    await quick.fill('לקרוא פרק 3')
    await quick.press('Enter')
    await expect(app.locator('.toast')).toContainText('נוספה משימה')
    await expect(quick).toHaveValue('')
    const row1 = card.locator('.item', { hasText: 'לקרוא פרק 3' })
    await expect(row1).toBeVisible()
    await expect(row1.locator('.sub2')).toHaveText('חיים')
    await expect(card).toContainText('משימה אחת')

    // בחירת מסלול "נדבקת" להוספות הבאות
    await quick.click()
    const tags = card.locator('.tag-scroll')
    await expect(tags).toBeVisible()
    await tags.getByRole('button', { name: /לימודים/ }).click()
    await quick.fill('לפתור תרגיל 2')
    await quick.press('Enter')
    const row2 = card.locator('.item', { hasText: 'לפתור תרגיל 2' })
    await expect(row2.locator('.sub2')).toHaveText('לימודים')
    await expect(card).toContainText('2 משימות')
    // הבחירה נשארה
    await quick.fill('עוד אחת ללימודים')
    await quick.press('Enter')
    await expect(card.locator('.item', { hasText: 'עוד אחת ללימודים' }).locator('.sub2')).toHaveText('לימודים')
    await expect(card).toContainText('3 משימות')

    // בקנבן: בעמודת "לביצוע" של המסלול, עם תג "היום"
    await go(app, 'פרויקטים')
    const trackTag = app.locator('.tag-scroll').first().getByRole('button', { name: /לימודים/ })
    await expect(trackTag).toContainText('2')
    await trackTag.click()
    const todo = app.locator('.kcol', { has: app.locator('h4', { hasText: 'לביצוע' }) })
    await expect(todo.locator('h4 .faint')).toHaveText('2')
    const kc = todo.locator('.kcard', { hasText: 'לפתור תרגיל 2' })
    await expect(kc).toBeVisible()
    await expect(kc.locator('.chip', { hasText: 'היום' })).toBeVisible()
    // "הכל" — כל השלוש, עם שם המסלול
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    await expect(app.locator('.kcard')).toHaveCount(3)
    await expect(app.locator('.kcard', { hasText: 'לקרוא פרק 3' }).locator('.chip', { hasText: 'חיים' })).toBeVisible()
    await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('3 משימות פתוחות')
    await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('3 משימות בלי הערכת אסימונים')

    // עריכה מהקנבן: אסימונים, קריטי, תת־משימה
    await app.locator('.kcard', { hasText: 'לפתור תרגיל 2' }).click()
    const sh = app.getByRole('dialog', { name: 'משימה' })
    await expect(sh).toBeVisible()
    await expect(sh.getByLabel('כותרת', { exact: true })).toHaveValue('לפתור תרגיל 2')
    const est = sh.locator('label.field', { hasText: 'אסימונים' }).locator('input')
    await est.fill('2')
    await est.press('Enter')
    await sh.getByRole('switch').click()
    await expect(sh.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    const sub = sh.getByPlaceholder('+ תת־משימה')
    await sub.fill('לקרוא את השאלה')
    await sub.press('Enter')
    await sub.fill('לכתוב פתרון')
    await sub.press('Enter')
    await expect(sh.locator('.item')).toHaveCount(2)
    // סימון תת־משימה אחת
    await sh.locator('.item', { hasText: 'לקרוא את השאלה' }).getByRole('button', { name: 'סמן כבוצע' }).click()
    await sh.getByRole('button', { name: 'שמירה' }).click()
    await expect(sh).toBeHidden()
    await expect(app.locator('.toast')).toContainText('המשימה נשמרה')

    // הקנבן משקף: 2 אסימונים, קריטי, ☑ 1/2
    const kc2 = app.locator('.kcard', { hasText: 'לפתור תרגיל 2' })
    await expect(kc2.locator('.chip', { hasText: '2 אסימונים' })).toBeVisible()
    await expect(kc2.locator('.chip', { hasText: 'קריטי' })).toBeVisible()
    await expect(kc2.locator('.chip', { hasText: /1\/2/ })).toBeVisible()
    await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('2 אסימונים פתוחים')
    await expect(app.locator('.card', { hasText: 'כל המסלולים' })).toContainText('2 משימות בלי הערכת אסימונים')

    // כותרת המסלול
    await app.locator('.tag-scroll').first().getByRole('button', { name: /לימודים/ }).click()
    const head = app.locator('.card.rail', { hasText: 'לימודים' }).first()
    await expect(head).toContainText('2 אסימונים')
    await expect(head).toContainText('0 מתוך 2 הושלמו')
    await expect(head).toContainText('1 בלי הערכה')

    // היום: הקיבולת, הקריטי, הנתיב הקריטי
    await go(app, 'היום')
    await expect(card).toContainText('2 אסימונים מתוכננים')
    await expect(card).toContainText('קיבולת 6')
    await expect(card).toContainText('2 בלי הערכה')
    const row = card.locator('.item', { hasText: 'לפתור תרגיל 2' })
    await expect(row.locator('.sub2')).toHaveText('לימודים · 2 אסימונים')
    await expect(row.locator('.chip', { hasText: 'קריטי' })).toBeVisible()
    // קריטי עולה למעלה
    await expect(card.locator('.item .ttl').first()).toHaveText('לפתור תרגיל 2')
    const focus = app.locator('.card', { hasText: 'הנתיב הקריטי' })
    await expect(focus.locator('.item', { hasText: 'לפתור תרגיל 2' })).toBeVisible()

    // עריכה מהיום: שינוי כותרת ומסלול
    await row.getByRole('button', { name: 'לפתור תרגיל 2' }).click()
    const sh2 = app.getByRole('dialog', { name: 'משימה' })
    await sh2.getByLabel('כותרת', { exact: true }).fill('לפתור תרגיל 2 — גרסה סופית')
    await sh2.getByRole('group', { name: 'מסלול' }).getByRole('button', { name: /מחקר/ }).click()
    await sh2.getByRole('button', { name: 'שמירה' }).click()
    const row3 = card.locator('.item', { hasText: 'גרסה סופית' })
    await expect(row3.locator('.sub2')).toHaveText('מחקר · 2 אסימונים')

    // שרד רענון
    await reload(app)
    await expect(tasksCard(app).locator('.item', { hasText: 'גרסה סופית' }).locator('.sub2')).toHaveText('מחקר · 2 אסימונים')
    const st = await readState(app)
    const t = live<Task>(st.tasks).find((x) => x.title.includes('גרסה סופית'))!
    expect(t).toMatchObject({ trackId: 'trk-research', est: 2, critical: true, due: TODAY, status: 'todo' })
    expect(t.sub).toHaveLength(2)
    expect(t.sub![0].done).toBe(true)
    expect(live<Task>(st.tasks)).toHaveLength(3)
  })

  test('כותרת ארוכה מאוד לא שוברת את הרשימה', async ({ app }) => {
    const long = 'משימה עם כותרת ארוכה מאוד '.repeat(8).trim()
    await quickAdd(app).fill(long)
    await quickAdd(app).press('Enter')
    const row = tasksCard(app).locator('.item').first()
    await expect(row).toContainText('משימה עם כותרת ארוכה')
    const box = await row.boundingBox()
    const cardBox = await tasksCard(app).boundingBox()
    expect(box!.width).toBeLessThanOrEqual(cardBox!.width + 1)
    // בלי גלילה אופקית של הדף
    const overflow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('"כתוב את המטרות של היום" — גיליון תכנון שמוסיף שורה־שורה', async ({ app }) => {
    await tasksCard(app).getByRole('button', { name: /כתוב את המטרות של היום/ }).click()
    const sh = app.getByRole('dialog', { name: 'המטרות של היום' })
    await expect(sh).toBeVisible()
    await expect(sh).toContainText('קיבולת 6 אסימונים')
    const inp = sh.getByPlaceholder('מה חייב לקרות היום?')
    await inp.fill('מטרה א')
    await inp.press('Enter')
    await inp.fill('מטרה ב')
    await inp.press('Enter')
    await expect(sh.locator('.list .item')).toHaveCount(2)
    // מחיקה מתוך הגיליון
    await sh.getByRole('button', { name: 'מחיקת מטרה ב' }).click()
    await expect(sh.locator('.list .item')).toHaveCount(1)
    await sh.getByRole('button', { name: /סגור · משימה אחת מוכנות/ }).click()
    await expect(sh).toBeHidden()
    await expect(tasksCard(app).locator('.item', { hasText: 'מטרה א' })).toBeVisible()
    await expect(tasksCard(app).locator('.item', { hasText: 'מטרה ב' })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
test.describe('סימון, דחייה, מאגר ואיחור', () => {
  test.use({
    seed: seed((s: AppState) => ({
      ...s,
      settings: { ...s.settings, onboarded: true },
      tasks: [
        task({ id: 't-old', title: 'משימה ישנה', due: '2026-09-08', est: 1 }),
        task({ id: 't-back', title: 'משימה במאגר', trackId: 'trk-project', order: 1 }),
        task({ id: 't-today', title: 'משימה להיום', trackId: 'trk-life', due: TODAY, order: 2 }),
        task({ id: 't-tmrw', title: 'משימה למחר', trackId: 'trk-life', due: TOMORROW, order: 3 }),
        task({ id: 't-done', title: 'כבר נסגרה', due: TODAY, order: 4, status: 'done', doneAt: T0 }),
      ],
    })),
  })

  test('משימה באיחור מתגלגלת עם תג, המאגר מתקפל, סימון והדחייה עוברים לכל המסכים', async ({ app }) => {
    const card = tasksCard(app)
    // באיחור: 3 ימים מ־8.9, למעלה (הוותיקה קודם)
    const old = card.locator('.item', { hasText: 'משימה ישנה' })
    await expect(old.locator('.sub2')).toContainText('באיחור 3 ימים · מ־8.9 · לימודים · אסימון אחד')
    await expect(card.locator('.item .ttl').first()).toHaveText('משימה ישנה')
    await expect(card).toContainText('אסימון אחד מתוכנן')
    await expect(card).toContainText('1 באיחור')
    // של מחר לא כאן, וגם לא מה שכבר נסגר
    await expect(card.locator('.item', { hasText: 'משימה למחר' })).toHaveCount(0)
    await expect(card.locator('.item', { hasText: 'כבר נסגרה' })).toHaveCount(0)

    // המאגר מקופל
    const backBtn = card.getByRole('button', { name: /משימה אחת בלי תאריך/ })
    await expect(backBtn).toBeVisible()
    await expect(card.locator('.item', { hasText: 'משימה במאגר' })).toHaveCount(0)
    await backBtn.click()
    await expect(card.locator('.item', { hasText: 'משימה במאגר' })).toBeVisible()
    await expect(card.locator('.item', { hasText: 'משימה במאגר' }).locator('.sub2')).toHaveText('פרויקט')

    // בקנבן: באיחור מסומן באדום עם התאריך, בלי תאריך בלי תג
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    const kOld = app.locator('.kcard', { hasText: 'משימה ישנה' })
    await expect(kOld.locator('.chip', { hasText: '8.9' })).toBeVisible()
    await expect(app.locator('.kcard', { hasText: 'משימה במאגר' }).locator('.chip')).toHaveCount(1) // רק שם המסלול
    await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'הושלם' }) }).locator('.kcard', { hasText: 'כבר נסגרה' })).toBeVisible()

    // סימון "הושלם" מהיום + ביטול מהטוסט
    await go(app, 'היום')
    const todayRow = card.locator('.item', { hasText: 'משימה להיום' })
    await todayRow.getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(todayRow).toHaveCount(0)
    const toast = app.locator('.toast')
    await expect(toast).toContainText('הושלם')
    await toast.getByRole('button', { name: 'ביטול' }).click()
    await expect(card.locator('.item', { hasText: 'משימה להיום' })).toBeVisible()
    let st = await readState(app)
    expect(st.tasks.find((t: Task) => t.id === 't-today')).toMatchObject({ status: 'todo' })
    expect(st.tasks.find((t: Task) => t.id === 't-today').doneAt).toBeUndefined()

    // סימון סופי
    await card.locator('.item', { hasText: 'משימה להיום' }).getByRole('button', { name: 'סמן כבוצע' }).click()
    await expect(card.locator('.item', { hasText: 'משימה להיום' })).toHaveCount(0)
    st = await readState(app)
    expect(st.tasks.find((t: Task) => t.id === 't-today')).toMatchObject({ status: 'done' })
    expect(typeof st.tasks.find((t: Task) => t.id === 't-today').doneAt).toBe('number')

    // דחייה למחר של הישנה
    await old.getByRole('button', { name: 'דחה למחר' }).click()
    await expect(card.locator('.item', { hasText: 'משימה ישנה' })).toHaveCount(0)
    await expect(app.locator('.toast')).toContainText('נדחה למחר')
    // הכותרת: לא נשאר כלום מתוכנן
    await expect(card).not.toContainText('באיחור')

    // ביומן: מחר מכיל את הישנה ואת של מחר; היום מציג את שנסגרה מסומנת
    await go(app, 'יומן')
    const dayList = app.locator('.card', { has: app.locator('input[placeholder="+ משימה ליום הזה…"]') })
    await expect(dayList).toContainText('יום שישי, 11 בספטמבר')
    const doneRow = dayList.locator('.item', { hasText: 'משימה להיום' })
    await expect(doneRow.getByRole('button', { name: 'סמן כבוצע' })).toHaveAttribute('aria-pressed', 'true')
    await app.getByRole('button', { name: 'יום', exact: true }).click()
    await app.getByRole('button', { name: 'הבא' }).click()
    await expect(dayList).toContainText('יום שבת, 12 בספטמבר')
    await expect(dayList.locator('.item', { hasText: 'משימה ישנה' }).locator('.sub2')).toHaveText('משימה · לימודים')
    await expect(dayList.locator('.item', { hasText: 'משימה למחר' })).toBeVisible()
    // תצוגת חודש: הפיל של המשימות על ה־12
    await app.getByRole('button', { name: 'חודש' }).click()
    const cell12 = app.locator('.cal-cell:not(.out)', { has: app.locator('.n', { hasText: /^12$/ }) })
    await expect(cell12.locator('.pill', { hasText: '2 משימות' })).toBeVisible()

    // בקנבן: "הושלם" גדל
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    const doneCol = app.locator('.kcol', { has: app.locator('h4', { hasText: 'הושלם' }) })
    await expect(doneCol.locator('h4 .faint')).toHaveText('2')
    await expect(app.locator('.kcard', { hasText: 'משימה ישנה' }).locator('.chip', { hasText: '12.9' })).toBeVisible()

    // רענון
    await reload(app)
    st = await readState(app)
    expect(st.tasks.find((t: Task) => t.id === 't-old').due).toBe(TOMORROW)
    await expect(tasksCard(app).locator('.item', { hasText: 'משימה ישנה' })).toHaveCount(0)
  })

  test('הוספת משימה מהיומן ליום הזה מופיעה במסך היום', async ({ app }) => {
    await go(app, 'יומן')
    const inp = app.getByPlaceholder('+ משימה ליום הזה…')
    await inp.fill('נוספה מהיומן')
    await inp.press('Enter')
    await expect(app.locator('.item', { hasText: 'נוספה מהיומן' })).toBeVisible()
    await go(app, 'היום')
    await expect(tasksCard(app).locator('.item', { hasText: 'נוספה מהיומן' }).locator('.sub2')).toHaveText('חיים')
  })

  test('גרירה בקנבן בין עמודות משנה שלב, וחיפוש מוצא בכל המסלולים', async ({ app }) => {
    await go(app, 'פרויקטים')
    await app.locator('.tag-scroll').first().getByRole('button', { name: 'הכל' }).click()
    const card = app.locator('.kcard', { hasText: 'משימה במאגר' })
    // "העבר לשלב הבא": לביצוע → בתהליך → ממתין → לביצוע
    await card.getByRole('button', { name: 'העבר לשלב הבא' }).click()
    await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'בתהליך' }) }).locator('.kcard', { hasText: 'משימה במאגר' })).toBeVisible()
    await app.locator('.kcard', { hasText: 'משימה במאגר' }).getByRole('button', { name: 'העבר לשלב הבא' }).click()
    await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'ממתין' }) }).locator('.kcard', { hasText: 'משימה במאגר' })).toBeVisible()
    // ✓ מהקנבן
    await app.locator('.kcard', { hasText: 'משימה במאגר' }).getByRole('button', { name: 'סמן כהושלם' }).click()
    await expect(app.locator('.kcol', { has: app.locator('h4', { hasText: 'הושלם' }) }).locator('.kcard', { hasText: 'משימה במאגר' })).toBeVisible()
    // חיפוש
    await app.getByPlaceholder('חיפוש בכל המשימות…').fill('למחר')
    await expect(app.locator('.kcard')).toHaveCount(1)
    await expect(app.getByText('תוצאה אחת בכל המסלולים')).toBeVisible()
    await app.getByPlaceholder('חיפוש בכל המשימות…').fill('אין כזה')
    await expect(app.getByText('לא נמצאו משימות.')).toBeVisible()
    const st = await readState(app)
    expect(st.tasks.find((t: Task) => t.id === 't-back')).toMatchObject({ status: 'done' })
  })
})
