import { useState } from 'react'
import { panelPetSkills, panelSkills } from './phaser/battle-hud'
import type { VisualReplay } from './phaser/companions'
import { SkillDescription, skillName } from './SkillsWindow'

/** Transparent keyboard-accessible targets over the canvas skill icons. */
export function BattleSkills({
  replay,
  fighters,
}: {
  replay: VisualReplay
  fighters: (number | undefined)[]
}) {
  const [shown, setShown] = useState<string | null>(null)
  return (
    <div className="pointer-events-none absolute inset-0">
      {fighters.flatMap((fighter, side) => {
        if (fighter === undefined) return []
        const x = side === 0 ? 5 : 845
        return [panelSkills(replay, fighter), panelPetSkills(replay, fighter)].flatMap(
          (skills, pet) =>
            skills.map((skill, i) => {
              const key = `${fighter}:${pet}:${i}:${skill}`
              const left = x + (pet ? 66 : 0) + (i % (pet ? 3 : 5)) * 30
              const top = pet ? 373 + Math.floor(i / 3) * 30 : 460 + Math.floor(i / 5) * 30
              return (
                <div
                  key={key}
                  className="absolute pointer-events-auto"
                  style={{
                    left: `${left / 10}%`,
                    top: `${top / 6}%`,
                    width: '2.7%',
                    height: '4.5%',
                  }}
                  onMouseEnter={() => setShown(key)}
                  onMouseLeave={() => setShown(null)}
                >
                  <button
                    type="button"
                    aria-label={skillName(skill)}
                    aria-describedby={shown === key ? 'battle-skill-tooltip' : undefined}
                    onFocus={() => setShown(key)}
                    onBlur={() => setShown(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setShown(null)
                    }}
                    className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-yellow-200"
                  />
                  {shown === key && (
                    <div
                      id="battle-skill-tooltip"
                      role="tooltip"
                      className={`pointer-events-none absolute bottom-full z-50 mb-1 w-[min(260px,65vw)] rounded border-2 border-[#777] bg-black/95 px-2 py-1 font-game text-xs leading-snug text-white shadow-lg ${side === 0 ? 'left-0' : 'right-0'}`}
                    >
                      <p className="mb-1 border-b border-[#8f7536] pb-1 text-sm font-bold text-[#f0d060]">
                        {skillName(skill)}
                      </p>
                      <SkillDescription id={skill} />
                    </div>
                  )}
                </div>
              )
            }),
        )
      })}
    </div>
  )
}
