import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { actions, getPersistError, subscribePersistError, useApp, weekLog } from './store'
import { addDays, today as todayISO, weekStart, niceDate } from './dates'
import { ToastHost, useTick } from './ui'
import Today from './views/Today'
import CalendarView from './views/CalendarView'
import Projects from './views/Projects'
import Review, { ReviewLock } from './views/Review'
import SettingsView from './views/Settings'
import { HE_STATUS, installFlush, startCloud, useCloudState } from './cloud'

type View = 'today' | 'calendar' | 'projects' | 'review' | 'settings'

type IconName = 'today' | 'calendar' | 'projects' | 'review' | 'settings'

const PATHS: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l2.8 1.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2.6" />
      <path d="M3.6 10h16.8M8.4 3.6v3.2M15.6 3.6v3.2" />
    </>
  ),
  projects: (
    <>
      <rect x="3.4" y="4.6" width="6.2" height="14.8" rx="1.8" />
      <rect x="14.4" y="4.6" width="6.2" height="9.4" rx="1.8" />
    </>
  ),
  review: (
    <>
      <path d="M4 19.4V13M9.4 19.4V8.2M14.8 19.4v-7.6M20.2 19.4V5.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.1 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

const NAV: Array<{ id: View; label: string }> = [
  { id: 'today', label: 'היום' },
  { id: 'calendar', label: 'יומן' },
  { id: 'projects', label: 'פרויקטים' },
  { id: 'review', label: 'סקירה' },
  { id: 'settings', label: 'הגדרות' },
]

/**
 * גבול שגיאה — אם משהו נופל בזמן ציור, עדיף מסך שאפשר לצאת ממנו
 * (עם ייצוא גיבוי) מאשר דף לבן בלי דרך חזרה.
 */
class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  componentDidCatch(err: Error) {
    console.error(err)
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="app" style={{ padding: 20, maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0 }}>משהו נשבר בטעינה</h3>
          <p className="small muted">
            הנתונים שלך עדיין שמורים בדפדפן. אפשר לייצא אותם לקובץ, ואם זה לא נפתר — לאפס
            ולהתחיל מנתוני הפתיחה.
          </p>
          <p className="tiny faint ltr" style={{ direction: 'ltr', textAlign: 'left' }}>
            {String(this.state.err?.message ?? this.state.err)}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => location.reload()}>
              רענון
            </button>
            <button
              className="btn"
              onClick={() => {
                try {
                  const raw = localStorage.getItem('life-os-v1') ?? '{}'
                  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `life-os-backup-${new Date().toISOString().slice(0, 10)}.json`
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 4000)
                } catch {
                  /* ignore */
                }
              }}
            >
              ייצוא גיבוי
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (!confirm('לאפס את כל הנתונים ולחזור לנתוני הפתיחה?')) return
                try {
                  localStorage.removeItem('life-os-v1')
                  localStorage.setItem('life-os-reset-at', String(Date.now()))
                } catch {
                  /* ignore */
                }
                location.reload()
              }}
            >
              איפוס
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default function App() {
  return (
    <Boundary>
      <AppInner />
    </Boundary>
  )
}

function AppInner() {
  return (
    <ToastHost>
      <Shell />
    </ToastHost>
  )
}

