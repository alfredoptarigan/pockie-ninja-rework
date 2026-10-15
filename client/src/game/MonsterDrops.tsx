// The field monsters: Reborn's monster cards row (Ry/Ny), its hover tooltip, right-click menu
// and Monster Information window, plus the Drops disclosure (GET /scene `drops`, no chances)
// that the window and SceneView's keyboard list share.
import { useCallback, useId, useRef, useState } from 'react'
import { ItemMenu, menuAt, type MenuEntry } from './ItemMenu'
import { useMonsterPortrait } from './art'
import { ChainAttackDialog, showChainProgress, useChainAttack } from './hunt'
import { ItemList } from './Rewards'
import { Dialog, GameButton } from './skin'
import { plainText } from './text'
import type { SceneMonster } from './types'

export function DropsMenu({
  monster,
  defaultOpen = false,
}: {
  monster: SceneMonster
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const name = plainText(monster.nameKey, 'Monster')
  const drops = monster.drops ?? []
  return (
    <div
      className="contents"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        button.current?.focus()
      }}
    >
      <GameButton
        ref={button}
        small
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Drops: ${name}`}
        onClick={() => setOpen(!open)}
      >
        Drops
      </GameButton>
      {/* Long lists scroll inside the stage instead of running off its bottom. */}
      <div
        id={id}
        hidden={!open}
        role="region"
        tabIndex={open ? 0 : -1}
        aria-label={`Drops of ${name}`}
        className="game-card max-h-56 w-full min-w-48 overflow-y-auto p-1.5 text-ink-game"
      >
        {drops.length === 0 ? (
          <p>{name} drops nothing.</p>
        ) : (
          <ItemList items={drops} label={`${name} drops`} />
        )}
      </div>
    </div>
  )
}

/** Reborn's card row: 67x86 cards on a 70px pitch, the row centred under the top bar. */
const CARD_PITCH = 70
const SHADOW = '[text-shadow:2px_2px_4px_#000,-2px_-2px_4px_#000]'
const DESCRIPTION = 'A mysterious creature.'

/** Why a task boss cannot be fought yet (decision 8 keeps the never-attackable ones locked). */
export const lockReason = (monster: SceneMonster) =>
  monster.lock === 'quest'
    ? 'You need the quest for this boss before you fight it.'
    : monster.lock === 'never'
      ? 'This boss cannot be challenged.'
      : undefined

/**
 * The area's monsters as Reborn's monster cards at the top centre of the HUD. Hover shows the
 * tooltip, a click opens Monster Information, a right click the Fight / Chain Attack / Drops
 * menu. The cards are a pointer twin of SceneView's "Scene actions" list (keyboard access).
 * ponytail: no Quest pill or daily marker; quest steps do not say which monster they target.
 */
export function MonsterRow({
  monsters,
  onFight,
}: {
  monsters: SceneMonster[]
  onFight: (monster: SceneMonster) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ monster: SceneMonster; at: { x: number; y: number } }>()
  const [info, setInfo] = useState<{ monster: SceneMonster; drops: boolean }>()
  const [chainOf, setChainOf] = useState<SceneMonster>()
  const running = Boolean(useChainAttack().data?.chain)
  // Reborn: with a chain running, Chain Attack shows its progress instead.
  const chainAttack = (monster: SceneMonster) =>
    running ? showChainProgress(true) : setChainOf(monster)
  const closeMenu = useCallback(() => setMenu(undefined), [])
  const portraitOf = useMonsterPortrait()
  const shown = monsters.flatMap((monster) => {
    const portrait = portraitOf(monster.id)
    return portrait ? [{ monster, portrait }] : []
  })
  if (shown.length === 0) return null

  const menuEntries = (monster: SceneMonster): MenuEntry[] => [
    {
      label: 'Fight',
      disabled: Boolean(monster.lock),
      reason: lockReason(monster),
      onSelect: () => onFight(monster),
    },
    {
      label: 'Chain Attack',
      disabled: Boolean(monster.lock),
      reason: lockReason(monster),
      onSelect: () => chainAttack(monster),
    },
    { label: 'Drops', onSelect: () => setInfo({ monster, drops: true }) },
  ]

  return (
    <div
      data-menu-root
      className="pointer-events-auto absolute top-[30px] h-[92px] font-game"
      style={{
        width: 3 + CARD_PITCH * shown.length,
        left: `calc(50% - ${(CARD_PITCH / 2) * shown.length}px)`,
      }}
    >
      <div aria-hidden="true">
        {shown.map(({ monster, portrait }, i) => (
          <button
            key={monster.id}
            type="button"
            tabIndex={-1}
            data-testid="monster-card"
            onClick={() => {
              setHovered(null)
              setInfo({ monster, drops: false })
            }}
            onContextMenu={(event) => {
              setHovered(null)
              setMenu({ monster, at: menuAt(event) })
            }}
            onMouseEnter={() => setHovered(monster.id)}
            onMouseLeave={() => setHovered(null)}
            className={`game-monster-card absolute top-0 h-[86px] w-[67px] cursor-pointer hover:brightness-110 ${monster.lock ? 'grayscale' : ''}`}
            style={{ left: 2 + CARD_PITCH * i }}
          >
            <MonsterFace monster={monster} portrait={portrait} />
          </button>
        ))}
        {shown.map(
          ({ monster }, i) =>
            hovered === monster.id &&
            !menu && (
              <MonsterTooltip key={monster.id} monster={monster} left={2 + CARD_PITCH * (i + 1)} />
            ),
        )}
      </div>
      {menu && (
        <ItemMenu
          title={plainText(menu.monster.nameKey, 'Monster')}
          at={menu.at}
          entries={menuEntries(menu.monster)}
          onClose={closeMenu}
        />
      )}
      {info && (
        <MonsterInfo
          key={info.monster.id}
          monster={info.monster}
          portrait={portraitOf(info.monster.id)}
          dropsOpen={info.drops}
          onFight={() => {
            setInfo(undefined)
            onFight(info.monster)
          }}
          onChainAttack={() => {
            setInfo(undefined)
            chainAttack(info.monster)
          }}
          onClose={() => setInfo(undefined)}
        />
      )}
      {chainOf && <ChainAttackDialog monster={chainOf} onClose={() => setChainOf(undefined)} />}
    </div>
  )
}

/** A card's face: the 50px portrait with its bottom shade, the gold level and the name. */
function MonsterFace({ monster, portrait }: { monster: SceneMonster; portrait: string }) {
  return (
    <>
      <span className="absolute top-[4px] left-[8px] size-[51px]">
        <img src={portrait} alt="" className="size-[50px] object-contain" />
        <span className="absolute inset-x-0 bottom-0 h-4 bg-linear-to-t from-black/70 to-transparent" />
      </span>
      <span
        className={`absolute top-[45px] left-[8px] h-[18px] w-[55px] text-left font-mono text-xs leading-[18px] text-[#ffd700] ${SHADOW}`}
      >
        Lv.{monster.level}
      </span>
      <span className="absolute top-[66px] left-[4px] h-[18px] w-[62px] truncate text-center font-mono text-xs leading-[18px] font-bold text-[#f5f5f5]">
        {plainText(monster.nameKey, 'Monster')}
      </span>
    </>
  )
}

