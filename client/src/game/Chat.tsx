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
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createGameSocket, type GameSocket } from '../lib/socket'
import { gameKeys } from './api'
import { GameButton, Notice as NoticeBox, Panel } from './skin'

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
 * `inTeam` shows the Team tab and channel.
 */
export function RealtimePanels({
  characterId,
  inTeam = false,
}: {
  characterId: string
  inTeam?: boolean
}) {
  const realtime = useRealtime()
  return <ChatBox {...realtime} selfId={characterId} inTeam={inTeam} />
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

/** Channels the select sends to; whispers go by `/Name message`. */
type SendChannel = Exclude<ChatChannel, 'whisper'>
type ChatTab = 'all' | ChatChannel

const CHANNEL_TITLES: Record<ChatChannel | 'system', string> = {
  world: 'World',
  scene: 'Scene',
  team: 'Team',
  whisper: 'Whisper',
  system: 'System',
}
/** "All" merges every channel; World, Scene and Team also pick the channel the input sends to. */
const tabsFor = (inTeam: boolean): { id: ChatTab; title: string }[] => [
  { id: 'all', title: 'All' },
  { id: 'world', title: 'World' },
  { id: 'scene', title: 'Scene' },
  ...(inTeam ? [{ id: 'team' as const, title: 'Team' }] : []),
  { id: 'whisper', title: 'Whisper' },
]

/** `/Name message`, like the original chat box. */
const WHISPER_SYNTAX = /^\/(\S+)\s+(\S[\s\S]*)$/
const WHISPER_HINT = 'To whisper, type /Name and your message.'
/** Room for "/Name " (a 12-character name) on top of the message itself. */
const WHISPER_PREFIX_LENGTH = 14

const formatTime = (sentAt: string) =>
  new Date(sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Channel tabs on the original chat plates, with arrow-key navigation like the skin's Tabs. */
function ChatTabs({
  tabs,
  active,
  onChange,
  panelId,
}: {
  tabs: { id: ChatTab; title: string }[]
  active: ChatTab
  onChange: (tab: ChatTab) => void
  panelId: string
}) {
  return (
    <div role="tablist" aria-label="Chat channel" className="absolute top-[-20px] left-[4px] flex">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
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
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
          }}
          className="game-chat-tab h-[23px] w-[60px] font-game text-base leading-none"
        >
          {tab.title}
        </button>
      ))}
    </div>
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
  onWhisper,
  onReport,
}: {
  line: Line
  selfId: string
  onWhisper: (name: string) => void
  onReport?: (message: ChatMessage) => void
}) {
  const fromSelf = line.channel !== 'system' && line.sender.characterId === selfId
  return (
    <li className="group py-[2.5px] leading-[18px] break-words whitespace-pre-wrap">
      <time dateTime={line.sentAt} className="text-[11px] text-[#ddd]/40">
        {formatTime(line.sentAt)}
      </time>{' '}
      <span className="text-[13px] font-medium text-white/85">
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
      {/* Plain text only: React escapes it; never render chat as HTML. */}
      <span>{line.text}</span>{' '}
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
  onChange,
}: {
  id: string
  value: SendChannel
  inTeam: boolean
  onChange: (channel: SendChannel) => void
}) {
  const channels: SendChannel[] = inTeam ? ['world', 'scene', 'team'] : ['world', 'scene']
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
  const ids = useId()
  const logRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Leaving the team falls back to World.
  const tab = chosenTab === 'team' && !inTeam ? 'world' : chosenTab
  const channel = chosenChannel === 'team' && !inTeam ? 'world' : chosenChannel
  const tabs = tabsFor(inTeam)
  const shown = lines.filter((l) => tab === 'all' || l.channel === tab || l.channel === 'system')
  const tabTitle = tabs.find((t) => t.id === tab)!.title

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  }, [shown.length])

  const onTab = (next: ChatTab) => {
    setTab(next)
    if (next !== 'all' && next !== 'whisper') setChannel(next)
  }

  const startWhisper = (name: string) => {
    setText(`/${name} `)
    inputRef.current?.focus()
  }

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
    if (!whisper && (tab === 'whisper' || text.trim().startsWith('/'))) {
      return setSendError(WHISPER_HINT)
    }
    const input: ChatSendInput = whisper
      ? { channel: 'whisper', to: whisper[1]!, text: whisper[2]! }
      : { channel, text }
    setSendError(null)
    // Set before emitting: an ack that arrives at once must still clear it.
    setSending(true)
    const sent = send(input, (ack) => {
      setSending(false)
      // After a whisper the input keeps "/Name " for a quick follow-up.
      if (ack.ok) setText(input.channel === 'whisper' ? `/${input.to} ` : '')
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
      <ChatTabs tabs={tabs} active={tab} onChange={onTab} panelId={`${ids}-log`} />
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
          onChange={setChannel}
        />
        <div className="relative">
          <label htmlFor={`${ids}-input`} className="sr-only">
            {tab === 'whisper' ? 'Whisper (/Name message)' : `Message to ${channel} chat`}
          </label>
          <input
            ref={inputRef}
            id={`${ids}-input`}
            value={text}
            maxLength={CHAT_MAX_LENGTH + WHISPER_PREFIX_LENGTH}
            placeholder={tab === 'whisper' ? '/Name message' : undefined}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            className="h-[26px] w-[327px] rounded-[3px] border border-white/20 bg-black/40 pr-14 pl-2 text-[13px] text-white"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-white/50"
          >
            {text.length}/{CHAT_MAX_LENGTH}
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
