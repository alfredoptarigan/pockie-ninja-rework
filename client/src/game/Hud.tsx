// HUD pieces drawn 1:1 and anchored to the window edges, as the original client (AlignType) and
// Pockie Ninja Reborn do (docs/ui-layout-reborn.md): top strip with currencies and Settings,
// player card top left (UI_RoleIcon), scene plaque top right (UI_SmallMap), EXP strip and menu
// buttons bottom right (UI_BottomMenu).
import type { Character } from '@pockie/shared'
import {
  createContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link } from 'react-router'
import { useLogout } from '../lib/auth'
import { ArenaButton } from './arena'
import { SoundSettings } from './audio'
import { useOutfitPortrait } from './art'
import { TwentyMinuteRewardButton } from './events'
import { GameButton } from './skin'
import { MailButton } from './social'
import { TeamHud } from './teams'
import { plainText } from './text'
import { useOpenWindow, type WindowName } from './windows'
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
      <div className="absolute top-[4px] right-[150px]">
        <EventsMenu />
      </div>
      <div className="absolute top-[4px] right-[6px]">
        <SettingsMenu />
      </div>
      {/* Right of the player card. */}
      <TwentyMinuteRewardButton className="absolute top-[36px] left-[230px]" />
    </div>
  )
}

/** A top-strip button with a drop-down list; `children` gets `close` for its items. */
function HudMenu({
  label,
  children,
}: {
  label: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
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
        {label}
      </GameButton>
      {open && (
        <ul
          id={id}
          aria-label={label}
          className="game-hud absolute top-full right-0 z-30 mt-1 flex w-44 !bg-[#1c1f21] flex-col gap-1 p-2 font-game text-xs"
        >
          {children(() => setOpen(false))}
        </ul>
      )}
    </div>
  )
}

const MENU_ITEM = 'w-full rounded px-2 py-1 text-left text-trim-soft hover:bg-white/10'

/** Settings button of the top strip: sound, back to the website and log out. */
export function SettingsMenu() {
  const logout = useLogout()
  return (
    <HudMenu label="Settings">
      {() => (
        <>
          <li className="px-2 py-1 text-trim-soft">
            <SoundSettings />
          </li>
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
              className={MENU_ITEM}
            >
              Log out
            </button>
          </li>
        </>
      )}
    </HudMenu>
  )
}

/** The Reborn events (M5) and M6 extras: rewards, dice, bosses, Team Stone, cards, pet events. */
const EVENTS: { label: string; window: WindowName }[] = [
  { label: 'Ninja Diary', window: 'ninjaDiary' },
  { label: 'Dice of Fate', window: 'diceOfFate' },
  { label: 'Tailed Beast', window: 'tailedBeast' },
  { label: 'Team Stone', window: 'teamStone' },
  { label: 'Card Room', window: 'cardRoom' },
  { label: 'Pet Tracing', window: 'petTracing' },
  { label: 'Kennel Shop', window: 'kennelShop' },
]

/** Events button of the top strip, left of Arena. */
export function EventsMenu() {
  const openFeature = useOpenWindow()
  return (
    <HudMenu label="Events">
      {(close) =>
        EVENTS.map(({ label, window }) => (
          <li key={window}>
            <button
              type="button"
              onClick={() => {
                close()
                openFeature(window)
              }}
              className={MENU_ITEM}
            >
              {label}
            </button>
          </li>
        ))
      }
    </HudMenu>
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
  const openWindow = useOpenWindow()
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
      {/* Reborn: both refill icons open the Carrier Bag window. */}
      <button
        type="button"
        aria-label={`HP carrier bag ${pouch(character.hpPouch)}`}
        title={`HP pouch ${pouch(character.hpPouch)}. ${pouchTip}`}
        onClick={() => openWindow('carrierBag')}
        className="absolute top-[18px] left-[204px] h-[12px] w-[16px] cursor-pointer bg-[url(/assets/game/ui/refill-hp.webp)] bg-contain bg-no-repeat"
      />
      <button
        type="button"
        aria-label={`MP carrier bag ${pouch(character.mpPouch)}`}
        title={`MP pouch ${pouch(character.mpPouch)}. ${pouchTip}`}
        onClick={() => openWindow('carrierBag')}
        className="absolute top-[30px] left-[200px] h-[12px] w-[16px] cursor-pointer bg-[url(/assets/game/ui/refill-mp.webp)] bg-contain bg-no-repeat"
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
  const openFeature = useOpenWindow()
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
      <div className="absolute top-[14px] -left-[30px]">
        <MailButton onOpen={() => openFeature('mail')} />
      </div>
    </section>
  )
}

