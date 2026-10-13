// HUD piece under the player card (the original party frame UI_TeamRoleIcon, teams.md 6): the
// Team button, my teammates in fight order, and incoming invitations and applications. Only where
// teams exist (neutral fields, Valhalla, the toll gate instance).
import type { Character } from '@pockie/shared'
import { Panel, GameButton } from '../skin'
import { useOpenWindow } from '../windows'
import { teamHudScene, useTeam } from './api'
import { TeamPromptList } from './TeamPrompts'

export function TeamHud({ character }: { character: Character }) {
  const shown = teamHudScene(character.sceneId)
  const team = useTeam(shown)
  const open = useOpenWindow()
  if (!shown) return null
  const members = team.data?.team?.members ?? []
  return (
    <div className="pointer-events-auto absolute top-[86px] left-0 flex w-[220px] flex-col items-start gap-1 font-game text-[11px]">
      <GameButton small onClick={() => open('team')}>
        Team
      </GameButton>
      {members.length > 0 && (
        <ol aria-label="Teammates" className="game-hud flex w-full flex-col gap-px p-1 text-white">
          {members.map((member) => (
            <li key={member.characterId} className="flex justify-between gap-1 truncate">
              <span className={member.online ? '' : 'opacity-60'}>
                {member.name}
                {member.captain && <span className="ml-1 font-bold text-[#ffd700]">Captain</span>}
              </span>
              <span>Lv. {member.level}</span>
            </li>
          ))}
        </ol>
      )}
      {team.data && team.data.prompts.length > 0 && (
        <Panel title="Team request" className="w-[360px]">
          <TeamPromptList prompts={team.data.prompts} />
        </Panel>
      )}
    </div>
  )
}
