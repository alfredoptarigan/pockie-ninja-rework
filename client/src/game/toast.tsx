// Reborn's toast (docs/audit/reborn-ui-audit.md §3): one message at a time, centred 50px above the
// middle of the screen, gone after 3 s, its glow green for success, red for failure, blue for info.
// Any window may call showToast; GameApp renders the single ToastHost.
import { useEffect, useSyncExternalStore } from 'react'

export const TOAST_MS = 3000
type Tone = 'success' | 'failure' | 'info'
interface Toast {
  id: number
  text: string
  tone: Tone
}

let current: Toast | null = null
let nextId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Replaces whatever toast is showing. */
export function showToast(text: string, tone: Tone = 'info') {
  current = { id: ++nextId, text, tone }
  emit()
}

const GLOW: Record<Tone, string> = { success: '#22c55e', failure: '#ef4444', info: '#3b82f6' }

export function ToastHost() {
  const toast = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      if (current?.id === toast.id) {
        current = null
        emit()
      }
    }, TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast) return null
  return (
    <div
      role={toast.tone === 'failure' ? 'alert' : 'status'}
      className="pointer-events-none fixed top-[calc(50%-50px)] left-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/80 px-5 py-2 font-game text-sm font-bold whitespace-nowrap text-white"
      style={{
        boxShadow: `0 0 12px 2px ${GLOW[toast.tone]}`,
        border: `1px solid ${GLOW[toast.tone]}`,
      }}
    >
      {toast.text}
    </div>
  )
}
