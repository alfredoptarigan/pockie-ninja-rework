// Player actions in the world: quests, NPC talk, items, equipment, travel and revive.
import {
  bagItemsWhere,
  fitsOutfit,
  inventoryView,
  isWornIn,
  placeAt,
  placeBag,
  requireBagRoom,
  spotOf,
  wornItemsWhere,
} from '../../game/bag.js'
import { USABLE_PAGES } from '../../game/bag-grid.js'
import { createRandom, deriveStats } from '@pockie/game-core'
import {
  buyPouchesSchema,
  itemActionParamsSchema,
  travelSchema,
  unequipSchema,
} from '@pockie/shared'
import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import {
  avatarStats,
  dropLib,
  item,
  levels,
  nationScenes,
  npc,
  scene,
  sceneSpawns,
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
  questLocation,
  questNavigation,
  isRebornQuest,
  rebornLocation,
  questRewards,
  recordCommand,
  recordTalk,
  stepCommand,
  stepTarget,
  talkItems,
  USE_ITEM_COMMAND,
} from '../../game/quests.js'
import { grantFreeSkillReset, learnScrollSkill } from '../../game/skill-bar.js'
import { useBuffItem } from '../../game/nonfight-buffs.js'
import { refreshBuffState } from './nonfight-buffs.js'
import { playerFighter } from '../../game/combat.js'
import { WING_SLOT } from '../../game/wings.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { openCardBox } from '../cards/routes.js'
import { adoptPetItem } from '../pets/kennel.js'
import { equipRefusal, reviveLoss, rollLibDrops, wearEquipped } from '../../game/gear.js'
import { buyPouches, pouchMax } from '../../game/pouch.js'
import { HttpError } from '../../http.js'
import type { Realtime } from '../realtime/realtime.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import { CHANGE_VILLAGE_STONE, changeVillage, homeScene, travelRefusal } from './travel.js'
import { recordSceneEntered } from './world.js'
import { RATE_LIMITS } from './rate-limits.js'
import { requireNoTeam } from '../teams/index.js'

const READY = 1
const COMPLETED = 2
// Quest types handed in at their submit NPC (TaskBaseRule.OnTestTaskComplete).
const HANDED_IN_TYPES = new Set([1, 3, 5])

const itemParams = itemActionParamsSchema
const taskParams = z.object({ taskId: z.coerce.number().int().positive() })
const npcParams = z.object({ npcId: z.string().regex(/^n\d+$/) })
const reviveBody = z.object({ mode: z.enum(['home', 'gold']) })
const changeVillageBody = z.object({ village: z.number().int() })

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

/**
 * Column updates for HP/MP potions and pouch refills, by the item's script
 * (Resource/javascript/item/*.js); undefined for other items. hp.js, mp.js and hmp.js refuse when
 * there is nothing to heal; hmpcontainer.js fills the pouches up to their size.
 */
function restoreItem(
  character: CharacterRow,
  def: NonNullable<ReturnType<typeof item>>,
  stats: { maxHp: number; maxMp: number },
) {
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

export async function reloadCharacter(tx: Tx, id: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, id))
  return toCharacter(row!, await playerFighter(tx, row!))
}

/** A bag (or equipped) row of the character, or 404. */
export async function ownedItem(tx: Tx, characterId: string, id: string) {
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(and(bagItemsWhere(characterId), eq(inventoryItems.id, id)))
  if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
  return row
}

/**
 * POST /items/:id/use for one item: `character` is the caller's locked, current row. Shared by
 * the bag's Use Multiple.
 */
