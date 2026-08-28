import type { ISODate } from './types'

export const DAY_MS = 86400000

export const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const HE_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** מחרוזת YYYY-MM-DD בזמן מקומי (לא UTC!) */
export function iso(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function today(): ISODate {
  return iso(new Date())
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  const da = parseISO(a).getTime()
  const db = parseISO(b).getTime()
  return Math.round((db - da) / DAY_MS)
}

export function dow(s: ISODate): number {
  return parseISO(s).getDay()
}

/** יום ראשון של השבוע שאליו שייך התאריך */
export function weekStart(s: ISODate): ISODate {
  return addDays(s, -dow(s))
}

export function monthStart(s: ISODate): ISODate {
  const d = parseISO(s)
  d.setDate(1)
  return iso(d)
}

export function monthLabel(s: ISODate): string {
  const d = parseISO(s)
  return `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISO(s)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return iso(d)
}

/** "יום ה׳, 3 בספטמבר" */
export function niceDate(s: ISODate, withYear = false): string {
  const d = parseISO(s)
  const base = `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`
  return withYear ? `${base} ${d.getFullYear()}` : base
}

/** "3.9" */
export function shortDate(s: ISODate): string {
  const d = parseISO(s)
  return `${d.getDate()}.${d.getMonth() + 1}`
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** מחזיר 42 ימים (6 שורות) לרשת חודש, מתחיל ביום ראשון */
export function monthGrid(anchor: ISODate): ISODate[] {
  const first = monthStart(anchor)
  const start = addDays(first, -dow(first))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function weekDates(s: ISODate): ISODate[] {
  const ws = weekStart(s)
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "45 דק׳" · "7 שע׳" · "7 שע׳ 30 דק׳" — בלי נקודתיים, שלא ייקרא כשעון */
export function minutesToHM(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} דק׳`
  if (r === 0) return `${h} שע׳`
  return `${h} שע׳ ${r} דק׳`
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** תמיד בטווח 00:00–23:59 — חיתוך, לא גלישה (גלישה יוצרת אירועים הפוכים) */
export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}


/** "אסימון אחד" / "3 אסימונים" — בעברית אין ריבוי ל־1 */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`
}

/** ספירה לאחור בטקסט */
export function countdownText(days: number): string {
  if (days < 0) return `עבר לפני ${-days} ימים`
  if (days === 0) return 'היום!'
  if (days === 1) return 'מחר'
  if (days === 2) return 'מחרתיים'
  return `בעוד ${days} ימים`
}

/** כמו shortDate, אבל מוסיף שנה כשהיא לא השנה הנוכחית — "עד 1.1" לא יטעה */
export function shortDateY(date: ISODate, from: ISODate = today()): string {
  const y = date.slice(0, 4)
  return y === from.slice(0, 4) ? shortDate(date) : `${shortDate(date)}.${y}`
}

/** תווי כיווניות בלתי נראים שמגיעים מהדבקה — מוחקים אותם לפני כל פענוח */
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g

/** האם התאריך קיים באמת (לא 31.4, לא 29.2 בשנה לא מעוברת) */
function realDate(y: number, mo: number, d: number): boolean {
  const dt = new Date(`${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00`)
  return !Number.isNaN(dt.getTime()) && dt.getDate() === d && dt.getMonth() + 1 === mo
}

export type LooseDate = { date: ISODate; title: string }
export type LooseResult = LooseDate | { date: null; title: string }

/**
 * קורא תאריך מתוך שורת טקסט חופשית ומחזיר גם את השאר ככותרת.
 * תומך ב: "30.8 עידו" · "עידו 30/8" · "30.8.1999 עידו" · "2026-08-30 עידו" · "2026/08/30 עידו".
 * בלי שנה — בוחר את המופע הקרוב הבא שקיים באמת (כך ש-29.2 נופל על שנה מעוברת).
 * מספרים שהם חלק ממספר ארוך יותר ("חדר 305.8", "v1.2.3") לא נחשבים תאריך.
 */
export function parseLooseLine(line: string, from: ISODate = today()): LooseDate | null {
  const r = parseLooseDetailed(line, from)
  return r.date ? (r as LooseDate) : null
}

/** כמו parseLooseLine, אבל מבחין בין "אין תאריך" לבין "יש תאריך בלי שם" */
export function parseLooseDetailed(line: string, from: ISODate = today()): LooseResult {
  const raw = line.replace(BIDI, '').trim()
  if (!raw) return { date: null, title: '' }

  // 2026-08-30 / 2026.8.30 / 2026/08/30
  const iso = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/g
  // 30.8 · 30/8 · 30.8.1999 · 30/8/99
  const dmy = /(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?/g

  const curY = Number(from.slice(0, 4))
  const attempt = (m: RegExpMatchArray, isIso: boolean): LooseDate | null => {
    const i = m.index ?? 0
    const before = raw[i - 1]
    const after = raw[i + m[0].length]
    // לא לקטוע מספר ארוך יותר, ולא לתפוס אמצע של גרסה כמו v1.2.3
    if (before && /[\d./-]/.test(before)) return null
    if (after && /[\d]/.test(after)) return null
    if (after && /[./-]/.test(after) && /\d/.test(raw[i + m[0].length + 1] ?? '')) return null

    let y: number | null
    let mo: number
    let d: number
    if (isIso) {
      y = Number(m[1])
      mo = Number(m[2])
      d = Number(m[3])
    } else {
      d = Number(m[1])
      mo = Number(m[2])
      if (m[3]) {
        const n = Number(m[3])
        // שנה דו־ספרתית אף פעם לא בעתיד — כי כמעט תמיד זו שנת לידה
        y = m[3].length <= 2 ? (2000 + n > curY ? 1900 + n : 2000 + n) : n
      } else y = null
    }
    if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null

    if (y === null) {
      // המופע הקרוב הבא שבאמת קיים — כך 29.2 נוחת על שנה מעוברת
      const md = `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      let cand = md >= from.slice(5) ? curY : curY + 1
      let guard = 0
      while (!realDate(cand, mo, d) && guard++ < 8) cand++
      if (!realDate(cand, mo, d)) return null
      y = cand
    } else if (!realDate(y, mo, d)) return null

    const date = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // מסירים רק את התאריך עצמו, ומנקים מפרידים בקצוות — לא באמצע השם
    const title = (raw.slice(0, i) + ' ' + raw.slice(i + m[0].length))
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:|.\-–—]+|[\s,;:|.\-–—]+$/g, '')
      .trim()
    return { date, title }
  }

  for (const [re, isIso] of [
    [iso, true],
    [dmy, false],
  ] as const) {
    re.lastIndex = 0
    for (const m of raw.matchAll(re)) {
      const got = attempt(m, isIso)
      if (got) return got
    }
  }
  return { date: null, title: raw }
}
