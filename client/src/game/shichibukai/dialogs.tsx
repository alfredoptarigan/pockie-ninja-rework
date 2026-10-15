// Shichibukai dialogs after Reborn's: Choose Expedition (floors 4 a page, each with its boss and
// 4 difficulties with 0-5 stars), Treasure Cards / Marauder Spoils (5 cards, peeks, flip, claim),
// Shichibukai Boss (50 / 100 / 150% power), Floor Cleared, Buy Dice (Moon Eye), Out of Rolls and
// the points Exchange.
import { useState } from 'react'
import {
  DIFFICULTY_NAMES,
  floorUnlocked,
  SHICHIBUKAI_RULES as RULES,
  starKey,
  type ShichibukaiBossResult,
  type ShichibukaiCardView,
  type ShichibukaiView,
} from '../../../../shared/src/schemas/shichibukai'
import { poseUrl } from '../dungeons'
import { ItemIcon } from '../ItemIcon'
import { diceArt } from '../sannin-test'
import { Dialog, GameButton } from '../skin'
import { plainText } from '../text'
import { itemNameKey } from '../world'
import { shichiArt } from './Board'

const PAGE = 4
const FLOORS = Array.from({ length: RULES.floors }, (_, i) => i + 1)
const DIFFICULTIES = [1, 2, 3, 4]
const DIFFICULTY_ART = ['easy', 'hard', 'epic', 'nightmare']

function Stars({ count, label }: { count: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-[1px]">
      {Array.from({ length: RULES.maxStars }, (_, i) => (
        <img
          key={i}
          src={shichiArt(i < count ? 'star_full' : 'star_empty')}
          alt=""
          width={13}
          height={12}
        />
      ))}
    </span>
  )
}

