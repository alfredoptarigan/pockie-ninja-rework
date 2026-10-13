// Arena window (UI_ArenaTop, docs/original-data/pvp-rankings.md 2-3, 10): the arena, its fight
// log, Ninjutsu Duels and the Honor shop. A replay replaces the window while it plays.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { useOpenWindow } from '../windows'
import { Dialog, GameButton, Tabs } from '../skin'
import { ArenaReplay, type Playing } from './ArenaReplay'
import { ArenaTab } from './ArenaTab'
import { DuelTab } from './DuelTab'
import { FightLogTab } from './FightLog'
import { HonorShopTab } from './HonorShopTab'

type Tab = 'arena' | 'log' | 'duel' | 'shop'
const TABS: { id: Tab; title: string }[] = [
  { id: 'arena', title: 'Arena' },
  { id: 'log', title: 'Fight Log' },
  { id: 'duel', title: 'Ninjutsu Duel' },
  { id: 'shop', title: 'Honor Shop' },
]

export function ArenaWindow({ character, onClose }: { character: Character; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('arena')
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const panelId = useId()
  const play = (next: Playing) => {
    setMessage(null)
    setPlaying(next)
  }

  if (playing)
    return (
      <ArenaReplay
        playing={playing}
        character={character}
        onDone={() => {
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
        {tab === 'arena' && <ArenaTab play={play} />}
        {tab === 'log' && <FightLogTab play={play} />}
        {tab === 'duel' && <DuelTab play={play} />}
        {tab === 'shop' && <HonorShopTab />}
      </section>
    </Dialog>
  )
}

/** HUD top bar button left of Settings (the original opens the arena from n16002's menu). */
export function ArenaButton() {
  const open = useOpenWindow()
  return (
    <GameButton
      className="absolute top-[4px] right-[78px] h-[22px] w-[66px] !min-w-0 !px-0"
      onClick={() => open('arena')}
    >
      Arena
    </GameButton>
  )
}
