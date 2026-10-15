// Stats window (menu bar "Character"), laid out like Reborn's (docs/audit/reborn-ui-audit.md §2,
// measured 2026-10-14): the title plate, the 318x100 Name / Level / Village / Rank / EXP panel and
// the 318x260 combat panel with Reborn's hover texts and "Hover over stats for details". Nothing
// else: the pouches live in the Carrier Bag (portrait refill icons), training in the Inventory.
import type { Character, CharacterStats } from '@pockie/shared'
import type { CSSProperties } from 'react'
import { useArena } from './arena/api'
import { tierName } from './arena/labels'
import { useCharacterStats } from './api'
import { TitleText } from './TitleText'
import { Dialog } from './skin'
import { plainText } from './text'
import { expToNext, sceneNameKey, villageOf } from './world'

/** Points per displayed attribute point (RoleInitProperty.ini stores attributes x100). */
const ATTRIBUTE_SCALE = 100
/** Defence and Break curves: x / (x + 1354) (Damage.java). */
const DEFENSE_CURVE = 1354
/** Reborn turns chance ratings into percent by /16 and crit damage by /8. */
const CHANCE_DIVISOR = 16
const CRIT_DAMAGE_DIVISOR = 8
const BASE_CRIT_DAMAGE = 200
/** Reborn's turn length at speed 1000: 5 s. */
const TURN_SECONDS = 5

/** One labelled value box; `hint` is its hover text (Reborn uses plain title attributes). */
export interface StatCell {
  label: string
  value: string | number
  hint?: string
}
/** A row of the two-column grid; null leaves that column empty. */
export type StatRow = [StatCell | null, StatCell | null]

const pct = (value: number) => value.toFixed(2)
const curve = (value: number) => pct((value / (value + DEFENSE_CURVE)) * 100)

/**
 * Combat groups laid out as Reborn's Stats window, split by dividers. Without `hp` (View
 * Character) the HP box shows the maximum only, as Reborn's does.
 */
export function statGroups(
  stats: CharacterStats,
  vitals: Pick<Character, 'maxHp' | 'maxMp'> & { hp?: number },
): StatRow[][] {
  const attribute = (value: number) => Math.round(value / ATTRIBUTE_SCALE)
  const minAttack = Math.min(stats.minAttack, stats.maxAttack)
  const speed = 1000 / stats.atkTime
  // Reborn: crit / 8 plus what crit damage adds over its 200% base.
  const critDamage =
    stats.crit / CRIT_DAMAGE_DIVISOR +
    Math.max(0, (stats.critAttach || BASE_CRIT_DAMAGE) - BASE_CRIT_DAMAGE)
  return [
    [
      [
        { label: 'STR', value: attribute(stats.strength) },
        { label: 'Attack', value: `${minAttack} - ${stats.maxAttack}` },
      ],
      [
        null,
        {
          label: 'Block',
          value: stats.parry,
          hint: `${pct(stats.parry / CHANCE_DIVISOR)}% chance to block attacks`,
        },
      ],
    ],
    [
      [
        { label: 'AGI', value: attribute(stats.agility) },
        {
          label: 'Speed',
          value: speed.toFixed(2),
          hint: `Speed: ${Math.round(speed * 1000)} (${(TURN_SECONDS / speed).toFixed(2)}s between turns)`,
        },
      ],
      [
        null,
        {
          label: 'Dodge',
          value: stats.dodge,
          hint: `${pct(stats.dodge / CHANCE_DIVISOR)}% chance to dodge attacks`,
        },
      ],
    ],
    [
      [
        { label: 'STA', value: attribute(stats.stamina) },
        {
          label: 'HP',
          value: vitals.hp === undefined ? vitals.maxHp : `${vitals.hp}/${vitals.maxHp}`,
        },
      ],
      [null, { label: 'Chakra', value: Math.round(vitals.maxMp) }],
    ],
    [
      [
        {
          label: 'Pierce',
          value: stats.pierce,
          hint: `${pct(stats.pierce / CHANCE_DIVISOR)}% armor penetration`,
        },
        {
          label: 'Hit',
          value: stats.hit,
          hint: `${pct(stats.hit / CHANCE_DIVISOR)}% attack accuracy`,
        },
      ],
      [
        {
          label: 'Defense',
          value: stats.defense,
          hint: `${curve(stats.defense)}% damage reduction`,
        },
        {
          label: 'Break',
          value: stats.neglectDefense,
          hint: `${curve(stats.neglectDefense)}% ignore target defense`,
        },
      ],
      [
        {
          label: 'Crit',
          value: stats.crit,
          hint: `${pct(stats.crit / CHANCE_DIVISOR)}% critical chance, +${pct(critDamage)}% critical damage`,
        },
        {
          label: 'Const',
          value: stats.tough,
          hint: `${pct(stats.tough / CHANCE_DIVISOR)}% crit resistance, -${pct(stats.tough / CRIT_DAMAGE_DIVISOR)}% crit damage taken`,
        },
      ],
    ],
  ]
}

