// Reborn's outdoor boss atlases are larger than their battle sprites; keep their scene offsets.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { format } from 'prettier'
import { paths } from './paths.ts'
import { writeSheet } from './sheet.ts'
import type { MotionSheet } from '../../client/src/generated/game-assets.ts'

const raw = resolve(process.env.REBORN_RAW_DIR ?? 'data/reborn-raw')
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const timed = read(join(paths.gameData, 'scene-timed-npcs.json')) as Record<string, { r: string[] }>
const scenes = read(join(raw, 're/serverConfig.json')).scenes as Record<string, { boss?: number }>
const locale = read(join(raw, 'locales_en_translation.json')) as Record<string, string>
const config = read(join(raw, 'assets/scenes/npcs.json')) as Record<
  string,
  Record<
    string,
    { position: [number, number]; offset: number[]; nameOffset?: number[]; size: number[] }
  >
>
const canonical = new Map<number, string>()
const fieldBosses: Record<
  string,
  { npcId: string; artId: string; nameKey: string; x: number; y: number; scale: number }
> = {}
const names: Record<string, string> = {}
const result: Record<string, { sheet: MotionSheet; nameOffset: { x: number; y: number } }> = {}
const work = mkdtempSync(join(tmpdir(), 'pockie-field-boss-'))
try {
  for (const [sceneId, row] of Object.entries(scenes)) {
    if (!row.boss) continue
    const asset = row.boss
    const id = timed[sceneId]?.r[0]?.split(',')[0]
    const placement = config[sceneId]?.[String(asset)]
    if (!id || !placement) throw new Error(`Missing field boss placement ${sceneId}/${asset}`)
    if (!canonical.has(asset)) canonical.set(asset, id)
    const nameKey = `lg_field_boss_${asset}`
    const name = locale[`npc__${asset}--name`]
    if (!name) throw new Error(`Missing field boss name ${asset}`)
    names[nameKey] = name
    fieldBosses[sceneId] = {
      npcId: id,
      artId: canonical.get(asset)!,
      nameKey,
      x: placement.position[0],
      y: placement.position[1],
      scale: 100,
    }
    const source = join(raw, `assets/entities/npcs/${asset}`)
    const atlas = read(`${source}.json`) as {
      textures: {
        image: string
        frames: {
          filename: string
          rotated: boolean
          frame: { x: number; y: number; w: number; h: number }
          sourceSize: { w: number; h: number }
          spriteSourceSize: { x: number; y: number }
        }[]
      }[]
    }
    const frames = atlas.textures
      .flatMap((page) => page.frames.map((frame) => ({ ...frame, image: page.image })))
      .sort((a, b) => Number(a.filename) - Number(b.filename))
    const files: string[] = []
    for (const [i, frame] of frames.entries()) {
      if (frame.rotated) throw new Error(`Rotated boss frame ${asset}/${frame.filename}`)
      const buffer = await sharp(join(raw, 'assets/entities/npcs', frame.image))
        .extract({
          left: frame.frame.x,
          top: frame.frame.y,
          width: frame.frame.w,
          height: frame.frame.h,
        })
        .toBuffer()
      const file = join(work, `${i}.png`)
      await sharp({
        create: {
          width: frame.sourceSize.w,
          height: frame.sourceSize.h,
          channels: 4,
          background: '#0000',
        },
      })
        .composite([
          { input: buffer, left: frame.spriteSourceSize.x, top: frame.spriteSourceSize.y },
        ])
        .png()
        .toFile(file)
      files.push(file)
    }
    const dir = join(paths.assets, 'game/field-bosses')
    mkdirSync(dir, { recursive: true })
    const sheet = await writeSheet(
      files,
      { x: -placement.offset[0]!, y: -placement.offset[1]! },
      join(dir, `${asset}.webp`),
    )
    if (!sheet) throw new Error(`Empty boss atlas ${asset}`)
    result[id] = {
      sheet: { ...sheet, file: `/assets/game/field-bosses/${asset}.webp`, labels: {} },
      nameOffset: {
        x: placement.offset[0]! + placement.size[0]! / 2 + (placement.nameOffset?.[0] ?? 0),
        y: placement.offset[1]! + (placement.nameOffset?.[1] ?? 0),
      },
    }
  }
  const namesFile = join(paths.root, 'client/src/i18n/reborn.json')
  const outputs = [
    [join(paths.generated, 'field-bosses.json'), result],
    [join(paths.gameData, 'reborn/field-bosses.json'), fieldBosses],
    [namesFile, { ...read(namesFile), ...names }],
  ] as const
  for (const [file, data] of outputs)
    writeFileSync(file, await format(JSON.stringify(data), { parser: 'json', printWidth: 100 }))
  console.log(`Exported ${Object.keys(result).length} field boss placements`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
