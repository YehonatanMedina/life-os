// ---------------------------------------------------------------------------
// בונה את קטלוג מסלולי הריצה (src/runRoutes.ts) מנקודות ציון אמיתיות.
//
// למה סקריפט ולא קובץ שנכתב ביד: מסלול שנכתב ביד הוא ניחוש. כאן כל מסלול
// עובר דרך מנוע ניתוב **רגלי** של OpenStreetMap — כלומר הקו עובר בדיוק על
// המדרכות, השבילים והטיילות שקיימים בשטח — ואז נדגם מול מודל הגובה של
// SRTM. המרחק והעלייה שמוצגים באפליקציה הם מה שיצא משם, לא הערכה.
//
// הרצה:  node scripts/build-run-routes.mjs
// תלוי ברשת. התשובות נשמרות במטמון מקומי (.cache/) כדי לא להעמיס על
// השירותים הציבוריים בכל הרצה.
//
// שירותים (בלי מפתחות, שימוש אישי קל):
//   ניתוב רגלי  https://routing.openstreetmap.de/routed-foot  (OSRM)
//   גבהים       https://api.opentopodata.org/v1/srtm30m
// ---------------------------------------------------------------------------
import fs from 'fs'
import path from 'path'

const CACHE = '.cache/run-routes'
const OUT = 'src/runRoutes.ts'
const UA = 'life-os-run-routes/1.0 (personal training app; contact via github.com/YehonatanMedina/life-os)'

/**
 * המסלולים. נקודות הציון הן מקומות אמיתיים שאפשר להצביע עליהם; המנוע הופך
 * אותן לקו שעובר על הדרכים עצמן. `loop: true` סוגר חזרה לנקודת ההתחלה.
 */
