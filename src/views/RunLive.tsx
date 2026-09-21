// ---------------------------------------------------------------------------
// מסך הריצה החיה.
//
// מה שקובע את העיצוב כאן זה שרצים איתו ביד, בשמש, כשהדופק 170:
//   * שני מספרים גדולים — מרחק וזמן. הקצב מתחתיהם, והשאר קטן.
//   * כפתור אחד גדול (השהיה), וסיום רק בלחיצה ארוכה — כדי ששפשוף מקרי
//     לא יסיים ריצה של שעה. הכפתורים נעוצים לתחתית ולא נגללים משם.
//   * נעילת מסך: המסך נשאר דלוק והמגע חסום, כי המסך **חייב** להישאר קדמי —
//     דפדפן באנדרואיד לא עוקב אחרי מיקום ברקע.
//   * המסך לא משקר: אין קליטה — הוא אומר שאין; מושהה — רואים שמושהה;
//     יציאה מהמסך נרשמת כפער; ונעילת מסך שלא נתמכת מוצגת כאזהרה.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store'
import { ding, useTick, vibrate } from '../ui'
import { today as todayISO } from '../dates'
import { gradePace, paceText, parsePaceRange } from '../skills'
import { fmtClock, fmtKm, fmtPace, livePace, pace as paceOf } from '../run'
import {
  STALE_FIX_MS,
  discardRun,
  finishRun,
  pauseRun,
  resumeRun,
  setSplitHandler,
  startAnyway,
  useLiveRun,
  type RunSummary,
} from '../runLive'
import { routeById } from '../runRoutes'
import RunMap from './RunMap'

/** כמה זמן צריך להחזיק כדי לסיים, וכמה כדי לשחרר נעילה */
const HOLD_MS = 1200
const UNLOCK_MS = 900

const GRADE_WORD: Record<string, string> = { fast: 'מהר מהיעד', slow: 'אט מהיעד', in: 'בטווח היעד' }

