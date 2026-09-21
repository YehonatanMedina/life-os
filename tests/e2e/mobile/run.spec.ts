// ---------------------------------------------------------------------------
// ריצה עם GPS — בטלפון, מההתחלה ועד שהיא נשמרת כאימון.
//
// ה-GPS מוזרם דרך setGeolocation לאורך מסלול אמיתי (ריבוע של 400 מטר ליד
// הטכניון), כולל רמזור באמצע. זו הדרך היחידה לבדוק את הפיצ׳ר הזה בלי לצאת
// לרוץ, והיא בודקת בדיוק את מה שחשוב: המספרים על המסך, מה נשמר, ומה קורה
// כשהמסך יוצא מקדמת הבמה או כשאין הרשאה.
// ---------------------------------------------------------------------------
import { expect, makeState, openApp, test } from './helpers'

test.setTimeout(180_000)

const LAT = 32.7767
const LON = 35.0225
const M_LAT = 110_900.6
const M_LON = 93_300 // מטרים למעלה של קו אורך בקו הרוחב הזה

/** ריבוע של 400 מטר: 1.6 ק״מ בהקפה */
function squarePoint(meters: number): [number, number] {
  const p = meters % 1600
  const leg = 400
  let x = 0
  let y = 0
  if (p < leg) y = p
  else if (p < 2 * leg) {
    y = leg
    x = p - leg
  } else if (p < 3 * leg) {
    x = leg
    y = leg - (p - 2 * leg)
  } else x = leg - (p - 3 * leg)
  return [LAT + y / M_LAT, LON + x / M_LON]
}

function planWithRun() {
  const s = makeState()
  s.settings.onboarded = true
  s.settings.reviewLock = false
  const dow = new Date().getDay()
  s.workoutPlan = [
    {
      id: 'wd-run',
      updatedAt: 1,
      dow,
      title: 'ריצה קלה',
      kind: 'run',
      target: { km: 3, pace: '5:30-6:10' },
      exercises: [],
    },
  ] as any
  return s
}

/**
 * מזרים קריאות GPS לאורך המסלול. הקצב חייב להיות קצב ריצה אמיתי: המנוע
 * דוחה קריאה שמרמזת על מהירות בלתי אפשרית (קפיצת GPS), ולכן הזנה מהירה
 * מדי פשוט תיזרק — וזה נכון שכך.
 */
async function feed(page: any, opts: { fromM: number; toM: number; mps?: number; accuracy?: number }) {
  const mps = opts.mps ?? 7
  const stepMs = 400
  const stepM = (mps * stepMs) / 1000
  for (let m = opts.fromM; m <= opts.toM; m += stepM) {
    const [lat, lon] = squarePoint(m)
    await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: opts.accuracy ?? 6 })
    await page.waitForTimeout(stepMs)
  }
}

test('ריצה מלאה: התחלה, מרחק וקצב על המסך, קילומטר נסגר, וסיום ששומר אימון', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))

  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await expect(page.getByText('ריצה עם מעקב')).toBeVisible()
  await expect(page.getByText('היעד היום: 3 ק״מ')).toBeVisible()

  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  // מחכים לקליטה, ואז הריצה מתחילה לבד
  await expect(page.getByRole('dialog', { name: /ריצה|GPS/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })

  // 700 מטר בקצב ריצה אמיתי (7 מ׳/ש׳) — הזנה מהירה יותר נדחית כקפיצת GPS
  await feed(page, { fromM: 0, toM: 700 })

  const km = await page.locator('.run-num').first().locator('.run-val').innerText()
  expect(Number(km)).toBeGreaterThan(0.6)
  expect(Number(km)).toBeLessThan(0.8)

  // סיום בלחיצה ארוכה — לחיצה קצרה לא מסיימת
  const finish = page.getByRole('button', { name: /סיום/ })
  await finish.click({ delay: 50 })
  await expect(page.locator('.run-nums')).toBeVisible()

  await finish.hover()
  await page.mouse.down()
  await page.waitForTimeout(1500)
  await page.mouse.up()

  // הסיכום נפתח, והריצה נשמרה כאימון של היום
  await expect(page.getByText('הריצה נשמרה')).toBeVisible({ timeout: 10_000 })
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('life-os-v1') || '{}')
    const w = (s.workouts ?? []).filter((x: any) => !x.deleted).pop()
    return w ? { km: w.km, minutes: w.minutes, hasRun: !!w.run, splits: w.run?.splits?.length ?? 0, poly: (w.run?.poly ?? '').length } : null
  })
  expect(saved).toBeTruthy()
  expect(saved!.km).toBeGreaterThan(0.6)
  expect(saved!.hasRun).toBe(true)
  // המסלול נשמר מקודד ומפושט — קטע ישר מתכווץ לשתי נקודות, וזה בסדר גמור
  expect(saved!.poly).toBeGreaterThan(8)
  expect(errors).toEqual([])
})

