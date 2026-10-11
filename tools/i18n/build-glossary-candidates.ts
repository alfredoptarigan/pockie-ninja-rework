// Phase 1 of the translation: collects every proper name in the original language table
// (scenes, NPCs and monsters, items, outfits, skills, quests, titles) with the Reborn name that
// shares the same id, as a *suggestion* only: Reborn reuses some ids for different things, so the
// translator decides per entry. Writes tools/i18n/glossary.candidates.json.
// Run with `pnpm i18n:candidates` (needs the backup and `pnpm reborn:fetch`).
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseIni, type Ini } from '../game-data/ini.ts'

export type Kind = 'scene' | 'npc' | 'item' | 'outfit' | 'skill' | 'quest' | 'title'

export interface Candidate {
  key: string
  kind: Kind
  id: string
  source: string
  reborn?: string
}

interface Inputs {
  source: Record<string, string>
  reborn: Record<string, string>
  npcs: Ini
  items: Ini
}

// Reborn renumbered the villages; the original ids follow the nation's castle scene.
const REBORN_SCENE_ID: Record<string, string> = {
  '121': '211',
  '131': '311',
  '141': '411',
  '151': '511',
}
const AVATAR_ITEM_BASE = 290000

const stripTags = (text: string) => text.replace(/<[^>]+>/g, '').trim()

export function buildCandidates({ source, reborn, npcs, items }: Inputs): Candidate[] {
  const out = new Map<string, Candidate>()
  const add = (key: string, kind: Kind, id: string, rebornKey?: string) => {
    const text = source[key]
    if (!text || !stripTags(text) || out.has(key)) return
    const suggestion = rebornKey ? reborn[rebornKey] : undefined
    out.set(key, { key, kind, id, source: text, ...(suggestion ? { reborn: suggestion } : {}) })
  }
  const idsOf = (pattern: RegExp) =>
    Object.keys(source).flatMap((key) => {
      const match = pattern.exec(key)
      return match?.[1] ? [[key, match[1]] as const] : []
    })

  for (const [key, id] of idsOf(/^lg_Scene_BackGround_(\d+)$/)) {
    add(key, 'scene', id, `scene__${REBORN_SCENE_ID[id] ?? id}--name`)
  }

  for (const [section, fields] of Object.entries(npcs)) {
    const name = fields.Name
    if (typeof name !== 'string' || !section.startsWith('n')) continue
    const id = section.slice(1)
    const rebornKey = reborn[`npc__${id}--name`] ? `npc__${id}--name` : `monster__${id}--name`
    add(`lg_${name}`, 'npc', section, rebornKey)
  }

  for (const [section, fields] of Object.entries(items)) {
    const id = section.trim()
    const name = fields.Name
    if (typeof name !== 'string' || !id.startsWith('i')) continue
    // Outfit tiers (+0..+32) share one base name; they are handled as outfits below.
    if (fields.class === 'AvatarItem') continue
    add(`lg_${name}`, 'item', id, `item__${id.slice(1)}--name`)
  }

  for (const [key, id] of idsOf(/^lg_name_avatar(\d+)$/)) {
    add(key, 'outfit', id, `item__${AVATAR_ITEM_BASE + Number(id)}--name`)
  }

  for (const [key, id] of idsOf(/^lg_SkillName_(\d+)$/)) add(key, 'skill', id, `skill__${id}--name`)
  for (const [key, id] of idsOf(/^lg_Task_(\d+)$/)) add(key, 'quest', id, `quest__${id}--name`)
  for (const [key, id] of idsOf(/^lg_EffortTitle(\d+)$/)) {
    add(key, 'title', id, `title__${Number(id)}`)
  }

  return [...out.values()]
}

if (import.meta.main) {
  const backup = resolve(
    process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'),
  )
  const res = join(backup, 'app/code/props/serv/game/Resource')
  const root = resolve(import.meta.dirname, '../..')
  const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

  const candidates = buildCandidates({
    source: json(join(import.meta.dirname, 'source.id.json')),
    reborn: json(join(root, 'data/reborn-raw/locales_en_translation.json')),
    npcs: parseIni(readFileSync(join(res, 'npc/npc.ini'), 'latin1')),
    items: parseIni(readFileSync(join(res, 'item/item.ini'), 'latin1')),
  })
  const output = join(import.meta.dirname, 'glossary.candidates.json')
  writeFileSync(output, `${JSON.stringify(candidates, null, 1)}\n`)

  const counts: Record<string, number> = {}
  for (const c of candidates) counts[c.kind] = (counts[c.kind] ?? 0) + 1
  const suggested = candidates.filter((c) => c.reborn).length
  console.log(`Wrote ${candidates.length} names (${suggested} with a Reborn suggestion)`, counts)
}
