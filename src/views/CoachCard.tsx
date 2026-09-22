// ---------------------------------------------------------------------------
// מה המעבר הלילי עומד לשנות — לפני שהוא משנה.
//
// הכרטיס הזה קיים כדי שהאדפטיביות לא תהיה קסם: ההחלטות נגזרות מהיומן
// בכללים כתובים (src/adapt.ts), והן מוצגות כאן עם **הסיבה והמספר** שממנו
// הן נובעות — אותו דבר בדיוק שנשלח לאטלס בהקשר הלילי. מה שאי אפשר להסביר,
// אי אפשר לסמוך עליו.
//
// מה שלא מופיע כאן: ציון מוכנוּת. הוא יוצר את מה שהוא מנבא.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import { useApp } from '../store'
import { today as todayISO } from '../dates'
import { VERDICT_LABEL, nightly, type Verdict } from '../adapt'

const TONE: Record<Verdict, string> = {
  'back-off': 'var(--warn-text)',
  advance: 'var(--ok-text)',
  progress: 'var(--ok-text)',
  watch: 'var(--warn-text)',
  hold: 'var(--text-dim)',
}

export default function CoachCard() {
  const s = useApp()
  const view = useMemo(() => nightly(s, todayISO()), [s.workouts, s.workoutPlan, s.skills])
  const [open, setOpen] = useState(false)

  const moves = view.calls.filter((c) => c.verdict !== 'hold')
  if (!view.logged) return null

  return (
    <div className="card pad">
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <b>מה משתנה אחרי האימונים האחרונים</b>
          <div className="tiny faint">
            {moves.length
              ? `${moves.length} ${moves.length === 1 ? 'שינוי' : 'שינויים'} מתוך ${view.calls.length} תרגילים שנרשמו`
              : `${view.calls.length} תרגילים נרשמו, ואף אחד לא דורש שינוי`}
          </div>
        </div>
        <button className="btn xs" onClick={() => setOpen(!open)}>
          {open ? 'סגירה' : 'פתיחה'}
        </button>
      </div>

      {!!view.flags.length && (
        <div className="run-warn" style={{ marginTop: 10 }}>
          <b className="small">מה שדורש החלטה שלך</b>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {view.flags.map((f) => (
              <li key={f} className="tiny">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!view.week.length && (
        <div className="stack" style={{ gap: 4, marginTop: 10 }}>
          {view.week.map((w) => (
            <div key={w} className="tiny faint">
              {w}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {(moves.length ? moves : view.calls).map((c) => (
            <div key={c.exId} className="item" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 64 }}>
                <b className="tiny" style={{ color: TONE[c.verdict] }}>
                  {VERDICT_LABEL[c.verdict]}
                </b>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small">
                  <b>{c.name}</b>
                  <span className="tiny faint"> · {c.dayTitle}</span>
                </div>
                <div className="tiny">{c.what}</div>
                <div className="tiny faint">{c.why}</div>
              </div>
            </div>
          ))}
          <div className="tiny faint">
            אלה בדיוק ההחלטות שנשלחות לאטלס בהקשר הלילי. הוא מאשר אותן, מנסח, ומטפל במה שהכללים לא מכסים —
            וכל שינוי שהוא מבצע ניתן לביטול בלחיצה.
          </div>
        </div>
      )}
    </div>
  )
}
