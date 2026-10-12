// Item icons, weapon layers and the world map. The original weapon table decides action/skill
// mappings; transparent placeholder motions are explicit null entries. Weapon and body share a
// registration point, not a crop rectangle: draw both at the fighter position using their own
// anchors, at 14 fps.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { decodeCompressedAmf3 } from '../game-data/amf3.ts'
import { tableRows } from '../game-data/import.ts'
import { cached } from './cache.ts'
import { ffdec, mapLimit } from './ffdec.ts'
import { exportMotions, type Motion } from './motions.ts'
import { assetUrl, paths } from './paths.ts'
import { opaqueBounds } from './sheet.ts'
import { VILLAGE_SCENES, iconSource, namedClothing } from './sources.ts'
import { baseSourceFiles, readBaseSource } from './ui.ts'

type Row = Record<string, string | number>
const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(paths.gameData, `${name}.json`), 'utf8'))
export const itemRows = () => read<Record<string, Row>>('items')

/** Match the body manifest, including its documented incomplete outfits. */
export function playerOutfits() {
  const body: { outfits: Record<string, { sex: number }> } = JSON.parse(
    readFileSync(join(paths.generated, 'game-motions.json'), 'utf8'),
  )
  const stats = read<Record<string, Row>>('avatar-stats')
  const clothing = read<Record<string, Row>>('avatar-clothing')
  const items = itemRows()
  // Player outfits only: the unnamed outfits people NPCs wear have no weapon layers yet.
  const { named } = namedClothing()
  return Object.entries(body.outfits)
    .filter(([id]) => named.includes(Number(id)))
    .map(([id, outfit]) => ({
      Cloth: Number(id),
      Sex: outfit.sex,
      Pos: Number(
        stats[Number(items[String(clothing[id]?.AvatarConfig)]?.AvatarID ?? id)]?.Popsinger,
      ),
    }))
}

/** Same quest/field scope as game-text, plus exploration factories and fixed box contents. */
export function sliceItemIds() {
  const items = itemRows()
  const ids = new Set<string>()
  const drops = read<Record<string, Row[]>>('drop-items')
  const fixed = read<Record<string, Row[]>>('fixed-drops')
  const seen = new Set<number>()
  const drop = (id: number) => {
    if (id <= 0 || seen.has(id)) return
    seen.add(id)
    for (const row of drops[id] ?? []) add(String(row.ItemConfig))
    for (const row of fixed[id] ?? []) add(String(row.config))
  }
  const add = (id: string) => {
    if (!items[id]) {
      if (/^i\d+$/.test(id)) throw new Error(`Missing referenced item ${id}`)
      return
    }
    if (ids.has(id)) return
    ids.add(id)
    drop(Number(items[id].BoxDropID ?? 0))
    drop(Number(items[id].FixedDropID ?? 0))
  }
  const scenes = new Set([
    ...VILLAGE_SCENES,
    ...Object.keys(read<Record<string, Row>>('scenes'))
      .map(Number)
      .filter((id) => [21, 22, 23, 24, 25].includes(Math.floor(id / 100))),
  ])
  const npcIds = new Set<string>()
  const npcs = read<Record<string, Row>>('npcs')
  const placed = read<Record<string, { r: string[] }>>('scene-npcs')
  for (const scene of scenes)
    for (const line of placed[scene]?.r ?? []) {
      const npcId = line.split(',')[0]!
      npcIds.add(npcId)
      const npc = npcs[npcId]
      if (npc) {
        drop(Number(npc.DropLibID))
        drop(Number(npc.AppendDropLibID))
      }
    }
  const sub = read<Record<string, Row[]>>('sub-tasks')
  const taskDrops = read<Record<string, Row[]>>('task-monster-drops')
  for (const [id, task] of Object.entries(read<Record<string, Row>>('tasks'))) {
    if (!(Number(id) >= 90000 && Number(id) < 95000) && !scenes.has(Number(task.AcceptNpcSceneID)))
      continue
    for (const field of ['AcceptNpcConfig', 'SubmitNpcConfig']) npcIds.add(String(task[field]))
    for (const row of sub[id] ?? []) npcIds.add(String(row.TargetConfiger))
    add(String(task.RewardItem))
    drop(Number(task.RewardDropID))
    for (const row of sub[id] ?? []) add(String(row.TargetItem))
    for (const row of taskDrops[id] ?? []) add(String(row.TaskItemConfig))
  }
  for (const id of npcIds) {
    const npc = npcs[id]
    if (npc) {
      drop(Number(npc.DropLibID))
      drop(Number(npc.AppendDropLibID))
    }
  }
  const spots = Object.values(read<Record<string, Row>>('explore-spots')).filter((row) =>
    scenes.has(Number(row.SceneID)),
  )
  for (const spot of spots) {
    add(String(spot.PetBonusAppend))
    add(String(spot.RequireItem).split(',')[0]!)
  }
  for (const factory of ['item', 'baby', 'boss', 'key']) {
    const field = `${factory[0]!.toUpperCase()}${factory.slice(1)}FactoryID`
    const factories = new Set(spots.map((row) => Number(row[field])))
    for (const row of Object.values(read<Record<string, Row>>(`explore-${factory}-factory`)))
      if (factories.has(Number(row.ID))) add(String(row.Config))
  }
  for (const [id, row] of Object.entries(items))
    if (row.class === 'PharmacyItem' && Number(row.UseLevel ?? 0) <= 20) add(id)
  for (const id of ['i159104', 'i250100', 'i260100', 'i270100']) add(id)
  return [...ids].sort()
}

