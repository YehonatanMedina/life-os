import React, { useMemo, useState } from 'react'
import {
  actions, alive, currentStage, exerciseHistory, fitnessProgress, ladderFraction, longestRun,
  runWeeks, skillExIds, skillOf, stageProgress, useApp, workoutDayOn, workoutHasData,
  workoutMinutes, workoutOn,
} from '../store'
import {
  HE_DAYS, HE_DAYS_SHORT, dow, minutesToHM, plural, shortDate, today as todayISO,
  weekDates, weekStart,
} from '../dates'
import { Ring, Sheet } from '../ui'
import RunCard from './RunCard'
import { PlanSheet, ProgressSheet, WorkoutSheet, KIND_EMOJI, setText, targetText } from './Workout'
import {
  FOCUS_COUNT, RUN_MILESTONES, RUN_WEEKLY_GROWTH, focusLadders, isFocusGoal, laddersInOrder,
  tutorial,
} from '../skills'
import type { SkillLadder, SkillStage } from '../skills'
import { basisText, etaText, fitnessForecast, runForecast, skillForecast } from '../forecast'
import type { ID, WorkoutLog } from '../types'
import { WORKOUT_KIND_LABEL } from '../types'

// ---------------------------------------------------------------------------
// עמוד האימונים.
//
// מסך אחד שעונה על ארבע שאלות בסדר הזה: מה עושים היום · לאן זה מוביל ואיפה
// אני על הדרך · מה הרמה שלי בכל תרגיל · ומה התוכנית השבועית.
//
// המסע הוא לא קישוט: כל מיילסטון נושא תנאי מעבר מדיד, והמערכת בודקת אותו
// מול מה שבאמת נרשם ביומן — לא מול תחושה.
// ---------------------------------------------------------------------------

