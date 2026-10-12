// HUD pieces laid over the scene picture at the original game's positions (1280x720 HUD pixels,
// see GameApp): top strip with currencies and Settings, player card top left, scene plaque top
// right, Level/EXP bottom centre, menu icons bottom right.
import type { Character } from '@pockie/shared'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { gameUi } from '../generated/game-ui'
import { useLogout } from '../lib/auth'
import { useOutfitPortrait } from './art'
import { Bar, GameButton } from './skin'
import { plainText } from './text'
import { DEFEATED_REASON, expToNext, sceneNameKey } from './world'

const CURRENCIES = [
  { key: 'stone', label: 'Stone', box: 'game-currency-stone' },
  { key: 'gold', label: 'Gold', box: 'game-currency-gold' },
  { key: 'giftCoupon', label: 'Coupons', box: 'game-currency-coupon' },
] as const

export function TopBar({ character }: { character: Character }) {
  return (
    <div className="game-topbar pointer-events-auto absolute inset-x-0 top-0 flex h-[28px] items-center justify-between px-1">
      <dl aria-label="Currencies" className="flex gap-1 font-game text-xs">
        {CURRENCIES.map(({ key, label, box }) => (
          <div
            key={key}
            className={`flex h-6 w-[115px] items-center justify-end pr-2 pl-7 ${box}`}
            title={label}
          >
            <dt className="sr-only">{label}</dt>
            <dd className="font-bold text-white [text-shadow:var(--shadow-game-text)]">
              {character[key].toLocaleString('en-US')}
            </dd>
          </div>
        ))}
      </dl>
      <SettingsMenu />
    </div>
  )
}

