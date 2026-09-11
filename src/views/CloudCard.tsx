import React, { useState } from 'react'
import {
  HE_STATUS, b64u, buildId, createGist, getPairing, getToken, setCredentials, syncNow, useCloudState,
} from '../cloud'
import { useApp } from '../store'
import { getNotifyKey } from '../push'
import { Field, useToast } from '../ui'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/**
 * חיבור הסנכרון. האסימון נשמר רק במכשיר הזה — הוא לא נכנס לענן ולא נמצא
 * בקוד של האתר, אז מי שפותח את הכתובת בלי אסימון לא רואה שום נתון.
 */
export default function CloudCard() {
  const { status, lastError, lastSyncAt, lastPullAt, lastPushAt } = useCloudState()
  const s = useApp()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const [linkShown, setLinkShown] = useState('')
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(getToken())
  const [gist, setGist] = useState(getPairing())
  const [busy, setBusy] = useState(false)

  const connected = !!getToken() && !!getPairing()

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
      setCredentials(token, id)
      setGist(getPairing())
      toast('נוצר מחסן מוצפן · הכל נשלח')
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

  const when = (t: number) => {
    if (!t) return '—'
    const d = new Date(t)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

      {/* מצב הסנכרון במספרים — כדי שאפשר יהיה לראות בדיוק מה קורה, לא לנחש */}
      {connected && (
        <div className="sync-grid">
          <div>
            <span className="k">משיכה אחרונה</span>
            <span className="v ltr">{when(lastPullAt)}</span>
          </div>
          <div>
            <span className="k">כתיבה אחרונה</span>
            <span className="v ltr">{when(lastPushAt)}</span>
          </div>
          <div>
            <span className="k">גרסה</span>
            <span className="v ltr">{buildId()}</span>
          </div>
          <div>
            <span className="k">מכשיר</span>
            <span className="v ltr">{s.deviceId}</span>
          </div>
          {lastError && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="k">שגיאה</span>
              <span className="v ltr" style={{ color: 'var(--bad)' }}>{lastError}</span>
            </div>
          )}
          <button
            className="btn sm"
            style={{ gridColumn: '1 / -1' }}
            disabled={syncing}
            onClick={async () => {
              setSyncing(true)
              try {
                await syncNow()
                toast('סונכרן — נמשך, מוזג ונכתב')
              } catch (e: any) {
                toast(`הסנכרון נכשל: ${e?.message ?? e}`)
              } finally {
                setSyncing(false)
              }
            }}
          >
            {syncing ? 'מסנכרן…' : 'סנכרן עכשיו'}
          </button>
          <button
            className="btn sm"
            style={{ gridColumn: '1 / -1' }}
            onClick={async () => {
              // קישור חד־פעמי למכשיר חדש: חיבור (t+p), מפתח ההתראות (nk) ומפתח אטלס (ak).
              // הוא נושא את הטוקן — פותחים אותו רק במכשיר שלך, והוא נמחק מהכתובת אחרי הפעם הראשונה.
              const cfg: Record<string, string> = { t: getToken(), p: getPairing() }
              if (s.settings.aiKey) cfg.ak = s.settings.aiKey
              if (getNotifyKey()) cfg.nk = getNotifyKey()
              const link = `${location.origin}${location.pathname}#setup=${b64u(new TextEncoder().encode(JSON.stringify(cfg)))}`
              try {
                await navigator.clipboard.writeText(link)
                toast('הועתק. הקישור מכיל את האסימון — להעביר רק בערוץ שלך, ולפתוח פעם אחת')
              } catch {
                setLinkShown(link)
              }
            }}
          >
            העתקת קישור התקנה למכשיר חדש
          </button>
          {linkShown && (
            <input
              className="input ltr"
              readOnly
              value={linkShown}
              aria-label="קישור ההתקנה"
              style={{ gridColumn: '1 / -1' }}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>
      )}

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
                  ? 'המחסן לא נמצא. בדוק את מזהה החיבור.'
                  : lastError === 'no-key' || lastError === 'bad-key'
                    ? 'המחסן מוצפן וחסר המפתח — הדבק את מזהה החיבור המלא (עם החלק שאחרי #).'
                    : lastError === 'unreadable'
                      ? 'המחסן קיים אבל לא קריא בגרסה הזו — לא נכתב עליו. עדכן את האפליקציה או בדוק את המפתח.'
                      : `שגיאה: ${lastError}`}
            </p>
          )}
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
          <Field label="מזהה החיבור" htmlFor="gh-gist">
            <input
              id="gh-gist"
              className="input ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="מזהה#מפתח — מדביקים כאן במכשיר השני"
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
              במכשיר השני הדבק את מזהה החיבור הזה (כולל מה שאחרי ה-#):
              <div
                className="ltr"
                style={{ userSelect: 'all', fontWeight: 700, wordBreak: 'break-all', marginTop: 2 }}
              >
                {gist}
              </div>
            </div>
          )}
          <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
            האסימון והמפתח נשמרים רק בדפדפן הזה — לא בענן ולא בקוד של האתר.
            <br />
            התוכן במחסן <b>מוצפן</b> (AES-256): גם מי שמגיע אליו רואה צופן חסר משמעות.
            המפתח הוא החלק שאחרי ה-# במזהה החיבור.
          </p>
        </div>
      )}
    </div>
  )
}
