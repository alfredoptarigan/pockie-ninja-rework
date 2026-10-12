// Minimal SWF tag reader: just enough to read the frame labels of a symbol's timeline
// (MotionStart, Attacking, MotionOver) without starting FFDec.
import { inflateSync } from 'node:zlib'

const TAG_END = 0
const TAG_SHOW_FRAME = 1
const TAG_DEFINE_SPRITE = 39
const TAG_FRAME_LABEL = 43
const TAG_SYMBOL_CLASS = 76
const TAG_DEFINE_SCALING_GRID = 78
const TWIPS_PER_PIXEL = 20

interface Tag {
  code: number
  body: Buffer
}

function* readTags(data: Buffer, offset: number): Generator<Tag> {
  while (offset + 2 <= data.length) {
    const header = data.readUInt16LE(offset)
    offset += 2
    const code = header >> 6
    let length = header & 0x3f
    if (length === 0x3f) {
      length = data.readUInt32LE(offset)
      offset += 4
    }
    yield { code, body: data.subarray(offset, offset + length) }
    offset += length
    if (code === TAG_END) return
  }
}

function readString(body: Buffer, offset: number) {
  const end = body.indexOf(0, offset)
  return { value: body.toString('utf8', offset, end), next: end + 1 }
}

/** Uncompressed SWF body (after the 8-byte header) and the offset of its first tag. */
function swfBody(file: Buffer) {
  const signature = file.toString('latin1', 0, 3)
  if (signature !== 'FWS' && signature !== 'CWS') throw new Error(`Unsupported SWF (${signature})`)
  const body = signature === 'CWS' ? inflateSync(file.subarray(8)) : file.subarray(8)
  const rectBits = body[0]! >> 3
  const rectBytes = Math.ceil((5 + rectBits * 4) / 8)
  // RECT, frame rate (u16), frame count (u16).
  return { body, firstTag: rectBytes + 4 }
}

/** Symbol id to class name for every SymbolClass entry. */
function symbolClasses(tags: Tag[]) {
  const names = new Map<number, string>()
  for (const tag of tags.filter((t) => t.code === TAG_SYMBOL_CLASS)) {
    const count = tag.body.readUInt16LE(0)
    let offset = 2
    for (let i = 0; i < count; i++) {
      const id = tag.body.readUInt16LE(offset)
      const name = readString(tag.body, offset + 2)
      names.set(id, name.value)
      offset = name.next
    }
  }
  return names
}

/** Reads a SWF RECT (signed fields, `bits` wide each) starting at byte `offset`. */
function readRect(body: Buffer, offset: number) {
  let bit = offset * 8
  const read = (count: number) => {
    let value = 0
    for (let i = 0; i < count; i++, bit++)
      value = (value << 1) | ((body[bit >> 3]! >> (7 - (bit & 7))) & 1)
    return value
  }
  const bits = read(5)
  const signed = () => {
    const value = read(bits)
    return value & (1 << (bits - 1)) ? value - (1 << bits) : value
  }
  const [xMin, xMax, yMin, yMax] = [signed(), signed(), signed(), signed()].map(
    (twips) => twips / TWIPS_PER_PIXEL,
  )
  return { xMin: xMin!, xMax: xMax!, yMin: yMin!, yMax: yMax! }
}

export interface Rect {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** The 9-slice (DefineScalingGrid) rectangle, in pixels, of every symbol that has a class name. */
export function scalingGrids(file: Buffer): Record<string, Rect> {
  const { body, firstTag } = swfBody(file)
  const tags = [...readTags(body, firstTag)]
  const names = symbolClasses(tags)
  const grids: Record<string, Rect> = {}
  for (const tag of tags.filter((t) => t.code === TAG_DEFINE_SCALING_GRID)) {
    const name = names.get(tag.body.readUInt16LE(0))
    if (name) grids[name] = readRect(tag.body, 2)
  }
  return grids
}

export interface Timeline {
  frames: number
  /** Frame label to 0-based frame index. */
  labels: Record<string, number>
}

/** Frame count and labels of the sprite bound to `className` (for example "MotionSource"). */
export function symbolTimeline(file: Buffer, className: string): Timeline | undefined {
  const { body, firstTag } = swfBody(file)
  const tags = [...readTags(body, firstTag)]

  let spriteId: number | undefined
  for (const [id, name] of symbolClasses(tags)) if (name === className) spriteId = id
  if (spriteId === undefined) return undefined

  const sprite = tags.find(
    (t) => t.code === TAG_DEFINE_SPRITE && t.body.readUInt16LE(0) === spriteId,
  )
  if (!sprite) return undefined
  let frames = 0
  const labels: Record<string, number> = {}
  for (const tag of readTags(sprite.body, 4)) {
    if (tag.code === TAG_SHOW_FRAME) frames++
    if (tag.code === TAG_FRAME_LABEL) labels[readString(tag.body, 0).value] ??= frames
  }
  return { frames, labels }
}
