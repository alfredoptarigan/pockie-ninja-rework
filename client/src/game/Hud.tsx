// HUD pieces drawn 1:1 and anchored to the window edges, as the original client (AlignType) and
// Pockie Ninja Reborn do (docs/ui-layout-reborn.md): top strip with currencies and Settings,
// player card top left (UI_RoleIcon), scene plaque top right (UI_SmallMap), EXP strip and menu
// buttons bottom right (UI_BottomMenu).
import type { Character } from '@pockie/shared'
import { createContext, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useLogout } from '../lib/auth'
import { ArenaButton } from './arena'
import { useOutfitPortrait } from './art'
import { GameButton } from './skin'
import { TeamHud } from './teams'
import { plainText } from './text'
import { DEFEATED_REASON, expToNext, sceneNameKey } from './world'

const CURRENCIES = [
  { key: 'stone', label: 'Stone', box: 'game-currency-stone', color: 'text-[#f5f5f5]' },
  { key: 'gold', label: 'Gold', box: 'game-currency-gold', color: 'text-[#ffd700]' },
  { key: 'giftCoupon', label: 'Coupons', box: 'game-currency-coupon', color: 'text-[#f5f5f5]' },
] as const
const SHADOW = '[text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]'

/** The 1:1 HUD layer, for HUD pieces rendered by the scene (its monster cards) through a portal. */
export const HudLayer = createContext<HTMLElement | null>(null)
const number = (value: number) => value.toLocaleString('en-US')

export function TopBar({ character }: { character: Character }) {
  return (
    <div className="game-topbar pointer-events-auto absolute inset-x-0 top-0 h-[30px]">
      <dl aria-label="Currencies" className="absolute top-[2px] left-[4px] flex gap-[6px]">
        {CURRENCIES.map(({ key, label, box, color }) => (
          <div key={key} className={`relative h-6 w-[115px] ${box}`} title={label}>
            <dt className="sr-only">{label}</dt>
            <dd
              className={`absolute top-[4px] left-[26px] w-[80px] text-right font-mono text-xs ${color}`}
            >
              {number(character[key])}
            </dd>
          </div>
        ))}
      </dl>
      <ArenaButton />
      <div className="absolute top-[4px] right-[6px]">
        <SettingsMenu />
      </div>
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
        className="h-[22px] w-[66px] !min-w-0 !px-0"
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

/** One bar of the player card: the original bar art with its fill clipped, percent on top. */
function CardBar({
  label,
  value,
  max,
  kind,
  x,
  y,
  color,
}: {
  label: string
  value: number
  max: number
  kind: 'hp' | 'mp'
  x: number
  y: number
  color: string
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} / ${max}`}
      title={`${label} ${number(value)} / ${number(max)}`}
      className={`game-bar game-bar-${kind} !absolute h-[11px] w-[106px]`}
      style={{ left: x, top: y, '--fill': `${percent}%` } as CSSProperties}
    >
      <span
        className={`absolute inset-0 z-10 text-center text-[8px] leading-[11px] font-bold ${color} [text-shadow:1px_1px_2px_#000,-1px_-1px_2px_#000]`}
      >
        {percent}%
      </span>
    </div>
  )
}

/**
 * The card art has a third groove under HP and MP for the original Energy (VP) bar. Energy is not
 * ported (decisions 1 and 12), so the empty groove is cut out of the card (205x78 HUD pixels).
 */
const NO_VP_GROOVE = "path(evenodd, 'M0 0H205V78H0Z M77 41.5H205V54.5H145V53H77Z')"

const vipDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** VIP membership (decision 14): a text badge next to the level, its end date in the tooltip. */
function VipBadge({ until }: { until: string | null }) {
  const [now] = useState(Date.now)
  if (!until || Date.parse(until) <= now) return null
  return (
    <span
      title={`VIP until ${vipDate(until)}`}
      className={`absolute top-[58px] left-[150px] text-[11px] font-bold text-[#ffd700] ${SHADOW}`}
    >
      VIP
    </span>
  )
}

/** Portrait, name, level, HP/MP bars and pouch icons at the top left (UI_RoleIcon). */
export function PlayerCard({ character }: { character: Character }) {
  const portrait = useOutfitPortrait(character.clothing)
  const pouch = (value: number) => `${number(value)} / ${number(character.pouchMax)}`
  const pouchTip = 'Pouches refill your HP and chakra after every won fight.'
  return (
    <section
      aria-label="Character"
      className="pointer-events-auto absolute top-[31px] left-[6px] h-[82px] w-[220px] font-game"
    >
      <div
        data-testid="role-card"
        className="game-role-card absolute top-0 left-0 h-[78px] w-[205px]"
        style={{ clipPath: NO_VP_GROOVE }}
      />
      <div className="absolute top-0 left-0 size-[82px] overflow-hidden rounded-full">
        {portrait && <img src={portrait} alt="" className="size-full object-cover" />}
      </div>
      <h2
        className={`absolute top-[2px] left-[100px] w-[100px] truncate text-[11px] font-bold text-[#ffd700] ${SHADOW}`}
      >
        {character.name}
      </h2>
      <div className="game-role-letters absolute top-[18px] left-[73px] h-[34px] w-[27px]" />
      <CardBar
        label="HP"
        value={character.hp}
        max={character.maxHp}
        kind="hp"
        x={99}
        y={18}
        color="text-[#ffe4e1]"
      />
      <CardBar
        label="MP"
        value={character.mp}
        max={character.maxMp}
        kind="mp"
        x={95}
        y={30}
        color="text-[#e0e0ff]"
      />
      <img
        src="/assets/game/ui/refill-hp.webp"
        alt=""
        title={`HP pouch ${pouch(character.hpPouch)}. ${pouchTip}`}
        className="absolute top-[18px] left-[204px] h-[12px] w-[16px]"
      />
      <img
        src="/assets/game/ui/refill-mp.webp"
        alt=""
        title={`MP pouch ${pouch(character.mpPouch)}. ${pouchTip}`}
        className="absolute top-[30px] left-[200px] h-[12px] w-[16px]"
      />
      <dl aria-label="Pouches" className="sr-only">
        <dt>HP pouch</dt>
        <dd>{pouch(character.hpPouch)}</dd>
        <dt>MP pouch</dt>
        <dd>{pouch(character.mpPouch)}</dd>
      </dl>
      <span
        className={`absolute top-[58px] left-[106px] text-[11px] font-bold text-white ${SHADOW}`}
      >
        Lv. {character.level}
      </span>
      <VipBadge until={character.vipUntil} />
      <TeamHud character={character} />
    </section>
  )
}

/** Scene name plaque with the Village/Leave and World Map buttons, top right (UI_SmallMap). */
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
      className="game-map-plaque pointer-events-auto absolute top-[30px] right-[6px] h-[54px] w-[139px] font-game"
    >
      <h2 className="absolute top-[8px] left-[8px] w-[125px] truncate text-center font-mono text-xs leading-[14px] text-black">
        {name}
      </h2>
      <GameButton
        small
        className="absolute top-[31px] left-[6px] h-5 w-[46px] !min-h-0 !min-w-0 !px-0"
        disabled={defeated}
        title={defeated ? DEFEATED_REASON : undefined}
        onClick={onVillage}
      >
        {inVillage ? 'Leave' : 'Village'}
      </GameButton>
      <GameButton
        small
        className="absolute top-[31px] left-[63px] h-5 w-[70px] !min-h-0 !min-w-0 !px-0"
        onClick={onWorldMap}
      >
        World Map
      </GameButton>
    </section>
  )
}

