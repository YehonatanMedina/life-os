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
/**
 * expectKm / expectGain הם המדידה שאומתה — לא הערכה מהמחקר. תפקידם לתפוס
 * סחיפה עתידית: אם ניתוב מחדש מחזיר אורך אחר, הבנייה מתריעה ואני בודק למה.
 */

/**
 * נקודות עוגן שאומתו מול Nominatim (קידוד גיאוגרפי של OpenStreetMap) —
 * ולא נקודות שנבחרו על המפה בעין. כל מסלול מורכב מהן.
 */
const P = {
  technion: [32.777415, 35.022628],
  technionGarden: [32.778196, 35.024332],
  neveShaanan: [32.787396, 35.018903],
  sportek: [32.789145, 35.010688],
  ramatAlon: [32.776428, 35.012278],
  ravensWall: [32.778673, 35.012917],
  jewishFighterPark: [32.778382, 35.009362],
  university: [32.760946, 35.020464],
  ramatGolda: [32.773791, 35.002007],
  denya: [32.766997, 34.995534],
  ahuza: [32.787754, 34.986866],
  ganHaem: [32.804678, 34.987909],
  louis: [32.810489, 34.98564],
  stellaMaris: [32.819058, 34.982546],
  matam: [32.790385, 34.96134],
  dado: [32.797512, 34.955923],
  zamir: [32.798955, 34.956119],
  carmelBeach: [32.805687, 34.955176],
  hecht: [32.817864, 34.955424],
  batGalim: [32.832853, 34.974069],

  // ירושלים — אותו אימות מול Nominatim
  firstStation: [31.766333, 35.224783],
  germanColony: [31.764391, 35.220551],
  bakaPark: [31.761155, 35.218176],
  mesilaPark: [31.753356, 35.209562],
  teddy: [31.75112, 35.190833],
  sacher: [31.779868, 35.207583],
  valleyOfCross: [31.772064, 35.208245],
  israelMuseum: [31.771888, 35.203387],
  givatRam: [31.77294, 35.197995],
  gazelleValley: [31.760217, 35.195491],
  libertyBell: [31.768881, 35.223546],
  sultanPool: [31.771786, 35.226254],
  jaffaGate: [31.776562, 35.227271],
  haasPromenade: [31.754977, 35.228745],
  goldmanPromenade: [31.755806, 35.237189],
  mountHerzl: [31.772361, 35.181634],
  yadVashem: [31.774069, 35.174915],
  einKerem: [31.767637, 35.163903],
  katamonim: [31.749557, 35.199842],
  biblicalZoo: [31.746483, 35.176464],
}

