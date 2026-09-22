// ---------------------------------------------------------------------------
// ההרכבה: השבוע שנגזר מתורת האימון, ומה שקורה כשמחילים אותו.
//
// מה שחשוב כאן זה לא שהכפתור עובד, אלא שההחלפה **לא מאבדת כלום**: היסטוריית
// התרגילים נשארת מחוברת, ימי הגיבוי לא נמחקים, ואפשר לבטל.
// ---------------------------------------------------------------------------
import { expect, makeState, openApp, test } from './helpers'

function planned() {
  const s = makeState()
  s.settings.onboarded = true
  s.workoutPlan = [
    { id: 'wd-0', updatedAt: 1, dow: 0, title: 'חדר כושר — דחיפה', kind: 'gym', exercises: [
      { id: 'ex-dips', name: 'מקבילים (Dips)', sets: 3, reps: '8-10', metric: 'bodyweight' },
    ] },
    { id: 'wd-0b', updatedAt: 1, dow: 0, title: 'דחיפה בבית — משקל גוף', kind: 'home', exercises: [] },
    { id: 'wd-1', updatedAt: 1, dow: 1, title: 'ריצה קצרה', kind: 'run', target: { km: 4 }, exercises: [] },
    { id: 'wd-2', updatedAt: 1, dow: 2, title: 'חדר כושר — משיכה ורגליים', kind: 'gym', exercises: [
      { id: 'ex-pull', name: 'מתח (Pull-ups)', sets: 3, reps: '6-8', metric: 'bodyweight' },
    ] },
    { id: 'wd-3', updatedAt: 1, dow: 3, title: 'ריצה קלה', kind: 'run', target: { km: 3 }, exercises: [] },
    { id: 'wd-4', updatedAt: 1, dow: 4, title: 'חדר כושר — משיכה', kind: 'gym', exercises: [] },
    { id: 'wd-5', updatedAt: 1, dow: 5, title: 'ריצה ארוכה', kind: 'run', target: { km: 7, pace: '6:40-7:10' }, exercises: [] },
    { id: 'wd-6', updatedAt: 1, dow: 6, title: 'בית — סקילים', kind: 'home', exercises: [
      { id: 'ex-hs', name: 'תרגול עמידת ידיים על הקיר', sets: 4, reps: 'מקסימום זמן', metric: 'time' },
    ] },
  ] as any
  return s
}

const readPlan = (page: any) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('life-os-v1') || '{}')
    return (s.workoutPlan ?? []).map((d: any) => ({
      id: d.id, dow: d.dow, kind: d.kind, title: d.title, deleted: !!d.deleted,
      km: d.target?.km, pace: d.target?.pace, ex: (d.exercises ?? []).map((e: any) => ({ id: e.id, name: e.name })),
    }))
  })

