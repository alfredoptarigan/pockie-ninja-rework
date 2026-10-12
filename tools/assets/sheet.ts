// Packs the PNG frames FFDec renders for one animation into a single WebP sprite sheet:
// consecutive duplicate frames become one cell with a longer duration, transparent margins shared
// by every frame are trimmed, and cells are laid out left to right, wrapping into rows.
import sharp from 'sharp'

// Keeps sheets inside the texture size every WebGL device supports.
const MAX_SHEET_WIDTH = 4096
const MAX_WEBP_SIZE = 16383
const WEBP = { quality: 82, alphaQuality: 90, effort: 6 } as const

export interface SheetMeta {
  frameWidth: number
  frameHeight: number
  columns: number
  /** Number of cells in the sheet. */
  frames: number
  /** Ticks each cell stays on screen; the sum is the original frame count. */
  durations: number[]
  /** Registration point of the original symbol inside a cell (put it on the character's spot). */
  anchor: { x: number; y: number }
}

interface Raw {
  data: Buffer
  width: number
  height: number
}

async function readRaw(file: string): Promise<Raw> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Places every frame on a canvas of the largest frame size (frames share their top-left origin). */
function padTo(frame: Raw, width: number, height: number): Raw {
  if (frame.width === width && frame.height === height) return frame
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < frame.height; y++) {
    frame.data.copy(data, y * width * 4, y * frame.width * 4, (y + 1) * frame.width * 4)
  }
  return { data, width, height }
}

/** Bounding box of all non-transparent pixels over every frame, or undefined if all are empty. */
export function opaqueBounds(frames: Raw[]) {
  let left = Infinity
  let top = Infinity
  let right = -1
  let bottom = -1
  for (const { data, width, height } of frames) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return undefined
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** Collapses runs of identical frames into one cell each, counting how long each cell lasts. */
export function collapseRuns(frames: Raw[]) {
  const cells: Raw[] = []
  const durations: number[] = []
  for (const frame of frames) {
    const last = cells.at(-1)
    if (last && last.data.equals(frame.data)) durations[durations.length - 1]! += 1
    else {
      cells.push(frame)
      durations.push(1)
    }
  }
  return { cells, durations }
}

function crop(frame: Raw, box: { left: number; top: number; width: number; height: number }): Raw {
  const data = Buffer.alloc(box.width * box.height * 4)
  for (let y = 0; y < box.height; y++) {
    const start = ((box.top + y) * frame.width + box.left) * 4
    frame.data.copy(data, y * box.width * 4, start, start + box.width * 4)
  }
  return { data, width: box.width, height: box.height }
}

/**
 * Writes `files` (frame PNGs in play order) as a WebP sheet to `out`.
 * `anchor` is the symbol's registration point in the PNG coordinates.
 * Returns undefined when every frame is fully transparent.
 */
export async function writeSheet(
  files: string[],
  anchor: { x: number; y: number },
  out: string,
): Promise<SheetMeta | undefined> {
  const raw = await Promise.all(files.map(readRaw))
  const width = Math.max(...raw.map((frame) => frame.width))
  const height = Math.max(...raw.map((frame) => frame.height))
  const { cells, durations } = collapseRuns(raw.map((frame) => padTo(frame, width, height)))
  const box = opaqueBounds(cells)
  if (!box) return undefined

  const trimmed = cells.map((cell) => crop(cell, box))
  const columns = Math.max(1, Math.min(trimmed.length, Math.floor(MAX_SHEET_WIDTH / box.width)))
  const rows = Math.ceil(trimmed.length / columns)
  const sheetWidth = columns * box.width
  const sheetHeight = rows * box.height
  if (sheetWidth > MAX_WEBP_SIZE || sheetHeight > MAX_WEBP_SIZE) {
    throw new Error(`Sheet ${out} would be ${sheetWidth}x${sheetHeight}, too large for WebP`)
  }

  await sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 4, background: '#0000' },
  })
    .composite(
      trimmed.map((cell, index) => ({
        input: cell.data,
        raw: { width: cell.width, height: cell.height, channels: 4 as const },
        left: (index % columns) * box.width,
        top: Math.floor(index / columns) * box.height,
      })),
    )
    .webp(WEBP)
    .toFile(out)

  return {
    frameWidth: box.width,
    frameHeight: box.height,
    columns,
    frames: trimmed.length,
    durations,
    anchor: { x: Math.round(anchor.x - box.left), y: Math.round(anchor.y - box.top) },
  }
}