/** Bold label (50px) and the value box (100x20), as Reborn draws every Stats value. Reborn's
 * labels inherit its body colour, #333, which stays readable on the cream panel. */
function Cell({ cell }: { cell: StatCell | null }) {
  if (!cell) return <div aria-hidden className="col-span-2" />
  return (
    <div className="contents">
      <dt className="pr-px text-right font-mono text-[#333] text-[11px] leading-5 font-bold">
        {cell.label}
      </dt>
      <dd
        title={cell.hint ?? String(cell.value)}
        className="game-value-box h-5 truncate px-1 text-center font-mono text-xs leading-5"
      >
        {cell.value}
      </dd>
    </div>
  )
}

export function Divider() {
  return <div aria-hidden className="game-divider mx-2.5 my-[5px] h-0.5" />
}

export function StatGrid({ rows }: { rows: StatRow[] }) {
  return (
    <dl className="grid grid-cols-[50px_100px_50px_100px] gap-y-1">
      {rows.map(([left, right], index) => (
        <div key={index} className="contents">
          <Cell cell={left} />
          <Cell cell={right} />
        </div>
      ))}
    </dl>
  )
}

/** The combat groups, a divider between each two. */
export function StatGroups({ groups }: { groups: StatRow[][] }) {
  return groups.map((rows, index) => (
    <div key={index}>
      {index > 0 && <Divider />}
      <StatGrid rows={rows} />
    </div>
  ))
}

/** Reborn's EXP row: the 249x18 bar and "cur / next (pct%)" under it, or MAX at the cap. */
function ExpRow({ character }: { character: Character }) {
  const next = expToNext(character.level)
  if (next === undefined)
    return (
      <div className="flex h-[38px] items-center">
        <span className="w-[50px] pr-px text-right font-mono text-[#333] text-[11px] font-bold">
          EXP
        </span>
        <p className="flex-1 text-center text-[22px] font-black text-[darkgreen] italic [text-shadow:var(--shadow-game-text)]">
          MAX
        </p>
      </div>
    )
  const percent = Math.min(100, Math.floor((character.exp / next) * 100))
  const text = `${character.exp.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} (${percent}%)`
  return (
    <div className="flex">
      <span className="w-[50px] pt-px pr-px text-right font-mono text-[#333] text-[11px] leading-5 font-bold">
        EXP
      </span>
      <div className="w-[249px] pl-px">
        <div
          role="meter"
          aria-label="EXP"
          aria-valuemin={0}
          aria-valuemax={next}
          aria-valuenow={character.exp}
          aria-valuetext={text}
          title={`${character.exp} / ${next}`}
          className="game-progress h-[18px]"
          style={{ '--fill': `${percent}%` } as CSSProperties}
        />
        <p className="text-center text-[10px] leading-3 font-bold text-[#333]">{text}</p>
      </div>
    </div>
  )
}

export function CharacterWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const stats = useCharacterStats()
  const arena = useArena()
  // Reborn prints the first word of the home village ("Fire").
  const village = plainText(sceneNameKey(villageOf(character.nation)), 'Village').split(' ')[0]!
  const rank = arena.data ? tierName(arena.data.tier) : ''
  return (
    <Dialog title="Stats" onClose={onClose} className="game-window-bare w-[328px]">
      <div className="w-[318px]">
        <div className="game-title-plate grid h-10 place-items-center">
          <p>
            <TitleText />
          </p>
        </div>
        <section aria-label="Profile" className="game-panel-1 mt-[5px] h-[100px] pt-1.5">
          <StatGrid
            rows={[
              [
                { label: 'Name', value: character.name },
                { label: 'Level', value: character.level },
              ],
            ]}
          />
          <Divider />
          <dl className="grid grid-cols-[50px_100px_50px_100px] gap-y-1">
            <Cell cell={{ label: 'Village', value: village }} />
            <dt className="pr-px text-right font-mono text-[#333] text-[11px] leading-5 font-bold">
              Rank
            </dt>
            <dd className="game-value-box h-5 truncate px-1 text-center text-sm leading-5 font-black text-[darkblue] italic">
              {rank}
            </dd>
          </dl>
          <Divider />
          <ExpRow character={character} />
        </section>
        <section aria-label="Combat stats" className="game-panel-1 mt-[5px] h-[260px] pt-1.5">
          {stats.isPending && <p className="p-2 text-xs">Loading stats...</p>}
          {stats.isError && <p className="p-2 text-xs">We could not load your stats.</p>}
          {stats.data && <StatGroups groups={statGroups(stats.data, character)} />}
          <p className="mt-0.5 text-center text-[11px] font-bold text-[#333]">
            Hover over stats for details
          </p>
        </section>
      </div>
    </Dialog>
  )
}
