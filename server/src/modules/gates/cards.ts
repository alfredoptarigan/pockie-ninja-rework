// The card flip after a clear (TGCardSystem.java): show all, shuffle, re-deal, peek, take.
// Paid steps take Gold or Gift Coupons; taking ends the run.
import {
  createRandom,
  peekCard,
  peekCost,
  redeal,
  showAll,
  shuffleCards,
  takeCard,
  type CardFlip,
  type CardState,
} from '@pockie/game-core'
import { cardPaySchema, cardPeekSchema, cardTakeSchema, type CardTakeResult } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { tollGateRuns } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  grantItems,
  newSeed,
  requireBagRoom,
  saveCharacter,
  withCharacter,
  type CharacterRow,
} from './common.js'
import { cardConfig, cardLib, tollGateConfig } from './data.js'
import { requireRun, runView, type RunRow } from './toll-gates.js'

type Currency = 'gold' | 'giftCoupon'
const CURRENCY_NAMES: Record<Currency, string> = { gold: 'Gold', giftCoupon: 'Gift Coupons' }

const flipOf = (row: RunRow): CardFlip => ({
  state: row.cardState as CardState,
  cards: row.cards,
  peeks: row.peeks,
})

async function pay(tx: Tx, character: CharacterRow, currency: Currency, amount: number) {
  if (character[currency] < amount)
    throw bad(`no_${currency}`, `You do not have enough ${CURRENCY_NAMES[currency]}.`)
  await saveCharacter(tx, character.id, { [currency]: character[currency] - amount })
}

async function saveFlip(tx: Tx, characterId: string, flip: CardFlip) {
  const [row] = await tx
    .update(tollGateRuns)
    .set({ cardState: flip.state, cards: flip.cards, peeks: flip.peeks })
    .where(eq(tollGateRuns.characterId, characterId))
    .returning()
  return row!
}

export async function cardRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Loads the run, applies a paid or free card step and returns the run with the character. */
  const step = (
    path: string,
    change: (
      flip: CardFlip,
      row: RunRow,
      body: unknown,
    ) => { flip: CardFlip; cost: number; currency: Currency },
  ) =>
    app.post(path, { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
      withCharacter(db, request, async (tx, character) => {
        const row = await requireRun(tx, character.id)
        const { flip, cost, currency } = change(flipOf(row), row, request.body ?? {})
        if (cost > 0) await pay(tx, character, currency, cost)
        const saved = await saveFlip(tx, character.id, flip)
        return { run: runView(saved), character: await characterView(tx, character.id) }
      }),
    )

  step('/cards/show-all', (flip, _row, body) => ({
    flip: showAll(flip),
    cost: tollGateConfig().cards.ShowAllCap,
    currency: cardPaySchema.parse(body).currency,
  }))

  step('/cards/shuffle', (flip) => ({
    flip: shuffleCards(flip, createRandom(newSeed())),
    cost: 0,
    currency: 'gold',
  }))

  step('/cards/redeal', (flip, row, body) => ({
    flip: redeal(flip, cardLib(row.gateId), createRandom(newSeed())),
    cost: tollGateConfig().cards.ExchangeCap,
    currency: cardPaySchema.parse(body).currency,
  }))

  step('/cards/peek', (flip, row, body) => {
    const { index, currency } = cardPeekSchema.parse(body)
    const config = cardConfig(row.gateId)
    const cost = config ? peekCost(config, flip.peeks, flip.state) : null
    const next = peekCard(flip, index)
    return { flip: next, cost: cost ?? 0, currency }
  })

  app.post('/cards/take', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { index } = cardTakeSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<CardTakeResult> => {
      const row = await requireRun(tx, character.id)
      const card = takeCard(flipOf(row), index)
      const awards = Array.from({ length: card.count }, () => ({
        itemId: card.itemId,
        bound: card.bound,
      }))
      // The original grants nothing into a full bag; here the cards wait until there is room.
      await requireBagRoom(tx, character.id, awards)
      await grantItems(tx, character.id, awards)
      await tx.delete(tollGateRuns).where(eq(tollGateRuns.characterId, character.id))
      const strip = ({ itemId, count, bound }: (typeof row.cards)[number]) => ({
        itemId,
        count,
        bound,
      })
      return {
        card: strip(card),
        cards: row.cards.map(strip),
        character: await characterView(tx, character.id),
      }
    })
  })
}
