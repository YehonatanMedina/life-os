import React, { useEffect, useRef, useState } from 'react'
import { plural } from '../dates'
import { useToast, vibrate } from '../ui'
import { actions, useApp } from '../store'
import { queueNewsFeedback } from '../cloud'

// ---------------------------------------------------------------------------
// חדשות הבוקר — מגזין יומי שנכתב בכל בוקר על ידי סוכן ענן ומתפרסם לצד האתר.
//
// המבנה: docs/news/latest.json — { date, title, minutes, audio?, sections:[
//   { key:'israel'|'tech'|'culture', title, stories:[{ headline, body }] } ] }
// אם יש קובץ שמע (docs/news/latest.mp3) מנגנים אותו; אחרת קריינות מקומית
// של הדפדפן (speechSynthesis) — עובדת גם בלי קובץ ובלי רשת.
// ---------------------------------------------------------------------------

type Story = { headline: string; body: string }
type Section = { key: string; title: string; stories: Story[] }
type Edition = {
  date: string
  title?: string
  minutes?: number
  audio?: string
  intro?: string
  outro?: string
  sections: Section[]
}

const READ_KEY = 'life-os-news-read'
const CACHE_KEY = 'life-os-news-cache'

const SECTION_EMOJI: Record<string, string> = {
  israel: '🇮🇱',
  tech: '🔬',
  culture: '🎭',
}

function fullText(ed: Edition): string {
  const parts: string[] = []
  if (ed.intro) parts.push(ed.intro)
  for (const sec of ed.sections) {
    parts.push(sec.title + '.')
    for (const st of sec.stories) {
      parts.push(st.headline + '.')
      parts.push(st.body)
    }
  }
  if (ed.outro) parts.push(ed.outro)
  return parts.join('\n\n')
}

