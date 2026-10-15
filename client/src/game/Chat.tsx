import {
  CHAT_MAX_LENGTH,
  REALTIME_EVENTS,
  type ChatAck,
  type ChatChannel,
  type ChatMessage,
  type ChatReportInput,
  type ChatSendInput,
  type FriendPresenceEvent,
  type Notice,
  type RealtimeConnectErrorCode,
  type ReportAck,
  type ScenePlayer,
} from '@pockie/shared'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { createGameSocket, type GameSocket } from '../lib/socket'
import { gameKeys, useInventory } from './api'
import { useGear } from './forge'
import { TIER_COLORS } from './forge/gear'
import { GameButton, Notice as NoticeBox, Panel } from './skin'
import { onItemLinkRequest, onWhisperRequest } from './social/requests'
import { plainText } from './text'

const MAX_MESSAGES = 100

type Status = 'connecting' | 'online' | 'offline'
/** Emits a chat message; false when there is no socket. */
type SendChat = (input: ChatSendInput, ack: (result: ChatAck) => void) => boolean
/** Emits a report; false when there is no socket. */
type SendReport = (input: ChatReportInput, ack: (result: ReportAck) => void) => boolean
/** A line the client writes itself: notices, friend presence, report confirmations. */
interface SystemLine {
  id: string
  channel: 'system'
  text: string
  sentAt: string
}
type Line = ChatMessage | SystemLine

const CONNECT_ERRORS: Record<RealtimeConnectErrorCode, string> = {
  unauthenticated: 'Your session ended. Please log in again.',
  no_character: 'Create your ninja first.',
  too_many_connections: 'Too many game tabs are open. Close one and reload.',
}
/** A refusal without a code: a foreign origin, or the server cannot be reached. */
const UNAVAILABLE = 'Chat is unavailable. Reconnecting...'

/** The session is gone: checking it again lets the route guard send the player to log in. */
const recheckSession = (queryClient: QueryClient) =>
  void queryClient.invalidateQueries({ queryKey: ['me'] })

const noticeListeners = new Set<(notice: Notice) => void>()
const presenceListeners = new Set<(event: FriendPresenceEvent) => void>()

/** Lets other windows react to push notices (mail, team prompts, ...). Returns an unsubscribe. */
export function onNotice(listener: (notice: Notice) => void) {
  noticeListeners.add(listener)
  return () => void noticeListeners.delete(listener)
}

/** Lets the Friends window follow who comes online. Returns an unsubscribe. */
export function onFriendPresence(listener: (event: FriendPresenceEvent) => void) {
  presenceListeners.add(listener)
  return () => void presenceListeners.delete(listener)
}

/** The chat line for a notice; null when it needs none. */
function noticeText(notice: Notice): string | null {
  switch (notice.kind) {
    case 'mail':
      return 'You have new mail.'
    case 'teamPrompt':
      return notice.prompt === 'invite'
        ? `${notice.from.name} (Level ${notice.from.level}) has invited you to join a team.`
        : `${notice.from.name} (Level ${notice.from.level}) has applied to join your team.`
    case 'teamChanged':
    case 'clanChanged':
      return notice.message ?? null
    case 'marketSale':
      return 'One of your Market listings has sold.'
    case 'friendAdded':
      return `${notice.from.name} added you as a friend.`
  }
}

const systemLine = (text: string): SystemLine => ({
  id: crypto.randomUUID(),
  channel: 'system',
  text,
  sentAt: new Date().toISOString(),
})

