import { describe, expect, it } from 'vitest'
import { bagFits, requireBagRoom } from './bag.js'
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
