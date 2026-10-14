// Reborn's Ninja House (reborn-windows-M-Z-hud.md, "Ninja House"): 550x310, a BigBG4 board of
// bloodline NPC cards (127.5x130, 4x2 a page) sorted by required level. Each card has the
// portrait, Talk (opens the Ninja Saga), a Preview hover with the limit's stats, the NPC's name,
// "Drops: SM LvN+" (our Slot Machine is the pub fight), Amity and the required level. The Ninja
// Saga (475x204, like the Village Elder) holds the item turn-in.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  BloodlineLimit,
  BloodlinesView,
  BloodlineTurnInResult,
} from '../../../../shared/src/schemas/bloodlines'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import {
  bloodlinesKey,
  formatStat,
  LIMIT_ITEM_NAMES,
  limitIcon,
  limitName,
  npcIcon,
  npcName,
} from './index'
import { bigBg } from './panels'

const PAGE_SIZE = 8
const COLUMNS = 4
const CARD_STEP_X = 134
const CARD_STEP_Y = 135

const byLevel = (a: BloodlineLimit, b: BloodlineLimit) =>
  a.requiredLevel - b.requiredLevel || a.limitId - b.limitId
const itemNameOf = (limit: BloodlineLimit) => LIMIT_ITEM_NAMES[limit.unlockItem] ?? limit.unlockItem

export const useBloodlines = () =>
  useQuery({
    queryKey: bloodlinesKey,
    queryFn: () => api<BloodlinesView>('/api/game/bloodlines'),
  })

export function NinjaHouseWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const bloodlines = useBloodlines()
  const [page, setPage] = useState(0)
  const [talking, setTalking] = useState<number | null>(null)
  const data = bloodlines.data
  const limits = data ? [...data.limits].sort(byLevel) : []
  const pages = Math.max(1, Math.ceil(limits.length / PAGE_SIZE))
  const shown = limits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const npc = data?.limits.find((l) => l.limitId === talking)
  return (
    <Dialog title="Ninja House" onClose={onClose} className="game-window-bare w-[560px]">
      <div className="h-[310px] w-[550px] p-[5px] text-[12px] text-black" style={bigBg(1)}>
        <div className="relative h-[300px] w-[540px]" style={bigBg(4)}>
          {bloodlines.isPending && <p className="p-3">Loading the Ninja House...</p>}
          {bloodlines.isError && (
            <div className="p-3">
              <Notice tone="error">{errorMessage(bloodlines.error)}</Notice>
            </div>
          )}
          <ul aria-label="Ninja House">
            {shown.map((limit, index) => (
              <NpcCard
                key={limit.limitId}
                limit={limit}
                left={5 + CARD_STEP_X * (index % COLUMNS)}
                top={5 + CARD_STEP_Y * Math.floor(index / COLUMNS)}
                onTalk={() => setTalking(limit.limitId)}
              />
            ))}
          </ul>
          {data && (
            <nav
              aria-label="Pages"
              className="absolute bottom-[5px] left-1/2 flex -translate-x-1/2 items-center gap-2"
            >
              <GameButton
                small
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {'<'}
              </GameButton>
              <span className="font-bold">
                {page + 1}/{pages}
              </span>
              <GameButton
                small
                aria-label="Next page"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
              >
                {'>'}
              </GameButton>
            </nav>
          )}
        </div>
      </div>
      {data && npc && (
        <NinjaSaga limit={npc} data={data} character={character} onClose={() => setTalking(null)} />
      )}
    </Dialog>
  )
}

