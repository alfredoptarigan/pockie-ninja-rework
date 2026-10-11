import { inflateSync } from 'node:zlib'

// AMF3 decoder for the original client's data tables (.tab) and key-value tables (.kv).
// Spec: Adobe "Action Message Format -- AMF 3". Only decoding is needed.

interface Traits {
  className: string
  dynamic: boolean
  sealed: string[]
}

class Reader {
  private offset = 0
  private readonly strings: string[] = []
  private readonly objects: unknown[] = []
  private readonly traits: Traits[] = []
  private readonly buffer: Buffer

  constructor(buffer: Buffer) {
    this.buffer = buffer
  }

  private byte() {
    if (this.offset >= this.buffer.length) throw new Error('AMF3: unexpected end of data')
    return this.buffer[this.offset++]!
  }

  private u29() {
    let value = 0
    for (let i = 0; i < 3; i++) {
      const b = this.byte()
      if ((b & 0x80) === 0) return (value << 7) | b
      value = (value << 7) | (b & 0x7f)
    }
    return (value << 8) | this.byte()
  }

  private int29() {
    const value = this.u29()
    return value & 0x10000000 ? value - 0x20000000 : value
  }

  private take(length: number) {
    const slice = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  private string(): string {
    const header = this.u29()
    if ((header & 1) === 0) return this.strings[header >> 1]!
    const length = header >> 1
    if (length === 0) return ''
    const value = this.take(length).toString('utf8')
    this.strings.push(value)
    return value
  }

  private reference(header: number) {
    return (header & 1) === 0 ? { ref: this.objects[header >> 1] } : null
  }

  private readTraits(header: number): Traits {
    if ((header & 2) === 0) return this.traits[header >> 2]!
    if ((header & 4) !== 0) throw new Error('AMF3: externalizable objects are not supported')
    const dynamic = (header & 8) !== 0
    const count = header >> 4
    const className = this.string()
    const sealed = Array.from({ length: count }, () => this.string())
    const traits = { className, dynamic, sealed }
    this.traits.push(traits)
    return traits
  }

  private object() {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    const traits = this.readTraits(header)
    const result: Record<string, unknown> = {}
    this.objects.push(result)
    for (const name of traits.sealed) result[name] = this.value()
    if (traits.dynamic) {
      for (let key = this.string(); key !== ''; key = this.string()) result[key] = this.value()
    }
    return result
  }

  private array() {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    const result: unknown[] = []
    this.objects.push(result)
    const assoc: Record<string, unknown> = {}
    for (let key = this.string(); key !== ''; key = this.string()) assoc[key] = this.value()
    for (let i = 0; i < header >> 1; i++) result.push(this.value())
    return Object.keys(assoc).length ? Object.assign(result, assoc) : result
  }

  private vector(read: () => unknown, typed: boolean) {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    this.byte() // fixed-length flag
    if (!typed) this.string() // element type name
    const result: unknown[] = []
    this.objects.push(result)
    for (let i = 0; i < header >> 1; i++) result.push(read())
    return result
  }

  private bytesValue(wrap: (raw: Buffer) => unknown) {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    const value = wrap(this.take(header >> 1))
    this.objects.push(value)
    return value
  }

  private date() {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    const value = new Date(this.take(8).readDoubleBE(0))
    this.objects.push(value)
    return value
  }

  private dictionary() {
    const header = this.u29()
    const ref = this.reference(header)
    if (ref) return ref.ref
    this.byte() // weak keys flag
    const result = new Map<unknown, unknown>()
    this.objects.push(result)
    for (let i = 0; i < header >> 1; i++) result.set(this.value(), this.value())
    return result
  }

  value(): unknown {
    const marker = this.byte()
    switch (marker) {
      case 0x00:
        return undefined
      case 0x01:
        return null
      case 0x02:
        return false
      case 0x03:
        return true
      case 0x04:
        return this.int29()
      case 0x05:
        return this.take(8).readDoubleBE(0)
      case 0x06:
        return this.string()
      case 0x07:
      case 0x0b:
        return this.bytesValue((raw) => raw.toString('utf8'))
      case 0x08:
        return this.date()
      case 0x09:
        return this.array()
      case 0x0a:
        return this.object()
      case 0x0c:
        return this.bytesValue((raw) => Buffer.from(raw))
      case 0x0d:
        return this.vector(() => this.take(4).readInt32BE(0), true)
      case 0x0e:
        return this.vector(() => this.take(4).readUInt32BE(0), true)
      case 0x0f:
        return this.vector(() => this.take(8).readDoubleBE(0), true)
      case 0x10:
        return this.vector(() => this.value(), false)
      case 0x11:
        return this.dictionary()
      default:
        throw new Error(`AMF3: unknown marker 0x${marker.toString(16)} at ${this.offset - 1}`)
    }
  }
}

export function decodeAmf3(buffer: Buffer): unknown {
  return new Reader(buffer).value()
}

/** The client's .tab and .kv files are a single zlib-compressed AMF3 value. */
export function decodeCompressedAmf3(buffer: Buffer): unknown {
  return decodeAmf3(inflateSync(buffer))
}
