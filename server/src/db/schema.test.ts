import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { users } from './schema.js'

const { db, close } = createTestDb()

const base = { email: 'naruto@example.com', passwordHash: 'x' }

describe('users table', () => {
  beforeEach(() => truncateAll(db))
  afterAll(() => close())

  it('stores the lowercase username and defaults the role to player', async () => {
    const [row] = await db
      .insert(users)
      .values({ ...base, username: 'Naruto_Uzumaki' })
      .returning()
    expect(row?.usernameLower).toBe('naruto_uzumaki')
    expect(row?.role).toBe('player')
  })

  it('rejects usernames that differ only by case', async () => {
    await db.insert(users).values({ ...base, username: 'Naruto' })
    await expect(
      db
        .insert(users)
        .values({ email: 'other@example.com', passwordHash: 'x', username: 'NARUTO' }),
    ).rejects.toThrow()
  })

  it('rejects duplicate emails', async () => {
    await db.insert(users).values({ ...base, username: 'Naruto' })
    await expect(db.insert(users).values({ ...base, username: 'Sasuke' })).rejects.toThrow()
  })

  it('rejects usernames outside [A-Za-z0-9_]{3,16}', async () => {
    for (const username of ['ab', 'a'.repeat(17), 'bad name', 'ninja!']) {
      await expect(db.insert(users).values({ ...base, username })).rejects.toThrow()
    }
  })
})
