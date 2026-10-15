// Reborn's ninjutsu effects: the battle client's hard-coded skill table (the object keyed by
// `<enum>.E.SECRET_TECHNIQUE`, `Ke` in main.03c73510.js) and the effect atlases it names in
// entities/skills/core/. Every ninjutsu draws its own effect sprite from that atlas; damage lands
// on the frame whose event is "Attack" (frames sorted by number, frame "0" skipped, 12 x 1.4 fps).
// The sprite's origin is (0, 0) at the caster (the target with onTarget, the stage with global)
// plus `offset`, mirrored by the caster's facing. The bundle is parsed, never executed.
// Also exports the battle side panel art (PANEL_IMAGES) and the pet and monster skill icons.
// Run: pnpm assets:skill-effects [path/to/main.js] (default data/reborn-raw/re/main.js).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  parse,
  type AnyNode,
  type Expression,
  type Node,
  type ObjectExpression,
  type Property,
} from 'acorn'
import { format } from 'prettier'
import sharp from 'sharp'
import { rewriteAtlas, webpName } from './reborn.ts'

export interface SkillEffect {
  /** Atlas name in entities/skills/core/ (absent for effects without their own atlas). */
  name: string
  offset: [number, number]
  /** Frame (by number) whose event applies the outcome; none: at the end of the effect. */
  attackFrame?: number
  /** Frames whose event spawns another effect from this table. */
  spawns?: { frame: number; skill: number }[]
  depth?: 'behind' | 'character' | 'front'
  move?: boolean
  onTarget?: boolean
  global?: boolean
  onPet?: boolean
  /** Plays the shared hand-seal effect (`jutsu`) next to the caster at the same time. */
  jutsu?: boolean
  next?: number
  characterAnimation?: string
  targetAnimation?: string
  animationFrames?: (number | null)[]
  atlas?: string
  pages?: string[]
  /** Frame names in play order (numeric, "0" skipped like Reborn's animation builder). */
  frames?: string[]
}

type Atlas = { textures: { image: string; frames: { filename: string }[] }[] }

/** Reborn's skill animation: every frame but "0", sorted by number. */
export const playFrames = (atlas: Atlas) =>
  atlas.textures
    .flatMap((t) => t.frames.map((f) => f.filename))
    .filter((name) => name !== '0')
    .sort((a, b) => Number(a) - Number(b))

/** `e[e.NAME=1]="NAME"` / `e.NAME="52"` pairs of the enum from `marker` to its end. */
function enumBlock(bundle: string, marker: string) {
  const start = bundle.indexOf(marker)
  if (start < 0) throw new Error(`Enum not found: ${marker}`)
  const block = bundle.slice(start, bundle.indexOf('e}', start))
  const values = new Map<string, string | number>()
  // Numbers as minified: 10000 is `1e4`.
  for (const m of block.matchAll(/e\[e\.(\w+)=([\d.e]+)\]="\1"/g)) values.set(m[1]!, Number(m[2]))
  for (const m of block.matchAll(/e\.(\w+)="([^"]*)"/g)) values.set(m[1]!, m[2]!)
  return values
}

const DEPTHS = { BEHIND_CHARACTER: 'behind', CHARACTER: 'character' } as const

function findTable(ast: Node): ObjectExpression | undefined {
  let found: ObjectExpression | undefined
  const visit = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return
    const n = node as Node & Record<string, unknown>
    if (n.type === 'ObjectExpression') {
      const first = (n as unknown as ObjectExpression).properties[0]
      if (
        first?.type === 'Property' &&
        first.computed &&
        first.key.type === 'MemberExpression' &&
        first.key.property.type === 'Identifier' &&
        first.key.property.name === 'SECRET_TECHNIQUE'
      ) {
        found = n as unknown as ObjectExpression
        return
      }
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object' && 'type' in value) visit(value)
    }
  }
  visit(ast)
  return found
}

