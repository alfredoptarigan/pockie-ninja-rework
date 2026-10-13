// Incoming team invitations and applications (message boxes 3 and 4 of the original) with the
// 60 s expiry: Accept / Refuse, and a countdown; expired prompts drop out on their own.
import type { TeamPromptView } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { teamKeys, useTeamAction } from './api'

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

const question = (prompt: TeamPromptView) =>
  prompt.kind === 'invite'
    ? `${prompt.from.name} (Level ${prompt.from.level}) invites you to join a team.`
    : `${prompt.from.name} (Level ${prompt.from.level}) asks to join your team.`

/** Open prompts addressed to me; renders nothing when there are none. */
export function TeamPromptList({ prompts }: { prompts: TeamPromptView[] }) {
  const now = useNow(prompts.length > 0)
  const action = useTeamAction()
  const queryClient = useQueryClient()
  const open = prompts.filter((prompt) => Date.parse(prompt.expiresAt) > now)
  const allExpired = prompts.length > 0 && open.length === 0
  // The last prompt ran out: refetch, so the cached state (and the HUD box) drops it.
  useEffect(() => {
    if (allExpired) void queryClient.invalidateQueries({ queryKey: teamKeys.state, exact: true })
  }, [allExpired, queryClient])
  if (open.length === 0 && !action.isError) return null
  return (
    <section aria-label="Team requests" className="flex flex-col gap-1 text-[12px] text-black">
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      {open.map((prompt) => (
        <div key={prompt.id} className="game-card flex items-center gap-2 p-1">
          <span className="flex-1">
            {question(prompt)}{' '}
            <span className="text-[#5a4a3a]">
              ({Math.ceil((Date.parse(prompt.expiresAt) - now) / 1000)} s)
            </span>
          </span>
          <GameButton
            small
            disabled={action.isPending}
            onClick={() => action.mutate({ path: `prompts/${prompt.id}/accept` })}
          >
            Accept
          </GameButton>
          <GameButton
            small
            disabled={action.isPending}
            onClick={() => action.mutate({ path: `prompts/${prompt.id}/refuse` })}
          >
            Refuse
          </GameButton>
        </div>
      ))}
    </section>
  )
}
