import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { exportReborn, rewriteAtlas, selectAssets, ultimateId } from './reborn.ts'

describe('reborn asset import', () => {
  it('changes page names without changing frame geometry or atlas metadata', () => {
    const atlas = {
      textures: [
        {
          image: 'page.png',
          frames: [{ filename: '1', frame: { x: 4, y: 5, w: 6, h: 7 }, rotated: true }],
        },
      ],
      meta: { scale: '1' },
    }
    expect(rewriteAtlas(atlas)).toEqual({
      ...atlas,
      textures: [{ ...atlas.textures[0], image: 'page.webp' }],
    })
    expect(atlas.textures[0]!.image).toBe('page.png')
  })
  it('includes M5 assets and excludes deferred avatars, weapons and seasonal art', () => {
    const entry = (category: string, id: string, path: string) => ({ category, id, path, bytes: 1 })
    const wanted = [
      entry('avatar-secret-technique', '120', 'entities/avatars/120/secret.json'),
      entry('skill-effect', '1831', 'entities/skills/core/1831-0.png'),
      entry('npc', '81044', 'icons/npc/81044.png'),
      entry('event', 'tailedBeast', 'scenes/tailedBeast/beast-1.png'),
    ]
    const excluded = [
      entry('avatar-secret-technique', '121', 'entities/avatars/121/secret.json'),
      entry('avatar', '1', 'entities/avatars/1/avatar.json'),
      entry('avatar-weapon', '1', 'entities/avatars/1/weapons/1.json'),
      entry('skill-effect', 'balsam', 'entities/skills/core/balsam.png'),
      entry('npc', '81045', 'icons/npc/81045.png'),
      entry('event', 'christmas', 'events/christmas/token.png'),
    ]
    expect(
      selectAssets({
        assets: [...wanted, ...excluded],
        secretTechniques: { '120': ['secret'], '121': ['secret'] },
      }),
    ).toEqual(wanted)
  })
  it('maps outfit ultimates across the 100/101 boundary', () => {
    expect([1, 100, 101, 120].map(ultimateId)).toEqual([1901, 2000, 2201, 2220])
  })
})

it('exports every outfit and variant, preserves concurrent metadata, and writes nothing on rerun', async () => {
  const root = mkdtempSync(join(tmpdir(), 'reborn-test-'))
  const raw = join(root, 'raw')
  const write = (file: string, body: string | Buffer) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  const json = (file: string, value: unknown) => write(join(raw, file), JSON.stringify(value))
  try {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#ff000080' },
    })
      .png()
      .toBuffer()
    const assets: { category: string; id: string; path: string; bytes: number }[] = []
    const secretTechniques: Record<string, string[]> = {}
    for (let clothing = 1; clothing <= 100; clothing++) {
      const dir = `entities/avatars/${clothing}`
      const st = {
        damageFrame: 1,
        motionFrame: 1,
        offset: [0, 0],
        transforms: {},
        concurrent: 'back',
        concurrentOffset: [-1000, 0],
        concurrentOrigin: 'source',
        targetAnimation: '250',
        holdDeathUntilReaction: true,
      }
      json(`assets/${dir}/data.json`, {
        secretTechnique: st,
        ...(clothing === 1 ? { secretTechniqueVariants: [{ ...st, variantId: 'ru-19010' }] } : {}),
      })
      secretTechniques[clothing] = ['secret_technique', 'back']
      for (const name of secretTechniques[clothing]!) {
        const atlas = `${dir}/${name}.json`,
          image = `${dir}/${name}.png`
        json(`assets/${atlas}`, {
          textures: [
            {
              image: `${name}.png`,
              frames: [{ filename: '1', frame: { x: 0, y: 0, w: 2, h: 2 } }],
            },
          ],
        })
        write(join(raw, 'assets', image), png)
        assets.push(
          { category: 'avatar-secret-technique', id: String(clothing), path: atlas, bytes: 1 },
          {
            category: 'avatar-secret-technique',
            id: String(clothing),
            path: image,
            bytes: png.length,
          },
        )
      }
    }
    const items = Object.fromEntries(
      [
        ...Array.from({ length: 12 }, (_, i) => 540001 + i),
        ...Array.from({ length: 12 }, (_, i) => 540101 + i),
      ].map((id) => [id, ['scroll']]),
    )
    json('json_items.json', items)
    json('re/serverConfig.json', { bloodline: { Limits: {} } })
    write(join(raw, 'assets/icons/items/scroll.png'), png)
    assets.push({
      category: 'item-icon',
      id: '540001',
      path: 'icons/items/scroll.png',
      bytes: png.length,
    })
    json('re/assets-manifest.json', { assets, secretTechniques })
    const first = await exportReborn(raw, root)
    expect(first.outfits).toBe(100)
    expect(first.techniques).toBe(101)
    const techniques = JSON.parse(
      readFileSync(join(root, 'client/src/generated/reborn-secret-techniques.json'), 'utf8'),
    )
    expect(techniques['19010']).toMatchObject({
      clothing: 1,
      concurrentOrigin: 'source',
      concurrentOffset: [-1000, 0],
      targetAnimation: '250',
      holdDeathUntilReaction: true,
      concurrent: {
        atlas: '/assets/reborn/entities/avatars/1/back.json',
        pages: ['/assets/reborn/entities/avatars/1/back.webp'],
      },
    })
    expect((await exportReborn(raw, root)).writes).toBe(0)
    write(join(root, 'client/public/assets/reborn/entities/avatars/1/back.webp'), 'corrupted')
    expect((await exportReborn(raw, root)).writes).toBe(1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30000)
