// Exports a set of motion SWFs (one character's animations) to WebP sheets plus metadata.
// Every motion SWF exposes its animation as the "MotionSource" symbol; its registration point is
// where the character stands, and its frame labels mark the start, the hit and the end.
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { cached } from './cache.ts'
import { exportSprites } from './ffdec.ts'
import { assetUrl, paths } from './paths.ts'
import { writeSheet, type SheetMeta } from './sheet.ts'
import { symbolTimeline } from './swf.ts'

const SYMBOL = 'MotionSource'

export interface Motion extends SheetMeta {
  file: string
  /** Frame label (MotionStart, Attacking, MotionOver) to 0-based tick. */
  labels: Record<string, number>
}

export interface MotionFile {
  motion: string
  path: string
}

function byFrameNumber(a: string, b: string) {
  return Number.parseInt(a) - Number.parseInt(b)
}

/** Registration point inside the PNG frames, read from FFDec's SVG of the first frame. */
function anchorFromSvg(svg: string, pngWidth: number, pngHeight: number) {
  const size = /<svg[^>]*?height="([\d.]+)px"[^>]*?width="([\d.]+)px"/.exec(svg)
  const matrix = /<g transform="matrix\(([^)]*)\)"/.exec(svg)
  if (!size || !matrix) throw new Error('Unexpected FFDec SVG layout')
  const [, height, width] = size.map(Number) as [number, number, number]
  const values = matrix[1]!.split(',').map(Number)
  // PNG frames can be a little larger than the SVG (filter padding on both sides).
  return {
    x: values[4]! + (pngWidth - width) / 2,
    y: values[5]! + (pngHeight - height) / 2,
  }
}

function symbolDir(root: string) {
  const entry = readdirSync(root).find((name) => name.endsWith(`_${SYMBOL}`))
  return entry ? join(root, entry) : undefined
}

function hashFiles(files: MotionFile[]) {
  const hash = createHash('sha1')
  for (const { motion, path } of files) hash.update(motion).update(readFileSync(path))
  return hash.digest('hex')
}

async function sheetFor(work: string, file: MotionFile, outDir: string) {
  const name = `${file.motion}.swf`
  const pngDir = symbolDir(join(work, 'png', name))
  const svgDir = symbolDir(join(work, 'svg', name))
  if (!pngDir || !svgDir) return undefined
  const frames = readdirSync(pngDir)
    .filter((entry) => entry.endsWith('.png'))
    .sort(byFrameNumber)
    .map((entry) => join(pngDir, entry))
  const first = await sharp(frames[0]!).metadata()
  const anchor = anchorFromSvg(
    readFileSync(join(svgDir, '1.svg'), 'utf8'),
    first.width ?? 0,
    first.height ?? 0,
  )
  const relative = `${outDir}/${file.motion}.webp`
  const meta = await writeSheet(frames, anchor, join(paths.assets, relative))
  if (!meta) return undefined
  const labels = symbolTimeline(readFileSync(file.path), SYMBOL)?.labels ?? {}
  return { file: assetUrl(relative), ...meta, labels } satisfies Motion
}

/**
 * Exports `files` into client/public/assets/<outDir>/<motion>.webp. Motions without a
 * MotionSource symbol or with only transparent frames are returned in `skipped`.
 * Re-runs reuse the previous result when the SWFs did not change.
 */
export async function exportMotions(files: MotionFile[], outDir: string) {
  return cached(`motions:${outDir}`, hashFiles(files), [join(paths.assets, outDir)], async () => {
    const work = mkdtempSync(join(paths.cache, 'work-'))
    try {
      const input = join(work, 'in')
      mkdirSync(input)
      for (const file of files) symlinkSync(file.path, join(input, `${file.motion}.swf`))
      await exportSprites(input, work)

      rmSync(join(paths.assets, outDir), { recursive: true, force: true })
      mkdirSync(join(paths.assets, outDir), { recursive: true })
      const motions: Record<string, Motion> = {}
      const skipped: string[] = []
      for (const file of files) {
        const motion = existsSync(join(work, 'png', `${file.motion}.swf`))
          ? await sheetFor(work, file, outDir)
          : undefined
        if (motion) motions[file.motion] = motion
        else skipped.push(file.motion)
      }
      return { motions, skipped }
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
}
