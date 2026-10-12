import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { coerce, groupBy, namedRows, stockRows, tableRows, type Row } from './import.ts'

describe('coerce', () => {
  it('turns plain numbers into numbers and leaves everything else alone', () => {
    expect(coerce('42')).toBe(42)
    expect(coerce('-1')).toBe(-1)
    expect(coerce('1.5')).toBe(1.5)
    expect(coerce('007')).toBe('007')
    expect(coerce('i250100')).toBe('i250100')
    expect(coerce('0,100;3,10')).toBe('0,100;3,10')
  })
})

describe('groupBy', () => {
  it('groups index-numbered rows by an id field', () => {
    const rows = {
      '0': { ID: 90000, SetpSeq: 0 },
      '1': { ID: 90001, SetpSeq: 0 },
      '2': { ID: 90000, SetpSeq: 1 },
    }
    expect(groupBy(rows, 'ID')).toEqual({
      '90000': [{ SetpSeq: 0 }, { SetpSeq: 1 }],
      '90001': [{ SetpSeq: 0 }],
    })
  })
})

describe('tableRows', () => {
  it('turns column arrays into rows and can skip the header row', () => {
    const table = { ID: ['ID', '1', '2'], Cloth: ['Cloth', '39', '65'] }
    expect(tableRows(table, { skipHeader: true })).toEqual([
      { ID: 1, Cloth: 39 },
      { ID: 2, Cloth: 65 },
    ])
  })
})

describe('namedRows', () => {
  it('names the parts of comma lists, trims them and skips short lines', () => {
    expect(
      namedRows(['i160001,20 ,1,25,5', 'i1,2'], ['item', 'price', 'bind', 'useLevel', 'maxCnt']),
    ).toEqual([{ item: 'i160001', price: 20, bind: 1, useLevel: 25, maxCnt: 5 }])
    expect(namedRows('2601,267,711,100', ['scene', 'picX', 'picY', 'scale'])).toEqual([
      { scene: 2601, picX: 267, picY: 711, scale: 100 },
    ])
  })
})

describe('stockRows', () => {
  it('parses item, price, type lines like NpcShopSystem.LoadResource', () => {
    expect(stockRows(['i160006,38,0', 'i1,1', 'i2,8,2,8,3', 'i3,5,9'])).toEqual([
      { item: 'i160006', costs: [{ amount: 38, type: 0 }] },
      {
        item: 'i2',
        costs: [
          { amount: 8, type: 2 },
          { amount: 8, type: 3 },
        ],
      },
      { item: 'i3', costs: [] },
    ])
    expect(stockRows(undefined)).toEqual([])
  })
})

// Spot checks against the committed import (server/data/game), from docs/original-data/*.md.
const data = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../server/data/game', `${name}.json`), 'utf8'),
  )

describe('imported game data', () => {
  it('keeps monster n33017 (Sunflower) as in the original', () => {
    expect(data('npcs').n33017).toMatchObject({
      class: 'NormalNpc',
      Level: 2,
      MaxHP: 15,
      MinAtk: 9,
      MaxAtk: 10,
      AtkTime: 1004,
      NpcExp: 8,
      DropLibID: 3000001,
    })
  })

  it('keeps the first Fire Village tutorial quest and its talk step', () => {
    expect(data('tasks')['90000']).toMatchObject({
      TaskBaseType: 4,
      RequireCountry: 0,
      RewardExp: 5,
      RewardMoney: '0,100;3,10',
      RewardItem: 'i159104,1',
      NextTaskID: 90001,
    })
    const [step] = data('sub-tasks')['90000'] as Row[]
    expect(step).toMatchObject({ SubTaskType: 3, TargetConfiger: 'n11001', SubmitSceneID: 111 })
  })

  it('keeps Naruto base stats and growth', () => {
    expect(data('avatar-stats')['45']).toMatchObject({
      Strength: 2800,
      StrengthUp: 140,
      Agility: 2400,
      AgilityUp: 120,
      Stamina: 2400,
      StaminaUp: 120,
      Popsinger: 4,
    })
    expect(data('avatar-skills').i290045).toMatchObject({ SkillID1: 1945, SkillID4: 2042 })
  })

  it('keeps the fight buffs (FightBuff.ini) with their scripts', () => {
    const buffs = data('fight-buffs')
    expect(count(buffs)).toBe(136)
    expect(buffs['11841']).toEqual({
      cleartype: 2,
      javascript: 'buff/buff_gedang_11841.js',
      lifttime: -1,
      overlying: 2,
      replace: 11841,
      type: 1,
      validity: 2,
    })
    expect(buffs['11888']).toMatchObject({ lifttime: 0, replace: 11888, type: 1 })
  })

  it('has the level cap at 90 and the first EXP steps', () => {
    const levels = data('levels')
    expect(levels.role.maxlevel).toBe(90)
    expect(levels.levelexp['2']).toBe(15)
  })

  it('offers 10 starting outfits, 5 per gender', () => {
    const outfits = data('creation-outfits') as Row[]
    expect(outfits).toHaveLength(10)
    expect(outfits.filter((row) => row.Sex === 0)).toHaveLength(5)
  })

  it('maps nations to their village and first field', () => {
    expect(data('nation-scenes')['4']).toEqual({ castle: 131, field: 2301, login: 131 })
  })
})