function NpcCard({
  limit,
  left,
  top,
  onTalk,
}: {
  limit: BloodlineLimit
  left: number
  top: number
  onTalk: () => void
}) {
  const [preview, setPreview] = useState(false)
  const tooltipId = `bloodline-preview-${limit.limitId}`
  return (
    <li
      aria-label={npcName(limit)}
      className="absolute h-[130px] w-[127.5px] leading-[15px]"
      style={{ ...bigBg(3), left, top }}
    >
      <img
        src={npcIcon(limit.npcId)}
        alt=""
        className="absolute top-[5px] left-[5px] size-[55px] object-cover object-top"
      />
      <GameButton small className="absolute! top-[5px] left-[65px] h-5 w-[50px]" onClick={onTalk}>
        Talk
      </GameButton>
      <button
        type="button"
        aria-describedby={preview ? tooltipId : undefined}
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={() => setPreview(false)}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        className="absolute top-[30px] left-[65px] cursor-help text-[11px] text-[#1f4fa0] underline"
      >
        Preview
      </button>
      {preview && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute top-[45px] left-[60px] z-10 w-[170px] p-[6px] text-[11px] text-[whitesmoke]"
          style={{
            border: 0,
            borderImage:
              'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
          }}
        >
          <img src={limitIcon(limit.limitId)} alt="" className="float-left mr-1 size-8" />
          <p className="font-bold text-[#f0d060]">{limitName(limit)}</p>
          <ul>
            {limit.stats.map((stat) => (
              <li key={stat.field}>{formatStat(stat)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="absolute top-[60px] left-[5px] w-[117px] truncate font-bold">
        {npcName(limit)}
      </p>
      <p className="absolute top-[75px] left-[5px]" title="Slot Machine (pub fights)">
        {limit.dropLevel === null ? 'Drops: SM' : `Drops: SM Lv${limit.dropLevel}+`}
      </p>
      <p className="absolute top-[90px] left-[5px]">
        Amity {limit.amity}/{limit.amityNeeded}
      </p>
      <p className="absolute top-[105px] left-[5px]">Lv.{limit.requiredLevel}</p>
    </li>
  )
}

/** Reborn's bloodline NPC menu: the NPC, what to bring, Amity and Turn In. */
function NinjaSaga({
  limit,
  data,
  character,
  onClose,
}: {
  limit: BloodlineLimit
  data: BloodlinesView
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const turnIn = useMutation({
    mutationFn: () =>
      api<BloodlineTurnInResult>(`/api/game/bloodlines/${limit.limitId}/turn-in`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      const after = result.limits.find((l) => l.limitId === limit.limitId)
      showToast(
        after?.unlocked ? 'Bloodline unlocked.' : `+${result.amityPerTurnIn} Amity.`,
        'success',
      )
      queryClient.setQueryData(bloodlinesKey, result)
      apply(result)
    },
  })
  const item = itemNameOf(limit)
  const tooLow = character.level < limit.requiredLevel
  const left = data.turnInsPerDay - data.turnInsUsed
  const talk = limit.unlocked
    ? `You have learned ${limitName(limit)}. Activate it with Blood Limit in your Inventory.`
    : tooLow
      ? `Bring me ${item}. Come back at level ${limit.requiredLevel}.`
      : `Bring me ${data.itemsPerTurnIn} ${item} and our bond will grow. Turn-ins left today: ${left}/${data.turnInsPerDay}.`
  return (
    <Dialog title="Ninja Saga" onClose={onClose} className="game-window-bare w-[485px]">
      <div className="flex h-[204px] w-[475px] gap-[5px] text-[12px] text-black">
        <div className="game-npc-card relative h-[204px] w-[161px] shrink-0">
          <div className="game-npc-frame absolute top-[13px] left-[13px] h-[182px] w-[137px] overflow-hidden">
            <img
              src={npcIcon(limit.npcId)}
              alt={npcName(limit)}
              className="size-full object-contain"
            />
          </div>
        </div>
        <div className="flex w-[309px] flex-col gap-[5px]">
          <p className="h-[65px] overflow-auto p-[6px] leading-[15px]" style={bigBg(1)}>
            {talk}
          </p>
          <div className="relative h-[134px] p-[5px]" style={bigBg(1)}>
            <h3 className="font-bold">Description</h3>
            <ItemIcon
              itemId={limit.unlockItem}
              name={item}
              className="absolute! top-[20px] left-[5px] size-7"
            />
            <p className="absolute top-[25px] left-[38px]">
              {item} x{data.itemsPerTurnIn}{' '}
              <span className="text-[#5c4a2a]">(You have {limit.itemsHeld})</span>
            </p>
            <h3 className="absolute top-[50px] left-[5px] font-bold">Amity</h3>
            <p className="absolute top-[70px] left-[5px]">
              {limit.amity}/{limit.amityNeeded}
            </p>
            {turnIn.isError && (
              <p role="alert" className="absolute top-[85px] left-[5px] text-[#a01010]">
                {errorMessage(turnIn.error)}
              </p>
            )}
            <GameButton
              className="absolute! top-[100px] left-[117px]"
              disabled={
                turnIn.isPending ||
                tooLow ||
                limit.amity >= limit.amityNeeded ||
                limit.itemsHeld < data.itemsPerTurnIn ||
                left <= 0
              }
              onClick={() => turnIn.mutate()}
            >
              Turn In
            </GameButton>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
