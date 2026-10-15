// Reborn's Clan Protection (`Oh`, reborn-windows-A-L.md "Clan Protection"; 520x420): the
// Protection background, "Attempts Left: N" (3 a day), the Bloodboil Demon (click it or Battle to
// fight) and a Notice for errors. A fight plays its replay, then Victory / Defeat with the reward.
import type { Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ProtectionFightResult } from '../../../../shared/src/schemas/clan-activities'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult, useCharacter } from '../api'
import { ResultWindow } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'
import { activityKeys, CLAN_EVENTS, useProtection } from './activities-api'
import { MessageDialog } from './NinjaGarden'

type Fight = ProtectionFightResult<Replay>
const ASSETS = '/assets/reborn/clan/Protection'

function FightResult({
  fight,
  character,
  onDone,
}: {
  fight: Fight
  character: Character
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [watched, setWatched] = useState(false)
  if (!watched)
    return (
      <BattleReplayMount
        replay={fight.replay}
        clothing={character.clothing}
        monsterIds={[fight.npcId]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(activityKeys.protection, fight.protection)
          apply(fight)
          setWatched(true)
        }}
      />
    )
  return (
    <ResultWindow
      title={fight.won ? 'Victory' : 'Defeat'}
      story={
        fight.won
          ? `You drove off the ${fight.protection.boss.name}.`
          : `The ${fight.protection.boss.name} was too strong.`
      }
      note={`Attempts Left: ${fight.protection.fightsRemaining}`}
      columns={[
        { label: 'Clan Points', value: fight.reward.clanPoints, color: '#2e7d32' },
        { label: 'Bankai EXP', value: fight.reward.bankaiExp, color: '#1565c0' },
      ]}
      findTitle="Clan Protection"
      finds={[]}
      emptyFind="Come back tomorrow for new attempts."
      onClose={onDone}
    />
  )
}

export function ProtectionWindow({ onClose }: { onClose: () => void }) {
  const protection = useProtection()
  const character = useCharacter()
  const [notice, setNotice] = useState<string | null>(null)
  const fight = useMutation({
    mutationFn: () => api<Fight>(`${CLAN_EVENTS}/protection/fight`, { method: 'POST' }),
    onError: (error) => setNotice(errorMessage(error)),
  })
  const left = protection.data?.fightsRemaining ?? 0
  const disabled = fight.isPending || !protection.data || left <= 0
  const start = () => {
    if (left <= 0) setNotice('No fights remaining')
    else if (!disabled) fight.mutate()
  }
  if (fight.data && character.data)
    return (
      <FightResult fight={fight.data} character={character.data} onDone={() => fight.reset()} />
    )
  return (
    <Dialog title="Clan Protection" onClose={onClose} className="w-[520px]">
      {protection.isError && <Notice tone="error">{errorMessage(protection.error)}</Notice>}
      <div
        className="relative h-[420px] overflow-hidden rounded-lg bg-cover bg-center"
        style={{ backgroundImage: `url(${ASSETS}/bg.webp)` }}
      >
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/20 via-black/10 to-black/40" />
        <p
          className={`absolute top-3 right-4 rounded-md border border-[rgba(255,150,50,.3)] bg-black/70 px-4 py-2 text-[14px] font-bold [text-shadow:0_1px_3px_#000] ${
            left > 0 ? 'text-[#ffcc00]' : 'text-[#ff6666]'
          }`}
        >
          Attempts Left: {left}
        </p>
        <button
          type="button"
          aria-label={`Fight the ${protection.data?.boss.name ?? 'boss'}`}
          title={
            protection.data
              ? `${protection.data.boss.name} (Lv. ${protection.data.boss.level})`
              : undefined
          }
          disabled={disabled}
          onClick={start}
          className="absolute top-[42%] left-1/2 -translate-1/2 disabled:cursor-not-allowed"
        >
          <img
            src={`${ASSETS}/boss.webp`}
            alt=""
            className="h-[220px] drop-shadow-[0_4px_8px_#000]"
          />
        </button>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
          <GameButton
            disabled={disabled}
            onClick={start}
            className="h-[28px] w-[120px] text-[14px]"
          >
            {fight.isPending ? '...' : 'Battle'}
          </GameButton>
        </div>
      </div>
      {notice && <MessageDialog onClose={() => setNotice(null)}>{notice}</MessageDialog>}
    </Dialog>
  )
}
