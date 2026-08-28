import React, { useState } from 'react'
import {
  HE_STATUS, createGist, getGistId, getToken, pullOnce, pushNow, setCredentials, useCloudState,
} from '../cloud'
import { Field, useToast } from '../ui'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/**
 * חיבור הסנכרון. האסימון נשמר רק במכשיר הזה — הוא לא נכנס לענן ולא נמצא
 * בקוד של האתר, אז מי שפותח את הכתובת בלי אסימון לא רואה שום נתון.
 */
export default function CloudCard() {
  const { status, lastError, lastSyncAt } = useCloudState()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(getToken())
  const [gist, setGist] = useState(getGistId())
  const [busy, setBusy] = useState(false)

  const connected = !!getToken() && !!getGistId()

  const save = () => {
    setCredentials(token, gist)
    setOpen(false)
    toast(token && gist ? 'מחובר' : 'הסנכרון כובה')
  }

  const makeGist = async () => {
    if (!token.trim()) return toast('צריך קודם להדביק אסימון')
    setBusy(true)
    try {
      setCredentials(token, '')
      const id = await createGist()
      setGist(id)
      setCredentials(token, id)
      toast('נוצר מחסן חדש · הכל נשלח')
    } catch (e: any) {
      toast(e?.message === 'auth' ? 'האסימון נדחה — בדוק את ההרשאה' : 'לא הצליח ליצור')
    } finally {
      setBusy(false)
    }
  }

  const ago = () => {
    if (!lastSyncAt) return ''
    const m = Math.round((Date.now() - lastSyncAt) / 60000)
    return m < 1 ? 'עכשיו' : m === 1 ? 'לפני דקה' : `לפני ${m} דקות`
  }

  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>סנכרון בין מכשירים</div>
        <span className="tiny faint">
          {HE_STATUS[status]}
          {status === 'synced' && lastSyncAt ? ` · ${ago()}` : ''}
        </span>
      </div>

      {connected ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            המחשב והטלפון קוראים וכותבים לאותו מחסן אצלך ב-GitHub. כל שינוי נשלח לבד אחרי
            כמה שניות, וכל מכשיר בודק כל 10 שניות אם משהו התחדש. אין צורך שהמכשיר השני יהיה
            דלוק.
          </p>
          {status === 'error' && (
            <p className="tiny" style={{ color: 'var(--bad)', marginTop: 0 }}>
              {lastError === 'auth'
                ? 'האסימון נדחה או פג. צור אחד חדש והדבק אותו כאן.'
                : lastError === 'not-found'
                  ? 'המחסן לא נמצא. בדוק את המזהה.'
                  : `שגיאה: ${lastError}`}
            </p>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn grow"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const changed = await pullOnce()
                  toast(changed ? 'נמשכו עדכונים' : 'הכל כבר מעודכן')
                } catch {
                  toast('המשיכה נכשלה')
                } finally {
                  setBusy(false)
                }
              }}
            >
              ⬇ משיכה עכשיו
            </button>
            <button
              className="btn primary grow"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await pushNow()
                  toast('נשלח ✓')
                } catch {
                  toast('השליחה נכשלה')
                } finally {
                  setBusy(false)
                }
              }}
            >
              ⬆ שליחה עכשיו
            </button>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setOpen((v) => !v)}>
            {open ? 'סגור' : 'שינוי חיבור'}
          </button>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            בלי חיבור הכל עובד — פשוט נשמר רק במכשיר הזה. חיבור לוקח דקה, פעם אחת בכל מכשיר.
          </p>
          <ol className="small muted" style={{ margin: '0 0 10px', paddingInlineStart: 20, lineHeight: 1.9 }}>
            <li>
              פתח{' '}
              <a
                href={TOKEN_URL}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', padding: '5px 0', fontWeight: 700 }}
              >
                יצירת אסימון ב-GitHub
              </a>
            </li>
            <li>
              תחת <b>Permissions ← Account permissions ← Gists</b> בחר <b>Read and write</b>
            </li>
            <li>צור, העתק את האסימון והדבק כאן</li>
            <li>במכשיר הראשון — "צור מחסן חדש". בשני — הדבק את אותו מזהה</li>
          </ol>
          <button className="btn primary" onClick={() => setOpen(true)}>
            חיבור
          </button>
        </>
      )}

      {open && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
          <Field label="אסימון GitHub" htmlFor="gh-token">
            <input
              id="gh-token"
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
          <Field label="מזהה המחסן (Gist)" htmlFor="gh-gist">
            <input
              id="gh-gist"
              className="input ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="מדביקים כאן במכשיר השני"
              value={gist}
              onChange={(e) => setGist(e.target.value)}
            />
          </Field>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn primary grow" onClick={save}>
              שמירה
            </button>
            <button className="btn grow" disabled={busy || !token.trim()} onClick={makeGist}>
              צור מחסן חדש
            </button>
          </div>
          {!!gist && (
            <div className="tiny faint" style={{ marginTop: 10 }}>
              במכשיר השני הדבק את המזהה הזה:
              <div
                className="ltr"
                style={{ userSelect: 'all', fontWeight: 700, wordBreak: 'break-all', marginTop: 2 }}
              >
                {gist}
              </div>
            </div>
          )}
          <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
            האסימון נשמר רק בדפדפן הזה. הוא לא נשלח למחסן ולא נמצא בקוד של האתר.
            <br />
            המחסן הוא <b>secret gist</b>: הוא לא מופיע בחיפוש ובפרופיל, אבל מי שמקבל את
            הכתובת שלו יכול לקרוא אותה. אל תשתף את המזהה.
          </p>
        </div>
      )}
    </div>
  )
}
