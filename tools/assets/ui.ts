// In-game UI skin: frames, buttons, tabs, bars, slots and icons of the 2011 client. They live in
// the "BaseSource" bundle (apache/source/BaseSource/<version>_baseSource_0..6, see
// SourceCenter.as): the parts joined and inflated hold length-prefixed entries, each a UTF title
// plus content. UI_LookAndFeel.swf is the AsWing skin (FrameUIBase.as asks it for Frame_activeBG,
// FrameTitleBar, Frame_CloseButton); UI_RoleIcon, UI_BottomMenu and UI_TopGuide are the scene HUD;
// UI_UIResourceTemp has the bag slot; M3_PIECES add the shop, forge, toll gate, pub fight and card
// windows. Only text-free pieces are picked, rendered at 2x by FFDec,
// and written as lossless WebP with their 9-slice insets (from DefineScalingGrid) in game-ui.json.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { cached } from './cache.ts'
import { ffdec } from './ffdec.ts'
import { assetUrl, paths } from './paths.ts'
import { scalingGrids, symbolIds, type Rect } from './swf.ts'

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
  /** Class name (UI_LookAndFeel) or character id (timeline-only HUD SWFs). */
  symbol: string | number
  /** What the id names: a sprite (default), a bare shape or a button (rendered per state). */
  kind?: 'sprite' | 'shape' | 'button'
  /** 1-based frame (HP/MP/EXP clips have 100 frames, one per percent). */
  frame?: number
  /** Button state to render (kind 'button'). */
  state?: 'up' | 'over' | 'down'
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

const resource = (name: string, slice?: true | Insets): PieceSource => ({
  swf: 'UI_Resource',
  symbol: `UIResource.${name}`,
  slice,
})
const sprite = (swf: string, symbol: number): PieceSource => ({ swf, symbol })
const shape = (swf: string, symbol: number, slice?: Insets): PieceSource => ({
  swf,
  symbol,
  kind: 'shape',
  slice,
})
/** up / over / down pieces of a button, keyed `<key>-<state>`. */
const buttonStates = (key: string, swf: string, symbol: number) =>
  Object.fromEntries(
    (['up', 'over', 'down'] as const).map((state) => [
      `${key}-${state}`,
      { swf, symbol, kind: 'button', state } satisfies PieceSource,
    ]),
  )

// Scene HUD as laid out on the original timelines (UI_RoleIcon, UI_BottomMenu, UI_SmallMap,
// UI_Chat): the player card behind the HP/MP/VP bars, the bar letters, the bottom menu buttons
// (UI_BottomMenu.as: Package, Role, Skill, Task, Social, Rank, Mart, Shop), the small map plaque
// without its buttons (their captions are text fields) and the chat panel and tab plates (their
// Indonesian captions are text fields too).
const HUD_PIECES: Record<string, PieceSource> = {
  'role-card': shape('UI_RoleIcon', 1),
  'role-letters': shape('UI_RoleIcon', 4),
  'vp-track': { swf: 'UI_RoleIcon', symbol: 16, frame: 1 },
  'vp-fill': { swf: 'UI_RoleIcon', symbol: 16, frame: 100 },
  // clipHP / clipMP show the pouch fill (100 frames); clipVP is the refill button.
  'refill-hp': { swf: 'UI_RoleIcon', symbol: 23, frame: 100 },
  'refill-mp': { swf: 'UI_RoleIcon', symbol: 25, frame: 100 },
  'refill-vp': { swf: 'UI_RoleIcon', symbol: 30, kind: 'button', state: 'up' },
  'map-plaque': shape('UI_SmallMap', 18),
  ...buttonStates('menu-package', 'UI_BottomMenu', 17),
  ...buttonStates('menu-role', 'UI_BottomMenu', 66),
  ...buttonStates('menu-skill', 'UI_BottomMenu', 24),
  ...buttonStates('menu-task', 'UI_BottomMenu', 31),
  ...buttonStates('menu-social', 'UI_BottomMenu', 38),
  ...buttonStates('menu-rank', 'UI_BottomMenu', 45),
  ...buttonStates('menu-mart', 'UI_BottomMenu', 52),
  ...buttonStates('menu-shop', 'UI_BottomMenu', 59),
  'chat-panel': shape('UI_Chat', 7, { top: 10, right: 10, bottom: 10, left: 10 }),
  'chat-tab': shape('UI_Chat', 34, { top: 5, right: 5, bottom: 5, left: 5 }),
  'chat-tab-hover': shape('UI_Chat', 36, { top: 5, right: 5, bottom: 5, left: 5 }),
}

