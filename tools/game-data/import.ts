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
  write('explore-spots', ini('role/RoleOutSearch.ini'))
  write('explore-common', ini('role/OutSearchCommon.ini'))
  for (const factory of ['Gost', 'Boss', 'Item', 'Key', 'Baby', 'Game']) {
    write(`explore-${factory.toLowerCase()}-factory`, ini(`role/${factory}Factory.ini`))
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
  write('levels', ini('role/LevelExp.ini'))
}
