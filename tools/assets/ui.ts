// In-game UI skin: frames, buttons, tabs, bars, slots and icons of the 2011 client. They live in
// the "BaseSource" bundle (apache/source/BaseSource/<version>_baseSource_0..6, see
// SourceCenter.as): the parts joined and inflated hold length-prefixed entries, each a UTF title
// plus content. UI_LookAndFeel.swf is the AsWing skin (FrameUIBase.as asks it for Frame_activeBG,
// FrameTitleBar, Frame_CloseButton); UI_RoleIcon, UI_BottomMenu and UI_TopGuide are the scene HUD;
// UI_UIResourceTemp has the bag slot. Only text-free pieces are picked, rendered at 2x by FFDec,
// and written as lossless WebP with their 9-slice insets (from DefineScalingGrid) in game-ui.json.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { cached } from './cache.ts'
import { ffdec } from './ffdec.ts'
import { assetUrl, paths } from './paths.ts'
import { scalingGrids, type Rect } from './swf.ts'

const BASE_SOURCE_PARTS = 7
const ZOOM = 2
const OUT_DIR = 'game/ui'

/** Insets in CSS pixels (the image is ZOOM times larger). */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface UiPiece {
  file: string
  /** Size in CSS pixels. */
  width: number
  height: number
  /** 9-slice insets in CSS pixels; multiply by `scale` for border-image-slice. */
  slice?: Insets
}

interface PieceSource {
  swf: string
  /** Class name (UI_LookAndFeel) or sprite id (timeline-only HUD SWFs). */
  symbol: string | number
  /** 1-based frame (HP/MP/EXP clips have 100 frames, one per percent). */
  frame?: number
  /** true: 9-slice insets from the symbol's scaling grid; an Insets object overrides them. */
  slice?: true | Insets
}

const LAF = 'UI_LookAndFeel'
// The scaling grids of the window and the content panel keep half the picture fixed (made for
// Flash scaling); these insets keep just the rounded corners, the bevel and the header band.
const FRAME_SLICE = { top: 46, right: 8, bottom: 8, left: 8 }
const INSET_SLICE = { top: 8, right: 8, bottom: 8, left: 8 }

const lookAndFeel = (symbol: string, slice?: true | Insets): PieceSource => ({
  swf: LAF,
  symbol,
  slice,
})

