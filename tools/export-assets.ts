// Exports the original 2011 art used by the landing site into client/public/assets.
// Run with `pnpm assets:export`. Needs the original game backup (GAME_BACKUP_DIR, default
// ~/Privates/game-pockieninja) with JPEXS FFDec and JDK 8 under local-run/.runtime.
// Raw SWFs never enter this repo; only the optimized WebP output and a JSON manifest do.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const backup = resolve(process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'))
const runtime = join(backup, 'local-run/.runtime')
const java = join(runtime, 'jdk8/bin/java')
const ffdec = join(runtime, 'ffdec/ffdec.jar')
const movieclips = join(backup, 'apache/source/movieclip')

const root = resolve(import.meta.dirname, '..')
const assetsDir = join(root, 'client/public/assets')
const manifestPath = join(root, 'client/src/generated/sprites.json')

// Sprites are small bitmaps; 2x keeps them sharp enough for the hero without obvious blur.
const ZOOM = 2
// The original client ran at 12 frames per second.
const FPS = 12
// Motion 7 is shared by every avatar: a turn that settles into a breathing 3/4 standing pose.
// Frames 5-11 (1-based) are that pose and loop cleanly.
const STAND_MOTION = 7
const STAND_FRAMES = { first: 5, last: 11 }
// The login art carries Chinese promo text on the right; keep the left part (Naruto and Kyuubi).
const LOGIN_ART_CROP = { left: 0, top: 0, width: 1120, height: 1080 }

const characters = [
  { slug: 'naruto', name: 'Uzumaki Naruto', avatarId: 45 },
  { slug: 'ichigo', name: 'Kurosaki Ichigo', avatarId: 1 },
  { slug: 'sasuke', name: 'Uchiha Sasuke', avatarId: 48 },
  { slug: 'rukia', name: 'Kuchiki Rukia', avatarId: 74 },
  { slug: 'gaara', name: 'Gaara', avatarId: 46 },
]

function ffdecExport(args: string[]) {
  execFileSync(java, ['-Djava.awt.headless=true', '-jar', ffdec, ...args], { stdio: 'pipe' })
}

function findEntry(dir: string, pattern: RegExp) {
  const entry = readdirSync(dir).find((name) => pattern.test(name))
  if (!entry) throw new Error(`Nothing matching ${pattern} in ${dir}`)
  return join(dir, entry)
}

async function exportIdleStrip(character: (typeof characters)[number], work: string) {
  const peopleDir = join(movieclips, 'motion/people', `people_${character.avatarId}`)
  // File names are motion_<body type>_<avatar>_<motion>_role*.swf (body type 0 male, 1 female).
  const swf = findEntry(
    peopleDir,
    new RegExp(`^motion_\\d+_${character.avatarId}_${STAND_MOTION}_role.*\\.swf$`),
  )
  const out = join(work, character.slug)
  ffdecExport(['-zoom', String(ZOOM), '-format', 'sprite:png', '-export', 'sprite', out, swf])

  const spriteDir = findEntry(out, /MotionSource$/)
  const frames = readdirSync(spriteDir)
    .filter((name) => name.endsWith('.png'))
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
    .slice(STAND_FRAMES.first - 1, STAND_FRAMES.last)
    .map((name) => join(spriteDir, name))
  const sizes = await Promise.all(frames.map((frame) => sharp(frame).metadata()))
  const frameWidth = Math.max(...sizes.map((size) => size.width ?? 0))
  const frameHeight = Math.max(...sizes.map((size) => size.height ?? 0))

  const file = `sprites/${character.slug}-stand.webp`
  await sharp({
    create: {
      width: frameWidth * frames.length,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, index) => ({ input, left: index * frameWidth, top: 0 })))
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(join(assetsDir, file))

  return {
    name: character.name,
    file: `/assets/${file}`,
    frames: frames.length,
    frameWidth,
    frameHeight,
    fps: FPS,
  }
}

async function exportLoginArt(work: string) {
  const out = join(work, 'login')
  ffdecExport(['-export', 'image', out, join(movieclips, 'ui/sceneui/loginbackgrond.s31763.swf')])
  await sharp(findEntry(out, /\.jpe?g$/))
    .extract(LOGIN_ART_CROP)
    .webp({ quality: 78 })
    .toFile(join(assetsDir, 'art/login-kyuubi.webp'))
}

const work = mkdtempSync(join(tmpdir(), 'pockie-assets-'))
try {
  mkdirSync(join(assetsDir, 'sprites'), { recursive: true })
  mkdirSync(join(assetsDir, 'art'), { recursive: true })
  mkdirSync(join(root, 'client/src/generated'), { recursive: true })

  const manifest: Record<string, Awaited<ReturnType<typeof exportIdleStrip>>> = {}
  for (const character of characters) {
    manifest[character.slug] = await exportIdleStrip(character, work)
    console.log(`Exported ${character.name}`)
  }
  await exportLoginArt(work)
  console.log('Exported login art')

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
