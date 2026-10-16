// Local QA upgrade; preserves the account's bag, progression and other players.
import assert from 'node:assert/strict'
import { and, eq, isNotNull } from 'drizzle-orm'
import { OUTFIT_MAX_TIER, OUTFIT_STARS } from '@pockie/shared'
import { createDb } from '../src/db/client.js'
import { characters, inventoryItems, outfitRecasts, users } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { playerFighter } from '../src/game/combat.js'
import { item } from '../src/game/data.js'
import { gemOf } from '../src/game/gems.js'
import { madaraItemId } from '../src/game/madara.js'
import { outfitIsv, outfitOf, syncOutfit } from '../src/game/outfit.js'
import { refreshArenaSnapshot } from '../src/modules/arena/snapshot.js'

const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('This script is for the local QA account only.')
const { db, close } = createDb(env.DATABASE_URL)
// Strongest attribute gems that fit this level-83..90 kit (Lv.8 special gems, minimum gear Lv.71).
const RUBY = 'i110701',
  SAPPHIRE = 'i110702',
  TOPAZ = 'i110703'
const gemOrder: Record<string, string[]> = {
  Weapon: [RUBY, SAPPHIRE, TOPAZ],
  Cloth: [TOPAZ, SAPPHIRE, RUBY],
  Hat: [TOPAZ, SAPPHIRE],
  Shoes: [SAPPHIRE, TOPAZ],
  Amulet: [TOPAZ],
  Glove: [RUBY, SAPPHIRE],
  Girdle: [TOPAZ, SAPPHIRE],
  Ring: [RUBY],
}
try {
  await db.transaction(async (tx) => {
    const [character] = await tx
      .select({ character: characters })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(and(eq(users.usernameLower, 'qapockieninja'), eq(characters.name, 'QA_Madara')))
      .for('update')
    assert(character, 'QA_Madara was not found')
    const owner = character.character
    const rows = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, owner.id),
          eq(inventoryItems.location, 'bag'),
          isNotNull(inventoryItems.equippedSlot),
        ),
      )
      .for('update')
    const outfits = rows.filter((row) => outfitOf(row.itemId)?.clothing === 170)
    assert(outfits.length > 0, 'No equipped Madara outfit was found')
    const maxItem = madaraItemId(OUTFIT_MAX_TIER)
    const [strength, agility, stamina] = outfitIsv(maxItem)!.max
    for (const outfit of outfits) {
      await tx
        .update(inventoryItems)
        .set({ itemId: maxItem, stars: OUTFIT_STARS.maxStars })
        .where(eq(inventoryItems.id, outfit.id))
      await tx
        .insert(outfitRecasts)
        .values({ itemId: outfit.id, strength, agility, stamina })
        .onConflictDoUpdate({ target: outfitRecasts.itemId, set: { strength, agility, stamina } })
    }
    const summary: { slot: string; sockets: number; gems: string[] }[] = []
    for (const row of rows) {
      const def = item(row.itemId)
      if (def?.class !== 'EquipItem' || !gemOrder[String(def.EquipType)]) continue
      const max = Number(def.MaxHoleCount ?? 0)
      if (!max) continue
      const gems = gemOrder[String(def.EquipType)]!.slice(0, max)
      assert(max <= 3 && gems.length === max, `Unsupported socket count for ${row.itemId}`)
      for (const id of gems) {
        const gem = gemOf(id)
        assert(gem && gem.level <= Number(def.UseLevel), `Gem does not fit ${row.itemId}`)
      }
      await tx.update(inventoryItems).set({ gems }).where(eq(inventoryItems.id, row.id))
      summary.push({ slot: String(def.EquipType), sockets: max, gems })
    }
    assert(
      summary.some((gear) => gear.slot === 'Weapon'),
      'No weapon received gems',
    )
    await syncOutfit(tx, owner.id, owner.activeSet)
    const [updated] = await tx.select().from(characters).where(eq(characters.id, owner.id))
    assert(
      updated && outfitOf(maxItem)?.avatarId === updated.avatarId,
      'Active outfit was not updated',
    )
    const fighter = await playerFighter(tx, updated)
    assert(Number.isFinite(fighter.maxHp) && fighter.maxHp > 0, 'Invalid upgraded stats')
    await tx
      .update(characters)
      .set({ hp: fighter.maxHp, mp: fighter.maxMp })
      .where(eq(characters.id, owner.id))
    await refreshArenaSnapshot(tx, owner.id)
    const saved = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, owner.id))
    assert(
      saved
        .filter((row) => outfits.some((outfit) => outfit.id === row.id))
        .every((row) => row.itemId === maxItem && row.stars === 5),
      'Outfit upgrade was not saved',
    )
    assert(
      saved
        .filter((row) => summary.some((gear) => gear.slot === row.equippedSlot))
        .every((row) => row.gems.length === Number(item(row.itemId)?.MaxHoleCount)),
      'Gem sockets were not filled',
    )
    console.log(
      JSON.stringify(
        {
          outfit: '+32, 5 stars, max recast',
          gear: summary,
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
