// Dev-only page (/play/skill-showcase): plays every skill with Reborn art through the real battle
// player, wearing the signed-in ninja's outfit and weapon (use the QA account, `pnpm db:seed-qa`).
import type { Character } from '@pockie/shared'
import { useMemo, useState } from 'react'
import { useInventory } from '../api'
import { isWorn } from '../inventory/EquipmentSlots'
import { lookOf } from '../inventory/outfits'
import { GameButton } from '../skin'
import { BattleReplayMount } from '../stage'
import { outfitName, plainText } from '../text'
import { showcaseReplay, showcaseSkills, type ShowcaseSkill } from './showcase'

const ninjutsu = showcaseSkills.filter((s) => s.kind === 'ninjutsu')
const ultimates = showcaseSkills.filter((s) => s.kind === 'ultimate')
const skillLabel = (id: number) => plainText(`lg_Skill_${id}`, `Skill ${id}`)

interface Run {
  key: number
  label: string
  skills: ShowcaseSkill[]
}

export default function SkillShowcase({ character }: { character: Character }) {
  const inventory = useInventory()
  const [run, setRun] = useState<Run | null>(null)
  const [finished, setFinished] = useState<string | null>(null)
  const weaponItemId = inventory.data?.find(
    (item) => item.equippedSlot === 'Weapon' && isWorn(item, character.activeSet),
  )?.itemId
  const played = useMemo(
    () => run && showcaseReplay(run.skills, { name: character.name, level: character.level }),
    [run, character.name, character.level],
  )
  const play = (label: string, skills: ShowcaseSkill[]) => {
    setFinished(null)
    setRun((r) => ({ key: (r?.key ?? 0) + 1, label, skills }))
  }

  return (
    <main
      data-game-ui
      className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#3a4044,#0c0e0f)] p-6 font-game text-parchment"
    >
      <h1 className="text-xl">Skill showcase</h1>
      <p className="mt-1 text-sm">
        {ninjutsu.length} ninjutsu and {ultimates.length} outfit ultimates, each cast once. Ninjutsu
        are cast by {character.name} on a dummy; each ultimate is cast on {character.name} by the
        outfit it belongs to.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <GameButton onClick={() => play('Everything', showcaseSkills)}>Play everything</GameButton>
        <GameButton onClick={() => play('All ninjutsu', ninjutsu)}>Play all ninjutsu</GameButton>
        <GameButton onClick={() => play('All ultimates', ultimates)}>Play all ultimates</GameButton>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {run ? `Playing: ${run.label}` : finished ? `Finished: ${finished}` : ''}
      </p>
      <table className="mt-2 w-full max-w-4xl text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Skill</th>
            <th>Id</th>
            <th>Kind</th>
            <th>Cast by</th>
            <th>Effect art</th>
            <th>
              <span className="sr-only">Play</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {showcaseSkills.map((skill) => (
            <tr key={`${skill.kind}-${skill.id}`} className="border-t border-white/10">
              <td className="py-1">{skillLabel(skill.id)}</td>
              <td>{skill.id}</td>
              <td>{skill.kind === 'ultimate' ? 'Ultimate' : 'Ninjutsu'}</td>
              <td>{skill.clothing ? outfitName(skill.clothing) : character.name}</td>
              <td>{skill.hasArt ? 'Yes' : 'No (motion only)'}</td>
              <td>
                <GameButton
                  small
                  aria-label={`Play ${skillLabel(skill.id)} (${skill.id})`}
                  onClick={() => play(`${skillLabel(skill.id)} (${skill.id})`, [skill])}
                >
                  Play
                </GameButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {run && played && (
        <BattleReplayMount
          key={run.key}
          replay={played.replay}
          clothing={lookOf(character)}
          monsterIds={[]}
          defenderLooks={played.defenderLooks}
          sceneId={character.sceneId}
          weaponItemId={weaponItemId}
          onFinished={() => {
            setFinished(run.label)
            setRun(null)
          }}
        />
      )}
    </main>
  )
}
