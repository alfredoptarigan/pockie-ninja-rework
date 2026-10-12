// Phase 2 of the translation (everything that is not a glossary name). Texts are deduplicated as
// templates: numbers outside markup become ⟨0⟩, ⟨1⟩, … so "Strength +13" and "Strength +14" are
// translated once. `prepare` writes batches with the glossary terms each batch needs; `merge`
// validates the results and writes tools/i18n/en.json (names + sentences + derived outfit tiers).
// Run with `pnpm i18n:sentences prepare` / `merge`. Rules: tools/i18n/SENTENCES_GUIDE.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GlossaryEntry } from './names.ts'

const PROTECTED = /(<[^>]*>|\{@[^}]*\})/
const NUMBER = /\d+(?:\.\d+)?/g
const SLOT = /⟨(\d+)⟩/g
const BATCH_CHARS = 30_000
const MIN_TERM_LENGTH = 4

export const plain = (text: string) => text.replace(/<[^>]+>/g, '').trim()

/** Numbers in visible text become numbered slots; markup and {@n:...} placeholders stay as is. */
export function toTemplate(text: string) {
  const numbers: string[] = []
  const template = text
    .split(PROTECTED)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(NUMBER, (value) => `⟨${numbers.push(value) - 1}⟩`),
    )
    .join('')
  return { template, numbers }
}

export function fillTemplate(template: string, numbers: string[]) {
  return template.replace(SLOT, (slot, i: string) => numbers[Number(i)] ?? slot)
}

const tokens = (text: string) =>
  [...text.matchAll(/<[^>]*>|\{@[^}]*\}|\[line\]|\[break\]|\n/g)].map((m) => m[0]).sort()

/** Problems that would break the game if the translation were used. */
export function validate(template: string, translation: string): string[] {
  const errors: string[] = []
  if (!translation.trim() && plain(template)) errors.push('empty')
  const slots = (text: string) => [...text.matchAll(SLOT)].map((m) => m[1]).sort()
  if (slots(template).join() !== slots(translation).join()) errors.push('number slots differ')
  if (tokens(template).join('\u0000') !== tokens(translation).join('\u0000')) {
    errors.push('markup or placeholders differ')
  }
  return errors
}

/** Outfit tier names ("Name ＋N") come from the +0 name; returns undefined for other keys. */
export function tierName(key: string, names: Record<string, string>) {
  const match = /^lg_avatar(\d+)$/.exec(key)
  if (!match) return undefined
  const id = Number(match[1])
  const [base, tier] =
    id >= 4001
      ? [4001 + ((id - 4001) % 20), Math.floor((id - 4001) / 20)]
      : [((id - 1) % 100) + 1, Math.floor((id - 1) / 100)]
  return names[`lg_avatar${base}`]?.replace(/\+0(?=\D*$)/, `+${tier}`)
}

function termPattern(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u')
}

