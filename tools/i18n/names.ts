// Phase 1 of the translation (names). `prepare` groups the glossary candidates into unique units
// and writes batches for translators; `merge` reads their results and writes glossary.json.
// Run with `pnpm i18n:names prepare` / `pnpm i18n:names merge`. Rules: tools/i18n/NAMES_GUIDE.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Candidate, Kind } from './build-glossary-candidates.ts'

export interface NameUnit {
  n: number
  kind: Kind
  source: string
  reborn?: string
}

export interface NameResult {
  en: string
  usedReborn: boolean
}

export interface GlossaryEntry {
  kind: Kind
  source: string
  en: string
}

const BATCH_SIZE = 250
const KIND_ORDER: Kind[] = ['scene', 'npc', 'outfit', 'skill', 'title', 'quest', 'item']

export const plain = (text: string) => text.replace(/<[^>]+>/g, '').trim()

/** One unit per distinct (kind, visible text, Reborn suggestion); keys sharing a unit share a name. */
export function groupNames(candidates: Candidate[]) {
  const byGroup = new Map<string, { unit: Omit<NameUnit, 'n'>; keys: string[] }>()
  for (const c of candidates) {
    const group = `${c.kind}\u0000${plain(c.source)}\u0000${c.reborn ?? ''}`
    const entry = byGroup.get(group)
    if (entry) entry.keys.push(c.key)
    else {
      const unit = {
        kind: c.kind,
        source: plain(c.source),
        ...(c.reborn ? { reborn: c.reborn } : {}),
      }
      byGroup.set(group, { unit, keys: [c.key] })
    }
  }
  const sorted = [...byGroup.values()].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.unit.kind) - KIND_ORDER.indexOf(b.unit.kind) ||
      a.unit.source.localeCompare(b.unit.source),
  )
  const units = sorted.map((entry, n) => ({ n, ...entry.unit }))
  const keysByUnit = Object.fromEntries(sorted.map((entry, n) => [n, entry.keys]))
  return { units, keysByUnit }
}

/** Puts the English name back inside the original markup, e.g. a coloured <font> tag. */
export function applyName(source: string, en: string) {
  const text = plain(source)
  return source === text || !source.includes(text) ? en : source.replace(text, en)
}

export function mergeNames(
  candidates: Candidate[],
  keysByUnit: Record<string, string[]>,
  results: Record<string, NameResult>,
) {
  const sourceByKey = new Map(candidates.map((c) => [c.key, c]))
  const glossary: Record<string, GlossaryEntry> = {}
  const missing: number[] = []
  for (const [n, keys] of Object.entries(keysByUnit)) {
    const result = results[n]
    if (!result?.en?.trim()) {
      missing.push(Number(n))
      continue
    }
    for (const key of keys) {
      const candidate = sourceByKey.get(key)
      if (!candidate) continue
      glossary[key] = {
        kind: candidate.kind,
        source: candidate.source,
        en: applyName(candidate.source, result.en.trim()),
      }
    }
  }
  return { glossary, missing }
}

if (import.meta.main) {
  const dir = import.meta.dirname
  const work = join(dir, 'work/names')
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
  const candidates: Candidate[] = read(join(dir, 'glossary.candidates.json'))
  const command = process.argv[2]

  if (command === 'prepare') {
    // Incremental: units that already exist keep their number, so finished batches stay valid.
    const indexPath = join(work, 'index.json')
    const previous: Record<string, string[]> = existsSync(indexPath) ? read(indexPath) : {}
    const known = new Set(Object.values(previous).flat())
    const { units, keysByUnit } = groupNames(candidates.filter((c) => !known.has(c.key)))
    const offset = Object.keys(previous).length
    const index = { ...previous }
    for (const [n, keys] of Object.entries(keysByUnit)) index[Number(n) + offset] = keys
    mkdirSync(work, { recursive: true })
    writeFileSync(indexPath, JSON.stringify(index))
    const firstBatch = readdirSync(work).filter((name) => /^batch-\d+\.json$/.test(name)).length
    let batches = 0
    for (let start = 0; start < units.length; start += BATCH_SIZE, batches++) {
      const file = join(work, `batch-${String(firstBatch + batches).padStart(2, '0')}.json`)
      const slice = units
        .slice(start, start + BATCH_SIZE)
        .map((unit) => ({ ...unit, n: unit.n + offset }))
      writeFileSync(file, `${JSON.stringify(slice, null, 1)}\n`)
    }
    console.log(`${units.length} new name units in ${batches} new batches under ${work}`)
  } else if (command === 'merge') {
    const results: Record<string, NameResult> = {}
    for (const file of readdirSync(work).filter((name) => name.endsWith('.out.json'))) {
      Object.assign(results, read(join(work, file)))
    }
    const { glossary, missing } = mergeNames(candidates, read(join(work, 'index.json')), results)
    const output = join(dir, 'glossary.json')
    const sorted = Object.fromEntries(Object.entries(glossary).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(output, `${JSON.stringify(sorted, null, 1)}\n`)
    console.log(`Wrote ${Object.keys(glossary).length} names to ${output}`)
    if (missing.length) {
      console.error(`${missing.length} units have no translation yet: ${missing.slice(0, 20)}…`)
      process.exitCode = 1
    }
  } else {
    console.error('Usage: names.ts prepare|merge')
    process.exitCode = 1
  }
}
