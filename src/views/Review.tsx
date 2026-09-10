import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  actions, alive, dayCapacity, dayLog, defaultTrackId, habitPct, hasSpreadRoom, minutesByTrack,
  minutesOn, plannedOn, spreadTasks, trackById, uid, useApp, weekLog, weekMinutes, weekSessions,
} from '../store'
import { REVIEW_QUESTIONS } from '../seed'
import {
  HE_DAYS_SHORT, addDays, diffDays, dow, minutesToHM, niceDate, parseISO, plural, shortDate,
  today as todayISO, weekDates, weekStart,
} from '../dates'
import { Bar, Check, Ring, Sheet, onColor, useToast, vibrate } from '../ui'
import { buildInsights, buildWeekStats, digestForClaude, type Insight, type WeekStats } from '../insights'
import { fetchInsight, type Insight as AiInsight } from '../ai'
import type { ID, Review as ReviewT, Task, WeekGoal } from '../types'

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

/** השבוע שהסקירה סוגרת: זה שהסתיים, לא זה שהתחיל */
export function reviewWeekOf(dateISO: string): string {
  return addDays(weekStart(dateISO), -7)
}

/** האם סגירת השבוע שהסתיים עדיין פתוחה */
export function reviewPending(s: ReturnType<typeof useApp>): string | null {
  const ws = reviewWeekOf(todayISO())
  const wl = weekLog(s, ws)
  if (wl.review) return null
  // בלי נתונים בכלל אין מה לסכם
  const has = weekMinutes(s, ws) > 0 || s.days.some((d) => !d.deleted && d.date >= ws && d.date < addDays(ws, 7))
  return has ? ws : null
}

