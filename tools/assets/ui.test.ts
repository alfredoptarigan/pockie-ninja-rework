// The UI skin manifest must point at files that exist, cover every exported piece, and the
// generated CSS must agree with it.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { paths } from './paths.ts'
import { gridInsets, readBaseSource, UI_PIECES, uiCss, type UiPiece } from './ui.ts'

const manifest = JSON.parse(readFileSync(join(paths.generated, 'game-ui.json'), 'utf8')) as {
  scale: number
  pieces: Record<string, UiPiece>
}
const publicDir = join(paths.root, 'client/public')

describe('game-ui.json', () => {
  it('has every piece the exporter defines', () => {
    expect(Object.keys(manifest.pieces).sort()).toEqual(Object.keys(UI_PIECES).sort())
  })

  it.each(Object.entries(manifest.pieces))('%s points at an existing image', (_, piece) => {
    expect(existsSync(join(publicDir, piece.file))).toBe(true)
    expect(piece.width).toBeGreaterThan(0)
    expect(piece.height).toBeGreaterThan(0)
  })

  it('keeps 9-slice insets inside each image', () => {
    for (const piece of Object.values(manifest.pieces)) {
      if (!piece.slice) continue
      const { top, right, bottom, left } = piece.slice
      expect(left + right).toBeLessThanOrEqual(piece.width)
      expect(top + bottom).toBeLessThanOrEqual(piece.height)
    }
  })

  it('matches the generated game-ui.css', () => {
    expect(readFileSync(join(paths.generated, 'game-ui.css'), 'utf8')).toBe(uiCss(manifest))
  })
})

describe('readBaseSource', () => {
  it('splits the inflated bundle into titled entries', () => {
    const entry = (title: string, content: string) => {
      const name = Buffer.from(title, 'utf8')
      const body = Buffer.concat([Buffer.from([0, name.length]), name, Buffer.from(content)])
      const length = Buffer.alloc(4)
      length.writeUInt32BE(body.length)
      return Buffer.concat([length, body])
    }
    const joined = deflateSync(Buffer.concat([entry('A.swf', 'abc'), entry('B.x', 'de')]))
    const entries = readBaseSource(joined)
    expect([...entries.keys()]).toEqual(['A.swf', 'B.x'])
    expect(entries.get('A.swf')!.toString()).toBe('abc')
  })
})

describe('gridInsets', () => {
  it('turns a scaling grid into insets from each edge', () => {
    expect(gridInsets({ xMin: 24, xMax: 70, yMin: 10.1, yMax: 16 }, 99, 28)).toEqual({
      top: 10,
      right: 29,
      bottom: 12,
      left: 24,
    })
  })
})
