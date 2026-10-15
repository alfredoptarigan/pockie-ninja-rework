// The Konoha Boutique's side windows: Exchange Rewards ("Buy Items", 480x480, eight 105x190
// cards a page, hover for the item tooltip, confirm before buying) and Buy Boutique Coins (Gold /
// Stones / Gift Cert tabs of [cost, coins] tiers). Prices come from the server's view.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import {
  BOUTIQUE_CURRENCIES,
  type BoutiqueActionResult,
  type BoutiqueCurrency,
  type BoutiqueReward,
  type BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique'
import { ItemPicture } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { ItemTooltip } from '../ItemTooltip'
import { asInventoryItem } from '../market/parts'
import { Prompt } from '../Prompt'
import { CardGrid } from '../shop/parts'
import { Dialog, GameButton, Tabs } from '../skin'
import { showToast } from '../toast'
import { useBoutiqueAction } from './api'

const coins = (value: number) => value.toLocaleString('en-US')
const asItem = (reward: BoutiqueReward) =>
  asInventoryItem({ itemId: reward.itemId, count: reward.amount, bound: true, info: reward.info })
export const rewardName = (reward: BoutiqueReward) => itemName(asItem(reward))

type Tip = { reward: BoutiqueReward; at: { x: number; y: number } } | null

function RewardCard({
  reward,
  affordable,
  onBuy,
  onTip,
}: {
  reward: BoutiqueReward
  affordable: boolean
  onBuy: () => void
  onTip: (tip: Tip) => void
}) {
  const name = rewardName(reward)
  return (
    <li
      className="game-text-box flex h-[190px] w-[105px] flex-col items-center gap-[4px] px-[4px] py-[6px] text-center text-[11px] leading-[13px]"
      onMouseEnter={(event) =>
        onTip({ reward, at: { x: event.clientX + 12, y: event.clientY + 12 } })
      }
      onMouseLeave={() => onTip(null)}
    >
      <span className="line-clamp-2 h-[26px] font-bold">{name}</span>
      <span className="game-slot relative grid size-[64px] place-items-center">
        <ItemPicture item={asItem(reward)} />
        {reward.amount > 1 && (
          <span className="absolute right-[2px] bottom-0 text-[10px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
            x{reward.amount}
          </span>
        )}
      </span>
      <span className="flex flex-1 items-center">{coins(reward.price)} Coins</span>
      <GameButton
        small
        aria-label={`Purchase ${name}`}
        disabled={!affordable}
        onClick={onBuy}
        className="h-[22px] w-[70px] min-w-0 shrink-0 px-0"
      >
        Purchase
      </GameButton>
    </li>
  )
}

export function ExchangeRewards({ view, onClose }: { view: BoutiqueView; onClose: () => void }) {
  const [confirm, setConfirm] = useState<BoutiqueReward | null>(null)
  const [tip, setTip] = useState<Tip>(null)
  const exchange = useBoutiqueAction<BoutiqueActionResult>('exchange', () =>
    showToast('Purchase successful.', 'success'),
  )
  return (
    <Dialog title="Exchange Rewards" onClose={onClose} className="w-[490px]">
      <div className="relative flex flex-col gap-[6px]" style={{ minHeight: 440 }}>
        <span
          aria-label="Boutique Coins"
          className="game-text-box self-end px-[6px] text-center text-[11px] leading-[28px]"
          style={{ width: 140, height: 30 }}
        >
          Boutique Coins: {coins(view.coins)}
        </span>
        <CardGrid
          label="Rewards"
          items={view.rewards}
          empty="Nothing for sale."
          card={(reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              affordable={view.coins >= reward.price && !exchange.isPending}
              onBuy={() => setConfirm(reward)}
              onTip={setTip}
            />
          )}
        />
      </div>
      {tip && <ItemTooltip entry={{ item: asItem(tip.reward) }} at={tip.at} />}
      {confirm && (
        <Prompt
          title="Confirm Purchase"
          width={300}
          message={`Buy ${rewardName(confirm)}?\n${coins(confirm.price)} Coins`}
          acceptLabel="Confirm"
          denyLabel="Cancel"
          onAccept={() => {
            exchange.mutate({ rewardId: confirm.id })
            setConfirm(null)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </Dialog>
  )
}

const CURRENCY_TABS: Record<BoutiqueCurrency, string> = {
  gold: 'Gold',
  stone: 'Stones',
  giftCoupon: 'Gift Cert',
}

export function BuyCoins({
  view,
  character,
  onClose,
}: {
  view: BoutiqueView
  character: Character
  onClose: () => void
}) {
  const [currency, setCurrency] = useState<BoutiqueCurrency>('gold')
  const panelId = useId()
  const buy = useBoutiqueAction<BoutiqueActionResult>('buy-coins', () =>
    showToast('Coins bought.', 'success'),
  )
  const name = CURRENCY_TABS[currency]
  const balance = character[currency]
  return (
    <Dialog title="Buy Boutique Coins" onClose={onClose} className="w-[390px]">
      <div className="flex flex-col gap-[8px]" style={{ minHeight: 360 }}>
        <p className="text-center font-bold">
          Your {name}: {coins(balance)}
        </p>
        <Tabs
          label="Currency"
          panelId={panelId}
          tabs={BOUTIQUE_CURRENCIES.map((id) => ({ id, title: CURRENCY_TABS[id] }))}
          active={currency}
          onChange={setCurrency}
        />
        <ul id={panelId} role="tabpanel" className="flex flex-col gap-[6px]">
          {view.buyTiers[currency].map(([cost, amount], tier) => (
            <li key={tier}>
              <GameButton
                className="h-[30px] w-full"
                disabled={balance < cost || buy.isPending}
                onClick={() => buy.mutate({ currency, tier })}
              >
                {coins(cost)} {name} → {coins(amount)} Coins
              </GameButton>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}
