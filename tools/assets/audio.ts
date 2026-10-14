// Run: REBORN_RAW_DIR=/path/to/data/reborn-raw node tools/assets/audio.ts (pnpm assets:audio).
// Background music for M6 (plan m6-companions, decisions 32-33): the Reborn tracks are re-encoded to
// MP3 96 kbps with ffmpeg; the 2011 tracks are copied as they are. Re-runs skip unchanged sources.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { format } from 'prettier'
import { paths } from './paths.ts'

/** Decision 32; Reborn's copies of maincity1-4 and compete3 lose to the 2011 originals. */
export const rebornTracks = ['demonCity', 'lasNoches', 'valhalla', 'tb']
/** 2011 `login.s5230.mp3` is a 209-byte stub, not music. */
const minTrackBytes = 1024
const encoding = 'libmp3lame-96k-v1'
export const trackName = (file: string) => file.replace(/(\.s\d+)?\.mp3$/, '')

export async function exportAudio(raw: string, music: string, root: string) {
  const hash = (body: Buffer) => createHash('sha256').update(body).digest('hex')
  const cacheFile = join(root, 'node_modules/.cache/reborn-audio.json')
  const cache: Record<string, { source: string; output: string }> = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, 'utf8'))
    : {}
  let writes = 0
  const write = (file: string, body: Buffer | string) => {
    const buffer = Buffer.from(body)
    if (existsSync(file) && readFileSync(file).equals(buffer)) return
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
    writes++
  }
  const tracks: Record<string, { url: string; bytes: number }> = {}
  const add = (name: string, url: string, body: Buffer) => {
    if (tracks[name]) throw new Error(`Duplicate track: ${name}`)
    tracks[name] = { url, bytes: body.length }
  }
  for (const name of rebornTracks) {
    const source = join(raw, 'assets/audio', `${name}.mp3`)
    const output = join(root, 'client/public/assets/reborn/audio', `${name}.mp3`)
    const sourceHash = `${hash(readFileSync(source))}:${encoding}`
    const hit = cache[name]
    let body: Buffer
    if (
      hit?.source === sourceHash &&
      existsSync(output) &&
      hash(readFileSync(output)) === hit.output
    )
      body = readFileSync(output)
    else {
      body = execFileSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          '-map',
          '0:a',
          '-map_metadata',
          '-1',
        ].concat(['-c:a', 'libmp3lame', '-b:a', '96k', '-f', 'mp3', 'pipe:1']),
        { maxBuffer: 1 << 30 },
      )
      cache[name] = { source: sourceHash, output: hash(body) }
    }
    write(output, body)
    add(name, `/assets/reborn/audio/${name}.mp3`, body)
  }
  for (const file of readdirSync(music)
    .filter((f) => f.endsWith('.mp3'))
    .sort()) {
    const body = readFileSync(join(music, file))
    if (body.length < minTrackBytes) continue
    const name = trackName(file)
    write(join(root, 'client/public/assets/game/audio', `${name}.mp3`), body)
    add(name, `/assets/game/audio/${name}.mp3`, body)
  }
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(cache))
  const sorted = Object.fromEntries(
    Object.entries(tracks).sort(([a], [b]) => a.localeCompare(b, 'en')),
  )
  write(
    join(root, 'client/src/generated/reborn-audio.json'),
    await format(JSON.stringify(sorted), { parser: 'json', printWidth: 100 }),
  )
  const bytes = Object.values(tracks).reduce((sum, t) => sum + t.bytes, 0)
  return { tracks: Object.keys(tracks).length, writes, megabytes: bytes / 1e6 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await exportAudio(
    resolve(process.env.REBORN_RAW_DIR ?? join(paths.root, 'data/reborn-raw')),
    join(paths.apache, 'source/music'),
    paths.root,
  )
  process.stdout.write(JSON.stringify(result) + '\n')
}