if (import.meta.main) {
  const dir = import.meta.dirname
  const work = join(dir, 'work/sentences')
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
  const source: Record<string, string> = read(join(dir, 'source.id.json'))
  const glossary: Record<string, GlossaryEntry> = read(join(dir, 'glossary.json'))
  const isSentence = (key: string) => !glossary[key] && !/^lg_avatar\d+$/.test(key)
  const command = process.argv[2]

  if (command === 'prepare') {
    const indexPath = join(work, 'index.json')
    const index: Record<string, { key: string; numbers: string[] }[]> = existsSync(indexPath)
      ? read(indexPath)
      : {}
    const known = new Set(Object.values(index).flatMap((rows) => rows.map((row) => row.key)))
    const unitByTemplate = new Map<string, number>()
    for (const [n, rows] of Object.entries(index)) {
      const first = rows[0]
      if (first) unitByTemplate.set(toTemplate(source[first.key] ?? '').template, Number(n))
    }

    const fresh: { n: number; text: string }[] = []
    let next = Object.keys(index).length
    for (const [key, text] of Object.entries(source)) {
      if (known.has(key) || !isSentence(key) || !plain(text)) continue
      const { template, numbers } = toTemplate(text)
      let n = unitByTemplate.get(template)
      if (n === undefined) {
        n = next++
        unitByTemplate.set(template, n)
        fresh.push({ n, text: template })
      }
      ;(index[n] ??= []).push({ key, numbers })
    }

    const terms = new Map<string, string>()
    for (const entry of Object.values(glossary)) {
      const from = plain(entry.source)
      const to = plain(entry.en)
      if (from.length >= MIN_TERM_LENGTH && from !== to && !terms.has(from)) terms.set(from, to)
    }
    const patterns = [...terms].map(([from, to]) => [from, to, termPattern(from)] as const)

    mkdirSync(work, { recursive: true })
    writeFileSync(indexPath, JSON.stringify(index))
    let batch = readdirSync(work).filter((name) => /^batch-\d+\.json$/.test(name)).length
    let created = 0
    for (let start = 0; start < fresh.length;) {
      const units: { n: number; text: string }[] = []
      let chars = 0
      while (start < fresh.length && (chars < BATCH_CHARS || units.length === 0)) {
        const unit = fresh[start++]!
        units.push(unit)
        chars += unit.text.length
      }
      const joined = units.map((unit) => unit.text).join('\n')
      const batchTerms = Object.fromEntries(
        patterns.filter(([, , pattern]) => pattern.test(joined)).map(([from, to]) => [from, to]),
      )
      const file = join(work, `batch-${String(batch++).padStart(3, '0')}.json`)
      writeFileSync(file, `${JSON.stringify({ terms: batchTerms, units }, null, 1)}\n`)
      created++
    }
    console.log(`${fresh.length} new templates in ${created} new batches under ${work}`)
  } else if (command === 'status') {
    // Which batches still need a valid translation (see tools/i18n/HANDOFF.md).
    const todo: string[] = []
    const files = readdirSync(work)
      .filter((name) => /^batch-\d+\.json$/.test(name))
      .sort()
    for (const file of files) {
      const batch: { units: { n: number; text: string }[] } = read(join(work, file))
      const outPath = join(work, file.replace('.json', '.out.json'))
      const out: Record<string, string> = existsSync(outPath) ? read(outPath) : {}
      const bad = batch.units.filter(
        (unit) => out[unit.n] === undefined || validate(unit.text, out[unit.n]!).length > 0,
      ).length
      if (bad) todo.push(`${file.slice(6, 9)} (${bad}/${batch.units.length} left)`)
    }
    console.log(`${files.length - todo.length}/${files.length} batches done`)
    if (todo.length) console.log(`To do: ${todo.join(', ')}`)
  } else if (command === 'merge') {
    const index: Record<string, { key: string; numbers: string[] }[]> = read(
      join(work, 'index.json'),
    )
    const results: Record<string, string> = {}
    for (const file of readdirSync(work).filter((name) => name.endsWith('.out.json'))) {
      Object.assign(results, read(join(work, file)))
    }
    const names = Object.fromEntries(
      Object.entries(glossary).map(([key, entry]) => [key, entry.en]),
    )
    const en: Record<string, string> = { ...names }
    const status: Record<string, string> = {}

    for (const [n, rows] of Object.entries(index)) {
      const template = toTemplate(source[rows[0]!.key] ?? '').template
      const translation = results[n]
      const errors = translation === undefined ? ['missing'] : validate(template, translation)
      for (const { key, numbers } of rows) {
        if (errors.length) {
          en[key] = source[key] ?? ''
          status[key] = errors.join(', ')
        } else {
          en[key] = fillTemplate(translation!, numbers)
        }
      }
    }
    for (const [key, text] of Object.entries(source)) {
      if (key in en) continue
      const tier = tierName(key, names)
      en[key] = tier ?? text // markup-only or empty strings stay as they are
      if (/^lg_avatar\d+$/.test(key) && !tier && plain(text)) status[key] = 'no base outfit name'
    }

    const sorted = (o: Record<string, string>) =>
      Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(join(dir, 'en.json'), `${JSON.stringify(sorted(en), null, 1)}\n`)
    writeFileSync(join(dir, 'en.problems.json'), `${JSON.stringify(sorted(status), null, 1)}\n`)
    const problems = Object.keys(status).length
    console.log(`Wrote ${Object.keys(en).length} strings to en.json, ${problems} with problems`)
  } else {
    console.error('Usage: sentences.ts prepare|status|merge')
    process.exitCode = 1
  }
}
