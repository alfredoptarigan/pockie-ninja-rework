import { describe, expect, it } from 'vitest'
import { resolveSecretTechnique } from '../phaser/secret-technique'
import { skillEffect } from '../phaser/skill-effects'
import { showcaseReplay, showcaseSkills } from './showcase'

const player = { name: 'QA_Madara', level: 90 }
const strikes = (events: { event: number; skillId?: number }[]) =>
  events.filter((e) => e.event === 14)
const byNumber = (a: number, b: number) => a - b

describe('showcaseSkills', () => {
  it('lists ninjutsu with effect art and every outfit ultimate, each once', () => {
    const keys = showcaseSkills.map((s) => `${s.kind}:${s.id}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(showcaseSkills.some((s) => s.kind === 'ninjutsu' && skillEffect(s.id))).toBe(true)
    expect(showcaseSkills.filter((s) => s.kind === 'ultimate').length).toBeGreaterThan(100)
  })

  it('leaves out the normal attacks, the shared hand seal and pet skills', () => {
    const ids = showcaseSkills.map((s) => s.id)
    for (const id of [1, 2, 9999, 40002, 40006]) expect(ids).not.toContain(id)
  })
})

describe('showcaseReplay', () => {
  it('casts every skill once, ninjutsu by the player on the dummy', () => {
    const { replay } = showcaseReplay(showcaseSkills, player)
    const cast = strikes(replay.events).map((e) => e.skillId!)
    expect(cast.sort(byNumber)).toEqual(showcaseSkills.map((s) => s.id).sort(byNumber))
    const ninjutsu = new Set(showcaseSkills.filter((s) => s.kind === 'ninjutsu').map((s) => s.id))
    const byPlayer = replay.events.filter((e) => e.event === 14 && ninjutsu.has(e.skillId!))
    expect(byPlayer.every((e) => e.actor === 0 && e.target === 1)).toBe(true)
  })

  it('casts each ultimate from a defender wearing its outfit, so its art resolves', () => {
    const { replay, defenderLooks } = showcaseReplay(showcaseSkills, player)
    const looks = defenderLooks as { clothing: number }[]
    const ultimates = replay.events.filter((e) => e.event === 14 && e.actor !== 0)
    expect(ultimates).toHaveLength(showcaseSkills.filter((s) => s.kind === 'ultimate').length)
    for (const e of ultimates) {
      expect(resolveSecretTechnique(looks[e.actor - 1]?.clothing, e.skillId)).toBeDefined()
      expect(e.target).toBe(0)
    }
  })

  it('brings each outfit on stage before it casts, and nobody runs out of HP', () => {
    const { replay } = showcaseReplay(showcaseSkills, player)
    let onStage = 1
    for (const e of replay.events) {
      if (e.event === 21) onStage = e.actor
      if (e.event === 14 && e.actor !== 0) expect(e.actor).toBe(onStage)
    }
    const damage = strikes(replay.events).length * 100
    expect(replay.fighters.every((f) => f.maxHp > damage)).toBe(true)
  })

  it('plays only the dummy for a ninjutsu-only selection', () => {
    const picked = showcaseSkills.filter((s) => s.kind === 'ninjutsu').slice(0, 2)
    const { replay, defenderLooks } = showcaseReplay(picked, player)
    expect(defenderLooks).toEqual([{ clothing: 1 }])
    expect(replay.fighters).toHaveLength(2)
  })

  it('starts with the outfit itself for a single ultimate', () => {
    const ultimate = showcaseSkills.find((s) => s.kind === 'ultimate')!
    const { replay, defenderLooks } = showcaseReplay([ultimate], player)
    expect(defenderLooks).toEqual([{ clothing: ultimate.clothing }])
    expect(replay.events.some((e) => e.event === 20 || e.event === 21)).toBe(false)
  })
})
