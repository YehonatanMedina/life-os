import React, { useEffect, useMemo, useState } from 'react'
import {
  actions, alive, dayCapacity, dayLog, defaultTrackId, eventsOn, minutesOn, periodicDue, plannedOn,
  hasSpreadRoom, sessionsOn, spreadTasks, store, tasksDueOn, trackById, useApp, weekLog,
  weekMinutes,
} from '../store'
import {
  HE_DAYS_SHORT, addDays, countdownText, diffDays, dow, hhmm, iso, minutesToHM, niceDate,
  plural, shortDate, timeToMinutes, today as todayISO, weekStart,
} from '../dates'
import { Bar, Check, DateField, NumField, onColor, Ring, Sheet, ding, useTick, useToast, vibrate } from '../ui'
import type { CalEvent, ID, Task } from '../types'

export default function Today({ goto }: { goto: (v: string, arg?: any) => void }) {
  const s = useApp()
  const now = useTick(30000)
  const date = todayISO()
  const ws = weekStart(date)

  const log = dayLog(s, date)
  const phase = alive(s.phases).find((p) => date >= p.from && date <= p.to)

  const dueToday = tasksDueOn(s, date)
  const overdue = useMemo(
    () =>
      alive(s.tasks)
        .filter((t) => t.due && t.due < date && t.status !== 'done')
        .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')),
    [s.tasks, date],
  )
  // משימות בלי תאריך — נוצרות מהקנבן. בלעדיהן הן היו נעלמות מהמסך הזה לתמיד.
  const backlog = useMemo(
    () => alive(s.tasks).filter((t) => !t.due && t.status !== 'done').sort((a, b) => a.order - b.order),
    [s.tasks],
  )
  const doneToday = useMemo(
    () => alive(s.tasks).filter((t) => t.status === 'done' && t.doneAt && iso(new Date(t.doneAt)) === date),
    [s.tasks, date],
  )

  const hour = new Date(now).getHours()
  const greet =
    hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב'

  const showWake = !log.wake && hour < 13
  // שאלת השינה נשאלת בבוקר על הלילה שעבר
  const yLog = dayLog(s, addDays(date, -1))
  const showSleep = !yLog.sleep && hour < 13
  const birthdays = eventsOn(s, date).filter((e) => e.kind === 'birthday')

  return (
    <div className="stack" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>
          {greet}{s.settings.name ? `, ${s.settings.name}` : ''}
        </h1>
        <div className="sub">
          {niceDate(date)}{phase ? ` · ${phase.name}` : ''}
        </div>
      </div>

      {!s.settings.onboarded && <Intro />}

      <PhaseStrip />

      {birthdays.length > 0 && (
        <div className="card pad" style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <b>🎂 {birthdays.map((e) => e.title).join(' · ')}</b>
          <div className="tiny muted">אל תשכח להרים טלפון.</div>
        </div>
      )}

      <div className="grid2">
        <div className="stack">
          <DeepWork date={date} ws={ws} />
          <WhatNow date={date} goto={goto} />
          {showWake && <WakeCard date={date} />}
          {showSleep && <SleepCard date={date} />}
          <TasksToday
            due={dueToday}
            overdue={overdue}
            backlog={backlog}
            doneToday={doneToday.length}
            date={date}
          />
          <DaySchedule date={date} goto={goto} />
        </div>

        <div className="stack">
          <Countdowns date={date} />
          <DailyHabits date={date} />
          <WeeklyTokens ws={ws} />
          <FocusCard />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export function kindColor(k: string): string {
  switch (k) {
    case 'exam': return '#e5484d'
    case 'deadline': return '#d9730d'
    case 'birthday': return '#e93d82'
    case 'holiday': return '#0090ff'
    case 'milestone': return '#8e4ec6'
    case 'block': return '#5b5bd6'
    case 'personal': return '#5b5bd6'
    default: return '#8b8d98'
  }
}

// ---------------------------------------------------------------------------
function Intro() {
  const s = useApp()
  return (
    <div className="card pad" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <b>איך זה עובד</b>
          <ul className="small" style={{ margin: '8px 0 0', paddingInlineStart: 18, lineHeight: 1.7 }}>
            <li>
              <b>אסימון</b> = {s.settings.tokenMinutes} דקות ריכוז נטו. היעד: {s.settings.dailyTokenGoal}{' '}
              ביום רגיל — פחות בשישי־שבת ובימי מבחן, ואפס בחג. בחר מסלול, לחץ — זה כל הסיפור.
            </li>
            <li>
              ל<b>אסימונים הצפים</b> (סבתות, חברים, גיטרה) אין שעה קבועה — רק צריך שיקרו במהלך השבוע.
            </li>
            <li>
              <b>היומן</b> נפתח עם מבנה השבוע הקבוע שלך. אפשר לגרור כל בלוק לשעה אחרת; להזזה ליום אחר —
              תצוגת שבוע, או שדה התאריך בעריכה.
            </li>
          </ul>
        </div>
        <button className="btn ghost sm" aria-label="סגירה" onClick={() => actions.setSettings({ onboarded: true })}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function PhaseStrip() {
  const s = useApp()
  const date = todayISO()
  const [open, setOpen] = useState(false)
  const phases = alive(s.phases).sort((a, b) => a.from.localeCompare(b.from))
  const phase = phases.find((p) => date >= p.from && date <= p.to)
  // אחרי השלב האחרון — לא מציגים "43/43" לנצח עם פוקוס שכבר עבר
  const past = !phase
  const shown = phase ?? phases[phases.length - 1]
  // אין שלבים בכלל — אין מה להראות
  if (!shown) return null
  const total = diffDays(shown.from, shown.to) + 1
  const passed = Math.min(total, Math.max(0, diffDays(shown.from, date) + 1))

  return (
    <>
      <button className="card pad" style={{ textAlign: 'start', width: '100%' }} onClick={() => setOpen(true)}>
        <div className="spread">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 700, fontSize: 14.5 }}>
              {past ? 'התקופה שתוכננה הסתיימה' : shown.name}
            </div>
            {/* לא truncate: חיתוך RTL אוכל את החצי השמאלי של מספר, ו-15.9 הופך ל-9 */}
            <div className="tiny faint clamp2">
              {past ? `${shown.name} נסגר ב־${shortDate(shown.to)}. אפשר לקבוע תקופה חדשה בקוד או פשוט להמשיך.` : shown.focus}
            </div>
          </div>
          {!past && (
            <span className="chip">
              יום <span className="ltr">{passed}/{total}</span>
            </span>
          )}
          <span className="faint">›</span>
        </div>
        {!past && (
          <div style={{ marginTop: 9 }}>
            <Bar value={passed} max={total} color={shown.color} />
          </div>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="השלבים של התקופה">
        <div className="stack">
          {phases.map((p) => {
            const active = date >= p.from && date <= p.to
            const t = diffDays(p.from, p.to) + 1
            const d = Math.min(t, Math.max(0, diffDays(p.from, date) + 1))
            return (
              <div
                key={p.id}
                className="card pad rail"
                style={{ ['--rail' as any]: p.color, opacity: active ? 1 : 0.7 }}
              >
                <div className="spread">
                  <b>{p.name}</b>
                  {active && <span className="chip on">עכשיו</span>}
                </div>
                <div className="tiny faint" style={{ margin: '3px 0 8px' }}>
                  <span className="ltr">{shortDate(p.from)} – {shortDate(p.to)}</span> · {t} ימים
                </div>
                <div className="small" style={{ marginBottom: 8 }}>
                  <b>פוקוס:</b> {p.focus}
                </div>
                {p.rule && (
                  <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{p.rule}</div>
                )}
                {/* מה שבאמת בחלון — מהיומן, לא מתכנון שהומצא */}
                {(() => {
                  const inWindow = alive(s.events)
                    .filter(
                      (e) =>
                        ['deadline', 'exam', 'milestone'].includes(e.kind) &&
                        e.date >= p.from &&
                        e.date <= p.to,
                    )
                    .sort((a, b) => a.date.localeCompare(b.date))
                  if (!inWindow.length) return null
                  return (
                    <div className="tiny" style={{ marginTop: 4 }}>
                      {inWindow.map((e) => (
                        <div key={e.id} className="faint">
                          <span className="ltr">{shortDate(e.date)}</span> · {e.title}
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {active && (
                  <div style={{ marginTop: 10 }}>
                    <Bar value={d} max={t} color={p.color} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}

// ---------------------------------------------------------------------------
// המנוע: טבעת האסימונים והטיימר באותו כרטיס — המספר והכפתור שמשנה אותו
// ---------------------------------------------------------------------------
function DeepWork({ date, ws }: { date: string; ws: string }) {
  const s = useApp()
  useTick(1000)
  const toast = useToast()
  const t = s.timer
  const [manual, setManual] = useState(false)

  const tokenMin = s.settings.tokenMinutes
  const minutes = minutesOn(s, date)
  const tokens = minutes / tokenMin
  // היעד של היום — לא היעד הגנרי: בשישי־שבת הוא נמוך יותר, ביום מבחן נמוך מאוד,
  // ובחג הוא אפס. זה המספר שהוא מסתכל עליו, אז הוא צריך להיות אמיתי.
  const cap = dayCapacity(s, date)
  const goal = cap > 0 ? cap : s.settings.dailyTokenGoal
  const rest = cap === 0
  const weekTokens = weekMinutes(s, ws) / tokenMin

  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  const elapsedMin = t ? t.accumulated + (t.running ? (Date.now() - t.startedAt) / 60000 : 0) : 0
  const target = t?.targetMinutes ?? tokenMin
  const remain = Math.max(0, target * 60 - elapsedMin * 60)
  const reached = !!t && elapsedMin >= target
  const tr = t ? trackById(s, t.trackId) : undefined

  useEffect(() => {
    if (!t || !reached || t.notified) return
    actions.markTimerNotified()
    if (s.settings.sound) ding()
    vibrate([40, 60, 40])
    toast(`אסימון הושלם · ${target} דקות ריכוז נטו`)
    if (s.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('אסימון Deep Work הושלם', { body: `${target} דקות של ריכוז. כל הכבוד.` })
      } catch {
        /* ignore */
      }
    }
  }, [reached, t, s.settings.sound, s.settings.notifications, target, toast])

  const mmss = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60)
    const ss = Math.floor(Math.max(0, secs) % 60)
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  return (
    <>
      <div className={`card timer-card${t ? ' live' : ''}`}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div>
            <b style={{ fontSize: 16 }}>Deep Work</b>
            <div className="tiny faint">
              {rest
                ? `${minutesToHM(minutes)} · חג — אין יעד היום`
                : `${minutesToHM(minutes)} מתוך ${minutesToHM(goal * tokenMin)} היום`}
            </div>
          </div>
          <button className="btn sm" onClick={() => setManual(true)}>
            + רישום ידני
          </button>
        </div>

        <div className="dw-row">
          <Ring
            value={tokens}
            max={rest ? Math.max(s.settings.dailyTokenGoal, tokens) : goal}
            size={128}
            stroke={12}
            color={rest ? 'var(--text-faint)' : tokens >= goal ? 'var(--good)' : undefined}
          >
            <div className="n">{tokens.toFixed(1)}</div>
            <div className="l">{rest ? 'חג' : `מתוך ${goal}`}</div>
          </Ring>

          <div className="grow" style={{ minWidth: 0 }}>
            {t ? (
              <>
                <span className="chip tinted" style={{ ['--c' as any]: tr?.color ?? 'var(--accent)' }}>
                  {tr?.emoji} {tr?.name ?? 'ללא מסלול'}
                </span>
                <div className="timer-time ltr" style={{ color: reached ? 'var(--good)' : undefined, marginTop: 10 }}>
                  {reached ? `+${mmss((elapsedMin - target) * 60)}` : mmss(remain)}
                </div>
                <div className="tiny faint">
                  {reached ? 'היעד הושלם — כל דקה נוספת נספרת' : `${Math.floor(elapsedMin)} מתוך ${target} דק׳`}
                </div>
              </>
            ) : (
              <>
                <div className="tiny faint" style={{ marginBottom: 8 }}>
                  {tracks.length
                    ? `בלוק של ${tokenMin} דק׳ · טלפון בחדר אחר. בחר מסלול והתחל:`
                    : 'אין מסלולים. פותחים אחד במסך "פרויקטים" ואז אפשר להתחיל למדוד.'}
                </div>
                <div className="tag-scroll">
                  {tracks.map((x) => (
                    <button
                      key={x.id}
                      className="tag"
                      style={{ ['--tc' as any]: x.color }}
                      onClick={() => {
                        actions.startTimer(x.id)
                        vibrate()
                      }}
                    >
                      {x.emoji} {x.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {t && (
          <>
            <div className="row" style={{ marginTop: 13 }}>
              <button
                className="btn primary grow"
                onClick={() => {
                  const m = actions.stopTimer(true)
                  vibrate([30, 40, 30])
                  toast(
                    m >= 1
                      ? `${plural(m, 'נשמרה דקה אחת', 'דקות נשמרו')} · ${(m / tokenMin).toFixed(2)} אסימונים`
                      : 'פחות מדקה — לא נשמר. הכל בסדר.',
                  )
                }}
              >
                ✓ סיים ושמור
              </button>
              {t.running ? (
                <button className="btn grow" onClick={() => actions.pauseTimer()}>
                  ⏸ השהיה
                </button>
              ) : (
                <button className="btn grow" onClick={() => actions.resumeTimer()}>
                  ▶ המשך
                </button>
              )}
            </div>
            <button
              className="btn ghost sm block"
              style={{ marginTop: 6 }}
              onClick={() => {
                actions.stopTimer(false)
                toast('הסשן בוטל')
              }}
            >
              ביטול בלי לשמור
            </button>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <div className="spread tiny faint" style={{ marginBottom: 5 }}>
            <span>השבוע</span>
            <span className="ltr">
              {weekTokens.toFixed(1)} / {s.settings.weeklyTokenGoal}
            </span>
          </div>
          <Bar value={weekTokens} max={s.settings.weeklyTokenGoal} />
        </div>

        <TodaySessions date={date} />
      </div>

      <ManualSheet open={manual} onClose={() => setManual(false)} />
    </>
  )
}

function ManualSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '')
  const [mins, setMins] = useState(90)
  const [when, setWhen] = useState(todayISO())
  const firstTrack = tracks[0]?.id

  // מתאפס רק כשהגיליון נפתח — לא בכל ציור מחדש
  useEffect(() => {
    if (!open) return
    setWhen(todayISO())
    setTrackId((cur) => cur || firstTrack || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} title="רישום ידני של עבודה">
      <div className="tag-scroll" style={{ marginBottom: 12 }}>
        {tracks.map((tr) => (
          <button
            key={tr.id}
            className={`tag${trackId === tr.id ? ' on' : ''}`}
            style={
              trackId === tr.id
                ? { background: tr.color, color: onColor(tr.color), borderColor: 'transparent' }
                : { ['--tc' as any]: tr.color }
            }
            onClick={() => setTrackId(tr.id)}
          >
            {tr.emoji} {tr.name}
          </button>
        ))}
      </div>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        {[15, 30, 45, 60, 90, 120, 180].map((m) => (
          <button key={m} className={`btn sm${mins === m ? ' primary' : ''}`} onClick={() => setMins(m)}>
            {m} דק׳
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 12 }}>
        <NumField value={mins} min={1} max={600} suffix="דק׳" onChange={setMins} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="tiny faint" style={{ marginBottom: 5, fontWeight: 700 }}>
          מתי
        </div>
        <DateField value={when} onChange={(v) => setWhen(v || todayISO())} />
      </div>

      <button
        className="btn primary block"
        disabled={!trackId}
        onClick={() => {
          // נרשם בסוף אותו יום, כדי שייפול על התאריך הנכון
          const d = new Date(`${when}T20:00:00`)
          actions.addSession(trackId, mins, d.getTime())
          toast(`נוספו ${mins} דקות · ${niceDate(when)}`)
          onClose()
        }}
      >
        הוספה
      </button>
    </Sheet>
  )
}

function TodaySessions({ date }: { date: string }) {
  const s = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const list = sessionsOn(s, date).sort((a, b) => b.endedAt - a.endedAt)
  if (!list.length) return null
  const total = list.reduce((a, b) => a + b.minutes, 0)

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
      <button
        className="spread"
        style={{ width: '100%', background: 'none', border: 0, padding: '2px 0' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tiny faint">
          {list.length === 1 ? 'סשן אחד' : `${list.length} סשנים`} היום · {minutesToHM(total)}
        </span>
        <span className="tiny faint">{open ? '▾' : '◂'}</span>
      </button>
      {open && (
        <div className="list" style={{ marginTop: 4 }}>
          {list.map((x) => {
            const tr = trackById(s, x.trackId)
            return (
              <div className="item" key={x.id} style={{ minHeight: 38, paddingInline: 0 }}>
                <span className="dot" style={{ background: tr?.color ?? 'var(--line)' }} />
                <div className="txt small">
                  <span>{tr?.name ?? 'ללא מסלול'}</span>
                  <span className="faint"> · {x.minutes} דק׳ · </span>
                  <span className="faint ltr">{hhmm(x.endedAt)}</span>
                </div>
                <button
                  className="btn ghost xs"
                  aria-label="מחיקת סשן"
                  onClick={() => {
                    actions.deleteSession(x.id)
                    toast('הסשן נמחק')
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// שורה אחת: מה קורה עכשיו
// ---------------------------------------------------------------------------
function WhatNow({ date, goto }: { date: string; goto: (v: string, arg?: any) => void }) {
  const s = useApp()
  const now = useTick(60000)
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()

  const timed = eventsOn(s, date).filter((e) => !e.allDay)
  const live = timed.find((e) => nowMin >= timeToMinutes(e.start ?? '0:00') && nowMin < timeToMinutes(e.end ?? '0:00'))
  const next = timed
    .filter((e) => timeToMinutes(e.start ?? '0:00') > nowMin)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))[0]

  const e = live ?? next
  if (!e) return null
  const col = e.trackId ? trackById(s, e.trackId)?.color ?? kindColor(e.kind) : kindColor(e.kind)

  return (
    <div className="card pad rail" style={{ ['--rail' as any]: col }}>
      <div className="spread">
        <button
          className="grow"
          style={{ minWidth: 0, background: 'none', border: 0, textAlign: 'start', padding: 0 }}
          onClick={() => goto('calendar', date)}
        >
          <div className="tiny faint">{live ? 'עכשיו' : 'הבא בתור'}</div>
          <div className="truncate" style={{ fontWeight: 700 }}>
            {e.title}
          </div>
          <div className="tiny faint ltr">
            {e.start}–{e.end}
          </div>
        </button>
        {e.deep && !s.timer && (
          <button
            className="btn sm primary"
            onClick={() => {
              actions.startTimer(e.trackId ?? alive(s.tracks)[0]?.id ?? '', e.title)
              vibrate()
            }}
          >
            התחל
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
/** נשאל בבוקר על הלילה שעבר — לכן הוא נכתב על היום של אתמול */
function SleepCard({ date }: { date: string }) {
  const s = useApp()
  const toast = useToast()
  const y = addDays(date, -1)

  const set = (v: 'good' | 'bad') => {
    actions.patchDay(y, { sleep: v })
    vibrate()
    toast(v === 'good' ? 'נשמר. לילה טוב נספר' : 'נשמר. אולי כדאי להקדים הערב')
  }

  return (
    <div className="card pad">
      <b>איך ישנת אתמול בלילה?</b>
      <div className="tiny faint" style={{ marginBottom: 10 }}>
        על הלילה שבין {niceDate(y)} להיום.
      </div>
      <div className="row">
        <button className="btn primary grow" onClick={() => set('good')}>
          ישנתי טוב
        </button>
        <button className="btn grow" onClick={() => set('bad')}>
          לא ישנתי טוב
        </button>
      </div>
      <div className="tiny faint" style={{ marginTop: 8 }}>
        היעד: <span className="ltr">{s.settings.bedTime}</span> עד{' '}
        <span className="ltr">{s.settings.wakeTime}</span>.
      </div>
    </div>
  )
}

function WakeCard({ date }: { date: string }) {
  const s = useApp()
  const toast = useToast()

  return (
    <div className="card pad">
      <b>
        קמת היום בשעה <span className="ltr">{s.settings.wakeTime}</span>?
      </b>
      <div className="tiny faint" style={{ marginBottom: 10 }}>
        שעת היקיצה היא העוגן שקובע את כל היום ואת השינה של הלילה הבא.
      </div>
      <div className="row">
        <button
          className="btn primary grow"
          onClick={() => {
            actions.patchDay(date, { wake: 'ontime' })
            vibrate()
            toast('יפה. העוגן נשמר')
          }}
        >
          כן, קמתי בזמן
        </button>
        <button
          className="btn grow"
          onClick={() => {
            actions.patchDay(date, { wake: 'late', nap: true })
            toast('שמור על שעת השינה הרגילה הערב', {
              label: 'הוסף Power Nap',
              run: () => {
                const exists = eventsOn(store.get(), date).some((e) => e.title === 'Power Nap')
                if (!exists) {
                  actions.addEvent({
                    title: 'Power Nap',
                    date,
                    start: '14:30',
                    end: '14:50',
                    allDay: false,
                    kind: 'block',
                    trackId: defaultTrackId(s),
                    notes: '20 דקות בלבד — מנקה עייפות בלי להרוס את השינה של הלילה.',
                  })
                }
              },
            })
          }}
        >
          לא, מאוחר
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Countdowns({ date }: { date: string }) {
  const s = useApp()
  const list = useMemo(() => {
    const future = alive(s.events)
      .filter((e) => (e.kind === 'exam' || e.kind === 'deadline') && e.date >= date)
      .sort((a, b) => a.date.localeCompare(b.date))

    // איחוד לפי תאריך — שלושה דדליינים באותו יום הם כרטיס אחד
    const byDate = new Map<string, CalEvent[]>()
    for (const e of future) {
      const arr = byDate.get(e.date) ?? []
      arr.push(e)
      byDate.set(e.date, arr)
    }
    const groups = [...byDate.entries()].map(([d, evs]) => ({ date: d, evs }))
    const near = groups.slice(0, 3)
    const last = groups[groups.length - 1]
    // תמיד להראות גם את היעד הרחוק ביותר — הוא זה שקובע את התמונה
    if (last && !near.some((g) => g.date === last.date)) near.push(last)
    return near
  }, [s.events, date])

  if (!list.length) return null

  return (
    <div className="countdowns">
      {list.map((g) => {
        const days = diffDays(date, g.date)
        const color = kindColor(g.evs.some((e) => e.kind === 'exam') ? 'exam' : 'deadline')
        return (
          <div key={g.date} className={`cd${days <= 2 ? ' hot' : ''}`} style={{ ['--rail' as any]: color }}>
            <div className="d">
              {days === 0 ? 'היום' : days === 1 ? 'מחר' : days}
              {days > 1 && <span style={{ fontSize: 12, fontWeight: 700, marginInlineStart: 4 }}>ימים</span>}
            </div>
            <div className="t">
              {g.evs.map((e) => (
                <div key={e.id} className="truncate">
                  {e.title}
                </div>
              ))}
            </div>
            <div className="w">
              יום {HE_DAYS_SHORT[dow(g.date)]} · <span className="ltr">{shortDate(g.date)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
function DaySchedule({ date, goto }: { date: string; goto: (v: string, arg?: any) => void }) {
  const s = useApp()
  const now = useTick(30000)
  const evs = eventsOn(s, date)
    .filter((e) => !e.allDay)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
  const allDay = eventsOn(s, date).filter((e) => e.allDay && e.kind !== 'birthday')
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <b>הלו״ז של היום</b>
        <button className="btn ghost sm" onClick={() => goto('calendar', date)}>
          ליומן ←
        </button>
      </div>
      {allDay.length > 0 && (
        <div className="row wrap" style={{ padding: '0 13px 8px' }}>
          {allDay.map((e) => (
            <span key={e.id} className="chip tinted" style={{ ['--c' as any]: kindColor(e.kind) }}>
              {e.title}
            </span>
          ))}
        </div>
      )}
      <div className="list">
        {evs.length === 0 && <div className="empty">היום פנוי ביומן.</div>}
        {evs.map((e) => {
          const st = timeToMinutes(e.start ?? '00:00')
          const en = timeToMinutes(e.end ?? '00:00')
          const live = nowMin >= st && nowMin < en
          const past = nowMin >= en
          return (
            <div className="item" key={e.id} style={{ opacity: past ? 0.72 : 1 }}>
              <div style={{ width: 44, flex: '0 0 44px' }} className="tiny muted ltr">
                {e.start}
              </div>
              <span
                className="dot"
                style={{ background: e.trackId ? trackById(s, e.trackId)?.color : kindColor(e.kind) }}
              />
              <div className="txt">
                <div className="ttl truncate" style={{ fontWeight: live ? 800 : 600 }}>
                  {e.title}
                  {live && <span className="chip on" style={{ marginInlineStart: 6 }}>עכשיו</span>}
                </div>
                <div className="sub2 muted ltr">
                  {e.start}–{e.end}
                </div>
              </div>
              {e.deep && !s.timer && (
                <button
                  className="btn xs primary"
                  onClick={() => actions.startTimer(e.trackId ?? alive(s.tracks)[0]?.id ?? '', e.title)}
                >
                  התחל
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function TasksToday({
  due,
  overdue,
  backlog,
  doneToday,
  date,
}: {
  due: Task[]
  overdue: Task[]
  backlog: Task[]
  doneToday: number
  date: string
}) {
  const s = useApp()
  const toast = useToast()
  const [adding, setAdding] = useState('')
  const [showOver, setShowOver] = useState(false)
  const [showBack, setShowBack] = useState(false)

  // כל מה שמוצג בכרטיס נספר — גם מה שנדחף מימים קודמים
  const planned = [...due, ...overdue].reduce((a, t) => a + (t.est ?? 0), 0)
  const goal = dayCapacity(s, date)
  const rest = goal === 0
  const open = due.length + overdue.length
  const noEst = [...due, ...overdue].filter((t) => !t.est).length
  const defaultTrack = defaultTrackId(s)

  const row = (t: Task, late?: boolean) => {
    const tr = trackById(s, t.trackId)
    return (
      <div className="item" key={t.id}>
        <Check
          on={t.status === 'done'}
          onClick={() => {
            actions.toggleTaskDone(t.id)
            vibrate()
            toast('הושלם', { label: 'ביטול', run: () => actions.toggleTaskDone(t.id) })
          }}
        />
        <span className="dot" style={{ background: tr?.color ?? 'var(--line)' }} />
        <div className="txt">
          <div className="ttl">{t.title}</div>
          <div className="sub2">
            {tr?.name ?? 'ללא מסלול'}
            {late && t.due ? (
              <>
                {' · מ־'}
                <span className="ltr">{shortDate(t.due)}</span>
              </>
            ) : null}
            {t.est ? ` · ${plural(t.est, 'אסימון אחד', 'אסימונים')}` : ''}
          </div>
        </div>
        {t.critical && <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>קריטי</span>}
        <button
          className="btn xs ghost"
          title="דחה למחר"
          aria-label="דחה למחר"
          onClick={() => {
            const prev = t.due
            actions.patchTask(t.id, { due: addDays(date, 1) })
            toast('נדחה למחר', { label: 'ביטול', run: () => actions.patchTask(t.id, { due: prev }) })
          }}
        >
          מחר ←
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <b>המשימות של היום</b>
        <span className="tiny faint">
          {planned > 0 ? (
            <span style={planned > goal ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>
              {plural(planned, 'אסימון אחד מתוכנן', 'אסימונים מתוכננים')} ·{' '}
              {rest ? 'חג — אין קיבולת' : <>קיבולת <span className="ltr">{goal}</span></>}
              {noEst > 0 && <span className="faint"> · {noEst} בלי הערכה</span>}
            </span>
          ) : open > 0 ? (
            plural(open, 'משימה אחת', 'משימות')
          ) : doneToday > 0 ? (
            <span style={{ color: 'var(--good)' }}>
              {plural(doneToday, 'משימה אחת הושלמה', 'הושלמו')} היום
            </span>
          ) : (
            ''
          )}
        </span>
      </div>
      <div className="list">
        {overdue.length > 0 && (
          <div className="item" style={{ gap: 6 }}>
            <button
              className="grow"
              style={{
                fontWeight: 700,
                fontSize: 13,
                background: 'none',
                border: 0,
                textAlign: 'start',
                color: 'var(--text-dim)',
              }}
              onClick={() => setShowOver((v) => !v)}
            >
              {overdue.length === 1 ? 'משימה אחת מחכה' : `${overdue.length} משימות מחכות`} מימים קודמים{' '}
              {showOver ? '▾' : '◂'}
            </button>
            <button
              className="btn xs"
              onClick={() => {
                if (!hasSpreadRoom(date)) {
                  toast('אין יום פנוי בשלושת השבועות הקרובים — צריך להוריד משהו')
                  return
                }
                const before = spreadTasks(overdue.map((t) => t.id), date)
                toast(`${plural(overdue.length, 'משימה אחת פוזרה', 'משימות פוזרו')} על הימים הקרובים`, {
                  label: 'ביטול',
                  run: () => before.forEach((x) => actions.patchTask(x.id, { due: x.due })),
                })
              }}
            >
              פזר קדימה
            </button>
          </div>
        )}
        {overdue.length > 0 && showOver && (
          <div className="tiny faint" style={{ padding: '2px 13px 8px' }}>
            "פזר קדימה" מחלק אותן על הימים הקרובים לפי הקיבולת של כל יום — בחג אפס, בערב חג וביום
            מבחן מעט, בשישי־שבת פחות מיום רגיל.
          </div>
        )}
        {showOver && overdue.map((t) => row(t, true))}
        {due.map((t) => row(t))}
        {due.length > 0 && (planned > goal || rest) && (
          <div className="item" style={{ gap: 6 }}>
            <span className="grow tiny" style={{ color: 'var(--warn)', fontWeight: 700 }}>
              {rest ? 'זה יום מנוחה — ואלה מתוכננות עליו' : 'העומס של היום עובר את הקיבולת'}
            </span>
            <button
              className="btn xs"
              onClick={() => {
                const ids = rest ? [...due, ...overdue].map((t) => t.id) : due.map((t) => t.id)
                if (!hasSpreadRoom(addDays(date, 1))) {
                  toast('אין יום פנוי בשלושת השבועות הקרובים — צריך להוריד משהו')
                  return
                }
                const before = spreadTasks(ids, addDays(date, 1))
                toast(plural(ids.length, 'משימה אחת נדחפה קדימה', 'משימות נדחפו קדימה'), {
                  label: 'ביטול',
                  run: () => before.forEach((x) => actions.patchTask(x.id, { due: x.due })),
                })
              }}
            >
              פזר קדימה
            </button>
          </div>
        )}
        {backlog.length > 0 && (
          <button
            className="item"
            style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-dim)', textAlign: 'start' }}
            onClick={() => setShowBack((v) => !v)}
          >
            <span className="grow">
              {plural(backlog.length, 'משימה אחת בלי תאריך', 'משימות בלי תאריך')} {showBack ? '▾' : '◂'}
            </span>
          </button>
        )}
        {showBack && backlog.map((t) => row(t))}
        {due.length === 0 && overdue.length === 0 && backlog.length === 0 && (
          <div className="empty">
            {doneToday > 0
              ? `סיימת הכל להיום. ${plural(doneToday, 'משימה אחת נסגרה', 'משימות נסגרו')}.`
              : 'אין משימות להיום. אפשר להוסיף אחת בשורה למטה.'}
          </div>
        )}
      </div>
      <div className="row" style={{ padding: 10, borderTop: '1px solid var(--line-soft)' }}>
        <input
          className="input"
          placeholder="משימה מהירה להיום…"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && adding.trim()) {
              actions.addTask({ title: adding.trim(), trackId: defaultTrack, due: date })
              setAdding('')
              toast('נוספה משימה')
            }
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function DailyHabits({ date }: { date: string }) {
  const s = useApp()
  const log = dayLog(s, date)
  const habits = alive(s.habits).sort((a, b) => a.order - b.order)
  const [openSteps, setOpenSteps] = useState<ID | null>(null)

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <b>הרגלי היום</b>
        <span className="tiny faint ltr">
          {habits.filter((h) => log.habits[h.id]).length}/{habits.length}
        </span>
      </div>
      <div className="list">
        {habits.map((h) => {
          const on = !!log.habits[h.id]
          const steps = h.steps ?? []
          const doneSteps = steps.filter((x) => log.steps[x.id]).length
          const expanded = openSteps === h.id
          return (
            <React.Fragment key={h.id}>
              <div className="item">
                <Check on={on} onClick={() => { actions.toggleHabit(date, h.id); vibrate() }} />
                {/* כפתור רק כשיש שלבים לפתוח — אחרת זו סתם שורת טקסט */}
                {React.createElement(
                  steps.length ? 'button' : 'div',
                  steps.length
                    ? {
                        className: 'txt',
                        style: { background: 'none', border: 0, textAlign: 'start', padding: '5px 0', minHeight: 34 },
                        'aria-expanded': expanded,
                        onClick: () => setOpenSteps(expanded ? null : h.id),
                      }
                    : { className: 'txt' },
                  <div
                    key="t"
                    className="ttl"
                    style={{ textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--text-faint)' : undefined }}
                  >
                    {h.emoji} {h.name}
                  </div>,
                  (h.minutes || steps.length) ? (
                    <div key="s" className="sub2">
                      {h.minutes ? `${h.minutes} דק׳` : ''}
                      {steps.length ? `${h.minutes ? ' · ' : ''}${doneSteps}/${steps.length} ${steps.length === 1 ? 'שלב' : 'שלבים'}` : ''}
                    </div>
                  ) : null,
                )}
                {h.special === 'workout' && (
                  <div className="row" style={{ gap: 4 }}>
                    {(['run', 'strength'] as const).map((w) => (
                      <button
                        key={w}
                        className={`btn xs${log.workout === w ? ' primary' : ''}`}
                        onClick={() => actions.patchDay(date, { workout: log.workout === w ? undefined : w })}
                      >
                        {w === 'run' ? 'ריצה' : 'כוח'}
                      </button>
                    ))}
                  </div>
                )}
                {steps.length > 0 && (
                  <span className="faint" style={{ fontSize: 13 }}>
                    {expanded ? '▾' : '◂'}
                  </span>
                )}
              </div>
              {expanded &&
                steps.map((st) => (
                  <div className="item" key={st.id} style={{ paddingInlineStart: 44, minHeight: 40 }}>
                    <Check
                      sm
                      on={!!log.steps[st.id]}
                      onClick={() => {
                        actions.toggleStep(date, st.id)
                        vibrate()
                        const fresh = dayLog(store.get(), date)
                        if (steps.every((x) => fresh.steps[x.id])) {
                          actions.patchDay(date, { habits: { ...fresh.habits, [h.id]: true } })
                        }
                      }}
                    />
                    <div
                      className="txt small"
                      style={{
                        textDecoration: log.steps[st.id] ? 'line-through' : undefined,
                        color: log.steps[st.id] ? 'var(--text-faint)' : undefined,
                      }}
                    >
                      {st.text}
                    </div>
                  </div>
                ))}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function WeeklyTokens({ ws }: { ws: string }) {
  const s = useApp()
  const wl = weekLog(s, ws)
  const items = alive(s.weekly).sort((a, b) => a.order - b.order)
  const todayDow = new Date().getDay()
  const [prog, setProg] = useState<ID | null>(null)

  const visible = items.filter((w) => (w.everyDays ? periodicDue(w, ws) : true))
  const checks = visible.filter((w) => w.kind === 'check')
  const doneChecks = checks.filter((w) => wl.items[w.id]).length

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <div>
          <b>השבוע — אסימונים צפים</b>
          <div className="tiny faint">מתאפס בכל יום ראשון. אין להם שעה — רק צריך שיקרו.</div>
        </div>
        <span className="tiny faint ltr">
          {doneChecks}/{checks.length}
        </span>
      </div>
      <div className="list">
        {visible.map((w) => {
          if (w.kind === 'progress') {
            const cur = wl.progress[w.id] ?? 0
            const target = w.targetMinutes ?? 60
            return (
              <div className="item" key={w.id} style={{ flexWrap: 'wrap' }}>
                <div className="txt">
                  <div className="ttl">
                    {w.emoji} {w.name}
                  </div>
                  <div className="sub2">
                    {minutesToHM(cur)} מתוך {minutesToHM(target)}
                  </div>
                </div>
                <button className="btn xs" onClick={() => setProg(prog === w.id ? null : w.id)}>
                  + זמן
                </button>
                <div style={{ width: '100%', marginTop: 6 }}>
                  <Bar value={cur} max={target} color={cur >= target ? 'var(--good)' : undefined} />
                </div>
                {prog === w.id && (
                  <div className="row wrap" style={{ width: '100%', marginTop: 8 }}>
                    {[15, 30, 45, 60, 90].map((m) => (
                      <button
                        key={m}
                        className="btn xs"
                        onClick={() => {
                          actions.addWeeklyProgress(ws, w.id, m)
                          // פריט שמשויך למסלול נספר גם כעבודה עמוקה
                          if (w.trackId) actions.addSession(w.trackId, m, Date.now(), w.name)
                        }}
                      >
                        <span className="ltr">+{m}</span>
                      </button>
                    ))}
                    <button
                      className="btn xs danger"
                      onClick={() => {
                        // מורידים מהעבודה העמוקה רק כמה שבאמת ירד מהמונה
                        const applied = -actions.addWeeklyProgress(ws, w.id, -15)
                        if (w.trackId && applied > 0) {
                          actions.trimLastSession(w.trackId, applied, w.name)
                        }
                      }}
                    >
                      <span className="ltr">−15</span>
                    </button>
                  </div>
                )}
              </div>
            )
          }
          const on = !!wl.items[w.id]
          const alert = w.alertDow === todayDow && !on
          return (
            <div className="item" key={w.id}>
              <Check on={on} onClick={() => { actions.toggleWeeklyItem(ws, w.id); vibrate() }} />
              <div className="txt">
                <div
                  className="ttl"
                  style={{ textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--text-faint)' : undefined }}
                >
                  {w.emoji} {w.name}
                </div>
                {w.hint && <div className="sub2">{w.hint}</div>}
              </div>
              {alert && <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>היום</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function FocusCard() {
  const s = useApp()
  const toast = useToast()
  const date = todayISO()
  const horizon = addDays(date, 30)

  const milestones = alive(s.events)
    .filter((e) => (e.kind === 'milestone' || e.kind === 'deadline') && e.date >= date && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  const allCritical = alive(s.tasks)
    .filter((t) => t.critical && t.status !== 'done')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const critical = allCritical.slice(0, 6)
  const hiddenCritical = allCritical.length - critical.length

  if (!milestones.length && !allCritical.length) return null

  return (
    <div className="card">
      {critical.length > 0 && (
        <div className="section-title" style={{ padding: '12px 13px 4px' }}>הנתיב הקריטי</div>
      )}
      <div className="list">
        {critical.map((t) => {
          const tr = trackById(s, t.trackId)
          const late = t.due && t.due < date
          return (
            <div className="item" key={t.id}>
              <Check
                on={t.status === 'done'}
                onClick={() => {
                  actions.toggleTaskDone(t.id)
                  vibrate()
                  toast('הושלם', { label: 'ביטול', run: () => actions.toggleTaskDone(t.id) })
                }}
              />
              <span className="dot" style={{ background: tr?.color ?? 'var(--line)' }} />
              <div className="txt">
                <div className="ttl small">{t.title}</div>
                <div className="sub2" style={late ? { color: 'var(--bad)' } : undefined}>
                  {tr?.name ?? 'ללא מסלול'}
                  {t.due ? (
                    <>
                      {' · '}
                      <span className="ltr">{shortDate(t.due)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {hiddenCritical > 0 && (
        <div className="tiny faint" style={{ padding: '2px 13px 8px' }}>
          ועוד {hiddenCritical} קריטיות — כולן בלוח בפרויקטים.
        </div>
      )}
      {milestones.length > 0 && (
        <>
          <div className="section-title" style={{ padding: '12px 13px 4px' }}>מה מחכה קדימה</div>
          <div className="list">
            {milestones.map((e) => (
              <div className="item" key={e.id} style={{ minHeight: 42 }}>
                <span className="dot" style={{ background: kindColor(e.kind) }} />
                <div className="txt">
                  <div className="ttl small">{e.title}</div>
                  <div className="sub2">
                    <span className="ltr">{shortDate(e.date)}</span> · {countdownText(diffDays(date, e.date))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
