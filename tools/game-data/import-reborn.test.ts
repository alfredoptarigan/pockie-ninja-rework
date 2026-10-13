import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReborn, defaultRawDir, mapStat, readRaw, STAT_FIELDS } from './import-reborn.ts'

const root = resolve(import.meta.dirname, '../..')
const json = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const reborn = <T>(name: string) => json<T>(`server/data/game/reborn/${name}.json`)

type Bonus = { stat: number; field: string; value: number }
type Limit = { id: number; nameKey: string; npcNameKey: string; bonus: Bonus[] }
type Bloodlines = { limits: Limit[]; stats: Record<string, { label: string; field: string }> }
type SoulType = { id: number; nameKey: string; stat: number; field: string; valueByLevel: number[] }
type Souls = { types: SoulType[]; levelLimits: number[] }
type Talents = {
  talents: { id: number; nameKey: string }[]
  costs: [number, number][]
  expNeeded: number[]
}

describe('mapStat (decision 11)', () => {
  it('scales attributes x100 and keeps combat ratings 1:1', () => {
    expect(mapStat(1, 30)).toEqual({ stat: 1, field: 'strength', value: 3000 })
    expect(mapStat(17, 43)).toEqual({ stat: 17, field: 'tough', value: 43 })
    expect(mapStat(9, 37)).toEqual({ stat: 9, field: 'hpMul', value: 37 })
    expect(mapStat(31, 3)).toEqual({ stat: 31, field: 'skillAdd0', value: 3 })
  })

  it('fails loudly on a stat id it does not know', () => {
    expect(() => mapStat(14, 10)).toThrow(/Unknown Reborn stat id 14/)
    expect(() => mapStat(99, 1)).toThrow(/Unknown Reborn stat id 99/)
  })
})