export async function useItem(
  tx: Tx,
  character: CharacterRow,
  row: typeof inventoryItems.$inferSelect,
) {
  const def = item(row.itemId)
  if (!def || Number(def.CanUse) !== 1) throw bad('cannot_use', 'That item cannot be used.')
  if (character.level < Number(def.UseLevel ?? 0)) throw bad('too_low', 'Your level is too low.')
  // M6 decision 9: a pet item goes into the Pet Kennel.
  if (await adoptPetItem(tx, character, row))
    return {
      ...(await rookieHandIns(tx, character.id)),
      character: await reloadCharacter(tx, character.id),
    }

  let card: { cardId: number; nameKey: string } | undefined
  const scrollItem = await learnScrollSkill(tx, character.id, def)
  const freeResetItem = !scrollItem && (await grantFreeSkillReset(tx, character, def))
  const buffItem = !scrollItem && (await useBuffItem(tx, character.id, row.itemId, def))
  const restore =
    buffItem || freeResetItem || scrollItem
      ? undefined
      : restoreItem(character, def, await playerFighter(tx, character))
  if (scrollItem || freeResetItem) {
    await consumeOne(tx, row)
    await refreshBuffState(tx, character)
  } else if (buffItem) {
    await consumeOne(tx, row)
    await refreshBuffState(tx, character)
  } else if (restore) {
    await tx.update(characters).set(restore).where(eq(characters.id, character.id))
  } else if (def.class === 'CardBox') {
    // M6 decision 28: one card into the Card Room; the box is used up there.
    card = (await openCardBox(tx, character.id, row)) ?? undefined
    if (!card) throw bad('cannot_use', 'That item cannot be used yet.')
  } else if (Number(def.BoxDropID) > 0 && dropLib(Number(def.BoxDropID))) {
    const drops = rollLibDrops(Number(def.BoxDropID), createRandom(randomInt(2 ** 31)))
    // Box contents inherit the box's binding; a full bag keeps the box closed.
    const contents = drops.map((drop) => ({ ...drop, bound: row.bound }))
    await consumeOne(tx, row)
    await requireBagRoom(tx, character.id, contents)
    await grantItems(tx, character.id, contents)
  } else {
    throw bad('cannot_use', 'That item cannot be used yet.')
  }
  if (restore) await consumeOne(tx, row)

  if (def.JavaScript === 'item/FoodItem.js')
    await saveQuests(
      tx,
      character.id,
      recordCommand(await loadQuests(tx, character.id), 2127, character.sceneId),
    )
  const quests = await loadQuests(tx, character.id)
  await saveQuests(
    tx,
    character.id,
    recordCommand(quests, USE_ITEM_COMMAND, character.sceneId, row.itemId),
  )
  return {
    ...(await rookieHandIns(tx, character.id)),
    ...(card && { card }),
    character: await reloadCharacter(tx, character.id),
  }
}