// These six bitmap resources bake labels into the pixels. Keep the surrounding original art;
// repaint only the label area (or crop the promotional logo off the gift). No text is exported.
export const TEXT_FREE_ITEM_FIXES = [
  'icon_food82',
  'icon_food83',
  'icon_resume36',
  'icon_resume37',
  'icon_resume38',
  'icon_debris114',
]
async function textFreeItem(source: string, resource: string) {
  const key = resource.toLowerCase()
  const image = sharp(source)
  if (!TEXT_FREE_ITEM_FIXES.includes(key)) return image
  if (key === 'icon_debris114')
    return image
      .extract({ left: 0, top: 0, width: 51, height: 29 })
      .extend({ bottom: 22, background: '#0000' })
  const colors: Record<string, [string, string]> = {
    icon_food82: ['#d647ed', '#480b67'],
    icon_food83: ['#24b9f1', '#103777'],
    icon_resume36: ['#ffe366', '#b95b13'],
    icon_resume37: ['#87f4ff', '#1578b6'],
    icon_resume38: ['#ee74ff', '#8722c0'],
  }
  const [light, dark] = colors[key]!
  const card = key.startsWith('icon_food')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><defs><radialGradient id="fill" cx="35%" cy="25%" r="80%"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>${card ? '<rect x="0" y="3" width="24" height="19"' : '<circle cx="12" cy="12" r="11"'} fill="url(#fill)"/></svg>`
  return image.composite([{ input: Buffer.from(svg) }])
}

/**
 * Every item of items.json (shop pools, forge materials, set pieces, toll gate cards and crystals
 * all come from it), split into those with an icon in the backup and those without.
 */
export function itemIconIds() {
  const rows = itemRows()
  const withIcon: string[] = []
  const withoutIcon: string[] = []
  const withText: string[] = []
  for (const id of Object.keys(rows).sort()) {
    // The card collection (CardItem) is not part of the game yet and its cards carry Chinese text.
    if (rows[id]!.class === 'CardItem') continue
    const resource = String(rows[id]!.ResourceID)
    const source = iconSource(resource)
    // Seven home-system icons (eggs, home drops) are SWF animations, not bitmaps.
    const bitmap = source && /\.(png|gif|jpe?g)$/i.test(source) && existsSync(source)
    if (bitmap && ICONS_WITH_TEXT.includes(resource.toLowerCase())) withText.push(id)
    else (bitmap ? withIcon : withoutIcon).push(id)
  }
  return { withIcon, withoutIcon, withText }
}

// Icons whose art is Chinese text or a partner site logo (promotional gift boxes, element badges,
// coupon and talisman labels). They are left out rather than shown untranslated.
export const ICONS_WITH_TEXT = [
  ...[103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 115, 116].map((n) => `debris${n}`),
  ...[144, 145, 146, 147, 148, 149, 207, 208, 209, 286, 298].map((n) => `debris${n}`),
  'normaltask9',
  'recast',
].map((name) => `icon_${name}`)

export async function exportItems() {
  const rows = itemRows()
  const icons: Record<string, { file: string; width: number; height: number; textRemoved?: true }> =
    {}
  const resources = new Map<string, (typeof icons)[string]>()
  // Start clean so icons dropped from the set do not linger in the repo.
  rmSync(join(paths.assets, 'game/items'), { recursive: true, force: true })
  mkdirSync(join(paths.assets, 'game/items'), { recursive: true })
  const { withIcon, withoutIcon, withText } = itemIconIds()
  for (const id of withIcon) {
    const resource = String(rows[id]!.ResourceID)
    let icon = resources.get(resource)
    if (!icon) {
      const source = iconSource(resource)!
      const relative = `game/items/${resource.toLowerCase()}.webp`
      const image = await textFreeItem(source, resource)
      const { width, height } = await image
        .webp({ lossless: true })
        .toFile(join(paths.assets, relative))
      icon = {
        file: assetUrl(relative),
        width,
        height,
        ...(TEXT_FREE_ITEM_FIXES.includes(resource.toLowerCase())
          ? { textRemoved: true as const }
          : {}),
      }
      resources.set(resource, icon)
    }
    icons[id] = icon
  }
  const resourcesOf = (ids: string[]) =>
    [...new Set(ids.map((id) => String(rows[id]!.ResourceID)))].sort()
  // Resource keys (several items share one): absent from the backup or left out for their text.
  return {
    items: icons,
    gaps: { missingIcons: resourcesOf(withoutIcon), textIcons: resourcesOf(withText) },
  }
}

export async function exportWeapons() {
  const rows = itemRows()
  const items = Object.fromEntries(
    sliceItemIds()
      .filter((id) => rows[id]!.EquipType === 'Weapon')
      .map((id) => [id, String(rows[id]!.ResourceID).slice(12).toLowerCase()]),
  )
  const table = tableRows(
    decodeCompressedAmf3(
      readFileSync(join(paths.apache, 'source/binary/datatable/weaponmotion.s30124.tab')),
    ) as Record<string, unknown[]>,
  )
  const body = JSON.parse(readFileSync(join(paths.generated, 'game-motions.json'), 'utf8')) as {
    outfits: Record<string, { actions: Record<string, string> }>
    gaps: { incompleteOutfits: number[] }
  }
  const skillMotions = JSON.parse(
    readFileSync(join(paths.assets, 'game/skill-motions.json'), 'utf8'),
  ) as { outfits: Record<string, Record<string, string>> }
  const configured = new Set(
    table.map((row) =>
      String(row.SourceID)
        .replace(/^Motion_@Sex_@Clothing_@Weapon_/, '')
        .replace(/_Weapon$/, ''),
    ),
  )
  const unmappedActions = [
    ...new Set(
      Object.values(body.outfits).flatMap((set) =>
        Object.keys(set.actions).filter((action) => !configured.has(`${action}_0`)),
      ),
    ),
  ].sort()
  const unmappedSkills = [
    ...new Set(
      Object.values(skillMotions.outfits).flatMap((set) =>
        Object.keys(set).filter((skill) => !configured.has(`9_${skill}`)),
      ),
    ),
  ].sort()
  const creation = read<{ Cloth: number; AvatarID: number }[]>('creation-outfits')
  const avatarSkills = read<Record<string, Row>>('avatar-skills')
  const outfits = await mapLimit(playerOutfits(), 2, async (outfit) => {
    const keys = [
      ...new Set(
        Object.entries(items)
          .filter(([id]) => (Number(rows[id]!.UsePopsinger) & outfit.Pos) !== 0)
          .map(([, key]) => key),
      ),
    ]
    const sets: Record<
      string,
      {
        actions: Record<string, string | null>
        skills: Record<string, string | null>
        motions: Record<string, Motion>
        missing: { actions: string[]; skills: string[] }
      }
    > = {}
    const starting = creation.find((row) => row.Cloth === outfit.Cloth)
    const assigned = starting
      ? avatarSkills[`i29${String(starting.AvatarID).padStart(4, '0')}`]
      : undefined
    const activeSkills = new Set(
      Object.entries(assigned ?? {})
        .filter(([name, value]) => name.startsWith('SkillID') && Number(value) > 0)
        .map(([, value]) => String(value)),
    )
    const sources = new Map<string, string>()
    for (const key of keys) {
      const actions: Record<string, string | null> = {}
      const skills: Record<string, string | null> = {}
      const missing = { actions: [] as string[], skills: [] as string[] }
      for (const row of table) {
        const action = /^Motion_@Sex_@Clothing_@Weapon_(.*)_Weapon$/.exec(String(row.SourceID))?.[1]
        if (!action) continue
        // Case-folding is needed on case-sensitive filesystems: original table paths use title case.
        const relative = `${row.SourcePath}${row.Name}`
          .replaceAll('@Sex', String(outfit.Sex))
          .replaceAll('@Clothing', String(outfit.Cloth))
          .replaceAll('@Weapon', key)
          .replaceAll('\\', '/')
          .toLowerCase()
        const path = join(paths.apache, relative)
        const motionId = /(?:_|\/)(\d+)_weapon\.swf$/.exec(path)?.[1]
        const motion = motionId ? `${key}-${motionId}` : 'empty'
        const target = action.startsWith('9_') ? skills : actions
        const code = action.startsWith('9_') ? action.slice(2) : action.replace(/_0$/, '')
        if (
          action.startsWith('9_')
            ? !skillMotions.outfits[outfit.Cloth]?.[code] && !activeSkills.has(code)
            : !body.outfits[outfit.Cloth]?.actions[code]
        )
          continue
        if (!existsSync(path)) {
          if (![43, 59].includes(outfit.Cloth)) throw new Error(`Missing weapon source: ${path}`)
          missing[action.startsWith('9_') ? 'skills' : 'actions'].push(code)
          continue
        }
        target[code] = motion
        sources.set(motion, path)
      }
      sets[key] = { actions, skills, motions: {}, missing }
    }
    const { motions, skipped } = sources.size
      ? await exportMotions(
          [...sources].map(([motion, path]) => ({ motion, path })),
          `game/weapons/${outfit.Cloth}`,
        )
      : { motions: {} as Record<string, Motion>, skipped: [] as string[] }
    for (const [key, set] of Object.entries(sets)) {
      set.motions = Object.fromEntries(
        Object.entries(motions).filter(([motion]) => motion.startsWith(`${key}-`)),
      )
      for (const target of [set.actions, set.skills])
        for (const [code, motion] of Object.entries(target))
          if (motion && skipped.includes(motion)) target[code] = null
    }
    const directory = join(paths.assets, `game/weapons/${outfit.Cloth}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'layers.json'), `${JSON.stringify(sets)}\n`)
    console.log(`Weapon layers: outfit ${outfit.Cloth}, ${keys.length} skins`)
    return [outfit.Cloth, sets] as const
  })
  return {
    fps: 14,
    items,
    outfits: Object.fromEntries(
      outfits.map(([id, sets]) => [
        id,
        { file: assetUrl(`game/weapons/${id}/layers.json`), keys: Object.keys(sets) },
      ]),
    ),
    gaps: {
      incompleteBodyOutfits: body.gaps.incompleteOutfits,
      unmappedActions,
      unmappedSkills,
      outfitsWithMissingLayers: outfits
        .filter(([, sets]) =>
          Object.values(sets).some(
            (set) => set.missing.actions.length + set.missing.skills.length > 0,
          ),
        )
        .map(([id]) => id),
    },
  }
}

