import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  actions, alive, bestSet, exerciseHistory, lastSetsOf, setScore, uid, useApp,
  workoutDayOn, workoutHasData, workoutOn,
} from '../store'
import {
  HE_DAYS, HE_DAYS_SHORT, dow, minutesToHM, niceDate, plural, shortDate,
  today as todayISO, weekDates, weekStart,
} from '../dates'
import { Confirm, useToast, vibrate } from '../ui'
import type { Exercise, ExMetric, ID, RunTarget, SetLog, WorkoutDay, WorkoutKind, WorkoutLog } from '../types'
import { WORKOUT_KIND_LABEL } from '../types'
import { exerciseTutorial, gradePace, paceText, parsePaceRange } from '../skills'

// ---------------------------------------------------------------------------
// אימונים — הגיליונות.
//
// שלושה גיליונות על אותו מודל: רישום האימון של היום, התוכנית השבועית,
// וההתקדמות לאורך זמן. כולם נפתחים מעמוד האימונים (`Workouts.tsx`), שהוא
// המקום היחיד שבו אימונים מופיעים. העריכה לא יושבת במסך נפרד — לוחצים
// "עריכה" בדיוק במקום שבו מסתכלים על האימון.
// ---------------------------------------------------------------------------

export const KIND_EMOJI: Record<WorkoutKind, string> = {
  gym: '🏋️',
  run: '🏃',
  walk: '🚶',
  home: '🤸',
  rest: '😌',
}

const METRIC_LABEL: Record<ExMetric, string> = {
  weight: 'משקל',
  bodyweight: 'משקל גוף',
  time: 'זמן',
  reps: 'חזרות',
}

/** "40×8" · "גוף×8" · "45 שנ׳" — קצר מספיק כדי לשבת בצ׳יפ */
export function setText(v: SetLog | undefined, metric: ExMetric): string {
  if (!v || (!v.kg && !v.reps && !v.sec)) return '—'
  if (metric === 'time') return `${v.sec ?? 0} שנ׳`
  if (metric === 'reps') return `${v.reps ?? 0}`
  if (metric === 'bodyweight') return v.kg ? `+${v.kg}×${v.reps ?? 0}` : `גוף×${v.reps ?? 0}`
  return `${v.kg ?? 0}×${v.reps ?? 0}`
}

function setsText(sets: SetLog[] | undefined, metric: ExMetric): string {
  if (!sets?.length) return ''
  return sets.map((x) => setText(x, metric)).join(' · ')
}

/** נועל את הגלילה של הדף מאחורי מסך מלא */
function useLockScroll() {
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
      document.body.style.overflow = ''
    }
  }, [])
}