export const UI_PIECES: Record<string, PieceSource> = {
  frame: lookAndFeel('Frame_activeBG', FRAME_SLICE),
  'frame-title': lookAndFeel('FrameTitleBar', true),
  'close-normal': lookAndFeel('Frame_closeIcon_defaultImage'),
  'close-hover': lookAndFeel('Frame_closeIcon_rolloverImage'),
  'close-pressed': lookAndFeel('Frame_closeIcon_pressedImage'),
  'close-disabled': lookAndFeel('Frame_closeIcon_disabledImage'),
  'button-normal': lookAndFeel('Button_defaultImage', true),
  'button-hover': lookAndFeel('Button_rolloverImage', true),
  'button-pressed': lookAndFeel('Button_pressedImage', true),
  'button-disabled': lookAndFeel('Button_disabledImage', true),
  'tab-normal': lookAndFeel('TabbedPane_top_tab_defaultImage', true),
  'tab-hover': lookAndFeel('TabbedPane_top_tab_rolloverImage', true),
  'tab-selected': lookAndFeel('TabbedPane_top_tab_selectedImage', true),
  inset: lookAndFeel('TabbedPane_top_contentRoundImage', INSET_SLICE),
  textarea: lookAndFeel('TextArea_defaultImage', INSET_SLICE),
  input: lookAndFeel('TextField_defaultImage', true),
  tooltip: lookAndFeel('ToolTip_bgImage', INSET_SLICE),
  'progress-track': lookAndFeel('ProgressBar_horizotalBGImage', true),
  'progress-fill': lookAndFeel('ProgressBar_horizotalFGImage', true),
  'scroll-track': lookAndFeel('ScrollBar_verticalBGImage', true),
  'scroll-thumb': lookAndFeel('ScrollBar_thumbVertical_defaultImage', true),
  'scroll-thumb-hover': lookAndFeel('ScrollBar_thumbVertical_rolloverImage', true),
  'scroll-up': lookAndFeel('ScrollBar_arrowUp_defaultImage'),
  'scroll-down': lookAndFeel('ScrollBar_arrowDown_defaultImage'),
  // UI_RoleIcon.as: clips HP, MP (100 frames, gotoAndStop(percent)). Frame 1 is the empty bar.
  'hp-track': { swf: 'UI_RoleIcon', symbol: 10, frame: 1 },
  'hp-fill': { swf: 'UI_RoleIcon', symbol: 10, frame: 100 },
  'mp-track': { swf: 'UI_RoleIcon', symbol: 13, frame: 1 },
  'mp-fill': { swf: 'UI_RoleIcon', symbol: 13, frame: 100 },
  // UI_BottomMenu.as: BSD is the EXP bar (gotoAndStop(percent)); Package and Task menu icons.
  'exp-track': { swf: 'UI_BottomMenu', symbol: 10, frame: 1 },
  'exp-fill': { swf: 'UI_BottomMenu', symbol: 10, frame: 100 },
  'menu-bar': { swf: 'UI_BottomMenu', symbol: 2, slice: { top: 8, right: 8, bottom: 8, left: 8 } },
  'icon-bag': { swf: 'UI_BottomMenu', symbol: 14 },
  'icon-quests': { swf: 'UI_BottomMenu', symbol: 28 },
  // UI_TopGuide: currency boxes (coin icon + dark field for the amount).
  'currency-stone': {
    swf: 'UI_TopGuide',
    symbol: 56,
    slice: { top: 4, right: 8, bottom: 4, left: 26 },
  },
  'currency-gold': {
    swf: 'UI_TopGuide',
    symbol: 59,
    slice: { top: 4, right: 8, bottom: 4, left: 26 },
  },
  'currency-coupon': {
    swf: 'UI_TopGuide',
    symbol: 62,
    slice: { top: 4, right: 8, bottom: 4, left: 26 },
  },
  slot: { swf: 'UI_UIResourceTemp', symbol: 'Grid_PackageBack' },
}

/** Splits a BaseSource bundle (the parts already joined) into its entries by title. */
export function readBaseSource(joined: Buffer) {
  const data = inflateSync(joined)
  const entries = new Map<string, Buffer>()
  let offset = 0
  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    const entry = data.subarray(offset + 4, offset + 4 + length)
    offset += 4 + length
    const titleLength = entry.readUInt16BE(0)
    entries.set(entry.toString('utf8', 2, 2 + titleLength), entry.subarray(2 + titleLength))
  }
  return entries
}

/** Newest BaseSource version (file names are v<dotted version>_baseSource_<part>). */
function baseSourceFiles() {
  const dir = join(paths.apache, 'source/BaseSource')
  const versions = [
    ...new Set(
      readdirSync(dir)
        .map((name) => /^(v[\d.]+)_baseSource_\d$/.exec(name)?.[1])
        .filter((v): v is string => !!v),
    ),
  ]
  const numeric = (v: string) => v.slice(1).split('.').map(Number)
  versions.sort((a, b) => {
    const [x, y] = [numeric(a), numeric(b)]
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  })
  const newest = versions.at(-1)
  if (!newest) throw new Error(`No BaseSource parts in ${dir}`)
  return Array.from({ length: BASE_SOURCE_PARTS }, (_, i) => join(dir, `${newest}_baseSource_${i}`))
}

function spriteDir(out: string, swf: string, symbol: string | number) {
  const dir = join(out, `${swf}.swf`)
  const pattern =
    typeof symbol === 'number'
      ? new RegExp(`^DefineSprite_${symbol}$`)
      : new RegExp(`^DefineSprite_\\d+_${symbol.replace(/\./g, '\\.')}$`)
  const entry = readdirSync(dir).find((name) => pattern.test(name))
  if (!entry) throw new Error(`Symbol ${symbol} not found in ${swf}`)
  return join(dir, entry)
}

