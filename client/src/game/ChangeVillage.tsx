// Reborn's Village Elder "Change Village" (reborn-windows-M-Z-hud.md "Village Elder",
// reborn-windows-A-L.md "Village panels"): only the Angel City Elder in Angel City offers it.
// "Select your new village (50,000 stones)" lists Fire, Water, Lightning, Wind and Earth Village
// (greyed without the stones), then "Change to {village} for 50,000 stones?" with
// "Yes, Change Village" or "You need 50,000 stones", and Cancel. It closes on success.
// The option row goes in the NPC menu's main list; the steps open in the Elder's 475x204 window.
import type { Character } from '@pockie/shared'
import { useMutation } from '@tanstack/react-query'
import { useState, type ComponentProps } from 'react'
import { api } from '../lib/api'
import { errorMessage, useApplyResult } from './api'
import { useNpcPhoto } from './art'
import { Dialog, Notice } from './skin'
import { showToast } from './toast'
import type { SceneNpc } from './types'

const ANGEL_CITY = 161
const ANGEL_CITY_ELDER = 'n16001'
const COST = 50_000
const COST_TEXT = '50,000 stones'
const GREETING =
  'The Sakura mainland is shrouded in darkness. Only the most powerful ninjas can survive this arduous challenge.'

/** Reborn's order; `village` is the village scene the server takes, `nation` ours. */
const VILLAGES = [
  { name: 'Fire Village', village: 111, nation: 0 },
  { name: 'Water Village', village: 121, nation: 1 },
  { name: 'Lightning Village', village: 131, nation: 4 },
  { name: 'Wind Village', village: 141, nation: 3 },
  { name: 'Earth Village', village: 151, nation: 2 },
] as const
type Village = (typeof VILLAGES)[number]

function useChangeVillage() {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (village: number) =>
      api<{ character: Character }>('/api/game/change-village', {
        method: 'POST',
        body: { village },
      }),
    onSuccess: apply,
  })
}

/** The "Change Village" row of the Angel City Elder's menu, or nothing elsewhere. */
export function ChangeVillageOption({
  npc,
  character,
  onEnd,
}: {
  npc: SceneNpc
  character: Character
  /** Ends the whole conversation (End Conversation, or a village changed). */
  onEnd: () => void
}) {
  const [open, setOpen] = useState(false)
  if (npc.id !== ANGEL_CITY_ELDER || character.sceneId !== ANGEL_CITY) return null
  return (
    <li>
      <Option onClick={() => setOpen(true)}>Change Village</Option>
      {open && (
        <ChangeVillageWindow
          npc={npc}
          character={character}
          onBack={() => setOpen(false)}
          onEnd={() => {
            setOpen(false)
            onEnd()
          }}
        />
      )}
    </li>
  )
}

function ChangeVillageWindow({
  npc,
  character,
  onBack,
  onEnd,
}: {
  npc: SceneNpc
  character: Character
  onBack: () => void
  onEnd: () => void
}) {
  const photo = useNpcPhoto(npc.id)
  const change = useChangeVillage()
  const [chosen, setChosen] = useState<Village | null>(null)
  const affordable = character.stone >= COST
  const confirm = (village: Village) =>
    change.mutate(village.village, {
      onSuccess: () => {
        showToast(`You now belong to ${village.name}.`, 'success')
        onEnd()
      },
    })
  return (
    <Dialog title="Village Elder" onClose={onBack} className="game-window-bare w-[485px]">
      <div className="flex gap-[5px]">
        <div className="game-npc-card relative h-[204px] w-[161px] shrink-0">
          <div className="game-npc-frame absolute top-[13px] left-[13px] h-[182px] w-[137px] overflow-hidden">
            {photo && <img src={photo} alt="" className="size-full object-contain" />}
          </div>
        </div>
        <div className="flex w-[309px] flex-col gap-[5px]">
          <div className="game-inset flex min-h-[65px] flex-col gap-1 p-[5px] font-[monospace] text-[12px] leading-[14px] text-black">
            <p>{GREETING}</p>
            {change.isError && <Notice tone="error">{errorMessage(change.error)}</Notice>}
          </div>
          <ul
            aria-label="Options"
            className="game-inset flex h-[134px] flex-col gap-px overflow-auto px-[5px] py-[6px] font-game text-[13px]"
          >
            {chosen ? (
              <>
                <li className="px-[9px] py-[3px] text-[#3d2914]">
                  Change to {chosen.name} for {COST_TEXT}?
                </li>
                <li>
                  <Option
                    disabled={!affordable || change.isPending}
                    onClick={() => confirm(chosen)}
                  >
                    {affordable ? 'Yes, Change Village' : `You need ${COST_TEXT}`}
                  </Option>
                </li>
                <li>
                  <Option onClick={() => setChosen(null)}>Cancel</Option>
                </li>
              </>
            ) : (
              <>
                <li className="px-[9px] py-[3px] text-[#3d2914]">
                  Select your new village ({COST_TEXT})
                </li>
                {VILLAGES.map((village) => {
                  const own = village.nation === character.nation
                  return (
                    <li key={village.village}>
                      <Option disabled={own || !affordable} onClick={() => setChosen(village)}>
                        {own ? `${village.name} (your village)` : village.name}
                      </Option>
                    </li>
                  )
                })}
                <li>
                  <Option onClick={onBack}>Back</Option>
                </li>
              </>
            )}
            <li>
              <Option onClick={onEnd}>End Conversation</Option>
            </li>
          </ul>
        </div>
      </div>
    </Dialog>
  )
}

/** One option row of the NPC menu (299x23), as NpcDialog draws them. */
function Option(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="game-npc-option block h-[23px] w-full truncate px-[9px] text-left"
      {...props}
    />
  )
}
