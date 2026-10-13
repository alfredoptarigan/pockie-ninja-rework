// Early fights with the real data, checked against the original formulas (RefreshSystem.java,
// Damage.java): a level 1 Ggio Vega (AvatarID 3) against the level 2 Sunflower (n33017).
import { applyDefense, simulateFight, type Replay, type SkillInput } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { monsterFighter, passiveBonuses, playerFighterFrom } from './combat.js'
import { skill } from './data.js'

const SEEDS = Array.from({ length: 50 }, (_, seed) => seed)
const SKILL_EVENT = 14
const NORMAL_ATTACK = 1
/** Clothing 3 → AvatarID 3: Str 1300 + 65/level, StrAtkAdd 1700, HP 200 + 20/level. */
const freshNinja = {
  name: 'Ninja_01',
  avatarId: 3,
  gender: 0,
  level: 1,
  hp: 220,
  mp: 220,
  nation: 0,
}
/** The fists from the Fire Village newbie pack (i159104): AttackMin 7, AttackMax 8. */
const NEWBIE_FISTS = 'i270100'
/** n33017: HP 15, Def 71, Atk 9-10 (npc.ini). */
const SUNFLOWER = 'n33017'

const gear = (itemIds: string[]) => itemIds.map((itemId) => ({ itemId }))
const fights = (equipped: string[]) =>
  SEEDS.map((seed) =>
    simulateFight({
      attackers: [playerFighterFrom(freshNinja, gear(equipped))],
      defenders: [monsterFighter(SUNFLOWER)],
      seed,
    }),
  )
const normalHits = (replay: Replay) =>
  replay.events.filter(
    (e) => e.actor === 0 && e.event === SKILL_EVENT && e.skillId === NORMAL_ATTACK && e.hit,
  )

describe('a fresh ninja against the Sunflower', () => {
  it('has attack 1 without a weapon, which Def 71 rounds down to 0 damage (as in the original)', () => {
    // (int)((1 + 0) * (1000 + 1365/1700*10) * 0.001) = 1; (int)(1 * (1 - 71/1425)) = 0.
    const player = playerFighterFrom(freshNinja, gear([]))
    expect(player).toMatchObject({ minAttack: 1, maxAttack: 1, maxHp: 220 })
    expect(applyDefense(1, 71, 0)).toBe(0)

    const replays = fights([])
    expect(replays.flatMap(normalHits).every((e) => e.damage === undefined || e.damage === 0)).toBe(
      true,
    )
    expect(replays.filter((r) => r.winner === 'attackers')).toEqual([])
  })

  it('hits for 7-8 with the newbie fists and wins every fight in 2-3 hits', () => {
    // (1 + 7..8) * 1.000 = 8..9 attack; 8 → 7, 9 → 8 after Def 71. Sunflower HP 15.
    const player = playerFighterFrom(freshNinja, gear([NEWBIE_FISTS]))
    expect(player).toMatchObject({ minAttack: 8, maxAttack: 9 })
    expect([applyDefense(8, 71, 0), applyDefense(9, 71, 0)]).toEqual([7, 8])

    const replays = fights([NEWBIE_FISTS])
    expect(replays.every((r) => r.winner === 'attackers')).toBe(true)
    for (const replay of replays) {
      const hits = normalHits(replay)
      expect(hits.every((e) => e.damage === 7 || e.damage === 8)).toBe(true)
      expect(hits.length).toBeLessThanOrEqual(3)
      // The Sunflower hits for 9-10 (no defence), so the ninja keeps most of its 220 HP.
      expect(replay.fighters[0]!.hp).toBeGreaterThan(150)
    }
  })
})