// ---------------------------------------------------------------------------
export default function Review() {
  const s = useApp()
  const pending = reviewPending(s)
  const [wsOffset, setWsOffset] = useState(() => (pending ? -1 : 0))
  const ws = addDays(weekStart(todayISO()), wsOffset * 7)
  const wl = weekLog(s, ws)
  const [flow, setFlow] = useState<string | null>(null)

  const st = useMemo(() => buildWeekStats(s, ws), [s, ws])
  const insights = useMemo(() => buildInsights(s, st), [s, st])
  const history = useMemo(
    () => s.weeks.filter((w) => w.review && !w.deleted).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [s.weeks],
  )

  return (
    <div className="page narrow" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>סקירה</h1>
        <div className="sub">פעם בשבוע אתה עוצר, מסתכל על מה שהיה, ומחליט מה משנים.</div>
      </div>

      {pending && (
        <button className="card pad rail" style={{ ['--rail' as any]: 'var(--accent)', textAlign: 'start' }} onClick={() => setFlow(pending)}>
          <div className="spread">
            <div className="grow">
              <b>סגירת השבוע שהסתיים</b>
              <div className="tiny faint">
                <span className="ltr">{shortDate(pending)} – {shortDate(addDays(pending, 6))}</span> · המספרים, הניתוח, השאלות, ואז מגדירים את השבוע הבא.
              </div>
            </div>
            <span className="chip on">התחלה ←</span>
          </div>
        </button>
      )}

      <section className="sec">
      <div className="spread">
        <div className="row">
          <button className="btn sm ghost" aria-label="לשבוע הקודם" onClick={() => setWsOffset((o) => o - 1)}>
            ›
          </button>
          <button
            className="btn sm ghost"
            aria-label="לשבוע הבא"
            disabled={wsOffset >= 0}
            onClick={() => setWsOffset((o) => o + 1)}
          >
            ‹
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

      <WeekNumbers st={st} />
      <WeekBars st={st} />
      <TrackSplit st={st} />
      </section>

      <section className="sec">
        <div className="sec-h"><h2>מה עולה מהנתונים</h2></div>
        <ClaudeInsight ws={ws} />
        <InsightsCard st={st} insights={insights} ws={ws} />
      </section>

      <section className="sec">
        <div className="sec-h"><h2>לאורך זמן</h2></div>
        <HistoryChart />
      </section>

      <section className="sec">
      <div className="sec-h"><h2>סגירת השבוע</h2></div>
      {wl.goals && wl.goals.length > 0 && <GoalsCard ws={ws} title="מטרות־העל של השבוע" />}

      {wl.review ? (
        <div className="card pad">
          <div className="spread">
            <b>השבוע הזה נסגר ✅</b>
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
          <button className="btn sm block" style={{ marginTop: 12 }} onClick={() => setFlow(ws)}>
            פתיחה מחדש
          </button>
        </div>
      ) : (
        <button className="btn primary block" onClick={() => setFlow(ws)}>
          {wsOffset === 0 ? 'סגירת השבוע הנוכחי (מוקדם)' : 'סגירת השבוע'}
        </button>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ padding: '12px 13px 4px' }}>שבועות קודמים</div>
          <div className="list">
            {history.slice(0, 12).map((w) => (
              <button
                className="item"
                key={w.id}
                style={{ textAlign: 'start' }}
                onClick={() => setWsOffset(Math.round(diffDays(weekStart(todayISO()), w.weekStart) / 7))}
              >
                <div className="txt">
                  <div className="ttl">
                    שבוע <span className="ltr">{shortDate(w.weekStart)}</span>
                  </div>
                  <div className="sub2">
                    {w.review!.snapshot.tokens.toFixed(1)} אסימונים · {Math.round(w.review!.snapshot.habitPct * 100)}% הרגלים
                  </div>
                </div>
                <span className="chip">{w.review!.score}/10</span>
              </button>
            ))}
          </div>
        </div>
      )}

      </section>

      {flow && <WeeklyFlow ws={flow} onClose={() => setFlow(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// כרטיסי המספרים
// ---------------------------------------------------------------------------
function WeekNumbers({ st }: { st: WeekStats }) {
  const s = useApp()
  return (
    <div className="card pad">
      <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
        <Ring
          value={st.tokens}
          max={st.goalTokens}
          size={124}
          stroke={11}
          color={st.tokens >= st.goalTokens ? 'var(--good)' : undefined}
        >
          <div className="n" style={{ fontSize: 28 }}>{st.tokens.toFixed(1)}</div>
          <div className="l">מתוך {st.goalTokens}</div>
        </Ring>
        <div className="grid3 grow" style={{ minWidth: 190 }}>
          <div>
            <div className="tiny faint">זמן נטו</div>
            <b style={{ fontSize: 20 }}>{minutesToHM(st.minutes)}</b>
          </div>
          <div>
            <div className="tiny faint">ימים ביעד</div>
            <b style={{ fontSize: 20 }} className="ltr">
              {st.daysAtGoal}/7
            </b>
          </div>
          <div>
            <div className="tiny faint">משימות שנסגרו</div>
            <b style={{ fontSize: 20 }}>{st.tasksDone}</b>
          </div>
          <div>
            <div className="tiny faint">הרגלים</div>
            <b style={{ fontSize: 20 }}>{Math.round(st.habitPct * 100)}%</b>
          </div>
          <div>
            <div className="tiny faint">לילות טובים</div>
            <b style={{ fontSize: 20 }} className="ltr">
              {st.goodNights}/{st.ratedNights || 0}
            </b>
          </div>
          <div>
            <div className="tiny faint">באיחור</div>
            <b style={{ fontSize: 20, color: st.overdue.length ? 'var(--warn)' : undefined }}>
              {st.overdue.length}
            </b>
          </div>
        </div>
      </div>
      {st.baselineWeeks >= 2 && st.baselineMinutes > 0 && (
        <div className="tiny faint" style={{ marginTop: 12, textAlign: 'center' }}>
          הממוצע של {st.baselineWeeks} השבועות הקודמים: {minutesToHM(Math.round(st.baselineMinutes))} ·{' '}
          {st.minutes >= st.baselineMinutes ? '▲' : '▼'}{' '}
          {Math.abs(Math.round(((st.minutes - st.baselineMinutes) / st.baselineMinutes) * 100))}%
        </div>
      )}
    </div>
  )
}

function WeekBars({ st }: { st: WeekStats }) {
  const s = useApp()
  const t = todayISO()
  const dailyGoal = s.settings.dailyTokenGoal * s.settings.tokenMinutes
  const max = Math.max(dailyGoal, ...st.perDay.map((d) => d.minutes))
  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div className="section-title">עבודה לפי יום</div>
        <span className="tiny faint">הקו = היעד היומי</span>
      </div>
      <div className="daybars">
        {st.perDay.map((d) => {
          const h = max > 0 ? (d.minutes / max) * 100 : 0
          const goalH = max > 0 ? (dailyGoal / max) * 100 : 0
          const isToday = d.date === t
          return (
            <div key={d.date} className="daybar" title={`${niceDate(d.date)} · ${minutesToHM(d.minutes)}`}>
              <div className="col">
                <div className="goal" style={{ bottom: `${goalH}%` }} />
                <div
                  className="fill"
                  style={{
                    height: `${Math.max(d.minutes > 0 ? 3 : 1.5, h)}%`,
                    background: d.minutes >= dailyGoal ? 'var(--good)' : 'var(--accent)',
                    opacity: d.minutes ? 1 : 0.18,
                  }}
                />
              </div>
              <div className="tiny faint" style={{ marginTop: 5, fontWeight: isToday ? 800 : 500 }}>
                {HE_DAYS_SHORT[dow(d.date)]}
              </div>
              <div className="tiny faint ltr">{d.minutes ? (d.minutes / 60).toFixed(1) : '·'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrackSplit({ st }: { st: WeekStats }) {
  const s = useApp()
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  if (!st.minutes) return null
  return (
    <div className="card pad">
      <div className="section-title" style={{ marginBottom: 10 }}>לאן הלך הזמן</div>
      {tracks.map((t) => {
        const m = st.byTrack[t.id] ?? 0
        const b = st.baselineByTrack[t.id] ?? 0
        if (!m && !b) return null
        const delta = b > 0 ? Math.round(((m - b) / b) * 100) : null
        return (
          <div key={t.id} style={{ marginBottom: 9 }}>
            <div className="spread tiny" style={{ marginBottom: 3 }}>
              <span>
                {t.emoji} {t.name}
              </span>
              <span className="faint">
                {minutesToHM(m)}
                {delta !== null && Math.abs(delta) >= 10 && (
                  <span style={{ color: delta > 0 ? 'var(--good)' : 'var(--warn)' }}>
                    {' '}
                    {delta > 0 ? '▲' : '▼'}
                    {Math.abs(delta)}%
                  </span>
                )}
              </span>
            </div>
            <Bar value={m} max={Math.max(1, st.minutes)} color={t.color} />
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
/**
 * הניתוח שהסוכן בענן כתב בבוקר הסקירה. מגיע מוצפן מהמאגר ומפוענח כאן.
 * אם עוד לא נכתב ניתוח — פשוט לא מציגים כלום.
 */
function useAiInsight(): AiInsight | null {
  const [ins, setIns] = useState<AiInsight | null>(null)
  useEffect(() => {
    let live = true
    fetchInsight().then((x) => live && setIns(x))
    return () => {
      live = false
    }
  }, [])
  return ins && ins.sections?.length ? ins : null
}

function ClaudeInsight({ ws, ins }: { ws: string; ins?: AiInsight | null }) {
  const loaded = useAiInsight()
  const use = ins !== undefined ? ins : loaded
  if (!use) return null
  const stale = use.week !== ws

  return (
    <div className="card pad rail" style={{ ['--rail' as any]: 'var(--accent)' }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <b>הניתוח של Claude</b>
        <span className="tiny faint">
          {stale ? (
            <>
              על שבוע <span className="ltr">{shortDate(use.week)}</span>
            </>
          ) : (
            'על השבוע הזה'
          )}
        </span>
      </div>
      {use.headline && (
        <div className="small" style={{ fontWeight: 700, marginBottom: 10 }}>{use.headline}</div>
      )}
      <div className="stack" style={{ gap: 10 }}>
        {use.sections!.map((sec, i) => (
          <div key={i}>
            <div className="tiny" style={{ fontWeight: 800, color: 'var(--accent)' }}>{sec.title}</div>
            <div className="small" style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{sec.text}</div>
          </div>
        ))}
      </div>
      {use.questions && use.questions.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
          <div className="tiny faint" style={{ fontWeight: 700, marginBottom: 4 }}>לחשוב על זה</div>
          {use.questions.map((q, i) => (
            <div key={i} className="small" style={{ marginBottom: 3 }}>
              · {q}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function InsightsCard({ st, insights, ws }: { st: WeekStats; insights: Insight[]; ws: string }) {
  const s = useApp()
  const toast = useToast()
  const [all, setAll] = useState(false)
  if (!insights.length) return null
  const shown = all ? insights : insights.slice(0, 4)

  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div className="section-title">הניתוח של השבוע</div>
        <span className="tiny faint">רץ במכשיר · לא נשלח לשום מקום</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {shown.map((i) => (
          <div key={i.id} className={`ins ${i.tone}`}>
            <b>{i.title}</b>
            <div className="small">{i.text}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        {insights.length > 4 && (
          <button className="btn sm ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'צמצם' : `עוד ${insights.length - 4}`}
          </button>
        )}
        <button
          className="btn sm"
          onClick={async () => {
            const txt = digestForClaude(s, st, weekLog(s, ws))
            try {
              await navigator.clipboard.writeText(txt)
              toast('הועתק. הדבק בשיחה עם Claude וקבל ניתוח מעמיק')
            } catch {
              toast('ההעתקה נחסמה בדפדפן')
            }
          }}
        >
          📋 ניתוח מעמיק עם Claude
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// גרף לאורך כל הזמן
// ---------------------------------------------------------------------------
function HistoryChart() {
  const s = useApp()
  const [mode, setMode] = useState<'day' | 'week'>('week')
  const [open, setOpen] = useState(true)

  const series = useMemo(() => {
    const live = alive(s.sessions)
    if (!live.length) return []
    const t = todayISO()
    let first = t
    for (const x of live) {
      const d = new Date(x.endedAt - 3.5 * 3600_000)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (iso < first) first = iso
    }
    const out: Array<{ key: string; label: string; minutes: number; goal: number }> = []
    if (mode === 'day') {
      let d = first
      let guard = 0
      while (d <= t && guard++ < 800) {
        out.push({
          key: d,
          label: shortDate(d),
          minutes: minutesOn(s, d),
          goal: s.settings.dailyTokenGoal * s.settings.tokenMinutes,
        })
        d = addDays(d, 1)
      }
    } else {
      let w = weekStart(first)
      let guard = 0
      while (w <= t && guard++ < 200) {
        out.push({
          key: w,
          label: shortDate(w),
          minutes: weekMinutes(s, w),
          goal: s.settings.weeklyTokenGoal * s.settings.tokenMinutes,
        })
        w = addDays(w, 7)
      }
    }
    return out
  }, [s.sessions, s.settings, mode])

  if (series.length < 2) return null
  const max = Math.max(1, ...series.map((x) => x.minutes), series[0].goal)
  const avg = series.reduce((a, b) => a + b.minutes, 0) / series.length

  return (
    <div className="card pad">
      <button
        className="spread"
        style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'start' }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="section-title">שעות עבודה לאורך הזמן</div>
        <span className="tiny faint">{open ? '▾' : '◂'}</span>
      </button>

      {open && (
        <>
          <div className="row" style={{ margin: '10px 0', gap: 4 }}>
            <button className={`btn xs${mode === 'week' ? ' primary' : ''}`} onClick={() => setMode('week')}>
              לפי שבוע
            </button>
            <button className={`btn xs${mode === 'day' ? ' primary' : ''}`} onClick={() => setMode('day')}>
              לפי יום
            </button>
            <span className="grow" />
            <span className="tiny faint">
              ממוצע {minutesToHM(Math.round(avg))} {mode === 'day' ? 'ליום' : 'לשבוע'}
            </span>
          </div>

          <div className="hist" style={{ ['--goal' as any]: `${(series[0].goal / max) * 100}%` }}>
            <div className="goal-line" style={{ bottom: `${(series[0].goal / max) * 100}%` }} />
            {series.map((x) => (
              <i
                key={x.key}
                title={`${x.label} · ${minutesToHM(x.minutes)}`}
                style={{
                  height: `${Math.max(x.minutes ? 2 : 1, (x.minutes / max) * 100)}%`,
                  background: x.minutes >= x.goal ? 'var(--good)' : 'var(--accent)',
                  opacity: x.minutes ? 1 : 0.2,
                }}
              />
            ))}
          </div>
          <div className="spread tiny faint" style={{ marginTop: 4 }}>
            <span className="ltr">{series[0].label}</span>
            <span>הקו המקווקו = היעד</span>
            <span className="ltr">{series[series.length - 1].label}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// מטרות־העל של שבוע
// ---------------------------------------------------------------------------
export function GoalsCard({ ws, title }: { ws: string; title: string }) {
  const s = useApp()
  const wl = weekLog(s, ws)
  const goals = wl.goals ?? []
  if (!goals.length) return null
  const done = goals.filter((g) => g.done).length

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 4px' }}>
        <b>{title}</b>
        <span className="tiny faint ltr">
          {done}/{goals.length}
        </span>
      </div>
      <div className="list">
        {goals.map((g) => {
          const tr = trackById(s, g.trackId)
          return (
            <div className="item" key={g.id}>
              <Check
                on={!!g.done}
                onClick={() => {
                  actions.toggleWeekGoal(ws, g.id)
                  vibrate()
                }}
              />
              {tr && <span className="dot" style={{ background: tr.color }} />}
              <div className="txt">
                <div
                  className="ttl"
                  style={{
                    textDecoration: g.done ? 'line-through' : undefined,
                    color: g.done ? 'var(--text-faint)' : undefined,
                  }}
                >
                  {g.text}
                </div>
                {tr && <div className="sub2">{tr.name}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// המעבר השבועי — שישה שלבים
// ---------------------------------------------------------------------------
const STEPS = ['המספרים', 'הניתוח', 'השאלות', 'מטרות', 'המשימות', 'סיום'] as const

export function WeeklyFlow({ ws, onClose }: { ws: string; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const wl = weekLog(s, ws)
  const nextWs = addDays(ws, 7)
  const nextWl = weekLog(s, nextWs)

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(() => wl.review?.answers ?? {})
  const [score, setScore] = useState<number>(wl.review?.score ?? 0)
  const [goals, setGoals] = useState<WeekGoal[]>(() =>
    (nextWl.goals ?? []).length ? nextWl.goals! : [{ id: uid('g'), text: '' }],
  )
  const bodyRef = useRef<HTMLDivElement>(null)

  const st = useMemo(() => buildWeekStats(s, ws), [s, ws])
  const insights = useMemo(() => buildInsights(s, st), [s, st])
  const ai = useAiInsight()

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [step])

  // נעילת גלילה מאחורי המסך המלא
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
      document.body.style.overflow = ''
    }
  }, [])

  const save = () => {
    const clean = goals.map((g) => ({ ...g, text: g.text.trim() })).filter((g) => g.text)
    actions.patchWeek(ws, {
      review: { submittedAt: Date.now(), answers, score: score || 0, snapshot: buildSnapshot(s, ws) },
    })
    actions.patchWeek(nextWs, { goals: clean, plannedAt: Date.now() })
    vibrate([30, 50, 30])
    toast('השבוע נסגר. שבוע חדש 🚀')
    onClose()
  }

  return (
    <div className="flow" role="dialog" aria-modal="true" aria-label="מעבר שבועי">
      <div className="flow-head">
        <div className="spread">
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>{STEPS[step]}</b>
            <div className="tiny faint">
              שבוע <span className="ltr">{shortDate(ws)} – {shortDate(addDays(ws, 6))}</span> · שלב{' '}
              <span className="ltr">{step + 1}/{STEPS.length}</span>
            </div>
          </div>
          <button className="btn ghost sm" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="steps" aria-hidden>
          {STEPS.map((x, i) => (
            <i key={x} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="flow-body" ref={bodyRef}>
        <div className="stack narrow" style={{ margin: '0 auto', maxWidth: 640 }}>
          {step === 0 && (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                לפני שכותבים משהו — מה באמת קרה. המספרים כאן הם הקלט, לא הציון.
              </p>
              <WeekNumbers st={st} />
              <WeekBars st={st} />
              <TrackSplit st={st} />
            </>
          )}

          {step === 1 && (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                מה שהמספרים אומרים, בלי לרכך.
              </p>
              {ai && <ClaudeInsight ws={ws} ins={ai} />}
              {ai && <div className="section-title">מה שהמכשיר מצא בעצמו</div>}
              <div className="stack" style={{ gap: 8 }}>
                {insights.map((i) => (
                  <div key={i.id} className={`ins ${i.tone}`}>
                    <b>{i.title}</b>
                    <div className="small">{i.text}</div>
                  </div>
                ))}
                {!insights.length && <div className="empty">אין מספיק נתונים לשבוע הזה.</div>}
              </div>
              {/* לצלול פנימה: כל הנתונים של השבוע נארזים לפרומפט מוכן */}
              <button
                className="btn block"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(digestForClaude(s, st, wl))
                    toast('הועתק. הדבק בשיחה עם Claude וקבל ניתוח מעמיק של השבוע')
                  } catch {
                    toast('ההעתקה נחסמה בדפדפן')
                  }
                }}
              >
                📋 ניתוח מעמיק עם Claude
              </button>
              <div className="tiny faint" style={{ marginTop: -4 }}>
                מעתיק ללוח את כל נתוני השבוע יחד עם השאלות הנכונות. שום דבר לא נשלח מכאן —
                אתה מדביק בשיחה מתי שבא לך.
              </div>
            </>
          )}

          {step === 2 && (
            <QuestionsStep answers={answers} setAnswers={setAnswers} score={score} setScore={setScore} />
          )}

          {step === 3 && <GoalsStep goals={goals} setGoals={setGoals} st={st} nextWs={nextWs} />}

          {step === 4 && <TasksStep nextWs={nextWs} />}

          {step === 5 && <DoneStep ws={ws} nextWs={nextWs} goals={goals} st={st} answers={answers} />}
        </div>
      </div>

      <div className="flow-foot">
        {step > 0 && (
          <button className="btn" onClick={() => setStep((x) => x - 1)}>
            חזרה
          </button>
        )}
        <span className="grow" />
        {step < STEPS.length - 1 ? (
          <button
            className="btn primary"
            style={{ minWidth: 130 }}
            onClick={() => {
              if (step === 2) {
                const filled = REVIEW_QUESTIONS.filter((q) => (answers[q.id] ?? '').trim()).length
                if (!filled) return toast('ענה לפחות על שאלה אחת — זה בשבילך')
                if (!score) return toast('סמן איך הרגיש השבוע')
              }
              setStep((x) => x + 1)
            }}
          >
            הבא ←
          </button>
        ) : (
          <button className="btn primary" style={{ minWidth: 130 }} onClick={save}>
            ✓ סגירת השבוע
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function QuestionsStep({
  answers,
  setAnswers,
  score,
  setScore,
}: {
  answers: Record<string, string>
  setAnswers: (f: (a: Record<string, string>) => Record<string, string>) => void
  score: number
  setScore: (n: number) => void
}) {
  const [more, setMore] = useState(false)
  const core = REVIEW_QUESTIONS.filter((q) => q.core)
  const extra = REVIEW_QUESTIONS.filter((q) => !q.core)
  const shown = more ? [...core, ...extra] : core

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        חמש שאלות. תשובה של שורה עדיפה על פסקה שלא נכתבה.
      </p>
      {shown.map((q, i) => (
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
      {!more && (
        <button className="btn sm ghost block" onClick={() => setMore(true)}>
          + עוד {extra.length} שאלות
        </button>
      )}
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
    </>
  )
}

// ---------------------------------------------------------------------------
function GoalsStep({
  goals,
  setGoals,
  st,
  nextWs,
}: {
  goals: WeekGoal[]
  setGoals: (g: WeekGoal[]) => void
  st: WeekStats
  nextWs: string
}) {
  const s = useApp()
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  const cap = weekDates(nextWs).reduce((a, d) => a + dayCapacity(s, d), 0)

  const set = (id: ID, p: Partial<WeekGoal>) => setGoals(goals.map((g) => (g.id === id ? { ...g, ...p } : g)))

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        מה חייב להיות נכון בסוף השבוע הבא. לא רשימת משימות — <b>שלוש תוצאות לכל היותר</b>, כאלה
        שאפשר להגיד עליהן כן או לא. הן ילוו אותך במסך היום כל השבוע.
      </p>
      <div className="card pad" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
        <div className="small">
          לשבוע <span className="ltr">{shortDate(nextWs)} – {shortDate(addDays(nextWs, 6))}</span> יש
          קיבולת של <b>{cap} אסימונים</b> ({minutesToHM(cap * s.settings.tokenMinutes)} נטו).
          {st.tokens > 0 && (
            <>
              {' '}בפועל השבוע שנסגר הכניס {st.tokens.toFixed(1)}. תכנן לפי מה שקרה, לא לפי מה שרצית.
            </>
          )}
        </div>
      </div>

      {goals.map((g, i) => (
        <div className="qcard" key={g.id}>
          <div className="spread" style={{ marginBottom: 6 }}>
            <div className="q">מטרה {i + 1}</div>
            {goals.length > 1 && (
              <button
                className="btn ghost xs"
                aria-label="מחיקת המטרה"
                onClick={() => setGoals(goals.filter((x) => x.id !== g.id))}
              >
                ✕
              </button>
            )}
          </div>
          <input
            className="input"
            value={g.text}
            autoFocus={i === 0 && !g.text}
            placeholder={i === 0 ? 'למשל: לסיים את הפרק הראשון בסמינר' : 'עוד תוצאה שאפשר לסמן ✓'}
            onChange={(e) => set(g.id, { text: e.target.value })}
          />
          <div className="tag-scroll" style={{ marginTop: 8 }}>
            <button
              className={`tag${!g.trackId ? ' on' : ''}`}
              style={!g.trackId ? { background: 'var(--accent)' } : undefined}
              onClick={() => set(g.id, { trackId: undefined })}
            >
              ללא מסלול
            </button>
            {tracks.map((tr) => (
              <button
                key={tr.id}
                className={`tag${g.trackId === tr.id ? ' on' : ''}`}
                style={
                  g.trackId === tr.id
                    ? { background: tr.color, color: onColor(tr.color), borderColor: 'transparent' }
                    : { ['--tc' as any]: tr.color }
                }
                onClick={() => set(g.id, { trackId: tr.id })}
              >
                {tr.emoji} {tr.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {goals.length < 3 && (
        <button className="btn sm block" onClick={() => setGoals([...goals, { id: uid('g'), text: '' }])}>
          + מטרה נוספת
        </button>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
function TasksStep({ nextWs }: { nextWs: string }) {
  const s = useApp()
  const toast = useToast()
  const [txt, setTxt] = useState('')
  const [trk, setTrk] = useState<ID | undefined>(undefined)
  const prevDue = useRef(new Map<string, string | undefined>())
  const dates = weekDates(nextWs)
  const weekEnd = addDays(nextWs, 6)
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)

  const inWeek = alive(s.tasks).filter(
    (t) => t.status !== 'done' && t.due && t.due >= nextWs && t.due <= weekEnd,
  )
  const planned = inWeek.reduce((a, t) => a + (t.est ?? 0), 0)
  const cap = dates.reduce((a, d) => a + dayCapacity(s, d), 0)

  // המאגר: באיחור, בלי תאריך, או אחרי השבוע הבא — כל מה שאפשר למשוך פנימה
  const pool = alive(s.tasks)
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.status !== 'waiting' &&
        (!t.due || t.due < nextWs || t.due > weekEnd),
    )
    .sort((a, b) => Number(b.critical ?? false) - Number(a.critical ?? false) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  const byTrack = new Map<string, Task[]>()
  for (const t of pool) byTrack.set(t.trackId ?? '', [...(byTrack.get(t.trackId ?? '') ?? []), t])
  const groups = [...byTrack.entries()]
    .map(([k, list]) => [tracks.find((x) => x.id === k), list] as const)
    .sort((a, b) => (a[0]?.order ?? 99) - (b[0]?.order ?? 99))

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        מה נכנס לשבוע הבא. נגיעה מושכת משימה פנימה, ובסוף אפשר לפזר אותן על הימים לפי הקיבולת של
        כל יום.
      </p>

      <div className="card pad">
        <div className="spread" style={{ marginBottom: 8 }}>
          <b>
            {plural(inWeek.length, 'משימה אחת בשבוע', 'משימות בשבוע')}
          </b>
          <span className="tiny" style={{ color: planned > cap ? 'var(--warn)' : 'var(--text-faint)', fontWeight: 700 }}>
            <span className="ltr">{planned}</span> מתוך <span className="ltr">{cap}</span> אסימונים
          </span>
        </div>
        <Bar value={planned} max={Math.max(1, cap)} color={planned > cap ? 'var(--warn)' : undefined} />
        {planned > cap && (
          <div className="tiny" style={{ color: 'var(--warn)', marginTop: 6, fontWeight: 600 }}>
            תכננת יותר ממה שנכנס בשבוע. עדיף להוריד עכשיו מאשר לגלות ביום חמישי.
          </div>
        )}
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button
            className="btn sm"
            disabled={!inWeek.length}
            onClick={() => {
              if (!hasSpreadRoom(nextWs, 7)) return toast('אין יום פנוי בשבוע הבא')
              const before = spreadTasks(inWeek.map((t) => t.id), nextWs, 7)
              toast('המשימות פוזרו על ימי השבוע', {
                label: 'ביטול',
                run: () => before.forEach((x) => actions.patchTask(x.id, { due: x.due })),
              })
            }}
          >
            פזר על ימי השבוע
          </button>
        </div>
      </div>

      {/* פירוט לפי יום */}
      <div className="card">
        <div className="section-title" style={{ padding: '12px 13px 4px' }}>איך זה יושב על הימים</div>
        <div className="list">
          {dates.map((d) => {
            const list = inWeek.filter((t) => t.due === d)
            const c = dayCapacity(s, d)
            const p = list.reduce((a, t) => a + (t.est ?? 0), 0)
            return (
              <div className="item" key={d} style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 42, flex: '0 0 42px' }}>
                  <div className="tiny" style={{ fontWeight: 800 }}>{HE_DAYS_SHORT[dow(d)]}</div>
                  <div className="tiny faint ltr">{shortDate(d)}</div>
                </div>
                <div className="txt">
                  {list.length === 0 ? (
                    <div className="tiny faint">פנוי</div>
                  ) : (
                    list.map((t) => (
                      <div key={t.id} className="tiny" style={{ marginBottom: 2 }}>
                        · {t.title}
                        {t.est ? <span className="faint"> ({t.est})</span> : null}
                      </div>
                    ))
                  )}
                </div>
                <span className="tiny faint ltr" style={{ flexShrink: 0 }}>
                  {p}/{c}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* משיכה מהמאגר */}
      {pool.length > 0 && (
        <div className="card pad">
          <div className="section-title" style={{ marginBottom: 8 }}>מהמאגר</div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {groups.map(([tr, list]) => (
              <div key={tr?.id ?? 'none'} style={{ marginBottom: 8 }}>
                <div className="tiny faint" style={{ fontWeight: 700, marginBottom: 4 }}>
                  {tr ? `${tr.emoji} ${tr.name}` : 'ללא מסלול'}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {list.map((t) => (
                    <button
                      key={t.id}
                      className="tag"
                      style={{ ['--tc' as any]: tr?.color ?? 'var(--accent)' }}
                      onClick={() => {
                        prevDue.current.set(t.id, t.due)
                        actions.patchTask(t.id, { due: nextWs })
                        vibrate()
                      }}
                    >
                      + {t.title.length > 32 ? t.title.slice(0, 31) + '…' : t.title}
                      {t.due && t.due < nextWs ? ' ⏳' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 8 }}>משימה חדשה לשבוע</div>
        <div className="tag-scroll" style={{ marginBottom: 8 }}>
          {tracks.map((x) => (
            <button
              key={x.id}
              className={`tag${trk === x.id ? ' on' : ''}`}
              style={trk === x.id ? { background: x.color, color: onColor(x.color), borderColor: 'transparent' } : { ['--tc' as any]: x.color }}
              onClick={() => setTrk(trk === x.id ? undefined : x.id)}
            >
              {x.emoji} {x.name}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="input grow"
            value={txt}
            placeholder="מה עוד חייב לקרות בשבוע הבא?"
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && txt.trim()) {
                actions.addTask({ title: txt.trim(), trackId: trk ?? defaultTrackId(s), due: nextWs })
                setTxt('')
              }
            }}
          />
          <button
            className="btn"
            disabled={!txt.trim()}
            onClick={() => {
              actions.addTask({ title: txt.trim(), trackId: trk ?? defaultTrackId(s), due: nextWs })
              setTxt('')
            }}
          >
            הוספה
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
function DoneStep({
  ws,
  nextWs,
  goals,
  st,
  answers,
}: {
  ws: string
  nextWs: string
  goals: WeekGoal[]
  st: WeekStats
  answers: Record<string, string>
}) {
  const s = useApp()
  const toast = useToast()
  const clean = goals.filter((g) => g.text.trim())
  const weekEnd = addDays(nextWs, 6)
  const inWeek = alive(s.tasks).filter(
    (t) => t.status !== 'done' && t.due && t.due >= nextWs && t.due <= weekEnd,
  )
  const cap = weekDates(nextWs).reduce((a, d) => a + dayCapacity(s, d), 0)
  const planned = inWeek.reduce((a, t) => a + (t.est ?? 0), 0)

  return (
    <>
      <div className="card pad" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>🧭</div>
        <b style={{ fontSize: 17 }}>השבוע הבא, בשורה אחת</b>
        <div className="small muted" style={{ marginTop: 4 }}>
          <span className="ltr">{shortDate(nextWs)} – {shortDate(weekEnd)}</span>
        </div>
      </div>

      {clean.length > 0 ? (
        <div className="card">
          <div className="section-title" style={{ padding: '12px 13px 4px' }}>מטרות־העל</div>
          <div className="list">
            {clean.map((g) => (
              <div className="item" key={g.id}>
                <span className="dot" style={{ background: trackById(s, g.trackId)?.color ?? 'var(--accent)' }} />
                <div className="txt">
                  <div className="ttl">{g.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card pad">
          <div className="tiny" style={{ color: 'var(--warn)' }}>
            לא הגדרת מטרות לשבוע הבא. אפשר לחזור אחורה — שבוע בלי מטרה נוטה להיגמר בתחושה של
            "עבדתי הרבה ולא התקדמתי".
          </div>
        </div>
      )}

      <div className="card pad">
        <div className="grid3">
          <div>
            <div className="tiny faint">משימות בשבוע</div>
            <b style={{ fontSize: 20 }}>{inWeek.length}</b>
          </div>
          <div>
            <div className="tiny faint">מתוכנן</div>
            <b style={{ fontSize: 20 }} className="ltr">
              {planned}/{cap}
            </b>
          </div>
          <div>
            <div className="tiny faint">השבוע שנסגר</div>
            <b style={{ fontSize: 20 }}>{st.tokens.toFixed(1)}</b>
          </div>
        </div>
      </div>

      <button
        className="btn block"
        onClick={async () => {
          const wl = weekLog(s, ws)
          const digest = digestForClaude(s, st, {
            ...wl,
            review: { answers, score: 0 },
          })
          try {
            await navigator.clipboard.writeText(digest)
            toast('הועתק — כולל מה שכתבת. הדבק בשיחה עם Claude')
          } catch {
            toast('ההעתקה נחסמה בדפדפן')
          }
        }}
      >
        📋 ניתוח מעמיק עם Claude — כולל התשובות שלי
      </button>

      <p className="small muted" style={{ margin: 0 }}>
        לחיצה על "סגירת השבוע" שומרת את הסקירה, קובעת את המטרות לשבוע הבא, ומחזירה אותך למסך היום.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// מסך נעילה — יום ראשון בבוקר
// ---------------------------------------------------------------------------
export function ReviewLock({ ws, onSkip }: { ws: string; onSkip: () => void }) {
  const [open, setOpen] = useState(false)
  if (open) return <WeeklyFlow ws={ws} onClose={() => setOpen(false)} />
  return (
    <div className="lock-overlay">
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🧭</div>
          <h1 style={{ fontSize: 24, marginTop: 6 }}>מעבר שבועי</h1>
          <p className="muted small" style={{ maxWidth: 440, margin: '6px auto 0' }}>
            שבוע נסגר. כמה דקות להסתכל מה עבד, ואז להגדיר את הבא — זה מה שמונע מהתוכנית להישחק
            בלי ששמים לב.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn primary" onClick={() => setOpen(true)}>
              פתיחת המעבר השבועי
            </button>
            <button className="btn ghost sm" onClick={onSkip}>
              אמלא אחר כך
            </button>
          </div>
          <button
            className="btn ghost sm"
            style={{ marginTop: 10 }}
            onClick={() => {
              actions.setSettings({ reviewLock: false })
              onSkip()
            }}
          >
            אל תנעל לי את האפליקציה
          </button>
        </div>
      </div>
    </div>
  )
}
