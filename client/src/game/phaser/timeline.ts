// Turns a game-core replay into a timeline the battle scene samples at any time t (ms at x1
// speed): what each fighter shows (poses), floating texts and the HP/MP/buff bars. Pure, so skip,
// replay and speed changes are just a different t.
import { gameMotions, type SkillMotions } from '../../generated/game-assets'
import type { FightEvent, Replay } from '../types'
import {
  DIE,
  DODGE,
  HIT_HEAVY,
  HIT_LIGHT,
  NORMAL_ATTACK_SKILL,
  RUN,
  sheetOf,
  sheetTicks,
  skillMotion,
  STAND,
  tickMs,
  VICTORY,
  type FighterArt,
} from './motion'

/** Original stage: 1000x600, fighters stand on y 455 at x 300 (left) and 700 (right). */
export const STAGE = { width: 1000, height: 600, groundY: 455 }
export const HOME = { attackers: 300, defenders: 700 } as const
export const BATTLE_TICK_MS = tickMs(gameMotions.fps.battle)

const INTRO_MS = 500
const RUN_MS = 220
/** Distance from the target at which a melee strike is played. */
const CONTACT = 120
const GAP_MS = 180
export const FADE_MS = 300
const BUFF_EVENT_MS = 600
const OUTRO_MS = 900
const FALLBACK_MOTION_MS = 600

export interface Pose {
  at: number
  motion: string
  loop: boolean
  /** x moves from `from` to `to` during the first moveMs. */
  from: number
  to: number
  moveMs: number
  /** in: fades in over FADE_MS; out: fades out once the (non-looping) motion is over. */
  fade?: 'in' | 'out'
}

export type TextKind = 'damage' | 'crit' | 'miss' | 'mp' | 'buff' | 'buffEnd' | 'skill' | 'info'

export interface FloatText {
  at: number
  fighter: number
  kind: TextKind
  text: string
}

export interface BarState {
  at: number
  fighter: number
  hp: number
  mp: number
  buffs: number[]
}

export interface Timeline {
  /** By fighter index; a fighter is off stage before its first pose. */
  poses: Pose[][]
  texts: FloatText[]
  bars: BarState[]
  /** When the last action and the victory pose are over (the result banner shows). */
  endAt: number
  duration: number
}

export interface TimelineOptions {
  art: (FighterArt | undefined)[]
  skillMotions: SkillMotions | null
  skillName?: (skillId: number) => string | undefined
  buffName?: (buffId: number) => string | undefined
}

/** Splits `total` into `count` strikes; the last strike gets the remainder. */
export function splitDamage(total: number, count: number) {
  const n = Math.max(1, Math.floor(count))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base))
}

const STRIKES = new Set([5, 7, 14])

