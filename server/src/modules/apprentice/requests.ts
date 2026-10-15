// Open master / apprentice requests, in memory: one waiting request per sender, none twice
// between the same two ninjas, each dropped after APPRENTICE_CONFIG.requestTtlMs.
// ponytail: process-local like trade's book; a restart drops open requests (nothing changed yet).
// Move to a shared store before running more than one server.
import { randomUUID } from 'node:crypto'
import {
  APPRENTICE_CONFIG,
  type ApprenticeRole,
} from '../../../../game-core/src/social/apprentice.js'
import type {
  ApprenticePlayer,
  ApprenticeRequestView,
} from '../../../../shared/src/schemas/apprentice.js'
import { HttpError } from '../../http.js'

export interface ApprenticeRequest {
  id: string
  from: ApprenticePlayer
  to: ApprenticePlayer
  senderRole: ApprenticeRole
  expiresAt: number
}

const bad = (code: string, message: string, status = 400) => new HttpError(status, code, message)

const view = (request: ApprenticeRequest): ApprenticeRequestView => ({
  ...request,
  expiresAt: new Date(request.expiresAt).toISOString(),
})

export function createRequestBook() {
  const requests = new Map<string, ApprenticeRequest>()

  function open(now: number) {
    for (const [id, request] of requests) if (request.expiresAt <= now) requests.delete(id)
    return [...requests.values()]
  }

  const outgoingOf = (characterId: string, now: number) =>
    open(now).find((request) => request.from.characterId === characterId)

  return {
    outgoingOf,

    request(from: ApprenticePlayer, to: ApprenticePlayer, senderRole: ApprenticeRole, now: number) {
      if (outgoingOf(from.characterId, now))
        throw bad('request_pending', 'You already have a request waiting.', 409)
      const ids = [from.characterId, to.characterId]
      const between = open(now).some(
        (r) => ids.includes(r.from.characterId) && ids.includes(r.to.characterId),
      )
      if (between) throw bad('request_pending', 'A request between you is already waiting.', 409)
      const request = {
        id: randomUUID(),
        from,
        to,
        senderRole,
        expiresAt: now + APPRENTICE_CONFIG.requestTtlMs,
      }
      requests.set(request.id, request)
      return request
    },

    /** A request addressed to `characterId` that is still open. */
    incoming(requestId: string, characterId: string, now: number) {
      const request = open(now).find((r) => r.id === requestId)
      if (!request || request.to.characterId !== characterId)
        throw bad('request_gone', 'The request is no longer available.', 404)
      return request
    },

    remove: (requestId: string) => void requests.delete(requestId),

    state(characterId: string, now: number) {
      const outgoing = outgoingOf(characterId, now)
      return {
        incoming: open(now)
          .filter((request) => request.to.characterId === characterId)
          .map(view),
        outgoing: outgoing ? view(outgoing) : null,
      }
    },
  }
}