export default function RunLive({ onDone }: { onDone: (sum: RunSummary | null) => void }) {
  const live = useLiveRun()
  const s = useApp()
  // השעון ממשיך לתקתק גם בהשהיה: הוא מה שמגלה שאין קליטה כבר חצי דקה
  const now = useTick(live.status === 'off' ? null : 1000)
  const [locked, setLocked] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  const pauseBtn = useRef<HTMLButtonElement>(null)

  // משוב על סגירת קילומטר — רטט, ובמכשיר שלא רוטט גם צליל
  useEffect(() => {
    setSplitHandler(() => {
      if (!vibrate([60, 60, 60])) ding()
    })
    return () => setSplitHandler(null)
  }, [])

  // המיקוד עובר למסך הריצה כשהוא נפתח, וחוזר למה שהיה כשהוא נסגר
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    pauseBtn.current?.focus()
    return () => before?.focus?.()
  }, [])

  const r = live.run
  const route = routeById(live.routeId)
  const day = (s.workoutPlan ?? []).find((d) => !d.deleted && d.dow === new Date(todayISO() + 'T12:00:00').getDay())
  const target = day?.kind === 'run' || day?.kind === 'walk' ? day.target : undefined
  const range = target?.pace ? parsePaceRange(target.pace) : null

  // השעון רץ בין קריאות GPS לפי השעון עצמו, לא לפי מספר הקריאות
  const elapsed = live.status === 'off' ? 0 : Math.max(r.elapsedSec, Math.round((now - live.startedAt) / 1000))
  // קליטה שנעלמה: מסך שממשיך להראות "±6 מ׳" ירוק וקצב מלפני דקה הוא שקר,
  // וזה בדיוק הרגע שבו המרחק מפסיק להיספר.
  const sinceFix = live.lastFixAt ? now - live.lastFixAt : 0
  const stale = live.status !== 'off' && !!live.lastFixAt && sinceFix > STALE_FIX_MS
  const avg = paceOf(r.meters, r.movingSec)
  const nowPace = stale ? 0 : livePace(r.pts)
  const grade = nowPace && range ? gradePace(nowPace, range) : null
  const paused = live.status === 'paused'

  const here = useMemo(() => {
    const p = r.pts[r.pts.length - 1]
    return p ? ([p[0], p[1]] as [number, number]) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.pts.length && r.pts[r.pts.length - 1][0], r.pts.length && r.pts[r.pts.length - 1][1]])

  // -- לחיצה ארוכה: ההתקדמות היא מעבר CSS ולא מצב שמתעדכן עשרים פעם בשנייה,
  //    כי בדיוק ברגע הזה המסך צריך להיות חלק.
  const [holding, setHolding] = useState<null | 'finish' | 'unlock'>(null)
  const holdT = useRef<number | undefined>(undefined)
  const startHold = (what: 'finish' | 'unlock') => (e: React.PointerEvent) => {
    // לכידת המצביע: תזוזה של מילימטר באצבע בזמן ריצה לא מבטלת את הלחיצה
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setHolding(what)
    holdT.current = window.setTimeout(() => {
      holdT.current = undefined
      setHolding(null)
      if (what === 'unlock') {
        vibrate(30)
        setLocked(false)
      } else {
        vibrate([40, 40, 120])
        onDone(finishRun())
      }
    }, what === 'unlock' ? UNLOCK_MS : HOLD_MS)
  }
  const endHold = () => {
    if (holdT.current) window.clearTimeout(holdT.current)
    holdT.current = undefined
    setHolding(null)
  }
  useEffect(() => () => {
    if (holdT.current) window.clearTimeout(holdT.current)
  }, [])

  // מקלדת: אין מצביע, ולכן הסיום הוא אישור בשתי לחיצות ולא לחיצה ארוכה
  const [askFinish, setAskFinish] = useState(false)

  if (live.status === 'acquiring') {
    const denied = !!live.error && live.error.includes('הרשאת מיקום')
    const noGps = !!live.error && live.error.includes('לא יודע לאתר')
    const waiting = !denied && !noGps
    return (
      <div className="runlive" role="dialog" aria-modal="true" aria-label="מחכה ל-GPS">
        <div className="run-acquire">
          {waiting && <div className="run-radar" aria-hidden />}
          <b>{waiting ? 'מחפש קליטת GPS…' : 'אי אפשר להתחיל'}</b>
          {waiting && (
            <div className="small muted">
              {live.acc ? `דיוק כרגע: ±${Math.round(live.acc)} מטר` : 'רגע אחד — זה הזמן לצאת לשמיים פתוחים'}
            </div>
          )}
          {live.error && <div className="run-err">{live.error}</div>}
          {route && <div className="tiny faint" style={{ marginTop: 6 }}>המסלול: {route.name}</div>}
          {waiting && live.acc !== undefined && (
            <button className="btn sm" style={{ marginTop: 12 }} onClick={startAnyway}>
              התחל בכל זאת (±{Math.round(live.acc)} מ׳)
            </button>
          )}
          <button className="btn" style={{ marginTop: 8 }} onClick={() => { discardRun(); onDone(null) }}>
            {waiting ? 'ביטול' : 'סגירה'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="runlive" role="dialog" aria-modal="true" aria-label="ריצה">
      <div className="run-top">
        <span className={`run-gps${stale ? ' bad' : (live.acc ?? 99) <= 12 ? ' good' : (live.acc ?? 99) <= 25 ? ' ok' : ' bad'}`}>
          {stale ? `אין קליטה ${Math.round(sinceFix / 1000)} שנ׳` : `GPS ±${Math.round(live.acc ?? 0)} מ׳`}
        </span>
        {route && <span className="tiny faint">{route.name}</span>}
        <button className="btn xs" onClick={() => setLocked(true)} aria-label="נעילת מסך">
          נעילה
        </button>
      </div>

      {paused && (
        <div className="run-paused" role="status">
          מושהה — המרחק לא נספר
        </div>
      )}
      {!paused && stale && (
        <div className="run-warn">אין קליטת GPS כרגע — המרחק לא מתעדכן. שמיים פתוחים יחזירו אותה.</div>
      )}
      {live.wake === 'no' && (
        <div className="run-warn">
          הדפדפן לא יכול למנוע כיבוי מסך. הארך את זמן הכיבוי בהגדרות הטלפון — מסך שנכבה עוצר את המדידה.
        </div>
      )}

      <div className={`run-nums${paused ? ' dim' : ''}`}>
        <div className="run-num">
          <div className="run-val ltr">{fmtKm(r.meters)}</div>
          <div className="run-cap">ק״מ</div>
        </div>
        <div className="run-num">
          <div className="run-val ltr">{fmtClock(elapsed)}</div>
          <div className="run-cap">{paused ? 'מושהה' : r.still ? 'עומד' : 'זמן'}</div>
        </div>
      </div>

      <div className="run-pace">
        <div>
          <b className={`ltr${grade === 'fast' ? ' fast' : grade === 'slow' ? ' slow' : grade === 'in' ? ' in' : ''}`}>
            {fmtPace(nowPace, true)}
          </b>
          <span>{grade ? GRADE_WORD[grade] : 'קצב עכשיו'}</span>
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
          היעד: <span className="ltr">{paceText(range[0])}–{paceText(range[1])}</span> לק״מ
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

      {paused &&
        (askDiscard ? (
          <div className="run-discard">
            <span>למחוק את הריצה בלי לשמור?</span>
            <button className="btn xs" onClick={() => setAskDiscard(false)}>
              לא
            </button>
            <button className="btn xs danger" onClick={() => { discardRun(); onDone(null) }}>
              כן, מחק
            </button>
          </div>
        ) : (
          <button className="btn xs run-discard-open" onClick={() => setAskDiscard(true)}>
            מחיקת הריצה
          </button>
        ))}

      <div className="run-actions">
        {paused ? (
          <button
            ref={pauseBtn}
            className="btn primary grow"
            onClick={() => {
              vibrate(25)
              resumeRun()
            }}
          >
            המשך
          </button>
        ) : (
          <button
            ref={pauseBtn}
            className="btn grow"
            onClick={() => {
              vibrate([25, 40, 25])
              pauseRun()
            }}
          >
            השהיה
          </button>
        )}
        {askFinish ? (
          <>
            <button className="btn grow" onClick={() => setAskFinish(false)}>
              ביטול
            </button>
            <button className="btn danger grow" onClick={() => onDone(finishRun())}>
              לסיים?
            </button>
          </>
        ) : (
          <button
            className="btn danger grow run-finish nosel"
            onPointerDown={startHold('finish')}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setAskFinish(true)
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span style={{ position: 'relative', zIndex: 1 }}>סיום (לחיצה ארוכה)</span>
            <i className={holding === 'finish' ? 'on' : ''} style={{ transitionDuration: `${HOLD_MS}ms` }} aria-hidden />
          </button>
        )}
      </div>

      {locked && (
        <div className="run-lock">
          <div className="run-lock-nums">
            <div>
              <span className="ltr">{fmtKm(r.meters)}</span> ק״מ
            </div>
            <div className="ltr">{fmtClock(elapsed)}</div>
            <div className="small">
              <span className="ltr">{fmtPace(avg)}</span> לק״מ
            </div>
          </div>
          <button
            className="btn nosel run-finish"
            onPointerDown={startHold('unlock')}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setLocked(false)
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span style={{ position: 'relative', zIndex: 1 }}>לחיצה ארוכה לשחרור</span>
            <i className={holding === 'unlock' ? 'on' : ''} style={{ transitionDuration: `${UNLOCK_MS}ms` }} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
