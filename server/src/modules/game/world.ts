import { and, eq, isNull, sql } from 'drizzle-orm'
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
  task,
} from '../../game/data.js'
import { loadQuests, removeItems, rookieHandIns, saveQuests, type Tx } from '../../game/progress.js'
import type { QuestProgress } from '../../game/quests.js'
import { HttpError } from '../../http.js'
import { reviveTerms } from './actions.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import {
  bossTaskIds,
  buildingClip,
  levelVariant,
  npcMenu,
  restCost,
  ticketBoss,
  visitRequiredScenes,
} from './field-data.js'
import { RATE_LIMITS } from './rate-limits.js'

const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc'])
const MAX_LISTED_MONSTERS = 6
const MAX_LEVEL_ABOVE_PLAYER = 5
const READY = 1
const BOSS_STEP = 10

const fightSchema = z.object({ monsterId: z.string().regex(/^n\d+$/, 'Unknown monster.') })
const restSchema = z.object({ npcId: z.string().regex(/^n\d+$/) })

/**
 * Why a task boss cannot be fought (TaskSystem / BossRule): `quest` until one of its TaskID quests
 * is held or completed, `never` when none of them exists (decision 8); null when it can.
 */
export function bossLock(monsterId: string, quests: QuestProgress[]): 'quest' | 'never' | null {
  if (npc(monsterId)?.class !== 'TaskBossNpc') return null
  const ids = bossTaskIds(monsterId)
  if (!ids.some((id) => task(id))) return 'never'
  return quests.some((q) => ids.includes(q.taskId)) ? null : 'quest'
}

/** UI_GostList.as: up to 6 monsters, normal ones hidden when more than 5 levels above. */
export function sceneMonsters(sceneId: number, playerLevel: number, quests: QuestProgress[] = []) {
  return sceneSpawns(sceneId)
    .flatMap(({ id }) => {
      const row = npc(id)
      if (!row || !MONSTER_CLASSES.has(String(row.class))) return []
      const level = Number(row.Level)
      if (row.class === 'NormalNpc' && level > playerLevel + MAX_LEVEL_ABOVE_PLAYER) return []
      return [{ id, nameKey: `lg_${row.Name}`, level, lock: bossLock(id, quests) }]
    })
    .slice(0, MAX_LISTED_MONSTERS)
}

async function heldCount(tx: Tx, characterId: string, itemId: string) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.location, 'bag'),
        eq(inventoryItems.characterId, characterId),
        eq(inventoryItems.itemId, itemId),
        isNull(inventoryItems.equippedSlot),
      ),
    )
  return rows.reduce((sum, row) => sum + row.count, 0)
}

/** The scene's ticket boss for the API: the listed boss and the variant fought at this level. */
function ticketBossView(sceneId: number, level: number, tickets: (itemId: string) => number) {
  const boss = ticketBoss(sceneId, new Date())
  if (!boss) return null
  const { npcId, x, y, scale } = boss.slot
  const fightId = levelVariant(npcId, level)
  const ticketItemId = String(npc(npcId)!.AttackItemConfig)
  return {
    id: npcId,
    fightId,
    nameKey: `lg_${npc(npcId)!.Name}`,
    level: Number(npc(fightId)!.Level),
    x,
    y,
    scale,
    active: boss.active,
    startsAt: boss.startsAt,
    endsAt: boss.endsAt,
    ticketItemId,
    ticketNameKey: itemNameKey(ticketItemId),
    tickets: tickets(ticketItemId),
  }
}

/**
 * BossRule (SubTaskType 10): killing the step's monster in its scene counts while the quest item
 * is held; the item is used up when the step completes.
 */
async function recordBossKill(tx: Tx, characterId: string, monsterId: string, sceneId: number) {
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
    const { quests, tickets } = await db.transaction(async (tx) => {
      const boss = ticketBoss(sceneId, new Date())
      const ticketItem = boss ? String(npc(boss.slot.npcId)?.AttackItemConfig) : undefined
      return {
        quests: await loadQuests(tx, character.id),
        tickets: ticketItem ? await heldCount(tx, character.id, ticketItem) : 0,
      }
    })
    return {
      sceneId,
      visitedScenes,
      visitRequired: visitRequiredScenes(),
      nameKey: `lg_Scene_BackGround_${sceneId}`,
      monsters: sceneMonsters(sceneId, character.level, quests).map((monster) => ({
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
      const opponent = await fightTarget(tx, character, monsterId)

      const result = await fightMonster(tx, character, opponent)
      if (result.won) await recordBossKill(tx, character.id, opponent, character.sceneId)
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
 * Checks the monster can be fought here and returns the NPC to fight: a listed monster (task
 * bosses need their quest), or the scene's ticket boss while it is out, which takes one ticket and
 * sends the variant for the player's level (AttackSystem, LevelAttackRec).
 */
async function fightTarget(tx: Tx, character: typeof characters.$inferSelect, monsterId: string) {
  const boss = ticketBoss(character.sceneId, new Date())
  if (boss?.slot.npcId === monsterId) {
    if (!boss.active) throw new HttpError(400, 'boss_away', 'That boss is not here right now.')
    const ticket = String(npc(monsterId)!.AttackItemConfig)
    if ((await heldCount(tx, character.id, ticket)) < 1) {
      throw new HttpError(400, 'no_ticket', 'You need a Demon Proof of Suppression to fight it.')
    }
    await removeItems(tx, character.id, ticket, 1)
    return levelVariant(monsterId, character.level)
  }
  const quests = await loadQuests(tx, character.id)
  const monster = sceneMonsters(character.sceneId, character.level, quests).find(
    (m) => m.id === monsterId,
  )
  if (!monster) throw new HttpError(400, 'not_here', 'That monster is not in this area.')
  if (monster.lock === 'quest') {
    throw new HttpError(400, 'need_quest', 'You need the quest for this boss before you fight it.')
  }
  if (monster.lock === 'never') {
    throw new HttpError(400, 'boss_locked', 'This boss cannot be challenged.')
  }
  return monsterId
}
