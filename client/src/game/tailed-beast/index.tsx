// Tailed Beast (M5 task 13, decision 27) laid out after Reborn's Tailed Beast map
// (reborn-windows-A-L.md / M-Z-hud.md): today's beasts on the event map, a beast opens "Fight
// {name}", and the bottom bar opens Kage Ninja (Kage Rewards, Damage Rewards), Leaderboard, our
// Essence Shop and Back to Hall. ponytail: the map's Info button is left out (its text is not in
// the spec) and the beasts sit side by side, not at Reborn's map positions.
import type { Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  TailedBeastFightResult,
  TailedBeastView,
} from '../../../../shared/src/schemas/tailed-beast'
import { api } from '../../lib/api'
import { errorMessage } from '../api'
import { GateFight } from '../gates/GateFight'
import { Dialog, GameButton, Notice } from '../skin'
import type { Replay } from '../types'
import { beastName, number, tailedBeastKey, useTailedBeast, VILLAGES } from './api'
import { BeastPortrait } from './BeastPortrait'
import { FightBeastWindow } from './FightBeastWindow'
import { LeaderboardWindow } from './LeaderboardWindow'
import {
  BeastRewardsWindow,
  EssenceShopWindow,
  KageLevelNinjaWindow,
  KageRewardsWindow,
} from './RewardWindows'

export { beastAtlas } from './BeastPortrait'

type Fight = TailedBeastFightResult<Replay>
type Panel = 'kage' | 'kageRewards' | 'rewards' | 'leaderboard' | 'shop'
/** Reborn re-sends the fight this long after an auto fight closes. */
const AUTO_DELAY_MS = 400
const BAR = 'h-[25px] !min-w-0 !px-0'

