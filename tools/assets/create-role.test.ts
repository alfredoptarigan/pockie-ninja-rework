import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import createRole from '../../client/src/generated/game-create-role.json'
import { createArtOrigin, tabPlacements, withoutText } from './create-role.ts'
import { paths } from './paths.ts'

const fileExists = (url: string) =>
  expect(existsSync(join(paths.root, 'client/public', url)), url).toBe(true)

describe('character creation screen export', () => {
  it('has the screen, 5 village tabs, 10 portraits, 3 buttons and 10 outfit pictures', () => {
    fileExists(createRole.background.file)
    expect(Object.keys(createRole.nations)).toHaveLength(5)
    expect(Object.keys(createRole.roles)).toHaveLength(10)
    expect(Object.keys(createRole.outfits).sort()).toEqual(
      ['14', '16', '17', '3', '32', '34', '39', '63', '65', '9'].sort(),
    )
    const arts = [
      ...Object.values(createRole.nations).flatMap(Object.values),
      ...Object.values(createRole.roles).flatMap(Object.values),
      ...[createRole.enter, createRole.back, createRole.random].flatMap(Object.values),
      ...Object.values(createRole.outfits),
    ]
    for (const art of arts) {
      fileExists(art.file)
      // Every piece sits on the 1000x600 screen (buttons alone, not the whole screen).
      expect(art.x + art.width).toBeLessThanOrEqual(1001)
      expect(art.y + art.height).toBeLessThanOrEqual(601)
      expect(art.width * art.height).toBeLessThan(1000 * 600 * 0.25)
    }
  })

  it('drops text characters and the named interactive clips', () => {
    const svg = [
      '    <use ffdec:characterId="2" xlink:href="#shape0"/>',
      '    <use ffdec:characterId="19" filter="url(#f)" xlink:href="#sprite5"/>',
      '          <use ffdec:characterId="115" xlink:href="#sprite47"/>',
      '    <use ffdec:characterId="65" id="clip_Nation" xlink:href="#sprite10"/>',
    ].join('\n')
    expect(withoutText(svg, ['clip_Nation'])).toBe(
      '    <use ffdec:characterId="2" xlink:href="#shape0"/>',
    )
  })

  it('reads tab placements of a TabSelect clip', () => {
    const svg = [
      '    <g id="sprite10">',
      '      <use ffdec:characterId="36" height="26.4" id="tab1" transform="matrix(1.0, 0.0, 0.0, 1.0, -1.4, -4.75)" width="26.4" xlink:href="#sprite11"/>',
      '    </g>',
    ].join('\n')
    expect(tabPlacements(svg, 'sprite10')).toEqual({
      1: { characterId: 36, x: -1.4, y: -4.75, width: 26.4 },
    })
  })

  it('places a create picture by its sprite translation and shape bounds (twips)', () => {
    const xml =
      '<item type="PlaceObject2Tag" characterId="3" depth="1"><matrix translateX="5520" translateY="5027"/></item><shapeBounds type="RECT" Xmax="1360" Xmin="-5600" Ymax="2960" Ymin="-3800"/>'
    expect(createArtOrigin(xml)).toEqual({ x: -4, y: 61.35 })
  })
})