export function buildTimeline(replay: Replay, options: TimelineOptions): Timeline {
  const { fighters } = replay
  const { art, skillMotions, skillName = () => undefined, buffName = () => undefined } = options
  const poses: Pose[][] = fighters.map(() => [])
  const texts: FloatText[] = []
  const bars: BarState[] = []
  const hp = fighters.map((f) => f.startHp)
  const mp = fighters.map((f) => f.startMp ?? 0)
  const buffs = fighters.map(() => [] as number[])
  const onStage = { attackers: -1, defenders: -1 }

  const sideOf = (i: number) => fighters[i]?.side ?? 'attackers'
  const home = (i: number) => HOME[sideOf(i)]
  const facing = (i: number) => (sideOf(i) === 'attackers' ? 1 : -1)
  const motionMs = (i: number, motion: string) => {
    const sheet = sheetOf(art[i], motion)
    return sheet ? sheetTicks(sheet) * BATTLE_TICK_MS : FALLBACK_MOTION_MS
  }
  const hitMs = (i: number, motion: string) => {
    const sheet = sheetOf(art[i], motion)
    if (!sheet) return FALLBACK_MOTION_MS / 2
    return (sheet.labels.Attacking ?? Math.floor(sheetTicks(sheet) / 2)) * BATTLE_TICK_MS
  }
  /** A newer pose replaces whatever was planned for this fighter after it. */
  const pose = (i: number, at: number, motion: string, extra: Partial<Pose> = {}) => {
    const list = poses[i]
    if (!list) return
    poses[i] = list.filter((p) => p.at <= at)
    poses[i]!.push({
      at,
      motion,
      loop: motion === STAND || motion === RUN,
      from: home(i),
      to: home(i),
      moveMs: 0,
      ...extra,
    })
  }
  const bar = (at: number, i: number) => {
    if (fighters[i]) bars.push({ at, fighter: i, hp: hp[i]!, mp: mp[i]!, buffs: [...buffs[i]!] })
  }
  const text = (at: number, fighter: number, kind: TextKind, value: string) => {
    if (fighters[fighter]) texts.push({ at, fighter, kind, text: value })
  }
  const loseHp = (at: number, i: number, amount: number) => {
    hp[i] = Math.max(0, hp[i]! - amount)
    bar(at, i)
  }

  function changeBuffs(at: number, ev: FightEvent) {
    for (const { role, buff } of ev.delBuffs ?? []) {
      if (!buffs[role]) continue
      buffs[role] = buffs[role]!.filter((b) => b !== buff)
      const name = buffName(buff)
      if (name) text(at, role, 'buffEnd', `${name} ends`)
      bar(at, role)
    }
    for (const { role, buff } of ev.addBuffs ?? []) {
      if (!buffs[role]) continue
      buffs[role] = [...buffs[role]!.filter((b) => b !== buff), buff]
      const name = buffName(buff)
      if (name) text(at, role, 'buff', name)
      bar(at, role)
    }
  }

  function react(target: number, at: number, ev: FightEvent, amount: number, last: boolean) {
    if (ev.hit === false) {
      pose(target, at, DODGE)
      text(at, target, 'miss', 'Dodge')
      pose(target, at + motionMs(target, DODGE), STAND)
      return
    }
    const motion = ev.crit ? HIT_HEAVY : HIT_LIGHT
    pose(target, at, motion)
    loseHp(at, target, amount)
    text(
      at,
      target,
      ev.crit ? 'crit' : 'damage',
      ev.crit ? `Critical ${amount}` : amount > 0 ? `-${amount}` : '0',
    )
    if (ev.parry && last) text(at, target, 'info', 'Parry')
    if (hp[target]! > 0) pose(target, at + motionMs(target, motion), STAND)
  }

  function strike(ev: FightEvent, start: number) {
    const actor = ev.actor
    const target = ev.target
    const motion = skillMotion(art[actor], ev.skillId, skillMotions)
    const name =
      ev.skillId !== undefined && ev.skillId !== NORMAL_ATTACK_SKILL
        ? skillName(ev.skillId)
        : undefined
    if (name) text(start, actor, 'skill', name)
    if (ev.decMp) {
      mp[actor] = Math.max(0, mp[actor]! - ev.decMp)
      text(start, actor, 'mp', `-${ev.decMp} MP`)
      bar(start, actor)
    }
    const onTarget =
      target !== undefined &&
      target !== actor &&
      fighters[target] !== undefined &&
      (ev.hit !== undefined || ev.damage !== undefined)
    const contact = onTarget ? home(target) - facing(actor) * CONTACT : home(actor)
    let t = start
    if (onTarget) {
      pose(actor, t, RUN, { to: contact, moveMs: RUN_MS })
      t += RUN_MS
    }
    const parts = splitDamage(ev.damage ?? 0, ev.attackCount ?? 1)
    let impact = t
    parts.forEach((amount, k) => {
      pose(actor, t, motion, { from: contact, to: contact })
      impact = t + hitMs(actor, motion)
      if (onTarget) react(target, impact, ev, amount, k === parts.length - 1)
      t += motionMs(actor, motion)
    })
    if (ev.selfDamage) {
      loseHp(impact, actor, ev.selfDamage)
      text(impact, actor, 'damage', `-${ev.selfDamage}`)
    }
    changeBuffs(impact, ev)
    if (onTarget) {
      pose(actor, t, RUN, { from: contact, to: home(actor), moveMs: RUN_MS })
      t += RUN_MS
    }
    if (hp[actor]! > 0) pose(actor, t, STAND)
    return t
  }

  function buffEvent(ev: FightEvent, start: number) {
    const actor = ev.actor
    const changes = (ev.addBuffs?.length ?? 0) + (ev.delBuffs?.length ?? 0)
    if (!ev.selfDamage && changes === 0) return start
    if (ev.selfDamage) {
      const name = ev.skillId === undefined ? undefined : buffName(ev.skillId)
      if (name) text(start, actor, 'buff', name)
      pose(actor, start, HIT_LIGHT)
      loseHp(start, actor, ev.selfDamage)
      text(start, actor, 'damage', `-${ev.selfDamage}`)
      if (hp[actor]! > 0) pose(actor, start + motionMs(actor, HIT_LIGHT), STAND)
    }
    changeBuffs(start, ev)
    return start + BUFF_EVENT_MS
  }

  // The first fighter of each side starts on stage.
  fighters.forEach((f, i) => {
    if (onStage[f.side] === -1) {
      onStage[f.side] = i
      pose(i, 0, STAND)
    }
    bar(0, i)
  })

  let t = INTRO_MS
  for (const ev of replay.events) {
    if (!fighters[ev.actor]) continue
    if (STRIKES.has(ev.event)) t = strike(ev, t)
    else if (ev.event === 9) t = buffEvent(ev, t)
    else if (ev.event === 2) t += GAP_MS
    else if (ev.event === 20) {
      hp[ev.actor] = 0
      bar(t, ev.actor)
      pose(ev.actor, t, DIE, { fade: 'out' })
      t += motionMs(ev.actor, DIE) + FADE_MS
    } else if (ev.event === 21) {
      onStage[sideOf(ev.actor)] = ev.actor
      pose(ev.actor, t, STAND, { fade: 'in' })
      bar(t, ev.actor)
      t += FADE_MS
    }
  }

  // The engine's final numbers win (timeouts set HP without an event).
  fighters.forEach((f, i) => {
    hp[i] = Math.max(0, f.hp)
    if (f.mp !== undefined) mp[i] = Math.max(0, f.mp)
    bar(t, i)
  })
  const winner = onStage[replay.winner]
  let victoryMs = 0
  if (winner !== -1 && hp[winner]! > 0) {
    pose(winner, t, VICTORY)
    victoryMs = motionMs(winner, VICTORY)
  }
  const endAt = t + victoryMs
  const byTime = <T extends { at: number }>(list: T[]) => [...list].sort((a, b) => a.at - b.at)
  return { poses, texts: byTime(texts), bars: byTime(bars), endAt, duration: endAt + OUTRO_MS }
}

/** Latest entry with `at <= t` (lists are in time order). */
export function latestAt<T extends { at: number }>(list: T[], t: number) {
  let found: T | undefined
  for (const item of list) {
    if (item.at > t) break
    found = item
  }
  return found
}

/** Where a pose puts its fighter at time t. */
export function poseX(pose: Pose, t: number) {
  if (pose.moveMs <= 0) return pose.to
  const k = Math.min(1, Math.max(0, (t - pose.at) / pose.moveMs))
  return pose.from + (pose.to - pose.from) * k
}
