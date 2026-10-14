// Las Noches manual and timestamp-driven auto runs. Character locks serialize rewards and Gold.
import {
  createRandom,
  buyLife,
  lasNochesAutoReach,
  LAS_NOCHES_AUTO_COSTS,
  LAS_NOCHES_MIN_LEVEL,
  lifePrice,
  loseFloor,
  startLasNoches,
  startOptions,
  winFloor,
  type LasNochesRun,
} from '@pockie/game-core'
import {
  lasNochesAutoSchema,
  lasNochesStartSchema,
  type LasNochesFightResult,
  type LasNochesView,
} from '@pockie/shared'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { singleGate } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { drawPouch } from '../../game/pouch.js'
import { questCommand, type Tx } from '../../game/progress.js'
import { cardBoxDrop } from '../../game/card-boxes.js'
import { grantPetExp } from '../../game/pets.js'
import { recordWeeklyActivity } from '../events/weekly-activity.js'
import { REBORN_LAS_NOCHES_FLOOR_COMMAND } from '../../game/quests.js'
import { vipExp } from '../../game/vip.js'
import { requireAlive } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { requireNoTeam } from '../teams/index.js'
import {
  bad,
  characterView,
  DEMON_CITY,
  duel,
  grantDrops,
  newSeed,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from './common.js'
import { singleGateData } from './data.js'

type Row = typeof singleGate.$inferSelect

const emptyRow = (characterId: string): Row => ({
  characterId,
  bestFloor: 0,
  currentFloor: null,
  potExp: 0,
  lives: 0,
  livesBought: 0,
  runsDay: null,
  runsToday: 0,
  mode: 0,
  expBonus: 0,
  autoRunsLeft: 0,
  autoRunsBought: 0,
  autoEndFloor: null,
  autoReachFloor: null,
  autoTickAt: null,
  floor50Broadcast: false,
})

async function loadRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx.select().from(singleGate).where(eq(singleGate.characterId, characterId))
  return row ?? emptyRow(characterId)
}

const runsToday = (row: Row) => (row.runsDay === utcDay() ? row.runsToday : 0)

const runOf = (row: Row): LasNochesRun | null =>
  row.currentFloor === null
    ? null
    : { floor: row.currentFloor, pot: row.potExp, lives: row.lives, livesBought: row.livesBought }

type Broadcast = NonNullable<ReturnType<typeof lasNochesFloorBroadcast>>

function view(row: Row, broadcasts: Broadcast[] = []): LasNochesView {
  const { config, floors } = singleGateData()
  const run = runOf(row)
  return {
    broadcasts,
    mode: row.mode,
    auto:
      row.autoRunsLeft > 0
        ? {
            runsLeft: row.autoRunsLeft,
            runsBought: row.autoRunsBought,
            reachFloor: row.autoReachFloor ?? 0,
            nextTickAt:
              row.mode === 1 && row.autoTickAt
                ? new Date(row.autoTickAt.getTime() + 30000).toISOString()
                : null,
          }
        : null,
    bestFloor: row.bestFloor,
    runsLeft: Math.max(0, config.MaxEntryCnt - runsToday(row)),
    maxRuns: config.MaxEntryCnt,
    options: startOptions(row.bestFloor, config),
    run: run && {
      ...run,
      nextNpcId: floors[String(run.floor - 1)]!.npc,
      lifePrice: lifePrice(run.livesBought, config),
    },
  }
}

async function saveRow(tx: Tx, row: Row) {
  const [saved] = await tx
    .insert(singleGate)
    .values(row)
    .onConflictDoUpdate({ target: singleGate.characterId, set: row })
    .returning()
  return saved!
}

const withRun = (row: Row, run: LasNochesRun): Row => ({
  ...row,
  currentFloor: run.floor,
  potExp: run.pot,
  lives: run.lives,
  livesBought: run.livesBought,
})

/** Ends the run: the pot is paid (AddExpNoMul, plus VIP) and the run counts for today. */
function endRun(row: Row, character: CharacterRow, state: Partial<CharacterRow>, pot: number) {
  const paid = vipExp(pot, character)
  const left = Math.max(0, row.autoRunsLeft - 1)
  const ended: Row = {
    ...row,
    mode: left ? row.mode : 0,
    autoRunsLeft: left,
    autoTickAt: left && row.mode === 1 ? row.autoTickAt : null,
    autoReachFloor:
      left && (row.autoReachFloor ?? 0) < row.autoEndFloor!
        ? Math.max(1, Math.min(row.autoEndFloor!, (row.autoReachFloor ?? 0) + randomInt(7) - 3))
        : row.autoReachFloor,
    expBonus: 0,
    currentFloor: left ? 1 : null,
    potExp: 0,
    lives: left ? 1 : 0,
    livesBought: 0,
    runsDay: utcDay(),
    runsToday: runsToday(row) + 1,
  }
  return { ended, paid, ...withExp(character, state, paid) }
}

