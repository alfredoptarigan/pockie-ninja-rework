import type { TextKind } from './timeline'
/** Numeric portions only: labels such as Rebound remain readable text. */
export function numberGlyphs(kind: TextKind, text: string) {
  if (!['damage', 'crit', 'heal'].includes(kind)) return undefined
  const match = text.match(/^(?:Critical )?[+-]?(\d+)$/)
  return match
    ? { atlas: kind === 'heal' ? ('heal' as const) : ('normal' as const), glyphs: [...match[1]!] }
    : undefined
}
export function glyphLayout(widths: number[], gap = 1) {
  const width = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1) * gap
  let x = -width / 2
  return widths.map((w) => {
    const at = x
    x += w + gap
    return at
  })
}
