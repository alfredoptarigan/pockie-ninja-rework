// The Blacksmith's window: Reborn's Armory (reborn-windows-A-L.md "Armory") with its tabs Enhance,
// Refine, Enchantment, Create Hole and Remove. Inscription lives in the Portable Function
// (Compose). The server checks every rule again; the windows only decide what to offer.
import { useId, useState } from 'react'
import { Dialog, Tabs } from '../skin'
import { EnhanceTab } from './Enhancement'
import { CreateHoleTab, EnchantTab, RemoveGemsTab } from './Gems'
import { RefineTab } from './Refinement'

const TABS = [
  { id: 'enhance' as const, title: 'Enhance', body: EnhanceTab },
  { id: 'refine' as const, title: 'Refine', body: RefineTab },
  { id: 'enchant' as const, title: 'Enchantment', body: EnchantTab },
  { id: 'hole' as const, title: 'Create Hole', body: CreateHoleTab },
  { id: 'remove' as const, title: 'Remove', body: RemoveGemsTab },
]
type ArmoryTab = (typeof TABS)[number]['id']

export function ForgeWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ArmoryTab>('enhance')
  const panelId = useId()
  const active = TABS.find((spec) => spec.id === tab)!
  const Body = active.body
  return (
    <Dialog title="Forge" onClose={onClose} className="w-[34rem]">
      <Tabs label="Forge" panelId={panelId} tabs={TABS} active={tab} onChange={setTab} />
      <div id={panelId} role="tabpanel" aria-label={active.title}>
        <Body />
      </div>
    </Dialog>
  )
}
