// Reborn's Market Board (chunk 549, reborn-lazy-features.md "Market Board"): a 680x358 window of
// tabs whose bodies are 676x328 BigBG1 panels. Opened from the village Market icon (Hud).
// Ours has Market, Sell Items, Recent and History, plus Storage: bought items, returned listings
// and sale money wait there until claimed (the 2011 warehouse).
// ponytail: no Auction or Buy Orders tabs; each is its own system (bids, escrowed buy orders).
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { Dialog, Notice, Tabs } from '../skin'
import { MARKET_LEVEL } from './api'
import { BoardTab } from './BoardTab'
import { HistoryTab, RecentTab } from './SalesTabs'
import { SellTab } from './SellTab'
import { WarehouseTab } from './Warehouse'

type Tab = 'market' | 'sell' | 'recent' | 'history' | 'storage'
const TABS: { id: Tab; title: string }[] = [
  { id: 'market', title: 'Market' },
  { id: 'sell', title: 'Sell Items' },
  { id: 'recent', title: 'Recent' },
  { id: 'history', title: 'History' },
  { id: 'storage', title: 'Storage' },
]

export function MarketWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('market')
  const panelId = useId()
  if (character.level < MARKET_LEVEL)
    return (
      <Dialog title="Market" onClose={onClose} className="w-[24rem]">
        <Notice>The Market opens at level {MARKET_LEVEL}.</Notice>
      </Dialog>
    )
  return (
    <Dialog title="Market" onClose={onClose} className="game-window-bare w-[690px]">
      <div className="flex h-[358px] w-[680px] flex-col">
        <Tabs label="Market tabs" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
        <section
          role="tabpanel"
          id={panelId}
          aria-label={TABS.find((t) => t.id === tab)!.title}
          data-menu-root
          className="game-panel-1 relative h-[328px] w-[676px] overflow-hidden p-[4px] font-sans text-[12px] text-black"
        >
          {tab === 'market' && <BoardTab character={character} />}
          {tab === 'sell' && <SellTab character={character} />}
          {tab === 'recent' && <RecentTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'storage' && <WarehouseTab character={character} />}
        </section>
      </div>
    </Dialog>
  )
}
