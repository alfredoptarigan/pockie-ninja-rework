// M6 groups of the Reborn export (plan m6-companions, task 4): pets, wings, auras, combat
// effects and cards. main.js is parsed as text and never executed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const m6Categories = new Set(['pets', 'wings', 'auras', 'combat-effects', 'cards'])
type Entry = { category: string; path: string }
/** M6 files to convert. data.json and offsets.json feed the manifests and are not shipped;
 * from combat-effects only buff visuals, damage numbers and status icons are in scope. */
export const isM6Asset = (e: Entry) =>
  m6Categories.has(e.category) &&
  !/(^|\/)(data|offsets)\.json$/.test(e.path) &&
  (e.category !== 'combat-effects' ||
    /^(entities\/(effects|numbers)\/|icons\/effects\.)/.test(e.path))

type Item = [string | null, ...unknown[]]
type Items = Record<string, Item>
export const props = <T>(item: Item) => item[7] as T | undefined
export const itemIcon = (item: Item) => `icons/items/${item[0]}.png`

export const petCatalog = (items: Items) =>
  Object.entries(items)
    .filter(([, item]) => item[0]?.startsWith('pets/'))
    .map(([id, item]) => ({ id, item, avatar: String(props<{ avatar: number }>(item)!.avatar) }))

/** Avatar whose battle art the pet uses: its own, else the nearest family base with art
 * (`serverConfig.petFamilies` maps a pet item to its base item). Undefined means icon only. */
export function petArtAvatar(
  id: string,
  items: Items,
  families: Record<string, number>,
  hasArt: (avatar: string) => boolean,
) {
  const seen = new Set<string>()
  for (
    let item: string | undefined = id;
    item && !seen.has(item);
    item = families[item]?.toString()
  ) {
    seen.add(item)
    const avatar = String(props<{ avatar: number }>(items[item]!)!.avatar)
    if (hasArt(avatar)) return avatar
  }
  return undefined
}

/** Mount used by main.js `[WingAttachment]` for sprites missing from its table. */
export const defaultWingOffset: [number, number] = [-6, -6]
/** Wing mount table at main.js @1325191. */
export function parseWingOffsets(js: string): Record<string, [number, number]> {
  const table = js.match(/\{(wing_duotian_3:\[[^}]+)\}/)?.[1]
  if (!table) throw new Error('Wing offset table not found in main.js')
  return Object.fromEntries(
    [...table.matchAll(/(\w+):\[(-?[\d.]+),(-?[\d.]+)\]/g)].map(([, name, x, y]) => [
      name,
      [Number(x), Number(y)],
    ]),
  )
}

export type Visual = {
  offset: [number, number]
  depth?: 'behind'
  onPet?: true
  global?: true
  buffs: string[]
}
type Offsets = Record<
  string,
  { offset: [number, number]; isBehindActor?: boolean; isOnPet?: boolean }
>
/** main.js `Se`: buffs whose visual is never drawn from the effect table. */
const notDrawn = new Set(['MUD_WALL', 'SUBSTITUTE'])
const num = '(-?[\\d.]+)'
const tableEntry = new RegExp(
  `\\[\\w+\\.\\w+\\.(\\w+)\\]:\\{name:"(\\w+)",offset:\\{x:${num},y:${num}\\}([^}]*)\\}`,
  'g',
)
const petEntry = new RegExp(`\\[\\w+\\.\\w+\\.(\\w+)\\]=\\w+\\("(\\w+)",${num},${num}\\)`, 'g')

/** Buff visual table `we` (main.js @1358809) plus `entities/effects/offsets.json`, by name. */
export function parseBuffVisuals(js: string, offsets: Offsets) {
  const start = js.indexOf('{[-1]:{name:"default"')
  if (start < 0) throw new Error('Buff visual table not found in main.js')
  const table = js.slice(start, js.indexOf(';const ', start))
  const visuals: Record<string, Visual> = {}
  const add = (buff: string, name: string, visual: Omit<Visual, 'buffs'>) => {
    const known = visuals[name]
    if (known && known.offset.join() !== visual.offset.join())
      throw new Error(`Conflicting offsets for effect ${name}`)
    visuals[name] = { ...(known ?? visual), buffs: [...(known?.buffs ?? []), buff] }
  }
  for (const [, buff, name, x, y, tail] of table.matchAll(tableEntry)) {
    if (notDrawn.has(buff!) || tail!.includes('hidden:!0')) continue
    add(buff!, name!, {
      offset: [Number(x), Number(y)],
      ...(tail!.includes('BEHIND_CHARACTER') ? { depth: 'behind' as const } : {}),
      ...(tail!.includes('global:!0') ? { global: true as const } : {}),
      ...(tail!.includes('isOnPet:!0') ? { onPet: true as const } : {}),
    })
  }
  for (const [, buff, name, x, y] of table.matchAll(petEntry))
    add(buff!, name!, { offset: [Number(x), Number(y)], depth: 'behind', onPet: true })
  for (const [name, o] of Object.entries(offsets))
    add(name, name, {
      offset: o.offset,
      ...(o.isBehindActor ? { depth: 'behind' as const } : {}),
      ...(o.isOnPet ? { onPet: true as const } : {}),
    })
  return visuals
}

