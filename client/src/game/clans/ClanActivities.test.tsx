import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  ClanMissionsView,
  ProtectionView,
  TrainingView,
} from '../../../../shared/src/schemas/clan-activities'
import type {
  ClanWarFighterView,
  ClanWarMatchup,
  ClanWarStatus,
  ClanWarTarget,
} from '../../../../shared/src/schemas/clan-wars'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ClanMissionsWindow } from './ClanMissions'
import { ClanWarsWindow } from './ClanWars'
import { LogsTab } from './LogsTab'
import { ProtectionWindow } from './Protection'
import { TrainingWindow } from './Training'

const NOW = new Date().toISOString()
const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
const training = (donated: Partial<TrainingView['donated']> = {}): TrainingView => ({
  donated: { primary: false, advanced: false, final: false, ...donated },
  resetsAt: tomorrow,
})

describe('TrainingWindow', () => {
  it('donates a course after "Confirm your donation?"', async () => {
    let view = training()
    const fetch = mockApi({
      'GET /api/game/clan-events/training': () => json(view),
      'POST /api/game/clan-events/training': () => {
        view = training({ advanced: true })
        return json({
          training: view,
          course: 'advanced',
          clan: { level: 1, exp: 200, next: 35_000 },
          character,
        })
      },
    })
    renderWithProviders(<TrainingWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Advanced Course' }))
    const confirm = screen.getByRole('dialog', { name: 'Confirm your donation?' })
    expect(confirm).toHaveTextContent('Spend 200 Gift Certificates to gain 3,500 Bankai Experience')
    expect(confirm).toHaveTextContent('(Each course can be donated once per day)')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/training')).toEqual({
      course: 'advanced',
    })
    expect(await screen.findByRole('button', { name: 'Advanced medal, donated' })).toBeDisabled()
  })

  it('says when all daily training is done', async () => {
    mockApi({
      'GET /api/game/clan-events/training': () =>
        json(training({ primary: true, advanced: true, final: true })),
    })
    renderWithProviders(<TrainingWindow onClose={vi.fn()} />)
    expect(await screen.findByText('All daily training done')).toBeVisible()
  })
})

