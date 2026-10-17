import { unequippedBagItemsWhere } from '../../game/bag.js'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import { fightMonster, monsterDrops, playerFighter } from '../../game/combat.js'
import {
  exploreSpotIds,
  itemNameKey,
  npc,
  sceneLinks,
  sceneSpawns,
  subTasks,
} from '../../game/data.js'
import { loadQuests, removeItems, rookieHandIns, saveQuests, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { rollFieldAmbush } from '../akatsuki/routes.js'
import { reviveTerms } from './actions.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import {
  buildingClip,
  levelVariant,
  npcMenu,
  restCost,
  ticketBoss,
  visitRequiredScenes,
} from './field-data.js'
import { RATE_LIMITS } from './rate-limits.js'
import { requireNoTeam } from '../teams/index.js'
import { requireBattleFree } from '../hunt/guard.js'
import { recordHuntKill } from '../hunt/hunt.js'
import { spendEnergy } from '../energy/energy.js'
import { ENERGY_RULES } from '../../../../shared/src/schemas/energy.js'

const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc'])
const MAX_LISTED_MONSTERS = 6
const MAX_LEVEL_ABOVE_PLAYER = 5
const READY = 1
const BOSS_STEP = 10

const fightSchema = z.object({ monsterId: z.string().regex(/^n\d+$/, 'Unknown monster.') })
const restSchema = z.object({ npcId: z.string().regex(/^n\d+$/) })

/** UI_GostList.as: up to 6 monsters, normal ones hidden when more than 5 levels above. */
export function sceneMonsters(sceneId: number, playerLevel: number) {
  return sceneSpawns(sceneId)
    .flatMap(({ id }) => {
      const row = npc(id)
      if (!row || !MONSTER_CLASSES.has(String(row.class))) return []
      const level = Number(row.Level)
      if (row.class === 'NormalNpc' && level > playerLevel + MAX_LEVEL_ABOVE_PLAYER) return []
      return [{ id, nameKey: `lg_${row.Name}`, level, lock: null }]
    })
    .slice(0, MAX_LISTED_MONSTERS)
}

async function heldCount(tx: Tx, characterId: string, itemId: string) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
  return rows.reduce((sum, row) => sum + row.count, 0)
}

/** The scene's ticket boss for the API: the listed boss and the variant fought at this level. */
function ticketBossView(sceneId: number, level: number, tickets: (itemId: string) => number) {
  const boss = ticketBoss(sceneId)
  if (!boss) return null
  const { npcId, artId, nameKey, x, y, scale } = boss
  // shortcut: combat uses backup level variants until a Reborn battle capture supplies stats.
  const fightId = levelVariant(npcId, level)
  const ticketItemId = String(npc(npcId)!.AttackItemConfig)
  return {
    id: npcId,
    fightId,
    artId,
    nameKey,
    level,
    x,
    y,
    scale,
    ticketItemId,
    ticketNameKey: itemNameKey(ticketItemId),
    tickets: tickets(ticketItemId),
  }
}

/**
 * BossRule (SubTaskType 10): killing the step's monster in its scene counts while the quest item
 * is held; the item is used up when the step completes.
 */
export async function recordBossKill(
  tx: Tx,
  characterId: string,
  monsterId: string,
  sceneId: number,
) {
  for (const quest of await loadQuests(tx, characterId)) {
    if (quest.state !== 0) continue
    const steps = subTasks(quest.taskId)
    const progress = [...quest.progress]
    let touched = false
    for (const step of steps) {
      const index = Number(step.SetpSeq)
      const target = Number(step.TargetRequireNum)
      const scene = Number(step.SubmitSceneID)
      if (
        Number(step.SubTaskType) !== BOSS_STEP ||
        step.TargetConfiger !== monsterId ||
        (scene !== -1 && scene !== sceneId) ||
        (progress[index] ?? 0) >= target ||
        (await heldCount(tx, characterId, String(step.TargetItem))) < 1
      ) {
        continue
      }
      progress[index] = (progress[index] ?? 0) + 1
      touched = true
      if (progress[index] >= target) await removeItems(tx, characterId, String(step.TargetItem), 1)
    }
    if (!touched) continue
    const done = steps.every(
      (step) => (progress[Number(step.SetpSeq)] ?? 0) >= Number(step.TargetRequireNum),
    )
    await saveQuests(tx, characterId, [{ taskId: quest.taskId, progress, state: done ? READY : 0 }])
  }
}

/**
 * SceneSystem.SetScenePass: remembers the scene the ninja stands in (ScenesEntered), once.
 * Looking at the scene is what entering it means, so this covers creation and every travel.
 */
export async function recordSceneEntered(db: Db | Tx, characterId: string, sceneId: number) {
  const visited = characters.scenesEntered
  const [row] = await db
    .update(characters)
    .set({
      scenesEntered: sql`case when ${sceneId} = any(${visited}) then ${visited} else array_append(${visited}, ${sceneId}) end`,
    })
    .where(eq(characters.id, characterId))
    .returning({ scenesEntered: visited })
  return row?.scenesEntered ?? [sceneId]
}

