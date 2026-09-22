// ---------------------------------------------------------------------------
// השבוע שתורת האימון מייצרת — מהנתונים שלך, לא מתבנית.
//
// למה כרטיס שמחושב מחדש ולא תוכנית שנכתבה פעם אחת: הנפח השבועי אמור לעלות
// כל שבוע, שבוע רביעי אמור לרדת, החלוקה בין הריצות נגזרת מהנפח, והאימון
// האיכותי השני נכנס רק מ-32 ק״מ בשבוע. תוכנית שנכתבת ביד פעם אחת נכונה
// לשבוע אחד ואז מתיישנת בשקט. כאן היא נגזרת מחדש בכל פתיחה: כמה ק״מ רצת,
// כמה שבועות נשארו למרוץ, באילו ימים יש חדר כושר, ומה החוקים אומרים
// (src/training.ts, שם כתוב ליד כל מספר מאיפה הוא).
//
// **ימי חדר הכושר הם קלט ולא הנחה.** מי שאין לו חדר כושר ביום מסוים לא
// מאבד אימון — היום מוחלף בתאום הביתי שלו, כי שבוע עם אימון כוח אחד שובר
// את רצפת השבוע.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { actions, useApp } from '../store'
import { useToast } from '../ui'
import type { WorkoutDay } from '../types'
import { HE_DAYS, HE_DAYS_SHORT } from '../dates'
import { runForecast } from '../forecast'
import { runWeeks } from '../store'
import { weekStart } from '../dates'
import { today as todayISO } from '../dates'
import { alive } from '../store'
import { fieldVdot } from '../adapt'
import {
  DEFAULT_GYM_DAYS, DEFAULT_RUNS_PER_WEEK, HALF_ANCHORS, HOME_TWIN, baseWeeklyKm, blockType,
  checkWeek, paces, planWeek, splitWeek, staleDays, volumeRamp, weekChanges, weekKinds,
  type CurrentDay,
} from '../training'