// Window pieces the Stats, Inventory, NPC and quest windows draw (UI_RoleInfo_Xml, UI_Package,
// UI_NpcMenu_Xml, UI_TaskInfo_Xml): the title plate, value fields, the equipment column, the
// avatar backdrop, empty equipment slot pictures and the quest section icons.
const WINDOW_PIECES: Record<string, PieceSource> = {
  'title-plate': resource('Common.BigBG7', true),
  'value-box': resource('Common.TextBG2', true),
  // Its scaling grid keeps most of the column fixed; only the bevel needs to stay.
  'equip-column': resource('Equip.EquipBG', { top: 5, right: 5, bottom: 5, left: 5 }),
  'equip-backdrop': resource('Equip.Peoplebg'),
  'slot-outfit': resource('Equip.Avatar'),
  'slot-weapon': resource('Equip.Weapon2'),
  'slot-glove': resource('Equip.Glove'),
  'slot-pet': resource('Equip.Pet'),
  'slot-ring': resource('Equip.FingerRing'),
  'slot-amulet': resource('Equip.Amu'),
  'slot-hat': resource('Equip.Hat'),
  'slot-cloth': resource('Equip.Cloth'),
  'slot-belt': resource('Equip.Caestus'),
  'slot-shoes': resource('Equip.Shoes'),
  'icon-scroll': resource('Icon.Icon_Scroll'),
  'icon-notice': resource('Icon.Icon_ExcalmatoryPoint'),
  'monster-card': resource('List.HobgoblinBG'),
}

// M3 windows. The shop, forge, exchange and Las Noches layouts (UI_NpcShop_Xml, UI_MysticShop_Xml,
// UI_RoleUse_Xml, UI_MartBuySet_Xml, UI_EquipMakeRoom_Xml, UI_YYEquipCompose_Xml,
// UI_ItemExchange_Xml, UI_SingleTollGate_Xml) are AsWing trees over the look and feel above plus
// these UI_Resource backgrounds. The toll gate, pub fight and card flip windows are SWFs; only
// their text-free parts are taken (titles, labels, the card back logo and the prize scrolls carry
// Indonesian or Chinese text).
const M3_PIECES: Record<string, PieceSource> = {
  'panel-1': resource('Common.BigBG1', true),
  'panel-2': resource('Common.BigBG2', true),
  'panel-3': resource('Common.BigBG3', true),
  'panel-4': resource('Common.BigBG4', true),
  'panel-5': resource('Common.BigBG5', true),
  'panel-small': resource('Common.SmallBG1', true),
  'text-box': resource('Common.TextBG1', true),
  divider: resource('Common.PartitionYellow', true),
  'slot-shop': resource('Icon.Grid_YellowBSD', true),
  'slot-tall': resource('Icon.Grid_Base1', true),
  'market-row': resource('PropMaketplace.PropBG1', true),
  'market-cell': resource('PropMaketplace.PropBG2'),
  'market-field': resource('PropMaketplace.PropBG3', true),
  'compose-plus': resource('Compose.Add'),
  'compose-equals': resource('Compose.Amount'),
  'compose-arrow': resource('Compose.Direction'),
  'compose-unknown': resource('Compose.Interrogation'),
  'icon-gold': resource('Icon.Icon_Gold'),
  'icon-stone': resource('Icon.Icon_Carpolite'),
  'npc-frame': resource('NPC.EstopCircle'),
  'npc-card': resource('NPC.TottomBG1'),
  // UI_TollGateChallenge / UI_TollGateSelect: the scroll window and its plaque buttons.
  'scroll-paper': sprite('UI_TollGateChallenge', 3),
  'scroll-paper-short': sprite('UI_TollGateSelect', 2),
  'scroll-rod-top': sprite('UI_TollGateChallenge', 25),
  'scroll-rod-bottom': sprite('UI_TollGateChallenge', 13),
  'scroll-rope': sprite('UI_TollGateChallenge', 27),
  'scroll-cloud-left': sprite('UI_TollGateChallenge', 29),
  'scroll-cloud-right': sprite('UI_TollGateChallenge', 31),
  'scroll-swirl-left': sprite('UI_TollGateChallenge', 15),
  'scroll-swirl-right': sprite('UI_TollGateChallenge', 19),
  'plaque-normal': sprite('UI_TollGateChallenge', 42),
  'plaque-hover': sprite('UI_TollGateChallenge', 46),
  'tag-green': sprite('UI_TollGateChallenge', 75),
  // UI_TollGateFightMenu: the small parchment of the sub gate fight menu.
  parchment: sprite('UI_TollGateFightMenu', 8),
  // UI_PubFightMonster: ranking board, lever, buttons.
  'pub-board': sprite('UI_PubFightMonster', 7),
  'pub-lever': sprite('UI_PubFightMonster', 56),
  'pub-button': sprite('UI_PubFightMonster', 28),
  'pub-back': sprite('UI_PubFightMonster', 42),
  'pub-close': sprite('UI_PubFightMonster', 16),
  // UI_OutSearchCard (also the toll gate card flip, UIDefine.UI_TollGateCard): a revealed card.
  'card-face': sprite('UI_OutSearchCard', 7),
  'card-item-frame': sprite('UI_OutSearchCard', 40),
  'card-name-bar': sprite('UI_OutSearchCard', 38),
}

