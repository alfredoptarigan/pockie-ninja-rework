// Fails when the committed game asset manifests miss something the game data references.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paths } from './paths.ts'
import {
  FIELD_SCENES,
  VILLAGE_SCENES,
  fieldMonsters,
  namedClothing,
  sceneBuildings,
  sceneNpcs,
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
  mobs: Record<string, MotionSet>
  npcs: { placed: Record<string, string>; art: Record<string, { stand?: Sheet; photo?: string }> }
  gaps: { outfitsWithoutArt: number[]; incompleteOutfits: number[] }
}
const { scenes } = read('game-scenes.json') as {
  scenes: Record<
    string,
    { layers: Record<string, string>; hotspots: Record<string, { file: string }> }
  >
}

// Named outfits whose motion SWFs are absent from the backup (only role placeholders exist).
const OUTFITS_WITHOUT_ART = [25, 38, 41, 68, 71]
// Named outfits with a single motion SWF (motion 52) in the backup.
const INCOMPLETE_OUTFITS = [43, 59]
// Stand, enter, run, die, victory, dodge and the two hit reactions (ActionDefine.as).
const BATTLE_ACTIONS = ['999', '75', '55', '57', '59', '68', '63', '64']

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

  it('cover every monster of the first fields', () => {
    const monsters = fieldMonsters()
    expect(Object.keys(monsters).length).toBeGreaterThan(0)
    for (const [npcId, art] of Object.entries(monsters)) {
      expect(motions.monsters[npcId], npcId).toBe(art)
      expectPlayable(motions.mobs[art], `monster ${npcId}`)
    }
  })

  it('cover the NPCs placed in the slice scenes', () => {
    for (const [npcId, art] of Object.entries(sceneNpcs())) {
      expect(motions.npcs.placed[npcId], npcId).toBe(art)
      expect(motions.npcs.art[art], `art for ${npcId}`).toBeDefined()
    }
    // Village NPCs are buildings (hotspots); field NPCs stand in the scene.
    for (const art of ['N21001', 'N21002']) expect(motions.npcs.art[art]?.stand, art).toBeDefined()
  })

  it('cover the village and field scenes and their buildings', () => {
    const buildings = sceneBuildings()
    for (const sceneId of [...VILLAGE_SCENES, ...FIELD_SCENES]) {
      const scene = scenes[sceneId]
      expect(scene?.layers.background, `scene ${sceneId}`).toBeDefined()
      for (const clip of buildings[sceneId] ?? []) {
        expect(scene?.hotspots[clip], `scene ${sceneId} ${clip}`).toBeDefined()
      }
    }
  })

  it('have consistent sheets', () => {
    const sets = [...Object.values(motions.outfits), ...Object.values(motions.mobs)]
    for (const sheet of sets.flatMap((set) => Object.values(set.motions))) {
      expect(sheet.durations, sheet.file).toHaveLength(sheet.frames)
      expect(sheet.columns, sheet.file).toBeGreaterThan(0)
    }
  })

  it('only reference files that exist', () => {
    const missing = urls([motions, scenes]).filter(
      (url) => !existsSync(join(paths.root, 'client/public', url)),
    )
    expect(missing).toEqual([])
  })
})
