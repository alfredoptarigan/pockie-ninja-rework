// Reborn's Zanpakuto window (village icon, level 61; chunk 984, reborn-lazy-features.md
// "## Zanpakuto"): the 16-slot spirit inventory on the left, the Sharp / Blunt / Fist tabs with 6
// crystal slots each on the right. Every rule, cost and roll is the server's; this shows the view
// and posts actions. Crystal bonuses do not reach battle yet (their ranges are placeholders).
import { useState, type MouseEvent } from 'react'
import {
  TIER_COLORS,
  WEAPON_SLOTS,
  ZANPAKUTO_TABS,
} from '../../../../game-core/src/zanpakuto/zanpakuto'
import type {
  ZanpakutoCrystal,
  ZanpakutoTabName,
  ZanpakutoView,
} from '../../../../shared/src/schemas/zanpakuto'
import { errorMessage } from '../api'
import { ConfirmDialog } from '../inventory/dialogs'
import { ItemMenu, menuAt, type MenuEntry } from '../ItemMenu'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { CrystalCell, LockedCell } from './CrystalCell'
import { InfoWindow, UnlockSpiritSlot } from './dialogs'
import { BulkRefineWindow, RefineWindow } from './RefineWindow'
import { statColor, statText, uiArt, useZanpakuto, useZanpakutoAction, type Run } from './shared'

const TAB_TITLES: Record<ZanpakutoTabName, string> = {
  sharp: 'Sharp',
  blunt: 'Blunt',
  fist: 'Fist',
}
/** Weapon art position on the tab's background panel. */
const ART: Record<ZanpakutoTabName, { left: number; top: number }> = {
  sharp: { left: 235, top: 20 },
  blunt: { left: 180, top: 50 },
  fist: { left: 190, top: 55 },
}
const TAB_PANEL_ID = 'zanpakuto-tab-panel'

export interface Confirm {
  text: string
  onAccept: () => void
}

export function ZanpakutoWindow({ onClose }: { onClose: () => void }) {
  const zanpakuto = useZanpakuto()
  const action = useZanpakutoAction()
  const run: Run = (path, body, after) => action.mutate({ path, body }, { onSuccess: after })
  const error = zanpakuto.error ?? action.error
  return (
    <Dialog title="Zanpakuto" onClose={onClose} className="w-[930px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {zanpakuto.isPending && <p>Loading Zanpakuto...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {zanpakuto.data && (
          <ZanpakutoBody data={zanpakuto.data} busy={action.isPending} run={run} />
        )}
      </div>
    </Dialog>
  )
}

