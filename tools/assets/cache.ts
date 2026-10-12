// Skip-if-unchanged cache for the export: results are keyed by a hash of their source files and
// kept in node_modules/.cache (never committed). Bump VERSION when the output format changes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths.ts'

const VERSION = 1
const file = join(paths.cache, 'cache.json')

let entries: Record<string, { hash: string; result: unknown }> | undefined

function load() {
  if (entries) return entries
  mkdirSync(paths.cache, { recursive: true })
  entries = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return entries!
}

/** Returns the cached result for `key` when `hash` matches and `outputs` exist, else runs `make`. */
export async function cached<T>(
  key: string,
  hash: string,
  outputs: string[],
  make: () => Promise<T>,
) {
  const all = load()
  const fullHash = `${VERSION}:${hash}`
  const hit = all[key]
  if (hit?.hash === fullHash && outputs.every((output) => existsSync(output)))
    return hit.result as T
  const result = await make()
  all[key] = { hash: fullHash, result }
  // Saved after every entry so an interrupted export resumes where it stopped.
  writeFileSync(file, JSON.stringify(all))
  return result
}
