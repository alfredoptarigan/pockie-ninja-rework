const MAX_FAILURES = 10
const WINDOW_MS = 15 * 60_000
const SWEEP_AT_SIZE = 10_000

interface Entry {
  count: number
  resetAt: number
}

/**
 * Counts failed logins per account so guessing one password from many IPs still hits a wall.
 * ponytail: in-memory and per process; move to Postgres or Redis when running several instances.
 */
export function createLoginLimiter() {
  let failures = new Map<string, Entry>()

  const active = (key: string, now = Date.now()) => {
    const entry = failures.get(key)
    return entry && entry.resetAt > now ? entry : undefined
  }

  return {
    isLocked: (key: string) => (active(key)?.count ?? 0) >= MAX_FAILURES,

    fail(key: string) {
      const now = Date.now()
      if (failures.size >= SWEEP_AT_SIZE) {
        failures = new Map([...failures].filter(([, entry]) => entry.resetAt > now))
      }
      const entry = active(key, now)
      failures.set(
        key,
        entry ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + WINDOW_MS },
      )
    },

    reset: (key: string) => failures.delete(key),
  }
}
