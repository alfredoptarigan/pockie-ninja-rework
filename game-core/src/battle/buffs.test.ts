// The buff table comes from server/data/game/fight-buffs.json (FightBuff.ini); only the scripts
// (RES/javascript/buff/*.js) are ported by hand.
import { describe, expect, it } from 'vitest'
import { BUFFS } from './buffs.js'

describe('BUFFS (FightBuff.ini + buff scripts)', () => {
  it('has every FightBuff.ini row with its ini values', () => {
    expect(
      Object.keys(BUFFS).filter((id) => Number(id) < 15001 || Number(id) > 15099),
    ).toHaveLength(136)
    expect(BUFFS[11841]).toMatchObject({ type: 1, replace: 11841, clearType: 2, lifeTime: -1 })
    expect(BUFFS[11811]).toMatchObject({ type: 2, replace: 11811, clearType: 0, lifeTime: 6000 })
    expect(BUFFS[11831]).toMatchObject({ type: 3, replace: 11831, clearType: 0, lifeTime: -1 })
    // Missing keys default to 0 like Buff.java.
    expect(BUFFS[1000]).toMatchObject({ type: 3, replace: 0, clearType: 0, lifeTime: 1 })
  })

  it('attaches the ported scripts by their javascript path', () => {
    expect(BUFFS[11841]?.onRemove).toBeTypeOf('function')
    expect(BUFFS[11830]?.onAdd).toBeTypeOf('function')
    expect(BUFFS[11804]?.onAdd).toBeTypeOf('function')
  })
})
