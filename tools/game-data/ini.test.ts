import { describe, expect, it } from 'vitest'
import { parseIni } from './ini.ts'

describe('parseIni', () => {
  it('reads sections with key=value pairs as strings', () => {
    const ini = parseIni('\n[111]\nIsStart=1\nNation=0\n\n[121]\nNation=1\n')
    expect(ini).toEqual({ '111': { IsStart: '1', Nation: '0' }, '121': { Nation: '1' } })
  })

  it('collects repeated keys into an array in file order', () => {
    const ini = parseIni('[111]\nr=n11001,100,100,100\nr=n11002,100,100,100\nx=1')
    expect(ini['111']).toEqual({ r: ['n11001,100,100,100', 'n11002,100,100,100'], x: '1' })
  })

  it('keeps everything after the first = and trims whitespace and CRLF', () => {
    const ini = parseIni('[a]\r\nformula = x=y+1 \r\nEmpty=\r\n')
    expect(ini.a).toEqual({ formula: 'x=y+1', Empty: '' })
  })

  it('ignores comment lines and lines without =', () => {
    const ini = parseIni('; note\n# note\n// note\n[a]\njunk\nk=v')
    expect(ini).toEqual({ a: { k: 'v' } })
  })

  it('puts keys before the first section under an empty section name', () => {
    expect(parseIni('maxlevel=90\n[levelexp]\n1=0')).toEqual({
      '': { maxlevel: '90' },
      levelexp: { '1': '0' },
    })
  })
})
