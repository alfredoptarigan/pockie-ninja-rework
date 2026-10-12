// Bag forge actions (blacksmith.md: item menu ViewMenuIdentify / ViewMenuRepaire, bag buttons
// btn_Identify and btn_Repair): Appraise and Repair for the selected item, Appraise all for the
// shown page and Repair all for worn gear. Both work anywhere, like the original.
import type { GearView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { plainText } from '../text'
import type { InventoryItem } from '../types'
import { useAppraise, useAppraiseAll, useGear, useRepair, useRepairAll } from './api'

type NoticeState = { tone: 'info' | 'error'; text: string } | null

function useRun() {
  const [notice, setNotice] = useState<NoticeState>(null)
  const run = async (action: () => Promise<unknown>, done: string) => {
    setNotice(null)
    try {
      await action()
      setNotice({ tone: 'info', text: done })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    }
  }
  return { notice, run }
}

/** Appraise / Repair buttons for one selected item; nothing for items that need neither. */
export function ItemForgeActions({ item, gear }: { item: InventoryItem; gear?: GearView }) {
  const appraise = useAppraise()
  const repair = useRepair()
  const { notice, run } = useRun()
  if (!gear) return null
  const name = plainText(item.nameKey, 'the item')
  const busy = appraise.isPending || repair.isPending
  return (
    <div className="flex flex-col gap-[5px]">
      {!gear.appraised && (
        <GameButton
          disabled={busy}
          aria-label={`Appraise ${name} for ${gear.appraiseCost} Stone`}
          onClick={() => run(() => appraise.mutateAsync({ itemId: item.id }), `Appraised ${name}.`)}
          className="h-[25px] w-[75px]"
        >
          Appraise
        </GameButton>
      )}
      {gear.repairCost > 0 && (
        <GameButton
          disabled={busy}
          aria-label={`Repair ${name} for ${gear.repairCost} Stone`}
          onClick={() => run(() => repair.mutateAsync({ itemId: item.id }), `Repaired ${name}.`)}
          className="h-[25px] w-[75px]"
        >
          Repair
        </GameButton>
      )}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </div>
  )
}

/** "Appraise all" over the shown bag page and "Repair all" over worn gear, with their prices. */
export function BagForgeButtons({ pageItemIds }: { pageItemIds: string[] }) {
  const gear = useGear().data ?? {}
  const appraiseAll = useAppraiseAll()
  const repairAll = useRepairAll()
  const { notice, run } = useRun()
  const hidden = pageItemIds.filter((id) => gear[id] && !gear[id].appraised)
  const appraiseCost = hidden.reduce((sum, id) => sum + gear[id]!.appraiseCost, 0)
  const busy = appraiseAll.isPending || repairAll.isPending
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <GameButton
          small
          disabled={busy || hidden.length === 0}
          aria-label={
            hidden.length
              ? `Appraise all for ${appraiseCost} Stone`
              : 'Appraise all (nothing to appraise)'
          }
          onClick={() =>
            run(
              () => appraiseAll.mutateAsync({ itemIds: hidden }),
              `Appraised ${hidden.length} items.`,
            )
          }
        >
          Appraise all
        </GameButton>
        <GameButton
          small
          disabled={busy}
          onClick={() => run(() => repairAll.mutateAsync(), 'Repaired everything you wear.')}
        >
          Repair all
        </GameButton>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </div>
  )
}
