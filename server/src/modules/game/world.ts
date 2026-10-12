import { randomInt } from 'node:crypto'
import {
  createRandom,
  deriveStats,
  gainExp,
  rollDrops,
  simulateFight,
  type DropEntry,
  type DropLib,
  type FighterInput,
} from '@pockie/game-core'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'
import {
  avatarStats,
  dropItems,
  dropLib,
  exploreSpotIds,
  item,
  levels,
  npc,
  sceneLinks,
  sceneSpawns,
} from '../../game/data.js'
import { grantItems, saveQuests, type Tx } from '../../game/progress.js'
import { questItemDrops, recordCollect, recordKill, type QuestProgress } from '../../game/quests.js'
import { HttpError } from '../../http.js'
import { requireUser, toCharacter } from './characters.js'

type CharacterRow = typeof characters.$inferSelect

const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc'])
const MAX_LISTED_MONSTERS = 6
const MAX_LEVEL_ABOVE_PLAYER = 5
// ponytail: the original revive rules (ReliveSystem) are not ported; a lost fight leaves 1 HP.
const HP_AFTER_DEFEAT = 1

const fightSchema = z.object({ monsterId: z.string().regex(/^n\d+$/, 'Unknown monster.') })

/** UI_GostList.as: up to 6 monsters, normal ones hidden when more than 5 levels above. */
export function sceneMonsters(sceneId: number, playerLevel: number) {
  return sceneSpawns(sceneId)
    .flatMap(({ id }) => {
      const row = npc(id)
      if (!row || !MONSTER_CLASSES.has(String(row.class))) return []
      const level = Number(row.Level)
      if (row.class === 'NormalNpc' && level > playerLevel + MAX_LEVEL_ABOVE_PLAYER) return []
      return [{ id, nameKey: `lg_${row.Name}`, level }]
    })
    .slice(0, MAX_LISTED_MONSTERS)
}

function monsterFighter(id: string): FighterInput {
  const row = npc(id)!
  const n = (key: string) => Number(row[key] ?? 0)
  return {
    name: `lg_${row.Name}`,
    level: n('Level'),
    hp: n('HP'),
    maxHp: n('MaxHP'),
    mp: n('MP'),
    maxMp: n('MaxMP'),
    minAttack: n('MinAtk'),
    maxAttack: n('MaxAtk'),
    atkTime: n('AtkTime'),
    hit: n('HitMul'),
    dodge: n('DodgeMul'),
    crit: n('CritMul'),
    critAttach: n('CritAttach'),
    tough: n('Tough'),
    parry: n('ParryMul'),
    pierce: n('Pierce'),
    defense: n('Defense'),
    neglectDefense: n('NeglectDefAttach'),
    counter: n('CounterMul'),
    priority: n('PriorityMul'),
  }
}

async function playerFighter(tx: Tx, character: CharacterRow): Promise<FighterInput> {
  const equipped = await tx
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.characterId, character.id), isNotNull(inventoryItems.equippedSlot)),
    )
  const bonus = { minAttack: 0, maxAttack: 0, defense: 0 }
  for (const { itemId } of equipped) {
    const row = item(itemId)
    bonus.minAttack += Number(row?.AttackMin ?? 0)
    bonus.maxAttack += Number(row?.AttackMax ?? 0)
    bonus.defense += Number(row?.Defense ?? 0)
  }
  const stats = deriveStats(avatarStats(character.avatarId), character.level, bonus)
  return {
    ...stats,
    name: character.name,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    neglectDefense: 0,
    tough: 0,
    pierce: 0,
    priority: 0,
  }
}

export async function worldRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function characterOf(userId: string, tx: Tx | Db = db) {
    const [row] = await tx.select().from(characters).where(eq(characters.userId, userId))
    if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
    return row
  }

  app.get('/scene', async (request) => {
    const character = await characterOf(requireUser(request).id)
    const sceneId = character.sceneId
    return {
      sceneId,
      nameKey: `lg_Scene_BackGround_${sceneId}`,
      monsters: sceneMonsters(sceneId, character.level),
      npcs: sceneSpawns(sceneId)
        .filter(({ id }) => {
          const row = npc(id)
          return row && !MONSTER_CLASSES.has(String(row.class))
        })
        .map(({ id, x, y, scale }) => ({ id, nameKey: `lg_${npc(id)!.Name}`, x, y, scale })),
      exploreSpots: exploreSpotIds(sceneId),
      links: sceneLinks(sceneId),
    }
  })

  app.post(
    '/fight',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = requireUser(request).id
      const { monsterId } = fightSchema.parse(request.body)

      return db.transaction(async (tx) => {
        const character = await characterOf(userId, tx)
        if (!sceneMonsters(character.sceneId, character.level).some((m) => m.id === monsterId)) {
          throw new HttpError(400, 'not_here', 'That monster is not in this area.')
        }
        if (character.hp <= 0) throw new HttpError(400, 'no_hp', 'Heal before you fight again.')

        const seed = randomInt(2 ** 31)
        const replay = simulateFight({
          attackers: [await playerFighter(tx, character)],
          defenders: [monsterFighter(monsterId)],
          seed,
        })
        const won = replay.winner === 'attackers'
        const rewards = {
          exp: 0,
          stone: 0,
          items: [] as { itemId: string; bound: boolean }[],
          levelsGained: 0,
        }
        let { level, exp } = character
        let hp = won ? replay.fighters[0]!.hp : HP_AFTER_DEFEAT

        if (won) {
          const monster = npc(monsterId)!
          const random = createRandom(seed ^ 0x5eed)
          rewards.exp = Number(monster.NpcExp ?? 0)
          rewards.stone = random.between(
            Number(monster.DropCapital0Min ?? 0),
            Number(monster.DropCapital0Max ?? 0),
          )
          for (const libId of [monster.DropLibID, monster.AppendDropLibID].map(Number)) {
            const lib = libId > 0 ? dropLib(libId) : undefined
            if (lib) {
              rewards.items.push(
                ...rollDrops(
                  lib as unknown as DropLib,
                  dropItems(libId) as unknown as DropEntry[],
                  random,
                ),
              )
            }
          }

          const table = levels()
          const gained = gainExp(level, exp, rewards.exp, table.levelexp, table.role.maxlevel)
          rewards.levelsGained = gained.levelsGained
          level = gained.level
          exp = gained.exp
          if (gained.levelsGained > 0)
            hp = deriveStats(avatarStats(character.avatarId), level).maxHp

          const quests = await tx
            .select()
            .from(characterQuests)
            .where(eq(characterQuests.characterId, character.id))
          let progress: QuestProgress[] = quests
          const kills = recordKill(progress, monsterId, character.sceneId)
          const questItems = questItemDrops(progress, monsterId, character.sceneId, random)
          progress = progress.map((q) => kills.find((k) => k.taskId === q.taskId) ?? q)
          let collected: QuestProgress[] = []
          for (const questItem of questItems) {
            rewards.items.push({ itemId: questItem, bound: true })
            collected = recordCollect(progress, questItem)
            progress = progress.map((q) => collected.find((c) => c.taskId === q.taskId) ?? q)
          }
          await saveQuests(
            tx,
            character.id,
            progress.filter((q) => kills.includes(q) || collected.includes(q)),
          )
          await grantItems(tx, character.id, rewards.items)
        }

        const [updated] = await tx
          .update(characters)
          .set({ hp, level, exp, stone: character.stone + rewards.stone })
          .where(eq(characters.id, character.id))
          .returning()
        return { replay, won, rewards, character: toCharacter(updated!) }
      })
    },
  )
}
