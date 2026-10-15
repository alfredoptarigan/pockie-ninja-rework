// Reborn's Inventory title plate (main.js `vc`, @2579589): a BigBG7 plate holding the equipped
// title's art (titles/<id>.gif) under a transparent <select> of the unlocked titles. Picking one
// sends setTitle; hovering lists the title's stats and, for a timed title, the time left.
// The options are the unlocked titles, and every character has unlocked title 0 ("No Title",
// state default `titles.unlocked: [0]`), so picking it is how a title is unequipped.
// Art: Reborn's titles/<id>.gif for our title ids 0-93, fetched from its CDN and converted with
// gif2webp to client/public/assets/reborn/titles/. ponytail: fetched by hand (like
// features/dungeons-bg.jpg); ids Reborn has no art for fall back to the name in title lettering.
import { useEffect, useState } from 'react'
import { useActivateTitle, useBuffs, type BuffsView } from '../api'
import { statLine } from '../forge/gear'
import { plainText } from '../text'
import { attempt } from './requests'

type Title = BuffsView['titles'][number]
const NO_TITLE = 0
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Reborn's title 0: always unlocked, no bonus; equipping it unequips the title. */
const NO_TITLE_ENTRY: Title = {
  titleId: NO_TITLE,
  nameKey: 'lg_EffortTitle00',
  active: false,
  expiresAt: null,
  stats: [],
}

const titleName = (title: Title) => plainText(title.nameKey, `Title ${title.titleId}`)

/** Reborn's title stat line ("Speed +4%", "Strength +13"). */
export function titleStatText({ name, value }: Title['stats'][number]) {
  const line = statLine(name, value)
  if (!line.label.endsWith('%')) return `${line.label} ${line.value}`
  return `${line.label.replace(/\s*%$/, '')} ${value < 0 ? '' : '+'}${Number(line.value)}%`
}

/** Reborn's countdown of a timed title: "2d 3h 4m", "3h 4m" or "Expired". */
export function timeLeft(expiresAt: string, now: number) {
  const left = Date.parse(expiresAt) - now
  if (left <= 0) return 'Expired'
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS)
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function TitleArt({ title }: { title: Title }) {
  const id = title.titleId
  const [missing, setMissing] = useState<number | null>(null)
  if (missing === id)
    return (
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-linear-to-b from-[#ffee00] via-[#ff9500] to-[#ff5500] bg-clip-text font-[KOMIKAK,Arial] text-[14px] font-black text-transparent [-webkit-text-stroke:0.4px_#3a1a00]">
        {titleName(title)}
      </span>
    )
  return (
    <img
      src={`/assets/reborn/titles/${id}.webp`}
      alt=""
      onError={() => setMissing(id)}
      className="pointer-events-none absolute top-1/2 left-1/2 max-h-full max-w-full -translate-1/2 object-contain"
    />
  )
}

export function TitleSelect() {
  const titles = useBuffs().data?.titles ?? []
  const activate = useActivateTitle()
  const [hover, setHover] = useState(false)
  const active = titles.find((title) => title.active) ?? NO_TITLE_ENTRY
  const now = useNow(hover && !!active.expiresAt)
  const lines = active.stats.map(titleStatText)
  const left = active.expiresAt ? timeLeft(active.expiresAt, now) : ''
  return (
    <div className="game-title-plate absolute top-[52px] left-[103px] h-[36px] w-[164px]">
      <div className="absolute inset-[2px]">
        <TitleArt key={active.titleId} title={active} />
        <select
          aria-label="Title"
          value={active.titleId}
          disabled={activate.isPending}
          onChange={(event) => void attempt(() => activate.mutateAsync(Number(event.target.value)))}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={() => setHover(false)}
          className="absolute inset-0 size-full cursor-pointer appearance-none bg-transparent text-transparent outline-none disabled:cursor-wait"
        >
          {[NO_TITLE_ENTRY, ...titles].map((title) => (
            <option key={title.titleId} value={title.titleId} className="text-black">
              {titleName(title)}
            </option>
          ))}
        </select>
        <span className="sr-only">Equipped title: {titleName(active)}</span>
      </div>
      {hover && (lines.length > 0 || left) && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-[38px] left-[7px] z-30 w-[150px] p-2 font-sans text-xs text-white"
          style={{
            borderStyle: 'solid',
            borderImage:
              'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
          }}
        >
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
          {left && (
            <div className="mt-1 border-t border-white/20 pt-1 text-[#5df9ff]">
              Time left: {left}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