const ROUTES = [
  {
    id: 'technion-campus',
    name: 'הקפת קמפוס הטכניון',
    city: 'haifa',
    area: 'technion',
    surface: 'mixed',
    loop: true,
    start: 'קרית הטכניון',
    notes: 'הקפה בתוך הקמפוס דרך הגן האקולוגי — שני קילומטרים עם עלייה קטנה. הכי קרוב לבית, מואר בלילה, וכמעט בלי צל בצהריים; שתי הקפות זה כבר אימון.',
    expectKm: 2.2,
    expectGain: 76,
    waypoints: [P.technion, P.technionGarden, [32.7805, 35.0205], [32.7760, 35.0195]],
  },
  {
    id: 'neve-shaanan-loop',
    name: 'נווה שאנן — הקפת השכונה',
    city: 'haifa',
    area: 'city',
    surface: 'road',
    loop: true,
    start: 'מרכז נווה שאנן',
    notes: 'שישה קילומטרים על רמת נווה שאנן: מואר, יש אנשים ברחוב, ויוצאים אליו מהדלת. מסלול ברירת המחדל לערב.',
    expectKm: 6.2,
    expectGain: 146,
    waypoints: [P.neveShaanan, P.sportek, P.ramatAlon, P.technion],
  },
  {
    id: 'ramot-remez-loop',
    name: 'רמות רמז וקיר העורבים',
    city: 'haifa',
    area: 'city',
    surface: 'road',
    loop: true,
    start: 'רמת אלון',
    notes: 'חלופה שקטה יותר להקפת השכונה, חמישה קילומטרים דרך פארק הלוחם היהודי וקיר העורבים.',
    expectKm: 4.7,
    expectGain: 132,
    waypoints: [P.ramatAlon, P.ravensWall, P.jewishFighterPark, P.sportek],
  },
  {
    id: 'technion-university-climb',
    name: 'העלייה מהטכניון לאוניברסיטה',
    city: 'haifa',
    area: 'carmel',
    surface: 'mixed',
    loop: false,
    start: 'קרית הטכניון',
    notes: 'העלייה המקומית הקלאסית — מ-196 מטר ל-472, כ-280 מטר עלייה מצטברת בארבעה קילומטרים. אימון עלייה, לא ריצת קצב; בחזרה יורדים רגוע.',
    expectKm: 4.0,
    expectGain: 282,
    waypoints: [P.technion, P.university],
  },
  {
    id: 'carmel-ridge',
    name: 'רכס הכרמל — אוניברסיטה עד אחוזה',
    city: 'haifa',
    area: 'carmel',
    surface: 'road',
    loop: false,
    start: 'אוניברסיטת חיפה, שדרות אבא חושי',
    notes: 'הציר העליון דרך רמת גולדה ואחוזה: חמישה קילומטרים, מדרכות רחבות וירידה נטו של כ-190 מטר — כאן אפשר לתפוס קצב. בחזרה זו עלייה.',
    expectKm: 5.0,
    expectGain: 23,
    waypoints: [P.university, P.ramatGolda, P.ahuza],
  },
  {
    id: 'carmel-center-ridge',
    name: 'מרכז הכרמל: גן האם, טיילת לואי וסטלה מאריס',
    city: 'haifa',
    area: 'carmel',
    surface: 'mixed',
    loop: false,
    start: 'גן האם, שדרות הנשיא',
    notes: 'מגן האם דרך טיילת לואי לסטלה מאריס, עם הנוף למפרץ. שלושה קילומטרים כמעט רצופים במורד — נוח בכיוון הזה, וקשה בחזרה.',
    expectKm: 3.2,
    expectGain: 5,
    waypoints: [P.ganHaem, P.louis, P.stellaMaris],
  },
  {
    id: 'coast-dado-batgalim',
    name: 'רצף הטיילות: דדו עד בת גלים',
    city: 'haifa',
    area: 'coast',
    surface: 'promenade',
    loop: false,
    start: 'מת"ם, בקצה הדרומי של הטיילת',
    notes: 'שישה וחצי קילומטרים רצופים על הטיילת, מישוריים לגמרי ומוארים בלילה — הקרקע הטובה בעיר לריצה ארוכה בקצב מטרה. הלוך-חזור זה כבר שלוש-עשרה.',
    expectKm: 6.5,
    expectGain: 27,
    waypoints: [P.matam, P.dado, P.zamir, P.carmelBeach, P.hecht, P.batGalim],
  },
  {
    id: 'hecht-carmel-beach',
    name: 'פארק הכט וחוף הכרמל',
    city: 'haifa',
    area: 'coast',
    surface: 'promenade',
    loop: false,
    start: 'פארק הכט',
    notes: 'הקטע הקצר והמישורי על הים — קילומטר וחצי לכיוון, טוב לחימום, לאינטרוולים ולקצב אחיד. אין צל בצהריים.',
    expectKm: 1.4,
    expectGain: 10,
    waypoints: [P.hecht, P.carmelBeach],
  },
  {
    id: 'technion-to-sea',
    name: 'מהטכניון אל הים',
    city: 'haifa',
    area: 'coast',
    surface: 'road',
    loop: false,
    start: 'קרית הטכניון',
    notes: 'מהקמפוס אל חוף דדו: קודם עלייה אל מרכז הכרמל, ואחר כך ירידה ארוכה עד הים. אחד־עשר קילומטרים, ברובם אספלט — בחזרה נוסעים.',
    expectKm: 11.4,
    expectGain: 232,
    waypoints: [P.technion, P.ganHaem, P.dado],
  },
  {
    id: 'ganhaem-to-sea',
    name: 'מגן האם אל הים',
    city: 'haifa',
    area: 'carmel',
    surface: 'mixed',
    loop: false,
    start: 'גן האם, מרכז הכרמל',
    notes: 'מהרכס אל פארק הכט — כמעט חמישה קילומטרים, כמעט הכל במורד. נוח לרגליים בכיוון הזה בלבד.',
    expectKm: 4.7,
    expectGain: 0,
    waypoints: [P.ganHaem, P.hecht],
  },
  {
    id: 'carmel-long-loop',
    name: 'הלולאה הארוכה: נווה שאנן, רמת גולדה ודניה',
    city: 'haifa',
    area: 'carmel',
    surface: 'mixed',
    loop: true,
    start: 'מרכז נווה שאנן',
    notes: 'הארוך והקשה — ארבעה-עשר קילומטר ו-400 מטר עלייה מצטברת דרך הרכס וחזרה. ריצת כוח לסוף שבוע, לא ריצה בקצב.',
    expectKm: 14.0,
    expectGain: 408,
    waypoints: [P.neveShaanan, P.ramatAlon, P.ramatGolda, P.denya, P.ahuza],
  },

  // -- ירושלים ---------------------------------------------------------------
  {
    id: 'jer-mesila-full',
    name: 'פארק המסילה — מהתחנה ועד גן החיות',
    city: 'jerusalem',
    area: 'mesila',
    surface: 'promenade',
    loop: false,
    start: 'התחנה הראשונה',
    notes: 'פארק המסילה במלואו, שבעה וחצי קילומטרים מהתחנה הראשונה ועד גן החיות התנ״כי: מסילת רכבת ישנה שהפכה לטיילת רצופה, מוארת בלילה ובלי רמזור אחד. זו הקרקע הטובה בירושלים לריצה ארוכה בקצב אחיד — המקבילה המקומית לטיילת החוף בחיפה.',
    expectKm: 7.5,
    expectGain: 53,
    waypoints: [P.firstStation, P.germanColony, P.bakaPark, P.mesilaPark, P.katamonim, P.teddy, P.biblicalZoo],
  },
  {
    id: 'jer-mesila-short',
    name: 'המסילה: מהתחנה הראשונה למקור חיים',
    city: 'jerusalem',
    area: 'mesila',
    surface: 'promenade',
    loop: false,
    start: 'התחנה הראשונה',
    notes: 'הקטע הצפוני של המסילה, דרך המושבה הגרמנית ובקע. שניים וחצי קילומטרים כמעט מישוריים לגמרי, קרוב למרכז ומלא אנשים בערב — טוב לחימום, להאצות ולריצה קצרה.',
    expectKm: 2.6,
    expectGain: 5,
    waypoints: [P.firstStation, P.germanColony, P.bakaPark, P.mesilaPark],
  },
  {
    id: 'jer-parks-loop',
    name: 'הקפת הפארקים: סאקר, המצלבה וגבעת רם',
    city: 'jerusalem',
    area: 'jer-city',
    surface: 'mixed',
    loop: true,
    start: 'גן סאקר',
    notes: 'חמישה קילומטרים דרך גן סאקר, עמק המצלבה, מוזיאון ישראל וגבעת רם. ירוק ומוצל יחסית, עם כ-90 מטר עלייה מצטברת בגבעות קצרות.',
    expectKm: 5.1,
    expectGain: 87,
    waypoints: [P.sacher, P.valleyOfCross, P.israelMuseum, P.givatRam],
  },
  {
    id: 'jer-gazelle-mesila',
    name: 'עמק הצבאים והמסילה',
    city: 'jerusalem',
    area: 'mesila',
    surface: 'mixed',
    loop: true,
    start: 'עמק הצבאים',
    notes: 'שישה וחצי קילומטרים שמחברים את שמורת עמק הצבאים למסילה: שבילי עפר רכים לרגליים בתוך העיר, ו-140 מטר עלייה בדרך חזרה למעלה. טוב לימים שבהם האספלט מתחיל להרגיש.',
    expectKm: 6.5,
    expectGain: 142,
    waypoints: [P.gazelleValley, P.mesilaPark, P.bakaPark],
  },
  {
    id: 'jer-promenade',
    name: 'טיילת ארמון הנציב וטיילת גולדמן',
    city: 'jerusalem',
    area: 'jer-city',
    surface: 'promenade',
    loop: false,
    start: 'טיילת ארמון הנציב',
    notes: 'קילומטר אחד של טיילת רחבה ומרוצפת עם הנוף הכי טוב בעיר. קצרה מדי לריצה שלמה — הלוך-חזור זה שני קילומטרים, והיא מצוינת לחימום, להאצות, או כסיום של ריצה ארוכה יותר.',
    expectKm: 0.9,
    expectGain: 4,
    waypoints: [P.haasPromenade, P.goldmanPromenade],
  },
  {
    id: 'jer-old-city-walls',
    name: 'סביב חומות העיר העתיקה',
    city: 'jerusalem',
    area: 'jer-city',
    surface: 'road',
    loop: true,
    start: 'התחנה הראשונה',
    notes: 'שלושה וחצי קילומטרים מהתחנה הראשונה דרך בריכת הסולטן, שער יפו וגן הפעמון וחזרה. ירושלמי מאוד, ועם מדרגות ועיקולים שמפריעים לקצב — זו ריצה שרצים בשביל הריצה, לא בשביל השעון.',
    expectKm: 3.5,
    expectGain: 44,
    waypoints: [P.firstStation, P.sultanPool, P.jaffaGate, P.libertyBell],
  },
  {
    id: 'jer-herzl-einkerem',
    name: 'מהר הרצל לעין כרם',
    city: 'jerusalem',
    area: 'jer-hills',
    surface: 'mixed',
    loop: false,
    start: 'הר הרצל',
    notes: 'ארבעה קילומטרים במורד, מהר הרצל דרך יד ושם אל עין כרם — ירידה של כ-180 מטר בשוליים של יער ירושלים. היפה בעיר, ובחזרה זו אותה ירידה כעלייה, אז עדיף לתכנן הסעה.',
    expectKm: 4.0,
    expectGain: 33,
    waypoints: [P.mountHerzl, P.yadVashem, P.einKerem],
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
  // שלושה מטרים ולא שישה: הקו שמציירים צריך להיות באותו אורך של המסלול
  // שמדווח — ב-6 מטרים הפרש הגיע ל-173 מטר על הלולאה הארוכה.
  const poly = simplify(full, 3)
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
// מסלולי ריצה בחיפה ובירושלים — נוצר על ידי scripts/build-run-routes.mjs.
// אל תערוך ביד.
//
// כל קו כאן עבר דרך מנוע ניתוב רגלי של OpenStreetMap, כלומר הוא רץ על
// המדרכות, השבילים והטיילות שקיימים בשטח. המרחק חושב מהקו עצמו, והעלייה
// נדגמה ממודל הגובה SRTM כל 80 מטר.
//
// נבנה: ${new Date().toISOString().slice(0, 10)}
// ---------------------------------------------------------------------------

export type RunCity = 'haifa' | 'jerusalem'
export type RunArea = 'technion' | 'city' | 'carmel' | 'coast' | 'mesila' | 'jer-city' | 'jer-hills'
export type RunSurface = 'road' | 'trail' | 'promenade' | 'mixed'

export type RunRoute = {
  id: string
  name: string
  city: RunCity
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
    city: b.city,
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

export const CITY_LABEL: Record<RunCity, string> = {
  haifa: 'חיפה',
  jerusalem: 'ירושלים',
}

export const AREA_LABEL: Record<RunArea, string> = {
  technion: 'הטכניון והסביבה',
  city: 'העיר',
  carmel: 'הכרמל',
  coast: 'החוף',
  mesila: 'פארק המסילה',
  'jer-city': 'העיר והטיילות',
  'jer-hills': 'הרי ירושלים',
}

/** אילו אזורים שייכים לאיזו עיר — לסינון שלא מציג אזור ריק */
export const CITY_AREAS: Record<RunCity, RunArea[]> = {
  haifa: ['technion', 'city', 'carmel', 'coast'],
  jerusalem: ['mesila', 'jer-city', 'jer-hills'],
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
