const pad = (value: number) => String(value).padStart(2, '0')

/** A server timestamp as a non-negative countdown: minutes:seconds, hours:mm:ss past an hour. */
export function rewardCountdown(nextClaimAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(nextClaimAt) - now) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`
}
