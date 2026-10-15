// Run: pnpm assets:reborn (set REBORN_RAW_DIR when data/reborn-raw is elsewhere).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { format } from 'prettier'
import { isM6Asset, m6Categories, m6Manifests } from './reborn-m6.ts'

sharp.concurrency(1)

export const scrollSkills = [
  1831, 1833, 1834, 1835, 1836, 18041, 18042, 18043, 18044, 18045, 18046, 18091,
]
type Entry = { category: string; id: string; path: string; bytes: number }
type Atlas = { textures: { image: string; frames: unknown[] }[] }
type Technique = {
  damageFrame: number
  motionFrame: number
  offset: number[]
  transforms: unknown
  atlas?: string
  variantId?: string
  concurrent?: string
  concurrentAtlas?: string
  concurrentOffset?: number[]
  concurrentOrigin?: string
  targetAnimation?: string
  holdDeathUntilReaction?: boolean
  targetVisibility?: unknown
}
type Manifest = { assets: Entry[]; secretTechniques: Record<string, string[]> }
export const webpName = (name: string) => name.replace(/\.(png|jpg|jpeg)$/i, '.webp')
export function rewriteAtlas(atlas: Atlas): Atlas {
  return {
    ...atlas,
    textures: atlas.textures.map((texture) => ({ ...texture, image: webpName(texture.image) })),
  }
}
export const ultimateId = (clothing: number) =>
  clothing <= 100 ? 1900 + clothing : 2100 + clothing
