// Scroll Dungeons rules: the daily rotation, the pity chance and the drop roll.
import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { BOSSES, BUILDS, bossDrops, bossFighter, bossLevel } from './bosses.js'
import { chanceOf, MAX_PITY, rollDrops, todaysBosses } from './rules.js'

/** A Random whose next() returns the given values in order. */
const fixed = (...values: number[]): Random => {
  const queue = [...values]
  const next = () => queue.shift() ?? 0.99
  return {
    next,
    int: (n) => Math.floor(next() * n),
    between: (a, b) => a + Math.floor(next() * (b - a + 1)),
  }
}

describe('todaysBosses', () => {
  it('picks 3 different bosses of 11, the same all day', () => {
    const bosses = todaysBosses('2026-10-15')
    expect(bosses).toHaveLength(3)
    expect(new Set(bosses).size).toBe(3)
    expect(bosses.every((b) => b >= 0 && b < 11)).toBe(true)
    expect(todaysBosses('2026-10-15')).toEqual(bosses)
  })
  it('rotates: a month of days uses every boss', () => {
    const days = Array.from({ length: 30 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
    )
    expect(new Set(days.flatMap(todaysBosses)).size).toBe(11)
  })
})

describe('chanceOf', () => {
  it('adds 0.5% a step and caps at 10%', () => {
    expect(chanceOf(2, 0)).toBe(2)
    expect(chanceOf(2, 3)).toBe(3.5)
    expect(chanceOf(2, MAX_PITY)).toBe(10)
    expect(chanceOf(2, MAX_PITY + 5)).toBe(10)
  })
})

describe('rollDrops', () => {
  const madara = bossDrops(BOSSES[0]!)
  it('adds a pity step on a win without a scroll, up to the cap', () => {
    expect(rollDrops(madara, 0, fixed())).toEqual({ items: [], pity: 1 })
    expect(rollDrops(madara, MAX_PITY, fixed())).toEqual({ items: [], pity: MAX_PITY })
  })
  it('drops the 7-day scroll under the chance and resets the pity', () => {
    // Izanagi 7-day roll 1.9% < 2%, its permanent roll misses, Reverse Lotus misses both.
    expect(rollDrops(madara, 0, fixed(0.019, 0.5, 0.5, 0.5))).toEqual({
      items: ['i540001'],
      pity: 0,
    })
  })
  it('uses the pity chance and rolls the permanent scroll at 0.1%', () => {
    // 4 steps = 4%: 3.9% hits; the permanent roll 0.0009 (0.09%) hits too.
    expect(rollDrops(madara, 4, fixed(0.5, 0.5, 0.039, 0.0009))).toEqual({
      items: ['i540009', 'i540109'],
      pity: 0,
    })
    expect(rollDrops(madara, 4, fixed(0.04, 0.001, 0.5, 0.5)).items).toEqual([])
  })
  it('is reproducible from a seed', () => {
    const roll = (seed: number) => rollDrops(madara, 16, createRandom(seed))
    expect(roll(7)).toEqual(roll(7))
  })
})

describe('BOSSES', () => {
  it('lists Reborn’s 11 bosses with drops that exist as our scroll items', () => {
    expect(BOSSES.map((b) => b.name)).toEqual([
      'Madara Uchiha',
      'Itachi Uchiha',
      'Kisame Hoshigaki',
      '3rd Form Aizen',
      'Hollowified Ichigo',
      'Yamamoto Genryusai',
      'White Ulquiorra',
      'Byakuya Kuchiki',
      'Pain',
      'Hebi Sasuke',
      'Gaara',
    ])
    for (const boss of BOSSES) {
      expect(boss.drops.length).toBeGreaterThan(0)
      expect(Object.keys(BUILDS)).toContain(boss.build)
      for (const drop of bossDrops(boss)) {
        expect(drop.itemId).toMatch(/^i5400\d\d$/)
        expect(drop.permanentItemId).toBe(`i5401${drop.itemId.slice(5)}`)
      }
    }
  })
})

describe('bossFighter', () => {
  const gear = { minAttack: 500, maxAttack: 600, hp: 2000, defense: 100 }
  const boss = (name: string) => BOSSES.find((b) => b.name === name)!

  it('fights at the challenger\u2019s level (45 at least) with full HP and MP', () => {
    expect(bossLevel(30)).toBe(45)
    expect(bossLevel(60)).toBe(60)
    const madara = bossFighter(boss('Madara Uchiha'), 50, gear)
    expect(madara).toMatchObject({ name: 'Madara Uchiha', level: 50 })
    expect(madara.hp).toBe(madara.maxHp)
    expect(madara.mp).toBe(madara.maxMp)
  })
  it('uses its outfit skills and the scroll skills it drops', () => {
    const ids = bossFighter(boss('Madara Uchiha'), 45, gear).skills!.map((s) => s.id)
    // Itachi Uchiha's outfit (ultimate 1949, 7777, 8888, passive 2082), Fire passive, scrolls.
    expect(ids).toEqual(expect.arrayContaining([1949, 7777, 8888, 2082, 1831, 18043]))
  })
  it('applies its build', () => {
    const tank = bossFighter({ ...boss('Itachi Uchiha'), build: 'Tank' }, 45, gear)
    const kamikaze = bossFighter({ ...boss('Itachi Uchiha'), build: 'Kamikaze' }, 45, gear)
    expect(tank.maxHp).toBeGreaterThan(kamikaze.maxHp)
    expect(kamikaze.maxAttack).toBeGreaterThan(tank.maxAttack)
    expect(bossFighter(boss('Madara Uchiha'), 45, gear).vampiricHp).toBe(10)
    expect(bossFighter(boss('White Ulquiorra'), 45, gear).vampiricMp).toBe(30)
    expect(bossFighter(boss('Gaara'), 45, gear).rebound).toBe(10)
  })
  it('scales with the challenger\u2019s gear', () => {
    const bare = bossFighter(boss('Gaara'), 45, {})
    const geared = bossFighter(boss('Gaara'), 45, gear)
    expect(geared.maxAttack).toBeGreaterThan(bare.maxAttack)
    expect(geared.maxHp).toBeGreaterThan(bare.maxHp)
  })
})
