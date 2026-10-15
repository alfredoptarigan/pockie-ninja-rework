// Friends, the Blocked list, mail and mail reports (docs/original-data/friends-mail.md, M4
// decisions 3 and 16-19). Everything is addressed by character id or mail uuid; names are only
// used to look a ninja up.
import { z } from 'zod'
import type { CharacterStats, Nation } from './game.js'
import type { SkillSlot } from './skills.js'

/** Friend slots for everyone (decision 16; the original MaxFriendCount, no paid expansion). */
export const MAX_FRIENDS = 100
/** The Blocked list shares the cap, as the original enemy list shared MaxFriend. */
export const MAX_BLOCKED = 100
/** PlayerMailMaxTitleWord and PlayerMailMaxTextWord (Mail/MailPropConfig.ini). */
export const MAIL_SUBJECT_MAX = 20
export const MAIL_BODY_MAX = 200
/** Level needed to send player mail (decision 18, same as whispers and world chat). */
export const MAIL_MIN_LEVEL = 10
/**
 * Unexpired player mails one inbox holds. A full inbox refuses new player mail (decision 18, no
 * eviction); the original kept 10 and evicted. 50 leaves room for a week of mail.
 */
export const PLAYER_INBOX_CAP = 50
/** Player mails one ninja may send per hour, in total and to one recipient. */
export const MAIL_SEND_PER_HOUR = 10
export const MAIL_SEND_PER_RECIPIENT_PER_HOUR = 3

/** Mail window tabs in the original order (UI_MailFrame._mailTypeAry), the M4 subset. */
export const MAIL_CATEGORIES = [
  'player',
  'arena',
  'market',
  'interaction',
  'las_noches',
  'other',
] as const
export type MailCategory = (typeof MAIL_CATEGORIES)[number]

// C0/C1 control characters (but line feeds) and bidirectional overrides that spoof how text reads.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g

/** Plain text: control characters become spaces, then the text is trimmed. Never HTML. */
const plainText = (max: number, empty: string, tooLong: string) =>
  z
    .string()
    .max(max * 4)
    .transform((text) => text.replace(CONTROL_CHARACTERS, ' ').trim())
    .pipe(z.string().min(1, empty).max(max, tooLong))

/** Names are 3-12 letters, digits or underscores; anything else is an unknown ninja. */
export const ninjaNameSchema = z.string().trim().min(1, 'Type a ninja name.').max(32)

export const friendAddSchema = z.object({ name: ninjaNameSchema }).strict()
export const characterRefSchema = z.object({ characterId: z.uuid() }).strict()
/** The add-back prompt (Common_AddFriendPrompt): add the player too, or dismiss it. */
export const friendAddBackSchema = z.object({ characterId: z.uuid(), accept: z.boolean() }).strict()
/** Block by name (Friends window) or by id (a friend row, a mail). */
export const blockAddSchema = z.union([
  z.object({ name: ninjaNameSchema }).strict(),
  characterRefSchema,
])

export const mailSendSchema = z
  .object({
    to: ninjaNameSchema,
    subject: plainText(
      MAIL_SUBJECT_MAX,
      'Type a subject.',
      `Subjects can be at most ${MAIL_SUBJECT_MAX} characters.`,
    ),
    body: plainText(
      MAIL_BODY_MAX,
      'Write a message.',
      `Mail can be at most ${MAIL_BODY_MAX} characters.`,
    ),
  })
  .strict()
export const mailListSchema = z.object({ category: z.enum(MAIL_CATEGORIES) }).strict()
export const mailRefSchema = z.object({ id: z.uuid() }).strict()
export const mailDeleteSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict()
/** Deletes every read mail, of one category or of all. */
export const mailDeleteReadSchema = z
  .object({ category: z.enum(MAIL_CATEGORIES).optional() })
  .strict()

export type MailSendInput = z.input<typeof mailSendSchema>

/** Public fields of another ninja. */
export interface SocialPlayer {
  characterId: string
  name: string
  level: number
  nation: Nation
  gender: 0 | 1
  clothing: number
  avatarId: number
}

export interface FriendEntry extends SocialPlayer {
  online: boolean
  /** Both list each other (the original home friend flag). */
  mutual: boolean
}

export interface FriendsView {
  friends: FriendEntry[]
  /**
   * Players who added you and wait for an answer to the add-back prompt (Reborn's Requests tab:
   * Accept adds them back, Reject dismisses the prompt).
   */
  addBack: (SocialPlayer & { online: boolean })[]
  max: number
}

/** Online ninjas in my scene, for Reborn's Player List (Area tab). */
export interface ScenePlayersView {
  players: SocialPlayer[]
}

/** An item another ninja wears, by its slot (the server's equippedSlot). */
export interface WornItem {
  slot: string
  itemId: string
  nameKey: string
  enhanceLevel: number
}

/**
 * Reborn's View Character: the public face of another ninja. `stats` and `skills` (the active
 * preset's six slots) are absent when the ninja hides them, unless you view yourself.
 */
export interface PlayerView {
  player: SocialPlayer
  online: boolean
  equipped: WornItem[]
  hideStats: boolean
  stats?: CharacterStats
  skills?: SkillSlot[]
}

export interface BlockedView {
  blocked: SocialPlayer[]
  max: number
}

export interface MailEntry {
  id: string
  category: MailCategory
  /** Null for system mail, or when the sender's ninja is gone. */
  sender: { characterId: string; name: string } | null
  /** Player mail: plain text. */
  subject: string | null
  body: string | null
  /** System mail: a template key and its params (names, item ids, amounts). */
  templateKey: string | null
  params: Record<string, string | number> | null
  read: boolean
  createdAt: string
  expiresAt: string
}

export interface MailCategoryCount {
  category: MailCategory
  unread: number
  total: number
}

export interface MailSummary {
  categories: MailCategoryCount[]
  unread: number
}

export interface MailListView extends MailSummary {
  mails: MailEntry[]
}
