// Shared game state changes inside a transaction: items, quest progress and quest completion
// (TaskSystem / RookieTaskSystem / RewardRule), see docs/original-data/quests-items.md.
import {
  createRandom,
  deriveStats,
  gainExp,
  rollDrops,
  type DropEntry,
  type DropLib,
} from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characterQuests, characters, inventoryItems } from '../db/schema.js'
import { avatarStats, dropItems, dropLib, item, levels, subTasks, task } from './data.js'
import type { QuestProgress } from './quests.js'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type CharacterRow = typeof characters.$inferSelect

const ROOKIE = 4
const READY = 1
const COMPLETED = 2
const CURRENCY_COLUMN = { 0: 'stone', 2: 'gold', 3: 'giftCoupon' } as const

/** Adds items, stacking onto unequipped rows of the same item up to the stack size. */
export async function grantItems(
  tx: Tx,
  characterId: string,
  items: { itemId: string; bound: boolean }[],
) {
  for (const { itemId, bound } of items) {
    const maxStack = Number(item(itemId)?.ItemMaxFoldNum ?? 1)
    const [stack] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, characterId),
          eq(inventoryItems.itemId, itemId),
          eq(inventoryItems.bound, bound),
          sql`${inventoryItems.equippedSlot} is null`,
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
      await tx.insert(inventoryItems).values({ characterId, itemId, bound })
    }
  }
}

export async function consumeOne(tx: Tx, row: typeof inventoryItems.$inferSelect) {
  if (row.count > 1) {
    await tx
      .update(inventoryItems)
      .set({ count: row.count - 1 })
      .where(eq(inventoryItems.id, row.id))
  } else {
    await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
  }
}

export async function loadQuests(tx: Tx, characterId: string): Promise<QuestProgress[]> {
  return tx.select().from(characterQuests).where(eq(characterQuests.characterId, characterId))
}

export async function saveQuests(tx: Tx, characterId: string, changed: QuestProgress[]) {
  for (const quest of changed) {
    await tx
      .update(characterQuests)
      .set({ progress: quest.progress, state: quest.state })
      .where(
        and(eq(characterQuests.characterId, characterId), eq(characterQuests.taskId, quest.taskId)),
      )
  }
}

/** Applies EXP with level-ups (refilling HP on level-up) and returns the column updates. */
export function expUpdate(character: CharacterRow, gained: number) {
  const table = levels()
  const result = gainExp(
    character.level,
    character.exp,
    gained,
    table.levelexp,
    table.role.maxlevel,
  )
  const hp =
    result.levelsGained > 0
      ? deriveStats(avatarStats(character.avatarId), result.level).maxHp
      : character.hp
  return { level: result.level, exp: result.exp, hp, levelsGained: result.levelsGained }
}

export async function acceptQuest(tx: Tx, characterId: string, taskId: number) {
  await tx
    .insert(characterQuests)
    .values({ characterId, taskId, progress: subTasks(taskId).map(() => 0) })
    .onConflictDoNothing()
}

/** Pays out a quest (items, money, honor, EXP), marks it completed and auto-accepts the next. */
export async function completeQuest(tx: Tx, characterId: string, taskId: number) {
  const row = task(taskId)!
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  if (!character) throw new Error(`Character ${characterId} not found`)

  const dropId = Number(row.RewardDropID)
  if (dropId > 0 && dropLib(dropId)) {
    const random = createRandom(randomInt(2 ** 31))
    const drops = rollDrops(
      dropLib(dropId) as unknown as DropLib,
      dropItems(dropId) as unknown as DropEntry[],
      random,
    )
    await grantItems(
      tx,
      characterId,
      drops.map((d) => ({ ...d, bound: true })),
    )
  } else if (String(row.RewardItem).startsWith('i')) {
    for (const part of String(row.RewardItem).split(';')) {
      const [itemId = '', count = '1'] = part.split(',')
      const items = Array.from({ length: Number(count) }, () => ({ itemId, bound: true }))
      await grantItems(tx, characterId, items)
    }
  }

  const money: Partial<Record<'stone' | 'gold' | 'giftCoupon', number>> = {}
  if (String(row.RewardMoney) !== '0') {
    for (const part of String(row.RewardMoney).split(';')) {
      const [type = '', amount = '0'] = part.split(',')
      const column = CURRENCY_COLUMN[Number(type) as keyof typeof CURRENCY_COLUMN]
      if (column) money[column] = (money[column] ?? character[column]) + Number(amount)
    }
  }
  const { levelsGained, ...exp } = expUpdate(character, Number(row.RewardExp ?? 0))
  await tx
    .update(characters)
    .set({ ...money, ...exp, honor: character.honor + Number(row.RewardHono ?? 0) })
    .where(eq(characters.id, characterId))
  await tx
    .update(characterQuests)
    .set({ state: COMPLETED, completedAt: sql`now()` })
    .where(and(eq(characterQuests.characterId, characterId), eq(characterQuests.taskId, taskId)))

  const nextId = Number(row.NextTaskID)
  const next = nextId > 0 ? task(nextId) : undefined
  if (next && Number(next.AutoAcceptTask) === 1) await acceptQuest(tx, characterId, nextId)
  return levelsGained
}

/** Rookie (tutorial) quests complete as soon as every step is done (RookieTaskSystem). */
export async function completeReadyRookieQuests(tx: Tx, characterId: string) {
  const completed: number[] = []
  for (;;) {
    const ready = (await loadQuests(tx, characterId)).find(
      (q) => q.state === READY && Number(task(q.taskId)?.TaskBaseType) === ROOKIE,
    )
    if (!ready) return completed
    await completeQuest(tx, characterId, ready.taskId)
    completed.push(ready.taskId)
  }
}
