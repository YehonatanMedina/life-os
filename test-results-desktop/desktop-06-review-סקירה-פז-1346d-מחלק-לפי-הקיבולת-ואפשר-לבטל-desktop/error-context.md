# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: desktop\06-review.spec.ts >> סקירה >> "פזר על ימי השבוע" מחלק לפי הקיבולת ואפשר לבטל
- Location: tests\e2e\desktop\06-review.spec.ts:234:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog', { name: 'מעבר שבועי' })
Expected substring: "12 מתוך 42 אסימונים"
Received string:    "המשימותשבוע 30.8 – 5.9 · שלב 5/6✕מה נכנס לשבוע הבא. נגיעה מושכת משימה פנימה, ובסוף אפשר לפזר אותן על הימים לפי הקיבולת של כל יום.3 משימות בשבוע0 מתוך 42 אסימוניםפזר על ימי השבועאיך זה יושב על הימיםא׳6.9· משימה א· משימה ב· משימה ג0/6ב׳7.9פנוי0/6ג׳8.9פנוי0/6ד׳9.9פנוי0/6ה׳10.9פנוי0/6ו׳11.9פנוי0/6ש׳12.9פנוי0/6מהמאגר🔭 מחקר+ משימה במאגר לשבוע הבאמשימה חדשה לשבוע📘 לימודים🔭 מחקר🚀 פרויקט🌿 חייםהוספהחזרההבא ←"
Timeout: 8000ms

Call log:
  - Expect "toContainText" getByRole('dialog', { name: 'מעבר שבועי' }) with timeout 8000ms
  - waiting for getByRole('dialog', { name: 'מעבר שבועי' })
    20 × locator resolved to <div class="flow" role="dialog" aria-modal="true" aria-label="מעבר שבועי">…</div>
       - unexpected value "המשימותשבוע 30.8 – 5.9 · שלב 5/6✕מה נכנס לשבוע הבא. נגיעה מושכת משימה פנימה, ובסוף אפשר לפזר אותן על הימים לפי הקיבולת של כל יום.3 משימות בשבוע0 מתוך 42 אסימוניםפזר על ימי השבועאיך זה יושב על הימיםא׳6.9· משימה א· משימה ב· משימה ג0/6ב׳7.9פנוי0/6ג׳8.9פנוי0/6ד׳9.9פנוי0/6ה׳10.9פנוי0/6ו׳11.9פנוי0/6ש׳12.9פנוי0/6מהמאגר🔭 מחקר+ משימה במאגר לשבוע הבאמשימה חדשה לשבוע📘 לימודים🔭 מחקר🚀 פרויקט🌿 חייםהוספהחזרההבא ←"

```

```yaml
- dialog "מעבר שבועי":
  - text: המשימות שבוע 30.8 – 5.9 · שלב 5/6
  - button "סגירה": ✕
  - paragraph: מה נכנס לשבוע הבא. נגיעה מושכת משימה פנימה, ובסוף אפשר לפזר אותן על הימים לפי הקיבולת של כל יום.
  - text: 3 משימות בשבוע 0 מתוך 42 אסימונים
  - button "פזר על ימי השבוע"
  - text: איך זה יושב על הימים א׳ 6.9 · משימה א · משימה ב · משימה ג 0/6 ב׳ 7.9 פנוי 0/6 ג׳ 8.9 פנוי 0/6 ד׳ 9.9 פנוי 0/6 ה׳ 10.9 פנוי 0/6 ו׳ 11.9 פנוי 0/6 ש׳ 12.9 פנוי 0/6 מהמאגר 🔭 מחקר
  - button "+ משימה במאגר לשבוע הבא"
  - text: משימה חדשה לשבוע
  - button "📘 לימודים"
  - button "🔭 מחקר"
  - button "🚀 פרויקט"
  - button "🌿 חיים"
  - textbox "מה עוד חייב לקרות בשבוע הבא?"
  - button "הוספה" [disabled]
  - button "חזרה"
  - button "הבא ←"