/** One socket per game screen: scene players, chat, notices and connection state. */
function useRealtime() {
  const queryClient = useQueryClient()
  const socket = useRef<GameSocket | null>(null)
  const [players, setPlayers] = useState<ScenePlayer[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)
  const addLine = (line: Line) => setLines((list) => [...list, line].slice(-MAX_MESSAGES))

  useEffect(() => {
    const next = createGameSocket()
    socket.current = next
    next.on('connect', () => {
      setStatus('online')
      setError(null)
    })
    next.on('disconnect', () => setStatus('offline'))
    next.on('connect_error', (err) => {
      setStatus('offline')
      const code = (err as Error & { data?: { code?: RealtimeConnectErrorCode } }).data?.code
      setError((code && CONNECT_ERRORS[code]) || UNAVAILABLE)
      // The character or session is gone: let the game screen route to creation or login.
      if (code === 'no_character')
        void queryClient.invalidateQueries({ queryKey: gameKeys.character })
      if (code === 'unauthenticated') recheckSession(queryClient)
    })
    next.on(REALTIME_EVENTS.scenePlayers, (event) => setPlayers(event.players))
    next.on(REALTIME_EVENTS.chatMessage, addLine)
    next.on(REALTIME_EVENTS.notice, (notice) => {
      const text = noticeText(notice)
      if (text) addLine(systemLine(text))
      for (const listener of noticeListeners) listener(notice)
    })
    next.on(REALTIME_EVENTS.friendPresence, (event) => {
      addLine(systemLine(`${event.name} is ${event.online ? 'now online' : 'now offline'}.`))
      for (const listener of presenceListeners) listener(event)
    })
    return () => {
      next.disconnect()
      socket.current = null
    }
  }, [queryClient])

  const send: SendChat = (input, ack) => {
    if (!socket.current) return false
    socket.current.emit(REALTIME_EVENTS.chatSend, input, (result) => {
      if (!result.ok && result.error.code === 'unauthenticated') recheckSession(queryClient)
      ack(result)
    })
    return true
  }
  const report: SendReport = (input, ack) => {
    if (!socket.current) return false
    socket.current.emit(REALTIME_EVENTS.chatReport, input, ack)
    return true
  }
  const addSystemLine = (text: string) => addLine(systemLine(text))
  return { send, report, addSystemLine, players, lines, status, error }
}

/**
 * Chat box at the bottom left of the stage; the scene's player list opens from its tab row.
 * `inTeam` shows the Team tab and channel, `inClan` the Clan ones.
 */
export function RealtimePanels({
  characterId,
  inTeam = false,
  inClan = false,
}: {
  characterId: string
  inTeam?: boolean
  inClan?: boolean
}) {
  const realtime = useRealtime()
  return <ChatBox {...realtime} selfId={characterId} inTeam={inTeam} inClan={inClan} />
}

