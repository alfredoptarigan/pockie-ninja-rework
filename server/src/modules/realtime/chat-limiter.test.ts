import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS, createChatLimiter } from './chat-limiter.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function limiter() {
  const online = new Set<string>()
  return { online, chat: createChatLimiter((id) => online.has(id)) }
}

describe('chat limiter', () => {
  it(`allows ${CHAT_RATE_MAX} messages per window`, () => {
    const { chat } = limiter()
    for (let i = 0; i < CHAT_RATE_MAX; i++) expect(chat.allow('a')).toBe(true)
    expect(chat.allow('a')).toBe(false)
    expect(chat.allow('b')).toBe(true)
    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS)
    expect(chat.allow('a')).toBe(true)
  })

  it('drops the bucket of a player who sent a message and left, once the window passes', () => {
    const { chat } = limiter()
    chat.allow('a')
    chat.forgetWhenStale('a')
    expect(chat.size).toBe(1)

    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS)
    expect(chat.size).toBe(0)
  })

  it('keeps the budget of a player who comes back within the window', () => {
    const { online, chat } = limiter()
    for (let i = 0; i < CHAT_RATE_MAX; i++) chat.allow('a')
    chat.forgetWhenStale('a')

    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS / 2)
    online.add('a')
    expect(chat.allow('a')).toBe(false)
    // Still online when the timer fires: the bucket stays until the next departure.
    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS)
    expect(chat.size).toBe(1)
  })

  it('waits for the newest message when a player left, came back and left again', () => {
    const { online, chat } = limiter()
    chat.allow('a')
    chat.forgetWhenStale('a')
    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS - 1_000)
    online.add('a')
    chat.allow('a')
    online.delete('a')
    chat.forgetWhenStale('a')

    vi.advanceTimersByTime(1_000) // the first timer fires, the newest message is still recent
    expect(chat.size).toBe(1)
    vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS)
    expect(chat.size).toBe(0)
  })
})
