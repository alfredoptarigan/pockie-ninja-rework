// Hunt (reborn-windows-A-L.md "Hunt", `Fx`): a small minimizable window, shown while a hunt runs,
// with the hunted monsters' 50px avatars (on the left, under a field's ticket boss and Pub Fight).
// A live one travels to its area; killed ones are greyed; once all are down "Completed" travels
// home, to the Arena NPC who pays the hunt.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useTravel } from '../api'
import { useMonsterPortrait } from '../art'
import { plainText } from '../text'
import { showToast } from '../toast'
import { isVillage } from '../world'
import { useHunt } from './api'

export function HuntWindow({ character }: { character: Character }) {
  const hunt = useHunt().data
  const portraitOf = useMonsterPortrait()
  const travel = useTravel()
  const [minimized, setMinimized] = useState(false)
  if (!hunt || hunt.monsters.length === 0) return null
  const completed = hunt.monsters.every((monster) => monster.killed)
  const onError = (error: Error) => showToast(errorMessage(error), 'failure')
  return (
    <section
      aria-label="Hunt"
      className="game-frame pointer-events-auto absolute top-[250px] left-[6px] w-[150px] px-1 pb-1 font-game"
    >
      <div className="game-frame-title flex items-center justify-between">
        <h2 className="game-title-tag text-[12px] font-bold">Hunt</h2>
        <button
          type="button"
          aria-label={minimized ? 'Show hunt' : 'Minimize hunt'}
          aria-expanded={!minimized}
          onClick={() => setMinimized(!minimized)}
          className="px-1 text-[14px] leading-none font-bold text-white"
        >
          {minimized ? '+' : '-'}
        </button>
      </div>
      {!minimized && (
        <div className="game-panel-small relative flex h-[52px] w-[142px] items-center">
          <ul className="flex">
            {hunt.monsters.map((monster, i) => {
              const name = plainText(monster.nameKey, 'Monster')
              const portrait = portraitOf(monster.id)
              return (
                <li key={`${monster.id}-${i}`}>
                  <button
                    type="button"
                    disabled={monster.killed || travel.isPending}
                    title={`${name} Lv.${monster.level}${monster.killed ? ' (defeated)' : ''}`}
                    aria-label={`${name}${monster.killed ? ', defeated' : ', travel to it'}`}
                    onClick={() => {
                      if (monster.sceneId !== character.sceneId)
                        travel.mutate(monster.sceneId, { onError })
                    }}
                    className="size-[47px] disabled:opacity-40 disabled:grayscale"
                  >
                    {portrait ? (
                      <img src={portrait} alt="" className="size-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-white">{name}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {completed && (
            <button
              type="button"
              onClick={() => {
                if (!isVillage(character.sceneId)) travel.mutate({ via: 'home' }, { onError })
              }}
              className="absolute inset-0 text-center font-[KOMIKAK] text-[22px] text-[darkgreen] [text-shadow:1px_1px_0_#fff,-1px_-1px_0_#fff]"
            >
              Completed
            </button>
          )}
        </div>
      )}
    </section>
  )
}
