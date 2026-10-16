import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MotionSheet } from '../../generated/game-assets'
import type { WeaponLayer, WeaponSheet } from '../../generated/game-extra'
import { json } from '../../test/utils'
import type { FighterArt } from './motion'
import { loadWeaponLayer, weaponFrameAt, weaponSheetFor } from './weapon'

const weaponSheet = (durations: number[]): WeaponSheet => ({
  file: `w-${durations.join('-')}.webp`,
  frameWidth: 26,
  frameHeight: 42,
  columns: durations.length,
  frames: durations.length,
  durations,
  anchor: { x: -6, y: 23 },
  labels: {},
})
const bodySheet = (durations: number[]): MotionSheet => ({
  ...weaponSheet(durations),
  file: 'body.webp',
  anchor: { x: 26, y: 65 },
})

const layer: WeaponLayer = {
  missing: { actions: [], skills: [] },
  actions: { '999': 'w-999', '55': 'w-55', '59': null },
  skills: { '1': 'w-52', '4': null },
  motions: {
    'w-999': weaponSheet([2, 2]),
    'w-55': weaponSheet([1, 1]),
    'w-52': weaponSheet([1, 1, 1]),
  },
}

// The body has every motion used below except the heavy hit (64), which falls back to standing.
const art: FighterArt = {
  set: {
    actions: {},
    skipped: [],
    motions: Object.fromEntries(
      ['999', '55', '59', '52', '4', '63'].map((m) => [m, bodySheet([1])]),
    ),
  },
  skills: { group: 'outfits', key: '3' },
}

describe('weaponSheetFor', () => {
  it('picks the action sheet for actions and the skill sheet for skills', () => {
    expect(weaponSheetFor(layer, art, { motion: '999' })).toBe(layer.motions['w-999'])
    expect(weaponSheetFor(layer, art, { motion: '55' })).toBe(layer.motions['w-55'])
    expect(weaponSheetFor(layer, art, { motion: '52', skillId: 1 })).toBe(layer.motions['w-52'])
  })

  it('hides the weapon on a null mapping (a transparent original motion)', () => {
    expect(weaponSheetFor(layer, art, { motion: '59' })).toBeNull()
    expect(weaponSheetFor(layer, art, { motion: '4', skillId: 4 })).toBeNull()
  })

  it('has nothing for an unmapped motion (unsupported)', () => {
    expect(weaponSheetFor(layer, art, { motion: '63' })).toBeUndefined()
    expect(weaponSheetFor(layer, art, { motion: '52', skillId: 777 })).toBeUndefined()
  })

  it('follows the body when the body falls back to standing', () => {
    expect(weaponSheetFor(layer, art, { motion: '64' })).toBe(layer.motions['w-999'])
  })
})

describe('weaponFrameAt', () => {
  it('runs on the weapon durations, never the body cell index', () => {
    // One body cell of 3 ticks against three weapon cells of 1 tick.
    expect([0, 1, 2].map((t) => weaponFrameAt([3], [1, 1, 1], t, false))).toEqual([0, 1, 2])
    expect([0, 1, 2, 3].map((t) => weaponFrameAt([1, 1, 1, 1], [2, 2], t, false))).toEqual([
      0, 0, 1, 1,
    ])
  })

  it('clamps to the last weapon tick when the weapon ends before the body', () => {
    expect(weaponFrameAt([4, 4], [1, 1], 5, false)).toBe(1)
    expect(weaponFrameAt([4, 4], [1, 1], 99, false)).toBe(1)
  })

  it('starts again from tick 0 each time a looping body motion restarts', () => {
    // Body loop of 4 ticks; tick 5 is tick 1 of the second loop.
    expect(weaponFrameAt([2, 2], [1, 1, 1], 5, true)).toBe(1)
    expect(weaponFrameAt([2, 2], [1, 1, 1], 4, true)).toBe(0)
    expect(weaponFrameAt([2, 2], [1, 1, 1], 3, true)).toBe(2)
  })
})

describe('loadWeaponLayer', () => {
  afterEach(() => vi.unstubAllGlobals())

  const layers = { gloves1: layer, gloves2: { ...layer, actions: {} } }

  it('fetches the outfit layers once and picks the weapon of the item', async () => {
    const fetchMock = vi.fn(async () => json(layers))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadWeaponLayer(3, 'i270100')).toEqual(layer)
    expect(await loadWeaponLayer(3, 'i270102')).toEqual(layers.gloves2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/assets/game/weapons/3/layers.json')
  })

  it('fetches nothing for items that are not weapons of this outfit', async () => {
    const fetchMock = vi.fn(async () => json(layers))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadWeaponLayer(1, 'i160006')).toBeUndefined() // a potion
    expect(await loadWeaponLayer(99999, 'i260100')).toBeUndefined() // no such outfit
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("draws a weapon of another type as the outfit's own weapon of the same number, like Reborn", async () => {
    const own = { sharp1: layer, sharp19: { ...layer, skills: {} }, gloves20: layer }
    const fetchMock = vi.fn(async () => json(own))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadWeaponLayer(1, 'i270100')).toEqual(own.sharp1) // gloves 1 on a sword outfit
    expect(await loadWeaponLayer(1, 'i270118')).toEqual(own.sharp19) // gloves 19
    expect(await loadWeaponLayer(8, 'i260118')).toEqual(own.gloves20) // sword 20 on a gloves outfit
  })

  it('tries again after a failed request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(json({ blunt1: layer }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadWeaponLayer(5, 'i250100')).toBeUndefined()
    expect(await loadWeaponLayer(5, 'i250100')).toEqual(layer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
