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
import { ArenaButton } from './arena'
import { SoundToggle } from './audio'
import { SettingsButton } from './settings'
import { useOutfitPortrait } from './art'
import { TwentyMinuteRewardButton } from './events'
import { useHashiramaOpen } from './hashirama'
import { GameButton } from './skin'
import { MailButton } from './social'
import { TeamHud } from './teams'
import { plainText } from './text'
import { useOpenWindow, type WindowName } from './windows'
import { DEFEATED_REASON, expToNext, sceneNameKey } from './world'
import { lookOf } from './inventory/outfits'

const CURRENCIES = [
  {
    key: 'stone',
    label: 'Stone',
    unit: 'stones',
    box: 'game-currency-stone',
    color: 'text-[#f5f5f5]',
  },
  { key: 'gold', label: 'Gold', unit: 'gold', box: 'game-currency-gold', color: 'text-[#ffd700]' },
  {
    key: 'giftCoupon',
    label: 'Gift Coupons',
    unit: 'gift coupons',
    box: 'game-currency-coupon',
    color: 'text-[#f5f5f5]',
  },
] as const
const SHADOW = '[text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]'

/** The 1:1 HUD layer, for HUD pieces rendered by the scene (its monster cards) through a portal. */
export const HudLayer = createContext<HTMLElement | null>(null)
const number = (value: number) => value.toLocaleString('en-US')
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
/** Reborn's formatShort: en-US grouping under 10,000, else K/M/B/T with one decimal. */
export const shortNumber = (value: number) =>
  value < 10000 ? number(value) : COMPACT.format(value)

const CLOCK_MS = 10_000
const PING_MS = 5_000
/**
 * Server time as HH:MM, refreshed every 10 s. ponytail: Reborn shows the account's server time
 * zone (Europe/Lisbon); our daily and weekly resets run on UTC, so the clock shows UTC.
 */
