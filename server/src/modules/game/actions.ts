// Player actions in the world: quests, NPC talk, items, equipment, travel and revive.
import {
  createRandom,
  deriveStats,
  rollDrops,
  type DropEntry,
  type DropLib,
} from '@pockie/game-core'
import { buyPouchesSchema } from '@pockie/shared'
import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import {
  avatarStats,
  dropItems,
  dropLib,
  item,
  itemNameKey,
  levels,
  nationScenes,
  npc,
  scene,
  sceneSpawns,
  sceneSwitchRule,
  subTasks,
  task,
} from '../../game/data.js'
import {
  acceptQuest,
  completeQuest,
  consumeOne,
  grantItems,
  handInReadyRookieQuests,
  rookieHandIns,
  loadQuests,
  saveQuests,
  type Tx,
} from '../../game/progress.js'
import {
  availableQuests,
  BUY_POUCH_COMMAND,
  EQUIP_WEAPON_COMMAND,
  questLock,
  questRewards,
  recordCommand,
  recordTalk,
  stepCommand,
  talkItems,
  USE_ITEM_COMMAND,
} from '../../game/quests.js'
import { buyPouches, pouchMax } from '../../game/pouch.js'
import { HttpError } from '../../http.js'
import type { Realtime } from '../realtime/realtime.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

const READY = 1
const COMPLETED = 2
// Quest types handed in at their submit NPC (TaskBaseRule.OnTestTaskComplete).
const HANDED_IN_TYPES = new Set([1, 3, 5])

const itemParams = z.object({ id: z.uuid() })
const taskParams = z.object({ taskId: z.coerce.number().int().positive() })
const npcParams = z.object({ npcId: z.string().regex(/^n\d+$/) })
const travelBody = z.object({ sceneId: z.number().int().positive() })
const reviveBody = z.object({ mode: z.enum(['home', 'gold']) })

type CharacterRow = typeof characters.$inferSelect

// relive.ini: going home costs 5% of the next level's EXP and leaves 1 HP; reviving on the spot
// costs 1 Gold (capital type 2) and refills HP and MP.
const RELIVE_EXP_PERCENT = 5
const RELIVE_HP = 1
const RELIVE_GOLD = 1

/**
 * What each revive costs this character (ReliveSystem): the EXP going home takes (5% of the next
 * level's EXP, 0 at the level cap) and whether the scene allows reviving on the spot.
 */
export function reviveTerms(character: Pick<CharacterRow, 'level' | 'sceneId'>) {
  const table = levels()
  const nextExp =
    character.level < table.role.maxlevel ? (table.levelexp[String(character.level + 1)] ?? 0) : 0
  return {
    homeExpLoss: Math.trunc(nextExp * RELIVE_EXP_PERCENT * 0.01),
    gold: RELIVE_GOLD,
    goldAllowed: Number(scene(character.sceneId)?.CanRelive) !== 0,
  }
}

const bad = (code: string, message: string) => new HttpError(400, code, message)

/** Whether the outfit's weapon class may use the item (UsePopsinger bit mask, -1 any). */
function fitsOutfit(def: NonNullable<ReturnType<typeof item>>, avatarId: number) {
  const allowed = Number(def.UsePopsinger)
  return allowed === -1 || (allowed & avatarStats(avatarId).Popsinger) !== 0
}

/**
 * Column updates for HP/MP potions and pouch refills, by the item's script
 * (Resource/javascript/item/*.js); undefined for other items. hp.js, mp.js and hmp.js refuse when
 * there is nothing to heal; hmpcontainer.js fills the pouches up to their size.
 */