/** Insets from a scaling grid, given the symbol's size; sprites start at (0, 0). */
export function gridInsets(grid: Rect, width: number, height: number): Insets {
  const clamp = (value: number) => Math.max(0, Math.round(value))
  return {
    top: clamp(grid.yMin),
    right: clamp(width - grid.xMax),
    bottom: clamp(height - grid.yMax),
    left: clamp(grid.xMin),
  }
}

async function exportPieces(swfs: Map<string, Buffer>) {
  const work = mkdtempSync(join(paths.cache, 'ui-'))
  try {
    const input = join(work, 'swf')
    mkdirSync(input)
    for (const [name, data] of swfs) writeFileSync(join(input, `${name}.swf`), data)
    const out = join(work, 'png')
    await ffdec(['-zoom', String(ZOOM), '-format', 'sprite:png', '-export', 'sprite', out, input])
    const grids = scalingGrids(swfs.get(LAF)!)
    // Start clean so pieces dropped from UI_PIECES do not linger in the repo.
    rmSync(join(paths.assets, OUT_DIR), { recursive: true, force: true })
    mkdirSync(join(paths.assets, OUT_DIR), { recursive: true })

    const pieces: Record<string, UiPiece> = {}
    for (const [key, source] of Object.entries(UI_PIECES)) {
      const png = join(spriteDir(out, source.swf, source.symbol), `${source.frame ?? 1}.png`)
      const { width = 0, height = 0 } = await sharp(png).metadata()
      const file = `${OUT_DIR}/${key}.webp`
      await sharp(png).webp({ lossless: true, effort: 6 }).toFile(join(paths.assets, file))
      const piece: UiPiece = {
        file: assetUrl(file),
        width: Math.round(width / ZOOM),
        height: Math.round(height / ZOOM),
      }
      if (source.slice === true) {
        const grid = grids[source.symbol as string]
        if (!grid) throw new Error(`${source.symbol} has no scaling grid`)
        piece.slice = gridInsets(grid, width / ZOOM, height / ZOOM)
      } else if (source.slice) piece.slice = source.slice
      pieces[key] = piece
    }
    return pieces
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export async function exportUi() {
  const parts = baseSourceFiles()
  const joined = Buffer.concat(parts.map((part) => readFileSync(part)))
  const hash = createHash('sha256')
    .update(joined)
    .update(JSON.stringify({ UI_PIECES, ZOOM }))
    .digest('hex')
  const outputs = Object.keys(UI_PIECES).map((key) => join(paths.assets, OUT_DIR, `${key}.webp`))
  const pieces = await cached('ui', hash, outputs, async () => {
    const entries = readBaseSource(joined)
    const needed = new Set(Object.values(UI_PIECES).map((source) => source.swf))
    const swfs = new Map<string, Buffer>()
    for (const name of needed) {
      const data = entries.get(`${name}.swf`)
      if (!data) throw new Error(`${name}.swf is not in the BaseSource bundle`)
      swfs.set(name, data)
    }
    return exportPieces(swfs)
  })
  return { scale: ZOOM, pieces }
}

/**
 * CSS custom properties for every piece: --ui-<key> (the image), and for 9-slice pieces
 * --ui-<key>-slice (border-image-slice in image pixels) and --ui-<key>-border (CSS widths).
 */
export function uiCss({ scale, pieces }: { scale: number; pieces: Record<string, UiPiece> }) {
  const lines = Object.entries(pieces).flatMap(([key, piece]) => {
    const vars = [`  --ui-${key}: url('${piece.file}');`]
    if (piece.slice) {
      const { top, right, bottom, left } = piece.slice
      const sides = [top, right, bottom, left]
      vars.push(`  --ui-${key}-slice: ${sides.map((side) => side * scale).join(' ')};`)
      vars.push(`  --ui-${key}-border: ${sides.map((side) => `${side}px`).join(' ')};`)
    }
    return vars
  })
  return `/* Generated by tools/assets/ui.ts (pnpm assets:export ui). Do not edit. */\n:root {\n${lines.join('\n')}\n}\n`
}
