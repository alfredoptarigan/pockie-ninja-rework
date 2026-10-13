import { describe, expect, it } from 'vitest'
import { rankingParamsSchema, rankingQuerySchema, tollGateRankingParamsSchema } from './rankings.js'

describe('ranking schemas', () => {
  it('defaults to page 1 and limits pages to the top 100', () => {
    expect(rankingQuerySchema.parse({})).toEqual({ page: 1 })
    expect(rankingQuerySchema.parse({ page: '10', find: 'me' })).toEqual({ page: 10, find: 'me' })
    expect(rankingQuerySchema.safeParse({ page: '11' }).success).toBe(false)
    expect(rankingQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(rankingQuerySchema.safeParse({ find: 'you' }).success).toBe(false)
    expect(rankingQuerySchema.safeParse({ sort: 'gold' }).success).toBe(false)
  })
  it('accepts only the M4 lists and positive gate ids', () => {
    expect(rankingParamsSchema.safeParse({ key: 'gold' }).success).toBe(false)
    expect(rankingParamsSchema.parse({ key: 'arena' })).toEqual({ key: 'arena' })
    expect(tollGateRankingParamsSchema.parse({ gateId: '100001' })).toEqual({ gateId: 100001 })
    expect(tollGateRankingParamsSchema.safeParse({ gateId: 'x' }).success).toBe(false)
  })
})
