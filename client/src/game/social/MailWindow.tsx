// Mail window (UI_MailFrame, minimap Mail button): category tabs with unread counts, the list with
// batch delete, the read view (Reply, Add Friend, Block, Report, Delete) and the write panel.
import { useState, type CSSProperties } from 'react'
import {
  MAIL_CATEGORIES,
  MAIL_SUBJECT_MAX,
  type MailCategory,
  type MailEntry,
} from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useFriendAction, useMailAction, useMailList, useMailSummary } from './api'
import { ComposeMail } from './ComposeMail'
import { mailText } from './templates'

const CATEGORY_TITLES: Record<MailCategory, string> = {
  player: 'Player Mail',
  arena: 'Arena',
  market: 'Market',
  interaction: 'Player Interaction',
  las_noches: 'Las Noches',
  other: 'Others',
}
const UI = '/assets/game/ui'
const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string) => date.format(new Date(iso))

type View =
  | { kind: 'list' }
  | { kind: 'read'; mail: MailEntry }
  | { kind: 'compose'; to?: string; subject?: string }

const reply = (subject: string) =>
  (subject.startsWith('Re: ') ? subject : `Re: ${subject}`).slice(0, MAIL_SUBJECT_MAX)

function ReadMail({
  mail,
  onReply,
  onDone,
}: {
  mail: MailEntry
  onReply: () => void
  onDone: () => void
}) {
  const action = useMailAction()
  const friend = useFriendAction()
  const [done, setDone] = useState<string | null>(null)
  const { subject, body } = mailText(mail)
  const sender = mail.category === 'player' ? mail.sender : null
  const error = action.error ?? friend.error
  return (
    <article aria-label="Mail" className="flex flex-col gap-2 text-[12px] text-black">
      <p>From: {mail.sender?.name ?? 'System'}</p>
      <p>Subject: {subject}</p>
      <p>
        Received {when(mail.createdAt)}; deleted after {when(mail.expiresAt)}
      </p>
      <p className="game-card min-h-16 p-2 whitespace-pre-wrap">{body}</p>
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {done && <Notice>{done}</Notice>}
      <div className="flex flex-wrap justify-end gap-1">
        {sender && (
          <>
            <GameButton small onClick={onReply}>
              Reply
            </GameButton>
            <GameButton
              small
              onClick={() =>
                friend.mutate(
                  { path: 'friends/add', body: { name: sender.name } },
                  { onSuccess: () => setDone(`${sender.name} is on your friend list.`) },
                )
              }
            >
              Add Friend
            </GameButton>
            <GameButton
              small
              onClick={() =>
                window.confirm(`Block ${sender.name}? You will get no more mail from them.`) &&
                friend.mutate(
                  { path: 'blocks/add', body: { characterId: sender.characterId } },
                  { onSuccess: () => setDone(`${sender.name} is blocked.`) },
                )
              }
            >
              Block
            </GameButton>
          </>
        )}
        {mail.category === 'player' && (
          <GameButton
            small
            onClick={() =>
              action.mutate(
                { path: 'mail/report', body: { id: mail.id } },
                { onSuccess: () => setDone('Thank you. The mail was reported.') },
              )
            }
          >
            Report
          </GameButton>
        )}
        <GameButton
          small
          onClick={() =>
            action.mutate({ path: 'mail/delete', body: { ids: [mail.id] } }, { onSuccess: onDone })
          }
        >
          Delete
        </GameButton>
        <GameButton small onClick={onDone}>
          Back
        </GameButton>
      </div>
    </article>
  )
}