// EquipSystem.GetEquipSelfProp (AttackMin/Max, Defense) + AddOtherProp (OtherPropName/Value)
// feeding RefreshSystem's *Equip terms. Level 1 AvatarID 3: HP 220, AtkTime 980, counter 5.
describe('equipment bonuses', () => {
  const fighter = (equipped: string[]) => playerFighterFrom(freshNinja, gear(equipped))

  it('adds the starter armour defence: Straw Hat i220101 (24) + Cloth Armour i240101 (71)', () => {
    expect(fighter(['i220101', 'i240101'])).toMatchObject({ defense: 95, maxHp: 220 })
  })

  it('multiplies max HP (MaxHPMulEquip 50 on i298004, plus its Defense 167)', () => {
    // (int)(220 * (1000 + 1365/1400*10 + 50) * 0.001) = 231
    expect(fighter(['i298004'])).toMatchObject({ maxHp: 231, defense: 167 })
  })

  it('adds hit, speed, counter and extra defence', () => {
    expect(fighter(['i298005'])).toMatchObject({ hit: 66, defense: 55 })
    // (int)(1000 / ((1000 + 2310/1000*10 + 50) * 0.001)) = 934
    expect(fighter(['i298006']).atkTime).toBe(934)
    expect(fighter(['i298007']).counter).toBe(10)
    // Defense 39 + DefenseEquip 71.
    expect(fighter(['i298008']).defense).toBe(110)
  })

  it('reads several properties from one item (i299901 HP/MP, i299910 crit/pierce)', () => {
    // i299901 is a Sharp weapon (UsePopsinger 2): CheckEquipEffect gives it to a Sharp ninja
    // (AvatarID 63: Stamina 1470, MaxHPAdd 1300) only. (int)((220 + 6654) * 1010 * 0.001).
    const sharp = { ...freshNinja, avatarId: 63 }
    expect(playerFighterFrom(sharp, gear(['i299901']))).toMatchObject({ maxHp: 6942, maxMp: 6942 })
    expect(fighter(['i299901'])).toMatchObject({ maxHp: 220, maxMp: 220 })
    expect(fighter(['i299910'])).toMatchObject({ crit: 390, pierce: 390 })
  })

  it('applies a complete set (Oracle Outfit 8160: +28 Stamina at 2, +28 Strength at 4 pieces)', () => {
    const pieces = ['i281601', 'i281602', 'i281603', 'i281604']
    expect(fighter(pieces.slice(0, 2))).toMatchObject({ stamina: 1300 + 65 + 2800 })
    expect(fighter(pieces)).toMatchObject({ stamina: 4165, strength: 1365 + 2800 })
  })

  it('ignores a broken item (durability 0) for stats and sets', () => {
    const broken = [{ itemId: 'i281601', durability: 0 }, { itemId: 'i281602' }]
    expect(playerFighterFrom(freshNinja, broken)).toMatchObject({ defense: 34, stamina: 1365 })
  })

  it('passes damage reduction and life steal to the fight (i298009, i298010)', () => {
    expect(fighter(['i298009']).decDamage).toBe(3)
    expect(fighter(['i298010']).vampiricHp).toBe(3)
  })

  it('sums the same bonus over several items', () => {
    expect(fighter(['i298005', 'i298005']).hit).toBe(132)
  })
})

// SkillSystem.RefreshPlayerSkill / RefreshSkillProperty: type 3 skills feed the *Skill terms.
describe('passive skills', () => {
  const skillAdd = (character = freshNinja, learned: SkillInput[] = []) =>
    playerFighterFrom(character, [], {}, learned).skillAdd

  it('adds the outfit passive (AvatarID 3: 2040, SkillAdd4 +500) and the nation passive', () => {
    // Fire (nation 0) gets 2801: SkillAdd0 +3 (NationUpSkill.ini, skilladd.ini 2105).
    expect(skillAdd()).toEqual([3, 0, 0, 0, 500, 0, 0, 0, 0, 0])
    // Lightning (nation 4) gets 2804: SkillAdd3 +3.
    expect(skillAdd({ ...freshNinja, nation: 4 })).toEqual([0, 0, 0, 3, 500, 0, 0, 0, 0, 0])
  })

  it('adds learned element passives, once per skill', () => {
    const passive = (id: number) => ({ id, ...skill(id)! })
    expect(skillAdd(freshNinja, [passive(2806)])).toEqual([3, 0, 0, 0, 500, 3, 0, 0, 0, 0])
    // The nation's own passive learned again stays one record row.
    expect(skillAdd(freshNinja, [passive(2801)])[0]).toBe(3)
  })

  it('adds *Skill stat terms and ignores final properties (2100 MaxHP is overwritten)', () => {
    const fake = (skilladd: number): SkillInput => ({ id: 99000 + skilladd, type: 3, skilladd })
    // skilladd.ini 2100: MaxHP=100 / MaxMP=100, final properties RefreshRoleProperty recomputes.
    expect(playerFighterFrom(freshNinja, [], {}, [fake(2100)]).maxHp).toBe(220)
    expect(passiveBonuses([fake(2100)])).toEqual({})
  })

  it('lists the outfit and nation passives with the fight skills', () => {
    const skills = playerFighterFrom(freshNinja, []).skills ?? []
    expect(skills.map((row) => row.id)).toEqual([1903, 7777, 8888, 2040, 2801])
  })
})
