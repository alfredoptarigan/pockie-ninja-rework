// Imports the original 2011 server and client data 1:1 into server/data/game/*.json.
// Field names stay as in the original files; numeric strings become numbers. Rows of index-numbered
// files (SubTask, DropItemLib, ...) are grouped by their ID field. Text stays as language keys;
// the client resolves them through client/src/i18n/en.json.
// Run with `pnpm game-data:import` (needs the backup at GAME_BACKUP_DIR).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { decodeCompressedAmf3 } from './amf3.ts'
import { parseIni, type Ini } from './ini.ts'

export type Value = number | string | (number | string)[]
export type Row = Record<string, Value>

const NUMBER = /^-?\d+(\.\d+)?$/

/** Numeric strings become numbers, except values whose text would change (e.g. "007"). */
export function coerce(value: string): number | string {
  return NUMBER.test(value) && String(Number(value)) === value ? Number(value) : value
}

export function toRows(ini: Ini): Record<string, Row> {
  const out: Record<string, Row> = {}
  for (const [section, fields] of Object.entries(ini)) {
    if (!section) continue
    out[section.trim()] = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(coerce) : coerce(value),
      ]),
    )
  }
  return out
}

/** For files whose sections are row indexes: group rows by `field` (dropping it from each row). */
export function groupBy(rows: Record<string, Row>, field: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  for (const row of Object.values(rows)) {
    const { [field]: id, ...rest } = row
    if (id === undefined) continue
    ;(out[String(id)] ??= []).push(rest)
  }
  return out
}

/** Client .tab files: an object of equal-length columns; row 0 is a header in newer versions. */
export function tableRows(table: Record<string, unknown[]>, { skipHeader = false } = {}): Row[] {
  const columns = Object.keys(table)
  const length = Math.max(...columns.map((column) => table[column]?.length ?? 0))
  const rows: Row[] = []
  for (let i = skipHeader ? 1 : 0; i < length; i++) {
    rows.push(
      Object.fromEntries(
        columns.map((column) => [column, coerce(String(table[column]?.[i] ?? ''))]),
      ),
    )
  }
  return rows
}

/** A key that may repeat (`r=` lines) as a list: one line parses to a plain value. */
export const lines = (value: Value | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]

/** Comma lists such as `r=i160001,20 ,1,25,5` as named rows; short lines are skipped. */
export function namedRows(value: Value | undefined, names: string[]): Row[] {
  return lines(value)
    .map((line) => line.split(',').map((part) => coerce(part.trim())))
    .filter((parts) => parts.length >= names.length)
    .map((parts) => Object.fromEntries(names.map((name, i) => [name, parts[i]!])))
}

export type StockRow = { item: string; costs: { amount: number; type: number }[] }

/**
 * Shop stock lines `r=item,price,type[,price,type...]` (npcboxitem.ini, refreshitems.ini):
 * lines with fewer than 3 parts and capital types outside 0-4 are skipped, as in
 * `NpcShopSystem.LoadResource`.
 */
export function stockRows(value: Value | undefined): StockRow[] {
  const rows: StockRow[] = []
  for (const line of lines(value)) {
    const [item, ...rest] = line.split(',').map((part) => part.trim())
    if (!item || rest.length < 2) continue
    const costs: StockRow['costs'] = []
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const type = Number(rest[i + 1])
      if (type >= 0 && type <= 4) costs.push({ amount: Number(rest[i]), type })
    }
    rows.push({ item, costs })
  }
  return rows
}

const EXPLORE_FACTORIES = ['Gost', 'Boss', 'Item', 'Key', 'Baby', 'Game'] as const

/** References with a positive weight must exist; zero-weight references are unused in Java. */
export function missingExploreFactories(
  spots: Record<string, Row>,
  factories: Record<string, Record<string, Row>>,
  includeUnused = false,
) {
  return Object.entries(spots).flatMap(([spotId, spot]) =>
    EXPLORE_FACTORIES.flatMap((kind) => {
      const factoryId = Number(spot[`${kind}FactoryID`])
      const rate = Number(spot[kind === 'Gost' ? 'GostRate' : `${kind}FactoryRate`])
      const rows = factories[kind] ?? {}
      const exists =
        kind === 'Gost' || kind === 'Game'
          ? rows[String(factoryId)] !== undefined
          : Object.values(rows).some((row) => Number(row.ID) === factoryId)
      return !exists && (includeUnused || rate > 0) ? [{ spotId, kind, factoryId }] : []
    }),
  )
}

