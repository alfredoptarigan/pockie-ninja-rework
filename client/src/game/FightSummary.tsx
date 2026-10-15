import type { ReactNode } from 'react'
import { ItemIcon } from './ItemIcon'
import { Dialog, GameButton } from './skin'
import { GameText, plainText } from './text'
import type { FightResult } from './types'
import { itemNameKey } from './world'

const fighterName = (name: string) => plainText(name, name)

/** Damage dealt by each side over the whole replay (strikes and ticks). */
export function damageTotals(replay: FightResult['replay']) {
  const side = (i: number) => replay.fighters[i]?.side
  let dealt = 0
  let taken = 0
  for (const ev of replay.events) {
    // Negative damage heals the target: not damage.
    const damage = Math.max(0, ev.damage ?? 0)
    const self = Math.max(0, ev.selfDamage ?? 0)
    if (side(ev.actor) === 'attackers') dealt += damage
    else taken += damage
    if (side(ev.actor) === 'attackers') taken += self
    else dealt += self
  }
  return { dealt, taken }
}

export function FightSummary({
  result,
  onClose,
  onReplay,
  onFightAgain,
}: {
  result: FightResult
  onClose: () => void
  /** Plays the battle again (shown when a replay player is available). */
  onReplay?: () => void
  /** Fights the same monster again. */
  onFightAgain?: () => void
}) {
  const { replay, rewards, won } = result
  const enemy = replay.fighters.find((f) => f.side === 'defenders')
  const enemyName = enemy ? fighterName(enemy.name) : 'the monster'
  const { dealt, taken } = damageTotals(replay)
  return (
    <ResultWindow
      title={won ? 'Victory' : 'Defeat'}
      story={
        won
          ? `You defeated ${enemyName}.`
          : `${enemy ? fighterName(enemy.name) : 'The monster'} defeated you. ${
              result.character.hp <= 0
                ? 'Revive to keep playing: return to your village or revive here for Gold.'
                : 'Heal before your next fight.'
            }`
      }
      note={`You dealt ${dealt} damage to ${enemyName}. Your foes dealt ${taken} damage to you. HP ${result.character.hp} / ${result.character.maxHp}.`}
      columns={won ? rewardColumns(rewards) : []}
      findTitle="Drops"
      finds={won ? rewards.items : []}
      emptyFind="No drops this time."
      onClose={onClose}
      actions={
        <>
          {onReplay && (
            <GameButton small onClick={onReplay}>
              Replay Battle
            </GameButton>
          )}
          {onFightAgain && (
            <GameButton small onClick={onFightAgain}>
              Fight Again
            </GameButton>
          )}
        </>
      }
    >
      {won && rewards.lost ? <BagFullNote lost={rewards.lost} /> : null}
      {rewards.levelsGained > 0 && (
        <p role="status" className="text-center font-bold text-leaf">
          Level up! You are now level {result.character.level}.
        </p>
      )}
    </ResultWindow>
  )
}

/** Reward columns of a result: EXP (green) and Stone (gold), as Reborn draws its EXP columns. */
export const rewardColumns = (rewards: { exp: number; stone: number }) => [
  { label: 'EXP', value: rewards.exp, color: '#2e7d32' },
  { label: 'Stone', value: rewards.stone, color: '#b8860b' },
]

/**
 * Result window laid out like Reborn's "Adventure Complete!" (reborn-windows-A-L.md): a 380 wide
 * BigBG1 panel, padding 12, the story in italics inside quotes, a note line (Reborn's duration),
 * the reward columns as `+N`, the find box with item icons and OK (100x24) to close. Fights and
 * explore searches share it.
 */
export function ResultWindow({
  title,
  story,
  note,
  columns,
  findTitle,
  finds,
  emptyFind,
  onClose,
  actions,
  children,
}: {
  title: string
  story: string
  note?: string
  columns: { label: string; value: number; color: string }[]
  findTitle: string
  finds: { itemId: string }[]
  emptyFind: string
  onClose: () => void
  /** Buttons before OK (Replay Battle, Fight Again...). */
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <Dialog title={title} onClose={onClose} className="game-window-bare w-[380px]">
      <div className="game-panel-1 flex flex-col gap-[8px] p-[12px] font-game text-[12px] text-black">
        <p className="max-h-[60px] overflow-auto text-center italic">&ldquo;{story}&rdquo;</p>
        {note && <p className="text-center text-[11px]">{note}</p>}
        {columns.length > 0 && (
          <dl className="flex justify-center gap-[12px]">
            {columns.map((column) => (
              <div key={column.label} className="flex w-[96px] flex-col items-center">
                <dt className="font-bold">{column.label}</dt>
                <dd className="text-[16px] font-bold" style={{ color: column.color }}>
                  +{column.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <section
          aria-label={findTitle}
          className="flex flex-col items-center gap-1 rounded border border-[#d4a017] bg-[#fff6d6] p-[6px]"
        >
          <h3 className="font-bold text-[#8a5a00]">{findTitle}</h3>
          {finds.length === 0 ? (
            <p className="text-[11px] italic">{emptyFind}</p>
          ) : (
            <ul className="flex flex-wrap justify-center gap-2">
              {finds.map((find, i) => {
                const name = plainText(itemNameKey(find.itemId), 'Unknown item')
                return (
                  <li
                    key={`${find.itemId}-${i}`}
                    title={name}
                    className="flex w-[72px] flex-col items-center text-center text-[11px]"
                  >
                    <ItemIcon itemId={find.itemId} name={name} className="size-10" />
                    <GameText k={itemNameKey(find.itemId)} fallback="Unknown item" />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        {children}
        <div className="flex flex-wrap justify-center gap-2">
          {actions}
          <GameButton className="h-[24px] w-[100px]" onClick={onClose}>
            OK
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

/** Drops that did not fit in a full bag are lost (fight loot only). */
export function BagFullNote({ lost }: { lost: number }) {
  return (
    <p role="status" className="font-bold text-danger">
      Your bag is full: {lost} {lost === 1 ? 'drop was' : 'drops were'} lost.
    </p>
  )
}
