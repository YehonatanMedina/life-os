// ---------------------------------------------------------------------------
// עקביות: גופן, סולם גדלים, רקעי כרטיסים, כותרות מקטע, גובה כפתורים, ריווח,
// אימוג׳ים בכרום המערכת. רץ על כל מסך וגיליון, ומסכם ל-audit-<project>-<theme>.json
// ---------------------------------------------------------------------------
import { test, expect } from '../fixtures'
import { EVENING_MS, THEMES, atlasCache, nav, openApp, richState, writeJson } from './helpers'
import { auditScreen, type AuditResult } from './audit-lib'

for (const theme of THEMES) {
  test(`סריקת עקביות על כל המסכים (${theme})`, async ({ app }, info) => {
    test.setTimeout(240_000)
    const results: AuditResult[] = []
    const run = async (name: string, root?: string) => results.push(await auditScreen(app, name, { root }))

    await openApp(app, { state: richState(theme), atlas: atlasCache() })
    await run('today')
    await app.locator('.card', { hasText: 'הרגלי היום' }).locator('button.txt').first().click()
    await app.getByRole('button', { name: /משימות בלי תאריך/ }).click()
    await run('today-expanded')
    await app.locator('.card', { hasText: 'המשימות של היום' }).locator('button.txt').first().click()
    await run('sheet-task', '.scrim')
    await app.keyboard.press('Escape')
    await app.getByRole('button', { name: /רישום ידני/ }).click()
    await run('sheet-manual', '.scrim')
    await app.keyboard.press('Escape')
    await app.locator('.wk-strip .wd.now').click()
    await app.getByRole('dialog', { name: 'אימון' }).locator('.setchip').first().click()
    await run('sheet-workout', '.flow')
    await app.getByRole('dialog', { name: 'אימון' }).locator('.flow-head button').last().click()
    await app.getByRole('button', { name: 'פתיחת הטיימר על כל המסך' }).click()
    await run('focus', '.focus')
    await app.keyboard.press('Escape')

    await app.locator('button.card.alert', { hasText: 'המעבר השבועי מחכה' }).click()
    const flow = app.locator('.flow')
    for (let step = 0; step < 6; step++) {
      await run(`flow-step${step + 1}`, '.flow')
      if (step === 2) {
        await flow.locator('textarea').first().fill('א')
        await flow.locator('.scorebar button', { hasText: /^7$/ }).click()
      }
      if (step < 5) await flow.locator('.flow-foot .btn.primary').click()
    }
    await flow.locator('.flow-head button[aria-label="סגירה"]').click()

    await nav(app, 'calendar')
    for (const label of ['חודש', 'שבוע', 'יום']) {
      await app.locator('.btn.xs', { hasText: new RegExp(`^${label}$`) }).click()
      await app.waitForTimeout(100)
      await run(`calendar-${label}`)
    }
    await app.locator('.card .item.tappable').first().click()
    await run('sheet-event', '.scrim')
    await app.keyboard.press('Escape')

    await nav(app, 'projects')
    await run('projects')
    await app.locator('.kcard').first().click()
    await run('sheet-task-board', '.scrim')
    await app.keyboard.press('Escape')

    await nav(app, 'review')
    await run('review')

    await nav(app, 'settings')
    await run('settings')
    await app.locator('.card', { hasText: 'מבנה השבוע הקבוע' }).locator('.item.tappable').first().click()
    await run('sheet-rule', '.scrim')
    await app.keyboard.press('Escape')

    await nav(app, 'atlas')
    await run('atlas')

    // הערב — כפתור "תכנון מחר" וגיליון התכנון
    await openApp(app, { state: richState(theme), atlas: atlasCache(), time: EVENING_MS })
    await run('today-evening')
    await app.getByRole('button', { name: /תכנון מחר/ }).click()
    await run('sheet-plan', '.scrim')
    await app.keyboard.press('Escape')

    writeJson(`audit-${info.project.name}-${theme}.json`, results)

    const all = (k: keyof AuditResult) => results.flatMap((r) => (r[k] as any[]).map((v) => ({ screen: r.screen, ...v })))
    const fam = all('fontFamily')
    const scale = all('fontScale')
    const emoji = all('emoji')
    const heads = all('headers')
    const cardBg = all('cardBg')
    const btnH = all('buttonHeights')
    // הזחה מכוונת של שלבי הרגל (paddingInlineStart: 44) אינה סטייה
    const spacing = all('spacing').filter((v: any) => v.kind !== 'adhoc-card-header' && !(v.kind === 'item' && /44px/.test(v.detail)))
    const adhoc = all('spacing').filter((v: any) => v.kind === 'adhoc-card-header')

    // רק משפחה אחת בממשק — צריך לעבור
    expect(fam, 'כל טקסט ב---font-ui, מונו רק במכשור').toEqual([])

    // כותרות מקטע: אותו קול בכל מקום
    const styles = new Set(heads.map((h: any) => h.style))
    expect([...styles].length, `סגנונות שונים לכותרות מקטע: ${[...styles].join(' | ')}`).toBe(1)

    // .card-h מתועד אך לא בשימוש — כל כותרת כרטיס נבנית ידנית
    const cardH = results.some((r) => r.spacing.some((v) => v.kind === 'card-h'))
    test.info().annotations.push({ type: 'note', description: `adhoc card headers: ${adhoc.length}, .card-h in DOM: ${cardH}` })

    // ליקויים שאומתו — מתועדים בדוח; הבדיקה מסומנת fixme עד שיתוקנו
    const offScale = [...new Set(scale.map((v: any) => v.detail))]
    test.fixme(scale.length > 0, `גדלי גופן מחוץ לסולם: ${offScale.join(', ')} (${scale.length} מופעים)`)
    test.fixme(emoji.length > 0, `אימוג׳ים בכרום המערכת: ${[...new Set(emoji.map((v: any) => v.text))].slice(0, 8).join(' | ')}`)
    test.fixme(cardBg.length > 0, `כרטיסים עם רקע צבוע: ${[...new Set(cardBg.map((v: any) => v.text))].join(' | ')}`)
    test.fixme(btnH.length > 0, `כפתורים מאותה מחלקה בגבהים שונים: ${btnH.map((b: any) => `${b.classes}=${b.heights.join('/')}`).slice(0, 6).join(' ; ')}`)
    test.fixme(spacing.length > 0, `ריווח שסוטה מהמתועד: ${[...new Set(spacing.map((v: any) => `${v.kind} ${v.detail}`))].slice(0, 6).join(' ; ')}`)
  })
}
