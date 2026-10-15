// The Inventory's server requests. Reborn shows no success notice: a failure becomes a red toast,
// and only what the player could not see otherwise (a finished quest, a card from a box) a blue one.
import { useIsMutating } from '@tanstack/react-query'
import { errorMessage, useUseItem } from '../api'
import {
  useEquipFromBag,
  useLockItem,
  useMoveItem,
  useSellItems,
  useSetActiveSet,
  useSortBag,
  useSplitItem,
  useSwapItems,
  useUnequipTo,
  useUseMultiple,
} from '../bag-api'
import { cardName } from '../cards'
import { useAppraise, useRepair } from '../forge/api'
import { completedNotice } from '../QuestLog'
import { showToast } from '../toast'

type Card = { cardId: number; nameKey: string }

/** The quest and card news in a result, if any. */
export function newsOf(result: unknown) {
  const {
    completed = [],
    card,
    cards = [],
  } = (result ?? {}) as {
    completed?: number[]
    card?: Card
    cards?: Card[]
  }
  const found = card ? [card, ...cards] : cards
  const cardsText = found.length ? `You found ${found.map(cardName).join(', ')}.` : ''
  return `${cardsText}${completedNotice(completed)}`.trim()
}

/** Runs a request; resolves to its result, or undefined after a failure toast. */
export async function attempt<T>(request: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await request()
    const news = newsOf(result)
    if (news) showToast(news, 'info')
    return result
  } catch (error) {
    showToast(errorMessage(error), 'failure')
    return undefined
  }
}

export function useBagRequests() {
  const use = useUseItem()
  const equip = useEquipFromBag()
  const move = useMoveItem()
  const swap = useSwapItems()
  const unequip = useUnequipTo()
  const lock = useLockItem()
  const split = useSplitItem()
  const useMany = useUseMultiple()
  const sell = useSellItems()
  const sort = useSortBag()
  const switchSet = useSetActiveSet()
  const appraise = useAppraise()
  const repair = useRepair()
  const pending = useIsMutating()
  return {
    busy: pending > 0,
    use: use.mutateAsync,
    equip: equip.mutateAsync,
    move: move.mutateAsync,
    swap: swap.mutateAsync,
    unequip: unequip.mutateAsync,
    lock: lock.mutateAsync,
    split: split.mutateAsync,
    useMany: useMany.mutateAsync,
    sell: sell.mutateAsync,
    sort: sort.mutateAsync,
    switchSet: switchSet.mutateAsync,
    appraise: appraise.mutateAsync,
    repair: repair.mutateAsync,
  }
}
