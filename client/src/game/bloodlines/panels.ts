// Reborn's window sections (UIResource Common BigBG1-5, exported as panel-1..5 in
// generated/game-ui.css). index.css only has a utility for BigBG1 (game-panel-1); the Ninja
// House, Bloodline Limits, Talent, Kennel, Pet Shop, Pet Tracing and Card Room windows also use
// BigBG2-5. ponytail: an inline style; move to game-panel-N utilities if more windows need them.
import type { CSSProperties } from 'react'

export type BigBg = 1 | 2 | 3 | 4 | 5

export const bigBg = (n: BigBg): CSSProperties => ({
  border: 0,
  borderImage: `var(--ui-panel-${n}) var(--ui-panel-${n}-slice) fill / var(--ui-panel-${n}-border)`,
})
