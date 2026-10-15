// Arena window (UI_ArenaTop, docs/original-data/pvp-rankings.md 2-3, 10): the arena, its fight
// log, Ninjutsu Duels, the Honor shop, Reborn's Squad Arena 3v3 and Championship. A replay
// replaces the window while it plays.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { useOpenWindow } from '../windows'
import { Dialog, GameButton, Tabs } from '../skin'
import { ArenaReplay, type Playing } from './ArenaReplay'
import { ArenaTab } from './ArenaTab'
import { ChampionshipTab } from './ChampionshipTab'
import { DuelTab } from './DuelTab'
import { FightLogTab } from './FightLog'
import { HonorShopTab } from './HonorShopTab'
import { SquadTab } from './SquadTab'

type Tab = 'arena' | 'log' | 'duel' | 'shop' | 'squad' | 'championship'
const TABS: { id: Tab; title: string }[] = [
  { id: 'arena', title: 'Arena' },
  { id: 'log', title: 'Fight Log' },
  { id: 'duel', title: 'Ninjutsu Duel' },
  { id: 'shop', title: 'Honor Shop' },
  { id: 'squad', title: 'Squad Arena' },
  { id: 'championship', title: 'Championship' },
]

export function ArenaWindow({ character, onClose }: { character: Character; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('arena')
  const [playing, setPlaying] = useState<Playing | null>(null)
  // Remounts the replay for each one of a chain (Squad Arena rounds).
  const [played, setPlayed] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const panelId = useId()
  const play = (next: Playing) => {
    setMessage(null)
    setPlaying(next)
  }

  if (playing)
    return (
      <ArenaReplay
        key={played}
        playing={playing}
        character={character}
        onDone={() => {
          setPlayed(played + 1)
          if (playing.next) return setPlaying(playing.next)
          setMessage(playing.message ?? null)
          setPlaying(null)
        }}
      />
    )
  return (
    <Dialog title="Arena" onClose={onClose} className="w-[56rem]">
      <Tabs label="Arena tabs" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
      <section
        role="tabpanel"
        id={panelId}
        aria-label={TABS.find((t) => t.id === tab)!.title}
        className="game-inset mt-1 flex flex-col gap-2 p-2"
      >
        {message && <p role="status">{message}</p>}
        {tab === 'arena' && <ArenaTab character={character} play={play} />}
        {tab === 'log' && <FightLogTab play={play} />}
        {tab === 'duel' && <DuelTab play={play} />}
        {tab === 'shop' && <HonorShopTab />}
        {tab === 'squad' && <SquadTab character={character} play={play} />}
        {tab === 'championship' && <ChampionshipTab character={character} play={play} />}
      </section>
    </Dialog>
  )
}

/** HUD top bar button after Settings (the original opens the arena from n16002's menu). */
export function ArenaButton() {
  const open = useOpenWindow()
  return (
    <GameButton className="h-[22px] w-[66px] !min-w-0 !px-0" onClick={() => open('arena')}>
      Arena
    </GameButton>
  )
}
