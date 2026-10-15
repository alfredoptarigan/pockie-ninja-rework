// Chain Attack (reborn-windows-A-L.md "Chain Attack", "Chain Attack Progress", "Finish this task
// instantly?"): the configuration window opened from a monster card, the progress window with its
// timer, claim and Instant Finish, and the HUD timer that reopens it.
import type { Character } from '@pockie/shared'
import { useState, type CSSProperties } from 'react'
import {
  CHAIN_ATTACK_RULES,
  instantFinishCost,
  type ChainAttack,
  type ChainAttackClaimResult,
} from '../../../../shared/src/schemas/hunt'
import type { AkatsukiAmbush as Ambush } from '../../../../shared/src/schemas/akatsuki'
import { AkatsukiAmbush } from '../akatsuki'
import { errorMessage } from '../api'
import { useMonsterPortrait } from '../art'
import { hms } from '../dungeons'
import { rewardCountdown, useNow } from '../events/timer'
import { BagFullNote, ResultWindow, rewardColumns } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { GameText, plainText } from '../text'
import { showToast } from '../toast'
import type { SceneMonster } from '../types'
import {
  showChainProgress,
  useChainAttack,
  useChainProgressShown,
  useClaimChain,
  useStartChain,
} from './api'

const STEP_MS = CHAIN_ATTACK_RULES.secondsPerMonster * 1000
const counts = Array.from({ length: CHAIN_ATTACK_RULES.maxMonsters }, (_, i) => i + 1)

