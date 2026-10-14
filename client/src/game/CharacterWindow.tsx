import type { Character, CharacterStats } from '@pockie/shared'
import type { CSSProperties } from 'react'
import { errorMessage, useBuyPouches, useCharacterStats, useBuffs } from './api'
import { Dialog, GameButton, Notice } from './skin'
import { plainText } from './text'
import { expToNext, sceneNameKey, villageOf } from './world'
import { useOpenWindow } from './windows'

/** Points per displayed attribute point (RoleInitProperty.ini stores attributes x100). */
const ATTRIBUTE_SCALE = 100
/** Damage reduction from defence: def / (def + 1354) (Damage.java). */
const DEFENSE_CURVE = 1354

/** One labelled value box; `hint` becomes its hover text. */
interface StatCell {
  label: string
  value: string | number
  hint?: string
}
/** A row of the two-column grid; null leaves that column empty. */
type StatRow = [StatCell | null, StatCell | null]

/** Combat groups laid out as Reborn's Stats window (UI_RoleInfo_Xml), split by dividers. */
export function statGroups(stats: CharacterStats, character: Character): StatRow[][] {
  const attribute = (value: number) => Math.trunc(value / ATTRIBUTE_SCALE)
  const minAttack = Math.min(stats.minAttack, stats.maxAttack)
  const reduction = Math.trunc((stats.defense * 100) / (stats.defense + DEFENSE_CURVE))
  return [
    [
      [
        { label: 'STR', value: attribute(stats.strength), hint: 'Strength' },
        { label: 'Attack', value: `${minAttack} - ${stats.maxAttack}` },
      ],
      [null, { label: 'Block', value: stats.parry }],
    ],
    [
      [
        { label: 'AGI', value: attribute(stats.agility), hint: 'Agility' },
        { label: 'Speed', value: (1000 / stats.atkTime).toFixed(2), hint: 'Actions per second' },
      ],
      [null, { label: 'Dodge', value: stats.dodge }],
    ],
    [
      [
        { label: 'STA', value: attribute(stats.stamina), hint: 'Stamina' },
        { label: 'HP', value: `${character.hp}/${character.maxHp}` },
      ],
      [null, { label: 'Chakra', value: `${character.mp}/${character.maxMp}` }],
    ],
    [
      [
        { label: 'Pierce', value: stats.pierce },
        { label: 'Hit', value: stats.hit },
      ],
      [
        {
          label: 'Defense',
          value: stats.defense,
          hint: `Takes ${reduction}% off the damage you receive`,
        },
        { label: 'Break', value: stats.neglectDefense, hint: 'Ignores part of the enemy defense' },
      ],
      [
        { label: 'Crit', value: stats.crit, hint: 'Critical' },
        { label: 'Const', value: stats.tough, hint: 'Toughness' },
      ],
    ],
  ]
}

