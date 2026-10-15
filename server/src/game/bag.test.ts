import { describe, expect, it } from 'vitest'
import { bagFits, itemInfo, requireBagRoom } from './bag.js'
import type { Tx } from './progress.js'

type Row = { itemId: string; bound: boolean; count: number }
const txWith = (rows: Row[]) =>
  ({ select: () => ({ from: () => ({ where: async () => rows }) }) }) as unknown as Tx
const potion = { itemId: 'i160001', bound: true }
const cells = (n: number): Row[] => Array.from({ length: n }, () => ({ ...potion, count: 999 }))

describe('bag capacity', () => {
  it('stacks into partial stacks before using cells, without mutating the read rows', async () => {
    const rows = [...cells(119), { ...potion, count: 1 }]
    expect(await bagFits(txWith(rows), 'ninja', [potion])).toBe(true)
    expect(rows[119]!.count).toBe(1)
  })
  it('keeps bound and unbound stacks separate', async () => {
    expect(
      await bagFits(txWith([...cells(119), { ...potion, count: 1 }]), 'ninja', [
        { ...potion, bound: false },
      ]),
    ).toBe(false)
  })
  it('rejects new stacks in a full bag and preserves the error', async () => {
    await expect(requireBagRoom(txWith(cells(120)), 'ninja', [potion])).rejects.toMatchObject({
      code: 'bag_full',
      message: 'Your bag is full.',
    })
  })
  it('counts equipment shapes rather than rows', async () => {
    expect(await bagFits(txWith(cells(119)), 'ninja', [{ itemId: 'i250104', bound: true }])).toBe(
      false,
    )
  })
  it('reserves six cells for exploring', async () => {
    expect(await bagFits(txWith(cells(114)), 'ninja', [], { reserve: 6 })).toBe(true)
    expect(await bagFits(txWith(cells(115)), 'ninja', [], { reserve: 6 })).toBe(false)
  })
  it('accounts for multiple awards and explicit separate placement', async () => {
    expect(
      await bagFits(txWith([...cells(119), { ...potion, count: 1 }]), 'ninja', [potion], {
        separate: true,
      }),
    ).toBe(false)
    expect(await bagFits(txWith(cells(119)), 'ninja', [potion, potion])).toBe(true)
  })
})

describe('itemInfo for the Reborn tooltip', () => {
  it("gives an outfit Reborn's +N, value, weapon type, ISV, recast cap, BMV and imprints", () => {
    // i290404: 4th Hokage AvatarLevel 5 = Reborn +4 (ISV 1.25, BMV 12 / 14 / 12, Wind Master).
    expect(itemInfo('i290404')).toMatchObject({
      value: 42,
      outfit: {
        clothing: 4,
        plus: 4,
        stars: 0,
        weaponType: 'Sharp',
        isv: [125, 125, 125],
        maxIsv: [138, 138, 138],
        bmv: [1200, 1400, 1200],
        skills: [10000, 2042],
      },
    })
  })
  it('shows the recast ISV within its cap and the stars of the row', () => {
    expect(itemInfo('i290404', { recast: [135, 125, 155], stars: 2 }).outfit).toMatchObject({
      isv: [135, 125, 138],
      stars: 2,
    })
  })
  it("takes Reborn's ISV for an outfit 2011 left empty", () => {
    expect(itemInfo('i290002').outfit).toMatchObject({
      isv: [310, 290, 150],
      skills: [10000, 2032],
    })
    expect(itemInfo('i290002').value).toBe(42)
  })
  it("gives a pet item its species' nature and Synthesis Value", () => {
    expect(itemInfo('i320002')).toMatchObject({ class: 'PetItem', value: 30, pet: { nature: 2 } })
  })
  it('gives a pet moved from the Kennel its level and slotted skills', () => {
    const pet = {
      name: null,
      level: 12,
      exp: 0,
      growth: 120,
      baseAttack: 1,
      baseDefence: 1,
      baseDisturb: 1,
      baseActive: 1,
      baseSavvy: 1,
      appetite: 0,
      digestEndsAt: null,
      foodSlots: [],
      haloSlots: 1,
      helpSlots: 1,
      passSlots: 0,
      skills: [
        { skillId: 40058, level: 1, learnedOrder: 0, locked: false, kind: 1, slot: 0 },
        { skillId: 40001, level: 1, learnedOrder: 1, locked: false, kind: 2, slot: null },
      ],
    }
    expect(itemInfo('i320002', { pet }).pet).toEqual({
      nature: 2,
      level: 12,
      skills: [{ skillId: 40058, kind: 1 }],
    })
  })
})
