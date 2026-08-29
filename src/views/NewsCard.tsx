import React, { useEffect, useRef, useState } from 'react'
import { plural } from '../dates'
import { useToast } from '../ui'

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
  const [ed, setEd] = useState<Edition | null>(null)
  const [open, setOpen] = useState(false)
  const [openStory, setOpenStory] = useState<string | null>(null)
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

  if (!ed || dismissed === ed.date) return null

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
              return (
                <button
                  key={id}
                  className="item"
                  style={{ textAlign: 'start', alignItems: 'flex-start' }}
                  onClick={() => setOpenStory(expanded && !open ? null : id)}
                >
                  <div className="txt">
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
                  </div>
                  {!expanded && <span className="faint">◂</span>}
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="row" style={{ padding: '8px 13px 12px' }}>
        <button className="btn sm ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'צמצם' : 'פתח את כל הכתבות'}
        </button>
      </div>
    </div>
  )
}
