// ---------------------------------------------------------------------------
// אייקונים של המערכת — סט אחד, קו אחד (1.7px), במקום אימוג׳ים וגליפים.
// אימוג׳י נשאר רק למה שהמשתמש בחר בעצמו: מסלול, הרגל, פריט שבועי.
// ---------------------------------------------------------------------------
import React from 'react'

export type IconName =
  | 'today' | 'atlas' | 'calendar' | 'projects' | 'review' | 'settings'
  | 'pause' | 'play' | 'pencil' | 'bell' | 'moon' | 'shuffle' | 'check' | 'x' | 'clipboard' | 'warn' | 'compass'

const PATHS: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l2.8 1.7" />
    </>
  ),
  atlas: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 6.6l1.7 3.7 3.7 1.7-3.7 1.7L12 17.4l-1.7-3.7-3.7-1.7 3.7-1.7z" />
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
  pause: (
    <>
      <path d="M8.5 5.5v13M15.5 5.5v13" />
    </>
  ),
  play: (
    <>
      <path d="M7.5 5.2v13.6L18.2 12z" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l4.2-.9L19.4 7.9a1.8 1.8 0 0 0 0-2.6l-.7-.7a1.8 1.8 0 0 0-2.6 0L4.9 15.8z" />
      <path d="M14.5 6.2l3.3 3.3" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 16.2V11a5.8 5.8 0 1 1 11.6 0v5.2l1.6 2H4.6z" />
      <path d="M10 20.4a2 2 0 0 0 4 0" />
    </>
  ),
  moon: (
    <>
      <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3.5 7h3.2l9.1 10h4.7M3.5 17h3.2l2.8-3.1M12.6 10.1l3.2-3.1h4.7M18 4.5l2.5 2.5L18 9.5M18 14.5l2.5 2.5L18 19.5" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.3 4.3L19 7.5" />
    </>
  ),
  x: (
    <>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5.5" y="4.8" width="13" height="15.6" rx="2.2" />
      <path d="M9 4.8V3.6h6v1.2M9 11h6M9 15h4" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4.2L2.8 19.6h18.4z" />
      <path d="M12 10v4.2M12 17.2v.2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M15.4 8.6l-2.1 5.2-5.2 2.1 2.1-5.2z" />
    </>
  ),
}

/** אייקון קווי בגודל הטקסט. `sm` לכפתורים קטנים. */
export function Icon({ name, sm }: { name: IconName; sm?: boolean }) {
  return (
    <svg
      className={`ic${sm ? ' ic-sm' : ''}`}
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
