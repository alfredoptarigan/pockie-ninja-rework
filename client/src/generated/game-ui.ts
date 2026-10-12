// Typed access to the UI skin manifest written by `pnpm assets:export ui` (tools/assets/ui.ts).
// Pieces are text-free crops of the 2011 client's skin, stored at `scale` times their CSS size.
import uiJson from './game-ui.json'

export interface UiInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface UiPiece {
  file: string
  /** CSS pixels. */
  width: number
  height: number
  /** 9-slice insets in CSS pixels (times `scale` for border-image-slice). */
  slice?: UiInsets
}

export const gameUi = uiJson as { scale: number; pieces: Record<string, UiPiece> }