const ROUTES = [
  // ------ הטכניון והסביבה ------
  {
    id: 'technion-campus',
    name: 'הקפת קמפוס הטכניון',
    area: 'technion',
    surface: 'mixed',
    loop: true,
    start: 'השער הראשי, רחוב מל"ל',
    notes: 'המעגל הרשמי של הקמפוס — הגן האקולוגי, כיכר ריסמן, פארק קיסלק. מדרגות בקטעים, כמעט בלי צל. הכי קרוב לבית.',
    expectKm: 4.4,
    expectGain: 154,
    waypoints: [
      [32.7775, 35.0217],
      [32.7805, 35.0182],
      [32.7836, 35.0219],
      [32.7818, 35.0268],
      [32.7782, 35.0253],
    ],
  },
  {
    id: 'technion-west',
    name: 'סהר מערב הטכניון',
    area: 'technion',
    surface: 'trail',
    loop: true,
    start: 'גן לוקי, בקצה רמת אלון',
    notes: 'לולאת יער קצרה בקצה הקמפוס. עפר ושבילים, בלי צל. טוב להוספת קילומטר או לחימום.',
    expectKm: 1.9,
    expectGain: 45,
    waypoints: [
      [32.7791, 35.0141],
      [32.7812, 35.0118],
      [32.7830, 35.0150],
    ],
  },
  {
    id: 'ramat-alon-path',
    name: 'שביל רמת אלון',
    area: 'technion',
    surface: 'trail',
    loop: false,
    start: 'קצה רחוב מל"ל, ליד החניון שמחוץ לטכניון',
    notes: 'שביל לצד נחל קטן, עם קטעי מדרגות — מסלול חזרות עליות, לא ריצה רציפה.',
    expectKm: 1.8,
    expectGain: 70,
    waypoints: [
      [32.7768, 35.0193],
      [32.7752, 35.0157],
    ],
  },
  // ------ נווה שאנן ------
  {
    id: 'neve-shaanan-hanita',
    name: 'נווה שאנן ורחוב חניתה',
    area: 'city',
    surface: 'road',
    loop: true,
    start: 'מרכז נווה שאנן, ליד חורשת המייסדים',
    notes: 'חמישה קילומטרים כמעט מישוריים על רמת נווה שאנן — מואר, יש אנשים ברחוב, ויוצאים אליו מהדלת. מסלול ברירת המחדל לערב.',
    expectKm: 5.0,
    expectGain: 102,
    waypoints: [
      [32.7869, 35.0203],
      [32.7908, 35.0166],
      [32.7885, 35.0098],
      [32.7838, 35.0135],
      [32.7845, 35.0192],
    ],
  },
  {
    id: 'haifa-trail-06',
    name: 'שביל חיפה 06 — רמת נווה שאנן',
    area: 'city',
    surface: 'road',
    loop: false,
    start: 'רחוב ברל פינת פנחס ראם, שכונת זיו',
    notes: 'הקרקע השטוחה ביותר ליד הקמפוס, על הרמה בגובה 200 מטר. עובר בחורשת המייסדים ומסתיים בשער הטכניון.',
    expectKm: 5.5,
    expectGain: 60,
    waypoints: [
      [32.7946, 35.0234],
      [32.7912, 35.0189],
      [32.7869, 35.0203],
      [32.7820, 35.0206],
      [32.7775, 35.0217],
    ],
  },
  {
    id: 'ramot-remez-loop',
    name: 'רמות רמז ופארק הלוחם היהודי',
    area: 'city',
    surface: 'road',
    loop: true,
    start: 'נווה שאנן, לכיוון רמות רמז',
    notes: 'חלופה שקטה יותר למעגל של חניתה, עוברת ליד קיר העורבים.',
    expectKm: 5.3,
    expectGain: 101,
    waypoints: [
      [32.7855, 35.0158],
      [32.7889, 35.0089],
      [32.7845, 35.0041],
      [32.7811, 35.0110],
    ],
  },
  // ------ עליות ------
  {
    id: 'technion-abba-hushi',
    name: 'העלייה לאבא חושי',
    area: 'carmel',
    surface: 'mixed',
    loop: false,
    start: 'שער הטכניון, רחוב מל"ל (212 מ׳)',
    notes: 'העלייה המקומית הקלאסית: מ-212 מטר ל-440 בכניסה הצפונית לאוניברסיטה. מדרגות וגנים בדרך, חלקם מוצלים. אימון עלייה, לא טמפו.',
    expectKm: 4.2,
    expectGain: 250,
    waypoints: [
      [32.7775, 35.0217],
      [32.7727, 35.0166],
      [32.7681, 35.0116],
      [32.7644, 35.0093],
    ],
  },
  {
    id: 'carmel-ridge',
    name: 'ציר רכס הכרמל — אבא חושי',
    area: 'carmel',
    surface: 'road',
    loop: false,
    start: 'שדרות אבא חושי, הכניסה הצפונית לאוניברסיטה (440 מ׳)',
    notes: 'הרכס העליון דרך דניה, רמת גולדה ואחוזה. ירידה נטו, מדרכות רחבות — כאן אפשר לתפוס קצב.',
    expectKm: 6.8,
    expectGain: 90,
    waypoints: [
      [32.7644, 35.0093],
      [32.7702, 34.9995],
      [32.7768, 34.9925],
      [32.7845, 34.9871],
    ],
  },
  // ------ החוף ------
  {
    id: 'hecht-park',
    name: 'פארק הכט',
    area: 'coast',
    surface: 'promenade',
    loop: true,
    start: 'פארק הכט, שדרות מוריס פישר',
    notes: 'פארק מישורי לצד הים עם גשרי עץ מעל נחל לוטם ונחל עלייה. מסלול הליכה וריצה ייעודי.',
    expectKm: 4.0,
    expectGain: 20,
    waypoints: [
      [32.8164, 34.9554],
      [32.8205, 34.9585],
      [32.8148, 34.9601],
    ],
  },
  {
    id: 'coast-dado-batgalim',
    name: 'רצף הטיילות: דדו עד בת גלים',
    area: 'coast',
    surface: 'promenade',
    loop: false,
    start: 'חוף דדו דרום',
    notes: 'עשרה קילומטרים רצופים, מישוריים לגמרי, מוארים בלילה — הקרקע היחידה בעיר לריצה ארוכה בקצב מטרה. זה גם מסלול המרוץ.',
    expectKm: 10,
    expectGain: 45,
    waypoints: [
      [32.8118, 34.9536],
      [32.8164, 34.9554],
      [32.8232, 34.9585],
      [32.8290, 34.9620],
      [32.8331, 34.9690],
      [32.8339, 34.9817],
    ],
  },
  {
    id: 'technion-to-sea',
    name: 'מהטכניון אל הים',
    area: 'coast',
    surface: 'road',
    loop: false,
    start: 'שער הטכניון',
    notes: 'ירידה ארוכה מהקמפוס עד חוף דדו, ברובה על אספלט. טוב כחלק ראשון של ריצה ארוכה — בחזרה נוסעים.',
    expectKm: 9.7,
    expectGain: 161,
    waypoints: [
      [32.7775, 35.0217],
      [32.7830, 35.0085],
      [32.7930, 34.9930],
      [32.8060, 34.9730],
      [32.8164, 34.9554],
    ],
  },
  // ------ שטח ------
  {
    id: 'nahal-lotem',
    name: 'נחל לוטם — מגן האם אל הים',
    area: 'carmel',
    surface: 'trail',
    loop: false,
    start: 'גן האם, שדרות הנשיא (275 מ׳)',
    notes: 'ירידה מוצלת באפיק נחל, חורש עם ער אציל ומערה קטנה. סימון כחול. חד-כיווני — בסוף מגיעים לים.',
    expectKm: 3.5,
    expectGain: 20,
    waypoints: [
      [32.8056, 34.9869],
      [32.8110, 34.9770],
      [32.8148, 34.9640],
    ],
  },
  {
    id: 'carmel-forest-long',
    name: 'סביוני הכרמל ושווייץ הקטנה',
    area: 'carmel',
    surface: 'mixed',
    loop: true,
    start: 'נווה שאנן, לכיוון גן לאומי נחל נדר',
    notes: 'הארוך והקשה — כמעט ארבע מאות מטר עלייה דרך חורש הכרמל. ריצת כוח בסוף שבוע, לא ריצה בקצב.',
    expectKm: 13.7,
    expectGain: 395,
    waypoints: [
      [32.7838, 35.0135],
      [32.7750, 35.0060],
      [32.7690, 34.9975],
      [32.7772, 34.9905],
      [32.7860, 35.0020],
    ],
  },
]

