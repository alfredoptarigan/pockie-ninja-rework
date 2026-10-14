// Reborn's Carrier Bag window (`carrierBagDialog`, opened by the HP / MP refill icons on the
// portrait card): what the pouches do, their fill, and the refill. Our rules stay: both pouches
// fill up for 1 Gold or Gift Coupon per 1,000 points (OnCustomBuy, UI_RoleUse.as "Full").
import type { Character } from '@pockie/shared'
import { errorMessage, useBuyPouches } from './api'
import { Dialog, GameButton, Notice } from './skin'

const POUCH_POINTS_PER_COIN = 1000

export function CarrierBagWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const buy = useBuyPouches()
  const cost = [character.hpPouch, character.mpPouch].reduce(
    (sum, pouch) => sum + Math.ceil((character.pouchMax - pouch) / POUCH_POINTS_PER_COIN),
    0,
  )
  const amount = (value: number) =>
    `${value.toLocaleString('en-US')}/${character.pouchMax.toLocaleString('en-US')}`
  const refill = (currency: 'gold' | 'giftCoupon') =>
    buy.mutate({ currency, hp: 'full', mp: 'full' })
  return (
    <Dialog title="Carrier Bag" onClose={onClose} className="game-window-bare w-[410px]">
      <div className="game-panel-1 flex h-[290px] w-[400px] flex-col gap-2 p-4 font-sans text-[#4b2f0a]">
        <p className="rounded-[5px] border border-[#80591c]/30 bg-white/50 p-1.5 text-[11px] leading-snug">
          Consume gift coupons to store some HP and chakra restoration items. After combat, carrier
          bags will automatically restore lost HP and chakra.
        </p>
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <img src="/assets/game/ui/refill-hp.webp" alt="" className="h-3 w-4" />
          HP Carrier bag Capacity: {amount(character.hpPouch)}
        </p>
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <img src="/assets/game/ui/refill-mp.webp" alt="" className="h-3 w-4" />
          Chakra Carrier bag Capacity: {amount(character.mpPouch)}
        </p>
        {cost === 0 ? (
          <p className="text-xs">Your carrier bags are full.</p>
        ) : (
          <>
            <p className="text-xs">
              Fill both bags for {cost} Gold or {cost} Gift Coupons.
            </p>
            <div className="flex gap-2">
              <GameButton
                disabled={buy.isPending || character.gold < cost}
                onClick={() => refill('gold')}
              >
                Buy with Gold
              </GameButton>
              <GameButton
                disabled={buy.isPending || character.giftCoupon < cost}
                onClick={() => refill('giftCoupon')}
              >
                Buy with Gift Coupons
              </GameButton>
            </div>
          </>
        )}
        {buy.isError && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
      </div>
    </Dialog>
  )
}
