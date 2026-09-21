// ---------------------------------------------------------------------------
// כרטיס הריצה בעמוד האימונים — נקודת הכניסה היחידה לכל מה שקשור לריצה:
// להתחיל עכשיו, לבחור מסלול, לראות את הריצה האחרונה, ולהמשיך ריצה שנקטעה.
//
// הוא גם המקום שמרכיב את החלקים: המסך החי (RunLive), רשימת המסלולים
// (RunRoutes) וסיכום הסיום — כדי שעמוד האימונים עצמו יישאר קריא.
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Sheet, useToast } from '../ui'
import { niceDate } from '../dates'
import { paceText } from '../skills'
import { decodePolyline, fmtClock, fmtPace, pace as paceOf } from '../run'
import { dropSaved, resumeSaved, savedRun, startRun, useLiveRun, type Live, type RunSummary } from '../runLive'
import { routeById } from '../runRoutes'
import type { RunTarget, WorkoutLog } from '../types'
import RunMap from './RunMap'
import RunRoutes from './RunRoutes'

export default function RunCard({ date, target }: { date: string; target?: RunTarget }) {
  const s = useApp()
  const live = useLiveRun()
  const toast = useToast()
  const [routes, setRoutes] = useState(false)
  const [resume, setResume] = useState<Live | null>(null)

  // ריצה שלא נסגרה (קריסה, סגירה בטעות) — מציעים להמשיך אותה, פעם אחת
  useEffect(() => {
    if (live.status === 'off') setResume(savedRun())
  }, [live.status])

  const last = (s.workouts ?? [])
    .filter((w) => !w.deleted && w.run)
    .sort((a, b) => b.date.localeCompare(a.date))[0]

  // בזמן ריצה המסך החי מוצג מעל כל האפליקציה (RunOverlay ב-App.tsx), ולכן
  // כאן רק מוסתרות נקודות הכניסה.
  if (live.status !== 'off') return null

  return (
    <>
      <div className="card pad">
        {resume ? (
          <div className="stack" style={{ gap: 8 }}>
            <b>יש ריצה שלא נסגרה</b>
            <div className="tiny faint">
              {(resume.run.meters / 1000).toFixed(2)} ק״מ · {fmtClock(resume.run.movingSec)} · התחילה ב-
              {new Date(resume.startedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm primary grow" onClick={() => { resumeSaved(resume); setResume(null) }}>
                המשך אותה
              </button>
              <button className="btn sm grow" onClick={() => { dropSaved(); setResume(null); toast('הריצה נמחקה') }}>
                מחיקה
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="spread">
              <div style={{ minWidth: 0 }}>
                <b>ריצה עם מעקב</b>
                <div className="tiny faint">
                  {target?.km
                    ? `היעד היום: ${target.km} ק״מ${target.pace ? ` בקצב ${target.pace}` : ''}`
                    : 'מרחק, קצב ומסלול — נשמר כאימון של היום'}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn primary grow" onClick={() => startRun()}>
                התחל ריצה
              </button>
              <button className="btn grow" onClick={() => setRoutes(true)}>
                בחירת מסלול
              </button>
            </div>
            <div className="tiny faint" style={{ marginTop: 8 }}>
              המסך נשאר דלוק לאורך הריצה — דפדפן לא עוקב אחרי מיקום ברקע. אל תסגור את האפליקציה תוך כדי.
            </div>
          </>
        )}
      </div>

      {last?.run && <LastRun log={last} />}

      <Sheet open={routes} onClose={() => setRoutes(false)} title="מסלולי ריצה" wide>
        <RunRoutes
          targetKm={target?.km}
          onStart={(id) => {
            setRoutes(false)
            startRun(id)
          }}
        />
      </Sheet>

    </>
  )
}

/** הריצה האחרונה שנמדדה — מפה, מרחק וקצב */
function LastRun({ log }: { log: WorkoutLog }) {
  const run = log.run!
  const poly = decodePolyline(run.poly)
  const route = routeById(run.routeId)
  return (
    <div className="card route-card">
      {poly.length > 1 && <RunMap track={poly} height={150} />}
      <div className="pad">
        <div className="spread">
          <b>{route?.name ?? 'הריצה האחרונה'}</b>
          <span className="tiny faint">{niceDate(log.date)}</span>
        </div>
        <div className="route-facts" style={{ marginTop: 6 }}>
          <span>
            <b className="ltr">{run.km}</b> ק״מ
          </span>
          <span>
            <b className="ltr">{fmtClock(run.movingSec)}</b>
          </span>
          <span>
            <b className="ltr">{fmtPace(paceOf(run.km * 1000, run.movingSec))}</b> לק״מ
          </span>
        </div>
      </div>
    </div>
  )
}

/** סיכום מיד אחרי הריצה — מוצג מ-App.tsx כשהריצה נסגרת */
export function RunSummaryView({ sum }: { sum: RunSummary }) {
  const poly = decodePolyline(sum.poly)
  const avg = paceOf(sum.km * 1000, sum.movingSec)
  const best = sum.splits.length ? Math.min(...sum.splits.map((x) => x.sec)) : 0
  return (
    <div className="stack">
      {poly.length > 1 && <RunMap track={poly} height={200} />}
      <div className="run-pace">
        <div>
          <b className="ltr">{sum.km.toFixed(2)}</b>
          <span>ק״מ</span>
        </div>
        <div>
          <b className="ltr">{fmtClock(sum.movingSec)}</b>
          <span>זמן נטו</span>
        </div>
        <div>
          <b className="ltr">{fmtPace(avg)}</b>
          <span>קצב ממוצע</span>
        </div>
      </div>

      {!!sum.splits.length && (
        <div className="card pad">
          <b className="small">קילומטרים</b>
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {sum.splits.map((sp) => {
              const p = sp.sec / 60
              const rel = best ? Math.max(0.25, best / sp.sec) : 1
              return (
                <div key={sp.km} className="row" style={{ gap: 8 }}>
                  <span className="tiny faint ltr" style={{ width: 18 }}>
                    {sp.km}
                  </span>
                  <span className="grow" style={{ background: 'var(--bg-sunk)', borderRadius: 6, height: 16 }}>
                    <i
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${rel * 100}%`,
                        borderRadius: 6,
                        background: sp.sec === best ? 'var(--good)' : 'var(--brand-1)',
                      }}
                    />
                  </span>
                  <b className="tiny ltr" style={{ width: 44, textAlign: 'end' }}>
                    {paceText(p)}
                  </b>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sum.gaps > 0 && (
        <div className="run-warn">
          המסך יצא מקדמת הבמה {sum.gaps} פעמים בזמן הריצה, ולכן חלק מהמסלול חסר והמרחק עשוי להיות נמוך מהאמת.
        </div>
      )}
      <div className="tiny faint">נשמר כאימון של היום. אפשר לערוך אותו במסך האימון.</div>
    </div>
  )
}
