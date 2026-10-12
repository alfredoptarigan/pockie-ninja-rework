# Game UI layout: Pockie Ninja Reborn as the reference

Measured on 2026-10-12 from the live Reborn client (logged-in player, 1400x782 viewport) with REA
(`inspect_web_page`, evidence `ev_7592dcdd…`) and DOM/computed-style reads. Reborn's art is the
original 2011 UI converted from the same SWFs (its image paths keep the original symbol names:
`UIResource/Equip/Hat`, `RoleIcon/hp`, `SmallMap/bg`…), so we export the same pieces from our
backup (`tools/assets/ui.ts`, `pnpm assets:export ui`) and copy only the layout: positions, sizes,
fonts and colours. No Reborn file or code is copied. Raw notes and screenshots stay local in the
gitignored `data/reborn-raw/` (`ui-spec/spec-*.txt`, `screenshots/r-*.png`).

## Rules that apply everywhere

- No stage zoom: HUD pieces are drawn 1:1 in CSS pixels and anchored to the window edges, as the
  original client did (`AlignType` in `PanelUIBase`). Windows open centred at their natural size.
- Font: Arial (`--font-game`). Labels 11-12px bold; values in a monospace face 12px; tabs 13px
  normal; window titles 12px bold black on the title tag.
- Buttons: Reborn's gold button (`game-button`): gradient `#f5e0b0 → #d8b060 → #c08030`, 1px
  `#906020` border, 4px radius, Arial 12px bold `#2a1800`. Typical sizes 66x22 (top bar), 46x20 /
  70x20 (map plaque), 90x22 (window footer), 75x25 (inventory side column).
- Window: frame 9-slice (`game-frame`), title tag at (5,4) height 20, close 22x20 at the top right,
  content starts at y=31 with a 5px side margin; cream content panels (`game-inset`, 24px slice).
- Value rows (Stats): bold 11px label (50px wide), then a `value-box` 100x20 (`TextBG2`) holding
  12px monospace text; rows 24-31px apart, groups split by a 298x2 `divider` (`PartitionYellow`).

## HUD (viewport 1400x782; x/y from the anchor named)

| Piece            | Anchor                                  | Box                     | Contents                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar          | top, full width                         | h 30 (menu-bar 9-slice) | currency slots 115x24 at x 4 / 125 / 246 (stone, gold, coupon), value monospace 12px at slot x+26, gold `#ffd700` for gold; right: gold buttons 66x22 (Settings…)                                                                                                                                                                                        |
| Player card      | top-left (6,31)                         | `role-card` 205x78      | photo 82x82 at (0,0) (circle); village icon 16x16 at (92,0); name Arial 11px bold `#ffd700` at (110,2); `role-letters` at (73,18); HP/MP/VP bars 106x11 at (99,18) / (95,30) / (91,42), text 8px bold centred ("100%", "12%", "199/200"); refill icons 16x12 right of each bar (204,18) / (200,30) / (196,42); "Lv. 21" Arial 11px bold white at (82,58) |
| Map plaque       | top-right (right 6, y 30)               | `map-plaque` 139x54     | scene name monospace 12px black at (8,8) w 125; Village 46x20 at (6,31), World Map 70x20 at (63,31)                                                                                                                                                                                                                                                      |
| Monster cards    | top, centred (x 525)                    | 67x86 each, 70 apart    | `monster-card` with portrait, "Lv.22" and name plate                                                                                                                                                                                                                                                                                                     |
| Chat             | bottom-left (10, bottom 2)              | 500x300                 | tabs 60x23 above the box (`chat-tab` / `chat-tab-selected`, Arial 16px white); `chat-panel` 9-slice 500x264; lines: time monospace 11px `rgba(221,221,221,.4)`, `[Channel]` 13px, name 14px bold `#ffd700`, text 14px `#ddd`; input row at y 270: channel select, input 327x26 (`rgba(0,0,0,.4)`, 1px `rgba(255,255,255,.2)`), Send 50x22                |
| EXP strip        | bottom-right (x 690 of 1400, bottom 1)  | `menu-bar` 234x33       | "Level: 21" 12px at (4,4); "EXP:" at (4,16) and a 195x12 bar at (35,17)                                                                                                                                                                                                                                                                                  |
| Menu bar         | right of EXP strip                      | `menu-bar` 465x33       | buttons 50x28 at x 3 + 50n: package, role, skill, task, social, rank, mart, shop (`menu-<name>-up/over/down`); disabled ones at 50% opacity                                                                                                                                                                                                              |
| Quest navigation | bottom-right, above the menu (1040,550) | 350x198 window          | tabs Accepted / Available / Daily 22px; rows "[Main]Name                                                                                                                                                                                                                                                                                                 | Completed" + target line, Details / Go 46x20 |

## Windows

- **Stats** (`UI_RoleInfo_Xml`): 328x448. Title plate 318x40 (`title-plate`) with the title art;
  panel 318x100: Name / Level, divider, Village / Rank, divider, EXP bar 249x18; panel 318x260:
  STR / Attack, Block, AGI / Speed, Dodge, STA / HP, Chakra, Pierce / Hit, Defense / Break,
  Crit / Const (two columns: label at x 5 and 155, value box at x 55 and 205).
- **Inventory**: 379x551. Bag page buttons I-V 56x24 in a `panel-small` bar 305x32 at (37,37);
  `equip-column` 63x262 left (5,77): outfit, weapon (55x83), gloves, pet; right (311,77): ring and
  amulet 28x28, hat, armour, belt, shoes 55x55; `equip-backdrop` 239x256 at (70,79) with the
  character pose and the title plate 164x36 at (108,83); bag at (5,344) 369x200: tabs I-X
  27x22, grid 271x160 of slots (51px), side buttons 75x25 (Compose, Multi Sell, Sort…).
- **NPC dialog** (`UI_NpcMenu_Xml`): 485x242, title = NPC name. Left 161x204 `npc-card` with the
  portrait 137x182 in `npc-frame` at (18,44); right top 309x65 cream panel with the line (12px
  monospace); right bottom 309x134 cream panel with option rows 299x23 (Arial 13px `#3d2914`,
  `rgba(139,115,85,.15)` fill, 1px `rgba(139,115,85,.3)` border, 3px radius).
- **Quest detail** (`UI_TaskInfo_Xml`): 350x458, no title text. Sections with a 320x20 `text-box`
  heading and an icon (`icon-scroll` for the name, `icon-notice` for Progress and Rewards); body
  12px monospace; rewards as `text-box` fields 150x21 (EXP, Gift) and 302x21 (Stones), item icons
  24x24 with a count badge; footer Turn In / Close 90x22 at (40,429) and (220,429).
