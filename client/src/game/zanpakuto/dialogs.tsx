// The Zanpakuto window's small windows: "Zanpakuto - Info" and "Unlock Spirit Slot" (chunk 984).
import { spiritSlotCost } from '../../../../game-core/src/zanpakuto/zanpakuto'
import { Dialog, GameButton } from '../skin'

/** Reborn's info text, verbatim. */
export function InfoWindow({ onClose }: { onClose: () => void }) {
  const tier = (name: string, color: string) => (
    <span style={{ color }} className="font-bold">
      {name}
    </span>
  )
  return (
    <Dialog title="Zanpakuto - Info" onClose={onClose} className="w-[470px]">
      <div className="flex flex-col gap-1.5 text-[11px] leading-relaxed">
        <h3 className="text-[13px] font-bold">Zanpakuto System</h3>
        <p>Equip Zanpakuto Crystals to boost your weapon&apos;s power.</p>
        <p>
          <b>Spirit Inventory (left):</b> Stores your crystals. Unlock more slots with coupons or
          Stones.
        </p>
        <p>
          <b>Weapon Tabs (right):</b> Sharp, Blunt, and Fist — each has 6 crystal slots. The tab
          matching your equipped weapon type activates the bonuses.
        </p>
        <p>
          <b>Crystal Tiers:</b> {tier('Blue', '#00aeff')}, {tier('Purple', '#CA47AE')}, and{' '}
          {tier('Orange', 'orange')} — higher tiers have stronger stats.
        </p>
        <p>
          <b>Equip:</b> Right-click a crystal in your spirit inventory to equip it to the matching
          weapon slot.
        </p>
        <p>
          <b>Refine:</b> Re-roll a crystal&apos;s stats. 3 free tries per day, then costs Spirit
          Coins.
        </p>
        <p>
          <b>Bulk Refine:</b> Generate 10 random stat sets and pick the best one. Can lock
          attributes for a cost.
        </p>
        <p>
          <b>Spirit Coins (SC):</b> Earned by selling crystals. Used for refining and bulk refining.
        </p>
        <p>
          <b>Crystals drop from:</b> Impel Down fights (every 5th floor has guaranteed drops).
        </p>
      </div>
    </Dialog>
  )
}

export function UnlockSpiritSlot({
  slot,
  busy,
  onPay,
  onClose,
}: {
  slot: number
  busy: boolean
  onPay: (currency: 'stones' | 'coupons') => void
  onClose: () => void
}) {
  const cost = spiritSlotCost(slot)
  return (
    <Dialog title="Unlock Spirit Slot" onClose={onClose} className="w-[340px]">
      <p className="mb-3 text-xs">
        Unlock this spirit inventory slot using either Stones or Coupons.
      </p>
      <div className="flex justify-center gap-5">
        <GameButton className="h-[30px] w-[130px]" disabled={busy} onClick={() => onPay('stones')}>
          {cost.stones} Stones
        </GameButton>
        <GameButton className="h-[30px] w-[130px]" disabled={busy} onClick={() => onPay('coupons')}>
          {cost.coupons} Coupons
        </GameButton>
      </div>
    </Dialog>
  )
}
