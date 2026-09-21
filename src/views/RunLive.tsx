// ---------------------------------------------------------------------------
// מסך הריצה החיה.
//
// מה שקובע את העיצוב כאן זה שרצים איתו ביד, בשמש, כשהדופק 170:
//   * שני מספרים גדולים — מרחק וזמן. הקצב מתחתיהם, והשאר קטן.
//   * כפתור אחד גדול (השהיה), וסיום רק בלחיצה ארוכה — כדי ששפשוף מקרי
//     לא יסיים ריצה של שעה.
//   * נעילת מסך: המסך נשאר דלוק והמגע חסום, כי המסך **חייב** להישאר קדמי —
//     דפדפן באנדרואיד לא עוקב אחרי מיקום ברקע.
//   * יציאה מהמסך נרשמת ומוצגת כפער, ולא מוסתרת.
// ---------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useTick, vibrate } from '../ui'
import { today as todayISO } from '../dates'
import { gradePace, paceText, parsePaceRange } from '../skills'
import { fmtClock, fmtKm, fmtPace, livePace, pace as paceOf } from '../run'
import { discardRun, finishRun, pauseRun, resumeRun, setSplitHandler, useLiveRun, type RunSummary } from '../runLive'
import { routeById } from '../runRoutes'
import RunMap from './RunMap'

