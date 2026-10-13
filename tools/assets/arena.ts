// Arena art (docs/original-data/pvp-rankings.md 10): the opponent faces and the 375 arena NPCs.
// ArenaFighterPanel.as loads "ArenaUserFace_<sex>_<clothing>_Role" for a player opponent and the
// NPC's ResourceID otherwise; 186 NPC keys (ArenaUserFace_N…) resolve to the same per-outfit
// pictures (Binary_PeopleNpc gives sex, clothing and weapon), the rest use monster art
// (MapUserFace_N31023, N31001). So the faces are exported once per clothing id, and the NPCs are
// drawn like players (outfit sheets + weapon layers) or with their mob art.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exportMobs, writePortrait } from './characters.ts'
import { paths } from './paths.ts'
import { iconSource, keyValueTable } from './sources.ts'

const FACE_KEY = /^ArenaUserFace_(\d)_(\d+)_Role$/
// "MapUserFace_N31023".slice(12), as in sources.ts.
const MOB_PREFIX = /^(?:Map|Out)UserFace_/

type Row = Record<string, unknown>
const json = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

export type ArenaNpc =
  { sex: number; clothing: number; weapon: string; face: string } | { mob: string }

/** Every CompeteNpc of npcs.json: drawn like a player (Binary_PeopleNpc) or with mob art. */
export function arenaNpcs() {
  const npcs = json<Record<string, Row>>(join(paths.gameData, 'npcs.json'))
  const people = keyValueTable('peoplenpc')
  const result: Record<string, ArenaNpc> = {}
  for (const id of Object.keys(npcs).sort()) {
    if (npcs[id]!.class !== 'CompeteNpc') continue
    const resource = String(npcs[id]!.ResourceID)
    const art = people[resource]
    if (art) {
      const [sex, clothing, weapon] = art.split(',')
      result[id] = {
        sex: Number(sex),
        clothing: Number(clothing),
        weapon: weapon!.toLowerCase(),
        face: clothing!,
      }
    } else if (MOB_PREFIX.test(resource)) result[id] = { mob: resource.slice(12) }
    else throw new Error(`Arena NPC ${id} has no known art (${resource})`)
  }
  return result
}

export async function exportArena() {
  const faces: Record<string, string> = {}
  // Listed in IconSourceList but absent from the backup.
  const facesNotInBackup: number[] = []
  for (const key of Object.keys(keyValueTable('iconsourcelist')).sort()) {
    const clothing = FACE_KEY.exec(key)?.[2]
    if (!clothing) continue
    if (!existsSync(iconSource(key)!)) {
      facesNotInBackup.push(Number(clothing))
      continue
    }
    const file = await writePortrait(key, `game/portraits/arena-${clothing}.webp`)
    if (file) faces[clothing] = file
  }
  const npcs = arenaNpcs()
  const motions = json<{ mobs: Record<string, unknown> }>(
    join(paths.generated, 'game-motions.json'),
  )
  const weapons = json<{ outfits: Record<string, { keys: string[] }> }>(
    join(paths.generated, 'game-weapons.json'),
  )
  // Mob art the M3 export does not have yet (N31023, the arena boss); the rest is in game-motions.
  const missingMobs = [
    ...new Set(
      Object.values(npcs).flatMap((npc) =>
        'mob' in npc && !motions.mobs[npc.mob] ? [npc.mob] : [],
      ),
    ),
  ]
  const { entries: mobs, skillMotions } = await exportMobs(missingMobs)
  const people = Object.values(npcs).filter((npc) => 'clothing' in npc)
  const facesMissing = [...new Set(people.map((npc) => npc.face))].filter((id) => !faces[id])
  if (facesMissing.length) throw new Error(`No arena face for clothing ${facesMissing.join(', ')}`)
  const weaponsWithoutLayers = [
    ...new Set(
      people
        .filter((npc) => !weapons.outfits[npc.clothing]?.keys.includes(npc.weapon))
        .map((npc) => `${npc.clothing}:${npc.weapon}`),
    ),
  ].sort()
  console.log(`Arena: ${Object.keys(faces).length} faces, ${Object.keys(npcs).length} NPCs`)
  return {
    faces,
    npcs,
    mobs,
    skillMotions,
    gaps: { facesNotInBackup: facesNotInBackup.sort((a, b) => a - b), weaponsWithoutLayers },
  }
}
