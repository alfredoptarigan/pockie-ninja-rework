// The Konoha Boutique's Bonus Round (pick 3 of 6 chests) and Double Chance (guess a box higher or
// lower than the number), as Reborn's modal frames over the machine: a dark overlay, a 550-wide
// body on bg_bonus.png. Clicking the overlay cancels.
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import {
  BOUTIQUE_RULES as RULES,
  type BoutiqueChestResult,
  type BoutiqueGuessResult,
  type BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique'
import { art, useBoutiqueAction } from './api'

const coins = (value: number) => value.toLocaleString('en-US')
const WIN_CLOSE_MS = 2000
const LOSS_CLOSE_MS = 2500

function Frame({
  title,
  onCancel,
  children,
}: {
  title: string
  onCancel: () => void
  children: ReactNode
}) {
  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/60"
      onClick={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        role="dialog"
        aria-label={title}
        className="game-frame game-window z-[51] px-[5px] pb-[5px]"
      >
        <div className="game-frame-title mb-[5px]">
          <h3 className="game-title-tag font-game font-bold">{title}</h3>
        </div>
        <div
          className="flex flex-col items-center gap-[12px] bg-cover p-[16px] text-center font-game text-white"
          style={{ width: 550, minHeight: 320, backgroundImage: `url(${art('bg_bonus')})` }}
        >
          {children}
        </div>
      </section>
    </div>
  )
}

function RoundButton({
  color,
  children,
  ...props
}: { color: 'blue' | 'red'; children: ReactNode } & {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="h-[40px] w-[120px] bg-contain bg-center bg-no-repeat font-game text-[15px] font-bold text-white [text-shadow:1px_1px_1px_#000] disabled:opacity-50"
      style={{ backgroundImage: `url(${art(`button_bonus_${color}`)})` }}
      {...props}
    >
      {children}
    </button>
  )
}

function Box({
  open,
  label,
  dim,
  gold,
  onClick,
  children,
}: {
  open: boolean
  label: string
  dim?: boolean
  gold?: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      className={`relative grid h-[90px] w-[100px] place-items-center rounded-[6px] ${dim ? 'opacity-40' : ''} ${gold ? 'outline-[3px] outline-[#ffd700] outline-solid' : ''}`}
    >
      <img src={art(open ? 'box_open' : 'box_close')} alt="" className="size-[80px]" />
      {children !== undefined && (
        <span className="absolute inset-x-0 bottom-[4px] animate-pulse text-[16px] font-bold text-[#0ff] [text-shadow:1px_1px_2px_#000]">
          {children}
        </span>
      )}
    </button>
  )
}

/** Pick 3 Chests: each pick asks the server for its coins; the round ends after the third. */
export function BonusRound({ view, onClose }: { view: BoutiqueView; onClose: () => void }) {
  const [picks, setPicks] = useState(view.bonusPicks)
  const chest = useBoutiqueAction<BoutiqueChestResult>('chest', (result) => {
    if (result.index >= 0)
      setPicks((list) => [...list, { index: result.index, coins: result.coinsWon }])
  })
  const done = picks.length >= RULES.chestPicks
  const total = picks.reduce((sum, pick) => sum + pick.coins, 0)
  const cancel = () => {
    if (!done) chest.mutate({ index: -1 })
    onClose()
  }
  return (
    <Frame title="Bonus Round" onCancel={cancel}>
      <h4 className="text-[18px] font-bold text-[#fd4]">Pick 3 Chests</h4>
      <div className="flex w-[360px] flex-wrap justify-center gap-[20px]">
        {Array.from({ length: RULES.chests }, (_, index) => {
          const pick = picks.find((entry) => entry.index === index)
          return (
            <Box
              key={index}
              open={Boolean(pick)}
              label={pick ? `Chest ${index + 1}: ${coins(pick.coins)} coins` : `Chest ${index + 1}`}
              dim={done && !pick}
              onClick={pick || done || chest.isPending ? undefined : () => chest.mutate({ index })}
            >
              {pick ? `+${coins(pick.coins)}` : undefined}
            </Box>
          )
        })}
      </div>
      {done && <p className="text-[18px] font-bold text-[#fd4]">Total Won: {coins(total)}</p>}
      <div className="flex gap-[20px]">
        <RoundButton color="blue" disabled={!done} onClick={onClose}>
          OK
        </RoundButton>
        <RoundButton color="red" onClick={cancel}>
          Cancel
        </RoundButton>
      </div>
    </Frame>
  )
}

const OPERATOR_TEXT = { higher: 'Pick Higher', lower: 'Pick Lower' } as const

/** Double Chance: one guess doubles the coins at stake or loses them; Claim takes them as they are. */
export function DoubleChance({ view, onClose }: { view: BoutiqueView; onClose: () => void }) {
  const [reveal, setReveal] = useState<BoutiqueGuessResult | null>(null)
  // The view drops the stake once the guess is settled; the frame keeps showing it.
  const [stake] = useState(view.doubleChanceCoins)
  const closeLater = useEffectEvent(onClose)
  const guess = useBoutiqueAction<BoutiqueGuessResult>('double', setReveal)
  const claim = useBoutiqueAction('double/claim', onClose)
  useEffect(() => {
    if (!reveal) return
    const timer = window.setTimeout(() => closeLater(), reveal.won ? WIN_CLOSE_MS : LOSS_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [reveal])
  const take = () => (reveal ? onClose() : claim.mutate({}))
  const operator = reveal?.operator ?? view.doubleChanceOperator
  return (
    <Frame title="Double Chance" onCancel={take}>
      <p className="text-[20px] text-[#fd4]">Coins at Stake: {coins(stake)}</p>
      <p className="text-[24px] text-[#0ff]">
        Current Number: {reveal?.target ?? view.doubleChanceNumber}
      </p>
      <p className="text-[22px] text-[#f64]">{OPERATOR_TEXT[operator]}</p>
      <div className="flex w-[360px] flex-wrap justify-center gap-[20px]">
        {Array.from({ length: RULES.doubleBoxes }, (_, index) => (
          <Box
            key={index}
            open={reveal !== null}
            label={reveal ? `Box ${index + 1}: ${reveal.boxes[index]}` : `Box ${index + 1}`}
            gold={reveal?.index === index}
            onClick={reveal || guess.isPending ? undefined : () => guess.mutate({ index })}
          >
            {reveal ? reveal.boxes[index] : undefined}
          </Box>
        ))}
      </div>
      {reveal && (
        <p
          role="status"
          className="text-[22px] font-bold"
          style={{ color: reveal.won ? '#0f0' : '#f44' }}
        >
          {reveal.won ? 'Double — Won!' : 'Double — Lost!'}
        </p>
      )}
      <div className="flex gap-[20px]">
        <RoundButton color="blue" disabled={claim.isPending} onClick={take}>
          Claim
        </RoundButton>
        <RoundButton color="red" disabled={claim.isPending} onClick={take}>
          Cancel
        </RoundButton>
      </div>
    </Frame>
  )
}