export function TailedBeastWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const view = useTailedBeast()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [fighting, setFighting] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
  const [lastMode, setLastMode] = useState(0)
  const [queued, setQueued] = useState(false)
  const [message, setMessage] = useState('')
  const [replay, setReplay] = useState<Fight | null>(null)
  const fight = useMutation({
    mutationFn: (body: { beast: number; mode: number }) =>
      api<Fight>('/api/game/tailed-beast/fight', { method: 'POST', body }),
    onSuccess: (result) => {
      setMessage('')
      setReplay(result)
    },
    onError: () => setAuto(false),
  })
  const start = (mode: number) => {
    if (fighting === null) return
    setLastMode(mode)
    fight.mutate({ beast: fighting, mode })
  }
  useEffect(() => {
    if (!queued || !auto || fighting === null) return
    const timer = setTimeout(() => {
      setQueued(false)
      fight.mutate({ beast: fighting, mode: lastMode })
    }, AUTO_DELAY_MS)
    return () => clearTimeout(timer)
    // fight.mutate is stable; the effect runs once per finished fight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, auto, fighting, lastMode])

  if (replay) {
    return (
      <GateFight
        result={replay}
        character={character}
        onDone={() => {
          queryClient.setQueryData(tailedBeastKey, replay.tailedBeast)
          setMessage(
            `You dealt ${number(replay.damage)} damage and earned ${number(replay.honor)} Honor` +
              (replay.killed ? '. You landed the final blow!' : '.'),
          )
          setReplay(null)
          if (auto && !replay.killed) setQueued(true)
          else setAuto(false)
        }}
      />
    )
  }
  const data = view.data
  const ticketsLeft = data ? data.tickets.perDay - data.tickets.used : 0
  const close = () => setPanel(null)
  const beast = data?.beasts.find((b) => b.id === fighting)
  return (
    <Dialog title="Tailed Beast" onClose={onClose} className="game-window-bare w-[610px]">
      <div className="flex flex-col gap-[5px] font-game text-xs text-black">
        {view.isPending && <p>Loading the Tailed Beast event...</p>}
        {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
        {data && (
          <>
            <BeastMap view={data} onPick={setFighting} />
            <p className="game-value-box px-2 py-1">
              Tickets left today: {ticketsLeft}/{data.tickets.perDay}. Honor:{' '}
              {number(data.me.honor)}. Essence: {number(data.me.essence)}. Fights this week:{' '}
              {data.me.fights}. Village: {VILLAGES[data.me.village]}. Resets every Monday at 00:00
              UTC.
            </p>
            {message && <Notice>{message}</Notice>}
            <ButtonBar onPanel={setPanel} onClose={onClose} />
            {beast && (
              <FightBeastWindow
                beast={beast.id}
                name={beastName(beast.nameKey, beast.id)}
                pools={beast.pools}
                ticketsLeft={ticketsLeft}
                busy={fight.isPending || (queued && auto)}
                error={fight.error ? errorMessage(fight.error) : null}
                auto={auto}
                onAuto={(on) => {
                  setAuto(on)
                  if (!on) setQueued(false)
                }}
                onFight={start}
                onClose={() => {
                  setAuto(false)
                  setQueued(false)
                  setFighting(null)
                }}
              />
            )}
            <Panels
              panel={panel}
              view={data}
              fetching={view.isFetching}
              onRefresh={view.refetch}
              onPanel={setPanel}
              onClose={close}
            />
          </>
        )}
      </div>
    </Dialog>
  )
}

/** Reborn's event map with today's beasts; a beast opens its Fight window. */
function BeastMap({ view, onPick }: { view: TailedBeastView; onPick: (beast: number) => void }) {
  return (
    <div
      className="flex h-[360px] w-[600px] items-center justify-around rounded bg-cover bg-center"
      style={{ backgroundImage: 'url(/assets/reborn/scenes/tailedBeast/map.webp)' }}
    >
      {view.beasts.map((beast) => {
        const name = beastName(beast.nameKey, beast.id)
        const alive = beast.pools.filter((pool) => pool.hpLeft > 0).length
        return (
          <button
            key={beast.id}
            type="button"
            onClick={() => onPick(beast.id)}
            className="flex flex-col items-center gap-1 rounded p-1 hover:bg-white/20"
          >
            <BeastPortrait beast={beast.id} name={name} size={120} />
            <span className="rounded bg-black/75 px-2 py-[1px] font-bold text-[#ffd76a]">
              {name}
            </span>
            <span className="rounded bg-black/60 px-2 text-[10px] text-white">
              {alive === 0 ? 'Defeated' : `${alive} of ${beast.pools.length} difficulties standing`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ButtonBar({ onPanel, onClose }: { onPanel: (panel: Panel) => void; onClose: () => void }) {
  return (
    <div role="group" aria-label="Tailed Beast menu" className="flex justify-center gap-[5px]">
      <GameButton className={`${BAR} w-[85px]`} onClick={() => onPanel('kage')}>
        Kage Ninja
      </GameButton>
      <GameButton className={`${BAR} w-[85px]`} onClick={() => onPanel('leaderboard')}>
        Leaderboard
      </GameButton>
      <GameButton className={`${BAR} w-[100px]`} onClick={() => onPanel('shop')}>
        Essence Shop
      </GameButton>
      <GameButton className={`${BAR} w-[100px]`} onClick={onClose}>
        Back to Hall
      </GameButton>
    </div>
  )
}

function Panels({
  panel,
  view,
  fetching,
  onRefresh,
  onPanel,
  onClose,
}: {
  panel: Panel | null
  view: TailedBeastView
  fetching: boolean
  onRefresh: () => Promise<unknown>
  onPanel: (panel: Panel) => void
  onClose: () => void
}) {
  if (panel === 'kage')
    return (
      <KageLevelNinjaWindow
        view={view}
        onKageRewards={() => onPanel('kageRewards')}
        onDamageRewards={() => onPanel('rewards')}
        onClose={onClose}
      />
    )
  if (panel === 'kageRewards') return <KageRewardsWindow view={view} onClose={onClose} />
  if (panel === 'rewards') return <BeastRewardsWindow view={view} onClose={onClose} />
  if (panel === 'shop') return <EssenceShopWindow view={view} onClose={onClose} />
  if (panel === 'leaderboard')
    return (
      <LeaderboardWindow view={view} fetching={fetching} onRefresh={onRefresh} onClose={onClose} />
    )
  return null
}
