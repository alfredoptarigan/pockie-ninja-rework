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

// Reborn's "Link in Chat" item menu entry: the chat box appends "[Name]" and takes the focus.
type LinkListener = (name: string) => void
const linkListeners = new Set<LinkListener>()

export function requestItemLink(name: string) {
  for (const listener of linkListeners) listener(name)
}

export function onItemLinkRequest(listener: LinkListener) {
  linkListeners.add(listener)
  return () => void linkListeners.delete(listener)
}
