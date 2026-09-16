// ---------------------------------------------------------------------------
// הגדרות → אטלס: המפתח למסלול המהיר, בדיקת חיבור, ומה זה עולה החודש.
// ---------------------------------------------------------------------------
import React, { useState } from 'react'
import { actions, useApp } from '../store'
import { useToast } from '../ui'
import { aiKey } from '../ai'
import { useAtlas } from '../atlas'
import { nudgePush } from '../cloud'
import { FAST_MODEL, USD_TO_ILS, readApiFailure, readUsage, testFast, usageCostUSD } from '../atlasFast'

const fmt = (n: number) => n.toLocaleString('he-IL')

export default function AtlasCard() {
  const s = useApp()
  const cache = useAtlas()
  const toast = useToast()
  const [draft, setDraft] = useState(s.settings.apiKey ?? '')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tick, setTick] = useState(0)
  const usage = readUsage()
  const cost = usageCostUSD(usage)
  // התקלה האחרונה כפי שה-API ניסח אותה. "שגיאה 400" בלי סיבה עלתה חצי יום.
  const fail = readApiFailure()
  const deepReady = !!aiKey(s)
  const fast = !!(s.settings.apiKey ?? '').trim()
  void tick

  const commit = () => {
    const v = draft.trim()
    if (v === (s.settings.apiKey ?? '')) return
    actions.setSettings({ apiKey: v })
    toast(v ? 'המפתח נשמר — מסונכרן מוצפן לכל המכשירים' : 'המסלול המהיר כבוי')
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>אטלס</h3>
        <span className="tiny faint">
          {fast ? 'מהיר: פעיל' : 'מהיר: כבוי'} · {deepReady ? 'עמוק: מחובר' : 'עמוק: לא מחובר'}
        </span>
      </div>
      <p className="small muted" style={{ margin: '0 0 10px' }}>
        שני מסלולים, זיכרון אחד. <b>המהיר</b> עונה תוך שניות מהאפליקציה עצמה ({FAST_MODEL}) — שאלות,
        התייעצות, עדכונים ותזוזות ביומן. <b>העמוק</b> הוא השגרה בענן: שינויים בקוד ותכנון ארוך.
        אטלס מעביר לשם לבד כשצריך, או כשמסמנים "משימה גדולה" ליד השליחה.
      </p>

      <label className="field" style={{ marginBottom: 8 }}>
        <span>מפתח API של Claude (למסלול המהיר)</span>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input grow ltr"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="מפתח API של Claude"
          />
          <button className="btn sm" type="button" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? 'הסתר' : 'הצג'}
          </button>
        </div>
      </label>
      <div className="tiny faint" style={{ marginBottom: 10 }}>
        נשמר בהגדרות — מוצפן במחסן ומסונכרן לכל המכשירים, לעולם לא בקוד. מפתח יוצרים ב-platform.claude.com.
        הקריאות יוצאות ישירות מהדפדפן ל-Claude, בלי שרת ביניים.
      </div>

      {fail && (
        <div className="card rail alert" style={{ ['--rail' as any]: 'var(--bad)', marginBottom: 10 }}>
          <div className="txt">
            <b>
              התקלה האחרונה ב-{new Date(fail.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} · שגיאה{' '}
              {fail.status}
              {fail.errType ? ` (${fail.errType})` : ''}
            </b>
            <div className="tiny" style={{ whiteSpace: 'pre-wrap' }}>
              {fail.message || 'Claude לא החזיר הסבר.'}
            </div>
            {fail.req && (
              <div className="tiny faint">
                הבקשה: {fail.req.model} · {fmt(fail.req.totalChars)} תווים · {fail.req.messages.length} תורות ·{' '}
                {fail.req.systemChars.length} בלוקי מערכת ({fail.req.systemChars.map(fmt).join(' / ')}) · תקרה{' '}
                {fmt(fail.req.maxTokens)}
                {fail.requestId ? ` · ${fail.requestId}` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn sm"
          type="button"
          disabled={!draft.trim() || testing}
          onClick={async () => {
            commit()
            setTesting(true)
            // הבדיקה שולחת את הבקשה האמיתית — עם הזיכרון וההקשר, לא "שלום" קצר
            const r = await testFast(draft, { memory: cache.memory ?? '' })
            setTesting(false)
            setTick((x) => x + 1)
            // תקלה נוסעת למחסן מיד, גם כשהיא קרתה כאן בהגדרות
            if (!r.ok) nudgePush()
            toast(r.ok ? `מחובר. Claude ענה תוך ${(r.ms / 1000).toFixed(1)} שנ׳ על בקשה של ${fmt(r.chars)} תווים` : r.error)
          }}
        >
          {testing ? 'בודק…' : 'בדיקת חיבור'}
        </button>
        <span className="tiny faint">
          החודש במכשיר הזה: {fmt(usage.calls)} פניות · {fmt(usage.input + usage.cacheRead + usage.cacheWrite)} טוקנים נכנסים ·{' '}
          {fmt(usage.output)} יוצאים · ≈ {(cost * USD_TO_ILS).toFixed(2)} ₪
        </span>
      </div>
    </div>
  )
}
