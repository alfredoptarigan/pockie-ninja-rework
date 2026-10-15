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
  it('gives an outfit its weapon type, ISV, recast cap, BMV and skill imprints', () => {
    // i290404: 4th Hokage +5 (AvatarID 404: Popsinger 2, StrengthUp 125, StrAtkAdd 1200...).
    expect(itemInfo('i290404')).toMatchObject({
      value: 42,
      outfit: {
        clothing: 4,
        plus: 5,
        weaponType: 'Sharp',
        base: [6500, 6500, 6500],
        isv: [125, 125, 125],
        maxIsv: [155, 155, 155],
        bmv: [1200, 1400, 1200],
        skills: [1904, 2002],
      },
    })
  })
  it('uses the recast ISV: the outfit levels past +1 count at the recast value', () => {
    // 8 * (plus - 1) = 32 levels of the +5 outfit move to the recast Up.
    expect(itemInfo('i290404', [135, 125, 155]).outfit).toMatchObject({
      base: [6500 + 32 * 10, 6500, 6500 + 32 * 30],
      isv: [135, 125, 155],
    })
  })
  it('keeps the ISV as the cap of an outfit that cannot be recast', () => {
    expect(itemInfo('i290002').outfit).toMatchObject({ isv: [0, 0, 0], maxIsv: [0, 0, 0] })
    expect(itemInfo('i290002').value).toBeUndefined()
  })
  it("gives a pet item its species' nature", () => {
    expect(itemInfo('i320002')).toMatchObject({ class: 'PetItem', pet: { nature: 2 } })
  })
})
