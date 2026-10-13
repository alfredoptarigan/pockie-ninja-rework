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
import {
  rebornSign,
  SECRET_FRAME_MS,
  secretOverlay,
  shiftFrames,
  type OverlayLayer,
  type SecretArt,
  type SecretOverlay,
  type TargetShift,
} from './secret-technique'

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
  /** Skill whose motion this is (strikes); other poses are actions (`motion` is the action id). */
  skillId?: number
  /** Ultimate art drawn instead of the body (the body shows `motion` when it fails to load). */
  secret?: SecretOverlay
  /** Secret-technique target motion moving this fighter. */
  shift?: TargetShift
  /** Holds the motion's first cell (Reborn's hurt lock). */
  freeze?: boolean
}

export type TextKind =
  'damage' | 'crit' | 'miss' | 'heal' | 'shield' | 'mp' | 'buff' | 'buffEnd' | 'skill' | 'info'

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
  /** Loaded ultimate art for a fighter's skill (none: the strike plays the normal motion). */
  secretArt?: (fighter: number, skillId: number) => SecretArt | undefined
}

/** Splits `total` into `count` strikes; the last strike gets the remainder. */
export function splitDamage(total: number, count: number) {
  const n = Math.max(1, Math.floor(count))
  const base = Math.trunc(total / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base))
}

const STRIKES = new Set([5, 7, 14])
/** Event 3: the actor cannot move this turn. */
const CANNOT_MOVE = 3
/** Buffs that stop the owner from acting (game-core buffs.ts: freeze, stun, seduction). */
const CONTROL_BUFFS = [11802, 11813, 11815]

/** An HP change as a floating text: "-5" damage or "+5" heal, never "--5". */
export function hpText(change: number): { kind: TextKind; text: string } {
  return change < 0
    ? { kind: 'damage', text: `-${-change}` }
    : { kind: change > 0 ? 'heal' : 'damage', text: change > 0 ? `+${change}` : '0' }
}

