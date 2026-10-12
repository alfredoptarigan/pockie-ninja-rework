import { Dialog } from './skin'
import { BattleReplayMount } from './stage'
import { GameText, plainText } from './text'
import type { FightResult } from './types'
import { itemNameKey } from './world'

const fighterName = (name: string) => plainText(name, name)

export function FightSummary({ result, onClose }: { result: FightResult; onClose: () => void }) {
  const { replay, rewards, won } = result
  const enemy = replay.fighters.find((f) => f.side === 'defenders')
  return (
    <Dialog title={won ? 'Victory' : 'Defeat'} onClose={onClose}>
      <BattleReplayMount replay={replay} />
      <div className="flex flex-col gap-2">
        <p>
          {won
            ? `You defeated ${enemy ? fighterName(enemy.name) : 'the monster'}.`
            : `${enemy ? fighterName(enemy.name) : 'The monster'} defeated you. Heal before your next fight.`}
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
                  <ul>
                    {rewards.items.map((item, i) => (
                      <li key={`${item.itemId}-${i}`}>
                        <GameText k={itemNameKey(item.itemId)} fallback="Unknown item" />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </>
          )}
        </dl>
        {rewards.levelsGained > 0 && (
          <p role="status" className="font-bold text-leaf">
            Level up! You are now level {result.character.level}.
          </p>
        )}
      </div>
    </Dialog>
  )
}