export function StartPanel({
  view,
  busy,
  onStart,
  onSupply,
}: {
  view: ShichibukaiView
  busy: boolean
  onStart: (floor: number, difficulty: number) => void
  onSupply: () => void
}) {
  const [page, setPage] = useState(0)
  const [pick, setPick] = useState({ floor: 1, difficulty: 1 })
  const stars = (difficulty: number, floor: number) => view.stars[starKey(difficulty, floor)] ?? 0
  const shown = FLOORS.slice(page * PAGE, page * PAGE + PAGE)
  const pages = Math.ceil(FLOORS.length / PAGE)
  return (
    <section
      aria-label="Choose Expedition"
      className="flex flex-col gap-[10px] font-game text-[12px]"
    >
      <h3 className="text-center text-[15px] font-bold text-[#ffe27a] [text-shadow:1px_1px_2px_#000]">
        Choose Expedition
      </h3>
      <div className="flex items-center gap-[6px]">
        <GameButton
          aria-label="Previous floors"
          disabled={page <= 0}
          onClick={() => setPage(page - 1)}
        >
          &lsaquo;
        </GameButton>
        <ul className="flex flex-1 gap-[8px]">
          {shown.map((floor) => {
            const boss = view.floorBosses[floor - 1]!
            return (
              <li
                key={floor}
                aria-label={`Floor ${floor}`}
                className="game-panel-1 flex flex-1 flex-col items-center gap-[4px] p-[8px] text-black"
              >
                <img src={poseUrl(boss.pose)} alt={boss.name} className="h-[90px] object-contain" />
                <strong>Floor {floor}</strong>
                {DIFFICULTIES.map((difficulty) => {
                  const open = floorUnlocked(view.stars, floor, difficulty)
                  const on = pick.floor === floor && pick.difficulty === difficulty
                  const name = DIFFICULTY_NAMES[difficulty - 1]!
                  return (
                    <div key={difficulty} className="flex items-center gap-[4px]">
                      <button
                        type="button"
                        aria-label={`Floor ${floor} ${name}`}
                        aria-pressed={on}
                        title={open ? name : `${name}: locked`}
                        disabled={!open}
                        onClick={() => setPick({ floor, difficulty })}
                        className={`h-[18px] w-[40px] rounded-[3px] bg-contain bg-center bg-no-repeat disabled:opacity-40 disabled:grayscale ${on ? 'ring-2 ring-[#ffd700]' : ''}`}
                        style={{
                          backgroundImage: `url(${shichiArt(DIFFICULTY_ART[difficulty - 1]!)})`,
                        }}
                      />
                      <Stars
                        count={stars(difficulty, floor)}
                        label={`${stars(difficulty, floor)} stars`}
                      />
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ul>
        <GameButton
          aria-label="Next floors"
          disabled={page >= pages - 1}
          onClick={() => setPage(page + 1)}
        >
          &rsaquo;
        </GameButton>
      </div>
      <div className="flex items-center justify-center gap-[12px] text-white [text-shadow:1px_1px_2px_#000]">
        <GameButton
          className="w-[90px]"
          disabled={
            busy || view.attempts <= 0 || !floorUnlocked(view.stars, pick.floor, pick.difficulty)
          }
          onClick={() => onStart(pick.floor, pick.difficulty)}
        >
          Start
        </GameButton>
        <span>
          Attempts: <b>{view.attempts}</b>
        </span>
        <span>
          Points: <b>{view.points.toLocaleString('en-US')}</b>
        </span>
        <GameButton className="w-[90px]" disabled={busy} onClick={onSupply}>
          Supply
        </GameButton>
      </div>
    </section>
  )
}

export const itemLabel = (itemId: string) => plainText(itemNameKey(itemId), itemId)

export function CardsDialog({
  card,
  busy,
  onPeek,
  onFlip,
  onClaim,
}: {
  card: ShichibukaiCardView
  busy: boolean
  onPeek: (index: number) => void
  onFlip: (index: number) => void
  onClaim: () => void
}) {
  const picked = card.flipped !== null
  return (
    <Dialog
      title={card.reason === 'monster' ? 'Marauder Spoils' : 'Treasure Cards'}
      onClose={() => picked && onClaim()}
      className="game-window-bare w-[594px]"
    >
      <div className="game-panel-1 flex flex-col items-center gap-[10px] p-[12px] font-game text-[12px] text-black">
        <p className="font-bold">{picked ? 'Claim your treasure!' : 'Pick a card to flip'}</p>
        <ul className="flex gap-[10px]">
          {Array.from({ length: RULES.cards }, (_, i) => {
            const itemId = picked ? card.items![i] : card.peeked[i]
            const chosen = card.flipped === i
            return (
              <li key={i} className="flex w-[96px] flex-col items-center gap-[6px]">
                <button
                  type="button"
                  aria-label={itemId ? `Card ${i + 1}: ${itemLabel(itemId)}` : `Card ${i + 1}`}
                  disabled={busy || picked}
                  onClick={() => onFlip(i)}
                  className={`grid h-[120px] w-[90px] place-items-center rounded-[6px] border-2 ${
                    chosen
                      ? 'border-[#ffd700] bg-[#fff4c8]'
                      : itemId
                        ? 'border-[#a8723c] bg-[#f3e5c0]'
                        : 'border-[#5a4636] bg-[#3a2a18]'
                  } ${picked && !chosen ? 'opacity-50' : ''}`}
                >
                  {itemId ? (
                    <ItemIcon itemId={itemId} name={itemLabel(itemId)} />
                  ) : (
                    <span className="text-[24px] font-black text-[#ffe27a]">?</span>
                  )}
                </button>
                {!picked ? (
                  <GameButton
                    small
                    disabled={busy || card.peeked[i] !== undefined || card.peekCost === null}
                    onClick={() => onPeek(i)}
                  >
                    {card.peeked[i] !== undefined
                      ? 'Seen'
                      : card.peekCost !== null
                        ? `Peek ${card.peekCost / 1000}k`
                        : 'No peeks'}
                  </GameButton>
                ) : chosen ? (
                  <GameButton small disabled={busy} onClick={onClaim}>
                    Claim
                  </GameButton>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p>
          {picked
            ? 'Claim your chosen treasure to continue.'
            : 'Flip a card to claim its treasure. Peek costs 50k, 100k, then 150k stones.'}
        </p>
      </div>
    </Dialog>
  )
}

export function BossDialog({
  boss,
  busy,
  onFight,
}: {
  boss: { name: string; pose: number }
  busy: boolean
  onFight: (power: 50 | 100 | 150) => void
}) {
  const [power, setPower] = useState<50 | 100 | 150>(100)
  return (
    <Dialog title="Shichibukai Boss" onClose={() => {}} className="game-window-bare w-[254px]">
      <div className="game-panel-1 flex flex-col items-center gap-[8px] p-[10px] font-game text-[12px] text-black">
        <img src={poseUrl(boss.pose)} alt={boss.name} className="h-[200px] object-contain" />
        <strong>{boss.name}</strong>
        <p className="text-center">
          The boss&apos;s power decides your score &mdash; the stronger the foe, the more stars and
          points you earn.
        </p>
        <fieldset className="flex flex-col gap-[4px]">
          <legend className="sr-only">Boss power</legend>
          {RULES.powers.map((value) => (
            <label key={value} className="flex items-center gap-[6px]">
              <input
                type="radio"
                name="shichibukai-power"
                checked={power === value}
                onChange={() => setPower(value)}
              />
              {value}%
            </label>
          ))}
        </fieldset>
        <GameButton className="w-[90px]" disabled={busy} onClick={() => onFight(power)}>
          Fight
        </GameButton>
      </div>
    </Dialog>
  )
}

export function ClearedDialog({
  result,
  floor,
  busy,
  onContinue,
  onCollect,
}: {
  result: ShichibukaiBossResult['rewards']
  floor: number
  busy: boolean
  onContinue: () => void
  onCollect: () => void
}) {
  const last = floor >= RULES.floors
  return (
    <Dialog title="Floor Cleared" onClose={onCollect} className="game-window-bare w-[265px]">
      <div className="game-panel-1 flex flex-col gap-[8px] p-[10px] font-game text-[12px] text-black">
        <dl className="grid grid-cols-[1fr_auto] gap-[6px]">
          <dt>Total throws</dt>
          <dd className="font-bold">{result?.throws ?? '—'}</dd>
          <dt>EXP</dt>
          <dd className="font-bold">+{(result?.exp ?? 0).toLocaleString('en-US')}</dd>
          <dt>Score</dt>
          <dd className="font-bold">+{(result?.points ?? 0).toLocaleString('en-US')}</dd>
        </dl>
        <Stars count={result?.stars ?? 0} label={`${result?.stars ?? 0} stars`} />
        <div className="flex justify-center">
          {last ? (
            <GameButton disabled={busy} onClick={onCollect}>
              Collect
            </GameButton>
          ) : (
            <div className="flex gap-[6px]">
              <GameButton disabled={busy} onClick={onContinue}>
                Continue
              </GameButton>
              <GameButton disabled={busy} onClick={onCollect}>
                Collect
              </GameButton>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

export function MoonEyeDialog({
  busy,
  onPick,
  onClose,
}: {
  busy: boolean
  onPick: (face: number) => void
  onClose: () => void
}) {
  const [face, setFace] = useState(0)
  return (
    <Dialog title="Buy Dice" onClose={onClose} className="game-window-bare w-[183px]">
      <div className="game-panel-1 flex flex-col items-center gap-[8px] p-[6px] font-game text-[12px] text-black">
        <div className="grid grid-cols-3 gap-[5px]">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Move ${n}`}
              aria-pressed={face === n}
              disabled={busy}
              onClick={() => setFace(n)}
              className={`grid size-[51px] place-items-center rounded ${face === n ? 'ring-2 ring-[#ffd700]' : ''}`}
            >
              <img src={diceArt(n)} alt="" width={36} height={36} />
            </button>
          ))}
        </div>
        <p>Choose dice &mdash; {RULES.moonEyeGold} gold</p>
        <div className="flex gap-[6px]">
          <GameButton disabled={busy || face === 0} onClick={() => onPick(face)}>
            OK
          </GameButton>
          <GameButton disabled={busy} onClick={onClose}>
            Cancel
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

const ROLL_LABELS = {
  gold: `${RULES.rollPrices.gold} Gold`,
  gc: `${RULES.rollPrices.gc} GC`,
  stones: `${RULES.rollPrices.stones / 1000}k Stones`,
} as const

export function OutOfRollsDialog({
  busy,
  onBuy,
  onGiveUp,
}: {
  busy: boolean
  onBuy: (currency: keyof typeof ROLL_LABELS) => void
  onGiveUp: () => void
}) {
  return (
    <Dialog title="Out of Rolls" onClose={() => {}} className="game-window-bare w-[320px]">
      <div className="game-panel-1 flex flex-col items-center gap-[8px] p-[8px] font-game text-[12px] text-black">
        <p>
          You are out of rolls. Buy one more roll below, or give up and return to the expedition
          screen.
        </p>
        <div className="flex gap-[6px]">
          {(Object.keys(ROLL_LABELS) as (keyof typeof ROLL_LABELS)[]).map((currency) => (
            <GameButton key={currency} disabled={busy} onClick={() => onBuy(currency)}>
              {ROLL_LABELS[currency]}
            </GameButton>
          ))}
        </div>
        <GameButton disabled={busy} onClick={onGiveUp}>
          Give Up
        </GameButton>
      </div>
    </Dialog>
  )
}

export function ExchangeDialog({
  view,
  busy,
  onExchange,
  onClose,
}: {
  view: ShichibukaiView
  busy: boolean
  onExchange: (id: number) => void
  onClose: () => void
}) {
  return (
    <Dialog title="Exchange" onClose={onClose} className="game-window-bare w-[560px]">
      <div className="game-panel-1 flex flex-col gap-[8px] p-[8px] font-game text-[12px] text-black">
        <p className="self-end font-bold">Points {view.points.toLocaleString('en-US')}</p>
        <ul className="grid grid-cols-4 gap-[8px]">
          {view.exchange.map((entry) => {
            const name = itemLabel(entry.itemId)
            const affordable = view.points >= entry.points
            return (
              <li
                key={entry.id}
                className="flex flex-col items-center gap-[4px] rounded bg-white/50 p-[6px]"
              >
                <span className="text-center font-bold">{name}</span>
                <ItemIcon itemId={entry.itemId} name={name} />
                <span>{entry.points.toLocaleString('en-US')} pts</span>
                <GameButton
                  small
                  aria-label={`Exchange ${name}`}
                  disabled={busy || !affordable}
                  onClick={() => onExchange(entry.id)}
                >
                  {affordable ? 'Exchange' : 'Locked'}
                </GameButton>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