export default function WeekPlanCard() {
  const s = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState(false)
  /** התוכנית שהייתה לפני ההחלה — כדי שאפשר יהיה לבטל בלחיצה */
  const [undo, setUndo] = useState<WorkoutDay[] | null>(null)

  // שלושת הנתונים שהשבוע נגזר מהם. הם נשמרים, ולכן שינוי בהם משנה את
  // התוכנית בלי לכתוב אותה מחדש.
  const gymDays = s.settings.gymDays ?? DEFAULT_GYM_DAYS
  const runsPerWeek = s.settings.runsPerWeek ?? DEFAULT_RUNS_PER_WEEK

  const view = useMemo(() => {
    const f = runForecast(s)
    const goal = f.items.find((i) => i.km >= 21)
    const weeks = Math.max(4, goal?.weeks ?? 20)
    // הנפח מתחיל ממה שנרוץ בפועל — הגבוה מבין השבועות השלמים
    // האחרונים, ולא ממה שכתוב בתוכנית ולא מהשבוע החלקי שרץ עכשיו.
    const base = baseWeeklyKm(runWeeks(s), weekStart(todayISO()))
    const startKm = Math.max(6, base)
    const ramp = volumeRamp({ startKm, weeks })
    const now = ramp[0]
    // הקצבים נגזרים מהריצה המהירה ביותר ב-60 הימים האחרונים. זו לא ריצת
    // מבחן ולכן היא מזלזלת ביכולת — כלומר הטווח הקל שיוצא ממנה שמרני,
    // וזה הכיוון הנכון לטעות בו.
    const v = fieldVdot(s, todayISO())
    const days = planWeek({ weekKm: now.km, week: 1, weeks, gymDays, runsPerWeek, paces: v ? paces(v) : undefined })

    const current: CurrentDay[] = alive(s.workoutPlan ?? []).map((d) => ({
      dow: d.dow,
      kind: d.kind,
      title: d.title,
      km: d.target?.km,
    }))
    const { changes, fixes } = weekChanges(current, days)
    const peak = Math.max(...ramp.filter((w) => w.kind === 'build').map((w) => w.km))

    // הכרטיס בודק את ההצעה של עצמו מול החוקים. אם משהו כאן אי פעם יידלק,
    // זה באג במחולל — לא הצעה לגיטימית.
    const broken = checkWeek(weekKinds(days))

    // ימים שנשארו בתוכנית מגרסאות קודמות (`staleDays` ב-training.ts)
    const twinTitle = (dow: number) => {
      const d = days.find((x) => x.dow === dow)
      return d?.kind === 'gym' && d.role ? HOME_TWIN[d.role].title : undefined
    }
    const stale = staleDays(alive(s.workoutPlan ?? []), days, twinTitle)

    return {
      weeks, startKm, ramp, now, days, changes, fixes, peak, broken, stale,
      // מספר האיכויות **בפועל**, ולא מה שהנפח היה מאפשר: בשלוש ריצות
      // תמיד אחת, כי בלי ריצה קלה אחת לפחות חלוקת העצימות מתמוטטת.
      quality: splitWeek(now.km, runsPerWeek).qualityDays,
      runs: runsPerWeek,
      block: blockType(1),
    }
  }, [s.workouts, s.workoutPlan, gymDays, runsPerWeek])

  /** מה שנשלח לחנות: שבעת הימים, ואחריהם התאומים הביתיים של ימי הכושר */
  const toPlan = () => {
    const main = view.days.map((d) => ({
      dow: d.dow,
      kind: d.kind,
      title: d.title,
      focus: d.focus,
      target: d.km || d.minutes ? { km: d.km, minutes: d.minutes, pace: d.pace, how: d.how } : undefined,
      exercises: d.exercises,
    }))
    const twins = view.days
      .filter((d) => d.kind === 'gym' && d.role)
      .map((d) => ({
        dow: d.dow,
        kind: 'home' as const,
        title: HOME_TWIN[d.role!].title,
        focus: 'הגרסה הביתית של היום הזה — אותם דפוסים בלי מכונות',
        target: undefined,
        exercises: HOME_TWIN[d.role!].exercises,
        // מזהה את עצמו לפי הכותרת בלבד — כדי שלא יבלע יום גיבוי קיים
        exact: true,
      }))
    return [...main, ...twins]
  }

  return (
    <div className="card pad">
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <b>השבוע לפי תורת האימון</b>
          <div className="tiny faint">
            נגזר מהנפח שלך ומהחוקים — <span className="ltr">{view.weeks}</span> שבועות לחצי מרתון
          </div>
        </div>
        <button className="btn xs" onClick={() => setOpen(!open)}>
          {open ? 'סגירה' : 'פתיחה'}
        </button>
      </div>

      <div className="route-facts" style={{ margin: '10px 0 4px' }}>
        <span>
          השבוע <b className="ltr">{view.now.km}</b> ק״מ
        </span>
        <span>
          ארוכה <b className="ltr">{view.days.find((d) => d.dow === 6)?.km}</b> ק״מ
        </span>
        <span>
          איכות <b className="ltr">{view.quality}</b>
        </span>
        <span>
          שיא מתוכנן <b className="ltr">{view.peak}</b> ק״מ
        </span>
      </div>

      {view.quality === 1 && (
        <div className="tiny faint">
          {view.runs <= 3
            ? 'בשלוש ריצות יש אימון איכות אחד: ארוכה · איכות · קלה. אימון איכות שני דורש ארבע ריצות ומעלה — בלי ריצה קלה אחת לפחות, רוב הנפח מפסיק להיות קל וחלוקת העצימות מתמוטטת.'
            : `האימון האיכותי השני נכנס מ-${HALF_ANCHORS.weeklyKm} ק״מ בשבוע: תקרת עבודת הסף היא 10% מהנפח, ומתחת לזה אין ממה לבנות שני אימונים.`}
        </div>
      )}

      {open && (
        <>
          <div className="section-title" style={{ margin: '12px 0 4px' }}>באילו ימים יש חדר כושר</div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {HE_DAYS_SHORT.map((label, dow) => (
              <button
                key={dow}
                className={`btn xs${gymDays.includes(dow) ? ' primary' : ''}`}
                aria-pressed={gymDays.includes(dow)}
                onClick={() => {
                  const next = gymDays.includes(dow) ? gymDays.filter((d) => d !== dow) : [...gymDays, dow].sort()
                  if (!next.length) return
                  actions.setSettings({ gymDays: next })
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="section-title" style={{ margin: '12px 0 4px' }}>כמה ריצות בשבוע</div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`btn xs${runsPerWeek === n ? ' primary' : ''}`}
                aria-pressed={runsPerWeek === n}
                onClick={() => actions.setSettings({ runsPerWeek: n })}
              >
                <span className="ltr">{n}</span>
              </button>
            ))}
          </div>
          <div className="tiny faint" style={{ marginTop: 4 }}>
            זו <b>תקרה</b>, ומה שנשאר הולך לכוח. אין תקרת זמן על ריצה — שלוש ריצות בלי תקרה נושאות יותר
            נפח מחמש ריצות חסומות ב-45 דקות, וזה גם המבנה של FIRST (שלוש ריצות + אימוני כוח).
          </div>

          <div className="tiny faint" style={{ marginTop: 8 }}>
            יום שסגור מקבל את הגרסה הביתית של האימון — לא מחיקה. לתאריך בודד שבו הוא סגור אפשר לומר לאטלס,
            והוא יסמן אותו.
          </div>

          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            {view.days.map((d) => {
              const home = d.exercises.filter((e) => e.home)
              const main = d.exercises.filter((e) => !e.home)
              return (
                <div key={d.dow} className="item" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 52 }}>
                    <b className="small">{HE_DAYS[d.dow]}</b>
                    {d.hard && <div className="tiny" style={{ color: 'var(--warn-text)' }}>קשה</div>}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small">
                      <b>{d.title}</b>
                      {d.km ? <span className="ltr"> · {d.km} ק״מ</span> : null}
                      {d.pace ? <span className="tiny faint ltr"> · {d.pace}</span> : null}
                    </div>
                    <div className="tiny faint">{d.focus}</div>
                    {d.how && <div className="tiny faint">{d.how}</div>}
                    {!!home.length && (
                      <div className="tiny faint" style={{ marginTop: 3 }}>
                        בבית לפני: {home.map((e) => `${e.name}${e.sets ? ` ${e.sets}×${e.reps ?? ''}` : ''}`).join(' · ')}
                      </div>
                    )}
                    {!!main.length && (
                      <div className="tiny faint" style={{ marginTop: 3 }}>
                        {main.map((e) => `${e.name}${e.sets ? ` ${e.sets}×${e.reps ?? ''}` : ''}`).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="tiny faint" style={{ marginTop: 8 }}>
            <b>שני ימים קשים בלבד בשבוע</b> — ריצת האיכות והארוכה — ויום רגליים כבד. ימי ריצה רצופים,
            כשיש כאלה, הם תמיד קל אחרי קשה או קל לפני ארוך: האיסור הוא על שני ימים <b>קשים</b> ברצף,
            לא על שתי ריצות.
          </div>

          {!!view.broken.length && (
            <div className="run-warn" style={{ marginTop: 10 }}>
              <b className="small">השבוע שנבנה שובר חוק — זה באג במחולל</b>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                {view.broken.map((b) => (
                  <li key={b} className="tiny">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!view.stale.length && (
            <div className="run-warn" style={{ marginTop: 10 }}>
              <b className="small">
                {view.stale.length} ימים בתוכנית שלא שייכים לה
              </b>
              <div className="tiny" style={{ marginTop: 4 }}>
                הם לא מופיעים במסך התוכנית, אבל כן ברשימת "עשיתי אימון אחר" — ולכן הם מבלבלים בשקט.
                מה שנרשם עליהם נשמר.
              </div>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                {view.stale.map((d) => (
                  <li key={d.id} className="tiny faint">
                    {HE_DAYS[d.dow]} · {d.title}
                  </li>
                ))}
              </ul>
              <button
                className="btn xs"
                style={{ marginTop: 8 }}
                onClick={() => {
                  const before = alive(s.workoutPlan ?? []).map((d) => ({ ...d }))
                  for (const d of view.stale) actions.deleteWorkoutDay(d.id)
                  setUndo(before)
                  toast(`${view.stale.length} ימים הוסרו`)
                }}
              >
                להסיר אותם
              </button>
            </div>
          )}

          {!!view.fixes.length && (
            <div className="run-warn" style={{ marginTop: 10 }}>
              <b className="small">מה לא מסתדר בתוכנית הנוכחית</b>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                {view.fixes.map((f) => (
                  <li key={f} className="tiny">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!view.changes.length && (
            <div className="stack" style={{ gap: 2, marginTop: 10 }}>
              <b className="small">מה ישתנה</b>
              {view.changes.map((c) => (
                <div key={c} className="tiny faint">
                  {c}
                </div>
              ))}
            </div>
          )}

          {undo ? (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <div className="tiny faint grow">התוכנית הוחלפה. אפשר להחזיר את הקודמת.</div>
              <button
                className="btn xs"
                onClick={() => {
                  actions.restoreWeekPlan(undo)
                  setUndo(null)
                  toast('התוכנית הקודמת חזרה')
                }}
              >
                ביטול
              </button>
            </div>
          ) : ask ? (
            <div className="run-discard" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
              <span>להחליף את התוכנית השבועית?</span>
              <button className="btn xs" onClick={() => setAsk(false)}>
                לא
              </button>
              <button
                className="btn xs primary"
                onClick={() => {
                  const before = actions.applyWeekPlan(toPlan() as never)
                  setUndo(before)
                  setAsk(false)
                  toast('התוכנית עודכנה')
                }}
              >
                כן, החלף
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm primary grow" onClick={() => setAsk(true)}>
                החל את התוכנית
              </button>
            </div>
          )}
          <div className="tiny faint" style={{ marginTop: 8 }}>
            מה שנרשם על תרגיל נשאר מחובר אליו גם אם הוא עבר ליום אחר — ההחלפה שומרת על זהות התרגילים.
            לכל יום כושר נבנה גם תאום ביתי, שנכנס לבד ביום שבו אין חדר כושר.
          </div>
        </>
      )}
    </div>
  )
}
