// Outfits (player characters), the field monsters and the scene NPCs: motion sheets, the
// action-to-motion tables of the original client and portraits.
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import sharp from 'sharp'
import { mapLimit } from './ffdec.ts'
import { exportMotions, type Motion, type MotionFile } from './motions.ts'
import { exportRebornOutfit, REBORN_ONLY_CLOTHING } from './reborn-outfits.ts'
import { assetUrl, paths } from './paths.ts'
import {
  backupPath,
  iconSource,
  monsterNpcs,
  motionIdOf,
  motionSourceList,
  outfits,
  peopleNpcs,
  sceneNpcs,
} from './sources.ts'

// Each FFDec export is one JVM using up to 1.2 GB; three in parallel suit an 8 GB machine.
const PARALLEL_EXPORTS = 3
// Motions 60 (big victory) and 800 (provoke) only play for outfits upgraded past +18
// (BeDie.as, StartFighting.as). They are huge effect animations (about 1.2 MB per outfit, more than
// all other motions together), so they are left out until upgrades that far exist.
const HIGH_TIER_MOTIONS = new Set(['60', '800'])
// ActionDefine.as: the battle actions every character has (skills use "9_<skill id>").
export const ACTION_NAMES: Record<string, string> = {
  '999': 'stand',
  '75': 'enter',
  '900': 'arenaEnter',
  '101': 'switchIn',
  '55': 'run',
  '57': 'die',
  '59': 'victory',
  '60': 'bigVictory',
  '68': 'dodge',
  '63': 'hitLight',
  '64': 'hitHeavy',
  '80': 'stunned',
  '800': 'provoke',
}

export interface MotionSet {
  /** Action id (see ACTION_NAMES) to the motion id that plays it. */
  actions: Record<string, string>
  motions: Record<string, Motion>
}

/** Action and skill tables for keys `<prefix><action><suffix>` of the motion source list. */
function actionTables(prefix: string, suffix: string) {
  const actions: Record<string, string> = {}
  const skills: Record<string, string> = {}
  for (const [key, path] of Object.entries(motionSourceList())) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
    const action = key.slice(prefix.length, key.length - suffix.length)
    const motion = motionIdOf(basename(path.replaceAll('\\', '/')))
    if (action.startsWith('9_')) skills[action.slice(2)] = motion
    else actions[action] = motion
  }
  return { actions, skills }
}

/** Motion SWFs of a folder, one per motion id (the version the source list uses, else the newest). */
function motionFiles(dir: string, used: Set<string>): MotionFile[] {
  const byMotion = new Map<string, string>()
  for (const file of readdirSync(dir)
    .filter((name) => /^motion_.*\.swf$/i.test(name))
    .sort()) {
    const motion = motionIdOf(file)
    const current = byMotion.get(motion)
    if (!current || used.has(join(dir, file)) || !used.has(current))
      byMotion.set(motion, join(dir, file))
  }
  return [...byMotion].map(([motion, path]) => ({ motion, path }))
}

function usedPaths() {
  return new Set(Object.values(motionSourceList()).map(backupPath))
}

export async function writePortrait(key: string, relative: string) {
  const source = iconSource(key)
  if (!source) return undefined
  mkdirSync(dirname(join(paths.assets, relative)), { recursive: true })
  await sharp(source).webp({ quality: 85, alphaQuality: 90 }).toFile(join(paths.assets, relative))
  return assetUrl(relative)
}

const exportedFolders = new Map<string, ReturnType<typeof exportMotions>>()

/** Motion sheets plus the action and skill tables (only entries whose motion was exported). */
async function exportCharacter(
  files: MotionFile[],
  outDir: string,
  keyPrefix: string,
  keySuffix: string,
) {
  // Some art keys share a motion folder (N3102120 uses N32056's): export each folder once.
  let exported = exportedFolders.get(outDir)
  if (!exported) exportedFolders.set(outDir, (exported = exportMotions(files, outDir)))
  const { motions, skipped } = await exported
  const { actions, skills } = actionTables(keyPrefix, keySuffix)
  const resolvable = (table: Record<string, string>) =>
    Object.fromEntries(Object.entries(table).filter(([, motion]) => motions[motion]))
  return { actions: resolvable(actions), motions, skipped, skills: resolvable(skills) }
}