/** Settings button of the top strip: back to the website and log out. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const logout = useLogout()
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false)
          root.current?.querySelector('button')?.focus()
        }
      }}
    >
      <GameButton
        className="!min-h-6 !min-w-0 !px-3 text-xs"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        Settings
      </GameButton>
      {open && (
        <ul
          id={id}
          aria-label="Settings"
          className="game-hud absolute top-full right-0 z-30 mt-1 flex w-44 !bg-[#1c1f21] flex-col gap-1 p-2 font-game text-xs"
        >
          <li>
            <Link to="/" className="block rounded px-2 py-1 text-trim-soft hover:bg-white/10">
              Back to the website
            </Link>
          </li>
          <li>
            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
              className="w-full rounded px-2 py-1 text-left text-trim-soft hover:bg-white/10"
            >
              Log out
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

/** Portrait, name, level and HP/MP at the top left. */
export function PlayerCard({ character }: { character: Character }) {
  const portrait = useOutfitPortrait(character.clothing)
  return (
    <section
      aria-label="Character"
      className="pointer-events-auto absolute top-[30px] left-1 flex items-start gap-1 font-game"
    >
      <div className="relative">
        <div className="grid size-[74px] place-items-center overflow-hidden rounded-full border-2 border-[#d9b75a] bg-[radial-gradient(circle,#4a4e51,#141617)] shadow-[0_2px_4px_rgb(0_0_0/0.6)]">
          {portrait && <img src={portrait} alt="" className="size-full object-cover" />}
        </div>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-[#6b6f72] bg-[#1c1f21] px-2 text-[11px] font-bold whitespace-nowrap text-white">
          Lv. {character.level}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 rounded-tr-[28px] rounded-br-md border border-[#5d6163] bg-[linear-gradient(110deg,rgb(44_47_49/0.92)_0%,rgb(20_22_23/0.92)_60%,rgb(58_61_63/0.92)_100%)] py-1 pr-5 pl-2">
        <h2 className="text-sm font-bold text-trim [text-shadow:var(--shadow-game-text)]">
          {character.name}
        </h2>
        <Bar label="HP" value={character.hp} max={character.maxHp} kind="hp" />
        <Bar label="MP" value={character.mp} max={character.maxMp} kind="mp" />
        <Pouches character={character} />
      </div>
    </section>
  )
}

/** HP and MP pouch amounts: they refill the bars after won fights (RoleUseSystem). */
function Pouches({ character }: { character: Character }) {
  const amount = (value: number) =>
    `${value.toLocaleString('en-US')} / ${character.pouchMax.toLocaleString('en-US')}`
  return (
    <dl
      aria-label="Pouches"
      title="Pouches refill your HP and chakra after every won fight."
      className="grid grid-cols-[auto_1fr] gap-x-1 text-[10px] leading-tight text-white"
    >
      <dt className="text-[#ff7dfa]">HP pouch</dt>
      <dd>{amount(character.hpPouch)}</dd>
      <dt className="text-[#66ccff]">MP pouch</dt>
      <dd>{amount(character.mpPouch)}</dd>
    </dl>
  )
}

/** Scene name plaque with the Village/Leave and World Map buttons, top right. */
export function ScenePlaque({
  sceneId,
  inVillage,
  defeated = false,
  onVillage,
  onWorldMap,
}: {
  sceneId: number | undefined
  inVillage: boolean
  /** A defeated ninja cannot travel: the Village/Leave button waits for the revive. */
  defeated?: boolean
  onVillage: () => void
  onWorldMap: () => void
}) {
  const name =
    sceneId === undefined ? 'Loading...' : plainText(sceneNameKey(sceneId), 'Unknown place')
  return (
    <section
      aria-label="Location"
      className="game-hud pointer-events-auto absolute top-[32px] right-1 flex w-[180px] flex-col gap-1 p-1.5 font-game"
    >
      <h2 className="game-field truncate px-2 text-center text-sm leading-6 font-bold tracking-wide">
        {name}
      </h2>
      <div className="flex gap-1">
        <GameButton
          small
          className="flex-1 whitespace-nowrap"
          disabled={defeated}
          title={defeated ? DEFEATED_REASON : undefined}
          onClick={onVillage}
        >
          {inVillage ? 'Leave' : 'Village'}
        </GameButton>
        <GameButton small className="flex-1 whitespace-nowrap" onClick={onWorldMap}>
          World Map
        </GameButton>
      </div>
    </section>
  )
}

/** Level and EXP bar, bottom centre. */
export function ExpStrip({ character }: { character: Character }) {
  const next = expToNext(character.level)
  return (
    <section
      aria-label="Experience"
      className="game-hud pointer-events-auto absolute bottom-1 left-[488px] flex w-[300px] flex-col px-2 py-0.5 font-game text-[11px] leading-tight"
    >
      <span>Level: {character.level}</span>
      {next === undefined ? (
        <span>EXP {character.exp} (max level)</span>
      ) : (
        <Bar label="EXP" value={character.exp} max={next} kind="exp" />
      )}
    </section>
  )
}

export type MenuWindow = 'bag' | 'character' | 'quests'

const SOON = ['Skills', 'Pets', 'Friends', 'Shop', 'Mail']

/** Menu icons, bottom right: Bag, Character and Quests open windows; the rest are not built. */
export function MenuBar({
  character,
  onOpen,
}: {
  character: Character
  onOpen: (window: MenuWindow) => void
}) {
  const portrait = useOutfitPortrait(character.clothing)
  const icon = (src: string | undefined) =>
    src ? <img src={src} alt="" className="max-h-[26px] max-w-[30px] object-contain" /> : null
  return (
    <nav
      aria-label="Menu"
      className="game-hud pointer-events-auto absolute right-1 bottom-1 flex gap-1 p-1"
    >
      <MenuIcon label="Bag" onClick={() => onOpen('bag')}>
        {icon(gameUi.pieces['icon-bag']?.file)}
      </MenuIcon>
      <MenuIcon label="Character" onClick={() => onOpen('character')}>
        {portrait ? (
          <img src={portrait} alt="" className="size-[26px] rounded object-cover" />
        ) : (
          'Char'
        )}
      </MenuIcon>
      <MenuIcon label="Quests" onClick={() => onOpen('quests')}>
        {icon(gameUi.pieces['icon-quests']?.file)}
      </MenuIcon>
      {SOON.map((label) => (
        <MenuIcon key={label} label={label}>
          {label}
        </MenuIcon>
      ))}
    </nav>
  )
}

function MenuIcon({
  label,
  onClick,
  children,
}: {
  label: string
  /** Missing for features that are not built yet: shown greyed with "Coming soon". */
  onClick?: () => void
  children: ReactNode
}) {
  const tip = onClick ? label : 'Coming soon'
  return (
    <span className="group relative">
      <button
        type="button"
        aria-label={onClick ? label : `${label} (coming soon)`}
        aria-disabled={onClick ? undefined : true}
        onClick={onClick}
        className={`grid h-[30px] w-[40px] place-items-center rounded border border-[#6b6f72] bg-[linear-gradient(180deg,#5a5e61,#26292b)] text-[9px] leading-none font-bold text-white hover:brightness-125 ${
          onClick ? '' : 'cursor-not-allowed opacity-50 grayscale'
        }`}
      >
        {children}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded border border-[#6b6f72] bg-[#1c1f21] px-2 py-0.5 text-[11px] whitespace-nowrap text-white group-hover:block group-has-focus-visible:block"
      >
        {tip}
      </span>
    </span>
  )
}