test('השבוע נגזר, מוחל, ונשמר בלי לאבד היסטוריה', async ({ page, errors }) => {
  errors.push(...(await openApp(page, { state: planned(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()

  const card = page.locator('.card').filter({ hasText: 'השבוע לפי תורת האימון' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'פתיחה' }).click()

  // שבעה ימים, והתרגילים מוצגים ולא רק שמות הימים
  await expect(card).toContainText('ריצה ארוכה')
  await expect(card).toContainText('הרמות עקבים')
  await expect(card).toContainText('Front Lever')
  await expect(card).toContainText('קפיצות פוגו')
  // הבלוק הביתי מוצג בנפרד — הוא לא חלק מתקרת 45 הדקות
  await expect(card).toContainText('בבית לפני')
  // ימי חדר הכושר הם קלט, ולא הנחה
  await expect(card).toContainText('באילו ימים יש חדר כושר')

  // שלוש ריצות, וזו תקרה שנשמרת בהגדרות
  await expect(card).toContainText('כמה ריצות בשבוע')
  await expect(card).toContainText('אין תקרת זמן על ריצה')

  // ההחלפה מבקשת אישור
  await card.getByRole('button', { name: 'החל את התוכנית' }).click()
  await expect(card).toContainText('להחליף את התוכנית השבועית?')
  await card.getByRole('button', { name: 'כן, החלף' }).click()
  await expect(card).toContainText('התוכנית הוחלפה')
  // הכתיבה לאחסון המקומי משוהית — מחכים לה, ולא קוראים מיד
  await expect
    .poll(async () => (await readPlan(page)).some((d: any) => d.dow === 6 && d.kind === 'run'), { timeout: 10_000 })
    .toBe(true)

  const after = await readPlan(page)
  const live = after.filter((d: any) => !d.deleted)

  // יום הגיבוי לא נגע — גם עכשיו, כשההצעה מייצרת תאום ביתי לאותו יום
  expect(live.some((d: any) => d.id === 'wd-0b' && d.title === 'דחיפה בבית — משקל גוף')).toBe(true)

  // ולכל יום חדר כושר נבנה תאום ביתי משלו, שלא מופיע במסך התוכנית אבל קיים
  // לכל יום חדר כושר יש תאום ביתי באותו יום בשבוע — יום סגור מחליף אימון
  // ולא מוחק אותו
  const gymDays = live.filter((d: any) => d.kind === 'gym')
  expect(gymDays.length).toBeGreaterThanOrEqual(3)
  for (const g of gymDays) {
    const twin = live.find((d: any) => d.dow === g.dow && d.kind === 'home' && d.title.startsWith('בבית — '))
    expect(twin, `אין תאום ליום ${g.dow} (${g.title})`).toBeTruthy()
  }

  // שבת הפכה לריצה ארוכה, ושישי לריצה קלה
  const sat = live.find((d: any) => d.dow === 6 && d.kind === 'run')
  expect(sat?.title).toContain('ארוכה')
  expect(sat?.km).toBeGreaterThan(0)

  // זהות התרגילים נשמרה — גם כשהתרגיל עבר יום
  const allEx = live.flatMap((d: any) => d.ex)
  expect(allEx.find((e: any) => e.name === 'מקבילים (Dips)')?.id).toBe('ex-dips')
  expect(allEx.find((e: any) => e.name === 'מתח (Pull-ups)')?.id).toBe('ex-pull')
  // עמידת ידיים עברה מיום שבת לימי חדר הכושר — ועם אותו מזהה
  const hs = allEx.filter((e: any) => e.name === 'תרגול עמידת ידיים על הקיר')
  expect(hs.length).toBeGreaterThan(0)
  expect(hs[0].id).toBe('ex-hs')

  // ומה שנוסף — קיים
  expect(allEx.some((e: any) => e.name.includes('הרמות עקבים בעמידה'))).toBe(true)
  expect(allEx.some((e: any) => e.name === 'קפיצות פוגו')).toBe(true)
  // עמידת ידיים בכל שבעת הימים — זה מה שהבלוק הביתי בא לעשות
  expect(live.filter((d: any) => d.dow <= 6 && d.ex.some((e: any) => e.name.includes('עמידת ידיים'))).length)
    .toBeGreaterThanOrEqual(7)

  // טווח הקצב שנקבע מהריצות שלו לא נמחק על ידי ההחלפה
  expect(live.find((d: any) => d.dow === 5)?.pace).toBe('6:40-7:10')

  expect(errors).toEqual([])
})

test('ביטול מחזיר בדיוק את התוכנית שהייתה', async ({ page, errors }) => {
  errors.push(...(await openApp(page, { state: planned(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  const card = page.locator('.card').filter({ hasText: 'השבוע לפי תורת האימון' })
  await card.getByRole('button', { name: 'פתיחה' }).click()

  const before = await readPlan(page)
  await card.getByRole('button', { name: 'החל את התוכנית' }).click()
  await card.getByRole('button', { name: 'כן, החלף' }).click()
  await expect(card).toContainText('התוכנית הוחלפה')

  await card.getByRole('button', { name: 'ביטול' }).click()
  const after = await readPlan(page)
  expect(after.map((d: any) => [d.dow, d.kind, d.title, d.deleted])).toEqual(
    before.map((d: any) => [d.dow, d.kind, d.title, d.deleted]),
  )
  expect(errors).toEqual([])
})
