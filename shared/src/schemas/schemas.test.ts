import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './auth.js'
import { postsQuerySchema } from './content.js'
import { CHAT_MAX_LENGTH, chatSendSchema } from './realtime.js'

const valid = { username: 'Naruto_99', email: 'naruto@konoha.example', password: 'believe-it' }

describe('registerSchema', () => {
  it('accepts a valid account and normalizes the email', () => {
    const result = registerSchema.parse({ ...valid, email: '  Naruto@Konoha.Example ' })
    expect(result.email).toBe('naruto@konoha.example')
  })

  it.each([
    ['username', { username: 'ab' }, 'Username must be at least 3 characters.'],
    ['username', { username: 'a'.repeat(17) }, 'Username must be at most 16 characters.'],
    ['username', { username: 'naruto!' }, 'Use only letters, numbers and underscores.'],
    ['email', { email: 'nope' }, 'Enter a valid email address.'],
    ['password', { password: 'seven77' }, 'Password must be at least 8 characters.'],
    ['password', { password: 'x'.repeat(129) }, 'Password must be at most 128 characters.'],
  ])('rejects an invalid %s', (field, override, message) => {
    const result = registerSchema.safeParse({ ...valid, ...override })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message })
  })
})

describe('loginSchema', () => {
  it('defaults rememberMe to false', () => {
    expect(loginSchema.parse({ login: 'Naruto', password: 'x' }).rememberMe).toBe(false)
  })

  it('requires both fields', () => {
    const result = loginSchema.safeParse({ login: ' ', password: '' })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Enter your username or email.',
      'Enter your password.',
    ])
  })
})

describe('postsQuerySchema', () => {
  it('coerces the limit and defaults it to 6', () => {
    expect(postsQuerySchema.parse({}).limit).toBe(6)
    expect(postsQuerySchema.parse({ limit: '3', kind: 'event' })).toEqual({
      limit: 3,
      kind: 'event',
    })
  })

  it('rejects unknown kinds and out-of-range limits', () => {
    expect(postsQuerySchema.safeParse({ kind: 'gossip' }).success).toBe(false)
    expect(postsQuerySchema.safeParse({ limit: '21' }).success).toBe(false)
  })
})

describe('chatSendSchema', () => {
  it('trims and replaces control characters but keeps HTML as text', () => {
    expect(chatSendSchema.parse({ channel: 'scene', text: ' <i>a</i>\u0007b ' })).toEqual({
      channel: 'scene',
      text: '<i>a</i> b',
    })
  })

  it('rejects empty, overlong and unknown-channel messages', () => {
    expect(chatSendSchema.safeParse({ channel: 'world', text: '\n\t' }).success).toBe(false)
    const long = 'x'.repeat(CHAT_MAX_LENGTH + 1)
    expect(chatSendSchema.safeParse({ channel: 'world', text: long }).success).toBe(false)
    expect(chatSendSchema.safeParse({ channel: 'guild', text: 'hi' }).success).toBe(false)
  })

  it("allows Reborn's 250 characters and the Trade channel", () => {
    expect(CHAT_MAX_LENGTH).toBe(250)
    const full = 'x'.repeat(250)
    expect(chatSendSchema.safeParse({ channel: 'trade', text: full }).success).toBe(true)
  })
})