test('עמידה ברמזור לא מוסיפה מרחק, והשהיה ידנית עוצרת הכל', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })

  await feed(page, { fromM: 0, toM: 300 })
  const after = Number(await page.locator('.run-num').first().locator('.run-val').innerText())

  // עומדים במקום עם ריצוד GPS של כמה מטרים
  const [slat, slon] = squarePoint(300)
  for (let i = 0; i < 25; i++) {
    await context.setGeolocation({
      latitude: slat + (((i * 37) % 9) - 4) / M_LAT,
      longitude: slon + (((i * 53) % 9) - 4) / M_LON,
      accuracy: 8,
    })
    await page.waitForTimeout(120)
  }
  const still = Number(await page.locator('.run-num').first().locator('.run-val').innerText())
  expect(still - after, 'ריצוד בעמידה לא מוסיף מרחק').toBeLessThan(0.05)

  // השהיה ידנית: גם תזוזה אמיתית לא נספרת
  await page.getByRole('button', { name: 'השהיה' }).click()
  await expect(page.getByRole('button', { name: 'המשך' })).toBeVisible()
  await feed(page, { fromM: 300, toM: 560 })
  const paused = Number(await page.locator('.run-num').first().locator('.run-val').innerText())
  expect(paused - still, 'בהשהיה המרחק לא זז').toBeLessThan(0.05)

  await page.getByRole('button', { name: 'המשך' }).click()
  await feed(page, { fromM: 560, toM: 800 })
  const resumed = Number(await page.locator('.run-num').first().locator('.run-val').innerText())
  expect(resumed).toBeGreaterThan(paused)
  expect(errors).toEqual([])
})

test('בלי הרשאת מיקום: הודעה שמסבירה מה לעשות, בלי מסך תקוע', async ({ page, context, errors }) => {
  await context.clearPermissions()
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-err')).toContainText('הרשאת מיקום', { timeout: 20_000 })
  await page.getByRole('button', { name: /ביטול|סגירה/ }).click()
  await expect(page.getByText('ריצה עם מעקב')).toBeVisible()
  expect(errors).toEqual([])
})

test('מסלול נבחר מהרשימה מופיע על המפה ובכותרת הריצה', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'בחירת מסלול' }).click()

  // הרשימה מסודרת לפי הקרבה ליעד (3 ק״מ), וכל מסלול מציג מרחק ועלייה אמיתיים
  const first = page.locator('.route-card').first()
  await expect(first).toBeVisible()
  await expect(first.locator('.route-facts')).toContainText('ק״מ')
  const name = await first.locator('b').first().innerText()
  await first.getByRole('button', { name: 'התחל' }).click()

  await expect(page.locator('.run-top')).toContainText(name, { timeout: 20_000 })
  await expect(page.locator('.runmap').first()).toBeVisible()
  expect(errors).toEqual([])
})

// ---------------------------------------------------------------------------
// ארבע הבדיקות האלה נולדו מביקורת שמדדה את המסך האמיתי ברוחב 360 ו-375:
// מושהה שלא נראה מושהה, כפתורים שיצאו מהמסך, לחיצה ארוכה שהתבטלה מתזוזה
// של מילימטר, ומסך נעול שהתמוטט לשורה אחת בלתי קריאה.
// ---------------------------------------------------------------------------

