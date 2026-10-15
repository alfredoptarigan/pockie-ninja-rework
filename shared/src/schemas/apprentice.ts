// Master and Apprentice API (server/src/modules/apprentice). Rules and config live in
// game-core/src/social/apprentice.ts.
import { z } from 'zod'

/** A ninja by name, like Add Friend; the levels decide who becomes the master. */
export const apprenticeRequestSchema = z.object({ name: z.string().trim().min(1).max(32) }).strict()
export const apprenticeRequestIdSchema = z.object({ requestId: z.uuid() }).strict()
/** The other side of one of my apprenticeships. */
export const apprenticePartnerSchema = z.object({ characterId: z.uuid() }).strict()

export interface ApprenticePlayer {
  characterId: string
  name: string
  level: number
}

export interface ApprenticeMember extends ApprenticePlayer {
  online: boolean
  /** The apprentice reached the graduation level. */
  canGraduate: boolean
}

export interface ApprenticeRequestView {
  id: string
  from: ApprenticePlayer
  to: ApprenticePlayer
  /** What the sender becomes when the request is accepted. */
  senderRole: 'master' | 'apprentice'
  expiresAt: string
}

export interface ApprenticeState {
  master: ApprenticeMember | null
  apprentices: ApprenticeMember[]
  /** Requests to me, oldest first. */
  incoming: ApprenticeRequestView[]
  /** My request waiting for an answer. */
  outgoing: ApprenticeRequestView | null
}