export async function exportWorldMap() {
  const work = mkdtempSync(join(paths.cache, 'map-'))
  try {
    const entries = readBaseSource(
      Buffer.concat(baseSourceFiles().map((file) => readFileSync(file))),
    )
    const data = entries.get('UI_WorldMap.swf')!
    const hash = createHash('sha1').update(data).digest('hex')
    return await cached('world-map', hash, [join(paths.assets, 'game/map')], async () => {
      mkdirSync(join(work, 'in'))
      const swf = join(work, 'in/world.swf')
      writeFileSync(swf, data)
      const xml = join(work, 'world.xml')
      await ffdec(['-swf2xml', swf, xml])
      await ffdec(['-format', 'image:png', '-export', 'image', join(work, 'images'), swf])
      const frames = join(work, 'frames')
      await ffdec([
        '-select',
        '1',
        '-format',
        'frame:svg',
        '-export',
        'frame',
        frames,
        join(work, 'in'),
      ])
      // Bitmap 1 is the text-free 768x426 world painting. Labels and scene buttons are separate.
      rmSync(join(paths.assets, 'game/map'), { recursive: true, force: true })
      mkdirSync(join(paths.assets, 'game/map'), { recursive: true })
      const { width, height } = await sharp(join(work, 'images/1.png'))
        .webp({ quality: 85 })
        .toFile(join(paths.assets, 'game/map/world.webp'))
      const svg = readFileSync(join(frames, 'world.swf', '1.svg'), 'utf8')
      const locations: Record<string, MapLocation> = {}
      for (const [id, hit] of Object.entries(mapLocations(readFileSync(xml, 'utf8'))))
        locations[id] = { ...hit, states: await mapButtonStates(svg, id) }
      return { file: assetUrl('game/map/world.webp'), width, height, locations }
    })
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const MAP_STATES = ['up', 'over', 'down'] as const
interface MapState {
  file: string
  x: number
  y: number
  width: number
  height: number
}
type MapLocation = ReturnType<typeof mapLocations>[string] & {
  states: Record<(typeof MAP_STATES)[number], MapState>
}

/** One map button drawn alone in one state, as an SVG of the whole painting's size. */
export function mapButtonSvg(svg: string, sceneId: string, state: (typeof MAP_STATES)[number]) {
  const others = ['up', 'over', 'down', 'hittest'].filter((name) => name !== state).join('|')
  return svg
    .split('\n')
    .filter((line) => !/^ {4}<(use|rect) /.test(line) || line.includes(` id="scene_${sceneId}"`))
    .join('\n')
    .replace(/<style><!\[CDATA\[[\s\S]*?\]\]><\/style>/g, '')
    .replace(
      new RegExp(
        `\\n( +)<g class="button-frame button-frame-(?:${others})"[\\s\\S]*?\\n\\1</g>`,
        'g',
      ),
      '',
    )
}

/**
 * The coloured art the original shows over the grey painting for a place the player has visited
 * (WorldMapFrame.refreshMap sets alpha 1), per button state, cropped, in painting coordinates.
 */
async function mapButtonStates(svg: string, sceneId: string) {
  const states = {} as MapLocation['states']
  for (const state of MAP_STATES) {
    const { data, info } = await sharp(Buffer.from(mapButtonSvg(svg, sceneId, state)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const box = opaqueBounds([{ data, width: info.width, height: info.height }])
    if (!box) throw new Error(`Empty map button ${sceneId} ${state}`)
    const relative = `game/map/${sceneId}-${state}.webp`
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract(box)
      .webp({ quality: 85, alphaQuality: 90, effort: 6 })
      .toFile(join(paths.assets, relative))
    states[state] = {
      file: assetUrl(relative),
      x: box.left,
      y: box.top,
      width: box.width,
      height: box.height,
    }
  }
  return states
}

/** Original hit-state rectangles in painting coordinates (SWF matrices use 20 twips/pixel). */
export function mapLocations(xml: string) {
  const locations: Record<
    string,
    { x: number; y: number; width: number; height: number; depth: number }
  > = {}
  const attribute = (text: string, name: string) => {
    const value = new RegExp(`${name}="([^"\\s]+)"`).exec(text)?.[1]
    if (value === undefined) throw new Error(`Missing map attribute ${name}`)
    return Number(value)
  }
  for (const match of xml.matchAll(
    /<item type="PlaceObject2Tag"([^>]*name="scene_(\d+)"[^>]*)>\s*<matrix ([^>]*)/g,
  )) {
    // scene_181 has no scene in logicscene.ini (clicking it failed in the original).
    if (match[2] === '181') continue
    const buttonId = attribute(match[1]!, 'characterId')
    const button = new RegExp(
      `<item type="DefineButton2Tag"[^>]*buttonId="${buttonId}"[^>]*>([\\s\\S]*?)</characters>`,
    ).exec(xml)?.[1]
    const hit =
      /<item type="BUTTONRECORD"([^>]*buttonStateHitTest="true"[^>]*)>\s*<placeMatrix ([^>]*)/.exec(
        button ?? '',
      )
    if (!hit) throw new Error(`Missing map hit state ${match[2]}`)
    const shapeId = attribute(hit[1]!, 'characterId')
    const bounds = new RegExp(
      `<item type="DefineShape[^" ]*"[^>]*shapeId="${shapeId}"[^>]*>\\s*<shapeBounds ([^>]*)`,
    ).exec(xml)?.[1]
    if (!bounds) throw new Error(`Missing map hit bounds ${match[2]}`)
    locations[match[2]!] = {
      depth: attribute(match[1]!, 'depth'),
      x:
        (attribute(match[3]!, 'translateX') +
          attribute(hit[2]!, 'translateX') +
          attribute(bounds, 'Xmin')) /
        20,
      y:
        (attribute(match[3]!, 'translateY') +
          attribute(hit[2]!, 'translateY') +
          attribute(bounds, 'Ymin')) /
        20,
      width: (attribute(bounds, 'Xmax') - attribute(bounds, 'Xmin')) / 20,
      height: (attribute(bounds, 'Ymax') - attribute(bounds, 'Ymin')) / 20,
    }
  }
  return locations
}