function ZanpakutoBody({ data, busy, run }: { data: ZanpakutoView; busy: boolean; run: Run }) {
  const [tab, setTab] = useState<ZanpakutoTabName>(data.activeTab)
  const [menu, setMenu] = useState<{ crystal: ZanpakutoCrystal; at: { x: number; y: number } }>()
  const [confirm, setConfirm] = useState<Confirm>()
  const [dialog, setDialog] = useState<
    'info' | { unlock: number } | { refine: string } | { bulk: string }
  >()
  const close = () => setDialog(undefined)
  const openMenu = (crystal: ZanpakutoCrystal) => (event: MouseEvent<HTMLButtonElement>) =>
    setMenu({ crystal, at: menuAt(event) })
  const refine = (crystal: ZanpakutoCrystal) => () => setDialog({ refine: crystal.id })
  const entries = (crystal: ZanpakutoCrystal): MenuEntry[] =>
    data.spirit.some((c) => c?.id === crystal.id)
      ? [
          { label: 'Equip Crystal', onSelect: () => run('/equip', { id: crystal.id }) },
          { label: 'Refine', onSelect: refine(crystal) },
          {
            label: 'Sell',
            onSelect: () =>
              setConfirm({
                text: `Sell this crystal for ${crystal.coins} SC?`,
                onAccept: () => run('/sell', { id: crystal.id }),
              }),
          },
        ]
      : [{ label: 'Unequip Crystal', onSelect: () => run('/unequip', { id: crystal.id }) }]
  return (
    <div className="relative flex gap-5" data-menu-root>
      <GameButton small className="absolute -top-1 right-0 z-10" onClick={() => setDialog('info')}>
        Info
      </GameButton>
      <section
        aria-label="Spirit inventory"
        className="game-inset relative h-[350px] w-[300px] shrink-0 p-2.5"
      >
        <h3 className="game-title-tag mb-3 inline-block w-[200px] font-bold">
          Zanpakuto Spirit Part
        </h3>
        <ul className="grid grid-cols-[repeat(4,76px)] gap-y-[30px]">
          {data.spirit.map((crystal, slot) => (
            <li key={slot}>
              {data.lockedSlots.includes(slot) ? (
                <LockedCell
                  label={`Spirit slot ${slot + 1}: locked`}
                  onClick={() => setDialog({ unlock: slot })}
                />
              ) : (
                <CrystalCell
                  label={`Spirit slot ${slot + 1}: ${crystal?.name ?? 'empty'}`}
                  crystal={crystal}
                  onOpen={crystal ? openMenu(crystal) : undefined}
                />
              )}
            </li>
          ))}
        </ul>
        <p className="absolute bottom-2 left-2 font-bold">SC: {data.coins}</p>
      </section>
      <section aria-label="Weapon tabs" className="w-[560px]">
        <Tabs
          label="Weapon"
          panelId={TAB_PANEL_ID}
          tabs={ZANPAKUTO_TABS.map((id) => ({ id, title: TAB_TITLES[id] }))}
          active={tab}
          onChange={setTab}
        />
        <WeaponTab
          tab={tab}
          data={data}
          onOpen={openMenu}
          onRefine={(crystal) => setDialog({ refine: crystal.id })}
        />
      </section>
      {menu && (
        <ItemMenu
          title={menu.crystal.name}
          at={menu.at}
          entries={entries(menu.crystal)}
          onClose={() => setMenu(undefined)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          onAccept={confirm.onAccept}
          onClose={() => setConfirm(undefined)}
        />
      )}
      {dialog === 'info' && <InfoWindow onClose={close} />}
      {typeof dialog === 'object' && 'unlock' in dialog && (
        <UnlockSpiritSlot
          slot={dialog.unlock}
          busy={busy}
          onPay={(currency) => {
            run('/slots/unlock', { slot: dialog.unlock, currency })
            close()
          }}
          onClose={close}
        />
      )}
      {typeof dialog === 'object' && 'refine' in dialog && (
        <RefineWindow
          id={dialog.refine}
          data={data}
          busy={busy}
          run={run}
          onBulk={() => setDialog({ bulk: dialog.refine })}
          onClose={close}
        />
      )}
      {typeof dialog === 'object' && 'bulk' in dialog && (
        <BulkRefineWindow id={dialog.bulk} data={data} busy={busy} run={run} onClose={close} />
      )}
    </div>
  )
}

/** Component `Z` #17710: status, weapon art and the tab's 6 slots in two columns of 3. */
function WeaponTab({
  tab,
  data,
  onOpen,
  onRefine,
}: {
  tab: ZanpakutoTabName
  data: ZanpakutoView
  onOpen: (crystal: ZanpakutoCrystal) => (event: MouseEvent<HTMLButtonElement>) => void
  onRefine: (crystal: ZanpakutoCrystal) => void
}) {
  const active = tab === data.activeTab
  return (
    <div id={TAB_PANEL_ID} role="tabpanel" className="game-inset relative h-[360px] w-[560px]">
      <p
        className="absolute top-5 left-2.5 w-[150px] font-bold"
        style={{ color: active ? '#00b034' : 'red' }}
        title="Crystal bonuses are not applied in battle yet."
      >
        {active ? 'Zanpakuto activated' : 'Wrong weapon'}
      </p>
      <div className="absolute top-[50px] left-0 h-[310px] w-[560px]">
        <img src={uiArt('bg')} alt="" className="absolute top-0 left-5" />
        <img src={uiArt(tab)} alt="" className="absolute" style={ART[tab]} />
        {Array.from({ length: WEAPON_SLOTS }, (_, index) => {
          const crystal = data.tabs[tab][index] ?? null
          const column = index > 2 ? 1 : 0
          const row = index % 3
          const label = `${TAB_TITLES[tab]} slot ${index + 1}`
          return (
            <div key={index}>
              <div className="absolute" style={{ left: 470 * column + 20, top: 85 * row + 48 }}>
                {data.lockedWeaponSlots.includes(index) ? (
                  <LockedCell label={`${label}: locked`} />
                ) : (
                  <CrystalCell
                    label={`${label}: ${crystal?.name ?? 'empty'}`}
                    crystal={crystal}
                    onOpen={crystal ? onOpen(crystal) : undefined}
                  />
                )}
              </div>
              {crystal && (
                <>
                  <p
                    className="absolute w-[150px] truncate font-bold"
                    style={{
                      left: 275 * column + 80,
                      top: 85 * row + 50,
                      color: TIER_COLORS[crystal.category],
                    }}
                  >
                    {crystal.name}
                  </p>
                  <StatList crystal={crystal} left={275 * column + 80} top={85 * row + 75} />
                  <GameButton
                    small
                    className="absolute h-5 w-[50px] min-w-0!"
                    style={{ left: 470 * column + 17, top: 85 * row + 95 }}
                    onClick={() => onRefine(crystal)}
                  >
                    Refine
                  </GameButton>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** "{stat}: {value}" lines; a repeated stat id only counts once and is struck through. */
function StatList({
  crystal,
  left,
  top,
}: {
  crystal: ZanpakutoCrystal
  left: number
  top: number
}) {
  return (
    <ul className="absolute w-[150px] text-[11px]" style={{ left, top }}>
      {crystal.stats.map((stat, index) => {
        const repeated = crystal.stats.findIndex(([id]) => id === stat[0]) < index
        return (
          <li
            key={index}
            className={repeated ? 'line-through' : undefined}
            style={repeated ? undefined : { color: statColor(crystal.category, stat) }}
          >
            {statText(stat)}
          </li>
        )
      })}
    </ul>
  )
}
