import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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
      entry('avatar-ui', '120', 'poses/120.png'),
      entry('avatar-ui', '170', 'poses/170.png'),
      entry('skill-icon', '1808', 'icons/skills/1808.png'),
    ]
    const excluded = [
      entry('avatar-secret-technique', '121', 'entities/avatars/121/secret.json'),
      entry('avatar-ui', '121', 'poses/121.png'),
      entry('avatar-ui', '56', 'portraits/56.png'),
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
        // 2 falls back to its animation offset, 3 has none (no concurrent layer, like Reborn).
        ...(clothing === 2 || clothing === 3 ? {} : { concurrentOffset: [-1000, 0] }),
        concurrentOrigin: 'source',
        targetAnimation: '250',
        holdDeathUntilReaction: true,
      }
      json(`assets/${dir}/data.json`, {
        secretTechnique: st,
        ...(clothing === 2 ? { animations: { back: [100, 380] } } : {}),
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
    const jpg = await sharp(png).jpeg().toBuffer()
    const m6Items = addM6Fixture({ raw, json, write, assets, png, jpg })
    json('json_items.json', { ...items, ...m6Items })
    json('re/serverConfig.json', { bloodline: { Limits: {} }, petFamilies: {} })
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
    expect(techniques['1902'].concurrentOffset).toEqual([100, 380])
    expect(techniques['1903'].concurrent).toBeUndefined()
    expect(techniques['1903'].concurrentOffset).toBeUndefined()
    const generated = (name: string) =>
      JSON.parse(readFileSync(join(root, 'client/src/generated', name), 'utf8'))
    const pets = generated('reborn-pets.json')
    expect(pets['10']).toMatchObject({
      item: 320001,
      icon: '/assets/reborn/icons/items/pets/10.webp',
      atlas: '/assets/reborn/entities/pets/10/avatar.json',
      pages: [
        '/assets/reborn/entities/pets/10/avatar.webp',
        '/assets/reborn/entities/pets/10/avatar.page-1.webp',
      ],
      motionEvents: { 52: { frames: 2, impactFrame: 1 } },
    })
    expect(pets['20']).toEqual({ item: 320002, icon: '/assets/reborn/icons/items/pets/20.webp' })
    const petAtlas = JSON.parse(
      readFileSync(join(root, 'client/public/assets/reborn/entities/pets/10/avatar.json'), 'utf8'),
    )
    expect(petAtlas.textures.map((t: { frames: unknown }) => t.frames)).toEqual([frames, frames])
    const wings = generated('reborn-wings.json')
    expect(wings.wing_a).toMatchObject({ item: 218000, offset: [1, 2], animations: { 1: [0, 0] } })
    expect(wings.wing_b.offset).toEqual([-6, -6])
    expect(generated('reborn-auras.json').aura_a.pages).toEqual([
      '/assets/reborn/entities/auras/aura_a/aura-0.webp',
    ])
    const effects = generated('reborn-effects.json')
    expect(effects.effects.burn).toMatchObject({ offset: [-66.25, -161.05], buffs: ['BURN'] })
    expect(effects.numbers.heal.atlas).toBe('/assets/reborn/entities/numbers/heal.json')
    const cards = generated('reborn-cards.json')
    expect(cards.flatMap((c: { cards: unknown[] }) => c.cards)).toHaveLength(74)
    expect(cards[9].cards[4]).toEqual({
      id: 74,
      name: '5',
      image: '/assets/reborn/icons/items/cards/C10/5.webp',
    })
    const m5 = Object.values(generated('reborn-assets.json')) as { category: string }[]
    expect(m5.some((a) => a.category === 'pets' || a.category === 'combat-effects')).toBe(false)
    expect(
      existsSync(join(root, 'client/public/assets/reborn/scenes/backgrounds/1_fight.webp')),
    ).toBe(false)
    expect((await exportReborn(raw, root)).writes).toBe(0)
    write(join(root, 'client/public/assets/reborn/entities/avatars/1/back.webp'), 'corrupted')
    expect((await exportReborn(raw, root)).writes).toBe(1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30000)

const frames = [{ filename: '52/1', frame: { x: 0, y: 0, w: 2, h: 2 }, rotated: false }]
type Asset = { category: string; id: string; path: string; bytes: number }
/** One of each M6 group: pets with and without art, a listed and an unlisted wing mount, an aura,
 * a buff visual, damage numbers, status icons and 74 cards. Returns the json_items rows. */
function addM6Fixture({
  raw,
  json,
  write,
  assets,
  png,
  jpg,
}: {
  raw: string
  json: (file: string, value: unknown) => void
  write: (file: string, body: string | Buffer) => void
  assets: Asset[]
  png: Buffer
  jpg: Buffer
}) {
  const asset = (category: string, path: string, body: unknown) => {
    if (Buffer.isBuffer(body)) write(join(raw, 'assets', path), body)
    else json(`assets/${path}`, body)
    if (!/(data|offsets)\.json$/.test(path)) assets.push({ category, id: path, path, bytes: 1 })
  }
  const atlas = (category: string, dir: string, name: string, pages: string[]) => {
    asset(category, `${dir}/${name}.json`, {
      textures: pages.map((page) => ({ image: page, frames })),
    })
    for (const page of pages) asset(category, `${dir}/${page}`, png)
  }
  atlas('pets', 'entities/pets/10', 'avatar', ['avatar.png', 'avatar.page-1.png'])
  asset('pets', 'entities/pets/10/data.json', {
    animations: { 52: [1, 2] },
    motionEvents: { 52: { frames: 2, impactFrame: 1 } },
  })
  asset('pets', 'icons/items/pets/10.png', png)
  asset('pets', 'icons/items/pets/20.png', png)
  for (const wing of ['wing_a', 'wing_b']) {
    atlas('wings', `entities/wings/${wing}`, 'avatar', ['avatar.png'])
    asset('wings', `entities/wings/${wing}/data.json`, { animations: { 1: [0, 0] } })
    asset('wings', `icons/items/wings/${wing}.png`, png)
  }
  atlas('auras', 'entities/auras/aura_a', 'aura', ['aura-0.png'])
  asset('auras', 'icons/items/wings/aura_a.png', png)
  atlas('combat-effects', 'entities/effects', 'burn', ['burn.png'])
  asset('combat-effects', 'entities/effects/offsets.json', {})
  atlas('combat-effects', 'entities/numbers', 'normal', ['normal.png'])
  atlas('combat-effects', 'entities/numbers', 'heal', ['heal.png'])
  atlas('combat-effects', 'icons', 'effects', ['effects.png'])
  asset('combat-effects', 'scenes/backgrounds/1_fight.png', png)
  const collections = Array.from({ length: 10 }, (_, i) => {
    const files = Array.from({ length: i < 8 ? 8 : 5 }, (_, n) => `${n + 1}.jpg`)
    for (const file of files) asset('cards', `icons/items/cards/C${i + 1}/${file}`, jpg)
    const list = files.map((f) => `"${f}"`).join(',')
    const name = i ? `C${i + 1}` : 'Konoha Village'
    return `{name:"${name}",folder:"C${i + 1}",cards:[${list}],rarity:lx.GREEN,color:1}`
  })
  write(
    join(raw, 're/main.js'),
    'const O={wing_duotian_3:[-38,-8],wing_a:[1,2]};' +
      'we={[-1]:{name:"default",offset:{x:0,y:0},hidden:!0},' +
      '[x.dc.BURN]:{name:"burn",offset:{x:-66.25,y:-161.05}}},je=(e,t,i)=>({});' +
      ';const Se=[];' +
      `dx=[${collections.join(',')}];`,
  )
  const row = (name: string, extra: object) => [name, 1, 1, 10, [], null, 4, extra]
  return {
    320001: row('pets/10', { avatar: 10 }),
    320002: row('pets/20', { avatar: 20 }),
    218000: row('wings/wing_a', { stat: 10000, bonus: 0, wingSprite: 'wing_a' }),
    218001: row('wings/wing_b', { stat: 10001, bonus: 0, wingSprite: 'wing_b' }),
    218200: row('wings/aura_a', { stat: 10000, bonus: 0, battleAura: 'aura_a' }),
  }
}
