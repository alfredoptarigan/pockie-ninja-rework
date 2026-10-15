// Market window (UI_Marcket): Browse, Sell, My Listings and Warehouse. Opened from the HUD.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { Dialog, Notice, Tabs } from '../skin'
import { MARKET_LEVEL } from './api'
import { BrowseTab } from './BrowseTab'
import { SellTab } from './SellTab'
import { MineTab } from './StorageTabs'
import { WarehouseTab } from './Warehouse'

type Tab = 'browse' | 'sell' | 'mine' | 'warehouse'
const TABS: { id: Tab; title: string }[] = [
  { id: 'browse', title: 'Browse' },
  { id: 'sell', title: 'Sell' },
  { id: 'mine', title: 'My Listings' },
  { id: 'warehouse', title: 'Warehouse' },
]

export function MarketWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('browse')
  const panelId = useId()
  if (character.level < MARKET_LEVEL)
    return (
      <Dialog title="Market" onClose={onClose} className="w-[24rem]">
        <Notice>The Market opens at level {MARKET_LEVEL}.</Notice>
      </Dialog>
    )
  return (
    <Dialog title="Market" onClose={onClose} className="w-[52rem]">
      <Tabs label="Market tabs" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
      <section
        role="tabpanel"
        id={panelId}
        aria-label={TABS.find((t) => t.id === tab)!.title}
        className="game-inset mt-1 p-2"
      >
        {tab === 'browse' && <BrowseTab character={character} />}
        {tab === 'sell' && <SellTab />}
        {tab === 'mine' && <MineTab />}
        {tab === 'warehouse' && <WarehouseTab character={character} />}
      </section>
    </Dialog>
  )
}
