import type { QuestHandIn } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { character, equipOffer, villageScene } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { useTalk } from './api'
import { NpcDialog } from './NpcDialog'

const elder = villageScene.npcs[0]!

/** Talks to the Elder on mount, like GameApp does when an NPC is opened. */
function Conversation() {
  const talk = useTalk()
  const { mutate } = talk
  useEffect(() => mutate(elder.id), [mutate])
  return <NpcDialog npc={elder} talk={talk} character={character} onClose={vi.fn()} />
}

const handIn: QuestHandIn = {
  taskId: 90000,
  exp: 5,
  stone: 100,
  gold: 0,
  giftCoupon: 10,
  honor: 0,
  items: [{ itemId: 'i159104', count: 1, nameKey: 'lg_Debris159104_itemname' }],
}

function renderConversation(talkBody: object) {
  mockApi({
    'POST /api/game/npcs/n11001/talk': () => json({ ...talkBody, character }),
    'GET /api/game/quests/available': () =>
      json({
        available: [
          {
            ...equipOffer,
            rewards: { ...handIn, exp: 10, stone: 0, items: [] },
          },
        ],
        completed: [90000, 90001],
      }),
    'GET /api/game/quests': () => json({ quests: [] }),
    'GET /api/game/scene': () => json(villageScene),
    'GET /api/game/inventory': () => json({ items: [] }),
  })
  renderWithProviders(<Conversation />)
}

describe('NpcDialog', () => {
  it('shows the items a handed-in quest granted', async () => {
    renderConversation({
      dialogKey: 'lg_Say_n11001',
      nameKey: 'lg_name_n11001',
      completed: [90000],
      rewards: [handIn],
    })
    const received = await screen.findByRole('group', { name: /^Received for / })
    expect(received).toHaveTextContent('EXP +5, Stone +100, Coupons +10')
    expect(within(received).getByRole('img', { name: 'Lv.1 Newbie Pack' })).toBeVisible()
  })

  it('still works with a talk result without rewards', async () => {
    renderConversation({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [] })
    expect(await screen.findByRole('button', { name: /^Quests/ })).toBeVisible()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('lists the rewards of the quests on offer', async () => {
    renderConversation({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [] })
    await userEvent.click(await screen.findByRole('button', { name: 'Quests (1)' }))
    const offered = screen.getByRole('region', { name: 'Quests offered' })
    expect(within(offered).getByRole('group', { name: 'Rewards' })).toHaveTextContent(
      'EXP +10, Coupons +10',
    )
  })
})