export async function actionRoutes(
  app: FastifyInstance,
  { db, realtime }: { db: Db; realtime: Pick<Realtime, 'moveCharacter'> },
) {
  const reload = reloadCharacter

  app.get('/quests', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db.transaction((tx) => loadQuests(tx, character.id))
    return {
      quests: rows
        .filter((q) => q.state !== COMPLETED)
        .map((q) => ({ q, navigation: questNavigation(q, character.nation) }))
        .map(({ q, navigation }) => ({
          ...q,
          nameKey: `lg_Task_${q.taskId}`,
          descriptionKey: `lg_TaskDes_${q.taskId}`,
          rewards: questRewards(q.taskId),
          ...(navigation ? { navigation } : {}),
          steps: subTasks(q.taskId).map((step) => ({
            descriptionKey: `lg_${step.SubTaskDescription}`,
            target: stepTarget(step),
            ...(isRebornQuest(q.taskId)
              ? {
                  descriptionArgs: [
                    `lg_name_${rebornLocation(q.taskId, Number(step.SubmitSceneID), String(step.TargetConfiger), character.nation).npcId}`,
                  ],
                }
              : {}),
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

  // Locks the character: placing new items must not race another placement.
  app.get('/inventory', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => inventoryView(tx, await lockCharacter(tx, userId)))
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
        const acceptScene = questLocation(taskId, character.nation, 'accept').sceneId
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
        if (quest.state !== READY || !row || !HANDED_IN_TYPES.has(Number(row.TaskBaseType)))
          continue
        const submit = questLocation(quest.taskId, character.nation, 'submit')
        if (submit.npcId !== npcId || submit.sceneId !== character.sceneId) continue
        const handIn = await completeQuest(tx, character.id, quest.taskId)
        if (handIn) handIns.push(handIn)
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
      return useItem(tx, character, await ownedItem(tx, character.id, id))
    })
  })

  app.post('/items/:id/equip', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = itemParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      // Placed first, so the replaced item can take the new item's tile.
      await placeBag(tx, character.id)
      const row = await ownedItem(tx, character.id, id)
      const def = item(row.itemId)
      if (!def || def.class !== 'EquipItem')
        throw bad('cannot_equip', 'That item cannot be equipped.')
      if (character.level < Number(def.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')
      if (!fitsOutfit(def, character.avatarId)) {
        throw bad('wrong_class', 'Your outfit cannot use this kind of weapon.')
      }
      const refusal = equipRefusal(row)
      if (refusal) throw bad(refusal.code, refusal.message)
      const slot = String(def.EquipType)
      // Wears it in the active equipment set; an item worn in another set moves (Reborn).
      const [worn] = await tx
        .select()
        .from(inventoryItems)
        .where(and(wornItemsWhere(character.id), eq(inventoryItems.equippedSlot, slot)))
      const replaced = worn && worn.id !== row.id ? worn : undefined
      const freed = spotOf(row)
      if (replaced) {
        // Coming from another set, the item frees no tile for the piece it replaces.
        if (!freed) await requireBagRoom(tx, character.id, [replaced], { separate: true })
        await tx
          .update(inventoryItems)
          .set({ equippedSlot: null })
          .where(eq(inventoryItems.id, replaced.id))
      }
      await tx
        .update(inventoryItems)
        .set({ equippedSlot: slot, equippedSet: character.activeSet, bagPage: null, bagSlot: null })
        .where(eq(inventoryItems.id, row.id))
      // The replaced item takes the new item's tile when it fits there, else any free one.
      if (replaced && freed) await placeAt(tx, character.id, replaced, freed)
      // Wing stats are part of the arena defence (M6 decision 23).
      if (slot === WING_SLOT) await refreshArenaSnapshot(tx, character.id)

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
        ...(await inventoryView(tx, character)),
      }
    })
  })

  // EquipSystem.OnCustomUnEquip: the item goes back to the bag, which needs a free row. An
  // optional {page, slot} drops it on that tile when it is free; otherwise it is placed first-fit.
  app.post('/items/:id/unequip', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = itemParams.parse(request.params)
    const target = unequipSchema.parse(request.body ?? {})
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, id)
      if (!isWornIn(row, character.activeSet))
        throw bad('not_equipped', 'That item is not equipped.')
      await requireBagRoom(tx, character.id, [row], { separate: true })
      await tx
        .update(inventoryItems)
        .set({ equippedSlot: null })
        .where(eq(inventoryItems.id, row.id))
      if (target.page !== undefined && target.slot !== undefined && target.page < USABLE_PAGES)
        await placeAt(tx, character.id, row, { page: target.page, slot: target.slot })
      if (row.equippedSlot === WING_SLOT) await refreshArenaSnapshot(tx, character.id)
      return { character: await reload(tx, character.id), ...(await inventoryView(tx, character)) }
    })
  })

  app.post('/travel', { config: { rateLimit: RATE_LIMITS.travel } }, async (request) => {
    const input = travelSchema.parse(request.body)
    const userId = requireUser(request).id
    const result = await db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      requireAlive(character, 'travel')
      await requireNoTeam(tx, character.id, 'travel')
      let sceneId: number
      if ('sceneId' in input) {
        const refused = travelRefusal(
          character,
          await loadQuests(tx, character.id),
          input.sceneId,
          input.via,
        )
        if (refused) throw bad(refused.code, refused.message)
        sceneId = input.sceneId
      } else {
        sceneId = homeScene(character, input.via)
      }
      await tx.update(characters).set({ sceneId }).where(eq(characters.id, character.id))
      await recordSceneEntered(tx, character.id, sceneId)
      return { character: await reload(tx, character.id) }
    })
    // After commit, so sockets never move to a scene the database rolled back.
    realtime.moveCharacter(result.character)
    return result
  })

  // Reborn's Village Elder "Change Village" (`changeVillage {village}`): Angel City, 50,000 Stone.
  app.post('/change-village', { config: { rateLimit: RATE_LIMITS.travel } }, async (request) => {
    const { village } = changeVillageBody.parse(request.body)
    const userId = requireUser(request).id
    const result = await db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const change = changeVillage(character, village)
      if ('code' in change) throw bad(change.code, change.message)
      await tx
        .update(characters)
        .set({ nation: change.nation, stone: character.stone - CHANGE_VILLAGE_STONE })
        .where(eq(characters.id, character.id))
      return { character: await reload(tx, character.id) }
    })
    // Online players see the new village (chat, player list).
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

  // ReliveSystem.OnCustomRelive: going home also wears worn gear by 5% of its MaxHardiness.
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
        await wearEquipped(tx, character.id, reviveLoss)
      }
      return { character: await reload(tx, character.id) }
    })
    realtime.moveCharacter(result.character)
    return result
  })
}
