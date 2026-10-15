// Buff icons and text for the HUD buff row (HudBuffs.tsx): Reborn's own icons, inlined as base64
// PNGs in main.js (the `wi` table its buff icon component `ji` reads, keyed by buff id), and for
// every other non-fight buff the 2011 icon named by unfightbuff's ResourceID (Icon_BuffN ->
// bitmap/icon/buff/icon_buffN.*). Buffs without a ResourceID (titles) have no icon. Names and
// effect lines are Reborn's `buff__{id}--name` / `--tooltip` locale strings.
// Run: pnpm assets:buffs (REBORN_RAW_DIR and GAME_BACKUP_DIR as for the other exporters).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { decodeCompressedAmf3 } from '../game-data/amf3.ts'
import { assetUrl, paths } from './paths.ts'

/** main.js `{80101:"data:image/png;base64,...",...}` after `["buffId","alt"]`. */
export function rebornBuffIcons(mainJs: string): Record<string, Buffer> {
  const start = mainJs.indexOf('["buffId","alt"]')
  if (start < 0) throw new Error('Buff icon table not found in main.js')
  const table = mainJs.slice(start, mainJs.indexOf('}', start))
  return Object.fromEntries(
    [...table.matchAll(/(\d+):"data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)].map(([, id, data]) => [
      id!,
      Buffer.from(data!, 'base64'),
    ]),
  )
}

/** unfightbuff ID -> icon number (Icon_Buff55 -> "55"); "0" and the header row are skipped. */
export function originalBuffIcons(table: { ID: string[]; ResourceID: string[] }) {
  const icons: Record<string, string> = {}
  table.ID.forEach((id, index) => {
    const match = /^Icon_Buff(\d+)$/.exec(table.ResourceID[index] ?? '')
    if (match && /^\d+$/.test(id)) icons[id] = match[1]!
  })
  return icons
}

const webp = (input: Buffer | string, file: string) =>
  sharp(input).webp({ lossless: true }).toFile(join(paths.assets, file))

type BuffEntry = { icon?: string; name?: string; effect?: string }

/** Reborn's `buff__{id}--name` and `--tooltip` strings by buff id. */
export function rebornBuffText(locale: Record<string, unknown>) {
  const text: Record<string, BuffEntry> = {}
  for (const [key, value] of Object.entries(locale)) {
    const match = /^buff__(\d+)--(name|tooltip)$/.exec(key)
    if (!match || typeof value !== 'string') continue
    text[match[1]!] = { ...text[match[1]!], [match[2] === 'name' ? 'name' : 'effect']: value }
  }
  return text
}

export async function exportBuffs(rawDir: string) {
  const urls: Record<string, string> = {}
  const original = originalBuffIcons(
    decodeCompressedAmf3(
      readFileSync(join(paths.apache, 'source/binary/datatable/unfightbuff.s35782.tab')),
    ) as { ID: string[]; ResourceID: string[] },
  )
  const iconDir = join(paths.apache, 'source/bitmap/icon/buff')
  const sources = readdirSync(iconDir)
  mkdirSync(join(paths.assets, 'game/icons/buffs'), { recursive: true })
  for (const icon of new Set(Object.values(original))) {
    const source = sources.find((file) => file.startsWith(`icon_buff${icon}.`))
    if (!source) throw new Error(`Missing 2011 buff icon ${icon}`)
    await webp(join(iconDir, source), `game/icons/buffs/${icon}.webp`)
  }
  for (const [id, icon] of Object.entries(original))
    urls[id] = assetUrl(`game/icons/buffs/${icon}.webp`)
  mkdirSync(join(paths.assets, 'reborn/icons/buffs'), { recursive: true })
  for (const [id, png] of Object.entries(
    rebornBuffIcons(readFileSync(join(rawDir, 're/main.js'), 'utf8')),
  )) {
    await webp(png, `reborn/icons/buffs/${id}.webp`)
    urls[id] = assetUrl(`reborn/icons/buffs/${id}.webp`)
  }
  const text = rebornBuffText(
    JSON.parse(readFileSync(join(rawDir, 'locales_en_translation.json'), 'utf8')) as Record<
      string,
      unknown
    >,
  )
  const buffs = Object.fromEntries(
    [...new Set([...Object.keys(urls), ...Object.keys(text)])]
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => [id, { icon: urls[id], ...text[id] }]),
  )
  writeFileSync(join(paths.generated, 'buffs.json'), JSON.stringify(buffs, null, 2) + '\n')
  return Object.keys(buffs).length
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const raw = resolve(process.env.REBORN_RAW_DIR ?? join(paths.root, 'data/reborn-raw'))
  process.stdout.write(`${await exportBuffs(raw)} buffs\n`)
}