/** Splits [id, { skills, ...rest }] results into the manifest entries and the skill tables. */
function splitSkills<T extends { skills: Record<string, string> }>(
  results: (readonly [string, T])[],
) {
  return {
    entries: Object.fromEntries(results.map(([id, { skills: _skills, ...rest }]) => [id, rest])),
    skillMotions: Object.fromEntries(results.map(([id, { skills }]) => [id, skills])),
  }
}

export async function exportOutfits() {
  const { found, missing, unnamed } = outfits()
  const used = usedPaths()
  const results = await mapLimit(found, PARALLEL_EXPORTS, async (outfit) => {
    const id = String(outfit.clothing)
    const files = motionFiles(outfit.dir, used).filter(
      ({ motion }) => !HIGH_TIER_MOTIONS.has(motion),
    )
    const set = await exportCharacter(
      files,
      `game/outfits/${id}`,
      `Motion_${outfit.sex}_${id}_`,
      '_Role',
    )
    const portrait = await writePortrait(
      `UserFace_${outfit.sex}_${id}_Role`,
      `game/portraits/outfit-${id}.webp`,
    )
    console.log(`Outfit ${id}: ${Object.keys(set.motions).length} motions`)
    return [id, { sex: outfit.sex, portrait, ...set }] as const
  })
  const { entries, skillMotions } = splitSkills(results)
  const raw = process.env.REBORN_RAW_DIR ?? join(paths.root, 'data/reborn-raw')
  for (const clothing of REBORN_ONLY_CLOTHING)
    if (existsSync(join(raw, `assets/entities/avatars/${clothing}/avatar.json`)))
      entries[String(clothing)] = await exportRebornOutfit(raw, clothing)
  return { outfits: entries, missing, unnamed, skillMotions }
}

/** Monster art (field monsters, toll gate and Las Noches NPCs); people NPCs reuse outfit art. */
export async function exportMonsters() {
  const { keys: resources, monsters } = monsterNpcs()
  const used = usedPaths()
  const results = await mapLimit(resources, PARALLEL_EXPORTS, (resource) =>
    exportMonsterArt(resource, used),
  )
  const { entries, skillMotions } = splitSkills(results)
  return { monsters, mobs: entries, people: peopleNpcs(), skillMotions }
}

/** Mob art keys (e.g. N33017) as `exportMonsters` writes them: sheets, portrait, list portrait. */
export async function exportMobs(resources: string[]) {
  const used = usedPaths()
  const results = await mapLimit(resources, PARALLEL_EXPORTS, (resource) =>
    exportMonsterArt(resource, used),
  )
  return splitSkills(results)
}

async function exportMonsterArt(resource: string, used: Set<string>) {
  const stand = motionSourceList()[`${resource}_Motion_999`]
  if (!stand) throw new Error(`No motions for monster art ${resource}`)
  const dir = dirname(backupPath(stand))
  const set = await exportCharacter(
    motionFiles(dir, used),
    `game/mobs/${basename(dir)}`,
    `${resource}_Motion_`,
    '',
  )
  const portrait = await writePortrait(`UserFace_${resource}`, `game/portraits/${resource}.webp`)
  // N3102120 and N31032 (ticket bosses) have no list icon; the battle portrait stands in.
  const listPortrait =
    (await writePortrait(`MapUserFace_${resource}`, `game/portraits/${resource}-list.webp`)) ??
    portrait
  console.log(`Monster art ${resource}: ${Object.keys(set.motions).length} motions`)
  return [resource, { portrait, listPortrait, ...set }] as const
}

/** NPC art: the standing animation (field NPCs) and the dialog picture (all NPCs). */
export async function exportNpcs() {
  const npcs = sceneNpcs()
  const resources = [...new Set(Object.values(npcs))]
  const npcDir = join(paths.movieclips, 'npc')
  const results = await mapLimit(resources, PARALLEL_EXPORTS, async (resource) => {
    const swf = readdirSync(npcDir).find((file) =>
      new RegExp(`^${resource}(\\.s\\d+)?\\.swf$`, 'i').test(file),
    )
    const stand = swf
      ? (
          await exportMotions(
            [{ motion: 'stand', path: join(npcDir, swf) }],
            `game/npcs/${resource}`,
          )
        ).motions.stand
      : undefined
    const photo = await writePortrait(
      `NpcBackPhoto_${resource}`,
      `game/npcs/${resource}-photo.webp`,
    )
    return [resource, { stand, photo }] as const
  })
  return { npcs, art: Object.fromEntries(results) }
}
