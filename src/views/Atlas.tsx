// ---------------------------------------------------------------------------
// אטלס — מסך השיחה.
// הודעה יוצאת, "אטלס חושב…", ותשובה שחוזרת עם מה שהוא שינה (וכפתור ביטול).
// קלט בקול דרך זיהוי הדיבור של הדפדפן (he-IL) — בלי שרת, בלי עלות.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  atlasReady, canUndo, commandFailed, describeCommand, discardMessage, nextSweepAt, pollAtlas, retrySend, sendToAtlas,
  undoCommand, useAtlas, type AtlasMessage,
} from '../atlas'
import { fastReady } from '../atlasFast'
import { useTick, useToast, vibrate } from '../ui'
import { hhmm, iso, niceDate } from '../dates'

/** תאריך מקומי של הודעה — לפי הזמן האמיתי, לא לפי תחילית המחרוזת */
const dayOf = (at: string) => {
  const ms = Date.parse(at)
  return Number.isFinite(ms) ? iso(new Date(ms)) : at.slice(0, 10)
}

const EXAMPLES = [
  'קבעתי רופא שיניים ביום שלישי ב-16:00, שעה.',
  'תזכיר לי רבע שעה לפני ההרצאה מחר.',
  'סגרתי 3×10 ב-60 ק״ג בסקוואט — מה הלאה?',
  'תבנה לי תוכנית לתקופת המבחנים.',
  'מה הכי חשוב שאעשה עכשיו?',
]