function PlayerList({ players, selfId }: { players: ScenePlayer[]; selfId: string }) {
  return (
    <Panel
      title={`Players here (${players.length})`}
      className="absolute right-0 bottom-[calc(100%+26px)] max-h-56 w-64"
    >
      {players.length === 0 ? (
        <p className="text-xs">Nobody else is here.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-xs">
          {players.map((player) => (
            <li key={player.characterId} className="flex justify-between gap-2">
              <span className={player.characterId === selfId ? 'font-bold' : ''}>
                {player.name}
              </span>
              <span>Lv. {player.level}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Channels the select sends to; whispers go by `/Name message` or a PM tab. */
type SendChannel = Exclude<ChatChannel, 'whisper'>
/** Reborn's tabs; `pm:Name` is one private-message tab per whisper partner. */
type ChatTab = 'all' | SendChannel | 'system' | `pm:${string}`
interface TabSpec {
  id: ChatTab
  title: string
  /** PM tabs carry an x that closes them. */
  closable?: boolean
}

const CHANNEL_TITLES: Record<ChatChannel | 'system', string> = {
  world: 'World',
  scene: 'Village',
  team: 'Party',
  trade: 'Trade',
  clan: 'Clan',
  whisper: 'Whisper',
  system: 'System',
}
/** Reborn's [Channel] tag colours; the rest keep the default. */
const TAG_COLORS: Partial<Record<ChatChannel | 'system', string>> = {
  world: '#ffffff',
  team: '#90ee90',
  trade: '#ffd700',
  clan: '#32cd32',
  system: '#ffffff',
}
const isSendChannel = (tab: ChatTab): tab is SendChannel =>
  tab === 'world' || tab === 'scene' || tab === 'team' || tab === 'trade' || tab === 'clan'

/**
 * Reborn's order: All, World, Village, Party (in a team), Trade, Clan (in a clan), System, then
 * the PM tabs.
 */
const tabsFor = (inTeam: boolean, inClan: boolean, partners: string[]): TabSpec[] => [
  { id: 'all', title: 'All' },
  { id: 'world', title: 'World' },
  { id: 'scene', title: 'Village' },
  ...(inTeam ? [{ id: 'team' as const, title: 'Party' }] : []),
  { id: 'trade', title: 'Trade' },
  ...(inClan ? [{ id: 'clan' as const, title: 'Clan' }] : []),
  { id: 'system', title: 'System' },
  ...partners.map((name) => ({ id: `pm:${name}` as const, title: name, closable: true })),
]

/** Whether a line belongs on a tab. All skips Trade, like Reborn; system lines show everywhere. */
function belongsOn(line: Line, tab: ChatTab, selfId: string) {
  if (tab === 'system') return line.channel === 'system'
  if (line.channel === 'system') return true
  if (tab === 'all') return line.channel !== 'trade'
  if (tab.startsWith('pm:'))
    return line.channel === 'whisper' && partnerOf(line, selfId) === tab.slice(3)
  return line.channel === tab
}

/** The other player of a whisper. */
const partnerOf = (line: ChatMessage, selfId: string) =>
  line.sender.characterId === selfId ? line.to?.name : line.sender.name

/** `/Name message`, like the original chat box. */
const WHISPER_SYNTAX = /^\/(\S+)\s+(\S[\s\S]*)$/
const WHISPER_HINT = 'To whisper, type /Name and your message.'
/** Room for "/Name " (a 12-character name) on top of the message itself. */
const WHISPER_PREFIX_LENGTH = 14
/** Reborn's counter turns red from 230 of 250. */
const COUNTER_WARN = CHAT_MAX_LENGTH - 20

const formatTime = (sentAt: string) =>
  new Date(sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Channel tabs on the original chat plates, with arrow-key navigation like the skin's Tabs. */
function ChatTabs({
  tabs,
  active,
  onChange,
  onClose,
  panelId,
}: {
  tabs: TabSpec[]
  active: ChatTab
  onChange: (tab: ChatTab) => void
  onClose: (name: string) => void
  panelId: string
}) {
  return (
    <div
      role="tablist"
      aria-label="Chat channel"
      className="absolute top-[-20px] left-[4px] flex max-w-[calc(100%-140px)] overflow-x-auto [scrollbar-width:none]"
    >
      {tabs.map((tab, index) => (
        <div key={tab.id} className="relative shrink-0">
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={panelId}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (!step) return
              const next = (index + step + tabs.length) % tabs.length
              onChange(tabs[next]!.id)
              const list = event.currentTarget.closest('[role="tablist"]')
              list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
            }}
            className="game-chat-tab h-[23px] w-[60px] font-game text-base leading-none"
          >
            {tab.closable ? (
              <span className="inline-block max-w-[50px] truncate pr-2 align-middle text-xs">
                {tab.title}
              </span>
            ) : (
              tab.title
            )}
          </button>
          {tab.closable && (
            <button
              type="button"
              aria-label={`Close ${tab.title} tab`}
              onClick={() => onClose(tab.title)}
              className="absolute top-0.5 right-1 text-[11px] leading-none text-white/70 hover:text-white"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** "[Name]" of an item in the player's own bag, keyed to its refinement-tier colour. */
type ItemLinks = ReadonlyMap<string, string>
const ITEM_LINK = /(\[[^[\]]+\])/
const NO_LINKS: ItemLinks = new Map()

/**
 * Reborn's chat item links: "[Name]" (what Link in Chat inserts) matching an item in the bag is
 * drawn in that item's tier colour. The bag loads only once some line has brackets.
 */
function useItemLinks(lines: Line[]): ItemLinks {
  const enabled = lines.some((line) => line.channel !== 'system' && ITEM_LINK.test(line.text))
  const items = useInventory({ enabled }).data
  const gear = useGear({ enabled }).data
  return useMemo(() => {
    if (!items) return NO_LINKS
    const best = new Map<string, number>()
    for (const item of items) {
      const name = plainText(item.nameKey)
      const forged = gear?.[item.id]
      const lines = forged?.appraised ? forged.props.length : 0
      if (name) best.set(`[${name}]`, Math.max(lines, best.get(`[${name}]`) ?? 0))
    }
    return new Map([...best].map(([name, lines]) => [name, TIER_COLORS[Math.min(lines, 4)]!]))
  }, [items, gear])
}

/** Plain text (React escapes it; never HTML), with bag item names drawn as links. */
function ChatText({ text, links }: { text: string; links: ItemLinks }) {
  if (links.size === 0) return <span>{text}</span>
  return (
    <span>
      {text.split(ITEM_LINK).map((part, index) => {
        const color = links.get(part)
        return color ? (
          <span
            key={index}
            className="chat-item-link rounded-sm bg-black/40 px-0.5 font-bold hover:underline"
            style={{ color }}
          >
            {part}
          </span>
        ) : (
          part
        )
      })}
    </span>
  )
}

/** The name on a line; another player's name starts a whisper to them. */
function Name({ name, onWhisper }: { name: string; onWhisper?: (name: string) => void }) {
  if (!onWhisper) return <span className="font-semibold text-[#ffd700]">{name}</span>
  return (
    <button
      type="button"
      aria-label={`Whisper to ${name}`}
      onClick={() => onWhisper(name)}
      className="font-semibold text-[#ffd700] hover:underline"
    >
      {name}
    </button>
  )
}

/** One line like the original: time, [Channel], name, colon and the text. */
function ChatLine({
  line,
  selfId,
  links,
  onWhisper,
  onReport,
}: {
  line: Line
  selfId: string
  links: ItemLinks
  onWhisper: (name: string) => void
  onReport?: (message: ChatMessage) => void
}) {
  const fromSelf = line.channel !== 'system' && line.sender.characterId === selfId
  return (
    <li className="group py-[2.5px] leading-[18px] break-words whitespace-pre-wrap">
      <time dateTime={line.sentAt} className="text-[11px] text-[#ddd]/40">
        {formatTime(line.sentAt)}
      </time>{' '}
      <span
        className="text-[13px] font-medium text-white/85"
        style={{ color: TAG_COLORS[line.channel] }}
      >
        [{CHANNEL_TITLES[line.channel]}]
      </span>{' '}
      {line.channel !== 'system' && (
        <>
          {line.channel === 'whisper' && (fromSelf ? 'To ' : 'From ')}
          {line.channel === 'whisper' && fromSelf && line.to ? (
            <Name name={line.to.name} onWhisper={onWhisper} />
          ) : (
            <Name name={line.sender.name} onWhisper={fromSelf ? undefined : onWhisper} />
          )}
          <span className="text-[#ddd]/45">:</span>{' '}
        </>
      )}
      {line.channel === 'system' ? (
        <span>{line.text}</span>
      ) : line.channel === 'clan' ? (
        <span style={{ color: TAG_COLORS.clan }}>
          <ChatText text={line.text} links={links} />
        </span>
      ) : (
        <ChatText text={line.text} links={links} />
      )}{' '}
      {line.channel !== 'system' && !fromSelf && onReport && (
        <button
          type="button"
          aria-label={`Report this message from ${line.sender.name}`}
          onClick={() => onReport(line)}
          className="ml-1 text-[11px] text-white/50 underline opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          Report
        </button>
      )}
    </li>
  )
}

/** Small gold select for the channel the input sends to, like the original "World" button. */
function ChannelSelect({
  id,
  value,
  inTeam,
  inClan,
  onChange,
}: {
  id: string
  value: SendChannel
  inTeam: boolean
  inClan: boolean
  onChange: (channel: SendChannel) => void
}) {
  // Reborn's order: World, Village, Trade, then Party in a team and Clan in a clan.
  const channels: SendChannel[] = [
    'world',
    'scene',
    'trade',
    ...(inTeam ? ['team' as const] : []),
    ...(inClan ? ['clan' as const] : []),
  ]
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Send to
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as SendChannel)}
        className="game-button h-[22px] w-[70px] appearance-none pr-4 pl-2 font-game text-xs"
      >
        {channels.map((channel) => (
          <option key={channel} value={channel}>
            {CHANNEL_TITLES[channel]}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[9px] text-[#2a1800]"
      >
        ▼
      </span>
    </div>
  )
}

export function ChatBox({
  send,
  report,
  addSystemLine,
  lines,
  players,
  selfId,
  inTeam,
  inClan = false,
  status,
  error,
}: {
  send: SendChat
  report: SendReport
  addSystemLine: (text: string) => void
  lines: Line[]
  players: ScenePlayer[]
  selfId: string
  inTeam: boolean
  inClan?: boolean
  status: Status
  error: string | null
}) {
  const [showPlayers, setShowPlayers] = useState(false)
  const [chosenTab, setTab] = useState<ChatTab>('world')
  const [chosenChannel, setChannel] = useState<SendChannel>('world')
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reported, setReported] = useState<ReadonlySet<string>>(new Set())
  /** Closed PM tabs: partner name -> their latest whisper when closed (a newer one reopens it). */
  const [closedPms, setClosedPms] = useState<Readonly<Record<string, string>>>({})
  const ids = useId()
  const logRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const links = useItemLinks(lines)
  // Latest whisper per partner, in order of the first one.
  const latestPm = new Map<string, string>()
  for (const line of lines) {
    const partner = line.channel === 'whisper' ? partnerOf(line, selfId) : undefined
    if (partner) latestPm.set(partner, line.id)
  }
  const partners = [...latestPm].filter(([name, id]) => closedPms[name] !== id).map(([n]) => n)
  const tabs = tabsFor(inTeam, inClan, partners)
  // Leaving the team or clan (or a closed PM tab) falls back to World.
  const tab = tabs.some((t) => t.id === chosenTab) ? chosenTab : 'world'
  const channel =
    (chosenChannel === 'team' && !inTeam) || (chosenChannel === 'clan' && !inClan)
      ? 'world'
      : chosenChannel
  const pmPartner = tab.startsWith('pm:') ? tab.slice(3) : null
  const shown = lines.filter((line) => belongsOn(line, tab, selfId))
  const tabTitle = tabs.find((t) => t.id === tab)!.title

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  }, [shown.length])

  const pickTab = (next: ChatTab) => {
    setTab(next)
    if (isSendChannel(next)) setChannel(next)
  }
  const closePm = (name: string) => {
    setClosedPms((closed) => ({ ...closed, [name]: latestPm.get(name) ?? '' }))
    if (tab === `pm:${name}`) setTab('world')
  }

  const startWhisper = (name: string) => {
    setText(`/${name} `)
    inputRef.current?.focus()
  }
  // Whisper buttons in other windows (the Friends list) prefill the input the same way.
  useEffect(() => onWhisperRequest(startWhisper), [])
  // Reborn's "Link in Chat": the item name in brackets at the end of the line.
  useEffect(
    () =>
      onItemLinkRequest((name) => {
        setText((line) => `${line}${line && !line.endsWith(' ') ? ' ' : ''}[${name}]`)
        inputRef.current?.focus()
      }),
    [],
  )

  const onReport = (message: ChatMessage) => {
    const sent = report(
      { channel: message.channel, characterId: message.sender.characterId, text: message.text },
      (ack) => {
        if (!ack.ok) return setSendError(ack.error.message)
        setReported((set) => new Set(set).add(message.id))
        addSystemLine('Your report was sent. Thank you.')
      },
    )
    if (!sent) setSendError(UNAVAILABLE)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    const whisper = WHISPER_SYNTAX.exec(text.trim())
    if (!whisper && text.trim().startsWith('/')) return setSendError(WHISPER_HINT)
    const input: ChatSendInput = whisper
      ? { channel: 'whisper', to: whisper[1]!, text: whisper[2]! }
      : pmPartner
        ? { channel: 'whisper', to: pmPartner, text }
        : { channel, text }
    setSendError(null)
    // Set before emitting: an ack that arrives at once must still clear it.
    setSending(true)
    const sent = send(input, (ack) => {
      setSending(false)
      // After a /Name whisper the input keeps "/Name " for a quick follow-up.
      if (ack.ok) setText(whisper ? `/${whisper[1]} ` : '')
      else setSendError(ack.error.message)
    })
    if (!sent) setSending(false)
  }

  return (
    <section
      aria-label="Chat"
      className="pointer-events-auto absolute bottom-[2px] left-[10px] h-[300px] w-[500px] font-game"
    >
      {showPlayers && <PlayerList players={players} selfId={selfId} />}
      <ChatTabs
        tabs={tabs}
        active={tab}
        onChange={pickTab}
        onClose={closePm}
        panelId={`${ids}-log`}
      />
      <div className="absolute top-[-22px] right-0 flex items-center gap-1">
        {/* On the skin's dark HUD plate: plain text was unreadable over bright scene pictures. */}
        <span
          role="status"
          className="game-hud px-1.5 py-0.5 text-xs font-bold text-trim-soft [text-shadow:var(--shadow-game-text)]"
        >
          {status === 'online' ? 'Online' : status === 'connecting' ? 'Connecting...' : 'Offline'}
        </span>
        <GameButton small aria-expanded={showPlayers} onClick={() => setShowPlayers((v) => !v)}>
          Players ({players.length})
        </GameButton>
      </div>
      <div
        id={`${ids}-log`}
        role="tabpanel"
        className="game-chat-panel absolute top-0 left-0 h-[264px] w-[500px] overflow-auto p-[5px] font-mono text-sm text-[#ddd]"
      >
        <ol ref={logRef} aria-live="polite" aria-label={`${tabTitle} messages`}>
          {shown.map((line) => (
            <ChatLine
              key={line.id}
              line={line}
              selfId={selfId}
              links={links}
              onWhisper={startWhisper}
              onReport={reported.has(line.id) ? undefined : onReport}
            />
          ))}
        </ol>
      </div>
      {(error || sendError) && (
        <div className="absolute inset-x-[5px] bottom-[41px] flex flex-col gap-1">
          {error && <NoticeBox tone="error">{error}</NoticeBox>}
          {sendError && <NoticeBox tone="error">{sendError}</NoticeBox>}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="absolute inset-x-[5px] top-[270px] flex h-[26px] items-center gap-[5px]"
      >
        <ChannelSelect
          id={`${ids}-channel`}
          value={channel}
          inTeam={inTeam}
          inClan={inClan}
          onChange={pickTab}
        />
        <div className="relative">
          <label htmlFor={`${ids}-input`} className="sr-only">
            {pmPartner
              ? `Message to ${pmPartner}`
              : `Message to ${CHANNEL_TITLES[channel].toLowerCase()} chat`}
          </label>
          <input
            ref={inputRef}
            id={`${ids}-input`}
            value={text}
            maxLength={CHAT_MAX_LENGTH + WHISPER_PREFIX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            className="h-[26px] w-[327px] rounded-[3px] border border-white/20 bg-black/40 pr-14 pl-2 text-[13px] text-white"
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] ${
              text.length >= COUNTER_WARN ? 'text-[#ff6b6b]' : 'text-white/50'
            }`}
          >
            {`${text.length}/${CHAT_MAX_LENGTH}`}
          </span>
        </div>
        <GameButton
          small
          type="submit"
          disabled={status !== 'online' || sending}
          className="ml-auto h-[22px] w-[50px] min-w-0 px-0"
        >
          Send
        </GameButton>
      </form>
    </section>
  )
}
