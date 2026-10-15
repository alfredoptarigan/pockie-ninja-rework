// Reborn's Clan window Events tab (`Rh`, 840x340): the Clan Level bar (700x22 gold, "cur / next",
// MAX at 20) and the row of 96px activity tiles. Garden, Picnic and Adventure (with Jiraiya) open
// their windows; Training, Protection, Clan Wars and Clan Missions are not built and stay greyed.
import { useState } from 'react'
import { errorMessage } from '../api'
import { AdventureWindow } from '../hunt'
import { Notice } from '../skin'
import { useClanLevel } from './events-api'
import { NinjaGardenWindow } from './NinjaGarden'
import { PicnicWindow } from './Picnic'

type Activity = 'garden' | 'picnic' | 'adventure'
const TILES: { key: string; label: string; opens?: Activity }[] = [
  { key: 'training', label: 'Training' },
  { key: 'garden', label: 'Garden', opens: 'garden' },
  { key: 'protection', label: 'Protection' },
  { key: 'picnic', label: 'Picnic', opens: 'picnic' },
  { key: 'clanwars', label: 'Clan Wars' },
  { key: 'Adventure', label: 'Adventure', opens: 'adventure' },
  { key: 'clan_missions_icon', label: 'Clan Missions' },
]

export function EventsTab() {
  const level = useClanLevel()
  const [open, setOpen] = useState<Activity | null>(null)
  if (level.isError) return <Notice tone="error">{errorMessage(level.error)}</Notice>
  const bar = level.data
  const fill = bar ? (bar.next === null ? 1 : Math.min(1, bar.exp / bar.next)) : 0
  return (
    <div className="flex flex-col items-center gap-[20px] pt-[20px] text-black">
      <div className="game-panel-1 flex h-[90px] w-[756px] flex-col items-center justify-center gap-2">
        <p className="text-[13px] font-bold text-[#3a2310]">
          Clan Level: <span className="text-[15px]">{bar?.level ?? '-'}</span>
          {bar?.next === null && ' (MAX)'}
        </p>
        <div
          role="meter"
          aria-label="Clan EXP"
          aria-valuemin={0}
          aria-valuemax={bar?.next ?? 1}
          aria-valuenow={bar?.next === null ? 1 : (bar?.exp ?? 0)}
          className="relative h-[22px] w-[700px] overflow-hidden rounded-sm border-2 border-[#5a4a30] bg-linear-to-b from-[#2a1f14] to-[#1a1208]"
        >
          <div
            className="h-full bg-linear-to-b from-[#ffd54f] to-[#c4940c]"
            style={{ width: `${fill * 100}%` }}
          />
          <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-white [text-shadow:0_1px_2px_#000]">
            {bar ? (bar.next === null ? 'MAX' : `${bar.exp} / ${bar.next}`) : ''}
          </span>
        </div>
      </div>
      <ul aria-label="Clan activities" className="flex justify-center gap-[20px]">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <button
              type="button"
              disabled={!tile.opens}
              title={tile.opens ? undefined : `${tile.label}: not available yet`}
              onClick={() => tile.opens && setOpen(tile.opens)}
              className="flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
            >
              <img
                src={`/assets/reborn/clan/${tile.key}.webp`}
                alt=""
                className="mb-1 size-[96px] object-contain"
              />
              <span className="text-[11px] font-bold text-[#3a2310]">{tile.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {open === 'garden' && <NinjaGardenWindow onClose={() => setOpen(null)} />}
      {open === 'picnic' && <PicnicWindow onClose={() => setOpen(null)} />}
      {open === 'adventure' && <AdventureWindow onClose={() => setOpen(null)} />}
    </div>
  )
}