```

# Test source

```ts
  175 | 
  176 |     // 6. סיום
  177 |     await expect(title).toHaveText('סיום')
  178 |     await expect(flow).toContainText('השבוע הבא, בשורה אחת')
  179 |     await expect(flow.locator('.card', { hasText: 'מטרות־העל' }).locator('.item')).toHaveCount(2)
  180 |     await expect(flow).toContainText('משימות בשבוע')
  181 |     await flow.getByRole('button', { name: '✓ סגירת השבוע' }).click()
  182 |     await expect(flow).toBeHidden()
  183 |     await expect(app.locator('.toast')).toContainText('השבוע נסגר')
  184 | 
  185 |     // במסך היום: התזכורת נעלמה, מטרות־העל של השבוע מוצגות
  186 |     await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toHaveCount(0)
  187 |     const goals = app.locator('.card', { hasText: 'מטרות־העל של השבוע' })
  188 |     await expect(goals).toBeVisible()
  189 |     await expect(goals.locator('.item')).toHaveCount(2)
  190 |     await expect(goals.locator('.item').nth(0)).toContainText('לסיים את פרק 1 בסמינר')
  191 |     await expect(goals.locator('.item').nth(0).locator('.sub2')).toHaveText('מחקר')
  192 |     await expect(goals).toContainText('0/2')
  193 |     await goals.locator('.item').nth(1).getByRole('button', { name: 'סמן כבוצע' }).click()
  194 |     await expect(goals).toContainText('1/2')
  195 | 
  196 |     // בסקירה: השבוע נסגר, ציון, שבועות קודמים
  197 |     await go(app, 'סקירה')
  198 |     await expect(app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' })).toHaveCount(0)
  199 |     await app.getByRole('button', { name: 'לשבוע הקודם' }).click()
  200 |     await expect(app.locator('.sec .spread').first()).toContainText('שבוע 30.8 – 5.9')
  201 |     const closed = app.locator('.card', { hasText: 'השבוע הזה נסגר' })
  202 |     await expect(closed).toBeVisible()
  203 |     await expect(closed.locator('.chip')).toHaveText('7/10')
  204 |     await expect(closed).toContainText('טיוטה ראשונה של הסמינר')
  205 |     await app.getByRole('button', { name: 'השבוע', exact: true }).click()
  206 |     const hist = app.locator('.card', { hasText: 'שבועות קודמים' })
  207 |     await expect(hist.locator('.item')).toHaveCount(1)
  208 |     await expect(hist.locator('.item')).toContainText('3.5 אסימונים')
  209 |     await expect(hist.locator('.item')).toContainText('50% הרגלים')
  210 |     await expect(hist.locator('.item .chip')).toHaveText('7/10')
  211 |     // בשבוע הנוכחי — המטרות מוצגות גם כאן
  212 |     await expect(app.locator('.card', { hasText: 'מטרות־העל של השבוע' })).toContainText('1/2')
  213 | 
  214 |     // המצב השמור
  215 |     const st = await readState(app)
  216 |     const prev = st.weeks.find((w: WeekLog) => w.weekStart === PREV_WEEK_START)
  217 |     expect(prev.review.score).toBe(7)
  218 |     expect(prev.review.snapshot).toMatchObject({ minutes: 315, tasksDone: 1, daysLogged: 2 })
  219 |     expect(prev.review.snapshot.tokens).toBeCloseTo(3.5)
  220 |     const cur = st.weeks.find((w: WeekLog) => w.weekStart === WEEK_START)
  221 |     expect(cur.goals.map((g: any) => [g.text, g.trackId, !!g.done])).toEqual([
  222 |       ['לסיים את פרק 1 בסמינר', 'trk-research', false],
  223 |       ['לרוץ 10 ק״מ', undefined, true],
  224 |     ])
  225 |     expect(typeof cur.plannedAt).toBe('number')
  226 |     const tasks = live<Task>(st.tasks)
  227 |     expect(tasks.find((t) => t.title === 'להגיש דו״ח')!.due).toBe(WEEK_START)
  228 |     expect(tasks.find((t) => t.id === 't-pool')!.due).toBe(WEEK_START)
  229 | 
  230 |     await reload(app)
  231 |     await expect(app.locator('.card', { hasText: 'מטרות־העל של השבוע' })).toContainText('1/2')
  232 |   })
  233 | 
  234 |   test('"פזר על ימי השבוע" מחלק לפי הקיבולת ואפשר לבטל', async ({ app }) => {
  235 |     await go(app, 'סקירה')
  236 |     await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
  237 |     const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
  238 |     const next = flow.getByRole('button', { name: 'הבא ←' })
  239 |     await next.click()
  240 |     await next.click()
  241 |     await flow.locator('.qcard textarea').first().fill('x')
  242 |     await flow.locator('.scorebar').getByRole('button', { name: '5', exact: true }).click()
  243 |     await next.click()
  244 |     await next.click()
  245 |     await expect(flow.locator('.flow-head b').first()).toHaveText('המשימות')
  246 |     const inp = flow.getByPlaceholder('מה עוד חייב לקרות בשבוע הבא?')
  247 |     for (const t of ['א', 'ב', 'ג']) {
  248 |       await inp.fill(`משימה ${t}`)
  249 |       await inp.press('Enter')
  250 |     }
  251 |     await expect(flow).toContainText('3 משימות בשבוע')
  252 |     await flow.getByRole('button', { name: 'פזר על ימי השבוע' }).click()
  253 |     await expect(app.locator('.toast')).toContainText('המשימות פוזרו על ימי השבוע')
  254 |     // בלי הערכת אסימונים: מוגבל ל-cap+2 משימות ליום — כולן נכנסות לראשון
  255 |     const sunday = flow.locator('.item', { has: app.locator('.tiny.faint.ltr:text-is("6.9")') })
  256 |     await expect(sunday).toContainText('משימה א')
  257 |     await expect(sunday).toContainText('משימה ג')
  258 | 
  259 |     // עם הערכות: 4+4+4 אסימונים מול קיבולת 6 ליום → ראשון, שני, שלישי
  260 |     const st0 = await readState(app)
  261 |     const ids = live<Task>(st0.tasks).filter((t) => t.title.startsWith('משימה ')).map((t) => t.id)
  262 |     await app.evaluate((ids: string[]) => {
  263 |       const raw = JSON.parse(localStorage.getItem('life-os-v1')!)
  264 |       raw.tasks = raw.tasks.map((x: any) => (ids.includes(x.id) ? { ...x, est: 4, updatedAt: Date.now() } : x))
  265 |       localStorage.setItem('life-os-v1', JSON.stringify(raw))
  266 |     }, ids)
  267 |     await app.reload()
  268 |     await go(app, 'סקירה')
  269 |     await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
  270 |     for (let i = 0; i < 2; i++) await next.click()
  271 |     await flow.locator('.qcard textarea').first().fill('x')
  272 |     await flow.locator('.scorebar').getByRole('button', { name: '5', exact: true }).click()
  273 |     await next.click()
  274 |     await next.click()
> 275 |     await expect(flow).toContainText('12 מתוך 42 אסימונים')
      |                        ^ Error: expect(locator).toContainText(expected) failed
  276 |     await flow.getByRole('button', { name: 'פזר על ימי השבוע' }).click()
  277 |     const dayRow = (d: string) => flow.locator('.item', { has: app.locator(`.tiny.faint.ltr:text-is("${d}")`) })
  278 |     await expect(dayRow('6.9')).toContainText('4/6')
  279 |     await expect(dayRow('7.9')).toContainText('4/6')
  280 |     await expect(dayRow('8.9')).toContainText('4/6')
  281 |     await expect(dayRow('9.9')).toContainText('0/6')
  282 |     const st = await readState(app)
  283 |     expect(live<Task>(st.tasks).filter((t) => t.title.startsWith('משימה ')).map((t) => t.due).sort()).toEqual(['2026-09-06', '2026-09-07', '2026-09-08'])
  284 |   })
  285 | 
  286 |   test.fixme('הטוסט (כולל כפתור "ביטול") מוסתר מאחורי המסך המלא של המעבר השבועי', async ({ app }) => {
  287 |     await go(app, 'סקירה')
  288 |     await app.locator('.card.rail', { hasText: 'סגירת השבוע שהסתיים' }).click()
  289 |     const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
  290 |     const next = flow.getByRole('button', { name: 'הבא ←' })
  291 |     await next.click()
  292 |     await next.click()
  293 |     await next.click() // בלי תשובות — טוסט אימות
  294 |     await expect(app.locator('.toast')).toContainText('ענה לפחות על שאלה אחת')
  295 |     // styles.css: .toast z-index 200, .flow z-index 300 — הטוסט מאחורי המסך המלא
  296 |     const covered = await app.evaluate(() => {
  297 |       const t = document.querySelector('.toast') as HTMLElement
  298 |       const r = t.getBoundingClientRect()
  299 |       return !document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.toast')
  300 |     })
  301 |     expect(covered).toBe(false)
  302 |   })
  303 | })
  304 | 
  305 | // ---------------------------------------------------------------------------
  306 | test.describe('נעילת יום ראשון', () => {
  307 |   test.use({
  308 |     clock: '2026-09-13T09:00:00+03:00',
  309 |     seed: seed((s: AppState) => ({
  310 |       ...s,
  311 |       settings: { ...s.settings, onboarded: true },
  312 |       sessions: [session('s1', at('2026-09-08T12:00:00'), 90, 'trk-study')],
  313 |     })),
  314 |   })
  315 | 
  316 |   test('ביום ראשון עם נתונים האפליקציה ננעלת; "אמלא אחר כך" דוחה; הכיבוי נשמר', async ({ app }) => {
  317 |     const lock = app.locator('.lock-overlay')
  318 |     await expect(lock).toBeVisible()
  319 |     await expect(lock).toContainText('מעבר שבועי')
  320 |     await expect(app.locator('nav.sidebar')).toHaveCount(0)
  321 |     // פתיחת המעבר מהנעילה — על השבוע 6.9–12.9
  322 |     await lock.getByRole('button', { name: 'פתיחת המעבר השבועי' }).click()
  323 |     const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
  324 |     await expect(flow).toContainText('שבוע 6.9 – 12.9')
  325 |     await expect(flow.locator('.ring-wrap .n')).toHaveText('1.0')
  326 |     await flow.getByRole('button', { name: 'סגירה' }).click()
  327 |     await expect(lock).toBeVisible()
  328 |     // דחייה
  329 |     await lock.getByRole('button', { name: 'אמלא אחר כך' }).click()
  330 |     await expect(lock).toHaveCount(0)
  331 |     await expect(app.locator('nav.sidebar')).toBeVisible()
  332 |     await expect(app.locator('.card.rail', { hasText: 'המעבר השבועי מחכה' })).toContainText('6.9–12.9')
  333 |     let st = await readState(app)
  334 |     expect(st.weeks.find((w: WeekLog) => w.weekStart === WEEK_START).snoozeUntil).toBeGreaterThan(Date.parse('2026-09-13T11:00:00+03:00'))
  335 |     // אחרי רענון — עדיין דחוי
  336 |     await reload(app)
  337 |     await expect(app.locator('.lock-overlay')).toHaveCount(0)
  338 |     // מעבר ל"השבוע הבא" בסקירה: 13.9 מסומן בעיצומו
  339 |     await go(app, 'סקירה')
  340 |     await expect(app.locator('.sec .spread').first()).toContainText('שבוע 6.9 – 12.9')
  341 |     await app.getByRole('button', { name: 'לשבוע הבא' }).click()
  342 |     await expect(app.locator('.sec .spread').first()).toContainText(`שבוע 13.9 – 19.9`)
  343 |     void NEXT_WEEK_START
  344 |   })
  345 | 
  346 |   test('"אל תנעל לי את האפליקציה" מכבה את הנעילה לתמיד', async ({ app }) => {
  347 |     await app.locator('.lock-overlay').getByRole('button', { name: 'אל תנעל לי את האפליקציה' }).click()
  348 |     await expect(app.locator('.lock-overlay')).toHaveCount(0)
  349 |     await reload(app)
  350 |     await expect(app.locator('.lock-overlay')).toHaveCount(0)
  351 |     const st = await readState(app)
  352 |     expect(st.settings.reviewLock).toBe(false)
  353 |     await go(app, 'הגדרות')
  354 |     await expect(app.getByRole('switch', { name: 'נעילת סקירה שבועית' })).toHaveAttribute('aria-checked', 'false')
  355 |   })
  356 | })
  357 | 
```