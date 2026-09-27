import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  actions, alive, dayCapacity, dayLog, eventsOn, minutesOn, plannedOn, store, trackById, useApp,
} from '../store'
import {
  addDays, minutesToHM, minutesToTime, niceDate, plural, shortDate, timeToMinutes, today as todayISO,
  weekStart,
} from '../dates'
import { Check, vibrate, useToast } from '../ui'
import { STATUS_LABEL } from '../types'
import type { AppState, CalEvent, HabitDef, HabitStep, ISODate, Task } from '../types'
import { EventSheet, HourGrid } from './CalendarView'
import { GoalsCard } from './Review'
import { TaskSheet } from './Projects'

// ---------------------------------------------------------------------------
// שגרת הערב — ארבעה חלונות ברצף:
//   1. היום שהיה   — פסקה חופשית על היום (נשמרת ביומן היומי, DayLog.journal)
//   2. בונים את מחר — היומן של מחר שעה־שעה, מטרות השבוע, והמשימות הפתוחות לשיבוץ
//   3. לסדר ולצחצח — הצ׳קליסט: כל שלב בהרגל "שגרת ערב" שאינו חלון
//   4. לקרוא ולישון — מינימום 5 עמודים
// כל חלון סוגר את השלב שלו בהרגל, ולכן ההרגלים, הסקירה והסנכרון רואים הכל.
// ---------------------------------------------------------------------------

// -- פתיחה מכל מקום באפליקציה (כפתור, כרטיס, התראה) ---------------------------
let openStage: number | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** פותח את שגרת הערב. בלי שלב — ממשיכים מהחלון הראשון שעוד לא נסגר. */
export function openNight(stage?: number) {
  openStage = stage ?? -1
  emit()
}
export function closeNight() {
  openStage = null
  emit()
}
function useNightStage(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => openStage,
    () => openStage,
  )
}

export const NIGHT_STAGES = ['היום שהיה', 'בונים את מחר', 'לסדר ולצחצח', 'לקרוא ולישון'] as const
const FLOW_STAGE: Record<NonNullable<HabitStep['flow']>, number> = { journal: 0, plan: 1, read: 3 }

/** ההרגל שמחזיק את שגרת הערב — זה שיש בו חלונות, ואם אין — hb-night */
export function nightHabit(s: AppState): HabitDef | undefined {
  const live = alive(s.habits)
  return live.find((h) => h.steps?.some((x) => x.flow)) ?? live.find((h) => h.id === 'hb-night')
}

/** לאיזה חלון שייך שלב בהרגל */
export function stageOfStep(st: HabitStep): number {
  return st.flow ? FLOW_STAGE[st.flow] : 2
}

/** החלון הראשון שעוד לא נסגר היום */
export function resumeStage(s: AppState, date: ISODate): number {
  const h = nightHabit(s)
  const log = dayLog(s, date)
  if (!h?.steps?.length) return 0
  for (let i = 0; i < NIGHT_STAGES.length; i++) {
    const own = h.steps.filter((x) => stageOfStep(x) === i)
    if (own.some((x) => !log.steps[x.id])) return i
  }
  return NIGHT_STAGES.length - 1
}

/** מסמן את השלבים של חלון, ואם כל השלבים סגורים — גם את ההרגל עצמו */
function closeStage(date: ISODate, stage: number) {
  const h = nightHabit(store.get())
  if (!h) return
  for (const st of h.steps ?? []) if (st.flow && stageOfStep(st) === stage) actions.setStep(date, st.id, true)
  syncHabit(date, h)
}

function syncHabit(date: ISODate, h: HabitDef) {
  const steps = h.steps ?? []
  const log = dayLog(store.get(), date)
  if (steps.length && steps.every((x) => log.steps[x.id]) && !log.habits[h.id]) actions.setHabit(date, h.id, true)
}

/**
 * החלון הפנוי הראשון ביום, בקפיצות של רבע שעה. בלוקים של עבודה עמוקה לא
 * חוסמים — בשבילם בדיוק משבצים משימה.
 */
export function freeSlot(s: AppState, date: ISODate, minutes: number, fromMin: number): number {
  const busy = eventsOn(s, date)
    .filter((e) => !e.allDay && e.start && e.end && !e.deep)
    .map((e) => [timeToMinutes(e.start!), timeToMinutes(e.end!)] as const)
  const last = 23 * 60 - minutes
  for (let m = Math.ceil(fromMin / 15) * 15; m <= last; m += 15) {
    if (!busy.some(([a, b]) => m < b && m + minutes > a)) return m
  }
  return Math.max(0, Math.min(fromMin, last))
}

