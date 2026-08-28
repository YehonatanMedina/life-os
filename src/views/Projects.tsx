import React, { useEffect, useMemo, useState } from 'react'
import { actions, alive, capacityBetween, minutesByTrack, nextOrder, trackById, useApp, uid } from '../store'
import { PHASES } from '../seed'
import { addDays, countdownText, diffDays, minutesToHM, plural, shortDate, shortDateY, today as todayISO } from '../dates'
import { Bar, Check, Confirm, DateField, Field, NumField, onColor, Sheet, useToast, vibrate } from '../ui'
import { STATUS_LABEL, TASK_STATUSES } from '../types'
import type { ID, SubTask, Task, TaskStatus, Track } from '../types'

export default function Projects() {
  const s = useApp()
  const tracks = useMemo(() => alive(s.tracks).filter((t) => t.board).sort((a, b) => a.order - b.order), [s.tracks])
  const [sel, setSel] = useState<ID | 'all'>(tracks[0]?.id ?? 'all')
  const [editing, setEditing] = useState<Task | null>(null)
  const [newTrack, setNewTrack] = useState(false)

  useEffect(() => {
    if (sel !== 'all' && !tracks.some((t) => t.id === sel)) setSel(tracks[0]?.id ?? 'all')
  }, [tracks, sel])

  const [q, setQ] = useState('')
  const tasks = useMemo(() => {
    const all = alive(s.tasks)
    const byTrack = sel === 'all' ? all : all.filter((t) => t.trackId === sel)
    const needle = q.trim()
    if (!needle) return byTrack
    return alive(s.tasks).filter(
      (t) => t.title.includes(needle) || (t.notes ?? '').includes(needle),
    )
  }, [s.tasks, sel, q])

  const track = sel === 'all' ? undefined : tracks.find((t) => t.id === sel)
  const mins = minutesByTrack(alive(s.sessions))

  return (
    <div className="stack" style={{ paddingTop: 12 }}>
      <div className="desk-head">
        <h1>פרויקטים</h1>
        <div className="sub">כל מטרה גדולה מפורקת לצעדים שאפשר לעשות היום</div>
      </div>

      <div className="tag-scroll">
        <button
          className={`tag${sel === 'all' ? ' on' : ''}`}
          style={sel === 'all' ? { background: 'var(--accent)' } : undefined}
          onClick={() => setSel('all')}
        >
          הכל
        </button>
        {tracks.map((t) => {
          const open = alive(s.tasks).filter((x) => x.trackId === t.id && x.status !== 'done').length
          return (
            <button
              key={t.id}
              className={`tag${sel === t.id ? ' on' : ''}`}
              style={
                sel === t.id
                  ? { background: t.color, color: onColor(t.color), borderColor: 'transparent' }
                  : { ['--tc' as any]: t.color }
              }
              onClick={() => setSel(t.id)}
            >
              {t.emoji} {t.name}
              {open > 0 && (
                <>
                  {' · '}
                  <span className="ltr" style={{ opacity: 0.9 }}>{open}</span>
                </>
              )}
            </button>
          )
        })}
        <button className="tag" onClick={() => setNewTrack(true)}>
          + מסלול
        </button>
      </div>

      <input
        className="input"
        placeholder="חיפוש בכל המשימות…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {track && !q.trim() && <TrackHeader track={track} minutes={mins[track.id] ?? 0} />}
      {sel === 'all' && !q.trim() && <AllTracksHeader />}
      {!!q.trim() && (
        <div className="tiny faint">
          {tasks.length === 0 ? 'לא נמצאו משימות' : `${plural(tasks.length, 'תוצאה אחת', 'תוצאות')} בכל המסלולים`}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="card pad">
          <div className="empty" style={{ padding: '6px 0' }}>
            {q.trim()
              ? 'לא נמצאו משימות.'
              : 'הלוח ריק. כתוב משימה בשורה שבעמודת "לביצוע" — או הוסף אחת ממסך "היום".'}
          </div>
        </div>
      )}
      <Board
        tasks={tasks}
        onOpen={setEditing}
        defaultTrack={sel === 'all' ? tracks[0]?.id ?? '' : sel}
        defaultTrackName={(sel === 'all' ? tracks[0] : tracks.find((x) => x.id === sel))?.name}
        showTrack={sel === 'all' || !!q.trim()}
      />

      <TaskSheet task={editing} onClose={() => setEditing(null)} />
      <TrackSheet open={newTrack} onClose={() => setNewTrack(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function TrackHeader({ track, minutes }: { track: Track; minutes: number }) {
  const s = useApp()
  const [edit, setEdit] = useState(false)
  const tasks = alive(s.tasks).filter((t) => t.trackId === track.id)
  const done = tasks.filter((t) => t.status === 'done').length
  const remainingEst = tasks.filter((t) => t.status !== 'done').reduce((a, t) => a + (t.est ?? 0), 0)
  // משימות בלי הערכה לא נספרות באסימונים — עדיף לומר את זה מלהראות מספר שקרי
  const noEst = tasks.filter((t) => t.status !== 'done' && !t.est).length
  const nextDeadline = alive(s.events)
    .filter(
      (e) =>
        e.trackId === track.id &&
        e.date >= todayISO() &&
        (e.kind === 'deadline' || e.kind === 'exam' || e.kind === 'milestone'),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const daysLeft = nextDeadline ? Math.max(1, diffDays(todayISO(), nextDeadline.date)) : 1
  // קיבולת אמיתית ולא "5 כפול ימי לוח": חגים אפס, ערבי חג חצי, שישי־שבת פחות
  const capacityLeft = nextDeadline ? capacityBetween(s, todayISO(), nextDeadline.date) : 0

  return (
    <>
      <div className="card pad rail" style={{ ['--rail' as any]: track.color }}>
        <div className="spread">
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>
              {track.emoji} {track.name}
            </b>
            {track.goal && <div className="tiny faint">{track.goal}</div>}
          </div>
          <button className="btn ghost sm" aria-label="עריכת המסלול" onClick={() => setEdit(true)}>
            ⚙
          </button>
        </div>
        <div className="grid3" style={{ marginTop: 12 }}>
          <div>
            <div className="tiny faint">נשאר לעשות</div>
            <b>{tasks.length === 0 ? '—' : plural(remainingEst, 'אסימון אחד', 'אסימונים')}</b>
            <div className="tiny faint">
              {tasks.length === 0 ? (
                'עוד אין משימות במסלול'
              ) : (
                <>
                  <span className="ltr">{done}</span> מתוך <span className="ltr">{tasks.length}</span> הושלמו
                  {noEst > 0 && <div style={{ color: 'var(--warn)' }}>{noEst} בלי הערכה</div>}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="tiny faint">זמן שהושקע</div>
            <b>{minutesToHM(minutes)}</b>
          </div>
          <div>
            <div className="tiny faint">היעד הבא</div>
            <b className="truncate" style={{ display: 'block' }}>
              {nextDeadline ? countdownText(diffDays(todayISO(), nextDeadline.date)) : '—'}
            </b>
            {nextDeadline && (
              <div className="tiny faint ltr">{shortDate(nextDeadline.date)}</div>
            )}
          </div>
        </div>
        {nextDeadline && remainingEst > 0 && (
          <div
            className="tiny"
            style={{
              marginTop: 10,
              color: remainingEst > capacityLeft ? 'var(--bad)' : 'var(--text-faint)',
            }}
          >
            {/* המסלול הזה לבדו — לא הבטחה שהכל ביחד נכנס. הסכום של כל המסלולים מוצג בכרטיס "היום". */}
            {remainingEst > capacityLeft
              ? `לא נכנס: ${plural(remainingEst, 'אסימון אחד', 'אסימונים')} מול קיבולת של ${capacityLeft} עד ${shortDateY(nextDeadline.date)}. משהו חייב לרדת.`
              : `${remainingEst} מתוך ${capacityLeft} אסימוני הקיבולת עד ${shortDateY(nextDeadline.date)} — נכנס.`}
          </div>
        )}
        {tasks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Bar value={done} max={tasks.length} color={track.color} />
          </div>
        )}
      </div>
      <TrackSheet open={edit} onClose={() => setEdit(false)} track={track} />
    </>
  )
}

// ---------------------------------------------------------------------------
function Board({
  tasks,
  onOpen,
  defaultTrack,
  defaultTrackName,
  showTrack,
}: {
  tasks: Task[]
  onOpen: (t: Task) => void
  defaultTrack: ID
  defaultTrackName?: string
  /** במצב "הכל" ובחיפוש — בלי שם המסלול אי אפשר לדעת למי הכרטיס שייך */
  showTrack?: boolean
}) {
  const [dragId, setDragId] = useState<ID | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)

  const byStatus = (st: TaskStatus) =>
    tasks
      .filter((t) => t.status === st)
      .sort((a, b) => {
        if (st === 'done') return (b.doneAt ?? 0) - (a.doneAt ?? 0)
        const ad = a.due ?? '9999'
        const bd = b.due ?? '9999'
        return ad.localeCompare(bd) || a.order - b.order
      })

  return (
    <div className="kanban">
      {TASK_STATUSES.map((st) => {
        const list = byStatus(st)
        return (
          <div
            key={st}
            className={`kcol${over === st ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(st)
            }}
            onDragLeave={() => setOver((o) => (o === st ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              if (dragId) {
                actions.patchTask(dragId, {
                  status: st,
                  doneAt: st === 'done' ? Date.now() : undefined,
                })
                setDragId(null)
              }
            }}
          >
            <h4>
              <span>{STATUS_LABEL[st]}</span>
              <span className="faint">{list.length}</span>
            </h4>

            {list.map((t) => (
              <Card
                key={t.id}
                t={t}
                onOpen={onOpen}
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => setDragId(null)}
                dragging={dragId === t.id}
                showTrack={showTrack}
              />
            ))}

            {st === 'todo' && <QuickAdd trackId={defaultTrack} trackName={defaultTrackName} />}
            {list.length === 0 && st !== 'todo' && <div className="tiny faint center" style={{ padding: '10px 0' }}>ריק</div>}
          </div>
        )
      })}
    </div>
  )
}

function Card({
  t,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
  showTrack,
}: {
  t: Task
  onOpen: (t: Task) => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
  showTrack?: boolean
}) {
  const s = useApp()
  const tr = trackById(s, t.trackId)
  const late = t.due && t.due < todayISO() && t.status !== 'done'
  const subDone = (t.sub ?? []).filter((x) => x.done).length

  // מחזוריות בלי "הושלם" — סימון השלמה יש לו כפתור נפרד, כדי שלא ייווצר
  // doneAt מזויף בדרך מ"ממתין" ל"לביצוע"
  const CYCLE: TaskStatus[] = ['todo', 'doing', 'waiting']
  const nextStatus = (): TaskStatus => {
    const i = CYCLE.indexOf(t.status)
    return CYCLE[(i + 1) % CYCLE.length]
  }

  return (
    <div
      className={`kcard${dragging ? ' dragging' : ''}`}
      style={{ ['--rail' as any]: tr?.color ?? 'var(--line)' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(t)
        }
      }}
      draggable
      onDragStart={(e) => {
        // בלי setData פיירפוקס לא מתחיל גרירה בכלל
        try {
          e.dataTransfer.setData('text/plain', t.id)
          e.dataTransfer.effectAllowed = 'move'
        } catch {
          /* ignore */
        }
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(t)}
    >
      <div className="t" style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined, opacity: t.status === 'done' ? 0.6 : 1 }}>
        {t.title}
      </div>
      <div className="m">
        {showTrack &&
          (tr ? (
            <span className="chip tinted" style={{ ['--c' as any]: tr.color }}>
              {tr.emoji} {tr.name}
            </span>
          ) : (
            <span className="chip">ללא מסלול</span>
          ))}
        {t.critical && <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>קריטי</span>}
        {t.due && (
          <span
            className="chip"
            style={
              late
                ? { background: 'var(--bad-soft)', color: 'var(--bad)' }
                : t.due === todayISO()
                  ? { background: 'var(--accent-soft, rgba(107,92,255,.15))', color: 'var(--accent)', fontWeight: 700 }
                  : undefined
            }
          >
            {t.due === todayISO() ? 'היום' : shortDate(t.due)}
          </span>
        )}
        {!!t.est && <span className="chip">{plural(t.est, 'אסימון אחד', 'אסימונים')}</span>}
        {(t.sub?.length ?? 0) > 0 && (
          <span className="chip">
            ☑ {subDone}/{t.sub!.length}
          </span>
        )}
        <span className="grow" />
        <span className="row" style={{ gap: 2, flexShrink: 0 }}>
        <button
          className="btn xs ghost"
          title="העבר לשלב הבא"
          aria-label="העבר לשלב הבא"
          onClick={(e) => {
            e.stopPropagation()
            actions.patchTask(t.id, { status: nextStatus(), doneAt: undefined })
            vibrate()
          }}
        >
          ←
        </button>
        <button
          className="btn xs ghost"
          title={t.status === 'done' ? 'החזר לביצוע' : 'סמן כהושלם'}
          aria-label={t.status === 'done' ? 'החזר לביצוע' : 'סמן כהושלם'}
          style={t.status === 'done' ? { color: 'var(--good)' } : undefined}
          onClick={(e) => {
            e.stopPropagation()
            actions.toggleTaskDone(t.id)
            vibrate()
          }}
        >
          ✓
        </button>
        </span>
      </div>
    </div>
  )
}

function QuickAdd({ trackId, trackName }: { trackId: ID; trackName?: string }) {
  const [v, setV] = useState('')
  const toast = useToast()
  if (!trackId) {
    return <div className="tiny faint center" style={{ padding: '10px 4px' }}>צור מסלול כדי להוסיף משימות</div>
  }
  return (
    <input
      className="input"
      style={{ padding: '9px 10px' }}
      placeholder={trackName ? `+ משימה ל${trackName}` : '+ משימה חדשה'}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) {
          actions.addTask({ title: v.trim(), trackId })
          setV('')
          toast(`נוספה ל${trackName ?? 'מסלול'}`)
        }
      }}
    />
  )
}

// ---------------------------------------------------------------------------
export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const s = useApp()
  const toast = useToast()
  const [d, setD] = useState<Task | null>(null)
  const [del, setDel] = useState(false)
  const [newSub, setNewSub] = useState('')

  useEffect(() => setD(task ? { ...task, sub: task.sub ? [...task.sub] : [] } : null), [task])
  if (!d) return null

  const up = (p: Partial<Task>) => setD((x) => (x ? { ...x, ...p } : x))
  const tracks = alive(s.tracks).sort((a, b) => a.order - b.order)

  const save = () => {
    if (!d.title.trim()) return toast('צריך כותרת')
    actions.patchTask(d.id, { ...d, title: d.title.trim() })
    toast('המשימה נשמרה')
    onClose()
  }

  return (
    <>
      <Sheet open onClose={onClose} title="משימה">
        <Field label="כותרת">
          <input
            className="input"
            value={d.title}
            onChange={(e) => up({ title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </Field>

        <Field label="שלב">
          <div className="row" style={{ gap: 4 }}>
            {TASK_STATUSES.map((st) => (
              <button
                key={st}
                className={`btn sm grow${d.status === st ? ' primary' : ''}`}
                onClick={() => up({ status: st, doneAt: st === 'done' ? Date.now() : undefined })}
              >
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="מסלול">
          <div className="tag-scroll">
            {tracks.map((tr) => (
              <button
                key={tr.id}
                className={`tag${d.trackId === tr.id ? ' on' : ''}`}
                style={
                  d.trackId === tr.id
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
          <label className="field grow">
            <span>תאריך יעד</span>
            <div className="row" style={{ gap: 4, marginBottom: 6 }}>
              {([
                ['היום', todayISO()],
                ['מחר', addDays(todayISO(), 1)],
                ['בלי תאריך', undefined],
              ] as const).map(([lbl, v]) => (
                <button
                  key={lbl}
                  className={`btn xs${d.due === v ? ' primary' : ''}`}
                  onClick={() => up({ due: v })}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <DateField value={d.due} allowEmpty onChange={(v) => up({ due: v })} />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>אסימונים</span>
            <NumField value={d.est ?? 0} min={0} max={40} onChange={(v) => up({ est: v })} />
          </label>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <span className="grow" style={{ fontWeight: 700, fontSize: 13.5 }}>
            על הנתיב הקריטי
            <div className="tiny faint" style={{ fontWeight: 400 }}>אם זה נופל — הכל נופל</div>
          </span>
          <button className="switch" role="switch" aria-checked={!!d.critical} onClick={() => up({ critical: !d.critical })} />
        </div>

        <Field label="תת־משימות">
          <div className="list card" style={{ marginBottom: 8 }}>
            {(d.sub ?? []).length === 0 && <div className="empty tiny">אין תת־משימות</div>}
            {(d.sub ?? []).map((x) => (
              <div className="item" key={x.id} style={{ minHeight: 42 }}>
                <Check
                  sm
                  on={x.done}
                  onClick={() =>
                    setD((cur) =>
                      cur
                        ? { ...cur, sub: (cur.sub ?? []).map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)) }
                        : cur,
                    )
                  }
                />
                <div className="txt small" style={{ textDecoration: x.done ? 'line-through' : undefined }}>
                  {x.text}
                </div>
                <button
                  className="btn ghost xs"
                  aria-label={`מחיקת תת־המשימה ${x.text}`}
                  onClick={() => setD((cur) => (cur ? { ...cur, sub: (cur.sub ?? []).filter((y) => y.id !== x.id) } : cur))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <input
            className="input"
            placeholder="+ תת־משימה"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSub.trim()) {
                const sub: SubTask = { id: uid('sub'), text: newSub.trim(), done: false }
                setD((cur) => (cur ? { ...cur, sub: [...(cur.sub ?? []), sub] } : cur))
                setNewSub('')
              }
            }}
          />
        </Field>

        <Field label="הערות">
          <textarea className="textarea" value={d.notes ?? ''} onChange={(e) => up({ notes: e.target.value })} />
        </Field>

        <div className="sheet-actions">
          <button className="btn primary grow" onClick={save}>
            שמירה
          </button>
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          <span className="spacer" />
          <button className="btn danger" onClick={() => setDel(true)}>
            מחיקה
          </button>
        </div>
      </Sheet>

      <Confirm
        open={del}
        title="למחוק את המשימה?"
        onCancel={() => setDel(false)}
        onConfirm={() => {
          actions.deleteTask(d.id)
          setDel(false)
          onClose()
          toast('המשימה נמחקה', { label: 'ביטול', run: () => actions.restoreTask(d.id) })
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
const PALETTE = ['#e5484d', '#f76b15', '#ffb224', '#30a46c', '#12a594', '#0090ff', '#5b5bd6', '#8e4ec6', '#e93d82', '#8b8d98']

export function TrackSheet({ open, onClose, track }: { open: boolean; onClose: () => void; track?: Track }) {
  const s = useApp()
  const toast = useToast()
  const [d, setD] = useState<Track | null>(null)
  const [del, setDel] = useState(false)

  useEffect(() => {
    if (!open) return setD(null)
    setD(
      track
        ? { ...track }
        : {
            id: uid('trk'),
            updatedAt: 0,
            name: '',
            emoji: '⭐',
            color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
            order: nextOrder(s.tracks),
            board: true,
          },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, track])

  if (!open || !d) return null
  const up = (p: Partial<Track>) => setD((x) => (x ? { ...x, ...p } : x))

  return (
    <>
      <Sheet open onClose={onClose} title={track ? 'עריכת מסלול' : 'מסלול חדש'}>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field" style={{ width: 78 }}>
            <span>אימוג׳י</span>
            <input className="input center" value={d.emoji} maxLength={4} onChange={(e) => up({ emoji: e.target.value })} />
          </label>
          <label className="field grow">
            <span>שם</span>
            <input
              className="input"
              value={d.name}
              onChange={(e) => up({ name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="שם המסלול"
            />
          </label>
        </div>

        <Field label="צבע">
          <div className="row wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => up({ color: c })}
                aria-label={`צבע ${PALETTE.indexOf(c) + 1}`}
                aria-pressed={d.color === c}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: c,
                  border: d.color === c ? '3px solid var(--text)' : '1px solid var(--line)',
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="המטרה במשפט אחד">
          <input className="input" value={d.goal ?? ''} onChange={(e) => up({ goal: e.target.value })} />
        </Field>

        <div className="sheet-actions">
          <button
            className="btn primary grow"
            onClick={() => {
              if (!d.name.trim()) return toast('צריך שם')
              actions.upsertTrack({ ...d, name: d.name.trim() })
              toast('נשמר')
              onClose()
            }}
          >
            שמירה
          </button>
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          {track && (
            <>
              <span className="spacer" />
              <button className="btn danger" onClick={() => setDel(true)}>
                מחיקה
              </button>
            </>
          )}
        </div>
      </Sheet>

      <Confirm
        open={del}
        title="למחוק את המסלול?"
        body="המשימות שלו יישארו אבל בלי מסלול."
        onCancel={() => setDel(false)}
        onConfirm={() => {
          actions.deleteTrack(d.id)
          setDel(false)
          onClose()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// מבט־על על כל המסלולים — המספר היחיד שעונה על "האם אני בכלל עומד בזה"
// ---------------------------------------------------------------------------
function AllTracksHeader() {
  const s = useApp()
  const open = alive(s.tasks).filter((t) => t.status !== 'done')
  const est = open.reduce((a, t) => a + (t.est ?? 0), 0)
  // ההתחייבות הכובלת הקרובה — לא הרחוקה. אחרת הכרטיס תמיד מרגיע.
  const next = alive(s.events)
    .filter(
      (e) =>
        (e.kind === 'deadline' || e.kind === 'exam' || e.kind === 'milestone') && e.date >= todayISO(),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const cap = next ? capacityBetween(s, todayISO(), next.date) : 0
  const over = !!next && est > cap
  const noEst = open.filter((t) => !t.est).length

  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 8 }}>
        <b>כל המסלולים</b>
        <span className="tiny faint">{plural(open.length, 'משימה אחת פתוחה', 'משימות פתוחות')}</span>
      </div>
      {next ? (
        <div className="tiny" style={over ? { color: 'var(--bad)', fontWeight: 700 } : { color: 'var(--text-faint)' }}>
          {est} אסימונים פתוחים מול קיבולת של {cap} עד {shortDateY(next.date)} ({next.title})
          {over ? ' — לא נכנס. משהו חייב לרדת.' : ' — נכנס.'}
        </div>
      ) : (
        <div className="tiny faint">{est} אסימונים פתוחים. אין יעד קרוב להשוות אליו.</div>
      )}
      {noEst > 0 && (
        <div className="tiny" style={{ color: 'var(--warn)', marginTop: 4 }}>
          {plural(noEst, 'משימה אחת בלי הערכת אסימונים', 'משימות בלי הערכת אסימונים')} — הן לא נספרות במספר הזה.
        </div>
      )}
    </div>
  )
}
