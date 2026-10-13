// Windows other features open from the HUD or an NPC menu (shop, forge, toll gates, daily quests).
// Each feature owns its window component in its own folder (client/src/game/<feature>/) and plugs
// it in with ONE line in WINDOWS below; GameApp renders whichever window is open.
//
// Contract for a window component:
//   - props: WindowProps (the character, the NPC whose menu opened it if any, and onClose);
//   - it renders its own dialog (skin.tsx Dialog) and calls onClose when closed;
//   - it fetches its own data and applies game action results with useApplyResult (api.ts).
// To open one from anywhere under GameApp: `const open = useOpenWindow(); open('shop', { npcId })`.
import type { Character } from '@pockie/shared'
import { createContext, useContext, type ComponentType } from 'react'
import { ArenaWindow } from './arena'
import { ForgeWindow } from './forge'
import { LasNochesWindow, PubFightWindow, TollGateWindow } from './gates'
import { DailyQuestWindow } from './daily'
import { MerchantWindow, ShopWindow } from './shop'
import { TeamBoardWindow, TeamWindow } from './teams'

export type WindowName =
  'shop' | 'merchant' | 'forge' | 'gates' | 'pubFight' | 'daily' | 'team' | 'teamBoard' | 'arena'

export interface WindowProps {
  character: Character
  /** The NPC whose menu opened the window (which shop, which guard); absent from the HUD. */
  npcId?: string
  onClose: () => void
}

export interface OpenWindow {
  name: WindowName
  npcId?: string
}

/** Kisuke Urahara (n17003, SingleGateEntryNpc.js) runs Las Noches; the Guard (n17001) the toll gates. */
const LAS_NOCHES_NPC = 'n17003'

function GateWindow({ character, npcId, onClose }: WindowProps) {
  const Window = npcId === LAS_NOCHES_NPC ? LasNochesWindow : TollGateWindow
  return <Window character={character} onClose={onClose} />
}

/** One line per feature: the window component each feature opens. */
const WINDOWS: Record<WindowName, ComponentType<WindowProps>> = {
  shop: ({ character, onClose }) => <ShopWindow character={character} onClose={onClose} />,
  merchant: ({ character, onClose }) => <MerchantWindow character={character} onClose={onClose} />,
  forge: ({ onClose }) => <ForgeWindow view="enhance" onClose={onClose} />,
  gates: GateWindow,
  pubFight: ({ character, onClose }) => <PubFightWindow character={character} onClose={onClose} />,
  daily: ({ onClose }) => <DailyQuestWindow onClose={onClose} />,
  team: (props) => <TeamWindow {...props} />,
  teamBoard: (props) => <TeamBoardWindow {...props} />,
  arena: ({ character, onClose }) => <ArenaWindow character={character} onClose={onClose} />,
}

const OpenWindowContext = createContext<(name: WindowName, options?: { npcId?: string }) => void>(
  () => {},
)
export const OpenWindowProvider = OpenWindowContext.Provider

/** Opens a registered window (closing NPC dialogs and other windows first). */
export const useOpenWindow = () => useContext(OpenWindowContext)

/** The open feature window, if any. */
export function FeatureWindow({
  open,
  character,
  onClose,
}: {
  open: OpenWindow
  character: Character
  onClose: () => void
}) {
  const Window = WINDOWS[open.name]
  return <Window character={character} npcId={open.npcId} onClose={onClose} />
}
