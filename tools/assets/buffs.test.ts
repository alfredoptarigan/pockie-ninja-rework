import { describe, expect, it } from 'vitest'
import { originalBuffIcons, rebornBuffIcons, rebornBuffText } from './buffs.ts'

describe('buff icons', () => {
  it('reads the base64 icons of main.js keyed by buff id', () => {
    const js =
      'x={1:"data:image/png;base64,AAAA"};const _i=["buffId","alt"],wi={50001:"data:image/png;base64,AQID",80101:"data:image/png;base64,BAU="};function ji(){}'
    const icons = rebornBuffIcons(js)
    expect(Object.keys(icons)).toEqual(['50001', '80101'])
    expect([...icons['50001']!]).toEqual([1, 2, 3])
  })

  it('maps unfightbuff ids to their 2011 icon and skips buffs without one', () => {
    expect(
      originalBuffIcons({
        ID: ['', '42101', '50001', '90001'],
        ResourceID: ['ResourceID', 'Icon_Buff1', 'Icon_Buff55', '0'],
      }),
    ).toEqual({ 42101: '1', 50001: '55' })
  })

  it('reads the buff names and effect lines of the locale', () => {
    expect(
      rebornBuffText({
        'buff__50001--name': 'Exp Boost +100%',
        'buff__50001--tooltip': '+100% Experience',
        'buff__42101--name': 'Taijutsu Meal I',
        'item__1--name': 'Other',
      }),
    ).toEqual({
      50001: { name: 'Exp Boost +100%', effect: '+100% Experience' },
      42101: { name: 'Taijutsu Meal I' },
    })
  })
})
