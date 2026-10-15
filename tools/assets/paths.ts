import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const backup = resolve(process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'))
const root = resolve(import.meta.dirname, '../..')

export const paths = {
  root,
  backup,
  runtime: join(backup, 'local-run/.runtime'),
  /** Client resources; source tables store paths relative to this folder. */
  apache: join(backup, 'apache'),
  movieclips: join(backup, 'apache/source/movieclip'),
  keyValueTables: join(backup, 'apache/source/binary/keyvaluetable'),
  gameData: join(root, 'server/data/game'),
  english: join(root, 'tools/i18n/en.json'),
  assets: join(root, 'client/public/assets'),
  generated: join(root, 'client/src/generated'),
  cache: join(root, 'node_modules/.cache/pockie-assets'),
}

/** Public URL of a file under client/public/assets. */
export function assetUrl(relative: string) {
  return `/assets/${relative}`
}

/** Whether the original game backup is on this machine; tests that read it skip without it. */
export const hasBackup = existsSync(join(backup, 'apache/source/binary'))
