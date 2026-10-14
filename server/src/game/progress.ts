// Shared game state changes inside a transaction: items, quest progress and quest completion
// (TaskSystem / RookieTaskSystem / RewardRule), see docs/original-data/quests-items.md.
import { createRandom, deriveStats, gainExp } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { type QuestHandIn } from '@pockie/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characterQuests, characters, inventoryItems } from '../db/schema.js'
import { HttpError } from '../http.js'
import { bagFits, itemStackSize, unequippedBagItemsWhere } from './bag.js'
import { avatarStats, dropLib, levels, subTasks, task } from './data.js'
import { newGearState, rollLibDrops, type GrantedItem } from './gear.js'
import { countItems, questRewards, recordCommand, type QuestProgress } from './quests.js'
import { learnThroughLevel } from './learning.js'
import { vipDropMul, vipExp } from './vip.js'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type CharacterRow = typeof characters.$inferSelect

const ROOKIE = 4
const ACTIVE = 0
const READY = 1
const COMPLETED = 2
const COLLECT_STEP = 1

/**
 * Adds items, stacking onto unequipped rows of the same item up to the stack size. Equipment with
 * an identify count (drop lists) rolls its properties as it lands in the bag. With `dropOverflow`
 * an item that needs cells in a full bag is lost instead; returns what landed.
 */
export async function grantItems(
  tx: Tx,
  characterId: string,
  items: GrantedItem[],
  { dropOverflow = false } = {},
) {
  const random = createRandom(randomInt(2 ** 31))
  const kept: GrantedItem[] = []
  for (const granted of items) {
    const { itemId, bound, identifyCount = 0 } = granted
    if (dropOverflow && !(await bagFits(tx, characterId, [granted]))) continue
    const maxStack = itemStackSize(itemId)
    const [stack] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          unequippedBagItemsWhere(characterId),
          eq(inventoryItems.itemId, itemId),
          eq(inventoryItems.bound, bound),
          sql`${inventoryItems.count} < ${maxStack}`,
        ),
      )
      .limit(1)
    if (stack) {
      await tx
        .update(inventoryItems)
        .set({ count: stack.count + 1 })
        .where(eq(inventoryItems.id, stack.id))
    } else {
      await tx
        .insert(inventoryItems)
        .values({ characterId, itemId, bound, ...newGearState(itemId, identifyCount, random) })
    }
    kept.push(granted)
  }
  return kept
}

/** Fight loot: whatever does not fit in the bag is lost. Returns what landed. */
export const grantDrops = (tx: Tx, characterId: string, items: GrantedItem[]) =>
  grantItems(tx, characterId, items, { dropOverflow: true })

/** Uses up one of `row`; fails when the row no longer holds that count (a stale read). */
export async function consumeOne(tx: Tx, row: typeof inventoryItems.$inferSelect) {
  const unchanged = and(eq(inventoryItems.id, row.id), eq(inventoryItems.count, row.count))
  const used =
    row.count > 1
      ? await tx
          .update(inventoryItems)
          .set({ count: row.count - 1 })
          .where(unchanged)
          .returning({ id: inventoryItems.id })
      : await tx.delete(inventoryItems).where(unchanged).returning({ id: inventoryItems.id })
  if (used.length === 0) throw new HttpError(409, 'conflict', 'That item was already used.')
}

/**
 * Removes up to `count` of an item from unequipped stacks (quest hand-ins), bound stacks first.
 * Returns whether any bound item was used.
 */
export async function removeItems(tx: Tx, characterId: string, itemId: string, count: number) {
  let left = count
  let usedBound = false
  const rows = await tx
    .select()
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
    .orderBy(desc(inventoryItems.bound))
  for (const row of rows) {
    if (left <= 0) break
    const taken = Math.min(left, row.count)
    left -= taken
    usedBound ||= row.bound
    if (taken === row.count) await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
    else
      await tx
        .update(inventoryItems)
        .set({ count: row.count - taken })
        .where(eq(inventoryItems.id, row.id))
  }
  return usedBound
}

export async function loadQuests(tx: Tx, characterId: string): Promise<QuestProgress[]> {
  return tx.select().from(characterQuests).where(eq(characterQuests.characterId, characterId))
}

/** Saves progress of active quests; a quest that is already ready or completed is never reverted. */
export async function saveQuests(tx: Tx, characterId: string, changed: QuestProgress[]) {
  for (const quest of changed) {
    await tx
      .update(characterQuests)
      .set({ progress: quest.progress, state: quest.state })
      .where(
        and(
          eq(characterQuests.characterId, characterId),
          eq(characterQuests.taskId, quest.taskId),
          eq(characterQuests.state, ACTIVE),
        ),
      )
  }
}

/** A quest command (CommandRule) after a successful action, inside its transaction. */
export async function questCommand(
  tx: Tx,
  character: { id: string; sceneId: number },
  command: number,
) {
  await saveQuests(
    tx,
    character.id,
    recordCommand(await loadQuests(tx, character.id), command, character.sceneId),
  )
}