export function skillEffectTable(bundle: string): Record<string, SkillEffect> {
  const skills = enumBlock(bundle, 'e[e.BASIC_ATTACK=1]')
  const motions = enumBlock(bundle, 'e.ATTACK="52"')
  const table = findTable(parse(bundle, { ecmaVersion: 'latest', sourceType: 'script' }))
  if (!table) throw new Error('Skill effect table not found in the bundle')
  const memberName = (node: AnyNode) =>
    node.type === 'MemberExpression' && node.property.type === 'Identifier'
      ? node.property.name
      : undefined
  const skillId = (node: AnyNode) => {
    if (node.type === 'Literal' && typeof node.value === 'number') return node.value
    const id = skills.get(memberName(node) ?? '')
    if (typeof id !== 'number')
      throw new Error(`Unknown skill: ${bundle.slice(node.start, node.end)}`)
    return id
  }
  const motion = (node: AnyNode) => {
    const id = motions.get(memberName(node) ?? '')
    if (typeof id !== 'string')
      throw new Error(`Unknown motion: ${bundle.slice(node.start, node.end)}`)
    return id
  }
  const literal = (node: Expression): unknown => {
    if (node.type === 'Literal') return node.value
    if (node.type === 'UnaryExpression' && node.argument.type === 'Literal') {
      if (node.operator === '!') return !node.argument.value
      if (node.operator === '-') return -Number(node.argument.value)
    }
    throw new Error(`Not a literal: ${bundle.slice(node.start, node.end)}`)
  }
  const props = (node: Expression) =>
    node.type === 'ObjectExpression'
      ? (node.properties.filter((p) => p.type === 'Property') as Property[])
      : []
  const keyOf = (p: Property) =>
    p.key.type === 'Identifier' ? p.key.name : String((p.key as { value: unknown }).value)

  const result: Record<string, SkillEffect> = {}
  for (const entry of props(table)) {
    const id = skillId(entry.key)
    const effect: SkillEffect = { name: '', offset: [0, 0] }
    for (const p of props(entry.value as Expression)) {
      const key = keyOf(p)
      const value = p.value as Expression
      switch (key) {
        case 'name':
          effect.name = String(literal(value))
          break
        case 'offset': {
          const xy = Object.fromEntries(
            props(value).map((q) => [keyOf(q), literal(q.value as Expression)]),
          )
          effect.offset = [Number(xy.x), Number(xy.y)]
          break
        }
        case 'events':
          for (const frame of props(value)) {
            const event = props(frame.value as Expression).find((q) => keyOf(q) === 'event')
            const kind = event && memberName(event.value)
            if (kind === 'ATTACK') effect.attackFrame = Number(keyOf(frame))
            else if (kind === 'MOTION') {
              const source = bundle.slice(frame.start, frame.end)
              for (const m of source.matchAll(/\.create\(\w+,\s*\w+\.E\.(\w+)/g)) {
                const skill = skills.get(m[1]!)
                if (typeof skill === 'number')
                  (effect.spawns ??= []).push({ frame: Number(keyOf(frame)), skill })
              }
            }
          }
          break
        case 'depth': {
          const depth = memberName(value)
          effect.depth = DEPTHS[depth as keyof typeof DEPTHS] ?? 'front'
          break
        }
        case 'move':
        case 'onTarget':
        case 'global':
        case 'onPet':
        case 'jutsu':
          effect[key] = Boolean(literal(value))
          break
        case 'next':
          effect.next = skillId(value)
          break
        case 'characterAnimation':
        case 'targetAnimation':
          effect[key] = motion(value)
          break
        case 'animationFrames':
          if (value.type === 'ArrayExpression')
            effect.animationFrames = value.elements.map((e) =>
              e && e.type !== 'SpreadElement' ? (literal(e) as number | null) : null,
            )
          break
        // linked (preload list) and damageMotion (target reaction classes) carry no data we use.
      }
    }
    result[id] = effect
  }
  return result
}

const BASE = 'https://pockieninjareborn.com/assets/'
/** Table entries drawn from other art: the avatar's own frames, its ultimate, the pet. */
const NO_ATLAS = new Set(['basic_attack', 'secret_technique'])
/** Panel background, pet frame and the padlock of empty skill slots. */
const PANEL_IMAGES = [
  'ui/combat/stats.png',
  'ui/combat/pet_icon.png',
  'ui/UIResource/SkillTree/Lock4.png',
]

async function download(raw: string, path: string) {
  const file = join(raw, 'assets', path)
  if (existsSync(file)) return readFileSync(file)
  const res = await fetch(BASE + path)
  // The server answers missing files with its SPA page (200 text/html).
  if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return undefined
  const body = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
  return body
}

export async function exportSkillEffects(bundlePath: string, raw: string, root: string) {
  const table = skillEffectTable(readFileSync(bundlePath, 'utf8'))
  const names = [
    ...new Set(
      Object.values(table)
        .filter((e) => !e.onPet && !NO_ATLAS.has(e.name))
        .map((e) => e.name),
    ),
  ].sort()
  const publicDir = join(root, 'client/public/assets/reborn/entities/skills/core')
  const url = (file: string) => `/assets/reborn/entities/skills/core/${file}`
  const atlases = new Map<string, { atlas: string; pages: string[]; frames: string[] }>()
  const missing: string[] = []
  let writes = 0
  const write = (file: string, body: Buffer | string) => {
    const buffer = Buffer.from(body)
    if (existsSync(file) && readFileSync(file).equals(buffer)) return
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
    writes++
  }
  for (const name of names) {
    const json = await download(raw, `entities/skills/core/${name}.json`)
    if (!json) {
      missing.push(name)
      continue
    }
    const atlas = JSON.parse(json.toString('utf8')) as Atlas
    const pages: string[] = []
    for (const texture of atlas.textures) {
      const png = await download(raw, `entities/skills/core/${texture.image}`)
      if (!png) throw new Error(`Missing atlas page: ${name}: ${texture.image}`)
      const output = join(publicDir, webpName(texture.image))
      // Pages already in the repository stay byte-identical (Git LFS).
      if (!existsSync(output))
        write(output, await sharp(png).webp({ quality: 80, alphaQuality: 90 }).toBuffer())
      pages.push(url(webpName(texture.image)))
    }
    write(join(publicDir, `${name}.json`), JSON.stringify(rewriteAtlas(atlas)) + '\n')
    atlases.set(name, { atlas: url(`${name}.json`), pages, frames: playFrames(atlas) })
  }
  const effects = Object.fromEntries(
    Object.entries(table).map(([id, effect]) => [id, { ...effect, ...atlases.get(effect.name) }]),
  )
  write(
    join(root, 'client/src/generated/reborn-skill-effects.json'),
    await format(JSON.stringify(effects), { parser: 'json', printWidth: 100 }),
  )
  // The battle side panel's art (Reborn's fight panel component), lossless like the icons.
  for (const path of PANEL_IMAGES) {
    const png = await download(raw, path)
    if (!png) throw new Error(`Missing panel image: ${path}`)
    const output = join(root, 'client/public/assets/reborn', webpName(path))
    if (!existsSync(output)) write(output, await sharp(png).webp({ lossless: true }).toBuffer())
  }
  // Icons of the pet and monster skills shown in the panel grids (the M5 export only took the
  // players' skills): every ispet row and every NPC's AttackSkill / TriggerSkill value.
  const data = (name: string) =>
    JSON.parse(readFileSync(join(root, 'server/data/game', `${name}.json`), 'utf8')) as unknown
  const rows = data('skills') as Record<string, { ispet?: number }>
  const records = data('npc-records') as Record<string, Record<string, number>>
  const values = data('npc-record-values') as Record<string, { r: unknown }>
  const npcSkills = Object.values(records).flatMap((record) =>
    [record.AttackSkill, record.TriggerSkill].flatMap((rec) =>
      rec === undefined ? [] : [values[String(rec)]?.r ?? []].flat().map(String),
    ),
  )
  const panelIds = new Set([...Object.keys(rows).filter((id) => rows[id]!.ispet), ...npcSkills])
  const noIcon: string[] = []
  for (const id of [...panelIds].filter((id) => rows[id] && !['1', '7777', '8888'].includes(id))) {
    const output = join(root, 'client/public/assets/reborn/icons/skills', `${id}.webp`)
    if (existsSync(output)) continue
    const png = await download(raw, `icons/skills/${id}.png`)
    if (!png) noIcon.push(id)
    else {
      const lossy = await sharp(png).webp({ quality: 80, alphaQuality: 90 }).toBuffer()
      const lossless = await sharp(png).webp({ lossless: true }).toBuffer()
      write(output, lossless.length < lossy.length ? lossless : lossy)
    }
  }
  return { skills: Object.keys(effects).length, atlases: atlases.size, missing, noIcon, writes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..')
  const raw = resolve(process.env.REBORN_RAW_DIR ?? join(root, 'data/reborn-raw'))
  const bundle = resolve(process.argv[2] ?? join(raw, 're/main.js'))
  process.stdout.write(JSON.stringify(await exportSkillEffects(bundle, raw, root)) + '\n')
}
