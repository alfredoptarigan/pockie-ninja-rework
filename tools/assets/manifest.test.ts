// Fails when the committed game asset manifests miss something the game data references.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arenaNpcs } from './arena.ts'
import { hasBackup, paths } from './paths.ts'
import {
  SCENES,
  monsterNpcs,
  namedClothing,
  peopleNpcs,
  sceneBuildings,
  sceneNpcs,
  tollGateScenes,
} from './sources.ts'

interface Sheet {
  file: string
  frames: number
  columns: number
  durations: number[]
}
interface MotionSet {
  actions: Record<string, string>
  motions: Record<string, Sheet>
}

const read = (name: string) => JSON.parse(readFileSync(join(paths.generated, name), 'utf8'))
const motions = read('game-motions.json') as {
  outfits: Record<string, MotionSet>
  monsters: Record<string, string>
  mobs: Record<string, MotionSet & { portrait?: string; listPortrait?: string }>
  people: Record<string, { sex: number; clothing: number; weapon: string }>
  npcs: { placed: Record<string, string>; art: Record<string, { stand?: Sheet; photo?: string }> }
  gaps: { outfitsWithoutArt: number[]; incompleteOutfits: number[] }
}
const { scenes, tollGates } = read('game-scenes.json') as {
  scenes: Record<
    string,
    {
      layers: Record<string, string>
      hotspots: Record<string, { file: string }>
      fightBackground?: string
    }
  >
  tollGates: Record<
    string,
    {
      background: string
      map: { file: string; width: number; height: number }
      fightPoint: { file: string }
      points: Record<string, { x: number; y: number; width: number; height: number }>
      fightBackground: string
    }
  >
}

// Named outfits whose motion SWFs are absent from the backup (only role placeholders exist).
const OUTFITS_WITHOUT_ART = [25, 38, 41, 68, 71]
// Named outfits with a single motion SWF (motion 52) in the backup.
const INCOMPLETE_OUTFITS = [43, 59]
// Stand, enter, run, die, victory, dodge and the two hit reactions (ActionDefine.as).
const BATTLE_ACTIONS = ['999', '75', '55', '57', '59', '68', '63', '64']

