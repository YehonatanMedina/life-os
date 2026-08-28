import React, { useEffect, useMemo, useState } from 'react'
import { actions, alive, store, useApp } from '../store'
import { parseLooseDetailed, plural, shortDate, today as todayISO } from '../dates'
import { Field, onColor, Sheet, useToast } from '../ui'
import { EventSheet } from './CalendarView'
import { kindColor } from './Today'
import { KIND_LABEL } from '../types'
import type { CalEvent, EventKind } from '../types'

// ---------------------------------------------------------------------------
// תאריכים קבועים — ימי הולדת, מבחנים, דדליינים.
// הרעיון: שורה אחת של טקסט חופשי ("30.8 עידו בנון") ואפשר גם להדביק רשימה שלמה.
// ---------------------------------------------------------------------------
const DATE_KINDS: EventKind[] = ['birthday', 'exam', 'deadline', 'milestone', 'personal', 'holiday']
const FILTERS = ['birthday', 'exam', 'deadline', 'milestone', 'personal', 'holiday', 'all'] as const

export default function DatesCard() {
  const s = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [creating, setCreating] = useState<Partial<CalEvent> | null>(null)
  const [bulk, setBulk] = useState(false)
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState<EventKind | 'all'>('birthday')

  const t = todayISO()
  const list = useMemo(() => {
    const all = alive(s.events).filter(
      (e) => !e.ruleId && (filter === 'all' ? DATE_KINDS.includes(e.kind) : e.kind === filter),
    )
    // הקרובים הבאים קודם. לחוזרים שנתית סופרים מהיום ומתגלגלים לשנה הבאה.
    const md = t.slice(5)
    const key = (e: CalEvent) =>
      e.yearly ? (e.date.slice(5) >= md ? '0' : '1') + e.date.slice(5) : (e.date >= t ? '0' : '1') + e.date
    return all.sort((a, b) => key(a).localeCompare(key(b)))
  }, [s.events, filter, t])

  // ב"הכל" אין סוג נבחר — לא ממציאים יום הולדת חוזר, מוסיפים אירוע אישי
  const kindOf = (): EventKind => (filter === 'all' ? 'personal' : filter)

  const addQuick = () => {
    if (!quick.trim()) return
    const parsed = parseLooseDetailed(quick, t)
    if (!parsed.date) {
      toast('לא זיהיתי תאריך. לדוגמה: 30.8 עידו בנון')
      return
    }
    if (!parsed.title) {
      toast('יש תאריך אבל חסר שם')
      return
    }
    const kind = kindOf()
    const yearly = kind === 'birthday'
    const key = `${yearly ? parsed.date.slice(5) : parsed.date}|${parsed.title}`
    const exists = alive(s.events).some(
      (e) => `${e.yearly ? e.date.slice(5) : e.date}|${e.title.trim()}` === key,
    )
    if (exists) {
      toast('זה כבר קיים')
      return
    }
    actions.addEvent({ title: parsed.title, date: parsed.date, allDay: true, kind, yearly })
    setQuick('')
    toast(`נוסף · ${shortDate(parsed.date)}`)
  }

  return (
    <>
      <div className="card">
        <div className="spread" style={{ padding: '12px 13px 4px' }}>
          <b>תאריכים קבועים</b>
          <span className="tiny faint ltr">{list.length}</span>
        </div>
        <div className="tiny faint" style={{ padding: '0 13px 8px' }}>
          כתוב תאריך ושם באותה שורה ולחץ Enter. עובד גם 30/8, גם 30.8.1999 וגם 2026-08-30.
          {filter === 'all' && ' במצב "הכל" התאריך נוסף כאירוע אישי — בחר סוג כדי לשנות.'}
        </div>

        <div className="tag-scroll" style={{ padding: '0 13px 8px' }}>
          {FILTERS.map((k) => (
            <button
              key={k}
              className={`tag${filter === k ? ' on' : ''}`}
              aria-pressed={filter === k}
              style={
                k === 'all'
                  ? filter === k
                    ? { background: 'var(--accent)' }
                    : undefined
                  : filter === k
                    ? { background: kindColor(k), color: onColor(kindColor(k)), borderColor: 'transparent' }
                    : { ['--tc' as any]: kindColor(k) }
              }
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? 'הכל' : KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="row" style={{ padding: '0 13px 10px', gap: 6 }}>
          <input
            className="input grow"
            value={quick}
            aria-label="תאריך ושם"
            placeholder={filter === 'exam' ? '15.9 מבחן מרוכבות' : '30.8 עידו בנון'}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuick()}
          />
          <button className="btn" onClick={addQuick} disabled={!quick.trim()}>
            הוספה
          </button>
        </div>

        <div className="list">
          {list.length === 0 && <div className="empty">אין כאן תאריכים עדיין.</div>}
          {list.map((e) => (
            <button className="item" key={e.id} onClick={() => setEditing(e)}>
              <div className="txt">
                <div className="ttl">{e.title}</div>
                <div className="sub2">
                  <span className="ltr">{shortDate(e.date)}</span>
                  {e.yearly ? ' · חוזר כל שנה' : ''}
                  {filter === 'all' ? ` · ${KIND_LABEL[e.kind]}` : ''}
                </div>
              </div>
              <span className="faint">›</span>
            </button>
          ))}
        </div>

        <div className="row" style={{ padding: '10px 13px 12px', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => setBulk(true)}>
            הדבקת רשימה
          </button>
          <button
            className="btn sm ghost"
            onClick={() =>
              setCreating({
                date: t,
                allDay: true,
                kind: kindOf(),
                yearly: kindOf() === 'birthday',
              })
            }
          >
            טופס מלא
          </button>
        </div>
      </div>

      <EventSheet ev={editing} onClose={() => setEditing(null)} />
      <EventSheet ev={creating as CalEvent | null} isNew onClose={() => setCreating(null)} />
      <BulkDates open={bulk} onClose={() => setBulk(false)} defaultKind={kindOf()} />
    </>
  )
}

export function BulkDates({
  open,
  onClose,
  defaultKind,
}: {
  open: boolean
  onClose: () => void
  defaultKind: EventKind
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<EventKind>(defaultKind)

  useEffect(() => {
    if (open) {
      setText('')
      setKind(defaultKind)
    }
  }, [open, defaultKind])

  const t = todayISO()
  const rows = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ line: l, parsed: parseLooseDetailed(l, t) })),
    [text, t],
  )
  // כפילויות — אותו שם באותו תאריך שכבר קיים, או שורה שחוזרת בהדבקה עצמה
  const existing = new Set(
    alive(store.get().events).map((e) => `${e.yearly ? e.date.slice(5) : e.date}|${e.title.trim()}`),
  )
  const seen = new Set<string>()
  const parsed = rows.map((r) => {
    if (!r.parsed.date || !r.parsed.title) return { ...r, dup: false }
    const key = `${kind === 'birthday' ? r.parsed.date.slice(5) : r.parsed.date}|${r.parsed.title}`
    const dup = existing.has(key) || seen.has(key)
    seen.add(key)
    return { ...r, dup }
  })
  const good = parsed.filter((r) => r.parsed.date && r.parsed.title && !r.dup)
  const dups = parsed.filter((r) => r.dup)
  const noDate = parsed.filter((r) => !r.parsed.date)
  const noTitle = parsed.filter((r) => r.parsed.date && !r.parsed.title)

  if (!open) return null
  return (
    <Sheet open onClose={onClose} title="הדבקת רשימת תאריכים">
      <p className="small muted" style={{ marginTop: 0 }}>
        שורה לכל תאריך. הסדר לא משנה — "30.8 עידו בנון" ו"עידו בנון 30.8" שניהם עובדים.
      </p>

      <Field label="סוג">
        <div className="tag-scroll">
          {DATE_KINDS.map((k) => (
            <button
              key={k}
              className={`tag${kind === k ? ' on' : ''}`}
              aria-pressed={kind === k}
              style={
                kind === k
                  ? { background: kindColor(k), color: onColor(kindColor(k)), borderColor: 'transparent' }
                  : { ['--tc' as any]: kindColor(k) }
              }
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="הרשימה">
        <textarea
          className="textarea"
          rows={7}
          value={text}
          autoFocus
          placeholder={'30.8 עידו בנון\n31.8 דור\n26.10 ארז אדר'}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      {rows.length > 0 && (
        <div className="tiny" style={{ marginBottom: 10 }}>
          <b>{plural(good.length, 'שורה אחת מוכנה', 'שורות מוכנות')}</b>
          {good.slice(0, 4).map((r, i) => (
            <div key={`${r.line}-${i}`} className="faint">
              <span className="ltr">{shortDate(r.parsed.date as string)}</span> · {r.parsed.title}
            </div>
          ))}
          {good.length > 4 && <div className="faint">…ועוד {good.length - 4}</div>}
          {dups.length > 0 && (
            <div className="faint" style={{ marginTop: 6 }}>
              {plural(dups.length, 'שורה אחת כבר קיימת', 'שורות כבר קיימות')} — יידלגו.
            </div>
          )}
          {noDate.length > 0 && (
            <div style={{ color: 'var(--warn)', marginTop: 6 }}>
              {plural(noDate.length, 'שורה אחת בלי תאריך ברור', 'שורות בלי תאריך ברור')} — יידלגו:
              {noDate.slice(0, 3).map((r, i) => (
                <div key={`${r.line}-${i}`}>· {r.line}</div>
              ))}
            </div>
          )}
          {noTitle.length > 0 && (
            <div style={{ color: 'var(--warn)', marginTop: 6 }}>
              {plural(noTitle.length, 'שורה אחת עם תאריך בלי שם', 'שורות עם תאריך בלי שם')} — יידלגו:
              {noTitle.slice(0, 3).map((r, i) => (
                <div key={`${r.line}-${i}`}>· {r.line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="sheet-actions">
        <button
          className="btn primary"
          disabled={!good.length}
          onClick={() => {
            actions.addEvents(
              good.map((r) => ({
                title: r.parsed.title,
                date: r.parsed.date as string,
                allDay: true,
                kind,
                yearly: kind === 'birthday',
              })),
            )
            toast(good.length === 1 ? 'נוסף תאריך אחד' : `נוספו ${good.length} תאריכים`)
            onClose()
          }}
        >
          הוספה
        </button>
        <button className="btn ghost" onClick={onClose}>
          ביטול
        </button>
      </div>
    </Sheet>
  )
}