// ---------------------------------------------------------------------------

async function cached(key, fn) {
  fs.mkdirSync(CACHE, { recursive: true })
  const p = path.join(CACHE, key + '.json')
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  const v = await fn()
  fs.writeFileSync(p, JSON.stringify(v))
  return v
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** OSRM רגלי: נקודות ציון -> קו שעובר על הדרכים עצמן */
async function snap(route) {
  const pts = route.loop ? [...route.waypoints, route.waypoints[0]] : route.waypoints
  const coords = pts.map(([lat, lon]) => `${lon},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=false`
  return cached(`snap-${route.id}`, async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) throw new Error(`${route.id}: routing ${r.status}`)
    const j = await r.json()
    if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(`${route.id}: routing ${j.code}`)
    return { distance: j.routes[0].distance, coords: j.routes[0].geometry.coordinates }
  })
}

/** דגימת גובה — מאה נקודות בבקשה, שנייה בין בקשות (מגבלת השירות הציבורי) */
async function elevations(id, pts) {
  return cached(`elev-${id}`, async () => {
    const out = []
    for (let i = 0; i < pts.length; i += 100) {
      const chunk = pts.slice(i, i + 100)
      const locs = chunk.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|')
      const r = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locs}`, { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`${id}: elevation ${r.status}`)
      const j = await r.json()
      for (const x of j.results ?? []) out.push(x.elevation)
      await sleep(1200)
    }
    return out
  })
}

// -- גיאומטריה (אותו חישוב כמו src/run.ts, מועתק כדי שהסקריפט ירוץ בלי בנייה) ------
const mPerDeg = (lat) => {
  const p = (lat * Math.PI) / 180
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  }
}
const dist = (a, b) => {
  const m = mPerDeg((a[0] + b[0]) / 2)
  return Math.hypot((b[1] - a[1]) * m.lon, (b[0] - a[0]) * m.lat)
}
const length = (pts) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)

function pointToSegment(p, a, b) {
  const m = mPerDeg(a[0])
  const px = (p[1] - a[1]) * m.lon
  const py = (p[0] - a[0]) * m.lat
  const bx = (b[1] - a[1]) * m.lon
  const by = (b[0] - a[0]) * m.lat
  const len2 = bx * bx + by * by
  if (!len2) return Math.hypot(px, py)
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return Math.hypot(px - t * bx, py - t * by)
}

function simplify(pts, tol) {
  if (pts.length <= 2) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let far = -1
    let best = tol
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegment(pts[i], pts[a], pts[b])
      if (d > best) {
        best = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = true
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** עלייה מצטברת, עם סף שמנקה את רעש מודל הגובה */
function gain(alts, step = 4) {
  let g = 0
  let ref = alts[0]
  for (const a of alts) {
    if (a - ref >= step) {
      g += a - ref
      ref = a
    } else if (ref - a >= step) ref = a
  }
  return Math.round(g)
}

// ---------------------------------------------------------------------------

const built = []
for (const route of ROUTES) {
  process.stdout.write(`${route.id}… `)
  const { distance, coords } = await snap(route)
  // OSRM מחזיר [lon,lat]; באפליקציה הכל [lat,lon]
  const full = coords.map(([lon, lat]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))])
  const poly = simplify(full, 6)
  const km = Math.round((length(poly) / 1000) * 100) / 100

  // דגימת גובה כל ~80 מטר, לא בכל נקודה — מספיק לפרופיל ולעלייה
  const sample = []
  let acc = 0
  for (let i = 0; i < poly.length; i++) {
    if (i === 0 || acc >= 80 || i === poly.length - 1) {
      sample.push(poly[i])
      acc = 0
    }
    if (i < poly.length - 1) acc += dist(poly[i], poly[i + 1])
  }
  const alts = await elevations(route.id, sample)
  const gainM = gain(alts)
  const minAlt = Math.min(...alts)
  const maxAlt = Math.max(...alts)

  built.push({ ...route, km, gainM, poly, minAlt, maxAlt, points: poly.length, snapped: Math.round(distance) })
  console.log(`${km} ק״מ · ${gainM} מ׳ עלייה · ${poly.length} נק׳`)
}

const ts = `// ---------------------------------------------------------------------------
// מסלולי ריצה בחיפה — נוצר על ידי scripts/build-run-routes.mjs, אל תערוך ביד.
//
// כל קו כאן עבר דרך מנוע ניתוב רגלי של OpenStreetMap, כלומר הוא רץ על
// המדרכות, השבילים והטיילות שקיימים בשטח. המרחק חושב מהקו עצמו, והעלייה
// נדגמה ממודל הגובה SRTM כל 80 מטר.
//
// נבנה: ${new Date().toISOString().slice(0, 10)}
// ---------------------------------------------------------------------------

export type RunArea = 'technion' | 'city' | 'carmel' | 'coast'
export type RunSurface = 'road' | 'trail' | 'promenade' | 'mixed'

export type RunRoute = {
  id: string
  name: string
  area: RunArea
  surface: RunSurface
  /** אורך בקילומטרים, מהקו עצמו */
  km: number
  /** עלייה מצטברת במטרים */
  gainM: number
  /** הגובה הנמוך והגבוה במסלול */
  minAlt: number
  maxAlt: number
  loop: boolean
  start: string
  notes: string
  /** הקו: [קו רוחב, קו אורך] */
  poly: Array<[number, number]>
}

export const RUN_ROUTES: RunRoute[] = ${JSON.stringify(
  built.map((b) => ({
    id: b.id,
    name: b.name,
    area: b.area,
    surface: b.surface,
    km: b.km,
    gainM: b.gainM,
    minAlt: Math.round(b.minAlt),
    maxAlt: Math.round(b.maxAlt),
    loop: b.loop,
    start: b.start,
    notes: b.notes,
    poly: b.poly,
  })),
  null,
  0,
)}

export const AREA_LABEL: Record<RunArea, string> = {
  technion: 'הטכניון והסביבה',
  city: 'העיר',
  carmel: 'הכרמל',
  coast: 'החוף',
}

export const SURFACE_LABEL: Record<RunSurface, string> = {
  road: 'כביש ומדרכה',
  trail: 'שביל עפר',
  promenade: 'טיילת',
  mixed: 'מעורב',
}

export const routeById = (id?: string): RunRoute | undefined => (id ? RUN_ROUTES.find((r) => r.id === id) : undefined)
`

fs.writeFileSync(OUT, ts)
console.log(`\nנכתב ${OUT}: ${built.length} מסלולים, ${Math.round(ts.length / 1024)}KB`)
for (const b of built) {
  const drift = Math.abs(b.snapped - b.km * 1000)
  if (drift > 40) console.log(`  דיוק: ${b.id} — הפרש ${Math.round(drift)} מ׳ בין המנוע לקו המפושט`)
  if (b.expectKm) {
    const off = Math.abs(b.km - b.expectKm) / b.expectKm
    if (off > 0.15) console.log(`  אורך: ${b.id} — ${b.km} ק״מ מול ${b.expectKm} שאומתו במחקר (${Math.round(off * 100)}%)`)
  }
  if (b.expectGain !== undefined && b.expectGain > 40) {
    const off = Math.abs(b.gainM - b.expectGain) / b.expectGain
    if (off > 0.3) console.log(`  עלייה: ${b.id} — ${b.gainM} מ׳ מול ${b.expectGain} שאומתו במחקר (${Math.round(off * 100)}%)`)
  }
}
