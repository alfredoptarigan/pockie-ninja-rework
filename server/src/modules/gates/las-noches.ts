// Las Noches manual mode (SingleGateSystem.java) under /las-noches: start (floor 1 or 50%),
// one duel per floor, the EXP pot, lives, withdraw. Runs count when they end.
import {
  buyLife,
  LAS_NOCHES_MIN_LEVEL,
  lifePrice,
  loseFloor,
  startLasNoches,
  startOptions,
  winFloor,
  type LasNochesRun,
} from '@pockie/game-core'
import { lasNochesStartSchema, type LasNochesFightResult, type LasNochesView } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { singleGate } from '../../db/schema.js'
import { drawPouch } from '../../game/pouch.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  DEMON_CITY,
  duel,
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

function view(row: Row): LasNochesView {
  const { config, floors } = singleGateData()
  const run = runOf(row)
  return {
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

/** Ends the run: the pot is paid (AddExpNoMul) and the run counts for today. */
function endRun(row: Row, character: CharacterRow, state: Partial<CharacterRow>, pot: number) {
  const ended: Row = {
    ...row,
    currentFloor: null,
    potExp: 0,
    lives: 0,
    livesBought: 0,
    runsDay: utcDay(),
    runsToday: runsToday(row) + 1,
  }
  return { ended, ...withExp(character, state, pot) }
}

function requireRun(row: Row) {
  const run = runOf(row)
  if (!run) throw bad('no_run', 'You are not in Las Noches.')
  return run
}

export async function lasNochesRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/las-noches', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return view(await loadRow(db, character.id))
  })

  app.post('/las-noches/start', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { mode } = lasNochesStartSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character) => {
      if (character.sceneId !== DEMON_CITY)
        throw bad('not_here', 'Talk to Kisuke Urahara in Demon City to enter Las Noches.')
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
      const saved = await saveRow(tx, withRun(row, run))
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
      let state: Partial<CharacterRow>
      let next: Row
      let pot: number | null = null
      let levelsGained = 0
      if (won) {
        // Pouches refill after a win.
        const hpDraw = drawPouch(hp, maxHp, character.hpPouch)
        const mpDraw = drawPouch(mp, maxMp, character.mpPouch)
        state = { hp: hpDraw.value, mp: mpDraw.value, hpPouch: hpDraw.pouch, mpPouch: mpDraw.pouch }
        const outcome = winFloor(run, row.bestFloor, floors, config)
        next = { ...withRun(row, outcome.run), bestFloor: outcome.best }
        if (outcome.ended) pot = outcome.run.pot
      } else {
        // A loss refills HP and MP; without a life the pot is halved and the run ends.
        state = { hp: maxHp, mp: maxMp }
        const outcome = loseFloor(run)
        next = withRun(row, outcome.run)
        if (outcome.ended) pot = outcome.run.pot
      }
      if (pot !== null) {
        const ending = endRun(next, character, state, pot)
        next = ending.ended
        state = ending.update
        levelsGained = ending.levelsGained
      }
      await saveCharacter(tx, character.id, state)
      const saved = await saveRow(tx, next)
      return {
        replay,
        won,
        npcIds: [npcId],
        rewards: { exp: pot ?? 0, stone: 0, items: [], levelsGained },
        potPaid: pot,
        lasNoches: view(saved),
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
      const { ended, update, levelsGained } = endRun(row, character, {}, run.pot)
      await saveCharacter(tx, character.id, update)
      const saved = await saveRow(tx, ended)
      return {
        potPaid: run.pot,
        levelsGained,
        lasNoches: view(saved),
        character: await characterView(tx, character.id),
      }
    }),
  )
}