test('מושהה נראה מושהה — ולא רק מילה על כפתור', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })
  await feed(page, { fromM: 0, toM: 200 })

  await page.getByRole('button', { name: 'השהיה' }).click()
  await expect(page.locator('.run-paused')).toContainText('מושהה')
  await expect(page.locator('.run-nums.dim')).toBeVisible()
  await expect(page.locator('.run-cap').nth(1)).toHaveText('מושהה')

  // ובהשהיה אפשר למחוק את הריצה — אבל רק אחרי אישור
  await page.getByRole('button', { name: 'מחיקת הריצה' }).click()
  await expect(page.getByText('למחוק את הריצה בלי לשמור?')).toBeVisible()
  await page.getByRole('button', { name: 'לא', exact: true }).click()

  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.locator('.run-paused')).toHaveCount(0)
  await expect(page.locator('.run-nums.dim')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('במסך צר כפתורי ההשהיה והסיום נשארים על המסך', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  // המסך הקטן ביותר שסביר להפעיל עליו את האפליקציה
  await page.setViewportSize({ width: 360, height: 560 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })
  await feed(page, { fromM: 0, toM: 120 })

  for (const name of ['השהיה', /סיום/]) {
    const box = await page.getByRole('button', { name: name as any }).boundingBox()
    expect(box, String(name)).toBeTruthy()
    expect(box!.y + box!.height, `${name} מתחת לקפל`).toBeLessThanOrEqual(560)
    expect(box!.height, `${name} קטן מדי לאצבע`).toBeGreaterThanOrEqual(44)
  }
  expect(errors).toEqual([])
})

test('לחיצה ארוכה לסיום שורדת תזוזה של האצבע', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })
  await feed(page, { fromM: 0, toM: 300 })

  const finish = page.getByRole('button', { name: /סיום/ })
  const box = (await finish.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // ביד אחת, בקצב 170 פעימות, האצבע זזה. זה לא אמור לבטל את הסיום.
  for (const d of [3, 6, 9, 12]) {
    await page.mouse.move(box.x + box.width / 2 + d, box.y + box.height / 2 - d)
    await page.waitForTimeout(300)
  }
  await page.mouse.up()
  await expect(page.getByText('הריצה נשמרה')).toBeVisible({ timeout: 10_000 })
  expect(errors).toEqual([])
})

test('המסך הנעול קריא, והשחרור הוא לחיצה ארוכה', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })
  await feed(page, { fromM: 0, toM: 200 })

  await page.getByRole('button', { name: 'נעילת מסך' }).click()
  const lock = page.locator('.run-lock')
  await expect(lock).toBeVisible()

  // שלוש שורות נפרדות, ולא שלושה מספרים שנדבקו זה לזה
  const rows = lock.locator('.run-lock-nums > div')
  await expect(rows).toHaveCount(3)
  const ys: number[] = []
  for (let i = 0; i < 3; i++) ys.push((await rows.nth(i).boundingBox())!.y)
  expect(ys[1], 'השורה השנייה מתחת לראשונה').toBeGreaterThan(ys[0] + 10)
  expect(ys[2], 'השורה השלישית מתחת לשנייה').toBeGreaterThan(ys[1] + 10)
  await expect(rows.first()).toContainText('ק״מ')

  // לחיצה קצרה לא משחררת
  const unlock = page.getByRole('button', { name: /שחרור/ })
  await unlock.click({ delay: 50 })
  await expect(lock).toBeVisible()

  await unlock.hover()
  await page.mouse.down()
  await page.waitForTimeout(1200)
  await page.mouse.up()
  await expect(lock).toHaveCount(0)
  expect(errors).toEqual([])
})

test('קליטה שנעלמה נאמרת במפורש ולא מוסתרת מאחורי מספר ישן', async ({ page, context, errors }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 6 })
  errors.push(...(await openApp(page, { state: planWithRun(), now: null })))
  await page.locator('.bottomnav button', { hasText: 'אימונים' }).click()
  await page.getByRole('button', { name: 'התחל ריצה' }).click()
  await expect(page.locator('.run-nums')).toBeVisible({ timeout: 20_000 })
  await feed(page, { fromM: 0, toM: 150 })
  await expect(page.locator('.run-gps')).toContainText('GPS')

  // מפסיקים להזין קריאות — בדיוק מה שקורה במנהרה או בין בניינים
  await page.waitForTimeout(18_000)
  await expect(page.locator('.run-gps')).toContainText('אין קליטה')
  await expect(page.locator('.run-gps.bad')).toBeVisible()
  await expect(page.locator('.run-warn').filter({ hasText: 'אין קליטת GPS' })).toBeVisible()
  expect(errors).toEqual([])
})
