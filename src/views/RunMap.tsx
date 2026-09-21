// ---------------------------------------------------------------------------
// מפה — בלי ספריית מפות.
//
// למה: האפליקציה נבנית לקובץ אחד, עובדת אופליין, ובלי תלויות חיצוניות. ספריית
// מפות שוקלת מאות קילובייטים ומביאה איתה CSS משלה. כל מה שצריך כאן זה משבצות
// של OpenStreetMap (תמונות רגילות) ומעליהן SVG עם הקו — וזה בדיוק מה שיש כאן,
// בכמה עשרות שורות.
//
// מה שחשוב בטלפון:
//   * הזזה וזום בשתי אצבעות דרך Pointer Events, בלי גלילה של הדף מתחת.
//   * המשבצות נטענות רק למה שרואים, ונשמרות במטמון הדפדפן.
//   * בלי רשת — המשבצות לא מגיעות, והקו עדיין מצויר. ריצה בוואדי בלי קליטה
//     לא מאבדת את המסלול על המסך.
//
// זכויות: הנתונים הם של OpenStreetMap ותורמיו, והקרדיט מוצג על המפה.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { bounds, simplify, type Pt } from '../run'

const TILE = 256
const MIN_Z = 11
const MAX_Z = 18

const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z)
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z)
}

export type LatLon = [number, number]

type Props = {
  /** המסלול המתוכנן */
  route?: LatLon[]
  /** מה שנרוץ עד עכשיו */
  track?: Pt[] | LatLon[]
  /** סימון נקודה (המיקום הנוכחי) */
  here?: LatLon | null
  height?: number
  /** להצמיד את המרכז לנקודה האחרונה — במצב ריצה */
  follow?: boolean
  /**
   * תמונה ולא מפה: ברשימת המסלולים יש עשר מפות, וכל אחת מהן תופסת חצי
   * מגובה הכרטיס. בלי זה, גלילה ברשימה מזיזה את המפה שמתחת לאצבע במקום
   * לגלול — וגם נטענות עשרות משבצות שאיש לא ביקש.
   */
  preview?: boolean
  className?: string
}

