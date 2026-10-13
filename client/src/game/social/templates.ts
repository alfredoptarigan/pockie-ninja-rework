// English text of typed system mails ({ templateKey, params }, decision 3). Each system that sends
// one adds its template here; params are plain values, rendered as text, never HTML.
import type { MailEntry } from '../../../../shared/src/schemas/social'

type Params = NonNullable<MailEntry['params']>
type Template = (params: Params) => { subject: string; body: string }

const name = (params: Params) => String(params.name ?? 'A ninja')

export const SYSTEM_MAIL_TEXT: Record<string, Template> = {
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
