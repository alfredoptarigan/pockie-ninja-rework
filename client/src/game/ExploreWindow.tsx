// Explore spots (OutSearch): a HUD button with today's searches and the rest countdown, the
// Explore window listing the scene's spots, a confirmation, the battle replay for fight cards and
// the result window. The scene picture opens the same window from the spot's tree.
import type { Character } from '@pockie/shared'
import { useEffect, useId, useState } from 'react'
import { errorMessage, useApplyResult, useExplore, useExploreSpot, useInventory } from './api'
import {
  bagCount,
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
import { ItemIcon } from './ItemIcon'
import { Dialog, GameButton, Notice } from './skin'
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
  status,
  onClose,
}: {
  character: Character
  sceneId: number
  status: ReturnType<typeof useExplore>
  onClose: () => void
}) {
  const explore = useExploreSpot()
  const inventory = useInventory()
  const [confirming, setConfirming] = useState<ExploreSpot | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const applyResult = useApplyResult()
  const finishReplay = () => {
    if (outcome && !outcome.applied) applyResult(outcome.result)
    setOutcome((o) => o && { ...o, replaying: false, applied: true })
  }

  const start = async (spot: ExploreSpot) => {
    setConfirming(null)
    const weaponItemId = inventory.data?.find((item) => item.equippedSlot === 'Weapon')?.itemId
    try {
      const result = await explore.mutateAsync(spot.id)
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

  const data = status.data
  return (
    <>
      <Dialog title="Exploration" onClose={onClose} className="w-[36rem]">
        {status.isPending && <p>Looking around...</p>}
        {status.isError && <Notice tone="error">{errorMessage(status.error)}</Notice>}
        {data && (
          <SpotList
            character={character}
            status={data}
            bag={inventory.data}
            busy={explore.isPending}
            onExplore={setConfirming}
          />
        )}
        {explore.isError && (
          <div className="mt-2">
            <Notice tone="error">{errorMessage(explore.error)}</Notice>
          </div>
        )}
      </Dialog>
      {confirming && data && (
        <Dialog title="Start Exploring?" onClose={() => setConfirming(null)} className="w-[26rem]">
          <p>Explore {spotName(confirming)}?</p>
          <p className="mt-1">
            This uses 1 of your {data.remaining} searches left today
            {costText(confirming) === 'Free' ? '' : ` and ${costText(confirming)}`}. Afterwards you
            rest {restText(data.cooldownSeconds)} before the next search.
          </p>
          <div className="mt-3 flex gap-2">
            <GameButton small onClick={() => void start(confirming)}>
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

function SpotList({
  character,
  status,
  bag,
  busy,
  onExplore,
}: {
  character: Character
  status: ExploreStatus & { spots: ExploreSpot[] }
  bag: InventoryItem[] | undefined
  busy: boolean
  onExplore: (spot: ExploreSpot) => void
}) {
  const now = useNow(status.cooldownEndsAt)
  const left = cooldownLeft(status.cooldownEndsAt, now)
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-bold">Searches left today</dt>
        <dd>
          {status.remaining} / {status.total}
        </dd>
        <dt className="font-bold">Next search</dt>
        <dd>{left > 0 ? `in ${formatCountdown(left)}` : 'Ready'}</dd>
      </dl>
      {busy && <p role="status">Exploring...</p>}
      <ul className="flex flex-col gap-2">
        {status.spots.map((spot) => (
          <li key={spot.id}>
            <SpotRow
              spot={spot}
              bag={bag}
              stone={character.stone}
              block={exploreBlock(spot, status, character, bag, now)}
              secondsLeft={left}
              busy={busy}
              onExplore={() => onExplore(spot)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SpotRow({
  spot,
  bag,
  stone,
  block,
  secondsLeft,
  busy,
  onExplore,
}: {
  spot: ExploreSpot
  bag: InventoryItem[] | undefined
  /** The ninja's Stone, shown next to a Stone cost. */
  stone: number
  block: ReturnType<typeof exploreBlock>
  secondsLeft: number
  busy: boolean
  onExplore: () => void
}) {
  const id = useId()
  const name = spotName(spot)
  return (
    <section
      aria-labelledby={`${id}-name`}
      className="flex items-center gap-3 rounded border border-wood-light bg-white/40 p-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 id={`${id}-name`} className="font-bold">
          {name}
        </h3>
        <Stars star={spot.star} />
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 text-xs">
          <dt className="font-bold">Level</dt>
          <dd>{spot.requireLevel}+</dd>
          <dt className="font-bold">Cost</dt>
          <dd>
            {spot.requireStone === 0 && spot.requireItems.length === 0 && 'Free'}
            {spot.requireStone > 0 && (
              <span className="block">
                {spot.requireStone} Stone (you have {stone})
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
        {block && (
          <p id={`${id}-reason`} className="text-xs text-[#8a1610]">
            {blockMessage(block, spot, secondsLeft)}
          </p>
        )}
      </div>
      <GameButton
        small
        disabled={Boolean(block) || busy}
        aria-label={`Explore ${name}`}
        aria-describedby={block ? `${id}-reason` : undefined}
        onClick={onExplore}
      >
        Explore
      </GameButton>
    </section>
  )
}

const STAR_PATH = 'M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6-4.5-4.2 6.1-.7z'

function Stars({ star }: { star: ExploreStar }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span role="img" aria-label={`${star.level} of ${MAX_STARS} stars`} className="flex">
        {Array.from({ length: MAX_STARS }, (_, i) => (
          <svg key={i} viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path
              d={STAR_PATH}
              fill={i < star.level ? '#f2b705' : 'none'}
              stroke="#7a5c00"
              strokeWidth="1.2"
            />
          </svg>
        ))}
      </span>
      <span>{starText(star)}</span>
    </div>
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
  const gained = rewards.exp > 0 || rewards.stone > 0 || rewards.items.length > 0
  return (
    <Dialog title="Exploration Result" onClose={onClose} className="w-[30rem]">
      <div className="flex flex-col gap-2">
        <p>{outcomeText(result)}</p>
        {fight && !fight.won && <p>You got away with {result.character.hp} HP.</p>}
        {starBonus && (
          <p className="font-bold">
            New star! Bonus:{' '}
            {starBonus.type === 'exp' ? `${starBonus.exp} EXP` : itemName(starBonus.itemId)}.
          </p>
        )}
        <Stars star={result.star} />
        {gained ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {rewards.exp > 0 && (
              <>
                <dt className="font-bold">EXP</dt>
                <dd>+{rewards.exp}</dd>
              </>
            )}
            {rewards.stone > 0 && (
              <>
                <dt className="font-bold">Stone</dt>
                <dd>+{rewards.stone}</dd>
              </>
            )}
            {rewards.items.length > 0 && (
              <>
                <dt className="font-bold">Items</dt>
                <dd>
                  <ul className="flex flex-col gap-1">
                    {rewards.items.map((item, i) => (
                      <li key={`${item.itemId}-${i}`} className="flex items-center gap-2">
                        <ItemIcon
                          itemId={item.itemId}
                          name={itemName(item.itemId)}
                          className="size-8"
                        />
                        {itemName(item.itemId)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p>Nothing gained this time.</p>
        )}
        {rewards.levelsGained > 0 && (
          <p role="status" className="font-bold text-leaf">
            Level up! You are now level {result.character.level}.
          </p>
        )}
        <h3 id={`${id}-others`} className="font-bold">
          The other cards held
        </h3>
        <ul aria-labelledby={`${id}-others`} className="list-inside list-disc text-xs">
          {result.otherCards.map((card, i) => (
            <li key={i}>{cardText(card)}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {onReplay && (
            <GameButton small onClick={onReplay}>
              Replay Battle
            </GameButton>
          )}
          <GameButton small onClick={onBack}>
            Back to Exploration
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