/** Level and EXP bar left of the menu buttons, bottom right (UI_BottomMenu BSD). */
export function ExpStrip({ character }: { character: Character }) {
  const next = expToNext(character.level)
  const percent = next ? Math.min(100, Math.round((character.exp / next) * 100)) : 100
  return (
    <section
      aria-label="Experience"
      className={`game-topbar pointer-events-auto absolute right-[472px] bottom-px h-[33px] w-[234px] font-game text-xs text-[#f5f5f5] ${SHADOW}`}
    >
      <span className="absolute top-[3px] left-[6px] leading-[14px]">Level: {character.level}</span>
      <span className="absolute top-[16px] left-[6px] leading-[14px]">EXP:</span>
      {next === undefined ? (
        <span className="absolute top-[16px] left-[38px] leading-[14px]">max level</span>
      ) : (
        <div
          role="meter"
          aria-label="EXP"
          aria-valuemin={0}
          aria-valuemax={next}
          aria-valuenow={character.exp}
          aria-valuetext={`${character.exp} / ${next}`}
          title={`EXP ${number(character.exp)} / ${number(next)}`}
          className="game-bar game-bar-exp !absolute top-[19px] left-[38px] h-[10px] w-[189px]"
          style={{ '--fill': `${percent}%` } as CSSProperties}
        />
      )}
    </section>
  )
}

export type MenuWindow = 'bag' | 'character' | 'quests' | 'skills'

/** The eight buttons of UI_BottomMenu.as, in its order, with the windows we have. */
const MENU: { piece: string; label: string; window?: MenuWindow }[] = [
  { piece: 'package', label: 'Bag', window: 'bag' },
  { piece: 'role', label: 'Character', window: 'character' },
  { piece: 'skill', label: 'Skills', window: 'skills' },
  { piece: 'task', label: 'Quests', window: 'quests' },
  { piece: 'social', label: 'Friends' },
  { piece: 'rank', label: 'Rankings' },
  { piece: 'mart', label: 'Market' },
  { piece: 'shop', label: 'Shop' },
]

/** Menu buttons, bottom right: Bag, Character, Skills and Quests open windows; the rest are not built. */
export function MenuBar({ onOpen }: { onOpen: (window: MenuWindow) => void }) {
  return (
    <nav
      aria-label="Menu"
      className="game-topbar pointer-events-auto absolute right-[4px] bottom-px flex h-[33px] w-[465px] items-start pt-[3px] pl-[3px]"
    >
      {MENU.map(({ piece, label, window }) => {
        const art = (state: string) => `url(/assets/game/ui/menu-${piece}-${state}.webp)`
        return (
          <button
            key={piece}
            type="button"
            aria-label={window ? label : `${label} (coming soon)`}
            aria-disabled={window ? undefined : true}
            title={window ? label : `${label}: coming soon`}
            onClick={window ? () => onOpen(window) : undefined}
            className={`h-[28px] w-[50px] bg-(image:--up) bg-size-[100%_100%] focus-visible:outline-2 focus-visible:outline-[#ffe27a] ${
              window
                ? 'hover:bg-(image:--over) active:bg-(image:--down)'
                : 'cursor-not-allowed opacity-50'
            }`}
            style={
              {
                '--up': art('up'),
                '--over': art('over'),
                '--down': art('down'),
              } as CSSProperties
            }
          />
        )
      })}
    </nav>
  )
}
