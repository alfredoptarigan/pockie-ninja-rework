// The Bankai window's sub-windows: Crystal System Guide (Info), Get Crystal and Unlock Slot.
import {
  CRYSTAL_QUALITIES,
  CRYSTAL_QUALITY_INFO,
  inventorySlotCost,
} from '../../../../game-core/src/bankai/bankai'
import type { BankaiView } from '../../../../shared/src/schemas/bankai'
import { Dialog, GameButton } from '../skin'
import { QUALITY_COLORS } from './shared'

const capital = (word: string) => word[0]!.toUpperCase() + word.slice(1)
const CELL = 'border-b border-wood-light px-1.5 py-0.5'

export function CrystalGuide({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Crystal System Guide" onClose={onClose} className="w-[440px]">
      <div className="flex flex-col gap-1.5 text-[11px] leading-relaxed">
        <h3 className="text-[13px] font-bold">Bankai Crystal System</h3>
        <p>
          The Bankai Crystal System allows you to enhance your Bankai with powerful crystal stats.
        </p>
        <p>Important: Crystal stats are permanent. Choose wisely!</p>
        <h3 className="font-bold">Crystal Qualities</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${CELL} text-left`}>Quality</th>
              <th className={CELL}>Max LV</th>
              <th className={CELL}>Base XP</th>
              <th className={CELL}>Sell</th>
            </tr>
          </thead>
          <tbody>
            {CRYSTAL_QUALITIES.map((quality) => {
              const info = CRYSTAL_QUALITY_INFO[quality]
              return (
                <tr key={quality} className="text-center">
                  <td
                    className={`${CELL} text-left font-bold`}
                    style={{ color: QUALITY_COLORS[quality] }}
                  >
                    {capital(quality)}
                  </td>
                  <td className={CELL}>{info.maxLevel}</td>
                  <td className={CELL}>{info.baseXp}</td>
                  <td className={CELL}>{info.price} Coins</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <h3 className="font-bold">Available Stats</h3>
        <p>Green crystals: 6 basic stats available</p>
        <p>Blue+ crystals: All 16 stats available</p>
        <h3 className="font-bold">How to Obtain Crystals</h3>
        <p>Crystals can be obtained from dungeons, events, and the crystal forge.</p>
        <h3 className="font-bold">Crystal Absorption</h3>
        <p>
          Feed crystals to your Bankai to absorb their stats. Higher quality crystals provide more
          stats.
        </p>
        <h3 className="font-bold">Bankai Levels</h3>
        <p>Feed crystals to level up your Bankai. Each level increases base stats.</p>
      </div>
    </Dialog>
  )
}

/**
 * Get Crystal: Bankai Coins and the Akatsuki forge chain. ponytail: Reborn's forge odds are not in
 * the client data, so forging stays closed instead of rolling made-up qualities.
 */
export function GetCrystal({ data, onClose }: { data: BankaiView; onClose: () => void }) {
  return (
    <Dialog title="Get Crystal" onClose={onClose} className="w-[620px]">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm font-bold text-[#1d6b1d]">
          Coins: {data.coins.toLocaleString('en-US')}
        </p>
        <ol aria-label="Crystal forge" className="flex flex-wrap items-center gap-2">
          {data.forgeNpcs.map((npc, index) => (
            <li key={npc.name} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">&rarr;</span>}
              <GameButton disabled title="The Crystal Forge is not open yet." className="h-12 w-24">
                {npc.name} (Cost: {npc.cost})
              </GameButton>
            </li>
          ))}
        </ol>
        <p className="text-xs">
          Crystal Forge System: forge crystals with Bankai Coins. The Crystal Forge is not open yet.
        </p>
      </div>
    </Dialog>
  )
}

export type PayWith = 'coupons' | 'stones' | 'gold'

export function UnlockSlot({
  slot,
  busy,
  onPay,
  onClose,
}: {
  slot: number
  busy: boolean
  onPay: (payWith: PayWith) => void
  onClose: () => void
}) {
  const cost = inventorySlotCost(slot)
  const options: [PayWith, string][] = [
    ['coupons', `${cost.coupons.toLocaleString('en-US')} Coupons`],
    ['stones', `${cost.stones.toLocaleString('en-US')} Stones`],
    ['gold', `${cost.gold.toLocaleString('en-US')} Gold`],
  ]
  return (
    <Dialog title="Unlock Slot" onClose={onClose} className="w-[380px]">
      <p className="mb-3 text-center text-xs font-bold">Unlock this slot?</p>
      <div className="flex justify-center gap-1.5">
        {options.map(([payWith, label]) => (
          <GameButton key={payWith} small disabled={busy} onClick={() => onPay(payWith)}>
            {label}
          </GameButton>
        ))}
        <GameButton small onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </Dialog>
  )
}