/** Reborn's `.monster-tooltip` (170 wide), beside the hovered card; it does not take the pointer. */
function MonsterTooltip({ monster, left }: { monster: SceneMonster; left: number }) {
  const reason = lockReason(monster)
  return (
    <div
      data-testid="monster-tooltip"
      className="pointer-events-none absolute top-0 z-30 w-[170px] p-[6px] font-game"
      style={{
        left,
        borderStyle: 'solid',
        borderImage: 'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
      }}
    >
      <p className="text-[11px] font-bold text-[#ffd700]">Lv.{monster.level}</p>
      <p className="text-xs font-bold text-[#c00]">{plainText(monster.nameKey, 'Monster')}</p>
      <p className="text-[11px] text-[#00ced1]">{DESCRIPTION}</p>
      {reason && <p className="mt-1 text-[11px] text-[#ff8a80]">{reason}</p>}
    </div>
  )
}

/**
 * Reborn's Monster Information window (variant A): the 80x102 card (portrait, Lv, name) on the
 * left, name, description and Fight / Chain Attack / Drops on the right. HP and attack are not
 * in the scene payload, so they are not shown.
 */
function MonsterInfo({
  monster,
  portrait,
  dropsOpen,
  onFight,
  onChainAttack,
  onClose,
}: {
  monster: SceneMonster
  portrait?: string
  dropsOpen: boolean
  onFight: () => void
  onChainAttack: () => void
  onClose: () => void
}) {
  const name = plainText(monster.nameKey, 'Monster')
  return (
    <Dialog title="Monster Information" onClose={onClose} className="w-[378px]">
      <div className="game-panel-1 min-h-[124px] w-[338px] p-[6px] font-game text-xs">
        <div className="game-inset flex min-h-[112px] gap-2 p-1">
          <div className="game-monster-card relative h-[102px] w-[80px] shrink-0">
            <span className="absolute top-[6px] left-[8px] size-16">
              {portrait && <img src={portrait} alt="" className="size-[62px] object-contain" />}
              <span className="absolute inset-x-0 bottom-0 h-4 bg-linear-to-t from-black to-transparent" />
            </span>
            <span
              className={`absolute top-[62px] left-[8px] h-[14px] w-16 text-[10px] leading-[14px] font-bold text-[#ffd700] ${SHADOW}`}
            >
              Lv.{monster.level}
            </span>
            <span className="absolute top-[80px] left-[2px] h-[14px] w-[76px] truncate text-center text-[9px] leading-[14px] font-bold text-[whitesmoke]">
              {name}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
            <p className="font-bold">{name}</p>
            <p>{DESCRIPTION}</p>
            <div className="mt-auto flex flex-wrap gap-1">
              <GameButton
                className="h-6 w-[72px]"
                disabled={Boolean(monster.lock)}
                title={lockReason(monster)}
                onClick={onFight}
              >
                Fight
              </GameButton>
              <GameButton
                className="h-6 w-[72px] text-[10px]!"
                disabled={Boolean(monster.lock)}
                title={lockReason(monster)}
                onClick={onChainAttack}
              >
                Chain Attack
              </GameButton>
              <DropsMenu monster={monster} defaultOpen={dropsOpen} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
