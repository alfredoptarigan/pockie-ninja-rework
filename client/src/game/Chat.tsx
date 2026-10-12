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
import { GameButton, Notice, Panel, Tabs } from './skin'

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

/** Chat box at the bottom left of the stage; the scene's player list opens from its header. */
export function RealtimePanels({ characterId }: { characterId: string }) {
  const realtime = useRealtime()
  return <ChatBox {...realtime} selfId={characterId} />
}

function PlayerList({ players, selfId }: { players: ScenePlayer[]; selfId: string }) {
  return (
    <Panel
      title={`Players here (${players.length})`}
      className="absolute bottom-full left-0 mb-1 max-h-56 w-64"
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

const CHANNELS: { id: ChatChannel; title: string }[] = [
  { id: 'world', title: 'World' },
  { id: 'scene', title: 'Scene' },
]

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
  const [channel, setChannel] = useState<ChatChannel>('world')
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const ids = useId()
  const logRef = useRef<HTMLOListElement>(null)
  const shown = messages.filter((message) => message.channel === channel)

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  }, [shown.length])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    setSendError(null)
    const sent = send({ channel, text }, (ack) => {
      setSending(false)
      if (ack.ok) setText('')
      else setSendError(ack.error.message)
    })
    setSending(sent)
  }

  return (
    <section
      aria-label="Chat"
      className="pointer-events-auto absolute bottom-1 left-1 flex w-[440px] flex-col font-game"
    >
      {showPlayers && <PlayerList players={players} selfId={selfId} />}
      <div className="flex items-end gap-2">
        <Tabs
          label="Chat channel"
          tabs={CHANNELS}
          active={channel}
          onChange={setChannel}
          panelId={`${ids}-log`}
          variant="dark"
        />
        <span className="ml-auto text-xs text-trim-soft [text-shadow:var(--shadow-game-text)]">
          {status === 'online' ? 'Online' : status === 'connecting' ? 'Connecting...' : 'Offline'}
        </span>
        <GameButton
          small
          className="mb-0.5"
          aria-expanded={showPlayers}
          onClick={() => setShowPlayers((v) => !v)}
        >
          Players ({players.length})
        </GameButton>
      </div>
      <div
        id={`${ids}-log`}
        role="tabpanel"
        className="h-[180px] overflow-auto rounded-tr border border-[#45494c] bg-black/55 p-2 text-xs text-white"
      >
        {error && <Notice tone="error">{error}</Notice>}
        <ol ref={logRef} aria-live="polite" aria-label={`${channel} messages`}>
          {shown.map((message) => (
            <li key={message.id} className="break-words">
              <span className="font-bold text-trim">{message.sender.name}:</span>{' '}
              {/* Plain text only: React escapes it; never render chat as HTML. */}
              <span>{message.text}</span>
            </li>
          ))}
        </ol>
      </div>
      {sendError && <Notice tone="error">{sendError}</Notice>}
      <form onSubmit={onSubmit} className="game-hud mt-1 flex gap-1 p-1">
        <label htmlFor={`${ids}-input`} className="sr-only">
          Message to {channel} chat
        </label>
        <input
          id={`${ids}-input`}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          className="game-hud-inset min-h-7 flex-1 px-2 text-sm"
        />
        <GameButton small type="submit" disabled={status !== 'online' || sending}>
          Send
        </GameButton>
      </form>
    </section>
  )
}
