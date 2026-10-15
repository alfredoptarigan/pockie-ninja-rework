import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AdventureReturnResult,
  AdventureView,
  ChainAttack,
  ChainAttackClaimResult,
  HuntView,
} from '../../../../shared/src/schemas/hunt'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders } from '../../test/utils'
import { AdventureWindow, HuntHud, showChainProgress } from './index'

const MINUTE = 60_000
const noHunt: HuntView = { monsters: [], huntsToday: 0, huntsPerDay: 3, arenaTries: 5 }

const chainOf = (startedMinutesAgo: number, amount = 3): ChainAttack => {
  const startedAt = Date.now() - startedMinutesAgo * MINUTE
  return {
    monsterId: 'n33017',
    nameKey: 'lg_name_n33017',
    level: 2,
    amount,
    startedAt: new Date(startedAt).toISOString(),
    endsAt: new Date(startedAt + amount * 3 * MINUTE).toISOString(),
    drops: [{ itemId: 'i250101', nameKey: 'lg_Equip_Blunt1' }],
  }
}

const claimed: ChainAttackClaimResult = {
  fought: 2,
  won: 2,
  rewards: { exp: 16, stone: 20, items: [{ itemId: 'i250101', bound: false }], levelsGained: 0 },
  character,
}

afterEach(() => {
  act(() => showChainProgress(false))
  vi.unstubAllGlobals()
})

