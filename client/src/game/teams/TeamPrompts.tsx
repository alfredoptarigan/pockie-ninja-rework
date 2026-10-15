// Reborn's Party Invite popup (reborn-windows-M-Z-hud.md "Party Invite": 250x100, the message,
// Accept and Deny). Ours also carries applications ("Party Request") and the 60 s expiry: one
// popup for the oldest open prompt with its countdown; expired prompts drop out on their own.
// Deny (and Close) refuse on the server, so the sender learns of it.
import { TEAM_PROMPT_TTL_MS, type TeamPromptView } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { teamKeys, useTeamAction } from './api'

/** Seconds left never show above the TTL, whatever the clock skew to the server. */
const TTL_S = TEAM_PROMPT_TTL_MS / 1000

/** The clock, ticking every second while `active`. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

const message = (prompt: TeamPromptView) =>
  prompt.kind === 'invite'
    ? `${prompt.from.name} (Level ${prompt.from.level}) invites you to join their party.`
    : `${prompt.from.name} (Level ${prompt.from.level}) asks to join your party.`

/** The popup for the oldest open prompt addressed to me; nothing when there is none. */
export function PartyInvite({ prompts }: { prompts: TeamPromptView[] }) {
  const now = useNow(prompts.length > 0)
  const action = useTeamAction()
  const queryClient = useQueryClient()
  const prompt = prompts.find((open) => Date.parse(open.expiresAt) > now)
  const allExpired = prompts.length > 0 && !prompt
  // The last prompt ran out: refetch, so the cached state drops it.
  useEffect(() => {
    if (allExpired) void queryClient.invalidateQueries({ queryKey: teamKeys.state, exact: true })
  }, [allExpired, queryClient])
  if (!prompt) return null
  const answer = (verb: 'accept' | 'refuse') => {
    if (!action.isPending) action.mutate({ path: `prompts/${prompt.id}/${verb}` })
  }
  return (
    <Dialog
      key={prompt.id}
      title={prompt.kind === 'invite' ? 'Party Invite' : 'Party Request'}
      onClose={() => answer('refuse')}
      className="w-[250px]"
    >
      <div className="flex flex-col gap-2 text-[12px] text-black">
        <p className="min-h-[40px]">
          {message(prompt)}{' '}
          <span className="text-[#5a4a3a]">
            ({Math.min(TTL_S, Math.ceil((Date.parse(prompt.expiresAt) - now) / 1000))} s)
          </span>
        </p>
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        <div className="flex justify-between px-[5px]">
          <GameButton
            className="w-[75px]"
            disabled={action.isPending}
            onClick={() => answer('accept')}
          >
            Accept
          </GameButton>
          <GameButton
            className="w-[75px]"
            disabled={action.isPending}
            onClick={() => answer('refuse')}
          >
            Deny
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
