import { describe, expect, it } from 'vitest'
import {
  bracketPhase,
  bracketSchedule,
  matchWinner,
  matchesIn,
  pairings,
  roundsDue,
} from './bracket.js'

describe('pairings', () => {
  it('pairs neighbouring slots in the Round of 16 and winners in order after it', () => {
    // Arrange
    const r16 = pairings(1)
    // Act
    const qf = pairings(2, [0, 3, 4, -1, 9, 10, 12, 15])
    // Assert
    expect(r16).toHaveLength(8)
    expect(r16[0]).toEqual([0, 1])
    expect(r16[7]).toEqual([14, 15])
    expect(qf).toEqual([
      [0, 3],
      [4, -1],
      [9, 10],
      [12, 15],
    ])
    expect([1, 2, 3, 4].map(matchesIn)).toEqual([8, 4, 2, 1])
  })

  it('refuses a round without all the previous winners', () => {
    expect(() => pairings(3, [1, 2])).toThrow()
  })
})

describe('matchWinner', () => {
  const filled = new Set([0, 3])
  it('gives a bye to the only filled side and no winner to two empty sides', () => {
    expect(matchWinner([0, 1], filled, () => false)).toBe(0)
    expect(matchWinner([2, 3], filled, () => true)).toBe(3)
    expect(matchWinner([4, 5], filled, () => true)).toBe(-1)
    expect(matchWinner([-1, 3], filled, () => true)).toBe(3)
  })

  it('lets the fight decide between two filled sides', () => {
    expect(matchWinner([0, 3], filled, () => true)).toBe(0)
    expect(matchWinner([0, 3], filled, () => false)).toBe(3)
  })
})

describe('schedule', () => {
  const schedule = bracketSchedule('2026-10-15', { registrationHours: 22, roundMinutes: 15 })

  it('opens registration at 00:00 UTC and fights a round every 15 minutes after it', () => {
    expect(schedule.registrationEndsAt.toISOString()).toBe('2026-10-15T22:00:00.000Z')
    expect(schedule.roundsAt.map((at) => at.toISOString().slice(11, 16))).toEqual([
      '22:00',
      '22:15',
      '22:30',
      '22:45',
    ])
    expect(schedule.battlingEndsAt.toISOString()).toBe('2026-10-15T23:00:00.000Z')
    expect(schedule.cooldownEndsAt.toISOString()).toBe('2026-10-16T00:00:00.000Z')
  })

  it('knows the phase and the rounds that are due', () => {
    const at = (time: string) => new Date(`2026-10-15T${time}:00Z`)
    expect(bracketPhase(schedule, at('21:59'))).toBe('registration')
    expect(bracketPhase(schedule, at('22:20'))).toBe('battling')
    expect(bracketPhase(schedule, at('23:30'))).toBe('cooldown')
    expect(roundsDue(schedule.roundsAt, at('21:59'))).toBe(0)
    expect(roundsDue(schedule.roundsAt, at('22:15'))).toBe(2)
    expect(roundsDue(schedule.roundsAt, at('23:30'))).toBe(4)
  })
})