/** Bold label (50px) and the value box (100x20), as Reborn draws every Stats value. */
function Cell({ cell }: { cell: StatCell | null }) {
  if (!cell) return <div aria-hidden className="col-span-2" />
  return (
    <div className="contents">
      <dt title={cell.hint} className="pr-px text-right font-mono text-[11px] leading-5 font-bold">
        {cell.label}
      </dt>
      <dd
        title={cell.hint}
        className="game-value-box h-5 truncate px-1 text-center font-mono text-xs leading-5"
      >
        {cell.value}
      </dd>
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="game-divider mx-2.5 my-[5px] h-0.5" />
}

function StatGrid({ rows }: { rows: StatRow[] }) {
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

/** Reborn's EXP row: label, the 249x18 bar and "current / next (pct%)" under it. */
function ExpRow({ character }: { character: Character }) {
  const next = expToNext(character.level)
  const percent = next === undefined ? 100 : Math.min(100, Math.floor((character.exp / next) * 100))
  const text =
    next === undefined
      ? `${character.exp.toLocaleString('en-US')} (max level)`
      : `${character.exp.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} (${percent}%)`
  return (
    <div className="flex">
      <span className="w-[50px] pt-px pr-px text-right font-mono text-[11px] leading-5 font-bold">
        EXP
      </span>
      <div className="w-[249px] pl-px">
        <div
          role="meter"
          aria-label="EXP"
          aria-valuemin={0}
          aria-valuemax={next ?? character.exp}
          aria-valuenow={character.exp}
          aria-valuetext={text}
          className="game-progress h-[18px]"
          style={{ '--fill': `${percent}%` } as CSSProperties}
        />
        <p className="text-center text-[10px] leading-3 font-bold text-[#333]">{text}</p>
      </div>
    </div>
  )
}

/** OnCustomBuy: 1 Gold or Gift Coupon per 1000 pouch points. */
const POUCH_POINTS_PER_COIN = 1000

/** Buys both pouches full (UI_RoleUse.as "Full" choice) with Gold or Gift Coupons. */
function PouchRefill({ character }: { character: Character }) {
  const buy = useBuyPouches()
  const cost = [character.hpPouch, character.mpPouch].reduce(
    (sum, pouch) => sum + Math.ceil((character.pouchMax - pouch) / POUCH_POINTS_PER_COIN),
    0,
  )
  const refill = (currency: 'gold' | 'giftCoupon') =>
    buy.mutate({ currency, hp: 'full', mp: 'full' })
  const amount = (value: number) =>
    `${value.toLocaleString('en-US')}/${character.pouchMax.toLocaleString('en-US')}`
  return (
    <section
      aria-label="Refill pouches"
      className="game-inset mt-[5px] flex flex-col gap-1 px-2.5 py-2 text-[11px]"
    >
      {buy.isError && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
      <dl className="flex gap-3 font-bold">
        <div className="flex gap-1">
          <dt>HP pouch</dt>
          <dd className="font-mono font-normal">{amount(character.hpPouch)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>MP pouch</dt>
          <dd className="font-mono font-normal">{amount(character.mpPouch)}</dd>
        </div>
      </dl>
      {cost === 0 ? (
        <p>Your pouches are full.</p>
      ) : (
        <div className="flex items-center gap-1.5">
          <p
            className="flex-1 whitespace-nowrap"
            title={`Refill both pouches for ${cost} Gold or ${cost} Gift Coupons`}
          >
            Cost {cost}
          </p>
          <GameButton
            small
            disabled={buy.isPending || character.gold < cost}
            onClick={() => refill('gold')}
          >
            Refill with Gold
          </GameButton>
          <GameButton
            small
            disabled={buy.isPending || character.giftCoupon < cost}
            onClick={() => refill('giftCoupon')}
          >
            Refill with Coupons
          </GameButton>
        </div>
      )}
    </section>
  )
}

/**
 * Character stats window (menu bar "Character"), laid out like Reborn's Stats window: title
 * plate, Name/Level/Village/EXP panel, combat panel. The pouch refill sits in a strip below.
 */
export function CharacterWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const stats = useCharacterStats()
  const buffs = useBuffs()
  const title = buffs.data?.titles.find((title) => title.active)
  const village = plainText(sceneNameKey(villageOf(character.nation)), 'Village')
  const openWindow = useOpenWindow()
  return (
    <Dialog
      title="Stats"
      onClose={onClose}
      // Reborn's panels sit straight on the dark frame: drop the shared cream backing.
      className="w-[328px] px-[5px]! [&>.game-frame-title]:mb-[5px] [&>.game-inset]:p-0 [&>.game-inset]:[border-image:none]"
    >
      <div className="game-title-plate grid h-10 place-items-center">
        <p className="text-base font-bold tracking-widest text-[#9ba3b0] [text-shadow:0_1px_0_#2a2d31]">
          {title ? plainText(title.nameKey, `Title ${title.titleId}`) : 'No title'}
        </p>
      </div>
      <section aria-label="Profile" className="game-inset mt-[5px] h-[100px] pt-1.5">
        <StatGrid
          rows={[
            [
              { label: 'Name', value: character.name },
              { label: 'Level', value: character.level },
            ],
          ]}
        />
        <Divider />
        <StatGrid
          rows={[
            [
              { label: 'Village', value: village },
              // We have no ninja rank yet; Honor takes Rank's place.
              { label: 'Honor', value: character.honor },
            ],
          ]}
        />
        <Divider />
        <ExpRow character={character} />
      </section>
      <section aria-label="Combat stats" className="game-inset mt-[5px] min-h-[260px] pt-1.5">
        {stats.isPending && <p className="p-2 text-xs">Loading stats...</p>}
        {stats.isError && <p className="p-2 text-xs">We could not load your stats.</p>}
        {stats.data &&
          statGroups(stats.data, character).map((rows, index) => (
            <div key={index}>
              {index > 0 && <Divider />}
              <StatGrid rows={rows} />
            </div>
          ))}
      </section>
      <PouchRefill character={character} />
      <section aria-label="Training" className="game-inset mt-[5px] flex justify-end gap-1 p-1.5">
        <GameButton small onClick={() => openWindow('talents')}>
          Talents
        </GameButton>
        <GameButton small onClick={() => openWindow('bloodlines')}>
          Bloodlines
        </GameButton>
        <GameButton small onClick={() => openWindow('wings')}>
          Wings
        </GameButton>
      </section>
    </Dialog>
  )
}
