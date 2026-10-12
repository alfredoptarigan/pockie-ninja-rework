import { describe, expect, it } from 'vitest'
import type { MotionSheet } from '../../generated/game-assets'
import type { FightEvent, Replay } from '../types'
import { frameAt, monsterArt, originOf, outfitArt, skillMotion, type FighterArt } from './motion'
import {
  BATTLE_TICK_MS,
  buildTimeline,
  HOME,
  latestAt,
  poseX,
  splitDamage,
  type Timeline,
} from './timeline'

const sheet = (ticks: number[], attacking?: number): MotionSheet => ({
  file: 'x.webp',
  frameWidth: 100,
  frameHeight: 120,
  columns: ticks.length,
  frames: ticks.length,
  durations: ticks,
  anchor: { x: 40, y: 90 },
  labels: attacking === undefined ? {} : { Attacking: attacking },
})

// Stand 4 ticks, attack 10 ticks hitting on tick 6, hurt 4, dodge 6, die 5, victory 8, run 2.
const art: FighterArt = {
  set: {
    actions: {},
    skipped: [],
    motions: {
      '999': sheet([2, 2]),
      '52': sheet([3, 3, 4], 6),
      '18': sheet([5, 5], 4),
      '63': sheet([2, 2]),
      '64': sheet([4]),
      '68': sheet([3, 3]),
      '57': sheet([5]),
      '59': sheet([4, 4]),
      '55': sheet([1, 1]),
    },
  },
  skills: { group: 'mobs', key: 'TEST' },
}
const skills = { outfits: {}, mobs: { TEST: { '1': '52', '40027': '18' } } }

const fighter = (index: number, side: 'attackers' | 'defenders', hp: number) => ({
  index,
  side,
  name: `F${index}`,
  level: 1,
  maxHp: 100,
  startHp: 100,
  hp,
  maxMp: 50,
  startMp: 50,
  mp: 50,
})

const replayOf = (events: FightEvent[], finalHp = [100, 0]): Replay => ({
  seed: 1,
  winner: 'attackers',
  fighters: [fighter(0, 'attackers', finalHp[0]!), fighter(1, 'defenders', finalHp[1]!)],
  events,
})

const build = (replay: Replay) =>
  buildTimeline(replay, {
    art: replay.fighters.map(() => art),
    skillMotions: skills,
    skillName: (id) => (id === 40027 ? 'Bite' : undefined),
    buffName: (id) => (id === 11811 ? 'Poisoning' : undefined),
  })

const barAt = (timeline: Timeline, fighter: number, t: number) =>
  latestAt(
    timeline.bars.filter((b) => b.fighter === fighter),
    t,
  )

describe('frame math', () => {
  it('maps ticks to cells using per-cell durations', () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => frameAt([1, 2, 3], t, false))).toEqual([0, 1, 1, 2, 2, 2])
  })

  it('holds the last cell or loops', () => {
    expect(frameAt([1, 2, 3], 99, false)).toBe(2)
    expect(frameAt([1, 2, 3], 6, true)).toBe(0)
    expect(frameAt([1, 2, 3], 7, true)).toBe(1)
  })

  it('puts the origin on the registration point', () => {
    expect(originOf(sheet([1]))).toEqual({ x: 0.4, y: 0.75 })
  })

  it('finds outfit and monster art from the manifest', () => {
    expect(outfitArt(1)?.skills).toEqual({ group: 'outfits', key: '1' })
    expect(monsterArt('n33017')?.skills).toEqual({ group: 'mobs', key: 'N33017' })
    expect(monsterArt('n0')).toBeUndefined()
  })

  it('picks the skill motion, falling back to the normal attack', () => {
    expect(skillMotion(art, 40027, skills)).toBe('18')
    expect(skillMotion(art, 12345, skills)).toBe('52')
    expect(skillMotion(art, 40027, null)).toBe('52')
    expect(skillMotion(undefined, 1, skills)).toBe('999')
  })
})