// ---------------------------------------------------------------------------
/** יושב פעם אחת ב-Shell ומצייר את השגרה כשמישהו פתח אותה */
export function NightHost() {
  const stage = useNightStage()
  // היום הלוגי ננעל בפתיחה — שגרה שנגמרת אחרי 03:30 עדיין שייכת לערב שבו התחילה
  const [date, setDate] = useState<ISODate | null>(null)
  useEffect(() => {
    setDate(stage === null ? null : todayISO())
  }, [stage === null])
  if (stage === null || !date) return null
  return <NightFlow date={date} initial={stage} onClose={closeNight} />
}

export default function NightFlow({ date, initial, onClose }: { date: ISODate; initial: number; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const tomorrow = addDays(date, 1)
  const habit = nightHabit(s)
  const [step, setStep] = useState(() => (initial >= 0 ? initial : resumeStage(store.get(), date)))
  const bodyRef = useRef<HTMLDivElement>(null)

  // הטקסט נשמר תוך כדי כתיבה (בהשהיה קצרה) — סגירת האפליקציה באמצע לא מוחקת פסקה
  const [text, setText] = useState(() => dayLog(store.get(), date).journal ?? '')
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    const t = window.setTimeout(() => actions.setJournal(date, text), 600)
    return () => window.clearTimeout(t)
  }, [text, date])
  useEffect(() => () => actions.setJournal(date, textRef.current), [date])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [step])

  // נעילת גלילה מאחורי המסך המלא (כמו המעבר השבועי)
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const y = window.scrollY
    return () => {
      document.documentElement.style.overflow = prev
      if (window.scrollY !== y) window.scrollTo(0, y)
    }
  }, [])

  const next = () => {
    if (step === 0) {
      actions.setJournal(date, text)
      if (text.trim()) closeStage(date, 0)
    }
    if (step === 1) closeStage(date, 1)
    setStep((x) => Math.min(NIGHT_STAGES.length - 1, x + 1))
  }

  const finish = () => {
    actions.setJournal(date, text)
    if (text.trim()) closeStage(date, 0)
    closeStage(date, 3)
    if (habit) actions.setHabit(date, habit.id, true, { nightAt: Date.now() })
    else actions.patchDay(date, { nightAt: Date.now() })
    vibrate([30, 50, 30])
    toast('לילה טוב 🌙')
    onClose()
  }

  return (
    <div className="flow night" role="dialog" aria-modal="true" aria-label="שגרת ערב">
      <div className="flow-head">
        <div className="spread">
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>🌙 {NIGHT_STAGES[step]}</b>
            <div className="tiny faint">
              שגרת ערב · {niceDate(date)} · חלון{' '}
              <span className="ltr">{step + 1}/{NIGHT_STAGES.length}</span>
            </div>
          </div>
          <button className="btn ghost sm" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="steps" aria-hidden>
          {NIGHT_STAGES.map((x, i) => (
            <i key={x} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="flow-body" ref={bodyRef}>
        <div className="stack narrow" style={{ margin: '0 auto', maxWidth: 680 }}>
          {step === 0 && <JournalStage date={date} text={text} setText={setText} />}
          {step === 1 && <PlanStage date={tomorrow} />}
          {step === 2 && <ChecklistStage date={date} habit={habit} />}
          {step === 3 && <SleepStage date={date} tomorrow={tomorrow} />}
        </div>
      </div>

      <div className="flow-foot">
        {step > 0 && (
          <button className="btn" onClick={() => setStep((x) => x - 1)}>
            חזרה
          </button>
        )}
        <span className="grow" />
        {step < NIGHT_STAGES.length - 1 ? (
          <button className="btn primary" style={{ minWidth: 130 }} onClick={next}>
            {step === 0 && !text.trim() ? 'דלג ←' : 'הבא ←'}
          </button>
        ) : (
          <button className="btn primary" style={{ minWidth: 150 }} onClick={finish}>
            🌙 לילה טוב
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. היום שהיה
// ---------------------------------------------------------------------------
function JournalStage({ date, text, setText }: { date: ISODate; text: string; setText: (v: string) => void }) {
  const s = useApp()
  const log = dayLog(s, date)
  const minutes = minutesOn(s, date)
  const doneTasks = alive(s.tasks).filter((t) => t.status === 'done' && t.due === date).length
  const habits = alive(s.habits)
  const habitsDone = habits.filter((h) => log.habits[h.id]).length
  const workout = (s.workouts ?? []).find((w) => !w.deleted && w.date === date && w.finishedAt)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        פסקה חופשית על היום, מכל הבחינות: מה עשית, איך הרגשת, מה חשבת שחשוב לזכור. בלי לסדר —
        רק לכתוב.
      </p>
      {/* מה המערכת כבר יודעת על היום — עוגן לזיכרון, לא ציון */}
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="chip">⏱ <span className="ltr">{minutesToHM(minutes)}</span> ריכוז</span>
        <span className="chip">✓ {plural(doneTasks, 'משימה אחת נסגרה', 'משימות נסגרו')}</span>
        <span className="chip">
          הרגלים <span className="ltr">{habitsDone}/{habits.length}</span>
        </span>
        {workout && <span className="chip">🏃 {workout.title}</span>}
      </div>
      <textarea
        className="textarea journal"
        aria-label="איך היה היום"
        autoFocus
        dir="auto"
        value={text}
        placeholder={'איך הלך היום?\nמה עשיתי, איך הרגשתי, מה היה חשוב, מה חשבתי…'}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="tiny faint">
        {words ? `${words} מילים · ` : ''}נשמר אוטומטית ביומן של היום, ומופיע ביומן ובסקירה השבועית.
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 2. בונים את מחר
// ---------------------------------------------------------------------------
function PlanStage({ date }: { date: ISODate }) {
  const s = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [creating, setCreating] = useState<Partial<CalEvent> | null>(null)
  const [scheduling, setScheduling] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [q, setQ] = useState('')

  const cap = dayCapacity(s, date)
  const planned = plannedOn(s, date)
  const wakeMin = timeToMinutes(s.settings.wakeTime || '07:30')
  const ws = weekStart(date)
  const tokenMin = s.settings.tokenMinutes || 90

  const forTomorrow = alive(s.tasks)
    .filter((t) => t.due === date && t.status !== 'done')
    .sort((a, b) => Number(b.critical ?? false) - Number(a.critical ?? false) || a.order - b.order)
  const open = useMemo(
    () =>
      alive(s.tasks)
        .filter((t) => t.status !== 'done' && t.due !== date)
        .sort(
          (a, b) =>
            Number(b.critical ?? false) - Number(a.critical ?? false) ||
            (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
            a.order - b.order,
        ),
    [s.tasks, date],
  )
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)
  const groups = [
    ...tracks.map((tr) => [tr, open.filter((t) => t.trackId === tr.id)] as const),
    [undefined, open.filter((t) => !tracks.some((tr) => tr.id === t.trackId))] as const,
  ].filter(([, list]) => list.length)

  // שיבוץ משימה: אירוע חדש ביומן של מחר בחלון הפנוי הראשון, באורך ההערכה שלה
  const schedule = (t: Task) => {
    const dur = Math.min(180, Math.max(30, (t.est ?? 1) * tokenMin))
    const st = freeSlot(s, date, dur, wakeMin + 60)
    setScheduling(t)
    setCreating({
      date,
      title: t.title,
      trackId: t.trackId,
      start: minutesToTime(st),
      end: minutesToTime(Math.min(st + dur, 24 * 60 - 1)),
      allDay: false,
      kind: 'block',
    })
  }

  const newEvent = (start: string) =>
    setCreating({
      date,
      start,
      end: minutesToTime(Math.min(timeToMinutes(start) + 60, 24 * 60 - 1)),
      allDay: false,
      kind: 'personal',
    })

  const taskRow = (t: Task, picked: boolean) => {
    const tr = trackById(s, t.trackId)
    const meta = [
      !picked && t.due ? (t.due < date ? `באיחור מ-${shortDate(t.due)}` : `עד ${shortDate(t.due)}`) : '',
      t.status !== 'todo' ? STATUS_LABEL[t.status] : '',
      t.est ? plural(t.est, 'אסימון אחד', 'אסימונים') : '',
    ].filter(Boolean)
    return (
      <div className="item" key={t.id} style={{ minHeight: 44 }}>
        <span className="dot" style={{ background: tr?.color ?? 'var(--line)' }} />
        <button
          className="txt"
          style={{ background: 'none', border: 0, textAlign: 'start', padding: '3px 0' }}
          onClick={() => setEditTask(t)}
        >
          <div className="ttl clamp2">
            {t.critical ? '🔥 ' : ''}
            {t.title}
          </div>
          {meta.length > 0 && <div className="sub2">{meta.join(' · ')}</div>}
        </button>
        <div className="row" style={{ gap: 4, flexShrink: 0 }}>
          <button className="btn xs" onClick={() => schedule(t)} aria-label={`לשבץ ביומן: ${t.title}`}>
            שבץ
          </button>
          {picked ? (
            <button
              className="btn xs ghost"
              aria-label={`להוציא ממחר: ${t.title}`}
              onClick={() => {
                actions.patchTask(t.id, { due: undefined })
                vibrate()
              }}
            >
              ✕
            </button>
          ) : (
            <button
              className="btn xs"
              aria-label={`למחר: ${t.title}`}
              onClick={() => {
                const prev = t.due
                actions.patchTask(t.id, { due: date })
                vibrate()
                toast('נוספה למחר', { label: 'ביטול', run: () => actions.patchTask(t.id, { due: prev }) })
              }}
            >
              + מחר
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="spread" style={{ flexWrap: 'wrap', rowGap: 6 }}>
        <div>
          <b style={{ fontSize: 16 }}>{niceDate(date)}</b>
          <div className="tiny faint">
            קימה <span className="ltr">{s.settings.wakeTime}</span> · קיבולת <span className="ltr">{cap}</span> אסימונים
            {planned > 0 && (
              <>
                {' · מתוכנן '}
                <span className="ltr" style={planned > cap ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>
                  {planned}
                </span>
              </>
            )}
          </div>
        </div>
        <button className="btn sm" onClick={() => newEvent(minutesToTime(freeSlot(s, date, 60, wakeMin + 60)))}>
          + אירוע
        </button>
      </div>
      <div className="tiny faint" style={{ marginTop: -4 }}>
        נגיעה בשעה ריקה יוצרת אירוע, נגיעה באירוע עורכת, גרירה מזיזה. זה היומן עצמו — מה שנבנה כאן כבר בפנים.
      </div>

      <HourGrid dates={[date]} scrollToMin={wakeMin} onOpen={setEditing} onNew={(_, start) => newEvent(start)} />

      <div className="card">
        <div className="card-h">
          <b>המשימות של מחר</b>
          <span className="tiny faint ltr">{forTomorrow.length}</span>
        </div>
        <div className="list">
          {forTomorrow.length === 0 && (
            <div className="empty">עוד לא נבחרו משימות. "+ מחר" מהרשימה למטה, או לכתוב חדשה.</div>
          )}
          {forTomorrow.map((t) => taskRow(t, true))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line-soft)' }}>
          <input
            className="input"
            placeholder="+ משימה חדשה למחר…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q.trim()) {
                actions.addTask({ title: q.trim(), due: date })
                setQ('')
              }
            }}
          />
        </div>
      </div>

      <GoalsCard ws={ws} title="מטרות־העל של השבוע" />
      {!(s.weeks.find((w) => w.weekStart === ws && !w.deleted)?.goals ?? []).length && (
        <div className="card rail alert" style={{ ['--rail' as any]: 'var(--line)' }}>
          <div className="txt">
            <b>אין מטרות־על לשבוע הזה</b>
            <div className="tiny faint">הן נקבעות במעבר השבועי (סקירה), ומופיעות כאן כדי שמחר ישרת אותן.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div>
            <b>כל המשימות הפתוחות</b>
            <div className="tiny faint">"+ מחר" מוסיף לרשימה של מחר · "שבץ" קובע לה שעה ביומן</div>
          </div>
          <span className="tiny faint ltr">{open.length}</span>
        </div>
        {open.length === 0 && <div className="empty">אין משימות פתוחות. יום נקי.</div>}
        {groups.map(([tr, list]) => (
          <div key={tr?.id ?? 'none'}>
            <div className="section-title" style={{ padding: '8px 12px 2px' }}>
              {tr ? `${tr.emoji} ${tr.name}` : 'ללא מסלול'}
            </div>
            <div className="list">{list.map((t) => taskRow(t, false))}</div>
          </div>
        ))}
      </div>

      <EventSheet ev={editing} onClose={() => setEditing(null)} />
      <EventSheet
        ev={creating as CalEvent | null}
        isNew
        onClose={() => {
          setCreating(null)
          setScheduling(null)
        }}
        onSaved={() => {
          // משימה ששובצה ביומן של מחר היא משימה של מחר
          if (scheduling && scheduling.due !== date) actions.patchTask(scheduling.id, { due: date })
        }}
      />
      <TaskSheet task={editTask} onClose={() => setEditTask(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// 3. לסדר ולצחצח
// ---------------------------------------------------------------------------
function ChecklistStage({ date, habit }: { date: ISODate; habit?: HabitDef }) {
  const s = useApp()
  const log = dayLog(s, date)
  const items = (habit?.steps ?? []).filter((x) => !x.flow)
  const done = items.filter((x) => log.steps[x.id]).length

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        קמים מהמסך. כל מה שכאן — בידיים, לא בראש.
      </p>
      <div className="card">
        <div className="card-h">
          <b>הצ׳קליסט</b>
          <span className="tiny faint ltr">
            {done}/{items.length}
          </span>
        </div>
        <div className="list">
          {items.length === 0 && (
            <div className="empty">אין פריטים. מוסיפים בהגדרות ← הרגלים יומיים ← שגרת ערב.</div>
          )}
          {items.map((st) => {
            const on = !!log.steps[st.id]
            const toggle = () => {
              actions.toggleStep(date, st.id)
              vibrate()
              if (habit) syncHabit(date, habit)
            }
            return (
              <div className="item night-check" key={st.id}>
                <Check on={on} onClick={toggle} />
                <button
                  className="txt"
                  style={{ background: 'none', border: 0, textAlign: 'start', padding: '6px 0', minHeight: 44 }}
                  onClick={toggle}
                >
                  <div
                    className="ttl"
                    style={{ fontSize: 17, textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--text-faint)' : undefined }}
                  >
                    {st.text}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {items.length > 0 && done === items.length && <div className="ins good"><b>הכל סגור.</b> נשאר רק דבר אחד.</div>}
    </>
  )
}

// ---------------------------------------------------------------------------
// 4. לקרוא ולישון
// ---------------------------------------------------------------------------
function SleepStage({ date, tomorrow }: { date: ISODate; tomorrow: ISODate }) {
  const s = useApp()
  const tasks = alive(s.tasks).filter((t) => t.due === tomorrow && t.status !== 'done').length
  const first = eventsOn(s, tomorrow)
    .filter((e) => !e.allDay && e.start)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))[0]
  const wrote = !!dayLog(s, date).journal?.trim()

  return (
    <div className="night-end">
      <div className="night-moon" aria-hidden>
        📖
      </div>
      <h2>יאללה — לך לקרוא ולישון</h2>
      <div className="night-pages">
        מינימום <b className="ltr">5</b> עמודים!
      </div>
      <div className="card" style={{ textAlign: 'start', width: '100%', maxWidth: 440 }}>
        <div className="list">
          <div className="item">
            <div className="txt">
              <div className="sub2">מחר</div>
              <div className="ttl">{niceDate(tomorrow)}</div>
            </div>
          </div>
          <div className="item">
            <div className="txt">
              <div className="sub2">קימה</div>
              <div className="ttl ltr" style={{ textAlign: 'start' }}>{s.settings.wakeTime}</div>
            </div>
          </div>
          {first && (
            <div className="item">
              <div className="txt">
                <div className="sub2">הדבר הראשון ביומן</div>
                <div className="ttl">
                  <span className="ltr">{first.start}</span> · {first.title}
                </div>
              </div>
            </div>
          )}
          <div className="item">
            <div className="txt">
              <div className="sub2">משימות שמחכות</div>
              <div className="ttl">{tasks ? plural(tasks, 'משימה אחת', 'משימות') : 'עוד לא נבחרו'}</div>
            </div>
          </div>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {wrote ? 'היום כתוב, מחר בנוי. ' : ''}המסך נסגר, הספר נפתח. לילה טוב.
      </p>
    </div>
  )
}

/** כמה חלונות נסגרו הערב — לכרטיס במסך היום */
export function nightProgress(s: AppState, date: ISODate): { done: number; total: number; finished: boolean } {
  const h = nightHabit(s)
  const log = dayLog(s, date)
  const steps = h?.steps ?? []
  return {
    done: steps.filter((x) => log.steps[x.id]).length,
    total: steps.length,
    finished: !!(h && log.habits[h.id]) || !!log.nightAt,
  }
}

