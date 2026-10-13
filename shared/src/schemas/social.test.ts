import { describe, expect, it } from 'vitest'
import { blockAddSchema, mailDeleteSchema, mailSendSchema } from './social.js'

const mail = (subject: string, body: string) =>
  mailSendSchema.safeParse({ to: 'Ninja_01', subject, body })

describe('mail schemas', () => {
  it('keeps line feeds, strips other control and bidi characters, and trims', () => {
    expect(mail('  Hi\u0007 ', 'one\ntwo‮')).toMatchObject({
      success: true,
      data: { subject: 'Hi', body: 'one\ntwo' },
    })
  })
  it('refuses an empty or too long subject or body', () => {
    expect(mail(' ', 'body').success).toBe(false)
    expect(mail('s'.repeat(21), 'body').success).toBe(false)
    expect(mail('s'.repeat(20), 'b'.repeat(200)).success).toBe(true)
    expect(mail('subject', 'b'.repeat(201)).success).toBe(false)
    expect(mail('subject', '\u0000').success).toBe(false)
  })
  it('refuses unknown fields and bad ids', () => {
    expect(mailSendSchema.safeParse({ to: 'a', subject: 's', body: 'b', html: 1 }).success).toBe(
      false,
    )
    expect(mailDeleteSchema.safeParse({ ids: ['1'] }).success).toBe(false)
    expect(mailDeleteSchema.safeParse({ ids: [] }).success).toBe(false)
  })
  it('blocks by name or by id', () => {
    expect(blockAddSchema.safeParse({ name: 'Ninja_01' }).success).toBe(true)
    expect(
      blockAddSchema.safeParse({ characterId: '0192b1c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d' }).success,
    ).toBe(true)
    expect(blockAddSchema.safeParse({}).success).toBe(false)
  })
})
