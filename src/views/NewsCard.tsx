import React, { useEffect, useRef, useState } from 'react'

import { archivedEdition, normalizeEdition, type Edition, type Section, type Story } from '../news'
import { addDays, niceDate, plural } from '../dates'
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
//
// מהדורות קודמות נשמרות ב-docs/news/archive/YYYY-MM-DD.json ואפשר לפתוח אותן
// מהכרטיס — בוקר שלא הספקת לשמוע לא הולך לאיבוד.
// ---------------------------------------------------------------------------


const READ_KEY = 'life-os-news-read'
const CACHE_KEY = 'life-os-news-cache'

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

/** כמה ימים אחורה מחפשים מהדורות בארכיון */
const ARCHIVE_DAYS = 14

export default function NewsCard() {
  const toast = useToast()
  const s = useApp()
  const [ed, setEd] = useState<Edition | null>(null)
  const [open, setOpen] = useState(false)
  const [openStory, setOpenStory] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  // ארכיון: המהדורה שמוצגת במקום זו של היום, והרשימה שנטענת בלחיצה
  const [arch, setArch] = useState<Edition | null>(null)
  const [archOpen, setArchOpen] = useState(false)
  const [archList, setArchList] = useState<Edition[] | null>(null)
  const [archBusy, setArchBusy] = useState(false)
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
      .then((j: unknown) => {
        // מהדורה בצורה חורגת עוברת נרמול במקום להיעלם בשקט — ראו src/news.ts
        const norm = normalizeEdition(j)
        if (!alive || !norm) return
        setEd(norm)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(norm))
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        try {
          const c = localStorage.getItem(CACHE_KEY)
          const cached = c ? normalizeEdition(JSON.parse(c)) : null
          if (cached && alive) setEd(cached)
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
  const shown = arch ?? ed
  const rating = shown ? (s.news ?? []).find((n) => n.date === shown.date && !n.deleted) : undefined
  useEffect(() => {
    setNote(rating?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.date])

  if (!ed) return null

  // נסגר להיום — אבל לא נעלם. ה-✕ יושב בפינה של כרטיס, בטלפון הוא נלחץ בטעות,
  // וה-flag יושב ב-localStorage של המכשיר הזה: בלי שורת חזרה הבוקר הזה אבד
  // למכשיר בלי דרך להחזיר אותו. השורה דקה בכוונה — היא לא תופסת את המקום
  // שהכרטיס תפס.
  if (dismissed === ed.date)
    return (
      <div className="card rail alert">
        <div className="card-h">
          <div className="grow" style={{ minWidth: 0 }}>
            <b>חדשות הבוקר</b>
            <div className="tiny faint">סומנו כנקראו היום</div>
          </div>
          <button
            className="btn ghost sm"
            onClick={() => {
              setDismissed('')
              try {
                localStorage.removeItem(READ_KEY)
              } catch {
                /* ignore */
              }
            }}
          >
            פתיחה
          </button>
        </div>
      </div>
    )

  // המהדורה המוצגת: של היום, או אחת מהארכיון
  const view = arch ?? ed

  const voteCount = Object.keys(rating?.votes ?? {}).length
  const vote = (key: string, v: 1 | -1, headline: string, section: string) => {
    actions.rateNewsStory(view.date, key, v, { headline, section })
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
    const u = new SpeechSynthesisUtterance(fullText(view))
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

  const totalStories = view.sections.reduce((a, s) => a + s.stories.length, 0)

  // הארכיון נטען רק בלחיצה: מנסים את הימים שלפני המהדורה הנוכחית וקוראים את
  // מה שקיים. אין קובץ אינדקס — מי שלא נמצא פשוט לא מופיע ברשימה.
  const openArchive = async () => {
    setArchOpen((v) => !v)
    if (archList || archBusy) return
    setArchBusy(true)
    const dates = Array.from({ length: ARCHIVE_DAYS }, (_, i) => addDays(ed.date, -(i + 1)))
    const found = await Promise.all(
      dates.map(async (d) => {
        try {
          const r = await fetch(`./news/archive/${d}.json`, { cache: 'force-cache' })
          if (!r.ok) return null
          return archivedEdition(normalizeEdition(await r.json()))
        } catch {
          return null
        }
      }),
    )
    setArchList(found.filter((e): e is Edition => !!e))
    setArchBusy(false)
  }

  // מעבר בין מהדורות: עוצרים קריינות ומאפסים את מצב נגן השמע
  const show = (e: Edition | null) => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setAudioOk(null)
    setOpenStory(null)
    setArch(e)
    setArchOpen(false)
  }

  return (
    <div className="card">
      <div className="card-h">
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{view.title || 'חדשות הבוקר'}</b>
          <div className="tiny faint">
            {arch ? `${niceDate(view.date)} · ` : ''}
            {plural(totalStories, 'סיפור אחד', 'סיפורים')}
            {view.minutes ? ` · כ־${view.minutes} דקות` : ''}
          </div>
        </div>
        {arch ? (
          <button className="btn ghost sm" onClick={() => show(null)}>
            למהדורת היום
          </button>
        ) : (
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
        )}
      </div>

      <div style={{ padding: '0 13px 10px' }}>
        {view.audio && audioOk !== false ? (
          <audio
            controls
            preload="none"
            key={view.date}
            src={view.audio}
            style={{ width: '100%', height: 40 }}
            onPlay={() => window.speechSynthesis?.cancel()}
            onError={() => setAudioOk(false)}
          />
        ) : (
          <button className="btn sm" onClick={speak}>
            {speaking ? 'עצור קריינות' : 'השמע'}
          </button>
        )}
      </div>

      {view.intro && open && (
        <div className="small muted" style={{ padding: '0 13px 8px', whiteSpace: 'pre-wrap' }}>
          {view.intro}
        </div>
      )}

      <div className="list">
        {view.sections.map((sec) => (
          <React.Fragment key={sec.key}>
            <div className="section-title" style={{ padding: '8px 13px 2px' }}>
              {sec.title}
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
          {noteOpen ? 'סגור' : 'הערה למהדורה'}
        </button>
        <button className="btn sm ghost" onClick={openArchive}>
          {archOpen ? 'סגור ארכיון' : 'מהדורות קודמות'}
        </button>
        {voteCount > 0 && (
          <span className="tiny faint">
            {voteCount === 1 ? 'סימון אחד' : `${voteCount} סימונים`} נשמרו
          </span>
        )}
      </div>

      {archOpen && (
        <div className="list">
          {archBusy && !archList && <div className="item tiny faint">טוען…</div>}
          {archList && !archList.length && (
            <div className="item tiny faint">אין מהדורות שמורות מהשבועיים האחרונים.</div>
          )}
          {(archList ?? []).map((e) => (
            <div key={e.date} className="item">
              <div className="txt">
                <button
                  style={{ background: 'none', border: 0, padding: 0, textAlign: 'start', width: '100%' }}
                  onClick={() => show(e)}
                >
                  <div className="ttl">{niceDate(e.date)}</div>
                  <div className="tiny faint">
                    {plural(
                      e.sections.reduce((a, sec) => a + sec.stories.length, 0),
                      'סיפור אחד',
                      'סיפורים',
                    )}
                    {e.audio ? ' · עם קריינות' : ''}
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {noteOpen && (
        <div style={{ padding: '0 13px 12px' }}>
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={note}
            placeholder="מה לשפר במהדורה של מחר? אורך, נושאים, סגנון, כמה הסבר רקע…"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              actions.setNewsNote(view.date, note.trim())
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
