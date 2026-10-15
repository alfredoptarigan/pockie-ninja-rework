// Reborn's Picnic in Garden (`Ph`, reborn-windows-M-Z-hud.md) from the Clan window's Events
// "Picnic" tile. Below clan level 4 it only says when it opens. Open: the picnic picture with the
// Leaderboard chip (Contribution Leaderboard: this week's points, reset Monday), the warehouse
// bar, and four tiles: Outfit Contribution (Select Outfit: an unworn outfit for 1-7 points),
// Stone Contribution (150,000 Stones, +10), Coupon Contribution (20 Gift Certificates, +30) and
// Claim Reward (Monday only, when last week's warehouse was full, once a week).
import { useState } from 'react'
import type { PicnicResult, PicnicView } from '../../../../shared/src/schemas/home'
import { errorMessage, useInventory } from '../api'
import { ItemIcon } from '../ItemIcon'
import { itemName } from '../inventory/outfits'
import { Dialog, GameButton, Notice } from '../skin'
import { usePicnic, usePicnicAction } from './events-api'
import { ConfirmDialog, MessageDialog } from './NinjaGarden'

const ASSETS = '/assets/reborn/clan'
const DAY_MS = 86_400_000

function untilMonday(ms: number) {
  if (ms <= 0) return 'Now!'
  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const boxes = (n: number) => `${n} Picnic Box${n > 1 ? 'es' : ''}`

function claimTitle(picnic: PicnicView) {
  if (picnic.canClaim) return `Claim ${boxes(picnic.rewardAmount)}!`
  if (picnic.alreadyClaimedThisWeek) return 'Already claimed this week'
  if (picnic.lastWeekFull || picnic.isFull)
    return `Next claim: Monday (${untilMonday(picnic.timeUntilMonday)})`
  return 'Fill the warehouse to claim rewards'
}

function claimRefusal(picnic: PicnicView) {
  if (picnic.alreadyClaimedThisWeek) return 'Already claimed this week'
  if (picnic.lastWeekFull || picnic.isFull) return 'Rewards available on Monday only'
  return 'Warehouse must be full'
}

function successText(result: PicnicResult) {
  if (result.claimed)
    return `Claimed ${boxes(result.claimed.boxes)}:\n+${result.claimed.refineTalismans} Level 8 Refining Talisman\n+${result.claimed.bankaiCoins.toLocaleString('en-US')} Bankai Coins`
  return `+${result.pointsAdded} points!`
}

function Leaderboard({ picnic, onClose }: { picnic: PicnicView; onClose: () => void }) {
  const medals = ['text-[#c9a400]', 'text-[#8a8a8a]', 'text-[#a0522d]']
  return (
    <Dialog title="Contribution Leaderboard" onClose={onClose} className="w-[340px]">
      <p className="mb-2 text-center font-bold">Weekly Contributions (Resets Monday)</p>
      {picnic.contributions.length === 0 ? (
        <p className="text-center">No contributions this week</p>
      ) : (
        <div className="max-h-[200px] overflow-auto">
          <table className="w-full" aria-label="Weekly Contributions">
            <thead>
              <tr>
                <th>#</th>
                <th className="text-left">Member</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {picnic.contributions.map((row, index) => (
                <tr key={row.characterId} aria-label={row.name}>
                  <td className={`text-center font-bold ${medals[index] ?? ''}`}>{index + 1}</td>
                  <td className={index < 3 ? 'font-bold' : ''}>{row.name}</td>
                  <td className="text-center text-[#2e7d32]">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex justify-center">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}

function SelectOutfit({
  busy,
  onPick,
  onClose,
}: {
  busy: boolean
  onPick: (uid: string) => void
  onClose: () => void
}) {
  const inventory = useInventory()
  const outfits = (inventory.data ?? []).filter(
    (item) => item.info?.equipSlot === 'Outfit' && !item.equippedSlot,
  )
  return (
    <Dialog title="Select Outfit" onClose={onClose} className="w-[400px]">
      <p className="mb-2 text-center text-[11px]">Select an outfit to contribute (1-7 points)</p>
      <ul
        aria-label="Outfits"
        className="flex max-h-[140px] flex-wrap justify-center gap-2 overflow-auto"
      >
        {outfits.length === 0 ? (
          <li className="text-[11px] text-[#666]">No outfit items</li>
        ) : (
          outfits.map((item) => {
            const name = itemName(item)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={busy}
                  title={name}
                  onClick={() => onPick(item.id)}
                  className="flex w-[60px] flex-col items-center"
                >
                  <ItemIcon itemId={item.itemId} name={name} className="size-11">
                    {item.count > 1 && (
                      <span className="absolute right-0 bottom-0 text-[9px] text-white">
                        x{item.count}
                      </span>
                    )}
                  </ItemIcon>
                  <span className="max-w-[60px] truncate text-[9px]">{name}</span>
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="mt-2 flex justify-center">
        <GameButton onClick={onClose}>Cancel</GameButton>
      </div>
    </Dialog>
  )
}

type Confirm = 'stone' | 'gift-certificates' | 'claim'

export function PicnicWindow({ onClose }: { onClose: () => void }) {
  const query = usePicnic()
  const action = usePicnicAction()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [open, setOpen] = useState<'leaderboard' | 'outfit' | null>(null)
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null)
  if (query.isError)
    return (
      <Dialog title="Picnic in Garden" onClose={onClose}>
        <Notice tone="error">{errorMessage(query.error)}</Notice>
      </Dialog>
    )
  const picnic = query.data
  if (!picnic) return null
  if (!picnic.unlocked)
    return (
      <Dialog title="Picnic in Garden" onClose={onClose} className="w-[540px]">
        <div className="flex h-[420px] flex-col items-center justify-center">
          <p className="text-[16px] font-bold">Picnic unlocks at level {picnic.unlockLevel}</p>
          <p className="mt-2 text-[12px]">Current Clan Level {picnic.clanLevel}</p>
        </div>
      </Dialog>
    )

  const run = async (path: string, body: object = {}) => {
    try {
      const result = await action.mutateAsync({ path, body })
      setMessage({ title: 'Success', text: successText(result) })
    } catch (error) {
      setMessage({ title: 'Notice', text: errorMessage(error) })
    }
  }
  const fill = Math.min(1, picnic.warehousePoints / picnic.requirement)
  const tiles = [
    {
      label: 'Outfit Contribution',
      icon: 'Icon_ngm_053',
      title: 'Outfit Contribution: Contribute an outfit for 1-7 points',
      onClick: () => setOpen('outfit'),
    },
    {
      label: 'Stone Contribution',
      icon: 'Icon_ngm_009',
      title: `Stone Contribution: Spend ${picnic.stoneCost.toLocaleString('en-US')} Stones for +${picnic.stonePoints} points`,
      onClick: () => setConfirm('stone'),
    },
    {
      label: 'Coupon Contribution',
      icon: 'Icon_ngm_015',
      title: `Gift Certificate Contribution: Spend ${picnic.goldCost} GC for +${picnic.goldPoints} points`,
      onClick: () => setConfirm('gift-certificates'),
    },
    {
      label: 'Claim Reward',
      icon: 'Icon_ngm_371',
      title: claimTitle(picnic),
      onClick: () =>
        picnic.canClaim
          ? setConfirm('claim')
          : setMessage({ title: 'Notice', text: claimRefusal(picnic) }),
    },
  ]
  const confirmText: Record<Confirm, { title: string; text: string }> = {
    stone: {
      title: 'Stone Contribution',
      text: `Spend ${picnic.stoneCost.toLocaleString('en-US')} Stones for +${picnic.stonePoints} warehouse points?`,
    },
    'gift-certificates': {
      title: 'Gift Certificate Contribution',
      text: `Spend ${picnic.goldCost} Gift Certificates for +${picnic.goldPoints} warehouse points?`,
    },
    claim: { title: 'Claim Reward', text: `Claim ${boxes(picnic.rewardAmount)}?` },
  }

  return (
    <Dialog title="Picnic in Garden" onClose={onClose} className="w-[574px]">
      <div className="relative h-[456px] w-[550px] text-black">
        <img
          src={`${ASSETS}/Cross-Over.1024.943455.webp`}
          alt=""
          className="absolute inset-x-[20px] top-[20px] h-[290px] w-[510px] rounded border-2 border-[#3a2a12] bg-black object-cover"
        />
        <button
          type="button"
          title="View Contribution Leaderboard"
          onClick={() => setOpen('leaderboard')}
          className="game-panel-1 absolute top-[28px] right-[28px] h-[24px] w-[130px] text-[10px] font-bold"
        >
          Leaderboard
        </button>
        <div
          role="meter"
          aria-label="Warehouse"
          aria-valuemin={0}
          aria-valuemax={picnic.requirement}
          aria-valuenow={Math.min(picnic.warehousePoints, picnic.requirement)}
          className="absolute inset-x-[20px] top-[320px] h-[22px] overflow-hidden rounded border-2 border-[#4a3a2a] bg-linear-to-b from-[#1a1a1a] to-[#2a2a2a]"
        >
          <div
            className={`h-full ${picnic.isFull ? 'bg-linear-to-r from-[#4caf50] to-[#8bc34a]' : 'bg-linear-to-r from-[#3a8a3a] to-[#5aaa5a]'}`}
            style={{ width: `${fill * 100}%` }}
          />
          <span className="absolute inset-0 grid place-items-center text-[12px] font-bold text-[#d4c4a0] [text-shadow:0_1px_2px_#000]">
            {Math.min(picnic.warehousePoints, picnic.requirement)} / {picnic.requirement}
          </span>
        </div>
        <div className="absolute inset-x-[20px] top-[355px] flex justify-center gap-3">
          {tiles.map((tile) => (
            <button
              key={tile.label}
              type="button"
              title={tile.title}
              onClick={tile.onClick}
              disabled={action.isPending}
              className="flex flex-1 flex-col items-center"
            >
              <span className="game-panel-1 mb-1.5 grid h-[26px] w-[120px] place-items-center text-[10px] font-bold">
                {tile.label}
              </span>
              <span className="grid size-[52px] place-items-center rounded border-2 border-[#555] bg-linear-to-b from-[#a0a0a0] to-[#707070]">
                <img src={`${ASSETS}/${tile.icon}.webp`} alt="" className="size-11" />
              </span>
            </button>
          ))}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirmText[confirm].title}
          onClose={() => setConfirm(null)}
          choices={[{ label: 'Confirm', onPick: () => void run(confirm) }]}
        >
          <b>{confirmText[confirm].text}</b>
        </ConfirmDialog>
      )}
      {open === 'leaderboard' && <Leaderboard picnic={picnic} onClose={() => setOpen(null)} />}
      {open === 'outfit' && (
        <SelectOutfit
          busy={action.isPending}
          onClose={() => setOpen(null)}
          onPick={(uid) => {
            setOpen(null)
            void run('outfit', { uid })
          }}
        />
      )}
      {message && (
        <MessageDialog title={message.title} onClose={() => setMessage(null)}>
          {message.text}
        </MessageDialog>
      )}
    </Dialog>
  )
}