export type MenuWindow = 'bag' | 'character' | 'skills'

const bottomIcon = (name: string) => `/assets/reborn/features/bottom-menu/${name}.webp`
/** The bar's backing (features/bottom-menu/2.png, 9-slice [8,20]). */
const BAR_BACKING = {
  borderStyle: 'solid',
  borderImage: `url(${bottomIcon('2')}) 8 20 fill / 8px 20px`,
} as const
/** Bankai and Clan open at level 30 in Reborn. */
const MENU_GATE_LEVEL = 30

/**
 * Reborn's bottom bar (docs/audit/reborn-ui-audit.md §3, original theme): `window` is a GameApp
 * window, `feature` a registered window (windows.tsx), `tasks` toggles Quest Navigation.
 * ponytail: Bankai and Clan are systems we do not have yet, so they stay disabled.
 */
const MENU: {
  icon: string
  label: string
  window?: MenuWindow
  feature?: WindowName
  tasks?: true
}[] = [
  { icon: '11-1', label: 'Inventory', window: 'bag' },
  { icon: '11-2', label: 'Character', window: 'character' },
  { icon: '11-3', label: 'Skills', window: 'skills' },
  { icon: 'task', label: 'Tasks', tasks: true },
  { icon: 'ninjahouse', label: 'Ninja House', feature: 'bloodlines' },
  { icon: 'social', label: 'Social', feature: 'friends' },
  { icon: 'rank', label: 'Rankings', feature: 'rankings' },
  { icon: 'bankai', label: 'Bankai' },
  { icon: 'clan', label: 'Clan' },
]

/**
 * Bottom right, 706x33: the EXP strip ("Level: N", "EXP:" and a 195px bar, MAX at the cap) and
 * the nine 50x28 icons, 50px apart from x 241 (hover brighter, press darker, disabled grey).
 */
export function MenuBar({
  character,
  onOpen,
  onTasks,
}: {
  character: Character
  onOpen: (window: MenuWindow) => void
  onTasks: () => void
}) {
  const openFeature = useOpenWindow()
  const next = expToNext(character.level)
  const percent = next ? Math.min(100, Math.floor((character.exp / next) * 100)) : 100
  return (
    <div className="pointer-events-auto absolute -right-px bottom-px h-[33px] w-[706px] font-game">
      <section
        aria-label="Experience"
        className={`absolute top-0 left-0 h-[27px] w-[228px] text-xs text-[#f5f5f5] ${SHADOW}`}
      >
        <div aria-hidden="true" className="absolute inset-0" style={BAR_BACKING} />
        <span className="absolute top-[4px] left-[4px] leading-[12px]">
          Level: {character.level}
        </span>
        <span className="absolute top-[16px] left-[4px] leading-[12px]">EXP:</span>
        {next === undefined ? (
          <span className="absolute -top-[4px] right-0 w-[228px] text-right text-[22px] font-black text-[darkgreen] italic">
            MAX
          </span>
        ) : (
          <progress
            aria-label="EXP"
            max={100}
            value={percent}
            title={`${character.exp} / ${next}`}
            className="pointer-events-none absolute top-[17px] left-[30px] h-[9px] w-[195px] accent-[green]"
          />
        )}
      </section>
      <div
        aria-hidden="true"
        className="absolute top-0 left-[238px] h-[27px] w-[459px]"
        style={BAR_BACKING}
      />
      <nav aria-label="Menu">
        {MENU.map(({ icon, label, window, feature, tasks }, index) => {
          const onClick = window
            ? () => onOpen(window)
            : feature
              ? () => openFeature(feature)
              : tasks
                ? onTasks
                : undefined
          const reason = onClick
            ? label
            : character.level < MENU_GATE_LEVEL
              ? `Required level ${MENU_GATE_LEVEL}`
              : `${label}: not available yet`
          return (
            <button
              key={icon}
              type="button"
              aria-label={label}
              title={reason}
              disabled={!onClick}
              onClick={onClick}
              className="absolute top-[3px] h-[28px] w-[50px] bg-size-[100%_100%] hover:brightness-[1.4] focus-visible:outline-2 focus-visible:outline-[#ffe27a] active:brightness-[.7] disabled:cursor-not-allowed disabled:grayscale disabled:hover:brightness-100"
              style={{ left: 241 + 50 * index, backgroundImage: `url(${bottomIcon(icon)})` }}
            />
          )
        })}
      </nav>
    </div>
  )
}

