import type { ChatAck, ChatSendInput } from '@pockie/shared'

type Listener = (...args: never[]) => void

/**
 * Minimal stand-in for a Socket.IO client socket: tests trigger server events with `serverEmit`
 * and answer chat sends through `onSend`.
 */
export function createFakeSocket() {
  const listeners = new Map<string, Listener[]>()
  const fake = {
    sent: [] as ChatSendInput[],
    onSend: (_input: ChatSendInput): ChatAck => ({
      ok: false,
      error: { code: 'invalid_payload', message: 'No handler.' },
    }),
    disconnected: false,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return fake
    },
    emit(_event: string, input: ChatSendInput, ack: (result: ChatAck) => void) {
      fake.sent.push(input)
      ack(fake.onSend(input))
      return fake
    },
    disconnect() {
      fake.disconnected = true
      return fake
    },
    serverEmit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? [])
        (listener as (...a: unknown[]) => void)(...args)
    },
  }
  return fake
}

export type FakeSocket = ReturnType<typeof createFakeSocket>