/** Keys `<prefix><n>` for n in from..to, n padded to three digits (N31001). */
const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(3, '0')}`)
// The 104 field monster keys of docs/original-data/fields-26xx-28xx.md ("Asset export list").
const FIELD_MONSTER_KEYS = [
  ...[...range('N31', 1, 3), ...range('N31', 7, 11), ...range('N31', 13, 16), 'N31018'],
  ...[...range('N31', 20, 22), 'N3102120', 'N31027', 'N31028', 'N31032', ...range('N31', 42, 51)],
  ...[...range('N32', 3, 12), ...range('N32', 15, 27), ...range('N32', 29, 32)],
  ...['N32035', 'N32036', 'N32038', 'N32048', 'N32057'],
  ...[...range('N33', 1, 5), ...range('N33', 7, 16), ...range('N33', 18, 25)],
  ...[...range('N33', 27, 29), 'N33031', ...range('N33', 33, 35), 'N33037', 'N33038'],
  ...range('N33', 40, 43),
  ...['N932014', 'N932017', 'N932019', 'N932025', 'N932030', 'N932031'],
]
// The M2 monsters of the xx01 fields.
const M2_MONSTER_KEYS = ['N32001', 'N32002', 'N33006', 'N33017', 'N33026', 'N932018']
// Toll gate (MapUserFace_*) and Las Noches floor monsters that never appear in a field.
const INSTANCE_MONSTER_KEYS = [
  ...['N31024', 'N31025', 'N31026', 'N32013', 'N32028', 'N32033', 'N32034'],
  ...[...range('N32', 39, 46), ...range('N32', 51, 56)],
]
// No NpcBackPhoto_ in the backup: the village n1x015 NPCs, two Angel City NPCs, the merchant.
const NPCS_WITHOUT_PHOTO = [
  ...['N11015', 'N12015', 'N13015', 'N14015', 'N15015', 'N16015', 'N16016', 'N28001'],
]
// NPCs that stand in their scene (fields-26xx-28xx.md "NPC art").
const STANDING_NPCS = [
  ...['N21001', 'N21002', 'N21003', 'N21004', 'N27001', 'N27002'],
  ...[...range('N26', 1, 13), ...range('N28', 2, 5)],
]

function expectPlayable(set: MotionSet | undefined, label: string) {
  expect(set, label).toBeDefined()
  for (const action of BATTLE_ACTIONS) {
    expect(set!.motions[set!.actions[action] ?? ''], `${label} action ${action}`).toBeDefined()
  }
}

function urls(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('/assets/') ? [value] : []
  if (value && typeof value === 'object') return Object.values(value).flatMap(urls)
  return []
}

describe('game asset manifests', () => {
  it('cover every named outfit with the battle actions', () => {
    const { named } = namedClothing()
    expect(named).toHaveLength(92)
    expect(motions.gaps.outfitsWithoutArt).toEqual(OUTFITS_WITHOUT_ART)
    expect(motions.gaps.incompleteOutfits).toEqual(INCOMPLETE_OUTFITS)
    const gaps = [...OUTFITS_WITHOUT_ART, ...INCOMPLETE_OUTFITS]
    for (const id of named.filter((id) => !gaps.includes(id))) {
      expectPlayable(motions.outfits[id], `outfit ${id}`)
    }
  })

  it('cover every field, toll gate and Las Noches monster', () => {
    const { keys, monsters } = monsterNpcs()
    expect([...keys].sort()).toEqual(
      [...FIELD_MONSTER_KEYS, ...M2_MONSTER_KEYS, ...INSTANCE_MONSTER_KEYS].sort(),
    )
    expect(motions.monsters).toEqual(monsters)
    for (const key of keys) {
      expectPlayable(motions.mobs[key], `monster art ${key}`)
      expect(motions.mobs[key]!.portrait, key).toBeDefined()
      expect(motions.mobs[key]!.listPortrait, key).toBeDefined()
    }
    // Explore variants and ticket boss level variants reuse their base monster's art.
    expect(motions.monsters.n330161).toBe('N33016')
    expect(motions.monsters.n320157).toBe(motions.monsters.n320140)
  })

  it.skipIf(!hasBackup)('cover the fighters drawn like players with an exported outfit', () => {
    const people = peopleNpcs()
    expect(Object.keys(people).length).toBeGreaterThan(400)
    expect(motions.people).toEqual(people)
    for (const [npcId, art] of Object.entries(people))
      expectPlayable(motions.outfits[art.clothing], `${npcId} outfit ${art.clothing}`)
  })

  it('cover the NPCs placed in every exported scene', () => {
    for (const [npcId, art] of Object.entries(sceneNpcs())) {
      expect(motions.npcs.placed[npcId], npcId).toBe(art)
      expect(motions.npcs.art[art], `art for ${npcId}`).toBeDefined()
      if (!NPCS_WITHOUT_PHOTO.includes(art))
        expect(motions.npcs.art[art]!.photo, `photo for ${npcId}`).toBeDefined()
    }
    const withoutPhoto = Object.entries(motions.npcs.art).filter(([, npc]) => !npc.photo)
    expect(withoutPhoto.map(([art]) => art).sort()).toEqual(NPCS_WITHOUT_PHOTO)
    for (const art of STANDING_NPCS) expect(motions.npcs.art[art]?.stand, art).toBeDefined()
    // The Stone Organization (N26100) has a dialog photo but no stand SWF in the backup.
    expect(motions.npcs.art.N26100?.stand).toBeUndefined()
  })

  it('cover every scene, its buildings and its fight background', () => {
    const buildings = sceneBuildings()
    for (const sceneId of SCENES) {
      const scene = scenes[sceneId]
      expect(scene?.layers.background, `scene ${sceneId}`).toBeDefined()
      for (const clip of buildings[sceneId] ?? []) {
        expect(scene?.hotspots[clip], `scene ${sceneId} ${clip}`).toBeDefined()
      }
      // Villages, the two cities and the toll gate lobby have no fights of their own.
      if (sceneId > 1000 && sceneId !== 3102)
        expect(scene?.fightBackground, `fight ${sceneId}`).toBeDefined()
    }
  })

  it.skipIf(!hasBackup)('cover the 21 toll gates with their map and fight points', () => {
    const ids = tollGateScenes().map((gate) => gate.id)
    expect(ids).toHaveLength(21)
    expect(Object.keys(tollGates).sort()).toEqual(ids)
    for (const [id, gate] of Object.entries(tollGates)) {
      expect(gate.map.width, id).toBe(1000)
      expect(gate.points.Btn_Fight0, id).toBeDefined()
      expect(gate.points.Beachhead_0, id).toBeDefined()
    }
    expect(tollGates['100021']!.fightBackground).toBe(scenes['3101']!.fightBackground)
  })

  it('have consistent sheets', () => {
    const sets = [...Object.values(motions.outfits), ...Object.values(motions.mobs)]
    for (const sheet of sets.flatMap((set) => Object.values(set.motions))) {
      expect(sheet.durations, sheet.file).toHaveLength(sheet.frames)
      expect(sheet.columns, sheet.file).toBeGreaterThan(0)
    }
  })

  it('only reference files that exist', () => {
    const missing = urls([motions, scenes, tollGates]).filter(
      (url) => !existsSync(join(paths.root, 'client/public', url)),
    )
    expect(missing).toEqual([])
  })
})

describe('game-arena.json', () => {
  const arena = read('game-arena.json') as {
    faces: Record<string, string>
    npcs: Record<string, { clothing?: number; face?: string; mob?: string }>
    mobs: Record<string, MotionSet & { portrait?: string }>
    gaps: { facesNotInBackup: number[]; weaponsWithoutLayers: string[] }
  }

  it.skipIf(!hasBackup)('covers every arena NPC with a face and an outfit, or with mob art', () => {
    const npcs = arenaNpcs()
    expect(Object.keys(npcs)).toHaveLength(375)
    expect(arena.npcs).toEqual(npcs)
    for (const [id, npc] of Object.entries(arena.npcs)) {
      if (npc.mob) {
        const art = motions.mobs[npc.mob] ?? arena.mobs[npc.mob]
        expect(art?.actions['999'], id).toBeDefined()
        expect(art?.portrait, id).toBeDefined()
      } else {
        expect(arena.faces[npc.face!], id).toBeDefined()
        expect(motions.outfits[npc.clothing!]?.actions['999'], id).toBeDefined()
      }
    }
  })

  it('has a face for every outfit with art (the gaps are the outfits the backup lacks)', () => {
    expect(arena.gaps.facesNotInBackup).toEqual(
      [...OUTFITS_WITHOUT_ART, ...INCOMPLETE_OUTFITS].sort((a, b) => a - b),
    )
  })

  it('only references files that exist', () => {
    const missing = urls(arena).filter((url) => !existsSync(join(paths.root, 'client/public', url)))
    expect(missing).toEqual([])
  })
})