const count = (value: object) => Object.keys(value).length

describe('imported M3 data: world and daily quests', () => {
  it('lists the 40 cross-village quest exceptions by scene', () => {
    const scenes = data('except-task-scenes') as Record<string, Row[]>
    expect(Object.values(scenes).flat()).toHaveLength(40)
    expect(scenes['2403']).toContainEqual({ TaskID: 10092 })
    expect(scenes['2503']).toContainEqual({ TaskID: 10140 })
  })

  it('has the 13 neutral field level bands', () => {
    const bands = data('level-scenes') as Row[]
    expect(bands).toHaveLength(13)
    expect(bands[0]).toEqual({ SceneID: 2601, StartLevel: 16, EndLevel: 25 })
  })

  it('keeps the daily quest config and 16 level bands', () => {
    const daily = data('daily-tasks')
    expect(daily.config).toMatchObject({
      CanAcceptDayMinLevel: 10,
      AcceptedDayTaskMaxNum: 5,
      PerDayCompleteTaskMax: 20,
      FlushDayTaskTime: 30,
      FlushDayTaskCpaital: 8,
    })
    expect(count(daily.levels)).toBe(16)
    expect(daily.levels['16']).toEqual({ RequireMaxLevel: 90, RequireMinLevel: 86 })
  })
})

describe('imported M3 data: shops', () => {
  it('sells Healing Powder for 38 Stone in Wholesale box 1001', () => {
    const shops = data('npc-shops')
    expect(count(shops.boxes)).toBe(70)
    expect(shops.boxes['1001']).toMatchObject({ BelongNPC: 'n11005', MinLevel: 0, MaxLevel: 10 })
    expect(shops.items.NpcShopBox_1001[0]).toEqual({
      item: 'i160006',
      costs: [{ amount: 38, type: 0 }],
    })
  })

  it('has 32 refresh pools with their stock', () => {
    const shops = data('refresh-shops')
    expect(count(shops.pools)).toBe(32)
    expect(shops.pools['1001']).toMatchObject({
      Type: 1,
      RandCount: 10,
      RefreshTime: 1800,
      ImidRequireMoney: '50,0',
      GratisCount: 1,
    })
    expect(shops.items['1001']).toHaveLength(44)
    expect(shops.items['1021']).toHaveLength(91)
    expect(shops.items['1001']).toContainEqual({
      item: 'i250101',
      costs: [{ amount: 111, type: 0 }],
    })
  })

  it('keeps the Mysterious Merchant schedule, spots and libs', () => {
    const mystic = data('mystic-shop')
    expect(count(mystic.times)).toBe(15)
    expect(mystic.locations['1']).toHaveLength(5)
    expect(mystic.npcs.n28001).toEqual({ Cap2LibNo: 1, VipLibNo: 2 })
    expect(mystic.items['1']).toHaveLength(29)
    expect(mystic.items['2']).toHaveLength(17)
    expect(mystic.items['1'][0]).toEqual({
      item: 'i150078',
      price: 40,
      bind: 1,
      useLevel: 20,
      maxCnt: 10,
    })
    expect(mystic.buyLimits.i150078).toBe(2)
  })

  it('has 124 sell-all confirm items', () => {
    expect(data('sell-ask-items')).toHaveLength(124)
  })

  it('only references existing items, except the known i2x0119/i2x0120 gap', () => {
    const items = data('items')
    const pools = [
      ...Object.values(data('npc-shops').items),
      ...Object.values(data('refresh-shops').items),
      ...Object.values(data('mystic-shop').items),
    ] as { item: string }[][]
    const missing = new Set(pools.flat().flatMap(({ item }) => (items[item] ? [] : [item])))
    expect([...missing].sort()).toEqual([
      'i240119',
      'i240120',
      'i250119',
      'i250120',
      'i260119',
      'i260120',
      'i270119',
      'i270120',
    ])
  })
})

