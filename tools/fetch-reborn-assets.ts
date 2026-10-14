// Downloads Pockie Ninja Reborn's public art into data/reborn-raw/assets/ (gitignored) and writes
// data/reborn-raw/re/assets-manifest.json. Needs the reverse-engineering inputs in
// data/reborn-raw/re/ (serverConfig.json, main.js) and data/reborn-raw/locales_en_translation.json.
// Run with `node tools/fetch-reborn-assets.ts --m6` for the deferred groups. Existing files are skipped, so re-runs are cheap.
//
// URL patterns (from the production bundle main.js, CDN_PATH "assets/", offsets in characters):
// - Avatars (module 49551 @954589): entities/avatars/<n>/data.json, a Phaser multiatlas
//   avatar.json (+ every textures[].image), weapons/<id>.json for each weaponAnimations key.
// - Secret technique (@1351705, @1324023): data.json secretTechnique / secretTechniqueVariants;
//   atlas <atlas ?? "secret_technique">.json, plus <concurrentAtlas ?? concurrent>.json.
// - Avatar UI: icons/people/<n>.png, poses/<n>.png, portraits/<n>.png, icons/people51/<n>.jpg.
// - Bloodline: icons/bloodlines/{bg,limits}/<limit>.png (@2237621, @2502007),
//   icons/bloodlines/souls/<soul>.png (@2513856).
// - Talent: ui/UIResource/Talent/{bg,802,talent1..8}.png (@2543900, @2545440).
// - Skills: icons/skills/<id>.png (@1534119), entities/skills/core/<name>.json for the combat
//   table names (@1380185), entities/skills/data/<id>.json -> entities/skills/<name>.json.
// - Events: literals around @2143751 (tailed beast), @3603960 (christmas), @3659324 (summer),
//   @3774579 (akatsuki), @3834667 (hashirama), @1429471 (fight backgrounds).
// - NPCs: icons/npc/<id>.png (@931076), entities/npcs/<id>.json multiatlas.
// - M6 audio playlist @353477; entity path helpers @954700-955900, pet load @1353811.
// - Wings: WING.Line stat -> json_items wingSprite (@1392732), avatar.json @1353300.
// - Aura profiles @1334500-1337089; effects table @1358810-1363000, loader @1431000.
// - Fight backgrounds @1429435; card names/sets @3329200-3334500, prefix @3346083.
// The server answers missing files with 200 text/html (SPA fallback), so HTML means "absent".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { enumerateM6, audioPaths } from './assets/reborn-fetch.ts'
import { dirname, extname, join, posix, resolve } from 'node:path'

const BASE = 'https://pockieninjareborn.com/assets/'
const CONCURRENCY = 4
const DELAY_MS = 100
const root = resolve(import.meta.dirname, '..')
const raw = resolve(process.env.REBORN_RAW_DIR ?? join(root, 'data/reborn-raw'))
const outDir = join(raw, 'assets')
const manifestFile = join(raw, 're/assets-manifest.json')

type Entry = {
  category: string
  id: string
  url: string
  path: string
  bytes: number
  contentType: string
}
type Atlas = { textures?: { image: string }[]; meta?: { image?: string } }
type SecretTechnique = {
  damageFrame?: number
  atlas?: string
  concurrent?: string
  concurrentAtlas?: string
  variantId?: string
}
type AvatarData = {
  name?: string
  secretTechnique?: SecretTechnique
  secretTechniqueVariants?: SecretTechnique[]
  weaponAnimations?: Record<string, Record<string, unknown>>
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}
const manifest: Entry[] = []
const missing: string[] = []
const missingDetails: Record<string, { group: string; reason: string }> = {}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Downloads one asset (skipping files already on disk); returns its bytes or null if absent. */
async function fetchAsset(
  category: string,
  id: string | number,
  path: string,
): Promise<Buffer | null> {
  const file = join(outDir, path)
  const url = BASE + path.split('/').map(encodeURIComponent).join('/')
  if (existsSync(file)) {
    const body = readFileSync(file)
    record(category, id, url, path, body.length, MIME[extname(path)] ?? 'application/octet-stream')
    return body
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const type = res.headers.get('content-type') ?? ''
      if (res.status === 404 || (res.ok && type.startsWith('text/html'))) {
        await sleep(DELAY_MS)
        missing.push(path)
        missingDetails[path] = {
          group: category,
          reason: res.status === 404 ? 'HTTP 404' : 'HTML fallback',
        }
        return null
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = Buffer.from(await res.arrayBuffer())
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, body)
      record(category, id, url, path, body.length, type.split(';')[0] ?? type)
      await sleep(DELAY_MS)
      return body
    } catch (error) {
      if (attempt >= 3) {
        console.error(`failed ${path}: ${(error as Error).message}`)
        missing.push(path)
        missingDetails[path] = { group: category, reason: (error as Error).message }
        return null
      }
      await sleep(1000 * attempt)
    }
  }
}

