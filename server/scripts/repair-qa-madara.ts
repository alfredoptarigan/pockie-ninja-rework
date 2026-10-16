// Repair the old QA seed's Itachi substitute without reseeding inventory or progression.
import { and, eq } from 'drizzle-orm'
import { createDb } from '../src/db/client.js'
import { characters, inventoryItems, users } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { MADARA_AVATAR, MADARA_CLOTHING, MADARA_ITEM } from '../src/game/madara.js'
import { refreshArenaSnapshot } from '../src/modules/arena/snapshot.js'

const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('This repair is for the local QA account only.')
const { db, close } = createDb(env.DATABASE_URL)
try {
  await db.transaction(async (tx) => {
    const [character] = await tx
      .select({
        id: characters.id,
        clothing: characters.clothing,
        visualClothing: characters.visualClothing,
      })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(and(eq(users.usernameLower, 'qapockieninja'), eq(characters.name, 'QA_Madara')))
      .for('update')
    if (!character) throw new Error('QA_Madara was not found.')
    if (![49, MADARA_CLOTHING].includes(character.clothing))
      throw new Error('QA outfit was changed; refusing to replace another outfit.')
    await tx
      .update(inventoryItems)
      .set({ itemId: MADARA_ITEM })
      .where(
        and(
          eq(inventoryItems.characterId, character.id),
          eq(inventoryItems.equippedSlot, 'Outfit'),
          eq(inventoryItems.itemId, 'i290049'),
        ),
      )
    await tx
      .update(characters)
      .set({
        clothing: MADARA_CLOTHING,
        avatarId: MADARA_AVATAR,
        ...(character.visualClothing === 49 ? { visualClothing: MADARA_CLOTHING } : {}),
      })
      .where(eq(characters.id, character.id))
    const [outfit] = await tx
      .select({ itemId: inventoryItems.itemId })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, character.id),
          eq(inventoryItems.equippedSlot, 'Outfit'),
          eq(inventoryItems.itemId, MADARA_ITEM),
        ),
      )
    if (!outfit) throw new Error('Repair did not find an equipped Madara outfit; rolling back.')
    await refreshArenaSnapshot(tx, character.id)
    console.log(
      'QA_Madara: equipped outfit, character appearance and arena snapshot now use Madara (170).',
    )
  })
} finally {
  await close()
}
