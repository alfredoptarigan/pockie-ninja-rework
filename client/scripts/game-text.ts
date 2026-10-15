// Builds the client's slice of the game text and world data for milestone 2 from the imported
// original data (server/data/game) and the English table (tools/i18n/en.json):
//   client/src/i18n/en.json        strings the M2 slice can show (scenes 1x1 and 21xx-25xx)
//   client/src/game/world-data.json quest offers and travel routes the client needs for its UI
// Run with `pnpm --filter @pockie/client game-text` after en.json or the game data change.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLOSED_SCENES } from '../../shared/src/schemas/game.ts'
import { MALL_CATALOGUE } from '../../server/src/modules/mall/catalogue.ts'

type Row = Record<string, number | string | (number | string)[]>

const root = join(import.meta.dirname, '../..')
const read = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const game = <T>(name: string) => read<T>(`server/data/game/${name}.json`)

const en = read<Record<string, string>>('tools/i18n/en.json')
const scenes = game<Record<string, Row>>('scenes')
const switchRules = game<Record<string, Row>>('scene-switch-rules')
const sceneNpcs = game<Record<string, { r?: string | string[] }>>('scene-npcs')
const npcs = game<Record<string, Row>>('npcs')
const rebornItems = game<Record<string, Row>>('reborn/items')
const items = { ...game<Record<string, Row>>('items'), ...rebornItems }
const tasks = game<Record<string, Row>>('tasks')
const subTasks = game<Record<string, Row[]>>('sub-tasks')
const dropItems = game<Record<string, Row[]>>('drop-items')
const levels = game<{ levelexp: Record<string, number>; role: { maxlevel: number } }>('levels')
const taskMonsterDrops = game<Record<string, Row[]>>('task-monster-drops')
const sceneBuildings =
  game<{ SceneID: number; ClipName: string; NameFlag: string }[]>('scene-buildings')
const honorShop = game<Record<string, Row>>('arena-honor-shop')
const arenaTiers = game<Record<string, { npcs: string[] }>>('arena-tiers')
const tollGates = game<Record<string, { TollGateName: string }>>('toll-gates')

const VILLAGES = [111, 121, 131, 141, 151]
const FIELD_ZONES = [21, 22, 23, 24, 25]
const sliceScenes = new Set([
  ...VILLAGES,
  ...Object.keys(scenes)
    .map(Number)
    .filter((id) => FIELD_ZONES.includes(Math.floor(id / 100))),
])
const isTutorial = (id: number) => id >= 90000 && id < 95000

const keys = new Set<string>()
const itemIds = new Set<string>()
const npcIds = new Set<string>()

const spawns = (sceneId: number) => {
  const r = sceneNpcs[String(sceneId)]?.r
  return (r === undefined ? [] : Array.isArray(r) ? r : [r]).map((line) => line.split(',')[0]!)
}

function addItemsFromDrop(libId: number, seen = new Set<number>()) {
  if (libId <= 0 || seen.has(libId)) return
  seen.add(libId)
  for (const entry of dropItems[String(libId)] ?? []) addItem(String(entry.ItemConfig), seen)
}

function addItem(id: string, seen = new Set<number>()) {
  const row = items[id]
  if (!row || itemIds.has(id)) return
  itemIds.add(id)
  // Boxes (like the newbie pack) open into more items.
  addItemsFromDrop(Number(row.BoxDropID ?? 0), seen)
}

// Scenes: every scene name (the world map lists them), NPCs and monsters of the slice scenes.
for (const id of Object.keys(scenes)) keys.add(`lg_Scene_BackGround_${id}`)
for (const sceneId of sliceScenes) for (const id of spawns(sceneId)) npcIds.add(id)

