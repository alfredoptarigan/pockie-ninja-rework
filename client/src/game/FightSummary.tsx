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
    <Dialog title={won ? 'Victory' : 'Defeat'} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <p>
          {won
            ? `You defeated ${enemy ? fighterName(enemy.name) : 'the monster'}.`
            : `${enemy ? fighterName(enemy.name) : 'The monster'} defeated you. ${
                result.character.hp <= 0
                  ? 'Revive to keep playing: return to your village or revive here for Gold.'
                  : 'Heal before your next fight.'
              }`}
        </p>
        <p>
          You dealt {dealt} damage to {enemyName}. Your foes dealt {taken} damage to you.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-bold">HP</dt>
          <dd>
            {result.character.hp} / {result.character.maxHp}
          </dd>
          <dt className="font-bold">Actions</dt>
          <dd>{replay.events.length}</dd>
          {won && (
            <>
              <dt className="font-bold">EXP</dt>
              <dd>+{rewards.exp}</dd>
              <dt className="font-bold">Stone</dt>
              <dd>+{rewards.stone}</dd>
              <dt className="font-bold">Drops</dt>
              <dd>
                {rewards.items.length === 0 ? (
                  'None'
                ) : (
                  <ul className="flex flex-col gap-1">
                    {rewards.items.map((item, i) => (
                      <li key={`${item.itemId}-${i}`} className="flex items-center gap-2">
                        <ItemIcon
                          itemId={item.itemId}
                          name={plainText(itemNameKey(item.itemId), 'Unknown item')}
                          className="size-8"
                        />
                        <GameText k={itemNameKey(item.itemId)} fallback="Unknown item" />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </>
          )}
        </dl>
        {won && rewards.lost ? <BagFullNote lost={rewards.lost} /> : null}
        {rewards.levelsGained > 0 && (
          <p role="status" className="font-bold text-leaf">
            Level up! You are now level {result.character.level}.
          </p>
        )}
        {(onReplay || onFightAgain) && (
          <div className="flex gap-2">
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
          </div>
        )}
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
