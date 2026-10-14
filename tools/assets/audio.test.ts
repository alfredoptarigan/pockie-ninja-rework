import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { exportAudio, rebornTracks, trackName } from './audio.ts'

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

it('names tracks without the 2011 version suffix', () => {
  expect(['maincity1.s111.mp3', 'compete4.mp3', 'tb.mp3'].map(trackName)).toEqual([
    'maincity1',
    'compete4',
    'tb',
  ])
})

it.skipIf(!hasFfmpeg)(
  'encodes Reborn tracks, copies non-empty 2011 tracks and writes nothing on rerun',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'audio-test-'))
    const raw = join(root, 'raw'),
      music = join(root, 'music')
    try {
      mkdirSync(join(raw, 'assets/audio'), { recursive: true })
      mkdirSync(music)
      const tone = join(raw, 'tone.wav')
      execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=1', tone])
      for (const name of [...rebornTracks, 'maincity1.s111', 'xmasevent'])
        execFileSync('ffmpeg', [
          ...['-loglevel', 'error', '-i', tone, '-b:a', '192k'],
          join(raw, 'assets/audio', `${name}.mp3`),
        ])
      const original = readFileSync(join(raw, 'assets/audio/tb.mp3'))
      writeFileSync(join(music, 'maincity1.s111.mp3'), original)
      writeFileSync(join(music, 'login.s5230.mp3'), Buffer.alloc(209))
      const first = await exportAudio(raw, music, root)
      expect(first).toMatchObject({ tracks: 5, writes: 6 })
      const manifest = JSON.parse(
        readFileSync(join(root, 'client/src/generated/reborn-audio.json'), 'utf8'),
      )
      expect(Object.keys(manifest)).toEqual([
        'demonCity',
        'lasNoches',
        'maincity1',
        'tb',
        'valhalla',
      ])
      expect(manifest.maincity1).toEqual({
        url: '/assets/game/audio/maincity1.mp3',
        bytes: original.length,
      })
      expect(manifest.tb.url).toBe('/assets/reborn/audio/tb.mp3')
      expect(manifest.tb.bytes).toBeLessThan(original.length)
      expect((await exportAudio(raw, music, root)).writes).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  30000,
)
