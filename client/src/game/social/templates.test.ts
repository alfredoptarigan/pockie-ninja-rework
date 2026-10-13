import { describe, expect, it } from 'vitest'
import { SYSTEM_MAIL_TEXT, systemMailText } from './templates'

describe('system mail templates', () => {
  it('has English text for every Market and arena mail the server sends', () => {
    for (const key of [
      'market_sold',
      'market_sold_out',
      'market_bought',
      'market_expired',
      'arena_defense_won',
      'arena_defense_lost',
    ])
      expect(SYSTEM_MAIL_TEXT[key], key).toBeDefined()
  })

  it('tells the seller what the sale earned', () => {
    const { subject, body } = systemMailText({
      templateKey: 'market_sold_out',
      params: { buyer: 'Rock_1', itemId: 'i160006', count: 3, stone: 1200, gold: 0 },
    })
    expect(subject).toBe('Listing sold out')
    expect(body).toContain('Rock_1 bought 3 x')
    expect(body).toContain('1,200 Stone after tax')
  })

  it('shows the score change of a lost defense', () => {
    const { body } = systemMailText({
      templateKey: 'arena_defense_lost',
      params: { attacker: 'Sakura_1', score: -1250 },
    })
    expect(body).toBe('Sakura_1 attacked you in the arena and won. Your score changed by -12.50.')
  })
})