export async function worldRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/scene', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const sceneId = character.sceneId
    const visitedScenes = await recordSceneEntered(db, character.id, sceneId)
    const { tickets } = await db.transaction(async (tx) => {
      const boss = ticketBoss(sceneId)
      const ticketItem = boss ? String(npc(boss.npcId)?.AttackItemConfig) : undefined
      return {
        tickets: ticketItem ? await heldCount(tx, character.id, ticketItem) : 0,
      }
    })
    return {
      sceneId,
      visitedScenes,
      visitRequired: visitRequiredScenes(),
      nameKey: `lg_Scene_BackGround_${sceneId}`,
      monsters: sceneMonsters(sceneId, character.level).map((monster) => ({
        ...monster,
        drops: monsterDrops(monster.id),
      })),
      ticketBoss: ticketBossView(sceneId, character.level, () => tickets),
      npcs: sceneSpawns(sceneId)
        .filter(({ id }) => {
          const row = npc(id)
          return row && !MONSTER_CLASSES.has(String(row.class))
        })
        .map(({ id, x, y, scale }) => ({
          id,
          nameKey: `lg_${npc(id)!.Name}`,
          x,
          y,
          scale,
          menu: npcMenu(id),
          clip: buildingClip(sceneId, id),
        })),
      exploreSpots: exploreSpotIds(sceneId),
      links: sceneLinks(sceneId),
      revive: reviveTerms(character),
    }
  })

  app.post('/fight', { config: { rateLimit: RATE_LIMITS.fight } }, async (request) => {
    const userId = requireUser(request).id
    const { monsterId } = fightSchema.parse(request.body)

    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      requireAlive(character, 'fight again')
      await requireNoTeam(tx, character.id, 'fight monsters')
      await requireBattleFree(tx, character.id)
      const opponent = await fightTarget(tx, character, monsterId)
      // Reborn: a field fight needs energy ("No energy left").
      await spendEnergy(tx, character, ENERGY_RULES.fieldFightCost)

      const result = await fightMonster(tx, character, opponent, undefined, monsterId)
      if (result.won) await recordBossKill(tx, character.id, opponent, character.sceneId)
      if (result.won) await recordHuntKill(tx, character.id, opponent)
      const akatsukiAmbush = result.won ? await rollFieldAmbush(tx, character) : null
      // `rewards` already holds the fight's loot, so hand-ins go in `questRewards`.
      // A quest level-up counts as the fight's own, so the result shows it.
      const handIns = await rookieHandIns(tx, character.id)
      const rewards = {
        ...result.rewards,
        levelsGained: result.rewards.levelsGained + handIns.levelsGained,
      }
      const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
      return {
        ...result,
        rewards,
        completed: handIns.completed,
        questRewards: handIns.rewards,
        ...(akatsukiAmbush && { akatsukiAmbush }),
        character: toCharacter(updated!),
      }
    })
  })

  // TeamStoneNpc.js: the Stone Organization refills HP and MP for Stone (no energy, decision 1).
  app.post('/rest', { config: { rateLimit: RATE_LIMITS.talk } }, async (request) => {
    const userId = requireUser(request).id
    const { npcId } = restSchema.parse(request.body)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const here = sceneSpawns(character.sceneId).some((spawn) => spawn.id === npcId)
      if (!here || npcMenu(npcId) !== 'rest') {
        throw new HttpError(400, 'not_here', 'Nobody offers a rest here.')
      }
      requireAlive(character, 'rest')
      const fighter = await playerFighter(tx, character)
      if (character.hp >= fighter.maxHp && character.mp >= fighter.maxMp) {
        throw new HttpError(400, 'full', 'Your HP and chakra are already full.')
      }
      const cost = restCost(character.level)
      if (character.stone < cost) {
        throw new HttpError(400, 'no_stone', `You need ${cost} Stone to rest.`)
      }
      const [updated] = await tx
        .update(characters)
        .set({ hp: fighter.maxHp, mp: fighter.maxMp, stone: character.stone - cost })
        .where(eq(characters.id, character.id))
        .returning()
      return { cost, character: toCharacter(updated!, fighter) }
    })
  })
}

/**
 * Validates scene membership. Standing ticket bosses spend one proof and use the backup
 * level variant (AttackSystem, LevelAttackRec); listed monster cards need no quest.
 */
async function fightTarget(tx: Tx, character: typeof characters.$inferSelect, monsterId: string) {
  const boss = ticketBoss(character.sceneId)
  if (boss?.npcId === monsterId) {
    const ticket = String(npc(monsterId)!.AttackItemConfig)
    if ((await heldCount(tx, character.id, ticket)) < 1) {
      throw new HttpError(400, 'no_ticket', 'You need a Demon Proof of Suppression to fight it.')
    }
    await removeItems(tx, character.id, ticket, 1)
    return levelVariant(monsterId, character.level)
  }
  const monster = sceneMonsters(character.sceneId, character.level).find((m) => m.id === monsterId)
  if (!monster) throw new HttpError(400, 'not_here', 'That monster is not in this area.')
  return monsterId
}
