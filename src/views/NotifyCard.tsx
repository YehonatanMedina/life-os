import React, { useState } from 'react'
import { disablePush, enablePush, getNotifyKey, pushEnabled, writeNotifySchedule } from '../push'
import { useToast } from '../ui'

/**
 * התראות לטלפון. מדליקים פעם אחת על הטלפון עצמו; מרגע זה שרת קטן
 * (GitHub Action) שולח תזכורות גם כשהאפליקציה סגורה.
 */
export default function NotifyCard() {
  const toast = useToast()
  const [on, setOn] = useState(pushEnabled())
  const [busy, setBusy] = useState(false)

  const supported = 'serviceWorker' in navigator && 'PushManager' in window

  return (
    <div className="card pad">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>התראות לטלפון</div>
        <span className="tiny faint">{on ? 'דלוק במכשיר הזה' : 'כבוי'}</span>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        תזכורות גם כשהאפליקציה סגורה: חדשות הבוקר, שגרת בוקר וערב, אימון, וכל אירוע ביומן
        עשר דקות לפני. מדליקים על הטלפון — ההתראות מגיעות רק למכשיר שבו הודלק.
      </p>
      <p className="tiny faint" style={{ marginTop: 0 }}>
        הדיוק הוא בערך של עד עשר דקות — זה קצב השרת ששולח. לוח התזכורות נשמר מוצפן במחסן.
      </p>
      {!supported ? (
        <p className="tiny" style={{ color: 'var(--warn)' }}>
          הדפדפן הזה לא תומך בהתראות דחיפה.
        </p>
      ) : on ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn grow"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const ok = await writeNotifySchedule(true)
              setBusy(false)
              toast(ok ? 'הלוח עודכן ✓' : 'העדכון נכשל')
            }}
          >
            רענון הלוח עכשיו
          </button>
          <button
            className="btn ghost grow"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await disablePush()
              setOn(false)
              setBusy(false)
              toast('ההתראות כובו במכשיר הזה')
            }}
          >
            כיבוי
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const r = await enablePush()
            setBusy(false)
            if (r === 'ok') {
              setOn(true)
              toast('התראות הודלקו ✓')
            } else if (r === 'denied') toast('ההרשאה נדחתה — אפשר לאשר בהגדרות האתר בדפדפן')
            else if (r === 'no-key') toast('חסר מפתח התראות — פתח את קישור החיבור המעודכן במכשיר הזה')
            else if (r === 'unsupported') toast('הדפדפן לא תומך')
            else toast('לא הצליח — נסה שוב')
          }}
        >
          🔔 הדלק התראות במכשיר הזה
        </button>
      )}
      {!getNotifyKey() && supported && (
        <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
          במכשיר הזה עוד אין מפתח התראות — הוא מגיע דרך קישור החיבור.
        </p>
      )}
    </div>
  )
}
