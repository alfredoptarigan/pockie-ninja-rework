// Inventory/sample only: never writes to client/public. Requires ffmpeg for audio.
// REBORN_RAW_DIR=/path/to/raw node tools/assets/reborn-report.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import { enumerateM6 } from './reborn-fetch.ts'

const raw = resolve(process.env.REBORN_RAW_DIR ?? 'data/reborn-raw')
const read = <T>(path: string): T => JSON.parse(readFileSync(join(raw, path), 'utf8')) as T
const manifest = read<{
  assets: { category: string; id: string; path: string; bytes: number }[]
  missing: string[]
  missingDetails?: Record<string, { group: string; reason: string }>
}>('re/assets-manifest.json')
const targets = enumerateM6(
  readFileSync(join(raw, 're/main.js'), 'utf8'),
  read('re/serverConfig.json'),
  read('json_items.json'),
  read('json_loader.json'),
)
const sampleDir = join(raw, 're/m6-samples')
mkdirSync(sampleDir, { recursive: true })
const lines = [
  '# M6 asset inventory',
  '',
  'Decimal MB. Fetch-only inventory; no public assets or LFS changes.',
  '',
  'Images: WebP q80, alpha q90; icons use lossless when smaller (M5). JSON retained at raw size. Estimates use up to three evenly spaced files per extension/path class, weighted by raw bytes. Samples are in re/m6-samples. These are projections, not a size-budget approval. Absence lists include convention probes (pet portraits/icons and scene fight backgrounds), not just literal URLs. Successful existing M5 files are counted once in their M6 group, so this is group footprint rather than strictly incremental LFS growth.',
  '',
  '| Group | Files | Raw MB | Estimated MB | Formats |',
  '|---|---:|---:|---:|---|',
]
const details: string[] = []
let total = 0
for (const group of ['audio', 'pets', 'wings', 'auras', 'combat-effects', 'cards']) {
  const entries = manifest.assets.filter((e) => e.category === group)
  const classes = new Map<string, typeof entries>()
  for (const entry of entries) {
    const key =
      extname(entry.path) +
      (entry.path.startsWith('icons/')
        ? ':icon'
        : entry.path.startsWith('scenes/')
          ? ':background'
          : ':other')
    classes.set(key, [...(classes.get(key) ?? []), entry])
  }
  let estimate = 0
  const measurements: string[] = []
  for (const [key, files] of classes) {
    const bytes = files.reduce((sum, e) => sum + e.bytes, 0)
    if (key.startsWith('.json')) {
      estimate += bytes
      continue
    }
    const sorted = files.sort((a, b) => a.bytes - b.bytes)
    const samples = [
      ...new Set([sorted[0]!, sorted[Math.floor(sorted.length / 2)]!, sorted.at(-1)!]),
    ]
    let source = 0,
      converted = 0
    for (const entry of samples) {
      const input = join(raw, 'assets', entry.path)
      const output = join(sampleDir, `${group}-${entry.path.replaceAll('/', '_')}`)
      if (/\.(png|jpg|jpeg|gif|webp)$/i.test(entry.path)) {
        const lossy = await sharp(input, { animated: true })
          .webp({ quality: 80, alphaQuality: 90 })
          .toBuffer()
        const lossless = entry.path.startsWith('icons/')
          ? await sharp(input, { animated: true }).webp({ lossless: true }).toBuffer()
          : lossy
        const body = lossless.length < lossy.length ? lossless : lossy
        writeFileSync(output + '.webp', body)
        converted += body.length
      } else if (/\.(mp3|ogg|wav|m4a|opus)$/i.test(entry.path)) {
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          input,
          '-c:a',
          'libopus',
          '-b:a',
          '96k',
          output + '.ogg',
        ])
        converted += readFileSync(output + '.ogg').length
      } else {
        converted += entry.bytes
      }
      source += entry.bytes
      measurements.push(`${entry.path}: ${entry.bytes} raw bytes`)
    }
    estimate += (bytes * converted) / source
    measurements.push(
      `${key}: ${samples.length} samples, ${source} → ${converted} bytes (${(converted / source).toFixed(3)} ratio)`,
    )
  }
  total += estimate
  const formats = [...new Set(entries.map((e) => extname(e.path)))].join(', ')
  lines.push(
    `| ${group} | ${entries.length} | ${(entries.reduce((n, e) => n + e.bytes, 0) / 1e6).toFixed(3)} | ${(estimate / 1e6).toFixed(3)} | ${formats} |`,
  )
  const absent = manifest.missing.filter(
    (path) =>
      manifest.missingDetails?.[path]?.group === group ||
      targets.some((t) => t.group === group && t.path === path) ||
      (group === 'audio' && path.startsWith('audio/')) ||
      (group === 'combat-effects' && path.startsWith('entities/effects/')),
  )
  details.push(
    `## ${group}`,
    '',
    `IDs/names found: ${[...new Set(entries.map((e) => e.id))].sort().join(', ') || 'none'}`,
    '',
    `Referenced but absent (${absent.length}):`,
    ...absent.map(
      (path) =>
        `- ${path} (${manifest.missingDetails?.[path]?.reason ?? 'HTML fallback/404 from earlier run'})`,
    ),
    '',
    'Sample measurements:',
    ...measurements.map((m) => `- ${m}`),
    '',
  )
}
lines.push(
  '',
  `Total estimated committed size: ${(total / 1e6).toFixed(3)} MB.`,
  '',
  'Audio recommendation: Ogg/Opus 96 kbps for BGM; retain MP3 masters in raw storage. SFX may use a lower bitrate after listening checks. No SFX file literals were found in this bundle; playlist contains BGM only. Audio estimate uses actual sample encodes. All absence entries are 404/HTML fallback or exhausted download errors; inspect fetch stderr for transport failures.',
  '',
  ...details,
)
writeFileSync(join(raw, 're/m6-assets-report.md'), lines.join('\n') + '\n')
console.log(lines.slice(0, 16).join('\n'))
