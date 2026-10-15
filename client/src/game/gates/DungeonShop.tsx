// Reborn's Dungeon Shop (reborn-windows-A-L.md "Dungeon Shop", `valhallaShopOpen` /
// `valhallaShopBuy`) over the 2011 crystal exchange (ExchangeMagicBox, /api/game/gates/exchange):
// tabs Level 56-96, the Common Valhalla Crystal balance top right, eight cards a page with the
// item tooltip, "Exchange" ("Lv {tier}+" below the tier level) and Reborn's confirm. The 2011 rows
// also take the tier's own crystal (Level 56 Valhalla Crystal...), used before the common one.
import type { GateExchange } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { itemIcon } from '../ItemIcon'
import { Prompt } from '../Prompt'
import { CardGrid, ShopCard } from '../shop/parts'
import { Dialog, Notice, Tabs } from '../skin'
import { showToast } from '../toast'
import type { WindowProps } from '../windows'
import { useGatePost, useGates } from './api'

const TIERS = ['56', '66', '76', '86', '96'] as const
type Tier = (typeof TIERS)[number]
const COMMON_CRYSTAL = 'i152015'
const crystalFile = itemIcon(COMMON_CRYSTAL)?.file

function Crystal({ size }: { size: number }) {
  return (
    <img
      src={crystalFile}
      alt="Common Valhalla Crystal"
      style={{ width: size, height: size }}
      className="inline-block"
    />
  )
}

export function DungeonShopWindow({ character, onClose }: WindowProps) {
  const gates = useGates()
  const convert = useGatePost()
  const [tier, setTier] = useState<Tier>('56')
  const [asking, setAsking] = useState<GateExchange | null>(null)
  const crystals = gates.data?.crystals ?? {}
  const held = (row: GateExchange) =>
    (crystals[row.srcItemId] ?? 0) + (row.commonItemId ? (crystals[row.commonItemId] ?? 0) : 0)
  const rows = (gates.data?.exchanges ?? []).filter((row) => String(row.tier) === tier)
  const exchange = (row: GateExchange) =>
    convert.mutate(
      { path: 'exchange', body: { exchangeId: row.id } },
      {
        onSuccess: () => showToast('Purchase successful!', 'success'),
        onError: (error) => showToast(errorMessage(error) || 'Failed to purchase', 'failure'),
      },
    )
  return (
    <Dialog title="Dungeon Shop" onClose={onClose} className="w-[480px]">
      <Tabs
        label="Dungeon Shop levels"
        panelId="dungeon-shop-panel"
        tabs={TIERS.map((id) => ({ id, title: `Level ${id}` }))}
        active={tier}
        onChange={setTier}
      />
      <div id="dungeon-shop-panel" role="tabpanel" className="flex flex-col gap-[6px] pt-[8px]">
        <div className="flex justify-end">
          <span
            role="group"
            aria-label="Balance"
            title="Common Valhalla Crystals. A ware's own level crystals are spent first."
            className="game-text-box flex h-[18px] w-[90px] items-center justify-between px-[6px] text-[11px]"
          >
            <Crystal size={14} />
            <span>
              {gates.data ? (crystals[COMMON_CRYSTAL] ?? 0).toLocaleString('en-US') : '...'}
            </span>
          </span>
        </div>
        {gates.isError && <Notice tone="error">{errorMessage(gates.error)}</Notice>}
        <CardGrid
          key={tier}
          label={`Level ${tier} wares`}
          items={rows}
          empty={gates.isPending ? 'Loading...' : 'No wares at this level.'}
          card={(row) => {
            const available = character.level >= row.tier
            const asked = convert.variables?.body as { exchangeId?: number } | undefined
            const busy = convert.isPending && asked?.exchangeId === row.id
            return (
              <ShopCard
                key={row.id}
                itemId={row.destItemId}
                count={row.destCount}
                info={row.destInfo}
                lines={
                  <span className="flex items-center justify-center gap-[2px]">
                    <Crystal size={14} />
                    {row.srcCount.toLocaleString('en-US')}
                  </span>
                }
                button={busy ? '...' : available ? 'Exchange' : `Lv ${row.tier}+`}
                buttonLabel={`Exchange for ${itemName(row.destItemId)}`}
                disabled={!available || held(row) < row.srcCount || convert.isPending}
                onClick={() => setAsking(row)}
              />
            )
          }}
        />
      </div>
      {asking && (
        <Prompt
          message={`Exchange for ${itemName(asking.destItemId)}?\n\nCost: ${asking.srcCount} Common Valhalla Crystal${asking.srcCount === 1 ? '' : 's'}`}
          onAccept={() => {
            exchange(asking)
            setAsking(null)
          }}
          onClose={() => setAsking(null)}
        />
      )}
    </Dialog>
  )
}
