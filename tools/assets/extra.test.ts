import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  gameItems,
  gameWeapons,
  gameWorldMap,
  type WeaponLayers,
} from '../../client/src/generated/game-extra.ts'
import {
  ICONS_WITH_TEXT,
  itemIconIds,
  itemRows,
  mapButtonSvg,
  mapFaceSvg,
  mapLocations,
  playerOutfits,
  sliceItemIds,
} from './extra.ts'
import { arenaNpcs } from './arena.ts'
import tableGaps from './weapon-table-gaps.json'
import { paths } from './paths.ts'
import { CITY_SCENES, FIELD_SCENES, VILLAGE_SCENES } from './sources.ts'

const fileExists = (url: string) =>
  expect(existsSync(join(paths.root, 'client/public', url)), url).toBe(true)

describe('M2 extra asset coverage', () => {
  it('covers every item with an icon in the backup, the M2 slice included', () => {
    const { withIcon } = itemIconIds()
    expect(Object.keys(gameItems.items).sort()).toEqual(withIcon)
    for (const id of sliceItemIds()) expect(gameItems.items[id], id).toBeDefined()
    // Known gaps: 48 resource keys have no bitmap in the backup (home eggs and drops are SWFs,
    // unnamed avatar clothes, blood souls), and the Chinese-text icons are left out.
    expect(gameItems.gaps.missingIcons).toHaveLength(48)
    expect(gameItems.gaps.textIcons.map((key) => key.toLowerCase()).sort()).toEqual(
      [...ICONS_WITH_TEXT].sort(),
    )
    // M3 spot checks: forge talismans and Valhalla crystals.
    for (const id of ['i161001', 'i161009', 'i152010', 'i152015'])
      expect(gameItems.items[id], id).toBeDefined()
    const world = JSON.parse(
      readFileSync(join(paths.root, 'client/src/game/world-data.json'), 'utf8'),
    )
    for (const id of Object.keys(world.itemNames)) {
      // M5 Reborn items carry their own icons (world.rebornItemIcons).
      if (world.rebornItemIcons[id]) fileExists(world.rebornItemIcons[id])
      else expect(gameItems.items[id], id).toBeDefined()
    }
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

  it('resolves every arena outfit/weapon pair to exported WebP layers', () => {
    const arena = JSON.parse(readFileSync(join(paths.generated, 'game-arena.json'), 'utf8'))
    expect(arena.gaps.weaponsWithoutLayers).toEqual([])
    const pairs = new Set<string>()
    for (const npc of Object.values(arenaNpcs())) {
      if (!('clothing' in npc)) continue
      const pair = `${npc.clothing}:${npc.weapon}`
      if (pairs.has(pair)) continue
      pairs.add(pair)
      const index = gameWeapons.outfits[npc.clothing]
      expect(index?.keys, pair).toContain(npc.weapon)
      const sets = JSON.parse(
        readFileSync(join(paths.root, 'client/public', index!.file), 'utf8'),
      ) as WeaponLayers
      const set = sets[npc.weapon]!
      expect(set.missing, pair).toEqual({ actions: [], skills: [] })
      expect(Object.keys(set.motions).length, pair).toBeGreaterThan(0)
      for (const motion of Object.values(set.actions).concat(Object.values(set.skills)))
        if (motion !== null) expect(set.motions[motion], pair).toBeDefined()
      for (const sheet of Object.values(set.motions)) {
        expect(sheet.file).toMatch(/\.webp$/)
        fileExists(sheet.file)
      }
    }
    expect(pairs.size).toBe(186)
  })

  it('covers all 34 original map places inside the painting, with their button art', () => {
    fileExists(gameWorldMap.file)
    // Every scene_<id> button of UI_WorldMap.swf except 181 (no such scene); 2804 has none.
    const places = [...VILLAGE_SCENES, ...CITY_SCENES, ...FIELD_SCENES].filter((id) => id !== 2804)
    expect(
      Object.keys(gameWorldMap.locations)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(places.sort((a, b) => a - b))
    for (const location of Object.values(gameWorldMap.locations))
      for (const state of Object.values(location.states)) {
        fileExists(state.file)
        expect(state.x + state.width).toBeLessThanOrEqual(gameWorldMap.width)
        expect(state.y + state.height).toBeLessThanOrEqual(gameWorldMap.height)
      }
    // The "you are here" glow (face_<id>) of every place, and the original close button.
    for (const location of Object.values(gameWorldMap.locations)) fileExists(location.face.file)
    for (const state of Object.values(gameWorldMap.close)) fileExists(state.file)
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
    // scene_181 has no scene and is skipped.
    expect(mapLocations(xml.replace('scene_2101', 'scene_181'))).toEqual({})
  })

  it('draws one map button in one state', () => {
    const frame = (state: string) =>
      `\n        <g class="button-frame button-frame-${state}">\n          <use xlink:href="#${state}"/>\n        </g>`
    const svg = [
      '<svg>',
      '    <rect fill="#ffffff" height="426.0px" width="768.0px"/>',
      '    <use height="426.0" xlink:href="#shape0"/>',
      '    <use id="scene_2601" xlink:href="#button0"/>',
      '    <use id="scene_2602" xlink:href="#button1"/>',
      `    <g id="button0">${['up', 'over', 'down', 'hittest'].map(frame).join('')}\n    </g>`,
      '    <style><![CDATA[ .button-frame-over { opacity: 0; } ]]></style>',
      '</svg>',
    ].join('\n')
    const over = mapButtonSvg(svg, 'scene_2601', 'over')
    expect(over).toContain('id="scene_2601"')
    expect(over).toContain('#over')
    for (const gone of ['scene_2602', '#shape0', '<rect', '#up', '#down', '#hittest', '<style'])
      expect(over).not.toContain(gone)
  })

  it('draws one face marker of the face layer alone', () => {
    const svg = [
      '<svg>',
      '    <use height="426.0" xlink:href="#shape0"/>',
      '    <use id="scene_111" xlink:href="#button0"/>',
      '    <use id="facelayer" xlink:href="#sprite73"/>',
      '    <g id="sprite73">',
      '      <use id="face_111" xlink:href="#sprite74"/>',
      '      <use id="face_2101" xlink:href="#sprite77"/>',
      '    </g>',
      '</svg>',
    ].join('\n')
    const face = mapFaceSvg(svg, '2101')
    expect(face).toContain('id="facelayer"')
    expect(face).toContain('id="face_2101"')
    for (const gone of ['face_111', 'scene_111', '#shape0']) expect(face).not.toContain(gone)
  })
})