function MailList({
  category,
  onOpen,
}: {
  category: MailCategory
  onOpen: (m: MailEntry) => void
}) {
  const list = useMailList(category)
  const action = useMailAction()
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const open = (mail: MailEntry) => {
    if (!mail.read) action.mutate({ path: 'mail/read', body: { id: mail.id } })
    onOpen(mail)
  }
  const mails = list.data?.mails ?? []
  return (
    <div className="flex flex-col gap-2 text-[12px] text-black">
      {list.isError && <Notice tone="error">{errorMessage(list.error)}</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      <ul aria-label={`${CATEGORY_TITLES[category]} list`} className="flex flex-col gap-1">
        {mails.map((mail) => (
          <li
            key={mail.id}
            className="flex items-center gap-1 bg-[url(/assets/game/ui/list-row.webp)] bg-size-[100%_100%] px-1 py-0.5"
          >
            <input
              type="checkbox"
              aria-label={`Select ${mailText(mail).subject}`}
              checked={selected.includes(mail.id)}
              onChange={() => toggle(mail.id)}
            />
            <img
              src={`${UI}/mail-${mail.read ? 'read' : 'unread'}.webp`}
              alt={mail.read ? 'Read' : 'Unread'}
              className="h-4 w-auto"
            />
            <button
              type="button"
              onClick={() => open(mail)}
              className={`min-w-0 flex-1 truncate text-left ${mail.read ? '' : 'font-bold'}`}
            >
              {mailText(mail).subject}
            </button>
            <span className="truncate">{mail.sender?.name ?? 'System'}</span>
          </li>
        ))}
      </ul>
      {list.data && !mails.length && <p>No mail here.</p>}
      <div className="flex justify-end gap-1">
        <GameButton
          small
          disabled={!selected.length || action.isPending}
          onClick={() =>
            action.mutate(
              { path: 'mail/delete', body: { ids: selected } },
              { onSuccess: () => setSelected([]) },
            )
          }
        >
          Delete Selected
        </GameButton>
        <GameButton
          small
          disabled={action.isPending}
          onClick={() => action.mutate({ path: 'mail/delete-read', body: { category } })}
        >
          Delete Read
        </GameButton>
      </div>
    </div>
  )
}

export function MailWindow({ onClose }: { onClose: () => void }) {
  const summary = useMailSummary()
  const [category, setCategory] = useState<MailCategory>('player')
  const [view, setView] = useState<View>({ kind: 'list' })
  const toList = () => setView({ kind: 'list' })
  return (
    <Dialog title="Mail" onClose={onClose} className="w-[560px]">
      <div className="flex gap-2">
        <nav aria-label="Mail categories" className="flex w-[150px] shrink-0 flex-col gap-1">
          {MAIL_CATEGORIES.map((id) => {
            const count = summary.data?.categories.find((c) => c.category === id)
            return (
              <button
                key={id}
                type="button"
                aria-current={id === category && view.kind === 'list' ? 'true' : undefined}
                onClick={() => {
                  setCategory(id)
                  toList()
                }}
                className="h-[22px] bg-(image:--bg) bg-size-[100%_100%] px-1 text-left text-[12px] text-white"
                style={
                  {
                    '--bg': `url(${UI}/accordion-header${id === category ? '-selected' : ''}.webp)`,
                  } as CSSProperties
                }
              >
                {CATEGORY_TITLES[id]} ({count?.unread ?? 0}/{count?.total ?? 0})
              </button>
            )
          })}
          <GameButton small onClick={() => setView({ kind: 'compose' })}>
            Write Letter
          </GameButton>
        </nav>
        <div className="min-w-0 flex-1">
          {view.kind === 'list' && (
            <MailList category={category} onOpen={(mail) => setView({ kind: 'read', mail })} />
          )}
          {view.kind === 'read' && (
            <ReadMail
              mail={view.mail}
              onDone={toList}
              onReply={() =>
                setView({
                  kind: 'compose',
                  to: view.mail.sender?.name,
                  subject: reply(view.mail.subject ?? ''),
                })
              }
            />
          )}
          {view.kind === 'compose' && (
            <ComposeMail to={view.to} subject={view.subject} onSent={toList} onCancel={toList} />
          )}
        </div>
      </div>
    </Dialog>
  )
}

/** The minimap Mail button with the unread count (UI_SmallMap; it blinked on new mail). */
export function MailButton({ onOpen }: { onOpen: () => void }) {
  const summary = useMailSummary()
  const unread = summary.data?.unread ?? 0
  return (
    <button
      type="button"
      aria-label={unread ? `Mail (${unread} unread)` : 'Mail'}
      title="Mail"
      onClick={onOpen}
      className={`pointer-events-auto relative h-[26px] w-[26px] bg-(image:--up) bg-size-[100%_100%] hover:bg-(image:--over) active:bg-(image:--down) ${
        unread ? 'animate-pulse' : ''
      }`}
      style={
        {
          '--up': `url(${UI}/minimap-mail-up.webp)`,
          '--over': `url(${UI}/minimap-mail-over.webp)`,
          '--down': `url(${UI}/minimap-mail-down.webp)`,
        } as CSSProperties
      }
    >
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 rounded-full bg-[#c0201a] px-1 font-game text-[10px] text-white">
          {unread}
        </span>
      )}
    </button>
  )
}
