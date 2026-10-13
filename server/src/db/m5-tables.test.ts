import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characterBloodlinePrayer,
  characterBloodlines,
  characterDailyLogin,
  characterSkills,
  characterSouls,
  characters,
  characterTalents,
  characterWeeklyRewards,
  tailedBeastKages,
  tailedBeastPlayers,
  tailedBeastPools,
  teamStoneMatches,
  teamStonePlayers,
  teamStoneQueue,
  users,
} from './schema.js'

const { db, close } = createTestDb()
afterAll(() => close())

let userCount = 0
async function character() {
  const username = `Ninja_${++userCount}`
  const [user] = await db
    .insert(users)
    .values({ username, email: `${username.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  const [row] = await db
    .insert(characters)
    .values({
      userId: user!.id,
      name: username,
      gender: 0,
      nation: 0,
      clothing: 45,
      avatarId: 45,
      sceneId: 2601,
      hp: 1,
      mp: 1,
    })
    .returning()
  return row!.id
}

const setCharacter = (id: string, values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, id))

let a = ''
let b = ''

beforeEach(async () => {
  await truncateAll(db)
  // No character foreign key, so the cascade in truncateAll misses them.
  await db.delete(tailedBeastPools)
  await db.delete(teamStoneMatches)
  a = await character()
  b = await character()
})

describe('characters', () => {
  it('starts every M5 counter and the Battle Coin wallet at zero', async () => {
    const [row] = await db.select().from(characters).where(eq(characters.id, a))
    expect(row).toMatchObject({
      talentDay: null,
      talentAttemptsUsed: 0,
      bloodlineDay: null,
      bloodlineTurnIns: 0,
      soulDay: null,
      soulsDiscovered: 0,
      diceDay: null,
      diceUsed: 0,
      diceBought: 0,
      twentyMinAt: null,
      twentyMinDay: null,
      twentyMinCount: 0,
      battleCoins: 0,
    })
  })

  // Daily caps live in each feature's constants file (tunable), so the database only refuses
  // negative values.
  it('refuses negative counters and a negative Battle Coin wallet', async () => {
    for (const values of [
      { battleCoins: -1 },
      { talentAttemptsUsed: -1 },
      { bloodlineTurnIns: -1 },
      { soulsDiscovered: -1 },
      { diceUsed: -1 },
      { diceBought: -1 },
      { twentyMinCount: -1 },
    ]) {
      await expect(setCharacter(a, values)).rejects.toThrow()
    }
    await setCharacter(a, { talentAttemptsUsed: 40, battleCoins: 250 })
  })
})

describe('talents', () => {
  it('stores one row per talent 1-8 with level 0-60 and non-negative EXP', async () => {
    const [row] = await db
      .insert(characterTalents)
      .values({ characterId: a, talentId: 1 })
      .returning()
    expect(row).toMatchObject({ level: 0, exp: 0, activeSlot: null })
    await expect(
      db.insert(characterTalents).values({ characterId: a, talentId: 1 }),
    ).rejects.toThrow()
    for (const values of [
      { talentId: 0 },
      { talentId: 9 },
      { talentId: 2, level: 61 },
      { talentId: 2, level: -1 },
      { talentId: 2, exp: -1 },
    ]) {
      await expect(
        db.insert(characterTalents).values({ characterId: a, ...values }),
      ).rejects.toThrow()
    }
    await db.insert(characterTalents).values({ characterId: a, talentId: 8, level: 60 })
  })

  it('allows at most 3 active talents, one per slot', async () => {
    await db.insert(characterTalents).values([
      { characterId: a, talentId: 1, level: 1, activeSlot: 0 },
      { characterId: a, talentId: 2, level: 1, activeSlot: 1 },
      { characterId: a, talentId: 3, level: 1, activeSlot: 2 },
      { characterId: a, talentId: 4, level: 1 },
      { characterId: b, talentId: 1, level: 1, activeSlot: 0 },
    ])
    await expect(
      db.insert(characterTalents).values({ characterId: a, talentId: 5, level: 1, activeSlot: 0 }),
    ).rejects.toThrow()
    await expect(
      db
        .update(characterTalents)
        .set({ activeSlot: 3 })
        .where(and(eq(characterTalents.characterId, a), eq(characterTalents.talentId, 4))),
    ).rejects.toThrow()
  })

  it('only activates a talent of level 1 or more', async () => {
    await expect(
      db.insert(characterTalents).values({ characterId: a, talentId: 1, activeSlot: 0 }),
    ).rejects.toThrow()
  })
})

describe('bloodlines', () => {
  it('stores limits 1-44 with non-negative amity', async () => {
    const [row] = await db
      .insert(characterBloodlines)
      .values({ characterId: a, limitId: 44 })
      .returning()
    expect(row).toMatchObject({ amity: 0, unlockedAt: null, activeSlot: null })
    for (const values of [{ limitId: 0 }, { limitId: 45 }, { limitId: 1, amity: -1 }]) {
      await expect(
        db.insert(characterBloodlines).values({ characterId: a, ...values }),
      ).rejects.toThrow()
    }
  })

  it('allows at most 3 active limits, each unlocked', async () => {
    const unlockedAt = new Date()
    await db.insert(characterBloodlines).values([
      { characterId: a, limitId: 1, unlockedAt, activeSlot: 0 },
      { characterId: a, limitId: 2, unlockedAt, activeSlot: 1 },
      { characterId: a, limitId: 3, unlockedAt, activeSlot: 2 },
      { characterId: b, limitId: 1, unlockedAt, activeSlot: 0 },
    ])
    await expect(
      db
        .insert(characterBloodlines)
        .values({ characterId: a, limitId: 4, unlockedAt, activeSlot: 2 }),
    ).rejects.toThrow()
    await expect(
      db
        .insert(characterBloodlines)
        .values({ characterId: a, limitId: 5, unlockedAt, activeSlot: 3 }),
    ).rejects.toThrow()
    await expect(
      db.insert(characterBloodlines).values({ characterId: b, limitId: 6, activeSlot: 1 }),
    ).rejects.toThrow() // locked limit
  })

  it('keeps prayer at level 0-9 on an owned limit with a Str/Agi/Sta attribute', async () => {
    await db.insert(characterBloodlines).values({ characterId: a, limitId: 1 })
    const [row] = await db
      .insert(characterBloodlinePrayer)
      .values({ characterId: a, limitId: 1, attribute: 1 })
      .returning()
    expect(row).toMatchObject({ level: 0, progress: 0 })
    await expect(
      db.insert(characterBloodlinePrayer).values({ characterId: a, limitId: 2, attribute: 1 }),
    ).rejects.toThrow() // limit not owned
    await db.delete(characterBloodlinePrayer)
    for (const values of [
      { attribute: 0 },
      { attribute: 4 },
      { attribute: 1, level: 10 },
      { attribute: 1, progress: -1 },
    ]) {
      await expect(
        db.insert(characterBloodlinePrayer).values({ characterId: a, limitId: 1, ...values }),
      ).rejects.toThrow()
    }
  })
})

describe('souls', () => {
  it('stores types 1-13 at levels 1-10', async () => {
    const [row] = await db.insert(characterSouls).values({ characterId: a, type: 13 }).returning()
    expect(row).toMatchObject({ level: 1, limitId: null, socket: null })
    for (const values of [
      { type: 0 },
      { type: 14 },
      { type: 1, level: 0 },
      { type: 1, level: 11 },
    ]) {
      await expect(
        db.insert(characterSouls).values({ characterId: a, ...values }),
      ).rejects.toThrow()
    }
    await db.insert(characterSouls).values({ characterId: a, type: 1, level: 10 })
  })

  it('sockets a soul into one of 5 sockets of an owned limit, one per type and socket', async () => {
    await db.insert(characterBloodlines).values({ characterId: a, limitId: 1 })
    const soul = (type: number, socket: number | null, limitId: number | null = 1) =>
      db.insert(characterSouls).values({ characterId: a, type, limitId, socket })
    await soul(1, 0)
    await soul(2, 4)
    await expect(soul(1, 1)).rejects.toThrow() // same type on the limit
    await expect(soul(3, 0)).rejects.toThrow() // socket taken
    await expect(soul(3, 5)).rejects.toThrow()
    await expect(soul(3, null)).rejects.toThrow() // limit without socket
    await expect(soul(3, 1, null)).rejects.toThrow() // socket without limit
    await expect(soul(3, 1, 2)).rejects.toThrow() // limit not owned
    await expect(db.delete(characterBloodlines)).rejects.toThrow() // unsocket first
    await db.delete(characters).where(eq(characters.id, a))
    expect(await db.select().from(characterSouls)).toEqual([])
  })

  it('holds at most 250 souls per ninja', async () => {
    const souls = (characterId: string, count: number) =>
      Array.from({ length: count }, () => ({ characterId, type: 1 }))
    await db.insert(characterSouls).values(souls(a, 249))
    await db.insert(characterSouls).values(souls(b, 1))
    await expect(db.insert(characterSouls).values(souls(a, 2))).rejects.toThrow()
    await db.insert(characterSouls).values(souls(a, 1))
    await expect(db.insert(characterSouls).values(souls(a, 1))).rejects.toThrow()
    await db.insert(characterSouls).values(souls(b, 1))
  })
})

describe('scroll skills', () => {
  it('stores a 7-day skill with expires_at and a permanent one without', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000)
    await db.insert(characterSkills).values([
      { characterId: a, skillId: 1831, expiresAt },
      { characterId: a, skillId: 18091 },
    ])
    const rows = await db
      .select({ skillId: characterSkills.skillId, expiresAt: characterSkills.expiresAt })
      .from(characterSkills)
      .where(eq(characterSkills.characterId, a))
      .orderBy(characterSkills.skillId)
    expect(rows).toEqual([
      { skillId: 1831, expiresAt },
      { skillId: 18091, expiresAt: null },
    ])
  })
})

describe('daily events', () => {
  it('starts the Daily Login at zero days and refuses a negative count', async () => {
    const [row] = await db.insert(characterDailyLogin).values({ characterId: a }).returning()
    expect(row).toMatchObject({ completedDays: 0, claimDay: null, bonusDay: null })
    await expect(
      db.insert(characterDailyLogin).values({ characterId: b, completedDays: -1 }),
    ).rejects.toThrow()
  })

  it('keeps weekly counters as an object and only known milestones and weekdays', async () => {
    const week = '2026-10-12'
    const [row] = await db
      .insert(characterWeeklyRewards)
      .values({ characterId: a, week, claimedMilestones: [50, 200], claimedWeekdays: [1, 7] })
      .returning()
    expect(row).toMatchObject({
      counters: {},
      claimedMilestones: [50, 200],
      claimedWeekdays: [1, 7],
    })
    for (const values of [
      { counters: [] as unknown as Record<string, number> },
      { claimedMilestones: [60] },
      { claimedWeekdays: [0] },
      { claimedWeekdays: [8] },
    ]) {
      await expect(
        db.insert(characterWeeklyRewards).values({ characterId: b, week, ...values }),
      ).rejects.toThrow()
    }
  })
})

describe('tailed beast', () => {
  const week = '2026-10-12'

  it('keeps one HP pool per week, beast 1-9 and mode 0-2, never below zero', async () => {
    const pool = { week, beast: 9, mode: 2, hpLeft: 1_250_000_000 }
    await db.insert(tailedBeastPools).values(pool)
    await expect(db.insert(tailedBeastPools).values(pool)).rejects.toThrow()
    for (const values of [{ beast: 0 }, { beast: 10 }, { mode: 3 }, { hpLeft: -1 }]) {
      await expect(
        db.insert(tailedBeastPools).values({ ...pool, mode: 0, ...values }),
      ).rejects.toThrow()
    }
  })

  it('starts a player at zero and refuses negative Honor, Essence or tickets', async () => {
    const [row] = await db
      .insert(tailedBeastPlayers)
      .values({ week, characterId: a, village: 0 })
      .returning()
    expect(row).toMatchObject({ honor: 0, essence: 0, fights: 0, ticketsUsed: 0, boxesClaimed: [] })
    await expect(
      db.insert(tailedBeastPlayers).values({ week, characterId: a, village: 0 }),
    ).rejects.toThrow()
    for (const values of [
      { essence: -1 },
      { honor: -1 },
      { fights: -1 },
      { ticketsUsed: -1 },
      { village: 5 },
      { boxesClaimed: [15] },
    ]) {
      await expect(
        db.insert(tailedBeastPlayers).values({ week, characterId: b, village: 1, ...values }),
      ).rejects.toThrow()
    }
    await db
      .insert(tailedBeastPlayers)
      .values({ week, characterId: b, village: 4, ticketsUsed: 10, boxesClaimed: [5, 10, 20] })
    await db.insert(tailedBeastPlayers).values({ week: '2026-10-19', characterId: b, village: 4 })
  })

  it('keeps one Kage per week and village', async () => {
    await db.insert(tailedBeastKages).values({ week, village: 0, characterId: a })
    await expect(
      db.insert(tailedBeastKages).values({ week, village: 0, characterId: b }),
    ).rejects.toThrow()
    await expect(
      db.insert(tailedBeastKages).values({ week, village: 5, characterId: b }),
    ).rejects.toThrow()
    await db.delete(characters).where(eq(characters.id, a))
    expect(await db.select().from(tailedBeastKages)).toEqual([])
  })
})

describe('team stone', () => {
  it('starts a player at score 0 and refuses negative score or too many attempts', async () => {
    const [row] = await db.insert(teamStonePlayers).values({ characterId: a }).returning()
    expect(row).toMatchObject({ score: 0, attemptsUsed: 0, playedThisWeek: false })
    for (const values of [{ score: -1 }, { attemptsUsed: -1 }]) {
      await expect(
        db.insert(teamStonePlayers).values({ characterId: b, ...values }),
      ).rejects.toThrow()
    }
  })

  it('queues a ninja once', async () => {
    await db.insert(teamStoneQueue).values({ characterId: a, score: 0, power: 1000 })
    await expect(
      db.insert(teamStoneQueue).values({ characterId: a, score: 0, power: 1000 }),
    ).rejects.toThrow()
  })

  it('stores a match of two teams of 3 with a winner side 0 or 1', async () => {
    const team = [a, b, a]
    await db.insert(teamStoneMatches).values({ teamA: team, teamB: team })
    await expect(
      db.insert(teamStoneMatches).values({ teamA: [a, b], teamB: team }),
    ).rejects.toThrow()
    await expect(
      db.insert(teamStoneMatches).values({ teamA: team, teamB: team, winner: 2 }),
    ).rejects.toThrow()
  })
})