const laf = (symbol: string): PieceSource => ({ swf: LAF, symbol })
const resourceButton = (name: string): PieceSource => ({
  swf: 'UI_Resource',
  symbol: `UIResource.${name}`,
  kind: 'button',
})
/** up / over / down of a UI_Resource button class, keyed `<key>-<state>`. */
const resourceButtonStates = (key: string, name: string) =>
  Object.fromEntries(
    (['up', 'over', 'down'] as const).map((state) => [
      `${key}-${state}`,
      { ...resourceButton(name), state } satisfies PieceSource,
    ]),
  )
const SIDES_4 = { top: 4, right: 4, bottom: 4, left: 4 }

// M4 windows (docs/original-data: teams.md 6, friends-mail.md, trade-market.md part 5,
// pvp-rankings.md 8 and 10). The AsWing trees UI_Society_Xml, UI_Mail*_Xml, UI_Mart*_Xml,
// UI_Depot_Xml, UI_TeamFrame_Xml, UI_TeamWait*_Xml, UI_GameTop_Xml, UI_Whister*_Xml,
// UI_HonorExchange_Xml and UI_ArenaBox*_Xml reuse the M3 backgrounds (BigBG1-5, TextBG1/2, the
// slot and currency icons) plus the pieces below. The arena windows (UI_ArenaFighter,
// UI_ArenaInfo, UI_ArenaPKReady), the party frame (TeamRoleIcon in UI_UIResourceTemp) and the
// minimap Mail / Whisper buttons are SWF art; only text-free parts are taken. The tier badges
// (Font_PosCall1-23) are lettering only, so they are not exported: draw the tier names as text.
// Left out for their baked text: Arena.Top_BG ("TOP" board), Mail.SendButton ("Kirim"),
// Icon.Go ("GO!"), Equip.ExP ("EXP"), Common.Brigade (a "T"), the arena side buttons, the
// "Battle!" button and the chest cards (logo). Tree_leafControlImage is empty in this skin.
const M4_PIECES: Record<string, PieceSource> = {
  // Look and feel: market category tree, listing form controls, mail accordion headers.
  'tree-folder-closed': laf('Tree_folderCollapsedImage'),
  'tree-folder-open': laf('Tree_folderExpandedImage'),
  'tree-leaf': laf('Tree_leafImage'),
  'radio-normal': laf('RadioButton_defaultImage'),
  'radio-selected': laf('RadioButton_selectedImage'),
  'checkbox-normal': laf('CheckBox_defaultImage'),
  'checkbox-selected': laf('CheckBox_selectedImage'),
  'combo-box': lookAndFeel('ComboBox_defaultImage', true),
  'combo-arrow': laf('ComboBox_arrowButton_defaultImage'),
  'combo-arrow-hover': laf('ComboBox_arrowButton_rolloverImage'),
  'accordion-header': lookAndFeel('Accordion_header_defaultImage', true),
  'accordion-header-hover': lookAndFeel('Accordion_header_rolloverImage', true),
  'accordion-header-selected': lookAndFeel('Accordion_header_selectedImage', true),
  // List rows (friends, enemies, market, team waits) and the pager of every paged list.
  'list-row': resource('Common.TextBG4', true),
  'panel-6': resource('Common.BigBG6', true),
  ornament: resource('Common.FlowerPattem2'),
  ...resourceButtonStates('page-first', 'Common.Lift2'),
  ...resourceButtonStates('page-prev', 'Common.Lift'),
  ...resourceButtonStates('page-next', 'Common.Right'),
  ...resourceButtonStates('page-last', 'Common.Right2'),
  'portrait-frame': resource('Icon.Grid_HeadPortraitBase1'),
  'portrait-frame-small': resource('Icon.Grid_HeadPortraitBase2'),
  // Friends rows: gender, village, online and standing icons.
  'icon-boy': resource('Icon.Boy'),
  'icon-girl': resource('Icon.Girl'),
  'icon-fire': resource('Icon.Icon_Fire'),
  'icon-water': resource('Icon.Icon_Water'),
  'icon-earth': resource('Icon.Icon_Terra'),
  'icon-wind': resource('Icon.Icon_Wind'),
  'icon-lightning': resource('Icon.Icon_Thunder'),
  'icon-online': { swf: 'UI_UIResourceTemp', symbol: 'OnlineIcon' },
  'icon-offline': { swf: 'UI_UIResourceTemp', symbol: 'OfflineIcon' },
  'icon-mutual': resource('Icon.RoleAccomplish'),
  'icon-one-sided': resource('Icon.Fork'),
  // Mail: envelopes, delete all, mark all read, write and send.
  'mail-unread': resource('Icon.Icon_CloseEnvelope'),
  'mail-read': resource('Icon.Icon_OpenEnvelope'),
  'mail-battle': resource('Icon.Icon_BattleUpToSnuff'),
  ...resourceButtonStates('mail-delete', 'Mail.Dustbin'),
  ...resourceButtonStates('mail-read-all', 'Mail.OpenEnvelopeButton'),
  ...resourceButtonStates('mail-write', 'Mail.EpistolizeButton'),
  // Whisper window (UI_WhisterFrame): panels, conversation tab states, tab close.
  'whisper-panel': resource('Chat.ChatBG1', true),
  'whisper-input': resource('Chat.ChatBG2', SIDES_4),
  'whisper-tab': resource('Chat.ChatBG5', true),
  'whisper-tab-hover': resource('Chat.ChatBG4', true),
  'whisper-tab-selected': resource('Chat.ChatBG3', true),
  ...resourceButtonStates('whisper-close', 'Chat.ChatClose'),
  // Minimap buttons (UI_SmallMap: Mail is a button, Whister a 3-state clip).
  ...buttonStates('minimap-mail', 'UI_SmallMap', 8),
  'minimap-whisper-up': { swf: 'UI_SmallMap', symbol: 17, frame: 1 },
  'minimap-whisper-over': { swf: 'UI_SmallMap', symbol: 17, frame: 2 },
  'minimap-whisper-down': { swf: 'UI_SmallMap', symbol: 17, frame: 3 },
  // Party frame (TeamRoleIcon): orb, name plate, bars (100 frames each), level ribbon, crown,
  // make-leader / leave buttons, the fight order arrows (Btn_Down is Btn_Up flipped) and their pill.
  'team-orb': sprite('UI_UIResourceTemp', 1017),
  'team-name-plate': sprite('UI_UIResourceTemp', 995),
  'team-level': sprite('UI_UIResourceTemp', 1026),
  'team-crown': sprite('UI_UIResourceTemp', 1041),
  'team-arrows-back': sprite('UI_UIResourceTemp', 1043),
  'team-hp-track': { swf: 'UI_UIResourceTemp', symbol: 1014, frame: 1 },
  'team-hp-fill': { swf: 'UI_UIResourceTemp', symbol: 1014, frame: 100 },
  'team-mp-track': { swf: 'UI_UIResourceTemp', symbol: 1002, frame: 1 },
  'team-mp-fill': { swf: 'UI_UIResourceTemp', symbol: 1002, frame: 100 },
  'team-sp-track': { swf: 'UI_UIResourceTemp', symbol: 1008, frame: 1 },
  'team-sp-fill': { swf: 'UI_UIResourceTemp', symbol: 1008, frame: 100 },
  ...buttonStates('team-leader', 'UI_UIResourceTemp', 1034),
  ...buttonStates('team-leave', 'UI_UIResourceTemp', 1039),
  ...buttonStates('team-arrow', 'UI_UIResourceTemp', 1047),
  // Arena (UI_ArenaTop_Xml, UI_ArenaFighter, UI_ArenaInfo, UI_ArenaPKReady).
  'arena-row-1': sprite('UI_ArenaFighter', 4),
  'arena-row-2': sprite('UI_ArenaFighter', 8),
  'arena-row-3': sprite('UI_ArenaFighter', 6),
  'arena-header': sprite('UI_ArenaFighter', 10),
  'arena-card-slot': sprite('UI_ArenaFighter', 27),
  'arena-card-slot-base': sprite('UI_ArenaFighter', 37),
  'arena-button-plate': sprite('UI_ArenaFighter', 16),
  'arena-button-plate-hover': sprite('UI_ArenaFighter', 17),
  'arena-cloud-left': sprite('UI_ArenaFighter', 72),
  'arena-cloud-right': sprite('UI_ArenaFighter', 74),
  'arena-banner': sprite('UI_ArenaInfo', 3),
  'arena-leaf': sprite('UI_ArenaInfo', 5),
  'arena-scroll': sprite('UI_ArenaInfo', 15),
  'arena-scroll-rod': sprite('UI_ArenaInfo', 21),
  'arena-scroll-header': sprite('UI_ArenaInfo', 26),
  'arena-brush-blue': sprite('UI_ArenaInfo', 43),
  'arena-brush-pink': sprite('UI_ArenaInfo', 47),
  'arena-card-own': sprite('UI_ArenaPKReady', 5),
  'arena-card-foe': sprite('UI_ArenaPKReady', 10),
  'arena-name-own': sprite('UI_ArenaPKReady', 13),
  'arena-name-foe': sprite('UI_ArenaPKReady', 16),
  'arena-info-box': sprite('UI_ArenaPKReady', 22),
  'arena-info-frame': sprite('UI_ArenaPKReady', 24),
  'arena-vs-v': sprite('UI_ArenaPKReady', 61),
  'arena-vs-s': sprite('UI_ArenaPKReady', 63),
  'arena-button': sprite('UI_ArenaPKReady', 26),
  'arena-button-hover': sprite('UI_ArenaPKReady', 31),
  'arena-button-pressed': sprite('UI_ArenaPKReady', 34),
  // Honor shop and jars (UI_ArenaBoxShop*_Xml, UI_ArenaBoxActive_Xml).
  'honor-inner-1': resource('Transfer.InnerBG1', SIDES_4),
  'honor-inner-2': resource('Transfer.InnerBG2', true),
  'honor-name': resource('Transfer.NameBG', true),
  'honor-name-2': resource('Transfer.NameBG2', true),
  'honor-divider': resource('Transfer.PartitionBlack', true),
  'honor-pot': resource('TransferShop.PotBG3', SIDES_4),
  'honor-tab': resource('TransferShop.Tab', SIDES_4),
}

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
  ...M3_PIECES,
  ...HUD_PIECES,
  ...WINDOW_PIECES,
  ...M4_PIECES,
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
export function baseSourceFiles() {
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
  // Several export types at once put each type in its own folder.
  const dir = join(out, `${swf}.swf`, 'sprites')
  const pattern =
    typeof symbol === 'number'
      ? new RegExp(`^DefineSprite_${symbol}$`)
      : new RegExp(`^DefineSprite_\\d+_${symbol.replace(/\./g, '\\.')}$`)
  const entry = readdirSync(dir).find((name) => pattern.test(name))
  if (!entry) throw new Error(`Symbol ${symbol} not found in ${swf}`)
  return join(dir, entry)
}

