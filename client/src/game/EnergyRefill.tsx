// Reborn's Energy Refill window (`Yg`, `vpRefillDialog`, opened by the VP refill icon on the
// portrait card): energy back to full for 35 x 2^refillsToday Gold, the price resetting at midnight.
import type { Character } from '@pockie/shared'
import { useMutation } from '@tanstack/react-query'
import { energyRefillCost, type EnergyRefillResult } from '../../../shared/src/schemas/energy'
import { api } from '../lib/api'
import { errorMessage, useApplyResult } from './api'
import { Dialog, GameButton, Notice } from './skin'
import { showToast } from './toast'

const number = (value: number) => value.toLocaleString('en-US')

function useRefillEnergy() {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: () =>
      api<EnergyRefillResult>('/api/game/energy/refill', { method: 'POST', body: {} }),
    onSuccess: apply,
  })
}

export function EnergyRefillWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const refill = useRefillEnergy()
  const { current, max, refillsToday } = character.energy
  const missing = Math.max(0, max - current)
  const cost = energyRefillCost(missing, refillsToday)
  const nextCost = energyRefillCost(max, refillsToday + 1)
  const affordable = character.gold >= cost
  const confirm = () =>
    refill.mutate(undefined, {
      onSuccess: ({ restored }) => {
        showToast(`Energy refilled! Restored ${restored} energy.`, 'success')
        onClose()
      },
    })
  const row = (label: string, value: string, tone = '') => (
    <p className="flex justify-between text-[12px]">
      <span className="text-[#6b4a1a]">{label}</span>
      <span className={`font-bold ${tone}`}>{value}</span>
    </p>
  )
  return (
    <Dialog title="Energy Refill" onClose={onClose} className="game-window-bare w-[310px]">
      <div className="game-panel-1 flex h-[320px] w-[300px] flex-col gap-2 p-3 font-sans text-[#4b2f0a]">
        <p className="flex items-center gap-2">
          <img src="/assets/game/ui/refill-vp.webp" alt="" className="h-[18px] w-6" />
          <span className="text-[14px] font-bold">Energy Refill</span>
          <span className="ml-auto text-[12px]">
            Current: {current}/{max}
          </span>
        </p>
        <p className="rounded-[5px] border border-[#80591c]/30 bg-white/50 p-2 text-[11px] leading-snug">
          Refill your energy to full using gold. The price increases with each refill today and
          resets at midnight.
        </p>
        <div className="flex flex-col gap-1 rounded-[6px] border border-[#80591c]/30 bg-white/60 p-2.5">
          {row('Refills today:', String(refillsToday))}
          {row('Energy to restore:', `+${missing}`, 'text-[#2d8a2d]')}
          {row('Current cost:', `${number(cost)} Gold`, affordable ? '' : 'text-[#c0392b]')}
          {row('Next refill cost:', `${number(nextCost)} Gold`)}
          {row('Your Gold:', number(character.gold))}
        </div>
        {refill.isError && <Notice tone="error">{errorMessage(refill.error)}</Notice>}
        {missing > 0 ? (
          <div className="mt-auto flex gap-2">
            <GameButton
              className="min-h-9 flex-1"
              disabled={!affordable || refill.isPending}
              onClick={confirm}
            >
              {affordable ? `Refill for ${number(cost)} Gold` : 'Not enough gold'}
            </GameButton>
            <GameButton className="min-h-9 flex-1" onClick={onClose}>
              Cancel
            </GameButton>
          </div>
        ) : (
          <div className="mt-auto flex flex-col items-center gap-2">
            <span className="text-[13px] font-semibold text-[#2d8a2d]">
              Your energy is already full!
            </span>
            <GameButton className="min-h-9 min-w-[120px]" onClick={onClose}>
              Close
            </GameButton>
          </div>
        )}
      </div>
    </Dialog>
  )
}
