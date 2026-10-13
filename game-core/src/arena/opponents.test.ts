import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { duelWindow, npcSlots, playerSlots, refereeScore, SLOTS } from './opponents.js'

const npcs = Array.from({ length: 18 }, (_, i) => `n${400000 + i}`)

describe('NPC phase (tiers 0-1)', () => {
  it('lists the 18 tier NPCs from a random offset, wrapping around', () => {
    const slots = npcSlots(npcs, createRandom(7))
    expect(slots).toHaveLength(SLOTS)
    expect(new Set(slots.map((s) => s.kind === 'npc' && s.npcId)).size).toBe(18)
    const first = npcs.indexOf((slots[0] as { npcId: string }).npcId)
    expect(first).toBeLessThanOrEqual(15)
    slots.forEach((slot, i) => expect(slot).toEqual({ kind: 'npc', npcId: npcs[(first + i) % 18] }))
  })
})

describe('player phase (tier 2+)', () => {
  it('rows A, B and C take 6 random places from [i-30, i-18], the next 13 and the next 13', () => {
    const slots = playerSlots(100, 200, npcs, createRandom(3))
    expect(slots).toHaveLength(18)
    const places = slots.map((s) => (s.kind === 'place' ? s.place : null))
    const rows = [places.slice(0, 6), places.slice(6, 12), places.slice(12)]
    for (const p of rows[0]!) expect(p).toBeGreaterThanOrEqual(70)
    for (const p of rows[0]!) expect(p).toBeLessThanOrEqual(82)
    for (const p of rows[1]!) expect(p).toBeGreaterThanOrEqual(83)
    for (const p of rows[1]!) expect(p).toBeLessThanOrEqual(95)
    for (const p of rows[2]!) expect(p).toBeGreaterThanOrEqual(96)
    for (const p of rows[2]!) expect(p).toBeLessThanOrEqual(108)
    expect(places).not.toContain(100)
    expect(new Set(places).size).toBe(18)
  })

  it('near the top, negative places down to -10 become the Referee; empty slots get NPCs', () => {
    const slots = playerSlots(0, 5, npcs, createRandom(1))
    // A = [-30, -18]: nothing valid, six NPCs.
    expect(slots.slice(0, 6).every((s) => s.kind === 'npc')).toBe(true)
    // B = [-17, -5]: -10..-5 are six Referees (fewer than 7, so all of them).
    expect(slots.slice(6, 12)).toEqual(
      [-10, -9, -8, -7, -6, -5].map((place) => ({ kind: 'referee', place })),
    )
    // C = [-4, 8]: -4..-1 Referees and places 1-4 (the list has 5 rows, 0 is me) = 8, pick 6.
    const row3 = slots.slice(12)
    expect(row3.every((s) => s.kind !== 'npc')).toBe(true)
    expect(row3.some((s) => s.kind === 'place' && s.place === 0)).toBe(false)
  })

  it('the Referee is scored at S x (1 + 0.1 x |place|), truncated', () => {
    expect(refereeScore(100000, -3)).toBe(130000)
    expect(refereeScore(100001, -1)).toBe(110001)
  })
})

describe('Ninjutsu Duel candidates', () => {
  it('6 random places within ±30 of mine, never mine', () => {
    const places = duelWindow(50, 200, createRandom(5))
    expect(places).toHaveLength(6)
    for (const p of places) expect(Math.abs(p - 50)).toBeLessThanOrEqual(30)
    expect(places).not.toContain(50)
    expect(duelWindow(0, 3, createRandom(5)).sort()).toEqual([1, 2])
  })
})