if (import.meta.main) {
  const backup = resolve(
    process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'),
  )
  const res = join(backup, 'app/code/props/serv/game/Resource')
  const datatables = join(backup, 'apache/source/binary/datatable')
  const out = resolve(import.meta.dirname, '../../server/data/game')
  mkdirSync(out, { recursive: true })

  const ini = (path: string) => toRows(parseIni(readFileSync(join(res, path), 'latin1')))
  const tab = (file: string, options?: { skipHeader?: boolean }) =>
    tableRows(
      decodeCompressedAmf3(readFileSync(join(datatables, file))) as Record<string, unknown[]>,
      options,
    )
  const write = (name: string, data: unknown) => {
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify(data)}\n`)
    const count = Array.isArray(data) ? data.length : Object.keys(data as object).length
    console.log(`${name}: ${count}`)
  }

  // World
  write('scenes', ini('scene/logicscene.ini'))
  write('nation-scenes', ini('scene/nationscene.ini'))
  write('scene-switch-rules', ini('scene/sceneswitchrule.ini'))
  write('scene-links', ini('scene/scenequeue.ini'))
  write('scene-npcs', ini('npc/RefresNpc.ini'))
  write('scene-timed-npcs', ini('npc/RefresHeartNpc.ini'))
  write('scene-buildings', tab('scenecitybuild.s30008.tab', { skipHeader: true }))
  write('npcs', ini('npc/npc.ini'))
  write('npc-records', ini('npc/npcrecord.ini'))
  write('npc-record-values', ini('npc/npcrecordvalue.ini'))

  // Exploring
  const exploreSpots = ini('role/RoleOutSearch.ini')
  write('explore-spots', exploreSpots)
  write('explore-common', ini('role/OutSearchCommon.ini'))
  // Client-only column: the field scene element that opens a spot (-1 = none).
  write(
    'explore-clips',
    Object.fromEntries(
      tab('roleoutsearch.s26824.tab', { skipHeader: true }).map((row) => [row.ID, row.ClipName]),
    ),
  )
  const factories = Object.fromEntries(
    EXPLORE_FACTORIES.map((kind) => [kind, ini(`role/${kind}Factory.ini`)]),
  )
  const missing = missingExploreFactories(exploreSpots, factories)
  if (missing.length > 0) throw new Error(`Missing explore factories: ${JSON.stringify(missing)}`)
  for (const factory of EXPLORE_FACTORIES) {
    write(`explore-${factory.toLowerCase()}-factory`, factories[factory])
  }

  // Quests
  write('tasks', ini('task/Task.ini'))
  write('sub-tasks', groupBy(ini('task/SubTask.ini'), 'ID'))
  write('task-monster-drops', groupBy(ini('task/TaskMonsterDrop.ini'), 'ID'))

  // Items and drops
  write('items', ini('item/item.ini'))
  write('drop-libs', ini('Drop/DropLib.ini'))
  write('drop-items', groupBy(ini('Drop/DropItemLib.ini'), 'ID'))
  write('fixed-drops', groupBy(ini('Drop/FixedDropLib.ini'), 'ID'))

  // Characters, outfits, skills, levels
  write('creation-outfits', tab('creatrole.s30124.tab').slice(0, 10))
  write('avatar-stats', ini('role/RoleInitProperty.ini'))
  write('avatar-clothing', ini('Equip/avatarclothingmap.ini'))
  write('avatar-skills', ini('Equip/AvatarAddSkill.ini'))
  write('skills', ini('skill/skill.ini'))
  write('skill-adds', ini('skill/skilladd.ini'))
  write('fight-buffs', ini('skill/FightBuff.ini'))
  write('levels', ini('role/LevelExp.ini'))

  const mapValues = <T>(rows: Record<string, Row>, fn: (row: Row) => T) =>
    Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, fn(row)]))
  const stock = (path: string) => mapValues(ini(path), (row) => stockRows(row.r))

  // World (M3)
  write('except-task-scenes', groupBy(ini('task/ExceptTaskScene.ini'), 'SceneID'))
  write('level-scenes', tab('levelsceneid.s26804.tab'))

  // Daily quests (DayTaskSystem; the quests themselves are TaskBaseType 2 rows in tasks.json)
  write('daily-tasks', {
    config: ini('task/TaskPropCfg.ini').DayTaskPropConfig,
    levels: ini('task/DayTaskLevelLib.ini'),
    flushCounts: ini('task/DayTaskFlushCount.ini'),
  })

  // Shops
  write('npc-shops', {
    boxes: ini('commerce/npcbox.ini'),
    items: stock('commerce/npcboxitem.ini'),
  })
  write('refresh-shops', {
    pools: ini('commerce/refreshcontainer.ini'),
    items: stock('commerce/refreshitems.ini'),
  })
  write('mystic-shop', {
    times: ini('commerce/MysticNpcTime.ini'),
    locations: mapValues(ini('commerce/MysticNpcLocation.ini'), (row) =>
      namedRows(row.r, ['scene', 'picX', 'picY', 'scale']),
    ),
    npcs: ini('commerce/MysticNpcLib.ini'),
    items: mapValues(ini('commerce/MysticItemLib.ini'), (row) =>
      namedRows(row.r, ['item', 'price', 'bind', 'useLevel', 'maxCnt']),
    ),
    buyLimits: ini('commerce/MysticCfg.ini').MysticBuyCnt,
  })
  // Client confirm list for "sell all"; the second column is a Chinese designer note.
  write(
    'sell-ask-items',
    tab('sellaskitem.s4673.tab', { skipHeader: true }).map(({ ID, Type }) => ({ ID, Type })),
  )

  // Forge
  write('equip-config', {
    config: ini('Equip/equipPropConfig.ini').equipPropConfig,
    slots: ini('Equip/EquipDefine.ini').EquipType,
  })
  write('equip-props', ini('Equip/EquipPropDefine.ini'))
  write('enhance-fail-rates', ini('Equip/ConsolidateFailRate.ini'))
  write('inscribe-levels', {
    levels: ini('Equip/EquipInscribe.ini'),
    seals: ini('Equip/SealOdds.ini').SealOdds,
  })
  write('identify-lists', ini('Equip/EquipIdentifyIDList.ini'))
  write('identify-groups', ini('Equip/EquipIdentifyProp.ini'))
  write('identify-props', ini('Equip/IdentifyPropLib.ini'))

  // Sets
  write('equip-suits', groupBy(ini('Equip/SuitProp.ini'), 'ID'))
  write('tollgate-suits', tab('tollgoteequipsuit.s26644.tab'))

  // Demon City instances
  const gate = (file: string) => ini(`scene/clonescene/${file}.ini`)
  const gateTab = Object.fromEntries(tab('tollgate.s28263.tab').map((row) => [row.ConfigID, row]))
  write(
    'toll-gates',
    Object.fromEntries(
      Object.entries(gate('TollGate')).map(([id, row]) => {
        const { Hard, BossName, PassCondition } = gateTab[id] ?? {}
        return [id, { ...row, Hard, BossName, PassCondition } as Row]
      }),
    ),
  )
  write('toll-gate-subs', gate('SubTollGate'))
  write('toll-gate-points', gate('FightMonsterPoint'))
  write('toll-gate-groups', gate('MonsterGroup'))
  write('toll-gate-config', {
    lobby: gate('TollGateLobbyScene'),
    clone: gate('TollgateCloneScene'),
    props: gate('TollGatePropConfig').TollGatePropConfig,
    captainMul: gate('CaptianMul'),
    cards: gate('TGCardConfig').TGCardCfg,
  })
  write('toll-gate-cards', {
    gates: gate('TGCardDropId'),
    libs: groupBy(gate('TGCardDropLib'), 'ID'),
  })
  write('toll-gate-exchanges', gate('ExchangeMagicBox'))
  write('single-gate', {
    config: ini('scene/singlegate/SingleGateConfig.ini').Config,
    floors: ini('scene/singlegate/SingleGateInfo.ini'),
    floorCosts: ini('scene/singlegate/SingleFloorCfg.ini'),
  })
  const pub = (file: string) => ini(`scene/pubfightmonster/${file}.ini`)
  write('pub-fights', {
    config: pub('PubFightMonsterConfig').PubFightMonsterConfig,
    scenes: pub('PubSceneFightInfo'),
    libs: groupBy(pub('PubMonsterLibID'), 'ID'),
    rewardRules: pub('PubMonsterRewardRule'),
    drops: pub('PubMonsterDropLib'),
  })
}