// Quests: village tutorials and every quest given out in a slice scene.
const sliceTasks = Object.entries(tasks).filter(
  ([id, row]) => isTutorial(Number(id)) || sliceScenes.has(Number(row.AcceptNpcSceneID)),
)
const offers: Record<string, object> = {}
const previous: Record<string, number> = {}
// Generic step templates (SubTaskDes_<n>) take {@i:...} arguments in this order; text arguments
// are string keys, '#total' and '#current' are filled from the quest progress.
const STEP_ARGS: Record<string, string[]> = {
  '1': ['zone', 'npc', '#total', '#current'],
  '2': ['zone', 'npc', 'item', '#total', '#current'],
  '3': ['zone', 'npc'],
  '4': ['zone', 'npc', 'item', '#total', '#current'],
  '5': ['zone', 'npc', 'item'],
  '11': ['zone', ''],
  '13': ['zone', ''],
}
const stepArgs: Record<string, string[][]> = {}
const npcKey = (id: unknown) => (typeof id === 'string' && npcs[id] ? `lg_${npcs[id].Name}` : '')
const itemKey = (id: unknown) => (typeof id === 'string' && items[id] ? `lg_${items[id].Name}` : '')
for (const [id, row] of sliceTasks) {
  keys.add(`lg_Task_${id}`).add(`lg_TaskDes_${id}`)
  for (const field of ['StartNpcMessageID', 'SubmitNpcMessageID']) {
    if (row[field]) keys.add(`lg_${row[field]}`)
  }
  for (const field of ['AcceptNpcConfig', 'SubmitNpcConfig']) {
    if (typeof row[field] === 'string' && npcs[row[field]]) npcIds.add(row[field])
  }
  const args = (subTasks[id] ?? []).map((step) => {
    const variant = /^SubTaskDes_(\d+)$/.exec(String(step.SubTaskDescription))?.[1] ?? ''
    const scene = Number(step.SubmitSceneID)
    const values: Record<string, string> = {
      zone: scene > 0 ? `lg_Scene_BackGround_${scene}` : '',
      npc: npcKey(step.TargetConfiger),
      item: itemKey(step.TargetItem),
    }
    return (STEP_ARGS[variant] ?? []).map((arg) => values[arg] ?? arg)
  })
  if (args.some((list) => list.length > 0)) stepArgs[id] = args
  for (const step of subTasks[id] ?? []) {
    keys.add(`lg_${step.SubTaskDescription}`)
    if (typeof step.TargetItem === 'string') addItem(step.TargetItem)
    if (typeof step.TargetConfiger === 'string' && npcs[step.TargetConfiger]) {
      npcIds.add(step.TargetConfiger)
    }
  }
  for (const drop of taskMonsterDrops[id] ?? []) addItem(String(drop.TaskItemConfig))
  if (typeof row.RewardItem === 'string') addItem(row.RewardItem)
  addItemsFromDrop(Number(row.RewardDropID ?? 0))

  if (Number(row.PreTaskID) > 0) previous[id] = Number(row.PreTaskID)
  // Quests the player takes at an NPC (the server checks all of this again on accept).
  if (Number(row.AutoAcceptTask) !== 1 && typeof row.AcceptNpcConfig === 'string') {
    offers[id] = {
      npc: row.AcceptNpcConfig,
      scene: Number(row.AcceptNpcSceneID),
      pre: Number(row.PreTaskID),
      level: Number(row.RequireLevel),
      nation: Number(row.RequireCountry),
      talkKey: row.StartNpcMessageID ? `lg_${row.StartNpcMessageID}` : null,
    }
  }
}

