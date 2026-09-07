// ---------------------------------------------------------------------------
// התקנה כאפליקציה.
//
// הדפדפן מציע להתקין רק פעם אחת ובאופן שקט. אנחנו לוכדים את ההצעה בטעינה
// ומחזיקים אותה, כדי שהכפתור בהגדרות יעבוד מתי שרוצים — במחשב ובטלפון.
// אחרי ההתקנה זו חלון עצמאי עם אייקון משלו, שנפתח ועובד גם בלי רשת.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'

type Prompt = { prompt: () => void; userChoice: Promise<{ outcome: string }> }

let deferred: Prompt | null = null
const listeners = new Set<() => void>()
let snap = { canInstall: false, installed: false }

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (navigator as any).standalone === true
    )
  } catch {
    return false
  }
}

function emit() {
  const next = { canInstall: !!deferred, installed: isStandalone() }
  if (next.canInstall === snap.canInstall && next.installed === snap.installed) return
  snap = next
  listeners.forEach((l) => l())
}

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferred = e as unknown as Prompt
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
  emit()
}

export function useInstallState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => snap,
    () => snap,
  )
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  try {
    deferred.prompt()
    const res = await deferred.userChoice
    deferred = null
    emit()
    return res.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    deferred = null
    emit()
    return 'dismissed'
  }
}