function record(
  category: string,
  id: string | number,
  url: string,
  path: string,
  bytes: number,
  contentType: string,
) {
  manifest.push({ category, id: String(id), url, path, bytes, contentType })
}

function parseJson<T>(body: Buffer | null): T | null {
  if (!body) return null
  try {
    return JSON.parse(body.toString('utf8')) as T
  } catch {
    return null
  }
}

/** Fetches a Phaser (multi)atlas json and every page image it references. */
async function fetchAtlas(category: string, id: string | number, path: string) {
  const atlas = parseJson<Atlas>(await fetchAsset(category, id, path))
  if (!atlas) return false
  const images = [...(atlas.textures ?? []).map((t) => t.image), atlas.meta?.image].filter(
    Boolean,
  ) as string[]
  for (const image of images) await fetchAsset(category, id, posix.join(posix.dirname(path), image))
  return true
}

/** Runs tasks with at most CONCURRENCY in flight. */
async function pool<T>(items: T[], task: (item: T) => Promise<unknown>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await task(items[next++] as T)
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

const secretTechniques: Record<string, string[]> = {}

async function fetchAvatar(n: number) {
  const dir = `entities/avatars/${n}`
  const data = parseJson<AvatarData>(await fetchAsset('avatar', n, `${dir}/data.json`))
  for (const path of [
    `icons/people/${n}.png`,
    `poses/${n}.png`,
    `portraits/${n}.png`,
    `icons/people51/${n}.jpg`,
  ]) {
    await fetchAsset('avatar-ui', n, path)
  }
  if (!data) return
  await fetchAtlas('avatar', n, `${dir}/avatar.json`)
  const weaponIds = new Set(
    Object.values(data.weaponAnimations ?? {}).flatMap((byId) => Object.keys(byId)),
  )
  for (const weapon of weaponIds)
    await fetchAtlas('avatar-weapon', n, `${dir}/weapons/${weapon}.json`)
  const variants = [data.secretTechnique, ...(data.secretTechniqueVariants ?? [])].filter(
    (st): st is SecretTechnique =>
      !!st && (st.variantId !== undefined || (st.damageFrame ?? -1) > 0),
  )
  const atlases = new Set(
    variants.flatMap((st) => [
      st.atlas ?? 'secret_technique',
      ...(st.concurrent ? [st.concurrentAtlas ?? st.concurrent] : []),
    ]),
  )
  for (const atlas of atlases) {
    if (await fetchAtlas('avatar-secret-technique', n, `${dir}/${atlas}.json`)) {
      ;(secretTechniques[n] ??= []).push(atlas)
    }
  }
}

/** Combat skill ids (enum around THUNDERFALL=1802) and core atlas names (table "const Fe=") in main.js. */
function bundleSkills(bundle: string) {
  const enumStart = bundle.indexOf('e[e.BASIC_ATTACK=1]')
  const enumBlock = bundle.slice(enumStart, bundle.indexOf('}({})', enumStart))
  const ids = [...enumBlock.matchAll(/=(\d+)\]="/g)].map((m) => Number(m[1]))
  const tableStart = bundle.indexOf('const Fe={[xe.E.SECRET_TECHNIQUE]')
  const names = new Set<string>()
  if (tableStart >= 0) {
    let depth = 0
    let end = bundle.indexOf('{', tableStart)
    for (; end < bundle.length; end++) {
      if (bundle[end] === '{') depth++
      else if (bundle[end] === '}' && --depth === 0) break
    }
    for (const m of bundle.slice(tableStart, end).matchAll(/name:"([^"]+)"/g))
      names.add(m[1] as string)
  }
  return { ids, names: [...names] }
}

type Config = {
  WING: { Line: Record<string, unknown> }
  scenes: Record<string, unknown>
  avatars: Record<string, { src: string; innate?: { skills?: number[] } }>
  bloodline: {
    Limits: Record<string, { avatar: number; item: number }>
    Souls: Record<string, unknown>
  }
  skill_info: Record<string, unknown>
}

async function main() {
  const config = JSON.parse(readFileSync(join(raw, 're/serverConfig.json'), 'utf8')) as Config
  const bundle = readFileSync(join(raw, 're/main.js'), 'utf8')
  const locale = JSON.parse(
    readFileSync(join(raw, 'locales_en_translation.json'), 'utf8'),
  ) as Record<string, string>
  const limits = Object.keys(config.bloodline.Limits).map(Number)

  if (existsSync(manifestFile)) {
    const previous = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      assets: Entry[]
      missingDetails?: typeof missingDetails
      missing: string[]
      secretTechniques: Record<string, string[]>
    }
    manifest.push(...previous.assets)
    Object.assign(missingDetails, previous.missingDetails)
    Object.assign(secretTechniques, previous.secretTechniques)
    missing.push(...previous.missing)
  }

  if (process.argv.includes('--m6')) {
    const items = JSON.parse(readFileSync(join(raw, 'json_items.json'), 'utf8'))
    const loader = JSON.parse(readFileSync(join(raw, 'json_loader.json'), 'utf8'))
    const targets = enumerateM6(bundle, config, items, loader)
    const offsets = parseJson<Record<string, unknown>>(
      await fetchAsset('combat-effects', 'offsets', 'entities/effects/offsets.json'),
    )
    for (const id of Object.keys(offsets ?? {}))
      targets.push({
        group: 'combat-effects',
        id,
        path: `entities/effects/${id}.json`,
        atlas: true,
      })
    const playlist = parseJson<unknown>(
      await fetchAsset('audio', 'playlist', 'audio/playlist.json'),
    )
    for (const path of audioPaths(playlist, bundle))
      targets.push({ group: 'audio', id: path, path })
    await pool(
      [...new Map(targets.map((target) => [target.path, target])).values()],
      ({ group, id, path, atlas }) =>
        atlas ? fetchAtlas(group, id, path) : fetchAsset(group, id, path),
    )
    writeManifest()
    return
  }

  // Avatars: every outfit src, bloodline limit outfits, hashirama event leaders (@3834667).
  const avatarIds = new Set<number>([
    ...Object.values(config.avatars).map((a) => Number(a.src.split('/')[1])),
    ...Object.values(config.bloodline.Limits).map((l) => l.avatar),
    170,
    188,
  ])
  if (!process.argv.includes('--m5-missing'))
    await pool(
      [...avatarIds].sort((a, b) => a - b),
      fetchAvatar,
    )

  const items = JSON.parse(readFileSync(join(raw, 'json_items.json'), 'utf8')) as Record<
    string,
    [string]
  >
  const itemIds = [
    ...new Set([
      ...Array.from({ length: 12 }, (_, i) => 540001 + i),
      ...Array.from({ length: 12 }, (_, i) => 540101 + i),
      ...Object.values(config.bloodline.Limits).map((l) => l.item),
    ]),
  ]
  const fixed: [string, string | number, string][] = [
    ...itemIds.map((id): [string, number, string] => [
      'item-icon',
      id,
      `icons/items/${items[id]![0]}.png`,
    ]),
    ['daily-login', 'reward', 'dailylogin/reward.png'],
    ['daily-login', '20min', 'dailylogin/20min.png'],
    ['bloodline', 'menu', 'ui/newui/Bloodline.png'],
    ...limits.flatMap((id): [string, number, string][] => [
      ['bloodline', id, `icons/bloodlines/bg/${id}.png`],
      ['bloodline', id, `icons/bloodlines/limits/${id}.png`],
    ]),
    ...Object.keys(config.bloodline.Souls).map((id): [string, string, string] => [
      'bloodline',
      `soul-${id}`,
      `icons/bloodlines/souls/${id}.png`,
    ]),
    ...['bg', '802', ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `talent${i}`)].map(
      (name): [string, string, string] => ['talent', name, `ui/UIResource/Talent/${name}.png`],
    ),
    ...eventPaths().map((path): [string, string, string] => [
      'event',
      path.split('/')[1] ?? path,
      path,
    ]),
  ]
  await pool(
    process.argv.includes('--m5-missing')
      ? fixed.filter(([category]) => category === 'item-icon' || category === 'daily-login')
      : fixed,
    ([category, id, path]) => fetchAsset(category, id, path),
  )
  if (!process.argv.includes('--m5-missing')) {
    const beasts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((beast) =>
      ['', '-1', '-2'].map((stage) => `beast-${beast}${stage}`),
    )
    await pool(beasts, (beast) =>
      fetchAtlas('event', 'tailedBeast', `scenes/tailedBeast/${beast}.json`),
    )

    // Skills: icons for every known id, core combat atlases, per-skill data atlases.
    const skills = bundleSkills(bundle)
    const skillIds = new Set<number>([
      ...Object.keys(config.skill_info).map(Number),
      ...Object.values(config.avatars).flatMap((a) => a.innate?.skills ?? []),
      ...skills.ids,
    ])
    await fetchAtlas('skill-effect', 'icons', 'icons/skills.json')
    await pool([...skillIds], async (id) => {
      await fetchAsset('skill-icon', id, `icons/skills/${id}.png`)
      const data = parseJson<{ name?: string }>(
        await fetchAsset('skill-effect', id, `entities/skills/data/${id}.json`),
      )
      if (data?.name) await fetchAtlas('skill-effect', id, `entities/skills/${data.name}.json`)
    })
    await pool(skills.names, (name) =>
      fetchAtlas('skill-effect', name, `entities/skills/core/${name}.json`),
    )

    // NPC portraits and overworld sprites: ids from locale keys npc__<id>--name and scenes/npcs.json.
    const scenes = parseJson<Record<string, Record<string, unknown>>>(
      await fetchAsset('npc', 'scenes', 'scenes/npcs.json'),
    )
    const npcIds = new Set<number>([
      ...Object.keys(locale)
        .flatMap((key) => key.match(/^npc__(\d+)--/)?.[1] ?? [])
        .map(Number),
      ...Object.values(scenes ?? {}).flatMap((npcs) => Object.keys(npcs).map(Number)),
      ...limits.map((id) => 81000 + id),
    ])
    await pool([...npcIds], async (id) => {
      await fetchAsset('npc', id, `icons/npc/${id}.png`)
      await fetchAtlas('npc', id, `entities/npcs/${id}.json`)
    })
  }
  writeManifest()
}