function requireRun(row: Row) {
  const run = runOf(row)
  if (row.mode === 1) throw bad('auto_active', 'Stop auto mode before playing manually.')
  if (!run) throw bad('no_run', 'You are not in Las Noches.')
  return run
}

/** Travel route should call this while holding the character lock. */
export function canSwitchLasNochesScene(mode: number, from: number, to: number) {
  return mode !== 1 || ![171, 3101].includes(from) || [171, 3101].includes(to)
}

/** Pure message builder; dispatch returned messages after the transaction commits. */
export function lasNochesFloorBroadcast(
  name: string,
  floor: number,
  best: number,
  floor50Sent: boolean,
  nation: string,
  exp: number,
) {
  if (floor === 50 && !floor50Sent)
    return { key: 'SingleGate_231', message: `${name} reached floor 50 of Las Noches.` }
  if (floor === 100)
    return { key: 'SingleGate_232', message: `${name} reached floor 100 of Las Noches.` }
  if (floor === 150)
    return {
      key: 'SingleGate_213',
      message: `${name} of ${nation} reached floor 150 of Las Noches with ${exp} EXP.`,
    }
  if (floor > 150 && floor > best)
    return {
      key: 'SingleGate_303',
      message: `${name} set a new Las Noches record at floor ${floor}.`,
    }
  return null
}

/** M6 decision 29: every 10th floor cleared may drop a Red card box; fight loot, so a full bag loses it. */
const CARD_BOX_FLOOR_STEP = 10
const tenthFloorBoxes = (floor: number) =>
  floor % CARD_BOX_FLOOR_STEP === 0
    ? cardBoxDrop('lasNochesTenthFloor', createRandom(newSeed()))
    : []

async function catchUp(
  tx: Tx,
  character: CharacterRow,
  initial: Row,
  broadcasts: Broadcast[] = [],
  now = new Date(),
) {
  let row = initial
  let current = character
  let ticks =
    row.mode === 1 && row.autoTickAt
      ? Math.min(480, Math.floor((now.getTime() - row.autoTickAt.getTime()) / 30000))
      : 0
  const { floors } = singleGateData()
  let cleared = false
  const boxes: ReturnType<typeof tenthFloorBoxes> = []
  while (ticks-- > 0 && row.mode === 1) {
    const floor = row.currentFloor!
    if (floor <= (row.autoReachFloor ?? 0)) {
      cleared = true
      boxes.push(...tenthFloorBoxes(floor))
      const message = lasNochesFloorBroadcast(
        character.name,
        floor,
        row.bestFloor,
        row.floor50Broadcast,
        ['Fire', 'Water', 'Earth', 'Wind', 'Lightning'][character.nation] ?? 'Unknown',
        row.potExp + floors[String(floor - 1)]!.exp + row.expBonus,
      )
      if (message) broadcasts.push(message)
    }
    row = {
      ...row,
      autoTickAt: new Date(row.autoTickAt!.getTime() + 30000),
      potExp:
        row.potExp + (floor <= (row.autoReachFloor ?? 0) ? floors[String(floor - 1)]!.exp : 0),
      bestFloor: Math.max(row.bestFloor, Math.min(floor, row.autoReachFloor ?? 0)),
      floor50Broadcast:
        row.floor50Broadcast || (floor === 50 && floor <= (row.autoReachFloor ?? 0)),
    }
    if (floor >= (row.autoReachFloor ?? 0)) {
      const ending = endRun(row, current, {}, row.potExp + row.expBonus)
      await saveCharacter(tx, current.id, ending.update)
      await grantPetExp(tx, current.id, ending.paid)
      current = { ...current, ...ending.update }
      row = ending.ended
      // A successful final replay returns control at floor 161, as SGateType 2 does.
      if (
        row.autoRunsLeft === 0 &&
        row.autoReachFloor === row.autoEndFloor &&
        floor === row.autoEndFloor
      ) {
        row = { ...row, mode: 2, currentFloor: floor + 1, lives: 1 }
      }
    } else row = { ...row, currentFloor: floor + 1 }
  }
  if (cleared) {
    await grantDrops(tx, character.id, boxes)
    await questCommand(tx, character, REBORN_LAS_NOCHES_FLOOR_COMMAND)
    await recordWeeklyActivity(tx, character.id, 'lasNoches', now)
  }
  return saveRow(tx, row)
}

