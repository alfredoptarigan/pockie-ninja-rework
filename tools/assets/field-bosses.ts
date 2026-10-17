// Reborn's outdoor boss atlases are larger than their battle sprites; keep their scene offsets.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { format } from 'prettier'
import { exportMotions } from './motions.ts'
import { iconSource } from './sources.ts'
import { paths } from './paths.ts'
import { writeSheet } from './sheet.ts'
import type { MotionSheet } from '../../client/src/generated/game-assets.ts'

const raw = resolve(process.env.REBORN_RAW_DIR ?? 'data/reborn-raw')
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const timed = read(join(paths.gameData, 'scene-timed-npcs.json')) as Record<string, { r: string[] }>
const npcs = read(join(paths.gameData, 'npcs.json')) as Record<string, { ResourceID: string }>
const config = read(join(raw, 'assets/scenes/npcs.json')) as Record<
  string,
  Record<string, { offset: number[]; nameOffset?: number[]; size: number[] }>
>
const npcFiles = readdirSync(join(paths.movieclips, 'npc'))
const result: Record<string, { sheet: MotionSheet; nameOffset: { x: number; y: number } }> = {}
const work = mkdtempSync(join(tmpdir(), 'pockie-field-boss-'))
try {
  for (const [sceneId, rows] of Object.entries(timed)) {
    const id = rows.r[0]!.split(',')[0]!
    const asset =
      iconSource(npcs[id]!.ResourceID)?.match(/userface_n(\d+)/i)?.[1] ??
      npcs[id]!.ResourceID.replace('OutUserFace_N', '')
    const source = join(raw, `assets/entities/npcs/${asset}`)
    const placement = config[sceneId]?.[asset ?? '']
    if (!placement || !existsSync(`${source}.json`)) {
      const swf = npcFiles.find((file) =>
        new RegExp(`^n${asset}(\\.s\\d+)?\\.swf$`, 'i').test(file),
      )
      if (!swf) throw new Error(`Missing outdoor boss ${id} (${asset})`)
      const sheet = (
        await exportMotions(
          [{ motion: 'stand', path: join(paths.movieclips, 'npc', swf) }],
          `game/field-bosses/${asset}`,
        )
      ).motions.stand
      if (!sheet) throw new Error(`Empty outdoor boss ${id}`)
      result[id] = {
        sheet,
        nameOffset: { x: sheet.frameWidth / 2 - sheet.anchor.x, y: -sheet.anchor.y - 12 },
      }
      continue
    }
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
  writeFileSync(
    join(paths.generated, 'field-bosses.json'),
    await format(JSON.stringify(result), { parser: 'json', printWidth: 100 }),
  )
  console.log(`Exported ${Object.keys(result).length} field boss placements`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