function restoreItem(character: CharacterRow, def: NonNullable<ReturnType<typeof item>>) {
  const addHp = Number(def.HP ?? 0)
  const addMp = Number(def.MP ?? 0)
  const script = String(def.JavaScript)
  if (script === 'item/hmpcontainer.js') {
    const max = pouchMax(character.level)
    const hpFull = addHp <= 0 || character.hpPouch >= max
    const mpFull = addMp <= 0 || character.mpPouch >= max
    if (hpFull && mpFull) throw bad('pouch_full', 'Your pouch is already full.')
    return {
      hpPouch: Math.min(max, character.hpPouch + Math.max(0, addHp)),
      mpPouch: Math.min(max, character.mpPouch + Math.max(0, addMp)),
    }
  }
  if (!['item/hp.js', 'item/mp.js', 'item/hmp.js'].includes(script)) return undefined
  // The original leaves a defeated ninja dead (StateSystem) whatever their HP; here 0 HP is the
  // dead state, so healing waits until they revive.
  if (character.hp <= 0) throw bad('defeated', 'You were defeated. Revive before you heal.')
  const stats = deriveStats(avatarStats(character.avatarId), character.level)
  const canHeal = addHp > 0 && character.hp < stats.maxHp
  const canRestore = addMp > 0 && character.mp < stats.maxMp
  if (!canHeal && !canRestore) {
    throw bad('full', addHp > 0 ? 'Your HP is already full.' : 'Your chakra is already full.')
  }
  return {
    hp: Math.min(stats.maxHp, character.hp + Math.max(0, addHp)),
    mp: Math.min(stats.maxMp, character.mp + Math.max(0, addMp)),
  }
}

