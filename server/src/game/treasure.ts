import { readFileSync } from 'node:fs'
import type { Random } from '@pockie/game-core'
import { weightedIndex } from './explore.js'

export interface TreasureReward {
  BoxId: string
  ItemId: string
  Odds: number
  Odds1: number
  Value: number
  Config: number
  Count: number
  BindingStatus: number
}
const data = JSON.parse(readFileSync(new URL('./treasure-data.json', import.meta.url), 'utf8')) as {
  types: Record<string, { Gold: number; OpenNum: number; Level: string }>
  rewards: TreasureReward[]
}
export const treasureTerms = (id: string) => data.types[id]
export const treasureReward = (boxId: string, itemId: string) =>
  data.rewards.find((row) => row.BoxId === boxId && row.ItemId === itemId)!

/** OpenBoxSystem.UseBox: weighted draws without replacement, then shuffle. */
export function treasureCards(boxId: string, random: Random) {
  const pool = data.rewards.filter((row) => row.BoxId === boxId && row.Config === 0)
  const cards: string[] = []
  const absolute = data.rewards.filter((row) => row.BoxId === boxId && row.Config === 1)
  let roll = random.int(101)
  const guaranteed = absolute.find((row) => (roll -= row.Odds) < 0)
  if (guaranteed) cards.push(guaranteed.ItemId)
  while (cards.length < 5) {
    const index = weightedIndex(
      pool.map((row) => row.Odds),
      random,
    )
    if (index < 0) throw new Error('Treasure reward pool cannot fill five cards.')
    cards.push(pool.splice(index, 1)[0]!.ItemId)
  }
  const shuffled: string[] = []
  while (cards.length) shuffled.push(cards.splice(random.int(cards.length), 1)[0]!)
  return shuffled
}
