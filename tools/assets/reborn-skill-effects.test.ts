import { describe, expect, it } from 'vitest'
import { playFrames, skillEffectTable } from './reborn-skill-effects.ts'

// The shape of main.03c73510.js: the skill and motion enums, then the table (minified).
const bundle = [
  's=function(e){return e[e.NONE=0]="NONE",e[e.BASIC_ATTACK=1]="BASIC_ATTACK",',
  'e[e.THUNDERFALL=1802]="THUNDERFALL",e[e.RASENGAN=1810]="RASENGAN",',
  'e[e.RASENGAN_2=18102]="RASENGAN_2",e[e.SECRET_TECHNIQUE=1e4]="SECRET_TECHNIQUE",e}({});',
  'n=function(e){return e.ATTACK="52",e.ATTACK_2="53",e.JUTSU="6",e}({});',
  'const Ke={[_e.E.SECRET_TECHNIQUE]:{name:"secret_technique",offset:{x:-1075.75,y:-760.85}},',
  '[_e.E.THUNDERFALL]:{name:"thunderfall",offset:{x:-133.45,y:-290.85},',
  'events:{6:{event:Qe.ATTACK}},characterAnimation:x.gM.JUTSU,onTarget:!0},',
  '[_e.E.RASENGAN]:{name:"rasengan",offset:{x:-337.1,y:-197.2},events:{1:{event:Qe.MOTION,',
  'fn:async(e,t,i,n)=>{Ye.create(e,_e.E.RASENGAN_2,t,i,n)}}},next:_e.E.RASENGAN_2,',
  'depth:x.fY.BEHIND_CHARACTER,move:!1,characterAnimation:x.gM.ATTACK_2},',
  '40002:{name:"18",offset:{x:0,y:0},onPet:!0}};',
].join('')

describe('skillEffectTable', () => {
  it('reads the table as data, resolving the enums', () => {
    const table = skillEffectTable(bundle)
    expect(Object.keys(table)).toEqual(['1802', '1810', '10000', '40002'])
    expect(table[1802]).toEqual({
      name: 'thunderfall',
      offset: [-133.45, -290.85],
      attackFrame: 6,
      characterAnimation: '6',
      onTarget: true,
    })
    expect(table[1810]).toEqual({
      name: 'rasengan',
      offset: [-337.1, -197.2],
      spawns: [{ frame: 1, skill: 18102 }],
      next: 18102,
      depth: 'behind',
      move: false,
      characterAnimation: '53',
    })
    expect(table[40002]).toMatchObject({ name: '18', onPet: true })
  })

  it('plays frames by number without frame 0', () => {
    const atlas = {
      textures: [
        { image: 'a.png', frames: [{ filename: '10' }, { filename: '0' }, { filename: '2' }] },
        { image: 'b.png', frames: [{ filename: '1' }] },
      ],
    }
    expect(playFrames(atlas)).toEqual(['1', '2', '10'])
  })
})