function RunMapInner({ route, track, here, height = 220, follow = false, preview = false, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: height })
  const [view, setView] = useState<{ z: number; cx: number; cy: number } | null>(null)
  const [drag, setDrag] = useState(false)

  // ריצה של שעה היא כ-3600 נקודות, והמסך מתרנדר כל שנייה. פישוט לארבעה
  // מטרים לא נראה על מפה של 190 פיקסלים (שם פיקסל הוא כשני מטרים), אבל
  // חוסך פי שישה־עשר עבודה. עמוד השדרה נבנה כל שמונה קריאות בלבד, והזנב
  // אחריו גולמי — כך שקצה הקו תמיד מדויק.
  const raw = track ?? []
  const spineEnd = Math.floor(raw.length / 8) * 8
  const spine = useMemo(
    () => (spineEnd > 2 ? simplify(raw.slice(0, spineEnd) as Pt[], 4) : raw.slice(0, spineEnd)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spineEnd],
  )
  const trackPts: LatLon[] = useMemo(
    () => [...spine, ...raw.slice(spineEnd)].map((p) => [p[0], p[1]] as LatLon),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spine, raw.length],
  )

  const pts: LatLon[] = useMemo(
    () => [...(route ?? []), ...trackPts, ...(here ? [here] : [])],
    [route, trackPts, here],
  )

  // מודדים את הרוחב האמיתי — התאמת התיבה תלויה בו
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight || height })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  /** הזזה ידנית עוצרת את המעקב, כדי שאפשר יהיה להסתכל קדימה על המסלול */
  const [free, setFree] = useState(false)

  // התאמה ראשונה (ובמעקב — הצמדה לנקודה האחרונה)
  useEffect(() => {
    if (!size.w || !pts.length) return
    if (follow && here && !free) {
      setView((v) => {
        const z = v?.z ?? 16
        return { z, cx: lon2x(here[1], z), cy: lat2y(here[0], z) }
      })
      return
    }
    setView((v) => (v && (!follow || free) ? v : fit(pts, size.w, size.h)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, follow, free, here?.[0], here?.[1], pts.length === 0])

  // התאמה מחדש כשהמסלול עצמו מתחלף (בחירת מסלול אחר ברשימה)
  const routeKey = route?.length ? `${route.length}:${route[0][0]}:${route[0][1]}` : ''
  useEffect(() => {
    if (!size.w || !pts.length || follow) return
    setView(fit(pts, size.w, size.h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // מחוות: גרירה וזום בשתי אצבעות. touch-action: none כדי שהדף לא יזוז מתחת.
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; z: number } | null>(null)

  const onDown = (e: React.PointerEvent) => {
    if (preview) return
    // לחיצה על כפתורי הזום היא לחיצה, לא תחילת הזזה
    if ((e.target as Element).closest?.('.runmap-zoom')) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) setDrag(true)
    if (follow) setFree(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !view) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const all = [...pointers.current.values()]
    if (all.length >= 2) {
      const d = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y)
      if (!pinch.current) pinch.current = { dist: d, z: view.z }
      else {
        const ratio = d / pinch.current.dist
        const z = clamp(pinch.current.z + Math.log2(ratio), MIN_Z, MAX_Z)
        setView((v) => (v ? reZoom(v, z) : v))
      }
      return
    }
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    setView((v) => (v ? { ...v, cx: v.cx - dx / TILE, cy: v.cy - dy / TILE } : v))
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) setDrag(false)
  }

  if (!view || !size.w)
    return <div ref={box} className={`runmap${preview ? ' preview' : ''}${className ? ' ' + className : ''}`} style={{ height }} />

  const { z, cx, cy } = view
  const scale = Math.pow(2, z)
  const originX = cx * TILE - size.w / 2
  const originY = cy * TILE - size.h / 2
  const project = (p: LatLon): [number, number] => [lon2x(p[1], z) * TILE - originX, lat2y(p[0], z) * TILE - originY]

  const x0 = Math.floor(originX / TILE)
  const y0 = Math.floor(originY / TILE)
  const x1 = Math.floor((originX + size.w) / TILE)
  const y1 = Math.floor((originY + size.h) / TILE)
  const tiles: Array<{ key: string; url: string; left: number; top: number }> = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= scale) continue
      const wx = ((x % scale) + scale) % scale
      tiles.push({
        key: `${z}/${wx}/${y}`,
        url: `https://tile.openstreetmap.org/${z}/${wx}/${y}.png`,
        left: x * TILE - originX,
        top: y * TILE - originY,
      })
    }
  }

  const line = (ps: LatLon[]) => ps.map(project).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const routeLine = route && route.length > 1 ? line(route) : ''
  const trackLine = trackPts.length > 1 ? line(trackPts) : ''

  return (
    <div
      ref={box}
      className={`runmap${drag ? ' dragging' : ''}${preview ? ' preview' : ''}${className ? ' ' + className : ''}`}
      style={{ height }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          loading="lazy"
          draggable={false}
          width={TILE}
          height={TILE}
          style={{
            position: 'absolute',
            left: t.left,
            top: t.top,
            width: TILE,
            height: TILE,
            visibility: broken[t.key] ? 'hidden' : 'visible',
          }}
          onError={() => setBroken((b) => (b[t.key] ? b : { ...b, [t.key]: true }))}
          onLoad={() => setBroken((b) => (b[t.key] ? { ...b, [t.key]: false } : b))}
        />
      ))}

      <svg className="runmap-line" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden>
        {routeLine && (
          <>
            <polyline points={routeLine} className="rm-route-halo" />
            <polyline points={routeLine} className="rm-route" />
          </>
        )}
        {trackLine && (
          <>
            <polyline points={trackLine} className="rm-track-halo" />
            <polyline points={trackLine} className="rm-track" />
          </>
        )}
        {route && route.length > 1 && !trackPts.length && (
          <circle cx={project(route[0])[0]} cy={project(route[0])[1]} r={6} className="rm-start" />
        )}
        {here && (
          <>
            <circle cx={project(here)[0]} cy={project(here)[1]} r={11} className="rm-here-halo" />
            <circle cx={project(here)[0]} cy={project(here)[1]} r={5} className="rm-here" />
          </>
        )}
      </svg>

      {!preview && (
      <div className="runmap-zoom">
        <button type="button" aria-label="התקרבות" onClick={() => setView((v) => (v ? reZoom(v, Math.min(MAX_Z, v.z + 1)) : v))}>
          +
        </button>
        <button type="button" aria-label="התרחקות" onClick={() => setView((v) => (v ? reZoom(v, Math.max(MIN_Z, v.z - 1)) : v))}>
          −
        </button>
        <button
          type="button"
          aria-label="התאמת המסלול למסך"
          onClick={() => {
            setFree(false)
            setView(fit(pts, size.w, size.h))
          }}
        >
          ⤢
        </button>
      </div>
      )}
      {follow && free && (
        <button className="runmap-back" type="button" onClick={() => setFree(false)}>
          חזרה למיקום
        </button>
      )}
      <a className="runmap-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap
      </a>
    </div>
  )
}

/**
 * המסך החי מתרנדר כל שנייה (השעון), והמפה לא צריכה להתרנדר איתו: אם
 * המסלול, הקו והנקודה לא זזו — אין מה לצייר מחדש.
 */
const RunMap = React.memo(RunMapInner)
export default RunMap

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

function reZoom(v: { z: number; cx: number; cy: number }, z: number) {
  const f = Math.pow(2, z - v.z)
  return { z, cx: v.cx * f, cy: v.cy * f }
}

/** בוחר זום ומרכז שמכניסים את כל הנקודות למסך, עם שוליים */
function fit(pts: LatLon[], w: number, h: number) {
  const b = bounds(pts)
  if (!b) return { z: 15, cx: lon2x(35.0225, 15), cy: lat2y(32.7767, 15) }
  const pad = 28
  for (let z = MAX_Z; z >= MIN_Z; z--) {
    const x1 = lon2x(b.minLon, z) * TILE
    const x2 = lon2x(b.maxLon, z) * TILE
    const y1 = lat2y(b.maxLat, z) * TILE
    const y2 = lat2y(b.minLat, z) * TILE
    if (x2 - x1 <= w - pad * 2 && y2 - y1 <= h - pad * 2) {
      return { z, cx: (x1 + x2) / 2 / TILE, cy: (y1 + y2) / 2 / TILE }
    }
  }
  const z = MIN_Z
  return { z, cx: lon2x((b.minLon + b.maxLon) / 2, z), cy: lat2y((b.minLat + b.maxLat) / 2, z) }
}
