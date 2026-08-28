import React, { useMemo, useState } from 'react'
import {
  actions, alive, dayLog, habitPct, minutesByTrack, minutesOn, trackById, useApp, weekLog,
  weekMinutes, weekSessions,
} from '../store'
import { REVIEW_QUESTIONS } from '../seed'
import {
  HE_DAYS_SHORT, addDays, diffDays, dow, minutesToHM, niceDate, parseISO, plural, shortDate,
  today as todayISO, weekDates, weekStart,
} from '../dates'
import { Bar, Field, Ring, Sheet, useToast, vibrate } from '../ui'
import type { Review as ReviewT } from '../types'

// ---------------------------------------------------------------------------
export function buildSnapshot(s: ReturnType<typeof useApp>, ws: string): ReviewT['snapshot'] {
  const sess = weekSessions(s, ws)
  const minutes = sess.reduce((a, b) => a + b.minutes, 0)
  const dates = weekDates(ws)
  const logged = dates.filter((d) => s.days.some((x) => x.date === d && !x.deleted))
  const pct = logged.length ? logged.reduce((a, d) => a + habitPct(s, d), 0) / logged.length : 0
  const tasksDone = alive(s.tasks).filter(
    (t) => t.doneAt && t.doneAt >= parseISO(ws).getTime() && t.doneAt < parseISO(addDays(ws, 7)).getTime(),
  ).length
  return {
    tokens: minutes / s.settings.tokenMinutes,
    minutes,
    byTrack: minutesByTrack(sess),
    habitPct: pct,
    daysLogged: logged.length,
    tasksDone,
  }
}

