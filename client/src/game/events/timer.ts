import { useEffect, useState } from 'react'

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

/** The current time, ticking every second (for countdowns). */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