for (const id of npcIds) {
  const row = npcs[id]
  if (!row) continue
  keys.add(`lg_${row.Name}`).add(`lg_Say_${id}`)
  addItemsFromDrop(Number(row.DropLibID ?? 0))
  addItemsFromDrop(Number(row.AppendDropLibID ?? 0))
}
// Explore spots of the slice: names, key items, what their cards can hand out, and the monsters
// (level variants like n330261 that share the art and name of n33026).
const exploreSpots = game<Record<string, Row>>('explore-spots')
const exploreFactories = {
  ItemFactoryID: game<Record<string, Row>>('explore-item-factory'),
  BossFactoryID: game<Record<string, Row>>('explore-boss-factory'),
  KeyFactoryID: game<Record<string, Row>>('explore-key-factory'),
  BabyFactoryID: game<Record<string, Row>>('explore-baby-factory'),
}
const gostFactory = game<Record<string, { Item: string[] }>>('explore-gost-factory')
const exploreMonsters: Record<string, string> = {}
for (const [id, spot] of Object.entries(exploreSpots)) {
  if (!sliceScenes.has(Number(spot.SceneID))) continue
  keys.add(`lg_OutSearch_${id}`)
  for (const part of String(spot.RequireItem).split(';')) addItem(part.split(',')[0]!)
  addItem(String(spot.PetBonusAppend))
  for (const [field, factory] of Object.entries(exploreFactories)) {
    for (const entry of Object.values(factory)) {
      if (entry.ID === spot[field]) addItem(String(entry.Config))
    }
  }
  for (const monster of gostFactory[String(spot.GostFactoryID)]?.Item ?? []) {
    const base = /^name_(n\d+)$/.exec(String(npcs[monster]?.Name))?.[1]
    if (!base) continue
    exploreMonsters[monster] = base
    keys.add(`lg_name_${base}`)
  }
}

// HP potions sold and dropped early on.
for (const [id, row] of Object.entries(items)) {
  if (row.class === 'PharmacyItem' && Number(row.UseLevel ?? 0) <= 20) addItem(id)
}
for (const id of Object.keys(honorShop)) addItem(id)
for (const { itemId } of MALL_CATALOGUE) addItem(itemId)
// Armory: gems, Enchanting Stones and Slot Talismans (sockets, enchantments and their pickers).
for (const [id, row] of Object.entries(items)) {
  if (row.class === 'JewelItem' || row.class === 'MagicItem' || row.FreePropName === 'FreeAddHole')
    addItem(id)
}
// M5 scroll skill items (server/data/game/reborn/items.json).
for (const id of Object.keys(rebornItems)) addItem(id)
for (const id of itemIds) keys.add(`lg_${items[id]!.Name}`)

// Market, arena and rankings windows: every Market item (any tradable bag item can be listed), the
// Honor shop items, the arena fighters' names (their ids differ from their name keys), and the
// toll gate names of the weekly rankings. Market-only items carry a name, not bag behaviour.
const nameOnlyItems = Object.keys(items).filter((id) => items[id]!.MartType)
const arenaNpcNames: Record<string, string> = {}
for (const tier of Object.values(arenaTiers)) {
  for (const id of tier.npcs) if (npcs[id]) arenaNpcNames[id] = `lg_${npcs[id].Name}`
}
for (const key of Object.values(arenaNpcNames)) keys.add(key)
for (const id of nameOnlyItems) keys.add(`lg_${items[id]!.Name}`)
for (const gate of Object.values(tollGates)) keys.add(`lg_${gate.TollGateName}`)

// Common UI labels: weapon classes and starting outfits.
for (const n of [1, 2, 4, 7]) keys.add(`lg_Common_RolePopsinger${n}`)
for (let n = 1; n <= 100; n++) keys.add(`lg_avatar${n}`)
// Battle replay labels: every skill and buff name (small, and any outfit may use them).
for (const key of Object.keys(en)) if (/^lg_(Skill|Buffer)_\d+$/.test(key)) keys.add(key)
// Skills window tooltips: player ninjutsu (18xx, 38xx) and element passives (2801-2810). The
// "_Fake" text is the one the original client displays (damage first), the plain one the rest.
for (const key of Object.keys(en))
  if (/^lg_SkillDes_(18[0-3]\d|38[0-2]\d|28(0\d|10))(_Fake)?$/.test(key)) keys.add(key)