export default function Workouts() {
  const s = useApp()
  const date = todayISO()
  const [log, setLog] = useState(false)
  const [plan, setPlan] = useState(false)
  const [prog, setProg] = useState(false)
  const day = workoutDayOn(s, date)

  const hasPlan = alive(s.workoutPlan ?? []).length > 0

  return (
    <div className="stack">
      {!hasPlan ? (
        <div className="card pad">
          <b>עוד אין תוכנית אימונים</b>
          <div className="tiny faint" style={{ margin: '3px 0 10px' }}>
            בונים אותה פעם אחת, ומשם רק מסמנים מה עשית.
          </div>
          <button className="btn sm primary" onClick={() => setPlan(true)}>
            בניית התוכנית
          </button>
        </div>
      ) : (
        <div className="grid2">
          <div className="page">
            <section className="sec">
              <div className="sec-h"><h2>היום</h2></div>
              <TodayCard date={date} onOpen={() => setLog(true)} />
            </section>

            {/* ריצה: כפתור ההתחלה, המסלולים, והריצה האחרונה שנמדדה */}
            <section className="sec">
              <div className="sec-h"><h2>ריצה</h2></div>
              <RunCard date={date} target={day?.kind === 'run' || day?.kind === 'walk' ? day.target : undefined} />
            </section>

            <section className="sec">
              <div className="sec-h"><h2>ההתקדמות הכוללת</h2></div>
              <OverallCard />
            </section>

            <section className="sec">
              <div className="sec-h"><h2>מתי זה קורה</h2></div>
              <ForecastCard />
            </section>

            <section className="sec">
              <div className="sec-h"><h2>במוקד עכשיו</h2></div>
              <p className="small muted" style={{ margin: '0 0 2px' }}>
                {FOCUS_COUNT} המטרות שעובדים עליהן השבוע, בסדר. כל שלב נסגר בתנאי
                מדיד ונבדק מול מה שנרשם ביומן — אין "בערך". השאר לא נעלמות: הן
                ממשיכות למטה, וההתקדמות הכוללת נספרת מכולן.
              </p>
              {focusLadders().map((lad) => (
                <SkillCard key={lad.id} lad={lad} />
              ))}
            </section>
          </div>

          <div className="page">
            <section className="sec">
              <div className="sec-h"><h2>חצי מרתון</h2></div>
              <RunJourney />
            </section>

            <section className="sec">
              <div className="sec-h"><h2>הבאות בתור</h2></div>
              <NextGoals />
            </section>

            <section className="sec">
              <div className="sec-h">
                <h2>הרמה שלי</h2>
                <button className="btn xs ghost" onClick={() => setProg(true)}>
                  הכל
                </button>
              </div>
              <LevelTable />
            </section>

            <section className="sec">
              <div className="sec-h">
                <h2>השבוע</h2>
                <button className="btn xs ghost" onClick={() => setPlan(true)}>
                  עריכה
                </button>
              </div>
              <WeekPlan />
            </section>
          </div>
        </div>
      )}

      {log && <WorkoutSheet key="log" date={date} onClose={() => setLog(false)} />}
      {plan && <PlanSheet key="plan" onClose={() => setPlan(false)} />}
      {prog && <ProgressSheet key="prog" onClose={() => setProg(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// היום — מה מתוכנן, ופס השבוע
// ---------------------------------------------------------------------------
function TodayCard({ date, onOpen }: { date: string; onOpen: () => void }) {
  const s = useApp()
  const day = workoutDayOn(s, date)
  const log = workoutOn(s, date)
  const done = !!log?.finishedAt
  const started = workoutHasData(log)
  const week = weekDates(weekStart(date))

  // כמה זמן האימון אמור לקחת. החישוב יושב ב-store (workoutMinutes) כדי
  // שהתוכנית השבועית תציג בדיוק את אותו מספר.
  const minutes = useMemo(() => workoutMinutes(day), [day])

  return (
    <div className="card">
      <div className="card-h">
        <div className="grow" style={{ minWidth: 0 }}>
          <b>
            {KIND_EMOJI[day?.kind ?? 'rest']} {day ? day.title : 'אין אימון היום'}
          </b>
          <div className="tiny faint">
            יום {HE_DAYS[dow(date)]}
            {day ? ` · ${WORKOUT_KIND_LABEL[day.kind]}` : ''}
            {minutes ? ` · כ-${minutes} דק׳` : ''}
            {log?.km ? ` · ${log.km} ק״מ` : ''}
          </div>
        </div>
        {done && <span className="chip on">✓ בוצע</span>}
      </div>

      {/* בריצה אין תרגילים להסתכל עליהם — היעד הוא כל מה שיש, ולכן הוא ראשון */}
      {targetText(day?.target) && (
        <div style={{ padding: '0 13px 4px' }}>
          <span className="chip on">היעד: {targetText(day!.target)}</span>
          {day!.target?.how && (
            <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 4 }}>
              {day!.target.how}
            </div>
          )}
        </div>
      )}

      {day?.focus && (
        <div className="tiny" style={{ color: 'var(--text-dim)', padding: '0 13px 2px' }}>
          {day.focus}
        </div>
      )}

      <div className="wk-strip">
        {week.map((d) => {
          const p = workoutDayOn(s, d)
          const w = workoutOn(s, d)
          const ok = !!w?.finishedAt
          const partial = !ok && workoutHasData(w)
          return (
            <button
              key={d}
              className={`wd${d === date ? ' now' : ''}${ok ? ' ok' : ''}${partial ? ' part' : ''}`}
              title={p ? p.title : 'ללא אימון'}
              onClick={onOpen}
              disabled={d !== date}
            >
              <span className="l">{HE_DAYS_SHORT[dow(d)]}</span>
              <span className="i">{p ? KIND_EMOJI[p.kind] : '·'}</span>
            </button>
          )
        })}
      </div>

      {/* התרגילים של היום, עם ההפסקה והדגשים — לפני שנכנסים למסך הרישום */}
      {day && day.exercises.length > 0 && (
        <div className="list">
          {day.exercises.map((ex) => (
            <div className="item" key={ex.id} style={{ alignItems: 'flex-start' }}>
              <div className="txt">
                <div className="ttl">{ex.name}</div>
                <div className="sub2">
                  {ex.sets ? `${ex.sets} סטים` : ''}
                  {ex.reps ? ` × ${ex.reps}` : ''}
                  {ex.rest ? ` · הפסקה ${ex.rest} שנ׳` : ''}
                </div>
                {ex.cues && (
                  <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 3 }}>
                    {ex.cues}
                  </div>
                )}
              </div>
              {ex.video && (
                <a className="btn xs ghost" href={ex.video} target="_blank" rel="noreferrer">
                  טוטוריאל
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ padding: '10px 13px 12px' }}>
        <button className="btn sm primary grow" onClick={onOpen}>
          {done ? 'צפייה באימון' : started ? 'המשך רישום' : day ? 'פתיחת האימון' : 'רישום אימון'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ההתקדמות הכוללת — מספר אחד, ומיד אחריו ממה הוא מורכב.
//
// הכלל מוסבר במקום אחד בלבד (fitnessProgress ב-store), והמסך רק מצייר אותו:
// שלב שנסגר הוא היחידה, כל מטרה שוקלת אותו דבר, ורק מה שבתוכנית נספר.
// ---------------------------------------------------------------------------
function OverallCard() {
  const s = useApp()
  const { pct, parts, focus } = useMemo(() => fitnessProgress(s), [s.workouts, s.workoutPlan, s.skills])
  const closed = parts.reduce((a, b) => a + b.stage, 0)
  const total = parts.reduce((a, b) => a + b.total, 0)

  return (
    <div className="card hero">
      <div className="hero-top">
        <div>
          <div className="eyebrow">כושר — כל המטרות יחד</div>
          <div className="hero-num">{pct}%</div>
          <div className="tiny faint">
            {closed} שלבים מתוך {total} · {parts.length} מטרות, {focus.length} מהן במוקד
          </div>
        </div>
        <Ring value={pct} max={100} size={88} stroke={9}>
          <div className="n" style={{ fontSize: 20 }}>{pct}</div>
        </Ring>
      </div>
      <div className="list">
        {parts.map((p, i) => (
          <div className="item" key={p.id} style={{ minHeight: 38 }}>
            <span style={{ width: 22, flex: '0 0 22px', fontSize: 15 }} aria-hidden="true">{p.emoji}</span>
            <div className="txt">
              <div className="ttl">
                <span className="faint ltr">{i + 1}.</span> {p.name}
                {p.focus && <span className="chip on" style={{ marginInlineStart: 6 }}>במוקד</span>}
              </div>
              <div className="bar sm" style={{ marginTop: 5 }}>
                <i style={{ width: `${Math.max(2, p.pct)}%` }} />
              </div>
            </div>
            <div className="tiny faint ltr" style={{ flexShrink: 0, minWidth: 44, textAlign: 'end' }}>
              {p.stage}/{p.total}
            </div>
          </div>
        ))}
      </div>
      <div className="tiny faint" style={{ padding: '0 13px 12px' }}>
        היחידה היא שלב שנסגר, לא ק״ג. כל מטרה שוקלת אותו דבר, כל שלב נבדק מול
        היומן, והמספר נספר מכל המטרות — גם מאלה שעוד לא בתוכנית.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// מתי זה קורה — תאריך יעד לכל מטרה, מחושב מהיומן.
//
// למה זה כאן ולא רק אחוזים: אחוז אומר כמה נסגר, לא כמה נשאר. "עמידת ידיים
// חופשית בפברואר" זה מה שמחזיק אימון בערב שלא בא בו. החוקים כולם ב-forecast.ts
// — המסך רק מצייר, ולכן אי אפשר שהמסך והמספר יגידו שני דברים שונים.
// ---------------------------------------------------------------------------
function ForecastCard() {
  const s = useApp()
  const from = todayISO()
  const skills = useMemo(() => fitnessForecast(s, from), [s.workouts, s.workoutPlan, s.skills, from])
  const run = useMemo(() => runForecast(s, from), [s.workouts, from])
  const soonest = [...skills].sort((a, b) => a.next.weeks - b.next.weeks)[0]
  const nextRun = run.items[0]

  return (
    <div className="card pad">
      <div className="tiny faint">לפי הקצב שנרשם ביומן, לא לפי תחושה</div>
      {soonest && (
        <div style={{ margin: '6px 0 10px' }}>
          <b>
            הכי קרוב: {soonest.emoji} {soonest.stageName}
          </b>
          <div className="tiny faint">
            {etaText(soonest.next.weeks)} · {shortDate(soonest.next.date)} · {basisText(soonest.basis)}
          </div>
        </div>
      )}
      <div className="list">
        {skills.map((f) => (
          <div className="item" key={f.id} style={{ minHeight: 40 }}>
            <span style={{ width: 22, flex: '0 0 22px', fontSize: 15 }} aria-hidden="true">{f.emoji}</span>
            <div className="txt">
              <div className="ttl">{f.name}</div>
              <div className="tiny faint">
                השלב הבא: {etaText(f.next.weeks)} · המטרה: {etaText(f.goalWeeks)}
              </div>
            </div>
            <div className="tiny faint ltr" style={{ flexShrink: 0, minWidth: 52, textAlign: 'end' }}>
              {shortDate(f.goalDate)}
            </div>
          </div>
        ))}
        <div className="item" style={{ minHeight: 40 }}>
          <span style={{ width: 22, flex: '0 0 22px', fontSize: 15 }} aria-hidden="true">🏃</span>
          <div className="txt">
            <div className="ttl">חצי מרתון</div>
            <div className="tiny faint">
              {nextRun
                ? `הבא: ${nextRun.name} ${etaText(nextRun.weeks)} · +${run.growth} ק״מ לשבוע`
                : 'כל המרחקים נסגרו'}
            </div>
          </div>
          <div className="tiny faint ltr" style={{ flexShrink: 0, minWidth: 52, textAlign: 'end' }}>
            {run.goalDate ? shortDate(run.goalDate) : '—'}
          </div>
        </div>
      </div>
      <div className="tiny faint" style={{ marginTop: 8 }}>
        התאריך זז רק בשבועות, גם אחרי אימון חזק במיוחד או חלש במיוחד — הוא נשען
        על חלון של אימונים ועל זמן טיפוסי לשלב, לא על האימון האחרון.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// הבאות בתור — כל שאר המטרות, ברצף אחד ובסדר שבו נוגעים בהן.
//
// אין כאן קבוצות (20.9.2026): קבוצה אומרת "זה שלך וזה לא", והכל שלו. מה
// שנשאר הוא סדר — ולכן רשימה אחת, מהבא בתור ועד הרחוק. הרשימה הזו לא קישוט:
// בלי לראות אותה, סולם של שבעה שלבים מרגיש כמו עבודה בלי סוף.
// ---------------------------------------------------------------------------
function NextGoals() {
  const list = laddersInOrder().filter((lad) => !isFocusGoal(lad.id))
  return (
    <>
      <p className="small muted" style={{ margin: '0 0 2px' }}>
        לפי הסדר שבו הן נכנסות. כולן נספרות בהתקדמות הכוללת כבר עכשיו — מה
        שמפריד אותן מהמוקד הוא זמן, לא מעמד.
      </p>
      {list.map((lad, i) => (
        <GoalCard key={lad.id} lad={lad} rank={FOCUS_COUNT + i + 1} />
      ))}
    </>
  )
}

function GoalCard({ lad, rank }: { lad: SkillLadder; rank: number }) {
  const s = useApp()
  const [open, setOpen] = useState(false)
  const f = ladderFraction(s, lad)
  return (
    <div className="card goal">
      <button
        className="card-h"
        style={{ width: '100%', background: 'none', border: 0, textAlign: 'start' }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="goal-emoji" aria-hidden="true">{lad.emoji}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b><span className="faint ltr">{rank}.</span> {lad.name}</b>
          <div className="tiny faint">{lad.goal}</div>
        </div>
        {f.stage > 0 && <span className="chip on">{f.stage}/{f.total}</span>}
        <span className="faint">{open ? '▾' : '◂'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 13px 12px' }}>
          <div className="tiny" style={{ color: 'var(--text-dim)' }}>{lad.why}</div>
          {lad.needs && (
            <div className="tiny" style={{ marginTop: 6, color: 'var(--warn-text)' }}>
              דורש קודם: {lad.needs}
            </div>
          )}
          <div className="section-title" style={{ margin: '10px 0 4px' }}>הדרך</div>
          {lad.stages.map((st, i) => (
            <div key={st.id} className="tiny" style={{ color: 'var(--text-dim)', padding: '2px 0' }}>
              {i + 1}. <b style={{ color: 'var(--text)' }}>{st.name}</b> — {st.criteria}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// מיומנות אחת — סולם המיילסטונים
// ---------------------------------------------------------------------------
function SkillCard({ lad }: { lad: SkillLadder }) {
  const s = useApp()
  const [open, setOpen] = useState(false)
  const prog = skillOf(s, lad.id)
  const ids = lad.stages.map((x) => x.id)
  const cur = currentStage(s, lad)
  const exIds = skillExIds(s, lad)
  // ההערכה מתי השלב ייסגר — אותם חוקים בדיוק של כרטיס "מתי זה קורה"
  const fc = useMemo(() => skillForecast(s, lad), [s.workouts, s.skills, s.workoutPlan, lad])
  const doneSet = new Set(prog?.done ?? [])
  // שלב נחשב מאחוריך אם הוא לפני השלב הנוכחי או שסומן ידנית
  const passed = (i: number) => i < cur || doneSet.has(ids[i])
  const count = lad.stages.filter((_, i) => passed(i)).length

  return (
    <div className="card">
      <button
        className="card-h"
        style={{ width: '100%', background: 'none', border: 0, textAlign: 'start' }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <b>
            {lad.emoji} {lad.name}
          </b>
          <div className="tiny faint truncate">{lad.goal}</div>
        </div>
        <span className="tiny faint ltr" style={{ flexShrink: 0 }}>
          {count}/{lad.stages.length}
        </span>
        <span className="faint">{open ? '▾' : '◂'}</span>
      </button>

      {/* פס המיילסטונים — קריא גם בלי לפתוח */}
      <div className="mstones" role="img" aria-label={`שלב ${cur + 1} מתוך ${lad.stages.length}`}>
        {lad.stages.map((st, i) => (
          <i
            key={st.id}
            className={passed(i) ? 'ok' : i === cur ? 'now' : ''}
            title={st.name}
          />
        ))}
      </div>

      <div style={{ padding: '2px 13px 12px' }}>
        <StageBlock lad={lad} st={lad.stages[cur]} state="now" exIds={exIds} />
        <div className="tiny faint" style={{ marginTop: 8 }}>
          הערכה: השלב {etaText(fc.next.weeks)} ({shortDate(fc.next.date)}) · המטרה{' '}
          {etaText(fc.goalWeeks)}
        </div>
        {!open && cur + 1 < lad.stages.length && (
          <div className="tiny faint" style={{ marginTop: 4 }}>
            הבא בתור: {lad.stages[cur + 1].name}
          </div>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 13px 12px' }}>
          <div className="tiny" style={{ color: 'var(--text-dim)', marginBottom: 10 }}>
            {lad.why}
          </div>
          {lad.stages.map((st, i) => (
            <StageBlock
              key={st.id}
              lad={lad}
              st={st}
              state={i === cur ? 'now' : passed(i) ? 'done' : 'next'}
              exIds={exIds}
              n={i + 1}
              onToggle={() => actions.toggleSkillStage(lad.id, st.id)}
              onGoto={() => actions.setSkill(lad.id, { stageId: st.id })}
            />
          ))}
          {prog?.note && (
            <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 6 }}>
              {prog.note}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StageBlock({
  lad,
  st,
  state,
  exIds,
  n,
  onToggle,
  onGoto,
}: {
  lad: SkillLadder
  st: SkillStage
  state: 'done' | 'now' | 'next'
  exIds?: ID[]
  n?: number
  onToggle?: () => void
  onGoto?: () => void
}) {
  const s = useApp()
  const p = useMemo(() => stageProgress(s, exIds, st.target), [s.workouts, exIds, st.target])

  return (
    <div className={`mstone ${state}`}>
      <div className="spread" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>
            {n ? `${n}. ` : ''}
            {st.name}
          </b>
          <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 2 }}>
            {st.criteria}
          </div>
        </div>
        {state === 'done' && <span className="chip on">✓</span>}
        {state === 'now' && <span className="chip">כאן</span>}
      </div>

      {state !== 'done' && st.what && (
        <div className="tiny faint" style={{ marginTop: 5 }}>{st.what}</div>
      )}

      {state === 'now' && p && (
        <>
          <div className="bar" style={{ marginTop: 8 }}>
            <i
              style={{
                width: `${Math.min(100, Math.round((p.ok / p.need) * 100))}%`,
                background: p.met ? 'var(--good)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="tiny faint" style={{ marginTop: 4 }}>
            {p.ok}/{p.need} סטים ביעד
            {p.date ? ` · ${shortDate(p.date)}` : ''}
            {p.best ? ` · הכי טוב: ${p.best}${st.target?.metric === 'time' ? ' שנ׳' : ''}` : ''}
            {p.met ? ' · עברת — אפשר לשלב הבא' : ''}
          </div>
        </>
      )}

      {state === 'now' && !p && (
        <div className="tiny faint" style={{ marginTop: 6 }}>
          עוד לא מחובר לתרגיל בתוכנית, ולכן אין מדידה אוטומטית.
        </div>
      )}

      {state === 'now' && st.tip && (
        <div className="tiny" style={{ marginTop: 6, color: 'var(--warn-text)' }}>
          {st.tip}
        </div>
      )}

      {(onToggle || onGoto || st.search) && (
        <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
          {st.search && (
            <a className="btn xs ghost" href={tutorial(st.search)} target="_blank" rel="noreferrer">
              טוטוריאל
            </a>
          )}
          {onGoto && state !== 'now' && (
            <button className="btn xs ghost" onClick={onGoto}>
              אני כאן
            </button>
          )}
          {onToggle && (
            <button className="btn xs ghost" onClick={onToggle}>
              {state === 'done' ? 'ביטול סימון' : 'סימון כהושלם'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// חצי מרתון
// ---------------------------------------------------------------------------
function RunJourney() {
  const s = useApp()
  const best = longestRun(s)
  const weeks = runWeeks(s)
  const thisWeek = weeks.find(([w]) => w === weekStart(todayISO()))?.[1] ?? 0
  const lastWeek = weeks[weeks.length - (weeks[weeks.length - 1]?.[0] === weekStart(todayISO()) ? 2 : 1)]?.[1] ?? 0

  const nextIdx = RUN_MILESTONES.findIndex((m) => m.km > best.km)
  const next = nextIdx === -1 ? undefined : RUN_MILESTONES[nextIdx]
  const goal = RUN_MILESTONES[RUN_MILESTONES.length - 1]
  const pct = Math.min(100, Math.round((best.km / goal.km) * 100))
  // התקרה של השבוע הבא — 10% מעל השבוע שנסגר, וזה הכלל שמונע פציעות
  const cap = lastWeek ? Number((lastWeek * (1 + RUN_WEEKLY_GROWTH)).toFixed(1)) : 0
  const chart = weeks.slice(-14)
  const max = Math.max(1, ...chart.map((w) => w[1]))

  return (
    <>
      <div className="card pad">
        <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <div className="tiny faint">הריצה הארוכה שלך</div>
            <b className="ltr" style={{ fontSize: 26 }}>{best.km || 0} ק״מ</b>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div className="tiny faint">מתוך</div>
            <b className="ltr" style={{ fontSize: 15 }}>21.1 ק״מ</b>
          </div>
        </div>
        <div className="bar">
          <i style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          {best.date ? `נרשמה ב-${shortDate(best.date)} · ` : ''}
          {pct}% מהמרחק
        </div>
      </div>

      {next && (
        <div className="card pad">
          <div className="section-title" style={{ marginBottom: 6 }}>המיילסטון הבא</div>
          <b>{next.name}</b>
          <div className="tiny" style={{ color: 'var(--text-dim)', marginTop: 3 }}>{next.note}</div>
          <div className="tiny faint" style={{ marginTop: 6 }}>
            נפח שבועי שמחזיק אותו: כ-{next.weekKm} ק״מ · השבוע נרשמו {Number(thisWeek.toFixed(1))}
          </div>
          {cap > 0 && (
            <div className="tiny" style={{ marginTop: 6, color: thisWeek > cap ? 'var(--bad)' : 'var(--text-dim)' }}>
              תקרת השבוע לפי כלל 10%: {cap} ק״מ
              {thisWeek > cap ? ' — עברת אותה, זה בדיוק איך שנשברות שוקיים.' : ''}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ padding: '12px 13px 4px' }}>הדרך</div>
        <div style={{ padding: '0 13px 12px' }}>
          {RUN_MILESTONES.map((m) => {
            const done = best.km >= m.km
            const isNext = next?.km === m.km
            return (
              <div key={m.km} className={`mstone ${done ? 'done' : isNext ? 'now' : 'next'}`}>
                <div className="spread" style={{ gap: 8 }}>
                  <b style={{ fontSize: 13.5 }}>{m.name}</b>
                  {done ? <span className="chip on">✓</span> : isNext ? <span className="chip">הבא</span> : null}
                </div>
                {!done && <div className="tiny faint" style={{ marginTop: 3 }}>{m.note}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {chart.length > 0 && (
        <div className="card pad">
          <div className="section-title" style={{ marginBottom: 10 }}>קילומטרים בשבוע</div>
          <div className="hist" style={{ height: 70 }}>
            {chart.map(([ws, km]) => (
              <i
                key={ws}
                title={`שבוע ${shortDate(ws)} · ${Number(km.toFixed(1))} ק״מ`}
                style={{ height: `${Math.max(4, (km / max) * 100)}%`, background: 'var(--accent)' }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// הרמה בכל תרגיל — שורה לתרגיל, השיא והאחרון
// ---------------------------------------------------------------------------
function LevelTable() {
  const s = useApp()
  const rows = useMemo(() => {
    const seen = new Set<ID>()
    const out: Array<{ id: ID; name: string; metric: string; last: string; best: string; n: number }> = []
    for (const day of alive(s.workoutPlan ?? [])) {
      for (const ex of day.exercises) {
        if (seen.has(ex.id)) continue
        seen.add(ex.id)
        const hist = exerciseHistory(s, ex.id)
        if (!hist.length) continue
        const flat = hist.flatMap((h) => h.sets)
        const score = (v: any) =>
          ex.metric === 'time' ? (v.sec ?? 0) : ex.metric === 'reps' ? (v.reps ?? 0) : (v.kg ?? 0) + (v.reps ?? 0) / 100
        const top = flat.reduce((a, b) => (score(b) > score(a) ? b : a), flat[0])
        const lastH = hist[hist.length - 1]
        const lastTop = lastH.sets.reduce((a, b) => (score(b) > score(a) ? b : a), lastH.sets[0])
        out.push({
          id: ex.id,
          name: ex.name,
          metric: ex.metric,
          last: setText(lastTop, ex.metric),
          best: setText(top, ex.metric),
          n: hist.length,
        })
      }
    }
    return out.sort((a, b) => b.n - a.n)
  }, [s.workoutPlan, s.workouts])

  if (!rows.length) {
    return (
      <div className="card pad">
        <div className="empty" style={{ padding: '10px 0' }}>
          עוד לא נרשמו סטים. אחרי אימון או שניים תופיע כאן הרמה בכל תרגיל.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="list">
        {rows.map((r) => (
          <div className="item" key={r.id} style={{ minHeight: 40 }}>
            <div className="txt">
              <div className="ttl">{r.name}</div>
              <div className="sub2">{plural(r.n, 'אימון אחד', 'אימונים')}</div>
            </div>
            <div style={{ textAlign: 'end', flexShrink: 0 }}>
              <div className="tiny ltr" style={{ fontWeight: 700 }}>{r.last}</div>
              <div className="tiny faint ltr">שיא {r.best}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// התוכנית השבועית — לקריאה. העריכה נשארת בגיליון.
// ---------------------------------------------------------------------------
function WeekPlan() {
  const s = useApp()
  const plan = alive(s.workoutPlan ?? [])
  return (
    <div className="card">
      <div className="list">
        {HE_DAYS.map((label, d) => {
          const day = plan.find((x) => x.dow === d)
          const mins = workoutMinutes(day)
          return (
            <div className="item" key={d} style={{ minHeight: 38 }}>
              <span className="tiny faint" style={{ width: 34, flex: '0 0 34px' }}>{label}</span>
              <div className="txt">
                <div className="ttl">
                  {day ? `${KIND_EMOJI[day.kind]} ${day.title}` : '—'}
                  {mins > 0 && (
                    <span className="tiny faint" style={{ fontWeight: 400 }}> · כ-{mins} דק׳</span>
                  )}
                </div>
                {day && day.exercises.length > 0 && (
                  <div className="sub2 truncate">
                    {day.exercises.map((e) => e.name).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
