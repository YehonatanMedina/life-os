import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// גיליון / מודאל
// ---------------------------------------------------------------------------
// מונה גלובלי של גיליונות פתוחים — מונע מצב שבו סגירת גיליון פנימי
// משאירה את הדף נעול לתמיד
let openSheets = 0
function lockScroll() {
  openSheets++
  // אלמנט הגלילה כאן הוא html ולא body (html,body,#root { height:100% }),
  // אז נועלים את שניהם — אחרת הדף גולל מאחורי הגיליון.
  if (openSheets === 1) {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
}
/**
 * אחרי סגירת גיליון — חוסם קליקים לרגע, כדי שהקליק השני של דאבל־טאפ
 * לא ינחת על מה שהיה מתחת לגיליון (למשל סרגל הניווט).
 */
function shieldClicks(ms = 350) {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent'
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), ms)
}

function unlockScroll() {
  openSheets = Math.max(0, openSheets - 1)
  if (openSheets === 0) {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    shieldClicks()
  }
}

// מחסנית — Escape סוגר רק את הגיליון העליון
const escStack: Array<() => void> = []

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const entry = () => closeRef.current()
    escStack.push(entry)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (escStack[escStack.length - 1] !== entry) return
      e.stopPropagation()
      entry()
    }
    document.addEventListener('keydown', onKey)
    lockScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = escStack.indexOf(entry)
      if (i !== -1) escStack.splice(i, 1)
      unlockScroll()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet"
        style={wide ? { maxWidth: 760 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
      >
        <div className="grip" />
        {title && (
          <div className="spread" style={{ marginBottom: 10 }}>
            <h3>{title}</h3>
            <button className="btn ghost sm" onClick={onClose} aria-label="סגירה">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// טוסט
// ---------------------------------------------------------------------------
type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [msgs, setMsgs] = useState<ToastMsg[]>([])
  const idRef = useRef(1)

  const push = useCallback((text: string, action?: ToastMsg['action']) => {
    const id = idRef.current++
    setMsgs((m) => [...m.slice(-2), { id, text, action }])
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), action ? 7000 : 2600)
  }, [])

  // הודעה עם כפתור פעולה (למשל "ביטול") לא נדרסת על ידי הודעה רגילה
  const shown = [...msgs].reverse().find((m) => m.action) ?? msgs[msgs.length - 1]

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {shown && (
        <div className="toast" role="status" aria-live="polite">
          <div>
            <span>{shown.text}</span>
            {shown.action && (
              <button
                onClick={() => {
                  shown.action!.run()
                  setMsgs([])
                }}
              >
                {shown.action!.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// טבעת התקדמות
// ---------------------------------------------------------------------------
export function Ring({
  value,
  max,
  size = 150,
  stroke = 13,
  color = 'var(--accent)',
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  color?: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="inner">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// פריטי טופס
// ---------------------------------------------------------------------------
export function Check({ on, onClick, sm }: { on: boolean; onClick: () => void; sm?: boolean }) {
  return (
    <button
      className={`check${on ? ' on' : ''}${sm ? ' sm' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-pressed={on}
      aria-label="סמן כבוצע"
    >
      ✓
    </button>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      className="switch"
      aria-checked={on}
      aria-label={label}
      role="switch"
      onClick={() => onChange(!on)}
    />
  )
}

/** טקסט קריא מעל צבע מלא — לפי בהירות הצבע */
export function onColor(hex?: string): string {
  if (!hex) return '#fff'
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (full.length < 6) return '#fff'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lin = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.42 ? '#16181d' : '#ffffff'
}

export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="bar">
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/**
 * שדה עם כותרת. כברירת מחדל לא label אמיתי — כי הרבה מהשדות כאן הם קבוצות
 * כפתורים, ולחיצה על הכיתוב הייתה מפעילה את הכפתור הראשון.
 * כשהתוכן הוא שדה קלט יחיד, `htmlFor` הופך אותו ל-label תקין.
 */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  if (htmlFor) {
    return (
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor={htmlFor}>{label}</label>
        {children}
      </div>
    )
  }
  return (
    <div className="field" style={{ marginBottom: 12 }} role="group" aria-label={label}>
      <span>{label}</span>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// אישור
// ---------------------------------------------------------------------------
export function Confirm({
  open,
  title,
  body,
  confirmLabel = 'מחיקה',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {body && <p className="muted" style={{ marginTop: 0 }}>{body}</p>}
      <div className="sheet-actions">
        <button className="btn grow" onClick={onCancel}>
          ביטול
        </button>
        <button className="btn danger grow" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// טיק כל שנייה — לטיימר ולקו "עכשיו"
// ---------------------------------------------------------------------------
export function useTick(ms = 1000): number {
  const [, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
  return Date.now()
}

// ---------------------------------------------------------------------------
// צליל קצר (ללא קבצים חיצוניים)
// ---------------------------------------------------------------------------
export function ding() {
  try {
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [880, 1174.7, 1318.5]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.5)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.16)
      o.stop(ctx.currentTime + i * 0.16 + 0.55)
    })
    setTimeout(() => ctx.close(), 1600)
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// בורר תאריך בעברית (במקום input[type=date] שמציג פורמט אמריקאי)
// ---------------------------------------------------------------------------
import {
  HE_DAYS_SHORT, addDays, addMonths, iso, isSameMonth, monthGrid, monthLabel, niceDate,
  parseISO, today as todayISO,
} from './dates'

export function DateField({
  value,
  onChange,
  allowEmpty,
  placeholder = 'ללא תאריך',
}: {
  value?: string
  onChange: (v: string | undefined) => void
  allowEmpty?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(value || todayISO())

  useEffect(() => {
    if (open) setAnchor(value || todayISO())
  }, [open, value])

  const days = monthGrid(anchor)
  const t = todayISO()

  const pick = (d: string) => {
    onChange(d)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="input"
        style={{ textAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => setOpen(true)}
      >
        <span>{value ? niceDate(value, true) : <span className="faint">{placeholder}</span>}</span>
        <span className="faint">📅</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="בחירת תאריך">
        <div className="spread" style={{ marginBottom: 10 }}>
          <div className="row">
            <button type="button" className="btn sm ghost" aria-label="חודש קודם" onClick={() => setAnchor(addMonths(anchor, -1))}>
              ‹
            </button>
            <button type="button" className="btn sm ghost" aria-label="לחודש הבא" onClick={() => setAnchor(addMonths(anchor, 1))}>
              ›
            </button>
          </div>
          <b>{monthLabel(anchor)}</b>
        </div>

        <div className="cal-head">
          {HE_DAYS_SHORT.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cal-grid" style={{ marginBottom: 12 }}>
          {days.map((d) => {
            const sel = d === value
            return (
              <button
                type="button"
                key={d}
                className={`cal-cell${isSameMonth(d, anchor) ? '' : ' out'}`}
                style={{
                  minHeight: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: sel ? 'var(--accent)' : undefined,
                  color: sel ? '#fff' : undefined,
                  fontWeight: d === t ? 800 : 500,
                }}
                onClick={() => pick(d)}
              >
                <span style={{ alignSelf: 'center' }}>{parseISO(d).getDate()}</span>
              </button>
            )
          })}
        </div>

        <div className="row wrap">
          <button type="button" className="btn sm" onClick={() => pick(t)}>
            היום
          </button>
          <button type="button" className="btn sm" onClick={() => pick(addDays(t, 1))}>
            מחר
          </button>
          <button type="button" className="btn sm" onClick={() => pick(addDays(t, 7))}>
            בעוד שבוע
          </button>
          {allowEmpty && (
            <button
              type="button"
              className="btn sm danger"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
              }}
            >
              ללא תאריך
            </button>
          )}
        </div>
      </Sheet>
    </>
  )
}

// ---------------------------------------------------------------------------
// בורר שעה בפורמט 24 שעות
// ---------------------------------------------------------------------------
export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(0)
  const [m, setM] = useState(0)

  useEffect(() => {
    if (!open) return
    const [hh, mm] = (value || '09:00').split(':').map(Number)
    setH(hh || 0)
    setM(mm || 0)
  }, [open, value])

  const commit = (nh: number, nm: number) => {
    onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`)
  }

  return (
    <>
      <button
        type="button"
        className="input ltr"
        style={{ textAlign: 'center', fontWeight: 700, width: '100%' }}
        onClick={() => setOpen(true)}
      >
        {value || '--:--'}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="בחירת שעה">
        <div className="center" style={{ marginBottom: 14 }}>
          <span className="ltr" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.03em' }}>
            {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
          </span>
        </div>

        <div className="section-title" style={{ marginBottom: 6 }}>שעה</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 14 }}>
          {Array.from({ length: 24 }, (_, i) => i).map((x) => (
            <button
              type="button"
              key={x}
              className={`btn sm${h === x ? ' primary' : ''}`}
              style={{ padding: '8px 0' }}
              onClick={() => {
                setH(x)
                commit(x, m)
              }}
            >
              {String(x).padStart(2, '0')}
            </button>
          ))}
        </div>

        <div className="section-title" style={{ marginBottom: 6 }}>דקות</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 16 }}>
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((x) => (
            <button
              type="button"
              key={x}
              className={`btn sm${m === x ? ' primary' : ''}`}
              style={{ padding: '8px 0' }}
              onClick={() => {
                setM(x)
                commit(h, x)
              }}
            >
              {String(x).padStart(2, '0')}
            </button>
          ))}
        </div>

        <button type="button" className="btn primary block" onClick={() => setOpen(false)}>
          אישור
        </button>
      </Sheet>
    </>
  )
}

// ---------------------------------------------------------------------------
// שדה מספר שאפשר באמת לרוקן ולהקליד מחדש (החיתוך קורה ביציאה מהשדה)
// ---------------------------------------------------------------------------
export function NumField({
  value,
  onChange,
  min = 0,
  max = 9999,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  const [txt, setTxt] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setTxt(String(value))
  }, [value, focused])

  const commit = () => {
    setFocused(false)
    const n = Number(txt)
    if (txt.trim() === '' || Number.isNaN(n)) {
      setTxt(String(value))
      return
    }
    const clamped = Math.max(min, Math.min(max, Math.round(n)))
    setTxt(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
      <input
        className="ltr grow"
        style={{
          textAlign: 'center',
          border: 0,
          background: 'none',
          outline: 'none',
          padding: '6px 0',
          fontWeight: 600,
          minWidth: 0,
        }}
        inputMode="numeric"
        value={txt}
        onFocus={() => setFocused(true)}
        onChange={(e) => setTxt(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {suffix && <span className="tiny faint" style={{ flexShrink: 0 }}>{suffix}</span>}
    </div>
  )
}