const topIcon = (name: string) => `/assets/reborn/ui/buttons/topui/${name}.webp`
/**
 * Reborn's village feature icons (docs/audit/reborn-ui-audit.md §3), in its order. `feature` is
 * the window we have for it; `level` its level gate. ponytail: the rest are systems we have not
 * built (Impel Down, Dungeons...), shown locked like Reborn shows a locked icon.
 */
const FEATURES: {
  key: string
  label: string
  icon: string
  level?: number
  feature?: WindowName
}[] = [
  { key: 'impeldown', label: 'Impel\nDown', icon: topIcon('impeldown'), level: 61 },
  { key: 'zanpakuto', label: 'Zanpakuto', icon: topIcon('zanpakuto'), level: 61 },
  { key: 'dungeons', label: 'Dungeons', icon: topIcon('dungeons'), level: 45 },
  { key: 'mall', label: 'Ninja\nMall', icon: topIcon('mall') },
  { key: 'boutique', label: 'Konoha\nBoutique', icon: topIcon('boutique') },
  { key: 'akatsuki', label: 'Akatsuki', icon: topIcon('akatsuki') },
  { key: 'pub', label: 'Tsunade\nPub', icon: topIcon('pub') },
  {
    key: 'ninjaDiary',
    label: 'Ninja\nDiary',
    icon: '/assets/reborn/dailylogin/NinjaDiary.webp',
    feature: 'ninjaDiary',
  },
  {
    key: 'tailedBeast',
    label: 'Tailed\nBeast',
    icon: topIcon('tb'),
    level: 25,
    feature: 'tailedBeast',
  },
  { key: 'shichibukai', label: 'Shichibukai', icon: topIcon('shichibukai'), level: 30 },
  { key: 'sannin', label: 'Sannin Test', icon: topIcon('sannin-test'), level: 60 },
]
const ICON_STEP = 58
const ICON_RIGHT = 160

/** One 50x50 round feature icon with its gold label; locked ones are grey and do nothing. */
function FeatureIcon({
  label,
  icon,
  reason,
  onClick,
  style,
}: {
  label: string
  icon: string
  reason?: string
  onClick?: () => void
  style: CSSProperties
}) {
  const name = label.replace('\n', ' ')
  return (
    <button
      type="button"
      aria-label={name}
      title={reason ?? name}
      disabled={!onClick}
      onClick={onClick}
      className="pointer-events-auto absolute size-[50px] bg-contain bg-center bg-no-repeat hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
      style={{ ...style, backgroundImage: `url(${icon})` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-[-8px] -bottom-[5px] bg-linear-to-b from-[#fffacd] via-[#ffd700] to-[#ffa500] bg-clip-text text-center text-[10px] leading-[10px] font-black whitespace-pre-line text-transparent [filter:drop-shadow(0_0_1px_#000)_drop-shadow(0_0_1px_#000)]"
      >
        {label}
      </span>
    </button>
  )
}

/** The village icon rows, top right: features (locked first) at y 35, Market and Home at y 90. */
export function FeatureIcons({ character }: { character: Character }) {
  const openFeature = useOpenWindow()
  const icons = FEATURES.map((entry) => {
    const low = entry.level !== undefined && character.level < entry.level
    const reason = low
      ? `Required level ${entry.level}`
      : entry.feature
        ? undefined
        : `${entry.label.replace('\n', ' ')}: not available yet`
    return { ...entry, reason, locked: low || !entry.feature }
  })
  // Reborn stable-sorts locked icons to the left.
  const ordered = [...icons.filter((icon) => icon.locked), ...icons.filter((icon) => !icon.locked)]
  return (
    <nav aria-label="Features" className="pointer-events-none absolute inset-0">
      {ordered.map((icon, index) => (
        <FeatureIcon
          key={icon.key}
          label={icon.label}
          icon={icon.icon}
          reason={icon.reason}
          onClick={icon.locked ? undefined : () => openFeature(icon.feature!)}
          style={{ top: 35, right: ICON_RIGHT + ICON_STEP * (ordered.length - 1 - index) }}
        />
      ))}
      <FeatureIcon
        label="Market"
        icon={topIcon('market')}
        onClick={() => openFeature('market')}
        style={{ top: 90, right: 70 }}
      />
      <FeatureIcon
        label="Home"
        icon={topIcon('home')}
        reason="Home: not available yet"
        style={{ top: 90, right: 10 }}
      />
    </nav>
  )
}