describe('generated overlay (server/data/game/reborn)', () => {
  it('has 8 talents, 80 cost rows and 60 EXP steps', () => {
    const talents = reborn<Talents>('talents')
    expect(talents.talents.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(talents.costs).toHaveLength(80)
    expect(talents.costs[0]).toEqual([2, 10000])
    expect(talents.costs[9]).toEqual([11, 5120000])
    expect(talents.costs.slice(0, 40).reduce((sum, [gold]) => sum + gold, 0)).toBe(584)
    expect(talents.expNeeded).toHaveLength(60)
    expect(talents.expNeeded.slice(0, 3)).toEqual([100, 240, 410])
  })

  it('has 44 limits whose bonus ids are all mapped', () => {
    const { limits } = reborn<Bloodlines>('bloodlines')
    expect(limits).toHaveLength(44)
    const ids = new Set(limits.flatMap((limit) => limit.bonus.map((b) => b.stat)))
    expect(ids.size).toBe(24)
    for (const id of ids) expect(STAT_FIELDS[id]).toBeDefined()
    expect(limits[0]).toMatchObject({
      requiredLevel: 16,
      unlockItem: 'i148023',
      amity: 30,
      npcId: 81001,
      npcOutfit: 'i290016',
      base: { strength: 2300, agility: 1100, stamina: 2300 },
      bonus: [
        { stat: 36, field: 'skillAdd5', value: 2 },
        { stat: 17, field: 'tough', value: 43 },
        { stat: 1, field: 'strength', value: 3000 },
      ],
    })
  })

  it('has 13 soul types with level limits clamped to 90 (decision 13)', () => {
    const souls = reborn<Souls>('souls')
    expect(souls.types).toHaveLength(13)
    for (const type of souls.types) expect(type.valueByLevel).toHaveLength(11)
    expect(souls.levelLimits).toEqual([25, 25, 25, 36, 36, 51, 71, 71, 90, 90])
    expect(souls.types.map((t) => t.field)).toEqual([
      'defense',
      'neglectDefense',
      'dodge',
      'hit',
      'crit',
      'tough',
      'hp',
      'mp',
      'pierce',
      'parry',
      'minAttack',
      'maxAttack',
      'atkTimeMul',
    ])
  })

  it('has 12 scroll skills and 24 scroll items (7-day and permanent)', () => {
    const skills = reborn<Record<string, { type: number; probability: number }>>('skills')
    expect(Object.keys(skills).map(Number)).toEqual([
      1831, 1833, 1834, 1835, 1836, 18041, 18042, 18043, 18044, 18045, 18046, 18091,
    ])
    const items =
      reborn<Record<string, { CanUse: number; AddSkillId: number; Name: string }>>('items')
    expect(Object.keys(items)).toHaveLength(24)
    expect(items.i540001).toMatchObject({ CanUse: 1, AddSkillId: 1831, ScrollDays: 7 })
    expect(items.i540101).toMatchObject({ CanUse: 1, AddSkillId: 1831, ScrollDays: 0 })
    for (const [id, row] of Object.entries(items)) {
      expect(row.Name).toBe(`reborn_item_${id.slice(1)}`)
      expect(skills[String(row.AddSkillId)]).toBeDefined()
    }
  })

  it('has the four Dice of Fate buffs', () => {
    const buffs = reborn<{ buffs: Record<string, unknown>; properties: Record<string, unknown> }>(
      'nonfight-buffs',
    )
    expect(Object.keys(buffs.buffs)).toEqual(['80101', '80102', '80201', '80202'])
    expect(buffs.properties['80101']).toMatchObject({ ToughBuff: 211, DodgeMulBuff: 163 })
    expect(buffs.properties['80202']).toMatchObject({ ToughBuff: -802, DefenseBuff: -620 })
  })

  it('names every talent, limit, soul, scroll skill, scroll item and Ninja House NPC', () => {
    const names = json<Record<string, string>>('client/src/i18n/reborn.json')
    const keys = [
      ...reborn<Talents>('talents').talents.map((t) => t.nameKey),
      ...reborn<Bloodlines>('bloodlines').limits.flatMap((l) => [l.nameKey, l.npcNameKey]),
      ...reborn<Souls>('souls').types.map((t) => t.nameKey),
      ...Object.keys(reborn('skills')).map((id) => `lg_Skill_${id}`),
      ...Object.keys(reborn('items')).map((id) => `lg_reborn_item_${id.slice(1)}`),
    ]
    expect(keys.filter((key) => !names[key])).toEqual([])
    const glossary = json<Record<string, { en: string }>>('tools/i18n/glossary.json')
    expect(keys.filter((key) => glossary[key]?.en !== names[key])).toEqual([])
    expect(Object.values(names).filter((name) => /\p{Extended_Pictographic}/u.test(name))).toEqual(
      [],
    )
  })
})

describe('stat id check against our element trees (task 1)', () => {
  const skills = json<Record<string, { skilladd?: number }>>('server/data/game/skills.json')
  const skillAdds = json<Record<string, Record<string, number>>>('server/data/game/skill-adds.json')
  const names = json<Record<string, string>>('client/src/i18n/skills-and-titles.json')
  // The element cast-chance passives 2801-2810 (one per SkillAdd tree) name each tree.
  const treeName = (tree: number) => {
    const passive = [2801, 2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810].find(
      (id) => skillAdds[String(skills[String(id)]?.skilladd)]?.[`SkillAdd${tree}Skill`],
    )
    return names[`lg_Skill_${passive}`] ?? ''
  }
  const SYNONYM: Record<string, string> = { Lightning: 'Thunder' }

  it('maps Reborn ids 31-40 to the SkillAdd tree of the same element', () => {
    const { stats } = reborn<Bloodlines>('bloodlines')
    for (let id = 31; id <= 40; id++) {
      const { label, field } = stats[String(id)]!
      const element = label.split(' ')[0]!
      const tree = Number(field.replace('skillAdd', ''))
      expect(treeName(tree), `stat ${id} ${label}`).toContain(SYNONYM[element] ?? element)
    }
  })

  it('reads stat 18 as Block: the Guard soul uses it with the same ladder as Dodge', () => {
    const { types } = reborn<Souls>('souls')
    const guard = types.find((t) => t.stat === 18)!
    const deft = types.find((t) => t.stat === 6)!
    expect(guard.field).toBe('parry')
    expect(guard.valueByLevel).toEqual(deft.valueByLevel)
    expect(STAT_FIELDS[18]).toEqual({ field: 'parry', scale: 1 })
  })
})

describe.skipIf(!existsSync(defaultRawDir))('buildReborn on the local raw data', () => {
  it('reproduces the committed overlay', () => {
    const out = buildReborn(readRaw(defaultRawDir))
    for (const [name, data] of Object.entries(out.files)) {
      expect(data, name).toEqual(reborn(name))
    }
    expect(out.names).toEqual(json('client/src/i18n/reborn.json'))
  })

  it('rejects a limit with an unknown bonus id', () => {
    const raw = readRaw(defaultRawDir)
    const limits = structuredClone(raw.serverConfig.bloodline.Limits)
    limits['1']!.bonus[0] = [77, 5]
    expect(() =>
      buildReborn({
        ...raw,
        serverConfig: {
          ...raw.serverConfig,
          bloodline: { ...raw.serverConfig.bloodline, Limits: limits },
        },
      }),
    ).toThrow(/Unknown Reborn stat id 77/)
  })
})
