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
import { ForgeWindow, PortableFunctionWindow } from './forge'
import { LasNochesWindow, PubFightWindow, TollGateWindow } from './gates'
import { DailyQuestWindow } from './daily'
import { DiceOfFateWindow, NinjaDiaryWindow } from './events'
import { MarketWindow } from './market'
import { RankingsWindow } from './rankings'
import { MerchantWindow, ShopWindow } from './shop'
import { SocialWindow } from './social'
import { TailedBeastWindow } from './tailed-beast'
import { TalentsWindow } from './talents'
import { BloodlinesWindow } from './bloodlines'
import { NinjaHouseWindow } from './bloodlines/ninja-house'
import { TeamStoneWindow } from './team-stone'
import { TeamBoardWindow, TeamWindow } from './teams'
import { CollectionWindow, WingEnhanceWindow } from './wings'
import { BankaiWindow } from './bankai'
import { CardRoomWindow } from './cards'
import { KennelWindow } from './pets'
import { KennelShopWindow, PetTracingWindow } from './kennel'
import { CarrierBagWindow } from './CarrierBag'
import { ClanBrowserWindow, ClanWindow } from './clans'
import { DungeonsWindow } from './dungeons'
import { ZanpakutoWindow } from './zanpakuto'
import { ImpelDownWindow } from './impel-down'
import { TsunadePubWindow } from './tsunade-pub'
import { MallWindow } from './mall'
import { KonohaBoutiqueWindow } from './konoha-boutique'

export type WindowName =
  | 'shop'
  | 'merchant'
  | 'forge'
  | 'compose'
  | 'gates'
  | 'pubFight'
  | 'daily'
  | 'team'
  | 'teamBoard'
  | 'arena'
  | 'friends'
  | 'mail'
  | 'rankings'
  | 'market'
  | 'talents'
  | 'bloodlines'
  | 'ninjaHouse'
  | 'ninjaDiary'
  | 'diceOfFate'
  | 'tailedBeast'
  | 'teamStone'
  | 'wingEnhance'
  | 'collection'
  | 'bankai'
  | 'cardRoom'
  | 'pets'
  | 'petTracing'
  | 'kennelShop'
  | 'carrierBag'
  | 'clan'
  | 'clanBrowser'
  | 'dungeons'
  | 'zanpakuto'
  | 'impelDown'
  | 'tsunadePub'
  | 'mall'
  | 'konohaBoutique'

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
  forge: ({ onClose }) => <ForgeWindow onClose={onClose} />,
  compose: ({ onClose }) => <PortableFunctionWindow onClose={onClose} />,
  gates: GateWindow,
  pubFight: ({ character, onClose }) => <PubFightWindow character={character} onClose={onClose} />,
  daily: ({ onClose }) => <DailyQuestWindow onClose={onClose} />,
  team: (props) => <TeamWindow {...props} />,
  teamBoard: (props) => <TeamBoardWindow {...props} />,
  arena: ({ character, onClose }) => <ArenaWindow character={character} onClose={onClose} />,
  friends: ({ character, onClose }) => <SocialWindow character={character} onClose={onClose} />,
  mail: ({ character, onClose }) => (
    <SocialWindow character={character} tab="mail" onClose={onClose} />
  ),
  rankings: ({ onClose }) => <RankingsWindow onClose={onClose} />,
  market: ({ character, onClose }) => <MarketWindow character={character} onClose={onClose} />,
  talents: ({ character, onClose }) => <TalentsWindow character={character} onClose={onClose} />,
  bloodlines: ({ character, onClose }) => (
    <BloodlinesWindow character={character} onClose={onClose} />
  ),
  ninjaHouse: ({ character, onClose }) => (
    <NinjaHouseWindow character={character} onClose={onClose} />
  ),
  ninjaDiary: ({ onClose }) => <NinjaDiaryWindow onClose={onClose} />,
  diceOfFate: ({ onClose }) => <DiceOfFateWindow onClose={onClose} />,
  tailedBeast: ({ character, onClose }) => (
    <TailedBeastWindow character={character} onClose={onClose} />
  ),
  teamStone: ({ character, onClose }) => (
    <TeamStoneWindow character={character} onClose={onClose} />
  ),
  wingEnhance: ({ onClose }) => <WingEnhanceWindow onClose={onClose} />,
  collection: ({ onClose }) => <CollectionWindow onClose={onClose} />,
  bankai: ({ onClose }) => <BankaiWindow onClose={onClose} />,
  cardRoom: ({ onClose }) => <CardRoomWindow onClose={onClose} />,
  pets: ({ onClose }) => <KennelWindow onClose={onClose} />,
  petTracing: ({ onClose }) => <PetTracingWindow onClose={onClose} />,
  kennelShop: ({ onClose }) => <KennelShopWindow onClose={onClose} />,
  carrierBag: ({ character, onClose }) => (
    <CarrierBagWindow character={character} onClose={onClose} />
  ),
  clan: (props) => <ClanWindow {...props} />,
  clanBrowser: (props) => <ClanBrowserWindow {...props} />,
  dungeons: ({ character, onClose }) => <DungeonsWindow character={character} onClose={onClose} />,
  zanpakuto: ({ onClose }) => <ZanpakutoWindow onClose={onClose} />,
  impelDown: ({ character, onClose }) => (
    <ImpelDownWindow character={character} onClose={onClose} />
  ),
  tsunadePub: ({ onClose }) => <TsunadePubWindow onClose={onClose} />,
  mall: ({ character, onClose }) => <MallWindow character={character} onClose={onClose} />,
  konohaBoutique: ({ character, onClose }) => (
    <KonohaBoutiqueWindow character={character} onClose={onClose} />
  ),
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
