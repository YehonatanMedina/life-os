import { test, expect, onboarded, go } from './desk'

test.use({ seed: onboarded })

test('toast under flow probe', async ({ app }) => {
  await go(app, 'סקירה')
  await app.getByRole('button', { name: /סגירת השבוע הנוכחי/ }).click()
  const flow = app.getByRole('dialog', { name: 'מעבר שבועי' })
  const next = flow.getByRole('button', { name: 'הבא ←' })
  await next.click()
  await next.click()
  await next.click()
  await expect(app.locator('.toast')).toContainText('ענה לפחות')
  await app.screenshot({ path: 'test-results-desktop/toast-under-flow.png' })
  const info = await app.evaluate(() => {
    const t = document.querySelector('.toast') as HTMLElement
    const r = t.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { toastZ: getComputedStyle(t).zIndex, topEl: top?.className, inToast: !!top?.closest('.toast') }
  })
  console.log('probe', JSON.stringify(info))
})
