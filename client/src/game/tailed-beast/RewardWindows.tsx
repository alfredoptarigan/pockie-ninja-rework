// The Tailed Beast map's reward windows after Reborn (reborn-windows-A-L.md): Kage Level Ninja
// (760x310, five village cards), Kage Rewards (470x270, pick one), Tailed Beast Rewards (348x248,
// fight-count boxes A/B/C) and our Essence Shop. ponytail: no Kage portraits (no kage/<avatar>
// art) and no "Guaranteed" box (our Kage gets the one reward they pick).
import { useState } from 'react'
import type { TailedBeastView } from '../../../../shared/src/schemas/tailed-beast'
import { errorMessage } from '../api'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { itemName, REBORN_VILLAGE_ORDER, useBeastAction } from './api'

/** Kage titles by our nation index. */
const KAGE_TITLES = [
  'Konoha Hokage',
  'Kiri Mizukage',
  'Iwa Tsuchikage',
  'Suna Kazekage',
  'Kumo Raikage',
]
const GOLD = 'h-[23px] !min-w-0 !px-0'

export function KageLevelNinjaWindow({
  view,
  onKageRewards,
  onDamageRewards,
  onClose,
}: {
  view: TailedBeastView
  onKageRewards: () => void
  onDamageRewards: () => void
  onClose: () => void
}) {
  const myKage = view.kages.find((k) => k.isMe)
  return (
    <Dialog title="Kage Level Ninja" onClose={onClose} className="game-window-bare w-[770px]">
      <div className="game-panel-1 relative h-[310px] font-game text-xs">
        <div className="absolute top-[5px] right-[35px] flex gap-[5px]">
          {myKage && (
            <GameButton
              className={`${GOLD} w-[110px]`}
              disabled={myKage.claimedItemId !== null}
              onClick={onKageRewards}
            >
              Kage Rewards
            </GameButton>
          )}
          <GameButton className={`${GOLD} w-[130px]`} onClick={onDamageRewards}>
            Damage Rewards
          </GameButton>
        </div>
        <ul className="absolute top-[35px] left-[5px] flex h-[250px] w-[740px] justify-between">
          {REBORN_VILLAGE_ORDER.map((village) => {
            const kage = view.kages.find((k) => k.village === village)
            return (
              <li
                key={village}
                className="flex w-[140px] flex-col items-center gap-2 border-2 border-black bg-[#2a221a] p-2 pt-[150px] text-center text-white"
              >
                <h3 className="font-bold text-[#ffd76a] uppercase">{KAGE_TITLES[village]}</h3>
                <span>{kage?.name ?? '???'}</span>
                {kage?.claimedItemId && (
                  <span className="text-[10px]">Picked {itemName(kage.claimedItemId)}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}

export function KageRewardsWindow({
  view,
  onClose,
}: {
  view: TailedBeastView
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const action = useBeastAction()
  const claimed = view.kages.find((k) => k.isMe)?.claimedItemId ?? null
  return (
    <Dialog title="Kage Rewards" onClose={onClose} className="game-window-bare w-[480px]">
      <div className="game-panel-1 relative h-[270px] font-game text-xs">
        <section className="game-panel-1 absolute top-[10px] left-[10px] h-[180px] w-[290px] p-2">
          <h4 className="mb-2 text-center font-bold">Pick One Reward</h4>
          <div className="grid grid-cols-4 gap-1">
            {view.kageChoices.map((itemId) => (
              <button
                key={itemId}
                type="button"
                aria-label={itemName(itemId)}
                aria-pressed={picked === itemId}
                title={itemName(itemId)}
                disabled={claimed !== null}
                onClick={() => setPicked(itemId)}
                className={`rounded ${picked === itemId ? 'shadow-[0_0_6px_2px_#ffd76a]' : ''}`}
              >
                <ItemIcon itemId={itemId} name={itemName(itemId)} className="size-16" />
              </button>
            ))}
          </div>
        </section>
        <p className="game-value-box absolute top-[196px] left-[10px] flex h-[28px] w-[448px] items-center justify-center">
          Earn the highest honor in your village.
        </p>
        <GameButton
          className="absolute top-[232px] left-[195px] h-[26px] w-[80px] !min-w-0"
          disabled={action.isPending || picked === null || claimed !== null}
          onClick={() =>
            picked &&
            action.mutate({
              path: 'kage',
              body: { itemId: picked },
              success: 'Kage rewards claimed!',
            })
          }
        >
          {action.isPending ? '...' : 'Claim'}
        </GameButton>
        {action.error && (
          <div className="absolute right-[10px] bottom-[2px] left-[10px]">
            <Notice tone="error">{errorMessage(action.error)}</Notice>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function BeastRewardsWindow({
  view,
  onClose,
}: {
  view: TailedBeastView
  onClose: () => void
}) {
  const [info, setInfo] = useState(false)
  const action = useBeastAction()
  // Reborn lists Box A (most fights) first.
  const boxes = [...view.boxes].sort((a, b) => b.fights - a.fights)
  const tiers = [...view.boxes].sort((a, b) => a.fights - b.fights)
  return (
    <Dialog title="Tailed Beast Rewards" onClose={onClose} className="game-window-bare w-[358px]">
      <div className="game-panel-1 relative min-h-[248px] p-[10px] font-game text-xs">
        <GameButton
          className="absolute top-[2px] right-[5px] h-[20px] w-[40px] !min-w-0 !px-0"
          aria-expanded={info}
          onClick={() => setInfo(!info)}
        >
          Info
        </GameButton>
        <div className="mt-[14px] flex gap-[4px] font-bold text-white">
          <span className="game-title-plate flex h-[24px] w-[64px] items-center justify-center">
            Reward
          </span>
          <span className="game-title-plate flex h-[24px] w-[260px] items-center justify-center">
            Requirement
          </span>
        </div>
        <ul className="mt-[4px] flex flex-col gap-[4px]">
          {boxes.map((box) => (
            <li key={box.fights} className="flex gap-[4px]">
              <ItemIcon itemId={box.itemId} name={itemName(box.itemId)} className="size-16" />
              <div className="game-value-box flex h-[64px] w-[260px] items-center justify-between px-2">
                <span>
                  Fight {box.fights} Tailed Beasts ({Math.min(view.me.fights, box.fights)}/
                  {box.fights})
                </span>
                <GameButton
                  className="h-[22px] w-[60px] !min-w-0 !px-0"
                  disabled={action.isPending || box.claimed || !box.ready}
                  onClick={() =>
                    action.mutate({
                      path: 'box',
                      body: { fights: box.fights },
                      success: 'Reward claimed successfully!',
                    })
                  }
                >
                  {box.claimed ? 'Claimed' : action.isPending ? '...' : 'Claim'}
                </GameButton>
              </div>
            </li>
          ))}
        </ul>
        {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {info && (
          <div className="absolute inset-x-[10px] top-[26px] flex flex-col gap-1 rounded border border-[#d4a017] bg-[#1e1a16]/95 p-2 text-white">
            <p className="font-bold text-[#ffd76a]">Tailed Beast Fight Rewards</p>
            <p>
              Earn reward boxes by fighting Tailed Beasts! The more fights you do, the better the
              box.
            </p>
            <p className="font-bold text-[#ffd76a]">Reward Tiers</p>
            <ul>
              {tiers.map((box) => (
                <li key={box.fights}>
                  {itemName(box.itemId).replace('Tailed Beast Reward ', '')}: complete {box.fights}{' '}
                  fights
                </li>
              ))}
            </ul>
            <p className="font-bold text-[#ffd76a]">Weekly Reset</p>
            <p>
              Fight count and claimed rewards reset every Monday. You can earn all {tiers.length}{' '}
              boxes every week. Any difficulty counts: Normal, Hard and Rampage.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function EssenceShopWindow({
  view,
  onClose,
}: {
  view: TailedBeastView
  onClose: () => void
}) {
  const action = useBeastAction()
  return (
    <Dialog title="Essence Shop" onClose={onClose} className="game-window-bare w-[430px]">
      <div className="game-panel-1 flex flex-col gap-2 p-[8px] font-game text-xs">
        <p>Essence: {view.me.essence.toLocaleString('en-US')}</p>
        <ul aria-label="Essence shop" className="grid grid-cols-2 gap-2">
          {view.shop.map((offer) => (
            <li key={offer.itemId} className="game-card flex items-center gap-2 p-1">
              <ItemIcon itemId={offer.itemId} name={itemName(offer.itemId)} className="size-8" />
              <span className="flex-1">
                {itemName(offer.itemId)}
                <br />
                {offer.available ? `${offer.essence} Essence` : 'Coming soon'}
              </span>
              <GameButton
                small
                disabled={action.isPending || !offer.available || view.me.essence < offer.essence}
                onClick={() =>
                  action.mutate({
                    path: 'shop',
                    body: { itemId: offer.itemId, count: 1 },
                    success: 'Purchase successful!',
                  })
                }
              >
                Buy
              </GameButton>
            </li>
          ))}
        </ul>
        {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      </div>
    </Dialog>
  )
}
