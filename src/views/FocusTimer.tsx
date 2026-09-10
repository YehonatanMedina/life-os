import { Icon } from '../icons'
import React, { useEffect, useRef } from 'react'
import { actions, trackById, useApp } from '../store'
import { setFocusMode, useFocusMode, useTick, useToast, vibrate } from '../ui'
import { plural, clock as fmtClock } from '../dates'

// ---------------------------------------------------------------------------
// מצב מיקוד — הטיימר על כל המסך ושום דבר אחר.
// נפתח בלחיצה על הטיימר, נסגר ב-Escape או בכפתור. המסך לא נכבה כל עוד הוא פתוח.
// ---------------------------------------------------------------------------
export default function FocusTimer() {
  const on = useFocusMode()
  const s = useApp()
  const toast = useToast()
  useTick(1000)
  const t = s.timer
  const lockRef = useRef<any>(null)

  // נעילת מסך ער — כדי שהטלפון לא ייכבה באמצע בלוק
  useEffect(() => {
    if (!on) return
    let dead = false
    const req = async () => {
      try {
        lockRef.current = await (navigator as any).wakeLock?.request('screen')
      } catch {
        /* לא נתמך — לא נורא */
      }
    }
    void req()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !dead) void req()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', onVis)
      try {
        lockRef.current?.release?.()
      } catch {
        /* ignore */
      }
      lockRef.current = null
    }
  }, [on])

  useEffect(() => {
    if (!on) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [on])

  // הטיימר נעצר מבחוץ — אין על מה להסתכל
  useEffect(() => {
    if (on && !t) setFocusMode(false)
  }, [on, t])

  if (!on || !t) return null

  const elapsed = t.accumulated + (t.running ? (Date.now() - t.startedAt) / 60000 : 0)
  const target = t.targetMinutes || s.settings.tokenMinutes
  const over = elapsed >= target
  const secs = Math.max(0, over ? (elapsed - target) * 60 : (target - elapsed) * 60)
  const clock = fmtClock(secs)
  const tr = trackById(s, t.trackId)
  const pct = Math.min(100, (elapsed / Math.max(1, target)) * 100)

  return (
    <div className="focus" role="dialog" aria-modal="true" aria-label="מצב מיקוד">
      <button className="focus-x" onClick={() => setFocusMode(false)} aria-label="יציאה ממצב מיקוד">
        ✕
      </button>

      <div className="focus-mid">
        <div className="focus-track">
          {tr ? `${tr.emoji} ${tr.name}` : 'Deep Work'}
          {t.label ? ` · ${t.label}` : ''}
        </div>
        <div className={`focus-time ltr${over ? ' over' : ''}`}>{over ? `+${clock}` : clock}</div>
        <div className="focus-sub">
          {over
            ? 'היעד הושלם — כל דקה נוספת נספרת'
            : `${Math.floor(elapsed)} מתוך ${target} דקות · ${plural(Math.max(0, Math.ceil(target - elapsed)), 'נשארה דקה אחת', 'דקות נשארו')}`}
        </div>
        {!t.running && <div className="focus-paused">מושהה</div>}
      </div>

      <div className="focus-actions">
        {t.running ? (
          <button className="btn" onClick={() => actions.pauseTimer()}>
            <Icon name="pause" /> השהיה
          </button>
        ) : (
          <button className="btn" onClick={() => actions.resumeTimer()}>
            <Icon name="play" /> המשך
          </button>
        )}
        <button
          className="btn primary"
          onClick={() => {
            const mins = actions.stopTimer(true)
            vibrate([30, 40, 30])
            setFocusMode(false)
            toast(
              mins >= 1
                ? `${plural(mins, 'נשמרה דקה אחת', 'דקות נשמרו')} · ${(mins / s.settings.tokenMinutes).toFixed(2)} אסימונים`
                : 'פחות מדקה — לא נשמר.',
            )
          }}
        >
          ✓ סיים ושמור
        </button>
      </div>

      <div className="focus-bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
