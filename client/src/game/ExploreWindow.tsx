// Explore spots (OutSearch) laid out like Reborn's Outdoor Exploration: a HUD button with today's
// searches and the rest countdown, the zone window, a confirmation for paid searches, Reborn's card
// pick overlay, the battle replay for fight cards and the result window. The scene picture opens
// the same window from the spot's tree.
import type { Character } from '@pockie/shared'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { errorMessage, useApplyResult, useExplore, useInventory } from './api'
import {
  bagCount,
  useExploreCards,
  usePeekCard,
  seniorBlock,
  peekPriceText,
  type PendingExplore,
  type SeniorExploreSpot,
  type ExploreCardsView,
  blockMessage,
  cardText,
  cooldownLeft,
  costText,
  exploreBlock,
  exploreMonster,
  formatCountdown,
  itemName,
  MAX_STARS,
  outcomeText,
  restText,
  starText,
} from './explore'
import { bigBg } from './bloodlines/panels'
import { BagFullNote, ResultWindow, rewardColumns } from './FightSummary'
import { ItemIcon } from './ItemIcon'
import { Dialog, GameButton, Notice, Tabs } from './skin'
import { BattleReplayMount } from './stage'
import { plainText } from './text'
import type {
  ExploreResult,
  ExploreSpot,
  ExploreStar,
  ExploreStatus,
  InventoryItem,
  SceneView,
} from './types'

const TICK_MS = 1000

/** The clock, ticking every second until `cooldownEndsAt` has passed. */
function useNow(cooldownEndsAt: string | null | undefined) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!cooldownEndsAt) return
    const end = Date.parse(cooldownEndsAt)
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= end) clearInterval(timer)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [cooldownEndsAt])
  return now
}

const spotName = (spot: ExploreSpot) => plainText(spot.nameKey, 'Exploration Zone')

