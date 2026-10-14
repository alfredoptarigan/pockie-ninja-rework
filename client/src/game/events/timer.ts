/** A server timestamp rendered as a non-negative minutes:seconds countdown. */
export function rewardCountdown(nextClaimAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(nextClaimAt) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
