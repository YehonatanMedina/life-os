// ---------------------------------------------------------------------------
// מהדורת הבוקר — הטיפוסים והנרמול.
//
// המבנה שהאפליקציה מצפה לו: sections כמערך של { key, title, stories }.
// ב-16.9.2026 שגרת החדשות כתבה את sections כאובייקט לפי מדור, הכרטיס דחה את
// הקובץ בשקט, ולא היו חדשות בבוקר. מאז מקבלים גם את הצורה הזאת — עדיף להציג
// מהדורה שנכתבה קצת אחרת מאשר בוקר בלי חדשות.
// ---------------------------------------------------------------------------

export type Story = { id?: string; headline: string; body: string }
export type Section = { key: string; title: string; stories: Story[] }
export type Edition = {
  date: string
  title?: string
  minutes?: number
  audio?: string
  intro?: string
  outro?: string
  sections: Section[]
}

const isStory = (s: unknown): s is Story => {
  const x = s as any
  return !!x && typeof x.headline === 'string' && typeof x.body === 'string'
}

/** מהדורה שאפשר להציג, או null אם אין בה אף סיפור */
export function normalizeEdition(input: unknown): Edition | null {
  const j = input as any
  if (!j || typeof j !== 'object' || typeof j.date !== 'string') return null
  const raw = j.sections
  const list: any[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.keys(raw).map((key) => {
          const v = raw[key]
          return { key, title: v?.title ?? key, stories: Array.isArray(v) ? v : v?.stories }
        })
      : []
  const sections: Section[] = list
    .map((s: any) => ({
      key: String(s?.key ?? ''),
      title: String(s?.title ?? ''),
      stories: (Array.isArray(s?.stories) ? s.stories : []).filter(isStory),
    }))
    .filter((s) => s.stories.length > 0)
  if (!sections.length) return null
  // שדה audio בלי חתימה (?v=) הוא שם קובץ קבוע מתבנית הגיליון, ויכול להצביע על
  // הקריינות של אתמול. בלי חתימה — הדפדפן יקריא את המהדורה החדשה בקולו.
  const audio = typeof j.audio === 'string' && /[?&]v=[^&]/.test(j.audio) ? j.audio : undefined
  return { ...j, audio, sections } as Edition
}

/**
 * מהדורה מהארכיון. הקריינות שלה תקפה רק אם נשמר לה קובץ משלה תחת
 * `news/archive/` — `latest.mp3` נדרס בכל בוקר, ולכן מהדורה ישנה שמצביעה עליו
 * תוקרא בקול הדפדפן במקום להשמיע את הקריינות של היום.
 */
export function archivedEdition(e: Edition | null): Edition | null {
  if (!e) return null
  return e.audio && !e.audio.includes('/archive/') ? { ...e, audio: undefined } : e
}
