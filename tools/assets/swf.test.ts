import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { scalingGrids, symbolTimeline } from './swf.ts'

function tag(code: number, body: Buffer) {
  const header = Buffer.alloc(2)
  header.writeUInt16LE((code << 6) | body.length)
  return Buffer.concat([header, body])
}
const u16 = (value: number) => Buffer.from([value & 0xff, value >> 8])
const cstring = (value: string) => Buffer.from(`${value}\0`, 'utf8')

/** A compressed SWF with sprite 3 bound to MotionSource: 3 frames, labels on frames 0 and 2. */
function sampleSwf() {
  const sprite = Buffer.concat([
    u16(3),
    u16(3),
    tag(43, cstring('MotionStart')),
    tag(1, Buffer.alloc(0)),
    tag(1, Buffer.alloc(0)),
    tag(43, cstring('Attacking')),
    tag(1, Buffer.alloc(0)),
    tag(0, Buffer.alloc(0)),
  ])
  const symbols = Buffer.concat([u16(1), u16(3), cstring('MotionSource')])
  // Empty RECT (one byte), frame rate 12.0, frame count 1.
  const header = Buffer.from([0x00, 0x00, 0x0c, 0x01, 0x00])
  const body = Buffer.concat([header, tag(39, sprite), tag(76, symbols), tag(0, Buffer.alloc(0))])
  const length = Buffer.alloc(4)
  length.writeUInt32LE(body.length + 8)
  return Buffer.concat([Buffer.from('CWS'), Buffer.from([10]), length, deflateSync(body)])
}

describe('symbolTimeline', () => {
  it('reads the frame count and labels of the sprite bound to a class name', () => {
    expect(symbolTimeline(sampleSwf(), 'MotionSource')).toEqual({
      frames: 3,
      labels: { MotionStart: 0, Attacking: 2 },
    })
  })

  it('returns undefined when no symbol has that class name', () => {
    expect(symbolTimeline(sampleSwf(), 'Other')).toBeUndefined()
  })
})

/** RECT with 8 signed bits per field (values in twips). */
function rect(xMin: number, xMax: number, yMin: number, yMax: number) {
  const bits = [8, xMin, xMax, yMin, yMax]
    .map((value, i) => (value & (i === 0 ? 0x1f : 0xff)).toString(2).padStart(i === 0 ? 5 : 8, '0'))
    .join('')
    .padEnd(40, '0')
  return Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)))
}

function gridSwf() {
  const grid = Buffer.concat([u16(5), rect(20, 100, 40, 60)])
  const symbols = Buffer.concat([u16(1), u16(5), cstring('Button_defaultImage')])
  const header = Buffer.from([0x00, 0x00, 0x0c, 0x01, 0x00])
  return Buffer.concat([
    Buffer.from('FWS'),
    Buffer.from([10, 0, 0, 0, 0]),
    header,
    tag(78, grid),
    tag(76, symbols),
    tag(0, Buffer.alloc(0)),
  ])
}

describe('scalingGrids', () => {
  it('reads the 9-slice rectangle (in pixels) of each named symbol', () => {
    expect(scalingGrids(gridSwf())).toEqual({
      Button_defaultImage: { xMin: 1, xMax: 5, yMin: 2, yMax: 3 },
    })
  })
})