function Shell() {
  const s = useApp()
  const [view, setView] = useState<View>('today')
  const [calDate, setCalDate] = useState<string | undefined>()
  const now = useTick(30000)

  // ערכת נושא
  useEffect(() => {
    const el = document.documentElement
    if (s.settings.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = s.settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      const dark =
        s.settings.theme === 'dark' ||
        (s.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      meta.setAttribute('content', dark ? '#0e1013' : '#f6f7f9')
    }
  }, [s.settings.theme])

  // ענן
  useEffect(() => {
    installFlush()
    startCloud()
  }, [])

  // דופק לטיימר, ויישור מיידי כשחוזרים ללשונית — כדי שטיימר שנשכח פתוח
  // לא יצבור שעות שלא באמת עבדת בהן
  useEffect(() => {
    const i = setInterval(() => actions.touchTimer(), 20000)
    // reconcileNow הוא ממילא no-op כשאין פער, ולכן אפשר לקרוא לו תמיד
    const onBack = () => actions.reconcileNow()
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      clearInterval(i)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
    }
  }, [])

  // התראה אם השמירה המקומית נכשלת
  const saveFailed = useSyncExternalStore(subscribePersistError, getPersistError, getPersistError)

  // כותרת הלשונית מציגה את הטיימר
  useEffect(() => {
    const base = 'מערכת ההפעלה'
    if (!s.timer) {
      document.title = base
      return
    }
    const el = s.timer.accumulated + (s.timer.running ? (Date.now() - s.timer.startedAt) / 60000 : 0)
    const left = Math.max(0, s.timer.targetMinutes - el)
    document.title = `${Math.ceil(left)} דק׳ · ${base}`
  }, [s.timer, now])

  // מקשי קיצור במחשב
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // כשגיליון פתוח, המספרים שייכים לו — לא לניווט
      if (document.querySelector('.scrim')) return
      const map: Record<string, View> = { '1': 'today', '2': 'calendar', '3': 'projects', '4': 'review', '5': 'settings' }
      if (map[e.key]) setView(map[e.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // נעילת סקירה שבועית — הסקירה מסכמת את השבוע שהסתיים, לא את זה שהתחיל
  const reviewWs = addDays(weekStart(todayISO()), -7)
  const wl = weekLog(s, reviewWs)
  const isReviewDay = new Date().getDay() === s.settings.reviewDow
  const snoozed = (wl.snoozeUntil ?? 0) > Date.now()
  const hasData = s.sessions.some((x) => !x.deleted) || s.days.length > 0
  const locked = s.settings.reviewLock && isReviewDay && !wl.review && !snoozed && hasData

  const goto = (v: string, arg?: any) => {
    setView(v as View)
    if (v === 'calendar' && typeof arg === 'string') setCalDate(arg)
  }

  if (locked) {
    return (
      <ReviewLock
        ws={reviewWs}
        onSkip={() => actions.patchWeek(reviewWs, { snoozeUntil: Date.now() + 3 * 3600_000 })}
      />
    )
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <b>מערכת ההפעלה</b>
          <span>{niceDate(todayISO())}</span>
        </div>
        {NAV.map((n) => (
          <button key={n.id} aria-current={view === n.id} onClick={() => setView(n.id)}>
            <Icon name={n.id} />
            {n.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <SyncDot />
        <TimerBadge onClick={() => setView('today')} />
      </nav>

      <header className="topbar">
        <div className="grow">
          <h1>{NAV.find((n) => n.id === view)?.label}</h1>
          <div className="sub">{niceDate(todayISO())}</div>
        </div>
        <SyncDot compact />
        <TimerBadge onClick={() => setView('today')} compact />
      </header>

      <main className="main">
        {saveFailed && (
          <div
            className="card pad"
            style={{ background: 'var(--bad-soft)', borderColor: 'var(--bad)', marginTop: 12 }}
          >
            <b style={{ color: 'var(--bad)' }}>⚠ השמירה המקומית נכשלה</b>
            <div className="tiny muted">
              אחסון הדפדפן מלא או חסום. ייצא גיבוי מההגדרות עכשיו, ובדוק שאתה לא בגלישה פרטית.
            </div>
          </div>
        )}
        {view === 'today' && <Today goto={goto} />}
        {view === 'calendar' && <CalendarView initialDate={calDate} />}
        {view === 'projects' && <Projects />}
        {view === 'review' && <Review />}
        {view === 'settings' && <SettingsView />}
      </main>

      <nav className="bottomnav">
        {NAV.map((n) => (
          <button key={n.id} aria-current={view === n.id} onClick={() => setView(n.id)}>
            <Icon name={n.id} />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function TimerBadge({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const s = useApp()
  useTick(1000)
  if (!s.timer) return null
  const el = s.timer.accumulated + (s.timer.running ? (Date.now() - s.timer.startedAt) / 60000 : 0)
  const left = Math.max(0, s.timer.targetMinutes * 60 - el * 60)
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(Math.floor(left % 60)).padStart(2, '0')
  const over = el >= s.timer.targetMinutes
  return (
    <button
      className="chip on"
      onClick={onClick}
      style={{
        padding: compact ? '5px 10px' : '9px 12px',
        fontVariantNumeric: 'tabular-nums',
        background: over ? 'var(--good-soft)' : undefined,
        color: over ? 'var(--good)' : undefined,
        width: compact ? undefined : '100%',
        justifyContent: 'center',
      }}
    >
      {s.timer.running ? '●' : '⏸'} {over ? 'הושלם' : `${mm}:${ss}`}
    </button>
  )
}

// ---------------------------------------------------------------------------
// מחוון סנכרון — קטן, ורק כשיש מה לומר
// ---------------------------------------------------------------------------
function SyncDot({ compact }: { compact?: boolean }) {
  const { status, lastError } = useCloudState()
  if (status === 'off') return null
  const color: Record<string, string> = {
    synced: 'var(--good)',
    pending: 'var(--warn)',
    sending: 'var(--accent)',
    error: 'var(--bad)',
    offline: 'var(--text-faint)',
  }
  const label = HE_STATUS[status]
  return (
    <div
      className="row"
      title={lastError ? `${label} · ${lastError}` : label}
      style={{
        gap: 6,
        fontSize: 11.5,
        color: 'var(--text-faint)',
        padding: compact ? '0 4px' : '8px 4px',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 999, background: color[status], flexShrink: 0 }}
      />
      {!compact && <span>{label}</span>}
      <span className="sr">{label}</span>
    </div>
  )
}
