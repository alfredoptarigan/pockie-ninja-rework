// Dev-only page (/play/outfit-showcase): every outfit's item icon, HUD portrait, inventory pose
// and motion sheets side by side, and a short battle replay per outfit, for manual art QA. Images
// that fail to load (missing file, or the dev server answering with HTML) are listed at the top.
import type { Character } from '@pockie/shared'
import { useEffect, useMemo, useState } from 'react'
import { gameMotions, type MotionSheet } from '../../generated/game-assets'
import { useInventory } from '../api'
import { isWorn } from '../inventory/EquipmentSlots'
import { outfitIcon } from '../inventory/outfits'
import { frameAt, tickMs } from '../phaser/motion'
import { GameButton } from '../skin'
import { BattleReplayMount } from '../stage'
import { outfitName } from '../text'
import { outfitReplay, showcaseOutfits, type ShowcaseOutfit } from './showcase'

const TICK_MS = tickMs(gameMotions.fps.battle)
const STAND = '999'
type Picture = 'icon' | 'portrait' | 'pose'

/** One clock for every animated sheet on the page. */
function useTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])
  return tick
}

function Sheet({ sheet, tick, label }: { sheet: MotionSheet; tick: number; label: string }) {
  const cell = frameAt(sheet.durations, tick, true)
  const rows = Math.ceil(sheet.frames / sheet.columns)
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="shrink-0 bg-no-repeat"
      style={{
        width: sheet.frameWidth,
        height: sheet.frameHeight,
        backgroundImage: `url(${sheet.file})`,
        backgroundSize: `${sheet.frameWidth * sheet.columns}px ${sheet.frameHeight * rows}px`,
        backgroundPosition: `-${(cell % sheet.columns) * sheet.frameWidth}px -${Math.floor(cell / sheet.columns) * sheet.frameHeight}px`,
      }}
    />
  )
}

function Shot({
  src,
  label,
  className,
  onBroken,
}: {
  src: string | undefined
  label: string
  className: string
  onBroken: () => void
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      {src ? (
        <img src={src} alt={label} loading="lazy" onError={onBroken} className={className} />
      ) : (
        <span className={`grid place-items-center bg-black/40 text-xs ${className}`}>None</span>
      )}
      <figcaption className="text-xs opacity-70">{label}</figcaption>
    </figure>
  )
}

function OutfitCard({
  outfit,
  tick,
  broken,
  onBroken,
  onPlay,
}: {
  outfit: ShowcaseOutfit
  tick: number
  broken: Picture[]
  onBroken: (picture: Picture) => void
  onPlay: () => void
}) {
  const [open, setOpen] = useState(false)
  const art = gameMotions.outfits[String(outfit.clothing)]!
  const stand = art.motions[art.actions[STAND] ?? STAND]
  const name = outfitName(outfit.clothing)
  return (
    <li
      className={`rounded border p-3 ${broken.length ? 'border-red-500' : 'border-white/15'} bg-black/30`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm">
          {outfit.clothing}. {name}
        </h2>
        <span className="text-xs opacity-70">
          {outfit.motions.length} motions, {outfit.ultimates.length} ultimates
        </span>
      </div>
      {broken.length > 0 && (
        <p className="text-xs text-red-300">Failed to load: {broken.join(', ')}</p>
      )}
      <div className="mt-2 flex items-end gap-3">
        <Shot
          src={outfitIcon(outfit.clothing)}
          label="Icon"
          className="size-12 object-contain"
          onBroken={() => onBroken('icon')}
        />
        <Shot
          src={art.portrait}
          label="Portrait"
          className="size-16 object-contain"
          onBroken={() => onBroken('portrait')}
        />
        <Shot
          src={`/assets/reborn/poses/${outfit.clothing}.webp`}
          label="Pose"
          className="h-[104px] w-[62px] object-contain"
          onBroken={() => onBroken('pose')}
        />
        {stand && <Sheet sheet={stand} tick={tick} label={`${name} stand`} />}
      </div>
      <div className="mt-2 flex gap-2">
        <GameButton small onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide motions' : 'All motions'}
        </GameButton>
        <GameButton small aria-label={`Play ${name} in battle`} onClick={onPlay}>
          Play in battle
        </GameButton>
      </div>
      {open && (
        <ul className="mt-2 flex flex-wrap items-end gap-3">
          {outfit.motions.map((motion) => (
            <li key={motion} className="flex flex-col items-center">
              <Sheet sheet={art.motions[motion]!} tick={tick} label={`${name} motion ${motion}`} />
              <span className="text-xs opacity-70">
                {motion}
                {gameMotions.actionNames[motion] ? ` ${gameMotions.actionNames[motion]}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface Run {
  key: number
  outfit: ShowcaseOutfit
}

export default function OutfitShowcase({ character }: { character: Character }) {
  const inventory = useInventory()
  const tick = useTick()
  const [query, setQuery] = useState('')
  const [broken, setBroken] = useState<Record<number, Picture[]>>({})
  const [run, setRun] = useState<Run | null>(null)
  const weaponItemId = inventory.data?.find(
    (item) => item.equippedSlot === 'Weapon' && isWorn(item, character.activeSet),
  )?.itemId
  const played = useMemo(() => run && outfitReplay(run.outfit, character), [run, character])
  const shown = showcaseOutfits.filter((outfit) =>
    `${outfit.clothing} ${outfitName(outfit.clothing)}`.toLowerCase().includes(query.toLowerCase()),
  )
  const markBroken = (clothing: number) => (picture: Picture) =>
    setBroken((b) =>
      b[clothing]?.includes(picture) ? b : { ...b, [clothing]: [...(b[clothing] ?? []), picture] },
    )
  const brokenIds = Object.keys(broken).map(Number)

  return (
    <main
      data-game-ui
      className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#3a4044,#0c0e0f)] p-6 font-game text-parchment"
    >
      <h1 className="text-xl">Outfit showcase</h1>
      <p className="mt-1 text-sm">
        {showcaseOutfits.length} outfits: item icon, HUD portrait, inventory pose and stand
        animation. "All motions" plays every sheet; "Play in battle" has the outfit attack a dummy,
        take a hit and cast its ultimates, holding your weapon.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Filter
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Id or name"
          className="rounded bg-black/40 px-2 py-1"
        />
      </label>
      <p role="status" className="mt-2 min-h-5 text-sm text-red-300">
        {brokenIds.length > 0 &&
          `Failed images (scroll to load all): ${brokenIds
            .map((id) => `${id} (${broken[id]!.join(', ')})`)
            .join('; ')}`}
      </p>
      <ul className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        {shown.map((outfit) => (
          <OutfitCard
            key={outfit.clothing}
            outfit={outfit}
            tick={tick}
            broken={broken[outfit.clothing] ?? []}
            onBroken={markBroken(outfit.clothing)}
            onPlay={() => setRun((r) => ({ key: (r?.key ?? 0) + 1, outfit }))}
          />
        ))}
      </ul>
      {run && played && (
        <BattleReplayMount
          key={run.key}
          replay={played.replay}
          clothing={run.outfit.clothing}
          monsterIds={[]}
          defenderLooks={played.defenderLooks}
          sceneId={character.sceneId}
          weaponItemId={weaponItemId}
          onFinished={() => setRun(null)}
        />
      )}
    </main>
  )
}
