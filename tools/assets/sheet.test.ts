import { describe, expect, it } from 'vitest'
import { cleanSvg } from './scenes.ts'
import { collapseRuns, opaqueBounds } from './sheet.ts'

/** A width x height RGBA frame with the given opaque pixels. */
function frame(width: number, height: number, opaque: [number, number][] = []) {
  const data = Buffer.alloc(width * height * 4)
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255
  return { data, width, height }
}

describe('collapseRuns', () => {
  it('merges consecutive identical frames into one cell with a longer duration', () => {
    const a = frame(2, 2, [[0, 0]])
    const b = frame(2, 2, [[1, 1]])
    const { cells, durations } = collapseRuns([a, frame(2, 2, [[0, 0]]), b, a])
    expect(cells).toHaveLength(3)
    expect(durations).toEqual([2, 1, 1])
  })
})

describe('opaqueBounds', () => {
  it('returns the box around opaque pixels of all frames', () => {
    const box = opaqueBounds([frame(5, 5, [[1, 3]]), frame(5, 5, [[3, 1]])])
    expect(box).toEqual({ left: 1, top: 1, width: 3, height: 3 })
  })

  it('returns undefined for fully transparent frames', () => {
    expect(opaqueBounds([frame(3, 3)])).toBeUndefined()
  })
})

describe('cleanSvg', () => {
  it('keeps only the biggest piece of a button up state and drops the other states', () => {
    const svg = [
      '<svg>',
      '    <rect fill="#333333" height="1080.0px" width="1920.0px"/>',
      '      <g class="button-frame button-frame-up" transform="m">',
      '        <use height="400.0" width="300.0" xlink:href="#building"/>',
      '        <use height="20.0" width="50.0" xlink:href="#label"/>',
      '      </g>',
      '      <g class="button-frame button-frame-over" transform="m">',
      '        <use height="400.0" width="300.0" xlink:href="#glow"/>',
      '      </g>',
      '</svg>',
    ].join('\n')
    const cleaned = cleanSvg(svg)
    expect(cleaned).toContain('#building')
    expect(cleaned).not.toContain('#label')
    expect(cleaned).not.toContain('#glow')
    expect(cleaned).not.toContain('<rect')
  })
})