export default function NewsCard() {
  const toast = useToast()
  const s = useApp()
  const [ed, setEd] = useState<Edition | null>(null)
  const [open, setOpen] = useState(false)
  const [openStory, setOpenStory] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(READ_KEY) ?? ''
    } catch {
      return ''
    }
  })

  // קריינות מקומית כשאין קובץ שמע (או כשהקובץ עוד לא נוצר)
  const [audioOk, setAudioOk] = useState<boolean | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    let alive = true
    // רשת קודם; המטמון מציל כשפותחים בלי אינטרנט
    fetch('./news/latest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Edition) => {
        if (!alive || !j || !Array.isArray(j.sections)) return
        setEd(j)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(j))
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        try {
          const c = localStorage.getItem(CACHE_KEY)
          if (c && alive) setEd(JSON.parse(c))
        } catch {
          /* ignore */
        }
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  // ההערה נטענת מהמצב השמור כשמזהים את המהדורה
  const rating = ed ? (s.news ?? []).find((n) => n.date === ed.date && !n.deleted) : undefined
  useEffect(() => {
    setNote(rating?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed?.date])

  if (!ed || dismissed === ed.date) return null

  const voteCount = Object.keys(rating?.votes ?? {}).length
  const vote = (key: string, v: 1 | -1, headline: string, section: string) => {
    actions.rateNewsStory(ed.date, key, v, { headline, section })
    vibrate()
    queueNewsFeedback()
  }

  const speak = () => {
    const synth = window.speechSynthesis
    if (!synth) return toast('אין קריינות בדפדפן הזה')
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(fullText(ed))
    u.lang = 'he-IL'
    const voice = synth.getVoices().find((v) => v.lang.startsWith('he'))
    if (voice) u.voice = voice
    u.rate = 1.02
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    uttRef.current = u
    synth.cancel()
    synth.speak(u)
    setSpeaking(true)
  }

  const totalStories = ed.sections.reduce((a, s) => a + s.stories.length, 0)

  return (
    <div className="card">
      <div className="spread" style={{ padding: '12px 13px 6px' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>☕ {ed.title || 'חדשות הבוקר'}</b>
          <div className="tiny faint">
            {plural(totalStories, 'סיפור אחד', 'סיפורים')}
            {ed.minutes ? ` · כ־${ed.minutes} דקות` : ''}
          </div>
        </div>
        <button
          className="btn ghost sm"
          aria-label="סמן כנקרא וסגור להיום"
          onClick={() => {
            window.speechSynthesis?.cancel()
            setDismissed(ed.date)
            try {
              localStorage.setItem(READ_KEY, ed.date)
            } catch {
              /* ignore */
            }
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '0 13px 10px' }}>
        {ed.audio && audioOk !== false ? (
          <audio
            controls
            preload="none"
            src={ed.audio}
            style={{ width: '100%', height: 40 }}
            onPlay={() => window.speechSynthesis?.cancel()}
            onError={() => setAudioOk(false)}
          />
        ) : (
          <button className="btn sm" onClick={speak}>
            {speaking ? '⏸ עצור קריינות' : '▶ השמע'}
          </button>
        )}
      </div>

      {ed.intro && open && (
        <div className="small muted" style={{ padding: '0 13px 8px', whiteSpace: 'pre-wrap' }}>
          {ed.intro}
        </div>
      )}

      <div className="list">
        {ed.sections.map((sec) => (
          <React.Fragment key={sec.key}>
            <div className="section-title" style={{ padding: '8px 13px 2px' }}>
              {SECTION_EMOJI[sec.key] ?? '•'} {sec.title}
            </div>
            {sec.stories.map((st, i) => {
              const id = `${sec.key}-${i}`
              const expanded = open || openStory === id
              const v = rating?.votes?.[id]?.v
              return (
                <div key={id} className="item" style={{ alignItems: 'flex-start' }}>
                  <div className="txt">
                    <button
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'start', width: '100%' }}
                      onClick={() => setOpenStory(expanded && !open ? null : id)}
                    >
                      <div className="ttl" style={{ fontWeight: 700 }}>
                        {st.headline}
                      </div>
                      {expanded && (
                        <div
                          className="small muted"
                          style={{ whiteSpace: 'pre-wrap', marginTop: 6, lineHeight: 1.75 }}
                        >
                          {st.body}
                        </div>
                      )}
                    </button>
                  </div>
                  {/* דירוג לכל כותרת — זה מה שמלמד את עורך הבוקר מה מעניין אותך */}
                  <div className="row" style={{ gap: 3, flexShrink: 0 }}>
                    <button
                      className={`vote${v === 1 ? ' up' : ''}`}
                      aria-label="אהבתי"
                      aria-pressed={v === 1}
                      onClick={() => vote(id, 1, st.headline, sec.title)}
                    >
                      ▲
                    </button>
                    <button
                      className={`vote${v === -1 ? ' down' : ''}`}
                      aria-label="לא אהבתי"
                      aria-pressed={v === -1}
                      onClick={() => vote(id, -1, st.headline, sec.title)}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="row" style={{ padding: '8px 13px 4px', flexWrap: 'wrap' }}>
        <button className="btn sm ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'צמצם' : 'פתח את כל הכתבות'}
        </button>
        <button className="btn sm ghost" onClick={() => setNoteOpen((v) => !v)}>
          {noteOpen ? 'סגור' : '✍️ הערה למהדורה'}
        </button>
        {voteCount > 0 && (
          <span className="tiny faint">
            {voteCount === 1 ? 'סימון אחד' : `${voteCount} סימונים`} נשמרו
          </span>
        )}
      </div>

      {noteOpen && (
        <div style={{ padding: '0 13px 12px' }}>
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={note}
            placeholder="מה לשפר במהדורה של מחר? אורך, נושאים, סגנון, כמה הסבר רקע…"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              actions.setNewsNote(ed.date, note.trim())
              queueNewsFeedback()
            }}
          />
          <div className="tiny faint" style={{ marginTop: 4 }}>
            הסימונים וההערה נשמרים אצלך ונקראים על ידי עורך הבוקר לפני הגיליון הבא.
          </div>
        </div>
      )}
    </div>
  )
}
