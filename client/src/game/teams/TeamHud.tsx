// Party HUD (Reborn's `hi`/`fi`, reborn-windows-M-Z-hud.md "Team / party portraits"): the Party
// button under the player card (our Party window: invite by name, the fight order), the party
// portraits at the left middle of the HUD and the Party Invite popup. Only where teams exist
// (neutral fields, Valhalla, Demon City and the toll gate instance).
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { ViewCharacter } from '../social/ViewCharacter'
import { GameButton } from '../skin'
import { useOpenWindow } from '../windows'
import { teamHudScene, useTeam } from './api'
import { PartyPortraits } from './PartyPortraits'
import { PartyInvite } from './TeamPrompts'

export function TeamHud({ character }: { character: Character }) {
  const shown = teamHudScene(character.sceneId)
  const team = useTeam(shown)
  const open = useOpenWindow()
  const [viewing, setViewing] = useState<string | null>(null)
  if (!shown) return null
  const view = team.data?.team
  return (
    <div className="pointer-events-auto font-game text-[11px]">
      <GameButton small onClick={() => open('team')}>
        Party
      </GameButton>
      {view && <PartyPortraits view={view} selfId={character.id} onView={setViewing} />}
      {team.data && <PartyInvite prompts={team.data.prompts} />}
      {viewing && (
        <ViewCharacter
          characterId={viewing}
          selfId={character.id}
          onClose={() => setViewing(null)}
          onWhisper={() => setViewing(null)}
        />
      )}
    </div>
  )
}
