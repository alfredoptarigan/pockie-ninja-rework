import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bonusesOf,
  collectionData,
  collectionTotals,
  gearEntryOf,
  petFamily,
} from './collection.js'
import { item, outfitForClothing } from './data.js'

const none = { outfit: new Set<string>(), pet: new Set<string>(), gear: new Set<string>() }

describe('collection data', () => {
  it('keeps the Reborn outfits our clothing 1-120 has, in Gray / Blue / Orange', () => {
    const data = collectionData()
    expect(data.avatars.map((r) => [r.id, r.outfits.length])).toEqual([
      ['gray', 18],
      ['blue', 20],
      ['orange', 71],
    ])
    for (const [clothing] of data.avatars.flatMap((r) => r.outfits)) {
      expect(item(outfitForClothing(clothing).itemId)?.Clothing).toBe(clothing)
    }
  })

  it('has 116 pet families, each a base species', () => {
    const families = collectionData().pets.flatMap((n) => n.families.map(([f]) => f))
    expect(families).toHaveLength(116)
    for (const family of families) expect(petFamily(family)).toBe(family)
    expect(petFamily('i320071')).toBe('i320002')
  })

  it('lists every equip-suits set with its item.ini pieces (SuitID) by slot', () => {
    const suits = Object.keys(
      JSON.parse(
        readFileSync(new URL('../../data/game/equip-suits.json', import.meta.url), 'utf8'),
      ) as Record<string, unknown>,
    ).map(Number)
    const sets = collectionData().gearSets.tiers.flatMap((t) => t.sets)
    // 8862 has a bonus row but no item.
    expect(sets.map((s) => s.id).sort()).toEqual(suits.filter((id) => id !== 8862).sort())
    for (const set of sets)
      for (const [slot, ids] of Object.entries(set.slots))
        for (const id of ids) {
          expect(item(id)).toMatchObject({ SuitID: set.id, EquipType: slot })
          expect(gearEntryOf(id)).toBe(`${set.id}:${slot}`)
        }
  })
})

describe('bonusesOf', () => {
  it('is empty without entries', () => {
    expect(bonusesOf(none)).toEqual({})
  })

  it('adds each outfit STR / AGI / STA (x100) and the top milestone of its rarity', () => {
    // Gray: 3 [1,2,1], 9 [3,0,1], 12 [1,2,1], 14 [3,0,1], 16 [2,0,2]; 5 pays +2.1%.
    const outfit = new Set(['3', '9', '12', '14', '16'])
    expect(bonusesOf({ ...none, outfit })).toEqual({
      strength: 1000,
      agility: 400,
      stamina: 600,
      hpMul: 21,
      attackMul: 21,
      atkTimeMul: 21,
    })
    const totals = collectionTotals({ ...none, outfit }).outfits
    expect(totals.totals.level).toBe(1)
    expect(totals.lists[0]!.map((m) => m.reached)).toEqual([true, false, false])
  })

  it('pays only the higher of two reached milestones', () => {
    const gray = collectionData()
      .avatars[0]!.outfits.slice(0, 10)
      .map(([c]) => String(c))
    const bonuses = bonusesOf({ ...none, outfit: new Set(gray) })
    expect(bonuses.hpMul).toBe(32)
  })

  it('pays a piece, a full set and the tier milestone for gear', () => {
    const tier = collectionData().gearSets.tiers[0]!
    const pieces = (set: (typeof tier.sets)[number]) =>
      Object.keys(set.slots).map((slot) => `${set.id}:${slot}`)
    const one = bonusesOf({ ...none, gear: new Set([pieces(tier.sets[0]!)[0]!]) })
    expect(one).toEqual({ strength: 100, agility: 100, stamina: 100 })
    const full = pieces(tier.sets[0]!)
    expect(bonusesOf({ ...none, gear: new Set(full) }).strength).toBe(full.length * 100 + 300)
    const all = tier.sets.flatMap(pieces)
    expect(bonusesOf({ ...none, gear: new Set(all) })).toMatchObject({
      strength: all.length * 100 + tier.sets.length * 300,
      hpMul: 20,
      attackMul: 20,
      atkTimeMul: 20,
    })
  })

  it('adds a pet family and its nature milestone', () => {
    const plant = collectionData().pets[0]!
    const families = new Set(plant.families.map(([f]) => f))
    expect(bonusesOf({ ...none, pet: families })).toEqual({
      strength: 500,
      agility: 500,
      stamina: 500,
      hpMul: 20,
      attackMul: 20,
      atkTimeMul: 20,
    })
  })
})
