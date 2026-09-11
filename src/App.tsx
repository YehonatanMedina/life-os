import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { actions, getPersistError, subscribePersistError, useApp, weekLog } from './store'
import { addDays, clock, today as todayISO, weekStart, niceDate } from './dates'
import { ToastHost, setFocusMode, useTick } from './ui'
import Today from './views/Today'
import CalendarView from './views/CalendarView'
import Projects from './views/Projects'
import Review, { ReviewLock, reviewWeekOf } from './views/Review'
import SettingsView from './views/Settings'
import FocusTimer from './views/FocusTimer'
import AtlasView from './views/Atlas'
import { startAtlas } from './atlas'
import { HE_STATUS, buildId, installFlush, safeToReload, startCloud, useCloudState } from './cloud'
import { refreshNotifySchedule } from './push'
import { Icon } from './icons'

type View = 'today' | 'atlas' | 'calendar' | 'projects' | 'review' | 'settings'

// חמישה יעדים יומיים. ההגדרות לא מתחרות איתם על מקום — הן מאחורי גלגל השיניים.
const NAV: Array<{ id: View; label: string }> = [
  { id: 'today', label: 'היום' },
  { id: 'atlas', label: 'אטלס' },
  { id: 'calendar', label: 'יומן' },
  { id: 'projects', label: 'פרויקטים' },
  { id: 'review', label: 'סקירה' },
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
  // התאריך בכותרת מתעדכן לבד גם אם החלון פתוח לילה שלם
  useTick(60000)

  // ערכת נושא
  useEffect(() => {
    const el = document.documentElement
    if (s.settings.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = s.settings.theme
    const dark =
      s.settings.theme === 'dark' ||
      (s.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    // שני תגים עם media: במצב "מערכת" כל תג חוזר לצבע שלו והדפדפן בוחר לפי המערכת
    // (וגם עוקב אחרי שינוי שלה בלי JS); בערכה מפורשת שניהם מקבלים את אותו צבע.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      const own = m.media.includes('dark') ? '#0e1013' : '#f6f7f9'
      m.setAttribute('content', s.settings.theme === 'system' ? own : dark ? '#0e1013' : '#f6f7f9')
    })
  }, [s.settings.theme])

  // ענן
  useEffect(() => {
    installFlush()
    startCloud()
    startAtlas()
    // רענון לוח ההתראות בפתיחה (פועל רק במכשיר שההתראות דלוקות בו)
    window.setTimeout(() => refreshNotifySchedule(), 4000)
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

  // גרסה חדשה באוויר? בודקים בפתיחה, בחזרה למסך וכל עשר דקות. אם המכשיר
  // היה ברקע — מרעננים לבד (רגע טבעי); אם הוא פעיל — מציעים כפתור.
  const [newBuild, setNewBuild] = useState(false)
  useEffect(() => {
    const mine = buildId()
    if (mine === 'dev') return
    let hiddenSince = 0
    const check = async (auto: boolean) => {
      try {
        const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
        const m = html.match(/name="build" content="([^"]+)"/)
        if (m && m[1] !== mine) {
          // מרעננים לבד רק כשזה בטוח: הכל נשלח, ואין טיימר באמצע
          if (auto && safeToReload()) location.reload()
          else setNewBuild(true)
        }
      } catch {
        /* אין רשת — בפעם הבאה */
      }
    }
    void check(false)
    const i = setInterval(() => void check(false), 10 * 60_000)
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenSince = Date.now()
      else if (hiddenSince && Date.now() - hiddenSince > 60_000) void check(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(i)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // כותרת הלשונית מציגה את הטיימר — אינטרוול משלה, בלי לצייר את כל העץ מחדש
  useEffect(() => {
    const base = 'מערכת ההפעלה'
    const t = s.timer
    if (!t) {
      document.title = base
      return
    }
    const upd = () => {
      const el = t.accumulated + (t.running ? (Date.now() - t.startedAt) / 60000 : 0)
      document.title = `${Math.ceil(Math.max(0, t.targetMinutes - el))} דק׳ · ${base}`
    }
    upd()
    if (!t.running) return
    const i = window.setInterval(upd, 1000)
    return () => clearInterval(i)
  }, [s.timer])

  // מקשי קיצור במחשב
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // כשגיליון פתוח, המספרים שייכים לו — לא לניווט
      if (document.querySelector('.scrim')) return
      const map: Record<string, View> = { '1': 'today', '2': 'atlas', '3': 'calendar', '4': 'projects', '5': 'review', '6': 'settings', ',': 'settings' }
      if (map[e.key]) setView(map[e.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // נעילת סקירה שבועית — הסקירה מסכמת את השבוע שהסתיים, לא את זה שהתחיל
  const reviewWs = reviewWeekOf(todayISO())
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
        <div className="foot">
          <TimerBadge onClick={() => setFocusMode(true)} />
          <SyncDot />
          <button aria-current={view === 'settings'} onClick={() => setView('settings')}>
            <Icon name="settings" />
            הגדרות
          </button>
        </div>
      </nav>

      <header className="topbar">
        <div className="grow">
          <h1>{view === 'settings' ? 'הגדרות' : NAV.find((n) => n.id === view)?.label}</h1>
          <div className="sub">{niceDate(todayISO())}</div>
        </div>
        <TimerBadge onClick={() => setFocusMode(true)} compact />
        <SyncDot compact />
        <button
          className="iconbtn"
          aria-label="הגדרות"
          aria-current={view === 'settings'}
          onClick={() => setView('settings')}
        >
          <Icon name="settings" />
        </button>
      </header>

      <main className="main">
        {newBuild && (
          <div className="card pad spread" style={{ borderColor: 'var(--accent)', marginTop: 12 }}>
            <div className="small">
              <b>יש גרסה חדשה של האפליקציה.</b>
              <div className="tiny faint">רענון קצר, שום דבר לא הולך לאיבוד.</div>
            </div>
            <button className="btn sm primary" onClick={() => location.reload()}>
              עדכון
            </button>
          </div>
        )}
        {saveFailed && (
          <div className="card rail alert" style={{ ['--rail' as any]: 'var(--bad)', marginTop: 12 }}>
            <div className="txt">
            <b style={{ color: 'var(--bad-text)' }}>השמירה המקומית נכשלה</b>
            <div className="tiny muted">
              אחסון הדפדפן מלא או חסום. ייצא גיבוי מההגדרות עכשיו, ובדוק שאתה לא בגלישה פרטית.
            </div>
            </div>
          </div>
        )}
        {view === 'today' && <Today goto={goto} />}
        {view === 'atlas' && <AtlasView />}
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

      <FocusTimer />
    </div>
  )
}

function TimerBadge({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const s = useApp()
  useTick(s.timer ? 1000 : null)
  if (!s.timer) return null
  const el = s.timer.accumulated + (s.timer.running ? (Date.now() - s.timer.startedAt) / 60000 : 0)
  const left = Math.max(0, s.timer.targetMinutes * 60 - el * 60)
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
      <Icon name={s.timer.running ? 'today' : 'pause'} sm /> {over ? 'הושלם' : clock(left)}
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
