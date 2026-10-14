import { readFileSync } from 'node:fs'
import { simulateFight } from '../fight.js'
import type { SkillInput } from '../types.js'
import { describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { createRandom } from '../../random.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { PET_HELP_SKILLS } from './pet-help-skills.js'

const buff = (id: number, saveData = 0): ActiveBuff => ({
  id,
  saveData,
  startTime: 0,
  lifeTime: -1,
})
const cases: [string, unknown[][], number][] = [
  ['chongjiaxue_40002', [], SKILL_SUCCESS],
  ['chongjialan_40003', [], SKILL_SUCCESS],
  ['chongdang_40006', [['addBuff', 0, 40006, 0]], SKILL_LOSE],
  [
    'chongzhuoshi_40007',
    [
      ['attack', 75],
      ['addBuff', 1, 11838, 3],
    ],
    SKILL_SUCCESS,
  ],
  ['chongxixue_40008', [['attack', 50]], SKILL_SUCCESS],
  [
    'chongdingyao_40009',
    [
      ['attack', 75],
      ['addBuff', 1, 11811, 0],
    ],
    SKILL_SUCCESS,
  ],
  ['chonglianji_40010', [['attack', 150]], SKILL_SUCCESS],
  ['chonghuafen_40012', [['addBuff', 1, 1212, 12]], SKILL_SUCCESS],
  [
    'chongchanrao_40013',
    [
      ['attack', 75],
      ['addBuff', 1, 11837, 1],
    ],
    SKILL_SUCCESS,
  ],
  ['chongtaiyang_40014', [['addBuff', 1, 11843, 8]], SKILL_SUCCESS],
  [
    'chongzhongya_40015',
    [
      ['attack', 75],
      ['addBuff', 1, 11813, 600],
    ],
    SKILL_SUCCESS,
  ],
  ['jueduizhongcheng_40098', [['addBuff', 0, 11873, 0]], SKILL_LOSE],
  ['yazhi_40100', [['addBuff', 1, 11874, 0]], SKILL_LOSE],
  ['xingyun_40104', [], SKILL_LOSE],
  ['eyun_40105', [], SKILL_LOSE],
  ['hanbinghuxi_40114', [['addBuff', 0, 11879, 35]], SKILL_LOSE],
  ['fangshoufanji_40115', [['addBuff', 0, 11881, 0]], SKILL_LOSE],
  ['chongtunshi_40121', [['addBuff', 1, 11897, 0]], SKILL_SUCCESS],
  ['shazhishouhu_40128', [], SKILL_SUCCESS],
  [
    'shuilongbo_40129',
    [
      ['attack', 75],
      ['addBuff', 1, 11903, 0],
    ],
    SKILL_SUCCESS,
  ],
  [
    'suanyefushi_40130',
    [
      ['attack', 75],
      ['addBuff', 1, 11904, 0],
    ],
    SKILL_SUCCESS,
  ],
  ['yuansujingtong_40131', [['addBuff', 0, 11905, 0]], SKILL_SUCCESS],
  [
    'leiyunfengbao_40132',
    [
      ['addBuff', 0, 11831, 18],
      ['addBuff', 0, 11909, 0],
    ],
    SKILL_SUCCESS,
  ],
  ['huanhua_40133', [['addBuff', 0, 11906, 0]], SKILL_SUCCESS],
  [
    'heianzhangkong_40134',
    [
      ['attack', 80],
      ['addBuff', 1, 11907, 0],
    ],
    SKILL_SUCCESS,
  ],
  [
    'xugoupao_40135',
    [
      ['attack', 100],
      ['addBuff', 1, 11810, 1200],
    ],
    SKILL_SUCCESS,
  ],
]

describe('2011 pet Help scripts at level 1', () => {
  it.each(cases)('%s fires its original effect with seed 7', (name, expected, result) => {
    const random = createRandom(7)
    const { ctx, calls } = fakeContext({ damage: 100 })
    ctx.randInt = (min, max) => random.between(min, max)
    const self = makeFighter({ hp: 50, mp: 50, buffs: [buff(8888)] })
    const target = makeFighter({ index: 1, mp: 50, buffs: [buff(8888)] })
    const fv: FightEvent = { actor: 0, target: 1, event: 14, damage: 100 }
    const skill = PET_HELP_SKILLS[`skill/skill_${name}.js`]!
    expect(skill(ctx, self, target, fv, 0, { id: 0, type: 2, level: 1 })).toBe(result)
    expect(calls).toEqual(expected)
    // Add the rider with its real FightBuff.ini definition, then exercise its expiry hook.
    // Permanent markers keep -1; bind/bleed count actions and control buffs use SaveData.
    const lifetimes: Record<number, number> = {
      40006: -1,
      11838: 3,
      11811: 6000,
      1212: -1,
      11837: 1,
      11843: -1,
      11813: 600,
      11873: -1,
      11874: -1,
      11879: -1,
      11881: -1,
      11897: 800,
      11903: 800,
      11904: 800,
      11905: -1,
      11831: -1,
      11909: -1,
      11906: 1200,
      11907: -1,
      11810: 1200,
    }
    for (const call of expected.filter((call) => call[0] === 'addBuff')) {
      const id = call[2] as number
      const def = BUFFS[id]!
      const active = { ...buff(id, call[3] as number), lifeTime: def.lifeTime }
      const owner = makeFighter()
      const lifecycle = fakeContext().ctx
      def.onAdd?.(lifecycle, owner, active, { actor: 0, event: 9 }, 0)
      expect(active.lifeTime).toBe(lifetimes[id])
      def.onRemove?.(
        lifecycle,
        owner,
        active,
        { actor: 0, event: 9 },
        Math.max(0, active.lifeTime + 1),
      )
      expect(owner.canMove).toBe(1)
      expect(owner.counter).toBe(0)
    }
    if (name.startsWith('chongjiaxue')) expect([self.hp, fv.incHp]).toEqual([60, 10])
    if (name.startsWith('chongjialan')) expect([self.mp, fv.incMp]).toEqual([60, 10])
    if (name.startsWith('chongxixue')) expect(self.vampiricHp).toBe(0)
    if (name.startsWith('chongtaiyang')) expect(fv.decMp).toBe(0)
    if (name.startsWith('chongtunshi'))
      expect([self.mp, target.mp, fv.incMp, fv.targetDecMp]).toEqual([60, 40, 10, 10])
    if (name.startsWith('shazhishouhu')) expect([self.hp, fv.incHp]).toEqual([30, 30])
    if (name.startsWith('huanhua')) expect([self.hp, fv.incHp]).toEqual([65, 15])
    if (name.startsWith('xugoupao')) expect([self.hp, fv.incHp]).toEqual([90, 40])
  })

  it('refuses overflowing recovery, repeat statuses and exhausted immunity counters', () => {
    for (const name of ['chongjiaxue_40002', 'chongjialan_40003']) {
      const { ctx } = fakeContext()
      expect(
        PET_HELP_SKILLS[`skill/skill_${name}.js`]!(
          ctx,
          makeFighter(),
          makeFighter(),
          { actor: 0, event: 14 },
          0,
        ),
      ).toBe(SKILL_LOSE)
    }
    const self = makeFighter({ buffs: [Object.assign(buff(8888), { saveData9: 2 })] })
    expect(
      PET_HELP_SKILLS['skill/skill_suanyefushi_40130.js']!(
        fakeContext().ctx,
        self,
        makeFighter(),
        { actor: 0, event: 14 },
        0,
      ),
    ).toBe(SKILL_LOSE)
  })
})

describe('pet Help dispatch in the seeded fight engine', () => {
  const rows = JSON.parse(
    readFileSync(new URL('../../../../server/data/game/skills.json', import.meta.url), 'utf8'),
  ) as Record<string, Omit<SkillInput, 'id'>>
  it.each([40007, 40010, 40013])(
    'dispatches %i after its master hits, and replays identically',
    (id) => {
      const self = makeFighter({ hp: 5000, maxHp: 5000, minAttack: 100, maxAttack: 100 })
      self.pet = {
        species: 'i320002',
        avatar: 10050,
        level: 1,
        totals: { attack: 0, defence: 0, disturb: 0, active: 0, savvy: 0 },
        skills: [{ ...rows[id]!, id, level: 1 }],
      }
      const input = {
        attackers: [self],
        defenders: [
          makeFighter({ name: 'Dummy', hp: 5000, maxHp: 5000, minAttack: 1, maxAttack: 1 }),
        ],
        seed: 7,
      }
      const replay = simulateFight(input)
      expect(simulateFight(input)).toEqual(replay)
      const actions = replay.events.filter((event) => event.skillId === id)
      expect(actions.length).toBeGreaterThan(0)
      for (const action of actions) {
        expect(action).toMatchObject({
          actor: 0,
          target: 1,
          isPet: true,
          damage: id === 40010 ? 150 : 75,
        })
        const index = replay.events.indexOf(action)
        expect(
          replay.events
            .slice(0, index)
            .some((event) => event.actor === 0 && event.skillId === 1 && event.hit),
        ).toBe(true)
      }
      if (id === 40007)
        expect(
          replay.events.some((event) => event.delBuffs?.some((change) => change.buff === 11838)),
        ).toBe(true)
      if (id === 40013)
        expect(
          replay.events.some((event) => event.delBuffs?.some((change) => change.buff === 11837)),
        ).toBe(true)
    },
  )

  it.each(['chongjiaxue_40002', 'chongjialan_40003'])(
    '%s checks overflow before truncating the raw 10 percent',
    (name) => {
      const self = makeFighter({ hp: 91, maxHp: 101, mp: 91, maxMp: 101 })
      expect(
        PET_HELP_SKILLS[`skill/skill_${name}.js`]!(
          fakeContext().ctx,
          self,
          makeFighter(),
          { actor: 0, event: 14 },
          0,
        ),
      ).toBe(SKILL_LOSE)
      expect([self.hp, self.mp]).toEqual([91, 91])
    },
  )
})

it('Devour truncates MP assignments after subtracting the raw fractional draw', () => {
  const self = makeFighter({ mp: 10 })
  const target = makeFighter({ index: 1, mp: 100, maxMp: 101 })
  const fv: FightEvent = { actor: 0, event: 14 }
  PET_HELP_SKILLS['skill/skill_chongtunshi_40121.js']!(fakeContext().ctx, self, target, fv, 0)
  expect([self.mp, target.mp, fv.incMp, fv.targetDecMp]).toEqual([20, 89, 10, 10])
})
