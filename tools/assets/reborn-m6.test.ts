import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultWingOffset,
  isM6Asset,
  itemIcon,
  parseBuffVisuals,
  parseCards,
  parseWingOffsets,
  petArtAvatar,
  petCatalog,
} from './reborn-m6.ts'

const pet = (avatar: number): [string, ...unknown[]] => [
  `pets/${avatar}`,
  30,
  1,
  3,
  [],
  null,
  4,
  { avatar, nature: 1, food: 1 },
]

describe('reborn M6 parsers', () => {
  it('selects pets, wings, auras, cards and in-scope combat effects only', () => {
    const e = (category: string, path: string) => ({ category, path })
    expect(
      [
        e('pets', 'entities/pets/1/avatar.json'),
        e('pets', 'entities/pets/1/data.json'),
        e('combat-effects', 'entities/effects/burn.png'),
        e('combat-effects', 'entities/effects/offsets.json'),
        e('combat-effects', 'entities/numbers/heal.json'),
        e('combat-effects', 'icons/effects.png'),
        e('combat-effects', 'scenes/backgrounds/1_fight.png'),
        e('combat-effects', 'ui/combat/bars.png'),
        e('cards', 'icons/items/cards/Village/1.jpg'),
        e('avatar', 'entities/avatars/1/avatar.json'),
      ].map(isM6Asset),
    ).toEqual([true, false, true, false, true, true, false, false, true, false])
  })
  it('resolves pet art to its own avatar, a family base with art, or none', () => {
    const items = { 1: pet(10), 2: pet(20), 3: pet(30) }
    const hasArt = (avatar: string) => avatar === '10'
    expect(petCatalog(items).map((p) => p.avatar)).toEqual(['10', '20', '30'])
    expect(petArtAvatar('1', items, {}, hasArt)).toBe('10')
    expect(petArtAvatar('2', items, { 2: 1 }, hasArt)).toBe('10')
    expect(petArtAvatar('3', items, { 3: 3 }, hasArt)).toBeUndefined()
  })
  it('reads the wing mount table', () => {
    expect(parseWingOffsets('const O={wing_duotian_3:[-38,-8],wing_Abbad_1:[-14,14.5]};')).toEqual({
      wing_duotian_3: [-38, -8],
      wing_Abbad_1: [-14, 14.5],
    })
    expect(() => parseWingOffsets('const O={};')).toThrow(/Wing offset table/)
  })
  it('reads buff visuals, merges shared names and skips hidden or undrawn buffs', () => {
    const js =
      'we={[-1]:{name:"default",offset:{x:0,y:0},hidden:!0},' +
      '[x.dc.ACCELERATE]:{name:"accelerate",offset:{x:-92.8,y:-18.1},depth:x.fY.BEHIND_CHARACTER},' +
      '[x.dc.ANTIBODY]:{name:"antibody",offset:{x:0,y:0},hidden:!0},' +
      '[x.dc.BLESS]:{name:"bless",offset:{x:-74.2,y:-208.65}},' +
      '[x.dc.BURN]:{name:"burn",offset:{x:-66.25,y:-161.05}},' +
      '[x.dc.AMATERASU_BURN]:{name:"burn",offset:{x:-66.25,y:-161.05}},' +
      '[x.dc.MIST]:{name:"mist",offset:{x:-50,y:-50},global:!0},' +
      '[x.dc.MUD_WALL]:{name:"bless",offset:{x:0,y:0}}},je=(e,t,i)=>({});' +
      'we[x.dc.BASIC_HOLY_AURA]=je("basic_holy_aura",-153.5,-91.5);const Se=[];'
    expect(
      parseBuffVisuals(js, { 11861: { offset: [-125, -72], isBehindActor: true, isOnPet: true } }),
    ).toEqual({
      accelerate: { offset: [-92.8, -18.1], depth: 'behind', buffs: ['ACCELERATE'] },
      bless: { offset: [-74.2, -208.65], buffs: ['BLESS'] },
      burn: { offset: [-66.25, -161.05], buffs: ['BURN', 'AMATERASU_BURN'] },
      mist: { offset: [-50, -50], global: true, buffs: ['MIST'] },
      basic_holy_aura: {
        offset: [-153.5, -91.5],
        depth: 'behind',
        onPet: true,
        buffs: ['BASIC_HOLY_AURA'],
      },
      11861: { offset: [-125, -72], depth: 'behind', onPet: true, buffs: ['11861'] },
    })
  })
  it('numbers cards in collection order and falls back to the file name', () => {
    const js =
      'ox={"Village/1.jpg":"Granny","Akatsuki/1.jpg":"Deidara"};' +
      'dx=[{name:"Konoha Village",folder:"Village",cards:["1.jpg","Ninja.jpg"],rarity:lx.GREEN,color:1},' +
      '{name:"Akatsuki",folder:"Akatsuki",cards:["1.jpg"],rarity:lx.PURPLE,color:2}];'
    expect(parseCards(js)).toEqual([
      {
        id: 1,
        name: 'Konoha Village',
        rarity: 'GREEN',
        cards: [
          { id: 1, name: 'Granny', path: 'icons/items/cards/Village/1.jpg' },
          { id: 2, name: 'Ninja', path: 'icons/items/cards/Village/Ninja.jpg' },
        ],
      },
      {
        id: 2,
        name: 'Akatsuki',
        rarity: 'PURPLE',
        cards: [{ id: 3, name: 'Deidara', path: 'icons/items/cards/Akatsuki/1.jpg' }],
      },
    ])
  })
})

const raw = resolve(
  process.env.REBORN_RAW_DIR ?? join(import.meta.dirname, '../../data/reborn-raw'),
)
const captured = ['re/main.js', 'json_items.json', 'assets'].every((f) => existsSync(join(raw, f)))
describe.skipIf(!captured)('reborn M6 capture', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(raw, file), 'utf8'))
  const items = () => read('json_items.json') as Record<string, [string, ...unknown[]]>
  const asset = (file: string) => existsSync(join(raw, 'assets', file))
  it('resolves every catalog pet to battle art or an item icon', () => {
    const families = read('re/serverConfig.json').petFamilies
    const all = items()
    const pets = petCatalog(all).map(({ id, item }) => ({
      art: petArtAvatar(id, all, families, (a) => asset(`entities/pets/${a}/avatar.json`)),
      icon: asset(itemIcon(item)),
    }))
    expect(pets).toHaveLength(190)
    expect(pets.filter((p) => p.art).length).toBe(156)
    expect(pets.every((p) => p.icon)).toBe(true)
  })
  it("gives every wing item's wingSprite art and an offset", () => {
    const mounts = parseWingOffsets(readFileSync(join(raw, 're/main.js'), 'utf8'))
    const sprites = Object.values(items()).flatMap((item) => {
      const sprite = (item[7] as { wingSprite?: string } | undefined)?.wingSprite
      return sprite ? [sprite] : []
    })
    expect(sprites).toHaveLength(18)
    for (const sprite of sprites) {
      expect(asset(`entities/wings/${sprite}/avatar.json`)).toBe(true)
      expect(mounts[sprite] ?? defaultWingOffset).toHaveLength(2)
    }
  })
})