export async function lasNochesRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/las-noches', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    return withCharacter(db, request, async (tx, character) => {
      const broadcasts: Broadcast[] = []
      const row = await catchUp(tx, character, await loadRow(tx, character.id), broadcasts)
      return { ...view(row, broadcasts), character: await characterView(tx, character.id) }
    })
  })

  app.post('/las-noches/auto', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { runs } = lasNochesAutoSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character) => {
      let row = await loadRow(tx, character.id)
      if (row.mode === 1) throw bad('auto_active', 'Auto mode is already running.')
      if (character.sceneId !== 171 && character.sceneId !== 3101)
        throw bad('not_here', 'Enter Las Noches from Demon City.')
      await requireNoTeam(tx, character.id, 'enter Las Noches')
      if (character.level < LAS_NOCHES_MIN_LEVEL)
        throw bad('too_low', 'You need level 13 to enter Las Noches.')
      if ((row.currentFloor ?? 1) > 160) throw bad('auto_floor', 'Auto mode ends at floor 160.')
      if (row.autoRunsLeft > 0) {
        row = { ...row, mode: 1, autoTickAt: new Date() }
      } else {
        const { config, floors } = singleGateData()
        if (runsToday(row) + runs > config.MaxEntryCnt)
          throw bad('daily_limit', 'You do not have enough runs left today.')
        const price = LAS_NOCHES_AUTO_COSTS[runs - 1]!
        if (character.gold < price) throw bad('no_gold', 'You do not have enough Gold.')
        const start = row.currentFloor ?? 1
        if (start > 160) throw bad('auto_floor', 'Auto mode ends at floor 160.')
        const fighter = await playerFighter(tx, character)
        const wins = async (floor: number) =>
          (
            await duel(tx, { ...character, hp: fighter.maxHp, mp: fighter.maxMp }, [
              floors[String(floor - 1)]!.npc,
            ])
          ).won
        const low = await lasNochesAutoReach(start, 160, wins)
        row = {
          ...row,
          currentFloor: start,
          lives: row.currentFloor === null ? 1 : row.lives,
          mode: 1,
          autoRunsLeft: runs,
          autoRunsBought: runs,
          autoEndFloor: 160,
          autoReachFloor: low || null,
          autoTickAt: new Date(),
        }
        await saveCharacter(tx, character.id, { gold: character.gold - price })
      }
      return {
        lasNoches: view(await saveRow(tx, row)),
        character: await characterView(tx, character.id),
      }
    })
  })
  app.post('/las-noches/auto-stop', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      const broadcasts: Broadcast[] = []
      const row = await catchUp(tx, character, await loadRow(tx, character.id), broadcasts)
      return {
        lasNoches: view(
          await saveRow(tx, { ...row, mode: row.currentFloor === null ? 0 : 2, autoTickAt: null }),
          broadcasts,
        ),
        character: await characterView(tx, character.id),
      }
    }),
  )

  app.post('/las-noches/start', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { mode } = lasNochesStartSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character) => {
      if (character.sceneId !== DEMON_CITY)
        throw bad('not_here', 'Talk to Kisuke Urahara in Demon City to enter Las Noches.')
      await requireNoTeam(tx, character.id, 'enter Las Noches')
      if (character.level < LAS_NOCHES_MIN_LEVEL)
        throw bad('too_low', `You need level ${LAS_NOCHES_MIN_LEVEL} to enter Las Noches.`)
      const row = await loadRow(tx, character.id)
      if (runOf(row)) throw bad('run_active', 'You are already in Las Noches.')
      const { config } = singleGateData()
      if (runsToday(row) >= config.MaxEntryCnt)
        throw bad('daily_limit', 'You cannot enter Las Noches any more today.')
      const run = startLasNoches(mode, row.bestFloor, config)
      const stone = startOptions(row.bestFloor, config)[mode]!.stone
      if (character.stone < stone) throw bad('no_stone', 'You do not have enough Stone.')
      await saveCharacter(tx, character.id, { stone: character.stone - stone })
      const saved = await saveRow(tx, { ...withRun(row, run), mode: 2 })
      return { lasNoches: view(saved), character: await characterView(tx, character.id) }
    })
  })

  app.post('/las-noches/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<LasNochesFightResult> => {
      requireAlive(character, 'fight')
      const row = await loadRow(tx, character.id)
      const run = requireRun(row)
      const { config, floors } = singleGateData()
      const npcId = floors[String(run.floor - 1)]!.npc
      const { replay, won, hp, mp, maxHp, maxMp } = await duel(tx, character, [npcId])
      const broadcasts: Broadcast[] = []
      let state: Partial<CharacterRow>
      let next: Row
      let pot: number | null = null
      let paid: number | null = null
      let levelsGained = 0
      let boxes: Awaited<ReturnType<typeof grantDrops>> = []
      let lost = 0
      if (won) {
        // Pouches refill after a win.
        const hpDraw = drawPouch(hp, maxHp, character.hpPouch)
        const mpDraw = drawPouch(mp, maxMp, character.mpPouch)
        state = { hp: hpDraw.value, mp: mpDraw.value, hpPouch: hpDraw.pouch, mpPouch: mpDraw.pouch }
        const outcome = winFloor(run, row.bestFloor, floors, config)
        const message = lasNochesFloorBroadcast(
          character.name,
          run.floor,
          row.bestFloor,
          row.floor50Broadcast,
          ['Fire', 'Water', 'Earth', 'Wind', 'Lightning'][character.nation] ?? 'Unknown',
          outcome.run.pot + row.expBonus,
        )
        if (message) broadcasts.push(message)
        next = {
          ...withRun(row, outcome.run),
          bestFloor: outcome.best,
          floor50Broadcast: row.floor50Broadcast || run.floor === 50,
        }
        if (outcome.ended) pot = outcome.run.pot
        await questCommand(tx, character, REBORN_LAS_NOCHES_FLOOR_COMMAND)
        await recordWeeklyActivity(tx, character.id, 'lasNoches')
        const dropped = tenthFloorBoxes(run.floor)
        boxes = await grantDrops(tx, character.id, dropped)
        lost = dropped.length - boxes.length
      } else {
        // A loss refills HP and MP; without a life the pot is halved and the run ends.
        state = { hp: maxHp, mp: maxMp }
        const outcome = loseFloor(run)
        next = withRun(row, outcome.run)
        if (outcome.ended) pot = outcome.run.pot
      }
      if (pot !== null) {
        const ending = endRun(next, character, state, pot + next.expBonus)
        next = ending.ended
        state = ending.update
        paid = ending.paid
        levelsGained = ending.levelsGained
      }
      await saveCharacter(tx, character.id, state)
      // M6 decision 12: the active pet shares the pot EXP paid.
      if (paid) await grantPetExp(tx, character.id, paid)
      const saved = await saveRow(tx, next)
      return {
        replay,
        won,
        npcIds: [npcId],
        rewards: {
          exp: paid ?? 0,
          stone: 0,
          items: boxes,
          levelsGained,
          ...(lost > 0 && { lost }),
        },
        potPaid: paid,
        lasNoches: view(saved, broadcasts),
        character: await characterView(tx, character.id),
      }
    }),
  )

  app.post('/las-noches/buy-life', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      const row = await loadRow(tx, character.id)
      const run = requireRun(row)
      const { config } = singleGateData()
      const price = lifePrice(run.livesBought, config)
      const bought = buyLife(run, config)
      if (character.gold < price) throw bad('no_gold', 'You do not have enough Gold.')
      await saveCharacter(tx, character.id, { gold: character.gold - price })
      const saved = await saveRow(tx, withRun(row, bought))
      return { lasNoches: view(saved), character: await characterView(tx, character.id) }
    }),
  )

  app.post('/las-noches/withdraw', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      const row = await loadRow(tx, character.id)
      const run = requireRun(row)
      const { ended, paid, update, levelsGained } = endRun(
        row,
        character,
        {},
        run.pot + row.expBonus,
      )
      await saveCharacter(tx, character.id, update)
      await grantPetExp(tx, character.id, paid)
      const saved = await saveRow(tx, ended)
      return {
        potPaid: paid,
        levelsGained,
        lasNoches: view(saved),
        character: await characterView(tx, character.id),
      }
    }),
  )
}