describe('ProtectionWindow', () => {
  const protection = (fightsRemaining: number): ProtectionView => ({
    fightsRemaining,
    fightsPerDay: 3,
    resetsAt: tomorrow,
    boss: { npcId: 'n3205706', name: 'Bloodboil Demon', level: 30 },
    rewards: { win: { clanPoints: 150, bankaiExp: 1_000 }, loss: { clanPoints: 30, bankaiExp: 0 } },
  })

  it('shows the attempts left and disables Battle at 0', async () => {
    mockApi({ 'GET /api/game/clan-events/protection': () => json(protection(0)) })
    renderWithProviders(<ProtectionWindow onClose={vi.fn()} />)
    expect(await screen.findByText('Attempts Left: 0')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Battle' })).toBeDisabled()
  })

  it('shows a fight error in a Notice', async () => {
    mockApi({
      'GET /api/game/clan-events/protection': () => json(protection(3)),
      'GET /api/game/character': () => json({ character }),
      'POST /api/game/clan-events/protection/fight': () =>
        json({ error: { code: 'no_clan', message: 'You are not in a clan.' } }, 404),
    })
    renderWithProviders(<ProtectionWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Battle' }))
    const notice = await screen.findByRole('dialog', { name: 'Notice' })
    expect(notice).toHaveTextContent('You are not in a clan.')
  })
})

describe('LogsTab', () => {
  it('filters the Clan Activity Log by member', async () => {
    mockApi({
      'GET /api/game/clan-events/logs': () =>
        json({
          logs: [
            { id: '1', at: NOW, actor: 'Kage', action: 'Donated', details: '15,000 Stones' },
            { id: '2', at: NOW, actor: 'Genin', action: 'Training', details: 'Final Course' },
          ],
        }),
    })
    renderWithProviders(<LogsTab members={['Kage', 'Genin']} />)
    const log = await screen.findByRole('list', { name: 'Clan Activity Log' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.selectOptions(screen.getByLabelText('Member'), 'Genin')
    expect(within(log).getAllByRole('listitem')).toHaveLength(1)
    expect(log).toHaveTextContent('Final Course')
  })
})

const fighter = (name: string, power: number): ClanWarFighterView => ({
  characterId: name,
  name,
  level: 30,
  clothing: 3,
  power,
  set: 1,
})
const matchup = (available: boolean): ClanWarMatchup => ({
  available,
  ownPower: 5_000,
  targetPower: 7_000,
  differencePercent: 40,
  rewardPercent: 130,
  defenderRewardPercent: 70,
  gcPerKnockout: 520,
  expPerKnockout: 650,
  stoneBonusChancePercent: 13,
  giftCertificateBonusChancePercent: 6.5,
})
const target: ClanWarTarget = {
  clanId: '0190a0f0-0000-7000-8000-000000000002',
  clanName: 'Suna',
  level: 3,
  wins: 2,
  losses: 1,
  registeredFighters: 5,
  totalRegisteredPower: 7_000,
  attackedToday: false,
  roster: Array.from({ length: 5 }, (_, i) => fighter(`Suna_${i}`, 1_400)),
  matchups: { 5: matchup(true), 10: matchup(false), 15: matchup(false), 20: matchup(false) },
}
const status = (patch: Partial<ClanWarStatus> = {}): ClanWarStatus => ({
  myClan: {
    clanId: 'mine',
    clanName: 'Konoha',
    registeredFighters: 5,
    roster: Array.from({ length: 5 }, (_, i) => fighter(`Leaf_${i}`, 1_000)),
  },
  fighter: fighter('Leaf_0', 1_000),
  canStartWar: true,
  attacksRemaining: 1,
  nextDailyReset: tomorrow,
  sizes: [5, 10, 15, 20],
  targets: [target],
  weekly: { endsAt: tomorrow, standings: [] },
  monthly: { endsAt: tomorrow, standings: [] },
  history: [],
  ...patch,
})

describe('ClanWarsWindow', () => {
  it('attacks a rival after the reward breakdown', async () => {
    let view = status({
      targets: [
        { ...target, clanId: 'other', clanName: 'Kiri', totalRegisteredPower: 9_000 },
        target,
      ],
    })
    const fetch = mockApi({
      'GET /api/game/clan-events/wars': () => json(view),
      'POST /api/game/clan-events/wars/attack': () => {
        view = status({
          targets: [view.targets[0]!, { ...target, attackedToday: true }],
        })
        return json({
          war: {
            warId: 'w1',
            size: 5,
            endedAt: NOW,
            winner: 'mine',
            myClan: {
              clanId: 'mine',
              clanName: 'Konoha',
              knockouts: 3,
              power: 5_000,
              rewardPercent: 130,
              gcReward: 1_560,
              expReward: 1_950,
              stoneBonus: 0,
              giftCertificateBonus: 0,
            },
            enemyClan: {
              clanId: target.clanId,
              clanName: 'Suna',
              knockouts: 2,
              power: 7_000,
              rewardPercent: 70,
              gcReward: 560,
              expReward: 700,
              stoneBonus: 0,
              giftCertificateBonus: 0,
            },
            duels: [],
          },
          status: view,
          character,
        })
      },
    })
    renderWithProviders(<ClanWarsWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Suna/ }))
    expect(await screen.findByText('Record 2W - 1L | 5 saved fighters')).toBeVisible()
    expect(screen.getByRole('button', { name: '10v10' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Attack Clan' }))
    const confirm = screen.getByRole('dialog', { name: 'Attack Suna?' })
    expect(confirm).toHaveTextContent('Suna is 40% stronger. Rewards are increased.')
    expect(confirm).toHaveTextContent('Per knockout: 520 GC + 650 Clan EXP')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm Attack' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/wars/attack')).toEqual({
      targetClanId: target.clanId,
      size: 5,
    })
    expect(await screen.findByText('VICTORY: war complete against Suna.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'War' }))
    expect(screen.getByRole('button', { name: 'Attacked Today' })).toBeDisabled()
  })

  it('reads "Leader Only" for members', async () => {
    mockApi({ 'GET /api/game/clan-events/wars': () => json(status({ canStartWar: false })) })
    renderWithProviders(<ClanWarsWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Leader Only' })).toBeDisabled()
  })
})

describe('ClanMissionsWindow', () => {
  const missions = (patch: Partial<ClanMissionsView> = {}): ClanMissionsView => ({
    unlockedBoss: 0,
    activeBoss: null,
    scheduledBoss: null,
    battlesUsedToday: 0,
    maxDailyBattles: 3,
    freeBattleEntries: 0,
    costs: Array.from({ length: 15 }, () => ({ stones: 1_000_000, giftCertificates: 0 })),
    canStart: true,
    damagePercentPerAttack: 10,
    bossActiveMinutes: 10,
    maxScheduleHours: 12,
    lastOutcome: null,
    ...patch,
  })

  it('schedules the unlocked boss from the start dialog', async () => {
    let view = missions()
    const fetch = mockApi({
      'GET /api/game/clan-events/missions': () => json(view),
      'POST /api/game/clan-events/missions/start': () => {
        view = missions({ scheduledBoss: { bossIndex: 0, startAt: tomorrow } })
        return json({ missions: view, character })
      },
    })
    renderWithProviders(<ClanMissionsWindow onClose={vi.fn()} />)
    const first = await screen.findByRole('listitem', { name: 'Shadow Grunt' })
    await userEvent.click(await within(first).findByRole('button', { name: 'Start Battle' }))
    const start = screen.getByRole('dialog', { name: 'Shadow Grunt' })
    expect(start).toHaveTextContent('Cost: 1M Stones (from clan storage)')
    await userEvent.selectOptions(within(start).getByRole('combobox'), '2')
    await userEvent.click(within(start).getByRole('button', { name: 'Schedule' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/missions/start')).toEqual({
      bossIndex: 0,
      delayHours: 2,
    })
    expect(await within(first).findByText(/Starts in/)).toBeVisible()
    expect(screen.getByText('Missions started today: 0/3 | Free entries: 0')).toBeVisible()
  })

  it('shows the active boss HP for members to attack', async () => {
    mockApi({
      'GET /api/game/clan-events/missions': () =>
        json(
          missions({
            canStart: false,
            activeBoss: {
              bossIndex: 0,
              currentHp: 2_340,
              maxHp: 4_680,
              endsAt: new Date(Date.now() + 300_000).toISOString(),
              myAttacks: 0,
              minimumAttacks: 10,
            },
          }),
        ),
    })
    renderWithProviders(<ClanMissionsWindow onClose={vi.fn()} />)
    expect(await screen.findByText('2,340 / 4,680')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Attack Shadow Grunt' })).toBeEnabled()
  })
})
