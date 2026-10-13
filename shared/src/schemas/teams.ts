// Teams (docs/original-data/teams.md) under /api/game/team: 2-3 ninjas, one captain, formed in
// the neutral fields 26xx-28xx or at the toll gate guard; the team stone boards.
import { z } from 'zod'
import type { PubFightResult, TollGateFightResult, GateRewards } from './gates.js'

/** TEAM_PLAYERMAX and TEAM_MINCOUNT (TeamDefine.java); a team falling below 2 is disbanded. */
export const TEAM_MAX_SIZE = 3
/** Invites and applications expire after this long (decision: 60 s). */
export const TEAM_PROMPT_TTL_MS = 60_000
/** A disconnected member leaves after this long (decision 15). */
export const TEAM_GRACE_MS = 60_000

export const teamTargetSchema = z.object({ characterId: z.uuid() }).strict()
/** Invite or apply: the target by id or by name (case-insensitive, like the original 260). */
export const teamInviteSchema = z.union([
  teamTargetSchema,
  z.object({ name: z.string().trim().min(1).max(32) }).strict(),
])
export const teamOrderSchema = z
  .object({ characterId: z.uuid(), direction: z.enum(['up', 'down']) })
  .strict()
export const teamPromptParamsSchema = z.object({ id: z.uuid() })

export type TeamTargetInput = z.input<typeof teamTargetSchema>
export type TeamInviteInput = z.input<typeof teamInviteSchema>
export type TeamOrderInput = z.input<typeof teamOrderSchema>

export interface TeamMemberView {
  characterId: string
  name: string
  level: number
  clothing: number
  gender: 0 | 1
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  /** 0-2, the order the members fight in. */
  fightOrder: number
  captain: boolean
  /** False while the member is disconnected (inside the 60 s grace). */
  online: boolean
}

export interface TeamView {
  id: string
  sceneId: number
  captainId: string
  /** Sorted by fight order. */
  members: TeamMemberView[]
}

export interface TeamPlayer {
  characterId: string
  name: string
  level: number
}

export interface TeamPromptView {
  id: string
  /** `invite`: someone invites me into their team; `apply`: someone asks to join my team. */
  kind: 'invite' | 'apply'
  from: TeamPlayer
  expiresAt: string
}

/** GET /api/game/team. */
export interface TeamState {
  team: TeamView | null
  /** Pending prompts addressed to me. */
  prompts: TeamPromptView[]
}

export interface BoardPlayer extends TeamPlayer {
  /** Arena tier (0-21), null before the first arena visit. */
  arenaTier: number | null
}

/** GET /api/game/team/board: the team stone lists of the current field. */
export interface TeamBoardView {
  sceneId: number
  /** Teams of two looking for a third (publish: the captain). */
  teams: { teamId: string; captain: BoardPlayer; member: BoardPlayer }[]
  /** Solo ninjas looking for a team. */
  solos: BoardPlayer[]
  /** Whether I (or my team) am on the board. */
  listed: boolean
}

/** What each member got from a team fight (the captain's own result is the usual one). */
export interface TeamMemberRewards {
  characterId: string
  name: string
  rewards: GateRewards
  /** The captain bonus (CaptianMul) included in `rewards`. */
  bonus?: { exp: number; stone: number }
}

export type TeamTollGateFightResult<R = unknown> = TollGateFightResult<R> & {
  team?: TeamMemberRewards[]
}
export type TeamPubFightResult<R = unknown> = PubFightResult<R> & {
  team?: TeamMemberRewards[]
}
