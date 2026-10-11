// Extracts the original client's Indonesian language table (the source for the English
// translation) into tools/i18n/source.id.json with the original keys, sorted for stable diffs.
// Run with `pnpm i18n:extract`. Needs the original game backup (GAME_BACKUP_DIR).
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { decodeCompressedAmf3 } from '../game-data/amf3.ts'

const backup = resolve(process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'))
const table = join(backup, 'apache/source/binary/keyvaluetable/language.s53464.kv')
const output = join(import.meta.dirname, 'source.id.json')

const decoded = decodeCompressedAmf3(readFileSync(table))
if (!decoded || typeof decoded !== 'object')
  throw new Error(`Unexpected language table in ${table}`)

const entries = Object.entries(decoded as Record<string, unknown>)
  // The first entry is the table's column header ("Key" -> "value").
  .filter(([key, value]) => key !== 'Key' && typeof value === 'string')
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

writeFileSync(output, `${JSON.stringify(Object.fromEntries(entries), null, 1)}\n`)
console.log(`Wrote ${entries.length} strings to ${output}`)
