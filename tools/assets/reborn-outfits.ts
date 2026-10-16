// Convert a Reborn-only outfit's captured atlas (Madara 170, Hashirama 188) into the same sheets used by the 2011 outfits.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { format } from 'prettier'
import { writeSheet } from './sheet.ts'
import { paths } from './paths.ts'
import type { OutfitArt } from '../../client/src/generated/game-assets.ts'

type Frame = {
  filename: string
  rotated: boolean
  trimmed: boolean
  frame: { x: number; y: number; w: number; h: number }
}

export const REBORN_ONLY_CLOTHING = [170, 188]

export async function exportRebornOutfit(raw: string, clothing: number) {
  const source = join(raw, `assets/entities/avatars/${clothing}`)
  const atlas = JSON.parse(readFileSync(join(source, 'avatar.json'), 'utf8')) as {
    textures: { image: string; frames: Frame[] }[]
  }
  const data = JSON.parse(readFileSync(join(source, 'data.json'), 'utf8')) as {
    animations: Record<string, [number, number]>
  }
  const work = mkdtempSync(join(tmpdir(), `pockie-outfit-${clothing}-`))
  const motions: OutfitArt['motions'] = {}
  try {
    for (const [motion, offset] of Object.entries(data.animations)) {
      if (['60', '800'].includes(motion)) continue
      const frames = atlas.textures
        .flatMap((page) =>
          page.frames
            .filter((frame) => frame.filename.startsWith(`${motion}/`))
            .map((frame) => ({ ...frame, image: page.image })),
        )
        .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
      if (!frames.length) continue
      const files: string[] = []
      for (const [i, frame] of frames.entries()) {
        if (frame.rotated || frame.trimmed)
          throw new Error(`Unsupported outfit ${clothing} frame ${frame.filename}`)
        const file = join(work, `${motion}-${i}.png`)
        await sharp(join(source, frame.image))
          .extract({
            left: frame.frame.x,
            top: frame.frame.y,
            width: frame.frame.w,
            height: frame.frame.h,
          })
          .png()
          .toFile(file)
        files.push(file)
      }
      const relative = `game/outfits/${clothing}/${motion}.webp`
      const output = join(paths.assets, relative)
      mkdirSync(dirname(output), { recursive: true })
      const sheet = await writeSheet(files, { x: -offset[0], y: -offset[1] }, output)
      if (sheet) motions[motion] = { ...sheet, file: `/assets/${relative}`, labels: {} }
    }
    if (!motions['999'] || !motions['52'])
      throw new Error(`Outfit ${clothing} is missing stand or attack art`)
    const icon = join(paths.assets, `reborn/icons/items/avatars/${clothing}.webp`)
    mkdirSync(dirname(icon), { recursive: true })
    await sharp(join(raw, `assets/icons/items/avatars/${clothing}.png`))
      .webp({ lossless: true })
      .toFile(icon)
    const portrait = `game/portraits/outfit-${clothing}.webp`
    // Match Reborn's live HUD portrait, including its supplied artwork.
    await sharp(join(raw, `assets/icons/people/${clothing}.png`))
      .webp({ lossless: true })
      .toFile(join(paths.assets, portrait))
    return {
      sex: 0,
      portrait: `/assets/${portrait}`,
      motions,
      actions: Object.fromEntries(Object.keys(motions).map((id) => [id, id])),
      skipped: ['60', '800'],
    } satisfies OutfitArt
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const raw = resolve(process.env.REBORN_RAW_DIR ?? 'data/reborn-raw')
  const file = join(paths.generated, 'game-motions.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  for (const clothing of REBORN_ONLY_CLOTHING) {
    const outfit = await exportRebornOutfit(raw, clothing)
    manifest.outfits[String(clothing)] = outfit
    console.log(`Outfit ${clothing}: ${Object.keys(outfit.motions).length} motions`)
  }
  writeFileSync(file, await format(JSON.stringify(manifest), { parser: 'json', printWidth: 100 }))
}
