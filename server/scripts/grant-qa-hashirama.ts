// Local QA: equips set II of QA_Madara with Hashirama +32 (5 stars, max recast) and a copy of
// set I's gear (enhance level and gems), then makes set II active. Set I (Madara) is untouched.
import assert from 'node:assert/strict'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { OUTFIT_MAX_TIER, OUTFIT_STARS } from '@pockie/shared'
import { createDb } from '../src/db/client.js'
import { characters, inventoryItems, outfitRecasts, users } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { playerFighter } from '../src/game/combat.js'
import { HASHIRAMA_CLOTHING, rebornOnlyItemId } from '../src/game/madara.js'
import { OUTFIT_SLOT, outfitIsv, outfitOf, syncOutfit } from '../src/game/outfit.js'
import { refreshArenaSnapshot } from '../src/modules/arena/snapshot.js'

const SET = 2
const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('This script is for the local QA account only.')
const { db, close } = createDb(env.DATABASE_URL)
try {
  await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ character: characters })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(and(eq(users.usernameLower, 'qapockieninja'), eq(characters.name, 'QA_Madara')))
      .for('update')
    assert(found, 'QA_Madara was not found')
    const owner = found.character
    const taken = await tx
      .select({ slot: inventoryItems.equippedSlot })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, owner.id),
          eq(inventoryItems.equippedSet, SET),
          isNotNull(inventoryItems.equippedSlot),
        ),
      )
    assert(taken.length === 0, `Set ${SET} is not empty; refusing to replace it.`)
    const gear = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, owner.id),
          eq(inventoryItems.equippedSet, 1),
          isNotNull(inventoryItems.equippedSlot),
          ne(inventoryItems.equippedSlot, OUTFIT_SLOT),
        ),
      )
    assert(
      gear.some((row) => row.equippedSlot === 'Weapon'),
      'Set I has no weapon to copy',
    )
    const itemId = rebornOnlyItemId(HASHIRAMA_CLOTHING, OUTFIT_MAX_TIER)
    const [outfit] = await tx
      .insert(inventoryItems)
      .values({
        characterId: owner.id,
        itemId,
        bound: true,
        equippedSlot: OUTFIT_SLOT,
        equippedSet: SET,
        stars: OUTFIT_STARS.maxStars,
      })
      .returning({ id: inventoryItems.id })
    const [strength, agility, stamina] = outfitIsv(itemId)!.max
    await tx.insert(outfitRecasts).values({ itemId: outfit!.id, strength, agility, stamina })
    await tx.insert(inventoryItems).values(
      gear.map((row) => ({
        characterId: owner.id,
        itemId: row.itemId,
        bound: true,
        equippedSlot: row.equippedSlot,
        equippedSet: SET,
        enhanceLevel: row.enhanceLevel,
        durability: row.durability,
        gems: row.gems,
      })),
    )
    await tx.update(characters).set({ activeSet: SET }).where(eq(characters.id, owner.id))
    await syncOutfit(tx, owner.id, SET)
    const [updated] = await tx.select().from(characters).where(eq(characters.id, owner.id))
    assert(
      updated?.clothing === HASHIRAMA_CLOTHING && updated.avatarId === outfitOf(itemId)?.avatarId,
      'Active outfit is not Hashirama',
    )
    const fighter = await playerFighter(tx, updated)
    assert(Number.isFinite(fighter.maxHp) && fighter.maxHp > 0, 'Invalid Hashirama stats')
    await tx
      .update(characters)
      .set({ hp: fighter.maxHp, mp: fighter.maxMp })
      .where(eq(characters.id, owner.id))
    await refreshArenaSnapshot(tx, owner.id)
    console.log(
      JSON.stringify(
        {
          set: SET,
          outfit: `${itemId} (+32, 5 stars, recast ${[strength, agility, stamina].join('/')})`,
          gear: gear.map((row) => `${row.equippedSlot} ${row.itemId} +${row.enhanceLevel}`),
          maxHp: fighter.maxHp,
          maxMp: fighter.maxMp,
        },
        null,
        2,
      ),
    )
  })
} finally {
  await close()
}
