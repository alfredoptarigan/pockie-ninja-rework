import { describe, expect, it } from 'vitest'
import { deriveStats, type AvatarStats } from './stats.js'

// RoleInitProperty.ini [45] (Naruto Uzumaki +0), from server/data/game/avatar-stats.json.
const naruto: AvatarStats = {
  AgiAtkAdd: 1500,
  Agility: 2400,
  AgilityUp: 120,
  AtkTime: 1000,
  DodgeAdd: 1500,
  MaxHP: 200,
  MaxHPAdd: 1200,
  MaxHPUp: 20,
  MaxMP: 200,
  MaxMPAdd: 1200,
  MaxMPUp: 20,
  Popsinger: 4,
  Stamina: 2400,
  StaminaUp: 120,
  StrAtkAdd: 1200,
  StrParryAdd: 1200,
  Strength: 2800,
  StrengthUp: 140,
}

describe('deriveStats (RefreshSystem.java)', () => {
  it('matches Naruto at level 1 without gear', () => {
    expect(deriveStats(naruto, 1)).toMatchObject({
      strength: 2940,
      agility: 2520,
      stamina: 2520,
      maxHp: 224,
      maxMp: 224,
      minAttack: 1,
      maxAttack: 1,
      atkTime: 990,
      dodge: 1,
      parry: 2,
      hit: 0,
      crit: 0,
      critAttach: 230,
      defense: 0,
      counter: 5,
      weaponClass: 4,
    })
  })

  it('scales attack from the weapon with the strength multiplier', () => {
    // Newbie fists i270100: attack 7-8.
    const stats = deriveStats(naruto, 1, { minAttack: 7, maxAttack: 8 })
    expect(stats.minAttack).toBe(Math.trunc(8 * 1020 * 0.001))
    expect(stats.maxAttack).toBe(Math.trunc(9 * 1020 * 0.001))
  })

  it('grows with level up to level 90', () => {
    const stats = deriveStats(naruto, 90)
    expect(stats.strength).toBe(2800 + 90 * 140)
    expect(stats.maxHp).toBe(Math.trunc((200 + 90 * 20) * (1000 + 11 * 10) * 0.001))
    expect(stats.atkTime).toBeLessThan(990)
  })

  it('adds flat and percentage bonuses from gear', () => {
    const stats = deriveStats(naruto, 1, { defense: 30, hit: 5, dodge: 2, dodgeMul: 50 })
    expect(stats.defense).toBe(30)
    expect(stats.hit).toBe(5)
    expect(stats.dodge).toBe(Math.trunc((1 + 2) * 150 * 0.01))
  })
})