function writeManifest() {
  const unique = [...new Map(manifest.map((e) => [e.path, e])).values()].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true }),
  )
  writeFileSync(
    manifestFile,
    `${JSON.stringify({ groups: Object.fromEntries([...new Set(unique.map((entry) => entry.category))].map((group) => [group, unique.filter((entry) => entry.category === group).map((entry) => entry.path)])), secretTechniques, missingDetails: Object.fromEntries(Object.entries(missingDetails).filter(([path]) => !unique.some((entry) => entry.path === path))), missing: [...new Set(missing)].filter((path) => !unique.some((entry) => entry.path === path)).sort(), assets: unique }, null, 1)}\n`,
  )
  const totals = new Map<string, { files: number; bytes: number }>()
  for (const e of unique) {
    const t = totals.get(e.category) ?? { files: 0, bytes: 0 }
    totals.set(e.category, { files: t.files + 1, bytes: t.bytes + e.bytes })
  }
  for (const [category, t] of totals)
    console.log(`${category}: ${t.files} files, ${(t.bytes / 1e6).toFixed(1)} MB`)
  console.log(
    `missing: ${missing.length}; outfits with secret technique: ${Object.keys(secretTechniques).length}`,
  )
}

/** Event art referenced as literals in main.js (offsets in the header comment). */
function eventPaths() {
  const akatsukiKeys = [
    'pain',
    'deidara',
    'konan',
    'itachi',
    'zetsu',
    'obito',
    'kisame',
    'kakuzu',
    'hidan',
    'sasori',
  ]
  const akatsukiSprites = [
    'pain',
    'deidara',
    'konan',
    'itachi',
    'kisame',
    'kakuzo',
    'hidan',
    'sasori',
  ]
  return [
    'scenes/tailedBeast/map.png',
    'scenes/tailedBeast/lose.png',
    'scenes/tailedBeast/villageBar.png',
    'events/christmas/token.png',
    'events/christmas/treecard.png',
    'events/christmas/treespin.png',
    'events/summer/treecard.png',
    'events/hashirama/background.jpg',
    'events/hashirama/battle.jpg',
    'events/akatsuki/combat.jpg',
    'events/akatsuki/invasion/background.png',
    ...akatsukiKeys.flatMap((key) => [
      `events/akatsuki/invasion/locked/${key}.png`,
      `events/akatsuki/invasion/locked/${key}.gif`,
    ]),
    ...akatsukiSprites.map((sprite) => `events/akatsuki/${sprite}.png`),
    'scenes/backgrounds/xmas.jpg',
    'scenes/backgrounds/summer.jpg',
    'scenes/backgrounds/xmas_fight.jpg',
    'scenes/backgrounds/summer_fight.jpg',
    'icons/buffs/christmas.png',
    'icons/buffs/summer.png',
    ...['xmas', 'summer', 'akatsuki', 'hashirama', 'tb'].map(
      (name) => `ui/buttons/topui/${name}.png`,
    ),
  ]
}

await main()
