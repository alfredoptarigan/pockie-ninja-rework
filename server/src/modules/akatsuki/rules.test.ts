// Akatsuki hunt rules: statuses, the ambush roll, the red outfits and the difficulty curve.
import { simulateFight } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { playerFighterFrom } from '../../game/combat.js'
import { item, outfitForClothing } from '../../game/data.js'
import { AKATSUKI_PLACEHOLDERS } from './config.js'
import {
  ambushChance,
  huntingPair,
  memberBuild,
  memberStatuses,
  PAIRS,
  pairFighters,
  springs,
} from './rules.js'

const NOW = new Date('2026-10-15T12:00:00Z')

describe('memberStatuses', () => {
  it('reveals the hunting pair, locks the later ones and leaves Zetsu and Obito out', () => {
    expect(memberStatuses(0)).toMatchObject({
      deidara: 'revealed',
      sasori: 'revealed',
      hidan: 'locked',
      pain: 'locked',
    })
    const later = memberStatuses(2)
    expect(later).toMatchObject({ deidara: 'defeated', kakuzu: 'defeated', pain: 'revealed' })
    expect(later.zetsu).toBeUndefined()
    expect(later.obito).toBeUndefined()
    expect(Object.values(memberStatuses(4)).every((s) => s === 'defeated')).toBe(true)
  })
  it('has four pairs of eight fighting members, then nobody hunts', () => {
    expect(PAIRS).toHaveLength(4)
    expect(new Set(PAIRS.flatMap((pair) => pair.members)).size).toBe(8)
    expect(huntingPair(0)?.key).toBe('clay')
    expect(huntingPair(4)).toBeNull()
  })
})

describe('ambushChance', () => {
  it('doubles while the bait is active', () => {
    const base = AKATSUKI_PLACEHOLDERS.ambushChancePercent
    expect(ambushChance(null, NOW)).toBe(base)
    expect(ambushChance(new Date(NOW.getTime() + 1000), NOW)).toBe(base * 2)
    expect(ambushChance(new Date(NOW.getTime() - 1000), NOW)).toBe(base)
  })
  it('springs under the chance', () => {
    expect(springs(0.099, 10)).toBe(true)
    expect(springs(0.1, 10)).toBe(false)
  })
})

describe('red outfits', () => {
  it('are each member’s own outfit at +21 (level 60)', () => {
    for (const pair of PAIRS)
      for (const member of pair.members) {
        const build = memberBuild(member)!
        const def = item(build.redOutfit)!
        expect(def.class).toBe('AvatarItem')
        expect(Number(def.Clothing)).toBe(build.clothing)
        expect(Number(def.UseLevel)).toBe(60)
      }
  })
})

describe('pairFighters', () => {
  const gear = { minAttack: 500, maxAttack: 600, hp: 2000, defense: 100 }
  it('fields both members at the given level', () => {
    const [a, b] = pairFighters('crows', 50, gear)
    expect(a).toMatchObject({ name: 'Itachi', level: 50 })
    expect(b).toMatchObject({ name: 'Kisame', level: 50 })
  })
  it('gets harder pair by pair: an equal ninja beats the first far more often than the last', () => {
    const winRate = (pair: number, level: number) => {
      let wins = 0
      const seeds = 12
      for (let seed = 1; seed <= seeds; seed++) {
        const player = playerFighterFrom(
          {
            name: 'P',
            avatarId: outfitForClothing(3).avatarId,
            gender: 0,
            level,
            hp: 1e9,
            mp: 1e9,
            nation: seed % 5,
          },
          [],
          gear,
        )
        const replay = simulateFight({
          attackers: [player],
          defenders: pairFighters(PAIRS[pair]!.key, level, gear),
          seed,
        })
        if (replay.winner === 'attackers') wins++
      }
      return wins / seeds
    }
    const first = (winRate(0, 30) + winRate(0, 60)) / 2
    const last = (winRate(3, 30) + winRate(3, 60)) / 2
    expect(first).toBeGreaterThan(0.35)
    expect(last).toBeLessThan(first)
    expect(last).toBeGreaterThan(0.05)
  })
})
