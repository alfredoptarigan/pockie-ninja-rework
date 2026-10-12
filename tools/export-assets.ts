// Exports the original 2011 art into client/public/assets with JSON manifests in
// client/src/generated: the landing sprites (sprites.json) and the game assets (outfit, monster and
// NPC motion sheets in game-motions.json; village, city, field, instance and toll gate scenes in
// game-scenes.json).
// M2 item icons, weapon overlays and the text-free world map use separate new manifests
// (game-items.json, game-weapons.json, game-world-map.json); run `pnpm assets:export extra`.
// The in-game UI skin pieces go to client/public/assets/game/ui with game-ui.json.
// Run with `pnpm assets:export` (`pnpm assets:export ui` for the UI skin only). Needs the original game backup (GAME_BACKUP_DIR, default
// ~/Privates/game-pockieninja) with JPEXS FFDec and JDK 8 under local-run/.runtime. Unchanged
// sources are skipped on re-runs (cache in node_modules/.cache/pockie-assets).
// Raw SWFs never enter this repo; only the optimized WebP output and the manifests do.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { format, resolveConfig } from 'prettier'
import sharp from 'sharp'
import { ACTION_NAMES, exportMonsters, exportNpcs, exportOutfits } from './assets/characters.ts'
import { exportItems, exportWeapons, exportWorldMap } from './assets/extra.ts'
import { ffdec } from './assets/ffdec.ts'
import { paths } from './assets/paths.ts'
import { exportScenes } from './assets/scenes.ts'
import { exportUi, uiCss } from './assets/ui.ts'

const { movieclips, assets: assetsDir } = paths
const manifestPath = join(paths.generated, 'sprites.json')
// GameFighting.as switches the stage to 14 fps for battles; scenes run at 12.
const GAME_FPS = { battle: 14, scene: 12 }

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
  { slug: 'naruto', name: 'Naruto Uzumaki', avatarId: 45 },
  { slug: 'ichigo', name: 'Ichigo Kurosaki', avatarId: 1 },
  { slug: 'sasuke', name: 'Sasuke Uchiha', avatarId: 48 },
  { slug: 'rukia', name: 'Rukia Kuchiki', avatarId: 74 },
  { slug: 'gaara', name: 'Gaara', avatarId: 46 },
]

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
  await ffdec(['-zoom', String(ZOOM), '-format', 'sprite:png', '-export', 'sprite', out, swf])

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
  await ffdec(['-export', 'image', out, join(movieclips, 'ui/sceneui/loginbackgrond.s31763.swf')])
  await sharp(findEntry(out, /\.jpe?g$/))
    .extract(LOGIN_ART_CROP)
    .webp({ quality: 78 })
    .toFile(join(assetsDir, 'art/login-kyuubi.webp'))
}

async function writeJson(file: string, value: unknown) {
  const options = await resolveConfig(file)
  writeFileSync(file, await format(JSON.stringify(value), { ...options, filepath: file }))
}

async function exportLanding() {
  const work = mkdtempSync(join(paths.cache, 'landing-'))
  try {
    mkdirSync(join(assetsDir, 'sprites'), { recursive: true })
    mkdirSync(join(assetsDir, 'art'), { recursive: true })
    const manifest: Record<string, Awaited<ReturnType<typeof exportIdleStrip>>> = {}
    for (const character of characters) {
      manifest[character.slug] = await exportIdleStrip(character, work)
      console.log(`Exported ${character.name}`)
    }
    await exportLoginArt(work)
    console.log('Exported login art')
    await writeJson(manifestPath, manifest)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

async function exportGame() {
  const { outfits, missing, unnamed, skillMotions: outfitSkills } = await exportOutfits()
  const { monsters, mobs, people, skillMotions: mobSkills } = await exportMonsters()
  const { npcs, art } = await exportNpcs()
  const scenes = await exportScenes()

  await writeJson(join(paths.generated, 'game-motions.json'), {
    fps: GAME_FPS,
    actionNames: ACTION_NAMES,
    outfits,
    monsters,
    mobs,
    people,
    npcs: { placed: npcs, art },
    gaps: {
      outfitsWithoutArt: missing,
      // The backup only has a few motion SWFs for these (no stand motion).
      incompleteOutfits: Object.entries(outfits)
        .filter(([, outfit]) => !outfit.actions['999'])
        .map(([id]) => Number(id)),
      unnamedOutfits: unnamed,
    },
  })
  await writeJson(join(paths.generated, 'game-scenes.json'), scenes)
  // Skill id to motion id per character; large, so the client fetches it when a battle starts.
  writeFileSync(
    join(assetsDir, 'game/skill-motions.json'),
    JSON.stringify({ outfits: outfitSkills, mobs: mobSkills }),
  )
  console.log(
    `Exported ${Object.keys(outfits).length} outfits, ${Object.keys(mobs).length} monsters`,
  )
}

async function exportUiSkin() {
  const ui = await exportUi()
  await writeJson(join(paths.generated, 'game-ui.json'), ui)
  writeFileSync(join(paths.generated, 'game-ui.css'), uiCss(ui))
  console.log('Exported the UI skin')
}

mkdirSync(paths.cache, { recursive: true })
mkdirSync(paths.generated, { recursive: true })
async function exportExtra() {
  await writeJson(join(paths.generated, 'game-items.json'), await exportItems())
  await writeJson(join(paths.generated, 'game-world-map.json'), await exportWorldMap())
  await writeJson(join(paths.generated, 'game-weapons.json'), await exportWeapons())
}
// `pnpm assets:export [game|extra|ui]` runs one part; no argument runs everything.
const part = process.argv[2]
if (!part) await exportLanding()
if (!part || part === 'game') await exportGame()
if (!part || part === 'extra') await exportExtra()
if (!part || part === 'ui') await exportUiSkin()
