import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeAmf3, decodeCompressedAmf3 } from './amf3.ts'

const bytes = (...parts: (number | string | Buffer)[]) =>
  Buffer.concat(
    parts.map((part) => (typeof part === 'number' ? Buffer.from([part]) : Buffer.from(part))),
  )

// Inline string: U29 (length << 1 | 1) followed by UTF-8 bytes.
const str = (value: string) => bytes((Buffer.byteLength(value) << 1) | 1, value)

describe('decodeAmf3', () => {
  it('decodes scalars', () => {
    expect(decodeAmf3(bytes(0x01))).toBeNull()
    expect(decodeAmf3(bytes(0x02))).toBe(false)
    expect(decodeAmf3(bytes(0x03))).toBe(true)
    expect(decodeAmf3(bytes(0x04, 0x7f))).toBe(127)
    expect(decodeAmf3(bytes(0x04, 0x81, 0x25))).toBe(165)
    // 29-bit negative integer: -1 is 0xFF 0xFF 0xFF 0xFF
    expect(decodeAmf3(bytes(0x04, 0xff, 0xff, 0xff, 0xff))).toBe(-1)
    const double = Buffer.alloc(9)
    double[0] = 0x05
    double.writeDoubleBE(1.5, 1)
    expect(decodeAmf3(double)).toBe(1.5)
  })

  it('decodes inline and referenced strings', () => {
    // A dense array of three strings: "Key", "Key" by reference (index 0), "" (never referenced).
    const buffer = bytes(0x09, (3 << 1) | 1, 0x01, 0x06, str('Key'), 0x06, 0x00, 0x06, 0x01)
    expect(decodeAmf3(buffer)).toEqual(['Key', 'Key', ''])
  })

  it('decodes a dynamic anonymous object like the language table', () => {
    // 0x0b = inline traits, dynamic, 0 sealed members; class name "".
    const buffer = bytes(
      0x0a,
      0x0b,
      0x01,
      str('lg_Attack'),
      0x06,
      str('Serangan'),
      str('lg_Skip'),
      0x06,
      0x02, // reference to string #1 ("Serangan")
      0x01, // end of dynamic members
    )
    expect(decodeAmf3(buffer)).toEqual({ lg_Attack: 'Serangan', lg_Skip: 'Serangan' })
  })

  it('decodes sealed members and reuses traits by reference', () => {
    // Array of two objects with one sealed member "id"; the second reuses traits #0.
    const buffer = bytes(
      0x09,
      (2 << 1) | 1,
      0x01,
      0x0a,
      (1 << 4) | 0x03, // inline traits, not dynamic, 1 sealed member
      0x01, // class name ""
      str('id'),
      0x04,
      0x07,
      0x0a,
      0x01, // traits reference #0: (0 << 2) | 0b01
      0x04,
      0x08,
    )
    expect(decodeAmf3(buffer)).toEqual([{ id: 7 }, { id: 8 }])
  })

  it('decodes an object vector like the data tables', () => {
    const buffer = bytes(0x10, (2 << 1) | 1, 0x00, 0x01, 0x06, str('1'), 0x06, str('2'))
    expect(decodeAmf3(buffer)).toEqual(['1', '2'])
  })

  it('decodes int vectors', () => {
    const body = Buffer.alloc(8)
    body.writeInt32BE(-5, 0)
    body.writeInt32BE(9, 4)
    expect(decodeAmf3(Buffer.concat([bytes(0x0d, (2 << 1) | 1, 0x00), body]))).toEqual([-5, 9])
  })

  it('reads zlib-compressed payloads', () => {
    const payload = deflateSync(bytes(0x0a, 0x0b, 0x01, str('a'), 0x04, 0x01, 0x01))
    expect(decodeCompressedAmf3(payload)).toEqual({ a: 1 })
  })

  it('rejects unknown markers', () => {
    expect(() => decodeAmf3(bytes(0x42))).toThrow(/marker 0x42/)
  })
})
