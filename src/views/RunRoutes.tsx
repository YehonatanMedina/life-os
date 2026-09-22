// ---------------------------------------------------------------------------
// מסלולי ריצה — רשימה עם מפה אמיתית לכל מסלול, וכפתור אחד שמתחיל ריצה.
//
// המסלולים עצמם נוצרו ב-scripts/build-run-routes.mjs: כל קו עבר דרך מנוע
// ניתוב רגלי של OpenStreetMap ונדגם מול מודל גובה, כך שהאורך והעלייה הם
// מדידה ולא הערכה. כאן רק בוחרים.
//
// שתי ערים: חיפה וירושלים. סינון האזור מראה רק את האזורים של העיר שנבחרה —
// רשימת אזורים שחציה ריקה היא רשימה שקשה לקרוא.
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react'
import {
  AREA_LABEL,
  CITY_AREAS,
  CITY_LABEL,
  RUN_ROUTES,
  SURFACE_LABEL,
  type RunArea,
  type RunCity,
  type RunRoute,
} from '../runRoutes'
import RunMap from './RunMap'

type Dist = 'all' | 'short' | 'mid' | 'long'

const DIST_LABEL: Record<Dist, string> = {
  all: 'כל האורכים',
  short: 'עד 5 ק״מ',
  mid: '5 עד 10',
  long: '10 ומעלה',
}

const inDist = (r: RunRoute, d: Dist) =>
  d === 'all' || (d === 'short' ? r.km <= 5 : d === 'mid' ? r.km > 5 && r.km <= 10 : r.km > 10)

export default function RunRoutes({ onStart, targetKm }: { onStart: (routeId: string) => void; targetKm?: number }) {
  const [city, setCity] = useState<RunCity | 'all'>('all')
  const [area, setArea] = useState<RunArea | 'all'>('all')
  const [dist, setDist] = useState<Dist>('all')

  const areas = city === 'all' ? [] : CITY_AREAS[city]

  const list = useMemo(() => {
    const xs = RUN_ROUTES.filter(
      (r) => (city === 'all' || r.city === city) && (area === 'all' || r.area === area) && inDist(r, dist),
    )
    // כשיש יעד להיום — מה שקרוב אליו קודם; אחרת מהקצר לארוך
    return targetKm
      ? [...xs].sort((a, b) => Math.abs(a.km - targetKm) - Math.abs(b.km - targetKm))
      : [...xs].sort((a, b) => a.km - b.km)
  }, [city, area, dist, targetKm])

  const pickCity = (c: RunCity | 'all') => {
    setCity(c)
    setArea('all')
  }

  return (
    <div className="stack">
      <div className="route-filters" role="group" aria-label="סינון לפי עיר">
        {(['all', 'haifa', 'jerusalem'] as const).map((c) => (
          <button key={c} className={`btn xs${city === c ? ' primary' : ''}`} onClick={() => pickCity(c)}>
            {c === 'all' ? 'הכל' : CITY_LABEL[c]}
          </button>
        ))}
      </div>

      {!!areas.length && (
        <div className="route-filters" role="group" aria-label="סינון לפי אזור">
          <button className={`btn xs${area === 'all' ? ' primary' : ''}`} onClick={() => setArea('all')}>
            כל האזורים
          </button>
          {areas.map((a) => (
            <button key={a} className={`btn xs${area === a ? ' primary' : ''}`} onClick={() => setArea(a)}>
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      <div className="route-filters" role="group" aria-label="סינון לפי אורך">
        {(['all', 'short', 'mid', 'long'] as const).map((d) => (
          <button key={d} className={`btn xs${dist === d ? ' primary' : ''}`} onClick={() => setDist(d)}>
            {DIST_LABEL[d]}
          </button>
        ))}
      </div>

      {targetKm ? (
        <div className="tiny faint">היעד היום {targetKm} ק״מ — המסלולים מסודרים לפי הקרבה אליו.</div>
      ) : null}

      {!list.length && <div className="card pad small muted">אין מסלול שמתאים לסינון הזה.</div>}

      {list.map((r) => (
        <div key={r.id} className="card route-card">
          <RunMap route={r.poly} height={168} preview />
          <div className="pad">
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <b>{r.name}</b>
                <div className="tiny faint">
                  {CITY_LABEL[r.city]} · {r.start}
                </div>
              </div>
              <button className="btn sm primary" onClick={() => onStart(r.id)}>
                התחל
              </button>
            </div>
            <div className="route-facts" style={{ margin: '8px 0' }}>
              <span>
                <b className="ltr">{r.km}</b> ק״מ
              </span>
              <span>
                עלייה <b className="ltr">{r.gainM}</b> מ׳
              </span>
              <span>{SURFACE_LABEL[r.surface]}</span>
              <span>{r.loop ? 'לולאה' : `חד־כיווני · הלוך-חזור ${(r.km * 2).toFixed(1)}`}</span>
              <span>
                <b className="ltr">{r.minAlt}–{r.maxAlt}</b> מ׳ גובה
              </span>
            </div>
            <div className="small muted">{r.notes}</div>
          </div>
        </div>
      ))}

      <div className="tiny faint center" style={{ paddingBottom: 8 }}>
        המסלולים והמפות מבוססים על נתוני OpenStreetMap ותורמיו.
      </div>
    </div>
  )
}
