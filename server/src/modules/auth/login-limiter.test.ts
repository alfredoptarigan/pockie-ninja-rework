import { describe, expect, it } from 'vitest'
import { createLoginLimiter } from './login-limiter.js'

describe('login limiter', () => {
  it('reserves attempts until the budget is spent, and reset clears it', () => {
    const limiter = createLoginLimiter()
    for (let i = 0; i < 10; i++) expect(limiter.reserve('a')).toBe(true)
    expect(limiter.reserve('a')).toBe(false)
    limiter.reset('a')
    expect(limiter.reserve('a')).toBe(true)
  })

  it('stays bounded by forgetting the oldest key when full', () => {
    const limiter = createLoginLimiter(2)
    for (let i = 0; i < 10; i++) limiter.reserve('a')
    limiter.reserve('b')
    limiter.reserve('c')
    expect(limiter.reserve('a')).toBe(true)
  })
})
