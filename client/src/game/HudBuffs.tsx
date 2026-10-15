// Reborn's buff row under the HUD portrait (`.hud-portrait__buffs`, main.js `lm`): one 20x20 icon
// per active buff in buff id order, 2px apart and wrapping; hover shows the buff name, a gold
// rule, its effect line and the time left as [DDd]HH:MM:SS, ticking while shown. Icons and text
// come from tools/assets/buffs.ts. Like Reborn, a buff cannot be removed.
import { useId, useState } from 'react'
import buffData from '../generated/buffs.json'
import { useBuffs, type BuffsView } from './api'
import { useNow } from './events/timer'
import { plainText } from './text'

type Buff = BuffsView['buffs'][number]
const BUFFS: Record<string, { icon?: string; name?: string; effect?: string }> = buffData

const pad = (value: number) => String(value).padStart(2, '0')
/** Reborn's countdown: `DDd` when a day or more is left, then HH:MM:SS. */
export function buffTimeLeft(expiresAt: string, now: number) {
  const seconds = Math.floor(Math.max(0, Date.parse(expiresAt) - now) / 1000)
  const days = Math.floor(seconds / 86_400)
  const clock = `${pad(Math.floor((seconds % 86_400) / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  return days > 0 ? `${pad(days)}d${clock}` : clock
}

function TimeLeft({ expiresAt }: { expiresAt: string | null }) {
  const now = useNow()
  return (
    <span className="block text-[11px] text-[#aaa]">
      {expiresAt ? buffTimeLeft(expiresAt, now) : 'Permanent'}
    </span>
  )
}

function BuffIcon({ buff, icon }: { buff: Buff; icon: string }) {
  const [shown, setShown] = useState(false)
  const tipId = useId()
  const data = BUFFS[buff.buffId]
  const name = data?.name ?? plainText(buff.nameKey, 'Buff')
  return (
    <div className="relative">
      <button
        type="button"
        aria-describedby={shown ? tipId : undefined}
        onPointerEnter={() => setShown(true)}
        onPointerLeave={() => setShown(false)}
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
        className="block size-[20px] focus-visible:outline-2 focus-visible:outline-[#ffe27a]"
      >
        <img src={icon} alt={name} width={20} height={20} className="block" />
      </button>
      {shown && (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-0 z-30 w-[180px] bg-black/90 p-1 text-[12px] text-[whitesmoke]"
        >
          <span className="block text-center text-white">{name}</span>
          <span
            aria-hidden="true"
            className="my-1 block h-px bg-linear-to-r from-transparent via-[#c9a356] to-transparent"
          />
          {data?.effect && <span className="block text-[11px] text-[#4fc3f7]">{data.effect}</span>}
          <TimeLeft expiresAt={buff.expiresAt} />
        </div>
      )}
    </div>
  )
}

/** The active buffs that have an icon (title bonuses have none and show in the title plate). */
export function HudBuffs() {
  const buffs = useBuffs().data?.buffs ?? []
  // Ticks so a buff leaves the row the second it runs out.
  const now = useNow()
  const shown = buffs
    .filter(
      (buff) => BUFFS[buff.buffId]?.icon && (!buff.expiresAt || Date.parse(buff.expiresAt) > now),
    )
    .sort((a, b) => a.buffId - b.buffId)
  if (shown.length === 0) return null
  return (
    <div role="list" aria-label="Active effects" className="flex flex-wrap gap-[2px]">
      {shown.map((buff) => (
        <div role="listitem" key={buff.buffId}>
          <BuffIcon buff={buff} icon={BUFFS[buff.buffId]!.icon!} />
        </div>
      ))}
    </div>
  )
}
