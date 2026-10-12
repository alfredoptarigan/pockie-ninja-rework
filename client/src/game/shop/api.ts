import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'

export type Currency = 'stone' | 'gold' | 'giftCoupon'
export interface StockItem {
  slot: number
  itemId: string
  priceStone: number | null
  priceGold: number | null
  priceGiftCoupon: number | null
  bound: boolean
  appraised: boolean
  identifyCount: number
}
export interface ShopView {
  tabs: {
    shopType: number
    stock: StockItem[]
    refreshAt: string
    freeRestocks: number
    restockCosts: Partial<Record<Currency, number>>
  }[]
  wholesale: {
    boxId: string | number
    stock: { itemId: string; priceStone: number; maxStack: number }[]
  }
  sellable: {
    inventoryId: string
    itemId: string
    count: number
    price: number
    confirm: boolean
  }[]
}
export interface MerchantItem {
  slot: number
  itemId: string
  price: number
  left: number
  maxCount: number
  bound: boolean
  useLevel: number
  limit: number
  purchased: number
}
export type MerchantView =
  | { available: false }
  | {
      available?: true
      spawnId: string
      sceneId: number
      endsAt: string
      stock: MerchantItem[]
      vipStock: MerchantItem[]
      vipAvailable: boolean
    }

export function useShopView(tab = 1) {
  const cache = useQueryClient()
  return useQuery({
    queryKey: [...gameKeys.all, 'shop', tab],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const view = await api<ShopView & { character?: Character }>(`/api/game/shop/open?tab=${tab}`)
      if (view.character) {
        cache.setQueryData(gameKeys.character, view.character)
        void cache.invalidateQueries({
          queryKey: gameKeys.all,
          predicate: (query) => query.queryKey[1] !== 'shop' && query.queryKey[1] !== 'character',
        })
      }
      return view
    },
  })
}
export function useMerchantView() {
  return useQuery({
    queryKey: [...gameKeys.all, 'merchant'],
    queryFn: () => api<MerchantView>('/api/game/shop/merchant'),
  })
}
export function useShopAction() {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body: unknown }) =>
      api<{ character: Character }>(`/api/game/shop/${action}`, { method: 'POST', body }),
    onSuccess: (result) => {
      apply(result)
    },
  })
}
/** Window registry adapter: keep this hook mounted and render the window while open. */
export function useOpenShop() {
  const [isOpen, setOpen] = useState(false)
  const [initialTab, setTab] = useState(1)
  return {
    isOpen,
    initialTab,
    open: (tab = 1) => {
      setTab(tab)
      setOpen(true)
    },
    close: () => setOpen(false),
  }
}
export function useOpenMerchant() {
  const [isOpen, setOpen] = useState(false)
  return { isOpen, open: () => setOpen(true), close: () => setOpen(false) }
}