/** Applies EXP with level-ups (refilling HP and MP on level-up) and returns the column updates. */
export function expUpdate(character: CharacterRow, gained: number) {
  const table = levels()
  const result = gainExp(
    character.level,
    character.exp,
    gained,
    table.levelexp,
    table.role.maxlevel,
  )
  const { level, exp, levelsGained } = result
  if (levelsGained === 0) return { level, exp, hp: character.hp, mp: character.mp, levelsGained }
  const stats = deriveStats(avatarStats(character.avatarId), level)
  return { level, exp, hp: stats.maxHp, mp: stats.maxMp, levelsGained }
}

export async function acceptQuest(tx: Tx, characterId: string, taskId: number) {
  await tx
    .insert(characterQuests)
    .values({ characterId, taskId, progress: subTasks(taskId).map(() => 0) })
    .onConflictDoNothing()
}

/**
 * Claims a ready quest (ready -> completed in one UPDATE), then pays it out (items, money, honor,
 * EXP), auto-accepts the next and returns what it granted. Returns undefined and pays nothing when
 * the quest was not ready.
 */
export async function completeQuest(
  tx: Tx,
  characterId: string,
  taskId: number,
): Promise<QuestHandIn | undefined> {
  const claimed = await tx
    .update(characterQuests)
    .set({ state: COMPLETED, completedAt: sql`now()` })
    .where(
      and(
        eq(characterQuests.characterId, characterId),
        eq(characterQuests.taskId, taskId),
        eq(characterQuests.state, READY),
      ),
    )
    .returning({ taskId: characterQuests.taskId })
  if (claimed.length === 0) return undefined

  const row = task(taskId)!
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  if (!character) throw new Error(`Character ${characterId} not found`)

  // Collected quest items are handed in (CollectRule).
  for (const step of subTasks(taskId)) {
    if (Number(step.SubTaskType) === COLLECT_STEP) {
      await removeItems(tx, characterId, String(step.TargetItem), Number(step.TargetRequireNum))
    }
  }

  const listed = questRewards(taskId)
  const rewards = { ...listed, exp: vipExp(listed.exp, character) }
  const dropId = Number(row.RewardDropID)
  const granted: GrantedItem[] =
    dropId > 0 && dropLib(dropId)
      ? rollLibDrops(dropId, createRandom(randomInt(2 ** 31)), vipDropMul(character)).map(
          (drop) => ({
            ...drop,
            bound: true,
          }),
        )
      : rewards.items.flatMap(({ itemId, count }) =>
          Array.from({ length: count }, () => ({ itemId, bound: true })),
        )
  const itemIds = granted.map((drop) => drop.itemId)
  await grantItems(tx, characterId, granted)

  const { levelsGained, ...exp } = expUpdate(character, rewards.exp)
  await saveCharacterProgress(tx, characterId, {
    ...exp,
    stone: character.stone + rewards.stone,
    gold: character.gold + rewards.gold,
    giftCoupon: character.giftCoupon + rewards.giftCoupon,
    honor: character.honor + rewards.honor,
  })

  const nextId = Number(row.NextTaskID)
  const next = nextId > 0 ? task(nextId) : undefined
  // RookieTaskSystem: the next task is auto-accepted when it says so and its level allows it.
  if (next && Number(next.AutoAcceptTask) === 1 && exp.level >= Number(next.RequireLevel)) {
    await acceptQuest(tx, characterId, nextId)
  }
  return { taskId, ...rewards, items: countItems(itemIds), levelsGained }
}

/** Rookie (tutorial) quests complete as soon as every step is done (RookieTaskSystem). */
export async function handInReadyRookieQuests(tx: Tx, characterId: string) {
  const handIns: QuestHandIn[] = []
  for (;;) {
    const ready = (await loadQuests(tx, characterId)).find(
      (q) => q.state === READY && Number(task(q.taskId)?.TaskBaseType) === ROOKIE,
    )
    if (!ready) return handIns
    const handIn = await completeQuest(tx, characterId, ready.taskId)
    if (handIn) handIns.push(handIn)
  }
}

/**
 * Hands in ready rookie quests for an action response: `completed` ids and, in the same order,
 * what each one granted (`rewards`).
 */
export async function rookieHandIns(tx: Tx, characterId: string) {
  const rewards = await handInReadyRookieQuests(tx, characterId)
  return {
    completed: rewards.map((handIn) => handIn.taskId),
    rewards,
    levelsGained: rewards.reduce((sum, handIn) => sum + handIn.levelsGained, 0),
  }
}

/** Every EXP source uses this write so each crossed level learns skills in the same transaction. */
export async function saveCharacterProgress(tx: Tx, id: string, values: Partial<CharacterRow>) {
  const before =
    values.level === undefined
      ? undefined
      : (await tx.select().from(characters).where(eq(characters.id, id)).for('update'))[0]
  let [updated] = await tx.update(characters).set(values).where(eq(characters.id, id)).returning()
  if (!updated) throw new Error('Character disappeared during progression.')
  if (values.level !== undefined) {
    await learnThroughLevel(tx, updated)
    if (before && updated.level > before.level) {
      const { playerFighter } = await import('./combat.js')
      const stats = await playerFighter(tx, updated)
      ;[updated] = await tx
        .update(characters)
        .set({ hp: stats.maxHp, mp: stats.maxMp })
        .where(eq(characters.id, id))
        .returning()
    }
    const { refreshArenaSnapshot } = await import('../modules/arena/snapshot.js')
    await refreshArenaSnapshot(tx, id)
  }
  return updated!
}
