// Konoha Boutique rules: the reels, paylines (left to right from reel 1), the bonus symbol, the
// level from EXP, the chests and Double Chance.
import type { Random } from '@pockie/game-core'
import {
  BOUTIQUE_PAYLINES,
  BOUTIQUE_RULES,
  BOUTIQUE_SYMBOLS,
  type BoutiqueSymbol,
} from '../../../../shared/src/schemas/konoha-boutique.js'
import { BOUTIQUE_PLACEHOLDERS as P } from './config.js'

const { reels, rows, matchPayouts } = BOUTIQUE_RULES
const totalWeight = BOUTIQUE_SYMBOLS.reduce((sum, symbol) => sum + P.weights[symbol], 0)

export function rollSymbol(random: Random): BoutiqueSymbol {
  let roll = random.next() * totalWeight
  for (const symbol of BOUTIQUE_SYMBOLS) {
    roll -= P.weights[symbol]
    if (roll < 0) return symbol
  }
  return BOUTIQUE_SYMBOLS[0]
}

/** 15 pieces, row * 5 + reel. */
export const rollPieces = (random: Random) =>
  Array.from({ length: reels * rows }, () => rollSymbol(random))

const lineValue = (symbol: BoutiqueSymbol) =>
  (P.values as Partial<Record<BoutiqueSymbol, number>>)[symbol] ?? 0

/**
 * The first `lines` paylines: a line pays when its first 3+ pieces from reel 1 match (the bonus
 * symbol pays on none), multiplier x symbol value x the match payout. 3 bonus symbols anywhere
 * start a Bonus Round.
 */
export function evaluate(pieces: readonly BoutiqueSymbol[], lines: number, multiplier: number) {
  const winningLines: number[] = []
  const winningPieces = new Set<number>()
  let coins = 0
  BOUTIQUE_PAYLINES.slice(0, lines).forEach(([path], line) => {
    const cells = path.map((row, reel) => row * reels + reel)
    const first = pieces[cells[0]!]!
    let count = 1
    while (count < reels && pieces[cells[count]!] === first) count++
    const value = lineValue(first)
    if (count < 3 || value === 0) return
    winningLines.push(line)
    cells.slice(0, count).forEach((cell) => winningPieces.add(cell))
    coins += multiplier * value * matchPayouts[count]!
  })
  const bonus = pieces.filter((piece) => piece === P.bonusSymbol).length >= P.bonusSymbolsNeeded
  return {
    winningLines,
    winningPieces: [...winningPieces].sort((a, b) => a - b),
    coins,
    bonus,
  }
}

/** The highest level whose EXP the total reaches. */
export function levelFor(exp: number) {
  let level = 1
  for (const [n, [needed]] of Object.entries(P.levels)) if (exp >= needed) level = Number(n)
  return level
}

export const maxBet = (level: number) => {
  const [, multiplier, lines] = P.levels[level as keyof typeof P.levels]
  return { multiplier, lines }
}

/** A chest's coins for a Bonus Round started by a spin of `bet`. */
export const chestCoins = (bet: number, random: Random) =>
  bet * P.chestMultipliers[random.int(P.chestMultipliers.length)]!

export const doubleNumber = (random: Random) => random.between(1, P.doubleNumberMax)
export const doubleOperator = (random: Random) => (random.int(2) === 0 ? 'higher' : 'lower')

/** The six boxes and whether the picked one beats `target` the way `operator` asks. */
export function guess(index: number, target: number, operator: 'higher' | 'lower', random: Random) {
  const boxes = Array.from({ length: BOUTIQUE_RULES.doubleBoxes }, () => doubleNumber(random))
  const picked = boxes[index]!
  const won = operator === 'higher' ? picked > target : picked < target
  return { boxes, picked, won }
}
