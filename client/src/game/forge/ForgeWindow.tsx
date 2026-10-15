// The Blacksmith's window: Reborn's Armory (reborn-windows-A-L.md "Armory") with the tabs we have
// a server for, Enhance and Refine. Inscription lives in the Portable Function (Compose). The
// server checks every rule again; the windows only decide what to offer.
import { useId, useState } from 'react'
import { Dialog, Tabs } from '../skin'
import { EnhanceTab } from './Enhancement'
import { RefineTab } from './Refinement'

type ArmoryTab = 'enhance' | 'refine'

const TABS = [
  { id: 'enhance' as const, title: 'Enhance' },
  { id: 'refine' as const, title: 'Refine' },
]

export function ForgeWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ArmoryTab>('enhance')
  const panelId = useId()
  return (
    <Dialog title="Forge" onClose={onClose} className="w-[34rem]">
      <Tabs label="Forge" panelId={panelId} tabs={TABS} active={tab} onChange={setTab} />
      <div id={panelId} role="tabpanel" aria-label={tab === 'enhance' ? 'Enhance' : 'Refine'}>
        {tab === 'enhance' ? <EnhanceTab /> : <RefineTab />}
      </div>
    </Dialog>
  )
}
