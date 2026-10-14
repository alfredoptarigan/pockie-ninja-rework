export type DiceBuffId = 80101 | 80102 | 80201 | 80202

export interface DiceRoll {
  dice: number[]
  net: number
  buffId: DiceBuffId | null
}

/** Reborn tiers count lucky faces (5/6) minus unlucky faces (1/2). */
export function diceTier(net: number): DiceBuffId | null {
  if (net >= 4) return 80102
  if (net >= 2) return 80101
  if (net >= -1) return null
  if (net >= -3) return 80201
  return 80202
}

/** The supplied random source returns a float in [0, 1), allowing seeded replay. */
export function rollDice(random: () => number): DiceRoll {
  const dice = Array.from({ length: 6 }, () => Math.floor(random() * 6) + 1)
  const net = dice.reduce((total, face) => total + (face >= 5 ? 1 : face <= 2 ? -1 : 0), 0)
  return { dice, net, buffId: diceTier(net) }
}
