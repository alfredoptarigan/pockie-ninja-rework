export const CHAT_RATE_MAX = 5
export const CHAT_RATE_WINDOW_MS = 5_000

/**
 * Chat budget per character, shared by all of its tabs. A bucket outlives a disconnect until its
 * newest message leaves the window, so reconnecting never resets the budget.
 * ponytail: in-memory and per process; use a shared store when running several instances.
 */
export function createChatLimiter(isOnline: (characterId: string) => boolean) {
  const sent = new Map<string, number[]>()

  /** Call when a character's last socket leaves: drops its bucket once the window has passed. */
  function forgetWhenStale(characterId: string) {
    const newest = sent.get(characterId)?.at(-1)
    if (newest === undefined || isOnline(characterId)) return
    const wait = newest + CHAT_RATE_WINDOW_MS - Date.now()
    if (wait <= 0) sent.delete(characterId)
    // Re-checks then: a newer message or a return to the game keeps the bucket.
    else setTimeout(() => forgetWhenStale(characterId), wait).unref()
  }

  return {
    allow(characterId: string) {
      const now = Date.now()
      const recent = (sent.get(characterId) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS)
      const allowed = recent.length < CHAT_RATE_MAX
      sent.set(characterId, allowed ? [...recent, now] : recent)
      return allowed
    },
    forgetWhenStale,
    get size() {
      return sent.size
    },
  }
}
