import {
  CHAT_MAX_LENGTH,
  REALTIME_EVENTS,
  type ChatAck,
  type ChatChannel,
  type ChatSendInput,
  type ChatMessage,
  type RealtimeConnectErrorCode,
  type ScenePlayer,
} from '@pockie/shared'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createGameSocket, type GameSocket } from '../lib/socket'
import { gameKeys } from './api'
import { GameButton, Notice, Panel } from './skin'

const MAX_MESSAGES = 100

type Status = 'connecting' | 'online' | 'offline'
/** Emits a chat message; false when there is no socket. */
type SendChat = (input: ChatSendInput, ack: (result: ChatAck) => void) => boolean

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

/** One socket per game screen: scene players, chat messages and connection state. */
function useRealtime() {
  const queryClient = useQueryClient()
  const socket = useRef<GameSocket | null>(null)
  const [players, setPlayers] = useState<ScenePlayer[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)

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
    next.on(REALTIME_EVENTS.chatMessage, (message) =>
      setMessages((list) => [...list, message].slice(-MAX_MESSAGES)),
    )
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
  return { send, players, messages, status, error }
}

/** Chat box at the bottom left of the stage; the scene's player list opens from its tab row. */
export function RealtimePanels({ characterId }: { characterId: string }) {
  const realtime = useRealtime()
  return <ChatBox {...realtime} selfId={characterId} />
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

type ChatTab = 'all' | ChatChannel

const CHANNEL_TITLES: Record<ChatChannel, string> = { world: 'World', scene: 'Scene' }
/** "All" merges both channels; World and Scene also pick the channel the input sends to. */
const TABS: { id: ChatTab; title: string }[] = [
  { id: 'all', title: 'All' },
  { id: 'world', title: 'World' },
  { id: 'scene', title: 'Scene' },
]

const formatTime = (sentAt: string) =>
  new Date(sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Channel tabs on the original chat plates, with arrow-key navigation like the skin's Tabs. */
function ChatTabs({
  active,
  onChange,
  panelId,
}: {
  active: ChatTab
  onChange: (tab: ChatTab) => void
  panelId: string
}) {
  return (
    <div role="tablist" aria-label="Chat channel" className="absolute top-[-20px] left-[4px] flex">
      {TABS.map((tab, index) => (
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
            const next = (index + step + TABS.length) % TABS.length
            onChange(TABS[next]!.id)
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

/** One line like the original: time, [Channel], name, colon and the text. */
function ChatLine({ message }: { message: ChatMessage }) {
  return (
    <li className="py-[2.5px] leading-[18px] break-words whitespace-pre-wrap">
      <time dateTime={message.sentAt} className="text-[11px] text-[#ddd]/40">
        {formatTime(message.sentAt)}
      </time>{' '}
      <span className="text-[13px] font-medium text-white/85">
        [{CHANNEL_TITLES[message.channel]}]
      </span>{' '}
      <span className="font-semibold text-[#ffd700]">{message.sender.name}</span>
      <span className="text-[#ddd]/45">:</span>{' '}
      {/* Plain text only: React escapes it; never render chat as HTML. */}
      <span>{message.text}</span>
    </li>
  )
}

/** Small gold select for the channel the input sends to, like the original "World" button. */
function ChannelSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ChatChannel
  onChange: (channel: ChatChannel) => void
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Send to
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as ChatChannel)}
        className="game-button h-[22px] w-[70px] appearance-none pr-4 pl-2 font-game text-xs"
      >
        {Object.entries(CHANNEL_TITLES).map(([channel, title]) => (
          <option key={channel} value={channel}>
            {title}
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
  messages,
  players,
  selfId,
  status,
  error,
}: {
  send: SendChat
  messages: ChatMessage[]
  players: ScenePlayer[]
  selfId: string
  status: Status
  error: string | null
}) {
  const [showPlayers, setShowPlayers] = useState(false)
  const [tab, setTab] = useState<ChatTab>('world')
  const [channel, setChannel] = useState<ChatChannel>('world')
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const ids = useId()
  const logRef = useRef<HTMLOListElement>(null)
  const shown = tab === 'all' ? messages : messages.filter((message) => message.channel === tab)
  const tabTitle = TABS.find((t) => t.id === tab)!.title

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  }, [shown.length])

  const onTab = (next: ChatTab) => {
    setTab(next)
    if (next !== 'all') setChannel(next)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    setSendError(null)
    // Set before emitting: an ack that arrives at once must still clear it.
    setSending(true)
    const sent = send({ channel, text }, (ack) => {
      setSending(false)
      if (ack.ok) setText('')
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
      <ChatTabs active={tab} onChange={onTab} panelId={`${ids}-log`} />
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
          {shown.map((message) => (
            <ChatLine key={message.id} message={message} />
          ))}
        </ol>
      </div>
      {(error || sendError) && (
        <div className="absolute inset-x-[5px] bottom-[41px] flex flex-col gap-1">
          {error && <Notice tone="error">{error}</Notice>}
          {sendError && <Notice tone="error">{sendError}</Notice>}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="absolute inset-x-[5px] top-[270px] flex h-[26px] items-center gap-[5px]"
      >
        <ChannelSelect id={`${ids}-channel`} value={channel} onChange={setChannel} />
        <div className="relative">
          <label htmlFor={`${ids}-input`} className="sr-only">
            Message to {channel} chat
          </label>
          <input
            id={`${ids}-input`}
            value={text}
            maxLength={CHAT_MAX_LENGTH}
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
