const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60_000
const MAX_KEYS = 10_000

interface Entry {
  count: number
  resetAt: number
}

/**
 * Counts login attempts per account so guessing one password from many IPs still hits a wall.
 * An attempt is reserved before the password check and cleared by a successful login, so
 * simultaneous guesses cannot all slip past the budget.
 * ponytail: in-memory and per process; move to Postgres or Redis when running several instances.
 */
export function createLoginLimiter(maxKeys = MAX_KEYS) {
  let attempts = new Map<string, Entry>()

  function makeRoom(now: number) {
    if (attempts.size < maxKeys) return
    attempts = new Map([...attempts].filter(([, entry]) => entry.resetAt > now))
    // Still full of live entries: forget the oldest one rather than grow without bound.
    const oldest = attempts.keys().next()
    if (attempts.size >= maxKeys && !oldest.done) attempts.delete(oldest.value)
  }

  return {
    /** Counts one attempt for this key; false (and nothing counted) once the key is locked. */
    reserve(key: string) {
      const now = Date.now()
      const entry = attempts.get(key)
      if (entry && entry.resetAt > now) {
        if (entry.count >= MAX_ATTEMPTS) return false
        attempts.set(key, { ...entry, count: entry.count + 1 })
        return true
      }
      makeRoom(now)
      attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return true
    },

    reset: (key: string) => attempts.delete(key),
  }
}