describe('Chain Attack Progress', () => {
  it('shows the timer, claims early and lists what the chain earned', async () => {
    let chain: ChainAttack | null = chainOf(4)
    mockApi({
      'GET /api/game/hunt': () => json(noHunt),
      'GET /api/game/chain-attack': () => json({ chain }),
      'POST /api/game/chain-attack/claim': () => {
        chain = null
        return json(claimed)
      },
    })
    renderWithProviders(<HuntHud character={character} />)
    await userEvent.click(await screen.findByRole('button', { name: /Chain/ }))
    const progress = screen.getByRole('dialog', { name: 'Chain Attack Progress' })
    expect(progress).toHaveTextContent('Chain attack in progress!')
    expect(progress).toHaveTextContent('Sunflower (Level: 2)')
    expect(progress).toHaveTextContent('Fighting 3 Monsters')
    expect(progress).toHaveTextContent('Dogsmasher')
    expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '44')

    await userEvent.click(within(progress).getByRole('button', { name: 'Claim Early' }))
    const result = await screen.findByRole('dialog', { name: 'Chain Attack' })
    expect(result).toHaveTextContent('Defeated 2 of 2 monsters.')
    expect(result).toHaveTextContent('+16')
    expect(result).toHaveTextContent('Dogsmasher')
  })

  it('prices Instant Finish at 5 Gift Certificates per 3 minutes left', async () => {
    mockApi({
      'GET /api/game/hunt': () => json(noHunt),
      'GET /api/game/chain-attack': () => json({ chain: chainOf(1) }),
    })
    renderWithProviders(<HuntHud character={{ ...character, giftCoupon: 10 }} />)
    act(() => showChainProgress(true))
    const progress = await screen.findByRole('dialog', { name: 'Chain Attack Progress' })
    await userEvent.click(within(progress).getByRole('button', { name: 'Instant Finish' }))
    const confirm = screen.getByRole('dialog', { name: 'Finish this task instantly?' })
    expect(confirm).toHaveTextContent('Cost: 15 Coupons')
    expect(within(confirm).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('offers Claim Rewards once the chain is over', async () => {
    mockApi({
      'GET /api/game/hunt': () => json(noHunt),
      'GET /api/game/chain-attack': () => json({ chain: chainOf(30) }),
    })
    renderWithProviders(<HuntHud character={character} />)
    expect(await screen.findByRole('button', { name: /Ready/ })).toBeVisible()
    act(() => showChainProgress(true))
    const progress = await screen.findByRole('dialog', { name: 'Chain Attack Progress' })
    expect(progress).toHaveTextContent('Completed!')
    expect(within(progress).getByRole('button', { name: 'Claim Rewards' })).toBeEnabled()
    expect(within(progress).queryByRole('button', { name: 'Instant Finish' })).toBeNull()
  })
})

describe('Hunt window', () => {
  it('shows the hunted monsters, greys the killed ones and says Completed when done', async () => {
    const monster = (id: string, killed: boolean) => ({
      id,
      nameKey: `lg_name_${id}`,
      level: 2,
      sceneId: 2101,
      killed,
    })
    let hunt: HuntView = {
      ...noHunt,
      monsters: [monster('n33017', true), monster('n33006', false)],
    }
    mockApi({
      'GET /api/game/hunt': () => json(hunt),
      'GET /api/game/chain-attack': () => json({ chain: null }),
    })
    const view = renderWithProviders(<HuntHud character={character} />)
    const window = await screen.findByRole('region', { name: 'Hunt' })
    expect(within(window).getByRole('button', { name: 'Sunflower, defeated' })).toBeDisabled()
    expect(within(window).getByRole('button', { name: /travel to it/ })).toBeEnabled()
    expect(within(window).queryByText('Completed')).toBeNull()

    hunt = { ...hunt, monsters: hunt.monsters.map((m) => ({ ...m, killed: true })) }
    view.unmount()
    renderWithProviders(<HuntHud character={character} />)
    expect(await screen.findByRole('button', { name: 'Completed' })).toBeVisible()
  })
})

describe('Adventure with Jiraiya', () => {
  it('starts an adventure from the idle window', async () => {
    let adventure: AdventureView = {
      active: false,
      startedAt: null,
      hours: 0,
      rewards: { charExp: 0, bankaiExp: 0, clanExp: 0 },
    }
    mockApi({
      'GET /api/game/adventure': () => json(adventure),
      'POST /api/game/adventure/start': () => {
        adventure = { ...adventure, active: true, startedAt: new Date().toISOString() }
        return json({ adventure })
      },
    })
    renderWithProviders(<AdventureWindow onClose={() => {}} />)
    const window = await screen.findByRole('dialog', { name: 'Adventure with Jiraiya' })
    expect(await within(window).findByText('Ready for Adventure')).toBeVisible()
    expect(window).toHaveTextContent("At 12h there's a 5% chance of finding a special item.")
    await userEvent.click(within(window).getByRole('button', { name: 'Start Adventure' }))
    expect(await within(window).findByText('On Adventure...')).toBeVisible()
    expect(window).toHaveTextContent('Hours: 0/24')
    expect(window).toHaveTextContent('Battles are disabled while on adventure')
  })

  it('returns with the rewards in Adventure Complete!', async () => {
    const startedAt = new Date(Date.now() - 13 * 3_600_000).toISOString()
    const rewards = { charExp: 78_000, bankaiExp: 1_300, clanExp: 325 }
    const back: AdventureReturnResult = {
      story: 'Sparring with Jiraiya near a mountain stream...',
      totalHours: 13,
      rewards,
      specialItem: null,
      adventure: { active: false, startedAt: null, hours: 0, rewards },
      character,
    }
    mockApi({
      'GET /api/game/adventure': () => json({ active: true, startedAt, hours: 13, rewards }),
      'POST /api/game/adventure/return': () => json(back),
    })
    renderWithProviders(<AdventureWindow onClose={() => {}} />)
    const window = await screen.findByRole('dialog', { name: 'Adventure with Jiraiya' })
    expect(await within(window).findByText('+78000')).toBeVisible()
    expect(window).toHaveTextContent('Hours: 13/24')
    await userEvent.click(within(window).getByRole('button', { name: 'Return from Adventure' }))
    const done = await screen.findByRole('dialog', { name: 'Adventure Complete!' })
    expect(done).toHaveTextContent('Sparring with Jiraiya near a mountain stream...')
    expect(done).toHaveTextContent('Adventure Duration: 13 hour(s)')
    expect(done).toHaveTextContent('+1300')
    expect(done).toHaveTextContent('No special item found this time. Better luck next adventure!')
  })
})