// World map tooltips (Tip_WorldMap_<scene>_<nation>, WorldMapFrame.onScenePointOver).
for (const key of Object.keys(en)) if (/^lg_Tip_WorldMap_\d+_\d$/.test(key)) keys.add(key)
// Character creation (CreatRoleBase): village tips, the outfit boost line and its stat names.
for (let n = 0; n < 5; n++) keys.add(`lg_Tip_LoginNation_${n}`).add(`lg_Common_Nation_${n}`)
keys.add('lg_CreatRolePanel_SelectRole')
for (const stat of ['Force', 'Attack', 'GridFile', 'Agile', 'Speed', 'Dodge', 'Spirit', 'Hp', 'Sp'])
  keys.add(`lg_RoleInfo_${stat}`)

// Village buildings (scene picture hotspots): clip name to the NPC behind it (NameFlag name_<id>).
const buildings: Record<string, Record<string, string>> = {}
for (const row of sceneBuildings) {
  if (!sliceScenes.has(row.SceneID)) continue
  const npcId = row.NameFlag.replace(/^name_/, '')
  ;(buildings[row.SceneID] ??= {})[row.ClipName] = npcId
  keys.add(`lg_${row.NameFlag}`).add(`lg_build_${npcId}`)
}

// Travel (sceneswitchrule.ini): a scene can be entered from every scene its rule lists, and from
// any scene no rule lists (SceneSwitchRuleSystem.CanChangeScene, as the server checks it). Closed
// scenes (the Christmas House) are left out.
type Road = { sceneId: number; level: number; nation: number }
const travel: Record<string, Road[]> = {}
const travelAnywhere: Road[] = []
for (const [target, rule] of Object.entries(switchRules)) {
  const scene = scenes[target]
  if (!scene || Number(scene.IsStart) !== 1 || CLOSED_SCENES.includes(Number(target))) continue
  const level = Math.max(Number(rule.RequireLevel ?? -1), Number(scene.Level ?? -1))
  const road = { sceneId: Number(target), level, nation: Number(scene.Nation) }
  travelAnywhere.push(road)
  for (const from of Object.keys(rule)) {
    if (from === target || !scenes[from]) continue
    ;(travel[from] ??= []).push(road)
  }
}

const sorted = <T>(o: Record<string, T>) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
const strings = Object.fromEntries(
  [...keys].filter((key) => en[key] !== undefined).map((key) => [key, en[key]!]),
)
const outputs = {
  'client/src/i18n/en.json': sorted(strings),
  'client/src/game/world-data.json': {
    levelExp: levels.levelexp,
    maxLevel: levels.role.maxlevel,
    offers: sorted(offers),
    previous: sorted(previous),
    stepArgs: sorted(stepArgs),
    travel: sorted(travel),
    travelAnywhere,
    buildings: sorted(buildings),
    equipment: [...itemIds].filter((id) => items[id]!.class === 'EquipItem').sort(),
    usable: [...itemIds]
      .filter((id) => items[id]!.class !== 'EquipItem' && Number(items[id]!.CanUse) === 1)
      .sort(),
    itemNames: sorted(Object.fromEntries([...itemIds].map((id) => [id, `lg_${items[id]!.Name}`]))),
    // Reborn item icons (ResourceID "reborn/etc/360111" -> client/public/assets/reborn/icons/items).
    rebornItemIcons: sorted(
      Object.fromEntries(
        Object.entries(rebornItems).map(([id, row]) => [
          id,
          `/assets/reborn/icons/items/${String(row.ResourceID).replace(/^reborn\//, '')}.webp`,
        ]),
      ),
    ),
    marketItemNames: sorted(
      Object.fromEntries(nameOnlyItems.map((id) => [id, `lg_${items[id]!.Name}`])),
    ),
    arenaNpcNames: sorted(arenaNpcNames),
    exploreMonsters: sorted(exploreMonsters),
  },
}
for (const [path, data] of Object.entries(outputs)) {
  writeFileSync(join(root, path), `${JSON.stringify(data)}\n`)
}
execFileSync('pnpm', ['exec', 'prettier', '--write', ...Object.keys(outputs)], { cwd: root })
process.stdout.write(
  `${Object.keys(strings).length} strings, ${Object.keys(offers).length} quest offers\n`,
)