/** Reborn's `My` (420x280): how many monsters to chain, MAX, the estimated time, Begin / Cancel. */
export function ChainAttackDialog({
  monster,
  onClose,
}: {
  monster: SceneMonster
  onClose: () => void
}) {
  const [amount, setAmount] = useState(1)
  const start = useStartChain()
  const begin = () =>
    start.mutate(
      { monsterId: monster.id, amount },
      {
        onSuccess: () => {
          onClose()
          showChainProgress(true)
        },
        onError: (error) => showToast(errorMessage(error), 'failure'),
      },
    )
  return (
    <Dialog title="Chain Attack" onClose={onClose} className="game-window-bare w-[420px]">
      <div className="game-panel-1 flex flex-col gap-[8px] p-[5px] font-game text-[12px] text-black">
        <p className="game-panel-small py-[10px] text-center text-[14px] font-bold">
          Chain Attack Configuration
        </p>
        <p className="game-inset min-h-[70px] p-[8px] text-[11px]">
          Chain attacks hit multiple enemies in sequence: {plainText(monster.nameKey, 'Monster')}{' '}
          (Lv. {monster.level}), {CHAIN_ATTACK_RULES.secondsPerMonster / 60} minutes each.
        </p>
        <label className="game-value-box flex h-[50px] items-center gap-[10px] px-[10px]">
          <span className="w-[120px] font-bold">Chain Attack:</span>
          <select
            aria-label="Monsters to chain"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="h-[24px] w-[80px] border border-[#5a4a30] bg-white px-1"
          >
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <GameButton
            className="h-[24px] w-[60px]"
            onClick={() => setAmount(CHAIN_ATTACK_RULES.maxMonsters)}
          >
            MAX
          </GameButton>
          <span>{amount} Monsters</span>
        </label>
        <p className="game-panel-small flex justify-between px-[10px] py-[6px]">
          <span className="font-bold">Estimated Time:</span>
          <span>{hms(amount * STEP_MS)}</span>
        </p>
        <div className="flex justify-around">
          <GameButton className="h-[28px] w-[100px]" disabled={start.isPending} onClick={begin}>
            Begin
          </GameButton>
          <GameButton className="h-[28px] w-[100px]" onClick={onClose}>
            Cancel
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

/** Reborn's HUD timer (`As`): the chain's countdown, "Ready" once over; a click shows progress. */
export function ChainAttackTimer() {
  const chain = useChainAttack().data?.chain
  const now = useNow()
  if (!chain) return null
  const done = Date.parse(chain.endsAt) <= now
  return (
    <button
      type="button"
      onClick={() => showChainProgress(true)}
      title="Chain Attack Progress"
      className={`pointer-events-auto absolute top-[42px] left-[295px] w-[75px] rounded border-2 border-[#5a4a30] bg-black/60 px-1 text-center font-game text-[13px] text-[whitesmoke] [text-shadow:1px_1px_2px_#000] ${done ? 'animate-pulse' : ''}`}
    >
      <span className="block text-[10px] text-[#ffd700]">Chain</span>
      {done ? 'Ready' : rewardCountdown(chain.endsAt, now)}
    </button>
  )
}

/** Reborn's `_r` (500x400) while shown and a chain runs, plus the claim result. */
export function ChainAttackProgress({ character }: { character: Character }) {
  const shown = useChainProgressShown()
  const chain = useChainAttack().data?.chain
  const [result, setResult] = useState<ChainAttackClaimResult | null>(null)
  const [ambush, setAmbush] = useState<Ambush | null>(null)
  const claim = useClaimChain()
  const claimNow = (instant: boolean) =>
    claim.mutate(instant, {
      onSuccess: (claimed) => {
        showChainProgress(false)
        setResult(claimed)
      },
    })
  return (
    <>
      {shown && chain && !result && (
        <ProgressWindow
          chain={chain}
          coupons={character.giftCoupon}
          pending={claim.isPending}
          error={claim.isError ? errorMessage(claim.error) : null}
          onClaim={claimNow}
          onClose={() => showChainProgress(false)}
        />
      )}
      {result && (
        <ResultWindow
          title="Chain Attack"
          story={`Defeated ${result.won} of ${result.fought} ${result.fought === 1 ? 'monster' : 'monsters'}.`}
          note={result.won < result.fought ? 'The chain stopped at your defeat.' : undefined}
          columns={rewardColumns(result.rewards)}
          findTitle="Drops"
          finds={result.rewards.items}
          emptyFind="Nothing dropped this time."
          onClose={() => {
            setAmbush((result.akatsukiAmbush as Ambush | undefined) ?? null)
            setResult(null)
          }}
        >
          {result.rewards.lost ? <BagFullNote lost={result.rewards.lost} /> : null}
        </ResultWindow>
      )}
      {ambush && (
        <AkatsukiAmbush ambush={ambush} character={character} onDone={() => setAmbush(null)} />
      )}
    </>
  )
}

function ProgressWindow({
  chain,
  coupons,
  pending,
  error,
  onClaim,
  onClose,
}: {
  chain: ChainAttack
  coupons: number
  pending: boolean
  error: string | null
  onClaim: (instant: boolean) => void
  onClose: () => void
}) {
  const now = useNow()
  const portrait = useMonsterPortrait()(chain.monsterId)
  const [confirm, setConfirm] = useState(false)
  const start = Date.parse(chain.startedAt)
  const end = Date.parse(chain.endsAt)
  const remaining = Math.max(0, end - now)
  const done = remaining <= 0
  const percent = Math.min(100, ((now - start) / (end - start)) * 100)
  const cost = instantFinishCost(remaining)
  return (
    <Dialog title="Chain Attack Progress" onClose={onClose} className="game-window-bare w-[500px]">
      <div className="game-panel-1 flex flex-col gap-[8px] p-[5px] font-game text-[12px] text-black">
        <p className="game-panel-small py-[10px] text-center text-[14px] font-bold">
          Chain attack in progress!
        </p>
        <div className="game-value-box flex h-[60px] items-center gap-[10px] px-[10px]">
          {portrait && <img src={portrait} alt="" className="size-10 object-contain" />}
          <div>
            <p className="font-bold">
              {plainText(chain.nameKey, `Monster #${chain.monsterId}`)} (Level: {chain.level})
            </p>
            <p className="text-[11px]">Fighting {chain.amount} Monsters</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Chain attack progress"
          aria-valuenow={Math.floor(percent)}
          className="game-progress relative mx-[10px] h-[20px]"
          style={{ '--fill': `${percent}%` } as CSSProperties}
        >
          <span className="absolute inset-0 z-[1] grid place-items-center text-[10px] font-bold">
            {percent.toFixed(1)}%
          </span>
        </div>
        <p className="flex justify-between px-[10px]">
          <span className="font-bold">Time Remaining:</span>
          {done ? (
            <span className="font-bold text-[#2e7d32]">Completed!</span>
          ) : (
            <span>{rewardCountdown(chain.endsAt, now)}</span>
          )}
        </p>
        <section
          aria-label="Possible Rewards"
          className="game-inset max-h-[120px] overflow-auto p-2"
        >
          <h3 className="font-bold">Possible Rewards:</h3>
          <p className="text-[11px]">Fixed rewards per monster</p>
          <ul className="list-inside list-disc text-[11px]">
            <li>Experience Points</li>
            <li>Stones</li>
          </ul>
          <p className="mt-1 text-[11px]">Item Drops Chance</p>
          <ul className="grid grid-cols-2 text-[11px]">
            {chain.drops.map((drop) => (
              <li key={drop.itemId}>
                <GameText k={drop.nameKey} fallback="Unknown item" />
              </li>
            ))}
          </ul>
        </section>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-around">
          {done ? (
            <GameButton
              className="h-[28px] w-[120px]"
              disabled={pending}
              onClick={() => onClaim(false)}
            >
              Claim Rewards
            </GameButton>
          ) : (
            <>
              <GameButton className="h-[28px] w-[100px]" onClick={() => setConfirm(true)}>
                Instant Finish
              </GameButton>
              <GameButton
                className="h-[28px] w-[100px]"
                disabled={pending}
                onClick={() => onClaim(false)}
              >
                Claim Early
              </GameButton>
            </>
          )}
          <GameButton className="h-[28px] w-[100px]" onClick={onClose}>
            Close
          </GameButton>
        </div>
      </div>
      {confirm && !done && (
        <Dialog
          title="Finish this task instantly?"
          onClose={() => setConfirm(false)}
          className="game-window-bare w-[350px]"
        >
          <div className="game-panel-1 flex flex-col items-center gap-[10px] p-[12px] font-game text-[12px] text-black">
            <p className="font-bold">Finish this task instantly?</p>
            <p className={coupons >= cost ? 'text-[#2e7d32]' : 'text-danger'}>
              Cost: {cost} Coupons
            </p>
            <div className="flex gap-4">
              <GameButton
                className="h-[28px] w-[100px]"
                disabled={coupons < cost || pending}
                onClick={() => {
                  setConfirm(false)
                  onClaim(true)
                }}
              >
                Confirm
              </GameButton>
              <GameButton className="h-[28px] w-[100px]" onClick={() => setConfirm(false)}>
                Cancel
              </GameButton>
            </div>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}
