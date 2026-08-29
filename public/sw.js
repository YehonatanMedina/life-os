// ---------------------------------------------------------------------------
// Service Worker — האפליקציה נפתחת גם בלי אינטרנט.
//
// לדף עצמו: קודם רשת (כדי לקבל עדכונים), ואם אין — מהמטמון.
// לנכסים (אייקונים, גופנים): קודם מטמון, ורשת ברקע.
// לבקשות ל-API של GitHub: אף פעם לא נוגעים — הסנכרון חייב להיות אמיתי.
// ---------------------------------------------------------------------------
const VERSION = 'v3'
const SHELL = 'life-os-shell-' + VERSION
const ASSETS = 'life-os-assets-' + VERSION

const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

// התראות דחיפה — מוצגות גם כשהאפליקציה סגורה
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { title: 'מערכת ההפעלה', body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'מערכת ההפעלה', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: data.tag || undefined,
      data: { url: './' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return clients.openWindow('./')
    }),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // סנכרון — תמיד רשת אמיתית, בלי מטמון
  if (url.hostname === 'api.github.com' || url.hostname === 'gist.githubusercontent.com') return
  // חדשות הבוקר — תמיד טריות; הטקסט ממילא נשמר ב-localStorage לאופליין
  if (url.pathname.includes('/news/')) return

  // ניווט לדף — רשת קודם, מטמון כגיבוי
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    )
    return
  }

  // שאר הנכסים — מטמון קודם, ורענון ברקע
  if (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {})
            }
            return res
          })
          .catch(() => hit)
        return hit || net
      }),
    )
  }
})
