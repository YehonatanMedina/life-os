// ---------------------------------------------------------------------------
// המותג — שם אחד, סימן אחד, ומקום אחד לשנות אותם.
//
// אטלס הוא גם מי שמחזיק את העולם על הכתפיים וגם ספר המפות. שני הפירושים הם
// מה שהתוכנה עושה: מחזיקה את העומס, ומראה איפה אתה על המסלול. הסימן הוא
// בדיוק זה — כוכב עם קו אורך, על קו אופק שמחזיק אותו.
// ---------------------------------------------------------------------------
import React from 'react'

export const APP_NAME = 'אטלס'
/** תיאור קצר — לכל מקום שצריך שורה אחת מתחת לשם */
export const APP_TAGLINE = 'ניהול זמן אישי'

/**
 * הסימן. `solid` ממלא אותו בגרדיאנט המותג (לכותרת ולמסכי פתיחה), ואחרת הוא
 * קו נקי שמתנהג כמו כל אייקון אחר במערכת ולוקח את צבע הטקסט שסביבו.
 */
export function Mark({ size = 24, solid }: { size?: number; solid?: boolean }) {
  const id = solid ? 'brandgrad' : undefined
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flex: `0 0 ${size}px`, display: 'block' }}
    >
      {solid && (
        <defs>
          <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-1)" />
            <stop offset=".55" stopColor="var(--brand-2)" />
            <stop offset="1" stopColor="var(--brand-3)" />
          </linearGradient>
        </defs>
      )}
      <g
        stroke={solid ? `url(#${id})` : 'currentColor'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="9.6" r="6" />
        <path d="M12 3.6c-2 1.9-2 10.1 0 12M6 9.6h12" />
        <path d="M2.4 16.3c6.4 4.7 12.8 4.7 19.2 0" />
      </g>
    </svg>
  )
}

/** השם בגרדיאנט המותג, בגודל אחד קבוע בכל מקום שהוא מופיע */
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      {APP_NAME}
    </span>
  )
}
