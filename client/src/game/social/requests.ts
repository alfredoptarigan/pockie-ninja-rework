// Starts a whisper in the chat box from another window (friend rows, mail).

type WhisperListener = (name: string) => void
const whisperListeners = new Set<WhisperListener>()

/** Asks the chat box to prefill `/Name ` (Chat subscribes with onWhisperRequest). */
export function requestWhisper(name: string) {
  for (const listener of whisperListeners) listener(name)
}

/** For the chat box: `useEffect(() => onWhisperRequest(startWhisper), [])`. */
export function onWhisperRequest(listener: WhisperListener) {
  whisperListeners.add(listener)
  return () => void whisperListeners.delete(listener)
}