export async function actionRoutes(
  app: FastifyInstance,
  { db, realtime }: { db: Db; realtime: Pick<Realtime, 'moveCharacter'> },
) {
  const reload = async (tx: Tx, id: string) =>
    toCharacter((await tx.select().from(characters).where(eq(characters.id, id)))[0]!)

  async function ownedItem(tx: Tx, characterId: string, id: string) {
    const [row] = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.characterId, characterId)))
    if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
    return row
  }

  app.get('/quests', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db.transaction((tx) => loadQuests(tx, character.id))
    return {
      quests: rows
        .filter((q) => q.state !== COMPLETED)
        .map((q) => ({
          ...q,
          nameKey: `lg_Task_${q.taskId}`,
          descriptionKey: `lg_TaskDes_${q.taskId}`,
          rewards: questRewards(q.taskId),
          steps: subTasks(q.taskId).map((step) => ({
            descriptionKey: `lg_${step.SubTaskDescription}`,
            target: Number(step.TargetRequireNum),
            ...stepCommand(step),
          })),
        })),
    }
  })

  app.get('/quests/available', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db.transaction((tx) => loadQuests(tx, character.id))
    return {
      available: availableQuests(character, rows),
      completed: rows.filter((q) => q.state === COMPLETED).map((q) => q.taskId),
    }
  })

  app.get('/inventory', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, character.id))
    return {
      items: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        count: row.count,
        bound: row.bound,
        equippedSlot: row.equippedSlot,
        nameKey: itemNameKey(row.itemId),
        ...(item(row.itemId)?.class === 'EquipItem'
          ? { fitsOutfit: fitsOutfit(item(row.itemId)!, character.avatarId) }
          : {}),
      })),
    }
  })

  app.post(
    '/quests/:taskId/accept',
    { config: { rateLimit: RATE_LIMITS.acceptQuest } },
    async (request) => {
      const { taskId } = taskParams.parse(request.params)
      const userId = requireUser(request).id
      return db.transaction(async (tx) => {
        const character = await lockCharacter(tx, userId)
        const quests = await loadQuests(tx, character.id)
        const lock = questLock(taskId, character, quests)
        if (lock) throw bad(lock.code, lock.message)
        const acceptScene = Number(task(taskId)!.AcceptNpcSceneID)
        if (acceptScene > 0 && acceptScene !== character.sceneId) {
          throw bad('wrong_place', 'Talk to the quest giver to take this quest.')
        }
        await acceptQuest(tx, character.id, taskId)
        return { quests: await loadQuests(tx, character.id) }
      })
    },
  )

  app.post('/npcs/:npcId/talk', { config: { rateLimit: RATE_LIMITS.talk } }, async (request) => {
    const { npcId } = npcParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      if (!sceneSpawns(character.sceneId).some((spawn) => spawn.id === npcId)) {
        throw bad('not_here', 'That person is not here.')
      }
      const quests = await loadQuests(tx, character.id)
      const given = talkItems(quests, npcId)
      await saveQuests(tx, character.id, recordTalk(quests, npcId, character.sceneId))
      await grantItems(
        tx,
        character.id,
        given.map((itemId) => ({ itemId, bound: true })),
      )

      const handIns = await handInReadyRookieQuests(tx, character.id)
      // Ready main/branch quests are handed in at their submit NPC.
      for (const quest of await loadQuests(tx, character.id)) {
        const row = task(quest.taskId)
        if (
          quest.state === READY &&
          row &&
          HANDED_IN_TYPES.has(Number(row.TaskBaseType)) &&
          row.SubmitNpcConfig === npcId &&
          Number(row.SubmitNpcSceneID) === character.sceneId
        ) {
          const handIn = await completeQuest(tx, character.id, quest.taskId)
          if (handIn) handIns.push(handIn)
        }
      }
      return {
        dialogKey: `lg_Say_${npcId}`,
        nameKey: `lg_${npc(npcId)?.Name ?? npcId}`,
        completed: handIns.map((handIn) => handIn.taskId),
        /** What each completed quest granted, in `completed` order. */
        rewards: handIns,
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/items/:id/use', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = itemParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, id)
      const def = item(row.itemId)
      if (!def || Number(def.CanUse) !== 1) throw bad('cannot_use', 'That item cannot be used.')
      if (character.level < Number(def.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')

      const restore = restoreItem(character, def)
      if (restore) {
        await tx.update(characters).set(restore).where(eq(characters.id, character.id))
      } else if (Number(def.BoxDropID) > 0 && dropLib(Number(def.BoxDropID))) {
        const libId = Number(def.BoxDropID)
        const drops = rollDrops(
          dropLib(libId) as unknown as DropLib,
          dropItems(libId) as unknown as DropEntry[],
          createRandom(randomInt(2 ** 31)),
        )
        // Box contents inherit the box's binding.
        await grantItems(
          tx,
          character.id,
          drops.map((drop) => ({ ...drop, bound: row.bound })),
        )
      } else {
        throw bad('cannot_use', 'That item cannot be used yet.')
      }
      await consumeOne(tx, row)

      const quests = await loadQuests(tx, character.id)
      await saveQuests(
        tx,
        character.id,
        recordCommand(quests, USE_ITEM_COMMAND, character.sceneId, row.itemId),
      )
      return {
        ...(await rookieHandIns(tx, character.id)),
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/items/:id/equip', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = itemParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, id)
      const def = item(row.itemId)
      if (!def || def.class !== 'EquipItem')
        throw bad('cannot_equip', 'That item cannot be equipped.')
      if (character.level < Number(def.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')
      if (!fitsOutfit(def, character.avatarId)) {
        throw bad('wrong_class', 'Your outfit cannot use this kind of weapon.')
      }
      const slot = String(def.EquipType)
      await tx
        .update(inventoryItems)
        .set({ equippedSlot: null })
        .where(
          and(eq(inventoryItems.characterId, character.id), eq(inventoryItems.equippedSlot, slot)),
        )
      await tx
        .update(inventoryItems)
        .set({ equippedSlot: slot })
        .where(eq(inventoryItems.id, row.id))

      if (slot === 'Weapon') {
        const quests = await loadQuests(tx, character.id)
        await saveQuests(
          tx,
          character.id,
          recordCommand(quests, EQUIP_WEAPON_COMMAND, character.sceneId),
        )
      }
      return {
        ...(await rookieHandIns(tx, character.id)),
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/travel', { config: { rateLimit: RATE_LIMITS.travel } }, async (request) => {
    const { sceneId } = travelBody.parse(request.body)
    const userId = requireUser(request).id
    const result = await db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      requireAlive(character, 'travel')
      const target = scene(sceneId)
      const rule = sceneSwitchRule(sceneId)
      // sceneswitchrule.ini: the target must list the current scene as a starting point.
      if (
        !target ||
        !rule ||
        Number(target.IsStart) !== 1 ||
        !(String(character.sceneId) in rule)
      ) {
        throw bad('no_route', 'You cannot travel there from here.')
      }
      const nation = Number(target.Nation)
      if (nation !== -1 && nation !== character.nation) {
        throw bad('other_village', 'Only ninjas of that village may enter.')
      }
      if (character.level < Math.max(Number(rule.RequireLevel ?? -1), Number(target.Level ?? -1))) {
        throw bad('too_low', 'Your level is too low for that area.')
      }
      await tx.update(characters).set({ sceneId }).where(eq(characters.id, character.id))
      return { character: await reload(tx, character.id) }
    })
    // After commit, so sockets never move to a scene the database rolled back.
    realtime.moveCharacter(result.character)
    return result
  })

  // RoleUseSystem.OnCustomBuy: pouch refills for Gold or Gift Coupons.
  app.post('/pouches/buy', { config: { rateLimit: RATE_LIMITS.buyPouches } }, async (request) => {
    const { currency, hp, mp } = buyPouchesSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const purchase = buyPouches(character, hp, mp)
      if (!purchase) throw bad('pouch_full', 'Your pouch is already full.')
      if (character[currency] < purchase.cost) {
        const name = currency === 'gold' ? 'Gold' : 'Gift Coupons'
        throw bad('no_money', `You need ${purchase.cost} ${name}.`)
      }
      await tx
        .update(characters)
        .set({
          [currency]: character[currency] - purchase.cost,
          hpPouch: purchase.hpPouch,
          mpPouch: purchase.mpPouch,
        })
        .where(eq(characters.id, character.id))
      const quests = await loadQuests(tx, character.id)
      await saveQuests(
        tx,
        character.id,
        recordCommand(quests, BUY_POUCH_COMMAND, character.sceneId),
      )
      return {
        ...(await rookieHandIns(tx, character.id)),
        character: await reload(tx, character.id),
      }
    })
  })

  // ReliveSystem.OnCustomRelive. ponytail: the 5% equipment wear on going home is skipped
  // (durability is not tracked yet).
  app.post('/revive', { config: { rateLimit: RATE_LIMITS.revive } }, async (request) => {
    const { mode } = reviveBody.parse(request.body)
    const userId = requireUser(request).id
    const result = await db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      if (character.hp > 0) throw bad('not_defeated', 'You have not been defeated.')

      const terms = reviveTerms(character)
      if (mode === 'gold') {
        if (!terms.goldAllowed) {
          throw bad('no_relive', 'You cannot revive here.')
        }
        if (character.gold < RELIVE_GOLD) {
          throw bad('no_gold', `You need ${RELIVE_GOLD} Gold to revive here.`)
        }
        const stats = deriveStats(avatarStats(character.avatarId), character.level)
        await tx
          .update(characters)
          .set({ hp: stats.maxHp, mp: stats.maxMp, gold: character.gold - RELIVE_GOLD })
          .where(eq(characters.id, character.id))
      } else {
        // SceneSystem.GoHome.
        const toScene = Number(scene(character.sceneId)?.ToScene ?? 0)
        await tx
          .update(characters)
          .set({
            hp: RELIVE_HP,
            exp: Math.max(0, character.exp - terms.homeExpLoss),
            sceneId: toScene > 0 ? toScene : nationScenes()[character.nation]!.castle,
          })
          .where(eq(characters.id, character.id))
      }
      return { character: await reload(tx, character.id) }
    })
    realtime.moveCharacter(result.character)
    return result
  })
}
