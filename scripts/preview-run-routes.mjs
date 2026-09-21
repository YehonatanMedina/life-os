// ---------------------------------------------------------------------------
// מייצר דף תצוגה של כל מסלולי הריצה על מפה אמיתית, לבדיקת עיניים.
//
// למה: מספר שנראה סביר לא אומר שהקו עובר במקום הנכון. הדף הזה מצייר כל מסלול
// מעל משבצות OpenStreetMap, עם האורך והעלייה שנמדדו — ואפשר לראות בשנייה
// אם הלולאה באמת מקיפה את הקמפוס או חותכת דרך בניין.
//
//   node scripts/preview-run-routes.mjs   →   .cache/run-routes/preview.html
// ---------------------------------------------------------------------------
import fs from 'fs'

const src = fs.readFileSync('src/runRoutes.ts', 'utf8')
const m = src.match(/export const RUN_ROUTES: RunRoute\[\] = (\[[\s\S]*?\])\n\nexport const AREA_LABEL/)
if (!m) throw new Error('לא נמצא RUN_ROUTES ב-src/runRoutes.ts')
const routes = JSON.parse(m[1])

const html = `<!doctype html>
<html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>מסלולי ריצה — בדיקה</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 16px; background: #0f1117; color: #e8eaf0; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
  .card { background: #171a22; border-radius: 12px; overflow: hidden; }
  .map { position: relative; height: 240px; background: #222; overflow: hidden; }
  .map img { position: absolute; width: 256px; height: 256px; }
  .map svg { position: absolute; inset: 0; }
  .meta { padding: 8px 12px 12px; }
  .meta b { display: block; font-size: 15px; }
  .meta span { color: #9aa0ae; font-size: 12px; }
  .warn { color: #ff8a80; }
</style>
<h1>מסלולי ריצה — ${routes.length} מסלולים</h1>
<div class="grid" id="g"></div>
<script>
const ROUTES = ${JSON.stringify(routes)};
const TILE = 256;
const lon2x = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z); };

for (const r of ROUTES) {
  const card = document.createElement('div');
  card.className = 'card';
  const map = document.createElement('div');
  map.className = 'map';
  card.appendChild(map);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = '<b>' + r.name + '</b><span>' + r.km + ' ק״מ · ' + r.gainM + ' מ׳ עלייה · ' +
    (r.loop ? 'לולאה' : 'חד־כיווני') + ' · ' + r.poly.length + ' נקודות<br>' + r.start + '</span>';
  card.appendChild(meta);
  document.getElementById('g').appendChild(card);

  const W = map.clientWidth || 330, H = 240, pad = 16;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of r.poly) { minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]); minLon = Math.min(minLon, p[1]); maxLon = Math.max(maxLon, p[1]); }
  let z = 18;
  for (; z > 11; z--) {
    const w = (lon2x(maxLon, z) - lon2x(minLon, z)) * TILE;
    const h = (lat2y(minLat, z) - lat2y(maxLat, z)) * TILE;
    if (w <= W - pad * 2 && h <= H - pad * 2) break;
  }
  const cx = (lon2x(minLon, z) + lon2x(maxLon, z)) / 2, cy = (lat2y(minLat, z) + lat2y(maxLat, z)) / 2;
  const ox = cx * TILE - W / 2, oy = cy * TILE - H / 2;
  for (let x = Math.floor(ox / TILE); x <= Math.floor((ox + W) / TILE); x++) {
    for (let y = Math.floor(oy / TILE); y <= Math.floor((oy + H) / TILE); y++) {
      const img = document.createElement('img');
      img.src = 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
      img.style.left = (x * TILE - ox) + 'px';
      img.style.top = (y * TILE - oy) + 'px';
      map.appendChild(img);
    }
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', r.poly.map(p => ((lon2x(p[1], z) * TILE - ox).toFixed(1)) + ',' + ((lat2y(p[0], z) * TILE - oy).toFixed(1))).join(' '));
  pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#ff3d71'); pl.setAttribute('stroke-width', '4'); pl.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(pl);
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', (lon2x(r.poly[0][1], z) * TILE - ox)); c.setAttribute('cy', (lat2y(r.poly[0][0], z) * TILE - oy));
  c.setAttribute('r', 5); c.setAttribute('fill', '#22e584'); c.setAttribute('stroke', '#0f1117'); c.setAttribute('stroke-width', '2');
  svg.appendChild(c);
  map.appendChild(svg);
}
</script>
</html>`

fs.mkdirSync('.cache/run-routes', { recursive: true })
fs.writeFileSync('.cache/run-routes/preview.html', html)
console.log('נכתב .cache/run-routes/preview.html')
