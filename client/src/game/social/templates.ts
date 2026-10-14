// English text of typed system mails ({ templateKey, params }, decision 3). Each system that sends
// one adds its template here; params are plain values, rendered as text, never HTML.
import type { MailEntry } from '../../../../shared/src/schemas/social'
import { signedScore } from '../arena/labels'
import { itemName } from '../explore'
import { TEAM_STONE_MAIL_TEXT } from '../team-stone'

type Params = NonNullable<MailEntry['params']>
type Template = (params: Params) => { subject: string; body: string }

const name = (params: Params) => String(params.name ?? 'A ninja')
const text = (value: unknown, fallback: string) => (value == null ? fallback : String(value))

/** "1,200 Stone and 30 Gold"; "nothing" when both are zero. */
const amount = (stone: unknown, gold: unknown) => {
  const parts = [
    [Number(stone) || 0, 'Stone'],
    [Number(gold) || 0, 'Gold'],
  ]
    .filter(([value]) => value)
    .map(([value, unit]) => `${(value as number).toLocaleString('en-US')} ${unit}`)
  return parts.length ? parts.join(' and ') : 'nothing'
}

/** "3 x Healing Powder" */
const goods = (params: Params) =>
  `${Number(params.count) || 1} x ${itemName(String(params.itemId))}`

export const SYSTEM_MAIL_TEXT: Record<string, Template> = {
  ...TEAM_STONE_MAIL_TEXT,
  // AddFriendMailTitle / AddFriendMailContent.
  'friend.added': (params) => ({
    subject: 'New friend',
    body: `${name(params)} added you as a friend. Add them too from the Friends window.`,
  }),
  // Mail_Title_002, written from the reader's side (the original showed the remover's text).
  'friend.removed': (params) => ({
    subject: 'Friend removed',
    body: `${name(params)} removed you from their friend list.`,
  }),
  // MarkerMail_0005: the seller's notice; proceeds wait in the Market wallet.
  market_sold: (params) => ({
    subject: 'Item sold',
    body: `${text(params.buyer, 'A ninja')} bought ${goods(params)}. You earned ${amount(params.stone, params.gold)} after tax. ${Number(params.left) || 0} left on the Market. Claim your earnings in the Market.`,
  }),
  market_sold_out: (params) => ({
    subject: 'Listing sold out',
    body: `${text(params.buyer, 'A ninja')} bought ${goods(params)}. You earned ${amount(params.stone, params.gold)} after tax. Claim your earnings in the Market.`,
  }),
  // MarkerMail_0008.
  market_bought: (params) => ({
    subject: 'Purchase complete',
    body: `You bought ${goods(params)} from ${text(params.seller, 'a ninja')} for ${amount(params.stone, params.gold)}. Claim the item in the Warehouse tab of the Market.`,
  }),
  // MarkerMail_0006.
  market_expired: (params) => ({
    subject: 'Listing expired',
    body: `Your listing of ${goods(params)} has expired. Claim the items in the Warehouse tab of the Market.`,
  }),
  // Defender notices, written for the arena (the original had none).
  arena_defense_won: (params) => ({
    subject: 'Arena defense won',
    body: `${text(params.attacker, 'A ninja')} attacked you in the arena and lost. Your score changed by ${signedScore(Number(params.score) || 0)}.`,
  }),
  arena_defense_lost: (params) => ({
    subject: 'Arena defense lost',
    body: `${text(params.attacker, 'A ninja')} attacked you in the arena and won. Your score changed by ${signedScore(Number(params.score) || 0)}.`,
  }),
}

export function systemMailText(mail: Pick<MailEntry, 'templateKey' | 'params'>) {
  const template = mail.templateKey ? SYSTEM_MAIL_TEXT[mail.templateKey] : undefined
  return template?.(mail.params ?? {}) ?? { subject: 'System notice', body: 'You have a notice.' }
}

/** Subject and body of any mail, as shown in the list and the read view. */
export function mailText(mail: MailEntry) {
  return mail.category === 'player'
    ? { subject: mail.subject ?? '', body: mail.body ?? '' }
    : systemMailText(mail)
}
