// ---------------------------------------------------------------------------
// קריינות הבוקר. הרקע (16.9.2026): הגיליון הצביע על שם קובץ קבוע
// (./news/latest.mp3), הקריינות של הבוקר נפלה, והאפליקציה ניגנה בשקט את
// הקריינות של אתמול מתחת לכותרות של היום. מעכשיו מנגנים רק קובץ שנחתם על
// הטקסט שממנו הוקלט (?v=hash); בלי חתימה — הדפדפן מקריא.
// ---------------------------------------------------------------------------
import { NOW, edition, expect, makeState, openApp, test } from './helpers'

const onboarded = () => {
  const s = makeState()
  s.settings.onboarded = true
  return s
}

const newsCard = (page: import('@playwright/test').Page) =>
  page.locator('.card', { hasText: 'חדשות הבוקר ·' })

test.describe('קריינות הבוקר', () => {
  test('שמע בלי חתימה לא מנוגן — במקומו הקראה של הדפדפן', async ({ page, errors }) => {
    errors.push(
      ...(await openApp(page, { state: onboarded(), now: NOW, news: { ...edition(), audio: './news/latest.mp3' } })),
    )
    const card = newsCard(page)
    await expect(card).toBeVisible()
    await expect(card.locator('audio')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'השמע' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('שמע חתום — הנגן מקבל בדיוק את הכתובת החתומה', async ({ page, errors }) => {
    const audio = './news/latest.mp3?v=4f5cdbfb45'
    errors.push(...(await openApp(page, { state: onboarded(), now: NOW, news: { ...edition(), audio } })))
    const card = newsCard(page)
    await expect(card).toBeVisible()
    const player = card.locator('audio')
    await expect(player).toHaveCount(1)
    expect(await player.getAttribute('src')).toBe(audio)
    await expect(card.getByRole('button', { name: 'השמע' })).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('מהדורה בלי שדה שמע בכלל — הכרטיס עובד, עם הקראה מקומית', async ({ page, errors }) => {
    errors.push(...(await openApp(page, { state: onboarded(), now: NOW, news: edition() })))
    const card = newsCard(page)
    await expect(card).toBeVisible()
    await expect(card).toContainText('9 סיפורים')
    await expect(card.locator('audio')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'השמע' })).toBeVisible()
    expect(errors).toEqual([])
  })
})