function ServerClock() {
  const utc = () => new Date().toISOString().slice(11, 16)
  const [time, setTime] = useState(utc)
  useEffect(() => {
    const timer = window.setInterval(() => setTime(utc()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])
  return <span title="Server time (UTC)">{time}</span>
}

/** Round trip of GET /api/health every 5 s (Reborn pings over its socket every 1 s). */
function Ping() {
  const [ms, setMs] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    const measure = async () => {
      const start = performance.now()
      try {
        await fetch('/api/health', { cache: 'no-store' })
        if (live) setMs(Math.round(performance.now() - start))
      } catch {
        // Offline or the server is down: show "--ms" until a ping answers again.
        if (live) setMs(null)
      }
    }
    void measure()
    const timer = window.setInterval(() => void measure(), PING_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])
  return <span title="Updates every 5s">{`${ms ?? '--'}ms`}</span>
}

const TOP_BUTTON = 'h-[22px] w-[66px] !min-w-0 !px-0'

/**
 * Reborn's top bar (docs/audit/reborn-ui-audit.md §3, original theme): currencies on the left;
 * clock, ping, sound, Welcome, Discord, Settings and Website on the right. Arena and Events stay
 * after Settings (Reborn reaches them from village buildings we lack). ponytail: no Patreon or
 * Referal (no purchases or referrals); Discord waits for a community link.
 */
export function TopBar({ character }: { character: Character }) {
  const openFeature = useOpenWindow()
  return (
    <div className="pointer-events-auto absolute top-px left-px h-[33px] w-[calc(100%-7px)] font-game">
      <div aria-hidden="true" className="game-topbar absolute inset-x-0 top-0 h-[24px]" />
      <dl aria-label="Currencies" className="absolute top-[2px] left-[4px] flex gap-[6px]">
        {CURRENCIES.map(({ key, label, unit, box, color }) => (
          <div
            key={key}
            className={`relative h-6 w-[115px] ${box}`}
            title={`${number(character[key])} ${unit}`}
          >
            <dt className="sr-only">{label}</dt>
            <dd
              className={`absolute top-[4px] left-[26px] w-[80px] text-right font-mono text-xs ${color}`}
            >
              {shortNumber(character[key])}
            </dd>
          </div>
        ))}
      </dl>
      <nav
        aria-label="Game menu"
        className={`absolute top-[3px] right-px flex items-center gap-[5px] text-xs text-[#f5f5f5] ${SHADOW}`}
      >
        <ServerClock />
        <Ping />
        <SoundToggle />
        <button
          type="button"
          onClick={() => openFeature('ninjaDiary')}
          className="h-[22px] cursor-pointer rounded-sm border border-[#b4914e] bg-[#493521] px-2 font-[Arial] text-[11px] font-bold text-[#ffe1a0] [text-shadow:none] hover:brightness-125"
        >
          Welcome
        </button>
        <GameButton className={TOP_BUTTON} disabled title="Coming soon">
          Discord
        </GameButton>
        <SettingsButton />
        <ArenaButton />
        <EventsMenu />
        <Link
          to="/"
          className={`game-button inline-flex items-center justify-center text-xs ${TOP_BUTTON}`}
        >
          Website
        </Link>
      </nav>
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
        className={TOP_BUTTON}
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

/** The Reborn events (M5) and M6 extras: rewards, dice, bosses, Team Stone, cards, pet events. */
const EVENTS: { label: string; window: WindowName }[] = [
  { label: 'Ninja Diary', window: 'ninjaDiary' },
  { label: 'Dice of Fate', window: 'diceOfFate' },
  { label: 'Tailed Beast', window: 'tailedBeast' },
  { label: 'Team Stone', window: 'teamStone' },
  { label: 'Card Room', window: 'cardRoom' },
  { label: 'Pet Tracing', window: 'petTracing' },
  { label: 'Pet Shop', window: 'kennelShop' },
]

/** Events button of the top strip, after Arena. */
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

/** One bar of the player card: the original bar art with its fill clipped, `text` on top. */
function CardBar({
  label,
  value,
  max,
  kind,
  x,
  y,
  color,
  text,
}: {
  label: string
  value: number
  max: number
  kind: 'hp' | 'mp' | 'vp'
  x: number
  y: number
  color: string
  /** Defaults to the percentage, as Reborn shows HP and MP. */
  text?: string
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
        {text ?? `${percent}%`}
      </span>
    </div>
  )
}

/** Reborn's energy cap; we have no Energy system yet, so the VP bar stays at 0 of it. */
const VP_MAX = 200
const DAY_MS = 86_400_000

const vipDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** Whole VIP days left (a part day counts), or null without VIP or once it has run out. */
const vipDaysLeft = (until: string | null, now: number) =>
  until && Date.parse(until) > now ? Math.ceil((Date.parse(until) - now) / DAY_MS) : null

/** VIP membership (decision 14): a badge right of the level, the days remaining on hover. */
function VipBadge({ until, days }: { until: string; days: number }) {
  return (
    <span
      title={`VIP: ${days} ${days === 1 ? 'day' : 'days'} remaining (until ${vipDate(until)})`}
      className={`absolute top-[54px] left-[120px] text-[11px] font-bold text-[#ffd700] ${SHADOW}`}
    >
      VIP
    </span>
  )
}

const VIP_NAME = 'text-[#ffd700] [text-shadow:0_0_3px_#b8860b,0_0_2px_#000]'

/**
 * Reborn's portrait card (om, original theme): name, HP/MP in percent, VP cur/200, refill icons,
 * level, VIP badge and the CLAIM 20-minute reward. ponytail: no village icon (its art is not
 * exported) and no Battle Power (the server exposes no power rating for the player).
 */
export function PlayerCard({ character }: { character: Character }) {
  const portrait = useOutfitPortrait(lookOf(character))
  const pouch = (value: number) => `${number(value)} / ${number(character.pouchMax)}`
  const pouchTip = 'Pouches refill your HP and chakra after every won fight.'
  const openWindow = useOpenWindow()
  const [now] = useState(Date.now)
  const vipDays = vipDaysLeft(character.vipUntil, now)
  return (
    <section
      aria-label="Character"
      className="pointer-events-auto absolute top-[31px] left-[6px] h-[82px] w-[220px] font-game"
    >
      <div className="game-role-card absolute top-0 left-0 h-[78px] w-[205px]" />
      <div className="absolute top-0 left-0 size-[82px] overflow-hidden rounded-full">
        {portrait && <img src={portrait} alt="" className="size-full object-cover" />}
      </div>
      <h2
        className={`absolute top-[2px] left-[110px] w-[200px] truncate font-[Arial] text-[11px] font-bold ${vipDays === null ? `text-white ${SHADOW}` : VIP_NAME}`}
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
      <CardBar
        label="VP"
        value={0}
        max={VP_MAX}
        kind="vp"
        x={91}
        y={42}
        color="text-[#fffacd]"
        text={`0/${VP_MAX}`}
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
      {/* Reborn's opens Energy Refill; we have no Energy system yet. */}
      <button
        type="button"
        aria-label="Energy refill"
        title="Energy: not available yet"
        disabled
        className="absolute top-[42px] left-[196px] h-[12px] w-[16px] cursor-not-allowed bg-[url(/assets/game/ui/refill-vp.webp)] bg-contain bg-no-repeat"
      />
      <dl aria-label="Pouches" className="sr-only">
        <dt>HP pouch</dt>
        <dd>{pouch(character.hpPouch)}</dd>
        <dt>MP pouch</dt>
        <dd>{pouch(character.mpPouch)}</dd>
      </dl>
      <span
        className={`absolute top-[58px] left-[82px] font-[Arial] text-[11px] font-bold text-white ${SHADOW}`}
      >
        Lv. {character.level}
      </span>
      {vipDays !== null && <VipBadge until={character.vipUntil!} days={vipDays} />}
      {/*
       * Reborn: fixed at top calc(30% + 2.125vh), left 50% + 167% of its 71px, inside the scaled
       * portrait (its containing block): about (221, 39) on a 720px-high window.
       */}
      <TwentyMinuteRewardButton className="absolute top-[39px] left-[221px]" />
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
 * `level` greys the icon below it ("Required level 30"); the Clan window opens the Clan Browser
 * without a clan; Bankai opens the Bankai window.
 */
const MENU: {
  icon: string
  label: string
  window?: MenuWindow
  feature?: WindowName
  tasks?: true
  level?: number
}[] = [
  { icon: '11-1', label: 'Inventory', window: 'bag' },
  { icon: '11-2', label: 'Character', window: 'character' },
  { icon: '11-3', label: 'Skills', window: 'skills' },
  { icon: 'task', label: 'Tasks', tasks: true },
  { icon: 'ninjahouse', label: 'Ninja House', feature: 'ninjaHouse' },
  { icon: 'social', label: 'Social', feature: 'friends' },
  { icon: 'rank', label: 'Rankings', feature: 'rankings' },
  { icon: 'bankai', label: 'Bankai', feature: 'bankai', level: MENU_GATE_LEVEL },
  { icon: 'clan', label: 'Clan', feature: 'clan', level: MENU_GATE_LEVEL },
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
        {MENU.map(({ icon, label, window, feature, tasks, level = 0 }, index) => {
          const onClick = window
            ? () => onOpen(window)
            : feature && character.level >= level
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
 * the window we have for it; `level` its level gate. ponytail: an entry without a window shows
 * locked, like Reborn shows a locked icon.
 */
const FEATURES: {
  key: string
  label: string
  icon: string
  level?: number
  feature?: WindowName
}[] = [
  {
    key: 'impeldown',
    label: 'Impel\nDown',
    icon: topIcon('impeldown'),
    level: 61,
    feature: 'impelDown',
  },
  {
    key: 'zanpakuto',
    label: 'Zanpakuto',
    icon: topIcon('zanpakuto'),
    level: 61,
    feature: 'zanpakuto',
  },
  { key: 'dungeons', label: 'Dungeons', icon: topIcon('dungeons'), level: 45, feature: 'dungeons' },
  { key: 'mall', label: 'Ninja\nMall', icon: topIcon('mall'), feature: 'mall' },
  {
    key: 'boutique',
    label: 'Konoha\nBoutique',
    icon: topIcon('boutique'),
    feature: 'konohaBoutique',
  },
  { key: 'akatsuki', label: 'Akatsuki', icon: topIcon('akatsuki'), feature: 'akatsuki' },
  // Shown only while a battle is open (FeatureIcons).
  {
    key: 'hashirama',
    label: 'Hashirama\nvs Madara',
    icon: topIcon('hashirama'),
    feature: 'hashirama',
  },
  { key: 'pub', label: 'Tsunade\nPub', icon: topIcon('pub'), feature: 'tsunadePub' },
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
  {
    key: 'shichibukai',
    label: 'Shichibukai',
    icon: topIcon('shichibukai'),
    level: 30,
    feature: 'shichibukai',
  },
  {
    key: 'sannin',
    label: 'Sannin Test',
    icon: topIcon('sannin-test'),
    level: 60,
    feature: 'sanninTest',
  },
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
  const hashiramaOpen = useHashiramaOpen()
  const icons = FEATURES.filter((entry) => entry.key !== 'hashirama' || hashiramaOpen).map(
    (entry) => {
      const low = entry.level !== undefined && character.level < entry.level
      const reason = low
        ? `Required level ${entry.level}`
        : entry.feature
          ? undefined
          : `${entry.label.replace('\n', ' ')}: not available yet`
      return { ...entry, reason, locked: low || !entry.feature }
    },
  )
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
