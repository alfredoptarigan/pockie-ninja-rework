// Shared pieces of the instance routes: the character lock, rule errors, bag room, item counts,
// duels against NPCs and their last-NPC rewards.
import { unequippedBagItemsWhere, wornItemsWhere } from '../../game/bag.js'
import {
  createRandom,
  GateRuleError,
  rollDrops,
  simulateFight,
  type DropEntry,
  type DropLib,
} from '@pockie/game-core'
import { and, eq } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { randomInt } from 'node:crypto'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import { monsterFighter, playerFighter } from '../../game/combat.js'
import { dropItems, dropLib, npc } from '../../game/data.js'
import {
  expUpdate,
  grantDrops,
  grantItems,
  saveCharacterProgress,
  type Tx,
} from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { lockCharacter, requireUser, toCharacter } from '../game/characters.js'

export type CharacterRow = typeof characters.$inferSelect
export type Award = { itemId: string; bound: boolean }

/** Demon City (171): the guard, the crystal exchange and Kisuke Urahara stand here. */
export const DEMON_CITY = 171

export const bad = (code: string, message: string) => new HttpError(400, code, message)
export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)
export const newSeed = () => randomInt(2 ** 31)

/** One transaction with the character row locked first; game-core rule errors become 400s. */
export async function withCharacter<T>(
  db: Db,
  request: FastifyRequest,
  action: (tx: Tx, character: CharacterRow) => Promise<T>,
) {
  const userId = requireUser(request).id
  try {
    return await db.transaction(async (tx) => action(tx, await lockCharacter(tx, userId)))
  } catch (error) {
    if (error instanceof GateRuleError) throw bad(error.code, error.message)
    throw error
  }
}

export async function characterView(tx: Tx | Db, characterId: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId))
  return toCharacter(row!, await playerFighter(tx, row!))
}

export async function countItem(tx: Tx | Db, characterId: string, itemId: string) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
  return rows.reduce((sum, row) => sum + row.count, 0)
}

export async function hasWeapon(tx: Tx, characterId: string) {
  const [row] = await tx
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(wornItemsWhere(characterId), eq(inventoryItems.equippedSlot, 'Weapon')))
  return Boolean(row)
}

export { bagFits, requireBagRoom } from '../../game/bag.js'

/**
 * Ninjas (a team in fight order) against `npcIds` as sequential duels (battle.md, teams.md 4.1):
 * the survivor keeps HP and MP and meets the next opponent. `states[i]` is ninja i after the fight.
 */
export async function teamDuel(tx: Tx, ninjas: CharacterRow[], npcIds: string[]) {
  const fighters = await Promise.all(ninjas.map((character) => playerFighter(tx, character)))
  const replay = simulateFight({
    attackers: fighters,
    defenders: npcIds.map(monsterFighter),
    seed: newSeed(),
  })
  const states = fighters.map((fighter, i) => ({
    hp: replay.fighters[i]!.hp,
    mp: replay.fighters[i]!.mp,
    maxHp: fighter.maxHp,
    maxMp: fighter.maxMp,
  }))
  return { replay, won: replay.winner === 'attackers', states }
}

/** The player against `npcIds` as sequential duels (battle.md); HP and MP carry over. */
export async function duel(tx: Tx, character: CharacterRow, npcIds: string[]) {
  const { replay, won, states } = await teamDuel(tx, [character], npcIds)
  return { replay, won, ...states[0]! }
}

/**
 * OnPlayerKillVirtualNpc for a group's last NPC: NpcExp, Stone and drops (no energy). The caller
 * applies vipExp; `chanceMul` is the VIP drop factor (vipDropMul).
 */
export function lastNpcRewards(npcId: string, chanceMul: number) {
  const row = npc(npcId)
  const random = createRandom(newSeed())
  const n = (key: string) => Number(row?.[key] ?? 0)
  const items = [n('DropLibID'), n('AppendDropLibID')]
    .filter((libId) => libId > 0 && dropLib(libId))
    .flatMap((libId) =>
      rollDrops(
        dropLib(libId) as unknown as DropLib,
        dropItems(libId) as unknown as DropEntry[],
        random,
        chanceMul,
      ),
    )
  return {
    exp: n('NpcExp'),
    stone: random.between(n('DropCapital0Min'), n('DropCapital0Max')),
    items: items as Award[],
  }
}

/** Rolls one DropLib (pub fight combos); `chanceMul` is the VIP drop factor (vipDropMul). */
export function rollDropLib(libId: number, chanceMul: number) {
  if (!(libId > 0 && dropLib(libId))) return []
  return rollDrops(
    dropLib(libId) as unknown as DropLib,
    dropItems(libId) as unknown as DropEntry[],
    createRandom(newSeed()),
    chanceMul,
  ) as Award[]
}

/** Applies EXP (with level-ups) on top of `state` and returns the column updates. */
export function withExp(character: CharacterRow, state: Partial<CharacterRow>, exp: number) {
  const { levelsGained, ...update } = expUpdate({ ...character, ...state }, exp)
  return { update: { ...state, ...update }, levelsGained }
}

export async function saveCharacter(tx: Tx, id: string, values: Partial<CharacterRow>) {
  await saveCharacterProgress(tx, id, values)
}

export { grantDrops, grantItems }
