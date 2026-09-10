// ---------------------------------------------------------------------------
// בוקר אמיתי בטלפון: קימה ושינה → הרגלים → בלוק עמוק ממסך מלא → אימון עם
// המדים → משימה מהירה → תכנון מחר → חדשות (הצבעה והערה).
// בכל צעד בודקים שהמצב השמור באמת השתנה, לא רק שהמסך הגיב.
// ---------------------------------------------------------------------------
import { EVENING, NOW, TODAY, TOMORROW, YESTERDAY, edition, expect, makeState, openApp, readState, test } from './helpers'

function morningState() {
  const s = makeState()
  s.settings.onboarded = true
  s.days = []
  s.workoutPlan = [
    {
      id: 'wd-wed', updatedAt: 1, dow: 3, title: 'חזה וכתפיים', kind: 'gym',
      exercises: [
        { id: 'ex-bench', name: 'לחיצת חזה', sets: 3, reps: '8-10', metric: 'weight' },
        { id: 'ex-lsit', name: 'L-Sit', sets: 2, metric: 'time' },
      ],
    },
  ]
  return s
}

test.describe('שימוש אמיתי — בוקר', () => {
  test('קימה, שינה, הרגלים, בלוק עמוק, אימון, משימה, תכנון מחר, חדשות', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: morningState(), now: NOW, news: edition() })))

    // --- קימה ושינה -------------------------------------------------------
    await expect(page.getByText('קמת היום בשעה')).toBeVisible()
    await expect(page.getByText('איך ישנת אתמול בלילה?')).toBeVisible()
    await page.getByRole('button', { name: 'כן, קמתי בזמן' }).click()
    await expect(page.getByText('קמת היום בשעה')).toHaveCount(0)
    await page.getByRole('button', { name: 'ישנתי טוב', exact: true }).click()
    await expect(page.getByText('איך ישנת אתמול בלילה?')).toHaveCount(0)
    let s = await readState(page)
    expect(s.days.find((d) => d.date === TODAY)?.wake).toBe('ontime')
    expect(s.days.find((d) => d.date === YESTERDAY)?.sleep).toBe('good')

    // --- הרגלים ------------------------------------------------------------
    const habits = page.locator('.card', { hasText: 'הרגלי היום' })
    await expect(habits.locator('.tiny.faint.ltr')).toHaveText('0/3')
    // שגרת בוקר: פותחים את הצעדים ומסמנים את כולם → ההרגל נסגר לבד
    await habits.getByRole('button', { name: /שגרת בוקר/ }).click()
    const steps = habits.locator('.item .check.sm')
    await expect(steps).toHaveCount(4)
    for (let i = 0; i < 4; i++) await steps.nth(i).click()
    await expect(habits.locator('.tiny.faint.ltr')).toHaveText('1/3')
    s = await readState(page)
    const log = s.days.find((d) => d.date === TODAY)!
    expect(log.habits['hb-morning']).toBe(true)
    expect(Object.values(log.steps).filter(Boolean)).toHaveLength(4)
    // סימון ישיר של הרגל שני (שגרת ערב) והסרה — נשאר 1/3
    const nightCheck = habits.locator('.item', { hasText: 'שגרת ערב' }).locator('.check').first()
    await nightCheck.click()
    await expect(habits.locator('.tiny.faint.ltr')).toHaveText('2/3')
    await nightCheck.click()
    await expect(habits.locator('.tiny.faint.ltr')).toHaveText('1/3')

    // --- בלוק עמוק מ"מה עכשיו" → מצב מיקוד ---------------------------------
    const whatNow = page.locator('.card.rail', { hasText: 'הבא בתור' })
    await expect(whatNow).toContainText('עבודה עמוקה — בוקר')
    await expect(whatNow).toContainText('08:30–12:30')
    await whatNow.getByRole('button', { name: 'התחל' }).click()
    const focus = page.locator('.focus')
    await expect(focus).toBeVisible()
    const vp = page.viewportSize()!
    expect(await focus.boundingBox()).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height })
    await expect(page.locator('.focus-time')).toHaveText(/^(90:00|89:5\d)$/)
    await expect(page.locator('.focus-track')).toContainText('עבודה עמוקה — בוקר')
    s = await readState(page)
    expect(s.timer).toMatchObject({ running: true, label: 'עבודה עמוקה — בוקר', targetMinutes: 90 })
    // wake-lock: לא זורק גם אם לא נתמך/נדחה (אין pageerror)
    expect(errors).toEqual([])
    await page.getByRole('button', { name: 'יציאה ממצב מיקוד' }).click()
    await expect(focus).toHaveCount(0)
    // הכפתור "התחל" נעלם מהלו״ז כל עוד הטיימר רץ
    await expect(page.locator('.card', { hasText: 'הלו״ז של היום' }).getByRole('button', { name: 'התחל' })).toHaveCount(0)
    await page.getByRole('button', { name: 'ביטול בלי לשמור' }).click()
    s = await readState(page)
    expect(s.timer).toBeNull()
    // ומהלו״ז עצמו (הבלוק של אחה״צ)
    const sched = page.locator('.card', { hasText: 'הלו״ז של היום' })
    await sched.locator('.item', { hasText: 'אחה״צ' }).getByRole('button', { name: 'התחל' }).click()
    await expect(focus).toBeVisible()
    s = await readState(page)
    expect(s.timer?.label).toBe('עבודה עמוקה — אחה״צ')
    await page.getByRole('button', { name: '✓ סיים ושמור' }).click()
    await expect(focus).toHaveCount(0)
    s = await readState(page)
    expect(s.timer).toBeNull()
    // פחות מדקה — לא נשמר סשן
    expect(s.sessions).toHaveLength(0)

    // --- אימון: סט עם המדים -------------------------------------------------
    await page.getByRole('button', { name: 'פתיחת האימון' }).click()
    const flow = page.getByRole('dialog', { name: 'אימון' })
    await expect(flow).toBeVisible()
    const bench = flow.locator('.card', { hasText: 'לחיצת חזה' })
    await bench.locator('.setchip').first().click()
    const edit = bench.locator('.set-edit')
    await expect(edit).toBeVisible()
    await edit.getByRole('button', { name: 'הוספת ק״ג' }).click()
    await edit.getByRole('button', { name: 'הוספת ק״ג' }).click()
    await edit.getByRole('button', { name: 'הוספת חזרות' }).click()
    await expect(edit.locator('.val').first()).toHaveText('5')
    await expect(edit.locator('.val').nth(1)).toHaveText('9')
    await expect(bench.locator('.setchip').first()).toContainText('5×9')
    await edit.getByRole('button', { name: '✓ אישור' }).click()
    // סט שני יורש את הראשון
    await bench.locator('.setchip').nth(1).click()
    await expect(bench.locator('.setchip').nth(1)).toContainText('5×9')
    await bench.locator('.set-edit').getByRole('button', { name: 'הפחתת חזרות' }).click()
    await expect(bench.locator('.setchip').nth(1)).toContainText('5×8')
    // החזקה בשניות
    const lsit = flow.locator('.card', { hasText: 'L-Sit' })
    await lsit.locator('.setchip').first().click()
    await lsit.locator('.set-edit').getByRole('button', { name: 'הוספת שניות' }).click()
    await expect(lsit.locator('.setchip').first()).toContainText('25 שנ׳')
    s = await readState(page)
    const wo = s.workouts.find((w) => w.date === TODAY)!
    expect(wo.sets['ex-bench']).toEqual([{ kg: 5, reps: 9 }, { kg: 5, reps: 8 }])
    expect(wo.sets['ex-lsit']).toEqual([{ sec: 25 }])
    expect(wo.dayId).toBe('wd-wed')
    await flow.getByRole('button', { name: '✓ סיימתי' }).click()
    await expect(flow).toHaveCount(0)
    s = await readState(page)
    expect(s.workouts.find((w) => w.date === TODAY)?.finishedAt).toBeTruthy()
    expect(s.days.find((d) => d.date === TODAY)?.habits['hb-workout']).toBe(true)
    expect(s.days.find((d) => d.date === TODAY)?.workout).toBe('strength')
    await expect(habits.locator('.tiny.faint.ltr')).toHaveText('2/3')
    await expect(page.locator('.card', { hasText: 'חזה וכתפיים' }).getByText('✓ בוצע')).toBeVisible()

    // --- משימה מהירה ---------------------------------------------------------
    const tasks = page.locator('.card', { hasText: 'המשימות של היום' })
    const quick = tasks.getByPlaceholder('משימה מהירה להיום…')
    await quick.click()
    // בחירת המסלול נדבקת
    await tasks.locator('.tag', { hasText: 'מחקר' }).click()
    await quick.fill('לקרוא את המאמר של כהן')
    await quick.press('Enter')
    await expect(tasks.getByText('לקרוא את המאמר של כהן')).toBeVisible()
    await quick.fill('לכתוב סיכום')
    await quick.press('Enter')
    s = await readState(page)
    const t1 = s.tasks.find((t) => t.title === 'לקרוא את המאמר של כהן')!
    const t2 = s.tasks.find((t) => t.title === 'לכתוב סיכום')!
    expect(t1).toMatchObject({ due: TODAY, trackId: 'trk-research', status: 'todo' })
    expect(t2).toMatchObject({ due: TODAY, trackId: 'trk-research' })
    // סימון ✓ → הושלם, והכותרת מדווחת
    await tasks.locator('.item', { hasText: 'לכתוב סיכום' }).locator('.check').click()
    s = await readState(page)
    expect(s.tasks.find((t) => t.title === 'לכתוב סיכום')?.status).toBe('done')

    // --- תכנון מחר מהצעד "לארגן את מחר" בשגרת הערב ---------------------------
    await habits.getByRole('button', { name: /שגרת ערב/ }).click()
    await habits.getByRole('button', { name: '🌙 פתח' }).click()
    const plan = page.getByRole('dialog', { name: 'תכנון מחר' })
    await expect(plan).toBeVisible()
    await expect(plan).toContainText('יום חמישי, 10 בספטמבר')
    const planInput = plan.getByPlaceholder('מה חייב לקרות מחר?')
    await planInput.fill('להגיש את תרגיל 5')
    await planInput.press('Enter')
    await planInput.fill('לקבוע תור לרופא')
    await planInput.press('Enter')
    await expect(plan.locator('.item')).toHaveCount(2)
    // משיכה מהמאגר: המשימה של היום מוצעת (עד שבוע קדימה / בלי תאריך / באיחור)
    await plan.locator('.tag', { hasText: 'לקרוא את המאמר של כהן' }).click()
    await expect(plan.locator('.item')).toHaveCount(3)
    await plan.getByRole('button', { name: /^סגור/ }).click()
    await expect(plan).toHaveCount(0)
    s = await readState(page)
    expect(s.tasks.filter((t) => t.due === TOMORROW && !t.deleted).map((t) => t.title).sort()).toEqual(
      ['להגיש את תרגיל 5', 'לקבוע תור לרופא', 'לקרוא את המאמר של כהן'].sort(),
    )
    // והמשימה שנמשכה כבר לא ברשימת היום
    await expect(tasks.getByText('לקרוא את המאמר של כהן')).toHaveCount(0)

    // --- חדשות: ▲ / ▼ והערה ---------------------------------------------------
    const news = page.locator('.card', { hasText: 'חדשות הבוקר ·' })
    await expect(news).toBeVisible()
    await expect(news).toContainText('9 סיפורים')
    const first = news.locator('.item').first()
    await first.getByRole('button', { name: 'אהבתי' }).click()
    await expect(first.getByRole('button', { name: 'אהבתי' })).toHaveAttribute('aria-pressed', 'true')
    s = await readState(page)
    expect(s.news).toHaveLength(1)
    expect(s.news[0]).toMatchObject({ date: TODAY, votes: { 'israel-0': { v: 1, section: 'ישראל' } } })
    expect(s.news[0].votes['israel-0'].headline).toContain('כותרת 1')
    // ▼ מחליף, ולחיצה שנייה על אותו כפתור מבטלת
    await first.getByRole('button', { name: 'לא אהבתי' }).click()
    s = await readState(page)
    expect(s.news[0].votes['israel-0'].v).toBe(-1)
    await first.getByRole('button', { name: 'לא אהבתי' }).click()
    s = await readState(page)
    expect(s.news[0].votes['israel-0']).toBeUndefined()
    await news.locator('.item').nth(4).getByRole('button', { name: 'אהבתי' }).click()
    await expect(news.getByText('סימון אחד נשמרו')).toBeVisible()
    // הערה למהדורה נשמרת ביציאה מהשדה
    await news.getByRole('button', { name: '✍️ הערה למהדורה' }).click()
    const ta = news.locator('textarea')
    await ta.fill('פחות פוליטיקה, יותר מתמטיקה')
    await ta.blur()
    s = await readState(page)
    expect(s.news[0].note).toBe('פחות פוליטיקה, יותר מתמטיקה')
    expect(s.news[0].votes['tech-1'].v).toBe(1)
    // ✕ מסמן שנקרא להיום — הכרטיס נעלם, ואחרי רענון נשאר סגור
    await news.getByRole('button', { name: 'סמן כנקרא וסגור להיום' }).click()
    await expect(news).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.bottomnav button')).toHaveCount(5)
    await expect(page.locator('.card', { hasText: 'חדשות הבוקר ·' })).toHaveCount(0)
    // המצב שרד את הרענון
    s = await readState(page)
    expect(s.days.find((d) => d.date === TODAY)?.habits['hb-workout']).toBe(true)
    expect(s.news[0].note).toBe('פחות פוליטיקה, יותר מתמטיקה')
    expect(errors).toEqual([])
  })

  test('ערב: "תכנון מחר" מכרטיס המשימות, ומסך ריק בבוקר מציע לכתוב מטרות', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: morningState(), now: EVENING })))
    // בערב אין שאלות בוקר
    await expect(page.getByText('קמת היום בשעה')).toHaveCount(0)
    const tasks = page.locator('.card', { hasText: 'המשימות של היום' })
    await expect(tasks.getByText('אין משימות להיום. אפשר לתכנן את מחר בכפתור למעלה.')).toBeVisible()
    await tasks.getByRole('button', { name: '🌙 תכנון מחר' }).click()
    const plan = page.getByRole('dialog', { name: 'תכנון מחר' })
    await expect(plan).toBeVisible()
    await expect(plan).toContainText('קיבולת 6 אסימונים')
    await plan.getByPlaceholder('מה חייב לקרות מחר?').fill('משימה למחר')
    await plan.getByRole('button', { name: 'הוספה' }).click()
    await expect(plan.locator('.item')).toHaveCount(1)
    await plan.getByRole('button', { name: /^סגור/ }).click()
    const s = await readState(page)
    expect(s.tasks.find((t) => t.title === 'משימה למחר')?.due).toBe(TOMORROW)
    expect(errors).toEqual([])
  })

  test('בוקר בלי משימות: "כתוב את המטרות של היום"', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: morningState(), now: NOW })))
    const tasks = page.locator('.card', { hasText: 'המשימות של היום' })
    await tasks.getByRole('button', { name: '✍️ כתוב את המטרות של היום' }).click()
    const plan = page.getByRole('dialog', { name: 'המטרות של היום' })
    await expect(plan).toBeVisible()
    const input = plan.getByPlaceholder('מה חייב לקרות היום?')
    await input.fill('מטרה אחת')
    await input.press('Enter')
    await plan.getByRole('button', { name: /^סגור/ }).click()
    await expect(tasks.getByText('מטרה אחת')).toBeVisible()
    const s = await readState(page)
    expect(s.tasks.find((t) => t.title === 'מטרה אחת')?.due).toBe(TODAY)
    expect(errors).toEqual([])
  })
})