export function buildTimeline(replay: Replay, options: TimelineOptions): Timeline {
  const { fighters } = replay
  const {
    art,
    skillMotions,
    skillName = () => undefined,
    buffName = () => undefined,
    secretArt = () => undefined,
  } = options
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
  /** Adds `change` (negative: a loss) to fighter i's HP, kept within 0 and its max HP. */
  const changeHp = (at: number, i: number, change: number) => {
    const max = fighters[i]?.maxHp ?? Infinity
    hp[i] = Math.min(max, Math.max(0, hp[i]! + change))
    bar(at, i)
  }

  /**
   * What the actor gets back from its own event: shield absorbs, rebound, other self damage and
   * life steal. Its HP changes by `incHp - selfDamage` (selfDamage includes the rebound).
   */
  function selfEffects(at: number, ev: FightEvent) {
    const actor = ev.actor
    if (ev.selfShield) text(at, actor, 'shield', `Absorbed ${ev.selfShield}`)
    const back = Math.max(0, ev.backDamage ?? 0)
    if (back) text(at, actor, 'damage', `Rebound -${back}`)
    // The rest of the self damage; a self shield can leave less than the rebound shown.
    const total = ev.selfDamage ?? 0
    const other = back ? Math.max(0, total - back) : total
    if (other) {
      const shown = hpText(-other)
      text(at, actor, shown.kind, shown.text)
    }
    if (ev.incHp) text(at, actor, 'heal', `+${ev.incHp}`)
    if (ev.incMp) {
      mp[actor] = Math.min(fighters[actor]?.maxMp ?? Infinity, mp[actor]! + ev.incMp)
      text(at, actor, 'mp', `+${ev.incMp} MP`)
      bar(at, actor)
    }
    const change = (ev.incHp ?? 0) - (ev.selfDamage ?? 0)
    if (change) changeHp(at, actor, change)
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

  /** `hold`: the target keeps its current (secret-technique) pose; `shift` keeps moving it. */
  function react(
    target: number,
    at: number,
    ev: FightEvent,
    amount: number,
    last: boolean,
    { shift, hold = false }: { shift?: TargetShift; hold?: boolean } = {},
  ) {
    if (ev.hit === false) {
      pose(target, at, DODGE)
      text(at, target, 'miss', 'Dodge')
      pose(target, at + motionMs(target, DODGE), STAND)
      return
    }
    const motion = ev.crit ? HIT_HEAVY : HIT_LIGHT
    if (!hold) pose(target, at, motion, { shift })
    changeHp(at, target, -amount)
    // Negative damage: the target's absorption turned the hit into a heal.
    if (ev.crit && amount > 0) text(at, target, 'crit', `Critical ${amount}`)
    else {
      const shown = hpText(-amount)
      text(at, target, shown.kind, shown.text)
    }
    if (ev.targetShield && last) text(at, target, 'shield', `Absorbed ${ev.targetShield}`)
    if (ev.parry && last) text(at, target, 'info', 'Parry')
    if (!hold && hp[target]! > 0) pose(target, at + motionMs(target, motion), STAND, { shift })
  }

  /** Skill name and MP cost shown when a strike starts. */
  function announce(ev: FightEvent, start: number) {
    const actor = ev.actor
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
  }

  /** The fighter a strike lands on (none for self casts and misses without a target). */
  const targetOf = ({ target, actor, hit, damage }: FightEvent) =>
    target !== undefined &&
    target !== actor &&
    fighters[target] !== undefined &&
    (hit !== undefined || damage !== undefined)
      ? target
      : undefined

  /**
   * An ultimate with Reborn art: the caster hides at home while the overlay plays, the target
   * reacts from `motionFrame` and takes the whole damage on `damageFrame`.
   */
  function secretStrike(ev: FightEvent, start: number, secret: SecretArt) {
    const actor = ev.actor
    const { technique } = secret
    const { motion, skillId } = skillMotion(art[actor], ev.skillId, skillMotions)
    announce(ev, start)
    const overlay = secretOverlay(secret, sideOf(actor), home(actor), STAGE.groundY, STAGE.width)
    pose(actor, start, motion, { skillId, secret: overlay })
    const frameAt = (frame: number) => start + (frame - 1) * SECRET_FRAME_MS
    const impact = frameAt(technique.damageFrame)
    let end = start + Math.max(...overlay.layers.map((l) => l.frames.length)) * SECRET_FRAME_MS
    const target = targetOf(ev)
    if (target !== undefined) {
      let shift: TargetShift | undefined
      let hold = false
      if (technique.motionFrame > 0) {
        const at = frameAt(technique.motionFrame)
        const frames = shiftFrames(technique)
        if (frames > 0 && !Array.isArray(technique.transforms)) {
          const { transforms, targetVisibility: visibility } = technique
          shift = { at, transforms, visibility, sign: rebornSign(sideOf(target)), frames }
          end = Math.max(end, at + frames * SECRET_FRAME_MS)
        }
        pose(target, at, HIT_LIGHT, { shift, freeze: true })
        hold = technique.holdDeathUntilReaction === true && shift !== undefined
      }
      react(target, impact, ev, ev.damage ?? 0, true, { shift, hold })
      if (hold && hp[target]! > 0) pose(target, shift!.at + shift!.frames * SECRET_FRAME_MS, STAND)
    }
    selfEffects(impact, ev)
    changeBuffs(impact, ev)
    end = Math.max(end, impact)
    if (hp[actor]! > 0) pose(actor, end, STAND)
    return end
  }

  function strike(ev: FightEvent, start: number) {
    const actor = ev.actor
    const secret = ev.skillId === undefined ? undefined : secretArt(actor, ev.skillId)
    if (secret) return secretStrike(ev, start, secret)
    const { motion, skillId } = skillMotion(art[actor], ev.skillId, skillMotions)
    announce(ev, start)
    const target = targetOf(ev)
    const onTarget = target !== undefined
    const contact = onTarget ? home(target) - facing(actor) * CONTACT : home(actor)
    let t = start
    if (onTarget) {
      pose(actor, t, RUN, { to: contact, moveMs: RUN_MS })
      t += RUN_MS
    }
    const parts = splitDamage(ev.damage ?? 0, ev.attackCount ?? 1)
    let impact = t
    parts.forEach((amount, k) => {
      pose(actor, t, motion, { from: contact, to: contact, skillId })
      impact = t + hitMs(actor, motion)
      if (onTarget) react(target, impact, ev, amount, k === parts.length - 1)
      t += motionMs(actor, motion)
    })
    selfEffects(impact, ev)
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
    const ticks = Boolean(ev.selfDamage || ev.incHp || ev.incMp || ev.selfShield)
    if (!ticks && changes === 0) return start
    if (ticks) {
      const name = ev.skillId === undefined ? undefined : buffName(ev.skillId)
      if (name) text(start, actor, 'buff', name)
      // Only a loss makes the fighter flinch; a healing tick does not.
      const hurt = (ev.selfDamage ?? 0) > (ev.incHp ?? 0)
      if (hurt) pose(actor, start, HIT_LIGHT)
      selfEffects(start, ev)
      if (hurt && hp[actor]! > 0) pose(actor, start + motionMs(actor, HIT_LIGHT), STAND)
    }
    changeBuffs(start, ev)
    return start + BUFF_EVENT_MS
  }

  /** Event 3: the actor skips its turn, held by a control buff ("Frozen", "Dizzy"). */
  function cannotMove(ev: FightEvent, start: number) {
    const held = [...buffs[ev.actor]!].reverse().find((b) => CONTROL_BUFFS.includes(b))
    const name = held === undefined ? undefined : buffName(held)
    text(start, ev.actor, 'info', name ?? 'Cannot move')
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
    else if (ev.event === CANNOT_MOVE) t = cannotMove(ev, t)
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

/** Distinct overlay layers in a timeline (the atlases the battle scene loads). */
export function secretLayers(timeline: Pick<Timeline, 'poses'>) {
  const layers = new Map<string, OverlayLayer>()
  for (const pose of timeline.poses.flat()) {
    for (const layer of pose.secret?.layers ?? []) layers.set(layer.texture, layer)
  }
  return [...layers.values()]
}