// ---------------------------------------------------------------------------
// מסך האימון — רישום, ועריכה באותו מקום
// ---------------------------------------------------------------------------
export function WorkoutSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [edit, setEdit] = useState(false)
  const [pick, setPick] = useState(false)
  useLockScroll()

  const log = workoutOn(s, date)
  const plan = alive(s.workoutPlan ?? []).sort((a, b) => a.dow - b.dow)
  // האימון של היום, או זה שנבחר ידנית אם עשית משהו אחר
  const day = workoutDayOn(s, date)

  // ההצמדה בין יומן האימון לתוכנית נעשית כשנוגעים בו לראשונה
  const ensure = (d?: WorkoutDay) => {
    const t = d ?? day
    if (!t) return
    if (log?.dayId === t.id && log.title === t.title) return
    actions.patchWorkout(date, { dayId: t.id, title: t.title, kind: t.kind })
  }

  const finish = () => {
    ensure()
    actions.patchWorkout(date, { finishedAt: Date.now() })
    // סימון ההרגל "אימון" של אותו יום — כדי שלא צריך לסמן פעמיים.
    // אם ההרגל נמחק, היום עדיין מסומן כיום אימון — הרישום ביומן לא תלוי בהרגל.
    const w = day?.kind === 'run' || day?.kind === 'walk' ? 'run' : 'strength'
    const hb = alive(s.habits).find((h) => h.special === 'workout')
    if (hb) actions.setHabit(date, hb.id, true, { workout: w })
    else actions.patchDay(date, { workout: w })
    vibrate([30, 50, 30])
    toast('האימון נשמר')
    onClose()
  }

  return (
    <div className="flow" role="dialog" aria-modal="true" aria-label="אימון">
      <div className="flow-head">
        <div className="spread">
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>
              {KIND_EMOJI[day?.kind ?? 'rest']} {day?.title ?? 'אימון'}
            </b>
            <div className="tiny faint">
              {niceDate(date)}
              {day?.focus ? ` · ${day.focus}` : ''}
            </div>
          </div>
          {day && (
            <button
              className={`btn sm${edit ? ' primary' : ' ghost'}`}
              onClick={() => setEdit((v) => !v)}
              aria-pressed={edit}
            >
              {edit ? 'סיום עריכה' : 'עריכה'}
            </button>
          )}
          <button className="btn ghost sm" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="flow-body">
        <div className="stack narrow" style={{ margin: '0 auto', maxWidth: 640 }}>
          {!day && (
            <div className="card pad">
              <b>אין אימון מתוכנן ליום הזה</b>
              <div className="tiny faint" style={{ margin: '4px 0 10px' }}>
                אפשר לבחור אימון אחר מהתוכנית, או להוסיף יום חדש במסך התוכנית.
              </div>
              <button className="btn sm" onClick={() => setPick(true)}>
                בחירת אימון
              </button>
            </div>
          )}

          {(day || pick) && (
            <>
              {day && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button className="btn xs ghost" onClick={() => setPick((v) => !v)}>
                    עשיתי אימון אחר
                  </button>
                  {log?.finishedAt && <span className="chip on">✓ נשמר</span>}
                </div>
              )}

              {pick && (
                <div className="card pad">
                  <div className="tiny faint" style={{ marginBottom: 8 }}>
                    בחר את האימון שבאמת עשית היום:
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {plan.map((d) => (
                      <button
                        key={d.id}
                        className={`tag${d.id === day?.id ? ' on' : ''}`}
                        style={d.id === day?.id ? { background: 'var(--accent)' } : undefined}
                        onClick={() => {
                          ensure(d)
                          setPick(false)
                        }}
                      >
                        {KIND_EMOJI[d.kind]} {HE_DAYS_SHORT[d.dow]} · {d.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {day && (
            <>
              {(day.kind === 'run' || day.kind === 'walk') && (
                <CardioCard date={date} day={day} log={log} onTouch={() => ensure()} />
              )}

              {edit ? (
                <ExerciseEditor day={day} />
              ) : (
                day.exercises.map((ex) => (
                  <ExerciseCard key={ex.id} date={date} ex={ex} log={log} onTouch={() => ensure()} />
                ))
              )}

              {!edit && day.exercises.length === 0 && day.kind !== 'run' && day.kind !== 'walk' && (
                <div className="card pad">
                  <div className="empty" style={{ padding: '8px 0' }}>
                    אין תרגילים ביום הזה.
                  </div>
                  <button className="btn sm block" onClick={() => setEdit(true)}>
                    הוספת תרגילים
                  </button>
                </div>
              )}

              <div className="card pad">
                <div className="section-title" style={{ marginBottom: 6 }}>איך זה הרגיש</div>
                <textarea
                  className="textarea"
                  style={{ minHeight: 60 }}
                  value={log?.note ?? ''}
                  placeholder="כאב, אנרגיה, מה לשנות בפעם הבאה…"
                  onChange={(e) => {
                    ensure()
                    actions.patchWorkout(date, { note: e.target.value })
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flow-foot">
        <button className="btn" onClick={onClose}>
          סגירה
        </button>
        <span className="grow" />
        {day && (
          <button className="btn primary" style={{ minWidth: 130 }} onClick={finish}>
            {log?.finishedAt ? '✓ עדכון' : '✓ סיימתי'}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function CardioCard({
  date,
  day,
  log,
  onTouch,
}: {
  date: string
  day: WorkoutDay
  log?: WorkoutLog
  onTouch: () => void
}) {
  const s = useApp()
  const km = log?.km ?? 0
  const min = log?.minutes ?? 0
  const pace = km > 0 && min > 0 ? min / km : 0
  const paceLabel = pace ? `${paceText(pace)} לק״מ` : ''

  // היעד של היום, ומה חסר עד אליו
  const target = day.target
  const range = parsePaceRange(target?.pace)
  const grade = pace && range ? gradePace(pace, range) : null
  const leftKm = target?.km ? Math.round((target.km - km) * 10) / 10 : 0
  const leftMin = target?.minutes ? Math.round(target.minutes - min) : 0

  // הריצה הקודמת — כדי לדעת מול מה אתה מתמודד
  const prev = (s.workouts ?? [])
    .filter(
      (w) => !w.deleted && w.date < date && (w.kind === 'run' || w.kind === 'walk') && (w.km || w.minutes),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop()

  const set = (p: Partial<WorkoutLog>) => {
    onTouch()
    actions.patchWorkout(date, p)
  }

  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 10 }}>
        <b>{day.kind === 'run' ? 'הריצה' : 'ההליכה'}</b>
        {prev && (
          <span className="tiny faint">
            קודם: {prev.km ? `${prev.km} ק״מ` : ''}
            {prev.minutes ? ` · ${prev.minutes} דק׳` : ''}
          </span>
        )}
      </div>

      {/* היעד לפני השדות — זה מה שצריך לדעת לפני שיוצאים, לא אחרי */}
      {targetText(target) && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '9px 11px',
            marginBottom: 12,
            background: 'var(--bg-sunk)',
          }}
        >
          <div className="tiny faint" style={{ fontWeight: 700 }}>היעד היום</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{targetText(target)}</div>
          {target?.how && (
            <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 4 }}>{target.how}</div>
          )}
        </div>
      )}

      {day.kind === 'run' && (
        <Stepper
          label="קילומטרים"
          value={km}
          step={0.5}
          min={0}
          max={60}
          decimals={1}
          onChange={(v) => set({ km: v })}
        />
      )}
      <div style={{ height: 10 }} />
      <Stepper
        label="דקות"
        value={min}
        step={5}
        min={0}
        max={400}
        onChange={(v) => set({ minutes: v })}
      />

      {paceLabel && (
        <div className="tiny" style={{ marginTop: 10, color: 'var(--accent)', fontWeight: 700 }}>
          קצב ממוצע: <span className="ltr">{paceLabel}</span>
        </div>
      )}

      {/* מול היעד — רק כשכבר יש מה להשוות */}
      {target && (km > 0 || min > 0) && (
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {!!target.km && (
            <span className={`chip${leftKm <= 0 ? ' on' : ''}`}>
              {leftKm <= 0 ? '✓ המרחק נסגר' : `נשאר ${leftKm} ק״מ`}
            </span>
          )}
          {!target.km && !!target.minutes && (
            <span className={`chip${leftMin <= 0 ? ' on' : ''}`}>
              {leftMin <= 0 ? '✓ הזמן נסגר' : `נשארו ${leftMin} דק׳`}
            </span>
          )}
          {grade && (
            <span className="chip" style={{ color: `var(--${grade === 'in' ? 'good' : 'warn'}-text)` }}>
              {grade === 'in'
                ? '✓ בטווח הקצב'
                : grade === 'fast'
                  ? `מהר מדי — היעד ${paceText(range![0])} ומעלה`
                  : `איטי מהיעד — עד ${paceText(range![1])}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** היעד בשורה אחת: "6 ק״מ · קצב 6:40-7:10 לק״מ" */
export function targetText(t?: RunTarget): string {
  if (!t) return ''
  const parts: string[] = []
  if (t.km) parts.push(`${t.km} ק״מ`)
  if (t.minutes) parts.push(`${t.minutes} דק׳`)
  if (t.pace) parts.push(`קצב ${t.pace} לק״מ`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
/** עריכת היעד של יום אירובי — המספר שהריצה רצה אליו */
function TargetEditor({ day }: { day: WorkoutDay }) {
  const t = day.target ?? {}
  const set = (p: Partial<RunTarget>) => {
    const next = { ...t, ...p }
    // יעד ריק נמחק, כדי שלא יישאר שדה מת בתוכנית
    const empty = !next.km && !next.minutes && !next.pace && !next.how
    actions.patchWorkoutDay(day.id, { target: empty ? undefined : next })
  }
  const num = (v: string, max: number) => {
    const n = Number(v.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.min(max, n) : undefined
  }

  return (
    <div className="card pad" style={{ marginBottom: 10 }}>
      <div className="section-title" style={{ marginBottom: 6 }}>היעד של הריצה</div>
      <div className="tiny faint" style={{ marginBottom: 8 }}>
        מה שמופיע במסך האימון לפני שיוצאים. אפשר מרחק, זמן, או שניהם.
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="field grow">
          <span>ק״מ</span>
          <input
            className="input ltr"
            inputMode="decimal"
            value={t.km ?? ''}
            placeholder="6"
            onChange={(e) => set({ km: num(e.target.value, 60) })}
          />
        </label>
        <label className="field grow">
          <span>דקות</span>
          <input
            className="input ltr"
            inputMode="numeric"
            value={t.minutes ?? ''}
            placeholder="35"
            onChange={(e) => set({ minutes: num(e.target.value, 400) })}
          />
        </label>
      </div>
      <label className="field" style={{ marginBottom: 8 }}>
        <span>קצב לק״מ</span>
        <input
          className="input ltr"
          value={t.pace ?? ''}
          placeholder="6:40-7:10"
          onChange={(e) => set({ pace: e.target.value.trim() || undefined })}
        />
      </label>
      <label className="field">
        <span>מה עושים בריצה הזו</span>
        <input
          className="input"
          value={t.how ?? ''}
          placeholder="קל לאורך כולה, ובסוף 6 האצות של 20 שניות"
          onChange={(e) => set({ how: e.target.value || undefined })}
        />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// תרגיל אחד — הצ׳יפים הם הסטים, ולחיצה עליהם פותחת עורך במקום
// ---------------------------------------------------------------------------
function ExerciseCard({
  date,
  ex,
  log,
  onTouch,
}: {
  date: string
  ex: Exercise
  log?: WorkoutLog
  onTouch: () => void
}) {
  const s = useApp()
  const [editing, setEditing] = useState<number | null>(null)
  const done = log?.sets?.[ex.id] ?? []
  const planned = Math.max(ex.sets ?? 3, done.length)
  const last = useMemo(() => lastSetsOf(s, ex.id, date), [s.workouts, ex.id, date])

  const write = (i: number, v: SetLog | null) => {
    onTouch()
    actions.setWorkoutSet(date, ex.id, i, v)
  }

  /** ברירת מחדל לסט חדש: מה שכתבת בסט הקודם, אחרת מה שעשית בפעם שעברה */
  const seed = (i: number): SetLog => {
    const before = done[i - 1]
    if (before && (before.kg || before.reps || before.sec)) return { ...before }
    const l = last?.sets?.[i] ?? last?.sets?.[0]
    if (l) return { ...l }
    return ex.metric === 'time' ? { sec: 20 } : { kg: 0, reps: 8 }
  }

  const filled = done.filter((x) => x && (x.kg || x.reps || x.sec)).length

  return (
    <div className="card pad">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{ex.name}</b>
          {ex.home && <span className="chip" style={{ marginInlineStart: 6 }}>בבית, לפני</span>}
          <div className="tiny faint">
            {ex.sets ? `${ex.sets} סטים` : ''}
            {ex.reps ? ` · ${ex.reps} חזרות` : ''}
            {ex.metric === 'bodyweight' ? ' · משקל גוף' : ''}
            {ex.rest ? ` · הפסקה ${ex.rest} שנ׳` : ''}
          </div>
        </div>
        <span className="tiny faint ltr" style={{ flexShrink: 0 }}>
          {filled}/{ex.sets ?? planned}
        </span>
      </div>

      {/* דגשי ביצוע לפני ההערה — זה מה שקוראים בזמן שנושמים בין סטים */}
      {ex.cues && (
        <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 6 }}>
          <b>דגשים: </b>
          {ex.cues}
        </div>
      )}
      {ex.note && <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 6 }}>{ex.note}</div>}
      {/* לכל תרגיל יש קישור: השמור ידנית, ואם אין — חיפוש יוטיוב לפי השם */}
      <a
        className="btn xs ghost"
        style={{ marginTop: 8 }}
        href={exerciseTutorial(ex)}
        target="_blank"
        rel="noreferrer"
      >
        איך עושים את זה
      </a>

      {last && (
        <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
          <span className="tiny faint">
            <span className="ltr">{shortDate(last.date)}</span>: {setsText(last.sets, ex.metric)}
          </span>
          <button
            className="btn xs ghost"
            onClick={() => {
              onTouch()
              last.sets.forEach((v, i) => actions.setWorkoutSet(date, ex.id, i, { ...v }))
              vibrate()
            }}
          >
            ↺ כמו אז
          </button>
        </div>
      )}

      <div className="sets">
        {Array.from({ length: planned }, (_, i) => {
          const v = done[i]
          const has = !!v && !!(v.kg || v.reps || v.sec)
          return (
            <button
              key={i}
              className={`setchip${has ? ' on' : ''}${editing === i ? ' edit' : ''}`}
              onClick={() => {
                if (editing === i) return setEditing(null)
                if (!has) write(i, seed(i))
                setEditing(i)
              }}
            >
              <span className="n">{i + 1}</span>
              {setText(v, ex.metric)}
            </button>
          )
        })}
        <button
          className="setchip add"
          aria-label="סט נוסף"
          onClick={() => {
            const i = planned
            write(i, seed(i))
            setEditing(i)
          }}
        >
          ＋
        </button>
      </div>

      {editing !== null && (
        <SetEditor
          metric={ex.metric}
          value={done[editing] ?? {}}
          onChange={(v) => write(editing, v)}
          onDelete={() => {
            write(editing, null)
            setEditing(null)
          }}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SetEditor({
  metric,
  value,
  onChange,
  onDelete,
  onDone,
}: {
  metric: ExMetric
  value: SetLog
  onChange: (v: SetLog) => void
  onDelete: () => void
  onDone: () => void
}) {
  return (
    <div className="set-edit">
      {metric === 'time' ? (
        <Stepper
          label="שניות"
          value={value.sec ?? 0}
          step={5}
          min={0}
          max={600}
          onChange={(v) => onChange({ ...value, sec: v })}
        />
      ) : (
        <>
          {metric !== 'reps' && (
            <Stepper
              label={metric === 'bodyweight' ? 'תוספת ק״ג' : 'ק״ג'}
              value={value.kg ?? 0}
              step={2.5}
              min={0}
              max={400}
              decimals={1}
              zeroLabel={metric === 'bodyweight' ? 'משקל גוף' : undefined}
              onChange={(v) => onChange({ ...value, kg: v })}
            />
          )}
          <Stepper
            label="חזרות"
            value={value.reps ?? 0}
            step={1}
            min={0}
            max={100}
            onChange={(v) => onChange({ ...value, reps: v })}
          />
        </>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm primary grow" onClick={onDone}>
          ✓ אישור
        </button>
        <button className="btn sm danger" onClick={onDelete}>
          מחיקת הסט
        </button>
      </div>
    </div>
  )
}

/** מד עם − ו־+ גדולים — מה שאפשר להפעיל באצבע אחת בחדר כושר */
function Stepper({
  label,
  value,
  step,
  min = 0,
  max = 999,
  decimals = 0,
  zeroLabel,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  decimals?: number
  zeroLabel?: string
  onChange: (v: number) => void
}) {
  const fmt = (n: number) => (decimals ? Number(n.toFixed(decimals)).toString() : String(Math.round(n)))
  const bump = (d: number) => {
    const next = Math.min(max, Math.max(min, Number((value + d * step).toFixed(2))))
    onChange(next)
    vibrate(8)
  }
  return (
    <div className="stepper">
      <span className="lbl">{label}</span>
      <button className="pm" aria-label={`הפחתת ${label}`} onClick={() => bump(-1)}>
        −
      </button>
      <span className="val ltr">{value === 0 && zeroLabel ? zeroLabel : fmt(value)}</span>
      <button className="pm" aria-label={`הוספת ${label}`} onClick={() => bump(1)}>
        +
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// עריכת התרגילים של יום — אותו רכיב משמש גם במסך האימון וגם במסך התוכנית
// ---------------------------------------------------------------------------
export function ExerciseEditor({ day }: { day: WorkoutDay }) {
  const [name, setName] = useState('')
  const [openEx, setOpenEx] = useState<ID | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const t = name.trim()
    if (!t) return
    const id = actions.addExercise(day.id, t, { metric: day.kind === 'home' ? 'reps' : 'weight' })
    setName('')
    setOpenEx(id)
    inputRef.current?.focus()
  }

  return (
    <div className="card">
      <div className="section-title" style={{ padding: '12px 13px 4px' }}>
        התרגילים של יום {HE_DAYS[day.dow]}
      </div>
      <div className="list">
        {day.exercises.map((ex, i) => (
          <React.Fragment key={ex.id}>
            <div className="item" style={{ gap: 6 }}>
              <div className="col-btns">
                <button
                  className="btn xs ghost"
                  aria-label="הזזה למעלה"
                  disabled={i === 0}
                  onClick={() => actions.moveExercise(day.id, ex.id, -1)}
                >
                  ▲
                </button>
                <button
                  className="btn xs ghost"
                  aria-label="הזזה למטה"
                  disabled={i === day.exercises.length - 1}
                  onClick={() => actions.moveExercise(day.id, ex.id, 1)}
                >
                  ▼
                </button>
              </div>
              <button
                className="txt"
                style={{ background: 'none', border: 0, textAlign: 'start', padding: '3px 0' }}
                onClick={() => setOpenEx(openEx === ex.id ? null : ex.id)}
              >
                <div className="ttl">{ex.name}</div>
                <div className="sub2">
                  {ex.sets ?? 3}×{ex.reps || '—'} · {METRIC_LABEL[ex.metric]}
                </div>
              </button>
              <button
                className="btn xs ghost"
                aria-label={`מחיקת ${ex.name}`}
                onClick={() => actions.deleteExercise(day.id, ex.id)}
              >
                ✕
              </button>
            </div>

            {openEx === ex.id && (
              <div style={{ padding: '4px 13px 12px' }}>
                <input
                  className="input"
                  value={ex.name}
                  style={{ marginBottom: 8 }}
                  onChange={(e) => actions.patchExercise(day.id, ex.id, { name: e.target.value })}
                />
                <div className="row" style={{ marginBottom: 8 }}>
                  <label className="field grow">
                    <span>סטים</span>
                    <input
                      className="input ltr"
                      inputMode="numeric"
                      value={ex.sets ?? ''}
                      onChange={(e) =>
                        actions.patchExercise(day.id, ex.id, {
                          sets: Math.max(1, Math.min(12, Number(e.target.value.replace(/\D/g, '')) || 1)),
                        })
                      }
                    />
                  </label>
                  <label className="field grow">
                    <span>חזרות</span>
                    <input
                      className="input"
                      value={ex.reps ?? ''}
                      placeholder="8-10"
                      onChange={(e) => actions.patchExercise(day.id, ex.id, { reps: e.target.value })}
                    />
                  </label>
                </div>
                <div className="tiny faint" style={{ fontWeight: 700, marginBottom: 4 }}>
                  איך מודדים
                </div>
                <div className="tag-scroll" style={{ marginBottom: 8 }}>
                  {(['weight', 'bodyweight', 'reps', 'time'] as ExMetric[]).map((m) => (
                    <button
                      key={m}
                      className={`tag${ex.metric === m ? ' on' : ''}`}
                      style={ex.metric === m ? { background: 'var(--accent)' } : undefined}
                      onClick={() => actions.patchExercise(day.id, ex.id, { metric: m })}
                    >
                      {METRIC_LABEL[m]}
                    </button>
                  ))}
                </div>
                <label className="field" style={{ marginBottom: 8 }}>
                  <span>הפסקה בין סטים (שניות)</span>
                  <input
                    className="input ltr"
                    inputMode="numeric"
                    value={ex.rest ?? ''}
                    placeholder="90"
                    onChange={(e) =>
                      actions.patchExercise(day.id, ex.id, {
                        rest: Math.max(0, Math.min(600, Number(e.target.value.replace(/\D/g, '')) || 0)) || undefined,
                      })
                    }
                  />
                </label>
                <input
                  className="input"
                  style={{ marginBottom: 8 }}
                  value={ex.cues ?? ''}
                  placeholder="דגשים — מה לשים לב אליו"
                  onChange={(e) => actions.patchExercise(day.id, ex.id, { cues: e.target.value })}
                />
                <input
                  className="input ltr"
                  style={{ marginBottom: 8 }}
                  value={ex.video ?? ''}
                  placeholder="קישור לטוטוריאל (ריק = חיפוש יוטיוב לפי השם)"
                  onChange={(e) => actions.patchExercise(day.id, ex.id, { video: e.target.value })}
                />
                <input
                  className="input"
                  value={ex.note ?? ''}
                  placeholder="הערה (לא חובה)"
                  onChange={(e) => actions.patchExercise(day.id, ex.id, { note: e.target.value })}
                />
              </div>
            )}
          </React.Fragment>
        ))}
        {day.exercises.length === 0 && <div className="empty">אין עדיין תרגילים.</div>}
      </div>

      <div className="row" style={{ padding: 10, borderTop: '1px solid var(--line-soft)' }}>
        <input
          ref={inputRef}
          className="input grow"
          value={name}
          placeholder="＋ תרגיל חדש — שם ו-Enter"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" disabled={!name.trim()} onClick={add}>
          הוספה
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// התוכנית השבועית
// ---------------------------------------------------------------------------
export function PlanSheet({ onClose }: { onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [openDay, setOpenDay] = useState<ID | null>(null)
  const [del, setDel] = useState<WorkoutDay | null>(null)
  useLockScroll()
  const plan = alive(s.workoutPlan ?? [])

  const addDay = (d: number) => {
    const day: WorkoutDay = {
      id: uid('wd'),
      updatedAt: Date.now(),
      dow: d,
      title: `אימון ${HE_DAYS[d]}`,
      kind: 'gym',
      exercises: [],
    }
    actions.upsertWorkoutDay(day)
    setOpenDay(day.id)
  }

  return (
    <div className="flow" role="dialog" aria-modal="true" aria-label="תוכנית האימונים">
      <div className="flow-head">
        <div className="spread">
          <div className="grow">
            <b style={{ fontSize: 16 }}>תוכנית האימונים</b>
            <div className="tiny faint">לחיצה על יום פותחת אותו לעריכה מלאה.</div>
          </div>
          <button className="btn ghost sm" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="flow-body">
        <div className="stack narrow" style={{ margin: '0 auto', maxWidth: 640 }}>
          {HE_DAYS.map((label, d) => {
            const day = plan.find((x) => x.dow === d)
            if (!day) {
              return (
                <button
                  key={d}
                  className="card pad"
                  style={{ textAlign: 'start', opacity: 0.75 }}
                  onClick={() => addDay(d)}
                >
                  <div className="spread">
                    <div>
                      <b>יום {label}</b>
                      <div className="tiny faint">אין אימון — לחיצה מוסיפה</div>
                    </div>
                    <span className="chip">＋</span>
                  </div>
                </button>
              )
            }
            const open = openDay === day.id
            return (
              <div className="card" key={day.id}>
                <button
                  className="spread"
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 0,
                    padding: '12px 13px',
                    textAlign: 'start',
                  }}
                  onClick={() => setOpenDay(open ? null : day.id)}
                >
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>
                      {KIND_EMOJI[day.kind]} יום {label} · {day.title}
                    </b>
                    <div className="tiny faint truncate">
                      {WORKOUT_KIND_LABEL[day.kind]}
                      {day.exercises.length
                        ? ` · ${plural(day.exercises.length, 'תרגיל אחד', 'תרגילים')}`
                        : ''}
                      {day.focus ? ` · ${day.focus}` : ''}
                    </div>
                  </div>
                  <span className="faint">{open ? '▾' : '◂'}</span>
                </button>

                {open && (
                  <div style={{ padding: '0 13px 12px' }}>
                    <label className="field" style={{ marginBottom: 8 }}>
                      <span>שם האימון</span>
                      <input
                        className="input"
                        value={day.title}
                        onChange={(e) => actions.patchWorkoutDay(day.id, { title: e.target.value })}
                      />
                    </label>
                    <div className="tiny faint" style={{ fontWeight: 700, marginBottom: 4 }}>סוג</div>
                    <div className="tag-scroll" style={{ marginBottom: 8 }}>
                      {(Object.keys(WORKOUT_KIND_LABEL) as WorkoutKind[]).map((k) => (
                        <button
                          key={k}
                          className={`tag${day.kind === k ? ' on' : ''}`}
                          style={day.kind === k ? { background: 'var(--accent)' } : undefined}
                          onClick={() => actions.patchWorkoutDay(day.id, { kind: k })}
                        >
                          {KIND_EMOJI[k]} {WORKOUT_KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <label className="field" style={{ marginBottom: 10 }}>
                      <span>המטרה (לא חובה)</span>
                      <input
                        className="input"
                        value={day.focus ?? ''}
                        placeholder="חיזוק שרירי החזה, הכתפיים והיד האחורית"
                        onChange={(e) => actions.patchWorkoutDay(day.id, { focus: e.target.value })}
                      />
                    </label>

                    {(day.kind === 'run' || day.kind === 'walk') && <TargetEditor day={day} />}

                    <ExerciseEditor day={day} />

                    <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn xs"
                        onClick={() => {
                          const free = [0, 1, 2, 3, 4, 5, 6].find((x) => !plan.some((p) => p.dow === x))
                          if (free === undefined) return toast('כל ימי השבוע כבר תפוסים')
                          const copy: WorkoutDay = {
                            ...day,
                            id: uid('wd'),
                            updatedAt: Date.now(),
                            dow: free,
                            exercises: day.exercises.map((x) => ({ ...x, id: uid('ex') })),
                          }
                          actions.upsertWorkoutDay(copy)
                          setOpenDay(copy.id)
                          toast(`שוכפל ליום ${HE_DAYS[free]}`)
                        }}
                      >
                        שכפול ליום פנוי
                      </button>
                      <span className="grow" />
                      <button className="btn xs danger" onClick={() => setDel(day)}>
                        מחיקת היום
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flow-foot">
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>
          סיום
        </button>
      </div>

      <Confirm
        open={!!del}
        title={del ? `למחוק את "${del.title}"?` : ''}
        body="האימונים שכבר רשמת נשארים. רק התבנית של היום הזה תימחק."
        onCancel={() => setDel(null)}
        onConfirm={() => {
          if (del) actions.deleteWorkoutDay(del.id)
          setDel(null)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// התקדמות
// ---------------------------------------------------------------------------
export function ProgressSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'strength' | 'run'>('strength')
  useLockScroll()

  return (
    <div className="flow" role="dialog" aria-modal="true" aria-label="התקדמות">
      <div className="flow-head">
        <div className="spread">
          <b style={{ fontSize: 16 }}>התקדמות</b>
          <button className="btn ghost sm" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="row" style={{ gap: 4, marginTop: 8 }}>
          <button
            className={`btn xs${tab === 'strength' ? ' primary' : ''}`}
            onClick={() => setTab('strength')}
          >
            כוח
          </button>
          <button className={`btn xs${tab === 'run' ? ' primary' : ''}`} onClick={() => setTab('run')}>
            ריצה
          </button>
        </div>
      </div>

      <div className="flow-body">
        <div className="stack narrow" style={{ margin: '0 auto', maxWidth: 640 }}>
          {tab === 'strength' ? <StrengthProgress /> : <RunProgress />}
        </div>
      </div>

      <div className="flow-foot">
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>
          סגירה
        </button>
      </div>
    </div>
  )
}

function StrengthProgress() {
  const s = useApp()
  const [open, setOpen] = useState<ID | null>(null)

  const rows = useMemo(() => {
    const out: Array<{ ex: Exercise; hist: ReturnType<typeof exerciseHistory> }> = []
    for (const day of alive(s.workoutPlan ?? [])) {
      for (const ex of day.exercises) {
        const hist = exerciseHistory(s, ex.id)
        if (hist.length) out.push({ ex, hist })
      }
    }
    return out.sort((a, b) => b.hist.length - a.hist.length)
  }, [s.workoutPlan, s.workouts])

  if (!rows.length) {
    return (
      <div className="card pad">
        <div className="empty" style={{ padding: '10px 0' }}>
          עוד לא נרשמו סטים. אחרי אימון או שניים תופיע כאן ההתקדמות של כל תרגיל.
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        לכל תרגיל: הסט הכי טוב שנרשם אי פעם, מה היה בפעם האחרונה, והמגמה לאורך זמן.
      </p>
      {rows.map(({ ex, hist }) => {
        const tops = hist.map((h) => ({ date: h.date, best: bestSet(h.sets, ex.metric) }))
        const score = (v?: SetLog) => setScore(v, ex.metric)
        const max = Math.max(1, ...tops.map((t) => score(t.best)))
        const record = tops.reduce((a, b) => (score(b.best) > score(a.best) ? b : a), tops[0])
        const lastT = tops[tops.length - 1]
        const isOpen = open === ex.id
        return (
          <div className="card pad" key={ex.id}>
            <button
              className="spread"
              style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'start' }}
              onClick={() => setOpen(isOpen ? null : ex.id)}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{ex.name}</b>
                <div className="tiny faint">
                  שיא: {setText(record.best, ex.metric)} · אחרון: {setText(lastT.best, ex.metric)} ·{' '}
                  {plural(hist.length, 'אימון אחד', 'אימונים')}
                </div>
              </div>
              <span className="faint">{isOpen ? '▾' : '◂'}</span>
            </button>

            <div className="hist" style={{ height: 64, marginTop: 10 }}>
              {tops.map((t) => (
                <i
                  key={t.date}
                  title={`${shortDate(t.date)} · ${setText(t.best, ex.metric)}`}
                  style={{
                    height: `${Math.max(4, (score(t.best) / max) * 100)}%`,
                    background: score(t.best) >= score(record.best) ? 'var(--good)' : 'var(--accent)',
                  }}
                />
              ))}
            </div>

            {isOpen && (
              <div className="list" style={{ marginTop: 8 }}>
                {[...hist]
                  .reverse()
                  .slice(0, 12)
                  .map((h) => (
                    <div className="item" key={h.date} style={{ minHeight: 36 }}>
                      <span className="tiny faint ltr" style={{ width: 46, flex: '0 0 46px' }}>
                        {shortDate(h.date)}
                      </span>
                      <div className="txt tiny">{setsText(h.sets, ex.metric)}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function RunProgress() {
  const s = useApp()
  const runs = useMemo(
    () =>
      (s.workouts ?? [])
        .filter((w) => !w.deleted && (w.kind === 'run' || w.kind === 'walk') && (w.km || w.minutes))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [s.workouts],
  )

  const weeks = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of runs) {
      const ws = weekStart(r.date)
      map.set(ws, (map.get(ws) ?? 0) + (r.km ?? 0))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
  }, [runs])

  if (!runs.length) {
    return (
      <div className="card pad">
        <div className="empty" style={{ padding: '10px 0' }}>
          עוד לא נרשמו ריצות. אחרי הריצה הראשונה יופיעו כאן הקילומטרים והקצב.
        </div>
      </div>
    )
  }

  const totalKm = runs.reduce((a, b) => a + (b.km ?? 0), 0)
  const max = Math.max(1, ...weeks.map((w) => w[1]))
  const paceOf = (r: WorkoutLog) => (r.km && r.minutes ? r.minutes / r.km : 0)
  const fmtPace = (p: number) =>
    p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}` : '—'

  return (
    <>
      <div className="card pad">
        <div className="grid3">
          <div>
            <div className="tiny faint">סה״כ</div>
            <b style={{ fontSize: 20 }} className="ltr">
              {Number(totalKm.toFixed(1))} ק״מ
            </b>
          </div>
          <div>
            <div className="tiny faint">ריצות</div>
            <b style={{ fontSize: 20 }}>{runs.length}</b>
          </div>
          <div>
            <div className="tiny faint">הקצב האחרון</div>
            <b style={{ fontSize: 20 }} className="ltr">
              {fmtPace(paceOf(runs[runs.length - 1]))}
            </b>
          </div>
        </div>
      </div>

      <div className="card pad">
        <div className="section-title" style={{ marginBottom: 10 }}>קילומטרים בשבוע</div>
        <div className="hist" style={{ height: 90 }}>
          {weeks.map(([ws, km]) => (
            <i
              key={ws}
              title={`שבוע ${shortDate(ws)} · ${Number(km.toFixed(1))} ק״מ`}
              style={{ height: `${Math.max(4, (km / max) * 100)}%`, background: 'var(--accent)' }}
            />
          ))}
        </div>
        <div className="spread tiny faint" style={{ marginTop: 4 }}>
          <span className="ltr">{shortDate(weeks[0][0])}</span>
          <span className="ltr">{shortDate(weeks[weeks.length - 1][0])}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ padding: '12px 13px 4px' }}>הריצות האחרונות</div>
        <div className="list">
          {[...runs]
            .reverse()
            .slice(0, 20)
            .map((r) => (
              <div className="item" key={r.id} style={{ minHeight: 40 }}>
                <span className="tiny faint ltr" style={{ width: 46, flex: '0 0 46px' }}>
                  {shortDate(r.date)}
                </span>
                <div className="txt small">
                  {r.km ? <span className="ltr">{r.km} ק״מ</span> : null}
                  {r.minutes ? <span className="faint"> · {minutesToHM(r.minutes)}</span> : null}
                </div>
                <span className="tiny faint ltr">{fmtPace(paceOf(r))}</span>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