export default function RunLive({ onDone }: { onDone: (sum: RunSummary | null) => void }) {
  const live = useLiveRun()
  const s = useApp()
  const now = useTick(live.status === 'running' ? 1000 : null)
  const [locked, setLocked] = useState(false)
  const [holdPct, setHoldPct] = useState(0)
  const holdRef = useRef<number | undefined>(undefined)

  // משוב על סגירת קילומטר — רטט קצר, כדי שלא צריך להסתכל על המסך
  useEffect(() => {
    setSplitHandler(() => vibrate([60, 60, 60]))
    return () => setSplitHandler(null)
  }, [])

  const r = live.run
  const route = routeById(live.routeId)
  const day = (s.workoutPlan ?? []).find((d) => !d.deleted && d.dow === new Date(todayISO() + 'T12:00:00').getDay())
  const target = day?.kind === 'run' ? day.target : undefined
  const range = target?.pace ? parsePaceRange(target.pace) : null

  // השעון רץ בין קריאות GPS לפי השעון עצמו, לא לפי מספר הקריאות
  const elapsed = live.status === 'off' ? 0 : Math.max(r.elapsedSec, Math.round((now - live.startedAt) / 1000))
  const avg = paceOf(r.meters, r.movingSec)
  const nowPace = livePace(r.pts)
  const grade = nowPace && range ? gradePace(nowPace, range) : null
  const here = r.pts.length ? ([r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1]] as [number, number]) : null

  const startHold = () => {
    const t0 = Date.now()
    holdRef.current = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - t0) / 1200)
      setHoldPct(pct)
      if (pct >= 1) {
        window.clearInterval(holdRef.current)
        holdRef.current = undefined
        setHoldPct(0)
        vibrate([40, 40, 120])
        onDone(finishRun())
      }
    }, 50)
  }
  const endHold = () => {
    if (holdRef.current) window.clearInterval(holdRef.current)
    holdRef.current = undefined
    setHoldPct(0)
  }

  if (live.status === 'acquiring') {
    return (
      <div className="runlive" role="dialog" aria-modal="true" aria-label="מחכה ל-GPS">
        <div className="run-acquire">
          <div className="run-radar" aria-hidden />
          <b>מחפש קליטת GPS…</b>
          <div className="small muted">
            {live.acc ? `דיוק כרגע: ±${Math.round(live.acc)} מטר` : 'רגע אחד — זה הזמן להתחיל לזוז לשמיים פתוחים'}
          </div>
          {live.error && <div className="run-err">{live.error}</div>}
          {route && <div className="tiny faint" style={{ marginTop: 6 }}>המסלול: {route.name}</div>}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => { discardRun(); onDone(null) }}>
            ביטול
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="runlive" role="dialog" aria-modal="true" aria-label="ריצה">
      <div className="run-top">
        <span className={`run-gps${(live.acc ?? 99) <= 12 ? ' good' : (live.acc ?? 99) <= 25 ? ' ok' : ' bad'}`}>
          GPS ±{Math.round(live.acc ?? 0)} מ׳
        </span>
        {route && <span className="tiny faint">{route.name}</span>}
        <button className="btn xs" onClick={() => setLocked(true)} aria-label="נעילת מסך">
          נעילה
        </button>
      </div>

      <div className="run-nums">
        <div className="run-num">
          <div className="run-val ltr">{fmtKm(r.meters)}</div>
          <div className="run-cap">ק״מ</div>
        </div>
        <div className="run-num">
          <div className="run-val ltr">{fmtClock(elapsed)}</div>
          <div className="run-cap">{r.still && live.status === 'running' ? 'עומד' : 'זמן'}</div>
        </div>
      </div>

      <div className="run-pace">
        <div>
          <b className={`ltr${grade === 'fast' ? ' fast' : grade === 'slow' ? ' slow' : grade === 'in' ? ' in' : ''}`}>
            {fmtPace(nowPace, true)}
          </b>
          <span>קצב עכשיו</span>
        </div>
        <div>
          <b className="ltr">{fmtPace(avg)}</b>
          <span>ממוצע</span>
        </div>
        {target?.km ? (
          <div>
            <b className="ltr">{Math.max(0, target.km - r.meters / 1000).toFixed(1)}</b>
            <span>נשאר ליעד</span>
          </div>
        ) : (
          <div>
            <b className="ltr">{fmtClock(r.movingSec)}</b>
            <span>זמן נטו</span>
          </div>
        )}
      </div>

      {range && target?.pace && (
        <div className="tiny faint center" style={{ marginBottom: 6 }}>
          היעד: {paceText(range[0])}–{paceText(range[1])} לק״מ
        </div>
      )}

      <RunMap route={route?.poly} track={r.pts} here={here} follow height={190} className="run-map" />

      {!!r.splits.length && (
        <div className="run-splits" aria-label="קילומטרים">
          {r.splits.slice(-6).map((sp) => (
            <div key={sp.km} className="run-split">
              <span className="ltr">{sp.km}</span>
              <b className="ltr">{fmtPace(sp.sec / 60)}</b>
            </div>
          ))}
        </div>
      )}

      {live.gaps > 0 && (
        <div className="run-warn">
          המסך יצא מקדמת הבמה {live.gaps === 1 ? 'פעם אחת' : `${live.gaps} פעמים`} ({Math.round(live.hiddenSec)} שנ׳) — שם
          המסלול חסר. השאר את המסך פתוח.
        </div>
      )}
      {live.error && <div className="run-err">{live.error}</div>}

      <div className="run-actions">
        {live.status === 'paused' ? (
          <button className="btn primary grow" onClick={resumeRun}>
            המשך
          </button>
        ) : (
          <button className="btn grow" onClick={pauseRun}>
            השהיה
          </button>
        )}
        <button
          className="btn danger grow run-finish"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
        >
          <span style={{ position: 'relative', zIndex: 1 }}>סיום (לחיצה ארוכה)</span>
          <i style={{ width: `${holdPct * 100}%` }} aria-hidden />
        </button>
      </div>

      {locked && (
        <div className="run-lock" onClick={(e) => e.stopPropagation()}>
          <div className="run-lock-nums">
            <div className="ltr">{fmtKm(r.meters)} ק״מ</div>
            <div className="ltr">{fmtClock(elapsed)}</div>
            <div className="ltr small">{fmtPace(avg)} לק״מ</div>
          </div>
          <button className="btn" onPointerDown={startHoldUnlock(setLocked)}>
            לחיצה ארוכה לשחרור
          </button>
        </div>
      )}
    </div>
  )
}

/** שחרור הנעילה גם הוא בלחיצה ארוכה — כדי שלא ישתחרר בכיס */
function startHoldUnlock(setLocked: (v: boolean) => void) {
  return (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    const t = window.setTimeout(() => {
      vibrate(30)
      setLocked(false)
    }, 900)
    const cancel = () => {
      window.clearTimeout(t)
      el.removeEventListener('pointerup', cancel)
      el.removeEventListener('pointerleave', cancel)
    }
    el.addEventListener('pointerup', cancel)
    el.addEventListener('pointerleave', cancel)
  }
}
