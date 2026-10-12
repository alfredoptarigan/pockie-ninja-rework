import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  gameItems,
  gameWeapons,
  gameWorldMap,
  type WeaponLayers,
} from '../../client/src/generated/game-extra.ts'
import { itemRows, sliceItemIds, playerOutfits, mapLocations } from './extra.ts'
import tableGaps from './weapon-table-gaps.json'
import { paths } from './paths.ts'
import { FIELD_SCENES, VILLAGE_SCENES } from './sources.ts'

const fileExists = (url: string) =>
  expect(existsSync(join(paths.root, 'client/public', url)), url).toBe(true)

describe('M2 extra asset coverage', () => {
  it('covers every bag, reward, box, explore, class weapon and HP item', () => {
    expect(Object.keys(gameItems.items).sort()).toEqual(sliceItemIds())
    const world = JSON.parse(
      readFileSync(join(paths.root, 'client/src/game/world-data.json'), 'utf8'),
    )
    for (const id of Object.keys(world.itemNames)) expect(gameItems.items[id], id).toBeDefined()
    for (const icon of Object.values(gameItems.items)) {
      fileExists(icon.file)
      expect(icon.width).toBeGreaterThan(0)
      expect(icon.height).toBeGreaterThan(0)
    }
  })

  it('covers every compatible weapon for every exported player outfit', () => {
    expect(gameWeapons.gaps.unmappedActions).toEqual(tableGaps.actions)
    expect(gameWeapons.gaps.unmappedSkills).toEqual(tableGaps.skills)
    expect(gameWeapons.gaps.incompleteBodyOutfits).toEqual([43, 59])
    expect(gameWeapons.gaps.outfitsWithMissingLayers).toEqual([])
    expect(Object.keys(gameWeapons.outfits).map(Number)).toEqual(
      playerOutfits().map((outfit) => outfit.Cloth),
    )
    const creation = JSON.parse(
      readFileSync(join(paths.gameData, 'creation-outfits.json'), 'utf8'),
    ) as { Cloth: number; AvatarID: number }[]
    const avatarSkills = JSON.parse(
      readFileSync(join(paths.gameData, 'avatar-skills.json'), 'utf8'),
    ) as Record<string, Record<string, number>>
    const definitions = JSON.parse(
      readFileSync(join(paths.gameData, 'skills.json'), 'utf8'),
    ) as Record<string, { type: number }>
    const rows = itemRows()
    const weapons = sliceItemIds().filter((id) => rows[id]!.EquipType === 'Weapon')
    expect(Object.keys(gameWeapons.items).sort()).toEqual(weapons)
    const body = JSON.parse(readFileSync(join(paths.generated, 'game-motions.json'), 'utf8'))
    const skills = JSON.parse(
      readFileSync(join(paths.assets, 'game/skill-motions.json'), 'utf8'),
    ).outfits
    for (const outfit of playerOutfits()) {
      const index = gameWeapons.outfits[outfit.Cloth]
      expect(index).toBeDefined()
      fileExists(index!.file)
      const sets = JSON.parse(
        readFileSync(join(paths.root, 'client/public', index!.file), 'utf8'),
      ) as WeaponLayers
      expect(Object.keys(sets)).toEqual(index!.keys)
      for (const id of weapons.filter(
        (id) => (Number(rows[id]!.UsePopsinger) & outfit.Pos) !== 0,
      )) {
        const set = sets[gameWeapons.items[id]!]
        expect(set, `outfit ${outfit.Cloth}, weapon ${id}`).toBeDefined()
        const starting = creation.find((row) => row.Cloth === outfit.Cloth)
        if (starting) {
          const assigned = avatarSkills[`i29${String(starting.AvatarID).padStart(4, '0')}`]!
          const active = [
            1,
            2,
            3,
            7777,
            8888,
            ...Object.entries(assigned)
              .filter(([key]) => key.startsWith('SkillID'))
              .map(([, value]) => value),
          ].filter((value) => value > 0 && definitions[value]?.type !== 3)
          for (const skill of active)
            expect(
              set!.skills[skill],
              `M2 skill ${skill} for outfit ${outfit.Cloth}, weapon ${id}`,
            ).not.toBeUndefined()
        }
        if (![43, 59].includes(outfit.Cloth))
          expect(set!.missing).toEqual({ actions: [], skills: [] })
        for (const action of Object.keys(body.outfits[outfit.Cloth].actions)) {
          if (tableGaps.actions.includes(action)) continue
          expect(
            set!.actions[action],
            `outfit ${outfit.Cloth}, weapon ${id}, action ${action}`,
          ).not.toBeUndefined()
        }
        for (const skill of Object.keys(skills[outfit.Cloth] ?? {})) {
          if (tableGaps.skills.includes(skill)) continue
          if (set!.missing.skills.includes(skill)) {
            expect([43, 59]).toContain(outfit.Cloth)
            continue
          }
          expect(
            set!.skills[skill],
            `outfit ${outfit.Cloth}, weapon ${id}, skill ${skill}`,
          ).not.toBeUndefined()
        }
        for (const key of Object.values(set!.actions).concat(Object.values(set!.skills))) {
          if (key !== null) expect(set!.motions[key], key).toBeDefined()
        }
        for (const sheet of Object.values(set!.motions)) {
          fileExists(sheet.file)
          expect(sheet.durations).toHaveLength(sheet.frames)
          expect(sheet.durations.every((n) => n > 0)).toBe(true)
          expect(Number.isFinite(sheet.anchor.x) && Number.isFinite(sheet.anchor.y)).toBe(true)
        }
      }
    }
  }, 30_000)

  it('covers all ten original map hit regions inside the painting', () => {
    fileExists(gameWorldMap.file)
    expect(
      Object.keys(gameWorldMap.locations)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...VILLAGE_SCENES, ...FIELD_SCENES].sort((a, b) => a - b))
    for (const rect of Object.values(gameWorldMap.locations)) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(gameWorldMap.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(gameWorldMap.height)
    }
  })

  it('converts the original button hit bounds and translation from twips', () => {
    const xml =
      '<item type="DefineShapeTag" shapeId="6"><shapeBounds Xmin="0" Xmax="1800" Ymin="20" Ymax="1400"/></item><item type="DefineButton2Tag" buttonId="7"><characters><item type="BUTTONRECORD" buttonStateHitTest="true" characterId="6"><placeMatrix translateX="0" translateY="5"/></item></characters></item><item type="PlaceObject2Tag" characterId="7" depth="2" name="scene_2101"><matrix translateX="600" translateY="6000"/></item>'
    expect(mapLocations(xml)).toEqual({
      '2101': { depth: 2, x: 30, y: 301.25, width: 90, height: 69 },
    })
    expect(() => mapLocations(xml.replace('shapeId="6"', 'shapeId="9"'))).toThrow(
      'Missing map hit bounds',
    )
  })
})
