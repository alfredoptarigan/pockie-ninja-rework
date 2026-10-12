// Demon City Guard menu (EntryTollGateScene.js): gate select with today's tries, the run's
// progress and fights, the card flip after a clear, and the crystal exchange.
import type {
  CardTakeResult,
  Character,
  GateRunView,
  GatesView,
  GateSummary,
  TollGateFightResult,
} from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'
import type { Replay } from '../types'
import { useGatePost, useGates } from './api'
import { CardFlip, TakenCards } from './CardFlip'
import { GateFight, rewardText } from './GateFight'

const TIER_NAMES: Record<GateSummary['tier'], string> = {
  tutorial: 'Training',
  hard: 'Hard',
  normal: 'Normal',
  pass: 'Abyss Pass',
}
const gateName = (gate: { id: number; nameKey: string }) =>
  plainText(gate.nameKey, `Toll Gate ${gate.id}`)

type Fight = TollGateFightResult<Replay>

export function TollGateWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const gates = useGates()
  const [tab, setTab] = useState<'gates' | 'exchange'>('gates')
  const [fight, setFight] = useState<Fight | null>(null)
  const [last, setLast] = useState<Fight | null>(null)
  const [taken, setTaken] = useState<CardTakeResult | null>(null)

  if (fight) {
    return (
      <GateFight
        result={fight}
        character={character}
        onDone={() => {
          setLast(fight)
          setFight(null)
        }}
      />
    )
  }
  const data = gates.data
  return (
    <Dialog title="Demon City Guard" onClose={onClose} className="w-[40rem]">
      {gates.isPending && <p>Loading...</p>}
      {gates.isError && <Notice tone="error">{errorMessage(gates.error)}</Notice>}
      {taken ? (
        <TakenCards
          result={taken}
          onDone={() => {
            setTaken(null)
            setLast(null)
          }}
        />
      ) : data?.run ? (
        <RunPanel
          run={data.run}
          gate={data.gates.find((g) => g.id === data.run!.gateId)}
          last={last}
          onFight={setFight}
          onTaken={setTaken}
        />
      ) : (
        data && (
          <>
            <Tabs
              label="Guard menu"
              panelId="toll-gate-panel"
              tabs={[
                { id: 'gates', title: 'Toll Gates' },
                { id: 'exchange', title: 'Convert Tool' },
              ]}
              active={tab}
              onChange={setTab}
            />
            <div id="toll-gate-panel" role="tabpanel" className="mt-2">
              {last && !last.won && <Notice>You were defeated. The run is over.</Notice>}
              {tab === 'gates' ? (
                <GateSelect view={data} character={character} />
              ) : (
                <Exchange view={data} />
              )}
            </div>
          </>
        )
      )}
    </Dialog>
  )
}

function GateSelect({ view, character }: { view: GatesView; character: Character }) {
  const enter = useGatePost<{ run: GateRunView; character: Character }>()
  return (
    <div className="flex flex-col gap-2">
      <p>
        Tries left today: {view.triesLeft} / {view.maxTries}
      </p>
      <ul className="flex flex-col gap-1">
        {view.gates.map((gate) => (
          <li
            key={gate.id}
            className="flex items-center gap-2 rounded border border-wood-light bg-white/40 p-2"
          >
            <div className="flex-1">
              <p className="font-bold">{gateName(gate)}</p>
              <p className="text-xs">
                {TIER_NAMES[gate.tier]} - Level {gate.minLevel}-{gate.maxLevel} - {gate.subGates}{' '}
                {gate.subGates === 1 ? 'stage' : 'stages'}
                {gate.itemId && ` - needs ${itemName(gate.itemId)}`}
              </p>
            </div>
            <GameButton
              small
              aria-label={`Enter ${gateName(gate)}`}
              disabled={enter.isPending || view.triesLeft === 0 || character.level < gate.minLevel}
              onClick={() => enter.mutate({ path: 'enter', body: { gateId: gate.id } })}
            >
              Enter
            </GameButton>
          </li>
        ))}
      </ul>
      {enter.error && <Notice tone="error">{errorMessage(enter.error)}</Notice>}
    </div>
  )
}

function RunPanel({
  run,
  gate,
  last,
  onFight,
  onTaken,
}: {
  run: GateRunView
  gate?: GateSummary
  last: Fight | null
  onFight: (fight: Fight) => void
  onTaken: (result: CardTakeResult) => void
}) {
  const fight = useGatePost<Fight>()
  const leave = useGatePost<{ character: Character }>()
  const busy = fight.isPending || leave.isPending
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold">{gate ? gateName(gate) : `Toll Gate ${run.gateId}`}</h3>
      <ol aria-label="Stages" className="flex gap-2">
        {run.points.map((count, sub) => (
          <li key={sub} className="text-xs">
            Stage {sub + 1}:{' '}
            {sub < run.subGate || run.cleared
              ? 'cleared'
              : sub === run.subGate
                ? `point ${run.point + 1} of ${count}`
                : 'ahead'}
          </li>
        ))}
      </ol>
      {last?.won && <p role="status">Victory! {rewardText(last.rewards)}.</p>}
      {run.cards ? (
        <CardFlip cards={run.cards} onTaken={onTaken} />
      ) : (
        <div className="flex gap-2">
          <GameButton
            small
            disabled={busy}
            onClick={() => fight.mutate({ path: 'run/fight' }, { onSuccess: onFight })}
          >
            Fight
          </GameButton>
          <GameButton small disabled={busy} onClick={() => leave.mutate({ path: 'run/exit' })}>
            Leave
          </GameButton>
        </div>
      )}
      {(fight.error || leave.error) && (
        <Notice tone="error">{errorMessage(fight.error ?? leave.error)}</Notice>
      )}
    </div>
  )
}

function Exchange({ view }: { view: GatesView }) {
  const convert = useGatePost<{ character: Character }>()
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {view.exchanges.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 rounded border border-wood-light bg-white/40 p-2 text-xs"
          >
            <ItemIcon itemId={row.srcItemId} name={itemName(row.srcItemId)} className="size-7" />
            <span className="flex-1">
              {row.srcCount} x {itemName(row.srcItemId)}
              {row.commonItemId && ` (or ${itemName(row.commonItemId)})`} for {row.destCount} x{' '}
              {itemName(row.destItemId)}
            </span>
            <ItemIcon itemId={row.destItemId} name={itemName(row.destItemId)} className="size-7" />
            <GameButton
              small
              aria-label={`Convert for ${itemName(row.destItemId)}`}
              disabled={convert.isPending}
              onClick={() => convert.mutate({ path: 'exchange', body: { exchangeId: row.id } })}
            >
              Convert
            </GameButton>
          </li>
        ))}
      </ul>
      {convert.isSuccess && <Notice>Converted.</Notice>}
      {convert.error && <Notice tone="error">{errorMessage(convert.error)}</Notice>}
    </div>
  )
}