export function ExploreWindow({
  character,
  scene,
  open,
  onOpenChange,
}: {
  character: Character
  scene: SceneView | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const hasSpots = Boolean(scene?.exploreSpots.length)
  const status = useExplore(hasSpots)
  if (!scene || !hasSpots) return null
  return (
    <>
      <ExploreHud status={status.data} onOpen={() => onOpenChange(true)} />
      {open && (
        <ExploreFlow
          character={character}
          sceneId={scene.sceneId}
          zoneName={plainText(scene.nameKey, 'Field')}
          status={status}
          onClose={() => onOpenChange(false)}
        />
      )}
    </>
  )
}

/** Explore button under the HUD strip, left of the scene plaque (1280x720 HUD pixels). */
function ExploreHud({ status, onOpen }: { status?: ExploreStatus; onOpen: () => void }) {
  const now = useNow(status?.cooldownEndsAt)
  const left = status ? cooldownLeft(status.cooldownEndsAt, now) : 0
  return (
    <div className="pointer-events-none absolute top-0 left-0 z-10 h-[720px] w-[1280px] [zoom:var(--hud-scale,1)]">
      <section
        aria-label="Exploration"
        className="game-hud pointer-events-auto absolute top-[32px] right-[188px] flex min-w-[84px] flex-col items-center gap-0.5 p-1.5 font-game text-[11px]"
      >
        <GameButton small className="w-full" onClick={onOpen}>
          Explore
        </GameButton>
        {status && (
          <span className="font-bold text-white [text-shadow:var(--shadow-game-text)]">
            {left > 0
              ? `Rest ${formatCountdown(left)}`
              : `${status.remaining} / ${status.total} today`}
          </span>
        )}
      </section>
    </div>
  )
}

interface Outcome {
  result: ExploreResult
  /** Weapon equipped when the search started; the replay draws it. */
  weaponItemId?: string
  /** Bumped by "Replay Battle" to restart the replay. */
  run: number
  replaying: boolean
  /** The result reached the HUD (searches with a fight wait for the first replay to end). */
  applied: boolean
}

function ExploreFlow({
  character,
  sceneId,
  zoneName,
  status,
  onClose,
}: {
  character: Character
  sceneId: number
  zoneName: string
  status: ReturnType<typeof useExplore>
  onClose: () => void
}) {
  const explore = useExploreCards()
  const peek = usePeekCard()
  const [pending, setPending] = useState<PendingExplore | null>(null)
  const inventory = useInventory()
  const [confirming, setConfirming] = useState<{ spot: ExploreSpot; mode: Mode } | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const applyResult = useApplyResult()
  const finishReplay = () => {
    if (outcome && !outcome.applied) applyResult(outcome.result)
    setOutcome((o) => o && { ...o, replaying: false, applied: true })
  }

  const start = async (spot: ExploreSpot, mode: Mode) => {
    setConfirming(null)
    const weaponItemId = inventory.data?.find((item) => item.equippedSlot === 'Weapon')?.itemId
    try {
      const result = await explore.mutateAsync({ spotId: spot.id, action: 'start', mode })
      if ('searchId' in result) {
        setPending(result)
        return
      }
      const fought = Boolean(result.fight)
      setOutcome({ result, weaponItemId, run: 0, replaying: fought, applied: !fought })
    } catch {
      // Shown from explore.error. The list was stale (another tab, a new day): fetch it again.
      void status.refetch()
    }
  }

  const fight = outcome?.result.fight
  if (outcome?.replaying && fight) {
    const { card } = outcome.result
    return (
      <BattleReplayMount
        key={outcome.run}
        replay={fight.replay}
        clothing={character.clothing}
        monsterIds={card.type === 'fight' ? [exploreMonster(card.monsterId).id] : []}
        sceneId={sceneId}
        weaponItemId={outcome.weaponItemId}
        onFinished={finishReplay}
      />
    )
  }
  if (outcome) {
    return (
      <ExploreResultWindow
        result={outcome.result}
        onReplay={
          fight
            ? () => setOutcome((o) => o && { ...o, run: o.run + 1, replaying: true })
            : undefined
        }
        onBack={() => {
          explore.reset()
          setOutcome(null)
        }}
        onClose={onClose}
      />
    )
  }

  const currentSearch = pending ?? (status.data as ExploreCardsView | undefined)?.pending
  if (currentSearch) {
    const choose = async (cardIndex: number) => {
      const weaponItemId = inventory.data?.find((item) => item.equippedSlot === 'Weapon')?.itemId
      try {
        const result = await explore.mutateAsync({
          spotId: currentSearch.spotId,
          action: 'pick',
          searchId: currentSearch.searchId,
          cardIndex,
        })
        if ('searchId' in result) return
        setPending(null)
        const fought = Boolean(result.fight)
        setOutcome({ result, weaponItemId, run: 0, replaying: fought, applied: !fought })
      } catch {
        void status.refetch()
      }
    }
    const reveal = async (cardIndex: number, currency: 'gold' | 'giftCoupon') => {
      try {
        setPending(
          await peek.mutateAsync({
            spotId: currentSearch.spotId,
            searchId: currentSearch.searchId,
            cardIndex,
            currency,
          }),
        )
      } catch {
        // The mutation's error is shown with the cards.
      }
    }
    return (
      <ExploreCardWindow
        search={currentSearch}
        busy={explore.isPending || peek.isPending}
        error={explore.error ?? peek.error}
        onPick={(index) => void choose(index)}
        onPeek={(index, currency) => void reveal(index, currency)}
        onClose={onClose}
      />
    )
  }

  const data = status.data
  return (
    <>
      <Dialog title="Outdoor Exploration" onClose={onClose} className="game-window-bare w-[650px]">
        {status.isPending && <p className="game-panel-1 p-2 font-game">Looking around...</p>}
        {status.isError && <Notice tone="error">{errorMessage(status.error)}</Notice>}
        {data && (
          <ZoneWindow
            character={character}
            zoneName={zoneName}
            status={data}
            bag={inventory.data}
            busy={explore.isPending}
            error={explore.isError ? errorMessage(explore.error) : null}
            onExplore={(spot, mode) =>
              mode === 'normal' && costText(spot) === 'Free'
                ? void start(spot, mode)
                : setConfirming({ spot, mode })
            }
          />
        )}
      </Dialog>
      {confirming && data && (
        <Dialog title="Start Exploring?" onClose={() => setConfirming(null)} className="w-[26rem]">
          <p>Explore {spotName(confirming.spot)}?</p>
          <p className="mt-1">
            {confirming.mode === 'senior' ? (
              'Uses one exploration key. Does not use today’s searches or start a cooldown. Five cards.'
            ) : (
              <>
                This uses 1 of your {data.remaining} searches left today and{' '}
                {costText(confirming.spot)}. Afterwards you rest {restText(data.cooldownSeconds)}{' '}
                before the next search.
              </>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <GameButton small onClick={() => void start(confirming.spot, confirming.mode)}>
              Explore
            </GameButton>
            <GameButton small onClick={() => setConfirming(null)}>
              Cancel
            </GameButton>
          </div>
        </Dialog>
      )}
    </>
  )
}

type Mode = 'normal' | 'senior'
const HELP_TEXT = 'Explore zones to discover items and fight monsters.'

/**
 * Reborn's Outdoor Exploration (reborn-windows-M-Z-hud.md): a 640x26 header with "<Scene>
 * Exploration Zone" and remaining/max searches, then a 190x308 left panel (the card art, Explore
 * 100x22, the N/10 progress bar 170x18, the help text 170x50) and the right panel (a 430 wide
 * header over a 420x114 box, then the star header over the 420x108 Completion Rate box). Our
 * fields can hold a free zone and a key zone: a tab per zone. Reborn's six "items found" icons
 * are not in our data, so the first box lists the zone's level and cost instead, and the
 * progress bar counts searches to the next star.
 */
function ZoneWindow({
  character,
  zoneName,
  status,
  bag,
  busy,
  error,
  onExplore,
}: {
  character: Character
  zoneName: string
  status: ExploreStatus & { spots: ExploreSpot[] }
  bag: InventoryItem[] | undefined
  busy: boolean
  error: string | null
  onExplore: (spot: ExploreSpot, mode: Mode) => void
}) {
  const now = useNow(status.cooldownEndsAt)
  const left = cooldownLeft(status.cooldownEndsAt, now)
  const panelId = useId()
  const [selected, setSelected] = useState(status.spots[0]?.id ?? '')
  const spot = status.spots.find((s) => s.id === selected) ?? status.spots[0]
  return (
    <div className="flex w-[640px] flex-col gap-[5px] font-game text-[12px] text-black">
      <header className="game-panel-1 flex h-[26px] items-center justify-between px-[5px]">
        <span className="font-bold">{zoneName} Exploration Zone</span>
        <span className="flex gap-2">
          {left > 0 && <span>Rest {formatCountdown(left)}</span>}
          <span>
            {status.remaining}/{status.total}
          </span>
        </span>
      </header>
      {status.spots.length > 1 && (
        <Tabs
          label="Exploration zones"
          panelId={panelId}
          tabs={status.spots.map((s) => ({ id: s.id, title: spotName(s) }))}
          active={spot?.id ?? ''}
          onChange={setSelected}
        />
      )}
      {spot && (
        <ZonePanel
          key={spot.id}
          id={panelId}
          spot={spot}
          character={character}
          bag={bag}
          block={exploreBlock(spot, status, character, bag, now)}
          secondsLeft={left}
          busy={busy}
          seniorDisabled={Boolean(seniorBlock(spot, character, bag))}
          onExplore={(mode) => onExplore(spot, mode)}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

/** Share of the five stars earned, as Reborn's Completion Rate: 20% a star plus the next one's part. */
export const completionRate = (star: ExploreStar) =>
  star.level >= MAX_STARS
    ? 100
    : 20 * star.level + (star.perStar > 0 ? (star.progress / star.perStar) * 20 : 0)

function ZonePanel({
  id,
  spot,
  character,
  bag,
  block,
  secondsLeft,
  busy,
  seniorDisabled,
  onExplore,
}: {
  id: string
  spot: SeniorExploreSpot
  character: Character
  bag: InventoryItem[] | undefined
  block: ReturnType<typeof exploreBlock>
  secondsLeft: number
  busy: boolean
  seniorDisabled: boolean
  onExplore: (mode: Mode) => void
}) {
  const reasonId = useId()
  const name = spotName(spot)
  const { star } = spot
  const maxed = star.level >= MAX_STARS
  const progressText = maxed ? 'Max' : `${star.progress}/${star.perStar}`
  const percent = maxed ? 100 : star.perStar > 0 ? (star.progress / star.perStar) * 100 : 0
  return (
    <section id={id} aria-label={name} className="flex gap-[5px]">
      <div className="game-panel-1 flex min-h-[308px] w-[190px] shrink-0 flex-col items-center gap-[6px] p-[5px]">
        <div
          aria-hidden="true"
          className="h-[188px] w-[136px]"
          style={{ background: 'var(--ui-card-face) center / 100% 100% no-repeat' }}
        />
        <GameButton
          className="h-[22px] w-[100px]"
          disabled={Boolean(block) || busy}
          aria-label={`Explore ${name}`}
          aria-describedby={block ? reasonId : undefined}
          onClick={() => onExplore('normal')}
        >
          Explore
        </GameButton>
        {spot.requireItems.length > 0 && (
          <GameButton
            className="h-[22px] w-[100px]"
            disabled={seniorDisabled || busy}
            aria-label={`Senior Explore ${name}`}
            onClick={() => onExplore('senior')}
          >
            Senior Explore
          </GameButton>
        )}
        <div className="relative h-[18px] w-[170px]">
          <div
            role="meter"
            aria-label="Star progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={progressText}
            className="game-progress size-full"
            style={{ '--fill': `${percent}%` } as CSSProperties}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center text-[11px] font-bold text-white [text-shadow:var(--shadow-game-text)]"
          >
            {progressText}
          </span>
        </div>
        {block ? (
          <p id={reasonId} className="min-h-[50px] w-[170px] text-[11px] text-[#8a1610]">
            {blockMessage(block, spot, secondsLeft)}
          </p>
        ) : (
          <p className="min-h-[50px] w-[170px] text-[11px]">{HELP_TEXT}</p>
        )}
      </div>
      <div className="game-panel-1 flex flex-1 flex-col items-center gap-[5px] p-[5px]">
        <p className="flex h-[20px] w-[430px] items-center px-[5px] font-bold" style={bigBg(3)}>
          What this zone asks of you.
        </p>
        <dl
          className="grid min-h-[114px] w-[420px] grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 p-[8px]"
          style={bigBg(2)}
        >
          <dt className="font-bold">Level</dt>
          <dd>{spot.requireLevel}+</dd>
          {spot.senior && (
            <>
              <dt className="font-bold">Senior level</dt>
              <dd>{spot.senior.level}+</dd>
            </>
          )}
          <dt className="font-bold">Cost</dt>
          <dd>
            {spot.requireStone === 0 && spot.requireItems.length === 0 && 'Free'}
            {spot.requireStone > 0 && (
              <span className="block">
                {spot.requireStone} Stone (you have {character.stone})
              </span>
            )}
            {spot.requireItems.map((need) => (
              <span key={need.itemId} className="flex items-center gap-1">
                <ItemIcon itemId={need.itemId} name={itemName(need.itemId)} className="size-7" />
                {need.count} x {itemName(need.itemId)}
                {bag && ` (you have ${bagCount(bag, need.itemId)})`}
              </span>
            ))}
          </dd>
        </dl>
        <p className="flex h-[32px] w-[430px] items-center px-[5px] font-bold" style={bigBg(3)}>
          Stars indicate your exploration progress in this zone.
        </p>
        <div
          className="flex min-h-[108px] w-[420px] flex-col items-center justify-center gap-2 p-[8px]"
          style={bigBg(2)}
        >
          <p className="flex h-[20px] w-[280px] items-center gap-2 rounded bg-black/70 px-2 text-white">
            <span className="font-[Arial] text-[10px] font-bold">Completion Rate:</span>
            <Stars star={star} />
            <span className="ml-auto text-[11px]">{completionRate(star).toFixed(2)}%</span>
          </p>
          <p className="text-[11px]">{starText(star)}</p>
        </div>
      </div>
    </section>
  )
}

const CARD_TEXT_OUTLINE = '[-webkit-text-stroke:1px_#5a3a00]'

/**
 * Reborn's card pick after a search (reborn-windows-M-Z-hud.md "Outdoor Exploration", `ly`): not a
 * window but an overlay with "Click on a green card to get a free reward!" and "~Or pay for a sneak
 * peek~" over the cards, "Buy Peek" (90x21) under each face-down card while peeks are left, after
 * a confirm "Peek at this card for ...?". Clicking a card takes it: ours pays the card out at once,
 * so there is no separate Claim. The second peek can be paid in Gold or Gift Coupons.
 */
function ExploreCardWindow({
  search,
  busy,
  error,
  onPick,
  onPeek,
  onClose,
}: {
  search: PendingExplore
  busy: boolean
  error: unknown
  onPick: (index: number) => void
  onPeek: (index: number, currency: 'gold' | 'giftCoupon') => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [currency, setCurrency] = useState<'gold' | 'giftCoupon'>('gold')
  const [peeking, setPeeking] = useState<number | null>(null)
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  const cost =
    search.peek.cost && search.peek.count === 1
      ? { ...search.peek.cost, currency }
      : search.peek.cost
  return (
    <dialog
      ref={ref}
      aria-label="Choose an Exploration Card"
      onClose={onClose}
      className="m-auto max-w-none overflow-visible bg-transparent p-0 font-game backdrop:bg-black/60"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p className={`text-[32px] font-black text-[#ffe14d] ${CARD_TEXT_OUTLINE}`}>
          Click on a green card to get a free reward!
        </p>
        <p className={`text-[18px] font-bold text-[#ffe14d] ${CARD_TEXT_OUTLINE}`}>
          ~Or pay for a sneak peek~
        </p>
        <ol className="flex gap-3">
          {search.cards.map((card, index) => (
            <li key={index} className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={busy}
                aria-label={`Pick card ${index + 1}${card ? `: ${cardText(card)}` : ' (face down)'}`}
                onClick={() => onPick(index)}
                className="relative flex h-[150px] w-[108px] flex-col items-center justify-between px-[10px] pt-[30px] pb-[10px] text-[11px] font-bold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[#ffe27a] disabled:cursor-not-allowed"
                style={{ background: 'var(--ui-card-face) center / 100% 100% no-repeat' }}
              >
                <span className="grid size-[64px] place-items-center text-[28px]">
                  {card && 'itemId' in card ? (
                    <ItemIcon itemId={card.itemId} name="" className="size-10" />
                  ) : card ? null : (
                    '?'
                  )}
                </span>
                <span className="w-full truncate">{card ? cardText(card) : ''}</span>
              </button>
              {!card && cost && (
                <GameButton
                  className="h-[21px] w-[90px]"
                  aria-label={`Peek at card ${index + 1}`}
                  disabled={busy}
                  onClick={() => setPeeking(index)}
                >
                  Buy Peek
                </GameButton>
              )}
            </li>
          ))}
        </ol>
        <p className="text-[12px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
          Peeks used {search.peek.count} / {search.peek.limit}.{' '}
          {cost ? `Next peek: ${peekPriceText(cost)}.` : `${peekPriceText(null)}.`}
        </p>
        {Boolean(error) && <Notice tone="error">{errorMessage(error)}</Notice>}
        <GameButton small onClick={onClose}>
          Close
        </GameButton>
      </div>
      {peeking !== null && cost && (
        <Dialog title="Buy Peek" onClose={() => setPeeking(null)} className="w-[260px]">
          <p className="text-center">Peek at this card for {peekPriceText(cost)}?</p>
          {search.peek.count === 1 && (
            <label className="mt-2 block text-center">
              Pay with{' '}
              <select
                aria-label="Peek currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'gold' | 'giftCoupon')}
              >
                <option value="gold">Gold</option>
                <option value="giftCoupon">Gift Coupons</option>
              </select>
            </label>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <GameButton
              className="h-[25px] w-[75px]"
              onClick={() => {
                onPeek(peeking, currency)
                setPeeking(null)
              }}
            >
              Accept
            </GameButton>
            <GameButton className="h-[25px] w-[75px]" onClick={() => setPeeking(null)}>
              Deny
            </GameButton>
          </div>
        </Dialog>
      )}
    </dialog>
  )
}

const STAR_PATH = 'M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6-4.5-4.2 6.1-.7z'

/** Five stars (12x11 in Reborn's Completion Rate bar), the earned ones gold. */
function Stars({ star }: { star: ExploreStar }) {
  return (
    <span role="img" aria-label={`${star.level} of ${MAX_STARS} stars`} className="flex">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-[11px] w-[12px]" aria-hidden="true">
          <path
            d={STAR_PATH}
            fill={i < star.level ? '#f2b705' : 'none'}
            stroke="#f2b705"
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </span>
  )
}

function ExploreResultWindow({
  result,
  onReplay,
  onBack,
  onClose,
}: {
  result: ExploreResult
  onReplay?: () => void
  onBack: () => void
  onClose: () => void
}) {
  const id = useId()
  const { rewards, starBonus, fight } = result
  return (
    <ResultWindow
      title="Exploration Result"
      story={outcomeText(result)}
      note={fight && !fight.won ? `You got away with ${result.character.hp} HP.` : undefined}
      columns={rewardColumns(rewards)}
      findTitle="Found"
      finds={rewards.items}
      emptyFind="Nothing found this time."
      onClose={onClose}
      actions={
        <>
          {onReplay && (
            <GameButton small onClick={onReplay}>
              Replay Battle
            </GameButton>
          )}
          <GameButton small onClick={onBack}>
            Back to Exploration
          </GameButton>
        </>
      }
    >
      {starBonus && (
        <p className="text-center font-bold">
          New star! Bonus:{' '}
          {starBonus.type === 'exp' ? `${starBonus.exp} EXP` : itemName(starBonus.itemId)}.
        </p>
      )}
      <p className="flex items-center justify-center gap-2 text-[11px]">
        <Stars star={result.star} />
        {starText(result.star)}
      </p>
      {rewards.lost ? <BagFullNote lost={rewards.lost} /> : null}
      {rewards.levelsGained > 0 && (
        <p role="status" className="text-center font-bold text-leaf">
          Level up! You are now level {result.character.level}.
        </p>
      )}
      <h3 id={`${id}-others`} className="font-bold">
        The other cards held
      </h3>
      <ul aria-labelledby={`${id}-others`} className="list-inside list-disc text-[11px]">
        {result.otherCards.map((card, i) => (
          <li key={i}>{cardText(card)}</li>
        ))}
      </ul>
    </ResultWindow>
  )
}