// ---------------------------------------------------------------------------
export default function Review() {
  const s = useApp()
  // ביום הסקירה מציגים כברירת מחדל את השבוע שהסתיים
  const [wsOffset, setWsOffset] = useState(() =>
    new Date().getDay() === s.settings.reviewDow ? -1 : 0,
  )
  const ws = addDays(weekStart(todayISO()), wsOffset * 7)
  const wl = weekLog(s, ws)
  const [form, setForm] = useState(false)

  const snap = useMemo(() => buildSnapshot(s, ws), [s, ws])
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  const dates = weekDates(ws)
  const maxDay = Math.max(1, ...dates.map((d) => minutesOn(s, d)))
  // שינה נרשמת בבוקר שאחרי, על היום שעבר
  const rated = dates.map((d) => dayLog(s, d).sleep).filter(Boolean)
  const ratedNights = rated.length
  const goodNights = rated.filter((x) => x === 'good').length

  const history = useMemo(
    () => s.weeks.filter((w) => w.review && !w.deleted).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [s.weeks],
  )

  return (
    <div className="stack narrow" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>סקירה</h1>
        <div className="sub">פעם בשבוע אתה עוצר, מסתכל על מה שהיה, ומחליט מה משנים.</div>
      </div>

      <div className="spread">
        <div className="row">
          <button className="btn sm ghost" aria-label="לשבוע הקודם" onClick={() => setWsOffset((o) => o - 1)}>
            ‹
          </button>
          <button
            className="btn sm ghost"
            aria-label="לשבוע הבא"
            disabled={wsOffset >= 0}
            onClick={() => setWsOffset((o) => o + 1)}
          >
            ›
          </button>
          <b>
            שבוע <span className="ltr">{shortDate(ws)} – {shortDate(addDays(ws, 6))}</span>
          </b>
          {wsOffset === 0 && <span className="chip">בעיצומו</span>}
        </div>
        {wsOffset !== 0 && (
          <button className="btn sm" onClick={() => setWsOffset(0)}>
            השבוע
          </button>
        )}
      </div>

      <div className="card pad">
        <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
          <Ring value={snap.tokens} max={s.settings.weeklyTokenGoal} size={124} stroke={11}>
            <div className="n" style={{ fontSize: 28 }}>{snap.tokens.toFixed(1)}</div>
            <div className="l">אסימונים</div>
          </Ring>
          <div className="grid3 grow" style={{ minWidth: 190 }}>
            <div>
              <div className="tiny faint">זמן נטו</div>
              <b style={{ fontSize: 20 }}>{minutesToHM(snap.minutes)}</b>
            </div>
            <div>
              <div className="tiny faint">הרגלים</div>
              <b style={{ fontSize: 20 }}>{Math.round(snap.habitPct * 100)}%</b>
            </div>
            <div>
              <div className="tiny faint">משימות שנסגרו</div>
              <b style={{ fontSize: 20 }}>{snap.tasksDone}</b>
            </div>
            <div>
              <div className="tiny faint">לילות טובים</div>
              <b style={{ fontSize: 20 }} className="ltr">
                {goodNights}/{ratedNights || 0}
              </b>
            </div>
          </div>
        </div>
      </div>

      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 10 }}>עבודה לפי יום</div>
        {snap.minutes === 0 && (
          <div className="empty" style={{ padding: '6px 0 10px' }}>
            עוד לא נרשמה עבודה השבוע.
          </div>
        )}
        <div className="row" style={{ alignItems: 'flex-end', height: snap.minutes === 0 ? 48 : 108, gap: 6 }}>
          {dates.map((d) => {
            const m = minutesOn(s, d)
            const h = Math.max(3, (m / maxDay) * 92)
            const isToday = d === todayISO()
            return (
              <div key={d} className="grow" style={{ textAlign: 'center' }}>
                <div
                  title={`${minutesToHM(m)}`}
                  style={{
                    height: h,
                    borderRadius: 6,
                    background: m >= s.settings.dailyTokenGoal * s.settings.tokenMinutes ? 'var(--good)' : 'var(--accent)',
                    opacity: m ? 1 : 0.15,
                  }}
                />
                <div className="tiny faint" style={{ marginTop: 4, fontWeight: isToday ? 800 : 400 }}>
                  {HE_DAYS_SHORT[dow(d)]}
                </div>
                <div className="tiny faint">{m ? (m / s.settings.tokenMinutes).toFixed(1) : ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 10 }}>לאן הלך הזמן</div>
        {tracks.map((t) => {
          const m = snap.byTrack[t.id] ?? 0
          if (!m) return null
          return (
            <div key={t.id} style={{ marginBottom: 9 }}>
              <div className="spread tiny" style={{ marginBottom: 3 }}>
                <span>
                  {t.emoji} {t.name}
                </span>
                <span className="faint">{minutesToHM(m)}</span>
              </div>
              <Bar value={m} max={Math.max(1, snap.minutes)} color={t.color} />
            </div>
          )
        })}
        {snap.minutes === 0 && <div className="empty">עוד לא נרשמה עבודה השבוע.</div>}
      </div>

      {wl.review ? (
        <div className="card pad">
          <div className="spread">
            <b>מילאת את הסקירה לשבוע הזה ✅</b>
            <span className="chip on">{wl.review.score}/10</span>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {REVIEW_QUESTIONS.map((q) =>
              wl.review!.answers[q.id] ? (
                <div key={q.id}>
                  <div className="tiny faint">{q.q}</div>
                  <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{wl.review!.answers[q.id]}</div>
                </div>
              ) : null,
            )}
          </div>
          <button className="btn sm block" style={{ marginTop: 12 }} onClick={() => setForm(true)}>
            עריכה
          </button>
        </div>
      ) : (
        <button className="btn primary block" onClick={() => setForm(true)}>
          {wsOffset === 0 ? 'מילוי סקירה לשבוע הנוכחי' : 'מילוי הסקירה השבועית'}
        </button>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ padding: '12px 13px 4px' }}>סקירות קודמות</div>
          <div className="list">
            {history.map((w) => (
              <div className="item" key={w.id}>
                <div className="txt">
                  <div className="ttl">שבוע {shortDate(w.weekStart)}</div>
                  <div className="sub2">
                    {w.review!.snapshot.tokens.toFixed(1)} אסימונים · {Math.round(w.review!.snapshot.habitPct * 100)}% הרגלים
                  </div>
                </div>
                <span className="chip">{w.review!.score}/10</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ReviewForm key={ws} open={form} ws={ws} onClose={() => setForm(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
export function ReviewForm({
  open,
  ws,
  onClose,
  embedded,
}: {
  open: boolean
  ws: string
  onClose: () => void
  embedded?: boolean
}) {
  const s = useApp()
  const toast = useToast()
  const wl = weekLog(s, ws)
  const [answers, setAnswers] = useState<Record<string, string>>(() => wl.review?.answers ?? {})
  const [score, setScore] = useState<number>(wl.review?.score ?? 0)

  const snap = useMemo(() => buildSnapshot(s, ws), [s, ws])

  const body = (
    <div className="stack">
      <div className="card pad" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
        <div className="small">
          <b>המספרים של השבוע:</b> {snap.tokens.toFixed(1)} אסימונים ({minutesToHM(snap.minutes)}) ·{' '}
          {Math.round(snap.habitPct * 100)}% הרגלים ·{' '}
          {plural(snap.tasksDone, 'משימה אחת נסגרה', 'משימות נסגרו')}
        </div>
      </div>

      {REVIEW_QUESTIONS.map((q, i) => (
        <div className="qcard" key={q.id}>
          <div className="q">
            {i + 1}. {q.q}
          </div>
          {q.hint && <div className="h">{q.hint}</div>}
          <textarea
            className="textarea"
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            placeholder="מה שעולה לך לראש. אף אחד לא קורא את זה חוץ ממך."
          />
        </div>
      ))}

      <div className="qcard">
        <div className="q">איך הרגיש השבוע?</div>
        <div className="h">תחושת בטן, לא ציון.</div>
        <div className="scorebar">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} className={score === n ? 'on' : ''} onClick={() => setScore(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn primary block"
        onClick={() => {
          if (!score) return toast('סמן איך הרגיש השבוע')
          const filled = REVIEW_QUESTIONS.filter((q) => (answers[q.id] ?? '').trim().length > 0).length
          if (filled < 1) return toast('ענה לפחות על שאלה אחת — זה בשבילך')
          actions.patchWeek(ws, {
            review: { submittedAt: Date.now(), answers, score, snapshot: snap },
          })
          vibrate([30, 50, 30])
          toast('הסקירה נשמרה. שבוע חדש 🚀')
          onClose()
        }}
      >
        שמירת הסקירה
      </button>
    </div>
  )

  if (embedded) return open ? body : null
  return (
    <Sheet open={open} onClose={onClose} title="סקירה שבועית" wide>
      {body}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// מסך נעילה של יום ראשון
// ---------------------------------------------------------------------------
export function ReviewLock({ ws, onSkip }: { ws: string; onSkip: () => void }) {
  const s = useApp()
  return (
    <div className="lock-overlay">
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 40 }}>🧭</div>
          <h1 style={{ fontSize: 24, marginTop: 6 }}>סקירה שבועית</h1>
          <p className="muted small" style={{ maxWidth: 440, margin: '6px auto 0' }}>
            שבוע נסגר. חמש דקות להסתכל מה עבד ומה לא, ואתה חופשי. זה מה שמונע מהתוכנית להישחק בלי ששמים לב.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn ghost sm" onClick={onSkip}>
              אמלא אחר כך
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                actions.setSettings({ reviewLock: false })
                onSkip()
              }}
            >
              אל תנעל לי את האפליקציה
            </button>
          </div>
        </div>
        <ReviewForm open ws={ws} onClose={onSkip} embedded />
      </div>
    </div>
  )
}