const BUTTON_FRAMES = { up: '1_up', over: '2_over', down: '3_down' } as const

/** The rendered PNG of a piece in FFDec's export layout. */
function piecePng(out: string, source: PieceSource, id: number) {
  const dir = join(out, `${source.swf}.swf`)
  if (source.kind === 'shape') return join(dir, 'shapes', `${source.symbol}.png`)
  if (source.kind === 'button') {
    const entry = readdirSync(join(dir, 'buttons')).find((name) =>
      new RegExp(`^DefineButton2_${id}(_|$)`).test(name),
    )
    if (!entry) throw new Error(`Button ${source.symbol} not found in ${source.swf}`)
    return join(dir, 'buttons', entry, `${BUTTON_FRAMES[source.state ?? 'up']}.png`)
  }
  return join(spriteDir(out, source.swf, source.symbol), `${source.frame ?? 1}.png`)
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
    const out = join(work, 'png')
    const classesBySwf = new Map<string, Map<string, number>>()
    // One FFDec run per SWF, rendering only the sprites the pieces use (UI_Resource is large).
    for (const [name, data] of swfs) {
      const input = join(work, 'swf', name)
      mkdirSync(input, { recursive: true })
      writeFileSync(join(input, `${name}.swf`), data)
      const classes = symbolIds(data)
      classesBySwf.set(name, classes)
      const ids = Object.values(UI_PIECES)
        .filter((source) => source.swf === name)
        .map((source) =>
          typeof source.symbol === 'number' ? source.symbol : classes.get(source.symbol),
        )
      if (ids.includes(undefined)) throw new Error(`Unknown symbol class in ${name}`)
      await ffdec([
        ...['-zoom', String(ZOOM), '-selectid', [...new Set(ids)].join(',')],
        ...['-format', 'sprite:png,shape:png,button:png'],
        ...['-export', 'sprite,shape,button', out, input],
      ])
    }
    const grids = Object.fromEntries([...swfs].map(([name, data]) => [name, scalingGrids(data)]))
    // Start clean so pieces dropped from UI_PIECES do not linger in the repo.
    rmSync(join(paths.assets, OUT_DIR), { recursive: true, force: true })
    mkdirSync(join(paths.assets, OUT_DIR), { recursive: true })

    const pieces: Record<string, UiPiece> = {}
    for (const [key, source] of Object.entries(UI_PIECES)) {
      const id =
        typeof source.symbol === 'number'
          ? source.symbol
          : classesBySwf.get(source.swf)!.get(source.symbol)!
      const png = piecePng(out, source, id)
      const { width = 0, height = 0 } = await sharp(png).metadata()
      const file = `${OUT_DIR}/${key}.webp`
      await sharp(png).webp({ lossless: true, effort: 6 }).toFile(join(paths.assets, file))
      const piece: UiPiece = {
        file: assetUrl(file),
        width: Math.round(width / ZOOM),
        height: Math.round(height / ZOOM),
      }
      if (source.slice === true) {
        const grid = grids[source.swf]![source.symbol as string]
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