/** Card collections `dx` (main.js @3331803) with card names (@3330252). Ids run 1-74 in order. */
export function parseCards(js: string) {
  const start = js.indexOf('[{name:"Konoha Village",folder:')
  if (start < 0) throw new Error('Card collections not found in main.js')
  const names = Object.fromEntries(
    [
      ...js.slice(Math.max(0, start - 20000), start).matchAll(/"([^"/]+\/[^"]+\.jpg)":"([^"]+)"/g),
    ].map(([, file, name]) => [file, name]),
  )
  const list = js.slice(start, js.indexOf('}]', start) + 2)
  let card = 0
  return [
    ...list.matchAll(/\{name:"([^"]+)",folder:"([^"]+)",cards:\[([^\]]*)\],rarity:\w+\.(\w+)/g),
  ].map(([, name, folder, files, rarity], i) => ({
    id: i + 1,
    name: name!,
    rarity: rarity!,
    cards: [...files!.matchAll(/"([^"]+)"/g)].map(([, file]) => ({
      id: ++card,
      name: names[`${folder}/${file}`] ?? file!.replace(/\.jpg$/, ''),
      path: `icons/items/cards/${folder}/${file}`,
    })),
  }))
}

type Ref = { atlas: string; pages: string[] }
type Export = {
  atlasRef: (file: string) => Ref
  has: (file: string) => boolean
  /** Public URL of a converted image, by raw path. */
  icon: (file: string) => string
}
/** Manifests written to client/src/generated/reborn-<name>.json. */
export function m6Manifests(
  raw: string,
  items: Items,
  families: Record<string, number>,
  { atlasRef, has, icon }: Export,
) {
  const read = <T>(file: string): T => JSON.parse(readFileSync(join(raw, file), 'utf8')) as T
  const js = readFileSync(join(raw, 're/main.js'), 'utf8')
  const petAtlas = (avatar: string) => `entities/pets/${avatar}/avatar.json`
  const pets = Object.fromEntries(
    petCatalog(items).map(({ id, item, avatar }) => {
      const art = petArtAvatar(id, items, families, (a) => has(petAtlas(a)))
      if (!art) return [avatar, { item: Number(id), icon: icon(itemIcon(item)) }]
      const data = read<{ animations: unknown; motionEvents?: unknown }>(
        `assets/entities/pets/${art}/data.json`,
      )
      return [
        avatar,
        {
          item: Number(id),
          icon: icon(itemIcon(item)),
          ...(art === avatar ? {} : { artFrom: art }),
          ...atlasRef(petAtlas(art)),
          animations: data.animations,
          motionEvents: data.motionEvents ?? {},
        },
      ]
    }),
  )
  const mounts = parseWingOffsets(js)
  const equipment = (key: 'wingSprite' | 'battleAura') =>
    Object.entries(items).flatMap(([id, item]) => {
      const name = props<Record<string, string>>(item)?.[key]
      return name ? [{ id: Number(id), item, name }] : []
    })
  const wings = Object.fromEntries(
    equipment('wingSprite').map(({ id, item, name }) => [
      name,
      {
        item: id,
        icon: icon(itemIcon(item)),
        ...atlasRef(`entities/wings/${name}/avatar.json`),
        offset: mounts[name] ?? defaultWingOffset,
        animations: read<{ animations: unknown }>(`assets/entities/wings/${name}/data.json`)
          .animations,
      },
    ]),
  )
  const auras = Object.fromEntries(
    equipment('battleAura').map(({ id, item, name }) => [
      name,
      { item: id, icon: icon(itemIcon(item)), ...atlasRef(`entities/auras/${name}/aura.json`) },
    ]),
  )
  const visuals = parseBuffVisuals(js, read<Offsets>('assets/entities/effects/offsets.json'))
  const missing = Object.keys(visuals).filter((name) => !has(`entities/effects/${name}.json`))
  if (missing.length) throw new Error(`Effects without an atlas: ${missing.join(', ')}`)
  const effects = {
    effects: Object.fromEntries(
      Object.keys(visuals)
        .sort()
        .map((name) => [name, { ...atlasRef(`entities/effects/${name}.json`), ...visuals[name] }]),
    ),
    numbers: {
      normal: atlasRef('entities/numbers/normal.json'),
      heal: atlasRef('entities/numbers/heal.json'),
    },
    statusIcons: atlasRef('icons/effects.json'),
  }
  const collections = parseCards(js)
  if (collections.length !== 10 || collections.flatMap((c) => c.cards).length !== 74)
    throw new Error('Expected 74 cards in 10 collections')
  const cards = collections.map(({ cards, ...collection }) => ({
    ...collection,
    cards: cards.map(({ path, ...card }) => ({ ...card, image: icon(path) })),
  }))
  return { pets, wings, auras, effects, cards }
}
