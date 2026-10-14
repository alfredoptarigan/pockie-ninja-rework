// Toll gates (TollGateSystem.java): the guard menu with today's tries, entry, the ordered point
// fights, leaving, and the crystal exchange. The card flip is in cards.ts; a team member's entry,
// fights and exit go to the team runs (teams/runs.ts).
import {
  CARD_NONE,
  createRandom,
  currentPoint,
  dealCards,
  entryRefusal,
  gateLayout,
  isCleared,
  peekCost,
  restoreAfterWin,
  startRun,
  winPoint,
  type CardState,
  type EntryRefusal,
  type RunState,
} from '@pockie/game-core'
import {
  enterGateSchema,
  gateExchangeSchema,
  type CardsView,
  type GateExchange,
  type GateRewards,
  type GateRunView,
  type GatesView,
  type GateTier,
  type TollGateFightResult,
} from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { recordWeeklyActivity } from '../events/weekly-activity.js'
import { tollGateRuns } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { removeItems, type Tx } from '../../game/progress.js'
import { rewardExp } from '../../game/nonfight-buffs.js'
import { vipDropMul } from '../../game/vip.js'
import { HttpError } from '../../http.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { recordTollGateProgress, tollGateProgress } from '../rankings/toll-gate-weekly.js'
import { requireNoTeam } from '../teams/index.js'
import {
  bad,
  bagFits,
  characterView,
  countItem,
  DEMON_CITY,
  duel,
  grantDrops,
  grantItems,
  hasWeapon,
  lastNpcRewards,
  newSeed,
  requireBagRoom,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from './common.js'
import { cardConfig, cardLib, gateExchanges, tollGateConfig, tollGateTables } from './data.js'

export type RunRow = typeof tollGateRuns.$inferSelect

const TIERS: Record<string, GateTier> = { '1': 'hard', '2': 'normal', '3': 'pass' }

export const REFUSALS: Record<EntryRefusal, string> = {
  no_tries: 'You have used all of today’s toll gate tries.',
  too_low: 'Your level is too low for this toll gate.',
  missing_item: 'You need the entry item for this toll gate.',
  no_weapon: 'Equip a weapon before entering a toll gate.',
  low_hp: 'You need more than 90% HP to enter a toll gate.',
}

export const triesUsed = (character: CharacterRow, now = new Date()) =>
  character.tollGateDay === utcDay(now) ? character.tollGateEntries : 0

const requiredItem = (gateId: number) => {
  const value = tollGateTables().gates[String(gateId)]?.RequireItemConfig
  return typeof value === 'string' && value !== '0' ? value : null
}

export const runState = (row: RunRow): RunState => ({
  gateId: row.gateId,
  subGate: row.subGate,
  point: row.point,
  passedPoint: row.passedPoint,
  lost: row.lost,
})

export function cardsView(row: RunRow): CardsView | null {
  if (row.cardState === CARD_NONE) return null
  const { ShowAllCap, ExchangeCap } = tollGateConfig().cards
  const config = cardConfig(row.gateId)
  return {
    state: row.cardState as CardState,
    cards: row.cards.map(({ itemId, count, bound, revealed }) =>
      revealed ? { itemId, count, bound } : null,
    ),
    peeks: row.peeks,
    peekCost: config ? peekCost(config, row.peeks, row.cardState as CardState) : null,
    showAllCost: ShowAllCap,
    redealCost: ExchangeCap,
  }
}

export function runView(row: RunRow): GateRunView {
  const layout = gateLayout(row.gateId, tollGateTables())
  const state = runState(row)
  const cleared = isCleared(state, layout)
  return {
    gateId: row.gateId,
    subGate: row.subGate,
    point: row.point,
    points: layout.map((sub) => sub.length),
    passedPoint: row.passedPoint,
    cleared,
    nextNpcIds: cleared ? null : layout[row.subGate]![row.point]!.npcIds,
    cards: cardsView(row),
  }
}

/** Why `character` may not enter `gateId` (the solo checks every team member passes too). */
export async function entryRefusalOf(tx: Tx, character: CharacterRow, gateId: number) {
  const itemId = requiredItem(gateId)
  const fighter = await playerFighter(tx, character)
  return entryRefusal({
    level: character.level,
    triesUsed: triesUsed(character),
    maxTries: tollGateConfig().props.EntryTollGateMaxTimes,
    minLevel: tollGateTables().gates[String(gateId)]!.RequirMinLevel,
    hasItem: !itemId || (await countItem(tx, character.id, itemId)) > 0,
    hasWeapon: await hasWeapon(tx, character.id),
    hp: character.hp,
    maxHp: fighter.maxHp,
  })
}

/** Spends the entry item and a try and starts the run (one row per team member). */
export async function payEntry(
  tx: Tx,
  character: CharacterRow,
  gateId: number,
  teamId: string | null = null,
) {
  const itemId = requiredItem(gateId)
  if (itemId) await removeItems(tx, character.id, itemId, 1)
  await saveCharacter(tx, character.id, {
    tollGateDay: utcDay(),
    tollGateEntries: triesUsed(character) + 1,
  })
  const [row] = await tx
    .insert(tollGateRuns)
    .values({ characterId: character.id, ...startRun(gateId), teamId })
    .returning()
  return row!
}

/**
 * A won point for one ninja: restore, the last NPC's kill reward, the sub gate and gate rewards
 * (plus the captain bonus from CaptianMul on those two), the next point or the dealt cards, and
 * the weekly rank progress. Every team member gets this in full (teams.md 4.2).
 */
export async function winForMember(
  tx: Tx,
  character: CharacterRow,
  row: RunRow,
  state: { hp: number; mp: number; maxHp: number; maxMp: number },
  lastNpcId: string,
  outcome: ReturnType<typeof winPoint>,
  captainMul?: { ExpMul: number; MoneyMul: number },
) {
  const restored = restoreAfterWin(state, tollGateConfig().props)
  const kill = lastNpcRewards(lastNpcId, vipDropMul(character))
  const gateExp = (outcome.subGateReward?.exp ?? 0) + (outcome.gateReward?.exp ?? 0)
  const gateStone = (outcome.subGateReward?.stone ?? 0) + (outcome.gateReward?.stone ?? 0)
  const bonus = {
    exp: Math.trunc((gateExp * (captainMul?.ExpMul ?? 0)) / 100),
    stone: Math.trunc((gateStone * (captainMul?.MoneyMul ?? 0)) / 100),
  }
  const rewards: GateRewards = {
    exp: (await rewardExp(tx, character, kill.exp + gateExp)) + bonus.exp,
    stone: kill.stone + gateStone + bonus.stone,
    items: [],
    levelsGained: 0,
  }
  const { update, levelsGained } = withExp(character, restored, rewards.exp)
  rewards.levelsGained = levelsGained
  rewards.items = await grantDrops(tx, character.id, kill.items)
  if (rewards.items.length < kill.items.length)
    rewards.lost = kill.items.length - rewards.items.length
  await saveCharacter(tx, character.id, { ...update, stone: character.stone + rewards.stone })
  const flip = outcome.cleared
    ? dealCards(cardLib(row.gateId), createRandom(newSeed()))
    : { state: row.cardState, cards: row.cards, peeks: row.peeks }
  const [run] = await tx
    .update(tollGateRuns)
    .set({
      subGate: outcome.run.subGate,
      point: outcome.run.point,
      passedPoint: outcome.run.passedPoint,
      cardState: flip.state,
      cards: flip.cards,
      peeks: flip.peeks,
    })
    .where(eq(tollGateRuns.characterId, character.id))
    .returning()
  if (outcome.run.passedPoint !== null) {
    const points = gateLayout(row.gateId, tollGateTables()).reduce((n, sub) => n + sub.length, 0)
    const progress = tollGateProgress(outcome.run.passedPoint, points)
    await recordTollGateProgress(tx, character.id, row.gateId, progress, new Date())
  }
  if (outcome.cleared) await recordWeeklyActivity(tx, character.id, 'tollGate')
  return { rewards, run: run!, ...((bonus.exp > 0 || bonus.stone > 0) && { bonus }) }
}

export async function loadRun(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(tollGateRuns)
    .where(eq(tollGateRuns.characterId, characterId))
  return row
}

export async function requireRun(tx: Tx, characterId: string) {
  const row = await loadRun(tx, characterId)
  if (!row) throw bad('no_run', 'You are not in a toll gate.')
  return row
}

function exchangeList(): GateExchange[] {
  return Object.entries(gateExchanges()).map(([id, row]) => ({
    id: Number(id),
    srcItemId: row.SrcItemCfg,
    srcCount: row.SrcCount,
    commonItemId: typeof row.CommonSrcItemCfg === 'string' ? row.CommonSrcItemCfg : null,
    destItemId: row.DestItemCfg,
    destCount: row.DestCount,
  }))
}

function gateList() {
  return Object.entries(tollGateTables().gates)
    .map(([id, gate]) => ({
      id: Number(id),
      nameKey: `lg_${gate.TollGateName}`,
      bossNameKey: `lg_${gate.BossName}`,
      tier: TIERS[String(gate.Hard)] ?? 'tutorial',
      minLevel: gate.RequirMinLevel,
      maxLevel: gate.RequirMaxLevel,
      subGates: gateLayout(Number(id), tollGateTables()).length,
      itemId: requiredItem(Number(id)),
    }))
    .sort((a, b) => a.id - b.id)
}

export async function tollGateRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request): Promise<GatesView> => {
    const character = await characterOf(db, requireUser(request).id)
    const run = await loadRun(db, character.id)
    const maxTries = tollGateConfig().props.EntryTollGateMaxTimes
    return {
      triesLeft: Math.max(0, maxTries - triesUsed(character)),
      maxTries,
      gates: gateList(),
      run: run ? runView(run) : null,
      exchanges: exchangeList(),
    }
  })

  app.post('/enter', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { gateId } = enterGateSchema.parse(request.body)
    const gate = tollGateTables().gates[String(gateId)]
    if (!gate || gateLayout(gateId, tollGateTables()).length === 0) {
      throw new HttpError(404, 'unknown_gate', 'There is no such toll gate.')
    }
    return withCharacter(db, request, async (tx, character) => {
      if (character.sceneId !== DEMON_CITY)
        throw bad('not_here', 'Talk to the Demon City Guard to enter a toll gate.')
      // Joined a team since the look-up above: the captain enters for the team.
      await requireNoTeam(tx, character.id, 'enter a toll gate alone')
      if (await loadRun(tx, character.id))
        throw bad('run_active', 'You are already in a toll gate.')
      const refusal = await entryRefusalOf(tx, character, gateId)
      if (refusal) throw bad(refusal, REFUSALS[refusal])
      const row = await payEntry(tx, character, gateId)
      return { run: runView(row), character: await characterView(tx, character.id) }
    })
  })

  app.post('/run/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<TollGateFightResult> => {
      // A lost duel leaves 1 HP: without this a defeated ninja would skip the revive cost.
      requireAlive(character, 'fight')
      const row = await requireRun(tx, character.id)
      const tables = tollGateTables()
      const layout = gateLayout(row.gateId, tables)
      const point = currentPoint(runState(row), layout)
      const { replay, won, hp, mp, maxHp, maxMp } = await duel(tx, character, point.npcIds)
      const rewards: TollGateFightResult['rewards'] = {
        exp: 0,
        stone: 0,
        items: [],
        levelsGained: 0,
      }

      if (!won) {
        // OnFightLost: HP 1; the run only ends (no retry, the try is spent).
        await tx.delete(tollGateRuns).where(eq(tollGateRuns.characterId, character.id))
        await saveCharacter(tx, character.id, { hp: 1, mp })
        return {
          replay,
          won,
          npcIds: point.npcIds,
          rewards,
          run: null,
          character: await characterView(tx, character.id),
        }
      }

      const outcome = winPoint(runState(row), layout, tables)
      const lastNpcId = point.npcIds[point.npcIds.length - 1]!
      const state = { hp, mp, maxHp, maxMp }
      const next = await winForMember(tx, character, row, state, lastNpcId, outcome)
      return {
        replay,
        won,
        npcIds: point.npcIds,
        rewards: next.rewards,
        run: runView(next.run),
        character: await characterView(tx, character.id),
      }
    }),
  )

  // OnCustomExitTollGate ends the run; with cards on the table a random one is granted (the
  // original grants one on disconnect), when it fits in the bag.
  app.post('/run/exit', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      const row = await requireRun(tx, character.id)
      await tx.delete(tollGateRuns).where(eq(tollGateRuns.characterId, character.id))
      let card = null
      if (row.cardState !== CARD_NONE && row.cards.length > 0) {
        const picked = row.cards[createRandom(newSeed()).int(row.cards.length)]!
        const awards = Array.from({ length: picked.count }, () => ({
          itemId: picked.itemId,
          bound: picked.bound,
        }))
        if (await bagFits(tx, character.id, awards)) {
          await grantItems(tx, character.id, awards)
          card = { itemId: picked.itemId, count: picked.count, bound: picked.bound }
        }
      }
      return { card, character: await characterView(tx, character.id) }
    }),
  )

  // ExchangeMagicBox: SrcCount crystals (the common crystal fills any part) for the destination.
  app.post('/exchange', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { exchangeId } = gateExchangeSchema.parse(request.body)
    const row = gateExchanges()[String(exchangeId)]
    if (!row) throw new HttpError(404, 'unknown_exchange', 'There is no such exchange.')
    return withCharacter(db, request, async (tx, character) => {
      if (character.sceneId !== DEMON_CITY)
        throw bad('not_here', 'Talk to the Demon City Guard to convert crystals.')
      const common = typeof row.CommonSrcItemCfg === 'string' ? row.CommonSrcItemCfg : null
      const own = await countItem(tx, character.id, row.SrcItemCfg)
      const commonOwned = common ? await countItem(tx, character.id, common) : 0
      if (own + commonOwned < row.SrcCount)
        throw bad('missing_item', 'You do not have enough crystals.')
      const fromOwn = Math.min(own, row.SrcCount)
      // Bound crystals give a bound result, so an exchange cannot make a bound item tradable.
      let bound = await removeItems(tx, character.id, row.SrcItemCfg, fromOwn)
      if (common && row.SrcCount > fromOwn)
        bound = (await removeItems(tx, character.id, common, row.SrcCount - fromOwn)) || bound
      const awards = Array.from({ length: row.DestCount }, () => ({
        itemId: row.DestItemCfg,
        bound,
      }))
      await requireBagRoom(tx, character.id, awards)
      await grantItems(tx, character.id, awards)
      return { items: awards, character: await characterView(tx, character.id) }
    })
  })
}