describe('buildTimeline', () => {
  it('lands a strike on the Attacking tick after the run-in', () => {
    const timeline = build(
      replayOf([
        { actor: 0, event: 1 },
        { actor: 0, event: 14, target: 1, skillId: 1, damage: 30, hit: true },
        { actor: 0, event: 2 },
      ]),
    )
    const damage = timeline.texts.find((t) => t.kind === 'damage')!
    expect(damage).toMatchObject({ fighter: 1, text: '-30' })
    const attack = timeline.poses[0]!.find((p) => p.motion === '52')!
    expect(damage.at - attack.at).toBeCloseTo(6 * BATTLE_TICK_MS)
    // The attacker strikes next to the target and runs back home.
    expect(attack.to).toBe(HOME.defenders - 120)
    const back = timeline.poses[0]!.filter((p) => p.motion === '55').at(-1)!
    expect(poseX(back, back.at + back.moveMs)).toBe(HOME.attackers)
    // HP drops when the hit lands, not before.
    expect(barAt(timeline, 1, damage.at - 1)!.hp).toBe(100)
    expect(barAt(timeline, 1, damage.at)!.hp).toBe(70)
    expect(timeline.poses[1]!.find((p) => p.at === damage.at)!.motion).toBe('63')
  })

  it('shows misses, crits, parries and skill names', () => {
    const timeline = build(
      replayOf([
        { actor: 0, event: 14, target: 1, skillId: 1, hit: false },
        { actor: 1, event: 14, target: 0, skillId: 40027, damage: 12, hit: true, crit: true },
        { actor: 0, event: 7, target: 1, skillId: 1, damage: 5, hit: true, parry: true },
      ]),
    )
    expect(timeline.texts.map((t) => [t.fighter, t.kind, t.text])).toEqual([
      [1, 'miss', 'Dodge'],
      [1, 'skill', 'Bite'],
      [0, 'crit', 'Critical 12'],
      [1, 'damage', '-5'],
      [1, 'info', 'Parry'],
    ])
    expect(timeline.poses[1]!.some((p) => p.motion === '68')).toBe(true)
    expect(timeline.poses[1]!.some((p) => p.motion === '18')).toBe(true)
    expect(timeline.poses[0]!.some((p) => p.motion === '64')).toBe(true)
  })

  it('animates every strike of a multi-strike skill and splits its damage', () => {
    expect(splitDamage(10, 3)).toEqual([3, 3, 4])
    const timeline = build(
      replayOf([
        { actor: 0, event: 14, target: 1, skillId: 1, damage: 10, hit: true, attackCount: 3 },
      ]),
    )
    expect(timeline.poses[0]!.filter((p) => p.motion === '52')).toHaveLength(3)
    expect(timeline.texts.filter((t) => t.kind === 'damage').map((t) => t.text)).toEqual([
      '-3',
      '-3',
      '-4',
    ])
  })

  it('spends MP, tracks buffs and plays buff ticks', () => {
    const timeline = build(
      replayOf([
        {
          actor: 1,
          event: 14,
          target: 0,
          skillId: 40027,
          damage: 4,
          hit: true,
          decMp: 20,
          addBuffs: [{ role: 0, buff: 11811 }],
        },
        { actor: 0, event: 9, skillId: 11811, selfDamage: 3 },
        { actor: 0, event: 9, delBuffs: [{ role: 0, buff: 11811 }] },
      ]),
    )
    const mp = timeline.texts.find((t) => t.kind === 'mp')!
    expect(mp).toMatchObject({ fighter: 1, text: '-20 MP' })
    expect(barAt(timeline, 1, mp.at)!.mp).toBe(30)
    const poison = timeline.texts.find((t) => t.kind === 'buff')!
    expect(barAt(timeline, 0, poison.at)!.buffs).toEqual([11811])
    const tick = timeline.texts.filter((t) => t.fighter === 0 && t.kind === 'damage')
    expect(tick.map((t) => t.text)).toEqual(['-4', '-3'])
    expect(barAt(timeline, 0, tick[1]!.at)!.hp).toBe(93)
    const ends = timeline.texts.find((t) => t.kind === 'buffEnd')!
    expect(ends.text).toBe('Poisoning ends')
    expect(barAt(timeline, 0, ends.at)!.buffs).toEqual([])
  })

  it('clamps HP at 0, plays the death and the victory, and ends with the engine numbers', () => {
    const timeline = build(
      replayOf(
        [
          { actor: 0, event: 14, target: 1, skillId: 1, damage: 250, hit: true },
          { actor: 1, event: 20 },
        ],
        [88, 0],
      ),
    )
    const death = timeline.poses[1]!.find((p) => p.motion === '57')!
    expect(death.fade).toBe('out')
    expect(timeline.bars.filter((b) => b.fighter === 1).every((b) => b.hp >= 0)).toBe(true)
    expect(barAt(timeline, 1, death.at)!.hp).toBe(0)
    expect(timeline.poses[0]!.at(-1)!.motion).toBe('59')
    expect(barAt(timeline, 0, timeline.endAt)!.hp).toBe(88)
    expect(timeline.duration).toBeGreaterThan(timeline.endAt)
  })

  it('brings the next fighter in for sequential duels', () => {
    const replay: Replay = {
      ...replayOf([
        { actor: 1, event: 20 },
        { actor: 2, event: 21 },
        { actor: 0, event: 14, target: 2, skillId: 1, damage: 1, hit: true },
      ]),
      fighters: [
        fighter(0, 'attackers', 50),
        fighter(1, 'defenders', 0),
        fighter(2, 'defenders', 0),
      ],
    }
    const timeline = build(replay)
    expect(timeline.poses[2]![0]).toMatchObject({ motion: '999', fade: 'in' })
    expect(timeline.poses[2]![0]!.at).toBeGreaterThan(0)
    expect(timeline.poses[1]![0]!.at).toBe(0)
    const strike = timeline.poses[0]!.find((p) => p.motion === '52')!
    expect(strike.to).toBe(HOME.defenders - 120)
  })
})