export default function AtlasView() {
  const a = useAtlas()
  const toast = useToast()
  // דופק רק בזמן המתנה לתשובה — לספירת השניות ליד "אטלס חושב…"
  const waiting = a.messages.find((m) => m.from === 'user' && m.pending)
  const now = useTick(waiting ? 1000 : null)
  const [text, setText] = useState('')
  // "משימה גדולה": שליחה ישירה לאטלס העמוק (קוד, תכנון ארוך) — במקום שהמהיר יחליט
  const [deep, setDeep] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // בכניסה למסך — משיכה מיידית
  useEffect(() => {
    void pollAtlas()
  }, [])

  // גלילה לסוף כשמגיעה הודעה
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [a.messages.length])

  const waitedSec = waiting ? Math.max(0, Math.round((now - Date.parse(waiting.at)) / 1000)) : 0

  const speechOk = useMemo(
    () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    [],
  )

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    stopListening()
    const wantDeep = deep
    setDeep(false)
    const ok = await sendToAtlas(t, listening ? 'voice' : 'text', { deep: wantDeep })
    if (ok) vibrate(8)
  }

  const stopListening = () => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setListening(false)
  }

  const toggleListening = () => {
    if (listening) return stopListening()
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return toast('הדפדפן הזה לא תומך בזיהוי דיבור')
    const rec = new SR()
    rec.lang = 'he-IL'
    rec.interimResults = true
    rec.continuous = true
    const base = text.trim()
    rec.onresult = (ev: any) => {
      // המנוע מאחר: תוצאה שמגיעה אחרי שעצרנו (או אחרי שליחה) לא מזהמת את התיבה
      if (recRef.current !== rec) return
      let finals = ''
      let interim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finals += r[0].transcript
        else interim += r[0].transcript
      }
      setText([base, finals + interim].filter(Boolean).join(' '))
    }
    rec.onerror = (ev: any) => {
      if (ev?.error === 'not-allowed') toast('אין הרשאה למיקרופון')
      stopListening()
    }
    rec.onend = () => setListening(false)
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
      vibrate(6)
    } catch {
      toast('לא הצלחתי להפעיל את המיקרופון')
    }
  }

  useEffect(() => () => stopListening(), [])

  const ready = atlasReady()
  const fast = fastReady()

  return (
    <div className="chat">
      {!ready && (
        <div className="card rail alert" style={{ ['--rail' as any]: 'var(--warn)' }}>
          <div className="txt">
            <b>אטלס עוד לא מחובר במכשיר הזה.</b>
            <div className="tiny faint">פתח את קישור ההתקנה מהמחשב (הגדרות → סנכרון) — הוא נושא גם את המפתח של אטלס.</div>
          </div>
        </div>
      )}
      {a.error && ready && (
        <div className="card rail alert" style={{ ['--rail' as any]: 'var(--bad)' }}>
          <div className="txt small" style={{ color: 'var(--bad-text)' }}>{a.error}</div>
        </div>
      )}

      <div className="chat-list" ref={listRef}>
        {a.messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-mark">A</div>
            <h3>אטלס</h3>
            <p className="small muted">
              מנהל החיים שלך. רואה את כל המערכת — יומן, משימות, אימונים, שעות עבודה — ויכול לשנות בה
              כל דבר. כשמשהו לא ברור לו, הוא שואל לפני שהוא פועל.{' '}
              {fast
                ? 'עונה תוך שניות. משימות גדולות (שינוי בקוד, תכנון ארוך) עוברות לאטלס העמוק ולוקחות דקות.'
                : 'תשובה לוקחת בדרך כלל דקות — המסלול המהיר כבוי (הגדרות → אטלס).'}
            </p>
            <div className="chat-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="chip" onClick={() => { setText(ex); taRef.current?.focus() }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {a.messages.map((m, i) => (
          <Bubble
            key={m.id}
            m={m}
            showDate={i === 0 || dayOf(m.at) !== dayOf(a.messages[i - 1].at)}
            onUndo={(cid) => {
              if (undoCommand(cid)) toast('בוטל')
            }}
            onRetry={() => void retrySend(m.id)}
            onDiscard={() => discardMessage(m.id)}
          />
        ))}
        {waiting && (
          <div className="bubble atlas thinking" aria-live="polite">
            <span className="dots"><i /><i /><i /></span>
            <span className="tiny muted">
              אטלס חושב… {waitedSec >= 60 ? `${Math.floor(waitedSec / 60)}:${String(waitedSec % 60).padStart(2, '0')}` : `${waitedSec} שנ׳`}
              {waitedSec > 90 && ` · התשובה תגיע עד ${hhmm(nextSweepAt(now).getTime())} לכל המאוחר — אפשר לצאת, היא תחכה כאן`}
            </span>
          </div>
        )}
      </div>

      {deep && (
        <div className="tiny faint" style={{ padding: '0 2px 4px' }}>
          משימה גדולה: תישלח ישירות לאטלס העמוק (קוד, תכנון ארוך) — תשובה תוך דקות עד שעה.
        </div>
      )}
      <div className="composer">
        {fast && (
          <button
            className={`btn icon-btn deep-toggle${deep ? ' on' : ''}`}
            type="button"
            aria-label="משימה גדולה"
            title="משימה גדולה — לאטלס העמוק"
            aria-pressed={deep}
            disabled={!ready}
            onClick={() => setDeep((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l9 5-9 5-9-5 9-5z" />
              <path d="M3 13l9 5 9-5" />
            </svg>
          </button>
        )}
        <textarea
          ref={taRef}
          className="textarea"
          rows={1}
          placeholder={listening ? 'מקשיב…' : deep ? 'משימה גדולה לאטלס העמוק…' : 'כתוב לאטלס…'}
          value={text}
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // במחשב Enter שולח, Shift+Enter יורד שורה. בטלפון יש כפתור.
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {speechOk && (
          <button
            className={`btn icon-btn mic${listening ? ' on' : ''}`}
            aria-label={listening ? 'עצור הקלטה' : 'דבר'}
            aria-pressed={listening}
            disabled={!ready}
            onClick={toggleListening}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
            </svg>
          </button>
        )}
        <button className="btn primary icon-btn" aria-label="שלח" disabled={!ready || !text.trim()} onClick={() => void send()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function Bubble({
  m,
  showDate,
  onUndo,
  onRetry,
  onDiscard,
}: {
  m: AtlasMessage
  showDate: boolean
  onUndo: (cid: string) => void
  onRetry: () => void
  onDiscard: () => void
}) {
  const at = Date.parse(m.at)
  return (
    <>
      {showDate && <div className="chat-date">{niceDate(dayOf(m.at))}</div>}
      <div className={`bubble ${m.from === 'user' ? 'me' : 'atlas'}${m.failed ? ' failed' : ''}${m.streaming ? ' streaming' : ''}`} aria-live={m.streaming ? 'polite' : undefined}>
        {m.streaming && !m.text ? (
          <span className="dots"><i /><i /><i /></span>
        ) : (
          <div className="bubble-text">
            {m.text}
            {m.streaming && <span className="caret" aria-hidden />}
          </div>
        )}
        {m.commands && m.commands.length > 0 && (
          <div className="cmds">
            {m.commands.map((c) => (
              <div key={c.id} className={`cmd${commandFailed(c.id) ? ' fail' : ''}`}>
                <span className="grow">{describeCommand(c)}</span>
                {canUndo(c.id) ? (
                  <button className="btn xs ghost" onClick={() => onUndo(c.id)}>
                    ביטול
                  </button>
                ) : (
                  commandFailed(c.id) && (
                    <span className="cmd-fail" title={commandFailed(c.id)}>
                      לא בוצע
                    </span>
                  )
                )}
              </div>
            ))}
          </div>
        )}
        <div className="bubble-meta tiny faint">
          {m.streaming ? (
            <span>אטלס כותב…</span>
          ) : m.failed ? (
            <span className="row" style={{ gap: 6 }}>
              <span style={{ color: 'var(--bad)' }}>לא נשלח</span>
              <button className="btn xs" onClick={onRetry}>שלח שוב</button>
              <button className="btn xs ghost" onClick={onDiscard}>מחק</button>
            </span>
          ) : (
            <span className="ltr">{Number.isFinite(at) ? hhmm(at) : ''}</span>
          )}
        </div>
      </div>
    </>
  )
}