describe('imported M3 data: forge and sets', () => {
  it('keeps the forge config and the 8 equip slots', () => {
    const equip = data('equip-config')
    expect(equip.config).toMatchObject({ ConsolidateCost: 8, ConsolidateEquipFatcor: 5 })
    expect(equip.slots).toEqual({
      Hat: 0,
      Cloth: 1,
      Shoes: 2,
      Amulet: 3,
      Weapon: 4,
      Ring: 5,
      Glove: 6,
      Girdle: 7,
    })
    expect(count(data('equip-props'))).toBe(58)
  })

  it('has the enhance fail rates and inscription levels', () => {
    const rates = data('enhance-fail-rates')
    expect(count(rates)).toBe(12)
    expect(rates['12']).toEqual({ FailRate: 99 })
    const inscribe = data('inscribe-levels')
    expect(inscribe.levels['11']).toMatchObject({ AddLevel: 12, BaseOdds: 3, StoneCost: 1200 })
    expect(inscribe.seals).toEqual({
      LowSeal: 'i161008',
      HighSeal: 'i161009',
      LowOdds: 3,
      HighOdds: 6,
    })
  })

  it('has the identify tables with trimmed item ids', () => {
    const lists = data('identify-lists')
    expect(count(lists)).toBe(476)
    expect(lists.i210050).toEqual({ CommonIdentifyID: 1011, SpecialIdentifyID: 0 })
    expect(count(data('identify-groups'))).toBe(208)
    expect(data('identify-groups')['1001'].Identify0).toBe(1)
    expect(count(data('identify-props'))).toBe(849)
    expect(data('identify-props')['1']).toMatchObject({
      PropName: 'StrengthEquip',
      PropMinValue: 2800,
      PropMaxValue: 3400,
    })
  })

  it('has 61 sets with trimmed property names', () => {
    const suits = data('equip-suits')
    expect(count(suits)).toBe(61)
    expect(suits['8161']).toContainEqual({ Index: 7, PropName: 'PierceEquip', PropValue: 43 })
    expect(data('tollgate-suits')).toHaveLength(20)
    expect(data('tollgate-suits')[0]).toEqual({ ConfigID: 100001, SuitID: '8160,8161' })
  })
})

describe('imported M3 data: Demon City instances', () => {
  it('has 21 toll gates with the client tier, boss and pass condition', () => {
    const gates = data('toll-gates')
    expect(count(gates)).toBe(21)
    expect(gates['100001']).toMatchObject({
      RequirMinLevel: 16,
      FightMonsterPointCoount: 2,
      RewardMoney: '0,2800',
      Hard: 1,
      BossName: 'TollGateBoss_100001',
      PassCondition: 2,
    })
    expect(gates['100035']).toMatchObject({ RequireItemConfig: 'i152000', Hard: 3 })
  })

  it('has 72 sub gates, 360 points and 360 monster groups', () => {
    expect(count(data('toll-gate-subs'))).toBe(72)
    expect(count(data('toll-gate-points'))).toBe(360)
    const groups = data('toll-gate-groups')
    expect(count(groups)).toBe(360)
    expect(groups['300011']).toEqual({
      MonsterConfig1: 'n300111',
      MonsterConfig2: 'n300112',
      MonsterConfig3: 'n300113',
    })
  })

  it('keeps the toll gate config, cards and exchanges', () => {
    const config = data('toll-gate-config')
    expect(config.props).toMatchObject({ RestoreHP: 20, RestoreMP: 40, EntryTollGateMaxTimes: 3 })
    expect(config.cards).toEqual({ ShowAllCap: 10, ExchangeCap: 5 })
    expect(config.captainMul['3']).toEqual({ ExpMul: 100, MoneyMul: 50 })
    const cards = data('toll-gate-cards')
    expect(cards.gates['100001']).toMatchObject({ DropId: 1001, LookAddMul: 138, LookCap0: 15 })
    expect(Object.values(cards.libs).flat()).toHaveLength(586)
    expect(count(data('toll-gate-exchanges'))).toBe(80)
  })

  it('has 170 Las Noches floors and the entry costs', () => {
    const single = data('single-gate')
    expect(count(single.floors)).toBe(170)
    expect(single.floors['0']).toEqual({ exp: 355, npc: 'n900001' })
    expect(single.config).toMatchObject({ MaxEntryCnt: 3, NewMaxGate: 170, BuyReliveMoney: 6 })
    expect(single.floorCosts['0']).toEqual({ floor: 1, type: 0, value: 1000 })
  })

  it('has pub fights in 13 scenes', () => {
    const pub = data('pub-fights')
    expect(pub.config).toEqual({ PubFightMaxTimes: 999, PullRockerCd: 3600 })
    expect(count(pub.scenes)).toBe(13)
    expect(pub.scenes['2601']).toEqual({ MonsterLibID: 20001, UseEnergy: 3 })
    expect(Object.values(pub.libs).flat()).toHaveLength(195)
    expect(count(pub.rewardRules)).toBe(403)
  })
})
