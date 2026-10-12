// Player actions in the world: quests, NPC talk, items, equipment and travel.
import {
  createRandom,
  deriveStats,
  rollDrops,
  type DropEntry,
  type DropLib,
} from '@pockie/game-core'
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
  completeReadyRookieQuests,
  consumeOne,
  grantItems,
  loadQuests,
  saveQuests,
  type Tx,
} from '../../game/progress.js'
import {
  EQUIP_WEAPON_COMMAND,
  recordCommand,
  recordTalk,
  talkItems,
  USE_ITEM_COMMAND,
} from '../../game/quests.js'
import { HttpError } from '../../http.js'
import { requireUser, toCharacter } from './characters.js'

const READY = 1
const COMPLETED = 2
// Quest types handed in at their submit NPC (TaskBaseRule.OnTestTaskComplete).
const HANDED_IN_TYPES = new Set([1, 3, 5])

const itemParams = z.object({ id: z.uuid() })
const taskParams = z.object({ taskId: z.coerce.number().int().positive() })
const npcParams = z.object({ npcId: z.string().regex(/^n\d+$/) })
const travelBody = z.object({ sceneId: z.number().int().positive() })

const bad = (code: string, message: string) => new HttpError(400, code, message)

export async function actionRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function characterOf(tx: Tx | Db, userId: string) {
    const [row] = await tx.select().from(characters).where(eq(characters.userId, userId))
    if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
    return row
  }
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

  app.get('/quests', async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db.transaction((tx) => loadQuests(tx, character.id))
    return {
      quests: rows
        .filter((q) => q.state !== COMPLETED)
        .map((q) => ({
          ...q,
          nameKey: `lg_Task_${q.taskId}`,
          descriptionKey: `lg_TaskDes_${q.taskId}`,
          steps: subTasks(q.taskId).map((step) => ({
            descriptionKey: `lg_${step.SubTaskDescription}`,
            target: Number(step.TargetRequireNum),
          })),
        })),
    }
  })

  app.get('/inventory', async (request) => {
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
        nameKey: `lg_${item(row.itemId)?.Name ?? row.itemId}`,
      })),
    }
  })

  app.post('/quests/:taskId/accept', async (request) => {
    const { taskId } = taskParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await characterOf(tx, userId)
      const row = task(taskId)
      if (!row) throw bad('unknown_quest', 'Unknown quest.')
      const quests = await loadQuests(tx, character.id)
      if (quests.some((q) => q.taskId === taskId))
        throw bad('already_taken', 'You already have that quest.')
      const pre = Number(row.PreTaskID)
      if (pre > 0 && !quests.some((q) => q.taskId === pre && q.state === COMPLETED)) {
        throw bad('locked', 'Finish the previous quest first.')
      }
      const nation = Number(row.RequireCountry)
      if (
        character.level < Number(row.RequireLevel) ||
        (nation !== -1 && nation !== character.nation)
      ) {
        throw bad('locked', 'You cannot take this quest yet.')
      }
      const acceptScene = Number(row.AcceptNpcSceneID)
      if (acceptScene > 0 && acceptScene !== character.sceneId) {
        throw bad('wrong_place', 'Talk to the quest giver to take this quest.')
      }
      await acceptQuest(tx, character.id, taskId)
      return { quests: await loadQuests(tx, character.id) }
    })
  })

  app.post('/npcs/:npcId/talk', async (request) => {
    const { npcId } = npcParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await characterOf(tx, userId)
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

      const completed = await completeReadyRookieQuests(tx, character.id)
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
          await completeQuest(tx, character.id, quest.taskId)
          completed.push(quest.taskId)
        }
      }
      return {
        dialogKey: `lg_Say_${npcId}`,
        nameKey: `lg_${npc(npcId)?.Name ?? npcId}`,
        completed,
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/items/:id/use', async (request) => {
    const { id } = itemParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await characterOf(tx, userId)
      const row = await ownedItem(tx, character.id, id)
      const def = item(row.itemId)
      if (!def || Number(def.CanUse) !== 1) throw bad('cannot_use', 'That item cannot be used.')
      if (character.level < Number(def.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')

      if (def.class === 'PharmacyItem' && Number(def.HP) > 0) {
        const maxHp = deriveStats(avatarStats(character.avatarId), character.level).maxHp
        await tx
          .update(characters)
          .set({ hp: Math.min(maxHp, character.hp + Number(def.HP)) })
          .where(eq(characters.id, character.id))
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
        completed: await completeReadyRookieQuests(tx, character.id),
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/items/:id/equip', async (request) => {
    const { id } = itemParams.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await characterOf(tx, userId)
      const row = await ownedItem(tx, character.id, id)
      const def = item(row.itemId)
      if (!def || def.class !== 'EquipItem')
        throw bad('cannot_equip', 'That item cannot be equipped.')
      if (character.level < Number(def.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')
      const allowed = Number(def.UsePopsinger)
      const weaponClass = avatarStats(character.avatarId).Popsinger
      if (allowed !== -1 && (allowed & weaponClass) === 0) {
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
        completed: await completeReadyRookieQuests(tx, character.id),
        character: await reload(tx, character.id),
      }
    })
  })

  app.post('/travel', async (request) => {
    const { sceneId } = travelBody.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await characterOf(tx, userId)
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
  })
}
