// ---------------------------------------------------------------------------
// השבוע שתורת האימון מייצרת — מהנתונים שלך, לא מתבנית.
//
// למה כרטיס שמחושב מחדש ולא תוכנית שנכתבה פעם אחת: הנפח השבועי אמור לעלות
// כל שבוע, שבוע רביעי אמור לרדת, והחלוקה בין הריצות נגזרת מהנפח. תוכנית
// שנכתבת ביד פעם אחת נכונה לשבוע אחד ואז מתיישנת בשקט. כאן היא נגזרת
// מחדש בכל פתיחה: כמה ק״מ רצת בשבוע האחרון, כמה שבועות נשארו למרוץ, ומה
// החוקים אומרים (src/training.ts, שם כתוב ליד כל מספר מאיפה הוא).
//
// הכרטיס לא כותב לתוכנית לבד. הוא מראה את ההפרש ואת הסיבה, וההחלטה
// להחיל היא של יהונתן — דרך אטלס, שיודע להזיז גם את התרגילים עצמם.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { actions, useApp } from '../store'
import { useToast } from '../ui'
import type { WorkoutDay } from '../types'
import { HE_DAYS } from '../dates'
import { runForecast } from '../forecast'
import { runWeeks } from '../store'
import { weekStart } from '../dates'
import { today as todayISO } from '../dates'
import { alive } from '../store'
import { HALF_ANCHORS, baseWeeklyKm, programFor, proposeWeek, volumeRamp, weekChanges, type CurrentDay } from '../training'

export default function WeekPlanCard() {
  const s = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState(false)
  /** התוכנית שהייתה לפני ההחלה — כדי שאפשר יהיה לבטל בלחיצה */
  const [undo, setUndo] = useState<WorkoutDay[] | null>(null)

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
    const days = proposeWeek({ weekKm: now.km, week: 1, weeks })

    const current: CurrentDay[] = alive(s.workoutPlan ?? []).map((d) => ({
      dow: d.dow,
      kind: d.kind,
      title: d.title,
      km: d.target?.km,
    }))
    const { changes, fixes } = weekChanges(current, days)
    const peak = Math.max(...ramp.filter((w) => w.kind === 'build').map((w) => w.km))
    return { weeks, startKm, ramp, now, days, changes, fixes, peak }
  }, [s.workouts, s.workoutPlan])

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
          שיא מתוכנן <b className="ltr">{view.peak}</b> ק״מ
        </span>
      </div>

      {view.peak < HALF_ANCHORS.weeklyKm && (
        <div className="tiny faint">
          העוגן שנמדד לחצי מרתון הוא <span className="ltr">{HALF_ANCHORS.weeklyKm}</span> ק״מ בשבוע. בקצב הנוכחי
          התוכנית לא מגיעה לשם בזמן הזה — זה אומר שהיעד רחוק יותר משבוע אחד של דחיפה, ולא שצריך להאיץ את הקצב.
        </div>
      )}

      {open && (
        <>
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            {view.days.map((d) => (
              <div key={d.dow} className="item" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 52 }}>
                  <b className="small">{HE_DAYS[d.dow]}</b>
                  {d.hard && <div className="tiny" style={{ color: 'var(--warn-text)' }}>קשה</div>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small">
                    <b>{d.title}</b>
                    {d.km ? <span className="ltr"> · {d.km} ק״מ</span> : null}
                  </div>
                  <div className="tiny faint">{d.focus}</div>
                  {d.how && <div className="tiny faint">{d.how}</div>}
                  {!!programFor(d.dow).length && (
                    <div className="tiny faint" style={{ marginTop: 3 }}>
                      {programFor(d.dow)
                        .map((e) => `${e.name}${e.sets ? ` ${e.sets}×${e.reps ?? ''}` : ''}`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

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
                  const before = actions.applyWeekPlan(
                    view.days.map((d) => ({
                      dow: d.dow,
                      kind: d.kind,
                      title: d.title,
                      focus: d.focus,
                      target: d.km || d.minutes ? { km: d.km, minutes: d.minutes, how: d.how } : undefined,
                      exercises: programFor(d.dow),
                    })) as never,
                  )
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
            ימי גיבוי (״דחיפה בבית״) לא נוגעים.
          </div>
        </>
      )}
    </div>
  )
}
