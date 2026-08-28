// ---------------------------------------------------------------------------
// מבטיח שהמסמך מוגדר נכון גם כשהדף מוגש בתוך מעטפת חיצונית
// (עברית, כיוון RTL, viewport לנייד, צבע סרגל).
// ---------------------------------------------------------------------------
export function bootstrapDocument() {
  const el = document.documentElement
  if (el.lang !== 'he') el.lang = 'he'
  if (el.dir !== 'rtl') el.dir = 'rtl'

  const ensureMeta = (name: string, content: string) => {
    let m = document.querySelector(`meta[name="${name}"]`)
    if (!m) {
      m = document.createElement('meta')
      m.setAttribute('name', name)
      document.head.appendChild(m)
    }
    if (name === 'viewport' || !m.getAttribute('content')) {
      m.setAttribute('content', content)
    }
  }

  ensureMeta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
  ensureMeta('theme-color', '#f6f7f9')
  ensureMeta('apple-mobile-web-app-capable', 'yes')
  ensureMeta('apple-mobile-web-app-title', 'מערכת ההפעלה')
  ensureMeta('apple-mobile-web-app-status-bar-style', 'default')
  ensureMeta('mobile-web-app-capable', 'yes')
  ensureMeta('application-name', 'מערכת ההפעלה')

  if (!document.getElementById('root')) {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
  }
}
