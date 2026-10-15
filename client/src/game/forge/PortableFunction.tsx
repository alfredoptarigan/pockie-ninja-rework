// Reborn's Portable Function (Inventory "Compose"; reborn-windows-M-Z-hud.md "Portable Function").
// Only Inscribe has a server here (our Inscription); Synthesis, Recast and Impress stay visible but
// disabled, so Synthesis Recipes (opened from the Synthesis tab) is unreachable too.
import { INSCRIBE_MAX_SEALS } from '@pockie/shared'
import { useId, useState } from 'react'
import { errorMessage, useCharacter } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useForgeInfo, useInscribe } from './api'
import { propText } from './gear'
import { anyGear, EquipmentSlot, ItemPicker, useForgeItems, type NoticeState } from './items'
import { TabStrip } from './parts'

type ComposeTab = 'synthesis' | 'recast' | 'inscribe' | 'impress'

const TABS = [
  { id: 'synthesis' as const, title: 'Synthesis', disabled: true },
  { id: 'recast' as const, title: 'Recast', disabled: true },
  { id: 'inscribe' as const, title: 'Inscribe' },
  { id: 'impress' as const, title: 'Impress', disabled: true },
]

const SEALS = {
  low: { label: 'Low Level', icon: '/assets/game/items/icon_lowseal.webp' },
  high: { label: 'Advanced Talisman', icon: '/assets/game/items/icon_highseal.webp' },
} as const

export function PortableFunctionWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ComposeTab>('inscribe')
  const panelId = useId()
  return (
    <Dialog title="Portable Function" onClose={onClose} className="w-[32rem]">
      <TabStrip
        label="Portable Function"
        panelId={panelId}
        tabs={TABS}
        active={tab}
        onChange={setTab}
      />
      <div id={panelId} role="tabpanel" aria-label="Inscribe">
        <InscribeTab />
      </div>
    </Dialog>
  )
}

/** Inscription: Low or High Seals raise the odds; a failure drops to the row's fail level. */
function InscribeTab() {
  const { loading, failed, items } = useForgeItems(anyGear)
  const info = useForgeInfo()
  const character = useCharacter().data
  const inscribe = useInscribe()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sealChoice, setSeal] = useState<'low' | 'high' | null>(null)
  const [seals, setSeals] = useState(0)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [outcome, setOutcome] = useState<boolean | null>(null)
  const selected = items.find((item) => item.id === selectedId)

  if (loading || info.isPending) return <p className="mt-2">Opening the forge...</p>
  if (failed || info.isError) return <Notice tone="error">We could not open the forge.</Notice>

  const { talismans, sealOdds, inscribeLevels } = info.data
  const owned = { low: talismans.lowSeal, high: talismans.highSeal }
  const seal = sealChoice ?? (owned.low === 0 && owned.high > 0 ? 'high' : 'low')
  const maxSeals = Math.min(INSCRIBE_MAX_SEALS, owned[seal])
  const count = Math.min(seals, maxSeals)
  const level = selected?.gear.inscribeLevel ?? 0
  const row = selected ? inscribeLevels[level] : undefined
  const used = row ? Math.min(count, Math.ceil((100 - row.BaseOdds) / sealOdds[seal])) : 0
  const rate = row ? Math.min(100, row.BaseOdds + sealOdds[seal] * used) : 0
  const stoneShort = row !== undefined && (character?.stone ?? 0) < row.StoneCost
  const blocked = !selected
    ? 'Choose an item.'
    : !row
      ? 'This item is fully inscribed.'
      : owned[seal] === 0
        ? `You need a ${seal === 'low' ? 'Low' : 'High'} Seal.`
        : stoneShort
          ? `You need ${row.StoneCost} Stone.`
          : null

  const run = async () => {
    if (!selected) return
    setNotice(null)
    try {
      const result = await inscribe.mutateAsync({ itemId: selected.id, seal, seals: count })
      const now = result.item?.gear?.inscribeLevel ?? 0
      setOutcome(Boolean(result.success))
      setNotice(
        result.success
          ? { tone: 'info', text: `Inscription reached +${now}.` }
          : { tone: 'error', text: `Inscription failed. It is now +${now}.` },
      )
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <p>Inscribe stats onto equipment to improve attributes.</p>
      <div className="grid grid-cols-[168px_1fr] gap-3">
        <ItemPicker
          items={items}
          empty="You have no equipment in your bag."
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setOutcome(null)
            setNotice(null)
          }}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-stretch gap-2">
            <div className="game-card flex flex-1 flex-col gap-0.5 p-2">
              <p className="font-bold">Current Lv.{level}</p>
              {selected?.gear.inscription.map((line) => (
                <p key={line.name}>{propText(line.name, line.value)}</p>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center">
              <span aria-hidden="true">&rarr;</span>
              {outcome !== null && (
                <span className={outcome ? 'text-[#1a7f1a]' : 'text-[#8a1610]'}>
                  {outcome ? 'Success' : 'Failure'}
                </span>
              )}
            </div>
            <div className="game-card flex flex-1 flex-col gap-0.5 p-2">
              <p className="font-bold">After success:</p>
              {row && (
                <>
                  <p className="text-[#1a7f1a]">Lv.{row.AddLevel}</p>
                  <p>On failure: Lv.{row.FailLevel}</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <EquipmentSlot item={selected} />
            {(['low', 'high'] as const).map((id) => (
              <div key={id} className="flex flex-col items-center gap-1">
                <img src={SEALS[id].icon} alt="" className="size-9" />
                <span>x{owned[id]}</span>
                <GameButton
                  small
                  aria-pressed={seal === id}
                  disabled={owned[id] === 0}
                  onClick={() => setSeal(id)}
                >
                  {SEALS[id].label}
                </GameButton>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            Use
            <button
              type="button"
              aria-label="More seals"
              disabled={count >= maxSeals}
              onClick={() => setSeals(count + 1)}
              className="px-1 text-[#6b7280] disabled:opacity-40"
            >
              &#9650;
            </button>
            <span aria-live="polite">{count}</span>
            <button
              type="button"
              aria-label="Fewer seals"
              disabled={count === 0}
              onClick={() => setSeals(count - 1)}
              className="px-1 text-[#6b7280] disabled:opacity-40"
            >
              &#9660;
            </button>
          </div>
          {row && (
            <>
              <p>Rate: {rate}%</p>
              <p className={stoneShort ? 'text-[#8a1610]' : ''}>Stones: {row.StoneCost}</p>
            </>
          )}
          <GameButton
            disabled={Boolean(blocked) || inscribe.isPending}
            onClick={run}
            className="self-start"
          >
            Attempt
          </GameButton>
          {blocked && selected && <p className="text-[#8a1610]">{blocked}</p>}
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        </div>
      </div>
    </div>
  )
}