export function selectAssets(manifest: Manifest): Entry[] {
  const outfits = new Set(Object.keys(manifest.secretTechniques).filter((id) => Number(id) <= 120))
  return manifest.assets.filter(
    (e) =>
      (e.category === 'avatar-secret-technique' && outfits.has(e.id)) ||
      (e.category === 'skill-effect' &&
        scrollSkills.some(
          (id) =>
            e.path.startsWith(`entities/skills/core/${id}.`) ||
            e.path.startsWith(`entities/skills/core/${id}-`),
        )) ||
      // Every skill icon: the Skills window shows the whole ninjutsu and element grid.
      e.category === 'skill-icon' ||
      // Inventory preview poses for the outfits we play (ids up to 120, like the ultimates).
      (e.category === 'avatar-ui' && /^poses\/\d+\.png$/.test(e.path) && Number(e.id) <= 120) ||
      // Scroll Dungeons bosses past 120 (Madara Uchiha, Yamamoto Genryusai). The window's
      // features/dungeons-bg.jpg is not in the manifest: fetched and converted by hand.
      (e.category === 'avatar-ui' && /^poses\/(170|178)\.png$/.test(e.path)) ||
      e.category === 'talent' ||
      e.category === 'bloodline' ||
      e.category === 'item-icon' ||
      e.category === 'daily-login' ||
      e.category === 'hud' ||
      e.category === 'world-map' ||
      (e.category === 'npc' && /^icons\/npc\/810(0[1-9]|[1-3]\d|4[0-4])\.png$/.test(e.path)) ||
      (e.category === 'event' &&
        (e.path.startsWith('scenes/tailedBeast/') ||
          e.path.startsWith('events/tailedBeast/') ||
          e.path === 'ui/buttons/topui/tb.png')) ||
      isM6Asset(e),
  )
}
export async function exportReborn(raw: string, root: string) {
  const read = <T>(file: string): T => JSON.parse(readFileSync(join(raw, file), 'utf8')) as T
  const manifest = read<Manifest>('re/assets-manifest.json')
  const entries = selectAssets(manifest).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  const selected = new Set(entries.map((e) => e.path))
  let writes = 0,
    bytes = 0,
    sourceBytes = 0
  const write = (file: string, body: Buffer | string) => {
    const buffer = Buffer.from(body)
    if (existsSync(file) && readFileSync(file).equals(buffer)) return
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
    writes++
  }
  const publicFile = (file: string) => join(root, 'client/public/assets/reborn', file)
  const url = (file: string) => `/assets/reborn/${file}`
  const assets: Record<string, { url: string; category: string; id: string; bytes: number }> = {}
  const cacheFile = join(root, 'node_modules/.cache/reborn-images.json')
  mkdirSync(dirname(cacheFile), { recursive: true })
  const cache: Record<string, { source: string; output: string }> = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, 'utf8'))
    : {}
  const hash = (body: Buffer) => createHash('sha256').update(body).digest('hex')
  let next = 0
  const processEntry = async (entry: Entry) => {
    const source = join(raw, 'assets', entry.path)
    let cacheChanged = false
    let body: Buffer | string,
      output = entry.path
    if (/\.(png|jpg|jpeg)$/i.test(entry.path)) {
      output = webpName(output)
      const sourceHash = hash(readFileSync(source)) + ':q80-a90-icons-lossless-v1'
      const hit = cache[entry.path]
      if (
        hit?.source === sourceHash &&
        existsSync(publicFile(output)) &&
        hash(readFileSync(publicFile(output))) === hit.output
      ) {
        body = readFileSync(publicFile(output))
      } else {
        const lossy = await sharp(source).webp({ quality: 80, alphaQuality: 90 }).toBuffer()
        if (entry.path.startsWith('icons/') || entry.category === 'daily-login') {
          const lossless = await sharp(source).webp({ lossless: true }).toBuffer()
          body = lossless.length < lossy.length ? lossless : lossy
        } else body = lossy
        cache[entry.path] = { source: sourceHash, output: hash(Buffer.from(body)) }
        cacheChanged = true
      }
      sourceBytes += readFileSync(source).length
    } else if (entry.path.endsWith('.json')) {
      const atlas = read<Atlas>(`assets/${entry.path}`)
      for (const texture of atlas.textures) {
        if (!selected.has(posix.join(posix.dirname(entry.path), texture.image)))
          throw new Error(`Missing atlas page: ${entry.path}: ${texture.image}`)
      }
      body = JSON.stringify(rewriteAtlas(atlas)) + '\n'
    } else throw new Error(`Unsupported asset: ${entry.path}`)
    const length = Buffer.byteLength(body)
    write(publicFile(output), body)
    bytes += length
    if (cacheChanged) writeFileSync(cacheFile, JSON.stringify(cache))
    assets[entry.path] = { url: url(output), category: entry.category, id: entry.id, bytes: length }
  }
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < entries.length) await processEntry(entries[next++]!)
    }),
  )
  const techniques: Record<string, unknown> = {}
  const atlasRef = (file: string) => {
    if (!selected.has(file)) throw new Error(`Missing atlas: ${file}`)
    const atlas = read<Atlas>(`assets/${file}`)
    return {
      atlas: url(file),
      pages: atlas.textures.map((t) => url(posix.join(posix.dirname(file), webpName(t.image)))),
    }
  }
  const layer = (clothing: number, name: string) =>
    atlasRef(`entities/avatars/${clothing}/${name}.json`)
  const outfits = Object.keys(manifest.secretTechniques)
    .map(Number)
    .filter((n) => n <= 120)
    .sort((a, b) => a - b)
  if (outfits.length !== 100) throw new Error(`Expected 100 outfits; found ${outfits.length}`)
  for (const clothing of outfits) {
    const data = read<{ secretTechnique: Technique; secretTechniqueVariants?: Technique[] }>(
      `assets/entities/avatars/${clothing}/data.json`,
    )
    for (const st of [data.secretTechnique, ...(data.secretTechniqueVariants ?? [])]) {
      if (st.damageFrame <= 0 && !st.variantId) continue
      const skill = st.variantId
        ? Number(st.variantId.match(/^ru-(\d+)$/)?.[1])
        : ultimateId(clothing)
      if (!skill || techniques[skill])
        throw new Error(`Invalid or duplicate technique: ${clothing}: ${st.variantId}`)
      const { variantId: _variantId, concurrentAtlas, atlas, ...metadata } = st
      techniques[skill] = {
        clothing,
        ...metadata,
        ...layer(clothing, atlas ?? 'secret_technique'),
        ...(st.concurrent ? { concurrent: layer(clothing, concurrentAtlas ?? st.concurrent) } : {}),
      }
    }
  }
  const items = read<Record<string, [string]>>('json_items.json')
  const config = read<{
    bloodline: { Limits: Record<string, { item: number }> }
    petFamilies?: Record<string, number>
  }>('re/serverConfig.json')
  const itemIds = [
    ...Array.from({ length: 12 }, (_, i) => 540001 + i),
    ...Array.from({ length: 12 }, (_, i) => 540101 + i),
    ...new Set(Object.values(config.bloodline.Limits).map((limit) => limit.item)),
  ]
  for (const id of itemIds) {
    const path = `icons/items/${items[id]![0]}.png`
    if (!assets[path]) throw new Error(`Missing M5 item icon: ${id}: ${path}`)
    assets[`item:${id}`] = { ...assets[path]!, id: String(id) }
  }
  const generated = async (name: string, value: unknown) =>
    write(
      join(root, 'client/src/generated', name),
      await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }),
    )
  await generated(
    'reborn-assets.json',
    Object.fromEntries(
      Object.entries(assets)
        .filter(([, a]) => !m6Categories.has(a.category))
        .sort(([a], [b]) => a.localeCompare(b, 'en')),
    ),
  )
  await generated('reborn-secret-techniques.json', techniques)
  const m6 = m6Manifests(raw, items, config.petFamilies ?? {}, {
    atlasRef,
    has: (file) => selected.has(file),
    icon: (file) => {
      if (!assets[file]) throw new Error(`Missing M6 image: ${file}`)
      return assets[file].url
    },
  })
  for (const [name, value] of Object.entries(m6)) await generated(`reborn-${name}.json`, value)
  const groups: Record<string, number> = {}
  for (const a of Object.values(assets))
    if (m6Categories.has(a.category)) groups[a.category] = (groups[a.category] ?? 0) + a.bytes / 1e6
  return {
    groups,
    outfits: outfits.length,
    techniques: Object.keys(techniques).length,
    files: entries.length,
    writes,
    sourceBytes,
    bytes,
    megabytes: bytes / 1e6,
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..')
  const result = await exportReborn(
    resolve(process.env.REBORN_RAW_DIR ?? join(root, 'data/reborn-raw')),
    root,
  )
  process.stdout.write(JSON.stringify(result) + '\n')
}
