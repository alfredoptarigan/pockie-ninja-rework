import type { Character } from '@pockie/shared'
import { ChainAttackProgress, ChainAttackTimer } from './ChainAttack'
import { HuntWindow } from './HuntWindow'

export { AdventureWindow } from './AdventureWindow'
export { ChainAttackDialog } from './ChainAttack'
export { showChainProgress, useBeginHunt, useChainAttack, useCompleteHunt } from './api'

/** The HUD pieces that live outside any window: the Hunt window and the chain attack timer. */
export function HuntHud({ character }: { character: Character }) {
  return (
    // The HUD layer ignores the pointer; its windows (and their dialogs) take it back.
    <div className="pointer-events-auto contents">
      <HuntWindow character={character} />
      <ChainAttackTimer />
      <ChainAttackProgress character={character} />
    </div>
  )
}
