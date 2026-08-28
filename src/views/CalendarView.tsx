import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { actions, alive, defaultTrackId, eventsOn, tasksDueOn, trackById, useApp } from '../store'
import {
  HE_DAYS_SHORT, addDays, addMonths, diffDays, iso, isSameMonth, minutesToTime, monthGrid,
  monthLabel, niceDate, parseISO, plural, shortDate, timeToMinutes, today as todayISO, weekDates,
  weekStart,
} from '../dates'
import { Check, Confirm, DateField, Field, onColor, Sheet, TimeField, useToast, vibrate } from '../ui'
import type { CalEvent, EventKind, ID } from '../types'
import { BulkDates } from './DatesCard'
import { KIND_LABEL } from '../types'
import { kindColor } from './Today'

const HOUR_PX = 52
const SNAP = 15

type Mode = 'month' | 'week' | 'day'

export default function CalendarView({ initialDate }: { initialDate?: string }) {
  const s = useApp()
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 900 ? 'day' : 'week'))
  const [anchor, setAnchor] = useState<string>(initialDate ?? todayISO())
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [creating, setCreating] = useState<Partial<CalEvent> | null>(null)

  useEffect(() => {
    if (initialDate) setAnchor(initialDate)
  }, [initialDate])

  const step = (dir: number) => {
    if (mode === 'month') setAnchor(addMonths(anchor, dir))
    else if (mode === 'week') setAnchor(addDays(anchor, dir * 7))
    else setAnchor(addDays(anchor, dir))
  }

  const label =
    mode === 'month'
      ? monthLabel(anchor)
      : mode === 'week'
        ? `${shortDate(weekStart(anchor))} – ${shortDate(addDays(weekStart(anchor), 6))}`
        : niceDate(anchor)

  return (
    <div className="stack" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>יומן</h1>
      </div>

      <div className="spread" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <div className="row grow" style={{ minWidth: 0 }}>
          <button className="btn sm ghost" onClick={() => step(-1)} aria-label="הקודם">
            ‹
          </button>
          <button className="btn sm ghost" onClick={() => step(1)} aria-label="הבא">
            ›
          </button>
          <b className="truncate" style={{ fontSize: 16, unicodeBidi: 'plaintext' }}>{label}</b>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => setAnchor(todayISO())}>
            היום
          </button>
          <div className="row" style={{ gap: 2, background: 'var(--bg-sunk)', borderRadius: 9, padding: 2 }}>
            {(['day', 'week', 'month'] as Mode[]).map((m) => (
              <button
                key={m}
                className={`btn xs${mode === m ? ' primary' : ' ghost'}`}
                onClick={() => setMode(m)}
              >
                {m === 'day' ? 'יום' : m === 'week' ? 'שבוע' : 'חודש'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'month' ? (
        <MonthGrid
          anchor={anchor}
          onPick={(d) => {
            setAnchor(d)
            setMode('day')
          }}
          onNew={(d) => setCreating({ date: d, allDay: true, kind: 'personal' })}
          onOpen={(e) => setEditing(e)}
        />
      ) : (
        <HourGrid
          dates={mode === 'week' ? weekDates(anchor) : [anchor]}
          onOpen={(e) => setEditing(e)}
          onNew={(d, start) =>
            setCreating({
              date: d,
              start,
              end: minutesToTime(Math.min(timeToMinutes(start) + 60, 24 * 60 - 1)),
              allDay: false,
              kind: 'personal',
            })
          }
        />
      )}

      <DayList
        date={anchor}
        onOpen={setEditing}
        onNew={() =>
          setCreating({ date: anchor, allDay: false, start: '10:00', end: '11:00', kind: 'personal' })
        }
        onNewTask={(title) => actions.addTask({ title, trackId: defaultTrackId(s), due: anchor })}
      />


      <EventSheet
        ev={editing}
        onClose={() => setEditing(null)}
      />
      <EventSheet
        ev={creating as CalEvent | null}
        isNew
        onClose={() => setCreating(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// רשת חודש
// ---------------------------------------------------------------------------
function MonthGrid({
  anchor,
  onPick,
  onNew,
  onOpen,
}: {
  anchor: string
  onPick: (d: string) => void
  onNew: (d: string) => void
  onOpen: (e: CalEvent) => void
}) {
  const s = useApp()
  const days = useMemo(() => monthGrid(anchor), [anchor])
  const t = todayISO()

  return (
    <div>
      <div className="cal-head">
        {HE_DAYS_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((d) => {
          const evs = eventsOn(s, d)
          const tasks = tasksDueOn(s, d)
          return (
            <button
              key={d}
              className={`cal-cell${isSameMonth(d, anchor) ? '' : ' out'}${d === t ? ' today' : ''}`}
              onClick={() => onPick(d)}
              onDoubleClick={() => onNew(d)}
            >
              <span className="n">{parseISO(d).getDate()}</span>
              {evs.slice(0, 3).map((e) => {
                const col = e.trackId ? trackById(s, e.trackId)?.color ?? kindColor(e.kind) : kindColor(e.kind)
                return (
                  <span
                    key={e.id}
                    className="pill tinted"
                    style={{ ['--c' as any]: col }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpen(e)
                    }}
                  >
                    {e.allDay ? '' : (e.start ?? '') + ' '}
                    {e.title}
                  </span>
                )
              })}
              {evs.length > 3 && (
                <span className="pill faint">{plural(evs.length - 3, 'עוד אירוע', 'עוד')}</span>
              )}
              {tasks.length > 0 && (
                <span className="pill" style={{ background: 'var(--bg-sunk)', color: 'var(--text-dim)' }}>
                  ✓ {plural(tasks.length, 'משימה אחת', 'משימות')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// רשת שעות עם גרירה
//
// עכבר: גרירה מיידית. מגע: לחיצה ארוכה (350 מ״ש) פותחת גרירה, כך שגלילה
// רגילה על הרשת ממשיכה לעבוד. המאזינים יושבים על window — גרירה לא נתקעת
// גם אם המצביע יוצא מהרשת.
// ---------------------------------------------------------------------------
type Drag = {
  id: ID
  /** האירוע כפי שהיה בלחיצה — לפתיחת העריכה כשהתברר שזו לחיצה ולא גרירה */
  ev: CalEvent
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origStart: number
  origEnd: number
  origDate: string
  curStart: number
  curEnd: number
  curDate: string
  moved: boolean
}

function HourGrid({
  dates,
  onOpen,
  onNew,
}: {
  dates: string[]
  onOpen: (e: CalEvent) => void
  onNew: (date: string, start: string) => void
}) {
  const s = useApp()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pendingRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const dragEndedAt = useRef(0)
  // המאזינים הגלובליים נרשמים פעם אחת — הפניה נשארת עדכנית דרך ref
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const t = todayISO()

  // טווח השעות מתרחב אוטומטית כדי שאף אירוע לא ייעלם מחוץ לרשת
  const { h0, h1 } = useMemo(() => {
    let lo = Math.max(0, Math.min(23, s.settings.dayStartHour))
    let hi = Math.max(lo + 6, Math.min(24, s.settings.dayEndHour))
    for (const d of dates) {
      for (const e of eventsOn(s, d)) {
        if (e.allDay) continue
        lo = Math.min(lo, Math.floor(timeToMinutes(e.start ?? '09:00') / 60))
        hi = Math.max(hi, Math.ceil(timeToMinutes(e.end ?? '10:00') / 60))
      }
    }
    return { h0: Math.max(0, lo), h1: Math.min(24, Math.max(lo + 1, hi)) }
  }, [s.events, s.settings.dayStartHour, s.settings.dayEndHour, dates])

  const height = (h1 - h0) * HOUR_PX
  const gutter = 46
  const cols = dates.length
  const gridTemplate = `${gutter}px repeat(${cols}, minmax(0, 1fr))`

  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => {
    const i = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000)
    return () => clearInterval(i)
  }, [])

  // גלילה אוטומטית לשעה הנוכחית — לפני הציור, בלי קפיצה
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const y = ((nowMin - h0 * 60) / 60) * HOUR_PX - 120
    el.scrollTop = Math.max(0, y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const colIndexAt = (clientX: number): number => {
    const el = bodyRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const isRtl = getComputedStyle(el).direction === 'rtl'
    // clientWidth ולא r.width — כדי לא לספור את פס הגלילה כרוחב עמודה
    const inner = el.clientWidth
    const colW = (inner - gutter) / cols
    const off = isRtl ? r.left + inner - gutter - clientX : clientX - r.left - gutter
    return Math.max(0, Math.min(cols - 1, Math.floor(off / colW)))
  }

  const cancelPending = () => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer)
      pendingRef.current = null
    }
  }

  const beginDrag = (ev: CalEvent, mode: 'move' | 'resize', x: number, y: number) => {
    const st = timeToMinutes(ev.start ?? '09:00')
    const en = timeToMinutes(ev.end ?? '10:00')
    const d: Drag = {
      id: ev.id,
      ev,
      mode,
      startX: x,
      startY: y,
      origStart: st,
      origEnd: en,
      origDate: ev.date,
      curStart: st,
      curEnd: en,
      curDate: ev.date,
      moved: false,
    }
    dragRef.current = d
    setDrag(d)
  }

  const onPointerDown = (e: React.PointerEvent, ev: CalEvent, mode: 'move' | 'resize') => {
    if (ev.allDay || e.button !== 0) return
    e.stopPropagation()
    if (e.pointerType === 'touch') {
      // לחיצה ארוכה — כדי שגלילה רגילה לא תזיז אירועים בטעות
      const x = e.clientX
      const y = e.clientY
      const timer = window.setTimeout(() => {
        pendingRef.current = null
        vibrate(15)
        beginDrag(ev, mode, x, y)
      }, 350)
      pendingRef.current = { timer, x, y }
    } else {
      beginDrag(ev, mode, e.clientX, e.clientY)
    }
  }

  // מאזינים גלובליים — גרירה נגמרת גם אם המצביע יצא מהרשת
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pendingRef.current
      if (p && (Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10)) {
        cancelPending() // המשתמש גולל — לא גורר
        return
      }
      const d = dragRef.current
      if (!d) return
      if (e.cancelable) e.preventDefault()
      const dy = e.clientY - d.startY
      const dMin = Math.round(((dy / HOUR_PX) * 60) / SNAP) * SNAP
      const moved = d.moved || Math.abs(dy) > 4 || Math.abs(e.clientX - d.startX) > 4
      let next: Drag
      if (d.mode === 'resize') {
        const en = Math.max(d.origStart + SNAP, Math.min(24 * 60 - 1, d.origEnd + dMin))
        next = { ...d, curEnd: en, moved }
      } else {
        const dur = d.origEnd - d.origStart
        const st = Math.max(h0 * 60, Math.min(24 * 60 - 1 - dur, d.origStart + dMin))
        const idx = cols > 1 ? colIndexAt(e.clientX) : 0
        const date = cols > 1 ? dates[idx] : d.origDate
        next = { ...d, curStart: st, curEnd: st + dur, curDate: date, moved }
      }
      dragRef.current = next
      setDrag(next)
    }

    const finish = (commit: boolean) => {
      cancelPending()
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      // לחיצה בלי תזוזה = לא גרירה אלא קליק. פותחים כאן ולא ב-onClick, כי
      // ה-render של תחילת הגרירה מבטל את אירוע ה-click במחשב.
      if (!d.moved) {
        dragEndedAt.current = Date.now()
        if (commit && d.mode === 'move') onOpenRef.current(d.ev)
        return
      }
      dragEndedAt.current = Date.now()
      if (!commit) return
      if (d.curStart !== d.origStart || d.curEnd !== d.origEnd || d.curDate !== d.origDate) {
        actions.patchEvent(d.id, {
          start: minutesToTime(d.curStart),
          end: minutesToTime(d.curEnd),
          date: d.curDate,
        })
        vibrate(10)
      }
    }

    const up = () => finish(true)
    const cancel = () => finish(false)

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      cancelPending()
    }
  }, [dates, cols, h0])

  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i)
  const hasAllDay = dates.some((d) => eventsOn(s, d).some((e) => e.allDay))

  return (
    <div className={`wk${cols === 1 ? ' single' : ''}`}>
      <div className="wk-head" style={{ gridTemplateColumns: gridTemplate }}>
        <div />
        {dates.map((d) => (
          <div key={d} className={`h${d === t ? ' today' : ''}`}>
            {HE_DAYS_SHORT[parseISO(d).getDay()]}
            <b>{parseISO(d).getDate()}</b>
          </div>
        ))}
      </div>

      {hasAllDay && (
      <div className="wk-allday" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="tiny faint" style={{ padding: '2px 4px', textAlign: 'center' }}>
          כל היום
        </div>
        {dates.map((d) => (
          <div className="c" key={d}>
            {eventsOn(s, d)
              .filter((e) => e.allDay)
              .map((e) => {
                const col = e.trackId ? trackById(s, e.trackId)?.color ?? kindColor(e.kind) : kindColor(e.kind)
                return (
                  <button
                    key={e.id}
                    className="pill tinted"
                    style={{ ['--c' as any]: col, border: 0, textAlign: 'start' }}
                    onClick={() => onOpen(e)}
                  >
                    {e.title}
                  </button>
                )
              })}
          </div>
        ))}
      </div>
      )}

      <div className="wk-body" ref={bodyRef} style={{ gridTemplateColumns: gridTemplate }}>
        <div className="wk-gutter" style={{ height }}>
          {hours.map((h, i) => (
            <span key={h} className="hr" style={{ top: i * HOUR_PX }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {dates.map((d) => {
          const dayEvents = eventsOn(s, d).filter((e) => !e.allDay)
          const dragged = drag && drag.curDate === d ? drag : null
          const others = dayEvents.filter((e) => !drag || e.id !== drag.id)
          const list = [...others]
          if (dragged) {
            const orig = s.events.find((x) => x.id === dragged.id)
            if (orig) {
              list.push({
                ...orig,
                date: d,
                start: minutesToTime(dragged.curStart),
                end: minutesToTime(dragged.curEnd),
              })
            }
          }
          const laid = layout(list)
          const dowN = parseISO(d).getDay()

          return (
            <div
              key={d}
              className={`wk-col${dowN === 5 || dowN === 6 ? ' weekend' : ''}`}
              style={{ height }}
              onClick={(e) => {
                if (dragRef.current || Date.now() - dragEndedAt.current < 400) return
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const y = e.clientY - r.top
                const raw = Math.round(((y / HOUR_PX) * 60) / 30) * 30 + h0 * 60
                const min = Math.max(h0 * 60, Math.min(h1 * 60 - 30, 23 * 60 + 30, raw))
                onNew(d, minutesToTime(min))
              }}
            >
              {hours.map((h, i) => (
                <React.Fragment key={h}>
                  <div className="hline" style={{ top: i * HOUR_PX }} />
                  <div className="hline half" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                </React.Fragment>
              ))}

              {d === t && nowMin >= h0 * 60 && nowMin <= h1 * 60 && (
                <div className="wk-now" style={{ top: ((nowMin - h0 * 60) / 60) * HOUR_PX }} />
              )}

              {laid.map(({ e, lane, lanes }) => {
                const st = timeToMinutes(e.start ?? '09:00')
                const en = Math.max(st + 15, timeToMinutes(e.end ?? '10:00'))
                const top = ((st - h0 * 60) / 60) * HOUR_PX
                const hgt = Math.max(18, ((en - st) / 60) * HOUR_PX - 2)
                const col = e.trackId ? trackById(s, e.trackId)?.color ?? kindColor(e.kind) : kindColor(e.kind)
                const w = 100 / lanes
                const isDragging = drag?.id === e.id
                return (
                  <div
                    key={e.id}
                    className={`ev${isDragging ? ' drag' : ''}`}
                    style={{
                      top,
                      height: hgt,
                      insetInlineStart: `calc(${lane * w}% + 2px)`,
                      width: `calc(${w}% - 4px)`,
                      ['--evc' as any]: col,
                      touchAction: isDragging ? 'none' : undefined,
                    }}
                    onPointerDown={(pe) => onPointerDown(pe, e, 'move')}
                    onPointerUp={cancelPending}
                    onClick={(ce) => {
                      ce.stopPropagation()
                      if (!dragRef.current && Date.now() - dragEndedAt.current > 400) onOpen(e)
                    }}
                  >
                    <div className="truncate">{e.title}</div>
                    {hgt > 34 && (
                      <div className="time ltr">
                        {e.start}–{e.end}
                      </div>
                    )}
                    {/* ידית שינוי גודל רק כשיש מספיק גובה — אחרת היא בולעת את הגרירה */}
                    {hgt > 44 && <div className="handle" onPointerDown={(pe) => onPointerDown(pe, e, 'resize')} />}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** פריסת אירועים חופפים לעמודות */
function layout(evs: CalEvent[]): Array<{ e: CalEvent; lane: number; lanes: number }> {
  const sorted = [...evs].sort(
    (a, b) => timeToMinutes(a.start ?? '0:00') - timeToMinutes(b.start ?? '0:00'),
  )
  const out: Array<{ e: CalEvent; lane: number; lanes: number }> = []
  let group: CalEvent[] = []
  let groupEnd = -1

  const flush = () => {
    if (!group.length) return
    const laneEnds: number[] = []
    const assign = new Map<string, number>()
    for (const e of group) {
      const st = timeToMinutes(e.start ?? '0:00')
      const en = Math.max(st + 15, timeToMinutes(e.end ?? '1:00'))
      let lane = laneEnds.findIndex((x) => x <= st)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(en)
      } else laneEnds[lane] = en
      assign.set(e.id, lane)
    }
    const lanes = Math.max(1, laneEnds.length)
    for (const e of group) out.push({ e, lane: assign.get(e.id) ?? 0, lanes })
    group = []
    groupEnd = -1
  }

  for (const e of sorted) {
    const st = timeToMinutes(e.start ?? '0:00')
    const en = Math.max(st + 15, timeToMinutes(e.end ?? '1:00'))
    if (group.length && st >= groupEnd) flush()
    group.push(e)
    groupEnd = Math.max(groupEnd, en)
  }
  flush()
  return out
}

// ---------------------------------------------------------------------------
// רשימת היום מתחת ליומן
// ---------------------------------------------------------------------------
function DayList({
  date,
  onOpen,
  onNew,
  onNewTask,
}: {
  date: string
  onOpen: (e: CalEvent) => void
  onNew: () => void
  onNewTask: (title: string) => void
}) {
  const [q, setQ] = useState('')
  const [bulk, setBulk] = useState(false)
  const s = useApp()
  const toast = useToast()
  const evs = eventsOn(s, date).sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || (a.start ?? '').localeCompare(b.start ?? ''),
  )
  // כולל מה שכבר הושלם — אחרת השורה נעלמת ברגע הסימון והביטול נראה כמו קסם
  const tasks = alive(s.tasks)
    .filter((t) => t.due === date)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.order - b.order)

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <b>{niceDate(date)}</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm ghost" onClick={() => setBulk(true)}>
            הדבקת תאריכים
          </button>
          <button className="btn sm" onClick={onNew}>
            + אירוע
          </button>
        </div>
      </div>
      <BulkDates open={bulk} onClose={() => setBulk(false)} defaultKind="birthday" />
      <div className="list">
        {evs.length === 0 && tasks.length === 0 && <div className="empty">אין כלום ביום הזה.</div>}
        {evs.map((e) => {
          const col = e.trackId ? trackById(s, e.trackId)?.color ?? kindColor(e.kind) : kindColor(e.kind)
          return (
            <button className="item tappable" key={e.id} onClick={() => onOpen(e)} style={{ textAlign: 'start' }}>
              <span className="dot" style={{ background: col }} />
              <div className="txt">
                <div className="ttl truncate">{e.title}</div>
                <div className="sub2">
                  {e.allDay ? 'כל היום' : <span className="ltr">{e.start}–{e.end}</span>} · {KIND_LABEL[e.kind]}
                </div>
              </div>
              <span className="faint">›</span>
            </button>
          )
        })}
        {tasks.map((t) => (
          <div className="item" key={t.id}>
            <Check
              on={t.status === 'done'}
              onClick={() => {
                actions.toggleTaskDone(t.id)
                vibrate()
                toast('הושלם', { label: 'ביטול', run: () => actions.toggleTaskDone(t.id) })
              }}
            />
            <div className="txt">
              <div className="ttl truncate">{t.title}</div>
              <div className="sub2">משימה · {trackById(s, t.trackId)?.name ?? 'ללא מסלול'}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ padding: 10, borderTop: '1px solid var(--line-soft)' }}>
        <input
          className="input"
          placeholder="+ משימה ליום הזה…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              onNewTask(q.trim())
              setQ('')
            }
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// עורך אירוע
// ---------------------------------------------------------------------------
const KINDS: EventKind[] = ['personal', 'block', 'deadline', 'exam', 'milestone', 'birthday', 'holiday']

export function EventSheet({
  ev,
  isNew,
  onClose,
}: {
  ev: CalEvent | null
  isNew?: boolean
  onClose: () => void
}) {
  const s = useApp()
  const toast = useToast()
  const [draft, setDraft] = useState<CalEvent | null>(null)
  const savingRef = useRef(false)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (ev) {
      // מתאפס רק כשנפתח גיליון חדש — לא בסגירה, אחרת דאבל־קליק על "שמירה" עובר
      savingRef.current = false
      setDraft({
        id: ev.id ?? '',
        updatedAt: 0,
        title: ev.title ?? '',
        date: ev.date,
        endDate: ev.endDate,
        start: ev.start ?? '09:00',
        end: ev.end ?? '10:00',
        allDay: ev.allDay ?? false,
        kind: ev.kind ?? 'personal',
        trackId: ev.trackId,
        notes: ev.notes,
        yearly: ev.yearly,
        ruleId: ev.ruleId,
        deep: ev.deep,
      })
    } else setDraft(null)
  }, [ev])

  if (!draft) return null
  const up = (p: Partial<CalEvent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)

  const save = () => {
    // Enter פעמיים או דאבל־קליק על "שמירה" יצרו שני אירועים זהים
    if (savingRef.current) return
    if (!draft.title.trim()) {
      toast('צריך כותרת')
      return
    }
    if (!draft.allDay && draft.start && draft.end && timeToMinutes(draft.end) <= timeToMinutes(draft.start)) {
      toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה')
      return
    }
    savingRef.current = true
    if (isNew) actions.addEvent({ ...draft, title: draft.title.trim() })
    else actions.patchEvent(draft.id, { ...draft, title: draft.title.trim() })
    toast(isNew ? 'האירוע נוסף' : 'נשמר')
    onClose()
  }

  return (
    <>
      <Sheet open onClose={onClose} title={isNew ? 'אירוע חדש' : 'עריכת אירוע'}>
        <Field label="כותרת">
          <input
            className="input"
            value={draft.title}
            autoFocus={isNew}
            onChange={(e) => up({ title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="מה קורה?"
          />
        </Field>

        <div className="row" style={{ marginBottom: 12 }}>
          <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
            כל היום
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={draft.allDay}
            onClick={() => up({ allDay: !draft.allDay })}
          />
        </div>

        <Field label="תאריך">
          <DateField value={draft.date} onChange={(v) => up({ date: v || draft.date })} />
        </Field>

        {!draft.allDay && (
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="field grow">
              <span>התחלה</span>
              <TimeField value={draft.start ?? '09:00'} onChange={(v) => up({ start: v })} />
            </label>
            <label className="field grow">
              <span>סיום</span>
              <TimeField value={draft.end ?? '10:00'} onChange={(v) => up({ end: v })} />
            </label>
          </div>
        )}

        <Field label="סוג">
          <div className="tag-scroll">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`tag${draft.kind === k ? ' on' : ''}`}
                style={
                  draft.kind === k
                    ? { background: kindColor(k), color: onColor(kindColor(k)), borderColor: 'transparent' }
                    : { ['--tc' as any]: kindColor(k) }
                }
                onClick={() => up({ kind: k })}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="מסלול (לא חובה)">
          <div className="tag-scroll">
            <button className={`tag${!draft.trackId ? ' on' : ''}`} style={!draft.trackId ? { background: 'var(--accent)' } : undefined} onClick={() => up({ trackId: undefined })}>
              ללא
            </button>
            {tracks.map((tr) => (
              <button
                key={tr.id}
                className={`tag${draft.trackId === tr.id ? ' on' : ''}`}
                style={
                  draft.trackId === tr.id
                    ? { background: tr.color, color: onColor(tr.color), borderColor: 'transparent' }
                    : { ['--tc' as any]: tr.color }
                }
                onClick={() => up({ trackId: tr.id })}
              >
                {tr.emoji} {tr.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="row" style={{ marginBottom: 12 }}>
          <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
            בלוק Deep Work
            <div className="tiny faint" style={{ fontWeight: 400 }}>מופיע עם כפתור "התחל" בדשבורד</div>
          </span>
          <button className="switch" role="switch" aria-checked={!!draft.deep} onClick={() => up({ deep: !draft.deep })} />
        </div>

        {draft.kind === 'birthday' && (
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
              חוזר כל שנה
            </span>
            <button className="switch" role="switch" aria-checked={!!draft.yearly} onClick={() => up({ yearly: !draft.yearly })} />
          </div>
        )}

        <Field label="הערות">
          <textarea className="textarea" value={draft.notes ?? ''} onChange={(e) => up({ notes: e.target.value })} />
        </Field>

        {draft.ruleId && (
          <div className="card pad tiny muted" style={{ marginBottom: 12 }}>
            זה מופע של בלוק קבוע. שינוי כאן משפיע רק על היום הזה.
            <button
              className="btn xs danger"
              style={{ marginTop: 8 }}
              onClick={() => {
                actions.stopRule(draft.ruleId!, draft.date)
                toast('הסדרה בוטלה מהתאריך הזה והלאה')
                onClose()
              }}
            >
              בטל את כל המופעים מכאן והלאה
            </button>
          </div>
        )}

        <div className="sheet-actions">
          <button className="btn primary grow" onClick={save}>
            שמירה
          </button>
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          {!isNew && (
            <>
              <span className="spacer" />
              <button className="btn danger" onClick={() => setConfirmDel(true)}>
                מחיקה
              </button>
            </>
          )}
        </div>
      </Sheet>

      <Confirm
        open={confirmDel}
        title="למחוק את האירוע?"
        body={draft.ruleId ? 'זה ימחק רק את המופע של היום הזה.' : undefined}
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => {
          actions.deleteEvent(draft.id)
          setConfirmDel(false)
          onClose()
          toast('נמחק')
        }}
      />
    </>
  )
}
