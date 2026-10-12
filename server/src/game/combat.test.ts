// Early fights with the real data, checked against the original formulas (RefreshSystem.java,
// Damage.java): a level 1 Ggio Vega (AvatarID 3) against the level 2 Sunflower (n33017).
import { applyDefense, simulateFight, type Replay } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { monsterFighter, playerFighterFrom } from './combat.js'

const SEEDS = Array.from({ length: 50 }, (_, seed) => seed)
const SKILL_EVENT = 14
const NORMAL_ATTACK = 1
/** Clothing 3 → AvatarID 3: Str 1300 + 65/level, StrAtkAdd 1700, HP 200 + 20/level. */
const freshNinja = { name: 'Ninja_01', avatarId: 3, level: 1, hp: 220, mp: 220 }
/** The fists from the Fire Village newbie pack (i159104): AttackMin 7, AttackMax 8. */
const NEWBIE_FISTS = 'i270100'
/** n33017: HP 15, Def 71, Atk 9-10 (npc.ini). */
const SUNFLOWER = 'n33017'

const fights = (equipped: string[]) =>
  SEEDS.map((seed) =>
    simulateFight({
      attackers: [playerFighterFrom(freshNinja, equipped)],
      defenders: [monsterFighter(SUNFLOWER)],
      seed,
    }),
  )
const normalHits = (replay: Replay) =>
  replay.events.filter(
    (e) => e.actor === 0 && e.event === SKILL_EVENT && e.skillId === NORMAL_ATTACK && e.hit,
  )

describe('a fresh ninja against the Sunflower', () => {
  it('has attack 1 without a weapon, which Def 71 rounds down to 0 damage (as in the original)', () => {
    // (int)((1 + 0) * (1000 + 1365/1700*10) * 0.001) = 1; (int)(1 * (1 - 71/1425)) = 0.
    const player = playerFighterFrom(freshNinja, [])
    expect(player).toMatchObject({ minAttack: 1, maxAttack: 1, maxHp: 220 })
    expect(applyDefense(1, 71, 0)).toBe(0)

    const replays = fights([])
    expect(replays.flatMap(normalHits).every((e) => e.damage === undefined || e.damage === 0)).toBe(
      true,
    )
    expect(replays.filter((r) => r.winner === 'attackers')).toEqual([])
  })

  it('hits for 7-8 with the newbie fists and wins every fight in 2-3 hits', () => {
    // (1 + 7..8) * 1.000 = 8..9 attack; 8 → 7, 9 → 8 after Def 71. Sunflower HP 15.
    const player = playerFighterFrom(freshNinja, [NEWBIE_FISTS])
    expect(player).toMatchObject({ minAttack: 8, maxAttack: 9 })
    expect([applyDefense(8, 71, 0), applyDefense(9, 71, 0)]).toEqual([7, 8])

    const replays = fights([NEWBIE_FISTS])
    expect(replays.every((r) => r.winner === 'attackers')).toBe(true)
    for (const replay of replays) {
      const hits = normalHits(replay)
      expect(hits.every((e) => e.damage === 7 || e.damage === 8)).toBe(true)
      expect(hits.length).toBeLessThanOrEqual(3)
      // The Sunflower hits for 9-10 (no defence), so the ninja keeps most of its 220 HP.
      expect(replay.fighters[0]!.hp).toBeGreaterThan(150)
    }
  })
})
